/**
 * GOE Core — Geo Math
 * Utilities for converting between geographic coordinates (lat/lon),
 * slippy-map tile indices, and the engine's local tile-space.
 */

// ─── LAT/LON ↔ LOCAL TILE ────────────────────────────────────────────────────

/**
 * Convert geographic coords to local tile-space around a centre point.
 * @param {number} lat
 * @param {number} lon
 * @param {{lat:number, lon:number}} center
 * @param {number} mPerTile  Metres per tile in the local chunk
 * @param {number} mapW      Chunk width in tiles
 * @param {number} mapH      Chunk height in tiles
 */
export function geoToTile(lat, lon, center, mPerTile = 2, mapW = 80, mapH = 80) {
  const mLat = 111320;
  const mLon = 111320 * Math.cos(center.lat * Math.PI / 180);
  return {
    x: mapW / 2 + (lon - center.lon) * mLon / mPerTile,
    y: mapH / 2 - (lat - center.lat) * mLat / mPerTile,
  };
}

/**
 * Convert local tile-space coords back to geographic coords.
 */
export function tileToGeo(tx, ty, center, mPerTile = 2, mapW = 80, mapH = 80) {
  const mLat = 111320;
  const mLon = 111320 * Math.cos(center.lat * Math.PI / 180);
  return {
    lat: center.lat + (mapH / 2 - ty) * mPerTile / mLat,
    lon: center.lon + (tx - mapW / 2) * mPerTile / mLon,
  };
}

// ─── GLOBAL TILE GRID ────────────────────────────────────────────────────────

/**
 * Convert a longitude to a global grid X integer (used for the terrain cache key).
 * Resolution = mPerTile metres per cell.
 */
export function lonToGlobalX(lon, refLat, mPerTile = 2) {
  const mLon = 111320 * Math.cos(refLat * Math.PI / 180);
  return Math.floor((lon * mLon) / mPerTile);
}

/**
 * Convert a latitude to a global grid Y integer.
 * Latitude increases northward, so negate to keep Y increasing southward.
 */
export function latToGlobalY(lat, mPerTile = 2) {
  return Math.floor((-lat * 111320) / mPerTile);
}

export function toGlobalKey(lat, lon, refLat, mPerTile = 2) {
  return `${lonToGlobalX(lon, refLat, mPerTile)},${latToGlobalY(lat, mPerTile)}`;
}

// ─── SLIPPY MAP TILES ─────────────────────────────────────────────────────────

/** Convert lat/lon to fractional slippy-map tile coordinates at zoom z. */
export function latLonToSlippy(lat, lon, z) {
  const n = Math.pow(2, z);
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y, tileX: Math.floor(x), tileY: Math.floor(y) };
}

/** Convert slippy tile (x, y, z) back to the NW corner lat/lon. */
export function slippyTileToLatLon(x, y, z) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return {
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
    lon: (x / Math.pow(2, z)) * 360 - 180,
  };
}

// ─── HAVERSINE DISTANCE ───────────────────────────────────────────────────────

export function haversineMeters(a, b) {
  const R = 6371000;
  const φ1 = a.lat * Math.PI / 180, φ2 = b.lat * Math.PI / 180;
  const Δφ = (b.lat - a.lat) * Math.PI / 180;
  const Δλ = (b.lon - a.lon) * Math.PI / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ─── POLYGON UTILS ───────────────────────────────────────────────────────────

/** Centroid of a lat/lon polygon ring. */
export function polygonCentroid(nodes) {
  if (!nodes?.length) return { lat: 0, lon: 0 };
  return {
    lat: nodes.reduce((s, n) => s + n.lat, 0) / nodes.length,
    lon: nodes.reduce((s, n) => s + n.lon, 0) / nodes.length,
  };
}

/** Shoelace area in m² of a lat/lon polygon ring. */
export function shoelaceArea(nodes, refLat) {
  if (!nodes || nodes.length < 3) return 0;
  const pts = [...nodes];
  if (pts[0].lat !== pts[pts.length - 1].lat || pts[0].lon !== pts[pts.length - 1].lon)
    pts.push(pts[0]);
  const ref  = refLat ?? pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const mLat = 111320, mLon = 111320 * Math.cos((ref * Math.PI) / 180);
  const m    = pts.map(n => ({ x: n.lon * mLon, y: n.lat * mLat }));
  let area = 0;
  for (let i = 0; i < m.length - 1; i++)
    area += m[i].x * m[i + 1].y - m[i + 1].x * m[i].y;
  return Math.abs(area) / 2;
}

// ─── BOUNDING BOX ────────────────────────────────────────────────────────────

export function boundsFromPoints(points) {
  if (!points.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon ?? p.lng ?? 0);
    maxLon = Math.max(maxLon, p.lon ?? p.lng ?? 0);
  }
  return { minLat, maxLat, minLon, maxLon };
}