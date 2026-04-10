/**
 * GOE Core — ShadowSystem
 */
import { worldToScreen } from '../math/projection.js';

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function darkenHex(hex, factor) {
  const [r, g, b] = hexToRgb(hex);
  const f = Math.max(0, Math.min(1, factor));
  return '#' + [r, g, b].map(c => Math.round(c * f).toString(16).padStart(2, '0')).join('');
}

export class ShadowSystem {
  constructor(ctx, cam, opts = {}) {
    this.ctx = ctx;
    this.cam = cam;
    this.sunAngle     = opts.sunAngle     ?? Math.PI * 1.5; 
    this.sunElevation = opts.sunElevation ?? Math.PI / 5;
    this.shadowAlpha  = opts.shadowAlpha  ?? 0.22;
    this.shadowColor  = opts.shadowColor  ?? '#000000';
    this.aoStrength   = opts.aoStrength   ?? 0.28;
    this.enabled      = opts.enabled      ?? true;
  }

  beginFrame() {
    if (!this.enabled) return;
    const sunElev = Math.max(0.1, this.sunElevation);
    const lengthScale = 1 / Math.tan(sunElev);
    this._uDX = Math.cos(this.sunAngle) * lengthScale;
    this._uDY = Math.sin(this.sunAngle) * lengthScale;
  }

  /**
   * Renders merged building shadows to prevent overlapping alpha stacking.
   */
  drawBuildingShadows(cachedDrawList) {
    if (!this.enabled || !cachedDrawList.length || this.cam.tilt < 0.05) return;

    const { ctx, cam } = this;
    ctx.save();
    ctx.fillStyle = this.shadowColor;
    ctx.globalAlpha = this.shadowAlpha * Math.min(1, cam.tilt / 0.3);
    ctx.globalCompositeOperation = 'multiply';

    // Start one path for all shadows to merge them into a single transparency layer
    ctx.beginPath();

    const VU = 8;
    for (const { p, elev, r, engineH } of cachedDrawList) {
      const hT = r / VU;
      const hTiles = engineH / VU;

      const base = [
        { x: p.x - hT, y: p.y - hT }, { x: p.x + hT, y: p.y - hT },
        { x: p.x + hT, y: p.y + hT }, { x: p.x - hT, y: p.y + hT }
      ];
      
      const sB = base.map(c => worldToScreen(c.x, c.y, elev, cam));
      const sT = base.map(c => {
        const tx = c.x + this._uDX * hTiles;
        const ty = c.y + this._uDY * hTiles;
        return worldToScreen(tx, ty, elev, cam);
      });

      // Trace footprints and bridge them to form the volumetric hull
      ctx.moveTo(sB[0].x, sB[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(sB[i].x, sB[i].y);
      ctx.lineTo(sB[0].x, sB[0].y); 
      
      ctx.moveTo(sT[0].x, sT[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(sT[i].x, sT[i].y);
      ctx.closePath();

      for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4;
        ctx.moveTo(sB[i].x, sB[i].y);
        ctx.lineTo(sB[next].x, sB[next].y);
        ctx.lineTo(sT[next].x, sT[next].y);
        ctx.lineTo(sT[i].x, sT[i].y);
        ctx.closePath();
      }
    }
    
    ctx.fill(); 
    ctx.restore();
  }

  /** Calculate face darkening based on sun orientation. */
  getLightFactor(normalAngle) {
    if (!this.enabled) return 1.0;
    let diff = Math.abs(this.sunAngle - normalAngle) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    return 0.4 + 0.6 * Math.max(0, Math.cos(diff));
  }

  aoFactor(tx, ty, cache, pGX, pGY, mapW, mapH, terrainRegistry) {
    if (!this.enabled) return 1;
    const selfId = cache.getLocal(tx, ty, pGX, pGY, mapW, mapH);
    const selfH  = terrainRegistry.heights[selfId] ?? 1;
    const neighbours = [
      { dx: -1, dy:  0, w: 1.0 }, { dx:  1, dy:  0, w: 1.0 },
      { dx:  0, dy: -1, w: 1.0 }, { dx:  0, dy:  1, w: 1.0 },
      { dx: -1, dy: -1, w: 0.5 }, { dx:  1, dy: -1, w: 0.5 },
      { dx: -1, dy:  1, w: 0.5 }, { dx:  1, dy:  1, w: 0.5 },
    ];
    let occluded = 0;
    for (const { dx, dy, w } of neighbours) {
      const nId = cache.getLocal(tx + dx, ty + dy, pGX, pGY, mapW, mapH);
      const nH  = terrainRegistry.heights[nId] ?? 1;
      if (nH > selfH) occluded += w;
    }
    return 1 - Math.min(1, occluded / 6.0) * this.aoStrength;
  }

  applyAO(hexColor, factor) {
    return factor >= 0.999 ? hexColor : darkenHex(hexColor, factor);
  }

  /**
   * Renders merged shadows from the pipeline to prevent overlapping alpha stacking.
   */
  drawShadows(shadowCasters) {
    if (!this.enabled || !shadowCasters.length || this.cam.tilt < 0.05) return;

    const { ctx, cam } = this;
    ctx.save();
    ctx.fillStyle = this.shadowColor;
    ctx.globalAlpha = this.shadowAlpha * Math.min(1, cam.tilt / 0.3);
    ctx.globalCompositeOperation = 'multiply';

    ctx.beginPath();

    const VU = 8;
    // Iterate through pipeline shadow casters instead of building entities
    for (const { p, elev, r, engineH } of shadowCasters) {
      const hT = r / VU;
      const hTiles = engineH / VU;

      const base = [
        { x: p.x - hT, y: p.y - hT }, { x: p.x + hT, y: p.y - hT },
        { x: p.x + hT, y: p.y + hT }, { x: p.x - hT, y: p.y + hT }
      ];
      
      const sB = base.map(c => worldToScreen(c.x, c.y, elev, cam));
      const sT = base.map(c => {
        const tx = c.x + this._uDX * hTiles;
        const ty = c.y + this._uDY * hTiles;
        return worldToScreen(tx, ty, elev, cam);
      });

      ctx.moveTo(sB[0].x, sB[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(sB[i].x, sB[i].y);
      ctx.lineTo(sB[0].x, sB[0].y); 
      
      ctx.moveTo(sT[0].x, sT[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(sT[i].x, sT[i].y);
      ctx.closePath();

      for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4;
        ctx.moveTo(sB[i].x, sB[i].y);
        ctx.lineTo(sB[next].x, sB[next].y);
        ctx.lineTo(sT[next].x, sT[next].y);
        ctx.lineTo(sT[i].x, sT[i].y);
        ctx.closePath();
      }
    }
    
    ctx.fill(); 
    ctx.restore();
  }
}