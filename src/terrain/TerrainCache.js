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
    this._data.set(`${gx},${gy}`, terrainId);
  }

  get(gx, gy) {
    return this._data.get(`${gx},${gy}`) ?? null;
  }

  keyFromLatLon(lat, lon) {
      const gx = Math.round(lonToGlobalX(lon, lat, this.mPerTile));
      const gy = Math.round(latToGlobalY(lat, this.mPerTile));
      return `${gx},${gy}`;
  }

  /**
   * Convert local tile coords (0..mapW, 0..mapH) to global key space.
   * Tile (mapW/2, mapH/2) == global (pGX, pGY).
   */
  getLocal(tx, ty, pGX, pGY, mapW, mapH) {
    const gx = Math.round(tx - mapW / 2 + pGX);
    const gy = Math.round(ty - mapH / 2 + pGY);
    return this._data.get(`${gx},${gy}`) ?? null;
  }

  /**
   * Debug helper — logs the first N keys in the cache so you can verify
   * the coordinate space your loaders are writing into.
   */
  debugKeys(n = 10) {
    const keys = [...this._data.keys()].slice(0, n);
  }

  merge(map) { map.forEach((v, k) => this._data.set(k, v)); }
  clear()    { this._data.clear(); }
  size()     { return this._data.size; }

  shift(dx, dy) {
    const moved = new Map();
    for (const [key, val] of this._data) {
      const [x, y] = key.split(',').map(Number);
      moved.set(`${x + dx},${y + dy}`, val);
    }
    this._data = moved;
  }
}