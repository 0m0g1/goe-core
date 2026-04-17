/**
 * GOE Core — TileRenderer  (Terrace / Skirt fix)
 *
 * What changed vs. the previous version
 * ───────────────────────────────────────
 *
 * TERRACE SKIRT FIX — _bakeTexturedLayer()
 *   The previous skirt implementation drew each elevated tile's riser all the
 *   way down to y=0 (absolute screen zero), regardless of the neighbouring
 *   tile's elevation.  This caused:
 *     • Adjacent same-height tiles to double-draw overlapping skirts.
 *     • z-fighting between the skirt and the neighbour's top face.
 *     • The riser extending far below the visible terrain surface.
 *
 *   The fix uses a two-pass approach:
 *
 *   Pass 1 — ALL tiles in the tile list (not just visible ones) have their
 *     elevation and screen position computed and stored into a flat elevMap
 *     keyed by "tx,ty".  This lets the skirt pass look up any neighbour's
 *     elevation without touching the GPU or recomputing geo.
 *
 *   Pass 2 — For each visible tile, two faces are conditionally drawn:
 *     • SE face (right riser):  only when elevPx > elevMap["tx+1,ty"]
 *       Height = t._elevPx − eastNeighbourElevPx  (the DELTA, not absolute)
 *     • SW face (left riser):   only when elevPx > elevMap["tx,ty+1"]
 *       Height = t._elevPx − southNeighbourElevPx
 *
 *   Neighbours that fall outside the tile list default to elevPx = 0
 *   (ground level), which is the correct conservative assumption at chunk
 *   edges.
 *
 *   Faces get two-tone shading: the SE face (in primary shadow) is darker
 *   than the SW face, matching a NW light source.  A thin highlight edge
 *   is stroked along the top seam of each face to emphasise the step.
 *
 *   Transform handling: setTransform is reset to identity before each
 *   tile's skirt quads (which use absolute screen coords), then set to the
 *   tile affine matrix for the top-face drawImage, then reset again.
 *
 * ELEVATION DIRTY FLAG FIX
 *   When new elevation tiles resolve (_elevationLoader._resolved.size grows),
 *   the old code invalidated t._stamp on all tiles but forgot to set
 *   _layerBitmapDirty = true.  This meant the OffscreenCanvas bitmap was
 *   never re-baked and terraces stayed flat until the next camera move.
 *   Now _layerBitmapDirty is set alongside the stamp invalidation.
 *
 * DEPTH SORT
 *   Elevated tiles keep the depth bias: tileDepth(...) + elevPx * 0.01
 *   This ensures tiles with height render after (in front of) tiles at
 *   ground level with the same ground-plane depth, which is the correct
 *   painter's-algorithm ordering for isometric cubes.
 */

import { TerrainPainter, TEX_SIZE } from '../terrain/TerrainPainter.js';
import { lerpColor, tileDepth, worldToScreen, topFaceQuad, tileHalfWidth, getElevOffset } from '../math/projection.js';

const TEXTURED_TILE_MIN_HW = 1;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  constructor(worldRenderer, terrainRegistry) {
    this._wr      = worldRenderer;
    this.terrain  = terrainRegistry;
    this._shadows = worldRenderer.shadowSystem;

    this.BAKE_TILE_PX = 1;

    this._mapCanvas = document.createElement('canvas');
    this._mapCtx    = this._mapCanvas.getContext('2d', { alpha: false });

    this._imgData  = null;
    this._imgDataW = 0;
    this._imgDataH = 0;

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

    this._projStamp   = 0;
    this._lastCamX    = null;
    this._lastCamY    = null;
    this._lastCamZoom = null;
    this._lastCamTilt = null;
    this._lastCamRot  = null;
    this._lastW       = null;
    this._lastH       = null;
    this._mergedProjCache = new Map();

    this._painter = new TerrainPainter(terrainRegistry);

    this._matrixStamp = -1;
    this._m11 = this._m12 = this._m21 = this._m22 = 0;
    this._layerBitmap       = null;
    this._layerBitmapCanvas = null;
    this._layerBitmapDirty  = true;

    this._lastElevResolvedSize = 0;

    // Reusable elevation lookup map — rebuilt each bake, avoids per-frame alloc
    // after the first frame.  Cleared at the top of _bakeTexturedLayer.
    this._elevMap = new Map();
    this._bakedCache = null;
  }

  get ctx() { return this._wr.ctx; }
  get cam() { return this._wr.cam; }

  // ── MAP-PERF 5: Stamp manager ─────────────────────────────────────────────

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

  setElevationLoader(loader) {
    this._elevationLoader = loader;
  }

  // ── Tile affine matrix ────────────────────────────────────────────────────

  _updateTileMatrix(focusX, focusY) {
    const stamp = this._updateProjStamp();
    if (this._matrixStamp === stamp) return stamp;
    this._matrixStamp = stamp;

    const S   = TEX_SIZE;
    const cam = this.cam;
    const ref = worldToScreen(focusX,     focusY,     0, cam);
    const eX  = worldToScreen(focusX + 1, focusY,     0, cam);
    const eY  = worldToScreen(focusX,     focusY + 1, 0, cam);

    this._m11 = (eX.x - ref.x) / S;
    this._m12 = (eX.y - ref.y) / S;
    this._m21 = (eY.x - ref.x) / S;
    this._m22 = (eY.y - ref.y) / S;

    return stamp;
  }

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

  // ── Stale-check ───────────────────────────────────────────────────────────

  _needsRebake(focusX, focusY) {
    if (this._bakeDirty)                                              return true;
    if (this._lastFocusX === null)                                    return true;
    if (Math.abs(focusX - this._lastFocusX) > 8 ||
        Math.abs(focusY - this._lastFocusY) > 8)                     return true;
    if (Math.abs(this.cam.tilt - (this._lastTilt ?? -1)) > 0.01)     return true;
    if (this._shadows?.enabled) {
      if (Math.abs((this._shadows.sunAngle     ?? 0) - this._lastSunAngle) > 0.1)  return true;
      if (Math.abs((this._shadows.sunElevation ?? 0) - this._lastSunElev)  > 0.01) return true;
    }
    return false;
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────

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

  markLayerDirty() {
    this._layerContentDirty = true;
    this._layerBitmapDirty  = true;
  }

  _markProjectionDirty() {
    this._layerBitmapDirty = true;
  }

  setMPerTile(m) { this._mPerTile = m; }
  setGeoCenter(geo, refTx, refTy) { 
    this._geoCenter = geo; 
    this._refTx = refTx;
    this._refTy = refTy;
  }

  // ── Per-tile textured render path with correct stepped-terrace skirts ─────
  //
  // Two-pass design:
  //
  //   Pass 1 — iterate ALL tiles (not just visible) to populate _elevMap and
  //     update each tile's cached screen position / depth.  Running all tiles
  //     means neighbours of visible edge-tiles are also in the map, so the
  //     riser calculation never falls back to 0 when it shouldn't.
  //
  //   Pass 2 — for each visible, depth-sorted tile:
  //     a) Draw SE riser (right face) — only when this tile is higher than its
  //        east neighbour (tx+1, ty).  Height = elevDelta, not absolute elevPx.
  //     b) Draw SW riser (left face) — only when higher than south neighbour
  //        (tx, ty+1).  Same delta logic.
  //     c) Draw top face via affine setTransform + drawImage.
  //
  //   Both risers are drawn with the transform at identity so their quads use
  //   raw screen coordinates.  After the risers, the transform is set to the
  //   tile matrix for the top-face draw, then reset to identity again so the
  //   next tile's risers are clean.
  //
  _bakeTexturedLayer(oCtx, tiles, playerTx, playerTy, focusX, focusY, W, H) {
    const cam = this.cam;
    const S   = TEX_SIZE;
    const hw  = tileHalfWidth(cam.zoom, cam.tileW);
    const MARGIN = Math.max(128, hw * 4);
    const stamp  = this._updateTileMatrix(focusX, focusY);
    const { _m11: m11, _m12: m12, _m21: m21, _m22: m22 } = this;

    const floorPX  = Math.floor(playerTx);
    const floorPY  = Math.floor(playerTy);
    const needGrid = cam.tilt < 0.35 && hw > 10;
    const gridAlpha = needGrid ? ((1 - cam.tilt / 0.35) * 0.12).toFixed(3) : '0';
    const gridStyle = `rgba(0,0,0,${gridAlpha})`;

    // FIX: set _layerBitmapDirty when new elevation data arrives so the bitmap
    // is actually re-baked rather than reusing the previous flat frame.
    const currentResolvedSize =
      this._elevationLoader?._loader?._resolved?.size ??
      this._elevationLoader?._resolved?.size ??
      0;
    if (currentResolvedSize !== this._lastElevResolvedSize) {
      this._lastElevResolvedSize = currentResolvedSize;
      for (const t of tiles) t._stamp = -1;
      this._layerBitmapDirty = true; // ← was missing; without this the bitmap
                                     //   never rebaked when elevation resolved
    }

    // ── Pass 1: update all tile projections & build neighbour lookup ─────────
    //
    // We iterate the full tiles array (not just the visible subset) so that
    // when a visible edge-tile checks its eastern or southern neighbour, that
    // neighbour's elevPx is already in the map even if it was culled.
    //
    const elevMap = this._elevMap;
    elevMap.clear();

    for (const t of tiles) {
      if (t._stamp !== stamp) {
        let tileH = 0;
        if (this._elevationLoader && this._geoCenter && this._refTx != null) {
          const cosLat = Math.cos(this._geoCenter.lat * Math.PI / 180);
          // NEW: Calculate distance from the static anchor, not the moving camera
          const dxM = (t.tx - this._refTx) * this._mPerTile;
          const dyM = (t.ty - this._refTy) * this._mPerTile;
          const lat = this._geoCenter.lat - (dyM / 111111);
          const lon = this._geoCenter.lon + (dxM / (111111 * cosLat));
          
          tileH = Math.floor(this._elevationLoader.sampleTileHeight(lat, lon));
        }
        const elevPx = getElevOffset(tileH, cam.tilt, cam.zoom);
        const sc     = worldToScreen(t.tx, t.ty, elevPx, cam);
        t._scX   = sc.x;
        t._scY   = sc.y;
        // Positive depth bias: elevated tiles drawn after (in front of) ground
        // tiles at the same ground-plane depth — correct for isometric cubes.
        t._depth  = tileDepth(t.tx, t.ty, cam.rotation) + elevPx * 0.01;
        t._elevPx = elevPx;
        t._stamp  = stamp;
      }
      elevMap.set(`${t.tx},${t.ty}`, t._elevPx);
    }

    // ── Pass 2: cull → sort → draw ───────────────────────────────────────────

    const buf = this._sortBuf;
    buf.length = 0;
    for (const t of tiles) {
      if (t._scX < -MARGIN - S || t._scX > W + MARGIN ||
          t._scY < -MARGIN - S || t._scY > H + MARGIN) continue;
      buf.push(t);
    }
    buf.sort((a, b) => a._depth - b._depth);

    // Screen-space corner offsets (same for every tile in this frame).
    //
    //   Tile diamond vertices in texture-space → screen-space offsets:
    //     North = (0,0)   → (0, 0)                  — origin, no offset needed
    //     East  = (S,0)   → (m11·S, m12·S)
    //     West  = (0,S)   → (m21·S, m22·S)
    //     South = (S,S)   → ((m11+m21)·S, (m12+m22)·S)
    //
    //   SE face (right riser): East→South top edge, dropped by riserE px.
    //   SW face (left  riser): West→South top edge, dropped by riserS px.
    //
    const eOx = m11 * S,          eOy = m12 * S;           // East offset
    const wOx = m21 * S,          wOy = m22 * S;           // West offset
    const sOx = (m11 + m21) * S,  sOy = (m12 + m22) * S;  // South offset

    const painter = this._painter;

    // Start at identity — skirt quads use absolute screen coords.
    oCtx.setTransform(1, 0, 0, 1, 0, 0);

    for (const t of buf) {
      const tx   = t._scX;
      const ty   = t._scY;
      const elev = t._elevPx;

      // ── SE face: right riser ───────────────────────────────────────────────
      //   Drawn only where this tile is higher than its eastern neighbour.
      //   The riser height is the elevation DELTA — this is the core fix.
      //   Using the absolute elevPx caused every tile to draw a skirt all
      //   the way to screen-zero, making adjacent same-height tiles fight.
      const elevE  = elevMap.get(`${t.tx + 1},${t.ty}`) ?? 0;
      const riserE = elev - elevE;
      if (riserE > 0.5) {
        const ex = tx + eOx,  ey = ty + eOy;   // East corner (top)
        const sx = tx + sOx,  sy = ty + sOy;   // South corner (top)

        // Primary shadow face — darker, facing away from the NW light source.
        oCtx.fillStyle = 'rgba(0,0,0,0.42)';
        oCtx.beginPath();
        oCtx.moveTo(ex,         ey);
        oCtx.lineTo(sx,         sy);
        oCtx.lineTo(sx,         sy + riserE);
        oCtx.lineTo(ex,         ey + riserE);
        oCtx.closePath();
        oCtx.fill();

        // Thin highlight seam along the top edge to crisp up the terrace step.
        oCtx.strokeStyle = 'rgba(255,255,255,0.10)';
        oCtx.lineWidth   = 0.75;
        oCtx.beginPath();
        oCtx.moveTo(ex, ey);
        oCtx.lineTo(sx, sy);
        oCtx.stroke();
      }

      // ── SW face: left riser ────────────────────────────────────────────────
      //   Same delta logic, looking at the southern neighbour (tx, ty+1).
      const elevS  = elevMap.get(`${t.tx},${t.ty + 1}`) ?? 0;
      const riserS = elev - elevS;
      if (riserS > 0.5) {
        const wx = tx + wOx,  wy = ty + wOy;   // West corner (top)
        const sx = tx + sOx,  sy = ty + sOy;   // South corner (top)

        // Secondary shadow face — slightly lighter than SE (catches ambient).
        oCtx.fillStyle = 'rgba(0,0,0,0.26)';
        oCtx.beginPath();
        oCtx.moveTo(wx,         wy);
        oCtx.lineTo(sx,         sy);
        oCtx.lineTo(sx,         sy + riserS);
        oCtx.lineTo(wx,         wy + riserS);
        oCtx.closePath();
        oCtx.fill();

        // Highlight seam.
        oCtx.strokeStyle = 'rgba(255,255,255,0.07)';
        oCtx.lineWidth   = 0.75;
        oCtx.beginPath();
        oCtx.moveTo(wx, wy);
        oCtx.lineTo(sx, sy);
        oCtx.stroke();
      }

      // ── Top face ──────────────────────────────────────────────────────────
      oCtx.setTransform(m11, m12, m21, m22, tx, ty);
      oCtx.drawImage(painter.getTexture(t.terrainId), 0, 0);

      if (t.tx === floorPX && t.ty === floorPY) {
        oCtx.fillStyle = 'rgba(255,255,255,0.20)';
        oCtx.fillRect(0, 0, S, S);
      }
      if (needGrid) {
        oCtx.strokeStyle = gridStyle;
        oCtx.lineWidth   = 0.5;
        oCtx.strokeRect(0, 0, S, S);
      }

      // Reset to identity so the next tile's skirt quads use screen coords.
      oCtx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  // ── Bitmap layer management ───────────────────────────────────────────────

  _drawTexturedLayer(tiles, playerTx, playerTy, focusX, focusY) {
      const { cam, ctx } = this;
      const W     = ctx.canvas.width;
      const H     = ctx.canvas.height;
      const stamp = this._updateTileMatrix(focusX, focusY);

      const needRebake =
        this._layerContentDirty ||
        !this._layerBitmap      ||
        this._layerBitmapCanvas?.width  !== W ||
        this._layerBitmapCanvas?.height !== H;

      if (needRebake || this._layerBitmapDirty || stamp !== this._lastBakeStamp) {
        if (!this._layerBitmapCanvas || this._layerBitmapCanvas.width !== W || this._layerBitmapCanvas.height !== H) {
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
        
        // NEW: Store the exact camera position at the moment of baking
        this._bakedCamX = cam.camX;
        this._bakedCamY = cam.camY;
      }

      if (this._layerBitmap) {
        // NEW: Calculate sub-pixel drift and offset the canvas
        const driftX = (this._bakedCamX ?? cam.camX) - cam.camX;
        const driftY = (this._bakedCamY ?? cam.camY) - cam.camY;
        ctx.drawImage(this._layerBitmap, driftX, driftY);
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
    const stamp    = this._updateProjStamp();
    const needGrid = cam.tilt < 0.35 && hw > 10;
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
        t._quad = (needGrid || isHighlight) ? topFaceQuad(t.tx, t.ty, 0, cam) : null;
        t._stamp = stamp;
      }

      if (t._scX < -MARGIN || t._scX > W + MARGIN ||
          t._scY < -MARGIN || t._scY > H + MARGIN) continue;
      buf.push(t);
    }

    buf.sort((a, b) => a._depth - b._depth);

    if (needGrid || buf.some(t => t.tx === floorPX && t.ty === floorPY)) {
      const ctx = this.ctx;

      if (needGrid) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(0,0,0,${(1 - cam.tilt / 0.35) * 0.15})`;
        ctx.lineWidth   = 0.5;
        for (const t of buf) {
          if (!t._quad) t._quad = topFaceQuad(t.tx, t.ty, 0, cam);
          const q = t._quad;
          ctx.moveTo(q[0].x, q[0].y);
          ctx.lineTo(q[1].x, q[1].y);
          ctx.lineTo(q[2].x, q[2].y);
          ctx.lineTo(q[3].x, q[3].y);
          ctx.closePath();
        }
        ctx.stroke();
      }

      for (const t of buf) {
        if (t.tx === floorPX && t.ty === floorPY) {
          if (!t._quad) t._quad = topFaceQuad(t.tx, t.ty, 0, cam);
          this._drawHighlight(t);
          break;
        }
      }
    }
  }

  // ── Merged-LOD layer ──────────────────────────────────────────────────────

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
      c.sc    = worldToScreen(blockX + lod / 2, blockY + lod / 2, 0, cam);
      c.stamp = stamp;
    }

    const blockPx = lod * (cam.tileW * cam.zoom);
    if (c.sc.x < -blockPx || c.sc.x > ctx.canvas.width  + blockPx ||
        c.sc.y < -blockPx || c.sc.y > ctx.canvas.height + blockPx) return;

    if (!c.blendCanvas || c.blendDirty) {
      if (!c.blendCanvas) {
        c.blendCanvas        = document.createElement('canvas');
        c.blendCanvas.width  = S;
        c.blendCanvas.height = S;
      }
      const bCtx = c.blendCanvas.getContext('2d');

      const freq = {};
      let total  = 0;
      for (let dy = 0; dy < lod; dy++) {
        for (let dx = 0; dx < lod; dx++) {
          const tid  = terrainCache.get(blockX + dx, blockY + dy) ?? 5;
          freq[tid]  = (freq[tid] ?? 0) + 1;
          total++;
        }
      }

      bCtx.clearRect(0, 0, S, S);
      for (const [tidStr, count] of Object.entries(freq)) {
        const tid     = Number(tidStr);
        const texture = this._painter?.getTexture(tid);
        if (!texture) continue;
        bCtx.globalAlpha              = count / total;
        bCtx.globalCompositeOperation = 'source-over';
        bCtx.drawImage(texture, 0, 0);
      }
      bCtx.globalAlpha              = 1;
      bCtx.globalCompositeOperation = 'source-over';

      const blurPx = lod * 1.5;
      if (blurPx > 0) {
        // Re-use a single scratch canvas instead of allocating per-block
        if (!this._sharedBlurCanvas) {
          this._sharedBlurCanvas = document.createElement('canvas');
          this._sharedBlurCanvas.width = S;
          this._sharedBlurCanvas.height = S;
          this._sharedBlurCtx = this._sharedBlurCanvas.getContext('2d');
        }
        
        const snap = this._sharedBlurCanvas;
        const snapCtx = this._sharedBlurCtx;
        
        snapCtx.clearRect(0, 0, S, S);
        snapCtx.filter = `blur(${blurPx}px)`;
        snapCtx.drawImage(c.blendCanvas, 0, 0);
        snapCtx.filter = 'none';

        bCtx.clearRect(0, 0, S, S);
        bCtx.drawImage(snap, 0, 0);
      }

      c.blendDirty = false;
    }

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
    
    // Add a small buffer (+lod) to prevent edge pop-in
    const halfW = Math.ceil(this.cam.mapW / 2) + lod;
    const halfH = Math.ceil(this.cam.mapH / 2) + lod;

    // SNAP to the LOD grid so cache keys are stable integers
    const startX = Math.floor((focusX - halfW) / lod) * lod;
    const endX   = Math.ceil((focusX + halfW) / lod) * lod;
    const startY = Math.floor((focusY - halfH) / lod) * lod;
    const endY   = Math.ceil((focusY + halfH) / lod) * lod;

    for (let gy = startY; gy < endY; gy += lod) {
      for (let gx = startX; gx < endX; gx += lod) {
        this.drawMergedBlock(gx, gy, lod, terrainCache, alpha, stamp);
      }
    }
  }

  // ── Cache invalidation ────────────────────────────────────────────────────

  invalidate() {
    this._bakeDirty        = true;
    this._layerBitmapDirty = true;
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