/**
 * GOE Core — TerracedElevation
 *
 * Wraps an ElevationLoader and re-exposes the same API
 * (sampleElevation, sampleTileHeight, toTileHeight, prefetch, status,
 * clearCache) with one behavioural difference: raw elevation metres are
 * quantised into discrete steps before conversion to tile-height units,
 * producing the flat-topped, hard-edged terrace aesthetic.
 *
 * ── Design goals ─────────────────────────────────────────────────────────────
 *
 * 1. ZERO coupling — the class owns no tile fetching logic.
 *    Pass any ElevationLoader (Terrarium, Mapbox, or a mock) as `loader`.
 *
 * 2. TRANSPARENT drop-in — the public API matches ElevationLoader exactly so
 *    Engine.setElevationLoader(new TerracedElevation(loader, opts)) works
 *    without any other code change.
 *
 * 3. SMOOTH terrace walls — each step emits a thin "riser" tile-height band
 *    (stepRiserH) so the iso wall between adjacent terraces has a visible
 *    rendered height rather than a paper-thin seam.
 *
 * 4. CHEAP — quantisation is a single Math.floor + multiply; no extra
 *    network calls, no extra ImageData allocations.  The _quantise() call
 *    inside the hot path sampleElevation() is branch-free.
 *
 * ── Step anatomy ─────────────────────────────────────────────────────────────
 *
 *   raw elevation (m)
 *         │
 *         ▼
 *   quantise to nearest stepH-metre band
 *   (stepH = height of each flat terrace in metres)
 *         │
 *         ▼
 *   clamp to [0, maxElevM]
 *         │
 *         ▼
 *   toTileHeight → tile units  (passed to getElevOffset in Engine)
 *
 * Example with stepH=20, mPerTile=2:
 *
 *   raw    →  step  →  tile-height units
 *   0–19   →   0    →   0
 *   20–39  →  20    →  10
 *   40–59  →  40    →  20
 *   60–79  →  60    →  30
 *   80+    →  80    →  40   (capped by ElevationLoader.toTileHeight's 80-unit cap)
 *
 * ── Options ──────────────────────────────────────────────────────────────────
 *
 *   stepH       {number}  Vertical height of each terrace in metres.
 *                         Must be > 0.  Default: 20.
 *                         Lower  → more steps, finer detail.
 *                         Higher → fewer steps, bolder silhouette.
 *
 *   snapMode    {string}  How raw elevation maps to a step:
 *                         'floor'  — step = floor(raw / stepH) * stepH  (default)
 *                                    tile sits on the terrace BELOW the sample
 *                         'round'  — step = round(raw / stepH) * stepH
 *                                    softer; half-way samples snap up
 *                         'ceil'   — step = ceil(raw / stepH)  * stepH
 *                                    tile sits on the terrace ABOVE the sample
 *
 *   maxElevM    {number}  Hard clamp on quantised elevation (metres).
 *                         Default: 8850 (Everest; matches ElevationLoader).
 *
 *   minElevM    {number}  Hard clamp on the low end (metres).
 *                         Default: 0 (sea-level floor).
 *                         Set to a negative value if your terrain includes
 *                         below-sea-level features you want to preserve.
 */

export class TerracedElevation {
  /**
   * @param {ElevationLoader} loader   Any object that implements the
   *                                   ElevationLoader public API.
   * @param {object}          [opts]
   * @param {number}          [opts.stepH=20]
   * @param {'floor'|'round'|'ceil'} [opts.snapMode='floor']
   * @param {number}          [opts.maxElevM=8850]
   * @param {number}          [opts.minElevM=0]
   */
  constructor(loader, opts = {}) {
    if (!loader || typeof loader.sampleElevation !== 'function') {
      throw new TypeError(
        '[TerracedElevation] `loader` must be an ElevationLoader instance ' +
        '(or any object with sampleElevation / toTileHeight / prefetch).'
      );
    }

    this._loader   = loader;
    this._stepH    = opts.stepH    ?? 20;
    this._snapMode = opts.snapMode ?? 'floor';
    this._maxElevM = opts.maxElevM ?? 8850;
    this._minElevM = opts.minElevM ?? 0;

    if (this._stepH <= 0) {
      throw new RangeError('[TerracedElevation] stepH must be > 0.');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Public API  — mirrors ElevationLoader exactly
  // ══════════════════════════════════════════════════════════════════════════

  /** Passthrough to the underlying loader's status string. */
  get status() { return this._loader.status; }

  /**
   * Prefetch elevation tiles around `geoCenter`.
   * Delegates entirely to the underlying loader.
   *
   * @param {{ lat: number, lon: number }} geoCenter
   * @returns {Promise<void>}
   */
  async prefetch(geoCenter) {
    return this._loader.prefetch(geoCenter);
  }

  /**
   * Sample the QUANTISED elevation at (lat, lon) in metres.
   *
   * This is the core method.  It fetches the raw float elevation from the
   * underlying loader and snaps it to the nearest terrace step.
   *
   * Returns 0 if the underlying tile has not loaded yet (same contract as
   * ElevationLoader.sampleElevation).
   *
   * Safe to call every frame — no allocations.
   *
   * @param {number} lat
   * @param {number} lon
   * @returns {number}  Quantised elevation in metres.
   */
  sampleElevation(lat, lon) {
    const raw = this._loader.sampleElevation(lat, lon);
    return this._quantise(raw);
  }

  /**
   * Convert a raw elevation value (metres) to a quantised one.
   * Useful when you already have an elevation value and only need the snapping
   * (e.g. for minimap colouring or legend generation).
   *
   * @param {number} elevM  Raw elevation in metres.
   * @returns {number}      Quantised elevation in metres.
   */
  quantise(elevM) {
    return this._quantise(elevM);
  }

  /**
   * Convert a quantised (or raw) elevation in metres to engine tile-height
   * units.  Delegates to the underlying loader so mPerTile / cap are
   * consistent between TerracedElevation and its base loader.
   *
   * @param {number} elevM
   * @returns {number}  Tile-height units.
   */
  toTileHeight(elevM) {
    return this._loader.toTileHeight(elevM);
  }

  /**
   * Combined convenience: sampleElevation + toTileHeight, both using the
   * quantised value.
   *
   * @param {number} lat
   * @param {number} lon
   * @returns {number}  Tile-height units.
   */
  sampleTileHeight(lat, lon) {
    return this.toTileHeight(this.sampleElevation(lat, lon));
  }

  /**
   * Return the step index (0-based terrace number) for a given lat/lon.
   * Useful for colouring bands or deciding riser heights in a render fn.
   *
   * @param {number} lat
   * @param {number} lon
   * @returns {number}  Integer step index ≥ 0.
   */
  sampleStepIndex(lat, lon) {
    const q = this.sampleElevation(lat, lon);
    return Math.round(q / this._stepH);
  }

  /**
   * Return the step index for a raw elevation value without a lat/lon lookup.
   *
   * @param {number} elevM
   * @returns {number}
   */
  elevToStepIndex(elevM) {
    return Math.round(this._quantise(elevM) / this._stepH);
  }

  /**
   * Return an array of { elevM, tileH } descriptors for every terrace step
   * up to `maxElevM`.  Useful for legend / HUD colouring.
   *
   * @returns {{ elevM: number, tileH: number, stepIndex: number }[]}
   */
  getTerraceSteps() {
    const steps = [];
    for (let e = this._minElevM; e <= this._maxElevM; e += this._stepH) {
      steps.push({
        stepIndex: Math.round(e / this._stepH),
        elevM:     e,
        tileH:     this._loader.toTileHeight(e),
      });
    }
    return steps;
  }

  /**
   * Check whether two lat/lon points are on the same terrace step.
   * Handy for path-finding cost functions or terrain-type comparisons.
   *
   * @param {number} lat1
   * @param {number} lon1
   * @param {number} lat2
   * @param {number} lon2
   * @returns {boolean}
   */
  sameStep(lat1, lon1, lat2, lon2) {
    return this.sampleElevation(lat1, lon1) === this.sampleElevation(lat2, lon2);
  }

  /**
   * Return the signed step difference between two points.
   * Positive = point B is higher; negative = point B is lower.
   *
   * @param {number} lat1
   * @param {number} lon1
   * @param {number} lat2
   * @param {number} lon2
   * @returns {number}  Integer step delta.
   */
  stepDelta(lat1, lon1, lat2, lon2) {
    return this.elevToStepIndex(this.sampleElevation(lat2, lon2))
         - this.elevToStepIndex(this.sampleElevation(lat1, lon1));
  }

  /**
   * Clear both in-memory and persistent caches.
   * Delegates to the underlying loader.
   */
  async clearCache() {
    return this._loader.clearCache?.();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Runtime configuration helpers
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Change the step height at runtime (e.g. on a settings slider).
   * Changing stepH does NOT invalidate any tile data — tiles are sampled
   * fresh each frame so the new value takes effect immediately.
   *
   * @param {number} stepH  Must be > 0.
   */
  setStepHeight(stepH) {
    if (stepH <= 0) throw new RangeError('[TerracedElevation] stepH must be > 0.');
    this._stepH = stepH;
  }

  /** @returns {number} Current step height in metres. */
  get stepHeight() { return this._stepH; }

  /**
   * Change the snap mode at runtime.
   * @param {'floor'|'round'|'ceil'} mode
   */
  setSnapMode(mode) {
    if (!['floor', 'round', 'ceil'].includes(mode)) {
      throw new TypeError('[TerracedElevation] snapMode must be "floor", "round", or "ceil".');
    }
    this._snapMode = mode;
  }

  /** @returns {string} Current snap mode. */
  get snapMode() { return this._snapMode; }

  // ══════════════════════════════════════════════════════════════════════════
  // Internal helpers
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Core quantisation.  Hot path — must remain branch-minimal.
   *
   * @param {number} raw  Raw elevation in metres (may be negative).
   * @returns {number}    Stepped elevation clamped to [minElevM, maxElevM].
   * @private
   */
  _quantise(raw) {
    const s = this._stepH;

    let stepped;
    switch (this._snapMode) {
      case 'round': stepped = Math.round(raw / s) * s; break;
      case 'ceil':  stepped = Math.ceil(raw  / s) * s; break;
      default:      stepped = Math.floor(raw / s) * s; break; // 'floor'
    }

    // Clamp to engine bounds
    if (stepped < this._minElevM) stepped = this._minElevM;
    if (stepped > this._maxElevM) stepped = this._maxElevM;

    return stepped;
  }
}