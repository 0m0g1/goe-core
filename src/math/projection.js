/**
 * GOE Core — Projection Math
 *
 * CHUNKING REFACTOR
 * -----------------
 * worldToScreen() and screenToWorld() now use cam.focusX / cam.focusY
 * as the world-space origin instead of cam.mapW/2 and cam.mapH/2.
 *
 * All entity coordinates are now GLOBAL TILE COORDINATES. The camera's
 * focusX/focusY (kept == player.tx/ty every frame) is the point that
 * maps to screen-pixel (−camX, −camY).  Setting camX = −W/2, camY = −H/2
 * centres the focus on a canvas of width W and height H.
 *
 * Nothing else in this file changes.
 *
 * Coordinate spaces:
 *   World (tx, ty) — global tile-space floats, origin at geo (0,0)
 *   Screen (sx, sy) — pixel coords on the canvas, origin top-left
 *   Camera (camX,camY) — pixel nudge; focus maps to screen (−camX, −camY)
 */

// ─── TILT / EASE ─────────────────────────────────────────────────────────────

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

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
 * Project a global-tile position to screen pixels.
 *
 * @param {number} tx   Global tile X  (entity's static world coordinate)
 * @param {number} ty   Global tile Y
 * @param {number} elev Elevation offset in pixels (already scaled)
 * @param {object} cam  Camera state:
 *                        { tilt, zoom, camX, camY, rotation,
 *                          focusX, focusY, tileW }
 *
 * Key change: origin is now cam.focusX / cam.focusY, not cam.mapW/2 / cam.mapH/2.
 */
export function worldToScreen(tx, ty, elev, cam) {
  const hw = tileHalfWidth(cam.zoom, cam.tileW);
  const hh = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
  // Offset from the camera's focus tile
  const xw = tx - cam.focusX;
  const zw = ty - cam.focusY;
  const cr = Math.cos(cam.rotation);
  const sr = Math.sin(cam.rotation);
  const xr =  xw * cr + zw * sr;
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
  const cr = Math.cos(cam.rotation);
  const sr = Math.sin(cam.rotation);
  // Offset from focus
  const cx = tx - cam.focusX;
  const cz = ty - cam.focusY;
  return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([dx, dz]) => {
    const xw = cx + dx;
    const zw = cz + dz;
    const xr =  xw * cr + zw * sr;
    const zr = -xw * sr + zw * cr;
    return { x: (xr - zr) * hw - cam.camX, y: (xr + zr) * hh - elev - cam.camY };
  });
}

/**
 * Depth sort key — back-to-front draw order.
 */
export function tileDepth(tx, ty, rotation, footprintRadius = 0) {
  const cr = Math.cos(rotation);
  const sr = Math.sin(rotation);
  const bx = tx - footprintRadius;
  const bz = ty - footprintRadius;
  const xr =  bx * cr + bz * sr;
  const zr = -bx * sr + bz * cr;
  return xr + zr;
}

/**
 * Depth of the FRONT CORNER of a square bounding box.
 */
export function frontDepth(tx, ty, rot, r) {
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  return (tx + Math.sign(cr) * r) * cr + (ty + Math.sign(sr) * r) * sr;
}

// ─── SCREEN → WORLD ──────────────────────────────────────────────────────────

/**
 * Unproject a screen point back to GLOBAL tile coordinates.
 *
 * Key change: result is offset from cam.focusX / cam.focusY,
 * returning a global tile position.
 */
export function screenToWorld(sx, sy, cam) {
  const px = sx + cam.camX;
  const py = sy + cam.camY;
  const hw = tileHalfWidth(cam.zoom, cam.tileW);
  const hh = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
  const rx = px / hw;
  const rz = py / hh;
  const xr = (rx + rz) * 0.5;
  const zr = (rz - rx) * 0.5;
  const cr = Math.cos(cam.rotation);
  const sr = Math.sin(cam.rotation);
  return {
    // Add back the global focus to get a global tile coordinate
    x: xr * cr - zr * sr + cam.focusX,
    y: xr * sr + zr * cr + cam.focusY,
  };
}

// ─── COLOUR UTILS ────────────────────────────────────────────────────────────

export function lerpColor(a, b, t) {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ch = (h, s) => (h >> s) & 255;
  return `rgb(${
    Math.round(ch(ah, 16) + (ch(bh, 16) - ch(ah, 16)) * t)},${
    Math.round(ch(ah, 8)  + (ch(bh, 8)  - ch(ah, 8))  * t)},${
    Math.round((ah & 255) + ((bh & 255) - (ah & 255))  * t)})`;
}

export function shadeHex(hex, f) {
  const h = parseInt(hex.slice(1), 16);
  return '#' + [16, 8, 0]
    .map(s => Math.floor(((h >> s) & 255) * f).toString(16).padStart(2, '0'))
    .join('');
}

// ─── ZOOM HELPER ─────────────────────────────────────────────────────────────

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