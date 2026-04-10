/**
 * GOE Core — FeatureRenderer (v4 — WorldRenderer)
 *
 * A blueprint resolver and pipeline submitter. It never holds a
 * CanvasRenderingContext2D directly; all drawing goes through WorldRenderer.
 *
 * Trees are now drawn as blueprint voxels from BluePrintLibrary.
 * No TreeRenderer class is needed.
 */
import {
  worldToScreen, tileHalfWidth, tileHalfHeight,
  getElevOffset, shadeHex, tileDepth,
} from '../math/projection.js';
import { resolveFeatureType, CATEGORY_COLORS } from '../terrain/FeatureTypes.js';
import { Blueprints } from '../assets/BluePrintLibrary.js';

// ─── Flat dot (pre-rendered per colour) ──────────────────────────────────────

const _dotCache = new Map();
function makeFlatDot(color) {
  if (_dotCache.has(color)) return _dotCache.get(color);
  const oc = document.createElement('canvas'); oc.width = oc.height = 128;
  const c  = oc.getContext('2d');
  const g  = c.createRadialGradient(64, 64, 8, 64, 64, 56);
  g.addColorStop(0, color + 'cc'); g.addColorStop(1, color + '00');
  c.fillStyle = g; c.beginPath(); c.arc(64, 64, 56, 0, Math.PI * 2); c.fill();
  c.fillStyle = color; c.beginPath(); c.arc(64, 64, 28, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 3;
  c.beginPath(); c.arc(64, 64, 28, 0, Math.PI * 2); c.stroke();
  _dotCache.set(color, oc);
  return oc;
}

// ─── Building facade helpers ─────────────────────────────────────────────────


// ─── Tree-type → blueprint key mapping ───────────────────────────────────────

const TREE_BLUEPRINT = {
  conifer:    'tree_pine',
  palm:       'tree_palm',
  forest:     'forest',
  park:       'park',
  deciduous:  'tree_oak',
};

// ─── Main renderer ────────────────────────────────────────────────────────────

export class FeatureRenderer {
  /**
   * @param {WorldRenderer} worldRenderer
   * @param {object}        terrainRegistry
   */
  constructor(worldRenderer, terrainRegistry) {
    this._wr     = worldRenderer;
    this.terrain = terrainRegistry;
    this.frameNow = 0;
  }

  get ctx() { return this._wr.ctx; }
  get cam() { return this._wr.cam; }

  // ── Public: draw all features ──────────────────────────────────────────────

  drawAll(wr, features, selectedId, terrainCache, pGlobalX, pGlobalY) {
    const { cam } = wr;
    const hw = tileHalfWidth(cam.zoom, cam.tileW);
    const CLUSTER_PX = 40;
    const useCluster = hw < 8;

    if (!useCluster) {
      for (const f of features) {
        this.drawFeature(wr, f, selectedId === f.id, terrainCache, pGlobalX, pGlobalY);
      }
      return;
    }

    // Clustered low-zoom mode
    const clusters = new Map();
    for (const f of features) {
      const th   = this.terrain.heights[terrainCache.getLocal(f.tx, f.ty, pGlobalX, pGlobalY, cam.mapW, cam.mapH)] ?? 4;
      const elev = getElevOffset(th, cam.tilt, cam.zoom);
      const { x: sx, y: sy } = worldToScreen(f.tx + 0.5, f.ty + 0.5, elev, cam);
      const cw = this.ctx.canvas.width, ch = this.ctx.canvas.height;
      if (sx < -CLUSTER_PX || sx > cw + CLUSTER_PX || sy < -CLUSTER_PX || sy > ch + CLUSTER_PX) continue;
      const key = `${Math.floor(sx / CLUSTER_PX)},${Math.floor(sy / CLUSTER_PX)}`;
      if (!clusters.has(key)) {
        const ftype  = resolveFeatureType(f.data?.title ?? (f.data?.label ?? ''), f.data?.tags ?? {}, f.color);
        const catCol = CATEGORY_COLORS[ftype.category] ?? f.color;
        clusters.set(key, { sx, sy, count: 0, color: catCol, selected: false });
      }
      const cl = clusters.get(key);
      cl.count++;
      if (f.id === selectedId) cl.selected = true;
    }

    for (const c of clusters.values()) {
      const { sx, sy, count, color, selected } = c;
      wr.submitOverlay(() => this._drawCluster(sx, sy, count, color, selected, hw));
    }
  }

  // ── Draw a single feature ──────────────────────────────────────────────────

  drawFeature(wr, f, isSelected, terrainCache, pGlobalX, pGlobalY) {
    const { cam, terrain } = this;
    const { tx, ty }       = f;

    if (typeof(f) === 'BallEntity') console.log(f);
    const ftype      = resolveFeatureType(f.data?.title ?? (f.data?.label ?? ''), f.data?.tags ?? {}, f.color ?? '#60a5fa');
    const color      = f.color ?? ftype.color;
    const mode       = ftype.renderMode;
    const groundH    = terrain.heights[terrainCache.getLocal(tx, ty, pGlobalX, pGlobalY, cam.mapW, cam.mapH)] ?? 4;
    const groundElev = getElevOffset(groundH, cam.tilt, cam.zoom);

    let altOffset = 0;
    if (f.data?.category === 'aviation') altOffset = 5 + Math.log10((f.data.altitude || 1000) + 1) * 3;
    if (f.data?.category === 'traffic')  altOffset = 0.5;

    const finalElev = groundElev + altOffset;
    const center    = worldToScreen(tx + 0.5, ty + 0.5, finalElev, cam);
    const hw        = tileHalfWidth(cam.zoom, cam.tileW);

    const cw = this.ctx.canvas.width, ch = this.ctx.canvas.height;
    if (center.x < -hw * 4 || center.x > cw + hw * 4 || center.y < -hw * 4 || center.y > ch + hw * 4) return;

    const depth = tileDepth(tx, ty, cam.rotation) + altOffset * 0.01;

    wr.submitWorldObject(depth, () => {
      if (mode === 'tree') {
        this._drawTree(wr, f, ftype, finalElev, isSelected, hw);
        return;
      }
      if (mode === 'flat') {
        this._drawFlatDot(wr, center, color, isSelected, hw, ftype.label);
        return;
      }

      // Blueprint voxel rendering
      const tags = f.data?.tags || {};
      const keyCandidates = [
        f.asset, f.data?.asset, f.data?.data?.asset,
        tags.amenity, tags.shop, tags.leisure, tags.tourism, tags.building,
        (f.data?.title || f.data?.label || '').toLowerCase().replace(/\s+/g, '_'),
        ftype.asset,
      ];
      let blueprint = null;
      for (const cand of keyCandidates) {
        if (cand && Blueprints[cand]) { blueprint = Blueprints[cand]; break; }
      }

      const isoA = Math.min(1, Math.max(0, (cam.tilt - 0.18) / 0.28));
      if (isoA > 0.01) {
        this.ctx.globalAlpha = isoA;
        wr.beginTile(tx, ty, finalElev);
        if (blueprint) {
          for (const part of blueprint) {
            wr.box(
              part.x, part.y, part.z, part.w, part.h, part.d,
              part.top   || color,
              part.right || shadeHex(color, 0.7),
              part.front || shadeHex(color, 0.4),
            );
          }
        } else {
          const h = ftype.height ?? 4;
          wr.box(-2, 0, -2, 4, h, 4, color, shadeHex(color, 0.6), shadeHex(color, 0.4));
        }
        this.ctx.globalAlpha = 1;
      }

      if (isSelected) {
        const t = this.frameNow * 0.002;
        wr.strokeCircle(center.x, center.y, Math.max(5, hw * (1.3 + Math.sin(t) * 0.15)), color + '99', 2.5);
      }
    });

    // Label → UI overlay
    if (hw > 12 && (f.label || ftype.label) && cam.tilt > 0.1) {
      wr.submitOverlay(() => {
        const ly = center.y - hw * 1.8;
        const fs = Math.max(9, Math.min(14, hw * 0.5));
        wr.drawLabel(center.x, ly, f.label || ftype.label, undefined, undefined, fs);
      });
    }
  }

  // ─── Tree rendering via blueprint ────────────────────────────────────────

  _drawTree(wr, f, ftype, elev, isSelected, hw) {
    const { cam, ctx }  = this;
    const { tx, ty }    = f;
    const color         = f.color ?? ftype.color;
    const center        = worldToScreen(tx + 0.5, ty + 0.5, elev, cam);

    let treeType = 'deciduous';
    if (ftype.asset === 'forest') treeType = 'forest';
    else if (ftype.asset === 'park')                                        treeType = 'park';
    else if (f.data?.tags?.['leaf_type'] === 'needleleaved')                treeType = 'conifer';
    else if (f.data?.tags?.['species']?.toLowerCase().includes('palm'))     treeType = 'palm';

    const bpKey    = TREE_BLUEPRINT[treeType] ?? 'tree_oak';
    const blueprint = Blueprints[bpKey] ?? Blueprints['tree'];

    if (cam.tilt >= 0.04) {
      const isoA = Math.min(1, (cam.tilt - 0.04) / 0.12);
      ctx.globalAlpha = isoA;
      wr.drawBlueprint(blueprint, tx, ty, elev);
      ctx.globalAlpha = 1;
    }

    // Fade to a flat radial dot below the tilt threshold
    const flatA = Math.min(1, Math.max(0, (0.3 - cam.tilt) / 0.2));
    if (flatA > 0.01) {
      ctx.globalAlpha = flatA;
      this._drawFlatDotRaw(wr, center.x, center.y, color, hw);
      ctx.globalAlpha = 1;
    }

    if (isSelected) {
      const t = this.frameNow * 0.002;
      wr.strokeCircle(center.x, center.y, Math.max(5, hw * (1.4 + Math.sin(t) * 0.1)), color + '99', 2);
    }
  }

  // ─── Flat dot ────────────────────────────────────────────────────────────

  _drawFlatDot(wr, center, color, isSelected, hw, label) {
    const r = Math.max(4, hw * 0.9);
    this._drawFlatDotRaw(wr, center.x, center.y, color, hw);
    if (label && hw > 18) {
      const ly = center.y - hw * 1.8;
      const fs = Math.max(9, Math.min(14, hw * 0.5));
      wr.drawLabel(center.x, ly, label, undefined, undefined, fs);
    }
    if (isSelected) {
      const t = this.frameNow * 0.002;
      wr.strokeCircle(center.x, center.y, r * (1.4 + Math.sin(t) * 0.1), color + '99', 2);
    }
  }

  _drawFlatDotRaw(wr, sx, sy, color, hw) {
    const r    = Math.max(4, hw * 0.9);
    const flatDot = makeFlatDot(color);
    const sz   = r * 2.5;
    wr.drawImage(flatDot, sx - sz, sy - sz, sz * 2, sz * 2);
  }

  // ─── Cluster badge ───────────────────────────────────────────────────────

  _drawCluster(sx, sy, count, color, selected, hw) {
    const wr = this._wr;
    const r  = Math.max(5, Math.min(18, 5 + Math.log2(count + 1) * 3));
    wr.drawCircle(sx, sy, r + 4, color + '33');
    wr.drawCircle(sx, sy, r, color);
    wr.strokeCircle(sx, sy, r, 'rgba(0,0,0,0.4)', 1.5);
    if (count > 1) {
      const { ctx } = wr;
      ctx.fillStyle    = '#fff';
      ctx.font         = `bold ${Math.max(9, r * 0.9)}px monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(count > 99 ? '99+' : String(count), sx, sy);
    }
    if (selected) wr.strokeCircle(sx, sy, r + 6, color + '99', 2);
  }
}

// ─── Building facade decorator ────────────────────────────────────────────────

