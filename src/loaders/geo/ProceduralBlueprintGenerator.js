/**
 * GOE — ProceduralBlueprintGenerator
 *
 * Generates to-scale voxel blueprints from OSM building footprint data.
 *
 * Key features:
 *   A. Footprint → voxel columns  — the OSM polygon ring is rasterised into a
 *      grid of 1×1 VU cells. Each occupied cell becomes a column of boxes
 *      (ground→roof height). This produces a faithful extruded footprint in
 *      blueprint space rather than a single approximating cuboid.
 *
 *   B. Wall-face detection  — after rasterisation, exposed (boundary) cells are
 *      identified for each cardinal face direction. Window and door voxels are
 *      injected onto those faces so decorations align with the actual walls.
 *
 *   C. Architectural decoration pass  — windows, doors, cornices, base bands,
 *      and roof features are generated from the building's metadata:
 *        • height → number of window rows
 *        • buildingType (residential/commercial/industrial/historic) → palette,
 *          window shape, cornice style
 *        • landuse / amenity tags → accent colours and roof treatment
 *
 *   D. Deterministic palettes  — a seeded hash of the building's OSM id drives
 *      minor colour variation so adjacent buildings don't look identical but
 *      the same building always renders the same.
 *
 *   E. Cache key  — SHA-256-lite hash of (footprintRing, heightM, buildingType)
 *      so cached blueprints are invalidated when any of those change.
 *
 * Coordinate fixes applied (vs previous version):
 *
 *   FIX 1 — Blueprint box scale: removed the MAX_TILES clamp that was shrinking
 *     large buildings to 16-tile width. scale is now always 1; boxes are already
 *     in correct VU units via (cells / RASTER_SCALE * VU).
 *
 *   FIX 2 — Shadow radius: halfA is in tiles; multiplying by VU produced an 8×
 *     over-sized shadow halo. Now clamped against the actual footprint area so
 *     the shadow ellipse matches the building base.
 *
 *   FIX 3 — renderFn projection: replaced the broken lonToGlobalX/latToGlobalY
 *     reprojection (which double-applied the origin offset) with a simple
 *     centroid-relative tile-delta calculation. Each ring node is now positioned
 *     as (entity.tx + dTileX, entity.ty + dTileY) where dTile is the geographic
 *     offset from the building centroid, keeping walls in the right place for
 *     any building anywhere on the map.
 */

import { PersistentCache }       from '../../core/PersistentCache.js';
import { lonToGlobalX, latToGlobalY } from '../../math/geo.js';
import {
  tileHalfWidth, worldToScreen, frontDepth, shadeHex,
} from '../../math/projection.js';
import { TerrainType }           from '../../terrain/types.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const VU = 8;   // voxel units per tile (matches engine convention)

// Blueprint grid resolution: 1 VU cell per grid step.
// A 20-m-wide building at 2 m/tile = 10 tiles = 80 VU cells wide.
// We cap the grid at MAX_CELLS per axis to avoid huge allocations.
const MAX_CELLS     = 128;
const GRID_STEP_VU  = 1;     // 1 VU = 0.25 m at 2 m/tile

// Minimum wall thickness in VU for structural boxes
const WALL_VU       = 1;

// ─── Building type classification ─────────────────────────────────────────────
const BUILDING_TYPE = {
  residential:   'residential',
  apartments:    'residential',
  house:         'residential',
  detached:      'residential',
  semidetached_house: 'residential',
  terrace:       'residential',
  dormitory:     'residential',
  bungalow:      'residential',
  commercial:    'commercial',
  office:        'commercial',
  retail:        'commercial',
  shop:          'commercial',
  supermarket:   'commercial',
  hotel:         'commercial',
  industrial:    'industrial',
  warehouse:     'industrial',
  factory:       'industrial',
  storage_tank:  'industrial',
  civic:         'civic',
  public:        'civic',
  government:    'civic',
  school:        'civic',
  university:    'civic',
  hospital:      'civic',
  church:        'historic',
  cathedral:     'historic',
  chapel:        'historic',
  monastery:     'historic',
  historic:      'historic',
  castle:        'historic',
  ruins:         'historic',
};

// ─── Palette definitions ──────────────────────────────────────────────────────
const PALETTES = {
  residential: {
    walls: [
      { top: '#C4906A', right: '#A87050', front: '#B88060' },
      { top: '#D4A880', right: '#B48860', front: '#C49870' },
      { top: '#B8907A', right: '#987060', front: '#A88070' },
      { top: '#D0B090', right: '#B09070', front: '#C0A080' },
      { top: '#C89878', right: '#A87858', front: '#B88868' },
    ],
    windowFill:   '#C8DFF0',
    windowFrame:  '#7A6050',
    doorFill:     '#5A3A28',
    doorFrame:    '#8A6040',
    cornice:      '#D8C0A0',
    roofTop:      '#8A7060',
    roofRight:    '#6A5040',
    roofFront:    '#7A6050',
    chimney:      '#987860',
    accentBand:   '#C8B0A0',
  },
  commercial: {
    walls: [
      { top: '#C8CDD8', right: '#A0A8B8', front: '#B0B8C8' },
      { top: '#D0D8E8', right: '#A8B0C0', front: '#B8C0D0' },
      { top: '#C0C8D8', right: '#9898A8', front: '#A8A8B8' },
      { top: '#B8C0D0', right: '#9098A8', front: '#A0A8B8' },
      { top: '#D8DDE8', right: '#B0B5C0', front: '#C0C5D0' },
    ],
    windowFill:   '#B8E0F8',
    windowFrame:  '#6080A0',
    doorFill:     '#304858',
    doorFrame:    '#507090',
    cornice:      '#E0E8F0',
    roofTop:      '#6878A0',
    roofRight:    '#485880',
    roofFront:    '#586890',
    chimney:      '#808898',
    accentBand:   '#8899BB',
  },
  industrial: {
    walls: [
      { top: '#8A9098', right: '#6A7078', front: '#7A8088' },
      { top: '#909898', right: '#707878', front: '#808888' },
      { top: '#788088', right: '#585868', front: '#687078' },
      { top: '#7A8890', right: '#5A6870', front: '#6A7880' },
      { top: '#888888', right: '#686868', front: '#787878' },
    ],
    windowFill:   '#A8B8C0',
    windowFrame:  '#505860',
    doorFill:     '#384048',
    doorFrame:    '#585860',
    cornice:      '#9A9A9A',
    roofTop:      '#6A7070',
    roofRight:    '#4A5050',
    roofFront:    '#5A6060',
    chimney:      '#707878',
    accentBand:   '#6A7080',
  },
  civic: {
    walls: [
      { top: '#E8E0D0', right: '#C8C0B0', front: '#D8D0C0' },
      { top: '#F0E8D8', right: '#D0C8B8', front: '#E0D8C8' },
      { top: '#D8D0C0', right: '#B8B0A0', front: '#C8C0B0' },
      { top: '#E0D8C8', right: '#C0B8A8', front: '#D0C8B8' },
      { top: '#EAE2D2', right: '#CAC2B2', front: '#DAD2C2' },
    ],
    windowFill:   '#D0E8F8',
    windowFrame:  '#8070A0',
    doorFill:     '#4A3858',
    doorFrame:    '#7060A0',
    cornice:      '#F0E8D0',
    roofTop:      '#9080A8',
    roofRight:    '#706090',
    roofFront:    '#807098',
    chimney:      '#9888A0',
    accentBand:   '#A090B8',
  },
  historic: {
    walls: [
      { top: '#D4C8A8', right: '#B4A888', front: '#C4B898' },
      { top: '#C8BC9C', right: '#A89C7C', front: '#B8AC8C' },
      { top: '#DCCCAC', right: '#BCAC8C', front: '#CCBC9C' },
      { top: '#C0B49A', right: '#A09478', front: '#B0A488' },
      { top: '#D8C8A8', right: '#B8A888', front: '#C8B898' },
    ],
    windowFill:   '#C8D8E8',
    windowFrame:  '#806040',
    doorFill:     '#3A2818',
    doorFrame:    '#604030',
    cornice:      '#E0D0B0',
    roofTop:      '#706050',
    roofRight:    '#504030',
    roofFront:    '#605040',
    chimney:      '#807060',
    accentBand:   '#C0A880',
  },
};

// ─── Utility: fast deterministic hash → [0,1) ─────────────────────────────────
function fhash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return (h >>> 0) / 0xffffffff;
}

function fhashN(str, n) {
  return fhash(str + '|' + n);
}

// ─── Footprint rasterisation ──────────────────────────────────────────────────
function rasteriseFootprint(ringVU) {
  const cells = new Set();
  if (ringVU.length < 3) return cells;

  let minY = Infinity, maxY = -Infinity;
  for (const p of ringVU) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  minY = Math.ceil(minY);
  maxY = Math.floor(maxY);

  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    const n = ringVU.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const pi = ringVU[i], pj = ringVU[j];
      if ((pi.y <= y && pj.y > y) || (pj.y <= y && pi.y > y)) {
        xs.push(pi.x + (y - pi.y) / (pj.y - pi.y) * (pj.x - pi.x));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k < xs.length - 1; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) {
        cells.add(`${x},${y}`);
      }
    }
  }
  return cells;
}

function cellsBBox(cells) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

// Convert OSM ring [{lat,lon}] → tile-space coords relative to ring[0].
// Latitude negated so tile-Y increases southward (matching rasteriser).
function ringToTile(nodes, mPerTile) {
  if (!nodes.length) return [];
  const origin = nodes[0];
  const mLon = 111320 * Math.cos(origin.lat * Math.PI / 180);
  const mLat = 111320;
  return nodes.map(n => ({
    x:  ((n.lon - origin.lon) * mLon / mPerTile),
    y: -((n.lat - origin.lat) * mLat / mPerTile),
  }));
}

// ─── Wall-face exposure detection ────────────────────────────────────────────
const DIRS = [
  { dx:  1, dy:  0, face: 'right' },
  { dx: -1, dy:  0, face: 'left'  },
  { dx:  0, dy:  1, face: 'front' },
  { dx:  0, dy: -1, face: 'back'  },
];

function detectExposedFaces(cells) {
  const exposed = new Map();
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number);
    const faces = new Set();
    for (const { dx, dy, face } of DIRS) {
      if (!cells.has(`${x + dx},${y + dy}`)) faces.add(face);
    }
    if (faces.size) exposed.set(key, faces);
  }
  return exposed;
}

// ─── Blueprint box helpers ────────────────────────────────────────────────────
function box(x, y, z, w, h, d, top, right, front) {
  return { x, y, z, w, h, d, top, right, front };
}

// ─── Window/door/cornice/base generation ──────────────────────────────────────
function windowsForWall(wallOriginX, wallOriginZ, wallLenVU, wallYBase, wallYTop, palette, faceDir, seed) {
  const boxes = [];
  const wallH  = wallYTop - wallYBase;
  if (wallLenVU < 3 || wallH < 6) return boxes;

  const cols  = Math.max(1, Math.round(wallLenVU / 5));
  const rows  = Math.max(1, Math.round(wallH / 8));
  const colW  = wallLenVU / cols;
  const rowH  = wallH / rows;
  const winW  = Math.max(1, colW * 0.55);
  const winH  = Math.max(1, rowH * 0.55);
  const winD  = 0.4;
  const zOff  = faceDir === 'front' || faceDir === 'back' ? winD : 0;
  const xOff  = faceDir === 'right' || faceDir === 'left' ? winD : 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit  = fhashN(seed + r * 17 + c * 31, 1) > 0.3;
      const fill = lit ? palette.windowFill : shadeHex(palette.windowFill, 0.45);
      const cx   = wallOriginX + (c + 0.5) * colW;
      const cz   = wallOriginZ;
      const cy   = wallYBase + (r + 0.5) * rowH;

      if (faceDir === 'front' || faceDir === 'back') {
        boxes.push(box(cx - winW/2, cy - winH/2, cz - zOff, winW, winH, winD,
          fill, shadeHex(fill, 0.65), shadeHex(fill, 0.80)));
        boxes.push(box(cx - winW/2 - 0.3, cy - winH/2 - 0.3, cz - zOff - 0.1,
          winW + 0.6, winH + 0.6, winD * 0.4,
          palette.windowFrame, shadeHex(palette.windowFrame, 0.7), shadeHex(palette.windowFrame, 0.8)));
      } else {
        boxes.push(box(cz - xOff, cy - winH/2, cx - winW/2, winD, winH, winW,
          fill, shadeHex(fill, 0.65), shadeHex(fill, 0.80)));
        boxes.push(box(cz - xOff - 0.1, cy - winH/2 - 0.3, cx - winW/2 - 0.3,
          winD * 0.4, winH + 0.6, winW + 0.6,
          palette.windowFrame, shadeHex(palette.windowFrame, 0.7), shadeHex(palette.windowFrame, 0.8)));
      }
    }
  }
  return boxes;
}

function doorForWall(wallOriginX, wallOriginZ, wallLenVU, wallH, palette, faceDir) {
  const dW = Math.min(wallLenVU * 0.25, 3);
  const dH = Math.min(wallH * 0.35, 10);
  const cx = wallOriginX + wallLenVU / 2;
  const cz = wallOriginZ;
  const boxes = [];
  if (faceDir === 'front' || faceDir === 'back') {
    boxes.push(box(cx - dW/2, 0, cz - 0.5, dW, dH, 0.6,
      palette.doorFill, shadeHex(palette.doorFill, 0.7), shadeHex(palette.doorFill, 0.85)));
    boxes.push(box(cx - dW/2 - 0.4, 0, cz - 0.6, dW + 0.8, dH + 0.5, 0.4,
      palette.doorFrame, shadeHex(palette.doorFrame, 0.7), shadeHex(palette.doorFrame, 0.8)));
  }
  return boxes;
}

function corniceForWall(wallOriginX, wallOriginZ, wallLenVU, wallYTop, palette, faceDir) {
  const cH = 1.0, cD = 0.6;
  if (faceDir === 'front' || faceDir === 'back') {
    return [box(wallOriginX - 0.3, wallYTop - cH, wallOriginZ - cD, wallLenVU + 0.6, cH, cD,
      palette.cornice, shadeHex(palette.cornice, 0.75), shadeHex(palette.cornice, 0.85))];
  } else {
    return [box(wallOriginZ - cD, wallYTop - cH, wallOriginX - 0.3, cD, cH, wallLenVU + 0.6,
      palette.cornice, shadeHex(palette.cornice, 0.75), shadeHex(palette.cornice, 0.85))];
  }
}

function baseForWall(wallOriginX, wallOriginZ, wallLenVU, palette, faceDir) {
  const bH = 1.5, bD = 0.4;
  if (faceDir === 'front' || faceDir === 'back') {
    return [box(wallOriginX - 0.2, 0, wallOriginZ - bD, wallLenVU + 0.4, bH, bD,
      palette.accentBand, shadeHex(palette.accentBand, 0.75), shadeHex(palette.accentBand, 0.85))];
  } else {
    return [box(wallOriginZ - bD, 0, wallOriginX - 0.2, bD, bH, wallLenVU + 0.4,
      palette.accentBand, shadeHex(palette.accentBand, 0.75), shadeHex(palette.accentBand, 0.85))];
  }
}

// ─── Roof styles ──────────────────────────────────────────────────────────────
function flatRoof(bbox, heightVU, palette) {
  const { minX, maxX, minY, maxY } = bbox;
  const w = maxX - minX + GRID_STEP_VU;
  const d = maxY - minY + GRID_STEP_VU;
  const parH = 0.8;
  return [
    box(minX, heightVU, minY, w, parH, d,
      palette.roofTop, palette.roofRight, palette.roofFront),
    box(minX + 0.6, heightVU, minY + 0.6, w - 1.2, parH * 0.5, d - 1.2,
      shadeHex(palette.roofTop, 0.6), shadeHex(palette.roofRight, 0.6), shadeHex(palette.roofFront, 0.6)),
  ];
}

function pitchedRoof(bbox, heightVU, palette) {
  const { minX, maxX, minY, maxY } = bbox;
  const w  = maxX - minX + GRID_STEP_VU;
  const d  = maxY - minY + GRID_STEP_VU;
  const rH = Math.max(2, w * 0.2);
  const boxes = [];
  const steps = Math.max(2, Math.floor(rH));
  for (let i = 0; i < steps; i++) {
    const t    = i / steps;
    const inX  = t * (w / 2);
    const inZ  = t * (d / 4);
    boxes.push(box(minX + inX, heightVU + i * rH / steps, minY + inZ,
      w - inX * 2, rH / steps + 0.5, d - inZ * 2,
      shadeHex(palette.roofTop, 0.8 + t * 0.2),
      shadeHex(palette.roofRight, 0.7 + t * 0.2),
      shadeHex(palette.roofFront, 0.75 + t * 0.2)));
  }
  return boxes;
}

function hipRoof(bbox, heightVU, palette) {
  const { minX, maxX, minY, maxY } = bbox;
  const w  = maxX - minX + GRID_STEP_VU;
  const d  = maxY - minY + GRID_STEP_VU;
  const rH = Math.max(2, Math.min(w, d) * 0.22);
  const steps = Math.max(2, Math.floor(rH));
  const boxes = [];
  for (let i = 0; i < steps; i++) {
    const t     = i / steps;
    const inset = t * Math.min(w, d) * 0.45;
    boxes.push(box(minX + inset, heightVU + i * rH / steps, minY + inset,
      w - inset * 2, rH / steps + 0.5, d - inset * 2,
      shadeHex(palette.roofTop, 0.75 + t * 0.25),
      shadeHex(palette.roofRight, 0.65 + t * 0.25),
      shadeHex(palette.roofFront, 0.70 + t * 0.25)));
  }
  return boxes;
}

function mansardRoof(bbox, heightVU, palette) {
  const { minX, maxX, minY, maxY } = bbox;
  const w     = maxX - minX + GRID_STEP_VU;
  const d     = maxY - minY + GRID_STEP_VU;
  const lower = Math.max(3, w * 0.15);
  const upper = Math.max(2, w * 0.1);
  const boxes = [];
  for (let i = 0; i < 3; i++) {
    const t  = i / 3;
    const inX = t * (w * 0.2);
    const inZ = t * (d * 0.2);
    boxes.push(box(minX + inX, heightVU + i * lower / 3, minY + inZ,
      w - inX * 2, lower / 3 + 0.5, d - inZ * 2,
      shadeHex(palette.roofTop, 0.6 + t * 0.2),
      shadeHex(palette.roofRight, 0.5 + t * 0.2),
      shadeHex(palette.roofFront, 0.55 + t * 0.2)));
  }
  boxes.push(box(minX + w * 0.2, heightVU + lower, minY + d * 0.2,
    w * 0.6, upper, d * 0.6,
    palette.roofTop, palette.roofRight, palette.roofFront));
  return boxes;
}

function domeRoof(bbox, heightVU, palette) {
  const { minX, maxX, minY, maxY } = bbox;
  const w  = maxX - minX + GRID_STEP_VU;
  const d  = maxY - minY + GRID_STEP_VU;
  const cx = minX + w / 2;
  const cz = minY + d / 2;
  const r  = Math.min(w, d) / 2;
  const steps = Math.max(3, Math.floor(r));
  const boxes = [];
  for (let i = 0; i <= steps; i++) {
    const t   = i / steps;
    const rad = r * Math.sqrt(Math.max(0, 1 - t * t));
    if (rad < 0.5) break;
    boxes.push(box(cx - rad, heightVU + i * r * 0.6 / steps, cz - rad,
      rad * 2, r * 0.6 / steps + 0.5, rad * 2,
      shadeHex(palette.roofTop, 0.75 + t * 0.25),
      shadeHex(palette.roofRight, 0.65 + t * 0.25),
      shadeHex(palette.roofFront, 0.70 + t * 0.25)));
  }
  return boxes;
}

function chimneyStack(bbox, heightVU, palette, seed) {
  const { minX, maxX, minY, maxY } = bbox;
  const w  = maxX - minX + GRID_STEP_VU;
  const d  = maxY - minY + GRID_STEP_VU;
  const boxes = [];
  const count = Math.min(3, Math.max(1, Math.round(fhashN(seed, 99) * 3)));
  for (let i = 0; i < count; i++) {
    const px = minX + w * (0.2 + fhashN(seed, i * 7) * 0.6);
    const pz = minY + d * (0.2 + fhashN(seed, i * 13) * 0.6);
    const ch = 2 + fhashN(seed, i * 19) * 3;
    boxes.push(box(px, heightVU, pz, 1.2, ch, 1.2,
      palette.chimney, shadeHex(palette.chimney, 0.75), shadeHex(palette.chimney, 0.85)));
    boxes.push(box(px + 0.2, heightVU + ch, pz + 0.2, 0.8, 0.6, 0.8,
      shadeHex(palette.chimney, 1.2), shadeHex(palette.chimney, 0.9), palette.chimney));
  }
  return boxes;
}

// ─── Roof style selector ──────────────────────────────────────────────────────
function selectRoofStyle(buildingType, heightVU, areaM2, tags, seed) {
  const tag = tags?.['roof:shape'] ?? tags?.['building:shape'];
  if (tag) {
    const map = { flat: 'flat', pitched: 'pitched', gabled: 'pitched', hipped: 'hip',
                  mansard: 'mansard', dome: 'dome', pyramid: 'hip' };
    if (map[tag]) return map[tag];
  }
  if (buildingType === 'historic') return fhashN(seed, 50) > 0.5 ? 'dome' : 'mansard';
  if (buildingType === 'civic')    return fhashN(seed, 50) > 0.4 ? 'hip'  : 'flat';
  if (buildingType === 'industrial') return 'flat';
  if (buildingType === 'commercial') return heightVU > 32 ? 'flat' : 'hip';
  if (buildingType === 'residential') {
    if (heightVU < 20) return 'pitched';
    if (heightVU < 40) return fhashN(seed, 51) > 0.5 ? 'pitched' : 'hip';
    return 'mansard';
  }
  return 'flat';
}

function ringCentroid(nodes) {
  let lat = 0, lon = 0;
  for (const n of nodes) { lat += n.lat; lon += n.lon; }
  return { lat: lat / nodes.length, lon: lon / nodes.length };
}

// ─── Main blueprint generator ─────────────────────────────────────────────────
export function generateProceduralBlueprint(building, mPerTile) {
  const {
    id,
    _ring: ring,
    nodes,
    areaM2  = 64,
    heightM = 8,
    tags    = {},
  } = building;

  const effectiveRing = ring ?? nodes ?? [];
  if (effectiveRing.length < 3) return null;

  // Reject implausibly large footprints (campus/block scale)
  if (areaM2 > 10000) return null;

  // Clamp height to something renderable
  const clampedHeightM = Math.min(heightM, 80);

  const rawType = (
    BUILDING_TYPE[tags?.building] ??
    BUILDING_TYPE[tags?.amenity]  ??
    BUILDING_TYPE[tags?.office]   ??
    BUILDING_TYPE[tags?.landuse]  ??
    'residential'
  );
  const palette  = PALETTES[rawType] ?? PALETTES.residential;
  const seed     = '' + id;
  const wallVar  = Math.floor(fhashN(seed, 0) * palette.walls.length);
  const wallCols = palette.walls[wallVar];

  // ── 1. Convert ring → tile-space coords (relative to ring[0]) ───────────
  const ringTile = ringToTile(effectiveRing, mPerTile);

  // ── 2. Rasterise at 4× tile resolution so small buildings get enough cells
  const RASTER_SCALE = 4;
  const ringScaled = ringTile.map(p => ({ x: p.x * RASTER_SCALE, y: p.y * RASTER_SCALE }));

  const cells = rasteriseFootprint(ringScaled);
  if (!cells.size) return null;

  const bbox = cellsBBox(cells);
  const totalScaledW = bbox.maxX - bbox.minX + 1;
  const totalScaledD = bbox.maxY - bbox.minY + 1;

  // FIX 1: Do NOT apply a MAX_TILES scale clamp.
  // Each scaled-raster cell represents (1 / RASTER_SCALE) tiles.
  // Converting to VU: cellSizeVU = (1 / RASTER_SCALE) * VU.
  // Box dimensions are already correct once divided by RASTER_SCALE and
  // multiplied by VU — no additional scale factor needed.
  const scale = 1;

  const heightVU = Math.max(VU, (clampedHeightM / mPerTile) * VU);

  const centroidTile = ringToTile([effectiveRing[0], ringCentroid(effectiveRing)], mPerTile)[1];
  const centroidScaledX = centroidTile.x * RASTER_SCALE - bbox.minX;
  const centroidScaledY = centroidTile.y * RASTER_SCALE - bbox.minY;

  const toVU = (scaledCoord, minScaled, offset) =>
    (scaledCoord - minScaled - offset) / RASTER_SCALE * VU;

  const cellVU = (1 / RASTER_SCALE) * VU;  // VU width of one raster cell

  const bpBoxes = [];

  // ── 3. Wall columns (one horizontal run per row → one box) ───────────────
  const rowMap = new Map();
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number);
    if (!rowMap.has(y)) rowMap.set(y, []);
    rowMap.get(y).push(x);
  }

  for (const [y, xs] of rowMap) {
    xs.sort((a, b) => a - b);
    let runStart = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i === xs.length || xs[i] !== xs[i - 1] + 1) {
        const runEnd = xs[i - 1];
        const wx = (runEnd - runStart + 1) / RASTER_SCALE * VU;
        const bx = toVU(runStart, bbox.minX, centroidScaledX);
        const bz = toVU(y, bbox.minY, centroidScaledY);
        bpBoxes.push(box(bx, 0, bz, wx, heightVU, cellVU,
          wallCols.top, wallCols.right, wallCols.front));
        runStart = xs[i];
      }
    }
  }

  // ── 4. Exposed-face decoration (windows, cornices, base bands, door) ─────
  const exposed = detectExposedFaces(cells);
  const frontRuns = new Map();
  const backRuns  = new Map();
  const rightRuns = new Map();
  const leftRuns  = new Map();

  for (const [key, faces] of exposed) {
    const [x, y] = key.split(',').map(Number);
    if (faces.has('front')) { if (!frontRuns.has(y)) frontRuns.set(y, []); frontRuns.get(y).push(x); }
    if (faces.has('back'))  { if (!backRuns.has(y))  backRuns.set(y,  []); backRuns.get(y).push(x);  }
    if (faces.has('right')) { if (!rightRuns.has(x)) rightRuns.set(x, []); rightRuns.get(x).push(y); }
    if (faces.has('left'))  { if (!leftRuns.has(x))  leftRuns.set(x,  []); leftRuns.get(x).push(y);  }
  }

  function eachRun(sorted, callback) {
    if (!sorted.length) return;
    let start = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      if (i === sorted.length || sorted[i] !== sorted[i - 1] + 1) {
        callback(start, sorted[i - 1]);
        start = sorted[i];
      }
    }
  }

  let doorPlaced = false, longestLen = 0, longestRun = null;
  for (const [y, xs] of frontRuns) {
    const sorted = xs.slice().sort((a, b) => a - b);
    eachRun(sorted, (start, end) => {
      if (end - start > longestLen) { longestLen = end - start; longestRun = { y, start, end }; }
    });
  }

  const decorate = (runs, faceDir, getWX, getWZ) => {
    for (const [coord, vals] of runs) {
      const sorted = vals.slice().sort((a, b) => a - b);
      eachRun(sorted, (start, end) => {
        const len = (end - start + 1) / RASTER_SCALE * VU;
        const wx  = getWX(coord, start);
        const wz  = getWZ(coord, start);
        bpBoxes.push(...windowsForWall(wx, wz, len, 1.5, heightVU - 1, palette, faceDir, seed + coord));
        bpBoxes.push(...corniceForWall(wx, wz, len, heightVU, palette, faceDir));
        bpBoxes.push(...baseForWall(wx, wz, len, palette, faceDir));
        if (!doorPlaced && faceDir === 'front' && longestRun &&
            coord === longestRun.y && start === longestRun.start) {
          bpBoxes.push(...doorForWall(wx, wz, len, heightVU, palette, faceDir));
          doorPlaced = true;
        }
      });
    }
  };

  decorate(frontRuns, 'front',
    (y, start) => toVU(start, bbox.minX, totalScaledW),
    (y, start) => toVU(y,     bbox.minY, totalScaledD) + cellVU
  );
  decorate(backRuns, 'back',
    (y, start) => toVU(start, bbox.minX, totalScaledW),
    (y, start) => toVU(y,     bbox.minY, totalScaledD) - cellVU * 0.5
  );
  decorate(rightRuns, 'right',
    (x, start) => toVU(x,     bbox.minX, totalScaledW) + cellVU,
    (x, start) => toVU(start, bbox.minY, totalScaledD)
  );
  decorate(leftRuns, 'left',
    (x, start) => toVU(x,     bbox.minX, totalScaledW) - cellVU * 0.5,
    (x, start) => toVU(start, bbox.minY, totalScaledD)
  );

  // ── 5. Roof (per-row runs follow actual footprint shape) ─────────────────
  const roofStyle = selectRoofStyle(rawType, heightVU, areaM2, tags, seed);

  for (const [scaledY, xs] of rowMap) {
    xs.sort((a, b) => a - b);
    let runStart = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i === xs.length || xs[i] !== xs[i - 1] + 1) {
        const runEnd = xs[i - 1];
        const bx   = toVU(runStart, bbox.minX, centroidScaledX);
        const bz   = toVU(scaledY,  bbox.minY, centroidScaledY);
        const runW = (runEnd - runStart + 1) / RASTER_SCALE * VU;
        const sliceBbox = { minX: bx, maxX: bx + runW, minY: bz, maxY: bz + cellVU };

        switch (roofStyle) {
          case 'pitched': bpBoxes.push(...pitchedRoof(sliceBbox, heightVU, palette)); break;
          case 'hip':     bpBoxes.push(...hipRoof(sliceBbox, heightVU, palette));     break;
          case 'mansard': bpBoxes.push(...mansardRoof(sliceBbox, heightVU, palette)); break;
          case 'dome':    bpBoxes.push(...domeRoof(sliceBbox, heightVU, palette));    break;
          default:        bpBoxes.push(...flatRoof(sliceBbox, heightVU, palette));    break;
        }
        runStart = xs[i];
      }
    }
  }

  // ── 6. Chimneys (residential / historic only) ────────────────────────────
  if ((rawType === 'residential' || rawType === 'historic') && heightVU < 30) {
    // Use the full bbox extents in VU space (centred at origin)
    const hw = (totalScaledW / 2) / RASTER_SCALE * VU;
    const hd = (totalScaledD / 2) / RASTER_SCALE * VU;
    bpBoxes.push(...chimneyStack(
      { minX: -hw, maxX: hw, minY: -hd, maxY: hd },
      heightVU, palette, seed
    ));
  }

  return bpBoxes;
}

// ─── Cache key ────────────────────────────────────────────────────────────────
export function blueprintCacheKey(building, mPerTile) {
  const ring = building._ring ?? building.nodes ?? [];
  const sampled = ring.filter((_, i) => i % 3 === 0).map(n =>
    `${n.lat.toFixed(4)},${n.lon.toFixed(4)}`
  ).join('|');
  const bType = (
    BUILDING_TYPE[building.tags?.building] ??
    BUILDING_TYPE[building.tags?.amenity]  ??
    'residential'
  );
  const h = Math.round(building.heightM ?? 8);
  return `bp:${bType}:${h}:${fhash(sampled).toString(36).slice(0, 10)}`;
}

// ─── ProceduralBlueprintGenerator (stateful, owns cache) ──────────────────────
export class ProceduralBlueprintGenerator {
  constructor(options = {}) {
    this._mPerTile        = options.mPerTile       ?? 2;
    this._terrainRegistry = options.terrainRegistry ?? null;
    this._memCache  = new Map();
    this._idbCache  = new PersistentCache('GOE_Blueprints', 'procedural_bp');
    this._pending   = new Map();
  }

  async getBlueprint(building, mPerTile) {
    const key = blueprintCacheKey(building, mPerTile);
    if (this._memCache.has(key)) return this._memCache.get(key);
    if (this._pending.has(key))  return this._pending.get(key);

    const p = this._resolveBlueprint(key, building, mPerTile);
    this._pending.set(key, p);
    try {
      const result = await p;
      this._pending.delete(key);
      return result;
    } catch (e) {
      this._pending.delete(key);
      throw e;
    }
  }

  async _resolveBlueprint(key, building, mPerTile) {
    try {
      const cached = await this._idbCache.get(key);
      if (cached?.boxes) {
        this._memCache.set(key, cached.boxes);
        return cached.boxes;
      }
    } catch (_) {}

    const boxes = generateProceduralBlueprint(building, mPerTile);
    if (boxes) {
      this._memCache.set(key, boxes);
      try {
        await this._idbCache.set(key, { boxes, ts: Date.now() });
      } catch (e) {
        console.warn('[ProceduralBlueprintGenerator] IDB write failed:', e.message);
      }
    }
    return boxes;
  }

  // ── Build a full entity definition using the procedural blueprint ─────────
  async getBuildingDef(building, mPerTile, terrainRegistry, elevGrid = []) {
    let blueprint = null;
    try {
      blueprint = await this.getBlueprint(building, mPerTile);
    } catch (e) {
      console.warn('[ProceduralBlueprintGenerator] Blueprint generation failed:', e.message);
    }

    if (!blueprint || !blueprint.length) {
      return this._fallbackPolygonDef(building, mPerTile, terrainRegistry, elevGrid);
    }

    const ring     = building._ring ?? building.nodes ?? [];
    const heightVU = Math.max(VU, (building.heightM / mPerTile) * VU);
    const halfA    = (building.obb?.halfA ?? Math.sqrt(Math.max(16, building.areaM2)) / 2) / mPerTile;
    const halfB    = (building.obb?.halfB ?? halfA) / mPerTile;
    const geomR    = Math.hypot(halfA, halfB);

    // FIX 2: Shadow radius — clamp against actual footprint area to avoid
    // the 8× over-sized halo that resulted from halfA (tiles) * VU.
    const shadowR = Math.min(
      halfA * VU,
      Math.sqrt(Math.max(16, building.areaM2) / Math.PI) / mPerTile * VU
    );

    const bp = blueprint;

    // Centroid lat/lon for the renderFn projection (FIX 3)
    const centLat = building.centroid?.lat ?? (ring[0]?.lat ?? 0);
    const centLon = building.centroid?.lon ?? (ring[0]?.lon ?? 0);

    return {
      id:             `procbp:${building.id ?? Math.random()}`,
      latitude:       centLat,
      longitude:      centLon,
      solid:          true,
      bboxRadius:     geomR,
      _geometricR:    geomR,
      physicsEnabled: false,
      fixed:          true,
      renderHeavy:    false,
      _isBuildingBox: true,
      _lodColor:      '#b0a090',
      _areaM2:        building.areaM2,
      _heightM:       building.heightM,
      _facingAngle:   building._facingAngle ?? 0,
      _obb:           building.obb ?? null,
      _ring:          ring,
      _mPerTile:      mPerTile,
      _bpKey:         null,
      _procBlueprint: bp,

      renderFn(wr, groundElevPx, extra, entity) {
        const { cam } = wr;
        if (cam.tilt < 0.02) return;
        const blueprint = entity._procBlueprint;
        if (!blueprint?.length) return;

        const elev  = groundElevPx + (entity.elevOffset ?? 0);
        const depth = frontDepth(entity.tx, entity.ty, cam.rotation, entity._geometricR ?? geomR);
        const isoA  = Math.min(1, (cam.tilt - 0.02) / 0.14);

        wr.submitShadow({
          p:       { x: entity.tx, y: entity.ty },
          elev,
          r:       shadowR,
          engineH: heightVU,
        });

        wr.submitWorldObject(depth, () => {
          wr.ctx.globalAlpha = isoA;
          wr._voxel.beginTile(entity.tx, entity.ty, elev);
          wr._voxel.setRotation(-180);//(entity._facingAngle ?? 0);
          for (const p of blueprint) {
            wr._voxel.box(
              p.x, p.y, p.z,
              p.w, p.h, p.d,
              p.top, p.right ?? p.top, p.front ?? p.top,
            );
          }
          wr._voxel.clearRotation();
          wr.ctx.globalAlpha = 1;
        });
      },
    };
  }

  // ── Polygon-extrusion fallback ─────────────────────────────────────────────
  // FIX 3: renderFn now uses centroid-relative tile deltas instead of the
  // broken lonToGlobalX / latToGlobalY reprojection that double-applied the
  // map origin offset, placing walls in wrong positions for off-centre buildings.
  _fallbackPolygonDef(building, mPerTile, terrainRegistry, elevGrid) {
    const colorSet   = terrainRegistry?.colors?.['BUILDING'] ?? {};
    const topColor   = colorSet.top   ?? '#b0a090';
    const rightColor = colorSet.right ?? '#8a7a6a';
    const leftColor  = colorSet.left  ?? '#6a5a4a';

    const ring        = building._ring ?? building.nodes ?? [];
    const heightTiles = building.heightM / mPerTile;
    const halfA       = (building.obb?.halfA ?? Math.sqrt(Math.max(16, building.areaM2)) / 2) / mPerTile;
    const halfB       = (building.obb?.halfB ?? halfA) / mPerTile;
    const geomR       = Math.hypot(halfA, halfB);
    const shadowR     = Math.min(
      halfA * VU,
      Math.sqrt(Math.max(16, building.areaM2) / Math.PI) / mPerTile * VU
    );

    const centLat = building.centroid?.lat ?? (ring[0]?.lat ?? 0);
    const centLon = building.centroid?.lon ?? (ring[0]?.lon ?? 0);
    const mLonScale = 111320 * Math.cos(centLat * Math.PI / 180);
    const mLatScale = 111320;

    return {
      id:             `building_fb:${building.id ?? Math.random()}`,
      latitude:       centLat,
      longitude:      centLon,
      solid:          true,
      bboxRadius:     geomR,
      _geometricR:    geomR,
      physicsEnabled: false,
      fixed:          true,
      renderHeavy:    false,
      _isBuildingBox: true,
      _lodColor:      topColor,
      _facingAngle:   building._facingAngle ?? 0,
      _ring:          ring,
      _mPerTile:      mPerTile,

      renderFn(wr, groundElevPx, extra, entity) {
        const { cam, ctx } = wr;
        if (cam.tilt < 0.02 || !entity._ring?.length) return;

        const elev  = groundElevPx + (entity.elevOffset ?? 0);
        const depth = frontDepth(entity.tx, entity.ty, cam.rotation, entity._geometricR ?? geomR);
        const hw    = tileHalfWidth(cam.zoom, cam.tileW);
        const hPx   = heightTiles * hw * cam.tilt * 2;

        wr.submitShadow({
          p: { x: entity.tx, y: entity.ty },
          elev,
          r: shadowR,
          engineH: heightTiles * VU,
        });

        wr.submitWorldObject(depth, () => {
          // FIX 3: project each ring node as a centroid-relative tile offset.
          // entity.latitude / entity.longitude is the building centroid (set above).
          // entity.tx / entity.ty is where the centroid sits in tile space.
          // So each node's screen position = worldToScreen(tx + dTileX, ty + dTileY).
          const eLat = entity.latitude  ?? centLat;
          const eLon = entity.longitude ?? centLon;
          const mLon = 111320 * Math.cos(eLat * Math.PI / 180);
          const mLat = 111320;
          const ep   = entity._mPerTile ?? mPerTile;

          const screenPts = entity._ring.map(n => {
            const dTileX =  (n.lon - eLon) * mLon / ep;
            const dTileY = -(n.lat - eLat) * mLat / ep;
            return worldToScreen(entity.tx + dTileX, entity.ty + dTileY, elev, cam);
          });

          if (screenPts.length < 3) return;

          // Drop shadow offset plane
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
              if (-ey <= 0) continue;
              ctx.beginPath();
              ctx.moveTo(a.x,  a.y);
              ctx.lineTo(b2.x, b2.y);
              ctx.lineTo(b2.x, b2.y - hPx);
              ctx.lineTo(a.x,  a.y  - hPx);
              ctx.closePath();
              ctx.fillStyle = Math.abs(Math.atan2(ey, ex)) < Math.PI / 2 ? rightColor : leftColor;
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

  // ── Cache management ──────────────────────────────────────────────────────
  clearMemCache() {
    this._memCache.clear();
  }

  async clearAllCaches() {
    this._memCache.clear();
    await this._idbCache.clear();
  }

  async pruneCache(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    console.log('[ProceduralBlueprintGenerator] pruneCache: implement via PersistentCache.iterate()');
  }
}