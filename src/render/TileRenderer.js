import { topFaceQuad, worldToScreen } from '../math/projection.js';

export class TileRenderer {
    constructor(ctx, cam, terrainRegistry, shadowSystem = null) {
        this.ctx = ctx;
        this.cam = cam;
        this.terrain = terrainRegistry;
        this._shadows = shadowSystem;

        this.CHUNK_SIZE = 16;
        this._chunkCache = new Map(); // Stores 16x16 baked canvases
        
        this._lastSunAngle = shadowSystem?.sunAngle || 0;
    }

    /**
     * Bakes a 16x16 area. This is much faster than baking the whole map.
     */
    _bakeChunk(cgx, cgy, terrainCache) {
        const size = this.CHUNK_SIZE;
        const tileW = 32; 
        const canvas = document.createElement('canvas');
        canvas.width = size * tileW;
        canvas.height = size * tileW;
        const ictx = canvas.getContext('2d');

        for (let ty = 0; ty < size; ty++) {
            for (let tx = 0; tx < size; tx++) {
                const gx = Math.floor(cgx + tx);
                const gy = Math.floor(cgy + ty);
                
                const tid = terrainCache.get(gx, gy);
                const terrainId = (tid !== null && tid !== undefined) ? tid : 5;
                const c = this.terrain.colors[terrainId] || this.terrain.colors[5];
                
                let color = c.top;

                // Only calculate AO if shadows are actually on
                if (this._shadows?.enabled) {
                    const ao = this._shadows.aoFactor(
                        gx, gy,
                        terrainCache,
                        0, 0, // pGX/pGY are 0 because we are using absolute gx/gy
                        this.cam.mapW, this.cam.mapH,
                        this.terrain
                    );
                    if (ao < 0.99) color = this._shadows.applyAO(color, ao);
                }

                ictx.fillStyle = color;
                // Add 0.5px bleed to prevent gaps inside the chunk
                ictx.fillRect(tx * tileW, ty * tileW, tileW + 0.5, tileW + 0.5);
            }
        }
        return canvas;
    }

    drawLayer(tiles, playerTx, playerTy, terrainCache, pGX, pGY) {
        const { ctx, cam } = this;

        // 1. If sun moved, clear all cached chunks
        if (this._shadows?.enabled && Math.abs(this._shadows.sunAngle - this._lastSunAngle) > 0.1) {
            this._chunkCache.clear();
            this._lastSunAngle = this._shadows.sunAngle;
        }

        // 2. Identify which 16x16 chunks we need for the current view
        const visibleChunks = new Map();
        for (const t of tiles) {
            const gx = Math.floor(t.tx - cam.mapW / 2 + pGX);
            const gy = Math.floor(t.ty - cam.mapH / 2 + pGY);
            const cgx = Math.floor(gx / this.CHUNK_SIZE) * this.CHUNK_SIZE;
            const cgy = Math.floor(gy / this.CHUNK_SIZE) * this.CHUNK_SIZE;
            const key = `${cgx},${cgy}`;
            if (!visibleChunks.has(key)) visibleChunks.set(key, { cgx, cgy });
        }

        // 3. Draw each visible chunk
        for (const chunk of visibleChunks.values()) {
            const key = `${chunk.cgx},${chunk.cgy}`;
            if (!this._chunkCache.has(key)) {
                this._chunkCache.set(key, this._bakeChunk(chunk.cgx, chunk.cgy, terrainCache));
            }
            const baked = this._chunkCache.get(key);

            // Calculate screen position
            const ltx = chunk.cgx - pGX + cam.mapW / 2;
            const lty = chunk.cgy - pGY + cam.mapH / 2;
            const p0 = worldToScreen(ltx, lty, 0, cam);
            const p1 = worldToScreen(ltx + this.CHUNK_SIZE, lty, 0, cam);
            const p2 = worldToScreen(ltx, lty + this.CHUNK_SIZE, 0, cam);

            const Wc = this.CHUNK_SIZE * 32;
            const a = (p1.x - p0.x) / Wc, b = (p1.y - p0.y) / Wc;
            const c = (p2.x - p0.x) / Wc, d = (p2.y - p0.y) / Wc;

            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.transform(a, b, c, d, p0.x, p0.y);
            // Draw with +1px bleed to stop the "Black Strips" between chunks
            ctx.drawImage(baked, 0, 0, Wc + 1, Wc + 1);
            ctx.restore();
        }

        // 4. Player highlight
        const ptx = Math.floor(playerTx), pty = Math.floor(playerTy);
        const quad = topFaceQuad(ptx, pty, 0, cam);
        ctx.beginPath();
        quad.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();
    }

    /**
     * Optimized LOD rendering (Clustering)
     * Fixes the "Black Patches" by adding sub-pixel fill.
     */
    drawMergedBlock(blockX, blockY, lod, terrainCache, pGX, pGY, alpha) {
        const { ctx, cam, terrain } = this;
        const local = {
            tx: blockX - pGX + cam.mapW / 2,
            ty: blockY - pGY + cam.mapH / 2,
        };

        const p0 = worldToScreen(local.tx, local.ty, 0, cam);
        const p1 = worldToScreen(local.tx + lod, local.ty, 0, cam);
        const p2 = worldToScreen(local.tx + lod, local.ty + lod, 0, cam);
        const p3 = worldToScreen(local.tx, local.ty + lod, 0, cam);

        // Quick screen cull
        if (p0.x < -100 || p0.x > ctx.canvas.width + 100) return;

        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = 0; dy < lod; dy += Math.max(1, lod/4)) {
            for (let dx = 0; dx < lod; dx += Math.max(1, lod/4)) {
                const tid = terrainCache.get(blockX + dx, blockY + dy) ?? 5;
                const col = terrain.colors[tid]?.flat || '#5bc23a';
                r += parseInt(col.slice(1, 3), 16);
                g += parseInt(col.slice(3, 5), 16);
                b += parseInt(col.slice(5, 7), 16);
                count++;
            }
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${Math.round(r/count)},${Math.round(g/count)},${Math.round(b/count)})`;
        
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        
        // FILL STROKE: This is the secret to fixing black patches in LOD.
        // It draws a tiny border of the same color to bridge the gap between quads.
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.globalAlpha = 1;
    }

    drawMergedLayer(terrainCache, pGX, pGY, lod, alpha) {
        const range = Math.ceil(this.cam.mapW / 2);
        for (let gy = pGY - range; gy < pGY + range; gy += lod) {
            for (let gx = pGX - range; gx < pGX + range; gx += lod) {
                this.drawMergedBlock(gx, gy, lod, terrainCache, pGX, pGY, alpha);
            }
        }
    }
}