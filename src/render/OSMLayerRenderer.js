/**
 * GOE Core — OSMLayerRenderer
 * * Optimized for sharpness and memory efficiency.
 */
import {
  worldToScreen, tileHalfWidth, tileHalfHeight, screenToWorld,
} from '../math/projection.js';
import { geoToTile, tileToGeo } from '../math/geo.js';

// ─── Bounded LRU tile image cache ────────────────────────────────────────────

const TILE_CACHE_MAX = 256;
const TILE_CACHE = new Map();

function getSlippyTile(z, x, y, urlFn) {
  const n = Math.pow(2, z);
  const ix = Math.floor(((x % n) + n) % n);
  const iy = Math.floor(Math.max(0, Math.min(n - 1, y)));
  const key = `${z}/${ix}/${iy}`;

  if (TILE_CACHE.has(key)) {
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
   * @param {number} [maxTiles=256] - Increased default to support high-res screens
   */
  constructor(worldRenderer, urlFn, maxTiles = 256) {
    this._wr = worldRenderer;
    this.urlFn = urlFn;
    this.maxTiles = maxTiles;
    this._currentOsmZoom = undefined;
  }

  get ctx() { return this._wr.ctx; }
  get cam() { return this._wr.cam; }

  setURLFn(urlFn) { this.urlFn = urlFn; }

  draw(canvas, geoCenter) {
    const { cam, urlFn, _wr: wr } = this;
    const dpr = window.devicePixelRatio || 1;

    // 1. Calculate OSM zoom level
    // We use Math.ceil and a small bias (+0.1) to ensure we jump to the higher-res 
    // tile earlier. We also factor in DPR so Retina screens don't look blurry.
    const zoomBias = dpr > 1 ? 0.5 : 0.1;
    let osmZ = Math.ceil(
      Math.log2(250468 * cam.zoom * Math.cos(geoCenter.lat * Math.PI / 180)) + zoomBias
    );
    osmZ = Math.max(0, Math.min(19, osmZ));

    this._currentOsmZoom = osmZ;
    const numTiles = Math.pow(2, osmZ);

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

    const lon2x = (lon, z) => (lon + 180) / 360 * Math.pow(2, z);
    const lat2y = (lat, z) => {
      const l = lat * Math.PI / 180;
      return (1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2 * Math.pow(2, z);
    };

    let z = osmZ;
    let minX = Math.floor(lon2x(minLon, z));
    let maxX = Math.floor(lon2x(maxLon, z));
    let minY = Math.floor(lat2y(maxLat, z));
    let maxY = Math.floor(lat2y(minLat, z));

    // 3. Safety cap: Drop zoom only if we exceed maxTiles
    while ((maxX - minX + 1) * (maxY - minY + 1) > this.maxTiles && z > 0) {
      z--;
      minX = Math.floor(lon2x(minLon, z));
      maxX = Math.floor(lon2x(maxLon, z));
      minY = Math.floor(lat2y(maxLat, z));
      maxY = Math.floor(lat2y(minLat, z));
    }

    const tile2lon = (x, zoom) => x / Math.pow(2, zoom) * 360 - 180;
    const tile2lat = (y, zoom) => {
      const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
      return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    };

    // 4. Render tiles
    // We disable image smoothing if we want that "pixel-perfect" crispness 
    // when slightly upscaling, but keeping it on is usually better for maps.
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const nAtZ = Math.pow(2, z);
        if (y < 0 || y >= nAtZ) continue;

        // Wrapped X for continuous panning
        const worldX = ((x % nAtZ) + nAtZ) % nAtZ;
        const tile = getSlippyTile(z, worldX, y, urlFn);
        if (!tile.loaded) continue;

        const tNw = geoToTile(tile2lat(y, z),     tile2lon(x, z),     geoCenter, cam.mPerTile, cam.mapW, cam.mapH);
        const tNe = geoToTile(tile2lat(y, z),     tile2lon(x + 1, z), geoCenter, cam.mPerTile, cam.mapW, cam.mapH);
        const tSw = geoToTile(tile2lat(y + 1, z), tile2lon(x, z),     geoCenter, cam.mPerTile, cam.mapW, cam.mapH);

        const p1 = worldToScreen(tNw.x, tNw.y, 0, cam);
        const p2 = worldToScreen(tNe.x, tNe.y, 0, cam);
        const p4 = worldToScreen(tSw.x, tSw.y, 0, cam);

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