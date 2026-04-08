/**
 * GOE Core — Engine
 * The main render-loop orchestrator. Ties together Camera, InputManager,
 * all renderers, and all loaders.
 *
 * Life-cycle:
 *   engine.mount(canvas)  → starts loop
 *   engine.destroy()      → stops loop, cleans up
 */
import { EventEmitter }      from './core/EventEmitter.js';
import { Camera }            from './core/Camera.js';
import { InputManager }      from './core/InputManager.js';
import { TerrainCache }      from './terrain/TerrainCache.js';
import { createTerrainRegistry, TerrainType } from './terrain/types.js';
import { TileRenderer }      from './render/TileRenderer.js';
import { FeatureRenderer }   from './render/FeatureRenderer.js';
import { PlayerRenderer }    from './render/PlayerRenderer.js';
import { OSMLayerRenderer }  from './render/OSMLayerRenderer.js';
import { VoxelRenderer }     from './render/VoxelRenderer.js';
import {
  worldToScreen, screenToWorld, tileHalfWidth, tileHalfHeight,
  getElevOffset, zoomToTilt,
} from './math/projection.js';
import {
  geoToTile, tileToGeo, lonToGlobalX, latToGlobalY,
} from './math/geo.js';
import { preprocessBuildings } from './loaders/geo/BuildingPreprocessor.js';

const MAP_W        = 80;
const MAP_H        = 80;
const REFETCH_DIST = 18;   // tiles from centre before re-fetch
const PLAYER_SPEED = 0.11;
const M_PER_TILE   = 2;

export class Engine extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {object} [opts.terrainOverrides]  Custom terrain colours/heights
   * @param {object} [opts.cameraOpts]
   * @param {number} [opts.mPerTile]
   * @param {number} [opts.mapW]
   * @param {number} [opts.mapH]
   * @param {(z,x,y)=>string} [opts.tileURLFn]  OSM slippy tile URL factory
   * @param {boolean} [opts.showPlayer]
   * @param {boolean} [opts.showOSMLayer]
   * @param {object[]} [opts.features]   Initial features
   */
  constructor(opts = {}) {
    super();

    this._opts       = opts;
    this._mPerTile   = opts.mPerTile ?? M_PER_TILE;
    this._mapW       = opts.mapW     ?? MAP_W;
    this._mapH       = opts.mapH     ?? MAP_H;
    this._showPlayer = opts.showPlayer ?? true;
    this._running    = false;

    // Geo state
    this.geoCenter     = opts.geoCenter ?? { lat: 51.505, lon: -0.09 };
    this._lastFetchPos = { lat: 0, lon: 0 };
    this._fetching     = false;

    // Camera
    this.camera = new Camera({
      mapW:     this._mapW,
      mapH:     this._mapH,
      mPerTile: this._mPerTile,
      ...opts.cameraOpts,
    });

    // Player state
    this.player = {
      x: this._mapW / 2, y: this._mapH / 2,
      walkCycle: 0, isMoving: false, faceAngle: Math.PI / 2,
    };

    // Data
    this.terrainRegistry = createTerrainRegistry(opts.terrainOverrides);
    this.terrainCache    = new TerrainCache();
    this.terrainCache.mPerTile = this._mPerTile;
    this._features       = [];   // { tx, ty, color, id, data, label }
    this._parcels        = [];   // { corners, color, owned, label }
    this._buildings      = [];   // preprocessed building features
    this._selectedId     = null;
    this._loaders        = [];

    // Slippy tile URL
    this._tileURLFn = opts.tileURLFn ??
      ((z,x,y) => `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`);

    // Elevation loader (optional)
    this._elevation = opts.elevationLoader ?? null;


    this.debugLayers = {
      osmTiles:    true,
      overpass:    true,
      buildings:   true,
      features:    true,
      player:      true,
    };
  }

  // ── MOUNT ──────────────────────────────────────────────────────────────────

  /**
   * Attach the engine to a canvas element and start the render loop.
   * @param {HTMLCanvasElement} canvas
   */
  mount(canvas) {
    if (this._running) return;
    this._canvas  = canvas;
    this._ctx     = canvas.getContext('2d');
    this._running = true;

    // ── Renderers ──────────────────────────────────────────────────────────
    const cam = this.camera;
    this._voxelR   = new VoxelRenderer(this._ctx, cam);
    this._tileR    = new TileRenderer(this._ctx, cam, this.terrainRegistry);
    this._featR    = new FeatureRenderer(this._ctx, cam, this.terrainRegistry, this._voxelR);
    this._playerR  = new PlayerRenderer(this._ctx, cam);
    this._osmLayer = new OSMLayerRenderer(this._ctx, cam, this._tileURLFn);

    // ── Resize ─────────────────────────────────────────────────────────────
    // Ensure we have a valid initial size immediately
    const resize = () => {
      canvas.width  = canvas.offsetWidth  || window.innerWidth;
      canvas.height = canvas.offsetHeight || window.innerHeight;
    };
    resize();

    // Snapping center after a brief delay to account for layout reflow
    requestAnimationFrame(() => {
      this._centreCameraOnPlayer();
    });
    
    resize();
    this._ro = new ResizeObserver(resize);
    this._ro.observe(canvas);

    // ── Input ──────────────────────────────────────────────────────────────
    this._input = new InputManager(canvas, { zoomSpeed: cam.zoomSpeed });
    this._input.on('wheel',     ({ delta, x, y }) =>
      cam.zoom_at(cam.zoom - delta * cam.zoomSpeed * cam.zoom, x, y));
    this._input.on('pinch',     ({ dist, lastDist, cx, cy }) =>
      cam.zoom_at(cam.zoom * (dist / lastDist), cx, cy));
    this._input.on('pan',       ({ dx, dy }) => { cam.camX -= dx; cam.camY -= dy; });
    this._input.on('rotate',    ({ delta }) => { cam.rotVel += delta * 5; });
    this._input.on('click',     (ev) => this._handleClick(ev));

    // Init loaders
    for (const loader of this._loaders) loader.init(this);

    // Initial fetch
    this._doFetch(this.geoCenter);

    // Centre camera on player
    this._centreCameraOnPlayer();

    // Start loop
    this._lastT = 0;
    this._raf   = requestAnimationFrame(ts => this._frame(ts));

    return this;
  }

  // ── DESTROY ────────────────────────────────────────────────────────────────

  destroy() {
    this._running = false;
    cancelAnimationFrame(this._raf);
    this._ro?.disconnect();
    this._input?.destroy();
    for (const loader of this._loaders) loader.destroy?.();
    this.removeAllListeners();
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────

  /** Set the tile URL factory (e.g. switch from OSM to satellite). */
  setTileSource(urlFn) {
    this._tileURLFn = urlFn;
    this._osmLayer?.setURLFn(urlFn);
  }

  /** Set / replace the features array (events, POIs, etc.). */
  setFeatures(rawFeatures) {
    this._features = rawFeatures.map(f => this._normaliseFeature(f));
    this.emit('features:changed', this._features);
  }

  addFeature(f) {
    this._features.push(this._normaliseFeature(f));
  }

  removeFeature(id) {
    this._features = this._features.filter(f => f.id !== id);
  }

  /** Set which feature is highlighted. */
  selectFeature(id) {
    this._selectedId = id;
    if (id) {
      const f = this._features.find(f => f.id === id);
      if (f) this._flyToTile(f.tx + 0.5, f.ty + 0.5);
    }
  }

  /** Set / replace land parcel overlays. */
  setParcels(parcels) {
    this._parcels = parcels;
  }

  /** Register a data loader. Must be called before mount(). */
  use(loader) {
    this._loaders.push(loader);
    return this;
  }

  /** Attach an elevation loader. Can be called before or after mount(). */
  setElevationLoader(loader) {
    this._elevation = loader;
    if (this._running && this.geoCenter) loader.prefetch?.(this.geoCenter);
  }

  /** Pan to a geographic coordinate. */
  // Engine.js — replace panTo()
  panTo(lat, lon) {
    // 1. Shift the world anchor to the new location
    this.geoCenter = { lat, lon };
    
    // 2. Reset player to map center (since world re-centred)
    this.player.x = this._mapW / 2;
    this.player.y = this._mapH / 2;
    
    // 3. Invalidate fetch cache so _doFetch actually runs
    this._lastFetchPos = { lat: 0, lon: 0 };
    this._fetching = false; // clear any stuck fetch state
    
    // 4. Re-project existing features against new center
    this._rebuildFeatures();
    
    // 5. Centre camera
    this._centreCameraOnPlayer();
    
    // 6. Fire fetch for the new location
    this._doFetch(this.geoCenter);
  }

  /** Fly + zoom to a geographic coordinate. */
  flyTo(lat, lon, zoom) {
    this.panTo(lat, lon);
    if (zoom != null) this.camera.zoom = zoom;
  }

  /** Programmatic rotate. */
  rotateTo(radians) { this.camera.rotation = radians; }

  // ── FEATURE NORMALISATION ─────────────────────────────────────────────────

  _normaliseFeature(raw) {
    const lat = Number(raw.latitude ?? raw.lat ?? NaN);
    const lon = Number(raw.longitude ?? raw.lng ?? raw.lon ?? NaN);
    const pos = (Number.isFinite(lat) && Number.isFinite(lon))
      ? geoToTile(lat, lon, this.geoCenter, this._mPerTile, this._mapW, this._mapH)
      : { x: -999, y: -999 };
    return {
      id:    raw.id ?? String(Math.random()),
      tx:    pos.x,
      ty:    pos.y,
      color: raw.color ?? raw.colour ?? '#60a5fa',
      label: raw.label ?? raw.title ?? raw.name ?? '',
      data:  raw,
    };
  }

  _rebuildFeatures() {
    this._features = this._features.map(f => this._normaliseFeature(f.data ?? f));
  }

  // ── CAMERA HELPERS ─────────────────────────────────────────────────────────

  _centreCameraOnPlayer() {
    if (!this._canvas) return;
    const elev = this._playerElev();
    const { x, y } = worldToScreen(
      this.player.x, this.player.y, elev,
      { ...this.camera, camX: 0, camY: 0 }  // ← fix here too
    );
    this.camera.camX = x - this._canvas.width  / 2;
    this.camera.camY = y - this._canvas.height / 2;
  }

  _flyToTile(tx, ty) {
    const elev = 0;
    const { x, y } = worldToScreen(tx, ty, elev, this.camera);
    this.camera.camX = x - (this._canvas?.width  ?? 800) / 2;
    this.camera.camY = y - (this._canvas?.height ?? 600) / 2;
  }

  _playerElev() {
    const geo   = tileToGeo(this.player.x, this.player.y, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
    const elevM = this._elevation?.sampleElevation(geo.lat, geo.lon) ?? 0;
    return getElevOffset(
      this._elevation?.toTileHeight(elevM) ?? 4,
      this.camera.tilt, this.camera.zoom
    );
  }

  _pGlobal() {
    return {
      x: lonToGlobalX(this.geoCenter.lon, this.geoCenter.lat, this._mPerTile),
      y: latToGlobalY(this.geoCenter.lat, this._mPerTile),
    };
  }

  // ── FETCH ORCHESTRATION ────────────────────────────────────────────────────

  _doFetch(center) {
    if (this._fetching) return;
    const d = Math.hypot(center.lat - this._lastFetchPos.lat, center.lon - this._lastFetchPos.lon);
    if (d < 0.001 && this._lastFetchPos.lat !== 0) return;

    this._fetching    = true;
    this._lastFetchPos = { ...center };
    this.emit('fetch:start');

    const fetches = this._loaders.map(l =>
      l.fetch(center).catch(err => { console.error(`[GOECore] Loader ${l.id} failed:`, err); return {}; })
    );

    Promise.all(fetches).then(results => {
      for (const result of results) {
        console.log('Loader result keys:', Object.keys(result));                          // ← ADD
        console.log('terrainUpdates size:', result.terrainUpdates?.size);                 // ← ADD
        if (result.terrainUpdates) this.terrainCache.merge(result.terrainUpdates);
        if (result.buildingWays)   this._buildings = preprocessBuildings(result.buildingWays);
        if (result.features)       for (const f of result.features) this.addFeature(f);
      }
      this._elevation?.prefetch?.(center);
      this._fetching = false;
      this.emit('fetch:done');
    });
  }

  // ── RENDER FRAME ──────────────────────────────────────────────────────────

  _frame(ts) {
    if (!this._running) return;
    this._raf = requestAnimationFrame(ts2 => this._frame(ts2));

    const dt  = Math.min((ts - this._lastT) / 1000, 0.05);
    this._lastT = ts;

    const cam    = this.camera;
    const canvas = this._canvas;
    const ctx    = this._ctx;
    const { x: pGX, y: pGY } = this._pGlobal();

    // ── Physics ─────────────────────────────────────────────────────────────
    cam.updateTilt(dt);
    cam.updateRotation(dt, this.player.x, this.player.y, worldToScreen);

    if (this._input.isRotatingLeft())  cam.rotVel -= 2.2 * dt;
    if (this._input.isRotatingRight()) cam.rotVel += 2.2 * dt;

    // ── Player movement ──────────────────────────────────────────────────────
    const mv = this._input.getMovementVector();
    const pElev = this._playerElev();

    if (mv) {
      this.player.isMoving  = true;
      this.player.walkCycle += dt * 15;
      this.player.faceAngle  = Math.atan2(-mv.dy, mv.dx);

      const hw = tileHalfWidth(cam.zoom, cam.tileW);
      const hh = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
      const cr = Math.cos(cam.rotation), sr = Math.sin(cam.rotation);
      const rx = (mv.dx/hw + mv.dy/hh)*0.5, ry = (mv.dy/hh - mv.dx/hw)*0.5;
      const wx = rx*cr - ry*sr, wy = rx*sr + ry*cr;
      const spd = PLAYER_SPEED * dt * 60 / (Math.hypot(wx,wy) || 1);

      this.player.x = Math.max(0.5, Math.min(this._mapW-0.5, this.player.x + wx*spd));
      this.player.y = Math.max(0.5, Math.min(this._mapH-0.5, this.player.y + wy*spd));

      if (cam.tilt > 0.08) {
        // Use camX/Y = 0 as reference so px/py are world-origin-relative screen coords
        const { x: px, y: py } = worldToScreen(
          this.player.x, this.player.y, pElev,
          { ...cam, camX: 0, camY: 0 }   // ← the fix
        );
        cam.camX += (px - canvas.width  / 2 - cam.camX) * 0.08;
        cam.camY += (py - canvas.height / 2 - cam.camY) * 0.08;
      }

      this.emit('player:move', {
        x: this.player.x, y: this.player.y,
        geo: tileToGeo(this.player.x, this.player.y, this.geoCenter, this._mPerTile, this._mapW, this._mapH),
      });
    } else {
      this.player.isMoving  = false;
      this.player.walkCycle = 0;
    }

    // ── World re-centre ──────────────────────────────────────────────────────
    const distFromCtr = Math.hypot(this.player.x - this._mapW/2, this.player.y - this._mapH/2);
    if (distFromCtr > REFETCH_DIST && !this._fetching) {
      const newGeo = tileToGeo(this.player.x, this.player.y, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
      const oldScreen = worldToScreen(this.player.x, this.player.y, pElev, cam);
      this.geoCenter = newGeo;
      this.player.x  = this._mapW / 2;
      this.player.y  = this._mapH / 2;
      const newScreen = worldToScreen(this.player.x, this.player.y, pElev, cam);
      cam.camX += newScreen.x - oldScreen.x;
      cam.camY += newScreen.y - oldScreen.y;
      this._rebuildFeatures();
      this._doFetch(this.geoCenter);
      this.emit('center:changed', this.geoCenter);
    }

    // ── Draw ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#04060a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Global slippy tiles (background)
    if (this.debugLayers.osmTiles) {
      // Only show slippy tiles when zoomed out far enough that voxels aren't visible
      // At high zoom the voxel terrain fully covers the map anyway
      const osmAlpha      = Math.max(0, Math.min(1, (0.035 - cam.zoom) / 0.02));
      if (osmAlpha > 0) {
        ctx.globalAlpha = osmAlpha;
        this._osmLayer.draw(canvas, this.geoCenter);
        ctx.globalAlpha = 1;
      }
    } 

    // Overpass terrain overlay (fades in on zoom)
    // In Engine._frame(), replace the visible tiles loop:
    const overpassAlpha = Math.max(0, Math.min(1, (cam.zoom - 0.02)  / 0.015));
    if (overpassAlpha > 0 && this.debugLayers.overpass) {
      ctx.globalAlpha = overpassAlpha;
      const lod = 1;
      if (lod === 1) {
        // original per‑tile drawing
        const tiles = [];
        const halfW = Math.ceil(this._mapW / 2);
        const halfH = Math.ceil(this._mapH / 2);
       for (let gy = pGY - halfH; gy < pGY + halfH; gy++) {
          for (let gx = pGX - halfW; gx < pGX + halfW; gx++) {
            const tx = gx - pGX + this._mapW / 2;
            const ty = gy - pGY + this._mapH / 2;
            tiles.push({ 
              tx, ty, 
              terrainId: this.terrainCache.get(gx, gy) ?? TerrainType.GRASS 
            });
          }
        }

        this._tileR.drawLayer(tiles, this.player.x, this.player.y);
      } else {
        this._tileR.drawMergedLayer(this.terrainCache, pGX, pGY, lod, overpassAlpha);
      }
      ctx.globalAlpha = 1;
    }

    // Buildings
    if (this.debugLayers.buildings) {
      this._drawBuildings(pGX, pGY);
    }

    // Parcels
    for (const parcel of this._parcels) this._featR.drawParcel(parcel);

    // Features (events, POIs)
    if (this.debugLayers.player && this._showPlayer) {
      this._featR.drawAll(this._features, this._selectedId, this.terrainCache, pGX, pGY);
    }

    // Player
    if (this._showPlayer) {
      this._playerR.draw(this.player.x, this.player.y, pElev, this.player, this._mPerTile);
    }

    // HUD data
    const geo = tileToGeo(this.player.x, this.player.y, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
    this.emit('hud', {
      lat:     geo.lat,
      lon:     geo.lon,
      zoom:    cam.zoom.toFixed(3),
      tilt:    cam.tilt,
      terrain: this.terrainRegistry.names[
        this.terrainCache.getLocal(this.player.x, this.player.y, pGX, pGY, this._mapW, this._mapH)
      ] ?? 'Unknown',
    });
  }

  // ── BUILDING DRAW ─────────────────────────────────────────────────────────

  _drawBuildings(pGX, pGY) {
    if (!this._buildings.length) return;
    const cam = this.camera;

    for (const b of this._buildings) {
      // Get tile position relative to current geo center
      const p = geoToTile(b.centroid.lat, b.centroid.lon,
                          this.geoCenter, this._mPerTile, this._mapW, this._mapH);

      // Skip if outside visible chunk
      if (p.x < 0 || p.x >= this._mapW || p.y < 0 || p.y >= this._mapH) continue;

      // Only draw in iso mode — buildings are invisible when flat anyway
      if (cam.tilt < 0.05) continue;

      const gx = Math.round(p.x) - this._mapW/2 + pGX;
      const gy = Math.round(p.y) - this._mapH/2 + pGY;   // ← was Math.floor, causing off-by-one
      const terrainType = this.terrainCache.get(gx, gy) ?? TerrainType.GRASS;
      const elev = getElevOffset(
        this.terrainRegistry.heights[terrainType] ?? 1,
        cam.tilt, cam.zoom
      );

      const VU = 8;
      const engineH = Math.max(VU, (b.heightM / this._mPerTile) * VU);
      const r = Math.max(VU * 0.5, (Math.sqrt(b.areaM2) / this._mPerTile / 2) * VU);
      const tc = this.terrainRegistry.colors[TerrainType.BUILDING];

      this._voxelR.beginTile(p.x, p.y, elev);   // ← was Math.floor(p.x/y), use float
      this._voxelR.box(-r, 0, -r, r*2, engineH, r*2, tc.top, tc.right, tc.left);
    }
  }

  // ── CLICK HANDLER ─────────────────────────────────────────────────────────

  _handleClick({ x: cx, y: cy, button }) {
    if (button === 2) {
      const wPos = screenToWorld(cx, cy, this.camera);
      const geo  = tileToGeo(wPos.x, wPos.y, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
      this.emit('map:rightclick', { lat: geo.lat, lon: geo.lon, screenX: cx, screenY: cy });
      return;
    }

    // Hit-test features
    const { x: pGX, y: pGY } = this._pGlobal();
    let hit = null, bestDist = Infinity;

    for (const f of this._features) {
      const th   = this.terrainRegistry.heights[
        this.terrainCache.getLocal(f.tx, f.ty, pGX, pGY, this._mapW, this._mapH)
      ] ?? 4;
      const elev = getElevOffset(th, this.camera.tilt, this.camera.zoom);
      const { x: scx, y: scy } = worldToScreen(f.tx+0.5, f.ty+0.5, elev, this.camera);
      const hw = tileHalfWidth(this.camera.zoom, this.camera.tileW);
      const dist = Math.abs((cx-scx)/hw) + Math.abs((cy-scy)/hw);
      if (dist < 1.4 && dist < bestDist) { bestDist = dist; hit = f; }
    }

    if (hit) {
      this._selectedId = hit.id;
      this.emit('feature:click', { id: hit.id, data: hit.data, feature: hit });
    } else {
      this._selectedId = null;
      const wPos = screenToWorld(cx, cy, this.camera);
      const geo  = tileToGeo(wPos.x, wPos.y, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
      this.emit('map:click', { lat: geo.lat, lon: geo.lon, screenX: cx, screenY: cy });
    }
  }

  // New public method:
  toggleLayer(name, value) {
    if (name in this.debugLayers) {
      this.debugLayers[name] = value ?? !this.debugLayers[name];
    }
  }
}