/**
 * GOE Core — TileRenderer
 *
 * CHUNKING REFACTOR
 * -----------------
 * All tile iteration and terrain lookup now operates in GLOBAL TILE SPACE.
 *
 * Previous approach (local chunk):
 *   — _bakeMap iterated tx: 0..mapW, ty: 0..mapH
 *   — lookups used terrainCache.getLocal(tx, ty, pGX, pGY, W, H)
 *   — drawMergedLayer needed pGX/pGY to convert global→local
 *
 * New approach (global coords):
 *   — _bakeMap iterates around cam.focusX/focusY in global tile coords
 *   — lookups use terrainCache.get(globalTx, globalTy) directly
 *   — drawMergedLayer uses focusX/focusY as centre; no local conversion
 *   — _bakeOriginX/_bakeOriginY record which global tile is at pixel (0,0)
 *     of the baked canvas so _drawBakedImage can project it correctly
 *
 * Memory fixes (FIX A, B, C) from the previous version are unchanged:
 *   FIX A — ImageData reused across bakes (only reallocated on size change)
 *   FIX B — _rgbCache eliminates per-block parseInt in drawMergedBlock
 *   FIX C — Inline bake lerp; no intermediate [r,g,b] array per tile
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

export class TileRenderer {
  /**
   * @param {WorldRenderer}  worldRenderer
   * @param {object}         terrainRegistry
   */
  constructor(worldRenderer, terrainRegistry) {
    this._wr     = worldRenderer;
    this.terrain = terrainRegistry;
    this._shadows = worldRenderer.shadowSystem;

    this.BAKE_TILE_PX = 1;

    this._mapCanvas = document.createElement('canvas');
    this._mapCtx    = this._mapCanvas.getContext('2d', { alpha: false });

    // FIX A — pre-allocated ImageData
    this._imgData  = null;
    this._imgDataW = 0;
    this._imgDataH = 0;

    // CHUNKING: track last bake focus (global tile) instead of pGX/pGY
    this._lastFocusX   = null;
    this._lastFocusY   = null;
    // Global tile coordinate of the top-left corner of the baked canvas
    this._bakeOriginX  = 0;
    this._bakeOriginY  = 0;

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

  // ── RGB cache ─────────────────────────────────────────────────────────────

  _buildRgbCache() {
    const cache = {};
    for (const [id, c] of Object.entries(this.terrain.colors)) {
      cache[id] = { flat: hexToRgb(c.flat), top: hexToRgb(c.top) };
    }
    return cache;
  }

  // ── Bake scheduling ───────────────────────────────────────────────────────

  _scheduleBake(terrainCache, focusX, focusY) {
    this._pendingBake = { terrainCache, focusX, focusY };
    if (this._baking) return;
    this._baking = true;

    const run = () => {
      if (!this._pendingBake) { this._baking = false; return; }
      const { terrainCache, focusX, focusY } = this._pendingBake;
      this._pendingBake = null;

      this._bakeMap(terrainCache, focusX, focusY);

      this._lastFocusX   = focusX;
      this._lastFocusY   = focusY;
      this._lastTilt     = this.cam.tilt;
      this._lastSunAngle = this._shadows?.sunAngle     ?? 0;
      this._lastSunElev  = this._shadows?.sunElevation ?? 0;
      this._baking       = false;

      if (this._pendingBake)
        this._scheduleBake(this._pendingBake.terrainCache, this._pendingBake.focusX, this._pendingBake.focusY);
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 50 });
    } else {
      setTimeout(run, 0);
    }
  }

  // ── Core bake ─────────────────────────────────────────────────────────────

  /**
   * Bake the terrain map centred on (focusX, focusY) in global tile coords.
   *
   * CHUNKING CHANGE:
   *   — Iterates globalTx from (focusX − mapW/2) to (focusX + mapW/2).
   *   — Calls terrainCache.get(globalTx, globalTy) directly.
   *   — Records _bakeOriginX/_bakeOriginY so _drawBakedImage can project
   *     the top-left pixel of the canvas to the correct screen position.
   */
  _bakeMap(terrainCache, focusX, focusY) {
    const cam = this.cam;
    const W   = cam.mapW;   // render-chunk tile width
    const H   = cam.mapH;   // render-chunk tile height
    const PX  = this.BAKE_TILE_PX;
    const t   = Math.max(0, Math.min(1, cam.tilt));

    const pw = W * PX;
    const ph = H * PX;

    // FIX A — only resize when canvas dimensions change
    if (this._mapCanvas.width !== pw || this._mapCanvas.height !== ph) {
      this._mapCanvas.width  = pw;
      this._mapCanvas.height = ph;
      this._imgData  = this._mapCtx.createImageData(pw, ph);
      this._imgDataW = pw;
      this._imgDataH = ph;
    }

    // CHUNKING: bake origin is the global tile at canvas pixel (0,0)
    const originX = Math.floor(focusX - W / 2);
    const originY = Math.floor(focusY - H / 2);
    this._bakeOriginX = originX;
    this._bakeOriginY = originY;

    const imgData = this._imgData;
    const pixels  = imgData.data;

    // FIX C — inline lerp, no intermediate array per tile
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        // CHUNKING: look up by global tile coordinate
        const globalTx = originX + col;
        const globalTy = originY + row;
        const tid      = terrainCache.get(globalTx, globalTy) ?? 5;
        const rgb      = this._rgbCache[tid] ?? this._rgbCache[5];

        const fr = rgb.flat[0], fg = rgb.flat[1], fb = rgb.flat[2];
        const tr = rgb.top[0],  tg = rgb.top[1],  tb = rgb.top[2];

        const base = (row * W * PX + col) * 4;
        pixels[base]     = (fr + (tr - fr) * t) | 0;
        pixels[base + 1] = (fg + (tg - fg) * t) | 0;
        pixels[base + 2] = (fb + (tb - fb) * t) | 0;
        pixels[base + 3] = 255;
      }
    }

    this._mapCtx.putImageData(imgData, 0, 0);
    this._bakeDirty = false;
  }

  // ── Stale-check ───────────────────────────────────────────────────────────

  /**
   * CHUNKING CHANGE: compare focusX/focusY (global) instead of pGX/pGY.
   * Threshold of 1 tile avoids constant rebaking while the player moves.
   */
  _needsRebake(focusX, focusY) {
    if (this._bakeDirty)                                              return true;
    if (this._lastFocusX === null)                                    return true;
    if (Math.abs(focusX - this._lastFocusX) > 1 ||
        Math.abs(focusY - this._lastFocusY) > 1)                     return true;
    if (Math.abs(this.cam.tilt - (this._lastTilt ?? -1)) > 0.01)     return true;
    if (this._shadows?.enabled) {
      if (Math.abs((this._shadows.sunAngle     ?? 0) - this._lastSunAngle) > 0.1)  return true;
      if (Math.abs((this._shadows.sunElevation ?? 0) - this._lastSunElev)  > 0.01) return true;
    }
    return false;
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────

  /**
   * CHUNKING CHANGE: project _bakeOriginX/_bakeOriginY (global tile coords)
   * to get the canvas transform; no local-to-global conversion needed.
   */
  _drawBakedImage() {
    const { cam, _wr: wr } = this;
    const PX = this.BAKE_TILE_PX;

    // Top-left pixel of the baked canvas is global tile (_bakeOriginX, _bakeOriginY)
    const p00 = worldToScreen(this._bakeOriginX,     this._bakeOriginY,     0, cam);
    const p10 = worldToScreen(this._bakeOriginX + 1, this._bakeOriginY,     0, cam);
    const p01 = worldToScreen(this._bakeOriginX,     this._bakeOriginY + 1, 0, cam);

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

  /**
   * CHUNKING CHANGE: tiles now carry GLOBAL tx/ty. worldToScreen handles
   * them correctly because the camera focus is also in global space.
   * No pGX/pGY argument needed here.
   */
  drawLayer(tiles, playerTx, playerTy, terrainCache, focusX, focusY) {
    if (this._needsRebake(focusX, focusY)) {
      this._scheduleBake(terrainCache, focusX, focusY);
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
      // t.tx / t.ty are global tile coords — worldToScreen works directly
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

  // ── Merged-LOD layer ──────────────────────────────────────────────────────

  /**
   * CHUNKING CHANGE:
   *   — blockX/blockY are global tile coords; no toLocal() conversion.
   *   — terrainCache.get(blockX + dx, blockY + dy) used directly (FIX B).
   *   — pts[] built from global tile coords; worldToScreen handles them.
   */
  drawMergedBlock(blockX, blockY, lod, terrainCache, alpha) {
    const { cam, terrain, _wr: wr } = this;

    // Quick screen-space cull — block centre in global tile space
    const centreTx = blockX + lod / 2;
    const centreTy = blockY + lod / 2;
    const sc       = worldToScreen(centreTx, centreTy, 0, cam);
    const blockPx  = lod * (cam.tileW * cam.zoom);
    if (sc.x < -blockPx || sc.x > this.ctx.canvas.width  + blockPx ||
        sc.y < -blockPx || sc.y > this.ctx.canvas.height + blockPx) return;

    // FIX B — average terrain RGB from _rgbCache (no parseInt per block)
    let r = 0, g = 0, b = 0, count = 0;
    const step = Math.max(1, Math.floor(lod / 2));
    for (let dy = 0; dy < lod; dy += step) {
      for (let dx = 0; dx < lod; dx += step) {
        // CHUNKING: direct global lookup
        const tid = terrainCache.get(blockX + dx, blockY + dy) ?? 5;
        const rgb = this._rgbCache[tid] ?? this._rgbCache[5];
        r += rgb.flat[0]; g += rgb.flat[1]; b += rgb.flat[2];
        count++;
      }
    }

    const fillStyle = `rgb(${(r / count) | 0},${(g / count) | 0},${(b / count) | 0})`;

    // CHUNKING: corners are global tile coords — project directly
    const pts = [
      worldToScreen(blockX,       blockY,       0, cam),
      worldToScreen(blockX + lod, blockY,       0, cam),
      worldToScreen(blockX + lod, blockY + lod, 0, cam),
      worldToScreen(blockX,       blockY + lod, 0, cam),
    ];

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    wr.drawPolygon(pts, fillStyle, fillStyle, 1.2);
    this.ctx.restore();
  }

  /**
   * CHUNKING CHANGE: signature replaces (pGX, pGY) with (focusX, focusY).
   * Iteration is centred on focusX/focusY in global tile space.
   */
  drawMergedLayer(terrainCache, focusX, focusY, lod, alpha) {
    const halfW = Math.ceil(this.cam.mapW / 2);
    const halfH = Math.ceil(this.cam.mapH / 2);

    for (let gy = focusY - halfH; gy < focusY + halfH; gy += lod)
      for (let gx = focusX - halfW; gx < focusX + halfW; gx += lod)
        this.drawMergedBlock(gx, gy, lod, terrainCache, alpha);
  }

  invalidate() { this._bakeDirty = true; }

  invalidateSync(terrainCache, focusX, focusY) {
    this._pendingBake = null;
    this._baking      = false;
    this._bakeMap(terrainCache, focusX, focusY);
    this._lastFocusX   = focusX;
    this._lastFocusY   = focusY;
    this._lastTilt     = this.cam.tilt;
    this._lastSunAngle = this._shadows?.sunAngle     ?? 0;
    this._lastSunElev  = this._shadows?.sunElevation ?? 0;
    this._bakeDirty    = false;
  }
}