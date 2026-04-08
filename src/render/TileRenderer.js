import { topFaceQuad, lerpColor, tileDepth, worldToScreen } from '../math/projection.js';

export class TileRenderer {
  constructor(ctx, cam, terrainRegistry) {
    this.ctx      = ctx;
    this.cam      = cam;
    this.terrain  = terrainRegistry;
  }

  drawTile(tx, ty, terrainId, highlight = false) {
    const { ctx, cam, terrain } = this;
    const c    = terrain.colors[terrainId] || terrain.colors[5];
    const quad = topFaceQuad(tx, ty, 0, cam);

    ctx.beginPath();
    quad.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();

    ctx.fillStyle = lerpColor(c.flat, c.top, cam.tilt);
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

  drawLayer(tiles, playerTx, playerTy) {
    const sorted = [...tiles].sort(
      (a, b) => tileDepth(a.tx, a.ty, this.cam.rotation)
              - tileDepth(b.tx, b.ty, this.cam.rotation)
    );
    for (const t of sorted) {
      const isPl = Math.floor(playerTx) === t.tx && Math.floor(playerTy) === t.ty;
      this.drawTile(t.tx, t.ty, t.terrainId, isPl);
    }
  }

  /**
   * Draw a merged terrain block (average colour of lod×lod tiles).
   */
  drawMergedBlock(blockX, blockY, lod, terrainCache, pGX, pGY, alpha) {
    const { ctx, cam, terrain } = this;
    const mapW = cam.mapW, mapH = cam.mapH;

    // 1. Count terrain types in block
    const typeCounts = new Map();
    let totalTiles = 0;
    for (let dy = 0; dy < lod; dy++) {
      for (let dx = 0; dx < lod; dx++) {
        const gx = blockX + dx;
        const gy = blockY + dy;
        const tid = terrainCache.get(gx, gy);
        if (tid !== null) {
          typeCounts.set(tid, (typeCounts.get(tid) || 0) + 1);
          totalTiles++;
        }
      }
    }
    if (totalTiles === 0) return;

    // 2. Weighted average colour (flat colours only)
    let r = 0, g = 0, b = 0;
    for (const [tid, count] of typeCounts) {
      const colStr = terrain.colors[tid]?.flat || '#5bc23a';
      r += parseInt(colStr.slice(1,3), 16) * count;
      g += parseInt(colStr.slice(3,5), 16) * count;
      b += parseInt(colStr.slice(5,7), 16) * count;
    }
    r = Math.round(r / totalTiles);
    g = Math.round(g / totalTiles);
    b = Math.round(b / totalTiles);
    const avgColor = `rgb(${r},${g},${b})`;

    // 3. Project block corners to screen
    const toLocal = (gx, gy) => ({
      tx: gx - pGX + mapW/2,
      ty: gy - pGY + mapH/2
    });
    const corners = [
      toLocal(blockX, blockY),
      toLocal(blockX + lod, blockY),
      toLocal(blockX + lod, blockY + lod),
      toLocal(blockX, blockY + lod)
    ];
    const screenPts = corners.map(c => worldToScreen(c.tx, c.ty, 0, cam));

    // 4. Draw filled polygon
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    screenPts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = avgColor;
    ctx.fill();
  }

  /**
   * Draw full merged terrain layer.
   */
  drawMergedLayer(terrainCache, pGX, pGY, lod, alpha) {
    const range = 40;
    for (let gy = pGY - range; gy < pGY + range; gy += lod) {
      for (let gx = pGX - range; gx < pGX + range; gx += lod) {
        this.drawMergedBlock(gx, gy, lod, terrainCache, pGX, pGY, alpha);
      }
    }
  }
}