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
 * Integration with OSMTerrainLoader:
 *   Replace makeBuildingDef() calls with generateAndCacheBlueprint() which
 *   returns a normal makeBlueprintDef()-compatible entity definition whose
 *   renderFn uses WorldRenderer._voxel to draw the generated blueprint.
 *
 * Usage:
 *   import { ProceduralBlueprintGenerator } from './ProceduralBlueprintGenerator.js';
 *
 *   const gen = new ProceduralBlueprintGenerator({ mPerTile: 2 });
 *   await gen.init();   // opens IDB cache
 *
 *   // inside _processOSMData, replace makeBuildingDef(b, ...) with:
 *   const def = await gen.getBuildingDef(b, mPerTile, terrainRegistry);
 *   entityDefs.push(def);
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
// Each palette has: wall faces (top/right/front), window colors, door color,
// cornice color, accent color for any special features, roof top color.
const PALETTES = {
  residential: {
    // Warm brick / render range — variation seeded per building
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
  // Returns nth pseudo-random value derived from str
  return fhash(str + '|' + n);
}

// ─── Footprint rasterisation ──────────────────────────────────────────────────
/**
 * Given a polygon ring in VU space ({x,y} integer coords), produce a Set of
 * `"${x},${y}"` strings for all interior cells (scanline fill).
 */
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

/**
 * Given a filled cell set, return the bounding box.
 */
function cellsBBox(cells) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Convert an OSM ring [{lat,lon}] to VU space.
 * The first node is the local origin so all coords are relative.
 */
function ringToVU(nodes, mPerTile) {
  if (!nodes.length) return [];
  const origin = nodes[0];
  const mLon = 111320 * Math.cos(origin.lat * Math.PI / 180);
  const mLat = 111320;
  return nodes.map(n => ({
    x: ((n.lon - origin.lon) * mLon / mPerTile) * VU,
    y: -((n.lat - origin.lat) * mLat / mPerTile) * VU, // negate: lat↑ = tile y↓
  }));
}

// ─── Wall-face exposure detection ────────────────────────────────────────────
const DIRS = [
  { dx:  1, dy:  0, face: 'right' },
  { dx: -1, dy:  0, face: 'left'  },
  { dx:  0, dy:  1, face: 'front' },
  { dx:  0, dy: -1, face: 'back'  },
];

/**
 * For each cell in the footprint, record which faces are exposed (neighbour
 * cell is not in the footprint → that face is an exterior wall).
 * Returns Map<"x,y", Set<face>> where face ∈ {right,left,front,back}.
 */
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

// ─── Window/door generation ───────────────────────────────────────────────────
/**
 * Place window boxes on a wall segment.
 *
 * wallOriginX, wallOriginZ = start of the wall face in VU
 * wallLenVU = length of the face in VU
 * wallYBase, wallYTop = vertical extents in VU
 * palette = PALETTES[type]
 * faceDir = 'front'|'right'|'left'|'back'  (for thickness offset)
 * seed = deterministic variation per building
 */
function windowsForWall(wallOriginX, wallOriginZ, wallLenVU, wallYBase, wallYTop, palette, faceDir, seed) {
  const boxes = [];
  const wallH  = wallYTop - wallYBase;
  if (wallLenVU < 3 || wallH < 6) return boxes;

  // One window per ~5 VU of wall, one row per ~8 VU of height
  const cols  = Math.max(1, Math.round(wallLenVU / 5));
  const rows  = Math.max(1, Math.round(wallH / 8));
  const colW  = wallLenVU / cols;
  const rowH  = wallH / rows;

  // Window dimensions: ~2/3 of slot
  const winW  = Math.max(1, (colW * 0.55)) ;
  const winH  = Math.max(1, (rowH * 0.55));
  const winD  = 0.4; // depth (inset into wall)

  // z-offset for face direction (push window slightly outside wall)
  const zOff  = faceDir === 'front' || faceDir === 'back' ? winD : 0;
  const xOff  = faceDir === 'right' || faceDir === 'left' ? winD : 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = fhashN(seed + r * 17 + c * 31, 1) > 0.3;
      const fill = lit ? palette.windowFill : shadeHex(palette.windowFill, 0.45);

      const cx = wallOriginX + (c + 0.5) * colW;
      const cz = wallOriginZ;
      const cy = wallYBase + (r + 0.5) * rowH;

      if (faceDir === 'front' || faceDir === 'back') {
        // Window lies in xz-plane, face z
        boxes.push(box(
          cx - winW / 2, cy - winH / 2, cz - zOff,
          winW, winH, winD,
          fill, shadeHex(fill, 0.65), shadeHex(fill, 0.80)
        ));
        // Frame (outer slightly larger, slightly darker)
        boxes.push(box(
          cx - winW / 2 - 0.3, cy - winH / 2 - 0.3, cz - zOff - 0.1,
          winW + 0.6, winH + 0.6, winD * 0.4,
          palette.windowFrame, shadeHex(palette.windowFrame, 0.7), shadeHex(palette.windowFrame, 0.8)
        ));
      } else {
        // right/left face: window in zy-plane
        boxes.push(box(
          cz - xOff, cy - winH / 2, cx - winW / 2,
          winD, winH, winW,
          fill, shadeHex(fill, 0.65), shadeHex(fill, 0.80)
        ));
        boxes.push(box(
          cz - xOff - 0.1, cy - winH / 2 - 0.3, cx - winW / 2 - 0.3,
          winD * 0.4, winH + 0.6, winW + 0.6,
          palette.windowFrame, shadeHex(palette.windowFrame, 0.7), shadeHex(palette.windowFrame, 0.8)
        ));
      }
    }
  }
  return boxes;
}

/**
 * Place a door on the most accessible wall face (longest exposed run on front face).
 */
function doorForWall(wallOriginX, wallOriginZ, wallLenVU, wallH, palette, faceDir) {
  const dW = Math.min(wallLenVU * 0.25, 3);
  const dH = Math.min(wallH * 0.35, 10);
  const cx = wallOriginX + wallLenVU / 2;
  const cz = wallOriginZ;
  const boxes = [];

  if (faceDir === 'front' || faceDir === 'back') {
    boxes.push(box(
      cx - dW / 2, 0, cz - 0.5,
      dW, dH, 0.6,
      palette.doorFill, shadeHex(palette.doorFill, 0.7), shadeHex(palette.doorFill, 0.85)
    ));
    // Door frame
    boxes.push(box(
      cx - dW / 2 - 0.4, 0, cz - 0.6,
      dW + 0.8, dH + 0.5, 0.4,
      palette.doorFrame, shadeHex(palette.doorFrame, 0.7), shadeHex(palette.doorFrame, 0.8)
    ));
  }
  return boxes;
}

/**
 * Cornice band at top of walls.
 */
function corniceForWall(wallOriginX, wallOriginZ, wallLenVU, wallYTop, palette, faceDir) {
  const cH = 1.0;
  const cD = 0.6;
  if (faceDir === 'front' || faceDir === 'back') {
    return [box(
      wallOriginX - 0.3, wallYTop - cH, wallOriginZ - cD,
      wallLenVU + 0.6, cH, cD,
      palette.cornice, shadeHex(palette.cornice, 0.75), shadeHex(palette.cornice, 0.85)
    )];
  } else {
    return [box(
      wallOriginZ - cD, wallYTop - cH, wallOriginX - 0.3,
      cD, cH, wallLenVU + 0.6,
      palette.cornice, shadeHex(palette.cornice, 0.75), shadeHex(palette.cornice, 0.85)
    )];
  }
}

/**
 * Base band (water table / plinth) at bottom of walls.
 */
function baseForWall(wallOriginX, wallOriginZ, wallLenVU, palette, faceDir) {
  const bH = 1.5;
  const bD = 0.4;
  if (faceDir === 'front' || faceDir === 'back') {
    return [box(
      wallOriginX - 0.2, 0, wallOriginZ - bD,
      wallLenVU + 0.4, bH, bD,
      palette.accentBand, shadeHex(palette.accentBand, 0.75), shadeHex(palette.accentBand, 0.85)
    )];
  } else {
    return [box(
      wallOriginZ - bD, 0, wallOriginX - 0.2,
      bD, bH, wallLenVU + 0.4,
      palette.accentBand, shadeHex(palette.accentBand, 0.75), shadeHex(palette.accentBand, 0.85)
    )];
  }
}

// ─── Roof styles ──────────────────────────────────────────────────────────────
function flatRoof(bbox, heightVU, palette) {
  const { minX, maxX, minY, maxY } = bbox;
  const w = maxX - minX + GRID_STEP_VU;
  const d = maxY - minY + GRID_STEP_VU;
  const parH = 0.8;
  return [
    // Parapet
    box(minX, heightVU, minY, w, parH, d,
      palette.roofTop, palette.roofRight, palette.roofFront),
    // Parapet inner shadow strip
    box(minX + 0.6, heightVU, minY + 0.6, w - 1.2, parH * 0.5, d - 1.2,
      shadeHex(palette.roofTop, 0.6), shadeHex(palette.roofRight, 0.6), shadeHex(palette.roofFront, 0.6)),
  ];
}

function pitchedRoof(bbox, heightVU, palette) {
  // Simple ridge roof: two sloped slabs meeting at ridge
  const { minX, maxX, minY, maxY } = bbox;
  const w  = maxX - minX + GRID_STEP_VU;
  const d  = maxY - minY + GRID_STEP_VU;
  const rH = Math.max(2, w * 0.2); // ridge height proportional to width
  const boxes = [];
  const steps = Math.max(2, Math.floor(rH));
  for (let i = 0; i < steps; i++) {
    const t    = i / steps;
    const inX  = t * (w / 2);
    const inZ  = t * (d / 4);
    const ww   = w - inX * 2;
    const dd   = d - inZ * 2;
    const slH  = rH / steps;
    boxes.push(box(
      minX + inX, heightVU + i * slH, minY + inZ,
      ww, slH + 0.5, dd,
      shadeHex(palette.roofTop, 0.8 + t * 0.2),
      shadeHex(palette.roofRight, 0.7 + t * 0.2),
      shadeHex(palette.roofFront, 0.75 + t * 0.2)
    ));
  }
  return boxes;
}

function hipRoof(bbox, heightVU, palette) {
  const { minX, maxX, minY, maxY } = bbox;
  const w = maxX - minX + GRID_STEP_VU;
  const d = maxY - minY + GRID_STEP_VU;
  const rH = Math.max(2, Math.min(w, d) * 0.22);
  const steps = Math.max(2, Math.floor(rH));
  const boxes = [];
  for (let i = 0; i < steps; i++) {
    const t  = i / steps;
    const inset = t * Math.min(w, d) * 0.45;
    const slH = rH / steps;
    boxes.push(box(
      minX + inset, heightVU + i * slH, minY + inset,
      w - inset * 2, slH + 0.5, d - inset * 2,
      shadeHex(palette.roofTop, 0.75 + t * 0.25),
      shadeHex(palette.roofRight, 0.65 + t * 0.25),
      shadeHex(palette.roofFront, 0.70 + t * 0.25)
    ));
  }
  return boxes;
}

function mansardRoof(bbox, heightVU, palette) {
  const { minX, maxX, minY, maxY } = bbox;
  const w  = maxX - minX + GRID_STEP_VU;
  const d  = maxY - minY + GRID_STEP_VU;
  const lower = Math.max(3, w * 0.15); // steep lower section
  const upper = Math.max(2, w * 0.1);  // gentle upper section
  const boxes = [];
  // Lower steep slope
  for (let i = 0; i < 3; i++) {
    const t  = i / 3;
    const inX = t * (w * 0.2);
    const inZ = t * (d * 0.2);
    boxes.push(box(
      minX + inX, heightVU + i * lower / 3, minY + inZ,
      w - inX * 2, lower / 3 + 0.5, d - inZ * 2,
      shadeHex(palette.roofTop, 0.6 + t * 0.2),
      shadeHex(palette.roofRight, 0.5 + t * 0.2),
      shadeHex(palette.roofFront, 0.55 + t * 0.2)
    ));
  }
  // Upper flat/shallow section
  boxes.push(box(
    minX + w * 0.2, heightVU + lower, minY + d * 0.2,
    w * 0.6, upper, d * 0.6,
    palette.roofTop, palette.roofRight, palette.roofFront
  ));
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
    const t    = i / steps;
    const sH   = Math.sqrt(Math.max(0, 1 - t * t)) * r * 0.6;
    const rad  = r * Math.sqrt(Math.max(0, 1 - (i / steps) ** 2));
    if (rad < 0.5) break;
    boxes.push(box(
      cx - rad, heightVU + i * r * 0.6 / steps, cz - rad,
      rad * 2, r * 0.6 / steps + 0.5, rad * 2,
      shadeHex(palette.roofTop, 0.75 + t * 0.25),
      shadeHex(palette.roofRight, 0.65 + t * 0.25),
      shadeHex(palette.roofFront, 0.70 + t * 0.25)
    ));
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
    // chimney pot
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
  // Infer from building type and size
  if (buildingType === 'historic') return fhashN(seed, 50) > 0.5 ? 'dome' : 'mansard';
  if (buildingType === 'civic')    return fhashN(seed, 50) > 0.4 ? 'hip'  : 'flat';
  if (buildingType === 'industrial') return 'flat';
  if (buildingType === 'commercial') return heightVU > 32 ? 'flat' : 'hip';
  // Residential: pitched for small, flat for tall
  if (buildingType === 'residential') {
    if (heightVU < 20) return 'pitched';
    if (heightVU < 40) return fhashN(seed, 51) > 0.5 ? 'pitched' : 'hip';
    return 'mansard';
  }
  return 'flat';
}

// ─── Main blueprint generator ─────────────────────────────────────────────────
/**
 * Generate a voxel blueprint array from preprocessed building data.
 * Returns [{x,y,z,w,h,d,top,right,front}] in VU coordinates,
 * centred at (0, 0, 0) (the blueprint origin).
 */
export function generateProceduralBlueprint(building, mPerTile) {
  const {
    id,
    _ring: ring,
    nodes,
    areaM2   = 64,
    heightM  = 8,
    tags     = {},
  } = building;

  const effectiveRing = ring ?? nodes ?? [];
  if (effectiveRing.length < 3) return null;

  // ── Classify building type ───────────────────────────────────────────────
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

  // ── Convert ring to VU space ─────────────────────────────────────────────
  const ringVU = ringToVU(effectiveRing, mPerTile);

  // ── Rasterise footprint ──────────────────────────────────────────────────
  const cells = rasteriseFootprint(ringVU);
  if (!cells.size) return null;

  const bbox   = cellsBBox(cells);
  const bboxW  = bbox.maxX - bbox.minX + GRID_STEP_VU;
  const bboxD  = bbox.maxY - bbox.minY + GRID_STEP_VU;

  // Cap grid to MAX_CELLS
  const scaleX = bboxW > MAX_CELLS ? MAX_CELLS / bboxW : 1;
  const scaleZ = bboxD > MAX_CELLS ? MAX_CELLS / bboxD : 1;
  const scale  = Math.min(scaleX, scaleZ);

  // ── Height in VU ─────────────────────────────────────────────────────────
  const heightVU = Math.max(VU, (heightM / mPerTile) * VU);

  // ── Blueprint boxes ──────────────────────────────────────────────────────
  const bpBoxes = [];

  // Centre offset so blueprint is centred at (0,0,0)
  const offX = -(bbox.minX + bboxW / 2) * scale;
  const offZ = -(bbox.minY + bboxD / 2) * scale;

  // ── Wall columns (main building mass) ────────────────────────────────────
  // Rather than one box per cell (too many), we run horizontal merge passes
  // along each row to produce runs of cells → single wide box per run.
  const rowRuns = new Map(); // row y → [{startX, endX}]

  for (const key of cells) {
    const [x, y] = key.split(',').map(Number);
    if (!rowRuns.has(y)) rowRuns.set(y, []);
    rowRuns.get(y).push(x);
  }

  for (const [y, xs] of rowRuns) {
    xs.sort((a, b) => a - b);
    let runStart = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i === xs.length || xs[i] !== xs[i - 1] + GRID_STEP_VU) {
        const runEnd = xs[i - 1];
        const wx = (runEnd - runStart + GRID_STEP_VU) * scale;
        const bx = (runStart - bbox.minX - bboxW / 2) * scale;
        const bz = (y         - bbox.minY - bboxD / 2) * scale;
        bpBoxes.push(box(
          bx, 0, bz,
          wx, heightVU, GRID_STEP_VU * scale,
          wallCols.top, wallCols.right, wallCols.front
        ));
        runStart = xs[i];
      }
    }
  }

  // ── Exposed wall decoration pass ─────────────────────────────────────────
  const exposed = detectExposedFaces(cells);

  // Collect continuous runs of exposed cells per (face direction, row y or col x)
  // Front/back: runs along x at fixed y on front or back border
  // Right/left: runs along y at fixed x on right or left border
  const frontRuns  = new Map(); // y → [x values with front face]
  const backRuns   = new Map();
  const rightRuns  = new Map(); // x → [y values with right face]
  const leftRuns   = new Map();

  for (const [key, faces] of exposed) {
    const [x, y] = key.split(',').map(Number);
    if (faces.has('front')) { if (!frontRuns.has(y)) frontRuns.set(y, []); frontRuns.get(y).push(x); }
    if (faces.has('back'))  { if (!backRuns.has(y))  backRuns.set(y,  []); backRuns.get(y).push(x);  }
    if (faces.has('right')) { if (!rightRuns.has(x)) rightRuns.set(x, []); rightRuns.get(x).push(y); }
    if (faces.has('left'))  { if (!leftRuns.has(x))  leftRuns.set(x,  []); leftRuns.get(x).push(y);  }
  }

  // Helper: merge sorted xs into runs, call callback for each run
  function eachRun(sorted, callback) {
    if (!sorted.length) return;
    let start = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      if (i === sorted.length || sorted[i] !== sorted[i - 1] + GRID_STEP_VU) {
        callback(start, sorted[i - 1]);
        start = sorted[i];
      }
    }
  }

  // Pick a representative "door face" — the longest front run on the first front row
  let doorPlaced = false;
  let longestFrontRunLen = 0, longestFrontRunData = null;
  for (const [y, xs] of frontRuns) {
    const sorted = xs.slice().sort((a, b) => a - b);
    eachRun(sorted, (start, end) => {
      if (end - start > longestFrontRunLen) {
        longestFrontRunLen = end - start;
        longestFrontRunData = { y, start, end };
      }
    });
  }

  // Windows, cornices, base bands on each face direction
  const decorate = (runs, faceDir, coordinateMapper) => {
    for (const [coord, vals] of runs) {
      const sorted = vals.slice().sort((a, b) => a - b);
      eachRun(sorted, (start, end) => {
        const len    = (end - start + GRID_STEP_VU) * scale;
        const origin = coordinateMapper(coord, start, end, scale, bbox);

        // Windows
        const wins = windowsForWall(
          origin.wallOriginX, origin.wallOriginZ,
          len, 1.5, heightVU - 1,
          palette, faceDir, seed + coord
        );
        bpBoxes.push(...wins);

        // Cornice
        bpBoxes.push(...corniceForWall(
          origin.wallOriginX, origin.wallOriginZ, len, heightVU, palette, faceDir
        ));

        // Base band
        bpBoxes.push(...baseForWall(
          origin.wallOriginX, origin.wallOriginZ, len, palette, faceDir
        ));

        // Door (only once, on the longest front run)
        if (!doorPlaced && faceDir === 'front' &&
            longestFrontRunData &&
            coord === longestFrontRunData.y &&
            start === longestFrontRunData.start) {
          bpBoxes.push(...doorForWall(
            origin.wallOriginX, origin.wallOriginZ, len, heightVU, palette, faceDir
          ));
          doorPlaced = true;
        }
      });
    }
  };

  decorate(frontRuns, 'front', (y, start, end, sc, bb) => ({
    wallOriginX: (start - bb.minX - bboxW / 2) * sc,
    wallOriginZ: (y    - bb.minY - bboxD / 2) * sc + sc * GRID_STEP_VU,
  }));

  decorate(backRuns, 'back', (y, start, end, sc, bb) => ({
    wallOriginX: (start - bb.minX - bboxW / 2) * sc,
    wallOriginZ: (y    - bb.minY - bboxD / 2) * sc - sc * GRID_STEP_VU * 0.5,
  }));

  decorate(rightRuns, 'right', (x, start, end, sc, bb) => ({
    wallOriginX: (x    - bb.minX - bboxW / 2) * sc + sc * GRID_STEP_VU,
    wallOriginZ: (start - bb.minY - bboxD / 2) * sc,
  }));

  decorate(leftRuns, 'left', (x, start, end, sc, bb) => ({
    wallOriginX: (x    - bb.minX - bboxW / 2) * sc - sc * GRID_STEP_VU * 0.5,
    wallOriginZ: (start - bb.minY - bboxD / 2) * sc,
  }));

  // ── Roof ─────────────────────────────────────────────────────────────────
  const roofStyle  = selectRoofStyle(rawType, heightVU, areaM2, tags, seed);
  const scaledBbox = {
    minX: (bbox.minX - bbox.minX - bboxW / 2) * scale,
    maxX: (bbox.maxX - bbox.minX - bboxW / 2) * scale + GRID_STEP_VU * scale,
    minY: (bbox.minY - bbox.minY - bboxD / 2) * scale,
    maxY: (bbox.maxY - bbox.minY - bboxD / 2) * scale + GRID_STEP_VU * scale,
  };

  switch (roofStyle) {
    case 'pitched':  bpBoxes.push(...pitchedRoof(scaledBbox, heightVU, palette));  break;
    case 'hip':      bpBoxes.push(...hipRoof(scaledBbox, heightVU, palette));      break;
    case 'mansard':  bpBoxes.push(...mansardRoof(scaledBbox, heightVU, palette));  break;
    case 'dome':     bpBoxes.push(...domeRoof(scaledBbox, heightVU, palette));     break;
    default:         bpBoxes.push(...flatRoof(scaledBbox, heightVU, palette));     break;
  }

  // Chimneys (residential + historic only, low buildings)
  if ((rawType === 'residential' || rawType === 'historic') && heightVU < 30) {
    bpBoxes.push(...chimneyStack(scaledBbox, heightVU, palette, seed));
  }

  return bpBoxes;
}

// ─── Cache key ────────────────────────────────────────────────────────────────
/**
 * Produces a short stable key from building metadata.
 * Footprint ring is sampled (every 3rd node) + rounded to 4 decimal places
 * to tolerate trivial precision differences across Overpass responses.
 */
export function blueprintCacheKey(building, mPerTile) {
  const ring = building._ring ?? building.nodes ?? [];
  // Sample ring nodes to keep key short
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
    this._mPerTile       = options.mPerTile       ?? 2;
    this._terrainRegistry = options.terrainRegistry ?? null;

    // Two-level cache: hot in-memory Map, cold IDB
    this._memCache  = new Map();
    this._idbCache  = new PersistentCache('GOE_Blueprints', 'procedural_bp');
    this._pending   = new Map(); // in-flight generation promises (dedup)
  }

  // ── Retrieve or generate blueprint for one building ───────────────────────
  /**
   * Returns a resolved blueprint array (same schema as Blueprints.*).
   * Checks mem → IDB → generate, storing at each level on the way back.
   */
  async getBlueprint(building, mPerTile) {
    const key = blueprintCacheKey(building, mPerTile);

    // 1. Memory hit
    if (this._memCache.has(key)) return this._memCache.get(key);

    // 2. Deduplicate concurrent requests for the same key
    if (this._pending.has(key)) return this._pending.get(key);

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
    // 3. IDB hit
    try {
      const cached = await this._idbCache.get(key);
      if (cached?.boxes) {
        this._memCache.set(key, cached.boxes);
        return cached.boxes;
      }
    } catch (_) { /* cache miss is fine */ }

    // 4. Generate
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
  /**
   * Drop-in replacement for OSMTerrainLoader's makeBuildingDef().
   * Returns a promise that resolves to an entity def whose renderFn uses
   * WorldRenderer._voxel to draw the generated blueprint at scale 1
   * (blueprint units already match the building's real dimensions).
   *
   * Falls back to the polygon-extrusion renderFn if blueprint generation fails.
   */
  async getBuildingDef(building, mPerTile, terrainRegistry, elevGrid = []) {
    let blueprint = null;
    try {
      blueprint = await this.getBlueprint(building, mPerTile);
    } catch (e) {
      console.warn('[ProceduralBlueprintGenerator] Blueprint generation failed:', e.message);
    }

    if (!blueprint || !blueprint.length) {
      // Fallback: delegate to the polygon extrusion approach from OSMTerrainLoader
      return this._fallbackPolygonDef(building, mPerTile, terrainRegistry, elevGrid);
    }

    const ring      = building._ring ?? building.nodes ?? [];
    const originGX  = ring.length ? lonToGlobalX(ring[0].lon, ring[0].lat, mPerTile) : 0;
    const originGY  = ring.length ? latToGlobalY(ring[0].lat, mPerTile)              : 0;
    const heightVU  = Math.max(VU, (building.heightM / mPerTile) * VU);
    const halfA     = (building.obb?.halfA ?? Math.sqrt(Math.max(16, building.areaM2)) / 2) / mPerTile;
    const halfB     = (building.obb?.halfB ?? halfA) / mPerTile;
    const geomR     = Math.hypot(halfA, halfB);

    const colorSet   = terrainRegistry?.colors?.[/* TerrainType.BUILDING */ 'BUILDING'] ?? {};
    const topColor   = colorSet.top   ?? '#b0a090';

    // Clone blueprint so the stored array isn't mutated
    const bp = blueprint;

    return {
      id:             `procbp:${building.id ?? Math.random()}`,
      latitude:       building.centroid?.lat ?? (ring[0]?.lat ?? 0),
      longitude:      building.centroid?.lon ?? (ring[0]?.lon ?? 0),
      solid:          true,
      bboxRadius:     geomR,
      _geometricR:    geomR,
      physicsEnabled: false,
      fixed:          true,
      renderHeavy:    true,     // uses _voxel
      _isBuildingBox: true,
      _lodColor:      topColor,
      _areaM2:        building.areaM2,
      _heightM:       building.heightM,
      _facingAngle:   building.obb?.angleDeg ?? 0,
      _obb:           building.obb ?? null,
      _ring:          ring,
      _originGX:      originGX,
      _originGY:      originGY,
      _mPerTile:      mPerTile,
      _bpKey:         null,     // not a named Blueprints entry
      _procBlueprint: bp,

      renderFn(wr, groundElevPx, extra, entity) {
        const { cam } = wr;
        if (cam.tilt < 0.02) return;
        const blueprint = entity._procBlueprint;
        if (!blueprint?.length) return;

        const elev   = groundElevPx + (entity.elevOffset ?? 0);
        const depth  = frontDepth(entity.tx, entity.ty, cam.rotation, entity._geometricR ?? geomR);
        const isoA   = Math.min(1, (cam.tilt - 0.02) / 0.14);

        // Shadow
        wr.submitShadow({
          p:       { x: entity.tx, y: entity.ty },
          elev,
          r:       halfA * VU,
          engineH: heightVU,
        });

        wr.submitWorldObject(depth, () => {
          wr.ctx.globalAlpha = isoA;
          wr._voxel.beginTile(entity.tx, entity.ty, elev);
          wr._voxel.setRotation(entity._facingAngle ?? 0);
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

  // ── Polygon-extrusion fallback (mirrors OSMTerrainLoader.makeBuildingDef) ─
  _fallbackPolygonDef(building, mPerTile, terrainRegistry, elevGrid) {
    const colorSet   = terrainRegistry?.colors?.['BUILDING'] ?? {};
    const topColor   = colorSet.top   ?? '#b0a090';
    const rightColor = colorSet.right ?? '#8a7a6a';
    const leftColor  = colorSet.left  ?? '#6a5a4a';

    const ring     = building._ring ?? building.nodes ?? [];
    const originGX = ring.length ? lonToGlobalX(ring[0].lon, ring[0].lat, mPerTile) : 0;
    const originGY = ring.length ? latToGlobalY(ring[0].lat, mPerTile)              : 0;
    const heightTiles = building.heightM / mPerTile;
    const halfA    = (building.obb?.halfA ?? Math.sqrt(Math.max(16, building.areaM2)) / 2) / mPerTile;
    const halfB    = (building.obb?.halfB ?? halfA) / mPerTile;
    const geomR    = Math.hypot(halfA, halfB);

    return {
      id:             `building_fb:${building.id ?? Math.random()}`,
      latitude:       building.centroid?.lat ?? 0,
      longitude:      building.centroid?.lon ?? 0,
      solid:          true,
      bboxRadius:     geomR,
      _geometricR:    geomR,
      physicsEnabled: false,
      fixed:          true,
      renderHeavy:    false,
      _isBuildingBox: true,
      _lodColor:      topColor,
      _ring:          ring,
      _originGX:      originGX,
      _originGY:      originGY,
      _mPerTile:      mPerTile,

      renderFn(wr, groundElevPx, extra, entity) {
        const { cam, ctx } = wr;
        if (cam.tilt < 0.02 || !entity._ring?.length) return;
        const elev  = groundElevPx + (entity.elevOffset ?? 0);
        const depth = frontDepth(entity.tx, entity.ty, cam.rotation, entity._geometricR ?? geomR);
        const hw    = tileHalfWidth(cam.zoom, cam.tileW);
        const hPx   = heightTiles * hw * cam.tilt * 2;

        wr.submitShadow({ p: { x: entity.tx, y: entity.ty }, elev, r: halfA * VU, engineH: heightTiles * VU });
        wr.submitWorldObject(depth, () => {
          const screenPts = entity._ring.map(n => {
            const gx = lonToGlobalX(n.lon, entity._ring[0].lat, entity._mPerTile ?? mPerTile);
            const gy = latToGlobalY(n.lat, entity._mPerTile ?? mPerTile);
            return worldToScreen(entity.tx + (gx - entity._originGX), entity.ty + (gy - entity._originGY), elev, cam);
          });
          if (screenPts.length < 3) return;
          if (hPx > 2) {
            ctx.beginPath();
            screenPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x + hPx * 0.5, p.y + hPx * 0.25) : ctx.lineTo(p.x + hPx * 0.5, p.y + hPx * 0.25));
            ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fill();
          }
          if (hPx > 1) {
            for (let i = 0; i < screenPts.length - 1; i++) {
              const a = screenPts[i], b2 = screenPts[i + 1];
              const ex = b2.x - a.x, ey = b2.y - a.y;
              if (-ey <= 0) continue;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y);
              ctx.lineTo(b2.x, b2.y - hPx); ctx.lineTo(a.x, a.y - hPx);
              ctx.closePath();
              ctx.fillStyle = Math.abs(Math.atan2(ey, ex)) < Math.PI / 2 ? rightColor : leftColor;
              ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.5; ctx.stroke();
            }
          }
          ctx.beginPath();
          screenPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y - hPx) : ctx.lineTo(p.x, p.y - hPx));
          ctx.closePath(); ctx.fillStyle = topColor; ctx.fill();
          ctx.strokeStyle = rightColor; ctx.lineWidth = 0.7; ctx.stroke();
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

  /**
   * Prune IDB cache entries older than maxAgeMs.
   * Call occasionally (e.g. on app startup) to prevent unbounded growth.
   */
  async pruneCache(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    // PersistentCache doesn't expose iteration; this is a no-op stub
    // that subclasses can override if they add iteration to PersistentCache.
    console.log('[ProceduralBlueprintGenerator] pruneCache: implement via PersistentCache.iterate()');
  }
}