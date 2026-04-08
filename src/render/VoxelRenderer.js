/**
 * GOE Core — VoxelRenderer
 * Draws isometric voxel boxes (the building block of all 3D objects).
 * Ported from the Garden of Eden engine.
 *
 * Usage:
 *   const vr = new VoxelRenderer(ctx, cam);
 *   vr.beginTile(tx, ty, baseElevPx);
 *   vr.box(x, y, z, w, h, d, topColor, rightColor, frontColor);
 *   vr.proj(vx, vy, vz) → {x, y} screen point inside current tile
 */
import { tileHalfWidth, tileHalfHeight } from '../math/projection.js';

export const VOXEL_UNITS = 8; // sub-tile resolution

export class VoxelRenderer {
  constructor(ctx, cam) {
    this.ctx   = ctx;
    this.cam   = cam;
    // Per-tile state (set in beginTile)
    this._tx   = 0;
    this._ty   = 0;
    this._base = 0; // base elevation in pixels
  }

  /** Call before drawing voxels on a specific tile. */
  beginTile(tx, ty, baseElevPx) {
    this._tx   = tx;
    this._ty   = ty;
    this._base = baseElevPx;
  }

    // Add this method:
  beginFrame() {
    const cam = this.cam;
    this._hw   = tileHalfWidth(cam.zoom, cam.tileW);
    this._hh   = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
    this._cr   = cam._cr;
    this._sr   = cam._sr;
    this._vu   = (this._hh * 2) / VOXEL_UNITS;
    this._mw2  = cam.mapW / 2;
    this._mh2  = cam.mapH / 2;
  }

  /** Project a voxel-space point to screen coords. */
  proj(vx, vy, vz) {
    const cam = this.cam;
    const hw  = tileHalfWidth(cam.zoom, cam.tileW);
    const hh  = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
    const cr  = Math.cos(cam.rotation), sr = Math.sin(cam.rotation);
    const tx  = this._tx + 0.5 + vx / VOXEL_UNITS;
    const tz  = this._ty + 0.5 + vz / VOXEL_UNITS;
    const xw  = tx - cam.mapW / 2, zw = tz - cam.mapH / 2;
    const xr  = xw * cr + zw * sr, zr = -xw * sr + zw * cr;
    const vu  = (hh * 2) / VOXEL_UNITS;
    return {
      x: (xr - zr) * hw - cam.camX,
      y: (xr + zr) * hh - (this._base + vy * vu) - cam.camY,
    };
  }

  /**
   * Draw a single axis-aligned voxel box.
   * @param {number} x,y,z   Origin in voxel units
   * @param {number} w,h,d   Size in voxel units
   * @param {string} top     Hex colour for top face
   * @param {string} right   Hex colour for right face
   * @param {string} front   Hex colour for front face
   */
  box(x, y, z, w, h, d, top, right, front) {
    const vp   = (px, py, pz) => this.proj(px, py, pz);
    const cam  = this.cam;
    const snap = ((Math.round(cam.rotation / (Math.PI / 2)) % 4) + 4) % 4;
    let fA, fB, cA, cB;

    if (snap === 0) {
      fA = [vp(x+w,y,z),vp(x+w,y+h,z),vp(x+w,y+h,z+d),vp(x+w,y,z+d)]; cA = right;
      fB = [vp(x,y,z+d),vp(x+w,y,z+d),vp(x+w,y+h,z+d),vp(x,y+h,z+d)]; cB = front;
    } else if (snap === 1) {
      fA = [vp(x,y,z+d),vp(x+w,y,z+d),vp(x+w,y+h,z+d),vp(x,y+h,z+d)]; cA = right;
      fB = [vp(x,y,z),vp(x,y+h,z),vp(x,y+h,z+d),vp(x,y,z+d)]; cB = front;
    } else if (snap === 2) {
      fA = [vp(x,y,z),vp(x,y+h,z),vp(x,y+h,z+d),vp(x,y,z+d)]; cA = right;
      fB = [vp(x,y,z),vp(x+w,y,z),vp(x+w,y+h,z),vp(x,y+h,z)]; cB = front;
    } else {
      fA = [vp(x,y,z),vp(x+w,y,z),vp(x+w,y+h,z),vp(x,y+h,z)]; cA = right;
      fB = [vp(x+w,y,z),vp(x+w,y+h,z),vp(x+w,y+h,z+d),vp(x+w,y,z+d)]; cB = front;
    }

    const topPts = [vp(x,y+h,z), vp(x+w,y+h,z), vp(x+w,y+h,z+d), vp(x,y+h,z+d)];
    this._poly(topPts, top);
    this._poly(fA, cA);
    this._poly(fB, cB);
  }

  _poly(pts, color) {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}