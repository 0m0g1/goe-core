/**
 * GOE Core — TerrainCache
 *
 * Changes:
 *   - Integer keys instead of string keys (faster lookup, no string allocation)
 *   - evictDistant(pGX, pGY, keepRadius) — removes tiles outside a tile
 *     radius of the current map centre instead of blindly deleting oldest keys
 *   - _data property retained (same name, Engine.js eviction probe now works)
 */
import { lonToGlobalX, latToGlobalY } from '../math/geo.js';

// Max safe coordinate range: ±1,048,576 tiles (~2000km at 2m/tile).
// Fits comfortably in a 53-bit float integer.
const COORD_OFFSET = 1_100_000;
const COORD_STRIDE = 2_200_001;

function _key(gx, gy) {
  return (gy + COORD_OFFSET) * COORD_STRIDE + (gx + COORD_OFFSET);
}

// Reverse a key back to {gx, gy} — only needed for eviction
function _unkey(key) {
  const gy = Math.floor(key / COORD_STRIDE) - COORD_OFFSET;
  const gx = (key % COORD_STRIDE) - COORD_OFFSET;
  return { gx, gy };
}

export class TerrainCache {
  constructor() {
    this._data = new Map();
    this.mPerTile = 2;
    this._originLat = 0;
    this._originLon = 0;
  }

  setOrigin(lat, lon) {
    this._originLat = lat;
    this._originLon = lon;
  }

  set(gx, gy, terrainId) {
    this._data.set(_key(gx, gy), terrainId);
  }

  get(gx, gy) {
    return this._data.get(_key(gx, gy)) ?? null;
  }

  keyFromLatLon(lat, lon) {
    const gx = Math.round(lonToGlobalX(lon, lat, this.mPerTile));
    const gy = Math.round(latToGlobalY(lat, this.mPerTile));
    return _key(gx, gy);
  }

  getLocal(tx, ty, pGX, pGY, mapW, mapH) {
    const gx = Math.round(tx - mapW / 2 + pGX);
    const gy = Math.round(ty - mapH / 2 + pGY);
    return this._data.get(_key(gx, gy)) ?? null;
  }

  merge(map) {
    // map comes from OSMTerrainLoader as a Map<"gx,gy", terrainId> string-keyed.
    // Re-encode to integer keys on ingestion so the cache stays consistent.
    for (const [k, v] of map) {
      if (typeof k === 'number') {
        // Already an integer key (future-proof if loader is updated)
        this._data.set(k, v);
      } else {
        // String key "gx,gy" — parse and re-encode
        const comma = k.indexOf(',');
        const gx = parseInt(k, 10);
        const gy = parseInt(k.slice(comma + 1), 10);
        this._data.set(_key(gx, gy), v);
      }
    }
  }

  /**
   * Remove all tiles outside `keepRadius` tiles of the given global centre.
   * Called from Engine._ingestLoaderResult() after merge, replacing the
   * FIFO eviction that was deleting the wrong (oldest-inserted) entries.
   *
   * @param {number} pGX       current global origin X
   * @param {number} pGY       current global origin Y
   * @param {number} keepRadius  tile radius to keep (e.g. 600 tiles = 1.2km at 2m/tile)
   */
  evictDistant(pGX, pGY, keepRadius = 600) {
    if (this._data.size <= 200_000) return; // under limit, nothing to do

    const r2 = keepRadius * keepRadius;
    for (const key of this._data.keys()) {
      const { gx, gy } = _unkey(key);
      const dx = gx - pGX;
      const dy = gy - pGY;
      if (dx * dx + dy * dy > r2) {
        this._data.delete(key);
      }
    }
  }

  clear()  { this._data.clear(); }
  size()   { return this._data.size; }

  debugKeys(n = 10) {
    let i = 0;
    for (const [k, v] of this._data) {
      if (i++ >= n) break;
      const { gx, gy } = _unkey(k);
      console.log(`[${gx},${gy}] = ${v}`);
    }
  }
}