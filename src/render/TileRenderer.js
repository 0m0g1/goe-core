import { topFaceQuad, lerpColor, tileDepth, worldToScreen } from '../math/projection.js';

export class TileRenderer {
  // ── PATCH 1: constructor — accept shadowSystem ─────────────────────────────
  constructor(ctx, cam, terrainRegistry, shadowSystem = null) {
    this.ctx     = ctx;
    this.cam     = cam;
    this.terrain = terrainRegistry;
    this._shadows = shadowSystem; // Store reference to shadow logic

    // Reusable sort buffer — avoids array allocation every frame
    this._sortBuf = [];
  }

  // Updated drawTile to accept color overrides from AO logic
  drawTile(tx, ty, terrainId, highlight = false, overrideTop = null) {
    const { ctx, cam, terrain } = this;
    const c    = terrain.colors[terrainId] || terrain.colors[5];
    const quad = topFaceQuad(tx, ty, 0, cam);

    ctx.beginPath();
    quad.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();

    // Use AO-processed color if available
    const topCol = overrideTop || c.top;
    ctx.fillStyle = lerpColor(c.flat, topCol, cam.tilt);
    ctx.fill();

    if (highlight) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fill();
    }
    if (cam.tilt < 0.35) {
      ctx.strokeStyle = `rgba(0,0,0,${(1 - cam.tilt / 0.35) * 0.15})`;
      ctx.lineWidth   = 0.5;
      ctx.stroke();
    }
  }

  // ── PATCH 4: drawLayer signature update ────────────────────────────────────
  drawLayer(tiles, playerTx, playerTy, terrainCache, pGX, pGY) {
    const { ctx, cam, terrain } = this;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const MARGIN = 80;

    // Store fresh values for AO factor calculation
    this._terrainCache = terrainCache;
    this._pGX = pGX;
    this._pGY = pGY;

    // ── 1. Screen-cull first ─────────────────────────────────────────────────
    const buf = this._sortBuf;
    buf.length = 0;

    for (const t of tiles) {
      const sc = worldToScreen(t.tx + 0.5, t.ty + 0.5, 0, cam);
      if (sc.x < -MARGIN || sc.x > W + MARGIN ||
          sc.y < -MARGIN || sc.y > H + MARGIN) continue;
      t._depth = tileDepth(t.tx, t.ty, cam.rotation);
      t._sx    = sc.x;
      t._sy    = sc.y;
      buf.push(t);
    }

    // ── 2. Sort visible tiles ────────────────────────────────────────────────
    buf.sort((a, b) => a._depth - b._depth);

    // ── 3. Batch vs Individual Loop ──────────────────────────────────────────
    // Disable batching if Shadows/AO are enabled to allow unique tile colors
    const useBatch = cam.tilt < 0.05 && !this._shadows?.enabled;

    if (useBatch) {
      const buckets = new Map();
      for (const t of buf) {
        const tid = t.terrainId;
        if (!buckets.has(tid)) buckets.set(tid, []);
        buckets.get(tid).push(t);
      }

      for (const [tid, group] of buckets) {
        const c = terrain.colors[tid] || terrain.colors[5];
        ctx.fillStyle = lerpColor(c.flat, c.top, cam.tilt);
        ctx.beginPath();
        for (const t of group) {
          const quad = topFaceQuad(t.tx, t.ty, 0, cam);
          ctx.moveTo(quad[0].x, quad[0].y);
          for (let i = 1; i < 4; i++) ctx.lineTo(quad[i].x, quad[i].y);
          ctx.closePath();
        }
        ctx.fill();
      }

      // Draw player highlight separately on top
      for (const t of buf) {
        if (Math.floor(playerTx) === t.tx && Math.floor(playerTy) === t.ty) {
          const quad = topFaceQuad(t.tx, t.ty, 0, cam);
          ctx.beginPath();
          ctx.moveTo(quad[0].x, quad[0].y);
          for (let i = 1; i < 4; i++) ctx.lineTo(quad[i].x, quad[i].y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fill();
          break;
        }
      }

    } else {
      // ── PATCH 3: apply AO per tile ─────────────────────────────────────────
      for (const t of buf) {
        const isPl = Math.floor(playerTx) === t.tx && Math.floor(playerTy) === t.ty;
        const tc = terrain.colors[t.terrainId] || terrain.colors[5];
        
        let topC = tc.top;

        if (this._shadows?.enabled) {
          const ao = this._shadows.aoFactor(
            t.tx, t.ty,
            this._terrainCache,
            this._pGX, this._pGY,
            this.cam.mapW, this.cam.mapH,
            this.terrain
          );
          if (ao < 0.999) {
            topC = this._shadows.applyAO(topC, ao);
            // If drawTile supported sides, we would apply AO to rightC/leftC here too
          }
        }

        this.drawTile(t.tx, t.ty, t.terrainId, isPl, topC);
      }
    }
  }

  // ... (Remainder of class drawMergedBlock etc. remains unchanged) ...
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
}

function tileHalfWidth(zoom, tileW) {
  return tileW * zoom * 0.5;
}