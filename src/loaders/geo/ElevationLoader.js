/**
 * GOE Core — ElevationLoader
 * Fetches RGB-encoded terrain elevation tiles (Terrarium or Mapbox format),
 * caches the decoded ImageData, and provides a synchronous per-pixel lookup.
 *
 * Compatible providers:
 *   • Nextzen Terrarium:  (R×256 + G + B/256) − 32768
 *   • Mapbox Terrain-RGB: −10000 + (R×65536 + G×256 + B) × 0.1
 *   • AWS Terrarium (S3 elevation-tiles-prod) — same formula as Nextzen
 */
import { latLonToSlippy } from '../../math/geo.js';

export const ElevationFormat = Object.freeze({
  TERRARIUM: 'terrarium',
  MAPBOX:    'mapbox',
});

const TILE_ZOOM   = 13;   // ~10 m/px resolution
const PRE_RADIUS  = 1;    // pre-warm N tiles in each direction
const _tileCache  = new Map();

// ─── DECODE ──────────────────────────────────────────────────────────────────

export function decodeTerr(r, g, b) { return r*256 + g + b/256 - 32768; }
export function decodeMapbox(r, g, b) { return -10000 + (r*65536 + g*256 + b)*0.1; }

// ─── LOAD ─────────────────────────────────────────────────────────────────────

function loadImageData(url) {
  const key = url;
  if (_tileCache.has(key)) return _tileCache.get(key);
  const p = new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d').drawImage(img, 0, 0, 256, 256);
      resolve(c.getContext('2d').getImageData(0, 0, 256, 256));
    };
    img.onerror = reject;
    img.src = url;
  });
  _tileCache.set(key, p);
  return p;
}

// ─── LOADER CLASS ─────────────────────────────────────────────────────────────

export class ElevationLoader {
  /**
   * @param {(z,x,y)=>string} urlFn  Tile URL factory
   * @param {string} [format]        ElevationFormat.TERRARIUM | MAPBOX
   * @param {number} [mPerTile]
   */
  constructor(urlFn, format = ElevationFormat.TERRARIUM, mPerTile = 2) {
    this._urlFn    = urlFn;
    this._format   = format;
    this._mPerTile = mPerTile;
    this._resolved = new Map(); // key → ImageData (resolved)
    this._status   = 'idle';    // 'idle'|'loading'|'ready'|'error'
    this._lastCenter = null;
  }

  get status() { return this._status; }

  /** Decode an RGB pixel to elevation metres. */
  _decode(r, g, b) {
    return this._format === ElevationFormat.MAPBOX ? decodeMapbox(r,g,b) : decodeTerr(r,g,b);
  }

  /**
   * Pre-fetch tiles around a geo centre.
   * @param {{ lat:number, lon:number }} geoCenter
   * @returns {Promise<void>}
   */
  async prefetch(geoCenter) {
    // Skip if centre hasn't moved meaningfully
    const prev = this._lastCenter;
    if (prev && Math.abs(prev.lat-geoCenter.lat)<0.001 && Math.abs(prev.lon-geoCenter.lon)<0.001)
      return;
    this._lastCenter = geoCenter;
    this._status = 'loading';

    const { tileX, tileY } = latLonToSlippy(geoCenter.lat, geoCenter.lon, TILE_ZOOM);
    const fetches = [];

    for (let dx = -PRE_RADIUS; dx <= PRE_RADIUS; dx++) {
      for (let dy = -PRE_RADIUS; dy <= PRE_RADIUS; dy++) {
        const x = tileX + dx, y = tileY + dy;
        const key = `${TILE_ZOOM}/${x}/${y}`;
        if (this._resolved.has(key)) continue;
        const url = this._urlFn(TILE_ZOOM, x, y);
        fetches.push(
          loadImageData(url)
            .then(id => this._resolved.set(key, id))
            .catch(() => {}) // missing tile → silent
        );
      }
    }

    await Promise.allSettled(fetches);
    this._status = 'ready';
  }

  /**
   * Synchronous elevation lookup — safe to call in the render loop.
   * Returns 0 if the tile hasn't loaded yet.
   * @param {number} lat
   * @param {number} lon
   * @returns {number} Elevation in metres
   */
  sampleElevation(lat, lon) {
    const { x, y, tileX, tileY } = latLonToSlippy(lat, lon, TILE_ZOOM);
    const key = `${TILE_ZOOM}/${tileX}/${tileY}`;
    const id  = this._resolved.get(key);
    if (!id) return 0;

    const px  = Math.min(255, Math.floor((x - tileX) * 256));
    const py  = Math.min(255, Math.floor((y - tileY) * 256));
    const idx = (py * 256 + px) * 4;
    const elevM = this._decode(id.data[idx], id.data[idx+1], id.data[idx+2]);
    return Math.max(-50, Math.min(8850, elevM));
  }

  /**
   * Convert a real-world elevation (metres) to engine tile-height units.
   * @param {number} elevM
   * @returns {number}
   */
  toTileHeight(elevM) {
    return Math.min(80, Math.max(0, elevM / this._mPerTile));
  }

  /** sampleElevation + convert to tile-height units. */
  sampleTileHeight(lat, lon) {
    return this.toTileHeight(this.sampleElevation(lat, lon));
  }

  clearCache() {
    this._resolved.clear();
    _tileCache.clear();
    this._lastCenter = null;
    this._status = 'idle';
  }
}