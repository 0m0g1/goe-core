/**
 * GOE Core — VoxelRenderer
 *
 * Rotation is now baked into proj() via setRotation() / clearRotation().
 * Every corner of every box goes through the same XZ rotation before the
 * camera transform, so arbitrary compass angles render correctly.
 */
import { tileHalfWidth, tileHalfHeight, shadeHex } from '../math/projection.js';

export const VOXEL_UNITS = 8;

export class VoxelRenderer {
  constructor(ctx, cam, shadowSystem = null) {
    this.ctx      = ctx;
    this.cam      = cam;
    this._shadows = shadowSystem;
    this._tx      = 0;
    this._ty      = 0;
    this._base    = 0;

    // Identity rotation by default
    this._rotCos  = 1;
    this._rotSin  = 0;
  }

  /**
   * Set per-entity XZ rotation from an OSM compass bearing.
   * Blueprints face Z+ (south) by default → bearing 180 = no rotation.
   * @param {number} compassDeg  0=N, 90=E, 180=S, 270=W
   */
  setRotation(compassDeg) {
    const rad     = (compassDeg - 180) * Math.PI / 180;
    this._rotCos  = Math.cos(rad);
    this._rotSin  = Math.sin(rad);
  }

  clearRotation() {
    this._rotCos = 1;
    this._rotSin = 0;
  }

  beginTile(tx, ty, baseElevPx) {
    this._tx   = tx;
    this._ty   = ty;
    this._base = baseElevPx;
  }

  /** Cache common projection constants once per frame for performance. */
  beginFrame() {
    const cam = this.cam;
    this._hw  = tileHalfWidth(cam.zoom, cam.tileW);
    this._hh  = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
    this._cr  = Math.cos(cam.rotation);
    this._sr  = Math.sin(cam.rotation);
    this._vu  = (this._hh * 2) / VOXEL_UNITS;
    this._mw2 = cam.mapW / 2;
    this._mh2 = cam.mapH / 2;
  }

  /**
   * Project a voxel-space point to screen space.
   * Applies entity-local XZ rotation BEFORE the camera rotation so every
   * corner of every box is correctly transformed for any compass angle.
   */
  proj(vx, vy, vz) {
    // 1. Entity-local XZ rotation (cos/sin set via setRotation())
    const lx = vx * this._rotCos - vz * this._rotSin;
    const lz = vx * this._rotSin + vz * this._rotCos;

    const cam = this.cam;
    const tx  = this._tx + 0.5 + lx / VOXEL_UNITS;
    const tz  = this._ty + 0.5 + lz / VOXEL_UNITS;
    const xw  = tx - this._mw2;
    const zw  = tz - this._mh2;
    const xr  =  xw * this._cr + zw * this._sr;
    const zr  = -xw * this._sr + zw * this._cr;
    return {
      x: (xr - zr) * this._hw - cam.camX,
      y: (xr + zr) * this._hh - (this._base + vy * this._vu) - cam.camY,
    };
  }

  /**
   * Draw a filled polygon face.
   * @param {Array<{x,y}>} pts    - projected vertices (3 or 4 points)
   * @param {string}       color  - CSS fill color
   * @param {boolean}      edge   - draw a subtle highlight stroke on visible edges
   */
  _poly(pts, color, edge = false) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    if (edge && this.cam.zoom > 0.4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth   = 0.8;
      ctx.stroke();
    }
  }

  /**
   * Draw a single voxel box with top, right-facing, and front-facing faces.
   * Visible faces are determined by the current camera rotation snap (0–3).
   * Rotation is handled automatically by proj() — box() needs no changes.
   *
   * @param {number} x      - voxel-space left edge
   * @param {number} y      - voxel-space bottom edge
   * @param {number} z      - voxel-space back edge
   * @param {number} w      - width  (x axis)
   * @param {number} h      - height (y axis)
   * @param {number} d      - depth  (z axis)
   * @param {string} top    - top face color
   * @param {string} right  - right-facing side color  (+X in snap=0)
   * @param {string} front  - front-facing side color  (+Z in snap=0)
   */
  box(x, y, z, w, h, d, top, right, front) {
    const vp      = (px, py, pz) => this.proj(px, py, pz);
    const cam     = this.cam;
    const shadows = this._shadows;
    const edge    = cam.zoom > 0.35;

    // ── Optional shadow-system lighting ───────────────────────────────────
    let cTop = top, cRight = right, cFront = front;
    if (shadows?.enabled) {
      cTop   = shadeHex(top,   shadows.sunElevation / (Math.PI / 2));
      cRight = shadeHex(right, shadows.getLightFactor(0));
      cFront = shadeHex(front, shadows.getLightFactor(Math.PI / 2));
    }

    // ── Rotation snap — which two side faces are visible ──────────────────
    const snap = ((Math.round(cam.rotation / (Math.PI / 2)) % 4) + 4) % 4;

    // Precompute all 8 corners — each goes through proj() which handles rotation
    const c = [
      vp(x,     y,     z    ),  // 0 BL bottom
      vp(x + w, y,     z    ),  // 1 BR bottom
      vp(x + w, y,     z + d),  // 2 FR bottom
      vp(x,     y,     z + d),  // 3 FL bottom
      vp(x,     y + h, z    ),  // 4 BL top
      vp(x + w, y + h, z    ),  // 5 BR top
      vp(x + w, y + h, z + d),  // 6 FR top
      vp(x,     y + h, z + d),  // 7 FL top
    ];

    // Top face — always visible
    this._poly([c[4], c[5], c[6], c[7]], cTop, edge);

    // Side faces — depends on snap
    switch (snap) {
      case 0:
        this._poly([c[5], c[1], c[2], c[6]], cRight,  edge); // +X face
        this._poly([c[6], c[2], c[3], c[7]], cFront,  edge); // +Z face
        break;
      case 1:
        this._poly([c[6], c[2], c[3], c[7]], cRight,  edge); // +Z face
        this._poly([c[7], c[3], c[0], c[4]], cFront,  edge); // -X face
        break;
      case 2:
        this._poly([c[7], c[3], c[0], c[4]], cRight,  edge); // -X face
        this._poly([c[4], c[0], c[1], c[5]], cFront,  edge); // -Z face
        break;
      case 3:
        this._poly([c[4], c[0], c[1], c[5]], cRight,  edge); // -Z face
        this._poly([c[5], c[1], c[2], c[6]], cFront,  edge); // +X face
        break;
    }
  }
}