/**
 * GOE — OSMTerrainLoader
 *
 * Fixes in this revision:
 *   A. Blueprint renderFn now calls wr.submitShadow() so trees, landmarks
 *      (Eiffel Tower etc.) cast shadows like buildings do.
 *      Shadow hull dimensions are derived from the blueprint's native
 *      bounding box scaled by entity._scale, computed once at definition
 *      time and stored in closure.
 *
 *   B. Depth sorting — tileDepth() projects the entity CENTRE onto the
 *      camera axis. For large objects this causes pop-through at non-cardinal
 *      rotations because the front corner of one object can be nearer to the
 *      camera than the centre of a smaller object behind it.
 *      Fix: frontDepth() uses the FRONT CORNER (the corner that maximises
 *      depth along the camera axis) as the sort key for all entity types.
 */
import { BaseLoader } from '../BaseLoader.js';
import { TerrainType } from '../../terrain/types.js';
import { lonToGlobalX, latToGlobalY } from '../../math/geo.js';
import { PersistentCache } from '../../core/PersistentCache.js';
import { Blueprints } from '../../assets/BluePrintLibrary.js';
import { tileDepth, getElevOffset, tileHalfWidth, shadeHex, worldToScreen } from '../../math/projection.js';
import { preprocessBuildings } from './BuildingPreprocessor.js';
import { resolveFeatureType } from '../../terrain/FeatureTypes.js';

const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const CACHE_TTL_MS = 30 * 60 * 1000;
const VU = 8;

// ─── Depth sort helper ────────────────────────────────────────────────────────
/**
 * Returns the depth of the FRONT CORNER of a square bounding box.
 *
 * The isometric depth axis is:  depth = tx·cos(rot) + ty·sin(rot)
 *
 * For a box centred at (tx,ty) with half-extent r tiles the front corner
 * (the one geometrically closest to the camera = highest depth = drawn last)
 * is at (tx + sign(cos)·r,  ty + sign(sin)·r).
 *
 * Using the front corner instead of the centre prevents large objects from
 * being buried behind smaller ones at non-cardinal camera angles.
 */
function frontDepth(tx, ty, rot, r) {
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  return (tx + Math.sign(cr) * r) * cr + (ty + Math.sign(sr) * r) * sr;
}

// ─── Terrain classification ────────────────────────────────────────────────────

function classifyOSM(tags) {
  if (!tags) return null;
  const { highway:h, surface:s, waterway:w, natural:n, landuse:l, leisure:le, building:b } = tags;
  if (n==='water'||n==='wetland'||l==='reservoir'||l==='basin'||w==='riverbank')
    return { terrain: TerrainType.DEEP_WATER, type:'polygon' };
  if (w==='river')    return { terrain: TerrainType.WATER, type:'line', width:3 };
  if (w==='stream'||w==='canal') return { terrain: TerrainType.WATER, type:'line', width:2 };
  if (w)              return { terrain: TerrainType.WATER, type:'line', width:1 };
  if (n==='beach')    return { terrain: TerrainType.SAND,  type:'polygon' };
  if (n==='wood'||l==='forest') return { terrain: TerrainType.FOREST, type:'polygon' };
  if (le==='park'||le==='garden'||l==='park') return { terrain: TerrainType.PARK, type:'polygon' };
  if (['grass','meadow','village_green','allotments'].includes(l) ||
      ['grassland','heath','scrub'].includes(n) ||
      ['pitch','playground'].includes(le))
    return { terrain: TerrainType.GRASS, type:'polygon' };
  if (h) {
    const unpaved = ['dirt','earth','ground','unpaved','mud','gravel','sand'];
    const paved   = ['asphalt','paved','concrete','chipseal','paving_stones'];
    let roadTerrain = TerrainType.ROAD_TARMAC;
    if (unpaved.includes(s) || ['track','path','bridleway'].includes(h)) roadTerrain = TerrainType.ROAD_DIRT;
    else if (paved.includes(s)) roadTerrain = TerrainType.ROAD_TARMAC;
    if (h==='motorway'||h==='trunk'||h==='primary')   return { terrain: roadTerrain, type:'line', width:3 };
    if (h==='secondary'||h==='tertiary')               return { terrain: roadTerrain, type:'line', width:2 };
    if (h==='footway'||h==='path'||h==='cycleway'||h==='pedestrian')
      return { terrain: TerrainType.PATH, type:'line', width:1 };
    return { terrain: roadTerrain, type:'line', width:1 };
  }
  if (b) return { terrain: TerrainType.BUILDING, type:'polygon' };
  if (['residential','commercial','retail','industrial'].includes(l))
    return { terrain: TerrainType.RESIDENTIAL, type:'polygon' };
  return null;
}

// ─── POI classification ────────────────────────────────────────────────────────

const POI_COLORS = {
  amenity: {
    restaurant:'#ef4444', cafe:'#ef4444', pub:'#ef4444', bar:'#ef4444',
    fast_food:'#ef4444',  food_court:'#ef4444',
    school:'#f59e0b', university:'#f59e0b', library:'#f59e0b', college:'#f59e0b',
    hospital:'#dc2626', clinic:'#dc2626', pharmacy:'#dc2626', doctors:'#dc2626',
    theatre:'#a78bfa', cinema:'#a78bfa', arts_centre:'#a78bfa',
    place_of_worship:'#f97316',
    park:'#22c55e', playground:'#22c55e',
    bank:'#eab308', atm:'#eab308',
    fuel:'#6b7280', parking:'#6b7280',
    police:'#3b82f6', fire_station:'#3b82f6', post_office:'#3b82f6',
    default:'#60a5fa',
  },
  shop:    { default:'#eab308' },
  tourism: {
    museum:'#a78bfa', gallery:'#a78bfa', attraction:'#a78bfa',
    hotel:'#f59e0b', hostel:'#f59e0b', information:'#60a5fa', camp_site:'#22c55e',
    default:'#a78bfa',
  },
  historic: { default:'#f97316' },
  leisure:  { default:'#22c55e' },
  office:   { default:'#60a5fa' },
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
      : val.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
    const label = cat === 'historic' ? `Historic: ${name}` : name;
    return { color, label, category: cat, value: val };
  }
  return null;
}

// ─── Rasterisation ─────────────────────────────────────────────────────────────

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
        cache.set((x << 16) | (y & 0xFFFF), terrain);
  }
}

function rasterizeLine(cache, pts, terrain, width) {
  const w2 = width * width;
  for (let i = 0; i < pts.length - 1; i++) {
    const x0=pts[i].x, y0=pts[i].y, x1=pts[i+1].x, y1=pts[i+1].y;
    const steps = Math.ceil(Math.hypot(x1-x0, y1-y0) * 2) + 1;
    for (let s = 0; s <= steps; s++) {
      const t  = s / steps;
      const cx = x0 + (x1-x0)*t, cy = y0 + (y1-y0)*t;
      for (let dx = -width; dx <= width; dx++)
        for (let dy = -width; dy <= width; dy++)
          if (dx*dx + dy*dy <= w2)
            cache.set(`${Math.round(cx+dx)},${Math.round(cy+dy)}`, terrain);
    }
  }
}

function makeBlueprintColliders(id, lat, lon, blueprint, scale, mPerTile) {
  const colliders = [];
  for (let i = 0; i < blueprint.length; i++) {
    const p = blueprint[i];
    const localX = (p.x + p.w * 0.5) * scale / VU;
    const localZ = (p.z + p.d * 0.5) * scale / VU;
    const halfW  = (p.w * 0.5) * scale / VU;
    const halfD  = (p.d * 0.5) * scale / VU;
    const groundY = p.y * scale / VU;
    if (halfW < 0.3 || halfD < 0.3) continue;
    if (groundY > 4 && halfW < 1 && halfD < 1) continue;
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
  const dLat = -(dTileZ * mPerTile) / mLat;
  const dLon =  (dTileX * mPerTile) / mLon;
  return { dLat, dLon };
}

// ─── Blueprint scaling helpers ─────────────────────────────────────────────────

function blueprintNativeBounds(blueprint) {
  let maxY = 0, halfXZ = 0;
  for (const p of blueprint) {
    maxY   = Math.max(maxY, p.y + p.h);
    halfXZ = Math.max(halfXZ, Math.abs(p.x + p.w * 0.5), Math.abs(p.z + p.d * 0.5));
  }
  return { maxY, halfExtentXZ: halfXZ };
}

function computeWaySpanM(geometry) {
  if (!geometry || geometry.length < 2) return 0;
  const a = geometry[0];
  const b = geometry[geometry.length - 1];
  const dLat = (b.lat - a.lat) * 111320;
  const dLon = (b.lon - a.lon) * 111320 * Math.cos(a.lat * Math.PI / 180);
  return Math.hypot(dLat, dLon);
}

function computeLandmarkScale(blueprint, osmHeightM, osmAreaM2, mPerTile, osmSpanM = 0) {
  const { maxY, halfExtentXZ } = blueprintNativeBounds(blueprint);

  // Linear landmarks (bridges): scale by tip-to-tip span — highest priority
  if (osmSpanM > 0 && halfExtentXZ > 0) {
    const nativeTileSpan = (halfExtentXZ * 2) / VU;
    const targetTileSpan = osmSpanM / mPerTile;
    return targetTileSpan / nativeTileSpan;
  }
  // Both height and area known — use diagonal for best fit
  if (osmHeightM > 0 && osmAreaM2 > 0 && maxY > 0 && halfExtentXZ > 0) {
    const targetDiag = Math.hypot(osmHeightM, Math.sqrt(osmAreaM2));
    const nativeDiag = Math.hypot(maxY, halfExtentXZ * 2);
    return targetDiag / nativeDiag;
  }
  // Height only
  if (osmHeightM > 0 && maxY > 0) {
    const nativeTileH = maxY / VU;
    const targetTileH = osmHeightM / mPerTile;
    return targetTileH / nativeTileH;
  }
  // Area only
  if (osmAreaM2 > 0 && halfExtentXZ > 0) {
    const nativeTileR = halfExtentXZ / VU;
    const targetTileR = Math.sqrt(osmAreaM2) / mPerTile / 2;
    return targetTileR / nativeTileR;
  }
  return 1;
}

// ─── EntityDef factories ────────────────────────────────────────────────────────

function makeBuildingDef(b, lat, lon, mPerTile, terrainRegistry, decorateBuildingFacade) {
  const halfSideM     = Math.sqrt(Math.max(16, b.areaM2));
  const halfSideTiles = halfSideM / mPerTile / 2;
  const colorSet      = terrainRegistry.colors[TerrainType.BUILDING];
  const rVox          = halfSideTiles * VU;
  const hVox          = (b.heightM / mPerTile) * VU;
  const facadeSeed    = Math.abs(Math.round(lat * 31 + lon * 17)) % 1000;

  return {
    id:             `building_${b.id || Math.random()}`,
    latitude:       lat,
    longitude:      lon,
    solid:          true,
    bboxRadius:     halfSideTiles,
    physicsEnabled: true,
    physicsRadius:  halfSideTiles,
    fixed:          true,
    renderHeavy:    false,
    _isBuildingBox: true,
    _lodColor:      '#78909C',
    _areaM2:        b.areaM2,
    _heightM:       b.heightM,

    renderFn(wr, groundElevPx, extra, entity) {
      const elev  = groundElevPx + entity.elevOffset;
      // FIX B: sort by front corner of bounding box
      const depth = frontDepth(entity.tx, entity.ty, wr.cam.rotation, rVox / VU);

      wr.submitShadow({ p: { x: entity.tx, y: entity.ty }, elev, r: rVox, engineH: hVox });

      wr.submitWorldObject(depth, () => {
        wr.beginTile(entity.tx, entity.ty, elev);
        wr.box(
          -rVox, 0, -rVox, rVox * 2, hVox, rVox * 2,
          colorSet?.top   || '#b0a090',
          colorSet?.right || '#8a7a6a',
          colorSet?.left  || '#6a5a4a',
        );
        if (decorateBuildingFacade) {
          const entry = {
            p: { x: entity.tx, y: entity.ty },
            r: rVox, engineH: hVox, elev,
            tc: colorSet ?? { top: '#b0a090' },
          };
          decorateBuildingFacade(wr.ctx, wr.cam, entry, wr._voxel, facadeSeed);
        }
      });
    },
  };
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
    const bearing = (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
    return Math.round(bearing / 45) * 45;
  }
  return 180;
}

// ─── Landmark name resolver — restore from doc 1 ──────────────────────────────
function resolveLandmarkKey(tags) {
  if (!tags) return null;
  const candidates = [
    tags['name:en'],
    tags['int_name'],
    tags['alt_name:en'],
    tags['old_name'],
    tags['name'],
  ];
  for (const c of candidates) {
    if (!c || typeof c !== 'string') continue;
    const key = c.toLowerCase().replace(/[\s\-']+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (Blueprints[key]) return { key, name: c };
  }
  return null;
}

/**
 * Blueprint entity factory.
 *
 * FIX A: renderFn submits a shadow hull using blueprint bounding box dims.
 *         _shadowR and _shadowH are computed once at definition time in
 *         closure so renderFn pays zero cost per frame.
 *
 * FIX B: depth sort uses frontDepth() — the front corner of the bounding
 *         box — instead of the centre, fixing pop-through at diagonal angles.
 */
function makeBlueprintDef(id, lat, lon, bpKey, opts = {}) {
  const scale       = opts.scale       ?? 1;
  const facingAngle = opts.facingAngle ?? 180;

  // Pre-compute shadow hull dimensions at definition time (closure)
  const _bp0 = Blueprints[bpKey];
  let _shadowR = 0;  // voxel units
  let _shadowH = 0;  // voxel units
  if (_bp0) {
    const { maxY, halfExtentXZ } = blueprintNativeBounds(_bp0);
    _shadowR = halfExtentXZ * scale;
    _shadowH = maxY         * scale;
  }

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
    _lodColor:       opts.lodColor ?? '#2E7D32',
    altitudeM:       opts.altitudeM       ?? 0,
    visualAlt:       opts.visualAlt       ?? 0,
    showAltitudeLine:opts.showAltitudeLine ?? false,
    _bpKey:          bpKey,
    _scale:          scale,
    _facingAngle:    facingAngle,

    renderFn(wr, groundElevPx, extra, entity) {
      const blueprint = Blueprints[bpKey] ?? Blueprints['tree'];
      if (!blueprint || wr.cam.tilt < 0.04) return;

      const s     = entity._scale       ?? 1;
      const angle = entity._facingAngle ?? 180;
      const isoA  = Math.min(1, (wr.cam.tilt - 0.04) / 0.12);
      const elev  = groundElevPx + entity.elevOffset;

      // FIX B: front-corner depth for correct sort at diagonal rotations
      const footR = entity.footprintRadius ?? entity.bboxRadius ?? 0.35;
      const depth = frontDepth(entity.tx, entity.ty, wr.cam.rotation, footR);

      // FIX A: shadow from blueprint bounding box
      // If entity._scale differs from closure scale (cache restore), rescale.
      const scaleRatio = (scale > 0) ? s / scale : 1;
      const shadowR = _shadowR * scaleRatio;
      const shadowH = _shadowH * scaleRatio;
      if (shadowR > 0 && shadowH > 0) {
        wr.submitShadow({
          p:       { x: entity.tx, y: entity.ty },
          elev,
          r:       shadowR,   // voxel units (same convention as building rVox)
          engineH: shadowH,
        });
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

/** Standard 2D icon POI feature */
function makeFeatureDef(f) {
  let blueprint    = null;
  let blueprintKey = null;
  const candidates = [f.title, f.label, f.category];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string') {
      const key = candidate.toLowerCase().replace(/\s+/g, '_');
      if (Blueprints[key]) {
        blueprintKey = key;
        blueprint    = Blueprints[key];
        break;
      }
    }
  }

  const color = f.color ?? '#60a5fa';
  const label = f.label ?? f.title ?? '';

  if (!blueprintKey && (f.title || f.label || f.category)) {
    console.warn(`[OSMTerrainLoader] Missing blueprint for: ${f.title}, ${label}, ${f.category}`);
  }

  return {
    id:        f.id,
    latitude:  f.latitude,
    longitude: f.longitude,
    solid:     false,
    bboxRadius: 0.35,
    physicsEnabled: false,
    fixed:     true,
    renderHeavy: false,
    type: f.category,
    label, color,
    category: f.category,
    value:    f.value,
    title:    f.title,

    renderFn(wr, groundElevPx, extra, entity) {
      const { cam } = wr;
      if (cam.tilt < 0.02) return;
      const elev  = groundElevPx + (entity.elevOffset ?? 0);
      // POIs are point-sized, centre depth is correct for them
      const depth = tileDepth(entity.tx, entity.ty, cam.rotation, 0.35);
      const hw    = tileHalfWidth(cam.zoom, cam.tileW);
      const r     = Math.max(3, hw * 0.7);
      const isoA  = Math.min(1, (cam.tilt - 0.04) / 0.12);

      wr.submitWorldObject(depth, () => {
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
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        if (extra.selectedId === entity.id) {
          ctx.beginPath();
          ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
          ctx.strokeStyle = color + 'aa';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        if (hw > 12 && label && cam.tilt > 0.1) {
          wr.drawLabel(x, y - r * 2.2, label);
        }
      });
    },
  };
}

// ─── OSM tree species → blueprint key ─────────────────────────────────────────

const TREE_BLUEPRINT_KEY = {
  conifer:   'tree_pine',
  palm:      'tree_palm',
  forest:    'forest',
  park:      'park',
  deciduous: 'tree_oak',
  default:   'tree_oak',
};

function treeSpeciesFromTags(tags = {}) {
  const genus    = (tags.genus       ?? '').toLowerCase();
  const leafType = (tags['leaf_type'] ?? '').toLowerCase();
  if (genus.includes('pinus') || genus.includes('picea') || leafType === 'needleleaved') return 'conifer';
  if (genus.includes('palm')  || genus.includes('phoenix'))                              return 'palm';
  if (genus.includes('quercus') || genus.includes('fagus') || leafType === 'broadleaved') return 'deciduous';
  return 'deciduous';
}

function hash(n) {
  const x = Math.sin(n + 1) * 43758.5453;
  return x - Math.floor(x);
}

function drawFacadeWindows(ctx, faceQuad, rows, cols, color, seed) {
  const lerp  = (a, b, t) => a + (b - a) * t;
  const lerpP = (p1, p2, t) => ({ x: lerp(p1.x, p2.x, t), y: lerp(p1.y, p2.y, t) });
  const litColor  = '#fffcd0bb';
  const darkColor = '#1a2a3a99';

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
      ctx.fillStyle = isDark ? darkColor : (isLit ? litColor : color + 'bb');
      ctx.fill();
    }
  }
  ctx.restore();
}

export function decorateBuildingFacade(ctx, cam, buildingEntry, vr, seed = 0) {
  const { p, r, engineH, tc } = buildingEntry;
  const VU = 8;

  const hw = tileHalfWidth(cam.zoom, cam.tileW);
  if (hw < 6 || cam.tilt < 0.1) return;
  if (!p || typeof p.x !== 'number' || !tc || !vr?.proj) return;

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
  else if (snap === 1) { faceA = [vp(x,0,z+d),   vp(x+w,0,z+d), vp(x+w,h,z+d), vp(x,h,z+d)]; faceB = [vp(x,0,z),     vp(x,h,z),     vp(x,h,z+d),   vp(x,0,z+d)]; }
  else if (snap === 2) { faceA = [vp(x,0,z),     vp(x,h,z),     vp(x,h,z+d),   vp(x,0,z+d)]; faceB = [vp(x,0,z),     vp(x+w,0,z),   vp(x+w,h,z),   vp(x,h,z)]; }
  else                 { faceA = [vp(x,0,z),     vp(x+w,0,z),   vp(x+w,h,z),   vp(x,h,z)]; faceB = [vp(x+w,0,z),   vp(x+w,h,z),   vp(x+w,h,z+d), vp(x+w,0,z+d)]; }

  const isValid = f => f.length === 4 && f.every(p => p && typeof p.x === 'number');
  if (!isValid(faceA) || !isValid(faceB)) return;

  const floors   = Math.max(1, Math.round((engineH / VU) * 0.7));
  const colsA    = Math.max(2, Math.round(r / VU * 3));
  const colsB    = Math.max(1, Math.round(r / VU * 2));
  const winAlpha = Math.min(1, (hw - 6) / 14) * Math.min(1, cam.tilt * 4);

  if (winAlpha > 0.05) {
    ctx.globalAlpha = winAlpha;
    drawFacadeWindows(ctx, faceA, floors, colsA, '#c8e8ff', seed);
    drawFacadeWindows(ctx, faceB, floors, colsB, '#c8e8ff', seed + 100);
    ctx.globalAlpha = 1;
  }

  if (hw > 10) {
    const pts = [vp(x,h,z), vp(x+w,h,z), vp(x+w,h,z+d), vp(x,h,z+d)];
    if (pts.some(p => !p)) return;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle   = shadeHex(tc.top, 0.85) + '88'; ctx.fill();
  }
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export class OSMTerrainLoader extends BaseLoader {
  get id() { return 'osm-terrain'; }

  constructor(options = {}) {
    super(options);
    this._endpoints    = options.endpoint
      ? [options.endpoint]
      : (options.endpoints || DEFAULT_ENDPOINTS);
    this._endpointIdx  = 0;
    this._mPerTile     = options.mPerTile     || 2;
    this._mapW         = options.mapW         || 80;
    this._mapH         = options.mapH         || 80;
    this._fetchRadiusM = options.fetchRadiusM ?? 900;
    this._backoffUntil = 0;
    this._abort        = null;
    this._cache        = new PersistentCache('GOE_Overpass', 'osm_terrain');
    this._fetchDebounceMs = options.fetchDebounceMs ?? 800;
    this._debounceTimer   = null;
    this._pendingResolve  = null;
    this._decorateBuildingFacade = options.decorateBuildingFacade ?? null;
    this._terrainRegistry        = options.terrainRegistry        ?? null;
  }

  init(engine) {
    this._terrainRegistry = engine.terrainRegistry;
  }

  get _endpoint() { return this._endpoints[this._endpointIdx % this._endpoints.length]; }
  _nextEndpoint()  { this._endpointIdx = (this._endpointIdx + 1) % this._endpoints.length; }

  _getCacheKey({ lat, lon }) {
    return `${lat.toFixed(2)},${lon.toFixed(2)}`;
  }

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

    const cacheKey = this._getCacheKey(geoCenter);
    try {
      const cached = await this._cache.get(cacheKey);
      const age    = Date.now() - (cached?.timestamp ?? 0);
      if (cached?.terrainUpdates && age < CACHE_TTL_MS) {
        console.log(`[OSMTerrainLoader] Cache hit — rebuilding ${cached.entities?.length ?? 0} entities`);
        const liveEntities = (cached.entities ?? []).map(e => {
          if (e._type === 'building') {
            return makeBuildingDef(
              { id: e.id, areaM2: e.areaM2 ?? 16, heightM: e.heightM ?? 8 },
              e.latitude, e.longitude,
              this._mPerTile, this._terrainRegistry, decorateBuildingFacade
            );
          }
          if (e.bpKey) {
            return makeBlueprintDef(e.id, e.latitude, e.longitude, e.bpKey, {
              ...e,
              scale:       e._scale       ?? 1,
              facingAngle: e._facingAngle ?? 180,
            });
          }
          return makeFeatureDef(e);
        });
        return {
          terrainUpdates: new Map(Object.entries(cached.terrainUpdates)),
          entities: liveEntities,
        };
      }
    } catch (err) { console.warn('[OSMTerrainLoader] Cache read error', err); }

    const { lat, lon } = geoCenter;
    const r = this._fetchRadiusM;
    const around = `(around:${r},${lat},${lon})`;

    const q = `[out:json][timeout:60];(
      way["natural"~"^(water|wetland|beach|wood|grassland|heath|scrub)$"]${around};
      way["landuse"~"^(reservoir|basin|grass|meadow|village_green|allotments|forest|park|commercial|residential|retail|industrial)$"]${around};
      way["leisure"~"^(park|garden|pitch|playground)$"]${around};
      way["waterway"~"^(river|stream|canal|drain|ditch|riverbank)$"]${around};
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|pedestrian|footway|cycleway|path|track)$"]${around};
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
      const timeout = setTimeout(() => ctrl.abort(), 12000);

      try {
        const res = await fetch(
          `${this._endpoint}?data=${encodeURIComponent(q)}`,
          { signal: ctrl.signal }
        );
        clearTimeout(timeout);
        if (res.status === 429) { this._nextEndpoint(); continue; }
        if (!res.ok)             { this._nextEndpoint(); continue; }

        const data = await res.json();
        console.log(`[OSMTerrainLoader] ${data.elements?.length ?? 0} elements from ${this._endpoint}`);

        const terrainUpdates        = new Map();
        const entityDefs            = [];
        const renderedLandmarkNames = new Set();

        const toTile = (eLat, eLon) => ({
          x: lonToGlobalX(eLon, geoCenter.lat, this._mPerTile),
          y: latToGlobalY(eLat, this._mPerTile),
        });

        const mLat = 111320;
        const mLon = 111320 * Math.cos(lat * Math.PI / 180);
        const rLat = r / mLat, rLon = r / mLon;
        const minGX = lonToGlobalX(lon - rLon, lat, this._mPerTile) - 2;
        const maxGX = lonToGlobalX(lon + rLon, lat, this._mPerTile) + 2;
        const minGY = latToGlobalY(lat + rLat, this._mPerTile) - 2;
        const maxGY = latToGlobalY(lat - rLat, this._mPerTile) + 2;

        const buildingWays = [];

        // ── Separate elements by type for ordered processing ──────────────────
        const wayElements  = [];
        const nodeElements = [];
        for (const el of data.elements) {
          if (el.type === 'way')  wayElements.push(el);
          if (el.type === 'node') nodeElements.push(el);
        }

        // ── Pass 1: Bridge landmark ways (span-aware — MUST run before nodes) ─
        // The Golden Gate Bridge (and similar) is split across many OSM way
        // segments inside a relation. A single way only covers one segment so
        // computeWaySpanM on it returns ~0. Fix: group all way segments that
        // share the same resolved landmark key, merge their geometry, then
        // compute the true tip-to-tip span across the full merged point set.

        // Step A — collect all bridge way segments keyed by landmark name
        const bridgeSegmentsByKey = new Map(); // nameKey → { match, segments: el[] }

        for (const el of wayElements) {
          if (!el.geometry?.length) continue;
          if (!(el.tags?.bridge === 'yes' || el.tags?.man_made === 'bridge')) continue;
          const match = resolveLandmarkKey(el.tags);
          if (!match) continue;

          // Always rasterize road/path terrain under the bridge
          const cls = classifyOSM(el.tags);
          if (cls) {
            const pts = el.geometry.map(g => toTile(g.lat, g.lon));
            rasterizeLine(terrainUpdates, pts, cls.terrain, cls.width ?? 2);
          }

          const { key: nameKey } = match;
          if (!bridgeSegmentsByKey.has(nameKey)) {
            bridgeSegmentsByKey.set(nameKey, { match, els: [] });
          }
          bridgeSegmentsByKey.get(nameKey).els.push(el);
        }

        // Step B — for each landmark, merge all segments and compute true span
        for (const [nameKey, { match, els }] of bridgeSegmentsByKey) {
          if (renderedLandmarkNames.has(nameKey)) continue;
          const blueprint = Blueprints[nameKey];
          if (!blueprint) continue;

          const { name } = match;

          // Merge all geometry points from all segments
          const allGeom = els.flatMap(el => el.geometry ?? []);

          // Centroid across all points
          let cLat = 0, cLon = 0;
          for (const g of allGeom) { cLat += g.lat; cLon += g.lon; }
          if (allGeom.length) { cLat /= allGeom.length; cLon /= allGeom.length; }

          // True tip-to-tip span: project all points onto the principal axis
          // (bearing from first to last point of the first/longest segment),
          // then take max - min projected distance.
          const refEl  = els.reduce((a, b) =>
            (b.geometry?.length ?? 0) > (a.geometry?.length ?? 0) ? b : a
          );
          const refGeom = refEl.geometry ?? [];
          let osmSpanM = 0;

          if (allGeom.length >= 2 && refGeom.length >= 2) {
            const a0 = refGeom[0];
            const a1 = refGeom[refGeom.length - 1];
            const dLat = (a1.lat - a0.lat) * 111320;
            const dLon = (a1.lon - a0.lon) * 111320 * Math.cos(a0.lat * Math.PI / 180);
            const axisLen = Math.hypot(dLat, dLon);
            if (axisLen > 0) {
              const axLat = dLat / axisLen;
              const axLon = dLon / axisLen;
              let minP = Infinity, maxP = -Infinity;
              for (const g of allGeom) {
                const gLat = (g.lat - a0.lat) * 111320;
                const gLon = (g.lon - a0.lon) * 111320 * Math.cos(a0.lat * Math.PI / 180);
                const proj = gLat * axLat + gLon * axLon;
                if (proj < minP) minP = proj;
                if (proj > maxP) maxP = proj;
              }
              osmSpanM = maxP - minP;
            }
          }

          // Fallback: bounding-box diagonal if axis projection gave nothing
          if (osmSpanM <= 0 && allGeom.length >= 2) {
            let minLat = Infinity, maxLat = -Infinity;
            let minLon = Infinity, maxLon = -Infinity;
            for (const g of allGeom) {
              if (g.lat < minLat) minLat = g.lat;
              if (g.lat > maxLat) maxLat = g.lat;
              if (g.lon < minLon) minLon = g.lon;
              if (g.lon > maxLon) maxLon = g.lon;
            }
            const spanLat = (maxLat - minLat) * 111320;
            const spanLon = (maxLon - minLon) * 111320 * Math.cos(cLat * Math.PI / 180);
            osmSpanM = Math.max(spanLat, spanLon);
          }

          const firstEl    = els[0];
          const osmHeightM = parseFloat(firstEl.tags?.height ?? firstEl.tags?.['max_height'] ?? 0) || 0;
          const scale      = computeLandmarkScale(blueprint, osmHeightM, 0, this._mPerTile, osmSpanM);

          const { halfExtentXZ } = blueprintNativeBounds(blueprint);
          const scaledR     = Math.max(2, (halfExtentXZ / VU) * scale);
          const facingAngle = extractFacingAngle(firstEl.tags, refGeom);

          console.log(
            `[OSMTerrainLoader] Bridge landmark "${name}" — ` +
            `${els.length} segments, span=${osmSpanM.toFixed(0)}m h=${osmHeightM}m → ` +
            `scale=${scale.toFixed(2)}x (r=${scaledR.toFixed(1)} tiles)`
          );

          renderedLandmarkNames.add(nameKey);
          entityDefs.push(makeBlueprintDef(
            `landmark:bridge:${els[0].id}`, cLat, cLon, nameKey,
            {
              scale, facingAngle,
              solid: true, bboxRadius: scaledR, footprintRadius: scaledR,
              physicsEnabled: true, physicsRadius: scaledR,
              fixed: true, lodColor: '#A1887F',
            }
          ));

          const colliders = makeBlueprintColliders(
            `landmark:bridge:${els[0].id}`, cLat, cLon, blueprint, scale, this._mPerTile
          );
          for (const col of colliders) {
            const { dLat, dLon } = tileOffsetToGeo(
              col._localOffsetX, col._localOffsetZ, cLat, this._mPerTile
            );
            col.latitude  = cLat + dLat;
            col.longitude = cLon + dLon;
            entityDefs.push(col);
          }
        }

        // ── Pass 2: All other ways (terrain + buildings + cars) ───────────────
        for (const el of wayElements) {
          if (!el.geometry?.length) continue;

          // Skip bridge landmark ways — fully handled in pass 1
          if (el.tags?.bridge === 'yes' || el.tags?.man_made === 'bridge') {
            if (resolveLandmarkKey(el.tags)) continue;
          }

          const cls = classifyOSM(el.tags);
          if (!cls) continue;

          const pts = el.geometry.map(g => toTile(g.lat, g.lon));
          if (cls.type === 'polygon') rasterizePolygon(terrainUpdates, pts, cls.terrain);
          else                        rasterizeLine(terrainUpdates, pts, cls.terrain, cls.width);

          if (el.tags?.building) buildingWays.push(el);

          if (el.tags?.highway &&
              ['primary','secondary','tertiary','residential'].includes(el.tags.highway) &&
              Math.random() > 0.6) {
            entityDefs.push({
              id: `car:${el.id}`,
              latitude:  el.geometry[0].lat,
              longitude: el.geometry[0].lon,
              solid: false, bboxRadius: 0.35,
              physicsEnabled: false, fixed: true, renderHeavy: true,
              _lodColor: '#607D8B',
              title: 'car', label: 'car', category: 'car',
              renderFn(wr, groundElevPx, extra, entity) {
                const blueprint = Blueprints['car'];
                if (!blueprint || wr.cam.tilt < 0.04) return;
                const isoA  = Math.min(1, (wr.cam.tilt - 0.04) / 0.12);
                const elev  = groundElevPx + entity.elevOffset;
                const depth = frontDepth(entity.tx, entity.ty, wr.cam.rotation, 0.35);
                wr.submitWorldObject(depth, () => {
                  wr.ctx.globalAlpha = isoA;
                  wr.drawBlueprint(blueprint, entity.tx, entity.ty, elev);
                  wr.ctx.globalAlpha = 1;
                });
              },
            });
          }
        }

        // ── Pass 3: Nodes (trees, POIs, landmark nodes) ───────────────────────
        for (const el of nodeElements) {
          const { x: gx, y: gy } = toTile(el.lat, el.lon);
          if (gx < minGX || gx > maxGX || gy < minGY || gy > maxGY) continue;

          if (el.tags?.natural === 'tree') {
            const species = treeSpeciesFromTags(el.tags);
            const bpKey   = TREE_BLUEPRINT_KEY[species] ?? 'tree_oak';
            entityDefs.push(makeBlueprintDef(
              `tree:${el.id}`, el.lat, el.lon, bpKey,
              {
                solid: true, bboxRadius: 0.5, footprintRadius: 1.2,
                physicsEnabled: true, physicsRadius: 0.5,
                lodColor: '#2E7D32', facingAngle: 180,
              }
            ));
            continue;
          }

          const poi = classifyPOI(el.tags);
          if (!poi) continue;

          const landmarkMatch = resolveLandmarkKey(el.tags);
          if (landmarkMatch) {
            const { key: nameKey, name } = landmarkMatch;
            // If a bridge way already claimed this name (e.g. Golden Gate Bridge),
            // skip — the span-scaled version is already in entityDefs.
            if (!renderedLandmarkNames.has(nameKey)) {
              renderedLandmarkNames.add(nameKey);
              const blueprint  = Blueprints[nameKey];
              const osmHeightM = parseFloat(el.tags?.height ?? el.tags?.['building:height'] ?? 0) || 0;
              const scale      = computeLandmarkScale(blueprint, osmHeightM, 0, this._mPerTile);
              const { halfExtentXZ } = blueprintNativeBounds(blueprint);
              const scaledR     = Math.max(2, (halfExtentXZ / VU) * scale);
              const facingAngle = extractFacingAngle(el.tags);

              console.log(`[OSMTerrainLoader] Landmark node "${name}" — h=${osmHeightM}m → scale=${scale.toFixed(2)}x (r=${scaledR.toFixed(1)} tiles)`);

              entityDefs.push(makeBlueprintDef(
                `landmark:node:${el.id}`, el.lat, el.lon, nameKey,
                {
                  scale, facingAngle,
                  solid: true, bboxRadius: scaledR, footprintRadius: scaledR,
                  physicsEnabled: true, physicsRadius: scaledR,
                  fixed: true, lodColor: '#A1887F',
                }
              ));
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

        // ── Pass 4: Buildings ─────────────────────────────────────────────────
        if (buildingWays.length && this._terrainRegistry) {
          const buildings = preprocessBuildings(buildingWays);

          for (const b of buildings) {
            const match     = resolveLandmarkKey(b.tags);
            const nameKey   = match?.key  ?? '';
            const name      = match?.name ?? '';
            const blueprint = match ? Blueprints[nameKey] : null;

            if (blueprint) {
              const osmHeightM = parseFloat(b.tags?.height ?? b.tags?.['building:height'] ?? 0) || 0;
              const osmAreaM2  = b.areaM2 ?? 0;
              const scale      = computeLandmarkScale(blueprint, osmHeightM, osmAreaM2, this._mPerTile);
              const { halfExtentXZ } = blueprintNativeBounds(blueprint);
              const scaledR    = Math.max(2, (halfExtentXZ / VU) * scale);

              console.log(
                `[OSMTerrainLoader] Landmark bldg "${name}" — ` +
                `h=${osmHeightM}m area=${osmAreaM2.toFixed(0)}m² → ` +
                `scale=${scale.toFixed(2)}x (r=${scaledR.toFixed(1)} tiles)`
              );

              const facingAngle = extractFacingAngle(b.tags, b.geometry);
              const landmarkDef = makeBlueprintDef(
                `landmark:${b.id}`, b.centroid.lat, b.centroid.lon, nameKey,
                {
                  scale, facingAngle,
                  solid: true, bboxRadius: scaledR, footprintRadius: scaledR,
                  physicsEnabled: true, physicsRadius: scaledR,
                  fixed: true, lodColor: '#A1887F',
                }
              );

              if (!renderedLandmarkNames.has(nameKey)) {
                renderedLandmarkNames.add(nameKey);
                entityDefs.push(landmarkDef);
                const colliders = makeBlueprintColliders(
                  `landmark:${b.id}`, b.centroid.lat, b.centroid.lon,
                  blueprint, scale, this._mPerTile
                );
                for (const col of colliders) {
                  const { dLat, dLon } = tileOffsetToGeo(
                    col._localOffsetX, col._localOffsetZ,
                    b.centroid.lat, this._mPerTile
                  );
                  col.latitude  = b.centroid.lat + dLat;
                  col.longitude = b.centroid.lon + dLon;
                  entityDefs.push(col);
                }
              } else {
                // A node entry exists for this landmark — upgrade it to the
                // building-derived def which has area data for better scaling.
                const existingIdx = entityDefs.findIndex(
                  e => e._bpKey === nameKey && e.id.startsWith('landmark:node:')
                );
                if (existingIdx !== -1) entityDefs[existingIdx] = landmarkDef;
              }
            } else {
              entityDefs.push(
                makeBuildingDef(b, b.centroid.lat, b.centroid.lon,
                  this._mPerTile, this._terrainRegistry, decorateBuildingFacade)
              );
            }
          }
        }

        console.log(`[OSMTerrainLoader] → ${terrainUpdates.size} terrain tiles, ${entityDefs.length} entities`);

        try {
          await this._cache.set(cacheKey, {
            terrainUpdates: Object.fromEntries(terrainUpdates),
            entities: entityDefs.map(e => ({
              id:           e.id,
              latitude:     e.latitude,
              longitude:    e.longitude,
              solid:        e.solid,
              bboxRadius:   e.bboxRadius,
              _type:        e._isBuildingBox ? 'building' : (e.renderHeavy && e._bpKey ? 'blueprint' : 'poi'),
              areaM2:       e._areaM2        ?? null,
              heightM:      e._heightM       ?? null,
              bpKey:        e._bpKey         ?? null,
              _scale:       e._scale         ?? null,
              _facingAngle: e._facingAngle   ?? null,
              label:        e.label,
              color:        e.color,
              category:     e.category,
              value:        e.value,
              title:        e.title,
            })),
            timestamp: Date.now(),
          });
        } catch (cacheErr) {
          console.warn('[OSMTerrainLoader] Cache write error (continuing)', cacheErr);
        }

        return { terrainUpdates, entities: entityDefs };

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
  

  destroy() {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
      this._pendingResolve?.({});
      this._pendingResolve = null;
    }
    this._abort?.abort();
  }

  async clearCache() { await this._cache.clear(); }
}