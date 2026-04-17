/**
 * OSMEntityLoader — OSM entity loader (rendering counterpart to OSMTerrainTileLoader)
 *
 * Produces only entities (buildings, roads, POIs, landmarks, trees, polygon
 * feature renderFns) with no terrain tile / terrainUpdates output.
 *
 * Derived from OSMTerrainLoader with all terrain rasterisation stripped and
 * the following performance patterns retained verbatim:
 *
 *   MAP-PERF 1 — Ring projection cache (ringProjCache / ringProjStamp)
 *   MAP-PERF 2 — Label / render-candidate pre-filtering once per fetch
 *   MAP-PERF 3 — Controlled highlight / selection animation loop
 *   MAP-PERF 4 — Batched ctx state in road renderFn label pass
 *   PERF 1     — Road batching — one entity per highway class
 *   PERF 3     — Shared named renderFns (_buildingRenderFn, _polygonFeatureRenderFn)
 *   PERF 4     — Float64Array scratch buffer for ring projection
 *   PERF 5     — Sub-pixel zoom cull in all renderFns
 *   PERF 6     — O(1) elevation index (not used here — elevation removed)
 *   PERF 7     — Debounced UI partial-result callbacks
 *   LRU        — _liveEntityCache capped to prevent unbounded memory growth
 *
 * Removed from OSMTerrainLoader:
 *   - rasterizePolygon / rasterizeLine / classifyOSM (terrain-only)
 *   - Elevation grid / open-elevation API
 *   - terrainUpdates output
 *
 * Usage:
 *   import { OSMEntityLoader } from './src/OSMEntityLoader.js';
 *
 *   const entityLoader = new OSMEntityLoader({
 *     mPerTile:        2,
 *     fetchRadiusM:    800,
 *     fetchDebounceMs: 800,
 *   });
 *   engine.use(entityLoader);
 *   // optional: stream partial results into the engine immediately
 *   entityLoader.setPartialResultCallback(({ entities }) => engine.mergeEntities(entities));
 */

import { BaseLoader }         from '../BaseLoader.js';
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

const CACHE_TTL_MS        = 30 * 60 * 1000;
const VU                  = 8;   // voxel units per tile
const BUILDING_BATCH_SIZE = 5;

// ─── MAP-PERF 1: Ring projection cache ────────────────────────────────────────
const RING_PROJ_CACHE_MAX = 512;

let ringProjStamp = 0;
const _ringProjCache = new Map();

export function invalidateRingProj() {
  ringProjStamp++;
}

export function invalidateEntityRingProj(entityId) {
  _ringProjCache.delete(entityId);
}

function _getCachedRingProj(entity, elev, cam) {
  let c = _ringProjCache.get(entity.id);
  if (!c) {
    const maxNodes = Math.min((entity._ring?.length ?? 0), 512);
    c = { stamp: -1, len: 0, data: new Float64Array(maxNodes * 2) };
    _ringProjCache.set(entity.id, c);
    if (_ringProjCache.size > RING_PROJ_CACHE_MAX) {
      const oldest = _ringProjCache.keys().next().value;
      _ringProjCache.delete(oldest);
    }
  }
  if (c.stamp !== ringProjStamp) {
    c.len   = _projectRingIntoScratch(entity, elev, cam);
    c.stamp = ringProjStamp;
    for (let i = 0; i < c.len * 2; i++) c.data[i] = _screenScratch[i];
  } else {
    for (let i = 0; i < c.len * 2; i++) _screenScratch[i] = c.data[i];
  }
  return c.len;
}

// ─── MAP-PERF 2: Label candidates pre-filtered once per fetch ─────────────────
let _labelEntities    = [];
let _polygonEntities  = [];
let _roadEntities     = [];
let _buildingEntities = [];

function _buildRenderCandidates(entityDefs) {
  _labelEntities    = [];
  _polygonEntities  = [];
  _roadEntities     = [];
  _buildingEntities = [];

  for (const e of entityDefs) {
    if (e._batches)                       _roadEntities.push(e);
    else if (e._ring && e._isBuildingBox) _buildingEntities.push(e);
    else if (e._ring)                     _polygonEntities.push(e);

    if (e.label && e.label.trim().length > 0) _labelEntities.push(e);
  }

  _roadEntities.sort((a, b) => (a._roadSortIdx ?? 0) - (b._roadSortIdx ?? 0));
  _buildingEntities.sort((a, b) => (b._areaM2 ?? 0) - (a._areaM2 ?? 0));
  _polygonEntities.sort((a, b)  => (b._areaM2 ?? 0) - (a._areaM2 ?? 0));
}

export function getRenderCandidates() {
  return {
    labels:    _labelEntities,
    polygons:  _polygonEntities,
    roads:     _roadEntities,
    buildings: _buildingEntities,
  };
}

// ─── MAP-PERF 3: Highlight animation loop ─────────────────────────────────────
let _hlRaf      = null;
let _hlRenderFn = null;
let _hlActive   = false;

export function startHighlightLoop(renderFn) {
  _hlRenderFn = renderFn;
  _hlActive   = true;
  if (!_hlRaf) _hlRaf = requestAnimationFrame(_hlTick);
}

export function stopHighlightLoop() {
  _hlActive   = false;
  _hlRenderFn = null;
  if (_hlRaf) { cancelAnimationFrame(_hlRaf); _hlRaf = null; }
}

function _hlTick() {
  if (!_hlActive || !_hlRenderFn) { _hlRaf = null; return; }
  _hlRenderFn();
  _hlRaf = requestAnimationFrame(_hlTick);
}

// ─── PERF 4 — Shared Float64Array scratch buffer for ring projection ───────────
const _screenScratch = new Float64Array(1024);

function _projectRingIntoScratch(entity, elev, cam) {
  const eLat = entity.latitude;
  const eLon = entity.longitude;
  const ep   = entity._mPerTile;
  const mLon = 111320 * Math.cos(eLat * Math.PI / 180);
  const mLat = 111320;
  const ring = entity._ring;
  const len  = Math.min(ring.length, 512);
  for (let i = 0; i < len; i++) {
    const n = ring[i];
    const dTileX =  (n.lon - eLon) * mLon / ep;
    const dTileY = -(n.lat - eLat) * mLat / ep;
    const s = worldToScreen(entity.tx + dTileX, entity.ty + dTileY, elev, cam);
    _screenScratch[i * 2]     = s.x;
    _screenScratch[i * 2 + 1] = s.y;
  }
  return len;
}

// ─── Polygon feature fill/stroke styles ───────────────────────────────────────
const POLYGON_STYLES = {
  water:         { fill: 'rgba(22,46,72,0.82)',   stroke: '#1a3850', alpha: 0.9  },
  wetland:       { fill: 'rgba(26,46,56,0.72)',   stroke: null                   },
  strait:        { fill: 'rgba(18,38,64,0.88)',   stroke: '#1a3850', alpha: 0.92 },
  wood:          { fill: 'rgba(20,32,24,0.80)',   stroke: null                   },
  forest:        { fill: 'rgba(20,32,24,0.80)',   stroke: null                   },
  scrub:         { fill: 'rgba(24,34,24,0.70)',   stroke: null                   },
  heath:         { fill: 'rgba(30,32,24,0.70)',   stroke: null                   },
  grassland:     { fill: 'rgba(24,40,24,0.70)',   stroke: null                   },
  beach:         { fill: 'rgba(40,37,30,0.75)',   stroke: null                   },
  sand:          { fill: 'rgba(40,37,30,0.75)',   stroke: null                   },
  bare_rock:     { fill: 'rgba(32,34,40,0.75)',   stroke: null                   },
  meadow:        { fill: 'rgba(24,40,24,0.70)',   stroke: null                   },
  residential:   { fill: 'rgba(28,33,48,0.55)',   stroke: null                   },
  commercial:    { fill: 'rgba(29,32,53,0.55)',   stroke: null                   },
  industrial:    { fill: 'rgba(25,30,37,0.55)',   stroke: null                   },
  retail:        { fill: 'rgba(32,29,48,0.55)',   stroke: null                   },
  farmland:      { fill: 'rgba(26,37,26,0.55)',   stroke: null                   },
  grass:         { fill: 'rgba(24,40,28,0.60)',   stroke: null                   },
  cemetery:      { fill: 'rgba(26,40,32,0.65)',   stroke: null                   },
  construction:  { fill: 'rgba(30,32,37,0.55)',   stroke: null                   },
  allotments:    { fill: 'rgba(26,40,24,0.55)',   stroke: null                   },
  park:          { fill: 'rgba(23,42,28,0.72)',   stroke: '#1d3522'              },
  garden:        { fill: 'rgba(22,40,24,0.72)',   stroke: null                   },
  playground:    { fill: 'rgba(24,40,24,0.65)',   stroke: null                   },
  pitch:         { fill: 'rgba(24,32,40,0.72)',   stroke: '#1e2e30'              },
  swimming_pool: { fill: 'rgba(24,40,56,0.82)',   stroke: '#1e3248'              },
  nature_reserve:{ fill: 'rgba(21,32,24,0.72)',   stroke: null                   },
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

// ─── Tag helpers used by entity factories ─────────────────────────────────────

/** Derive which OSM polygon style tag to look up for a given element's tags. */
function _polygonStyleTag(tags) {
  return tags?.natural ?? tags?.landuse ?? tags?.leisure ?? tags?.waterway ?? null;
}

/** True when a way element should produce a polygon feature renderFn entity. */
function _isPolygonFeatureWay(el) {
  if (!el.tags) return false;
  if (el.tags.building) return false;
  if (el.tags.highway)  return false;
  const tag = _polygonStyleTag(el.tags);
  return tag != null && POLYGON_STYLES[tag] != null;
}

/** True when a way element is a waterway that should also get a renderFn. */
function _isWaterwayFeatureWay(el) {
  return !!(el.tags?.waterway && !el.tags?.building);
}

// ─── Geometry helpers ──────────────────────────────────────────────────────────
function ringCentroid(nodes) {
  let lat = 0, lon = 0;
  for (const n of nodes) { lat += n.lat; lon += n.lon; }
  return { lat: lat / nodes.length, lon: lon / nodes.length };
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
  if (osmHeightM > 0 && maxY > 0) return (osmHeightM / mPerTile) / (maxY / VU);
  if (osmAreaM2 > 0 && halfExtentXZ > 0)
    return (Math.sqrt(osmAreaM2) / mPerTile / 2) / (halfExtentXZ / VU);
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

// ─── Tree helpers ──────────────────────────────────────────────────────────────
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

// ─── PERF 3 — Shared building renderFn (MAP-PERF 1 cache-aware) ───────────────
function _buildingRenderFn(wr, groundElevPx, extra, entity) {
  const { cam, ctx } = wr;
  const hw = tileHalfWidth(cam.zoom, cam.tileW);
  if (hw < 1.5 || cam.tilt < 0.02 || !entity._ring?.length) return;

  const elev        = groundElevPx + (entity.elevOffset ?? 0);
  const geomR       = entity._geometricR ?? 1;
  const depth       = frontDepth(entity.tx, entity.ty, cam.rotation, geomR);
  const heightTiles = entity._heightTiles;
  const shadowR     = entity._shadowR;

  wr.submitShadow({
    p: { x: entity.tx, y: entity.ty }, elev,
    r: Math.min(shadowR, geomR * VU * 0.5), engineH: heightTiles * VU,
  });

  wr.submitWorldObject(depth, () => {
    const len = _getCachedRingProj(entity, elev, cam);
    if (len < 3) return;

    const hPx        = heightTiles * hw * cam.tilt * 2;
    const rightColor = entity._rightColor;
    const leftColor  = entity._leftColor;
    const topColor   = entity._topColor;

    if (hPx > 2) {
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const sx = _screenScratch[i * 2], sy = _screenScratch[i * 2 + 1];
        i === 0
          ? ctx.moveTo(sx + hPx * 0.5, sy + hPx * 0.25)
          : ctx.lineTo(sx + hPx * 0.5, sy + hPx * 0.25);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fill();
    }

    if (hPx > 1) {
      for (let i = 0; i < len - 1; i++) {
        const ax = _screenScratch[i * 2],       ay = _screenScratch[i * 2 + 1];
        const bx = _screenScratch[(i + 1) * 2], by = _screenScratch[(i + 1) * 2 + 1];
        const ex = bx - ax, ey = by - ay;
        const ny = ex;
        if (ny <= 0) continue;

        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        ctx.lineTo(bx, by - hPx); ctx.lineTo(ax, ay - hPx);
        ctx.closePath();
        const angle = Math.abs(Math.atan2(ey, ex));
        ctx.fillStyle = angle < Math.PI / 2 ? rightColor : leftColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth   = 0.5;
        ctx.stroke();
      }
    }

    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const sx = _screenScratch[i * 2], sy = _screenScratch[i * 2 + 1];
      i === 0 ? ctx.moveTo(sx, sy - hPx) : ctx.lineTo(sx, sy - hPx);
    }
    ctx.closePath();
    ctx.fillStyle   = topColor;
    ctx.fill();
    ctx.strokeStyle = rightColor;
    ctx.lineWidth   = 0.7;
    ctx.stroke();
  });
}

// ─── PERF 3 — Shared polygon feature renderFn ─────────────────────────────────
function _polygonFeatureRenderFn(wr, groundElevPx, extra, entity) {
  const { cam, ctx } = wr;
  const hw = tileHalfWidth(cam.zoom, cam.tileW);
  if (hw < 1.5 || cam.tilt < 0.01 || !entity._ring?.length) return;

  const elev  = groundElevPx + (entity.elevOffset ?? 0);
  const depth = frontDepth(entity.tx, entity.ty, cam.rotation, 1);

  wr.submitWorldObject(depth, () => {
    const len = _getCachedRingProj(entity, elev, cam);
    if (len < 3) return;

    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const sx = _screenScratch[i * 2], sy = _screenScratch[i * 2 + 1];
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.closePath();

    ctx.globalAlpha = entity._styleAlpha ?? 0.75;
    ctx.fillStyle   = entity._styleFill;
    ctx.fill();

    if (entity._styleStroke) {
      ctx.strokeStyle = entity._styleStroke;
      ctx.lineWidth   = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

// ─── Entity factory functions ──────────────────────────────────────────────────

function makeBuildingDef(b, lat, lon, mPerTile, terrainRegistry) {
  const colorSet   = terrainRegistry?.colors?.BUILDING ?? {};
  const topColor   = colorSet.top   ?? '#b0a090';
  const rightColor = colorSet.right ?? '#8a7a6a';
  const leftColor  = colorSet.left  ?? '#6a5a4a';

  const ring        = b._ring ?? b.nodes ?? [];
  const heightTiles = b.heightM / mPerTile;
  const halfA       = (b.obb?.halfA ?? Math.sqrt(Math.max(16, b.areaM2)) / 2) / mPerTile;
  const halfB       = (b.obb?.halfB ?? halfA) / mPerTile;
  const _geometricR = Math.hypot(halfA, halfB);
  const shadowR     = Math.min(
    halfA * VU,
    Math.sqrt(Math.max(16, b.areaM2) / Math.PI) / mPerTile * VU
  );
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
    renderHeavy:    true,
    _isBuildingBox: true,
    _lodColor:      '#78909C',
    _areaM2:        b.areaM2,
    _heightM:       b.heightM,
    _facingAngle:   b.obb?.angleDeg ?? 0,
    _obb:           b.obb ?? null,
    _ring:          ring,
    _mPerTile:      mPerTile,
    _topColor:      topColor,
    _rightColor:    rightColor,
    _leftColor:     leftColor,
    _heightTiles:   heightTiles,
    _shadowR:       shadowR,
    renderFn:       _buildingRenderFn,
  };
}

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
    _styleFill:     style.fill,
    _styleStroke:   style.stroke ?? null,
    _styleAlpha:    style.alpha  ?? 0.75,
    renderFn:       _polygonFeatureRenderFn,
  };
}

// ─── PERF 1 — makeRoadBatchDefs (MAP-PERF 4 ctx-state batching) ───────────────
function makeRoadBatchDefs(roadElements, mPerTile, geoCenter) {
  const byClass = new Map();
  for (const el of roadElements) {
    if (!el.geometry?.length || el.geometry.length < 2) continue;
    const highway = el.tags?.highway ?? 'residential';
    if (!byClass.has(highway)) byClass.set(highway, []);
    byClass.get(highway).push(el.geometry.map(g => ({ lat: g.lat, lon: g.lon })));
  }

  const defs = [];
  for (const [highway, batches] of byClass) {
    const style   = ROAD_STYLE[highway] ?? ROAD_STYLE.residential;
    const sortIdx = ROAD_ORDER.indexOf(highway);

    defs.push({
      id:             `roads:${highway}`,
      latitude:       geoCenter.lat,
      longitude:      geoCenter.lon,
      solid:          false,
      bboxRadius:     0,
      physicsEnabled: false,
      fixed:          true,
      renderHeavy:    true,
      _highway:       highway,
      _batches:       batches,
      _mPerTile:      mPerTile,
      _roadSortIdx:   sortIdx,
      _lodColor:      style.fill ?? style.stroke ?? '#606070',

      renderFn(wr, groundElevPx, extra, entity) {
        const { cam, ctx } = wr;
        const hw = tileHalfWidth(cam.zoom, cam.tileW);
        if (hw < 1.5 || cam.tilt < 0.01 || !entity._batches?.length) return;

        const elev  = groundElevPx + (entity.elevOffset ?? 0);
        const depth = -9999 - (entity._roadSortIdx ?? 0) * 0.001;

        wr.submitWorldObject(depth, () => {
          const zf   = Math.max(0.5, hw / 20);
          const eLat = entity.latitude;
          const eLon = entity.longitude;
          const ep   = entity._mPerTile ?? mPerTile;
          const mLon = 111320 * Math.cos(eLat * Math.PI / 180);
          const mLat = 111320;
          const st   = ROAD_STYLE[entity._highway] ?? ROAD_STYLE.residential;

          const project = n => {
            const dTileX =  (n.lon - eLon) * mLon / ep;
            const dTileY = -(n.lat - eLat) * mLat / ep;
            return worldToScreen(entity.tx + dTileX, entity.ty + dTileY, elev, cam);
          };

          // MAP-PERF 4: set ctx state once per pass, outside the batch loop
          ctx.lineCap  = 'round';
          ctx.lineJoin = 'round';

          if (st.casing) {
            ctx.strokeStyle = st.casing;
            ctx.lineWidth   = st.casingW * zf * 2;
            ctx.setLineDash([]);
            for (const nodes of entity._batches) {
              ctx.beginPath();
              for (let i = 0; i < nodes.length; i++) {
                const sp = project(nodes[i]);
                i === 0 ? ctx.moveTo(sp.x, sp.y) : ctx.lineTo(sp.x, sp.y);
              }
              ctx.stroke();
            }
            ctx.strokeStyle = st.fill;
            ctx.lineWidth   = st.fillW * zf * 2;
            for (const nodes of entity._batches) {
              ctx.beginPath();
              for (let i = 0; i < nodes.length; i++) {
                const sp = project(nodes[i]);
                i === 0 ? ctx.moveTo(sp.x, sp.y) : ctx.lineTo(sp.x, sp.y);
              }
              ctx.stroke();
            }
          } else {
            ctx.strokeStyle = st.stroke ?? '#404858';
            ctx.lineWidth   = (st.w ?? 0.5) * zf * 2;
            ctx.setLineDash(st.dash ? st.dash.map(v => v * Math.max(0.8, zf)) : []);
            for (const nodes of entity._batches) {
              ctx.beginPath();
              for (let i = 0; i < nodes.length; i++) {
                const sp = project(nodes[i]);
                i === 0 ? ctx.moveTo(sp.x, sp.y) : ctx.lineTo(sp.x, sp.y);
              }
              ctx.stroke();
            }
            ctx.setLineDash([]);
          }
        });
      },
    });
  }

  defs.sort((a, b) => (a._roadSortIdx ?? 0) - (b._roadSortIdx ?? 0));
  return defs;
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
    id, latitude: lat, longitude: lon,
    solid:            opts.solid            ?? false,
    bboxRadius:       opts.bboxRadius       ?? 0.35,
    footprintRadius:  opts.footprintRadius  ?? opts.bboxRadius ?? 0.35,
    physicsEnabled:   opts.physicsEnabled   ?? false,
    physicsRadius:    opts.physicsRadius    ?? 0.35,
    fixed:            opts.fixed            ?? true,
    renderHeavy:      true,
    _lodColor:        opts.lodColor         ?? '#2E7D32',
    altitudeM:        opts.altitudeM        ?? 0,
    visualAlt:        opts.visualAlt        ?? 0,
    showAltitudeLine: opts.showAltitudeLine ?? false,
    _bpKey:           bpKey,
    _scale:           scale,
    _facingAngle:     facingAngle,
    _geometricR,

    renderFn(wr, groundElevPx, extra, entity) {
      const blueprint = Blueprints[bpKey] ?? Blueprints['tree'];
      const minTilt   = (entity._scale ?? 1) > 10 ? 0.01 : 0.04;
      const hw        = tileHalfWidth(wr.cam.zoom, wr.cam.tileW);
      if (!blueprint || hw < 1.5 || wr.cam.tilt < minTilt) return;

      const s     = entity._scale       ?? 1;
      const angle = entity._facingAngle ?? 180;
      const isoA  = Math.min(1, (wr.cam.tilt - 0.04) / 0.12);
      const elev  = groundElevPx + (entity.elevOffset ?? 0);

      const scaleRatio = scale > 0 ? (entity._scale ?? scale) / scale : 1;
      const geomR  = (entity._geometricR ?? 0.35) * scaleRatio;
      const depth  = frontDepth(entity.tx, entity.ty, wr.cam.rotation, geomR);
      const sR     = _shadowR * scaleRatio;
      const sH     = _shadowH * scaleRatio;
      if (sR > 0 && sH > 0) {
        wr.submitShadow({ p: { x: entity.tx, y: entity.ty }, elev, r: sR, engineH: sH });
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
    const key = candidate.toLowerCase().replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (Blueprints[key]) { blueprintKey = key; blueprint = Blueprints[key]; break; }
  }
  const color = f.color ?? '#60a5fa';
  const label = f.label ?? f.title ?? '';

  return {
    id: f.id, latitude: f.latitude, longitude: f.longitude,
    solid: false, bboxRadius: 0.35, physicsEnabled: false, fixed: true,
    renderHeavy: false, type: f.category, label, color,
    category: f.category, value: f.value, title: f.title,

    renderFn(wr, groundElevPx, extra, entity) {
      const { cam } = wr;
      const hw = tileHalfWidth(cam.zoom, cam.tileW);
      if (hw < 1.5 || cam.tilt < 0.02) return;

      const elev  = groundElevPx + (entity.elevOffset ?? 0);
      const depth = frontDepth(entity.tx, entity.ty, cam.rotation, 0.35);
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
          ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = color + '33'; ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
        }

        if (extra.selectedId === entity.id) {
          ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
          ctx.strokeStyle = color + 'aa'; ctx.lineWidth = 2; ctx.stroke();
        }

        if (hw > 12 && label && cam.tilt > 0.1) wr.drawLabel(x, y - r * 2.2, label);
      });
    },
  };
}

// ─── Loader ───────────────────────────────────────────────────────────────────
export class OSMEntityLoader extends BaseLoader {
  get id() { return 'osm-entities'; }

  static _LIVE_CACHE_MAX = 8;

  constructor(options = {}) {
    super(options);
    this._endpoints    = options.endpoint
      ? [options.endpoint]
      : (options.endpoints ?? DEFAULT_ENDPOINTS);
    this._endpointIdx  = 0;
    this._mPerTile     = options.mPerTile     ?? 2;
    this._fetchRadiusM = options.fetchRadiusM ?? 900;
    this._backoffUntil = 0;
    this._abort        = null;
    this._cache        = new PersistentCache('GOE_OSMEntities', 'osm_entities');

    // LRU-bounded live entity cache (keyed by "lat,lon" rounded to 2dp)
    this._liveEntityCache = new Map();

    this._fetchDebounceMs = options.fetchDebounceMs ?? 800;
    this._debounceTimer   = null;
    this._pendingResolve  = null;

    this._terrainRegistry = options.terrainRegistry ?? null;
    this._bpGen           = null; // set in init()

    this._onPartialResult = null;

    // PERF 7 — debounced UI notification state
    this._uiNotifyPending  = false;
    this._uiPendingPayload = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  init(engine) {
    this._terrainRegistry = engine.terrainRegistry;
    this._bpGen = new ProceduralBlueprintGenerator({ mPerTile: this._mPerTile });
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

  // ── LRU-capped live entity cache write ────────────────────────────────────
  _setLiveCache(key, value) {
    this._liveEntityCache.set(key, value);
    if (this._liveEntityCache.size > OSMEntityLoader._LIVE_CACHE_MAX) {
      const oldest = this._liveEntityCache.keys().next().value;
      this._liveEntityCache.delete(oldest);
    }
  }

  // ── PERF 7 — Debounced partial-result UI notification ─────────────────────
  _notifyPartialResult(partial) {
    if (!this._onPartialResult) return;

    if (this._uiNotifyPending) {
      const pending = this._uiPendingPayload;
      if (partial.entities?.length) {
        if (!pending.entities) pending.entities = [];
        pending.entities.push(...partial.entities);
      }
      return;
    }

    this._uiNotifyPending  = true;
    this._uiPendingPayload = {
      entities: partial.entities ? [...partial.entities] : [],
    };

    requestAnimationFrame(() => {
      this._uiNotifyPending = false;
      const payload = this._uiPendingPayload;
      this._uiPendingPayload = null;
      this._onPartialResult(payload);
    });
  }

  // ── Debounced fetch entry point ────────────────────────────────────────────
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
      console.warn(`[OSMEntityLoader] Backoff ${Math.ceil((this._backoffUntil - Date.now()) / 1000)}s`);
      return {};
    }

    const { lat, lon } = geoCenter;
    const cacheKey = this._getCacheKey(geoCenter);

    // ── Live cache hit ─────────────────────────────────────────────────────
    try {
      if (this._liveEntityCache.has(cacheKey)) {
        const { entities } = this._liveEntityCache.get(cacheKey);
        console.log(`[OSMEntityLoader] Live cache hit — ${entities.length} entities`);
        _buildRenderCandidates(entities);
        this._notifyPartialResult({ entities });
        return { entities };
      }

      // ── IDB cache hit ──────────────────────────────────────────────────
      const cached = await this._cache.get(cacheKey);
      const age    = Date.now() - (cached?.timestamp ?? 0);
      if (cached?.entities && age < CACHE_TTL_MS) {
        console.log('[OSMEntityLoader] IDB cache hit — rebuilding entities');
        const liveEntities = await this._rebuildEntitiesFromCache(cached, lat, lon);
        _buildRenderCandidates(liveEntities);
        this._notifyPartialResult({ entities: liveEntities });
        this._setLiveCache(cacheKey, { entities: liveEntities });
        return { entities: liveEntities };
      }
    } catch (err) {
      console.warn('[OSMEntityLoader] Cache read error', err);
    }

    // ── Overpass fetch ─────────────────────────────────────────────────────
    const r      = this._fetchRadiusM;
    const around = `(around:${r},${lat},${lon})`;
    const q = `[out:json][timeout:60];(
      way["natural"~"^(water|wetland|beach|wood|grassland|heath|scrub|sand|bare_rock|meadow|strait)$"]${around};
      way["natural"="strait"]${around};
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
        console.log(`[OSMEntityLoader] ${data.elements?.length ?? 0} OSM elements`);

        const result = await this._processOSMData(data, geoCenter);

        // Write IDB cache
        try {
          await this._cache.set(cacheKey, {
            entities:  this._serializeEntities(result.entities),
            timestamp: Date.now(),
          });
        } catch (cacheErr) {
          console.warn('[OSMEntityLoader] Cache write error', cacheErr);
        }

        this._setLiveCache(cacheKey, { entities: result.entities });
        return result;

      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') { this._nextEndpoint(); continue; }
        console.warn(`[OSMEntityLoader] Error on ${this._endpoint}:`, err.message);
        this._nextEndpoint();
      }
    }

    this._backoffUntil = Date.now() + 8000;
    console.warn('[OSMEntityLoader] All endpoints failed, backing off 8s');
    return {};
  }

  // ── Main OSM data processing ───────────────────────────────────────────────
  async _processOSMData(data, geoCenter) {
    const { lat, lon } = geoCenter;
    const mPerTile      = this._mPerTile;

    const entityDefs            = [];
    const renderedLandmarkNames = new Set();

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

    // ── Pass 1: Bridge landmark ways ────────────────────────────────────────
    const bridgeSegmentsByKey = new Map();
    for (const el of wayElements) {
      if (!el.geometry?.length) continue;
      if (!(el.tags?.bridge === 'yes' || el.tags?.man_made === 'bridge')) continue;
      const match = resolveLandmarkKey(el.tags);
      if (!match) continue;

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
        { scale, facingAngle, solid: false, bboxRadius: scaledR,
          footprintRadius: scaledR, physicsEnabled: false, physicsRadius: scaledR,
          fixed: true, lodColor: '#A1887F' }
      ));
    }

    // ── Pass 2: All other ways (roads + polygon features) ───────────────────
    const buildingWays = [];
    const roadWays     = [];

    for (const el of wayElements) {
      if (!el.geometry?.length) continue;
      if ((el.tags?.bridge === 'yes' || el.tags?.man_made === 'bridge') && resolveLandmarkKey(el.tags)) continue;

      if (el.tags?.highway)  { roadWays.push(el); continue; }
      if (el.tags?.building) { buildingWays.push(el); continue; }

      // Polygon feature renderFns (parks, water bodies, landuse areas, etc.)
      if (_isPolygonFeatureWay(el)) {
        const tag   = _polygonStyleTag(el.tags);
        const style = POLYGON_STYLES[tag];
        if (style) {
          const def = makePolygonFeatureDef(el, style, mPerTile);
          if (def) entityDefs.push(def);
        }
      }

      // Waterway linear features also get a polygon entity when they have area
      if (_isWaterwayFeatureWay(el) && !_isPolygonFeatureWay(el)) {
        const def = makePolygonFeatureDef(el, POLYGON_STYLES['water'], mPerTile);
        if (def) entityDefs.push(def);
      }
    }

    for (const def of makeRoadBatchDefs(roadWays, mPerTile, geoCenter)) {
      entityDefs.push(def);
    }

    // ── Pass 3: Nodes ────────────────────────────────────────────────────────
    const landmarkNodeCandidates = new Map();

    for (const el of nodeElements) {
      const gx = lonToGlobalX(el.lon, lat, mPerTile);
      const gy = latToGlobalY(el.lat, mPerTile);
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
          landmarkNodeCandidates.set(nameKey, {
            el, nameKey, name, blueprint, osmHeightM, scale, scaledR, facingAngle,
          });
        }
        continue;
      }

      entityDefs.push(makeFeatureDef({
        id:          `osm:node:${el.id}`,
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

    // Flush passes 1-3 immediately — MAP-PERF 2 + invalidate proj cache
    invalidateRingProj();
    _buildRenderCandidates(entityDefs);
    this._notifyPartialResult({ entities: [...entityDefs] });

    // ── Pass 4: Buildings (batched with render-loop yields) ──────────────────
    if (buildingWays.length && this._terrainRegistry) {
      const buildings           = preprocessBuildings(buildingWays);
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
            const def = makeBlueprintDef(
              `landmark:${b.id}`, b.centroid.lat, b.centroid.lon, nameKey,
              { scale, facingAngle, solid: true, bboxRadius: scaledR,
                footprintRadius: scaledR, physicsEnabled: false, physicsRadius: scaledR,
                fixed: true, lodColor: '#A1887F' }
            );
            entityDefs.push(def);
            this._notifyPartialResult({ entities: [def] });
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
        this._notifyPartialResult({ entities: [def] });
      }

      // Generic buildings emitted in batches with render-loop yields
      for (let i = 0; i < genericBuildingJobs.length; i += BUILDING_BATCH_SIZE) {
        const batch = genericBuildingJobs.slice(i, i + BUILDING_BATCH_SIZE);

        const batchDefs = (
          await Promise.all(
            batch.map(b =>
              this._bpGen
                .getBuildingDef(b, mPerTile, this._terrainRegistry, [])
                .catch(err => {
                  console.warn('[OSMEntityLoader] Building gen failed:', err.message);
                  return null;
                })
            )
          )
        ).filter(Boolean);

        if (batchDefs.length) {
          for (const def of batchDefs) entityDefs.push(def);
          _buildRenderCandidates(entityDefs);
          this._notifyPartialResult({ entities: batchDefs });
        }

        await new Promise(r => setTimeout(r, 0));
      }
    }

    console.log(`[OSMEntityLoader] → ${entityDefs.length} entities`);
    return { entities: entityDefs };
  }

  // ── Entity serialization for IDB cache ─────────────────────────────────────
  _serializeEntities(entityDefs) {
    return entityDefs.map(e => ({
      id:           e.id,
      latitude:     e.latitude,
      longitude:    e.longitude,
      solid:        e.solid,
      bboxRadius:   e.bboxRadius,
      _type:        e._isBuildingBox         ? 'building'
                  : (e._bpKey && e.renderHeavy) ? 'blueprint'
                  : e._ring                  ? 'polygon'
                  : e._batches               ? 'road_batch'
                  : e._nodes                 ? 'road'
                  : 'poi',
      _procBlueprint: e._procBlueprint ?? null,
      areaM2:       e._areaM2       ?? null,
      heightM:      e._heightM      ?? null,
      bpKey:        e._bpKey        ?? null,
      _scale:       e._scale        ?? null,
      _facingAngle: e._facingAngle  ?? null,
      _ring:        e._ring         ?? null,
      _nodes:       e._nodes        ?? null,
      _batches:     e._batches      ?? null,
      _mPerTile:    e._mPerTile     ?? null,
      _highway:     e._highway      ?? null,
      _roadSortIdx: e._roadSortIdx  ?? null,
      label:        e.label,
      color:        e.color,
      category:     e.category,
      value:        e.value,
      title:        e.title,
      _obb:         e._obb          ?? null,
      _styleFill:   e._styleFill    ?? null,
      _styleStroke: e._styleStroke  ?? null,
      _styleAlpha:  e._styleAlpha   ?? null,
      _topColor:    e._topColor     ?? null,
      _rightColor:  e._rightColor   ?? null,
      _leftColor:   e._leftColor    ?? null,
      _heightTiles: e._heightTiles  ?? null,
      _shadowR:     e._shadowR      ?? null,
    }));
  }

  // ── Entity deserialization from IDB cache ───────────────────────────────────
  async _rebuildEntitiesFromCache(cached, lat, lon) {
    const mPerTile = this._mPerTile;
    return (await Promise.all((cached.entities ?? []).map(async e => {

      if (e._type === 'road_batch' && e._batches) {
        const fakeEls = e._batches.map(nodes => ({
          id: e.id, geometry: nodes, tags: { highway: e._highway ?? 'residential' },
        }));
        const defs = makeRoadBatchDefs(fakeEls, e._mPerTile ?? mPerTile, { lat, lon });
        return defs[0] ?? null;
      }

      if (e._type === 'procbp' && e._procBlueprint) {
        const b = {
          id: e.id.replace('procbp:', ''), _ring: e._ring, nodes: e._ring,
          areaM2: e.areaM2 ?? 16, heightM: e.heightM ?? 8,
          obb: e._obb ?? null, centroid: { lat: e.latitude, lon: e.longitude }, tags: {},
        };
        const def = await this._bpGen.getBuildingDef(b, mPerTile, this._terrainRegistry, []);
        if (def) def._procBlueprint = e._procBlueprint;
        return def;
      }

      if (e._type === 'building' && e._ring) {
        const b = {
          id: e.id, _ring: e._ring, nodes: e._ring,
          areaM2: e.areaM2 ?? 16, heightM: e.heightM ?? 8,
          obb: e._obb ?? null, centroid: { lat: e.latitude, lon: e.longitude }, tags: {},
        };
        const def = makeBuildingDef(b, e.latitude, e.longitude, mPerTile, this._terrainRegistry);
        if (e._topColor)    def._topColor    = e._topColor;
        if (e._rightColor)  def._rightColor  = e._rightColor;
        if (e._leftColor)   def._leftColor   = e._leftColor;
        if (e._heightTiles) def._heightTiles = e._heightTiles;
        if (e._shadowR)     def._shadowR     = e._shadowR;
        return def;
      }

      if (e._type === 'polygon' && e._ring) {
        const tag   = e.category ?? '';
        const style = POLYGON_STYLES[tag] ?? { fill: 'rgba(40,50,60,0.5)', stroke: null };
        const el    = { id: e.id.replace('poly:', ''), geometry: e._ring, tags: {} };
        const def   = makePolygonFeatureDef(el, style, mPerTile);
        if (def && e._styleFill)              def._styleFill   = e._styleFill;
        if (def && e._styleStroke !== undefined) def._styleStroke = e._styleStroke;
        if (def && e._styleAlpha)             def._styleAlpha  = e._styleAlpha;
        return def;
      }

      if (e._type === 'road' && e._nodes) {
        const fakeEls = [{
          id: e.id.replace('road:', ''),
          geometry: e._nodes,
          tags: { highway: e._highway ?? 'residential' },
        }];
        const defs = makeRoadBatchDefs(fakeEls, e._mPerTile ?? mPerTile, { lat, lon });
        return defs[0] ?? null;
      }

      if (e.bpKey) {
        return makeBlueprintDef(e.id, e.latitude, e.longitude, e.bpKey, {
          scale: e._scale ?? 1, facingAngle: e._facingAngle ?? 180,
        });
      }

      return makeFeatureDef(e);
    }))).filter(Boolean);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  destroy() {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
      this._pendingResolve?.({});
      this._pendingResolve = null;
    }
    this._abort?.abort();
    this._bpGen?.clearMemCache();
    this._uiNotifyPending  = false;
    this._uiPendingPayload = null;
    _ringProjCache.clear();
    stopHighlightLoop();
  }

  async clearCache() {
    this._liveEntityCache.clear();
    await this._cache.clear();
    await this._bpGen?.clearAllCaches();
  }
}