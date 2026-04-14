// spatial/SpriteCache.js
// 
// Caches each static entity as an OffscreenCanvas keyed by
// (entityId, zoomBucket, rotBucket).  On a cache hit the draw
// cost is a single ctx.drawImage() call instead of N voxel box
// projections.  On a miss the entity is rendered once into an
// offscreen canvas, stored, then blitted.
//
// Cache key bucketing:
//   zoom   — rounded to nearest ZOOM_STEP  (15 % increments)
//   rot    — rounded to nearest ROT_STEP   ( 5 ° increments)
//
// The canvas is sized to the entity's projected bounding box plus
// a small padding so clipping never occurs.

const ZOOM_STEP   = 0.15;   // invalidate bucket every 15% zoom change
const ROT_STEP    = 5;      // degrees — 5° buckets → 72 unique rotations
const PADDING     = 8;      // px around the sprite so edge voxels aren't clipped
const MAX_ENTRIES = 4000;   // hard cap to stop unbounded growth

function zoomBucket(zoom)   { return Math.round(zoom / ZOOM_STEP); }
function rotBucket(rotRad)  { return Math.round((rotRad * 180 / Math.PI) / ROT_STEP); }
function cacheKey(id, zoom, rot) {
  return `${id}|${zoomBucket(zoom)}|${rotBucket(rot)}`;
}

export class SpriteCache {
  constructor() {
    // Map<key, { canvas, originX, originY }>
    // originX/Y = where the entity's anchor point sits within the sprite canvas
    this._cache    = new Map();
    this._hitCount = 0;
    this._missCount = 0;
  }

  /**
   * Draw `entity` to the main canvas, using a cached sprite when possible.
   *
   * @param {CanvasRenderingContext2D} ctx      — main canvas context
   * @param {object}   entity                  — GenericEntity
   * @param {object}   cam                     — Camera
   * @param {number}   screenX                 — worldToScreen result x
   * @param {number}   screenY                 — worldToScreen result y (with elev)
   * @param {Function} renderFn                — () => void  draws entity on ctx
   * @param {number}   estimatedPxRadius        — rough screen-space half-size for canvas sizing
   */
  draw(ctx, entity, cam, screenX, screenY, renderFn, estimatedPxRadius = 64) {
    const key = cacheKey(entity.id, cam.zoom, cam.rotation);
    let entry  = this._cache.get(key);

    if (!entry) {
      this._missCount++;
      entry = this._renderToSprite(ctx, cam, screenX, screenY, renderFn, estimatedPxRadius, key);
      if (!entry) {
        // Fallback: render directly if OffscreenCanvas unavailable
        renderFn();
        return;
      }
    } else {
      this._hitCount++;
    }

    // Blit sprite onto main canvas — single draw call regardless of entity complexity
    ctx.drawImage(
      entry.canvas,
      screenX - entry.originX,
      screenY - entry.originY
    );
  }

    _renderToSprite(ctx, cam, screenX, screenY, renderFn, estimatedPxRadius, key) {
        try {
        const size    = Math.ceil(estimatedPxRadius * 2 + PADDING * 2);
        const oCanvas = new OffscreenCanvas(size, size);
        const oCtx    = oCanvas.getContext('2d');

        const ox = size / 2;
        const oy = size / 2;

        // Create a "Proxy Camera" so the VoxelRenderer draws relative to (0,0)
        // instead of the global screen offset
        const proxyCam = Object.assign(Object.create(Object.getPrototypeOf(cam)), cam, {
            camX: -ox + screenX,
            camY: -oy + screenY
        });

        // Pass the proxyCam to the render function
        renderFn(oCtx, proxyCam);

        const entry = { canvas: oCanvas, originX: ox, originY: oy };

        if (this._cache.size >= MAX_ENTRIES) {
            this._cache.delete(this._cache.keys().next().value);
        }
        this._cache.set(key, entry);
        return entry;
        } catch (e) {
        console.warn('[SpriteCache] OffscreenCanvas render failed:', e);
        return null;
        }
    }

  /** Call when an entity's blueprint changes (not just zoom/rotation). */
  invalidate(entityId) {
    for (const key of this._cache.keys()) {
      if (key.startsWith(entityId + '|')) this._cache.delete(key);
    }
  }

  /** Call during panTo() / flyTo() to wipe everything. */
  clear() { this._cache.clear(); }

  get stats() {
    return { hits: this._hitCount, misses: this._missCount, size: this._cache.size };
  }
}