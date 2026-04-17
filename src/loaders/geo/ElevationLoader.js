/**
 * GOE Core — ElevationLoader
 * Fetches RGB-encoded terrain elevation tiles (Terrarium or Mapbox format),
 * caches the decoded ImageData, and provides a synchronous per-pixel lookup.
 *
 * Memory fixes vs previous version
 * ─────────────────────────────────
 * 1. `_resolved` Map is now bounded (RESOLVED_CACHE_MAX = 64 entries, LRU).
 *    Previously it grew without limit. Each ImageData is 256×256×4 = 262 KB;
 *    64 tiles ≈ 16 MB cap (well within reason for elevation data).
 *
 * 2. Persistent (IndexedDB) storage no longer calls Array.from(imageData.data).
 *    A Uint8ClampedArray of 262,144 bytes converts to a plain JS Array of
 *    262,144 Numbers at ~8 bytes each → a ~2 MB transient spike per tile.
 *    With MAX_CONCURRENT_FETCHES=4 that was up to 8 MB of garbage every batch.
 *    Fix: store the Uint8ClampedArray directly (it is structured-cloneable,
 *    so IndexedDB accepts it natively) and reconstruct ImageData from it on
 *    retrieval — same API, zero conversion cost.
 *
 * Compatible providers:
 *   • Nextzen Terrarium:  (R×256 + G + B/256) − 32768
 *   • Mapbox Terrain-RGB: −10000 + (R×65536 + G×256 + B) × 0.1
 *   • AWS Terrarium (S3 elevation-tiles-prod) — same formula as Nextzen
 */
import { latLonToSlippy } from '../../math/geo.js';
import { PersistentCache } from '../../core/PersistentCache.js';

export const ElevationFormat = Object.freeze({
  TERRARIUM: 'terrarium',
  MAPBOX:    'mapbox',
});

const TILE_ZOOM            = 13;   // ~10 m/px resolution
const PRE_RADIUS           = 1;    // pre-warm N tiles in each direction
const MAX_CONCURRENT_FETCHES = 4;  // max in-flight tile requests at once

/**
 * Maximum number of decoded ImageData objects to keep in the in-memory LRU.
 * 64 × 262 KB ≈ 16 MB — covers a 7×7 neighbourhood at zoom 13 with slack.
 */
const RESOLVED_CACHE_MAX = 64;

// In-memory promise cache (for concurrent requests within a single session)
const _inFlight = new Map();

// ─── DECODE ──────────────────────────────────────────────────────────────────

export function decodeTerr(r, g, b) { return r*256 + g + b/256 - 32768; }
export function decodeMapbox(r, g, b) { return -10000 + (r*65536 + g*256 + b)*0.1; }

// ─── LOADER CLASS ─────────────────────────────────────────────────────────────

export class ElevationLoader {
  /**
   * @param {(z,x,y)=>string} urlFn  Tile URL factory
   * @param {string} [format]        ElevationFormat.TERRARIUM | MAPBOX
   * @param {number} [mPerTile]
   */
  constructor(urlFn, format = ElevationFormat.TERRARIUM, mPerTile = 2) {
    this._urlFn    = urlFn;
    this._format   = format;
    this._mPerTile = mPerTile;
    this._resolved = new Map(); // key → ImageData (bounded LRU, see _putResolved)
    this._status   = 'idle';
    this._lastCenter = null;
    this._persistCache = new PersistentCache('GOE_Elevation', 'tiles');
  }

  get status() { return this._status; }

  /** Decode an RGB pixel to elevation metres. */
  _decode(r, g, b) {
    return this._format === ElevationFormat.MAPBOX ? decodeMapbox(r,g,b) : decodeTerr(r,g,b);
  }

  /**
   * Insert an ImageData into the in-memory LRU cache.
   * Evicts the oldest (first-inserted) entry when the cap is reached.
   * Using the Map-insertion-order property for O(1) LRU.
   */
  _putResolved(key, imageData) {
    if (this._resolved.has(key)) {
      // LRU: move to newest position
      this._resolved.delete(key);
    } else if (this._resolved.size >= RESOLVED_CACHE_MAX) {
      // Evict oldest
      this._resolved.delete(this._resolved.keys().next().value);
    }
    this._resolved.set(key, imageData);
  }

  /**
   * LRU-aware get: touching an entry promotes it to most-recently-used.
   */
  _getResolved(key) {
    if (!this._resolved.has(key)) return undefined;
    const imageData = this._resolved.get(key);
    // Promote to newest position
    this._resolved.delete(key);
    this._resolved.set(key, imageData);
    return imageData;
  }

  /**
   * Load a single tile from in-memory cache → IndexedDB → network.
   * @param {string} url
   * @param {string} key  e.g. "13/123/456"
   * @returns {Promise<ImageData>}
   */
  async _loadTile(url, key) {
    // 1. In-memory LRU cache (fast path)
    const cached = this._getResolved(key);
    if (cached) return cached;

    // 2. Prevent duplicate concurrent requests for the same tile
    if (_inFlight.has(key)) return _inFlight.get(key);

    const promise = (async () => {
      // 3. Persistent cache (IndexedDB)
      try {
        const stored = await this._persistCache.get(key);
        if (stored && stored.data && stored.width && stored.height) {
          // Fix 2: stored.data is now a Uint8ClampedArray (structured-cloneable),
          // so we can construct ImageData directly without Array → TypedArray copy.
          // If the DB has old data (plain Array from a previous version), the
          // Uint8ClampedArray constructor handles that too — both paths work.
          const pixelData = stored.data instanceof Uint8ClampedArray
            ? stored.data
            : new Uint8ClampedArray(stored.data); // backwards-compat with old stores
          const imageData = new ImageData(pixelData, stored.width, stored.height);
          this._putResolved(key, imageData);
          return imageData;
        }
      } catch (err) {
        console.warn(`[ElevationLoader] Cache read failed for ${key}:`, err);
      }

      // 4. Fetch from network
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = c.height = 256;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, 256, 256);
          const imageData = ctx.getImageData(0, 0, 256, 256);

          // Fix 2: store the Uint8ClampedArray directly in IndexedDB.
          // Previously Array.from(imageData.data) created a plain JS Array where
          // each of the 262,144 elements costs ~8 bytes → ~2 MB transient per tile.
          // Uint8ClampedArray is structured-cloneable (IDB-storable) and stays at
          // 1 byte/element in the serialisation buffer.
          const toStore = {
            data:   imageData.data, // Uint8ClampedArray — NOT Array.from()
            width:  imageData.width,
            height: imageData.height,
          };
          this._persistCache.set(key, toStore).catch(err => {
            console.warn(`[ElevationLoader] Failed to cache ${key}:`, err);
          });

          this._putResolved(key, imageData);
          resolve(imageData);
        };
        img.onerror = reject;
        img.src = url;
      });
    })();

    _inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      _inFlight.delete(key);
    }
  }

  /**
   * Run an array of async task factories with at most `limit` in-flight.
   */
  async _pooled(tasks, limit = MAX_CONCURRENT_FETCHES) {
    let idx = 0;
    const worker = async () => {
      while (idx < tasks.length) {
        const i = idx++;
        await tasks[i]().catch(() => {}); // missing tile → silent
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(limit, tasks.length) }, worker)
    );
  }

  /**
   * Pre-fetch tiles around a geo centre.
   */
  async prefetch(geoCenter) {
    const prev = this._lastCenter;
    if (prev && Math.abs(prev.lat - geoCenter.lat) < 0.001 && Math.abs(prev.lon - geoCenter.lon) < 0.001)
      return;
    this._lastCenter = geoCenter;
    this._status = 'loading';

    const { tileX, tileY } = latLonToSlippy(geoCenter.lat, geoCenter.lon, TILE_ZOOM);

    const tasks = [];
    for (let dx = -PRE_RADIUS; dx <= PRE_RADIUS; dx++) {
      for (let dy = -PRE_RADIUS; dy <= PRE_RADIUS; dy++) {
        const x   = tileX + dx;
        const y   = tileY + dy;
        const key = `${TILE_ZOOM}/${x}/${y}`;
        if (this._getResolved(key)) continue; // already loaded (also promotes in LRU)
        const url = this._urlFn(TILE_ZOOM, x, y);
        tasks.push(() => this._loadTile(url, key));
      }
    }

    await this._pooled(tasks, MAX_CONCURRENT_FETCHES);
    this._status = 'ready';
  }

  /**
   * Synchronous elevation lookup — safe to call in the render loop.
   * Returns 0 if the tile hasn't loaded yet.
   */
  sampleElevation(lat, lon) {
    const { x, y, tileX, tileY } = latLonToSlippy(lat, lon, TILE_ZOOM);
    const key = `${TILE_ZOOM}/${tileX}/${tileY}`;
    // Use _getResolved so frequent lookups promote hot tiles and keep them
    // from being evicted by background prefetch traffic.
    const id  = this._getResolved(key);

    if (!id) {
      console.warn('[ELEV] cache miss — key:', key, 'lat:', lat.toFixed(5), 'lon:', lon.toFixed(5), 'resolved size:', this._resolved.size);
      return 0;
    }

    if (!id) return 0;

    const px    = Math.min(255, Math.floor((x - tileX) * 256));
    const py    = Math.min(255, Math.floor((y - tileY) * 256));
    const idx   = (py * 256 + px) * 4;
    const elevM = this._decode(id.data[idx], id.data[idx+1], id.data[idx+2]);
    return Math.max(-50, Math.min(8850, elevM));
  }

  /**
   * Convert a real-world elevation (metres) to engine tile-height units.
   */
  toTileHeight(elevM) {
    return Math.min(80, Math.max(0, elevM / this._mPerTile));
  }

  /** sampleElevation + convert to tile-height units. */
  sampleTileHeight(lat, lon) {
    return this.toTileHeight(this.sampleElevation(lat, lon));
  }

  /** Clear both in-memory and persistent caches. */
  async clearCache() {
    this._resolved.clear();
    _inFlight.clear();
    await this._persistCache.clear();
    this._lastCenter = null;
    this._status = 'idle';
  }
}