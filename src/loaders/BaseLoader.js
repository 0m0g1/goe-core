/**
 * GOE Core — BaseLoader
 * Abstract interface for all data loaders.
 *
 * A loader is responsible for fetching external data (tiles, OSM, elevation,
 * custom tilesets, etc.) and delivering it to the engine via callbacks.
 *
 * To create a custom loader:
 *   class MyLoader extends BaseLoader {
 *     async fetch(geoCenter, radius) { ... return { terrainUpdates, features } }
 *   }
 */
export class BaseLoader {
  constructor(options = {}) {
    this.options = options;
    this._active = false;
  }

  /** Unique string ID for this loader type, e.g. 'osm-terrain'. */
  get id() { return 'base'; }

  /**
   * Called by the Engine before the first fetch.
   * @param {object} engineRef  Reference to the Engine instance
   */
  init(engineRef) {
    this._engine = engineRef;
  }

  /**
   * Fetch data for a geographic region.
   * Must return a promise resolving to:
   *   {
   *     terrainUpdates?: Map<"gx,gy", terrainId>,
   *     features?:       Feature[],
   *     buildings?:      BuildingData[],
   *   }
   *
   * @param {{ lat:number, lon:number }} geoCenter
   * @param {number} radiusMetres
   * @returns {Promise<object>}
   */
  // eslint-disable-next-line no-unused-vars
  fetch(geoCenter, radiusMetres) {
    return Promise.resolve({});
  }

  /**
   * Called when the engine zooms to a level that might require different data.
   */
  // eslint-disable-next-line no-unused-vars
  onZoomChange(zoom) {}

  /** Clean up timers, abort controllers, etc. */
  destroy() {}
}

// ─── TILE URL FACTORIES ───────────────────────────────────────────────────────

/** Standard OSM tile URL */
export const OSMTileURL = (z, x, y) =>
  `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`;

/** CartoDB dark tile URL */
export const CartoDarkURL = (z, x, y) =>
  `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;

/** CartoDB light tile URL */
export const CartoLightURL = (z, x, y) =>
  `https://a.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`;

/** ESRI World Imagery (satellite) */
export const ESRISatelliteURL = (z, x, y) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

/** Nextzen Terrarium elevation tiles (requires API key) */
export const NextzenElevURL = (apiKey) => (z, x, y) =>
  `https://tile.nextzen.org/tilezen/terrain/v1/256/terrarium/${z}/${x}/${y}.png?api_key=${apiKey}`;

/** Generic {z}/{x}/{y} pattern */
export const patternURL = (pattern) => (z, x, y) =>
  pattern.replace('{z}',z).replace('{x}',x).replace('{y}',y);