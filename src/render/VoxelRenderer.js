/**
 * GOE Core — VoxelRenderer
 */
import { tileHalfWidth, tileHalfHeight, shadeHex } from '../math/projection.js';

export const VOXEL_UNITS = 8; 

export class VoxelRenderer {
  constructor(ctx, cam, shadowSystem = null) {
    this.ctx   = ctx;
    this.cam   = cam;
    this._shadows = shadowSystem;
    this._tx   = 0;
    this._ty   = 0;
    this._base = 0; 
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
    const xw  = tx - this._mw2, zw = tz - this._mh2;
    const xr  = xw * this._cr + zw * this._sr;
    const zr  = -xw * this._sr + zw * this._cr;
    return {
      x: (xr - zr) * this._hw - cam.camX,
      y: (xr + zr) * this._hh - (this._base + vy * this._vu) - cam.camY,
    };
  }

  // src/render/VoxelRenderer.js Update
  _poly(pts, color, detailed = false) {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Add subtle edge highlighting
    if (detailed && this.cam.zoom > 0.4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; // Highlight top edges
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  box(x, y, z, w, h, d, top, right, front) {
    const vp   = (px, py, pz) => this.proj(px, py, pz);
    const cam  = this.cam;
    const shadows = this._shadows;

    // Apply lighting factors based on sun orientation
    let cTop = top, cRight = right, cFront = front;
    if (shadows?.enabled) {
        cTop   = shadeHex(top, shadows.sunElevation / (Math.PI/2));
        cRight = shadeHex(right, shadows.getLightFactor(0));         // Normal facing +X
        cFront = shadeHex(front, shadows.getLightFactor(Math.PI/2)); // Normal facing +Y
    }

    const snap = ((Math.round(cam.rotation / (Math.PI / 2)) % 4) + 4) % 4;
    let fA, fB, cA, cB;

    if (snap === 0) {
      fA = [vp(x+w,y,z),vp(x+w,y+h,z),vp(x+w,y+h,z+d),vp(x+w,y,z+d)]; cA = cRight;
      fB = [vp(x,y,z+d),vp(x+w,y,z+d),vp(x+w,y+h,z+d),vp(x,y+h,z+d)]; cB = cFront;
    } else if (snap === 1) {
      fA = [vp(x,y,z+d),vp(x+w,y,z+d),vp(x+w,y+h,z+d),vp(x,y+h,z+d)]; cA = cRight;
      fB = [vp(x,y,z),vp(x,y+h,z),vp(x,y+h,z+d),vp(x,y,z+d)]; cB = cFront;
    } else if (snap === 2) {
      fA = [vp(x,y,z),vp(x,y+h,z),vp(x,y+h,z+d),vp(x,y,z+d)]; cA = cRight;
      fB = [vp(x,y,z),vp(x+w,y,z),vp(x+w,y+h,z),vp(x,y+h,z)]; cB = cFront;
    } else {
      fA = [vp(x,y,z),vp(x+w,y,z),vp(x+w,y+h,z),vp(x,y+h,z)]; cA = cRight;
      fB = [vp(x+w,y,z),vp(x+w,y+h,z),vp(x+w,y+h,z+d),vp(x+w,y,z+d)]; cB = cFront;
    }

    this._poly([vp(x,y+h,z), vp(x+w,y+h,z), vp(x+w,y+h,z+d), vp(x,y+h,z+d)], cTop);
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