/**
 * GOE Core — VoxelRenderer
 *
 * CHUNKING REFACTOR
 * -----------------
 * beginFrame() previously cached   _mw2 = cam.mapW/2  and  _mh2 = cam.mapH/2
 * as the local-chunk world origin. They are replaced by:
 *
 *   _focusX = cam.focusX   (global tile X the camera is aimed at)
 *   _focusY = cam.focusY   (global tile Y)
 *
 * proj() and projInto() subtract _focusX/_focusY instead of _mw2/_mh2.
 * Because entity coordinates are now global tile positions, the voxel
 * blueprint origin (this._tx, this._ty) is already in global space and
 * the per-voxel sub-tile offset (lx/VOXEL_UNITS, lz/VOXEL_UNITS) is
 * unchanged. All other logic is identical to the previous version.
 *
 * Memory fix (FIX F) carried forward unchanged:
 *   Pre-allocated Float64Array(_corners, length 16) eliminates per-box
 *   heap allocations; projInto() writes directly into the buffer.
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

    this._rotCos  = 1;
    this._rotSin  = 0;
    this._rotRad  = 0;

    // FIX F — pre-allocated corner buffer: 8 corners × 2 floats (x, y)
    this._corners = new Float64Array(16);
  }

  setRotation(compassDeg) {
    const rad    = (compassDeg - 180) * Math.PI / 180;
    this._rotRad = rad;
    this._rotCos = Math.cos(rad);
    this._rotSin = Math.sin(rad);
  }

  clearRotation() {
    this._rotRad = 0;
    this._rotCos = 1;
    this._rotSin = 0;
  }

  beginTile(tx, ty, baseElevPx) {
    this._tx   = tx;
    this._ty   = ty;
    this._base = baseElevPx;
  }

  /**
   * Cache hot per-frame values.
   *
   * CHUNKING CHANGE: _focusX/_focusY replace the old _mw2/_mh2.
   * All projection math subtracts the camera's global focus position
   * so that voxels at the focus project to screen origin (before camX/Y).
   */
  beginFrame() {
    const cam    = this.cam;
    this._hw     = tileHalfWidth(cam.zoom, cam.tileW);
    this._hh     = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
    this._cr     = Math.cos(cam.rotation);
    this._sr     = Math.sin(cam.rotation);
    this._vu     = (this._hh * 2) / VOXEL_UNITS;
    // CHUNKING: global focus tile replaces local-chunk half-size
    this._focusX = cam.focusX;
    this._focusY = cam.focusY;
  }

  /**
   * Project a voxel-space point and return a plain {x,y}.
   * Still used externally (e.g. decorateBuildingFacade).
   *
   * CHUNKING CHANGE: subtracts _focusX/_focusY instead of _mw2/_mh2.
   */
  proj(vx, vy, vz) {
    const lx  = vx * this._rotCos - vz * this._rotSin;
    const lz  = vx * this._rotSin + vz * this._rotCos;
    const cam = this.cam;
    const tx  = this._tx + 0.5 + lx / VOXEL_UNITS;
    const tz  = this._ty + 0.5 + lz / VOXEL_UNITS;
    // Offset from global focus (was: local chunk origin)
    const xw  = tx - this._focusX;
    const zw  = tz - this._focusY;
    const xr  =  xw * this._cr + zw * this._sr;
    const zr  = -xw * this._sr + zw * this._cr;
    return {
      x: (xr - zr) * this._hw - cam.camX,
      y: (xr + zr) * this._hh - (this._base + vy * this._vu) - cam.camY,
    };
  }

  /**
   * FIX F — Write projected corner directly into _corners buffer.
   *
   * CHUNKING CHANGE: subtracts _focusX/_focusY instead of _mw2/_mh2.
   */
  projInto(i, vx, vy, vz) {
    const lx  = vx * this._rotCos - vz * this._rotSin;
    const lz  = vx * this._rotSin + vz * this._rotCos;
    const cam = this.cam;
    const tx  = this._tx + 0.5 + lx / VOXEL_UNITS;
    const tz  = this._ty + 0.5 + lz / VOXEL_UNITS;
    // Offset from global focus (was: local chunk origin)
    const xw  = tx - this._focusX;
    const zw  = tz - this._focusY;
    const xr  =  xw * this._cr + zw * this._sr;
    const zr  = -xw * this._sr + zw * this._cr;
    const idx = i << 1;
    this._corners[idx]     = (xr - zr) * this._hw - cam.camX;
    this._corners[idx + 1] = (xr + zr) * this._hh - (this._base + vy * this._vu) - cam.camY;
  }

  // FIX A — Batched compound-path accumulator.
  // Faces sharing the same fillStyle are collected into one open beginPath()
  // and flushed with a single fill() only when the color changes or
  // flushBatch() is called explicitly at the end of a tile.
  //
  // Usage contract:
  //   • Call beginBatch() once before drawing a blueprint.
  //   • Replace every _polyIdx call with _polyIdxBatched.
  //   • Call flushBatch() after the last face of the blueprint.
  //
  // The edge-stroke path is uncommon (zoom > 0.4 only) and is kept as an
  // immediate stroke after each face so it doesn't need its own batching.

  beginBatch() {
    this._batchColor = null;
    this._batchOpen  = false;
  }

  _polyIdxBatched(ids, color, edge) {
    const ctx = this.ctx;
    const c   = this._corners;

    // Flush previous batch if color changed
    if (this._batchColor !== color) {
      if (this._batchOpen) {
        ctx.fillStyle = this._batchColor;
        ctx.fill();
        this._batchOpen = false;
      }
      this._batchColor = color;
      ctx.beginPath();
      this._batchOpen = true;
    }

    const i0 = ids[0] << 1;
    ctx.moveTo(c[i0], c[i0 + 1]);
    for (let k = 1; k < ids.length; k++) {
      const ik = ids[k] << 1;
      ctx.lineTo(c[ik], c[ik + 1]);
    }
    ctx.closePath();   // subpath closed; next moveTo starts a new subpath

    if (edge && this.cam.zoom > 0.4) {
      // Stroke must be immediate (needs its own path state)
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth   = 0.8;
      ctx.stroke();
      ctx.beginPath();    // restart batch path after the stroke
      this._batchOpen = true;
    }
  }

  flushBatch() {
    if (this._batchOpen && this._batchColor !== null) {
      this.ctx.fillStyle = this._batchColor;
      this.ctx.fill();
    }
    this._batchOpen  = false;
    this._batchColor = null;
  }

  // Legacy immediate-mode path — kept for the public proj() / _poly() callers
  // (decorateBuildingFacade etc.) that are not on the hot box() path.
  _polyIdx(ids, color, edge) {
    const ctx = this.ctx;
    const c   = this._corners;
    const i0  = ids[0] << 1;
    ctx.beginPath();
    ctx.moveTo(c[i0], c[i0 + 1]);
    for (let k = 1; k < ids.length; k++) {
      const ik = ids[k] << 1;
      ctx.lineTo(c[ik], c[ik + 1]);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (edge && this.cam.zoom > 0.4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth   = 0.8;
      ctx.stroke();
    }
  }

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

  box(x, y, z, w, h, d, top, right, front) {
    const cam     = this.cam;
    const shadows = this._shadows;
    const edge = false; // Disable strokes for massive performance gain

    let cTop = top, cRight = right, cFront = front;
    if (shadows?.enabled) {
      cTop   = shadeHex(top,   shadows.sunElevation / (Math.PI / 2));
      cRight = shadeHex(right, shadows.getLightFactor(0));
      cFront = shadeHex(front, shadows.getLightFactor(Math.PI / 2));
    }

    const effectiveAngle = cam.rotation + this._rotRad;
    const snap = ((Math.round(effectiveAngle / (Math.PI / 2)) % 4) + 4) % 4;

    this.projInto(0, x,     y,     z    );
    this.projInto(1, x + w, y,     z    );
    this.projInto(2, x + w, y,     z + d);
    this.projInto(3, x,     y,     z + d);
    this.projInto(4, x,     y + h, z    );
    this.projInto(5, x + w, y + h, z    );
    this.projInto(6, x + w, y + h, z + d);
    this.projInto(7, x,     y + h, z + d);

    // FIX A: use batched variant — consecutive same-color faces share one path.
    this._polyIdxBatched([4, 5, 6, 7], cTop, edge);

    switch (snap) {
      case 0:
        this._polyIdxBatched([5, 1, 2, 6], cRight, edge);
        this._polyIdxBatched([6, 2, 3, 7], cFront, edge);
        break;
      case 1:
        this._polyIdxBatched([6, 2, 3, 7], cRight, edge);
        this._polyIdxBatched([7, 3, 0, 4], cFront, edge);
        break;
      case 2:
        this._polyIdxBatched([7, 3, 0, 4], cRight, edge);
        this._polyIdxBatched([4, 0, 1, 5], cFront, edge);
        break;
      case 3:
        this._polyIdxBatched([4, 0, 1, 5], cRight, edge);
        this._polyIdxBatched([5, 1, 2, 6], cFront, edge);
        break;
    }
  }
}