/**
 * GOE Core — TileRenderer
 *
 * Accepts a WorldRenderer instead of raw ctx/cam.
 * All canvas operations go through WorldRenderer's drawing API.
 *
 * Changes from previous version:
 *  - Constructor: (worldRenderer, terrainRegistry, shadowSystem?)
 *    WorldRenderer already owns ShadowSystem; shadowSystem param kept for
 *    backward-compat but defaults to worldRenderer.shadowSystem.
 *  - _drawBakedImage uses worldRenderer.drawTransformedImage()
 *  - _drawHighlight / _drawGrid use worldRenderer.drawPolygon()
 */
import { lerpColor, tileDepth, worldToScreen, topFaceQuad } from '../math/projection.js';

function hexToRgb(hex) {
  if (!hex || hex[0] !== '#') return [128, 128, 128];
  const h = hex.slice(1);
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function lerpRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export class TileRenderer {
  /**
   * @param {WorldRenderer}  worldRenderer
   * @param {object}         terrainRegistry
   */
  constructor(worldRenderer, terrainRegistry) {
    this._wr     = worldRenderer;
    this.terrain = terrainRegistry;

    // Keep ctx / cam accessors for internal helpers
    this._shadows = worldRenderer.shadowSystem;

    this.BAKE_TILE_PX = 1;

    this._mapCanvas = document.createElement('canvas');
    this._mapCtx    = this._mapCanvas.getContext('2d', { alpha: false });

    this._lastPGX      = null;
    this._lastPGY      = null;
    this._lastSunAngle = this._shadows?.sunAngle     ?? 0;
    this._lastSunElev  = this._shadows?.sunElevation ?? 0;
    this._lastTilt     = null;
    this._bakeDirty    = true;

    this._baking      = false;
    this._pendingBake = null;

    this._rgbCache = this._buildRgbCache();
    this._sortBuf  = [];
  }

  get ctx() { return this._wr.ctx; }
  get cam() { return this._wr.cam; }

  // ── RGB cache ────────────────────────────────────────────────────────────

  _buildRgbCache() {
    const cache = {};
    for (const [id, c] of Object.entries(this.terrain.colors)) {
      cache[id] = {
        flat: hexToRgb(c.flat),
        top:  hexToRgb(c.top),
      };
    }
    return cache;
  }

  // ── Bake scheduling ──────────────────────────────────────────────────────

  _scheduleBake(terrainCache, pGX, pGY) {
    this._pendingBake = { terrainCache, pGX, pGY };
    if (this._baking) return;
    this._baking = true;

    const run = () => {
      if (!this._pendingBake) { this._baking = false; return; }

      const { terrainCache, pGX, pGY } = this._pendingBake;
      this._pendingBake = null;

      this._bakeMap(terrainCache, pGX, pGY);

      this._lastPGX      = pGX;
      this._lastPGY      = pGY;
      this._lastTilt     = this.cam.tilt;
      this._lastSunAngle = this._shadows?.sunAngle     ?? 0;
      this._lastSunElev  = this._shadows?.sunElevation ?? 0;
      this._baking       = false;

      if (this._pendingBake)
        this._scheduleBake(this._pendingBake.terrainCache, this._pendingBake.pGX, this._pendingBake.pGY);
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 50 });
    } else {
      setTimeout(run, 0);
    }
  }

  // ── Core bake ────────────────────────────────────────────────────────────

  _bakeMap(terrainCache, pGX, pGY) {
    const cam = this.cam;
    const W   = cam.mapW;
    const H   = cam.mapH;
    const PX  = this.BAKE_TILE_PX;
    const t   = Math.max(0, Math.min(1, cam.tilt));

    this._mapCanvas.width  = W * PX;
    this._mapCanvas.height = H * PX;

    const imgData = this._mapCtx.createImageData(W * PX, H * PX);
    const pixels  = imgData.data;

    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const tid = terrainCache.getLocal(tx, ty, pGX, pGY, W, H) ?? 5;
        const rgb = this._rgbCache[tid] ?? this._rgbCache[5];

        const [r, g, b] = lerpRgb(rgb.flat, rgb.top, t);
        const base = (ty * W * PX + tx) * 4;
        pixels[base]     = r;
        pixels[base + 1] = g;
        pixels[base + 2] = b;
        pixels[base + 3] = 255;
      }
    }

    this._mapCtx.putImageData(imgData, 0, 0);
    this._bakeDirty = false;
  }

  // ── Stale-check ──────────────────────────────────────────────────────────

  _needsRebake(pGX, pGY) {
    if (this._bakeDirty)                                          return true;
    if (pGX !== this._lastPGX || pGY !== this._lastPGY)          return true;
    if (Math.abs(this.cam.tilt - (this._lastTilt ?? -1)) > 0.01) return true;
    if (this._shadows?.enabled) {
      if (Math.abs((this._shadows.sunAngle     ?? 0) - this._lastSunAngle) > 0.1)  return true;
      if (Math.abs((this._shadows.sunElevation ?? 0) - this._lastSunElev)  > 0.01) return true;
    }
    return false;
  }

  // ── Draw helpers ─────────────────────────────────────────────────────────

  _drawBakedImage() {
    const { cam, _wr: wr } = this;
    const PX = this.BAKE_TILE_PX;

    const p00 = worldToScreen(0, 0, 0, cam);
    const p10 = worldToScreen(1, 0, 0, cam);
    const p01 = worldToScreen(0, 1, 0, cam);

    wr.drawTransformedImage(
      this._mapCanvas,
      {
        m11: (p10.x - p00.x) / PX,
        m12: (p10.y - p00.y) / PX,
        m21: (p01.x - p00.x) / PX,
        m22: (p01.y - p00.y) / PX,
        dx:  p00.x,
        dy:  p00.y,
      },
      this._mapCanvas.width,
      this._mapCanvas.height,
    );
  }

  _drawFallbackFill() {
    const fallbackRgb = this._rgbCache[5]?.flat ?? [91, 194, 58];
    this._wr.fillRect(
      0, 0,
      this.ctx.canvas.width,
      this.ctx.canvas.height,
      `rgb(${fallbackRgb[0]},${fallbackRgb[1]},${fallbackRgb[2]})`,
    );
  }

  _drawHighlight(tx, ty) {
    const quad = topFaceQuad(tx, ty, 0, this.cam);
    this._wr.drawPolygon(quad, 'rgba(255,255,255,0.18)');
  }

  _drawGrid(tx, ty) {
    const quad  = topFaceQuad(tx, ty, 0, this.cam);
    const alpha = (1 - this.cam.tilt / 0.35) * 0.15;
    this._wr.drawPolygon(quad, null, `rgba(0,0,0,${alpha})`, 0.5);
  }

  // ── Public draw entry point ───────────────────────────────────────────────

  drawLayer(tiles, playerTx, playerTy, terrainCache, pGX, pGY) {
    if (this._needsRebake(pGX, pGY)) {
      this._scheduleBake(terrainCache, pGX, pGY);
      if (this._mapCanvas.width === 0 || this._mapCanvas.height === 0) {
        this._drawFallbackFill();
        return;
      }
    }

    this._drawBakedImage();

    const { cam }  = this;
    const W        = this.ctx.canvas.width;
    const H        = this.ctx.canvas.height;
    const MARGIN   = 80;
    const buf      = this._sortBuf;
    buf.length     = 0;

    for (const t of tiles) {
      const sc = worldToScreen(t.tx + 0.5, t.ty + 0.5, 0, cam);
      if (sc.x < -MARGIN || sc.x > W + MARGIN ||
          sc.y < -MARGIN || sc.y > H + MARGIN) continue;
      t._depth = tileDepth(t.tx, t.ty, cam.rotation);
      buf.push(t);
    }
    buf.sort((a, b) => a._depth - b._depth);

    const floorPX  = Math.floor(playerTx);
    const floorPY  = Math.floor(playerTy);
    const needGrid = cam.tilt < 0.35;

    for (const t of buf) {
      if (t.tx === floorPX && t.ty === floorPY) this._drawHighlight(t.tx, t.ty);
      if (needGrid) this._drawGrid(t.tx, t.ty);
    }
  }

  // ── Merged-LOD layer ─────────────────────────────────────────────────────

  drawMergedBlock(blockX, blockY, lod, terrainCache, pGX, pGY, alpha) {
    const { cam, terrain, _wr: wr } = this;
    const mapW = cam.mapW, mapH = cam.mapH;

    const centerLocal = {
      tx: blockX + lod / 2 - pGX + mapW / 2,
      ty: blockY + lod / 2 - pGY + mapH / 2,
    };
    const sc = worldToScreen(centerLocal.tx, centerLocal.ty, 0, cam);
    const blockScreenSize = lod * (cam.tileW * cam.zoom);
    if (sc.x < -blockScreenSize || sc.x > this.ctx.canvas.width  + blockScreenSize ||
        sc.y < -blockScreenSize || sc.y > this.ctx.canvas.height + blockScreenSize) return;

    let r = 0, g = 0, b = 0, count = 0;
    for (let dy = 0; dy < lod; dy += Math.max(1, Math.floor(lod / 2))) {
      for (let dx = 0; dx < lod; dx += Math.max(1, Math.floor(lod / 2))) {
        const tid = terrainCache.get(blockX + dx, blockY + dy) ?? 5;
        const col = terrain.colors[tid]?.flat || '#5bc23a';
        r += parseInt(col.slice(1, 3), 16);
        g += parseInt(col.slice(3, 5), 16);
        b += parseInt(col.slice(5, 7), 16);
        count++;
      }
    }

    const fillStyle = `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`;
    const toLocal   = (gx, gy) => ({ tx: gx - pGX + mapW / 2, ty: gy - pGY + mapH / 2 });
    const pts       = [
      toLocal(blockX,       blockY),
      toLocal(blockX + lod, blockY),
      toLocal(blockX + lod, blockY + lod),
      toLocal(blockX,       blockY + lod),
    ].map(c => worldToScreen(c.tx, c.ty, 0, cam));

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    wr.drawPolygon(pts, fillStyle, fillStyle, 1.2);
    this.ctx.restore();
  }

  drawMergedLayer(terrainCache, pGX, pGY, lod, alpha) {
    const mapW  = this.cam.mapW;
    const mapH  = this.cam.mapH;
    const halfW = Math.ceil(mapW / 2);
    const halfH = Math.ceil(mapH / 2);

    for (let gy = pGY - halfH; gy < pGY + halfH; gy += lod)
      for (let gx = pGX - halfW; gx < pGX + halfW; gx += lod)
        this.drawMergedBlock(gx, gy, lod, terrainCache, pGX, pGY, alpha);
  }

  invalidate() { this._bakeDirty = true; }

  invalidateSync(terrainCache, pGX, pGY) {
    this._pendingBake = null;
    this._baking      = false;
    this._bakeMap(terrainCache, pGX, pGY);
    this._lastPGX      = pGX;
    this._lastPGY      = pGY;
    this._lastTilt     = this.cam.tilt;
    this._lastSunAngle = this._shadows?.sunAngle     ?? 0;
    this._lastSunElev  = this._shadows?.sunElevation ?? 0;
    this._bakeDirty    = false;
  }
}