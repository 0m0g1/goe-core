export class PersistentCache {
  constructor(dbName = 'GOECore', storeName = 'terrain') {
    this.dbName    = dbName;
    this.storeName = storeName;
    this.db        = null;
    this._initPromise = this.init();
  }

  async init() {
    // guard against multiple concurrent init calls
    if (this._initPromise) return this._initPromise;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess  = (e) => { this.db = e.target.result; resolve(); };
      request.onerror    = (e) => reject(e.target.error);
    });
  }

  async _ready() {
    if (!this.db) await this._initPromise;
  }

  async get(key) {
    await this._ready();
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction(this.storeName, 'readonly');
      const req = tx.objectStore(this.storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async set(key, value) {
    await this._ready();
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction(this.storeName, 'readwrite');
      const req = tx.objectStore(this.storeName).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  async has(key)    { return (await this.get(key)) !== undefined; }

  async delete(key) {
    await this._ready();
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction(this.storeName, 'readwrite');
      const req = tx.objectStore(this.storeName).delete(key);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  async clear() {
    await this._ready();
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction(this.storeName, 'readwrite');
      const req = tx.objectStore(this.storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  /**
   * Evict IDB cache entries whose keys are geo coords ("lat,lon") further
   * than `radiusDeg` degrees from `playerLat/playerLon`.
   * 
   * Called from Engine after a successful fetch so stale distant regions
   * don't accumulate in IDB indefinitely.
   * 
   * @param {number} playerLat
   * @param {number} playerLon
   * @param {number} [radiusDeg=0.5]  ~55 km at equator, tune to taste
   */
  async evictDistant(playerLat, playerLon, radiusDeg = 0.5) {
    await this._ready();

    // 1. Collect all keys
    const keys = await new Promise((resolve, reject) => {
      const tx  = this.db.transaction(this.storeName, 'readonly');
      const req = tx.objectStore(this.storeName).getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });

    // 2. Filter to keys that look like "lat,lon" and are out of range
    const toDelete = keys.filter(key => {
      if (typeof key !== 'string') return false;
      const parts = key.split(',');
      if (parts.length !== 2) return false;
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);
      if (isNaN(lat) || isNaN(lon)) return false;
      const dist = Math.hypot(lat - playerLat, lon - playerLon);
      return dist > radiusDeg;
    });

    if (!toDelete.length) return;

    // 3. Delete in a single readwrite transaction
    await new Promise((resolve, reject) => {
      const tx    = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
      for (const key of toDelete) store.delete(key);
    });

    console.log(`[PersistentCache] Evicted ${toDelete.length} distant entries`);
  }
}