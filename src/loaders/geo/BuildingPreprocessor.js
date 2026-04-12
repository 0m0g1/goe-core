/**
 * GOE Core — BuildingPreprocessor
 *
 * Changes:
 *   A. computeOBB() — oriented bounding box from the actual polygon ring.
 *      Returns halfA (long axis, metres), halfB (short axis), angleDeg
 *      (compass bearing of long axis). Buildings now render as rectangles
 *      aligned to their real-world footprint instead of uniform squares.
 *
 *   B. filterNested() — removes buildings whose centroid falls inside a
 *      significantly larger building's polygon. Eliminates the "building
 *      on a building roof" artefact caused by OSM sub-part polygons.
 *
 *   C. preprocessBuildings() now returns OBB fields on every feature and
 *      runs nested filtering before returning.
 */
import { polygonCentroid, shoelaceArea } from '../../math/geo.js';

export const METRES_PER_FLOOR   = 3.8;
export const DEFAULT_BUILDING_H = 3.5;

/** Parse a distance string like "20m", "65ft" to metres. */
export function parseMetres(str) {
  if (typeof str === 'number') return str;
  const s = String(str).trim().toLowerCase();
  const ft = s.match(/^([\d.]+)\s*(ft|feet|'|foot)$/);
  if (ft) return parseFloat(ft[1]) * 0.3048;
  const m = s.match(/^([\d.]+)/);
  if (m) return parseFloat(m[1]);
  return NaN;
}

/** Resolve building height from OSM tags. */
export function resolveBuildingHeight(tags = {}) {
  if (tags.height) {
    const h = parseMetres(tags.height);
    if (Number.isFinite(h) && h > 0) return h;
  }
  const levels = tags['building:levels'] ?? tags['building:floors'] ?? tags.levels ?? null;
  if (levels != null) {
    const n = parseFloat(levels);
    if (Number.isFinite(n) && n > 0) return n * METRES_PER_FLOOR;
  }
  return DEFAULT_BUILDING_H;
}

// ─── OBB ─────────────────────────────────────────────────────────────────────

/**
 * Compute an oriented bounding box for a lat/lon polygon ring.
 *
 * Strategy: iterate every edge of the ring, use each edge's direction as a
 * candidate axis, project all vertices onto that axis and its perpendicular,
 * and keep whichever axis yields the smallest bounding-box area. This is the
 * standard rotating-calipers OBB heuristic and works well for the rectilinear
 * footprints typical of buildings.
 *
 * Returns distances in metres so callers don't have to worry about degrees.
 *
 * @param {Array<{lat,lon}>} nodes  Closed or open polygon ring
 * @param {number} refLat           Reference latitude for lon→m conversion
 * @returns {{ halfA: number, halfB: number, angleDeg: number }}
 *   halfA    — half-length of the LONG axis in metres
 *   halfB    — half-length of the SHORT axis in metres
 *   angleDeg — compass bearing (0=N, 90=E) of the LONG axis
 */
export function computeOBB(nodes, refLat) {
  const mLat = 111320;
  const mLon = 111320 * Math.cos(refLat * Math.PI / 180);

  const pts = nodes.map(n => ({
    x: (n.lon - nodes[0].lon) * mLon,
    y: (n.lat - nodes[0].lat) * mLat,
  }));

  let bestArea = Infinity;
  let bestHalfA = 1, bestHalfB = 1, bestAngleDeg = 0;

  const n = pts.length;
  const last = (pts[n-1].x === pts[0].x && pts[n-1].y === pts[0].y) ? n-1 : n;

  for (let i = 0; i < last; i++) {
    const j   = (i + 1) % last;
    const ex  = pts[j].x - pts[i].x;
    const ey  = pts[j].y - pts[i].y;
    const len = Math.hypot(ex, ey);
    if (len < 0.5) continue;   // raised from 0.1 — skip near-degenerate edges

    const ax = ex / len, ay = ey / len;
    const bx = -ay,      by = ax;

    let minA = Infinity, maxA = -Infinity;
    let minB = Infinity, maxB = -Infinity;
    for (const p of pts) {
      const a = p.x * ax + p.y * ay;
      const b = p.x * bx + p.y * by;
      if (a < minA) minA = a; if (a > maxA) maxA = a;
      if (b < minB) minB = b; if (b > maxB) maxB = b;
    }

    const spanA = maxA - minA;
    const spanB = maxB - minB;
    // Skip if either axis collapsed — means this edge is nearly parallel
    // to all other edges (degenerate polygon) or floating-point noise
    if (spanA < 0.5 || spanB < 0.5) continue;
    const area = spanA * spanB;

    if (area < bestArea) {
      bestArea = area;
      if (spanA >= spanB) {
        bestHalfA    = spanA / 2;
        bestHalfB    = spanB / 2;
        bestAngleDeg = (Math.atan2(ax, ay) * 180 / Math.PI + 360) % 360;
      } else {
        bestHalfA    = spanB / 2;
        bestHalfB    = spanA / 2;
        bestAngleDeg = (Math.atan2(bx, by) * 180 / Math.PI + 360) % 360;
      }
    }
  }

  // Sanity clamp: short axis must be at least 15% of long axis
  // and at least 1m. Prevents the flat-plane rendering of thin footprints.
  bestHalfB = Math.max(bestHalfB, bestHalfA * 0.15, 1);

  return {
    halfA:    Math.max(1, bestHalfA),
    halfB:    Math.max(1, bestHalfB),
    angleDeg: bestAngleDeg,
  };
}

// ─── Nested building filter ───────────────────────────────────────────────────

/**
 * Point-in-polygon test (ray casting) in lat/lon space.
 * Returns true if (lat, lon) is strictly inside the ring.
 */
function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lon, yi = ring[i].lat;
    const xj = ring[j].lon, yj = ring[j].lat;
    if ((yi > lat) !== (yj > lat) &&
        lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Remove buildings whose centroid falls inside a significantly larger
 * building's footprint.
 *
 * "Significantly larger" = parent area at least 2× child area. This
 * threshold prevents two similarly-sized adjacent buildings from
 * accidentally eating each other when one centroid is very close to
 * the other's edge.
 *
 * Named buildings (tags.name present) are always kept — they may be
 * labelled sub-structures (e.g. a named chapel inside a cathedral close).
 *
 * @param {BuildingFeature[]} buildings  Already sorted largest-first
 * @returns {BuildingFeature[]}
 */
function filterNested(buildings) {
  const kept = [];
  for (const b of buildings) {
    // Named buildings are always kept regardless of containment
    if (b.tags.name) {
      kept.push(b);
      continue;
    }
    const isNested = kept.some(parent =>
      parent.areaM2 >= b.areaM2 * 2 &&
      pointInRing(b.centroid.lat, b.centroid.lon, parent.nodes)
    );
    if (!isNested) kept.push(b);
  }
  return kept;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Pre-process raw OSM building elements into renderable feature objects.
 *
 * Each returned feature now carries:
 *   .obb  { halfA, halfB, angleDeg } — oriented bounding box
 *
 * These are consumed by makeBuildingDef() in OSMTerrainLoader to draw
 * a correctly shaped and oriented box rather than a uniform square.
 *
 * @param {object[]} rawBuildings  OSM way elements with .geometry and .tags
 * @returns {BuildingFeature[]}
 */
export function preprocessBuildings(rawBuildings) {
  const features = rawBuildings
    .filter(el => el.geometry?.length >= 3)
    .map(el => {
      const nodes    = el.geometry.map(g => ({ lat: g.lat, lon: g.lon }));
      const centroid = polygonCentroid(nodes);
      const heightM  = resolveBuildingHeight(el.tags);
      const areaM2   = shoelaceArea(nodes, centroid.lat);
      const floors   = Math.max(1, Math.round(heightM / METRES_PER_FLOOR));
      const obb      = computeOBB(nodes, centroid.lat);

      return {
        id:       String(el.id),
        nodes,
        geometry: nodes,
        centroid,
        heightM,
        areaM2,
        floors,
        obb,
        tags: el.tags ?? {},
        // ADD THIS — raw lat/lon ring for polygon rendering
        _ring: nodes,
      };
    });

  // Sort largest-first so filterNested() can scan only already-kept parents
  features.sort((a, b) => b.areaM2 - a.areaM2);

  return filterNested(features);
}