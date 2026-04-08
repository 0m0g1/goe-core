// BlockTerrainCache.js
export class BlockTerrainCache {
  constructor(blockSize = 20, mPerTile = 2, maxBlocks = 500) {
    this.blockSize = blockSize;     // cells per side (e.g., 20 → 400 cells/block)
    this.mPerTile = mPerTile;       // meters per cell (default 2)
    this.maxBlocks = maxBlocks;     // limit total blocks in memory
    this.blocks = new Map();        // key "bx,by" → Uint8Array(blockSize*blockSize)
    this.blockAccessOrder = [];     // LRU tracking
  }

  _getBlockKey(bx, by) {
    return `${bx},${by}`;
  }

  _ensureBlock(bx, by) {
    const key = this._getBlockKey(bx, by);
    let block = this.blocks.get(key);
    if (!block) {
      // Evict if over limit
      while (this.blocks.size >= this.maxBlocks) {
        const oldest = this.blockAccessOrder.shift();
        this.blocks.delete(oldest);
      }
      block = new Uint8Array(this.blockSize * this.blockSize);
      // Fill with default terrain type (e.g., TerrainType.GRASS = 1)
      block.fill(1);
      this.blocks.set(key, block);
      this.blockAccessOrder.push(key);
    } else {
      // Update LRU order (move to end)
      const pos = this.blockAccessOrder.indexOf(key);
      if (pos !== -1) this.blockAccessOrder.splice(pos, 1);
      this.blockAccessOrder.push(key);
    }
    return block;
  }

  _getBlockAndIndex(gx, gy) {
    // Convert global integer cell coordinates to block + local index
    const bx = Math.floor(gx / this.blockSize);
    const by = Math.floor(gy / this.blockSize);
    const lx = gx - bx * this.blockSize;
    const ly = gy - by * this.blockSize;
    const idx = ly * this.blockSize + lx;
    return { bx, by, idx };
  }

  set(gx, gy, terrainType) {
    const { bx, by, idx } = this._getBlockAndIndex(gx, gy);
    const block = this._ensureBlock(bx, by);
    block[idx] = terrainType;
  }

    // BlockTerrainCache.js – inside get()
    get(gx, gy) {
    const { bx, by, idx } = this._getBlockAndIndex(gx, gy);
    const key = this._getBlockKey(bx, by);
    const block = this.blocks.get(key);
    // Return GRASS (1) as fallback instead of null
    return block ? block[idx] : 1;
    }

  has(gx, gy) {
    const { bx, by, idx } = this._getBlockAndIndex(gx, gy);
    const key = this._getBlockKey(bx, by);
    return this.blocks.has(key);
  }

  clear() {
    this.blocks.clear();
    this.blockAccessOrder = [];
  }

  // Returns approximate number of cells stored
  size() {
    return this.blocks.size * this.blockSize * this.blockSize;
  }

  // For serialization to persistent cache: convert all blocks to plain objects
  serialize() {
    const out = {};
    for (const [key, block] of this.blocks.entries()) {
      // Convert Uint8Array to regular array for JSON/IndexedDB
      out[key] = Array.from(block);
    }
    return out;
  }

  // Restore from serialized data (after loading from IndexedDB)
  deserialize(data) {
    this.clear();
    for (const [key, arr] of Object.entries(data)) {
      const block = new Uint8Array(arr);
      this.blocks.set(key, block);
      this.blockAccessOrder.push(key);
    }
  }
}