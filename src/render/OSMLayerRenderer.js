/**
 * GOE Core — OSMLayerRenderer
 * Renders standard XYZ slippy-map tiles onto the isometric canvas using
 * affine matrix transforms — tiles appear flat at low zoom, tilted at high zoom.
 *
 * Tile images are cached globally across engine instances.
 */
import {
  worldToScreen, tileHalfWidth, tileHalfHeight, screenToWorld,
} from '../math/projection.js';
import { geoToTile, tileToGeo, slippyTileToLatLon, latLonToSlippy } from '../math/geo.js';

// ─── GLOBAL TILE IMAGE CACHE ─────────────────────────────────────────────────

const TILE_CACHE = new Map();

function getSlippyTile(z, x, y, urlFn) {
  const n  = Math.pow(2, z);
  const ix = Math.floor(((x % n) + n) % n);
  const iy = Math.floor(Math.max(0, Math.min(n - 1, y)));
  const key = `${z}/${ix}/${iy}`;
  if (TILE_CACHE.has(key)) return TILE_CACHE.get(key);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = urlFn(z, ix, iy);
  const obj = { img, loaded: false };
  img.onload = () => { obj.loaded = true; };
  TILE_CACHE.set(key, obj);
  return obj;
}

/** Evict tiles for a specific z level — useful when switching tile sources */
export function evictTileCache(z) {
  if (z === undefined) { TILE_CACHE.clear(); return; }
  for (const key of TILE_CACHE.keys()) {
    if (key.startsWith(`${z}/`)) TILE_CACHE.delete(key);
  }
}

// ─── RENDERER ────────────────────────────────────────────────────────────────

export class OSMLayerRenderer {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} cam
   * @param {(z:number,x:number,y:number)=>string} urlFn  Tile URL factory
   * @param {number} [maxTiles=120]  Safety cap on tiles per frame
   */
  constructor(ctx, cam, urlFn, maxTiles = 120) {
    this.ctx      = ctx;
    this.cam      = cam;
    this.urlFn    = urlFn;
    this.maxTiles = maxTiles;
  }

  /** Replace the tile URL factory (e.g. switching from OSM to satellite). */
  setURLFn(urlFn) {
    this.urlFn = urlFn;
  }

  /**
   * Draw the OSM tile layer for the current frame.
   * @param {HTMLCanvasElement} canvas
   * @param {{lat:number, lon:number}} geoCenter
   */
  draw(canvas, geoCenter) {
    const { ctx, cam, urlFn } = this;

    // 1. Choose OSM zoom level
    let osmZ = Math.round(
      Math.log2(250468 * cam.zoom * Math.cos(geoCenter.lat * Math.PI / 180))
    );
    osmZ = Math.max(0, Math.min(19, osmZ));
    const numTiles = Math.pow(2, osmZ);

    // 2. Find geo corners of the canvas
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
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);

    const lon2x = lon => (lon + 180) / 360 * numTiles;
    const lat2y = lat => {
      const l = lat * Math.PI / 180;
      return (1 - Math.log(Math.tan(l) + 1/Math.cos(l)) / Math.PI) / 2 * numTiles;
    };

    let minX = Math.floor(lon2x(minLon)), maxX = Math.floor(lon2x(maxLon));
    let minY = Math.floor(lat2y(maxLat)), maxY = Math.floor(lat2y(minLat));

    // 3. Safety cap
    let z = osmZ;
    while ((maxX-minX+1)*(maxY-minY+1) > this.maxTiles && z > 0) {
      z--;
      const nn = Math.pow(2, z);
      minX = Math.floor((minLon+180)/360*nn);
      maxX = Math.floor((maxLon+180)/360*nn);
      minY = Math.floor(lat2y(maxLat) / (numTiles/nn));
      maxY = Math.floor(lat2y(minLat) / (numTiles/nn));
    }

    const tile2lon = x => x / Math.pow(2, z) * 360 - 180;
    const tile2lat = y => {
      const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
      return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    };

    // 4. Render tiles
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (y < 0 || y >= Math.pow(2, z)) continue;
        const wx = ((x % numTiles) + numTiles) % numTiles;
        const tile = getSlippyTile(z, wx, y, urlFn);
        if (!tile.loaded) continue;

        const tNw = geoToTile(tile2lat(y),   tile2lon(x),   geoCenter, cam.mPerTile, cam.mapW, cam.mapH);
        const tNe = geoToTile(tile2lat(y),   tile2lon(x+1), geoCenter, cam.mPerTile, cam.mapW, cam.mapH);
        const tSw = geoToTile(tile2lat(y+1), tile2lon(x),   geoCenter, cam.mPerTile, cam.mapW, cam.mapH);

        const p1 = worldToScreen(tNw.x, tNw.y, 0, cam);
        const p2 = worldToScreen(tNe.x, tNe.y, 0, cam);
        const p4 = worldToScreen(tSw.x, tSw.y, 0, cam);

        ctx.save();
        const m11 = (p2.x-p1.x)/256, m12 = (p2.y-p1.y)/256;
        const m21 = (p4.x-p1.x)/256, m22 = (p4.y-p1.y)/256;
        ctx.setTransform(m11, m12, m21, m22, p1.x, p1.y);
        ctx.drawImage(tile.img, 0, 0, 256.5, 256.5);
        ctx.restore();
      }
    }
  }

  setGeoCenter(geo) {
    this._geoCenter = geo;
    this._tileCache?.clear(); // force re-fetch tiles for new location
  }
}