/**
 * GOE Core — FeatureRenderer (v3 - Pure Voxel)
 * Renders map features using pure 3D voxel blueprints.
 * Replaces the old 2D sprite AssetLibrary system.
 */
import {
  worldToScreen, tileHalfWidth, tileHalfHeight,
  getElevOffset, shadeHex, tileDepth,
} from '../math/projection.js';
import { VoxelRenderer, VOXEL_UNITS } from './VoxelRenderer.js';
import { TreeRenderer }   from './TreeRenderer.js';
import { resolveFeatureType, CATEGORY_COLORS } from '../terrain/FeatureTypes.js';
import { Blueprints } from './BluePrintLibrary.js';

// ─── Flat dot (pre-rendered per colour) ──────────────────────────────────────

const _dotCache = new Map();
function makeFlatDot(color) {
  if (_dotCache.has(color)) return _dotCache.get(color);
  const oc = document.createElement('canvas'); oc.width = oc.height = 128;
  const c  = oc.getContext('2d');
  const g  = c.createRadialGradient(64,64,8,64,64,56);
  g.addColorStop(0, color+'cc'); g.addColorStop(1, color+'00');
  c.fillStyle = g; c.beginPath(); c.arc(64,64,56,0,Math.PI*2); c.fill();
  c.fillStyle = color; c.beginPath(); c.arc(64,64,28,0,Math.PI*2); c.fill();
  c.strokeStyle='rgba(0,0,0,.45)'; c.lineWidth=3;
  c.beginPath(); c.arc(64,64,28,0,Math.PI*2); c.stroke();
  _dotCache.set(color, oc);
  return oc;
}

// ─── Building facade helpers ─────────────────────────────────────────────────

/**
 * Deterministic hash from a number — gives stable "random" per building.
 */
function hash(n) {
  let x = Math.sin(n + 1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Draw a window-grid facade on an already-drawn voxel face.
 */
function drawFacadeWindows(ctx, faceQuad, rows, cols, color, seed) {
  const lerp  = (a, b, t) => a + (b - a) * t;
  const lerpP = (p1, p2, t) => ({ x: lerp(p1.x,p2.x,t), y: lerp(p1.y,p2.y,t) });

  const windowColor = color + 'bb';
  const litColor    = '#fffcd0bb';
  const darkColor   = '#1a2a3a99';

  ctx.save();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u0 = (col + 0.15) / cols,  u1 = (col + 0.85) / cols;
      const v0 = (row + 0.12) / rows,  v1 = (row + 0.82) / rows;

      const [A, B, C, D] = faceQuad; 
      const tl = lerpP(lerpP(A,B,u0), lerpP(D,C,u0), v0);
      const tr = lerpP(lerpP(A,B,u1), lerpP(D,C,u1), v0);
      const br = lerpP(lerpP(A,B,u1), lerpP(D,C,u1), v1);
      const bl = lerpP(lerpP(A,B,u0), lerpP(D,C,u0), v1);

      const isLit  = hash(seed * 31 + row * 7 + col * 13) > 0.35;
      const isDark = hash(seed * 17 + row * 11 + col * 5)  > 0.8;

      ctx.beginPath();
      ctx.moveTo(tl.x,tl.y); ctx.lineTo(tr.x,tr.y);
      ctx.lineTo(br.x,br.y); ctx.lineTo(bl.x,bl.y);
      ctx.closePath();
      ctx.fillStyle = isDark ? darkColor : (isLit ? litColor : windowColor);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export class FeatureRenderer {
  constructor(ctx, cam, terrainRegistry, voxelRenderer) {
    this.ctx     = ctx;
    this.cam     = cam;
    this.terrain = terrainRegistry;
    this.vr      = voxelRenderer ?? new VoxelRenderer(ctx, cam);
    this.treeR   = new TreeRenderer(ctx, cam, this.vr);
    this.frameNow = 0;
  }

  // ── Public: draw all features ──────────────────────────────────────────────

  drawAll(features, selectedId, terrainCache, pGlobalX, pGlobalY) {
    const { ctx, cam } = this;
    const hw = tileHalfWidth(cam.zoom, cam.tileW);

    const CLUSTER_PX = 40;
    const useCluster = hw < 8;

    if (!useCluster) {
      const sorted = [...features].sort(
        (a, b) => tileDepth(a.tx, a.ty, cam.rotation)
                - tileDepth(b.tx, b.ty, cam.rotation)
      );
      for (const f of sorted) {
        this.drawFeature(f, selectedId === f.id, terrainCache, pGlobalX, pGlobalY);
      }
      return;
    }

    // Clustered low-zoom mode
    const clusters = new Map();
    for (const f of features) {
      const th    = this.terrain.heights[terrainCache.getLocal(f.tx, f.ty, pGlobalX, pGlobalY, cam.mapW, cam.mapH)] ?? 4;
      const elev  = getElevOffset(th, cam.tilt, cam.zoom);
      const { x: sx, y: sy } = worldToScreen(f.tx+0.5, f.ty+0.5, elev, cam);
      const cw = ctx.canvas.width, ch = ctx.canvas.height;
      if (sx < -CLUSTER_PX || sx > cw+CLUSTER_PX || sy < -CLUSTER_PX || sy > ch+CLUSTER_PX) continue;
      const cellX = Math.floor(sx/CLUSTER_PX), cellY = Math.floor(sy/CLUSTER_PX);
      const key = `${cellX},${cellY}`;
      if (!clusters.has(key)) {
        const ftype   = resolveFeatureType(f.data?.title ?? (f.data.label ?? ""), f.data?.tags ?? {}, f.color);
        const catCol  = CATEGORY_COLORS[ftype.category] ?? f.color;
        clusters.set(key, { sx, sy, count: 0, color: catCol, selected: false });
      }
      const cl = clusters.get(key);
      cl.count++;
      if (f.id === selectedId) cl.selected = true;
    }
    for (const c of clusters.values()) {
      this._drawCluster(c.sx, c.sy, c.count, c.color, c.selected, hw);
    }
  }

  // ── Draw a single feature ──────────────────────────────────────────────────

  drawFeature(f, isSelected, terrainCache, pGlobalX, pGlobalY) {
    const { ctx, cam, terrain, vr } = this;
    const { tx, ty } = f;

    const ftype = resolveFeatureType(f.data?.title ?? (f.data.label ?? ""), f.data?.tags ?? {}, f.color ?? '#60a5fa');

    const color = f.color ?? ftype.color;
    const mode  = ftype.renderMode;

    const th    = terrain.heights[terrainCache.getLocal(tx, ty, pGlobalX, pGlobalY, cam.mapW, cam.mapH)] ?? 4;
    const elev  = getElevOffset(th, cam.tilt, cam.zoom);
    const center = worldToScreen(tx+0.5, ty+0.5, elev, cam);
    const hw    = tileHalfWidth(cam.zoom, cam.tileW);

    // Off-screen cull
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (center.x < -hw*4 || center.x > cw+hw*4 || center.y < -hw*4 || center.y > ch+hw*4) return;

    // 1. Trees
    if (mode === 'tree') {
      this._drawTree(f, ftype, elev, isSelected);
      return;
    }

    // 2. Flat features
    if (mode === 'flat') {
      this._drawFlatDot(center, color, isSelected, hw, ftype.label);
      return;
    }

    // 3. Blueprint lookup - Check tags aggressively to catch everything
    const tags = f.data?.tags || {};
    const keyCandidates = [
      f.asset,                           // For Ecosystem trees
      f.data?.asset,                     // Standard data override
      f.data?.data?.asset,
      tags.amenity, tags.shop, tags.leisure, tags.tourism, tags.building,
      (f.data?.title || f.data?.label || "").toLowerCase().replace(/\s+/g, "_"),
      ftype.asset
    ];

    let blueprint = null;
    for (const cand of keyCandidates) {
      if (cand && Blueprints[cand]) {
        blueprint = Blueprints[cand];
        break;
      }
    }

    const isoA  = Math.min(1, Math.max(0, (cam.tilt - 0.18) / 0.28));
    const flatA = Math.min(1, Math.max(0, (0.42  - cam.tilt) / 0.28));

    // Flat view crossfade
    if (flatA > 0.01) {
      ctx.globalAlpha = flatA;
      this._drawFlatDot(center, color, false, hw * 0.8, null); 
      ctx.globalAlpha = 1;
    }

    // ISO View
    if (isoA > 0.01) {
      ctx.globalAlpha = isoA;
      vr.beginTile(tx, ty, elev);

      if (blueprint) {
        blueprint.forEach(part => {
          vr.box(part.x, part.y, part.z, part.w, part.h, part.d, 
                 part.top || color, 
                 part.right || shadeHex(color, 0.7), 
                 part.front || shadeHex(color, 0.4));
        });
      } else {
        // Generic Voxel Fallback (Replaces the 2D Sprite/Basic Tower)
        const right = shadeHex(color, 0.6);
        const front = shadeHex(color, 0.4);
        const h = ftype.height ?? 4;
        vr.box(-2, 0, -2, 4, h, 4, color, right, front);
        // Add a clean contrasting cap so it looks like a POI marker, not a building
        vr.box(-1, h, -1, 2, 1, 2, '#ffffff', '#e0e0e0', '#cccccc'); 
      }
      ctx.globalAlpha = 1;
    }

    // Label and Selection
    if (hw > 14 && ftype.label && cam.tilt > 0.1) {
      this._drawLabel(center, ftype.label, color, elev, hw);
    }
    if (isSelected) {
      const t = this.frameNow * 0.002;
      ctx.beginPath();
      ctx.arc(center.x, center.y, Math.max(5, hw*(1.3 + Math.sin(t)*0.15)), 0, Math.PI*2);
      ctx.strokeStyle = color+'99'; ctx.lineWidth = 2.5; ctx.stroke();
    }
  }

  // ─── Tree rendering ────────────────────────────────────────────────────────

  _drawTree(f, ftype, elev, isSelected) {
    const { ctx, cam } = this;
    const { tx, ty }   = f;
    const color        = f.color ?? ftype.color;
    const hw           = tileHalfWidth(cam.zoom, cam.tileW);
    const center       = worldToScreen(tx+0.5, ty+0.5, elev, cam);
    const seed         = Math.abs(Math.round(tx * 31 + ty * 17)) % 100;

    let treeType = 'deciduous';
    if (ftype.asset === 'forest') treeType = 'forest';
    else if (ftype.asset === 'park') treeType = 'park';
    else if (f.data?.tags?.['leaf_type'] === 'needleleaved') treeType = 'conifer';
    else if (f.data?.tags?.['species']?.toLowerCase().includes('palm')) treeType = 'palm';

    const scale = Math.max(0.5, Math.min(1.5, cam.zoom * 4));
    this.treeR.drawTree(tx, ty, elev, { type: treeType, scale, seed });

    const flatA = Math.min(1, Math.max(0, (0.3 - cam.tilt) / 0.2));
    if (flatA > 0.01) {
      ctx.globalAlpha = flatA;
      this.treeR.drawFlatDot(center.x, center.y, color, hw);
      ctx.globalAlpha = 1;
    }

    if (isSelected) {
      const t = this.frameNow * 0.002;
      ctx.beginPath();
      ctx.arc(center.x, center.y, Math.max(5, hw*(1.4 + Math.sin(t)*0.1)), 0, Math.PI*2);
      ctx.strokeStyle = color+'99'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  // ─── Flat dot (for parking, pitches, etc.) ────────────────────────────────

  _drawFlatDot(center, color, isSelected, hw, label) {
    const { ctx, cam } = this;
    const r  = Math.max(4, hw * 0.9);
    const flatDot = makeFlatDot(color);
    const sz = r * 2.5;
    ctx.drawImage(flatDot, center.x - sz, center.y - sz, sz*2, sz*2);
    if (label && hw > 18) {
      this._drawLabel(center, label, color, 0, hw);
    }
    if (isSelected) {
      const t = this.frameNow * 0.002;
      ctx.beginPath();
      ctx.arc(center.x, center.y, r*(1.4 + Math.sin(t)*0.1), 0, Math.PI*2);
      ctx.strokeStyle = color+'99'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  // ─── Label rendering ──────────────────────────────────────────────────────

  _drawLabel(center, text, color, elev, hw) {
    const { ctx } = this;
    const lx = center.x, ly = center.y - hw * 1.8 - elev * 0.5;
    const fontSize = Math.max(9, Math.min(14, hw * 0.5));

    ctx.font = `500 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(text).width;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect?.(lx - tw/2 - 5, ly - fontSize - 2, tw + 10, fontSize + 6, 4)
      ?? ctx.rect(lx - tw/2 - 5, ly - fontSize - 2, tw + 10, fontSize + 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, lx, ly);
  }

  // ─── Cluster badge ────────────────────────────────────────────────────────

  _drawCluster(sx, sy, count, color, selected, hw) {
    const { ctx } = this;
    const r = Math.max(5, Math.min(18, 5 + Math.log2(count + 1) * 3));
    ctx.beginPath(); ctx.arc(sx, sy, r+4, 0, Math.PI*2);
    ctx.fillStyle = color+'33'; ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (count > 1) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(9, r*0.9)}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(count > 99 ? '99+' : String(count), sx, sy);
    }
    if (selected) {
      ctx.beginPath(); ctx.arc(sx, sy, r+6, 0, Math.PI*2);
      ctx.strokeStyle = color+'99'; ctx.lineWidth = 2; ctx.stroke();
    }
  }
}

// ─── Building facade decorator ────────────────────────────────────────────────

export function decorateBuildingFacade(ctx, cam, buildingEntry, vr, seed = 0) {
  const { p, r, engineH, tc } = buildingEntry;
  const VU   = 8;

  const hw = tileHalfWidth(cam.zoom, cam.tileW);
  if (hw < 6 || cam.tilt < 0.1) return;

  const snap = ((Math.round(cam.rotation / (Math.PI / 2)) % 4) + 4) % 4;
  const x = -r, z = -r, w = r*2, d = r*2, h = engineH;

  const vp = (px, py, pz) => {
    vr.beginTile(p.x, p.y, buildingEntry.elev);
    return vr.proj(px, py, pz);
  };

  let faceA, faceB;
  if (snap === 0) {
    faceA = [vp(x+w,0,z),   vp(x+w,h,z),   vp(x+w,h,z+d), vp(x+w,0,z+d)];
    faceB = [vp(x,0,z+d),   vp(x+w,0,z+d), vp(x+w,h,z+d), vp(x,h,z+d)];
  } else if (snap === 1) {
    faceA = [vp(x,0,z+d),   vp(x+w,0,z+d), vp(x+w,h,z+d), vp(x,h,z+d)];
    faceB = [vp(x,0,z),     vp(x,h,z),     vp(x,h,z+d),   vp(x,0,z+d)];
  } else if (snap === 2) {
    faceA = [vp(x,0,z),     vp(x,h,z),     vp(x,h,z+d),   vp(x,0,z+d)];
    faceB = [vp(x,0,z),     vp(x+w,0,z),   vp(x+w,h,z),   vp(x,h,z)];
  } else {
    faceA = [vp(x,0,z),     vp(x+w,0,z),   vp(x+w,h,z),   vp(x,h,z)];
    faceB = [vp(x+w,0,z),   vp(x+w,h,z),   vp(x+w,h,z+d), vp(x+w,0,z+d)];
  }

  const floors     = Math.max(1, Math.round((engineH / VU) * 0.7));
  const colsA      = Math.max(2, Math.round(r / VU * 3));
  const colsB      = Math.max(1, Math.round(r / VU * 2));
  const windowColor = '#c8e8ff';

  const winAlpha = Math.min(1, (hw - 6) / 14) * Math.min(1, cam.tilt * 4);

  if (winAlpha > 0.05) {
    ctx.globalAlpha = winAlpha;
    drawFacadeWindows(ctx, faceA, floors, colsA, windowColor, seed);
    drawFacadeWindows(ctx, faceB, floors, colsB, windowColor, seed + 100);
    ctx.globalAlpha = 1;
  }

  if (hw > 10) {
    const tl = vp(x,   h, z);
    const tr = vp(x+w, h, z);
    const br = vp(x+w, h, z+d);
    const bl = vp(x,   h, z+d);
    ctx.beginPath();
    ctx.moveTo(tl.x,tl.y); ctx.lineTo(tr.x,tr.y);
    ctx.lineTo(br.x,br.y); ctx.lineTo(bl.x,bl.y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    const roofCol = shadeHex(tc.top, 0.85) + '88';
    ctx.fillStyle = roofCol;
    ctx.fill();
  }
}