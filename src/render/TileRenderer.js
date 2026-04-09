import { topFaceQuad, lerpColor, tileDepth, worldToScreen } from '../math/projection.js';

export class TileRenderer {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} cam
   * @param {object} terrainRegistry
   * @param {object|null} shadowSystem
   */
  constructor(ctx, cam, terrainRegistry, shadowSystem = null) {
    this.ctx     = ctx;
    this.cam     = cam;
    this.terrain = terrainRegistry;
    this._shadows = shadowSystem;

    // ── Baked-map cache ─────────────────────────────────────────────────────
    // One flat canvas that holds every tile in a straight top-down grid.
    // It is re-baked whenever the player moves (pGX/pGY changes) or the
    // sun moves enough to alter AO colours.
    this._mapCanvas   = document.createElement('canvas');
    this._mapCtx      = this._mapCanvas.getContext('2d');
    this._lastPGX     = null;
    this._lastPGY     = null;
    this._lastSunAngle = shadowSystem?.sunAngle    ?? 0;
    this._lastSunElev  = shadowSystem?.sunElevation ?? 0;
    this._bakeDirty   = true;           // force first bake

    // Pixels per tile inside the baked image (does NOT have to match screen size)
    this.BAKE_TILE_PX = 32;

    // Reusable sort buffer — avoids allocation every frame
    this._sortBuf = [];
  }

  // ── Private: bake all tiles into a straight grid image ───────────────────
  /**
   * Renders every tile (0…mapW, 0…mapH) into `this._mapCanvas` as a plain
   * rectangular grid.  AO / shadow colours are applied at this stage so the
   * per-tile draw loop is free of per-pixel maths.
   *
   * @param {object} terrainCache
   * @param {number} pGX   player global-X (used by terrainCache.getLocal)
   * @param {number} pGY   player global-Y
   */
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
        // getLocal uses the player position so the cache stays correct as the
        // player moves.  Falls back to terrainId 5 (default) if out of bounds.
        const tid = terrainCache.getLocal?.(tx, ty, pGX, pGY, W, H)
                 ?? terrainCache.get?.(tx, ty)
                 ?? 5;
        const terrainId = (tid !== null && tid !== undefined) ? tid : 5;

        const c = terrain.colors[terrainId] || terrain.colors[5];

        // Base colour for the top face, blended by tilt for flat-view compat.
        let color = lerpColor(c.flat, c.top, cam.tilt);

        // Apply AO / ambient shadow on top of the base colour.
        if (this._shadows?.enabled) {
          const ao = this._shadows.aoFactor(
            tx, ty,
            terrainCache,
            pGX, pGY,
            W, H,
            terrain
          );
          if (ao < 0.999) {
            color = this._shadows.applyAO(color, ao);
          }
        }

        ictx.fillStyle = color;
        // +0.5 overlap prevents hairline seams inside the baked image
        ictx.fillRect(tx * PX, ty * PX, PX + 0.5, PX + 0.5);
      }
    }

    this._bakeDirty = false;
  }

  // ── Private: should we re-bake this frame? ────────────────────────────────
  _needsRebake(pGX, pGY) {
    if (this._bakeDirty)           return true;
    if (pGX !== this._lastPGX)     return true;
    if (pGY !== this._lastPGY)     return true;
    if (this._shadows?.enabled) {
      if (Math.abs((this._shadows.sunAngle    ?? 0) - this._lastSunAngle) > 0.1) return true;
      if (Math.abs((this._shadows.sunElevation ?? 0) - this._lastSunElev)  > 0.01) return true;
    }
    return false;
  }

  // ── drawTile: draws a single isometric quad, sampling colour from the baked
  //              image so no per-tile colour maths are needed here.
  /**
   * @param {number} tx           local tile X (0…mapW)
   * @param {number} ty           local tile Y (0…mapH)
   * @param {number} terrainId
   * @param {boolean} highlight   player-position highlight
   */
  drawTile(tx, ty, terrainId, highlight = false) {
    const { ctx, cam, terrain } = this;
    const PX   = this.BAKE_TILE_PX;
    const quad = topFaceQuad(tx, ty, 0, cam);

    // Build the clipping path for this tile's isometric quad
    ctx.save();
    ctx.beginPath();
    quad.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    ctx.clip();

    // ── Map the flat baked tile onto the isometric quad via a CSS/canvas
    //    transform.  We place the image so tile (tx,ty) sits exactly under
    //    the quad's top-left corner, then apply the same transform that turns
    //    top-down into isometric.
    //
    //    The quad corners (from topFaceQuad) are:
    //      [0] top   (tx+0.5, ty)     → screen "apex"
    //      [1] right (tx+1,   ty+0.5)
    //      [2] bottom(tx+0.5, ty+1)
    //      [3] left  (tx,     ty+0.5)
    //
    //    We use a 2-D affine transform whose columns are derived from the
    //    two edge vectors of the quad so the baked pixels stretch perfectly
    //    into the diamond shape.
    const [p0, p1, , p3] = quad; // top, right, _, left

    // Vector along the "right" edge of the iso diamond (maps bake-X axis)
    const ax = p1.x - p0.x,  ay = p1.y - p0.y;   // right edge (1 tile)
    // Vector along the "left"  edge of the iso diamond (maps bake-Y axis)
    const bx = p3.x - p0.x,  by = p3.y - p0.y;   // left  edge (1 tile)

    // Scale from bake-pixel space to tile space
    const s = 1 / PX;

    // setTransform(a, b, c, d, e, f) maps unit square → screen quad:
    //   e, f  = screen position of tile origin (top corner of diamond)
    //   a, b  = right-edge vector scaled to one bake-pixel
    //   c, d  = left-edge vector scaled to one bake-pixel
    ctx.setTransform(
      ax * s, ay * s,
      bx * s, by * s,
      p0.x, p0.y
    );

    // Draw the entire baked map; only the clipped tile region is visible.
    ctx.drawImage(
      this._mapCanvas,
      -tx * PX, -ty * PX   // offset so this tile's pixels align with the origin
    );

    ctx.restore();          // resets transform + clip

    // Player-position highlight on top
    if (highlight) {
      ctx.beginPath();
      quad.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
    }

    // Grid lines at low tilt angles
    if (cam.tilt < 0.35) {
      ctx.beginPath();
      quad.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.strokeStyle = `rgba(0,0,0,${(1 - cam.tilt / 0.35) * 0.15})`;
      ctx.lineWidth   = 0.5;
      ctx.stroke();
    }
  }

  // ── drawLayer: main entry-point called by the engine each frame ───────────
  /**
   * @param {object[]} tiles        visible tile list from the engine
   * @param {number}   playerTx     player local tile X
   * @param {number}   playerTy     player local tile Y
   * @param {object}   terrainCache
   * @param {number}   pGX          player global X
   * @param {number}   pGY          player global Y
   */
  drawLayer(tiles, playerTx, playerTy, terrainCache, pGX, pGY) {
    const { ctx, cam } = this;
    const W      = ctx.canvas.width;
    const H      = ctx.canvas.height;
    const MARGIN = 80;

    // ── 1. Conditionally re-bake the flat map image ─────────────────────────
    if (this._needsRebake(pGX, pGY)) {
      this._bakeMap(terrainCache, pGX, pGY);
      this._lastPGX      = pGX;
      this._lastPGY      = pGY;
      this._lastSunAngle = this._shadows?.sunAngle    ?? 0;
      this._lastSunElev  = this._shadows?.sunElevation ?? 0;
    }

    // ── 2. Screen-cull ───────────────────────────────────────────────────────
    const buf = this._sortBuf;
    buf.length = 0;
    for (const t of tiles) {
      const sc = worldToScreen(t.tx + 0.5, t.ty + 0.5, 0, cam);
      if (sc.x < -MARGIN || sc.x > W + MARGIN ||
          sc.y < -MARGIN || sc.y > H + MARGIN) continue;
      t._depth = tileDepth(t.tx, t.ty, cam.rotation);
      buf.push(t);
    }

    // ── 3. Depth-sort ────────────────────────────────────────────────────────
    buf.sort((a, b) => a._depth - b._depth);

    // ── 4. Draw each visible tile by sampling from the baked image ──────────
    const floorPX = Math.floor(playerTx);
    const floorPY = Math.floor(playerTy);
    for (const t of buf) {
      const isPl = t.tx === floorPX && t.ty === floorPY;
      this.drawTile(t.tx, t.ty, t.terrainId, isPl);
    }
  }

  // ── LOD / merged-block helpers (unchanged from V1) ────────────────────────

  drawMergedBlock(blockX, blockY, lod, terrainCache, pGX, pGY, alpha) {
    const { ctx, cam, terrain } = this;
    const mapW = cam.mapW, mapH = cam.mapH;
    const W = ctx.canvas.width, H = ctx.canvas.height;

    const centerLocal = {
      tx: blockX + lod / 2 - pGX + mapW / 2,
      ty: blockY + lod / 2 - pGY + mapH / 2,
    };
    const sc = worldToScreen(centerLocal.tx, centerLocal.ty, 0, cam);
    const blockScreenSize = lod * tileHalfWidth(cam.zoom, cam.tileW) * 2;
    if (sc.x < -blockScreenSize || sc.x > W + blockScreenSize ||
        sc.y < -blockScreenSize || sc.y > H + blockScreenSize) return;

    const typeCounts = new Map();
    let totalTiles = 0;
    for (let dy = 0; dy < lod; dy++) {
      for (let dx = 0; dx < lod; dx++) {
        const tid = terrainCache.get(blockX + dx, blockY + dy);
        if (tid !== null) {
          typeCounts.set(tid, (typeCounts.get(tid) || 0) + 1);
          totalTiles++;
        }
      }
    }
    if (totalTiles === 0) return;

    let r = 0, g = 0, b = 0;
    for (const [tid, count] of typeCounts) {
      const col = terrain.colors[tid]?.flat || '#5bc23a';
      r += parseInt(col.slice(1, 3), 16) * count;
      g += parseInt(col.slice(3, 5), 16) * count;
      b += parseInt(col.slice(5, 7), 16) * count;
    }
    r = Math.round(r / totalTiles);
    g = Math.round(g / totalTiles);
    b = Math.round(b / totalTiles);

    const toLocal = (gx, gy) => ({
      tx: gx - pGX + mapW / 2,
      ty: gy - pGY + mapH / 2,
    });
    const pts = [
      toLocal(blockX,       blockY),
      toLocal(blockX + lod, blockY),
      toLocal(blockX + lod, blockY + lod),
      toLocal(blockX,       blockY + lod),
    ].map(c => worldToScreen(c.tx, c.ty, 0, cam));

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
    ctx.globalAlpha = 1;
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

  // ── Utility ───────────────────────────────────────────────────────────────

  /** Force the baked image to be rebuilt on the next frame. */
  invalidate() {
    this._bakeDirty = true;
  }
}

function tileHalfWidth(zoom, tileW) {
  return tileW * zoom * 0.5;
}