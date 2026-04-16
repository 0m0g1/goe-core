/**
 * GOE — TerrainPainter
 *
 * Generates 64 × 64 stylised top-down tile textures for every built-in
 * terrain type.  Textures are painted once per terrain ID then cached.
 *
 * Integration
 * ───────────
 * TileRenderer creates one TerrainPainter in its constructor and calls
 *   painter.getTexture(terrainId) → HTMLCanvasElement
 * inside _drawTexturedLayer() (the close-zoom render path added to
 * TileRenderer).
 *
 * Each texture is designed to be projected onto an isometric tile face with a
 * single ctx.setTransform() + ctx.drawImage() — no clipping required.
 *
 * Seamlessness
 * ────────────
 * The internal noise grid uses modular wrapping so every noise function tiles
 * with period 1 — textures stitch edge-to-edge without visible seams.
 */

import { TerrainType } from './types.js';

// ─── Public constants ─────────────────────────────────────────────────────────

export const TEX_SIZE = 64; // px — keep as a power of two

// ─── Colour utilities ─────────────────────────────────────────────────────────

function hex2rgb(hex) {
  if (!hex || hex[0] !== '#') return [128, 128, 128];
  const h = hex.slice(1);
  return h.length === 3
    ? [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)]
    : [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function css_rgb (r,g,b)   { return `rgb(${r|0},${g|0},${b|0})`; }
function css_rgba(r,g,b,a) { return `rgba(${r|0},${g|0},${b|0},${a})`; }
function lighten([r,g,b], t) { return [Math.min(255,r+(t*255)|0), Math.min(255,g+(t*255)|0), Math.min(255,b+(t*255)|0)]; }
function darken ([r,g,b], t) { return [Math.max(0,  r-(t*255)|0), Math.max(0,  g-(t*255)|0), Math.max(0,  b-(t*255)|0)]; }

// ─── Seeded LCG pseudo-random ──────────────────────────────────────────────────

function seededRng(seed) {
  let s = (seed ^ 0xDEADBEEF) >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

// ─── Tileable 2-D smooth noise ─────────────────────────────────────────────────
// 16 × 16 LCG-seeded grid; bilinear + smoothstep; wraps at the grid edges so
// the returned function is periodic with period 1 in both axes (seamless tile).

function makeNoise2D(seed, freq = 4) {
  const N   = 16;
  const g   = new Float32Array(N * N);
  const rng = seededRng(seed);
  for (let i = 0; i < N * N; i++) g[i] = rng();
  const get = (x, y) => g[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  const sm  = t => t * t * (3 - 2 * t); // smoothstep

  return (u, v) => {
    const fx = u * freq, fy = v * freq;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix,  ty = fy - iy;
    const sx = sm(tx),   sy = sm(ty);
    return  get(ix,   iy)   * (1-sx) * (1-sy)
          + get(ix+1, iy)   *    sx  * (1-sy)
          + get(ix,   iy+1) * (1-sx) *    sy
          + get(ix+1, iy+1) *    sx  *    sy;
  };
}

// ─── ImageData pixel-noise fill ───────────────────────────────────────────────
// Fills every pixel by lerping between baseRgb and variantRgb using noiseFn.
// noiseFn(u, v) → [0, 1].  t = noise*2-1 maps the output to [-1, 1].

function pixelFill(imgData, baseRgb, variantRgb, noiseFn) {
  const d = imgData.data;
  const W = imgData.width, H = imgData.height;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = noiseFn(x / W, y / H);
      const t = n * 2 - 1; // [-1, 1]
      const i = (y * W + x) * 4;
      d[i]   = Math.max(0, Math.min(255, baseRgb[0] + t * (variantRgb[0] - baseRgb[0])));
      d[i+1] = Math.max(0, Math.min(255, baseRgb[1] + t * (variantRgb[1] - baseRgb[1])));
      d[i+2] = Math.max(0, Math.min(255, baseRgb[2] + t * (variantRgb[2] - baseRgb[2])));
      d[i+3] = 255;
    }
  }
}

// ─── Individual terrain painters ──────────────────────────────────────────────
// Each receives (ctx, S, terrainColors) where S = TEX_SIZE.

function paintGrass(ctx, S, c) {
  const base   = hex2rgb(c.flat ?? '#5bc23a');
  const bright = lighten(base, 0.18);

  const img = ctx.createImageData(S, S);
  pixelFill(img, base, bright, makeNoise2D(0x1A2B, 3));
  ctx.putImageData(img, 0, 0);

  // Soft highlight patches
  const r1 = seededRng(0x1111);
  ctx.globalAlpha = 0.20;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = css_rgb(...lighten(base, 0.30));
    ctx.beginPath();
    ctx.ellipse(r1()*S, r1()*S, 8+r1()*10, 5+r1()*8, r1()*Math.PI, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Grass blades
  const r2 = seededRng(0x2222);
  ctx.strokeStyle = css_rgba(...darken(base, 0.25), 0.55);
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 40; i++) {
    const x = r2()*S, y = r2()*S, h = 2.5+r2()*3, lean = (r2()-0.5)*4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x+lean*0.5, y-h*0.6, x+lean, y-h);
    ctx.stroke();
  }
}

function paintPark(ctx, S, c) {
  const base  = hex2rgb(c.flat ?? '#779933');
  const light = lighten(base, 0.16);

  const img = ctx.createImageData(S, S);
  pixelFill(img, darken(base, 0.12), light, makeNoise2D(0x3C4D, 3));
  ctx.putImageData(img, 0, 0);

  // Diagonal mowing stripes
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = css_rgb(...lighten(base, 0.32));
  const strW = 9;
  for (let i = -S; i < S * 2; i += strW * 2) ctx.fillRect(i, 0, strW, S);
  ctx.globalAlpha = 1;

  // Small flowers
  const r = seededRng(0x3333);
  const FC = ['#ffdd44','#ff6688','#dd88ff','#ffffff','#ffaa44','#88ffcc'];
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = FC[i % FC.length];
    ctx.beginPath(); ctx.arc(r()*S, r()*S, 1.1, 0, Math.PI*2); ctx.fill();
  }
}

function paintForest(ctx, S, c) {
  const base   = hex2rgb(c.flat ?? '#2d821e');
  const shadow = darken(base, 0.32);
  const light  = lighten(base, 0.22);

  const img = ctx.createImageData(S, S);
  pixelFill(img, darken(base, 0.16), base, makeNoise2D(0x4E5F, 4));
  ctx.putImageData(img, 0, 0);

  const r = seededRng(0x4444);
  for (let i = 0; i < 9; i++) {
    const cx = r()*S, cy = r()*S, rad = 7+r()*9;
    // drop shadow
    ctx.fillStyle = css_rgba(...shadow, 0.45);
    ctx.beginPath();
    ctx.ellipse(cx+rad*0.28, cy+rad*0.22, rad*0.74, rad*0.54, 0, 0, Math.PI*2);
    ctx.fill();
    // canopy radial gradient
    const grad = ctx.createRadialGradient(cx-rad*0.28, cy-rad*0.22, 1, cx, cy, rad);
    grad.addColorStop(0,    css_rgba(...lighten(light,0.14), 0.96));
    grad.addColorStop(0.55, css_rgba(...base, 0.93));
    grad.addColorStop(1,    css_rgba(...shadow, 0.86));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI*2); ctx.fill();
  }
}

function paintWater(ctx, S, c) {
  const base  = hex2rgb(c.flat ?? '#2b7abf');
  const light = lighten(base, 0.28);
  const dark  = darken (base, 0.20);

  const img = ctx.createImageData(S, S);
  pixelFill(img, dark, light, makeNoise2D(0x5F60, 2));
  ctx.putImageData(img, 0, 0);

  // Wave highlight lines
  ctx.lineCap = 'round';
  for (let w = 0; w < 6; w++) {
    const yBase = (w/6)*S + S/12;
    ctx.strokeStyle = css_rgba(...lighten(base, 0.56), 0.15+0.10*(1-w/6));
    ctx.lineWidth   = 1.2 - w*0.08;
    ctx.beginPath();
    for (let x = 0; x <= S; x += 2) {
      const y = yBase + Math.sin(x*0.22+w*0.9)*2.8;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Specular glint
  ctx.fillStyle = css_rgba(...lighten(base, 0.78), 0.32);
  ctx.beginPath();
  ctx.ellipse(S*0.28, S*0.28, 6, 3, -0.4, 0, Math.PI*2);
  ctx.fill();
}

function paintDeepWater(ctx, S, c) {
  const base  = hex2rgb(c.flat ?? '#1a4a88');
  const light = lighten(base, 0.15);
  const dark  = darken (base, 0.22);

  const img = ctx.createImageData(S, S);
  pixelFill(img, dark, light, makeNoise2D(0x6070, 2));
  ctx.putImageData(img, 0, 0);

  ctx.strokeStyle = css_rgba(...light, 0.18);
  ctx.lineWidth   = 0.8;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(S*0.45, S*0.48, S*(0.18+i*0.12), S*(0.10+i*0.07), -0.3, 0, Math.PI*2);
    ctx.stroke();
  }
}

function paintShore(ctx, S, c) {
  const waterRgb = hex2rgb(c.flat ?? '#3c9ccd');
  const sandRgb  = [210, 186, 120];
  const noise    = makeNoise2D(0x7081, 3);

  const img = ctx.createImageData(S, S);
  const d   = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = noise(x/S, y/S);
      const t = Math.min(1, Math.max(0, y/S + (n-0.5)*0.38));
      const i = (y*S+x)*4;
      d[i]   = (waterRgb[0] + (sandRgb[0]-waterRgb[0])*t) | 0;
      d[i+1] = (waterRgb[1] + (sandRgb[1]-waterRgb[1])*t) | 0;
      d[i+2] = (waterRgb[2] + (sandRgb[2]-waterRgb[2])*t) | 0;
      d[i+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function paintRoadTarmac(ctx, S, c) {
  const base  = hex2rgb(c.flat ?? '#3d3d3d');
  const grain = darken (base, 0.08);
  const edge  = lighten(base, 0.22);

  const img = ctx.createImageData(S, S);
  pixelFill(img, grain, base, makeNoise2D(0x8091, 9));
  ctx.putImageData(img, 0, 0);

  // Edge markings
  ctx.strokeStyle = css_rgba(...edge, 0.42);
  ctx.lineWidth   = 1;
  [[0, 3], [0, S-3]].forEach(([x1, y]) => {
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(S, y); ctx.stroke();
  });

  // Centre dashes
  ctx.strokeStyle = css_rgba(255, 215, 80, 0.36);
  ctx.lineWidth   = 1.2;
  ctx.setLineDash([9, 7]);
  ctx.beginPath(); ctx.moveTo(0, S/2); ctx.lineTo(S, S/2); ctx.stroke();
  ctx.setLineDash([]);
}

function paintRoadDirt(ctx, S, c) {
  const base  = hex2rgb(c.flat ?? '#916f4e');
  const light = lighten(base, 0.22);
  const dark  = darken (base, 0.18);

  const img = ctx.createImageData(S, S);
  pixelFill(img, dark, light, makeNoise2D(0x90A1, 5));
  ctx.putImageData(img, 0, 0);

  // Track ruts
  ctx.strokeStyle = css_rgba(...darken(base, 0.30), 0.65);
  ctx.lineWidth   = 2.2;
  for (const xBase of [S*0.32, S*0.68]) {
    ctx.beginPath();
    for (let y = 0; y <= S; y += 2) {
      const x = xBase + Math.sin(y*0.18+xBase)*2.5;
      y === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Pebbles
  const r = seededRng(0x5555);
  ctx.fillStyle = css_rgba(...lighten(base, 0.38), 0.55);
  for (let i = 0; i < 18; i++) {
    ctx.beginPath(); ctx.arc(r()*S, r()*S, 0.7+r()*1.2, 0, Math.PI*2); ctx.fill();
  }
}

function paintRoadGravel(ctx, S, c) {
  const base  = hex2rgb(c.flat ?? '#959595');
  const light = lighten(base, 0.18);
  const dark  = darken (base, 0.16);

  const img = ctx.createImageData(S, S);
  pixelFill(img, dark, light, makeNoise2D(0xA0B1, 6));
  ctx.putImageData(img, 0, 0);

  // Gravel stones
  const r = seededRng(0x6666);
  for (let i = 0; i < 35; i++) {
    const x   = r()*S, y = r()*S;
    const rad = 1.4 + r()*2.2;
    ctx.fillStyle = css_rgba(...(r() > 0.5 ? light : dark), 0.65);
    ctx.beginPath(); ctx.ellipse(x, y, rad, rad*0.65, r()*Math.PI, 0, Math.PI*2); ctx.fill();
  }
}

function paintPath(ctx, S, c) {
  const base  = hex2rgb(c.flat ?? '#e0c686');
  const joint = darken (base, 0.28);

  // Stone base
  ctx.fillStyle = css_rgb(...darken(base, 0.10));
  ctx.fillRect(0, 0, S, S);

  // Brick-bond stones
  const stW = 14, stH = 10;
  const r   = seededRng(0x7777);
  for (let row = 0; row * stH < S + stH; row++) {
    const yTop = row * stH;
    const xOff = row % 2 === 0 ? 0 : stW / 2;
    for (let col = -1; col * stW < S + stW; col++) {
      const xLeft = col * stW + xOff;
      if (r() > 0.3) {
        ctx.fillStyle = css_rgba(...lighten(base, 0.12+r()*0.14), 0.65);
        ctx.fillRect(xLeft+2, yTop+2, stW-4, stH-4);
      }
    }
  }

  // Seams
  ctx.strokeStyle = css_rgba(...joint, 0.72);
  ctx.lineWidth   = 1.5;
  for (let row = 0; row * stH <= S + stH; row++) {
    const yTop = row * stH;
    const xOff = row % 2 === 0 ? 0 : stW / 2;
    ctx.beginPath(); ctx.moveTo(0, yTop); ctx.lineTo(S, yTop); ctx.stroke();
    for (let x = xOff - stW; x <= S + stW; x += stW) {
      ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x, yTop+stH); ctx.stroke();
    }
  }
}

function paintSand(ctx, S, c) {
  const base  = hex2rgb(c.flat ?? '#e0c686');
  const grain = darken (base, 0.14);
  const crest = lighten(base, 0.16);

  const img = ctx.createImageData(S, S);
  const n1  = makeNoise2D(0xB0C1,  6);
  const n2  = makeNoise2D(0xC1D2, 14);
  pixelFill(img, grain, crest, (u, v) => n1(u,v)*0.55 + n2(u,v)*0.45);
  ctx.putImageData(img, 0, 0);

  // Ripple arcs
  ctx.strokeStyle = css_rgba(...darken(base, 0.22), 0.22);
  ctx.lineWidth   = 0.9;
  for (let i = 0; i < 7; i++) {
    const yBase = i * (S/7) + S/14;
    ctx.beginPath();
    for (let x = 0; x <= S; x += 2) {
      const y = yBase + Math.sin(x*0.28+i*0.5)*2.2;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function paintBuilding(ctx, S, c) {
  const base  = hex2rgb(c.flat ?? '#c4bcac');
  const dark  = darken (base, 0.22);
  const light = lighten(base, 0.22);

  const img = ctx.createImageData(S, S);
  pixelFill(img, base, lighten(base, 0.14), makeNoise2D(0xE0F1, 5));
  ctx.putImageData(img, 0, 0);

  // Parapet border
  ctx.strokeStyle = css_rgba(...dark, 0.65);
  ctx.lineWidth   = 2;
  ctx.strokeRect(2, 2, S-4, S-4);

  // Rooftop plant boxes (HVAC units etc.)
  const boxes = [
    [S*0.30, S*0.24, S*0.24, S*0.17, true ],
    [S*0.08, S*0.54, S*0.15, S*0.13, false],
    [S*0.60, S*0.48, S*0.26, S*0.20, true ],
    [S*0.22, S*0.68, S*0.10, S*0.10, false],
  ];
  for (const [x, y, w, h, lit] of boxes) {
    ctx.fillStyle   = css_rgba(...(lit ? lighten(base, 0.30) : dark), 0.85);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = css_rgba(...dark, 0.40);
    ctx.lineWidth   = 0.7;
    ctx.strokeRect(x, y, w, h);
  }

  // Gloss strip along top edge
  ctx.fillStyle = css_rgba(...light, 0.25);
  ctx.fillRect(4, 4, S-8, 5);
}

function paintResidential(ctx, S, c) {
  const base  = hex2rgb(c.flat ?? '#889988');
  const light = lighten(base, 0.14);
  const dark  = darken (base, 0.12);

  const img = ctx.createImageData(S, S);
  pixelFill(img, dark, light, makeNoise2D(0xF0F1, 4));
  ctx.putImageData(img, 0, 0);

  // Scattered urban block shapes
  const r = seededRng(0x8888);
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = r() > 0.5 ? css_rgb(...light) : css_rgb(...darken(base, 0.26));
    ctx.fillRect(r()*(S-14), r()*(S-14), 7+r()*14, 7+r()*14);
  }
  ctx.globalAlpha = 1;
}

function paintFlat(ctx, S, c) {
  const [r,g,b] = hex2rgb(c.flat ?? '#888888');
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, S, S);
}

// ─── Painter dispatch table ───────────────────────────────────────────────────

const PAINTERS = {
  [TerrainType.GRASS]:        paintGrass,
  [TerrainType.PARK]:         paintPark,
  [TerrainType.FOREST]:       paintForest,
  [TerrainType.WATER]:        paintWater,
  [TerrainType.DEEP_WATER]:   paintDeepWater,
  [TerrainType.SHORE]:        paintShore,
  [TerrainType.ROAD_TARMAC]:  paintRoadTarmac,
  [TerrainType.ROAD_DIRT]:    paintRoadDirt,
  [TerrainType.ROAD_GRAVEL]:  paintRoadGravel,
  [TerrainType.PATH]:         paintPath,
  [TerrainType.SAND]:         paintSand,
  [TerrainType.BUILDING]:     paintBuilding,
  [TerrainType.RESIDENTIAL]:  paintResidential,
};

// ─── TerrainPainter ───────────────────────────────────────────────────────────

export class TerrainPainter {
  constructor(terrainRegistry) {
    this._registry = terrainRegistry;
    this._cache    = new Map(); // terrainId → HTMLCanvasElement
  }

  /**
   * Return the cached texture for terrainId.
   * Generated on first call; subsequent calls are O(1) Map lookups.
   */
  getTexture(terrainId) {
    if (this._cache.has(terrainId)) return this._cache.get(terrainId);
    const tex = this._generate(terrainId);
    this._cache.set(terrainId, tex);
    return tex;
  }

  /**
   * Discard all cached textures.
   * Call when the terrain registry colours change at runtime.
   */
  invalidate() { this._cache.clear(); }

  // ── Private ──────────────────────────────────────────────────────────────

  _generate(id) {
    const S   = TEX_SIZE;
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = S;
    // willReadFrequently avoids GPU-round-trip when we call putImageData
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    const colors  = this._registry.colors[id] ?? { flat: '#888888', top: '#aaaaaa' };
    const painter = PAINTERS[id] ?? paintFlat;
    painter(ctx, S, colors);
    return cnv;
  }
}