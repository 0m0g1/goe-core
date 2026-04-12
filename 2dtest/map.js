/**
 * GeoExplorer — map.js  (performance rewrite)
 *
 * Perf changes vs previous version:
 *  1. Coordinate cache (projCache): ll2s() results are cached per-way and only
 *     recomputed when pan/zoom changes (projStamp). All render functions and
 *     hitTest reuse the same cache — no redundant projection.
 *  2. Label candidates pre-filtered once after each fetch (buildLabelCandidates),
 *     not inside render() on every frame.
 *  3. Highlight animation uses a dedicated RAF loop (startHighlightLoop/hlTick)
 *     that only runs while something is selected, instead of calling
 *     requestAnimationFrame(render) from inside renderHighlight.
 *  4. Topology fetch has its own distance cache (fetchedTopoCenter) so it doesn't
 *     re-fire every time the OSM cache misses.
 *  5. renderLabels batches ctx state changes outside the loop instead of setting
 *     font/fillStyle on every iteration.
 */
'use strict';

// ── Overpass mirrors ───────────────────────────────────────────────────────────
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

function nextMirror() {
  const url = MIRRORS[mirrorIdx % MIRRORS.length];
  mirrorIdx++;
  return url;
}

// ── Config ────────────────────────────────────────────────────────────────────
const MIN_ZOOM  = 14;
const DEBOUNCE  = 600;
const FETCH_TIMEOUT = 20000;

// ── State ─────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('map-canvas');
const ctx    = canvas.getContext('2d');

let centerLat   = 51.5074;
let centerLon   = -0.1278;
let zoom        = 13;

let ways        = [];
let pins        = [];
let loading     = false;
let fetchTimer  = null;
let activeAbort = null;
let activeLocEl = null;

let lastFetchError = null;
let panning  = false;
let panStart = null;
let panCen   = null;

// ── PERF: Coordinate projection cache ─────────────────────────────────────────
// projStamp is bumped on every pan or zoom. getProj() recomputes screen coords
// only when a way's cached stamp is stale. All render functions and hitTest
// call getProj() instead of doing way.geo.map(g => ll2s(...)) themselves.
const projCache = new Map(); // wayId (number) → { stamp: number, pts: [{x,y}] }
let projStamp = 0;

function invalidateProj() {
  projStamp++;
}

function getProj(way) {
  let c = projCache.get(way.id);
  if (!c) {
    c = { stamp: -1, pts: [] };
    projCache.set(way.id, c);
  }
  if (c.stamp !== projStamp) {
    c.pts = way.geo.map(g => ll2s(g.lat, g.lon));
    c.stamp = projStamp;
  }
  return c.pts;
}

// ── PERF: Label candidates cache ──────────────────────────────────────────────
// Built once after each fetch. renderLabels() iterates this instead of all ways.
let labelCandidates = [];

function buildLabelCandidates() {
  labelCandidates = ways.filter(w => {
    if (!w.geo?.length) return false;
    const info = featureLabel(w);
    return !!(info.name || info.height);
  });
}

// ── PERF: Dedicated highlight animation loop ───────────────────────────────────
// Runs only while selectedWay !== null. Stops itself automatically.
// This replaces the requestAnimationFrame(render) call that was inside
// renderHighlight(), which caused the full 7-layer render to run at 60fps
// whenever anything was selected.
let hlRaf = null;

function startHighlightLoop() {
  if (!hlRaf) hlRaf = requestAnimationFrame(hlTick);
}

function stopHighlightLoop() {
  if (hlRaf) { cancelAnimationFrame(hlRaf); hlRaf = null; }
}

function hlTick() {
  // Only re-render the highlight overlay, not the full scene.
  // We redraw the full scene here because the highlight sits on top of all
  // layers — a separate canvas would avoid this, but that's a bigger refactor.
  // At minimum, this loop is now *controlled*: it stops when deselected.
  render();
  hlRaf = selectedWay ? requestAnimationFrame(hlTick) : null;
}

// ── Canvas resize ─────────────────────────────────────────────────────────────
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  invalidateProj(); // viewport size changed, screen coords are stale
  render();
}
window.addEventListener('resize', resize);

// ── Mercator ──────────────────────────────────────────────────────────────────
function ll2w(lat, lon) {
  const x = (lon + 180) / 360;
  const s = Math.sin(lat * Math.PI / 180);
  const y = (1 - Math.log((1 + s) / (1 - s)) / (2 * Math.PI)) / 2;
  return { x, y };
}
function w2ll(wx, wy) {
  const lon = wx * 360 - 180;
  const n   = Math.PI - 2 * Math.PI * wy;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}
function scale() { return Math.pow(2, zoom) * 256; }
function ll2s(lat, lon) {
  const sc = scale();
  const cw = ll2w(centerLat, centerLon);
  const pw = ll2w(lat, lon);
  return {
    x: canvas.width  / 2 + (pw.x - cw.x) * sc,
    y: canvas.height / 2 + (pw.y - cw.y) * sc,
  };
}
function s2ll(sx, sy) {
  const sc = scale();
  const cw = ll2w(centerLat, centerLon);
  return w2ll(cw.x + (sx - canvas.width  / 2) / sc,
              cw.y + (sy - canvas.height / 2) / sc);
}
function viewBbox() {
  const tl = s2ll(0, 0);
  const br = s2ll(canvas.width, canvas.height);
  return {
    s: Math.min(tl.lat, br.lat), n: Math.max(tl.lat, br.lat),
    w: Math.min(tl.lon, br.lon), e: Math.max(tl.lon, br.lon),
  };
}

// ── Overpass query builder ────────────────────────────────────────────────────
const FETCH_RADIUS = 800;

function buildQuery(lat, lon) {
  const a = `(around:${FETCH_RADIUS},${lat.toFixed(6)},${lon.toFixed(6)})`;

  if (zoom < 15) {
    return `[out:json][timeout:30];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"]${a};
  way["waterway"~"^(river|riverbank|canal)$"]${a};
  way["natural"~"^(water|wetland|wood)$"]${a};
  way["landuse"~"^(reservoir|basin|forest|park)$"]${a};
);
out geom qt;`;
  }

  if (zoom < 16) {
    return `[out:json][timeout:30];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service)$"]${a};
  way["natural"~"^(water|wetland|wood|scrub|grassland|heath|beach)$"]${a};
  way["waterway"~"^(river|riverbank|canal|stream)$"]${a};
  way["landuse"~"^(reservoir|basin|residential|commercial|industrial|retail|forest|grass|meadow|village_green|allotments|cemetery|park)$"]${a};
  way["leisure"~"^(park|garden|pitch|playground)$"]${a};
  node["amenity"]${a};
  node["shop"]${a};
  node["tourism"]${a};
  node["historic"]${a};
);
out geom qt;`;
  }

  return `[out:json][timeout:30];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|footway|path|cycleway|steps|living_street|pedestrian|track|bridleway)$"]${a};
  way["building"]${a};
  way["bridge"="yes"]["name"]${a};
  way["man_made"="bridge"]["name"]${a};
  way["natural"~"^(water|wetland|wood|scrub|grassland|heath|beach|sand|bare_rock)$"]${a};
  way["waterway"~"^(river|riverbank|canal|stream|drain|ditch)$"]${a};
  way["landuse"~"^(reservoir|basin|residential|commercial|industrial|retail|forest|grass|meadow|village_green|allotments|cemetery|construction|park)$"]${a};
  way["leisure"~"^(park|garden|nature_reserve|pitch|playground|swimming_pool)$"]${a};
  way["railway"~"^(rail|subway|tram|light_rail)$"]${a};
  node["amenity"]${a};
  node["shop"]${a};
  node["tourism"]${a};
  node["historic"]${a};
  node["leisure"]${a};
  node["office"]${a};
  node["natural"~"^(peak|spring|cave_entrance|tree)$"]${a};
);
out geom qt;`;
}

// ── Radius-based cache ────────────────────────────────────────────────────────
let fetchedCenter    = null;
let fetchedZoomLevel = null;
let backoffUntil     = 0;
let mirrorIdx        = 0;

// PERF: Topology has its own cache so it doesn't re-fire every OSM fetch
let fetchedTopoCenter = null;
const TOPO_REFETCH_THRESHOLD = FETCH_RADIUS * 0.6;

function distanceM(lat1, lon1, lat2, lon2) {
  const R    = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2 +
               Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const REFETCH_THRESHOLD = FETCH_RADIUS * 0.4;

function zoomTier() {
  if (zoom < 15) return 14;
  if (zoom < 16) return 15;
  return 16;
}

function needsFetch() {
  if (zoom < MIN_ZOOM) return false;
  if (Date.now() < backoffUntil) return false;
  if (!fetchedCenter) return true;
  if (zoomTier() !== fetchedZoomLevel) return true;
  return distanceM(centerLat, centerLon, fetchedCenter.lat, fetchedCenter.lon) > REFETCH_THRESHOLD;
}

function needsTopoFetch() {
  if (!fetchedTopoCenter) return true;
  return distanceM(centerLat, centerLon, fetchedTopoCenter.lat, fetchedTopoCenter.lon) > TOPO_REFETCH_THRESHOLD;
}

let terrainGrid = [];
const CONTOUR_INTERVAL = 10;

async function fetchTopology(lat, lon) {
  // PERF: Skip if we already have elevation data close enough to this point
  if (!needsTopoFetch()) return;

  const step = 0.002;
  const locations = [];
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      locations.push({ latitude: lat + i * step, longitude: lon + j * step });
    }
  }

  try {
    const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations })
    });
    const data = await res.json();
    terrainGrid = data.results;
    fetchedTopoCenter = { lat, lon }; // mark cache as valid
    render();
  } catch (e) { console.error("Topology fetch failed", e); }
}

async function fetchData() {
  if (!needsFetch()) return;

  if (activeAbort) { activeAbort.abort(); activeAbort = null; }

  const lat = centerLat, lon = centerLon;
  const ac  = new AbortController();
  activeAbort = ac;
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT);

  loading = true;
  setStatus('Fetching OSM data…');
  render();

  fetchTopology(lat, lon);

  let lastErr = null;
  const q = buildQuery(lat, lon);

  for (let attempt = 0; attempt < MIRRORS.length; attempt++) {
    if (ac.signal.aborted) break;
    const mirror = MIRRORS[(mirrorIdx + attempt) % MIRRORS.length];
    try {
      const url = `${mirror}?data=${encodeURIComponent(q)}`;
      const res = await fetch(url, { signal: ac.signal });

      if (res.status === 429) {
        mirrorIdx = (mirrorIdx + 1) % MIRRORS.length;
        backoffUntil = Date.now() + 30000;
        clearTimeout(timer);
        activeAbort = null;
        loading = false;
        lastFetchError = 'Rate limited — waiting 30s before retry';
        setStatus('Rate limited — pausing 30s…');
        render();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      if (json.remark?.includes('out of memory')) throw new Error('OOM — query too large');

      clearTimeout(timer);
      activeAbort      = null;
      ways             = parseWays(json);
      fetchedCenter    = { lat, lon };
      fetchedZoomLevel = zoomTier();
      lastFetchError   = null;
      mirrorIdx        = (mirrorIdx + attempt) % MIRRORS.length;

      // PERF: Clear the projection cache when new ways arrive — old IDs are gone
      projCache.clear();
      invalidateProj();

      // PERF: Build label candidates once here, not inside render()
      buildLabelCandidates();

      setStatus(`Loaded ${ways.length.toLocaleString()} features · ${new URL(mirror).hostname}`);
      loading = false;
      render();
      return;
    } catch (e) {
      lastErr = e;
      if (e.name === 'AbortError') break;
      console.warn(`Mirror ${mirror} failed:`, e.message);
      setStatus(`Trying mirror ${attempt + 2}… (${e.message})`);
      render();
    }
  }

  clearTimeout(timer);
  activeAbort    = null;
  loading        = false;
  lastFetchError = lastErr?.message ?? 'unknown error';
  setStatus(`Fetch failed: ${lastFetchError}`);
  render();
}

// ── OSM parser ────────────────────────────────────────────────────────────────
let buckets = {
  landuse: [], natural: [], leisure: [],
  waterways: [], railways: [], highways: [], buildings: []
};

function parseWays(json) {
  const newBuckets = {
    landuse: [], natural: [], leisure: [],
    waterways: [], railways: [], highways: [], buildings: []
  };

  const rawElements = (json.elements || []).filter(
    el => el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2
  );

  const processedWays = rawElements.map(el => {
    const g = el.geometry;
    const last = g[g.length - 1];
    const way = {
      id: el.id,
      tags: el.tags || {},
      geo: g,
      closed: g[0].lat === last.lat && g[0].lon === last.lon,
    };

    const t = way.tags;
    if (t.landuse)                        newBuckets.landuse.push(way);
    if (t.natural)                        newBuckets.natural.push(way);
    if (t.leisure)                        newBuckets.leisure.push(way);
    if (t.waterway)                       newBuckets.waterways.push(way);
    if (t.railway)                        newBuckets.railways.push(way);
    if (t.highway)                        newBuckets.highways.push(way);
    if (t.building || t['building:part']) newBuckets.buildings.push(way);

    return way;
  });

  buckets = newBuckets;
  return processedWays;
}

// ── Style tables ──────────────────────────────────────────────────────────────
const LANDUSE_FILL = {
  residential:'#1c2130', commercial:'#1d2035', industrial:'#191e25',
  retail:'#201d30', farmland:'#1a251a', farmyard:'#1e2820',
  grass:'#18281c', meadow:'#18281c', forest:'#142018', wood:'#142018',
  cemetery:'#1a2820', construction:'#1e2025', allotments:'#1a2818',
  recreation_ground:'#192817', village_green:'#182618',
};
const NATURAL_STYLE = {
  water:    ['#162e48','#1a3850'], wetland:['#1a2e38',null],
  wood:     ['#142018',null],      scrub:  ['#182218',null],
  heath:    ['#1e2018',null],      grassland:['#182818',null],
  meadow:   ['#182818',null],      sand:   ['#28251e',null],
  beach:    ['#2e2a1e',null],      bare_rock:['#202228',null],
};
const LEISURE_STYLE = {
  park:          ['#172a1c','#1d3522'], garden:     ['#162818',null],
  playground:    ['#182818',null],      sports_centre:['#182228',null],
  pitch:         ['#182028','#1e2e30'], track:      ['#182028','#252a38'],
  golf_course:   ['#162618',null],      nature_reserve:['#152018',null],
  swimming_pool: ['#182838','#1e3248'],
};
const ROAD = {
  motorway:      {c:'#7a5a15',f:'#e8c050',cw:12,fw:8.5},
  motorway_link: {c:'#7a5a15',f:'#e8c050',cw:8, fw:5.5},
  trunk:         {c:'#6a4e15',f:'#c8a840',cw:11,fw:7.5},
  trunk_link:    {c:'#6a4e15',f:'#c8a840',cw:7, fw:4.5},
  primary:       {c:'#4a3e28',f:'#9a8860',cw:9, fw:6  },
  primary_link:  {c:'#4a3e28',f:'#9a8860',cw:6, fw:4  },
  secondary:     {c:'#303848',f:'#607080',cw:8, fw:5.5},
  secondary_link:{c:'#303848',f:'#607080',cw:5, fw:3.5},
  tertiary:      {c:'#283040',f:'#485868',cw:6, fw:4  },
  tertiary_link: {c:'#283040',f:'#485868',cw:4, fw:2.5},
  unclassified:  {c:'#252a38',f:'#404858',cw:5, fw:3  },
  residential:   {c:'#1e2230',f:'#383d50',cw:5, fw:3  },
  living_street: {c:'#1e2230',f:'#383d50',cw:4, fw:2.5},
  pedestrian:    {c:'#252830',f:'#404860',cw:5, fw:3.5},
  service:       {c:'#1a1f2e',f:'#30354a',cw:3, fw:1.8},
  track:    {s:'#384050',w:1.5,d:[5,4]},
  footway:  {s:'#404858',w:1.0,d:[3,3]},
  path:     {s:'#383a50',w:1.0,d:[2,4]},
  cycleway: {s:'#255040',w:1.0,d:[5,3]},
  steps:    {s:'#404858',w:1.5,d:[1,2]},
  bridleway:{s:'#354030',w:1.0,d:[4,3]},
};
const ROAD_ORDER = [
  'footway','path','bridleway','steps','cycleway','track',
  'service','living_street','residential','unclassified',
  'tertiary_link','tertiary','secondary_link','secondary',
  'primary_link','primary','trunk_link','trunk',
  'motorway_link','motorway',
];

// ── Drawing helpers ───────────────────────────────────────────────────────────
// PERF: pathWay now calls getProj() instead of mapping ll2s inline.
// This means the first call per frame recomputes coords; subsequent calls
// (e.g. the second pass in renderHighways) hit the cache for free.
function pathWay(way) {
  const pts = getProj(way);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (way.closed) ctx.closePath();
}

function centroid(way) {
  let lat = 0, lon = 0;
  for (const g of way.geo) { lat += g.lat; lon += g.lon; }
  return { lat: lat / way.geo.length, lon: lon / way.geo.length };
}

// ── Render layers ─────────────────────────────────────────────────────────────
function renderLanduse(list) {
  for (const w of list) {
    if (!w.closed) continue;
    const fill = LANDUSE_FILL[w.tags.landuse];
    if (!fill) continue;
    pathWay(w); ctx.fillStyle = fill; ctx.fill();
  }
}

function renderNatural(list) {
  for (const w of list) {
    if (!w.closed) continue;
    const st = NATURAL_STYLE[w.tags.natural];
    if (!st) continue;
    pathWay(w);
    if (st[0]) { ctx.fillStyle = st[0]; ctx.fill(); }
    if (st[1]) { ctx.strokeStyle = st[1]; ctx.lineWidth = 1; ctx.stroke(); }
  }
}

function renderLeisure(list) {
  for (const w of list) {
    if (!w.closed) continue;
    const st = LEISURE_STYLE[w.tags.leisure];
    if (!st) continue;
    pathWay(w);
    if (st[0]) { ctx.fillStyle = st[0]; ctx.fill(); }
    if (st[1]) { ctx.strokeStyle = st[1]; ctx.lineWidth = 1; ctx.stroke(); }
  }
}

function renderWaterways(list) {
  const ww = { river:4, stream:2, canal:3, drain:1.5, ditch:1 };
  for (const w of list) {
    const wtype = w.tags.waterway;
    if (w.closed) {
      pathWay(w);
      ctx.fillStyle = '#162e48'; ctx.fill();
      ctx.strokeStyle = '#1a3850'; ctx.lineWidth = 1; ctx.stroke();
    } else {
      pathWay(w);
      ctx.strokeStyle = '#1a3850';
      ctx.lineWidth   = (ww[wtype] || 1.5) * Math.max(0.5, zoom / 14);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash([]); ctx.stroke();
    }
  }
}

function renderRailways(list) {
  const zf = zoom / 14;
  for (const w of list) {
    const rt = w.tags.railway;
    if (!['rail','subway','tram','light_rail','narrow_gauge'].includes(rt)) continue;
    // PERF: getProj() is cached — second call per way in renderHighways won't recompute
    const pts = getProj(w);
    if (pts.length < 2) continue;
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = '#252a38'; ctx.lineWidth = (rt === 'rail' ? 6 : 3.5) * zf;
    ctx.setLineDash([]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = '#505868'; ctx.lineWidth = (rt === 'rail' ? 3 : 1.5) * zf;
    ctx.setLineDash(rt === 'rail' ? [10 * zf, 8 * zf] : []); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function renderHighways(list) {
  const sorted = [...list].sort((a, b) => {
    const ai = ROAD_ORDER.indexOf(a.tags.highway);
    const bi = ROAD_ORDER.indexOf(b.tags.highway);
    return (ai === -1 ? 0 : ai) - (bi === -1 ? 0 : bi);
  });
  const zf = zoom / 14;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // First pass: casings
  for (const w of sorted) {
    const st = ROAD[w.tags.highway];
    if (!st || !st.c) continue;
    const pts = getProj(w); // PERF: cached from here; second pass below is free
    if (pts.length < 2) continue;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = st.c; ctx.lineWidth = st.cw * zf;
    ctx.setLineDash([]); ctx.stroke();
  }

  // Second pass: fills (getProj hits cache — no recomputation)
  for (const w of sorted) {
    const st = ROAD[w.tags.highway];
    if (!st) continue;
    const pts = getProj(w);
    if (pts.length < 2) continue;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (st.f) {
      ctx.strokeStyle = st.f; ctx.lineWidth = st.fw * zf; ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = st.s; ctx.lineWidth = st.w * zf;
      ctx.setLineDash(st.d ? st.d.map(v => v * Math.max(0.8, zf)) : []);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function renderBuildings(list) {
  const zf  = zoom / 14;
  const off = Math.max(1, 2.5 * zf);
  for (const w of list) {
    if (!w.closed) continue;
    const pts = getProj(w);
    if (pts.length < 3) continue;
    if (zoom >= 15) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x + off, pts[0].y + off);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + off, pts[i].y + off);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = '#232940'; ctx.fill();
    ctx.strokeStyle = '#374060'; ctx.lineWidth = 0.9; ctx.stroke();
  }
}

function renderLabels(candidates) {
  if (zoom < 15) return;

  // PERF: Set shared ctx state once outside the loop instead of per-way
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin     = 'round';
  ctx.miterLimit   = 2;
  ctx.lineWidth    = 3;
  ctx.strokeStyle  = '#171c28';

  let lastFont  = '';
  let lastColor = '';

  for (const w of candidates) {
    // candidates are pre-filtered in buildLabelCandidates() — no geo/name check needed here
    const info = featureLabel(w);

    const c  = w.closed ? centroid(w) : w.geo[Math.floor(w.geo.length / 2)];
    const sp = ll2s(c.lat, c.lon);

    // PERF: only update ctx.font when it actually changes
    const nameFont = "bold 10px 'Space Mono', monospace";
    if (lastFont !== nameFont) { ctx.font = nameFont; lastFont = nameFont; }

    // Halo
    ctx.strokeText(info.name || info.type, sp.x, sp.y);

    // Name — only update fillStyle when color changes
    if (lastColor !== info.color) { ctx.fillStyle = info.color; lastColor = info.color; }
    ctx.fillText(info.name || info.type, sp.x, sp.y);

    // Height label
    if (info.height) {
      const hFont = "9px 'Space Mono', monospace";
      if (lastFont !== hFont) { ctx.font = hFont; lastFont = hFont; }
      const hColor = 'rgba(154, 160, 184, 0.9)';
      if (lastColor !== hColor) { ctx.fillStyle = hColor; lastColor = hColor; }
      ctx.fillText(`H: ${info.height.toFixed(0)}m`, sp.x, sp.y + 12);
    }
  }
}

function renderPins() {
  const zf = Math.max(0.7, Math.min(1.6, zoom / 14));
  const r  = 9 * zf;
  for (const pin of pins) {
    const sp = ll2s(pin.lat, pin.lon);
    if (sp.x < -50 || sp.x > canvas.width + 50 ||
        sp.y < -50 || sp.y > canvas.height + 50) continue;
    ctx.beginPath(); ctx.arc(sp.x + 2, sp.y + 2, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
    ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
    ctx.fillStyle = pin.color || '#e8d44d';
    ctx.strokeStyle = '#0d0f14'; ctx.lineWidth = 1.5;
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(sp.x, sp.y, r * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = '#0d0f14'; ctx.fill();
    if (pin.label && zoom >= 13) {
      const sz = Math.round(9 * zf);
      ctx.font = `bold ${sz}px 'Space Mono', monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(13,15,20,0.88)';
      ctx.fillText(pin.label, sp.x + 1, sp.y - r - 3);
      ctx.fillStyle = pin.color || '#e8d44d';
      ctx.fillText(pin.label, sp.x, sp.y - r - 4);
    }
  }
}

// ── Selection state ───────────────────────────────────────────────────────────
let selectedWay = null;

function pointInPolygon(sx, sy, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    if (((yi > sy) !== (yj > sy)) && (sx < (xj - xi) * (sy - yi) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

function pointNearLine(sx, sy, pts, thresh) {
  const t2 = thresh * thresh;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].x,   ay = pts[i].y;
    const bx = pts[i+1].x, by = pts[i+1].y;
    const dx = bx - ax,    dy = by - ay;
    const lenSq = dx*dx + dy*dy;
    if (lenSq === 0) continue;
    const t = Math.max(0, Math.min(1, ((sx-ax)*dx + (sy-ay)*dy) / lenSq));
    const px = ax + t*dx - sx, py = ay + t*dy - sy;
    if (px*px + py*py < t2) return true;
  }
  return false;
}

function hitTest(sx, sy) {
  // PERF: getProj() reuses the same cache built during the last render() call.
  // No redundant ll2s() calls here — if render() ran since the last pan/zoom,
  // all pts are already cached.
  const candidates = [...ways].reverse();

  for (const w of candidates) {
    if ((w.tags.building || w.tags['building:part']) && w.closed)
      if (pointInPolygon(sx, sy, getProj(w))) return w;
  }
  for (const w of candidates) {
    if ((w.tags.leisure || w.tags.natural) && w.closed)
      if (pointInPolygon(sx, sy, getProj(w))) return w;
  }
  for (const w of candidates) {
    if (w.tags.highway) {
      const thresh = w.tags.highway.match(/motorway|trunk|primary/) ? 14 : 8;
      if (pointNearLine(sx, sy, getProj(w), thresh)) return w;
    }
  }
  for (const w of candidates) {
    if (w.tags.waterway) {
      const pts = getProj(w);
      if (w.closed && pointInPolygon(sx, sy, pts)) return w;
      if (!w.closed && pointNearLine(sx, sy, pts, 8)) return w;
    }
  }
  for (const w of candidates) {
    if (w.tags.landuse && w.closed)
      if (pointInPolygon(sx, sy, getProj(w))) return w;
  }
  return null;
}

function getFeatureHeight(tags) {
  if (tags.height) return parseFloat(tags.height);
  if (tags['building:levels']) return parseFloat(tags['building:levels']) * 3.5;
  if (tags.ele) return parseFloat(tags.ele);
  return null;
}

function featureLabel(w) {
  const t = w.tags;
  const name = t.name || '';
  const height = getFeatureHeight(t);
  let info = { type: 'Feature', name, color: '#e8d44d', height };

  if (t.building) {
    info.type = 'Building';
    info.name = name || (t.building !== 'yes' ? t.building : '');
    info.color = '#4de8b4';
  } else if (t.highway) {
    info.type = 'Road';
    info.name = name || t.highway;
  } else if (t.waterway) {
    info.type = 'Waterway';
    info.name = name || t.waterway;
    info.color = '#4da8e8';
  } else if (t.natural) {
    info.type = 'Natural';
    info.name = name || t.natural;
    info.color = '#4de8a0';
  } else if (t.leisure) {
    info.type = 'Leisure';
    info.name = name || t.leisure;
    info.color = '#4de8a0';
  } else if (t.landuse) {
    info.type = 'Land use';
    info.name = name || t.landuse;
    info.color = '#a0a8d0';
  } else if (t.railway) {
    info.type = 'Railway';
    info.name = name || t.railway;
    info.color = '#8080b0';
  }

  return info;
}

// ── Highlight renderer ────────────────────────────────────────────────────────
function renderHighlight() {
  if (!selectedWay) return;
  const w   = selectedWay;
  const pts = getProj(w); // PERF: cached — no recomputation
  if (pts.length < 2) return;

  const info   = featureLabel(w);
  const isLine = !w.closed || w.tags.highway || w.tags.waterway;

  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  if (!isLine && w.closed) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = info.color + '28'; ctx.fill();
    ctx.strokeStyle = info.color; ctx.lineWidth = 2.5; ctx.setLineDash([]); ctx.stroke();
    ctx.strokeStyle = info.color + 'aa'; ctx.lineWidth = 1.2;
    const t = (Date.now() / 400) % 12;
    ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = info.color + '55'; ctx.lineWidth = 14; ctx.setLineDash([]); ctx.stroke();
    ctx.strokeStyle = info.color; ctx.lineWidth = 3; ctx.stroke();
    const t = (Date.now() / 400) % 12;
    ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t; ctx.stroke();
  }
  ctx.restore();

  // Info chip
  const mid = pts[Math.floor(pts.length / 2)];
  const cx  = Math.max(10, Math.min(canvas.width  - 200, mid.x - 80));
  const cy  = Math.max(10, Math.min(canvas.height - 60,  mid.y - 48));
  const lbl = info.name ? `${info.type}: ${info.name}` : info.type;

  ctx.save();
  ctx.font = "bold 11px 'Space Mono', monospace";
  const tw = ctx.measureText(lbl).width;
  const pw = tw + 20, ph = 28;
  ctx.fillStyle = 'rgba(17,21,32,0.92)'; ctx.strokeStyle = info.color; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(cx, cy, pw, ph, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = info.color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(lbl, cx + 10, cy + ph / 2);
  ctx.restore();

  // NOTE: requestAnimationFrame(render) is intentionally removed here.
  // The highlight loop is driven by hlTick() via startHighlightLoop().
}

function renderTopology() {
  if (!terrainGrid.length || zoom < 14) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillStyle   = 'rgba(255, 255, 255, 0.5)';
  ctx.font        = "9px 'Space Mono', monospace";
  for (const pt of terrainGrid) {
    const sp = ll2s(pt.latitude, pt.longitude);
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 1, 0, Math.PI * 2); ctx.fill();
    if (Math.round(pt.elevation) % CONTOUR_INTERVAL === 0) {
      ctx.fillText(`EL ${Math.round(pt.elevation)}m`, sp.x + 5, sp.y - 2);
    }
  }
  ctx.restore();
}

// ── Main render ───────────────────────────────────────────────────────────────
function render() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#171c28';
  ctx.fillRect(0, 0, W, H);

  if (zoom < MIN_ZOOM) {
    ctx.fillStyle = 'rgba(232,212,77,0.18)';
    ctx.font = "bold 14px 'Space Mono', monospace";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Zoom in to level 14 to load street data', W / 2, H / 2);
    renderPins();
    return;
  }

  renderTopology();
  renderLanduse(buckets.landuse);
  renderNatural(buckets.natural);
  renderLeisure(buckets.leisure);
  renderWaterways(buckets.waterways);
  renderRailways(buckets.railways);
  renderHighways(buckets.highways);
  renderBuildings(buckets.buildings);

  // PERF: renderLabels now receives pre-filtered candidates, not all ways
  if (!panning && zoom >= 15) {
    renderLabels(labelCandidates);
  }

  renderPins();

  if (selectedWay) {
    renderHighlight();
  }

  if (loading) {
    const label = '⟳  Updating…';
    ctx.font = "11px 'Space Mono', monospace";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(17,21,32,0.88)';
    ctx.fillRect(14, 14, tw + 20, 26);
    ctx.fillStyle = '#e8d44d';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 24, 14 + 13);
  }

  if (!loading && ways.length === 0 && lastFetchError) {
    renderErrorState(W, H);
  }
}

function renderErrorState(W, H) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(232,77,77,0.15)';
  ctx.fillRect(W/2 - 240, H/2 - 40, 480, 80);
  ctx.fillStyle = '#e84d4d';
  ctx.font = "bold 12px 'Space Mono', monospace";
  ctx.fillText('FETCH FAILED: ' + lastFetchError, W/2, H/2);
}

function drawSpinner(cx, cy) {
  const t = Date.now() / 1000;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 2);
  ctx.strokeStyle = '#e8d44d'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 1.5); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(232,212,77,0.5)';
  ctx.font = "12px 'Space Mono', monospace";
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('Fetching OSM data…', cx, cy + 36);
  if (loading && ways.length === 0) requestAnimationFrame(render);
}

// ── Interaction ───────────────────────────────────────────────────────────────
canvas.addEventListener('mousedown', e => {
  panning  = true;
  panStart = { x: e.clientX, y: e.clientY };
  panCen   = { lat: centerLat, lon: centerLon };
  canvas.classList.add('panning');
});

window.addEventListener('mousemove', e => {
  if (!panning) { const ll = s2ll(e.clientX, e.clientY); setLiveCoords(ll.lat, ll.lon); return; }
  const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
  const sc = scale(), cw = ll2w(panCen.lat, panCen.lon);
  const nw = { x: cw.x - dx / sc, y: cw.y - dy / sc };
  const nl = w2ll(nw.x, nw.y);
  centerLat = Math.max(-85, Math.min(85, nl.lat));
  centerLon = nl.lon;
  // PERF: bump projStamp so cached screen coords are recomputed on next render
  invalidateProj();
  render(); updateUI();
});

window.addEventListener('mouseup', e => {
  if (!panning) return;
  const dx   = e.clientX - panStart.x, dy = e.clientY - panStart.y;
  const dist = Math.hypot(dx, dy);
  panning = false; canvas.classList.remove('panning');
  if (dist < 5) {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit !== selectedWay) {
      selectedWay = hit;
      if (hit) startHighlightLoop(); else stopHighlightLoop();
      render();
    } else if (!hit) {
      selectedWay = null;
      stopHighlightLoop();
      render();
    }
  } else {
    schedule();
  }
});

canvas.addEventListener('mouseleave', () => setLiveCoords(centerLat, centerLon));

canvas.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) return;
  const t = e.touches[0];
  panning = true; panStart = { x: t.clientX, y: t.clientY };
  panCen  = { lat: centerLat, lon: centerLon };
}, { passive: true });

canvas.addEventListener('touchmove', e => {
  if (!panning || e.touches.length !== 1) return;
  e.preventDefault();
  const t = e.touches[0];
  const dx = t.clientX - panStart.x, dy = t.clientY - panStart.y;
  const sc = scale(), cw = ll2w(panCen.lat, panCen.lon);
  const nw = { x: cw.x - dx / sc, y: cw.y - dy / sc };
  const nl = w2ll(nw.x, nw.y);
  centerLat = Math.max(-85, Math.min(85, nl.lat));
  centerLon = nl.lon;
  invalidateProj(); // PERF: screen coords are stale after pan
  render(); updateUI();
}, { passive: false });

canvas.addEventListener('touchend', e => {
  if (!panning) return;
  const t    = e.changedTouches[0];
  const dist = Math.hypot(t.clientX - panStart.x, t.clientY - panStart.y);
  panning = false;
  if (dist < 8) {
    const hit = hitTest(t.clientX, t.clientY);
    if (hit !== selectedWay) {
      selectedWay = hit;
      if (hit) startHighlightLoop(); else stopHighlightLoop();
      render();
    } else {
      selectedWay = null;
      stopHighlightLoop();
      render();
    }
  } else {
    schedule();
  }
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const step = e.deltaY < 0 ? 0.5 : -0.5;
  const mLL  = s2ll(e.clientX, e.clientY);
  zoom       = Math.max(1, Math.min(19, zoom + step));
  const sc   = scale();
  const mW   = ll2w(mLL.lat, mLL.lon);
  const newCW = { x: mW.x - (e.clientX - canvas.width / 2) / sc, y: mW.y - (e.clientY - canvas.height / 2) / sc };
  const nll  = w2ll(newCW.x, newCW.y);
  centerLat  = Math.max(-85, Math.min(85, nll.lat));
  centerLon  = nll.lon;
  invalidateProj(); // PERF: zoom changed, all screen coords are stale
  updateUI(); render(); schedule();
}, { passive: false });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    selectedWay = null;
    stopHighlightLoop(); // PERF: kill the highlight RAF when deselecting via keyboard
    render();
  }
  if (document.activeElement.tagName === 'INPUT') return;
  const pan = 0.001 * Math.pow(2, 14 - zoom);
  if (e.key === '+' || e.key === '=') { zoom = Math.min(19, zoom + 1); invalidateProj(); updateUI(); render(); schedule(); }
  if (e.key === '-')                   { zoom = Math.max(1,  zoom - 1); invalidateProj(); updateUI(); render(); schedule(); }
  if (e.key === 'ArrowUp')    { centerLat = Math.min(85,  centerLat + pan * 1.2); invalidateProj(); render(); }
  if (e.key === 'ArrowDown')  { centerLat = Math.max(-85, centerLat - pan * 1.2); invalidateProj(); render(); }
  if (e.key === 'ArrowLeft')  { centerLon -= pan * 2; invalidateProj(); render(); }
  if (e.key === 'ArrowRight') { centerLon += pan * 2; invalidateProj(); render(); }
});

// ── Debounce scheduler ────────────────────────────────────────────────────────
function schedule() {
  clearTimeout(fetchTimer);
  const wait = Math.max(DEBOUNCE, backoffUntil - Date.now() + 100);
  fetchTimer = setTimeout(fetchData, wait);
}

// ── UI helpers ────────────────────────────────────────────────────────────────
const elLive = document.getElementById('live-coords');
const elSbZ  = document.getElementById('sb-zoom');
const elSbC  = document.getElementById('sb-center');
const elZNum = document.getElementById('zoom-num');
const elSt   = document.getElementById('st');

function setLiveCoords(lat, lon) {
  elLive.textContent = `LAT ${lat.toFixed(5)}  LON ${lon.toFixed(5)}`;
}
function updateUI() {
  elZNum.textContent = Math.round(zoom);
  elSbZ.textContent  = zoom.toFixed(1);
  elSbC.textContent  = `${centerLat.toFixed(4)}, ${centerLon.toFixed(4)}`;
  setLiveCoords(centerLat, centerLon);
}
function setStatus(msg) { elSt.textContent = msg; }

document.getElementById('btn-zi').addEventListener('click', () => { zoom = Math.min(19, zoom + 1); invalidateProj(); updateUI(); render(); schedule(); });
document.getElementById('btn-zo').addEventListener('click', () => { zoom = Math.max(1,  zoom - 1); invalidateProj(); updateUI(); render(); schedule(); });

const iLat  = document.getElementById('i-lat');
const iLon  = document.getElementById('i-lon');
const iZoom = document.getElementById('i-zoom');
const errEl = document.getElementById('err');

function goTo() {
  const lat = parseFloat(iLat.value);
  const lon = parseFloat(iLon.value);
  const z   = parseInt(iZoom.value) || 16;
  errEl.style.display = 'none';
  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    errEl.style.display = 'block'; return;
  }
  centerLat = lat; centerLon = lon;
  zoom = Math.max(14, Math.min(19, z));
  pins = [{ lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, color: '#4de8b4' }];
  invalidateProj();
  updateUI(); render(); schedule();
}

document.getElementById('btn-go').addEventListener('click', goTo);
document.getElementById('btn-clr').addEventListener('click', () => {
  iLat.value = ''; iLon.value = ''; iZoom.value = '16';
  errEl.style.display = 'none';
  pins = pins.filter(p => p.color !== '#4de8b4');
  render();
});
[iLat, iLon, iZoom].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') goTo(); }));

// ── Location list ─────────────────────────────────────────────────────────────
const unifiedLocations = [
  { name: "🗼 Paris - Eiffel Tower",         lat: 48.8584,  lon: 2.2945    },
  { name: "🏫 Alliance High School (Kenya)",  lat: -1.259944,  lon: 36.667270   },
  { name: "🗽 New York - Times Square",       lat: 40.7580,  lon: -73.9855  },
  { name: "🇬🇧 London - Trafalgar Square",    lat: 51.5074,  lon: -0.1278   },
  { name: "🇯🇵 Tokyo - Shibuya",              lat: 35.6587,  lon: 139.7456  },
  { name: "🇩🇪 Berlin - Alexanderplatz",      lat: 52.5200,  lon: 13.4050   },
  { name: "🏺 Great Pyramid of Giza",         lat: 29.9792,  lon: 31.1342   },
  { name: "🏛️ Paris - Arc de Triomphe",       lat: 48.8738,  lon: 2.2950    },
  { name: "🎡 London - Big Ben",              lat: 51.5007,  lon: -0.1246   },
  { name: "🌉 San Francisco - Golden Gate",   lat: 37.8199,  lon: -122.4783 },
];

const locList = document.getElementById('loc-list');
unifiedLocations.forEach(loc => {
  const el = document.createElement('div');
  el.className = 'loc';
  el.innerHTML = `<div class="ln">${loc.name}</div><div class="lc">${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}</div>`;
  el.addEventListener('click', () => {
    if (activeLocEl) activeLocEl.classList.remove('active');
    activeLocEl = el; el.classList.add('active');
    centerLat = loc.lat; centerLon = loc.lon;
    zoom = 16;
    pins = pins.filter(p => p.color !== '#e8d44d');
    pins.push({ lat: loc.lat, lon: loc.lon, label: loc.name.replace(/^\S+\s/, ''), color: '#e8d44d' });
    invalidateProj();
    updateUI(); render(); schedule();
  });
  locList.appendChild(el);
});

// ── Init ──────────────────────────────────────────────────────────────────────
resize();
updateUI();
schedule();