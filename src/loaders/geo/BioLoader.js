/**
 * GOE — BioLoader
 *
 * Fetches real-world species occurrence data from GBIF and maps it to
 * EntityDef objects the Engine can render — with no knowledge of entity types.
 *
 * Each record becomes either:
 *   • A blueprint entity (animal/fauna) — rendered via Blueprints[assetKey]
 *   • A tree blueprint entity           — rendered via Blueprints[treeKey]
 *
 * The asset key is resolved here, baked into the renderFn closure, so the
 * Engine and GenericEntity never need to know what a "bird" or "squirrel" is.
 */
import { BaseLoader } from '../BaseLoader.js';
import { PersistentCache } from '../../core/PersistentCache.js';
import { Blueprints } from '../../assets/BluePrintLibrary.js';
import { tileDepth } from '../../math/projection.js';

const TREE_TAXA = {
  families: [
    'fagaceae','pinaceae','betulaceae','aceraceae','oleaceae',
    'rosaceae','cupressaceae','myrtaceae','salicaceae','ulmaceae','juglandaceae',
  ],
  keywords: ['tree','oak','pine','beech','birch','fagus','quercus','picea'],
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── Blueprint asset resolver ─────────────────────────────────────────────────

function resolveFaunaAsset(tags) {
  const tax = `${tags.class ?? ''} ${tags.family ?? ''} ${tags.genus ?? ''} ${tags.species ?? ''}`.toLowerCase();
  if (tax.includes('ave')    || tax.includes('bird'))        return 'bird';
  if (tax.includes('canis')  || tax.includes('wolf'))        return 'wolf';
  if (tax.includes('sciuridae') || tax.includes('squirrel')) return 'squirrel';
  if (tax.includes('insect') || tax.includes('lepidoptera')) return 'insect';
  return 'bird'; // safe fallback — always present in BluePrintLibrary
}

const TREE_BLUEPRINT_KEY = {
  conifer:   'tree_pine',
  palm:      'tree_palm',
  deciduous: 'tree_oak',
};

function resolveTreeBlueprintKey(obs) {
  const name = `${obs.scientificName ?? ''} ${obs.vernacularName ?? ''}`.toLowerCase();
  if (name.includes('palm') || name.includes('phoenix')) return 'tree_palm';
  if (name.includes('pinus') || name.includes('picea') || name.includes('conifer')) return 'tree_pine';
  return 'tree_oak';
}

// ─── EntityDef factories ──────────────────────────────────────────────────────

/**
 * Build an EntityDef whose renderFn draws a blueprint.
 * The assetKey is captured in the closure — no string lookup at render time.
 */
function makeBlueprintEntityDef(id, lat, lon, assetKey, opts = {}) {
  // Validate asset exists; fall back to 'bird' for fauna, 'tree_oak' for flora
  const resolvedKey = Blueprints[assetKey] ? assetKey : (opts.fallback ?? 'bird');

  return {
    id,
    latitude:       lat,
    longitude:      lon,
    solid:          opts.solid          ?? false,
    bboxRadius:     opts.bboxRadius     ?? 0.3,
    footprintRadius: opts.footprintRadius ?? opts.bboxRadius ?? 0.3,
    physicsEnabled: opts.physicsEnabled ?? true,
    physicsRadius:  opts.physicsRadius  ?? 0.3,
    fixed:          opts.fixed          ?? false,   // fauna can be pushed
    renderHeavy:    true,
    _lodColor:      opts.lodColor ?? '#4CAF50',

    // Metadata for click/HUD (optional but useful)
    label:    opts.label,
    category: opts.category ?? 'nature',
    subType:  opts.subType,

    renderFn(wr, groundElevPx, extra, entity) {
      const blueprint = Blueprints[resolvedKey];
      if (!blueprint) return;
      if (wr.cam.tilt < 0.04) return;
      const isoA  = Math.min(1, (wr.cam.tilt - 0.04) / 0.12);
      const elev  = groundElevPx + entity.elevOffset;
      const depth = tileDepth(entity.tx, entity.ty, wr.cam.rotation, entity.footprintRadius ?? entity.bboxRadius ?? 0.3);
      wr.submitWorldObject(depth, () => {
  wr.ctx.globalAlpha = 1;
        wr.ctx.globalAlpha = isoA;
        wr.drawBlueprint(blueprint, entity.tx, entity.ty, elev);
        wr.ctx.globalAlpha = 1;
      });
    },
  };
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export class BioLoader extends BaseLoader {
  get id() { return 'bio-loader'; }

  constructor(options = {}) {
    super(options);
    this._cache = new PersistentCache('GOE_Bio', 'gbif');
  }

  async fetch(geoCenter) {
    const { lat, lon } = geoCenter;

    // ── Cache ──────────────────────────────────────────────────────────────────
    const cacheKey = `gbif:${lat.toFixed(2)},${lon.toFixed(2)}`;
    try {
      const hit = await this._cache.get(cacheKey);
      const age = Date.now() - (hit?.timestamp ?? 0);
      if (hit?.rawRecords && age < CACHE_TTL_MS) {
        console.log(`[BioLoader] Cache hit (${Math.round(age / 1000)}s old) — ${hit.rawRecords.length} records`);
        return { entities: this._buildEntityDefs(hit.rawRecords, geoCenter) };
      }
    } catch (_) { /* cache miss is fine */ }

    // ── Live fetch ─────────────────────────────────────────────────────────────
    const r = 0.005;
    const url = `https://api.gbif.org/v1/occurrence/search?decimalLatitude=${lat-r},${lat+r}&decimalLongitude=${lon-r},${lon+r}&limit=300`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`GBIF ${res.status}`);

      const data       = await res.json();
      const rawRecords = data.results ?? [];

      // Persist the raw records (serialisable, unlike EntityDefs with renderFn)
      try {
        await this._cache.set(cacheKey, { rawRecords, timestamp: Date.now() });
      } catch (_) { /* non-fatal */ }

      return { entities: this._buildEntityDefs(rawRecords, geoCenter) };

    } catch (e) {
      console.warn('[BioLoader] Using emergency offline fauna.', e.message);
      return { entities: this._emergencyFauna(geoCenter) };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Convert GBIF records → EntityDef array, then pad with procedural fauna.
   */
  _buildEntityDefs(records, geoCenter) {
    // FIX: filter out nulls from records that have no visual asset
    const defs = records
      .filter(obs => obs.decimalLatitude != null && obs.decimalLongitude != null)
      .map(obs => this._recordToEntityDef(obs))
      .filter(Boolean);  // ← drops records that returned null (no asset)

    const faunaCount = defs.filter(d => d.subType === 'animal').length;
    const TARGET     = 40;
    const padding    = [];

    if (faunaCount < TARGET) {
      const assetPool = defs
        .filter(d => d.subType === 'animal' && d._resolvedAsset)
        .map(d => d._resolvedAsset);

      if (!assetPool.length) assetPool.push('bird', 'squirrel');

      const needed = TARGET - faunaCount;
      for (let i = 0; i < needed; i++) {
        const assetKey = assetPool[Math.floor(Math.random() * assetPool.length)];
        padding.push(this._proceduralFaunaDef(geoCenter, assetKey));
      }
    }

    return [...defs, ...padding];
  }

  _recordToEntityDef(obs) {
    const tags = {
      class:   obs.class?.toLowerCase()   ?? '',
      family:  obs.family?.toLowerCase()  ?? '',
      genus:   obs.genus?.toLowerCase()   ?? '',
      species: obs.species?.toLowerCase() ?? '',
    };

    const isTree = TREE_TAXA.families.includes(tags.family) ||
                   TREE_TAXA.keywords.some(k =>
                     (`${obs.scientificName ?? ''} ${obs.vernacularName ?? ''}`).toLowerCase().includes(k)
                   );

    const isAnimal  = obs.kingdom === 'Animalia';
    const assetKey  = isAnimal
      ? resolveFaunaAsset(tags)
      : isTree
        ? resolveTreeBlueprintKey(obs)
        : null;

    // Skip records we have no visual for
    if (!assetKey) return null;

    const label = obs.vernacularName || obs.scientificName || 'Unknown species';

    const def = makeBlueprintEntityDef(
      `bio:${obs.key}`,
      obs.decimalLatitude,
      obs.decimalLongitude,
      assetKey,
      {
        label,
        category: 'nature',
        subType:  isAnimal ? 'animal' : 'plant',
        solid:    false,
        fixed:    isAnimal ? false : true,   // plants stay put, animals can be nudged
        bboxRadius:      isAnimal ? 0.25 : 0.5,
        footprintRadius: isAnimal ? 0.25 : 1.2,
        physicsRadius:   isAnimal ? 0.25 : 0.5,
        lodColor: isAnimal ? '#7CB342' : '#388E3C',
        fallback: isAnimal ? 'bird' : 'tree_oak',
      }
    );

    if (!def) return null;

    // Stash for pool-building in _buildEntityDefs
    def._resolvedAsset = assetKey;
    def.subType        = isAnimal ? 'animal' : 'plant';

    return def;
  }

  _proceduralFaunaDef(center, assetKey = 'bird') {
    const lat = center.lat + (Math.random() - 0.5) * 0.009;
    const lon = center.lon + (Math.random() - 0.5) * 0.009;

    const def = makeBlueprintEntityDef(
      `proc:${Math.random().toString(36).slice(2)}`,
      lat, lon,
      assetKey,
      {
        label:        `Ambient ${assetKey}`,
        category:     'nature',
        subType:      'animal',
        solid:        false,
        fixed:        false,
        bboxRadius:   0.25,
        physicsRadius: 0.25,
        lodColor:     '#7CB342',
        fallback:     'bird',
      }
    );

    def._resolvedAsset = assetKey;
    def.subType        = 'animal';
    return def;
  }

  _emergencyFauna(geoCenter) {
    const assets = ['bird', 'squirrel', 'bird', 'bird']; // weighted toward birds
    return Array.from({ length: 20 }, () => {
      const assetKey = assets[Math.floor(Math.random() * assets.length)];
      return this._proceduralFaunaDef(geoCenter, assetKey);
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  async clearCache() { await this._cache.clear(); }
}