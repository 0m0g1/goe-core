import { BaseLoader } from '../BaseLoader.js';
import { TerrainType } from '../../terrain/types.js';
import { lonToGlobalX, latToGlobalY } from '../../math/geo.js';
import { PersistentCache } from '../../core/PersistentCache.js';

const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// Cache TTL — results older than this are considered stale and re-fetched
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function classifyOSM(tags) {
  if (!tags) return null;
  const { highway:h, surface:s, waterway:w, natural:n, landuse:l, leisure:le, building:b } = tags;
  if (n==='water'||n==='wetland'||l==='reservoir'||l==='basin'||w==='riverbank')
    return { terrain: TerrainType.DEEP_WATER, type:'polygon' };
  if (w==='river')
    return { terrain: TerrainType.WATER, type:'line', width:3 };
  if (w==='stream'||w==='canal')
    return { terrain: TerrainType.WATER, type:'line', width:2 };
  if (w)
    return { terrain: TerrainType.WATER, type:'line', width:1 };
  if (n==='beach')
    return { terrain: TerrainType.SAND, type:'polygon' };
  if (n==='wood'||l==='forest')
    return { terrain: TerrainType.FOREST, type:'polygon' };
  if (le==='park'||le==='garden'||l==='park')
    return { terrain: TerrainType.PARK, type:'polygon' };
  if (['grass','meadow','village_green','allotments'].includes(l) ||
      ['grassland','heath','scrub'].includes(n) ||
      ['pitch','playground'].includes(le))
    return { terrain: TerrainType.GRASS, type:'polygon' };
  if (h) {
    const pavedSurfaces = ['asphalt', 'paved', 'concrete', 'chipseal', 'paving_stones'];
    const unpavedSurfaces = ['dirt', 'earth', 'ground', 'unpaved', 'mud', 'gravel', 'sand'];

    let roadTerrain = TerrainType.ROAD_TARMAC;
    if (unpavedSurfaces.includes(s)) {
      roadTerrain = TerrainType.ROAD_DIRT;
    } else if (pavedSurfaces.includes(s)) {
      roadTerrain = TerrainType.ROAD_TARMAC;
    } else {
      if (['track', 'path', 'bridleway'].includes(h)) roadTerrain = TerrainType.ROAD_DIRT;
    }

    if (h==='motorway'||h==='trunk'||h==='primary')
      return { terrain: roadTerrain, type:'line', width:3 };
    if (h==='secondary'||h==='tertiary')
      return { terrain: roadTerrain, type:'line', width:2 };
    if (h==='footway'||h==='path'||h==='cycleway'||h==='pedestrian')
      return { terrain: TerrainType.PATH, type:'line', width:1 };
    return { terrain: roadTerrain, type:'line', width:1 };
  }
  if (b)
    return { terrain: TerrainType.BUILDING, type:'polygon' };
  if (['residential','commercial','retail','industrial'].includes(l))
    return { terrain: TerrainType.RESIDENTIAL, type:'polygon' };
  return null;
}

const POI_COLORS = {
  amenity: {
    restaurant:'#ef4444', cafe:'#ef4444', pub:'#ef4444', bar:'#ef4444',
    fast_food:'#ef4444', food_court:'#ef4444',
    school:'#f59e0b', university:'#f59e0b', library:'#f59e0b', college:'#f59e0b',
    hospital:'#dc2626', clinic:'#dc2626', pharmacy:'#dc2626', doctors:'#dc2626',
    theatre:'#a78bfa', cinema:'#a78bfa', arts_centre:'#a78bfa',
    place_of_worship:'#f97316',
    park:'#22c55e', playground:'#22c55e',
    bank:'#eab308', atm:'#eab308',
    fuel:'#6b7280', parking:'#6b7280',
    police:'#3b82f6', fire_station:'#3b82f6', post_office:'#3b82f6',
    default:'#60a5fa',
  },
  shop: {
    supermarket:'#eab308', convenience:'#eab308', bakery:'#eab308',
    butcher:'#eab308', greengrocer:'#eab308', clothes:'#eab308',
    electronics:'#eab308', department_store:'#eab308', mall:'#eab308',
    default:'#eab308',
  },
  tourism: {
    museum:'#a78bfa', gallery:'#a78bfa', attraction:'#a78bfa',
    viewpoint:'#a78bfa', artwork:'#a78bfa',
    hotel:'#f59e0b', hostel:'#f59e0b', motel:'#f59e0b', guest_house:'#f59e0b',
    information:'#60a5fa', camp_site:'#22c55e',
    default:'#a78bfa',
  },
  historic: {
    castle:'#f97316', monument:'#f97316', memorial:'#f97316',
    ruins:'#f97316', archaeological_site:'#f97316', building:'#f97316',
    default:'#f97316',
  },
  leisure: {
    park:'#22c55e', garden:'#22c55e', pitch:'#22c55e',
    sports_centre:'#22c55e', swimming_pool:'#22c55e', fitness_centre:'#22c55e',
    default:'#22c55e',
  },
  office: {
    default:'#60a5fa',
  },
  natural: {
    peak:'#10b981', spring:'#06b6d4', cave_entrance:'#6b7280',
    default:'#10b981',
  },
};

function classifyPOI(tags) {
  if (!tags) return null;

  if (tags.natural === 'tree') {
    return {
      color: '#2a8a2a',
      label: 'Tree',
      category: 'natural',
      value: 'tree',
      renderMode: 'tree'
    };
  }

  const cats = ['amenity','shop','tourism','historic','leisure','office','natural'];
  for (const cat of cats) {
    const val = tags[cat];
    if (!val) continue;
    const map = POI_COLORS[cat];
    const color = map?.[val] ?? map?.default ?? '#60a5fa';
    const name = tags.name
      ? tags.name
      : val.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
    const label = cat === 'historic' ? `Historic: ${name}` : name;
    return { color, label, category: cat, value: val };
  }
  return null;
}

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
        cache.set((x << 16) | (y & 0xFFFF), terrain);
  }
}

function rasterizeLine(cache, pts, terrain, width) {
  const w2 = width * width;
  for (let i = 0; i < pts.length - 1; i++) {
    const x0=pts[i].x, y0=pts[i].y, x1=pts[i+1].x, y1=pts[i+1].y;
    const steps = Math.ceil(Math.hypot(x1-x0, y1-y0) * 2) + 1;
    for (let s = 0; s <= steps; s++) {
      const t  = s / steps;
      const cx = x0 + (x1-x0)*t, cy = y0 + (y1-y0)*t;
      for (let dx = -width; dx <= width; dx++)
        for (let dy = -width; dy <= width; dy++)
          if (dx*dx + dy*dy <= w2)
            cache.set(`${Math.round(cx+dx)},${Math.round(cy+dy)}`, terrain);
    }
  }
}

export class OSMTerrainLoader extends BaseLoader {
  get id() { return 'osm-terrain'; }

  constructor(options = {}) {
    super(options);
    this._endpoints    = options.endpoint
      ? [options.endpoint]
      : (options.endpoints || DEFAULT_ENDPOINTS);
    this._endpointIdx  = 0;
    this._mPerTile     = options.mPerTile     || 2;
    this._mapW         = options.mapW         || 80;
    this._mapH         = options.mapH         || 80;
    this._fetchRadiusM = options.fetchRadiusM ?? 900;
    this._backoffUntil = 0;
    this._abort        = null;
    this._cache        = new PersistentCache('GOE_Overpass', 'osm_terrain');

    // Debounce: wait this many ms of silence before actually firing the request.
    // Prevents hammering Overpass while the player walks continuously.
    this._fetchDebounceMs = options.fetchDebounceMs ?? 800;
    this._debounceTimer   = null;
    this._pendingResolve  = null;
  }

  get _endpoint() { return this._endpoints[this._endpointIdx % this._endpoints.length]; }
  _nextEndpoint()  { this._endpointIdx = (this._endpointIdx + 1) % this._endpoints.length; }

  _getCacheKey({ lat, lon }) {
    // ~1.1 km precision grid — the player must move over a km before a new
    // Overpass request fires. toFixed(3) was ~110 m which caused far too many
    // cache misses during normal walking.
    return `overpass:${lat.toFixed(2)},${lon.toFixed(2)},r${this._fetchRadiusM}`;
  }

  /**
   * Public fetch — debounced. Returns a promise that resolves once the
   * debounce period has elapsed and the real request completes.
   */
  fetch(geoCenter) {
    // Cancel any pending debounce resolve so the old caller gets the same
    // result as the new one (avoids dangling promises blocking the engine).
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
      // Resolve the previous pending promise with empty so it doesn't stall
      if (this._pendingResolve) {
        this._pendingResolve({});
        this._pendingResolve = null;
      }
    }

    return new Promise((resolve) => {
      this._pendingResolve = resolve;
      this._debounceTimer  = setTimeout(async () => {
        this._debounceTimer  = null;
        this._pendingResolve = null;
        const result = await this._doFetch(geoCenter);
        resolve(result);
      }, this._fetchDebounceMs);
    });
  }

  /** The real fetch implementation — unchanged logic, now private. */
  async _doFetch(geoCenter) {
    if (this._abort) this._abort.abort();
    this._abort = new AbortController();

    if (Date.now() < this._backoffUntil) {
      console.warn(`[OSMTerrainLoader] Backoff ${Math.ceil((this._backoffUntil - Date.now()) / 1000)}s`);
      return {};
    }

    // ── Persistent cache hit ───────────────────────────────────────────────
    const cacheKey = this._getCacheKey(geoCenter);
    try {
      const cached = await this._cache.get(cacheKey);
      const age    = Date.now() - (cached?.timestamp ?? 0);
      if (cached?.terrainUpdates && age < CACHE_TTL_MS) {
        console.log(`[OSMTerrainLoader] Cache hit (${Math.round(age / 1000)}s old) — ${Object.keys(cached.terrainUpdates).length} terrain, ${cached.features?.length ?? 0} POIs`);
        return {
          terrainUpdates: new Map(Object.entries(cached.terrainUpdates)),
          buildingWays:   cached.buildingWays ?? [],
          features:       cached.features     ?? [],
        };
      }
    } catch (err) { console.warn('[OSMTerrainLoader] Cache read error', err); }

    // ── Build Overpass query ───────────────────────────────────────────────
    const { lat, lon } = geoCenter;
    const r = this._fetchRadiusM;
    const around = `(around:${r},${lat},${lon})`;

    const q = `[out:json][timeout:60];(
      way["natural"~"^(water|wetland|beach|wood|grassland|heath|scrub)$"]${around};
      way["landuse"~"^(reservoir|basin|grass|meadow|village_green|allotments|forest|park|commercial|residential|retail|industrial)$"]${around};
      way["leisure"~"^(park|garden|pitch|playground)$"]${around};
      way["waterway"~"^(river|stream|canal|drain|ditch|riverbank)$"]${around};
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|pedestrian|footway|cycleway|path|track)$"]${around};
      way["building"]${around};
      node["amenity"]${around};
      node["shop"]${around};
      node["tourism"]${around};
      node["historic"]${around};
      node["leisure"]${around};
      node["office"]${around};
      node["natural"~"^(peak|spring|cave_entrance)$"]${around};
      node["natural"="tree"]${around};
    );out geom qt;`;

    // ── Try each endpoint ──────────────────────────────────────────────────
    for (let attempt = 0; attempt < this._endpoints.length; attempt++) {
      const ctrl    = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 12000);

      try {
        const res = await fetch(
          `${this._endpoint}?data=${encodeURIComponent(q)}`,
          { signal: ctrl.signal }
        );
        clearTimeout(timeout);

        if (res.status === 429) {
          console.warn(`[OSMTerrainLoader] 429 on ${this._endpoint}`);
          this._nextEndpoint();
          continue;
        }
        if (!res.ok) {
          console.warn(`[OSMTerrainLoader] ${res.status} on ${this._endpoint}`);
          this._nextEndpoint();
          continue;
        }

        const data = await res.json();
        console.log(`[OSMTerrainLoader] Fetched ${data.elements?.length ?? 0} elements from ${this._endpoint}`);

        // ── Process elements ───────────────────────────────────────────────
        const terrainUpdates = new Map();
        const buildingWays   = [];
        const features       = [];

        const toTile = (eLat, eLon) => ({
          x: lonToGlobalX(eLon, geoCenter.lat, this._mPerTile),
          y: latToGlobalY(eLat, this._mPerTile),
        });

        const mLat = 111320;
        const mLon = 111320 * Math.cos(lat * Math.PI / 180);
        const rLat = r / mLat, rLon = r / mLon;
        const minGX = lonToGlobalX(lon - rLon, lat, this._mPerTile) - 2;
        const maxGX = lonToGlobalX(lon + rLon, lat, this._mPerTile) + 2;
        const minGY = latToGlobalY(lat + rLat, this._mPerTile) - 2;
        const maxGY = latToGlobalY(lat - rLat, this._mPerTile) + 2;

        for (const el of data.elements) {

          // ── Terrain ways ─────────────────────────────────────────────────
          if (el.type === 'way' && el.geometry?.length) {
            const cls = classifyOSM(el.tags);
            if (cls) {
              const pts = el.geometry.map(g => toTile(g.lat, g.lon));
              if (cls.type === 'polygon') rasterizePolygon(terrainUpdates, pts, cls.terrain);
              else                        rasterizeLine(terrainUpdates, pts, cls.terrain, cls.width);
              if (el.tags?.building) buildingWays.push(el);

              if (el.tags?.highway && ['primary', 'secondary', 'tertiary', 'residential'].includes(el.tags.highway)) {
                if (Math.random() > 0.6) {
                  features.push({
                    id: `car:${el.id}`,
                    latitude: el.geometry[0].lat,
                    longitude: el.geometry[0].lon,
                    label: 'Car',
                    data: {
                      category: 'traffic',
                      asset: 'car_voxel',
                      path: el.geometry,
                      progress: Math.random() * (el.geometry.length - 1),
                      speed: 0.1 + Math.random() * 0.2
                    },
                    renderMode: 'blueprint'
                  });
                }
              }
            }
          }

          // ── POI nodes ────────────────────────────────────────────────────
          if (el.type === 'node') {
            const poi = classifyPOI(el.tags);
            if (!poi) continue;

            const { x: gx, y: gy } = toTile(el.lat, el.lon);
            if (gx < minGX || gx > maxGX || gy < minGY || gy > maxGY) continue;

            features.push({
              id:          `osm:node:${el.id}`,
              latitude:    el.lat,
              longitude:   el.lon,
              color:       poi.color,
              label:       poi.label,
              category:    poi.category,
              value:       poi.value,
              title:       el.tags?.name || poi.label,
              description: el.tags?.name
                ? `${poi.label} — ${el.tags.name}`
                : poi.label,
            });
          }
        }

        console.log(`[OSMTerrainLoader] → ${terrainUpdates.size} terrain tiles, ${buildingWays.length} buildings, ${features.length} POIs`);

        // ── Persist to IndexedDB ───────────────────────────────────────────
        try {
          await this._cache.set(cacheKey, {
            terrainUpdates: Object.fromEntries(terrainUpdates),
            buildingWays,
            features,
            timestamp: Date.now(),
          });
        } catch (cacheErr) {
          console.warn('[OSMTerrainLoader] Cache write error (continuing)', cacheErr);
        }

        return { terrainUpdates, buildingWays, features };

      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          console.warn(`[OSMTerrainLoader] Timeout/abort on ${this._endpoint}, trying next`);
          this._nextEndpoint();
          continue;
        }
        console.warn(`[OSMTerrainLoader] Error on ${this._endpoint}:`, err.message);
        this._nextEndpoint();
      }
    }

    this._backoffUntil = Date.now() + 8000;
    console.warn('[OSMTerrainLoader] All endpoints failed, backing off 8s');
    return {};
  }

  destroy() {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
      this._pendingResolve?.({});
      this._pendingResolve = null;
    }
    this._abort?.abort();
  }

  async clearCache() { await this._cache.clear(); }
}