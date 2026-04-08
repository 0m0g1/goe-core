/**
 * GOE Core — BuildingPreprocessor
 * Resolves OSM building elements into rich feature objects with
 * accurate heights (via tag heuristics) and footprint areas.
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

/**
 * Pre-process raw OSM building elements into renderable feature objects.
 * @param {object[]} rawBuildings  OSM way elements with .geometry and .tags
 * @returns {BuildingFeature[]}
 */
export function preprocessBuildings(rawBuildings) {
  return rawBuildings
    .filter(el => el.geometry?.length >= 3)
    .map(el => {
      const nodes    = el.geometry.map(g => ({ lat: g.lat, lon: g.lon }));
      const centroid = polygonCentroid(nodes);
      const heightM  = resolveBuildingHeight(el.tags);
      const areaM2   = shoelaceArea(nodes, centroid.lat);
      const floors   = Math.max(1, Math.round(heightM / METRES_PER_FLOOR));
      return {
        id:       String(el.id),
        nodes,
        centroid,
        heightM,
        areaM2,
        floors,
        tags:     el.tags ?? {},
      };
    });
}