/**
 * GOE Core — VoxelRenderer
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

  proj(vx, vy, vz) {
    const cam = this.cam;
    const tx  = this._tx + 0.5 + vx / VOXEL_UNITS;
    const tz  = this._ty + 0.5 + vz / VOXEL_UNITS;
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
    // snap 0: camera faces +X/+Z corner  (default isometric south-east)
    // snap 1: camera faces +X/-Z corner  (rotated 90° CW)
    // snap 2: camera faces -X/-Z corner  (rotated 180°)
    // snap 3: camera faces -X/+Z corner  (rotated 270° CW)
    const snap = ((Math.round(cam.rotation / (Math.PI / 2)) % 4) + 4) % 4;

    // Precompute all 8 corners only once
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