/**
 * GOE Core — OSMTerrainLoader
 * Fetches vector features from Overpass API and rasterizes terrain,
 * plus extracts POIs as map features.
 * 
 * Fixed: fetch radius increased to a sensible value (default 500m).
 */
import { BaseLoader } from '../BaseLoader.js';
import { TerrainType } from '../../terrain/types.js';
import { lonToGlobalX, latToGlobalY } from '../../math/geo.js';
import { PersistentCache } from '../../core/PersistentCache.js';

const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// ─── OSM TAG → TERRAIN TYPE (full implementation) ───────────────────────────
function classifyOSM(tags) {
  if (!tags) return null;
  const { highway:h, waterway:w, natural:n, landuse:l, leisure:le, building:b } = tags;

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
  if (h==='motorway'||h==='trunk'||h==='primary')
    return { terrain: TerrainType.ROAD, type:'line', width:3 };
  if (h==='secondary'||h==='tertiary')
    return { terrain: TerrainType.ROAD, type:'line', width:2 };
  if (h==='residential'||h==='unclassified'||h==='service')
    return { terrain: TerrainType.ROAD, type:'line', width:1 };
  if (h==='footway'||h==='path'||h==='cycleway'||h==='pedestrian')
    return { terrain: TerrainType.PATH, type:'line', width:1 };
  if (h)
    return { terrain: TerrainType.ROAD, type:'line', width:1 };
  if (b)
    return { terrain: TerrainType.BUILDING, type:'polygon' };
  if (['residential','commercial','retail','industrial'].includes(l))
    return { terrain: TerrainType.RESIDENTIAL, type:'polygon' };
  return null;
}

// ─── OSM TAG → POI FEATURE (full implementation) ───────────────────────────
const POI_COLORS = {
  amenity: {
    restaurant: '#ef4444', cafe: '#ef4444', pub: '#ef4444', bar: '#ef4444',
    school: '#f59e0b', university: '#f59e0b', library: '#f59e0b',
    hospital: '#dc2626', clinic: '#dc2626', pharmacy: '#dc2626',
    theatre: '#a78bfa', cinema: '#a78bfa', arts_centre: '#a78bfa',
    place_of_worship: '#f97316',
    park: '#22c55e', playground: '#22c55e',
    default: '#60a5fa'
  },
  shop: {
    supermarket: '#eab308', convenience: '#eab308', bakery: '#eab308',
    clothes: '#eab308', electronics: '#eab308',
    default: '#eab308'
  },
  tourism: {
    museum: '#a78bfa', gallery: '#a78bfa', attraction: '#a78bfa',
    hotel: '#f59e0b', hostel: '#f59e0b',
    default: '#a78bfa'
  },
  historic: {
    castle: '#f97316', monument: '#f97316', memorial: '#f97316',
    default: '#f97316'
  },
  leisure: {
    park: '#22c55e', garden: '#22c55e', pitch: '#22c55e',
    default: '#22c55e'
  }
};

function classifyPOI(tags) {
  if (!tags) return null;
  const cats = ['amenity', 'shop', 'tourism', 'historic', 'leisure'];
  for (const cat of cats) {
    const val = tags[cat];
    if (!val) continue;
    const map = POI_COLORS[cat];
    const color = (map && map[val]) ? map[val] : map.default;
    let label = val.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    if (cat === 'historic') label = `Historic ${label}`;
    return { color, label, category: cat };
  }
  return null;
}

// ─── RASTERIZATION (unchanged) ──────────────────────────────────────────────
function rasterizePolygon(cache, pts, terrain) {
  if (pts.length < 3) return;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0, j = pts.length-1; i < pts.length; j=i++) {
      const p1 = pts[i], p2 = pts[j];
      if ((p1.y<=y && p2.y>y)||(p2.y<=y && p1.y>y))
        xs.push(p1.x + (y-p1.y)/(p2.y-p1.y)*(p2.x-p1.x));
    }
    xs.sort((a,b)=>a-b);
    for (let i = 0; i < xs.length-1; i+=2)
      for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i+1]); x++)
        cache.set(`${x},${y}`, terrain);
  }
}

function rasterizeLine(cache, pts, terrain, width) {
  const w2 = width * width;
  for (let i = 0; i < pts.length-1; i++) {
    const x0=pts[i].x, y0=pts[i].y, x1=pts[i+1].x, y1=pts[i+1].y;
    const dist = Math.hypot(x1-x0, y1-y0);
    const steps = Math.ceil(dist*2)+1;
    for (let s = 0; s <= steps; s++) {
      const t = s/steps, cx = x0+(x1-x0)*t, cy = y0+(y1-y0)*t;
      for (let dx = -width; dx <= width; dx++) {
        for (let dy = -width; dy <= width; dy++) {
          if (dx*dx+dy*dy <= w2)
            cache.set(`${Math.round(cx+dx)},${Math.round(cy+dy)}`, terrain);
        }
      }
    }
  }
}

// ─── LOADER WITH CORRECT FETCH RADIUS ───────────────────────────────────────
export class OSMTerrainLoader extends BaseLoader {
  get id() { return 'osm-terrain'; }

  constructor(options = {}) {
    super(options);
    this._endpoints     = options.endpoint ? [options.endpoint] : (options.endpoints || DEFAULT_ENDPOINTS);
    this._endpointIdx   = 0;
    this._mPerTile      = options.mPerTile || 2;
    this._mapW          = options.mapW     || 80;
    this._mapH          = options.mapH     || 80;
    this._backoffUntil  = 0;
    this._abort         = null;
    this._cache         = new PersistentCache('GOE_Overpass', 'osm_terrain');
    // FIX: use a sensible fetch radius (default 500 metres)
    this._fetchRadiusM  = options.fetchRadiusM ?? 500;
  }

  get _endpoint() { return this._endpoints[this._endpointIdx % this._endpoints.length]; }
  _nextEndpoint() { this._endpointIdx = (this._endpointIdx + 1) % this._endpoints.length; }

  _getCacheKey(geoCenter) {
    const mLat  = 111320;
    const mLon  = 111320 * Math.cos(geoCenter.lat * Math.PI / 180);
    const rLat  = this._fetchRadiusM / mLat;
    const rLon  = this._fetchRadiusM / mLon;
    const s = (geoCenter.lat - rLat).toFixed(6), n = (geoCenter.lat + rLat).toFixed(6);
    const w = (geoCenter.lon - rLon).toFixed(6), e = (geoCenter.lon + rLon).toFixed(6);
    return `overpass:${s},${w},${n},${e}`;
  }

  async fetch(geoCenter) {
    if (this._abort) this._abort.abort();
    this._abort = new AbortController();

    if (Date.now() < this._backoffUntil) {
      const remaining = Math.ceil((this._backoffUntil - Date.now()) / 1000);
      console.warn(`[OSMTerrainLoader] Backoff ${remaining}s`);
      return {};
    }

    const cacheKey = this._getCacheKey(geoCenter);
    try {
      const cached = await this._cache.get(cacheKey);
      if (cached && cached.terrainUpdates && cached.buildingWays && cached.features) {
        const terrainUpdates = new Map(Object.entries(cached.terrainUpdates));
        return { terrainUpdates, buildingWays: cached.buildingWays, features: cached.features };
      }
    } catch (err) { console.warn('Cache read error', err); }

    // Build Overpass query including POIs
    const bbox = cacheKey.slice('overpass:'.length);
    const q = `[out:json][timeout:25];(
      // Terrain & buildings (ways)
      way["natural"~"water|beach|wood|grassland|heath|scrub|wetland"](${bbox});
      way["landuse"~"water|reservoir|basin|grass|meadow|village_green|allotments|forest|park|commercial|residential|retail|industrial"](${bbox});
      way["leisure"~"park|garden|pitch|playground"](${bbox});
      way["waterway"~"river|stream|canal|drain|ditch|riverbank"](${bbox});
      way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|pedestrian|footway|cycleway|path"](${bbox});
      way["building"](${bbox});
      // POIs (nodes and ways with amenity, shop, tourism, historic, leisure)
      node["amenity"](${bbox});
      way["amenity"](${bbox});
      node["shop"](${bbox});
      way["shop"](${bbox});
      node["tourism"](${bbox});
      way["tourism"](${bbox});
      node["historic"](${bbox});
      way["historic"](${bbox});
      node["leisure"](${bbox});
      way["leisure"](${bbox});
    );out geom qt;`;

    for (let attempt = 0; attempt < this._endpoints.length; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout per endpoint
      try {
        const res = await fetch(
          `${this._endpoint}?data=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        if (res.status === 429 || !res.ok) {
          this._nextEndpoint();
          continue;
        }
        const data = await res.json();
        console.log(`[OSMTerrainLoader] Fetched ${data.elements?.length || 0} elements`);

        const terrainUpdates = new Map();
        const buildingWays   = [];
        const features       = [];

        const toTile = (lat, lon) => ({
          x: lonToGlobalX(lon, geoCenter.lat, this._mPerTile),
          y: latToGlobalY(lat, this._mPerTile),
        });

        for (const el of data.elements) {
          // ← REMOVE the hard guard: if (!el.geometry || el.geometry.length === 0) continue;

          // 1. Terrain (ways only — ways always have geometry)
          if (el.type === 'way' && el.geometry?.length) {
            const cls = classifyOSM(el.tags);
            if (cls) {
              const pts = el.geometry.map(g => toTile(g.lat, g.lon));
              if (cls.type === 'polygon') rasterizePolygon(terrainUpdates, pts, cls.terrain);
              else rasterizeLine(terrainUpdates, pts, cls.terrain, cls.width);
              if (el.tags?.building) buildingWays.push(el);
            }
          }

          // 2. POI features (nodes use el.lat/el.lon directly)
          const poi = classifyPOI(el.tags);
          if (poi) {
            let lat, lon;
            if (el.type === 'node') {
              lat = el.lat;   // ← nodes have these directly, no .geometry
              lon = el.lon;
            } else if (el.geometry?.length) {
              const sum = el.geometry.reduce(
                (acc, g) => ({ lat: acc.lat + g.lat, lon: acc.lon + g.lon }),
                { lat: 0, lon: 0 }
              );
              lat = sum.lat / el.geometry.length;
              lon = sum.lon / el.geometry.length;
            } else {
              continue;
            }

            const { x: tx, y: ty } = toTile(lat, lon);
            if (tx > -50 && tx < this._mapW + 50 && ty > -50 && ty < this._mapH + 50) {
              features.push({
                id: `osm:${el.type}:${el.id}`,
                latitude: lat,
                longitude: lon,
                color: poi.color,
                label: poi.label,
                category: poi.category,
                title: el.tags?.name || poi.label,
                description: `${poi.label} (OSM)`,
              });
            }
          }
        }

        console.log(`[OSMTerrainLoader] Generated ${terrainUpdates.size} terrain tiles, ${buildingWays.length} buildings, ${features.length} POIs`);

        const toStore = {
          terrainUpdates: Object.fromEntries(terrainUpdates),
          buildingWays,
          features,
          timestamp: Date.now()
        };
        await this._cache.set(cacheKey, toStore);

        return { terrainUpdates, buildingWays, features };

      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          console.warn(`[OSMTerrainLoader] Timeout on ${this._endpoint}, trying next`);
          this._nextEndpoint();
          continue; // try next endpoint, don't return {}
        }
      }
    }

    // In OSMTerrainLoader.js — change the backoff at the bottom of fetch():
    this._backoffUntil = Date.now() + 5000; // was 30000 — way too long
    console.warn('[OSMTerrainLoader] All endpoints failed, backing off 5s');
    return {};
  }

  destroy() { this._abort?.abort(); }
  async clearCache() { await this._cache.clear(); }
}