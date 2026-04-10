import { BaseLoader } from '../BaseLoader.js';
import { PersistentCache } from '../../core/PersistentCache.js';

const TREE_TAXA = {
  families: [
    'fagaceae', 'pinaceae', 'betulaceae', 'aceraceae', 'oleaceae',
    'rosaceae', 'cupressaceae', 'myrtaceae', 'salicaceae', 'ulmaceae', 'juglandaceae'
  ],
  keywords: ['tree', 'oak', 'pine', 'beech', 'birch', 'fagus', 'quercus', 'picea']
};

// Cache TTL — GBIF occurrence data doesn't change frequently.
// One hour per ~1.1km grid cell keeps request counts very low.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class BioLoader extends BaseLoader {
  get id() { return 'bio-loader'; }

  constructor(options = {}) {
    super(options);
    this._cache = new PersistentCache('GOE_Bio', 'gbif');
  }

  async fetch(geoCenter) {
    const { lat, lon } = geoCenter;

    // ── Cache check ─────────────────────────────────────────────────────────
    // toFixed(2) = ~1.1 km grid, same granularity as OSMTerrainLoader so both
    // loaders invalidate together when the player crosses into a new cell.
    const cacheKey = `gbif:${lat.toFixed(2)},${lon.toFixed(2)}`;
    try {
      const hit = await this._cache.get(cacheKey);
      const age = Date.now() - (hit?.timestamp ?? 0);
      if (hit?.features && age < CACHE_TTL_MS) {
        console.log(`[BioLoader] Cache hit (${Math.round(age / 1000)}s old) — ${hit.features.length} features`);
        return { features: hit.features };
      }
    } catch (_) { /* cache miss is fine */ }

    // ── Live fetch ───────────────────────────────────────────────────────────
    const r = 0.005;
    const url = `https://api.gbif.org/v1/occurrence/search?decimalLatitude=${lat-r},${lat+r}&decimalLongitude=${lon-r},${lon+r}&limit=300`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`GBIF Down: ${res.status}`);

      const data    = await res.json();
      const results = data.results || [];
      const realFeatures = results.map(obs => this._mapRecord(obs));

      const localFauna   = realFeatures.filter(f => f.data.subType === 'animal');
      const TARGET_COUNT = 40;
      const proceduralFeatures = [];

      if (localFauna.length < TARGET_COUNT) {
        const needed = TARGET_COUNT - localFauna.length;
        const seeds  = localFauna.length > 0 ? localFauna : [{ asset: 'bird' }, { asset: 'squirrel' }];
        for (let i = 0; i < needed; i++) {
          const seed      = seeds[Math.floor(Math.random() * seeds.length)];
          const assetName = seed.asset || seed.data?.asset || 'bird';
          proceduralFeatures.push(this._spawnAmbient(geoCenter, assetName));
        }
      }

      const features = [...realFeatures, ...proceduralFeatures];

      // ── Persist ───────────────────────────────────────────────────────────
      try {
        await this._cache.set(cacheKey, { features, timestamp: Date.now() });
      } catch (_) { /* non-fatal */ }

      return { features };

    } catch (e) {
      console.warn('[BioLoader] Using emergency offline fauna.', e.message);
      return {
        features: Array.from({ length: 20 }, () =>
          this._spawnAmbient(geoCenter, Math.random() > 0.5 ? 'bird' : 'squirrel')
        )
      };
    }
  }

  _resolveFaunaAsset(tags) {
    const taxonomy = `${tags.class} ${tags.family} ${tags.genus} ${tags.species}`.toLowerCase();

    if (taxonomy.includes('ave') || taxonomy.includes('bird')) return 'bird';
    if (taxonomy.includes('canis') || taxonomy.includes('wolf')) return 'wolf';
    if (taxonomy.includes('sciuridae') || taxonomy.includes('squirrel')) return 'squirrel';
    if (taxonomy.includes('insect') || taxonomy.includes('lepidoptera')) return 'insect';

    return 'bird'; // Fallback
  }

  _mapRecord(obs) {
    const tags = {
      kingdom: obs.kingdom?.toLowerCase(),
      class:   obs.class?.toLowerCase(),
      family:  obs.family?.toLowerCase(),
      genus:   obs.genus?.toLowerCase(),
      species: obs.species?.toLowerCase(),
      natural: obs.class?.toLowerCase() || obs.kingdom?.toLowerCase() || 'nature'
    };

    const isTree = TREE_TAXA.families.includes(tags.family) ||
                   TREE_TAXA.keywords.some(k =>
                     (obs.scientificName + (obs.vernacularName || '')).toLowerCase().includes(k)
                   );

    // Resolve the asset right here at the source
    const isAnimal = obs.kingdom === 'Animalia';
    const assetKey = isAnimal ? this._resolveFaunaAsset(tags) : null;

    return {
      id:        `bio:${obs.key}`,
      latitude:  obs.decimalLatitude,
      longitude: obs.decimalLongitude,
      label:     obs.vernacularName || obs.scientificName,
      title:     obs.scientificName,
      asset:     assetKey, // Pass the clean asset key to the engine
      data: {
        category:    'nature',
        isTree,
        tags,
        subType:     isAnimal ? 'animal' : 'plant',
        isProcedural: false
      },
      renderMode: 'blueprint'
    };
  }
  
  _spawnAmbient(center, preferredAsset = 'bird') {
    const latOffset = (Math.random() - 0.5) * 0.009;
    const lonOffset = (Math.random() - 0.5) * 0.009;
    const jitterX   = (Math.random() - 0.5) * 0.0001;
    const jitterY   = (Math.random() - 0.5) * 0.0001;

    return {
      id:        `proc:${Math.random()}`,
      latitude:  center.lat + latOffset + jitterX,
      longitude: center.lon + lonOffset + jitterY,
      label:     `Ambient ${preferredAsset}`,
      data: {
        category:    'nature',
        subType:     'animal',
        isProcedural: true
      },
      asset:      preferredAsset,
      renderMode: 'blueprint'
    };
  }

  async clearCache() { await this._cache.clear(); }
}