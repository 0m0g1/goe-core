/**
 * OSMTerrainTileLoader — terrain/floor tiles only
 *
 * Stripped from OSMTerrainLoader. Produces only a terrainUpdates Map
 * (tile key → TerrainType) by rasterizing OSM polygon and line features.
 *
 * Removed entirely:
 *   - All entity/renderFn machinery (buildings, roads, POIs, landmarks, trees)
 *   - Ring projection cache (MAP-PERF 1)
 *   - Label/render candidate pre-filtering (MAP-PERF 2)
 *   - Highlight animation loop (MAP-PERF 3)
 *   - Road batch ctx-state optimization (MAP-PERF 4)
 *   - Elevation grid (open-elevation API)
 *   - Blueprint / ProceduralBlueprintGenerator
 *   - Entity serialization / IDB cache rebuild
 *   - Streaming partial-result callbacks
 *   - Live entity cache
 *
 * Kept:
 *   - Overpass fetch with endpoint rotation + backoff
 *   - PersistentCache (IDB) for terrain tile maps
 *   - classifyOSM() → TerrainType
 *   - rasterizePolygon() / rasterizeLine()
 *   - Debounced fetch entry point
 */

import { BaseLoader }     from '../BaseLoader.js';
import { TerrainType }    from '../../terrain/types.js';
import { lonToGlobalX, latToGlobalY } from '../../math/geo.js';
import { PersistentCache } from '../../core/PersistentCache.js';

// ─── Overpass endpoints ────────────────────────────────────────────────────────
const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const CACHE_TTL_MS = 30 * 60 * 1000;

// ─── Terrain classification ────────────────────────────────────────────────────
function classifyOSM(tags) {
  if (!tags) return null;
  const { highway: h, surface: s, waterway: w, natural: n, landuse: l, leisure: le, building: b } = tags;

  if (n === 'water' || n === 'wetland' || l === 'reservoir' || l === 'basin' || w === 'riverbank')
    return { terrain: TerrainType.DEEP_WATER, type: 'polygon' };
  if (n === 'strait')
    return (tags.area === 'yes')
      ? { terrain: TerrainType.DEEP_WATER, type: 'polygon' }
      : { terrain: TerrainType.DEEP_WATER, type: 'line', width: 6 };
  if (w === 'river')                   return { terrain: TerrainType.WATER,    type: 'line', width: 3 };
  if (w === 'stream' || w === 'canal') return { terrain: TerrainType.WATER,    type: 'line', width: 2 };
  if (w)                               return { terrain: TerrainType.WATER,    type: 'line', width: 1 };
  if (n === 'beach')                   return { terrain: TerrainType.SAND,     type: 'polygon' };
  if (n === 'wood' || l === 'forest')  return { terrain: TerrainType.FOREST,   type: 'polygon' };
  if (le === 'park' || le === 'garden' || l === 'park')
    return { terrain: TerrainType.PARK, type: 'polygon' };
  if (['grass','meadow','village_green','allotments'].includes(l) ||
      ['grassland','heath','scrub'].includes(n) ||
      ['pitch','playground'].includes(le))
    return { terrain: TerrainType.GRASS, type: 'polygon' };

  if (h) {
    const unpaved = ['dirt','earth','ground','unpaved','mud','gravel','sand'];
    const paved   = ['asphalt','paved','concrete','chipseal','paving_stones'];
    let roadTerrain = TerrainType.ROAD_TARMAC;
    if (unpaved.includes(s) || ['track','path','bridleway'].includes(h)) roadTerrain = TerrainType.ROAD_DIRT;
    else if (paved.includes(s)) roadTerrain = TerrainType.ROAD_TARMAC;

    if (h === 'motorway' || h === 'trunk' || h === 'primary')  return { terrain: roadTerrain, type: 'line', width: 3 };
    if (h === 'secondary' || h === 'tertiary')                  return { terrain: roadTerrain, type: 'line', width: 2 };
    if (['footway','path','cycleway','pedestrian'].includes(h)) return { terrain: TerrainType.PATH, type: 'line', width: 1 };
    return { terrain: roadTerrain, type: 'line', width: 1 };
  }
  if (b) return { terrain: TerrainType.BUILDING, type: 'polygon' };
  if (['residential','commercial','retail','industrial'].includes(l))
    return { terrain: TerrainType.RESIDENTIAL, type: 'polygon' };
  return null;
}

// ─── Rasterisation ────────────────────────────────────────────────────────────
function rasterizePolygon(cache, pts, terrain) {
  if (pts.length < 3) return;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const p1 = pts[i], p2 = pts[j];
      if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y))
        xs.push(p1.x + (y - p1.y) / (p2.y - p1.y) * (p2.x - p1.x));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i += 2)
      for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++)
        cache.set(`${Math.round(x)},${Math.round(y)}`, terrain);
  }
}

function rasterizeLine(cache, pts, terrain, width) {
  const w2 = width * width;
  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = pts[i].x, y0 = pts[i].y, x1 = pts[i+1].x, y1 = pts[i+1].y;
    const steps = Math.ceil(Math.hypot(x1-x0, y1-y0) * 2) + 1;
    for (let s = 0; s <= steps; s++) {
      const t  = s / steps;
      const cx = x0 + (x1-x0)*t, cy = y0 + (y1-y0)*t;
      for (let dx = -width; dx <= width; dx++) {
        for (let dy = -width; dy <= width; dy++) {
          if (dx*dx + dy*dy <= w2)
            cache.set(`${Math.round(cx + dx)},${Math.round(cy + dy)}`, terrain);
        }
      }
    }
  }
}

// ─── Loader ───────────────────────────────────────────────────────────────────
export class OSMTerrainTileLoader extends BaseLoader {
  get id() { return 'osm-terrain-tiles'; }

  constructor(options = {}) {
    super(options);
    this._endpoints       = options.endpoint
      ? [options.endpoint]
      : (options.endpoints ?? DEFAULT_ENDPOINTS);
    this._endpointIdx     = 0;
    this._mPerTile        = options.mPerTile     ?? 2;
    this._fetchRadiusM    = options.fetchRadiusM ?? 900;
    this._backoffUntil    = 0;
    this._fetchDebounceMs = options.fetchDebounceMs ?? 800;
    this._debounceTimer   = null;
    this._pendingResolve  = null;
    this._cache           = new PersistentCache('GOE_Overpass_Tiles', 'osm_tiles');
    this._onPartialResult = null;
  }

  get _endpoint() { return this._endpoints[this._endpointIdx % this._endpoints.length]; }
  _nextEndpoint()  { this._endpointIdx = (this._endpointIdx + 1) % this._endpoints.length; }

  _getCacheKey({ lat, lon }) {
    return `${lat.toFixed(2)},${lon.toFixed(2)}`;
  }

  setPartialResultCallback(cb) {
    this._onPartialResult = cb;
  }

  _notifyPartialResult(partial) {
    if (this._onPartialResult) {
      this._onPartialResult(partial);
    }
  }

  // ── Debounced fetch entry point ────────────────────────────────────────────
  async fetch(geoCenter) {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._pendingResolve?.({});
    }
    return new Promise(resolve => {
      this._pendingResolve = resolve;
      this._debounceTimer  = setTimeout(async () => {
        this._debounceTimer  = null;
        this._pendingResolve = null;
        const result = await this._doFetch(geoCenter);
        resolve(result);
      }, this._fetchDebounceMs);
    });
  }

  // In _doFetch — move terrainUpdates declaration outside the loop
  async _doFetch(geoCenter) {
    if (Date.now() < this._backoffUntil) {
      console.warn(`[OSMTerrainTileLoader] Backoff ...`);
      return {};
    }

    const { lat, lon } = geoCenter;
    const cacheKey = this._getCacheKey(geoCenter);

    // IDB cache check
    try {
      const cached = await this._cache.get(cacheKey);
      const age    = Date.now() - (cached?.timestamp ?? 0);
      if (cached?.terrainUpdates && age < CACHE_TTL_MS) {
        console.log('[OSMTerrainTileLoader] IDB cache hit');
        
        // 1. Rebuild the map
        const terrainUpdates = new Map(Object.entries(cached.terrainUpdates));
        
        // 2. PUSH IT TO THE ENGINE
        this._notifyPartialResult({ terrainUpdates }); 
        
        return { terrainUpdates };
      }
    } catch (err) {
      console.warn('[OSMTerrainTileLoader] Cache read error', err);
    }

    const r      = this._fetchRadiusM;
    const around = `(around:${r},${lat},${lon})`;
    const q = `[out:json][timeout:60];(
      way["natural"~"^(water|wetland|beach|wood|grassland|heath|scrub|sand|bare_rock|meadow|strait)$"]${around};
      way["landuse"~"^(reservoir|basin|grass|meadow|village_green|allotments|forest|park|commercial|residential|retail|industrial|cemetery|construction|farmland)$"]${around};
      way["leisure"~"^(park|garden|pitch|playground|swimming_pool|nature_reserve)$"]${around};
      way["waterway"~"^(river|stream|canal|drain|ditch|riverbank)$"]${around};
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|pedestrian|living_street|footway|cycleway|path|track|steps|bridleway)$"]${around};
      way["building"]${around};
    );out geom qt;`;

    // ✅ FIX 1: declare outside loop so fallback can reference it
    let terrainUpdates = new Map();

    for (let attempt = 0; attempt < this._endpoints.length; attempt++) {
      const ctrl    = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 14000);

    try {
        const res = await fetch(
          `${this._endpoint}?data=${encodeURIComponent(q)}`,
          { signal: ctrl.signal }
        );
        clearTimeout(timeout);
        if (res.status === 429) { this._nextEndpoint(); continue; }
        if (!res.ok)             { this._nextEndpoint(); continue; }

        const data = await res.json();
        terrainUpdates = this._processElements(data.elements ?? [], geoCenter);

        try {
          await this._cache.set(cacheKey, {
            terrainUpdates: Object.fromEntries(terrainUpdates),
            timestamp:      Date.now(),
          });
        } catch (cacheErr) {
          console.warn('[OSMTerrainTileLoader] Cache write error', cacheErr);
        }

        // PUSH IT TO THE ENGINE BEFORE RETURNING
        this._notifyPartialResult({ terrainUpdates });

        return { terrainUpdates };

      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') { this._nextEndpoint(); continue; }
        this._nextEndpoint();
      }
    }

    this._backoffUntil = Date.now() + 8000;
    // ✅ FIX 1: terrainUpdates is now in scope here (empty Map if all failed)
    this._notifyPartialResult({ terrainUpdates });
    return { terrainUpdates };
  }

  // ── Rasterize OSM elements into terrain tile map ───────────────────────────
  _processElements(elements, geoCenter) {
    const { lat, lon } = geoCenter;
    const mPerTile     = this._mPerTile;
    const terrainUpdates = new Map();

    const toTile = (eLat, eLon) => ({
      // ✅ FIX 2: round to integers so keys match terrainCache.get(tx, ty)
      x: Math.round(lonToGlobalX(eLon, lat, mPerTile)),
      y: Math.round(latToGlobalY(eLat, mPerTile)),
    });

    for (const el of elements) {
      if (el.type !== 'way' || !el.geometry?.length) continue;

      const cls = classifyOSM(el.tags);
      if (!cls) continue;

      const pts = el.geometry.map(g => toTile(g.lat, g.lon));

      if (cls.type === 'polygon') rasterizePolygon(terrainUpdates, pts, cls.terrain);
      else                        rasterizeLine(terrainUpdates, pts, cls.terrain, cls.width ?? 1);
    }

    console.log(`[OSMTerrainTileLoader] → ${terrainUpdates.size} terrain tiles`);
    return terrainUpdates;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  destroy() {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
      this._pendingResolve?.({});
      this._pendingResolve = null;
    }
  }

  async clearCache() {
    await this._cache.clear();
  }
}