/**
 * GOE Core — FeatureRenderer
 * Renders map features (events, POIs, land parcels) as:
 *   • Flat mode  → glowing dot with aura
 *   • ISO mode   → voxel tower with spire + tip glow
 *
 * Each feature is a plain object:
 *   { tx, ty, color, id, data, label? }
 */
import {
  topFaceQuad, worldToScreen, tileHalfWidth, tileHalfHeight,
  getElevOffset, shadeHex, tileDepth,
} from '../math/projection.js';
import { VoxelRenderer, VOXEL_UNITS } from './VoxelRenderer.js';

// ─── FLAT DOT SPRITE CACHE ───────────────────────────────────────────────────
const _dotCache = new Map();

function makeFlatDot(color) {
  if (_dotCache.has(color)) return _dotCache.get(color);
  const SPR = 128;
  const oc  = document.createElement('canvas');
  oc.width = oc.height = SPR;
  const c = oc.getContext('2d');
  const grd = c.createRadialGradient(64, 64, 8, 64, 64, 56);
  grd.addColorStop(0, color + 'cc');
  grd.addColorStop(1, color + '00');
  c.fillStyle = grd;
  c.beginPath(); c.arc(64, 64, 56, 0, Math.PI * 2); c.fill();
  c.fillStyle = color;
  c.beginPath(); c.arc(64, 64, 28, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 3;
  c.beginPath(); c.arc(64, 64, 28, 0, Math.PI * 2); c.stroke();
  _dotCache.set(color, oc);
  return oc;
}

// ─── AFFINE WARP (for sprite-on-quad) ────────────────────────────────────────

function affineTriangle(ctx, img, src, dst) {
  const [s0,s1,s2] = src, [d0,d1,d2] = dst;
  const det = (s1.x-s0.x)*(s2.y-s0.y) - (s2.x-s0.x)*(s1.y-s0.y);
  if (Math.abs(det) < 0.001) return;
  const a = ((d1.x-d0.x)*(s2.y-s0.y)-(d2.x-d0.x)*(s1.y-s0.y))/det;
  const b = ((d1.y-d0.y)*(s2.y-s0.y)-(d2.y-d0.y)*(s1.y-s0.y))/det;
  const c = ((d2.x-d0.x)*(s1.x-s0.x)-(d1.x-d0.x)*(s2.x-s0.x))/det;
  const d = ((d2.y-d0.y)*(s1.x-s0.x)-(d1.y-d0.y)*(s2.x-s0.x))/det;
  const e = d0.x - a*s0.x - c*s0.y, f = d0.y - b*s0.x - d*s0.y;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(d0.x,d0.y); ctx.lineTo(d1.x,d1.y); ctx.lineTo(d2.x,d2.y);
  ctx.closePath(); ctx.clip();
  ctx.transform(a,b,c,d,e,f); ctx.drawImage(img,0,0);
  ctx.restore();
}

function spriteOnQuad(ctx, img, quad, alpha) {
  if (!img || alpha <= 0.01) return;
  ctx.globalAlpha = alpha;
  const W = img.width, H = img.height;
  const [qA,qB,qC,qD] = quad;
  const tA={x:0,y:0},tB={x:W,y:0},tC={x:W,y:H},tD={x:0,y:H};
  affineTriangle(ctx, img, [tA,tB,tC], [qA,qB,qC]);
  affineTriangle(ctx, img, [tA,tC,tD], [qA,qC,qD]);
  ctx.globalAlpha = 1;
}

// ─── PARCEL RENDERER ─────────────────────────────────────────────────────────

export class FeatureRenderer {
  constructor(ctx, cam, terrainRegistry, voxelRenderer) {
    this.ctx     = ctx;
    this.cam     = cam;
    this.terrain = terrainRegistry;
    this.vr      = voxelRenderer || new VoxelRenderer(ctx, cam);
  }

  /**
   * Draw all features, depth-sorted.
   * @param {object[]} features   Array of { tx, ty, color, id, data, label? }
   * @param {string|null} selectedId
   * @param {object} terrainCache   TerrainCache instance
   * @param {number} pGlobalX
   * @param {number} pGlobalY
   */
  // FeatureRenderer.js — replace drawAll():
  drawAll(features, selectedId, terrainCache, pGlobalX, pGlobalY) {
    const { ctx, cam } = this;
    const hw = tileHalfWidth(cam.zoom, cam.tileW);

    // At low zoom, cluster features into screen-space grid cells
    // Each cell is ~40px — nearby dots merge into one count badge
    const CLUSTER_PX = 40;
    const useCluster = hw < 8; // cluster when tiles are small on screen

    if (!useCluster) {
      // Full detail — draw every feature individually (existing logic)
      const sorted = [...features].sort(
        (a, b) => tileDepth(a.tx, a.ty, cam.rotation)
                - tileDepth(b.tx, b.ty, cam.rotation)
      );
      for (const f of sorted) {
        this.drawFeature(f, selectedId === f.id, terrainCache, pGlobalX, pGlobalY);
      }
      return;
    }

    // Build cluster grid keyed by screen cell
    const clusters = new Map();
    for (const f of features) {
      const th = this.terrain.heights[
        terrainCache.getLocal(f.tx, f.ty, pGlobalX, pGlobalY, cam.mapW, cam.mapH)
      ] ?? 4;
      const elev = getElevOffset(th, cam.tilt, cam.zoom);
      const { x: sx, y: sy } = worldToScreen(f.tx + 0.5, f.ty + 0.5, elev, cam);

      // Skip off-screen features entirely
      const cw = ctx.canvas.width, ch = ctx.canvas.height;
      if (sx < -CLUSTER_PX || sx > cw + CLUSTER_PX ||
          sy < -CLUSTER_PX || sy > ch + CLUSTER_PX) continue;

      const cellX = Math.floor(sx / CLUSTER_PX);
      const cellY = Math.floor(sy / CLUSTER_PX);
      const key = `${cellX},${cellY}`;

      if (!clusters.has(key)) {
        clusters.set(key, { sx, sy, count: 0, color: f.color, selected: false });
      }
      const c = clusters.get(key);
      c.count++;
      if (f.id === selectedId) c.selected = true;
      // Keep the first feature's screen position as the cluster center
    }

    // Draw each cluster
    for (const c of clusters.values()) {
      this._drawCluster(c.sx, c.sy, c.count, c.color, c.selected, hw);
    }
  }

  _drawCluster(sx, sy, count, color, selected, hw) {
    const { ctx } = this;
    const r = Math.max(5, Math.min(18, 5 + Math.log2(count + 1) * 3));

    // Outer glow
    ctx.beginPath();
    ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = color + '33';
    ctx.fill();

    // Main dot
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Count badge (only if cluster has multiple)
    if (count > 1) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(9, r * 0.9)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(count > 99 ? '99+' : String(count), sx, sy);
    }

    // Selection ring
    if (selected) {
      ctx.beginPath();
      ctx.arc(sx, sy, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = color + '99';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  drawFeature(f, isSelected, terrainCache, pGlobalX, pGlobalY) {
    const { ctx, cam, terrain, vr } = this;
    const { tx, ty, color } = f;
    const mapW = cam.mapW, mapH = cam.mapH;

    const th    = terrain.heights[
      terrainCache.getLocal(tx, ty, pGlobalX, pGlobalY, mapW, mapH)
    ] ?? 4;
    const elev   = getElevOffset(th, cam.tilt, cam.zoom);
    const center = worldToScreen(tx + 0.5, ty + 0.5, elev, cam);
    const hw     = tileHalfWidth(cam.zoom, cam.tileW);

    // ── Side extrusion of underlying tile ────────────────────────────────
    if (elev > 0.5) {
      const quad = topFaceQuad(tx, ty, elev, cam);
      let ni = 0;
      for (let i = 1; i < 4; i++) if (quad[i].y > quad[ni].y) ni = i;
      const a = quad[(ni+3)%4], b = quad[ni], c2 = quad[(ni+1)%4];
      ctx.beginPath();
      ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
      ctx.lineTo(b.x,b.y+elev); ctx.lineTo(a.x,a.y+elev); ctx.closePath();
      ctx.fillStyle = shadeHex(color, 0.28); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(b.x,b.y); ctx.lineTo(c2.x,c2.y);
      ctx.lineTo(c2.x,c2.y+elev); ctx.lineTo(b.x,b.y+elev); ctx.closePath();
      ctx.fillStyle = shadeHex(color, 0.48); ctx.fill();
    }

    const isoA  = Math.min(1, Math.max(0, (cam.tilt - 0.18) / 0.28));
    const flatA = Math.min(1, Math.max(0, (0.42 - cam.tilt) / 0.28));

    // ── Flat: glowing dot sprite ──────────────────────────────────────────
    if (flatA > 0.01) {
      const sprSize = hw * 2.8;
      const bigQuad = [
        {x:center.x-sprSize, y:center.y-sprSize},
        {x:center.x+sprSize, y:center.y-sprSize},
        {x:center.x+sprSize, y:center.y+sprSize},
        {x:center.x-sprSize, y:center.y+sprSize},
      ];
      spriteOnQuad(ctx, makeFlatDot(color), bigQuad, flatA);
      if (isSelected) {
        ctx.globalAlpha = flatA;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(center.x, center.y, sprSize * 0.55, 0, Math.PI*2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ── ISO: voxel tower ──────────────────────────────────────────────────
    if (isoA > 0.01) {
      ctx.globalAlpha = isoA;
      vr.beginTile(tx, ty, elev);
      const right = shadeHex(color, 0.55), front = shadeHex(color, 0.35);
      vr.box(-2, 0, -2,  4, 5, 4, color, right, front);   // body
      vr.box(-0.5, 5, -0.5, 1, 5, 1, color, right, front); // spire
      const tip = vr.proj(0, 10.5, 0);
      ctx.beginPath(); ctx.arc(tip.x, tip.y, hw*0.35, 0, Math.PI*2);
      ctx.fillStyle = color + '66'; ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ── Selection ring ────────────────────────────────────────────────────
    if (isSelected) {
      const t = this.frameNow * 0.002;
      ctx.beginPath();
      ctx.arc(center.x, center.y, Math.max(5, hw * (1.3 + Math.sin(t)*0.15)), 0, Math.PI*2);
      ctx.strokeStyle = color + '99'; ctx.lineWidth = 2; ctx.stroke();
    }

    // ── Proximity aura ────────────────────────────────────────────────────
    if (cam.tilt < 0.4 && hw > 6) {
      const a = (1 - cam.tilt / 0.4) * 0.65;
      const t = this.frameNow * 0.002;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(center.x, center.y, hw * (1.1 + Math.sin(t)*0.08), 0, Math.PI*2);
      ctx.strokeStyle = color + Math.round(a*175).toString(16).padStart(2,'0');
      ctx.lineWidth = 1.5; ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Draw a land parcel outline.
   * @param {object} parcel  { corners:[{tx,ty}], color, owned, label }
   */
  drawParcel(parcel) {
    const { ctx, cam } = this;
    const pts = parcel.corners.map(c => worldToScreen(c.tx, c.ty, 0, cam));
    if (pts.length < 2) return;
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    const alpha = parcel.owned ? 0.5 : 0.25;
    ctx.fillStyle   = parcel.color + Math.round(alpha * 255).toString(16).padStart(2,'0');
    ctx.fill();
    ctx.strokeStyle = parcel.color; ctx.lineWidth = 1.5;
    ctx.setLineDash(parcel.owned ? [] : [4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}