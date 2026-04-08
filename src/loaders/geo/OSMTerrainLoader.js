/**
 * GOE Core — OSMTerrainLoader
 * Fetches vector features from the Overpass API and rasterizes them into
 * the terrain cache as terrain type IDs.
 *
 * Automatically falls back through multiple Overpass mirrors on 429 / error.
 * Backs off 30 s only if every mirror fails.
 */
import { BaseLoader } from '../BaseLoader.js';
import { TerrainType } from '../../terrain/types.js';
import { lonToGlobalX, latToGlobalY } from '../../math/geo.js';

// ─── DEFAULT ENDPOINTS (tried in order, round-robin on failure) ───────────────

const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// ─── OSM TAG → TERRAIN TYPE ───────────────────────────────────────────────────

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

// ─── RASTERIZATION ────────────────────────────────────────────────────────────

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

// ─── LOADER ───────────────────────────────────────────────────────────────────

export class OSMTerrainLoader extends BaseLoader {
  get id() { return 'osm-terrain'; }

  /**
   * @param {object} options
   * @param {string[]} [options.endpoints]  Overpass mirrors to try in order
   * @param {string}   [options.endpoint]   Single endpoint (overrides endpoints)
   * @param {number}   [options.mPerTile]   Must match Engine's mPerTile
   * @param {number}   [options.mapW]
   * @param {number}   [options.mapH]
   */
  constructor(options = {}) {
    super(options);
    this._endpoints     = options.endpoint
      ? [options.endpoint]
      : (options.endpoints || DEFAULT_ENDPOINTS);
    this._endpointIdx   = 0;
    this._mPerTile      = options.mPerTile || 2;
    this._mapW          = options.mapW     || 80;
    this._mapH          = options.mapH     || 80;
    this._backoffUntil  = 0;
    this._abort         = null;
  }

  get _endpoint() {
    return this._endpoints[this._endpointIdx % this._endpoints.length];
  }

  _nextEndpoint() {
    this._endpointIdx = (this._endpointIdx + 1) % this._endpoints.length;
    console.info(`[OSMTerrainLoader] Switching to endpoint: ${this._endpoint}`);
  }

  async fetch(geoCenter) {
    // Abort any previous in-flight request
    if (this._abort) this._abort.abort();
    this._abort = new AbortController();

    // Global backoff — all mirrors failed recently
    if (Date.now() < this._backoffUntil) {
      const remaining = Math.ceil((this._backoffUntil - Date.now()) / 1000);
      console.warn(`[OSMTerrainLoader] In backoff, ${remaining}s remaining`);
      return {};
    }

    // Build bbox
    const mLat  = 111320;
    const mLon  = 111320 * Math.cos(geoCenter.lat * Math.PI / 180);
    const range = Math.max(this._mapW, this._mapH) * this._mPerTile / 2;
    const rLat  = range / mLat, rLon = range / mLon;

    const s = (geoCenter.lat - rLat).toFixed(6), n = (geoCenter.lat + rLat).toFixed(6);
    const w = (geoCenter.lon - rLon).toFixed(6), e = (geoCenter.lon + rLon).toFixed(6);
    const bbox = `${s},${w},${n},${e}`;

    const q = `[out:json][timeout:22];(
      way["natural"~"water|beach|wood|grassland|heath|scrub|wetland"](${bbox});
      way["landuse"~"water|reservoir|basin|grass|meadow|village_green|allotments|forest|park|commercial|residential|retail|industrial"](${bbox});
      way["leisure"~"park|garden|pitch|playground"](${bbox});
      way["waterway"~"river|stream|canal|drain|ditch|riverbank"](${bbox});
      way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|pedestrian|footway|cycleway|path"](${bbox});
      way["building"](${bbox});
    );out geom qt;`;

    // Try each endpoint in turn
    for (let attempt = 0; attempt < this._endpoints.length; attempt++) {
      try {
        const res = await fetch(
          `${this._endpoint}?data=${encodeURIComponent(q)}`,
          { signal: this._abort.signal }
        );

        if (res.status === 429) {
          console.warn(`[OSMTerrainLoader] 429 from ${this._endpoint}, trying next mirror`);
          this._nextEndpoint();
          continue;
        }

        if (!res.ok) {
          console.warn(`[OSMTerrainLoader] HTTP ${res.status} from ${this._endpoint}, trying next mirror`);
          this._nextEndpoint();
          continue;
        }

        const data = await res.json();

        const terrainUpdates = new Map();
        const buildingWays   = [];

        const toTile = (lat, lon) => ({
          x: lonToGlobalX(lon, geoCenter.lat, this._mPerTile),
          y: latToGlobalY(lat, this._mPerTile),
        });

        for (const el of data.elements) {
          if (el.type !== 'way' || !el.geometry?.length) continue;
          const cls = classifyOSM(el.tags);
          if (!cls) continue;
          const pts = el.geometry.map(g => toTile(g.lat, g.lon));
          if (cls.type === 'polygon') rasterizePolygon(terrainUpdates, pts, cls.terrain);
          else rasterizeLine(terrainUpdates, pts, cls.terrain, cls.width);
          if (el.tags?.building) buildingWays.push(el);
        }

        return { terrainUpdates, buildingWays };

      } catch (err) {
        if (err.name === 'AbortError') return {};
        console.warn(`[OSMTerrainLoader] Error from ${this._endpoint}:`, err.message);
        this._nextEndpoint();
      }
    }

    // All endpoints exhausted — back off before next attempt
    this._backoffUntil = Date.now() + 30_000;
    console.warn('[OSMTerrainLoader] All endpoints failed, backing off 30s');
    return {};
  }

  destroy() {
    this._abort?.abort();
  }
}