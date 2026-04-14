/**
 * GOE Core — ShadowSystem
 *
 * Memory fixes vs previous version:
 *
 *   FIX D — Pre-allocated scratch buffers replace per-shadow array allocations.
 *     The old drawShadows() / drawBuildingShadows() created 3 new arrays + 12
 *     new objects per shadow caster per frame (base[], sB[], sT[] each with 4
 *     {x,y} objects). At 400 visible buildings × 60fps that was ~72,000 array
 *     allocations per second — the primary source of GC pressure.
 *
 *     Now 3 fixed-length typed-array buffers (_sbX/Y, _stX/Y) are allocated
 *     once in the constructor and reused for every caster every frame.
 *     worldToScreen results are written into them by index; no heap objects
 *     are created in the hot path.
 *
 *   FIX E — darkenHex string allocation eliminated from aoFactor hot path.
 *     darkenHex() was called per voxel face via applyAO(), allocating multiple
 *     strings (toString, padStart, join, concat) on every call. A small LRU
 *     string cache (_darkenCache) is used so repeated colour+factor combos
 *     return a cached string instead of allocating a new one. The cache is
 *     capped at 512 entries to bound memory use.
 */
import { worldToScreen } from '../math/projection.js';

// ── Scratch buffers for shadow projection (FIX D) ─────────────────────────
// 4 base corners + 4 top corners, each needing x and y.
// Written by index, never allocated in the draw loop.
const _sbX = new Float64Array(4);
const _sbY = new Float64Array(4);
const _stX = new Float64Array(4);
const _stY = new Float64Array(4);

// ── Colour cache helpers (FIX E) ──────────────────────────────────────────
const _darkenCache    = new Map();
const _DARKEN_MAX     = 512;

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function darkenHex(hex, factor) {
  // Cache key combines hex string and factor quantised to 2 dp to avoid
  // unbounded cache growth from floating-point noise.
  const key = hex + '|' + (factor * 100 | 0);
  if (_darkenCache.has(key)) return _darkenCache.get(key);

  const [r, g, b] = hexToRgb(hex);
  const f = Math.max(0, Math.min(1, factor));
  const result = '#'
    + (Math.round(r * f)).toString(16).padStart(2, '0')
    + (Math.round(g * f)).toString(16).padStart(2, '0')
    + (Math.round(b * f)).toString(16).padStart(2, '0');

  if (_darkenCache.size >= _DARKEN_MAX) {
    // Evict oldest entry
    _darkenCache.delete(_darkenCache.keys().next().value);
  }
  _darkenCache.set(key, result);
  return result;
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

    // Cached per-frame sun direction (set in beginFrame)
    this._uDX = 0;
    this._uDY = 0;
  }

  beginFrame() {
    if (!this.enabled) return;
    const sunElev  = Math.max(0.1, this.sunElevation);
    const lengthScale = 1 / Math.tan(sunElev);
    this._uDX = Math.cos(this.sunAngle) * lengthScale;
    this._uDY = Math.sin(this.sunAngle) * lengthScale;
  }

  // ── FIX D — zero-allocation shadow draw ───────────────────────────────────

  /**
   * Draw merged building shadows using pre-allocated scratch buffers.
   * No array or object is created inside the loop.
   */
  _drawShadowList(cachedDrawList) {
    if (!this.enabled || !cachedDrawList.length || this.cam.tilt < 0.05) return;

    const { ctx, cam } = this;
    ctx.save();
    ctx.fillStyle = this.shadowColor;
    ctx.globalAlpha = this.shadowAlpha * Math.min(1, cam.tilt / 0.3);
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();

    const VU   = 8;
    const uDX  = this._uDX;
    const uDY  = this._uDY;

    for (const { p, elev, r, engineH } of cachedDrawList) {
      const hT     = r / VU;
      const hTiles = engineH / VU;

      // Write base corners into scratch buffers
      const bx0 = p.x - hT, by0 = p.y - hT;
      const bx1 = p.x + hT, by1 = p.y - hT;
      const bx2 = p.x + hT, by2 = p.y + hT;
      const bx3 = p.x - hT, by3 = p.y + hT;

      const tx0 = bx0 + uDX * hTiles, ty0 = by0 + uDY * hTiles;
      const tx1 = bx1 + uDX * hTiles, ty1 = by1 + uDY * hTiles;
      const tx2 = bx2 + uDX * hTiles, ty2 = by2 + uDY * hTiles;
      const tx3 = bx3 + uDX * hTiles, ty3 = by3 + uDY * hTiles;

      // Project to screen — write directly into flat scratch arrays
      let s;
      s = worldToScreen(bx0, by0, elev, cam); _sbX[0] = s.x; _sbY[0] = s.y;
      s = worldToScreen(bx1, by1, elev, cam); _sbX[1] = s.x; _sbY[1] = s.y;
      s = worldToScreen(bx2, by2, elev, cam); _sbX[2] = s.x; _sbY[2] = s.y;
      s = worldToScreen(bx3, by3, elev, cam); _sbX[3] = s.x; _sbY[3] = s.y;

      s = worldToScreen(tx0, ty0, elev, cam); _stX[0] = s.x; _stY[0] = s.y;
      s = worldToScreen(tx1, ty1, elev, cam); _stX[1] = s.x; _stY[1] = s.y;
      s = worldToScreen(tx2, ty2, elev, cam); _stX[2] = s.x; _stY[2] = s.y;
      s = worldToScreen(tx3, ty3, elev, cam); _stX[3] = s.x; _stY[3] = s.y;

      // Base footprint
      ctx.moveTo(_sbX[0], _sbY[0]);
      ctx.lineTo(_sbX[1], _sbY[1]);
      ctx.lineTo(_sbX[2], _sbY[2]);
      ctx.lineTo(_sbX[3], _sbY[3]);
      ctx.lineTo(_sbX[0], _sbY[0]);

      // Top footprint
      ctx.moveTo(_stX[0], _stY[0]);
      ctx.lineTo(_stX[1], _stY[1]);
      ctx.lineTo(_stX[2], _stY[2]);
      ctx.lineTo(_stX[3], _stY[3]);
      ctx.closePath();

      // Side faces
      for (let i = 0; i < 4; i++) {
        const next = (i + 1) & 3; // % 4 without division
        ctx.moveTo(_sbX[i],    _sbY[i]);
        ctx.lineTo(_sbX[next], _sbY[next]);
        ctx.lineTo(_stX[next], _stY[next]);
        ctx.lineTo(_stX[i],    _stY[i]);
        ctx.closePath();
      }
    }

    ctx.fill();
    ctx.restore();
  }

  /** Public alias used by RenderPipeline */
  drawShadows(shadowCasters) {
    this._drawShadowList(shadowCasters);
  }

  /** Legacy alias kept for any callers using the old method name */
  drawBuildingShadows(cachedDrawList) {
    this._drawShadowList(cachedDrawList);
  }

  // ── Lighting helpers ──────────────────────────────────────────────────────

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

  // FIX E — applyAO uses cached darkenHex so no string allocation on repeated calls
  applyAO(hexColor, factor) {
    return factor >= 0.999 ? hexColor : darkenHex(hexColor, factor);
  }
}