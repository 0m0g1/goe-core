/**
 * GOE Core — TileRenderer  (stylised-tile update)
 *
 * What changed vs. the previous version
 * ───────────────────────────────────────
 *
 * BLUR FIX / STYLISED TILES — _drawTexturedLayer()
 *   The previous close-zoom path stretched the tiny 80×80-pixel baked
 *   canvas across the screen, producing heavy blur.  Now, when the on-screen
 *   half-tile width exceeds TEXTURED_TILE_MIN_HW pixels we switch to a
 *   per-tile draw: each tile gets its own 64×64 stylised texture from
 *   TerrainPainter, projected onto its isometric face via a single
 *   ctx.setTransform() + ctx.drawImage().
 *
 *   Because all tiles share the same affine projection (only the translation
 *   differs), the 2×2 matrix is computed once per frame in _updateTileMatrix()
 *   and cached behind _matrixStamp so subsequent tiles pay just one
 *   setTransform call each.
 *
 *   The baked canvas continues to run in the background at all zoom levels so
 *   there is no stale-image flash on zoom-out.
 *
 * MAP-PERF 5 — Tile projection cache (unchanged from previous version)
 *   _projStamp is bumped only when the camera changes; tiles cache scX, scY,
 *   depth, and topFaceQuad.  The textured path reuses the same stamp and the
 *   same _sortBuf for depth sorting.
 *
 * CHUNKING REFACTOR (unchanged from previous version)
 *   All iteration operates in global tile space; _bakeOriginX/_bakeOriginY
 *   record the top-left of the baked canvas.
 */

import { TerrainPainter, TEX_SIZE } from '../terrain/TerrainPainter.js';
import { lerpColor, tileDepth, worldToScreen, topFaceQuad, tileHalfWidth } from '../math/projection.js';

// Close-zoom threshold: when the on-screen tile half-width (px) exceeds this
// value we render textured tiles instead of the baked minimap.
// Increase to favour the fast baked path; lower for sharper detail at lower zoom.
const TEXTURED_TILE_MIN_HW = 12;

// ─── Helpers (unchanged) ──────────────────────────────────────────────────────

function hexToRgb(hex) {
  if (!hex || hex[0] !== '#') return [128, 128, 128];
  const h = hex.slice(1);
  if (h.length === 3) {
    return [
      parseInt(h[0]+h[0],16),
      parseInt(h[1]+h[1],16),
      parseInt(h[2]+h[2],16),
    ];
  }
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

export class TileRenderer {
  /**
   * @param {WorldRenderer}  worldRenderer
   * @param {object}         terrainRegistry
   */
  constructor(worldRenderer, terrainRegistry) {
    this._wr      = worldRenderer;
    this.terrain  = terrainRegistry;
    this._shadows = worldRenderer.shadowSystem;

    this.BAKE_TILE_PX = 1;

    this._mapCanvas = document.createElement('canvas');
    this._mapCtx    = this._mapCanvas.getContext('2d', { alpha: false });

    // FIX A — pre-allocated ImageData
    this._imgData  = null;
    this._imgDataW = 0;
    this._imgDataH = 0;

    // CHUNKING: track last bake focus (global tile)
    this._lastFocusX   = null;
    this._lastFocusY   = null;
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

    // MAP-PERF 5 — Tile projection cache
    this._projStamp   = 0;
    this._lastCamX    = null;
    this._lastCamY    = null;
    this._lastCamZoom = null;
    this._lastCamTilt = null;
    this._lastCamRot  = null;
    this._lastW       = null;
    this._lastH       = null;
    this._mergedProjCache = new Map();

    // ── NEW: stylised-tile rendering ──────────────────────────────────────────
    // TerrainPainter generates & caches 64×64 per-terrain textures.
    this._painter = new TerrainPainter(terrainRegistry);

    // Affine tile matrix — updated once per frame via _updateTileMatrix().
    // Maps one tile's [0, TEX_SIZE]² texture space → screen space (translation
    // is added per-tile).  Only the 2×2 part is cached here; the translation
    // is t._scX / t._scY which are already cached on each tile slot.
    this._matrixStamp = -1;
    this._m11 = this._m12 = this._m21 = this._m22 = 0;
    this._layerBitmap       = null;  // cached ImageBitmap of the textured layer
    this._layerBitmapCanvas = null;  // OffscreenCanvas used to bake it
    this._layerBitmapDirty  = true;
  }

  get ctx() { return this._wr.ctx; }
  get cam() { return this._wr.cam; }

  // ── MAP-PERF 5: Stamp manager (unchanged) ─────────────────────────────────

  _updateProjStamp() {
    const cam = this.cam;
    const W   = this.ctx.canvas.width;
    const H   = this.ctx.canvas.height;

    if (this._lastCamX    !== cam.x        ||
        this._lastCamY    !== cam.y        ||
        this._lastCamZoom !== cam.zoom     ||
        this._lastCamTilt !== cam.tilt     ||
        this._lastCamRot  !== cam.rotation ||
        this._lastW !== W || this._lastH !== H) {

      this._lastCamX    = cam.x;
      this._lastCamY    = cam.y;
      this._lastCamZoom = cam.zoom;
      this._lastCamTilt = cam.tilt;
      this._lastCamRot  = cam.rotation;
      this._lastW = W;
      this._lastH = H;
      this._projStamp++;
    }
    return this._projStamp;
  }

  // ── NEW: tile affine matrix ────────────────────────────────────────────────
  // The isometric projection is affine in (tx, ty) so the 2×2 matrix is
  // identical for every tile in a frame.  We compute it once using the camera
  // focus as the reference point (avoids precision loss far from origin).

  _updateTileMatrix(focusX, focusY) {
    const stamp = this._updateProjStamp();
    if (this._matrixStamp === stamp) return stamp;
    this._matrixStamp = stamp;

    const S   = TEX_SIZE;
    const cam = this.cam;
    const ref = worldToScreen(focusX,     focusY,     0, cam);
    const eX  = worldToScreen(focusX + 1, focusY,     0, cam);
    const eY  = worldToScreen(focusX,     focusY + 1, 0, cam);

    // One tile spans [0, S] in texture space → (eX - ref) in screen space
    this._m11 = (eX.x - ref.x) / S;
    this._m12 = (eX.y - ref.y) / S;
    this._m21 = (eY.x - ref.x) / S;
    this._m22 = (eY.y - ref.y) / S;

    return stamp;
  }

  // ── RGB cache (unchanged) ─────────────────────────────────────────────────

  _buildRgbCache() {
    const cache = {};
    for (const [id, c] of Object.entries(this.terrain.colors)) {
      cache[id] = { flat: hexToRgb(c.flat), top: hexToRgb(c.top) };
    }
    return cache;
  }

  // ── Bake scheduling (unchanged) ───────────────────────────────────────────

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

  // ── Core bake (unchanged) ─────────────────────────────────────────────────

  _bakeMap(terrainCache, focusX, focusY) {
    const cam = this.cam;
    const W   = cam.mapW;
    const H   = cam.mapH;
    const PX  = this.BAKE_TILE_PX;
    const t   = Math.max(0, Math.min(1, cam.tilt));

    const pw = W * PX, ph = H * PX;
    if (this._mapCanvas.width !== pw || this._mapCanvas.height !== ph) {
      this._mapCanvas.width  = pw;
      this._mapCanvas.height = ph;
      this._imgData  = this._mapCtx.createImageData(pw, ph);
      this._imgDataW = pw;
      this._imgDataH = ph;
    }

    const originX = Math.floor(focusX - W / 2);
    const originY = Math.floor(focusY - H / 2);
    this._bakeOriginX = originX;
    this._bakeOriginY = originY;

    const imgData = this._imgData;
    const pixels  = imgData.data;

    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
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

  // ── Stale-check (unchanged) ───────────────────────────────────────────────

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

  // ── Draw helpers (unchanged) ──────────────────────────────────────────────

  _drawBakedImage() {
    const { cam, _wr: wr } = this;
    const PX = this.BAKE_TILE_PX;

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
    this._wr.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height,
      `rgb(${fallbackRgb[0]},${fallbackRgb[1]},${fallbackRgb[2]})`);
  }

  _drawHighlight(t) { this._wr.drawPolygon(t._quad, 'rgba(255,255,255,0.18)'); }

  _drawGrid(t) {
    const alpha = (1 - this.cam.tilt / 0.35) * 0.15;
    this._wr.drawPolygon(t._quad, null, `rgba(0,0,0,${alpha})`, 0.5);
  }

  markLayerDirty() {
    // Only call this when tile CONTENT changes (terrain updates, new tiles loaded)
    // NOT on camera pan/zoom — use _markProjectionDirty() for that
    this._layerContentDirty = true;
    this._layerBitmapDirty  = true;
  }

  _markProjectionDirty() {
    // Camera moved but tile content unchanged — need to re-composite
    // but NOT re-bake all tiles. Only set the bitmap dirty, not content dirty.
    this._layerBitmapDirty = true;
  }

  // ── NEW: per-tile textured render path ────────────────────────────────────
  // Called when hw >= TEXTURED_TILE_MIN_HW (close zoom).
  // For each visible tile we:
  //   1. Set the shared affine matrix + per-tile translation.
  //   2. drawImage the 64×64 stylised texture — fills the isometric face.
  //   3. Optionally overdraw player-highlight and grid seams.
  // Transform is reset to identity once after the loop.
  _bakeTexturedLayer(oCtx, tiles, playerTx, playerTy, focusX, focusY, W, H) {
    const cam = this.cam;
    const S   = TEX_SIZE;
    const hw  = tileHalfWidth(cam.zoom, cam.tileW);
    const MARGIN = Math.max(128, hw * 4);

    const stamp = this._updateTileMatrix(focusX, focusY);
    const { _m11: m11, _m12: m12, _m21: m21, _m22: m22 } = this;

    const floorPX   = Math.floor(playerTx);
    const floorPY   = Math.floor(playerTy);
    const needGrid  = cam.tilt < 0.35;
    const gridAlpha = needGrid ? ((1 - cam.tilt / 0.35) * 0.12).toFixed(3) : '0';
    const gridStyle = `rgba(0,0,0,${gridAlpha})`;

    const buf = this._sortBuf;
    buf.length = 0;

    for (const t of tiles) {
      if (t._stamp !== stamp) {
        const sc = worldToScreen(t.tx, t.ty, 0, cam);
        t._scX   = sc.x;
        t._scY   = sc.y;
        t._depth = tileDepth(t.tx, t.ty, cam.rotation);
        t._stamp = stamp;
      }
      if (t._scX < -MARGIN - S || t._scX > W + MARGIN ||
          t._scY < -MARGIN - S || t._scY > H + MARGIN) continue;
      buf.push(t);
    }

    buf.sort((a, b) => a._depth - b._depth);

    const painter = this._painter;

    for (const t of buf) {
      oCtx.setTransform(m11, m12, m21, m22, t._scX, t._scY);
      oCtx.drawImage(painter.getTexture(t.terrainId), 0, 0);

      const isPlayer = (t.tx === floorPX && t.ty === floorPY);
      if (isPlayer) {
        oCtx.fillStyle = 'rgba(255,255,255,0.20)';
        oCtx.fillRect(0, 0, S, S);
      }
      if (needGrid) {
        oCtx.strokeStyle = gridStyle;
        oCtx.lineWidth   = 0.5;
        oCtx.strokeRect(0, 0, S, S);
      }
    }

    oCtx.setTransform(1, 0, 0, 1, 0, 0);
  }

  _drawTexturedLayer(tiles, playerTx, playerTy, focusX, focusY) {
    const { cam, ctx } = this;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;

    const stamp = this._updateTileMatrix(focusX, focusY); // updates _matrixStamp

    // Only re-bake when tile CONTENT changed, not just projection
    const needRebake = this._layerContentDirty || !this._layerBitmap ||
      this._layerBitmapCanvas?.width !== W ||
      this._layerBitmapCanvas?.height !== H;

    if (needRebake) {
      if (!this._layerBitmapCanvas ||
          this._layerBitmapCanvas.width  !== W ||
          this._layerBitmapCanvas.height !== H) {
        this._layerBitmapCanvas = new OffscreenCanvas(W, H);
      }

      const oCtx = this._layerBitmapCanvas.getContext('2d');
      oCtx.clearRect(0, 0, W, H);
      this._bakeTexturedLayer(oCtx, tiles, playerTx, playerTy, focusX, focusY, W, H);

      this._layerBitmap?.close();
      this._layerBitmap        = this._layerBitmapCanvas.transferToImageBitmap();
      this._layerContentDirty  = false;
      this._layerBitmapDirty   = false;
      this._lastBakeStamp      = stamp;
    } else if (this._layerBitmapDirty || stamp !== this._lastBakeStamp) {
      // Projection changed — re-composite without re-baking per-tile textures.
      // The OffscreenCanvas is still valid; just re-draw the tile loop
      // (drawImage calls are cheap since getTexture() returns cached bitmaps).
      const oCtx = this._layerBitmapCanvas.getContext('2d');
      oCtx.clearRect(0, 0, W, H);
      this._bakeTexturedLayer(oCtx, tiles, playerTx, playerTy, focusX, focusY, W, H);

      this._layerBitmap?.close();
      this._layerBitmap      = this._layerBitmapCanvas.transferToImageBitmap();
      this._layerBitmapDirty = false;
      this._lastBakeStamp    = stamp;
    }

    if (this._layerBitmap) {
      ctx.drawImage(this._layerBitmap, 0, 0);
    }
  }

  // ── Public draw entry point ───────────────────────────────────────────────

  drawLayer(tiles, playerTx, playerTy, terrainCache, focusX, focusY) {
    const hw = tileHalfWidth(this.cam.zoom, this.cam.tileW);

    if (this._painter && hw >= TEXTURED_TILE_MIN_HW) {
      if (this._needsRebake(focusX, focusY)) {
        this._scheduleBake(terrainCache, focusX, focusY);
        this._layerBitmapDirty = true;
      }
      this._drawTexturedLayer(tiles, playerTx, playerTy, focusX, focusY);
      return;
    }

    // Extremely far zoom: baked minimap
    if (this._needsRebake(focusX, focusY)) {
      this._scheduleBake(terrainCache, focusX, focusY);
      if (this._mapCanvas.width === 0 || this._mapCanvas.height === 0) {
        this._drawFallbackFill();
        return;
      }
    }

    this._drawBakedImage();

    // MAP-PERF 5: overlay pass — grid + player highlight
    const { cam }  = this;
    const W        = this.ctx.canvas.width;
    const H        = this.ctx.canvas.height;
    const MARGIN   = 80;
    const stamp    = this._updateProjStamp();
    const needGrid = cam.tilt < 0.35;
    const floorPX  = Math.floor(playerTx);
    const floorPY  = Math.floor(playerTy);

    const buf = this._sortBuf;
    buf.length = 0;

    for (const t of tiles) {
      if (t._stamp !== stamp) {
        const sc = worldToScreen(t.tx + 0.5, t.ty + 0.5, 0, cam);
        t._scX   = sc.x;
        t._scY   = sc.y;
        t._depth = tileDepth(t.tx, t.ty, cam.rotation);

        const isHighlight = (t.tx === floorPX && t.ty === floorPY);
        if (needGrid || isHighlight) {
          t._quad = topFaceQuad(t.tx, t.ty, 0, cam);
        } else {
          t._quad = null;
        }
        t._stamp = stamp;
      }

      if (t._scX < -MARGIN || t._scX > W + MARGIN ||
          t._scY < -MARGIN || t._scY > H + MARGIN) continue;

      buf.push(t);
    }

    buf.sort((a, b) => a._depth - b._depth);

    for (const t of buf) {
      const isHighlight = (t.tx === floorPX && t.ty === floorPY);
      if (isHighlight || needGrid) {
        if (!t._quad) t._quad = topFaceQuad(t.tx, t.ty, 0, cam);
        if (isHighlight) this._drawHighlight(t);
        if (needGrid)    this._drawGrid(t);
      }
    }
  }

  // ── Merged-LOD layer (unchanged) ──────────────────────────────────────────

  drawMergedBlock(blockX, blockY, lod, terrainCache, alpha, stamp) {
    const { cam, ctx } = this;
    const S        = TEX_SIZE;
    const cacheKey = `${blockX},${blockY},${lod}`;

    let c = this._mergedProjCache.get(cacheKey);
    if (!c) {
      c = { stamp: -1, sc: null, blendCanvas: null, blendDirty: true };
      this._mergedProjCache.set(cacheKey, c);
      if (this._mergedProjCache.size > 2048) {
        this._mergedProjCache.delete(this._mergedProjCache.keys().next().value);
      }
    }

    if (c.stamp !== stamp) {
      c.sc = worldToScreen(blockX + lod / 2, blockY + lod / 2, 0, cam);
      c.stamp = stamp;
    }

    const blockPx = lod * (cam.tileW * cam.zoom);
    if (c.sc.x < -blockPx || c.sc.x > ctx.canvas.width  + blockPx ||
        c.sc.y < -blockPx || c.sc.y > ctx.canvas.height + blockPx) return;

    // ── Build or reuse the blended+blurred texture for this block ────────────
    if (!c.blendCanvas || c.blendDirty) {
      if (!c.blendCanvas) {
        c.blendCanvas = document.createElement('canvas');
        c.blendCanvas.width  = S;
        c.blendCanvas.height = S;
      }
      const bCtx = c.blendCanvas.getContext('2d');

      // Sample all tiles in this block, build a frequency map
      const freq = {};
      const step = 1; // sample every tile for accurate blending
      let total  = 0;
      for (let dy = 0; dy < lod; dy += step) {
        for (let dx = 0; dx < lod; dx += step) {
          const tid = terrainCache.get(blockX + dx, blockY + dy) ?? 5;
          freq[tid] = (freq[tid] ?? 0) + 1;
          total++;
        }
      }

      // Composite each terrain texture at its proportional opacity
      bCtx.clearRect(0, 0, S, S);
      let first = true;
      for (const [tidStr, count] of Object.entries(freq)) {
        const tid     = Number(tidStr);
        const weight  = count / total;
        const texture = this._painter?.getTexture(tid);
        if (!texture) continue;

        if (first) {
          // First layer draws normally
          bCtx.globalAlpha = weight;
          bCtx.globalCompositeOperation = 'source-over';
          bCtx.drawImage(texture, 0, 0);
          first = false;
        } else {
          bCtx.globalAlpha = weight;
          bCtx.globalCompositeOperation = 'source-over';
          bCtx.drawImage(texture, 0, 0);
        }
      }

      // Reset composite state
      bCtx.globalAlpha = 1;
      bCtx.globalCompositeOperation = 'source-over';

      // ── Gaussian blur scaled to LOD depth ──────────────────────────────────
      // Blur radius grows with lod so distant tiles soften more.
      // CSS filter blur is GPU-accelerated and applies to the canvas element.
      // We re-draw through an intermediate to apply the blur into pixels.
      const blurPx = lod * 1.5; // lod=2 → 3px, lod=4 → 6px
      if (blurPx > 0) {
        // Snapshot what we have, apply blur, draw back
        const snap     = document.createElement('canvas');
        snap.width     = S;
        snap.height    = S;
        const snapCtx  = snap.getContext('2d');
        snapCtx.filter = `blur(${blurPx}px)`;
        snapCtx.drawImage(c.blendCanvas, 0, 0);
        snapCtx.filter = 'none';
        bCtx.clearRect(0, 0, S, S);
        bCtx.drawImage(snap, 0, 0);
      }

      c.blendDirty = false;
    }

    // ── Affine draw (same as _drawTexturedLayer) ───────────────────────────
    this._updateTileMatrix(cam.focusX, cam.focusY);
    const { _m11: m11, _m12: m12, _m21: m21, _m22: m22 } = this;
    const nw    = worldToScreen(blockX, blockY, 0, cam);
    const scale = lod;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setTransform(
      m11 * scale, m12 * scale,
      m21 * scale, m22 * scale,
      nw.x, nw.y,
    );
    ctx.drawImage(c.blendCanvas, 0, 0);
    ctx.restore();
  }

  drawMergedLayer(terrainCache, focusX, focusY, lod, alpha) {
    const stamp = this._updateProjStamp();
    const halfW = Math.ceil(this.cam.mapW / 2);
    const halfH = Math.ceil(this.cam.mapH / 2);
    for (let gy = focusY - halfH; gy < focusY + halfH; gy += lod)
      for (let gx = focusX - halfW; gx < focusX + halfW; gx += lod)
        this.drawMergedBlock(gx, gy, lod, terrainCache, alpha, stamp);
  }

  // ── Cache invalidation ────────────────────────────────────────────────────
  invalidate() {
    this._bakeDirty        = true;
    this._layerBitmapDirty = true;  // ← add
    this._mergedProjCache.clear();
    this._painter?.invalidate();
  }

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
    this._mergedProjCache.clear();
    this._painter?.invalidate();
  }
}