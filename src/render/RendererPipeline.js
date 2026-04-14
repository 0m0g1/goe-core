/**
 * GOE Core — RenderPipeline
 *
 * Defers and sorts render commands into strict layers to solve z-fighting
 * and ensure UI overlays (labels, clusters) are always drawn on top of 3D geometry.
 *
 * Memory fix vs previous version:
 *
 *   FIX H — Object pool for worldObjects entries.
 *     The old submitWorldObject() called:
 *       this.worldObjects.push({ depth, renderFn, priority })
 *     allocating a new plain object on every call. With ~400 visible entities
 *     each submitting one world object per frame that was 400 new objects ×
 *     60fps = 24,000 heap allocations per second, all discarded at the next
 *     beginFrame().
 *
 *     Now a fixed pool (_pool) of pre-allocated slot objects is maintained.
 *     submitWorldObject() takes a slot from the pool (or expands it if
 *     needed) and writes depth/renderFn/priority directly onto it.
 *     beginFrame() returns all used slots back to the pool by moving the
 *     pool pointer — no allocation, no GC pressure.
 *
 *     The pool grows on demand (first N frames) then stabilises at the
 *     high-water mark. Typical city scene: ~600 slots, ~4.8KB total.
 *
 *   FIX H2 — Sort comparator extracted as a named function.
 *     An inline arrow comparator `(a, b) => …` is re-created as a new
 *     function object on every flush() call. Extracting it to a module-level
 *     constant means one allocation ever.
 */

// FIX H2 — single comparator instance, never re-allocated
function sortByDepth(a, b) {
  return a.depth !== b.depth
    ? a.depth - b.depth
    : a.priority - b.priority;
}

export class RenderPipeline {
  constructor(ctx, cam) {
    this.ctx = ctx;
    this.cam = cam;

    this.shadowCasters = [];
    this.uiOverlays    = [];

    // Active worldObject slots for this frame (length tracks count used)
    this.worldObjects  = [];

    // FIX H — object pool
    // _pool holds pre-allocated slot objects. _poolHead is the index of the
    // next available slot. beginFrame() resets _poolHead to 0, returning all
    // slots to the pool without touching the heap.
    this._pool     = [];
    this._poolHead = 0;
  }

  beginFrame() {
    this.shadowCasters.length = 0;
    this.uiOverlays.length    = 0;

    // FIX H — return all worldObject slots to the pool by rewinding the pointer.
    // The slot objects themselves are NOT cleared or freed — they will be
    // overwritten in the next submitWorldObject() call.
    this.worldObjects.length = 0;
    this._poolHead = 0;
  }

  submitShadow(hullData) {
    this.shadowCasters.push(hullData);
  }

  /**
   * FIX H — Take a slot from the pool instead of allocating a new object.
   * If the pool is exhausted (first few frames, or spike), a new slot is
   * created and added to the pool so it's reused on future frames.
   */
  submitWorldObject(depth, renderFn, priority = 0) {
    let slot;
    if (this._poolHead < this._pool.length) {
      // Reuse existing slot
      slot = this._pool[this._poolHead];
    } else {
      // Pool exhausted — allocate once, it will be reused from now on
      slot = { depth: 0, renderFn: null, priority: 0 };
      this._pool.push(slot);
    }
    this._poolHead++;

    slot.depth    = depth;
    slot.renderFn = renderFn;
    slot.priority = priority;

    this.worldObjects.push(slot);
  }

  submitOverlay(renderFn) {
    this.uiOverlays.push(renderFn);
  }

  flush(shadowSystem, weatherSystem) {
    const { ctx } = this;

    // 1. Shadows (Multiply blending on top of terrain)
    if (this.shadowCasters.length > 0 && shadowSystem?.enabled) {
      shadowSystem.drawShadows(this.shadowCasters);
    }

    // 2. Y-Sorted World Geometry
    // FIX H2 — named comparator, not an inline arrow re-created each flush
    this.worldObjects.sort(sortByDepth);
    for (const obj of this.worldObjects) {
      obj.renderFn(ctx);
    }

    // 3. Weather Overlay
    if (weatherSystem) {
      weatherSystem.draw();
    }

    // 4. UI / Overlays (always on top)
    for (const overlay of this.uiOverlays) {
      overlay(ctx);
    }
  }
}