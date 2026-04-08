/**
 * GOE Core — TerrainCache
 * A flat Map<"gx,gy", terrainTypeId> that stores the globally-positioned
 * terrain for every tile the loaders have fetched.
 *
 * Global coordinates use integer keys derived from lat/lon at the engine's
 * mPerTile resolution, so the cache is valid across chunk re-centres.
 */
import { lonToGlobalX, latToGlobalY } from '../math/geo.js';

export class TerrainCache {
  constructor() {
    /** @type {Map<string, number>} */
    this._data = new Map();
    /** @type {number} The metres-per-tile constant (set by Engine). */
    this.mPerTile = 2;
  }

  /** Store terrain at a global grid position. */
  set(gx, gy, terrainId) {
    this._data.set(`${gx},${gy}`, terrainId);
  }

  setByKey(key, terrainId) {
    this._data.set(key, terrainId);
  }

  /** Get terrain at a global grid position. Returns null if unknown. */
  get(gx, gy) {
    return this._data.get(`${gx},${gy}`) ?? null;
  }

  getByKey(key) {
    return this._data.get(key) ?? null;
  }

  /** Merge in a Map<key, terrainId> from a loader. */
  merge(map) {
    map.forEach((v, k) => this._data.set(k, v));
  }

  /** Convert a lat/lon to a global key using a reference latitude. */
  toKey(lat, lon, refLat) {
    return `${lonToGlobalX(lon, refLat, this.mPerTile)},${latToGlobalY(lat, this.mPerTile)}`;
  }

  /**
   * Resolve the terrain type for a LOCAL tile coordinate.
   * @param {number} tx       Local tile X
   * @param {number} ty       Local tile Y
   * @param {number} pGlobalX Player's current global X (from center)
   * @param {number} pGlobalY Player's current global Y
   * @param {number} mapW
   * @param {number} mapH
   * @param {number} defaultTerrain
   */
  
  getLocal(tx, ty, pGlobalX, pGlobalY, mapW, mapH, defaultTerrain = 5) {
    const gx = Math.round(tx) - Math.floor(mapW / 2) + pGlobalX;
    const gy = Math.round(ty) - Math.floor(mapH / 2) + pGlobalY;
    return this._data.get(`${gx},${gy}`) ?? defaultTerrain;
  }

  size() { return this._data.size; }
  clear() { this._data.clear(); }
}