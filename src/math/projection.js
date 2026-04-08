/**
 * GOE Core — Projection Math
 * All coordinate transform math for the isometric / flat-map hybrid renderer.
 *
 * Coordinate spaces:
 *   World (tx, ty) — tile-space floats, origin top-left of the local chunk
 *   Screen (sx, sy) — pixel coords on the canvas, origin top-left
 *   Camera  (camX, camY) — scroll offset from world-origin to canvas top-left
 */

// ─── TILT / EASE ─────────────────────────────────────────────────────────────

/** Ease-in-out interpolation */
export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Map zoom level to a 0-1 tilt factor.
 * Below ZOOM_FLAT → completely flat (top-down).
 * Above ZOOM_ISO  → full isometric.
 */
export function zoomToTilt(zoom, zoomFlat = 0.18, zoomIso = 0.58) {
  if (zoom <= zoomFlat) return 0;
  if (zoom >= zoomIso)  return 1;
  return easeInOut((zoom - zoomFlat) / (zoomIso - zoomFlat));
}

// ─── TILE DIMENSIONS ─────────────────────────────────────────────────────────

export function tileHalfWidth(zoom, tileW = 64)  { return (tileW * zoom) / 2; }
export function tileHalfHeight(tilt, zoom, tileW = 64) {
  return tileHalfWidth(zoom, tileW) * (1 - tilt * 0.5);
}
export function getElevOffset(tileHeight, tilt, zoom) {
  return tileHeight * zoom * tilt * tilt;
}

// ─── WORLD → SCREEN ──────────────────────────────────────────────────────────

/**
 * Project a world-tile position to screen pixels.
 * @param {number} tx   World tile X
 * @param {number} ty   World tile Y
 * @param {number} elev Elevation offset in pixels (already scaled)
 * @param {object} cam  Camera state {tilt, zoom, camX, camY, rotation, mapW, mapH, tileW}
 */
export function worldToScreen(tx, ty, elev, cam) {
  const hw = tileHalfWidth(cam.zoom, cam.tileW);
  const hh = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
  const xw = tx - cam.mapW / 2;
  const zw = ty - cam.mapH / 2;
  const cr = Math.cos(cam.rotation), sr = Math.sin(cam.rotation);
  const xr = xw * cr + zw * sr;
  const zr = -xw * sr + zw * cr;
  return {
    x: (xr - zr) * hw - cam.camX,
    y: (xr + zr) * hh - elev - cam.camY,
  };
}

/**
 * Get the four screen-space corners of a tile's top face.
 */
export function topFaceQuad(tx, ty, elev, cam) {
  const hw = tileHalfWidth(cam.zoom, cam.tileW);
  const hh = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
  const cr = Math.cos(cam.rotation), sr = Math.sin(cam.rotation);
  const cx = tx - cam.mapW / 2, cz = ty - cam.mapH / 2;
  return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([dx, dz]) => {
    const xw = cx + dx, zw = cz + dz;
    const xr = xw * cr + zw * sr, zr = -xw * sr + zw * cr;
    return { x: (xr - zr) * hw - cam.camX, y: (xr + zr) * hh - elev - cam.camY };
  });
}

/**
 * Depth sort key for a tile — used to determine back-to-front draw order.
 */
export function tileDepth(tx, ty, rotation) {
  const xw = tx, zw = ty;
  return (xw * Math.cos(rotation) + zw * Math.sin(rotation))
       + (-xw * Math.sin(rotation) + zw * Math.cos(rotation));
}

// ─── SCREEN → WORLD ──────────────────────────────────────────────────────────

/**
 * Unproject a screen point back to world-tile coordinates (flat / top-down only).
 */
export function screenToWorld(sx, sy, cam) {
  const px = sx + cam.camX, py = sy + cam.camY;
  const hw = tileHalfWidth(cam.zoom, cam.tileW);
  const hh = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
  const rx = px / hw, rz = py / hh;
  const xr = (rx + rz) * 0.5, zr = (rz - rx) * 0.5;
  const cr = Math.cos(cam.rotation), sr = Math.sin(cam.rotation);
  return {
    x: xr * cr - zr * sr + cam.mapW / 2,
    y: xr * sr + zr * cr + cam.mapH / 2,
  };
}

// ─── COLOUR UTILS ────────────────────────────────────────────────────────────

/** Linear-interpolate between two hex colours. */
export function lerpColor(a, b, t) {
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
  const ch = (h, s) => (h >> s) & 255;
  return `rgb(${
    Math.round(ch(ah, 16) + (ch(bh, 16) - ch(ah, 16)) * t)},${
    Math.round(ch(ah, 8)  + (ch(bh, 8)  - ch(ah, 8))  * t)},${
    Math.round((ah & 255) + ((bh & 255) - (ah & 255))  * t)})`;
}

/** Multiply a hex colour's brightness by factor f (0–1). */
export function shadeHex(hex, f) {
  const h = parseInt(hex.slice(1), 16);
  return '#' + [16, 8, 0]
    .map(s => Math.floor(((h >> s) & 255) * f).toString(16).padStart(2, '0'))
    .join('');
}

// ─── ZOOM HELPER ─────────────────────────────────────────────────────────────

/**
 * Apply a zoom delta anchored to a screen point (ax, ay).
 * Mutates cam in place; returns cam.
 */
export function applyZoom(cam, newZoom, ax, ay, zoomMin, zoomMax) {
  newZoom = Math.max(zoomMin, Math.min(zoomMax, newZoom));
  ax = ax ?? 0;
  ay = ay ?? 0;
  const wx = (ax + cam.camX) / cam.zoom;
  const wy = (ay + cam.camY) / cam.zoom;
  cam.zoom = newZoom;
  cam.camX = wx * newZoom - ax;
  cam.camY = wy * newZoom - ay;
  return cam;
}