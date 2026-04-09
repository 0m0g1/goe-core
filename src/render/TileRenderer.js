import { lerpColor, tileDepth, worldToScreen, topFaceQuad } from '../math/projection.js';

export class TileRenderer {
  constructor(ctx, cam, terrainRegistry, shadowSystem = null) {
    this.ctx      = ctx;
    this.cam      = cam;
    this.terrain  = terrainRegistry;
    this._shadows = shadowSystem;

    // ── Baked flat-map canvas ───────────────────────────────────────────────
    // One pixel per tile.  We keep it tiny (1px/tile) so the drawImage call
    // is fast; the canvas transform handles all the scaling/skewing.
    // You can raise BAKE_TILE_PX to e.g. 4 if you want sub-tile colour
    // gradients (AO) to look smoother, but 1 is fine for solid tiles.
    this.BAKE_TILE_PX = 1;

    this._mapCanvas = document.createElement('canvas');
    this._mapCtx    = this._mapCanvas.getContext('2d', { alpha: false });

    this._lastPGX      = null;
    this._lastPGY      = null;
    this._lastSunAngle = shadowSystem?.sunAngle    ?? 0;
    this._lastSunElev  = shadowSystem?.sunElevation ?? 0;
    this._bakeDirty    = true;

    // Reusable depth-sort buffer
    this._sortBuf = [];
  }

  // ── Bake every tile into the flat grid image ──────────────────────────────
  _bakeMap(terrainCache, pGX, pGY) {
    const { cam, terrain } = this;
    const W  = cam.mapW;
    const H  = cam.mapH;
    const PX = this.BAKE_TILE_PX;

    this._mapCanvas.width  = W * PX;
    this._mapCanvas.height = H * PX;
    const ictx = this._mapCtx;

    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const tid = terrainCache.getLocal?.(tx, ty, pGX, pGY, W, H)
                 ?? terrainCache.get?.(tx, ty)
                 ?? 5;
        const terrainId = (tid !== null && tid !== undefined) ? tid : 5;
        const c = terrain.colors[terrainId] || terrain.colors[5];

        let color = lerpColor(c.flat, c.top, cam.tilt);

        if (this._shadows?.enabled) {
          const ao = this._shadows.aoFactor(
            tx, ty, terrainCache, pGX, pGY, W, H, terrain
          );
          if (ao < 0.999) color = this._shadows.applyAO(color, ao);
        }

        ictx.fillStyle = color;
        ictx.fillRect(tx * PX, ty * PX, PX, PX);
      }
    }

    this._bakeDirty = false;
  }

  _needsRebake(pGX, pGY) {
    if (this._bakeDirty)       return true;
    if (pGX !== this._lastPGX) return true;
    if (pGY !== this._lastPGY) return true;
    if (this._shadows?.enabled) {
      if (Math.abs((this._shadows.sunAngle    ?? 0) - this._lastSunAngle) > 0.1)  return true;
      if (Math.abs((this._shadows.sunElevation ?? 0) - this._lastSunElev)  > 0.01) return true;
    }
    return false;
  }

  // ── Draw the whole baked image in ONE call using an iso transform ─────────
  //
  //  The isometric projection maps tile (tx, ty) to screen via worldToScreen.
  //  worldToScreen is linear in tx and ty, so we can express it as a 2-D affine:
  //
  //    screen.x = ox + tx * a + ty * c
  //    screen.y = oy + tx * b + ty * d
  //
  //  We derive those vectors by sampling worldToScreen at three known points,
  //  set ctx.setTransform once, then drawImage the baked canvas — done.
  //  No per-tile clipping, no gaps, no bleeding.
  //
  _drawBakedImage() {
    const { ctx, cam } = this;
    const PX = this.BAKE_TILE_PX;

    // Sample three corners to derive the affine transform
    const p00 = worldToScreen(0, 0, 0, cam);  // tile (0,0) origin
    const p10 = worldToScreen(1, 0, 0, cam);  // +1 tile in X
    const p01 = worldToScreen(0, 1, 0, cam);  // +1 tile in Y

    // Per-bake-pixel step vectors
    const ax = (p10.x - p00.x) / PX;   // screen dx per baked pixel in X
    const ay = (p10.y - p00.y) / PX;
    const bx = (p01.x - p00.x) / PX;   // screen dx per baked pixel in Y
    const by = (p01.y - p00.y) / PX;

    ctx.save();
    // setTransform(a, b, c, d, e, f) maps image pixel (px,py) to screen:
    //   screenX = a*px + c*py + e
    //   screenY = b*px + d*py + f
    ctx.setTransform(ax, ay, bx, by, p00.x, p00.y);
    ctx.imageSmoothingEnabled = false;  // keep pixel edges crisp
    ctx.drawImage(this._mapCanvas, 0, 0);
    ctx.restore();
  }

  // ── Per-tile highlight overlay (player position, hover, etc.) ────────────
  _drawHighlight(tx, ty) {
    const { ctx, cam } = this;
    const quad = topFaceQuad(tx, ty, 0, cam);
    ctx.beginPath();
    quad.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
  }

  // ── Optional per-tile grid lines at low tilt ─────────────────────────────
  _drawGrid(tx, ty) {
    const { ctx, cam } = this;
    const quad = topFaceQuad(tx, ty, 0, cam);
    ctx.beginPath();
    quad.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    ctx.strokeStyle = `rgba(0,0,0,${(1 - cam.tilt / 0.35) * 0.15})`;
    ctx.lineWidth   = 0.5;
    ctx.stroke();
  }

  // ── Main entry point called by the engine each frame ─────────────────────
  drawLayer(tiles, playerTx, playerTy, terrainCache, pGX, pGY) {
    const { ctx, cam } = this;
    const W      = ctx.canvas.width;
    const H      = ctx.canvas.height;
    const MARGIN = 80;

    // 1. Re-bake flat map if player moved or sun shifted
    if (this._needsRebake(pGX, pGY)) {
      this._bakeMap(terrainCache, pGX, pGY);
      this._lastPGX      = pGX;
      this._lastPGY      = pGY;
      this._lastSunAngle = this._shadows?.sunAngle    ?? 0;
      this._lastSunElev  = this._shadows?.sunElevation ?? 0;
    }

    // 2. Stamp the entire baked map onto the screen in ONE drawImage call
    this._drawBakedImage();

    // 3. Cull visible tiles — only needed for overlay passes below
    const buf = this._sortBuf;
    buf.length = 0;
    for (const t of tiles) {
      const sc = worldToScreen(t.tx + 0.5, t.ty + 0.5, 0, cam);
      if (sc.x < -MARGIN || sc.x > W + MARGIN ||
          sc.y < -MARGIN || sc.y > H + MARGIN) continue;
      t._depth = tileDepth(t.tx, t.ty, cam.rotation);
      buf.push(t);
    }
    buf.sort((a, b) => a._depth - b._depth);

    // 4. Overlay pass — highlights and grid lines only
    const floorPX  = Math.floor(playerTx);
    const floorPY  = Math.floor(playerTy);
    const needGrid = cam.tilt < 0.35;

    for (const t of buf) {
      if (t.tx === floorPX && t.ty === floorPY) this._drawHighlight(t.tx, t.ty);
      if (needGrid) this._drawGrid(t.tx, t.ty);
    }
  }

  // ── Force rebake next frame (call after terrain edits) ───────────────────
  invalidate() { this._bakeDirty = true; }

  // ── LOD helpers (unchanged from V1) ──────────────────────────────────────

drawMergedBlock(blockX, blockY, lod, terrainCache, pGX, pGY, alpha) {
    const { ctx, cam, terrain } = this;
    const mapW = cam.mapW, mapH = cam.mapH;

    const centerLocal = {
      tx: blockX + lod / 2 - pGX + mapW / 2,
      ty: blockY + lod / 2 - pGY + mapH / 2,
    };
    
    const sc = worldToScreen(centerLocal.tx, centerLocal.ty, 0, cam);
    const blockScreenSize = lod * (cam.tileW * cam.zoom);
    if (sc.x < -blockScreenSize || sc.x > ctx.canvas.width + blockScreenSize ||
        sc.y < -blockScreenSize || sc.y > ctx.canvas.height + blockScreenSize) return;

    // Fast Color Averaging
    let r = 0, g = 0, b = 0, count = 0;
    for (let dy = 0; dy < lod; dy += Math.max(1, Math.floor(lod/2))) {
      for (let dx = 0; dx < lod; dx += Math.max(1, Math.floor(lod/2))) {
        const tid = terrainCache.get(blockX + dx, blockY + dy) ?? 5;
        const col = terrain.colors[tid]?.flat || '#5bc23a';
        r += parseInt(col.slice(1, 3), 16);
        g += parseInt(col.slice(3, 5), 16);
        b += parseInt(col.slice(5, 7), 16);
        count++;
      }
    }
    
    const fillStyle = `rgb(${Math.round(r/count)},${Math.round(g/count)},${Math.round(b/count)})`;

    const toLocal = (gx, gy) => ({ tx: gx - pGX + mapW / 2, ty: gy - pGY + mapH / 2 });
    const pts = [
      toLocal(blockX,       blockY),
      toLocal(blockX + lod, blockY),
      toLocal(blockX + lod, blockY + lod),
      toLocal(blockX,       blockY + lod),
    ].map(c => worldToScreen(c.tx, c.ty, 0, cam));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    
    ctx.fillStyle = fillStyle;
    ctx.fill();

    // ── THE CRITICAL SEAM FIX ──
    // Drawing a thin stroke of the same color bridges the 1px anti-aliasing 
    // gap between adjacent LOD blocks.
    ctx.strokeStyle = fillStyle;
    ctx.lineWidth = 1.2; 
    ctx.stroke();

    ctx.restore();
  }

  drawMergedLayer(terrainCache, pGX, pGY, lod, alpha) {
    const mapW = this.cam.mapW;
    const mapH = this.cam.mapH;
    const halfW = Math.ceil(mapW / 2);
    const halfH = Math.ceil(mapH / 2);

    for (let gy = pGY - halfH; gy < pGY + halfH; gy += lod) {
      for (let gx = pGX - halfW; gx < pGX + halfW; gx += lod) {
        this.drawMergedBlock(gx, gy, lod, terrainCache, pGX, pGY, alpha);
      }
    }
  }
}