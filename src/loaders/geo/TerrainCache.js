// TerrainCache.js – adapter for BlockTerrainCache
import { BlockTerrainCache } from '../loaders/geo/BlockTerrainCache.js';

export class TerrainCache {
  constructor(blockSize = 20, maxBlocks = 500) {
    this._blockCache = new BlockTerrainCache(blockSize, 2, maxBlocks);
    this.mPerTile = 2;
  }

  get(gx, gy) {
    return this._blockCache.get(gx, gy);
  }

  set(gx, gy, value) {
    this._blockCache.set(gx, gy, value);
  }

  // For backward compatibility with engine's merge()
    // TerrainCache.js – corrected merge()
    merge(terrainUpdates) {
    if (terrainUpdates instanceof BlockTerrainCache) {
        // Replace entirely – fastest and correct
        this._blockCache = terrainUpdates;
    } else if (terrainUpdates instanceof Map) {
        // Legacy fallback
        for (const [key, val] of terrainUpdates.entries()) {
        const [x, y] = key.split(',').map(Number);
        this._blockCache.set(x, y, val);
        }
    } else {
        console.warn('[TerrainCache] Unknown terrainUpdates type', terrainUpdates);
    }
    }

  getLocal(tx, ty, pGX, pGY, mapW, mapH) {
    const gx = tx - mapW/2 + pGX;
    const gy = ty - mapH/2 + pGY;
    return this.get(gx, gy) ?? 1; // default GRASS
  }

  clear() {
    this._blockCache.clear();
  }

  size() {
    return this._blockCache.size();
  }
}