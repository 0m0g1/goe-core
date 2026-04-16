/**
 * GOE Core — OSMLayerRenderer
 * * MAP-PERF 6: Vertex Grid Projection & Hoisted Math
 * -------------------------------------------------
 * 1. Hoisted Math: Inline projection math (lon2x, etc.) moved to module level 
 * to avoid re-allocating functions on every single frame.
 * 2. Vertex Grid Projection: Instead of projecting 3 corners independently for 
 * EVERY tile (executing complex trig 3x per tile), we project a shared grid 
 * of vertices once. Adjacent tiles reuse the same projected corners, 
 * cutting the heavy projection math by ~60-66%.
 */
import {
  worldToScreen, tileHalfWidth, tileHalfHeight, screenToWorld,
} from '../math/projection.js';
import { geoToTile, tileToGeo } from '../math/geo.js';

// ─── Module-Level Math Helpers ───────────────────────────────────────────────
// Hoisted out of the draw loop to prevent garbage collection churn.
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function lon2x(lon, n) { 
  return (lon + 180) / 360 * n; 
}

function lat2y(lat, n) {
  const l = lat * D2R;
  return (1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2 * n;
}

function tile2lon(x, n) { 
  return x / n * 360 - 180; 
}

function tile2lat(y, n) {
  const l = Math.PI - 2 * Math.PI * y / n;
  return R2D * Math.atan(0.5 * (Math.exp(l) - Math.exp(-l)));
}


// ─── Bounded LRU tile image cache ────────────────────────────────────────────
const TILE_CACHE_MAX = 256;
const TILE_CACHE = new Map();

function getSlippyTile(z, x, y, urlFn) {
  const n = Math.pow(2, z);
  const ix = Math.floor(((x % n) + n) % n);
  const iy = Math.floor(Math.max(0, Math.min(n - 1, y)));
  const key = `${z}/${ix}/${iy}`;

  if (TILE_CACHE.has(key)) {
    // Fast LRU bump
    const obj = TILE_CACHE.get(key);
    TILE_CACHE.delete(key);
    TILE_CACHE.set(key, obj);
    return obj;
  }

  if (TILE_CACHE.size >= TILE_CACHE_MAX) {
    const oldestKey = TILE_CACHE.keys().next().value;
    TILE_CACHE.delete(oldestKey);
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = urlFn(z, ix, iy);
  const obj = { img, loaded: false };
  img.onload = () => { obj.loaded = true; };
  TILE_CACHE.set(key, obj);
  return obj;
}

export function evictTileCache(z) {
  if (z === undefined) { TILE_CACHE.clear(); return; }
  for (const key of TILE_CACHE.keys()) {
    if (key.startsWith(`${z}/`)) TILE_CACHE.delete(key);
  }
}

// ─── Renderer ────────────────────────────────────────────────────────────────

export class OSMLayerRenderer {
  /**
   * @param {WorldRenderer} worldRenderer
   * @param {(z:number,x:number,y:number)=>string} urlFn
   * @param {number} [maxTiles=256]
   */
  constructor(worldRenderer, urlFn, maxTiles = 256) {
    this._wr = worldRenderer;
    this.urlFn = urlFn;
    this.maxTiles = maxTiles;
    this._currentOsmZoom = undefined;
    
    // Pre-allocated array to avoid creating a new one every frame
    this._vertexGrid = []; 
  }

  get ctx() { return this._wr.ctx; }
  get cam() { return this._wr.cam; }

  setURLFn(urlFn) { this.urlFn = urlFn; }

  draw(canvas, geoCenter) {
    const { cam, urlFn, _wr: wr } = this;
    const dpr = window.devicePixelRatio || 1;

    // 1. Calculate OSM zoom level
    const zoomBias = dpr > 1 ? 0.5 : 0.1;
    let osmZ = Math.ceil(
      Math.log2(250468 * cam.zoom * Math.cos(geoCenter.lat * D2R)) + zoomBias
    );
    osmZ = Math.max(0, Math.min(19, osmZ));

    this._currentOsmZoom = osmZ;

    // 2. Get viewport boundaries in Geo coordinates
    const corners = [
      [0, 0], [canvas.width, 0], [0, canvas.height], [canvas.width, canvas.height],
    ].map(([sx, sy]) => {
      const w = screenToWorld(sx, sy, cam);
      return tileToGeo(w.x, w.y, geoCenter, cam.mPerTile, cam.mapW, cam.mapH);
    });

    const lats = corners.map(c => c.lat);
    const lons = corners.map(c => c.lon);
    const minLat = Math.max(-85.05, Math.min(...lats));
    const maxLat = Math.min( 85.05, Math.max(...lats));
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    let z = osmZ;
    let n = Math.pow(2, z);
    let minX = Math.floor(lon2x(minLon, n));
    let maxX = Math.floor(lon2x(maxLon, n));
    let minY = Math.floor(lat2y(maxLat, n));
    let maxY = Math.floor(lat2y(minLat, n));

    // 3. Safety cap: Drop zoom only if we exceed maxTiles
    while ((maxX - minX + 1) * (maxY - minY + 1) > this.maxTiles && z > 0) {
      z--;
      n = Math.pow(2, z);
      minX = Math.floor(lon2x(minLon, n));
      maxX = Math.floor(lon2x(maxLon, n));
      minY = Math.floor(lat2y(maxLat, n));
      maxY = Math.floor(lat2y(minLat, n));
    }

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    // 4. MAP-PERF 6: Generate the shared Vertex Grid
    // We calculate the corners ONCE into a flat array. 
    // +2 ensures we have enough points to define the bottom and right edges of the tiles.
    const yCount = (maxY - minY + 2); 
    this._vertexGrid.length = 0; // Clear without reallocating

    for (let x = minX; x <= maxX + 1; x++) {
      for (let y = minY; y <= maxY + 1; y++) {
        // Compute continuous longitude to prevent snapping across the antimeridian
        const lon = tile2lon(x, n);
        const lat = tile2lat(y, n);

        const wTile = geoToTile(lat, lon, geoCenter, cam.mPerTile, cam.mapW, cam.mapH);
        const pt = worldToScreen(wTile.x, wTile.y, 0, cam);
        
        this._vertexGrid.push(pt);
      }
    }

    // Helper to extract a vertex from the flat 1D array
    const getVert = (vx, vy) => this._vertexGrid[(vx - minX) * yCount + (vy - minY)];

    // 5. Render tiles using the pre-calculated vertex grid
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (y < 0 || y >= n) continue;

        // Wrapped X for continuous panning
        const worldX = ((x % n) + n) % n;
        const tile = getSlippyTile(z, worldX, y, urlFn);
        
        if (!tile.loaded) continue;

        // Grab corners instantly from the pre-calculated grid
        const p1 = getVert(x, y);         // North-West
        const p2 = getVert(x + 1, y);     // North-East
        const p4 = getVert(x, y + 1);     // South-West

        // Render with a 0.5px overlap to prevent sub-pixel gaps (seams)
        wr.drawTransformedImage(
          tile.img,
          {
            m11: (p2.x - p1.x) / 256,
            m12: (p2.y - p1.y) / 256,
            m21: (p4.x - p1.x) / 256,
            m22: (p4.y - p1.y) / 256,
            dx:  p1.x,
            dy:  p1.y,
          },
          256.5,
          256.5,
        );
      }
    }
  }

  setGeoCenter(geo) {
    this._geoCenter = geo;
  }

  resetTileCache() {
    evictTileCache(this._currentOsmZoom);
  }
}