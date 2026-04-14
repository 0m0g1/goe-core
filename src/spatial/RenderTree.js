/**
 * GOE Core — RenderTree
 *
 * A spatial index purpose-built for the render loop.
 * Distinct from the collision _spatialTree in three ways:
 *
 * 1. Indexes ALL entities (not just solid ones within 20 tiles of player).
 * 2. Only rebuilt when entities are added / removed — not on player movement.
 * Camera-only frames (panning, rotating, zooming) never trigger a rebuild.
 * 3. queryFrustum() takes the four unprojected screen corners and returns
 * only the entities whose tile position falls inside the visible world
 * rectangle (+ CULL_MARGIN padding), replacing the full-array
 * _isTileVisible loop that previously ran 16,000+ times per frame.
 *
 * Usage
 * ─────
 * const rt = new RenderTree({ x:0, y:0, w: mapW, h: mapH });
 *
 * // When entities change:
 * rt.rebuild(engine.entities);
 *
 * // Every frame, instead of looping engine.entities:
 * const visible = rt.queryFrustum(screenCornerWorldCoords, CULL_MARGIN);
 * for (const e of visible) { ... e.render(...) ... }
 */

import { Quadtree } from './Quadtree.js';

export class RenderTree {
  /**
   * @param {{ x:number, y:number, w:number, h:number }} bounds  — tile-space map bounds
   * @param {number} capacity  — Quadtree leaf capacity (default 8)
   */
  constructor(bounds, capacity = 8) {
    this._qt     = new Quadtree(bounds, capacity);
    this._bounds = bounds;
    this._count  = 0;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Rebuild the entire index from an entity array.
   * Called only when entities are added or removed (not on camera movement).
   *
   * @param {Entity[]} entities
   */
  rebuild(entities) {
    // Pre-allocate the descriptor array to avoid repeated push() allocations.
    const items = new Array(entities.length);
    let   n     = 0;

    for (const e of entities) {
      // Clamp to map bounds so out-of-range entities don't break the tree.
      const tx = Math.max(this._bounds.x,
                   Math.min(this._bounds.x + this._bounds.w, e.tx));
      const ty = Math.max(this._bounds.y,
                   Math.min(this._bounds.y + this._bounds.h, e.ty));

      items[n++] = {
        x:      tx,
        y:      ty,
        radius: e.bboxRadius ?? 0.35,
        entity: e,
      };
    }
    items.length = n; // trim any unused slots

    this._qt.rebuild(items);
    this._count = n;
  }

  /**
   * Query entities whose tile positions fall within the visible world rectangle.
   *
   * @param {Array<{x:number,y:number}>} worldCorners
   * Four world-space positions of the screen corners (from screenToWorld).
   * @param {number} margin  Extra tile padding on every side (e.g. CULL_MARGIN * 2).
   * @returns {Entity[]}
   */
  queryFrustum(worldCorners, margin = 8) {
    let minX =  Infinity, minY =  Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const c of worldCorners) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }

    const rect = {
      x: minX - margin,
      y: minY - margin,
      w: (maxX - minX) + margin * 2,
      h: (maxY - minY) + margin * 2,
    };

    // Reuse a scratch array to avoid allocation every frame.
    if (!this._scratch) this._scratch = [];
    this._scratch.length = 0;

    const raw = this._qt.queryRange(rect, this._scratch);

    // Unwrap descriptor objects → plain Entity references.
    const result = new Array(raw.length);
    for (let i = 0; i < raw.length; i++) result[i] = raw[i].entity;
    return result;
  }

  /**
   * Query entities that fall within a specific bounding box.
   * Used for resolving click targets.
   *
   * @param {{x:number, y:number, w:number, h:number}} rect
   * @returns {Entity[]}
   */
  queryRange(rect) {
    // Reuse a scratch array to avoid allocation every click
    if (!this._scratch) this._scratch = [];
    this._scratch.length = 0;

    // Query the underlying Quadtree
    const raw = this._qt.queryRange(rect, this._scratch);

    // Unwrap descriptor objects → plain Entity references
    const result = new Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      result[i] = raw[i].entity;
    }
    
    return result;
  }

  /**
   * Number of entities currently indexed.
   * Useful for debug HUD.
   */
  get size() { return this._count; }
}