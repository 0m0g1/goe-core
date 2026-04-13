/**
 * GOE — OSMTerrainLoader (full rewrite)
 *
 * Core fixes vs previous version:
 *
 *   A. Real polygon rendering — every way's raw geometry nodes are stored on
 *      the entity def (_ring / _nodes). renderFn projects them to screen space
 *      at draw time using lonToGlobalX / latToGlobalY, then draws the actual
 *      polygon or polyline. No more OBB-derived rectangles for everything.
 *
 *   B. Tile key encoding — replaced (x << 16) | (y & 0xFFFF) with a string
 *      key `${x},${y}`. The bitshift silently collides for global tile coords
 *      above 32767 (most real-world positions), causing roads to overwrite each
 *      other and disappear. String keys have no range limit.
 *
 *   C. Roads are visible entities — Pass 2 now produces a GenericEntity-style
 *      def for every highway way. renderFn projects the polyline and strokes it
 *      with a width scaled to road class and camera zoom.
 *
 *   D. Polygon features (parks, water, landuse, leisure) produce visible polygon
 *      entities in addition to terrain tile painting. Each gets a fill colour
 *      and optional stroke matching the feature type.
 *
 *   E. Buildings use their actual OSM footprint polygon, not an OBB-derived box.
 *      The 3-D effect is achieved by extruding each polygon edge downward to
 *      simulate walls, then filling the roof face on top.
 *
 *   F. Elevation sampling — mirrors the map.js open-elevation approach:
 *      fetchElevationGrid() calls api.open-elevation.com with a grid of points
 *      around the fetch centre and stores results in _elevGrid. sampleElev()
 *      bilinearly interpolates the grid, returning 0 on cache miss (safe for
 *      render loop). ElevationLoader integration (if provided) is still used
 *      as a higher-resolution fallback.
 *
 *   G. Blueprint landmark shadow and depth fixes from previous version retained.
 *
 *   H. Live entity cache retained (FIX C from previous version).
 *
 *   COORDINATE FIX (this version):
 *      makeBuildingDef and makePolygonFeatureDef renderFns previously used
 *      lonToGlobalX / latToGlobalY to re-project ring nodes, then added
 *      (entity.tx - _originGX) as an offset. This double-applied the map
 *      origin: entity.tx already encodes the building's tile position, so
 *      subtracting _originGX shifted every node by the building's distance
 *      from the map centre — placing walls in the wrong position for any
 *      building not near the centre of the map.
 *
 *      Fix: each ring node is now positioned using a centroid-relative
 *      geographic delta (dTileX, dTileY) added to entity.tx / entity.ty.
 *      This is equivalent to projecting (centLon + Δlon, centLat + Δlat)
 *      but avoids the global coordinate system entirely, so the origin
 *      offset cannot be double-counted.
 *
 *   STREAMING UPDATE:
 *      setPartialResultCallback() wires a callback from the engine. As data
 *      arrives it is pushed immediately:
 *        1. Terrain + roads + POIs + trees after Overpass responds (Pass 1-3).
 *        2. Named landmarks individually (no async work needed).
 *        3. Generic buildings in batches of BUILDING_BATCH_SIZE with a
 *           setTimeout(0) yield between each batch so the render loop gets
 *           frames while blueprints are generating.
 *      The loader's fetch() promise still resolves with the complete entity
 *      list so the engine can do stale-entity pruning.
 */
import { BaseLoader }         from '../BaseLoader.js';
import { TerrainType }        from '../../terrain/types.js';
import { lonToGlobalX, latToGlobalY } from '../../math/geo.js';
import { PersistentCache }    from '../../core/PersistentCache.js';
import { Blueprints }         from '../../assets/BluePrintLibrary.js';
import {
  tileHalfWidth, worldToScreen, frontDepth, shadeHex,
} from '../../math/projection.js';
import { preprocessBuildings } from './BuildingPreprocessor.js';
import { ProceduralBlueprintGenerator } from './ProceduralBlueprintGenerator.js';

// ─── Overpass endpoints ────────────────────────────────────────────────────────
const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const CACHE_TTL_MS      = 30 * 60 * 1000;
const VU                = 8;   // voxel units per tile
const BUILDING_BATCH_SIZE = 5;

// ─── Elevation grid ────────────────────────────────────────────────────────────
const ELEV_STEP    = 0.002;
const ELEV_HALF    = 2;

async function fetchElevationGrid(lat, lon) {
  const locations = [];
  for (let i = -ELEV_HALF; i <= ELEV_HALF; i++) {
    for (let j = -ELEV_HALF; j <= ELEV_HALF; j++) {
      locations.push({
        latitude:  lat + i * ELEV_STEP,
        longitude: lon + j * ELEV_STEP,
      });
    }
  }
  try {
    const res  = await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ locations }),
    });
    const data = await res.json();
    return data.results ?? [];
  } catch (e) {
    console.warn('[OSMTerrainLoader] Elevation fetch failed:', e.message);
    return [];
  }
}

function sampleElev(grid, lat, lon) {
  if (!grid.length) return 0;

  const lats = [...new Set(grid.map(p => p.latitude))].sort((a, b) => a - b);
  const lons = [...new Set(grid.map(p => p.longitude))].sort((a, b) => a - b);
  if (lats.length < 2 || lons.length < 2) return grid[0]?.elevation ?? 0;

  const lat0 = lats.findIndex(l => l >= lat) - 1;
  const lon0 = lons.findIndex(l => l >= lon) - 1;
  const li   = Math.max(0, Math.min(lats.length - 2, lat0));
  const lj   = Math.max(0, Math.min(lons.length - 2, lon0));

  const tLat = (lat - lats[li]) / (lats[li + 1] - lats[li]);
  const tLon = (lon - lons[lj]) / (lons[lj + 1] - lons[lj]);

  const get = (la, lo) => {
    const pt = grid.find(p => p.latitude === la && p.longitude === lo);
    return pt?.elevation ?? 0;
  };

  const e00 = get(lats[li],     lons[lj]);
  const e10 = get(lats[li + 1], lons[lj]);
  const e01 = get(lats[li],     lons[lj + 1]);
  const e11 = get(lats[li + 1], lons[lj + 1]);

  return e00 * (1 - tLat) * (1 - tLon)
       + e10 * tLat        * (1 - tLon)
       + e01 * (1 - tLat)  * tLon
       + e11 * tLat        * tLon;
}

// ─── Terrain classification ────────────────────────────────────────────────────
function classifyOSM(tags) {
  if (!tags) return null;
  const { highway: h, surface: s, waterway: w, natural: n, landuse: l, leisure: le, building: b } = tags;

  if (n === 'water' || n === 'wetland' || l === 'reservoir' || l === 'basin' || w === 'riverbank')
    return { terrain: TerrainType.DEEP_WATER, type: 'polygon' };
  if (w === 'river')               return { terrain: TerrainType.WATER, type: 'line', width: 3 };
  if (w === 'stream' || w === 'canal') return { terrain: TerrainType.WATER, type: 'line', width: 2 };
  if (w)                           return { terrain: TerrainType.WATER, type: 'line', width: 1 };
  if (n === 'beach')               return { terrain: TerrainType.SAND,  type: 'polygon' };
  if (n === 'wood' || l === 'forest') return { terrain: TerrainType.FOREST, type: 'polygon' };
  if (le === 'park' || le === 'garden' || l === 'park')
    return { terrain: TerrainType.PARK, type: 'polygon' };
  if (['grass','meadow','village_green','allotments'].includes(l) ||
      ['grassland','heath','scrub'].includes(n) ||
      ['pitch','playground'].includes(le))
    return { terrain: TerrainType.GRASS, type: 'polygon' };

  if (h) {
    const unpaved = ['dirt','earth','ground','unpaved','mud','gravel','sand'];
    const paved   = ['asphalt','paved','concrete','chipseal','paving_stones'];
    let roadTerrain = TerrainType.ROAD_TARMAC;
    if (unpaved.includes(s) || ['track','path','bridleway'].includes(h)) roadTerrain = TerrainType.ROAD_DIRT;
    else if (paved.includes(s)) roadTerrain = TerrainType.ROAD_TARMAC;

    if (h === 'motorway' || h === 'trunk' || h === 'primary')   return { terrain: roadTerrain, type: 'line', width: 3 };
    if (h === 'secondary' || h === 'tertiary')                   return { terrain: roadTerrain, type: 'line', width: 2 };
    if (['footway','path','cycleway','pedestrian'].includes(h))  return { terrain: TerrainType.PATH, type: 'line', width: 1 };
    return { terrain: roadTerrain, type: 'line', width: 1 };
  }
  if (b) return { terrain: TerrainType.BUILDING, type: 'polygon' };
  if (['residential','commercial','retail','industrial'].includes(l))
    return { terrain: TerrainType.RESIDENTIAL, type: 'polygon' };
  return null;
}

// ─── Polygon feature fill/stroke styles ───────────────────────────────────────
const POLYGON_STYLES = {
  water:    { fill: 'rgba(22,46,72,0.82)',   stroke: '#1a3850', alpha: 0.9 },
  wetland:  { fill: 'rgba(26,46,56,0.72)',   stroke: null },
  wood:     { fill: 'rgba(20,32,24,0.80)',   stroke: null },
  forest:   { fill: 'rgba(20,32,24,0.80)',   stroke: null },
  scrub:    { fill: 'rgba(24,34,24,0.70)',   stroke: null },
  heath:    { fill: 'rgba(30,32,24,0.70)',   stroke: null },
  grassland:{ fill: 'rgba(24,40,24,0.70)',   stroke: null },
  beach:    { fill: 'rgba(40,37,30,0.75)',   stroke: null },
  sand:     { fill: 'rgba(40,37,30,0.75)',   stroke: null },
  bare_rock:{ fill: 'rgba(32,34,40,0.75)',   stroke: null },
  meadow:   { fill: 'rgba(24,40,24,0.70)',   stroke: null },
  residential: { fill: 'rgba(28,33,48,0.55)', stroke: null },
  commercial:  { fill: 'rgba(29,32,53,0.55)', stroke: null },
  industrial:  { fill: 'rgba(25,30,37,0.55)', stroke: null },
  retail:      { fill: 'rgba(32,29,48,0.55)', stroke: null },
  farmland:    { fill: 'rgba(26,37,26,0.55)', stroke: null },
  grass:       { fill: 'rgba(24,40,28,0.60)', stroke: null },
  cemetery:    { fill: 'rgba(26,40,32,0.65)', stroke: null },
  construction:{ fill: 'rgba(30,32,37,0.55)', stroke: null },
  allotments:  { fill: 'rgba(26,40,24,0.55)', stroke: null },
  park:          { fill: 'rgba(23,42,28,0.72)', stroke: '#1d3522' },
  garden:        { fill: 'rgba(22,40,24,0.72)', stroke: null },
  playground:    { fill: 'rgba(24,40,24,0.65)', stroke: null },
  pitch:         { fill: 'rgba(24,32,40,0.72)', stroke: '#1e2e30' },
  swimming_pool: { fill: 'rgba(24,40,56,0.82)', stroke: '#1e3248' },
  nature_reserve:{ fill: 'rgba(21,32,24,0.72)', stroke: null },
};

// ─── Road styles by highway type ──────────────────────────────────────────────
const ROAD_STYLE = {
  motorway:     { casing: '#7a5a15', fill: '#e8c050', casingW: 3.5, fillW: 2.2 },
  trunk:        { casing: '#6a4e15', fill: '#c8a840', casingW: 3.2, fillW: 2.0 },
  primary:      { casing: '#4a3e28', fill: '#9a8860', casingW: 2.8, fillW: 1.8 },
  secondary:    { casing: '#303848', fill: '#607080', casingW: 2.4, fillW: 1.5 },
  tertiary:     { casing: '#283040', fill: '#485868', casingW: 2.0, fillW: 1.2 },
  residential:  { casing: '#1e2230', fill: '#383d50', casingW: 1.6, fillW: 1.0 },
  unclassified: { casing: '#252a38', fill: '#404858', casingW: 1.6, fillW: 1.0 },
  service:      { casing: '#1a1f2e', fill: '#30354a', casingW: 1.2, fillW: 0.7 },
  living_street:{ casing: '#1e2230', fill: '#383d50', casingW: 1.4, fillW: 0.9 },
  pedestrian:   { casing: '#252830', fill: '#404860', casingW: 1.4, fillW: 0.9 },
  footway:      { stroke: '#404858', w: 0.5, dash: [3, 3] },
  path:         { stroke: '#383a50', w: 0.5, dash: [2, 4] },
  cycleway:     { stroke: '#255040', w: 0.5, dash: [5, 3] },
  track:        { stroke: '#384050', w: 0.6, dash: [5, 4] },
  steps:        { stroke: '#404858', w: 0.6, dash: [1, 2] },
  bridleway:    { stroke: '#354030', w: 0.5, dash: [4, 3] },
};

const ROAD_ORDER = [
  'footway','path','bridleway','steps','cycleway','track',
  'service','living_street','residential','unclassified',
  'tertiary','secondary','primary','trunk','motorway',
];

// ─── POI classification ────────────────────────────────────────────────────────
const POI_COLORS = {
  amenity: {
    restaurant:'#ef4444', cafe:'#ef4444', pub:'#ef4444', bar:'#ef4444',
    fast_food:'#ef4444',  food_court:'#ef4444',
    school:'#f59e0b', university:'#f59e0b', library:'#f59e0b', college:'#f59e0b',
    hospital:'#dc2626', clinic:'#dc2626', pharmacy:'#dc2626', doctors:'#dc2626',
    theatre:'#a78bfa', cinema:'#a78bfa', arts_centre:'#a78bfa',
    place_of_worship:'#f97316',
    bank:'#eab308', atm:'#eab308',
    fuel:'#6b7280', parking:'#6b7280',
    police:'#3b82f6', fire_station:'#3b82f6', post_office:'#3b82f6',
    default:'#60a5fa',
  },
  shop:    { default: '#eab308' },
  tourism: {
    museum:'#a78bfa', gallery:'#a78bfa', attraction:'#a78bfa',
    hotel:'#f59e0b', hostel:'#f59e0b', information:'#60a5fa', camp_site:'#22c55e',
    default:'#a78bfa',
  },
  historic: { default: '#f97316' },
  leisure:  { default: '#22c55e' },
  office:   { default: '#60a5fa' },
  natural:  { peak:'#10b981', spring:'#06b6d4', cave_entrance:'#6b7280', default:'#10b981' },
};

function classifyPOI(tags) {
  if (!tags) return null;
  if (tags.natural === 'tree') return null;
  const cats = ['amenity','shop','tourism','historic','leisure','office','natural'];
  for (const cat of cats) {
    const val = tags[cat];
    if (!val) continue;
    const map   = POI_COLORS[cat];
    const color = map?.[val] ?? map?.default ?? '#60a5fa';
    const name  = tags.name
      ? tags.name
      : val.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return { color, label: cat === 'historic' ? `Historic: ${name}` : name, category: cat, value: val };
  }
  return null;
}

// ─── Geometry helpers ──────────────────────────────────────────────────────────
function ringCentroid(nodes) {
  let lat = 0, lon = 0;
  for (const n of nodes) { lat += n.lat; lon += n.lon; }
  return { lat: lat / nodes.length, lon: lon / nodes.length };
}

// ─── Rasterisation ────────────────────────────────────────────────────────────
function rasterizePolygon(cache, pts, terrain) {
  if (pts.length < 3) return;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const p1 = pts[i], p2 = pts[j];
      if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y))
        xs.push(p1.x + (y - p1.y) / (p2.y - p1.y) * (p2.x - p1.x));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i += 2)
      for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++)
        cache.set(`${Math.round(x)},${Math.round(y)}`, terrain);
  }
}

function rasterizeLine(cache, pts, terrain, width) {
  const w2 = width * width;
  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = pts[i].x, y0 = pts[i].y, x1 = pts[i+1].x, y1 = pts[i+1].y;
    const steps = Math.ceil(Math.hypot(x1-x0, y1-y0) * 2) + 1;
    for (let s = 0; s <= steps; s++) {
      const t  = s / steps;
      const cx = x0 + (x1-x0)*t, cy = y0 + (y1-y0)*t;
      for (let dx = -width; dx <= width; dx++) {
        for (let dy = -width; dy <= width; dy++) {
          if (dx*dx + dy*dy <= w2)
            cache.set(`${Math.round(cx + dx)},${Math.round(cy + dy)}`, terrain);
        }
      }
    }
  }
}

// ─── Blueprint helpers ─────────────────────────────────────────────────────────
function blueprintNativeBounds(blueprint) {
  let maxY = 0, halfXZ = 0;
  for (const p of blueprint) {
    maxY   = Math.max(maxY, p.y + p.h);
    halfXZ = Math.max(halfXZ, Math.abs(p.x + p.w * 0.5), Math.abs(p.z + p.d * 0.5));
  }
  return { maxY, halfExtentXZ: halfXZ };
}

function computeLandmarkScale(blueprint, osmHeightM, osmAreaM2, mPerTile, osmSpanM = 0) {
  const { maxY, halfExtentXZ } = blueprintNativeBounds(blueprint);
  if (osmSpanM > 0 && halfExtentXZ > 0) {
    const nativeTileSpan = (halfExtentXZ * 2) / VU;
    const targetTileSpan = osmSpanM / mPerTile;
    return targetTileSpan / nativeTileSpan;
  }
  if (osmHeightM > 0 && osmAreaM2 > 0 && maxY > 0 && halfExtentXZ > 0) {
    const targetDiag = Math.hypot(osmHeightM, Math.sqrt(osmAreaM2));
    const nativeDiag = Math.hypot(maxY, halfExtentXZ * 2);
    return targetDiag / nativeDiag;
  }
  if (osmHeightM > 0 && maxY > 0) {
    return (osmHeightM / mPerTile) / (maxY / VU);
  }
  if (osmAreaM2 > 0 && halfExtentXZ > 0) {
    return (Math.sqrt(osmAreaM2) / mPerTile / 2) / (halfExtentXZ / VU);
  }
  return 1;
}

function resolveLandmarkKey(tags) {
  if (!tags) return null;
  const candidates = [tags['name:en'], tags['int_name'], tags['alt_name:en'], tags['old_name'], tags['name']];
  for (const c of candidates) {
    if (!c || typeof c !== 'string') continue;
    const key = c.toLowerCase().replace(/[\s\-']+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (Blueprints[key]) return { key, name: c };
  }
  return null;
}

function extractFacingAngle(tags = {}, geometry = null) {
  const explicit = tags['building:direction'] ?? tags['direction'];
  if (explicit != null) {
    const deg = parseFloat(explicit);
    if (!isNaN(deg)) return deg;
    const cardinals = { N:0, NE:45, E:90, SE:135, S:180, SW:225, W:270, NW:315 };
    if (cardinals[explicit.toUpperCase()] != null) return cardinals[explicit.toUpperCase()];
  }
  if (geometry?.length >= 2) {
    const dLon = geometry[1].lon - geometry[0].lon;
    const dLat = geometry[1].lat - geometry[0].lat;
    return (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
  }
  return 180;
}

function makeBlueprintColliders(id, lat, lon, blueprint, scale, mPerTile) {
  const colliders = [];
  for (let i = 0; i < blueprint.length; i++) {
    const p = blueprint[i];
    const localX = (p.x + p.w * 0.5) * scale / VU;
    const localZ = (p.z + p.d * 0.5) * scale / VU;
    const halfW  = (p.w * 0.5) * scale / VU;
    const halfD  = (p.d * 0.5) * scale / VU;
    if (halfW < 0.3 || halfD < 0.3) continue;
    if (p.y * scale / VU > 4 && halfW < 1 && halfD < 1) continue;
    colliders.push({
      id:             `${id}_col_${i}`,
      latitude:       lat,
      longitude:      lon,
      _localOffsetX:  localX,
      _localOffsetZ:  localZ,
      solid:          true,
      bboxRadius:     Math.max(halfW, halfD),
      _halfW:         halfW,
      _halfD:         halfD,
      physicsEnabled: false,
      fixed:          true,
      renderHeavy:    false,
      renderFn:       null,
      _isBuildingBox: true,
      _isCollider:    true,
      _parentId:      id,
    });
  }
  return colliders;
}

function tileOffsetToGeo(dTileX, dTileZ, baseLat, mPerTile) {
  const mLat = 111320;
  const mLon = 111320 * Math.cos(baseLat * Math.PI / 180);
  return {
    dLat: -(dTileZ * mPerTile) / mLat,
    dLon:  (dTileX * mPerTile) / mLon,
  };
}

// ─── Tree species ──────────────────────────────────────────────────────────────
const TREE_BLUEPRINT_KEY = {
  conifer: 'tree_pine', palm: 'tree_palm', deciduous: 'tree_oak', default: 'tree_oak',
};

function treeSpeciesFromTags(tags = {}) {
  const genus    = (tags.genus ?? '').toLowerCase();
  const leafType = (tags['leaf_type'] ?? '').toLowerCase();
  if (genus.includes('pinus') || genus.includes('picea') || leafType === 'needleleaved') return 'conifer';
  if (genus.includes('palm') || genus.includes('phoenix'))                               return 'palm';
  return 'deciduous';
}

function hash(n) {
  const x = Math.sin(n + 1) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Entity factory functions ──────────────────────────────────────────────────

// FIX 3 applied here: renderFn projects ring nodes using centroid-relative
// tile deltas instead of lonToGlobalX / latToGlobalY + _originGX offset.
// The old approach double-applied the map origin for buildings away from centre.
function makeBuildingDef(b, lat, lon, mPerTile, terrainRegistry, elevGrid) {
  const colorSet = terrainRegistry?.colors?.[TerrainType.BUILDING] ?? {};
  const topColor   = colorSet.top   ?? '#b0a090';
  const rightColor = colorSet.right ?? '#8a7a6a';
  const leftColor  = colorSet.left  ?? '#6a5a4a';

  const ring = b._ring ?? b.nodes ?? [];

  const heightTiles = b.heightM / mPerTile;
  const halfA = (b.obb?.halfA ?? Math.sqrt(Math.max(16, b.areaM2)) / 2) / mPerTile;
  const halfB = (b.obb?.halfB ?? halfA) / mPerTile;
  const _geometricR = Math.hypot(halfA, halfB);

  // FIX 2 shadow radius — clamp against actual footprint area
  const shadowR = Math.min(
    halfA * VU,
    Math.sqrt(Math.max(16, b.areaM2) / Math.PI) / mPerTile * VU
  );

  // Centroid lat/lon for delta projection in renderFn
  const centLat = b.centroid?.lat ?? lat;
  const centLon = b.centroid?.lon ?? lon;

  return {
    id:             `building_${b.id ?? Math.random()}`,
    latitude:       centLat,
    longitude:      centLon,
    solid:          true,
    bboxRadius:     _geometricR,
    _geometricR,
    physicsEnabled: false,
    fixed:          true,
    renderHeavy:    false,
    _isBuildingBox: true,
    _lodColor:      '#78909C',
    _areaM2:        b.areaM2,
    _heightM:       b.heightM,
    _facingAngle:   b.obb?.angleDeg ?? 0,
    _obb:           b.obb ?? null,
    _ring:          ring,
    _mPerTile:      mPerTile,

    renderFn(wr, groundElevPx, extra, entity) {
      const { cam, ctx } = wr;
      if (cam.tilt < 0.02 || !entity._ring?.length) return;

      const elev  = groundElevPx + (entity.elevOffset ?? 0);
      const depth = frontDepth(entity.tx, entity.ty, cam.rotation, entity._geometricR ?? _geometricR);

      wr.submitShadow({
        p:       { x: entity.tx, y: entity.ty },
        elev,
        r:       shadowR,
        engineH: heightTiles * VU,
      });

      wr.submitWorldObject(depth, () => {
        // FIX 3: centroid-relative tile delta projection.
        // entity.latitude/longitude = building centroid (set above).
        // entity.tx/ty = where that centroid sits in tile space (set by engine).
        // Each ring node offset from centroid in geographic coords → tile delta.
        const eLat = entity.latitude  ?? centLat;
        const eLon = entity.longitude ?? centLon;
        const ep   = entity._mPerTile ?? mPerTile;
        const mLon = 111320 * Math.cos(eLat * Math.PI / 180);
        const mLat = 111320;

        const screenPts = entity._ring.map(n => {
          const dTileX =  (n.lon - eLon) * mLon / ep;
          const dTileY = -(n.lat - eLat) * mLat / ep;
          return worldToScreen(entity.tx + dTileX, entity.ty + dTileY, elev, cam);
        });

        if (screenPts.length < 3) return;

        const hw  = tileHalfWidth(cam.zoom, cam.tileW);
        const hPx = heightTiles * hw * cam.tilt * 2;

        // Drop-shadow plane
        if (hPx > 2) {
          ctx.beginPath();
          screenPts.forEach((p, i) =>
            i === 0
              ? ctx.moveTo(p.x + hPx * 0.5, p.y + hPx * 0.25)
              : ctx.lineTo(p.x + hPx * 0.5, p.y + hPx * 0.25)
          );
          ctx.closePath();
          ctx.fillStyle = 'rgba(0,0,0,0.30)';
          ctx.fill();
        }

        // Walls
        if (hPx > 1) {
          for (let i = 0; i < screenPts.length - 1; i++) {
            const a  = screenPts[i];
            const b2 = screenPts[i + 1];
            const ex = b2.x - a.x, ey = b2.y - a.y;
            const nx = -ey, ny = ex;
            if (ny <= 0) continue;

            ctx.beginPath();
            ctx.moveTo(a.x,  a.y);
            ctx.lineTo(b2.x, b2.y);
            ctx.lineTo(b2.x, b2.y - hPx);
            ctx.lineTo(a.x,  a.y  - hPx);
            ctx.closePath();
            const angle   = Math.abs(Math.atan2(ey, ex));
            ctx.fillStyle = angle < Math.PI / 2 ? rightColor : leftColor;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth   = 0.5;
            ctx.stroke();
          }
        }

        // Roof face
        ctx.beginPath();
        screenPts.forEach((p, i) =>
          i === 0 ? ctx.moveTo(p.x, p.y - hPx) : ctx.lineTo(p.x, p.y - hPx)
        );
        ctx.closePath();
        ctx.fillStyle   = topColor;
        ctx.fill();
        ctx.strokeStyle = rightColor;
        ctx.lineWidth   = 0.7;
        ctx.stroke();
      });
    },
  };
}

// FIX 3 applied here: same centroid-relative projection as makeBuildingDef.
function makePolygonFeatureDef(el, style, mPerTile) {
  const nodes = el.geometry.map(g => ({ lat: g.lat, lon: g.lon }));
  if (nodes.length < 3) return null;
  const centroid = ringCentroid(nodes);

  return {
    id:             `poly:${el.id}`,
    latitude:       centroid.lat,
    longitude:      centroid.lon,
    solid:          false,
    bboxRadius:     0.5,
    physicsEnabled: false,
    fixed:          true,
    renderHeavy:    false,
    _ring:          nodes,
    _mPerTile:      mPerTile,
    _lodColor:      style.fill,

    renderFn(wr, groundElevPx, extra, entity) {
      const { cam, ctx } = wr;
      if (cam.tilt < 0.01 || !entity._ring?.length) return;

      const elev  = groundElevPx + (entity.elevOffset ?? 0);
      const depth = frontDepth(entity.tx, entity.ty, cam.rotation, 1);

      wr.submitWorldObject(depth, () => {
        // FIX 3: centroid-relative tile delta projection.
        const eLat = entity.latitude;
        const eLon = entity.longitude;
        const ep   = entity._mPerTile ?? mPerTile;
        const mLon = 111320 * Math.cos(eLat * Math.PI / 180);
        const mLat = 111320;

        const screenPts = entity._ring.map(n => {
          const dTileX =  (n.lon - eLon) * mLon / ep;
          const dTileY = -(n.lat - eLat) * mLat / ep;
          return worldToScreen(entity.tx + dTileX, entity.ty + dTileY, elev, cam);
        });

        if (screenPts.length < 3) return;

        ctx.beginPath();
        screenPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();

        ctx.globalAlpha = style.alpha ?? 0.75;
        ctx.fillStyle   = style.fill;
        ctx.fill();

        if (style.stroke) {
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth   = 1;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
    },
  };
}

function makeRoadDef(el, mPerTile) {
  const nodes = el.geometry.map(g => ({ lat: g.lat, lon: g.lon }));
  if (nodes.length < 2) return null;
  const midNode = nodes[Math.floor(nodes.length / 2)];

  const highway = el.tags?.highway ?? 'residential';
  const style   = ROAD_STYLE[highway] ?? ROAD_STYLE.residential;
  const sortIdx = ROAD_ORDER.indexOf(highway);

  const originGX = lonToGlobalX(nodes[0].lon, nodes[0].lat, mPerTile);
  const originGY = latToGlobalY(nodes[0].lat, mPerTile);

  return {
    id:             `road:${el.id}`,
    latitude:       midNode.lat,
    longitude:      midNode.lon,
    solid:          false,
    bboxRadius:     0.3,
    physicsEnabled: false,
    fixed:          true,
    renderHeavy:    false,
    _nodes:         nodes,
    _originGX:      originGX,
    _originGY:      originGY,
    _mPerTile:      mPerTile,
    _highway:       highway,
    _roadSortIdx:   sortIdx,
    _lodColor:      style.fill ?? style.stroke ?? '#606070',

    renderFn(wr, groundElevPx, extra, entity) {
      const { cam, ctx } = wr;
      if (cam.tilt < 0.01 || !entity._nodes?.length) return;

      const elev  = groundElevPx + (entity.elevOffset ?? 0);
      const depth = frontDepth(entity.tx, entity.ty, cam.rotation, 0.3)
                  - (entity._roadSortIdx ?? 0) * 0.0001;

      wr.submitWorldObject(depth, () => {
        const hw = tileHalfWidth(cam.zoom, cam.tileW);
        const zf = Math.max(0.5, hw / 20);

        // Roads use node[0] as anchor — same logic as before, correct for roads
        // because the road entity's tx/ty is at the midpoint, not node[0].
        // We keep _originGX/_originGY for roads only since they're polylines
        // and the per-node delta approach would need a mid-centroid reference.
        // Instead we use the same global→local conversion: entity.tx is at
        // the midpoint's global position; we correct each node relative to that.
        const eLat = entity.latitude;
        const eLon = entity.longitude;
        const ep   = entity._mPerTile ?? mPerTile;
        const mLon = 111320 * Math.cos(eLat * Math.PI / 180);
        const mLat = 111320;

        const screenPts = entity._nodes.map(n => {
          const dTileX =  (n.lon - eLon) * mLon / ep;
          const dTileY = -(n.lat - eLat) * mLat / ep;
          return worldToScreen(entity.tx + dTileX, entity.ty + dTileY, elev, cam);
        });

        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';

        const st = ROAD_STYLE[entity._highway] ?? ROAD_STYLE.residential;

        if (st.casing) {
          ctx.beginPath();
          screenPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.strokeStyle = st.casing;
          ctx.lineWidth   = st.casingW * zf * 2;
          ctx.setLineDash([]);
          ctx.stroke();

          ctx.beginPath();
          screenPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.strokeStyle = st.fill;
          ctx.lineWidth   = st.fillW * zf * 2;
          ctx.stroke();
        } else {
          ctx.beginPath();
          screenPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.strokeStyle = st.stroke ?? '#404858';
          ctx.lineWidth   = (st.w ?? 0.5) * zf * 2;
          ctx.setLineDash(st.dash ? st.dash.map(v => v * Math.max(0.8, zf)) : []);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    },
  };
}

function makeBlueprintDef(id, lat, lon, bpKey, opts = {}) {
  const scale       = opts.scale       ?? 1;
  const facingAngle = opts.facingAngle ?? 180;

  const _bp0 = Blueprints[bpKey];
  let _shadowR = 0, _shadowH = 0;
  if (_bp0) {
    const { maxY, halfExtentXZ } = blueprintNativeBounds(_bp0);
    _shadowR = halfExtentXZ * scale;
    _shadowH = maxY         * scale;
  }
  const _geometricR = _bp0 ? (blueprintNativeBounds(_bp0).halfExtentXZ / VU) * scale : 0.35;

  return {
    id,
    latitude:        lat,
    longitude:       lon,
    solid:           opts.solid           ?? false,
    bboxRadius:      opts.bboxRadius      ?? 0.35,
    footprintRadius: opts.footprintRadius ?? opts.bboxRadius ?? 0.35,
    physicsEnabled:  opts.physicsEnabled  ?? false,
    physicsRadius:   opts.physicsRadius   ?? 0.35,
    fixed:           opts.fixed           ?? true,
    renderHeavy:     true,
    _lodColor:       opts.lodColor        ?? '#2E7D32',
    altitudeM:       opts.altitudeM       ?? 0,
    visualAlt:       opts.visualAlt       ?? 0,
    showAltitudeLine:opts.showAltitudeLine ?? false,
    _bpKey:          bpKey,
    _scale:          scale,
    _facingAngle:    facingAngle,
    _geometricR,

    renderFn(wr, groundElevPx, extra, entity) {
      const blueprint = Blueprints[bpKey] ?? Blueprints['tree'];
      const minTilt = (entity._scale ?? 1) > 10 ? 0.01 : 0.04;
      if (!blueprint || wr.cam.tilt < minTilt) return;

      const s      = entity._scale       ?? 1;
      const angle  = entity._facingAngle ?? 180;
      const isoA   = Math.min(1, (wr.cam.tilt - 0.04) / 0.12);
      const elev   = groundElevPx + (entity.elevOffset ?? 0);

      const scaleRatio = scale > 0 ? (entity._scale ?? scale) / scale : 1;
      const geomR  = (entity._geometricR ?? 0.35) * scaleRatio;
      const depth  = frontDepth(entity.tx, entity.ty, wr.cam.rotation, geomR);

      const shadowR = _shadowR * scaleRatio;
      const shadowH = _shadowH * scaleRatio;
      if (shadowR > 0 && shadowH > 0) {
        wr.submitShadow({ p: { x: entity.tx, y: entity.ty }, elev, r: shadowR, engineH: shadowH });
      }

      wr.submitWorldObject(depth, () => {
        wr.ctx.globalAlpha = isoA;
        wr._voxel.beginTile(entity.tx, entity.ty, elev);
        wr._voxel.setRotation(angle);
        for (const p of blueprint) {
          wr._voxel.box(
            p.x * s, p.y * s, p.z * s,
            p.w * s, p.h * s, p.d * s,
            p.top, p.right ?? p.top, p.front ?? p.top,
          );
        }
        wr._voxel.clearRotation();
        wr.ctx.globalAlpha = 1;
      });
    },
  };
}

function makeFeatureDef(f) {
  let blueprint = null, blueprintKey = null;
  for (const candidate of [f.title, f.label, f.category]) {
    if (!candidate) continue;
    const key = candidate.toLowerCase()
      .replace(/[\s\-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    if (Blueprints[key]) { blueprintKey = key; blueprint = Blueprints[key]; break; }
  }

  const color = f.color ?? '#60a5fa';
  const label = f.label ?? f.title ?? '';

  return {
    id:        f.id,
    latitude:  f.latitude,
    longitude: f.longitude,
    solid:     false,
    bboxRadius: 0.35,
    physicsEnabled: false,
    fixed:     true,
    renderHeavy: false,
    type:      f.category,
    label, color,
    category:  f.category,
    value:     f.value,
    title:     f.title,

    renderFn(wr, groundElevPx, extra, entity) {
      const { cam } = wr;
      if (cam.tilt < 0.02) return;
      const elev  = groundElevPx + (entity.elevOffset ?? 0);
      const depth = frontDepth(entity.tx, entity.ty, cam.rotation, 0.35);
      const hw    = tileHalfWidth(cam.zoom, cam.tileW);
      const r     = Math.max(3, hw * 0.7);
      const isoA  = Math.min(1, (cam.tilt - 0.04) / 0.12);

      wr.submitWorldObject(depth, () => {
        wr.ctx.globalAlpha = 1;
        const { x, y } = worldToScreen(entity.tx + 0.5, entity.ty + 0.5, elev, cam);
        const ctx = wr.ctx;

        if (blueprint) {
          ctx.globalAlpha = isoA;
          wr.drawBlueprint(blueprint, entity.tx, entity.ty, elev);
          ctx.globalAlpha = 1;
        } else {
          ctx.beginPath();
          ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = color + '33';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth   = 1;
          ctx.stroke();
        }

        if (extra.selectedId === entity.id) {
          ctx.beginPath();
          ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
          ctx.strokeStyle = color + 'aa';
          ctx.lineWidth   = 2;
          ctx.stroke();
        }

        if (hw > 12 && label && cam.tilt > 0.1) {
          wr.drawLabel(x, y - r * 2.2, label);
        }
      });
    },
  };
}

function drawFacadeWindows(ctx, faceQuad, rows, cols, color, seed) {
  const lerp  = (a, b, t) => a + (b - a) * t;
  const lerpP = (p1, p2, t) => ({ x: lerp(p1.x, p2.x, t), y: lerp(p1.y, p2.y, t) });
  ctx.save();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u0 = (col + 0.15) / cols, u1 = (col + 0.85) / cols;
      const v0 = (row + 0.12) / rows, v1 = (row + 0.82) / rows;
      const [A, B, C, D] = faceQuad;
      const tl = lerpP(lerpP(A, B, u0), lerpP(D, C, u0), v0);
      const tr = lerpP(lerpP(A, B, u1), lerpP(D, C, u1), v0);
      const br = lerpP(lerpP(A, B, u1), lerpP(D, C, u1), v1);
      const bl = lerpP(lerpP(A, B, u0), lerpP(D, C, u0), v1);
      const isLit  = hash(seed * 31 + row * 7  + col * 13) > 0.35;
      const isDark = hash(seed * 17 + row * 11 + col * 5)  > 0.8;
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.fillStyle = isDark ? '#1a2a3a99' : (isLit ? '#fffcd0bb' : color + 'bb');
      ctx.fill();
    }
  }
  ctx.restore();
}

export function decorateBuildingFacade(ctx, cam, buildingEntry, vr, seed = 0) {
  const { p, r, engineH, tc } = buildingEntry;
  const hw = tileHalfWidth(cam.zoom, cam.tileW);
  ctx.save();
  try {
    if (hw < 6 || cam.tilt < 0.1 || !p || !tc || !vr?.proj) return;
    const snap = ((Math.round(cam.rotation / (Math.PI / 2)) % 4) + 4) % 4;
    const [x, z, w, d, h] = [-r, -r, r * 2, r * 2, engineH];
    const vp = (px, py, pz) => {
      if (typeof buildingEntry.elev !== 'number') return null;
      vr.beginTile(p.x, p.y, buildingEntry.elev);
      const pt = vr.proj(px, py, pz);
      return pt && typeof pt.x === 'number' ? pt : null;
    };
    let faceA, faceB;
    if      (snap === 0) { faceA = [vp(x+w,0,z),   vp(x+w,h,z),   vp(x+w,h,z+d), vp(x+w,0,z+d)]; faceB = [vp(x,0,z+d),   vp(x+w,0,z+d), vp(x+w,h,z+d), vp(x,h,z+d)]; }
    else if (snap === 1) { faceA = [vp(x,0,z+d),   vp(x+w,0,z+d), vp(x+w,h,z+d), vp(x,h,z+d)];   faceB = [vp(x,0,z),     vp(x,h,z),     vp(x,h,z+d),   vp(x,0,z+d)]; }
    else if (snap === 2) { faceA = [vp(x,0,z),     vp(x,h,z),     vp(x,h,z+d),   vp(x,0,z+d)];   faceB = [vp(x,0,z),     vp(x+w,0,z),   vp(x+w,h,z),   vp(x,h,z)]; }
    else                 { faceA = [vp(x,0,z),     vp(x+w,0,z),   vp(x+w,h,z),   vp(x,h,z)];     faceB = [vp(x+w,0,z),   vp(x+w,h,z),   vp(x+w,h,z+d), vp(x+w,0,z+d)]; }
    const isValid = f => f.length === 4 && f.every(pt => pt && typeof pt.x === 'number');
    if (!isValid(faceA) || !isValid(faceB)) return;
    const floors = Math.max(1, Math.round((engineH / VU) * 0.7));
    const colsA  = Math.max(2, Math.round(r / VU * 3));
    const colsB  = Math.max(1, Math.round(r / VU * 2));
    const winAlpha = Math.min(1, (hw - 6) / 14) * Math.min(1, cam.tilt * 4);
    if (winAlpha > 0.05) {
      ctx.globalAlpha = winAlpha;
      drawFacadeWindows(ctx, faceA, floors, colsA, '#c8e8ff', seed);
      drawFacadeWindows(ctx, faceB, floors, colsB, '#c8e8ff', seed + 100);
      ctx.globalAlpha = 1;
    }
    if (hw > 10) {
      const pts = [vp(x,h,z), vp(x+w,h,z), vp(x+w,h,z+d), vp(x,h,z+d)];
      if (pts.some(pt => !pt)) return;
      ctx.beginPath();
      pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle   = shadeHex(tc.top, 0.85) + '88'; ctx.fill();
    }
  } finally {
    ctx.restore();
  }
}

// ─── Loader ───────────────────────────────────────────────────────────────────
export class OSMTerrainLoader extends BaseLoader {
  get id() { return 'osm-terrain'; }

  constructor(options = {}) {
    super(options);
    this._endpoints    = options.endpoint
      ? [options.endpoint]
      : (options.endpoints ?? DEFAULT_ENDPOINTS);
    this._endpointIdx  = 0;
    this._mPerTile     = options.mPerTile     ?? 2;
    this._mapW         = options.mapW         ?? 80;
    this._mapH         = options.mapH         ?? 80;
    this._fetchRadiusM = options.fetchRadiusM ?? 900;
    this._backoffUntil = 0;
    this._abort        = null;
    this._cache        = new PersistentCache('GOE_Overpass', 'osm_terrain');

    this._liveEntityCache = new Map();

    this._fetchDebounceMs = options.fetchDebounceMs ?? 800;
    this._debounceTimer   = null;
    this._pendingResolve  = null;

    this._decorateBuildingFacade = options.decorateBuildingFacade ?? null;
    this._terrainRegistry        = options.terrainRegistry        ?? null;

    this._elevGrid       = [];
    this._elevGridCenter = null;
    this._elevFetching   = false;

    this._bpGen = new ProceduralBlueprintGenerator({
      mPerTile: this._mPerTile,
    });

    this._onPartialResult = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  init(engine) {
    this._terrainRegistry = engine.terrainRegistry;
    this._bpGen._terrainRegistry = this._terrainRegistry;
  }

  setPartialResultCallback(cb) {
    this._onPartialResult = cb;
  }

  get _endpoint() { return this._endpoints[this._endpointIdx % this._endpoints.length]; }
  _nextEndpoint()  { this._endpointIdx = (this._endpointIdx + 1) % this._endpoints.length; }

  _getCacheKey({ lat, lon }) {
    return `${lat.toFixed(2)},${lon.toFixed(2)}`;
  }

  // ── Elevation helpers ──────────────────────────────────────────────────────
  async _maybeRefreshElevGrid(lat, lon) {
    const threshold = ELEV_STEP * ELEV_HALF * 0.5;
    if (this._elevFetching) return;
    if (this._elevGridCenter) {
      const d = Math.hypot(lat - this._elevGridCenter.lat, lon - this._elevGridCenter.lon);
      if (d < threshold) return;
    }
    this._elevFetching = true;
    try {
      this._elevGrid       = await fetchElevationGrid(lat, lon);
      this._elevGridCenter = { lat, lon };
      console.log(`[OSMTerrainLoader] Elevation grid refreshed (${this._elevGrid.length} pts)`);
    } finally {
      this._elevFetching = false;
    }
  }

  sampleElevation(lat, lon) {
    return sampleElev(this._elevGrid, lat, lon);
  }

  // ── Debounced fetch entry point ───────────────────────────────────────────
  async fetch(geoCenter) {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._pendingResolve?.({});
    }
    return new Promise(resolve => {
      this._pendingResolve = resolve;
      this._debounceTimer  = setTimeout(async () => {
        this._debounceTimer  = null;
        this._pendingResolve = null;
        const result = await this._doFetch(geoCenter);
        resolve(result);
      }, this._fetchDebounceMs);
    });
  }

  async _doFetch(geoCenter) {
    if (this._abort) this._abort.abort();
    this._abort = new AbortController();

    if (Date.now() < this._backoffUntil) {
      console.warn(`[OSMTerrainLoader] Backoff ${Math.ceil((this._backoffUntil - Date.now()) / 1000)}s`);
      return {};
    }

    const { lat, lon } = geoCenter;

    this._maybeRefreshElevGrid(lat, lon);

    const cacheKey = this._getCacheKey(geoCenter);
    try {
      if (this._liveEntityCache.has(cacheKey)) {
        const { terrainUpdates, entities } = this._liveEntityCache.get(cacheKey);
        console.log(`[OSMTerrainLoader] Live cache hit — ${entities.length} entities`);
        this._onPartialResult?.({ terrainUpdates, entities });
        return { terrainUpdates, entities };
      }

      const cached = await this._cache.get(cacheKey);
      const age    = Date.now() - (cached?.timestamp ?? 0);
      if (cached?.terrainUpdates && age < CACHE_TTL_MS) {
        console.log(`[OSMTerrainLoader] IDB cache hit — rebuilding entities`);
        const terrainUpdates = new Map(Object.entries(cached.terrainUpdates));
        this._onPartialResult?.({ terrainUpdates, entities: [] });
        const liveEntities = await this._rebuildEntitiesFromCache(cached, lat, lon);
        this._onPartialResult?.({ terrainUpdates: new Map(), entities: liveEntities });
        this._liveEntityCache.set(cacheKey, { terrainUpdates, entities: liveEntities });
        return { terrainUpdates, entities: liveEntities };
      }
    } catch (err) {
      console.warn('[OSMTerrainLoader] Cache read error', err);
    }

    // ── Overpass fetch ─────────────────────────────────────────────────────
    const r = this._fetchRadiusM;
    const around = `(around:${r},${lat},${lon})`;
    const q = `[out:json][timeout:60];(
      way["natural"~"^(water|wetland|beach|wood|grassland|heath|scrub|sand|bare_rock|meadow)$"]${around};
      way["landuse"~"^(reservoir|basin|grass|meadow|village_green|allotments|forest|park|commercial|residential|retail|industrial|cemetery|construction|farmland)$"]${around};
      way["leisure"~"^(park|garden|pitch|playground|swimming_pool|nature_reserve)$"]${around};
      way["waterway"~"^(river|stream|canal|drain|ditch|riverbank)$"]${around};
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|pedestrian|living_street|footway|cycleway|path|track|steps|bridleway)$"]${around};
      way["building"]${around};
      way["bridge"="yes"]["name"]${around};
      way["man_made"="bridge"]["name"]${around};
      node["amenity"]${around};
      node["shop"]${around};
      node["tourism"]${around};
      node["historic"]${around};
      node["leisure"]${around};
      node["office"]${around};
      node["natural"~"^(peak|spring|cave_entrance)$"]${around};
      node["natural"="tree"]${around};
    );out geom qt;`;

    for (let attempt = 0; attempt < this._endpoints.length; attempt++) {
      const ctrl    = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 14000);

      try {
        const res = await fetch(
          `${this._endpoint}?data=${encodeURIComponent(q)}`,
          { signal: ctrl.signal }
        );
        clearTimeout(timeout);
        if (res.status === 429) { this._nextEndpoint(); continue; }
        if (!res.ok)             { this._nextEndpoint(); continue; }

        const data = await res.json();
        console.log(`[OSMTerrainLoader] ${data.elements?.length ?? 0} elements`);

        const result = await this._processOSMData(data, geoCenter);

        try {
          await this._cache.set(cacheKey, {
            terrainUpdates: Object.fromEntries(result.terrainUpdates),
            entities:       this._serializeEntities(result.entities),
            timestamp:      Date.now(),
          });
        } catch (cacheErr) {
          console.warn('[OSMTerrainLoader] Cache write error', cacheErr);
        }

        this._liveEntityCache.set(cacheKey, {
          terrainUpdates: result.terrainUpdates,
          entities:       result.entities,
        });

        return result;

      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') { this._nextEndpoint(); continue; }
        console.warn(`[OSMTerrainLoader] Error on ${this._endpoint}:`, err.message);
        this._nextEndpoint();
      }
    }

    this._backoffUntil = Date.now() + 8000;
    console.warn('[OSMTerrainLoader] All endpoints failed, backing off 8s');
    return {};
  }

  // ── Main OSM data processing ──────────────────────────────────────────────
  async _processOSMData(data, geoCenter) {
    const { lat, lon } = geoCenter;
    const mPerTile      = this._mPerTile;

    const terrainUpdates        = new Map();
    const entityDefs            = [];
    const renderedLandmarkNames = new Set();

    const toTile = (eLat, eLon) => ({
      x: lonToGlobalX(eLon, geoCenter.lat, mPerTile),
      y: latToGlobalY(eLat, mPerTile),
    });

    const mLat  = 111320;
    const mLon  = 111320 * Math.cos(lat * Math.PI / 180);
    const r     = this._fetchRadiusM;
    const rLat  = r / mLat, rLon = r / mLon;
    const minGX = lonToGlobalX(lon - rLon, lat, mPerTile) - 2;
    const maxGX = lonToGlobalX(lon + rLon, lat, mPerTile) + 2;
    const minGY = latToGlobalY(lat + rLat, mPerTile) - 2;
    const maxGY = latToGlobalY(lat - rLat, mPerTile) + 2;

    const wayElements  = [];
    const nodeElements = [];
    for (const el of data.elements ?? []) {
      if (el.type === 'way')  wayElements.push(el);
      if (el.type === 'node') nodeElements.push(el);
    }

    // ── Pass 1: Bridge landmark ways ──────────────────────────────────────
    const bridgeSegmentsByKey = new Map();
    for (const el of wayElements) {
      if (!el.geometry?.length) continue;
      if (!(el.tags?.bridge === 'yes' || el.tags?.man_made === 'bridge')) continue;
      const match = resolveLandmarkKey(el.tags);
      if (!match) continue;

      const cls = classifyOSM(el.tags);
      if (cls) {
        const pts = el.geometry.map(g => toTile(g.lat, g.lon));
        rasterizeLine(terrainUpdates, pts, cls.terrain, cls.width ?? 2);
      }

      const { key: nameKey } = match;
      if (!bridgeSegmentsByKey.has(nameKey)) bridgeSegmentsByKey.set(nameKey, { match, els: [] });
      bridgeSegmentsByKey.get(nameKey).els.push(el);
    }

    for (const [nameKey, { match, els }] of bridgeSegmentsByKey) {
      if (renderedLandmarkNames.has(nameKey)) continue;
      const blueprint = Blueprints[nameKey];
      if (!blueprint) continue;

      const allGeom = els.flatMap(el => el.geometry ?? []);
      let cLat = 0, cLon = 0;
      for (const g of allGeom) { cLat += g.lat; cLon += g.lon; }
      if (allGeom.length) { cLat /= allGeom.length; cLon /= allGeom.length; }

      const refEl   = els.reduce((a, b) => (b.geometry?.length ?? 0) > (a.geometry?.length ?? 0) ? b : a);
      const refGeom = refEl.geometry ?? [];
      let osmSpanM  = 0;
      if (refGeom.length >= 2) {
        const a0 = refGeom[0], a1 = refGeom[refGeom.length - 1];
        osmSpanM = Math.hypot(
          (a1.lat - a0.lat) * 111320,
          (a1.lon - a0.lon) * 111320 * Math.cos(a0.lat * Math.PI / 180)
        );
      }

      const osmHeightM  = parseFloat(els[0].tags?.height ?? 0) || 0;
      const scale       = computeLandmarkScale(blueprint, osmHeightM, 0, mPerTile, osmSpanM);
      const { halfExtentXZ } = blueprintNativeBounds(blueprint);
      const scaledR     = Math.min(Math.max((halfExtentXZ / VU) * scale, 2), 8);
      const facingAngle = extractFacingAngle(els[0].tags, refGeom);

      renderedLandmarkNames.add(nameKey);
      entityDefs.push(makeBlueprintDef(
        `landmark:bridge:${els[0].id}`, cLat, cLon, nameKey,
        { scale, facingAngle, solid: false, bboxRadius: scaledR, footprintRadius: scaledR,
          physicsEnabled: false, physicsRadius: scaledR, fixed: true, lodColor: '#A1887F' }
      ));
    }

    // ── Pass 2: All other ways (terrain + roads + polygon features) ───────
    const buildingWays = [];
    const roadDefs     = [];

    for (const el of wayElements) {
      if (!el.geometry?.length) continue;
      if ((el.tags?.bridge === 'yes' || el.tags?.man_made === 'bridge') && resolveLandmarkKey(el.tags)) continue;

      const cls = classifyOSM(el.tags);
      if (!cls) continue;

      const pts = el.geometry.map(g => toTile(g.lat, g.lon));

      if (cls.type === 'polygon') rasterizePolygon(terrainUpdates, pts, cls.terrain);
      else                        rasterizeLine(terrainUpdates, pts, cls.terrain, cls.width);

      if (cls.type === 'polygon' && !el.tags?.building) {
        const tag   = el.tags?.natural ?? el.tags?.landuse ?? el.tags?.leisure ?? el.tags?.waterway;
        const style = tag ? POLYGON_STYLES[tag] : null;
        if (style) {
          const def = makePolygonFeatureDef(el, style, mPerTile);
          if (def) entityDefs.push(def);
        }
      }

      if (el.tags?.highway) {
        const def = makeRoadDef(el, mPerTile);
        if (def) roadDefs.push(def);
      }

      if (el.tags?.waterway && !el.tags?.building) {
        const style = POLYGON_STYLES['water'];
        if (cls.type === 'polygon') {
          const def = makePolygonFeatureDef(el, style, mPerTile);
          if (def) entityDefs.push(def);
        }
      }

      if (el.tags?.building) buildingWays.push(el);
    }

    roadDefs.sort((a, b) => (a._roadSortIdx ?? 0) - (b._roadSortIdx ?? 0));
    for (const def of roadDefs) entityDefs.push(def);

    // ── Pass 3: Nodes (trees, POIs, landmark nodes) ───────────────────────
    const landmarkNodeCandidates = new Map();

    for (const el of nodeElements) {
      const { x: gx, y: gy } = toTile(el.lat, el.lon);
      if (gx < minGX || gx > maxGX || gy < minGY || gy > maxGY) continue;

      if (el.tags?.natural === 'tree') {
        const species = treeSpeciesFromTags(el.tags);
        const bpKey   = TREE_BLUEPRINT_KEY[species] ?? 'tree_oak';
        entityDefs.push(makeBlueprintDef(
          `tree:${el.id}`, el.lat, el.lon, bpKey,
          { solid: true, bboxRadius: 0.5, footprintRadius: 1.2,
            physicsEnabled: false, physicsRadius: 0.5, lodColor: '#2E7D32', facingAngle: 180 }
        ));
        continue;
      }

      const poi = classifyPOI(el.tags);
      if (!poi) continue;

      const tileKey = `${Math.round(gx)},${Math.round(gy)}`;
      if (terrainUpdates.get(tileKey) === TerrainType.BUILDING) continue;

      const landmarkMatch = resolveLandmarkKey(el.tags);
      if (landmarkMatch) {
        const { key: nameKey, name } = landmarkMatch;
        if (!renderedLandmarkNames.has(nameKey) && !landmarkNodeCandidates.has(nameKey)) {
          const blueprint  = Blueprints[nameKey];
          const osmHeightM = parseFloat(el.tags?.height ?? 0) || 0;
          const scale      = computeLandmarkScale(blueprint, osmHeightM, 0, mPerTile);
          const { halfExtentXZ } = blueprintNativeBounds(blueprint);
          const scaledR    = Math.max(2, (halfExtentXZ / VU) * scale);
          const facingAngle = extractFacingAngle(el.tags);
          landmarkNodeCandidates.set(nameKey, { el, nameKey, name, blueprint, osmHeightM, scale, scaledR, facingAngle });
        }
        continue;
      }

      entityDefs.push(makeFeatureDef({
        id: `osm:node:${el.id}`,
        latitude:    el.lat,
        longitude:   el.lon,
        color:       poi.color,
        label:       poi.label,
        category:    poi.category,
        value:       poi.value,
        title:       el.tags?.name ?? poi.label,
        description: el.tags?.name ? `${poi.label} — ${el.tags.name}` : poi.label,
        tags:        el.tags ?? {},
      }));
    }

    // Stream Pass 1–3 immediately
    this._onPartialResult?.({
      terrainUpdates,
      entities: [...entityDefs],
    });

    // ── Pass 4: Buildings ─────────────────────────────────────────────────
    if (buildingWays.length && this._terrainRegistry) {
      const buildings          = preprocessBuildings(buildingWays);
      const genericBuildingJobs = [];

      for (const b of buildings) {
        const match     = resolveLandmarkKey(b.tags);
        const nameKey   = match?.key ?? '';
        const blueprint = match ? Blueprints[nameKey] : null;

        if (blueprint) {
          if (!renderedLandmarkNames.has(nameKey)) {
            renderedLandmarkNames.add(nameKey);

            const osmHeightM = parseFloat(b.tags?.height ?? 0) || 0;
            const osmAreaM2  = b.areaM2 ?? 0;
            const scale      = computeLandmarkScale(blueprint, osmHeightM, osmAreaM2, mPerTile);
            const { halfExtentXZ } = blueprintNativeBounds(blueprint);
            const scaledR    = Math.max(2, (halfExtentXZ / VU) * scale);
            const facingAngle = extractFacingAngle(b.tags, b.geometry);

            const landmarkDef = makeBlueprintDef(
              `landmark:${b.id}`, b.centroid.lat, b.centroid.lon, nameKey,
              { scale, facingAngle, solid: true, bboxRadius: scaledR, footprintRadius: scaledR,
                physicsEnabled: false, physicsRadius: scaledR, fixed: true, lodColor: '#A1887F' }
            );
            entityDefs.push(landmarkDef);
            this._onPartialResult?.({ terrainUpdates: new Map(), entities: [landmarkDef] });

            const colliders = makeBlueprintColliders(
              `landmark:${b.id}`, b.centroid.lat, b.centroid.lon, blueprint, scale, mPerTile
            );
            for (const col of colliders) {
              const { dLat, dLon } = tileOffsetToGeo(col._localOffsetX, col._localOffsetZ, b.centroid.lat, mPerTile);
              col.latitude  = b.centroid.lat + dLat;
              col.longitude = b.centroid.lon + dLon;
              entityDefs.push(col);
            }
            this._onPartialResult?.({ terrainUpdates: new Map(), entities: colliders });
          }
        } else {
          b._facingAngle = extractFacingAngle(b.tags, b.geometry ?? b._ring ?? b.nodes);
          genericBuildingJobs.push(b);
        }
      }

      // Emit landmark node candidates not superseded by a building way
      for (const [nameKey, c] of landmarkNodeCandidates) {
        if (renderedLandmarkNames.has(nameKey)) continue;
        renderedLandmarkNames.add(nameKey);
        const def = makeBlueprintDef(
          `landmark:node:${c.el.id}`, c.el.lat, c.el.lon, nameKey,
          { scale: c.scale, facingAngle: c.facingAngle, solid: true, bboxRadius: c.scaledR,
            footprintRadius: c.scaledR, physicsEnabled: false, physicsRadius: c.scaledR,
            fixed: true, lodColor: '#A1887F' }
        );
        entityDefs.push(def);
        this._onPartialResult?.({ terrainUpdates: new Map(), entities: [def] });
      }

      // ── Generic buildings: batched with render-loop yields ─────────────
      for (let i = 0; i < genericBuildingJobs.length; i += BUILDING_BATCH_SIZE) {
        const batch = genericBuildingJobs.slice(i, i + BUILDING_BATCH_SIZE);

        const batchDefs = (
          await Promise.all(
            batch.map(b =>
              this._bpGen
                .getBuildingDef(b, mPerTile, this._terrainRegistry, this._elevGrid)
                .catch(err => {
                  console.warn('[OSMTerrainLoader] Building gen failed:', err.message);
                  return null;
                })
            )
          )
        ).filter(Boolean);

        if (batchDefs.length) {
          for (const def of batchDefs) entityDefs.push(def);
          this._onPartialResult?.({ terrainUpdates: new Map(), entities: batchDefs });
        }

        await new Promise(r => setTimeout(r, 0));
      }
    }

    console.log(`[OSMTerrainLoader] → ${terrainUpdates.size} terrain tiles, ${entityDefs.length} entities`);
    return { terrainUpdates, entities: entityDefs };
  }

  // ── Entity serialization / deserialization for IDB cache ─────────────────
  _serializeEntities(entityDefs) {
    return entityDefs.map(e => ({
      id:           e.id,
      latitude:     e.latitude,
      longitude:    e.longitude,
      solid:        e.solid,
      bboxRadius:   e.bboxRadius,
      _type:        e._isBuildingBox  ? 'building'
                  : (e._bpKey && e.renderHeavy) ? 'blueprint'
                  : e._ring           ? 'polygon'
                  : e._nodes          ? 'road'
                  : 'poi',
      _procBlueprint: e._procBlueprint ?? null,
      areaM2:       e._areaM2       ?? null,
      heightM:      e._heightM      ?? null,
      bpKey:        e._bpKey        ?? null,
      _scale:       e._scale        ?? null,
      _facingAngle: e._facingAngle  ?? null,
      _ring:        e._ring         ?? null,
      _nodes:       e._nodes        ?? null,
      _mPerTile:    e._mPerTile     ?? null,
      _highway:     e._highway      ?? null,
      _roadSortIdx: e._roadSortIdx  ?? null,
      label:        e.label,
      color:        e.color,
      category:     e.category,
      value:        e.value,
      title:        e.title,
      _obb:         e._obb          ?? null,
    }));
  }

  async _rebuildEntitiesFromCache(cached, lat, lon) {
    const mPerTile = this._mPerTile;
    return (await Promise.all((cached.entities ?? []).map(async e => {
      if (e._type === 'procbp' && e._procBlueprint) {
        const b = {
          id:       e.id.replace('procbp:', ''),
          _ring:    e._ring,
          nodes:    e._ring,
          areaM2:   e.areaM2  ?? 16,
          heightM:  e.heightM ?? 8,
          obb:      e._obb    ?? null,
          centroid: { lat: e.latitude, lon: e.longitude },
          tags:     {},
        };
        const def = await this._bpGen.getBuildingDef(b, mPerTile, this._terrainRegistry, this._elevGrid);
        if (def) def._procBlueprint = e._procBlueprint;
        return def;
      }
      if (e._type === 'building' && e._ring) {
        const b = {
          id: e.id, _ring: e._ring, nodes: e._ring,
          areaM2: e.areaM2 ?? 16, heightM: e.heightM ?? 8,
          obb: e._obb ?? null,
          centroid: { lat: e.latitude, lon: e.longitude },
          tags: {},
        };
        return makeBuildingDef(b, e.latitude, e.longitude, mPerTile, this._terrainRegistry, this._elevGrid);
      }
      if (e._type === 'polygon' && e._ring) {
        const tag   = e.category ?? '';
        const style = POLYGON_STYLES[tag] ?? { fill: 'rgba(40,50,60,0.5)', stroke: null };
        const el = { id: e.id.replace('poly:',''), geometry: e._ring, tags: {} };
        return makePolygonFeatureDef(el, style, mPerTile);
      }
      if (e._type === 'road' && e._nodes) {
        const el = {
          id: e.id.replace('road:',''),
          geometry: e._nodes,
          tags: { highway: e._highway ?? 'residential' },
        };
        return makeRoadDef(el, mPerTile);
      }
      if (e.bpKey) {
        return makeBlueprintDef(e.id, e.latitude, e.longitude, e.bpKey, {
          scale:       e._scale       ?? 1,
          facingAngle: e._facingAngle ?? 180,
        });
      }
      return makeFeatureDef(e);
    }))).filter(Boolean);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  destroy() {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
      this._pendingResolve?.({});
      this._pendingResolve = null;
    }
    this._abort?.abort();
    this._bpGen.clearMemCache();
  }

  async clearCache() {
    this._liveEntityCache.clear();
    await this._cache.clear();
    await this._bpGen.clearAllCaches();
  }
}