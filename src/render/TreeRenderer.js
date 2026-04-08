/**
 * GOE Core — TreeRenderer
 * Draws stylised voxel trees for parks, forests, and individual tree features.
 *
 * Tree types:
 *   'deciduous'  — round layered canopy (oak, generic)
 *   'conifer'    — tall narrow cone (pine, fir)
 *   'palm'       — trunk + fan fronds
 *   'forest'     — dense multi-tree cluster
 *   'park'       — scattered trees with ground
 *
 * All trees are drawn via the VoxelRenderer projection system so they
 * correctly sit on the terrain and cast shadows.
 */
import { worldToScreen, tileHalfWidth, tileHalfHeight, getElevOffset, shadeHex } from '../math/projection.js';

// ─── Palette ──────────────────────────────────────────────────────────────────

const CANOPY = {
  deciduous: { top: '#3a9626', side: '#2a7018', dark: '#1e5010' },
  conifer:   { top: '#2a7a1e', side: '#1e5a12', dark: '#142e08' },
  autumn:    { top: '#d4782a', side: '#aa5218', dark: '#7a360e' },
  palm:      { top: '#4ab030', side: '#2a8020', dark: '#1a5010' },
};
const TRUNK  = { fill: '#6b4010', side: '#4a2a08', dark: '#2a1804' };
const SHADOW = 'rgba(0,0,0,0.18)';

export class TreeRenderer {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} cam   Camera state
   * @param {VoxelRenderer} vr
   */
  constructor(ctx, cam, vr) {
    this.ctx = ctx;
    this.cam = cam;
    this.vr  = vr;
  }

  /**
   * Draw a tree at a world tile position.
   * @param {number} tx        World tile X
   * @param {number} ty        World tile Y
   * @param {number} baseElev  Ground elevation offset in px
   * @param {object} opts
   * @param {string}  [opts.type='deciduous']   Tree variety
   * @param {number}  [opts.scale=1]            Size multiplier
   * @param {number}  [opts.seed=0]             Deterministic variation seed
   */
  drawTree(tx, ty, baseElev, opts = {}) {
    const { type = 'deciduous', scale = 1, seed = 0 } = opts;
    const { cam, vr } = this;

    // Only draw in ISO mode
    if (cam.tilt < 0.04) return;
    const isoA = Math.min(1, (cam.tilt - 0.04) / 0.12);

    this.ctx.globalAlpha = isoA;
    vr.beginTile(tx, ty, baseElev);

    switch (type) {
      case 'conifer': this._drawConifer(scale, seed); break;
      case 'palm':    this._drawPalm(scale, seed);    break;
      case 'forest':  this._drawForestCluster(scale, seed); break;
      case 'park':    this._drawParkGroup(scale, seed);     break;
      default:        this._drawDeciduous(scale, seed);     break;
    }

    this.ctx.globalAlpha = 1;
  }

  // ─── Tree varieties ─────────────────────────────────────────────────────────

  _drawDeciduous(scale = 1, seed = 0) {
    const { vr } = this;
    const pal = (seed % 5 === 0) ? CANOPY.autumn : CANOPY.deciduous;
    const h   = Math.round(6 + (seed % 3)) * scale;
    const VU  = 8;

    // Trunk
    this._voxBox(-1, 0, -1, 2, h, 2, TRUNK.fill, TRUNK.side, TRUNK.dark);

    // Layered canopy — 3 tiers, each slightly offset for roundness
    const tiers = [
      { y: h,     r: 5 * scale, shift: 0 },
      { y: h + 3, r: 4 * scale, shift: seed%2 ? 0.5 : -0.5 },
      { y: h + 6, r: 3 * scale, shift: 0 },
    ];
    tiers.forEach(({ y, r, shift }) => {
      const x = -r + shift, z = -r + shift;
      this._voxBox(x, y, z, r*2, 3*scale, r*2, pal.top, pal.side, pal.dark);
    });
    // Tip
    this._voxBox(-1*scale, h+9, -1*scale, 2*scale, 2*scale, 2*scale, pal.top, pal.side, pal.dark);
  }

  _drawConifer(scale = 1, seed = 0) {
    const pal = CANOPY.conifer;
    const trunkH = Math.round(4 + seed % 2) * scale;

    // Trunk
    this._voxBox(-1, 0, -1, 2, trunkH, 2, TRUNK.fill, TRUNK.side, TRUNK.dark);

    // Cone tiers — widest at bottom, narrowing to tip
    const tiers = [
      { y: trunkH,      r: 5 * scale, h: 4 },
      { y: trunkH + 4,  r: 4 * scale, h: 3 },
      { y: trunkH + 7,  r: 3 * scale, h: 3 },
      { y: trunkH + 10, r: 2 * scale, h: 3 },
      { y: trunkH + 13, r: 1 * scale, h: 2 },
    ];
    tiers.forEach(({ y, r, h }) => {
      this._voxBox(-r, y, -r, r*2, h*scale, r*2, pal.top, pal.side, pal.dark);
    });
  }

  _drawPalm(scale = 1, seed = 0) {
    const pal = CANOPY.palm;
    const trunkH = Math.round(10 + seed % 4) * scale;
    const lean   = (seed % 3 - 1) * 0.5; // slight lean

    // Segmented trunk
    for (let i = 0; i < trunkH; i += 2) {
      const w = Math.max(1, 2 - i / (trunkH * 0.8));
      this._voxBox(-w/2 + lean * (i/trunkH), i, -w/2, w, 2, w,
        '#8B6030', '#6B4420', '#4a2a10');
    }

    // Fan of fronds from the top
    const frondOffsets = [
      [-6, 2], [6, 2], [0, -6], [0, 6], [-5, -5], [5, -5], [-5, 5], [5, 5],
    ];
    frondOffsets.forEach(([dx, dz]) => {
      this._voxBox(dx * scale, trunkH, dz * scale, 2 * scale, 2, 2 * scale,
        pal.top, pal.side, pal.dark);
      // Drooping tip
      this._voxBox((dx * 1.6) * scale, trunkH - 1, (dz * 1.6) * scale,
        2 * scale, 1, 2 * scale, pal.side, pal.dark, pal.dark);
    });
  }

  _drawForestCluster(scale = 1, seed = 0) {
    // Multiple trees in a cluster — use per-tree offsets
    const offsets = [
      { dx: -5, dz: -3, s: 0.85, t: 'deciduous', sd: seed },
      { dx:  5, dz: -3, s: 0.9,  t: 'deciduous', sd: seed+1 },
      { dx:  0, dz:  4, s: 1.0,  t: 'conifer',   sd: seed+2 },
      { dx: -4, dz:  5, s: 0.75, t: 'conifer',   sd: seed+3 },
      { dx:  4, dz:  5, s: 0.8,  t: 'deciduous', sd: seed+4 },
    ];
    offsets.forEach(({ dx, dz, s, t, sd }) => {
      // Shift the voxel origin for each sub-tree
      this._drawSubTree(dx, dz, t, s * scale, sd);
    });
  }

  _drawParkGroup(scale = 1, seed = 0) {
    // A park: open ground colour + a few scattered trees
    const { vr } = this;

    // Ground patch (flat box, very thin)
    this._voxBox(-8, 0, -8, 16, 1, 16, '#5aac3a', '#3a8a1a', '#2a6010');

    // Scattered trees
    const spots = [
      { dx: -5, dz: -4, t: 'deciduous', s: 0.9, sd: seed },
      { dx:  4, dz: -3, t: 'deciduous', s: 0.8, sd: seed+1 },
      { dx: -2, dz:  5, t: 'conifer',   s: 0.7, sd: seed+2 },
    ];
    spots.forEach(({ dx, dz, t, s, sd }) => {
      this._drawSubTree(dx, dz, t, s * scale, sd);
    });
  }

  // ─── Sub-tree helper (draws within an already-begun tile context) ────────────

  _drawSubTree(offsetX, offsetZ, type, scale, seed) {
    const { vr } = this;
    const savedTx = vr._tx, savedTy = vr._ty;

    // Offset the tile origin for this sub-tree
    vr._tx = savedTx + offsetX / 8;
    vr._ty = savedTy + offsetZ / 8;

    switch (type) {
      case 'conifer':   this._drawConifer(scale, seed);   break;
      default:          this._drawDeciduous(scale, seed); break;
    }

    vr._tx = savedTx;
    vr._ty = savedTy;
  }

  // ─── Voxel box shortcut (delegates to VoxelRenderer) ────────────────────────

  _voxBox(x, y, z, w, h, d, top, right, front) {
    this.vr.box(x, y, z, w, h, d, top, right, front);
  }

  // ─── Flat-mode dot (used when tilt is low) ────────────────────────────────

  /**
   * Draw a flat tree dot at screen position (for top-down view).
   * Called by FeatureRenderer as part of drawAll when cam.tilt is low.
   */
  drawFlatDot(sx, sy, color, hw) {
    const { ctx } = this;
    const r = Math.max(4, hw * 1.1);
    const g = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r);
    g.addColorStop(0, color + 'ee');
    g.addColorStop(0.6, color + '99');
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = shadeHex(color, 1.3 > 1 ? 1 : 1.3) + 'cc'; ctx.fill();
  }
}