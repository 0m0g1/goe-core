/**
 * GOE Core (Garden of Eden Core)
 * ─────────────────────────────────────────────────────────────────────────────
 * A vanilla-JS isometric / flat-map hybrid engine with pluggable loaders.
 *
 * Quick start:
 *
 *   import GOECore from './src/GOECore.js';
 *   import { OSMTerrainLoader } from './src/loaders/OSMTerrainLoader.js';
 *   import { ElevationLoader }  from './src/loaders/ElevationLoader.js';
 *
 *   const engine = new GOECore({
 *     geoCenter: { lat: 51.5, lon: -0.09 },
 *     tileURLFn: (z,x,y) => `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`,
 *   });
 *
 *   engine.use(new OSMTerrainLoader());
 *   engine.setFeatures(myEvents);
 *   engine.mount(document.getElementById('map'));
 *
 *   engine.on('feature:click', ({ id, data }) => console.log('clicked', id));
 *   engine.on('map:click',     ({ lat, lon }) => console.log('empty click', lat, lon));
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Events emitted:
 *   'feature:click'    { id, data, feature }       — user clicked a feature
 *   'map:click'        { lat, lon, screenX, screenY } — clicked empty space
 *   'map:rightclick'   { lat, lon, screenX, screenY }
 *   'player:move'      { x, y, geo: {lat,lon} }
 *   'center:changed'   { lat, lon }                — world re-centred
 *   'fetch:start'      {}
 *   'fetch:done'       {}
 *   'hud'              { lat, lon, zoom, tilt, terrain }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Coordinate conventions:
 *   All public methods accept/return { lat, lon } geographic coordinates.
 *   Internally the engine works in local tile-space (tx, ty).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export { Engine, ENTITY_TYPES } from './Engine.js';
export { Camera } from './core/Camera.js';
export { InputManager } from './core/InputManager.js';
export { TerrainCache } from './terrain/TerrainCache.js';
export { TerrainType, createTerrainRegistry } from './terrain/types.js';
export { VoxelRenderer }   from './render/VoxelRenderer.js';
export { TileRenderer }    from './render/TileRenderer.js';
export { FeatureRenderer } from './render/FeatureRenderer.js';
export { PlayerRenderer }  from './render/PlayerRenderer.js';
export { OSMLayerRenderer } from './render/OSMLayerRenderer.js';
export { BaseLoader, OSMTileURL, CartoDarkURL, ESRISatelliteURL, patternURL } from './loaders/BaseLoader.js';
export { OSMTerrainLoader } from './loaders/geo/OSMTerrainLoader.js';
export { BioLoader } from './loaders/geo/BioLoader.js';
export { WeatherLoader } from './loaders/geo/WeatherLoader.js';
export { ElevationLoader, ElevationFormat } from './loaders/geo/ElevationLoader.js';
export { AviationLoader } from './loaders/geo/AviationLoader.js';
export { preprocessBuildings } from './loaders/geo/BuildingPreprocessor.js';
export { EventEmitter } from './core/EventEmitter.js';
export * from './math/projection.js';
export * from './math/geo.js';

// ─── DEFAULT EXPORT: Convenience factory ─────────────────────────────────────

import { Engine }  from './Engine.js';

/**
 * Create and optionally immediately mount a GOECore engine.
 *
 * @param {object} opts  See Engine constructor docs
 * @param {HTMLCanvasElement|null} [canvas]  Pass canvas to auto-mount
 * @returns {Engine}
 */
export default function GOECore(opts = {}, canvas = null) {
  const engine = new Engine(opts);
  if (canvas) engine.mount(canvas);
  return engine;
}

GOECore.VERSION = '0.1.0';