/**
 * GOE Core — Engine (Unified Entity Version)
 * Central render-loop orchestrator using a single Entity list.
 */
import { EventEmitter }      from './core/EventEmitter.js';
import { Camera }            from './core/Camera.js';
import { InputManager }      from './core/InputManager.js';
import { TerrainCache }      from './terrain/TerrainCache.js';
import { createTerrainRegistry, TerrainType } from './terrain/types.js';
import { TileRenderer }      from './render/TileRenderer.js';
import { FeatureRenderer, decorateBuildingFacade } from './render/FeatureRenderer.js';
import { resolveFeatureType } from './terrain/FeatureTypes.js';
import { PlayerRenderer }    from './render/PlayerRenderer.js';
import { OSMLayerRenderer }  from './render/OSMLayerRenderer.js';
import { VoxelRenderer }     from './render/VoxelRenderer.js';
import { ShadowSystem }      from './render/ShadowSystem.js';
import { TreeRenderer }      from './render/TreeRenderer.js';
import {
  worldToScreen, screenToWorld, tileHalfWidth, tileHalfHeight,
  getElevOffset, tileDepth,
} from './math/projection.js';
import {
  geoToTile, tileToGeo, lonToGlobalX, latToGlobalY,
} from './math/geo.js';
import { preprocessBuildings } from './loaders/geo/BuildingPreprocessor.js';
import { WeatherSystem } from './render/WeatherSystem.js';

// ─────────────────────────────────────────────────────────────────────────────
// Entity system – base classes (can be moved to separate files later)
// ─────────────────────────────────────────────────────────────────────────────
export const ENTITY_TYPES = {
  PLAYER:    'player',
  BUILDING:  'building',
  FEATURE:   'feature',
  TREE:      'tree',
  VEHICLE:   'vehicle',
  NPC:       'npc',
  ANIMAL:    'animal',
  PLANT:     'plant',
};

class Entity {
  constructor(id, type, tx, ty, elevOffset = 0) {
    this.id = id;
    this.type = type;
    this.tx = tx;
    this.ty = ty;
    this.elevOffset = elevOffset;   // additional px above ground
    this.bboxRadius = 0.4;          // tile units
    this.visible = true;
  }

  getGeo(geoCenter, mPerTile, mapW, mapH) {
    return tileToGeo(this.tx, this.ty, geoCenter, mPerTile, mapW, mapH);
  }

  setGeo(lat, lon, geoCenter, mPerTile, mapW, mapH) {
    const pos = geoToTile(lat, lon, geoCenter, mPerTile, mapW, mapH);
    this.tx = pos.x;
    this.ty = pos.y;
  }

  render(ctx, cam, groundElevPx, extra) {
    // fallback: coloured circle
    const { x, y } = worldToScreen(this.tx + 0.5, this.ty + 0.5, groundElevPx + this.elevOffset, cam);
    ctx.beginPath();
    ctx.arc(x, y, 6 * cam.zoom, 0, Math.PI * 2);
    ctx.fillStyle = this.color || '#888';
    ctx.fill();
  }

  update(dt, engine) {} // override in subclasses

  onInteract(engine, screenX, screenY) {
    engine.emit('entity:interact', { entity: this, screenX, screenY });
  }
}

class PlayerEntity extends Entity {
  constructor(id = 'player', tx = 40, ty = 40) {
    super(id, ENTITY_TYPES.PLAYER, tx, ty);
    this.walkCycle = 0;
    this.isMoving = false;
    this.faceAngle = Math.PI / 2;
    this.speedMult = 1.0;
  }

  update(dt, engine) {
    const input = engine._input;
    const mv = input.getMovementVector();
    if (mv) {
      this.isMoving = true;
      this.faceAngle = Math.atan2(-mv.dy, mv.dx);
      const cam = engine.camera;
      const hw = tileHalfWidth(cam.zoom, cam.tileW);
      const hh = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
      const cr = Math.cos(cam.rotation), sr = Math.sin(cam.rotation);
      const rx = (mv.dx / hw + mv.dy / hh) * 0.5;
      const ry = (mv.dy / hh - mv.dx / hw) * 0.5;
      const wx = rx * cr - ry * sr;
      const wy = rx * sr + ry * cr;
      const spd = (0.22 * this.speedMult) * dt * 60 / (Math.hypot(wx, wy) || 1);
      this.walkCycle += dt * 15 * this.speedMult;
      const newX = this.tx + wx * spd;
      const newY = this.ty + wy * spd;
      let blocked = false;
      for (const other of engine.entities) {
        if (other === this) continue;
        const dx = newX - other.tx;
        const dy = newY - other.ty;
        const minDist = this.bboxRadius + other.bboxRadius;
        if (dx * dx + dy * dy < minDist * minDist) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        this.tx = Math.max(0.5, Math.min(engine._mapW - 0.5, newX));
        this.ty = Math.max(0.5, Math.min(engine._mapH - 0.5, newY));
      }
    } else {
      this.isMoving = false;
      this.walkCycle = 0;
    }
  }

  render(ctx, cam, groundElevPx, extra) {
    extra.playerRenderer.draw(this.tx, this.ty, groundElevPx + this.elevOffset, this, extra.mPerTile);
  }
}

class FeatureEntity extends Entity {
  constructor(id, tx, ty, data = {}) {
    super(id, ENTITY_TYPES.FEATURE, tx, ty);
    this.data = data;
    this.label = data.label || data.title || data.name || '';
    this.color = data.color || '#60a5fa';
    this.ftype = resolveFeatureType(this.label, data.tags || {}, this.color);
    this.bboxRadius = 0.35;
  }

  render(ctx, cam, groundElevPx, extra) {
    extra.featureRenderer.drawFeature(this, extra.selectedId === this.id, extra.terrainCache, extra.pGX, extra.pGY);
  }
}

class BuildingEntity extends Entity {
  constructor(id, tx, ty, footprintRadiusTiles, heightM, colorSet = null) {
    super(id, ENTITY_TYPES.BUILDING, tx, ty);
    this.footprintRadius = footprintRadiusTiles;
    this.heightM = heightM;
    this.colorSet = colorSet;
    this.bboxRadius = footprintRadiusTiles;
  }

  render(ctx, cam, groundElevPx, extra) {
    const vr = extra.voxelRenderer;
    const VU = 8;
    const rVox = this.footprintRadius * VU;
    const hVox = (this.heightM / extra.mPerTile) * VU;
    vr.beginTile(this.tx, this.ty, groundElevPx + this.elevOffset);
    vr.box(-rVox, 0, -rVox, rVox * 2, hVox, rVox * 2,
      this.colorSet?.top || '#b0a090',
      this.colorSet?.right || '#8a7a6a',
      this.colorSet?.left || '#6a5a4a'
    );
    if (extra.decorateFacade) {
      extra.decorateFacade(ctx, cam, this, vr);
    }
  }
}

class TreeEntity extends Entity {
  constructor(id, tx, ty, treeType = 'deciduous', scale = 1.0, seed = 0) {
    super(id, ENTITY_TYPES.TREE, tx, ty);
    this.treeType = treeType;
    this.scale = scale;
    this.seed = seed;
    this.bboxRadius = 0.5;
  }

  render(ctx, cam, groundElevPx, extra) {
    extra.treeRenderer.drawTree(this.tx, this.ty, groundElevPx + this.elevOffset, {
      type: this.treeType,
      scale: this.scale,
      seed: this.seed,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine – main class
// ─────────────────────────────────────────────────────────────────────────────
const MAP_W        = 80;
const MAP_H        = 80;
const REFETCH_DIST = 18;
const PLAYER_SPEED = 0.22;
const M_PER_TILE   = 2;

export class Engine extends EventEmitter {
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

    // Data – unified entity list
    this.entities       = [];
    this.playerEntity   = null;
    this._selectedId    = null;

    // Terrain & loaders
    this.terrainRegistry = createTerrainRegistry(opts.terrainOverrides);
    this.terrainCache    = new TerrainCache();
    this.terrainCache.mPerTile = this._mPerTile;
    this._loaders        = [];

    // Shadow / weather
    this._shadowOpts = {
      sunAngle:     opts.sunAngle     ?? Math.PI * 1.25,
      sunElevation: opts.sunElevation ?? Math.PI / 5,
      shadowAlpha:  opts.shadowAlpha  ?? 0.22,
      aoStrength:   opts.aoStrength   ?? 0.28,
      enabled:      opts.shadows      ?? true,
    };

    // Slippy tile URL
    this._tileURLFn = opts.tileURLFn ??
      ((z,x,y) => `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`);

    this._elevation = opts.elevationLoader ?? null;

    this.debugLayers = {
      osmTiles:    true,
      overpass:    true,
      buildings:   true,
      features:    true,
      player:      true,
    };

    // Cache / temp
    this._tileCache       = [];
    this._lastTileCamX    = null;
    this._lastTileCamY    = null;
    this._lastTileZoom    = null;
    this._lastTileRot     = null;

    this.weather = null;
    this.localTreeAsset = 'tree';
  }

  // ── Backward compatibility getters ──────────────────────────────────────
  get player() { return this.playerEntity; }
  get features() { return this.entities.filter(e => e.type === ENTITY_TYPES.FEATURE); }
  get buildings() { return this.entities.filter(e => e.type === ENTITY_TYPES.BUILDING); }
  get trees() { return this.entities.filter(e => e.type === ENTITY_TYPES.TREE); }

  // ── MOUNT ────────────────────────────────────────────────────────────────
  mount(canvas) {
    if (this._running) return;
    this._canvas  = canvas;
    this._ctx     = canvas.getContext('2d');
    this._running = true;

    const cam = this.camera;
    this._voxelR   = new VoxelRenderer(this._ctx, cam);
    this._tileR    = new TileRenderer(this._ctx, cam, this.terrainRegistry);
    this._featR    = new FeatureRenderer(this._ctx, cam, this.terrainRegistry, this._voxelR);
    this._playerR  = new PlayerRenderer(this._ctx, cam);
    this._osmLayer = new OSMLayerRenderer(this._ctx, cam, this._tileURLFn);
    this._shadows  = new ShadowSystem(this._ctx, this.camera, this._shadowOpts);
    this.treeR     = new TreeRenderer(this._ctx, cam, this._voxelR);

    const resize = () => {
      canvas.width  = canvas.offsetWidth  || window.innerWidth;
      canvas.height = canvas.offsetHeight || window.innerHeight;
    };
    resize();
    this._ro = new ResizeObserver(resize);
    this._ro.observe(canvas);

    this._input = new InputManager(canvas, { zoomSpeed: cam.zoomSpeed });
    this._input.on('wheel',  ({ delta, x, y }) =>
      cam.zoom_at(cam.zoom - delta * cam.zoomSpeed * cam.zoom, x ?? 0, y ?? 0));
    this._input.on('pinch',  ({ dist, lastDist, cx, cy }) =>
      cam.zoom_at(cam.zoom * (dist / lastDist), cx ?? 0, cy ?? 0));
    this._input.on('pan',    ({ dx, dy }) => { cam.camX -= dx; cam.camY -= dy; });
    this._input.on('rotate', ({ delta }) => { cam.rotVel += delta * 5; });
    this._input.on('click',  (ev) => this._handleClick(ev));

    for (const loader of this._loaders) loader.init?.(this);

    // Create player entity
    this.playerEntity = new PlayerEntity('player', this._mapW/2, this._mapH/2);
    this.entities.push(this.playerEntity);

    this._doFetch(this.geoCenter);
    this._lastT = 0;
    this._raf   = requestAnimationFrame(ts => {
      this._centreCameraOnPlayer();
      this._frame(ts);
    });

    this.weather = new WeatherSystem(this._ctx, this.camera);
    this.weather.setMode('none');
    return this;
  }

  destroy() {
    this._running = false;
    cancelAnimationFrame(this._raf);
    this._ro?.disconnect();
    this._input?.destroy();
    for (const loader of this._loaders) loader.destroy?.();
    this.removeAllListeners();
  }

  // ── PUBLIC API ──────────────────────────────────────────────────────────
  setTileSource(urlFn) {
    this._tileURLFn = urlFn;
    this._osmLayer?.setURLFn(urlFn);
  }

  addEntity(entity) {
    this.entities.push(entity);
  }

  removeEntity(id) {
    const idx = this.entities.findIndex(e => e.id === id);
    if (idx !== -1) this.entities.splice(idx, 1);
  }

  selectEntity(id) {
    this._selectedId = id;
    const ent = this.entities.find(e => e.id === id);
    if (ent) this._flyToTile(ent.tx + 0.5, ent.ty + 0.5);
  }

  setFeatures(rawFeatures) {
    // remove old features, keep other entity types
    this.entities = this.entities.filter(e => e.type !== ENTITY_TYPES.FEATURE);
    for (const f of rawFeatures) {
      const lat = f.latitude ?? f.lat;
      const lon = f.longitude ?? f.lon;
      if (lat == null || lon == null) continue;
      const pos = geoToTile(lat, lon, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
      this.entities.push(new FeatureEntity(f.id, pos.x, pos.y, f));
    }
    this.emit('features:changed', this.features);
  }

  addFeature(f) {
    const lat = f.latitude ?? f.lat;
    const lon = f.longitude ?? f.lon;
    if (lat == null || lon == null) return;
    const pos = geoToTile(lat, lon, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
    this.entities.push(new FeatureEntity(f.id, pos.x, pos.y, f));
  }

  setParcels(parcels) { /* optional – can be stored separately or as entities */ }
  use(loader) { this._loaders.push(loader); return this; }
  setElevationLoader(loader) { this._elevation = loader; if (this._running && this.geoCenter) loader.prefetch?.(this.geoCenter); }

  panTo(lat, lon) {
    this.geoCenter = { lat, lon };
    if (this.playerEntity) {
      this.playerEntity.tx = this._mapW / 2;
      this.playerEntity.ty = this._mapH / 2;
    }
    this._lastFetchPos = { lat: 0, lon: 0 };
    this._fetching = false;
    this._rebuildAllEntitiesGeo(); // re-project all entities to new centre
    this._centreCameraOnPlayer();
    this._doFetch(this.geoCenter);
  }

  flyTo(lat, lon, zoom) {
    this.panTo(lat, lon);
    if (zoom != null) this.camera.zoom = zoom;
  }

  rotateTo(radians) { this.camera.rotation = radians; }
  toggleLayer(name, value) { if (name in this.debugLayers) this.debugLayers[name] = value ?? !this.debugLayers[name]; }
  toggleShadows(value) { if (this._shadows) this._shadows.enabled = value ?? !this._shadows.enabled; }
  setSunAngle(angle, elevation) {
    if (this._shadows) {
      this._shadows.sunAngle = angle;
      if (elevation != null) this._shadows.sunElevation = elevation;
    }
  }

  // ── INTERNAL HELPERS ────────────────────────────────────────────────────
  _rebuildAllEntitiesGeo() {
    for (const e of this.entities) {
      if (e.type === ENTITY_TYPES.PLAYER) continue;
      const geo = e.getGeo(this.geoCenter, this._mPerTile, this._mapW, this._mapH);
      e.setGeo(geo.lat, geo.lon, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
    }
  }

  _centreCameraOnPlayer() {
    if (!this._canvas || !this.playerEntity) return;
    const elev = this._playerElev();
    const { x, y } = worldToScreen(this.playerEntity.tx, this.playerEntity.ty, elev,
      { ...this.camera, camX: 0, camY: 0 });
    this.camera.camX = x - this._canvas.width  / 2;
    this.camera.camY = y - this._canvas.height / 2;
  }

  _flyToTile(tx, ty) {
    const { x, y } = worldToScreen(tx, ty, 0, this.camera);
    this.camera.camX = x - (this._canvas?.width  ?? 800) / 2;
    this.camera.camY = y - (this._canvas?.height ?? 600) / 2;
  }

  _playerElev() {
    if (!this.playerEntity) return 0;
    const geo = this.playerEntity.getGeo(this.geoCenter, this._mPerTile, this._mapW, this._mapH);
    const elevM = this._elevation?.sampleElevation(geo.lat, geo.lon) ?? 0;
    return getElevOffset(this._elevation?.toTileHeight(elevM) ?? 4, this.camera.tilt, this.camera.zoom);
  }

  _pGlobal() {
    return {
      x: lonToGlobalX(this.geoCenter.lon, this.geoCenter.lat, this._mPerTile),
      y: latToGlobalY(this.geoCenter.lat, this._mPerTile),
    };
  }

  // ── FETCH ────────────────────────────────────────────────────────────────
  _doFetch(center) {
    if (this._fetching) return;
    const d = Math.hypot(center.lat - this._lastFetchPos.lat, center.lon - this._lastFetchPos.lon);
    if (d < 0.001 && this._lastFetchPos.lat !== 0) return;

    this._fetching     = true;
    this._lastFetchPos = { ...center };
    this.emit('fetch:start');

    const fetches = this._loaders.map(l =>
      l.fetch(center).catch(err => { console.error(`[GOECore] Loader ${l.id} failed:`, err); return {}; })
    );

    Promise.all(fetches).then(results => {
      const { x: pGX, y: pGY } = this._pGlobal();

      // Process terrain updates
      for (const result of results) {
        if (result.terrainUpdates) this.terrainCache.merge(result.terrainUpdates);
        if (result.weatherUpdate && this.weather) {
          this.weather.setMode(result.weatherUpdate.mode);
          this.weather.wind = result.weatherUpdate.wind;
          this.emit('weather:changed', result.weatherUpdate);
        }
      }

      // Remove old building/feature/tree entities before adding new ones
      const keepTypes = [ENTITY_TYPES.PLAYER];
      this.entities = this.entities.filter(e => keepTypes.includes(e.type));

      // Add new entities from loaders
      for (const result of results) {
        // Buildings
        if (result.buildingWays) {
          const buildings = preprocessBuildings(result.buildingWays);
          for (const b of buildings) {
            const pos = geoToTile(b.centroid.lat, b.centroid.lon, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
            if (pos.x < 0 || pos.x >= this._mapW || pos.y < 0 || pos.y >= this._mapH) continue;
            const halfSideM = Math.sqrt(Math.max(1, b.areaM2));
            const halfSideTiles = halfSideM / this._mPerTile / 2;
            const colorSet = this.terrainRegistry.colors[TerrainType.BUILDING];
            const building = new BuildingEntity(`building_${b.id || Math.random()}`, pos.x, pos.y, halfSideTiles, b.heightM, colorSet);
            this.entities.push(building);
          }
        }
        // Features (POIs, events, NPCs)
        if (result.features) {
          for (const f of result.features) {
            const lat = f.latitude ?? f.lat;
            const lon = f.longitude ?? f.lon;
            if (lat == null || lon == null) continue;
            const pos = geoToTile(lat, lon, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
            if (f.data?.isProcedural) {
              const tid = this.terrainCache.getLocal(pos.x, pos.y, pGX, pGY, this._mapW, this._mapH);
              if (tid === TerrainType.GRASS || tid === TerrainType.FOREST) {
                this.entities.push(new FeatureEntity(f.id, pos.x, pos.y, f));
              }
            } else {
              this.entities.push(new FeatureEntity(f.id, pos.x, pos.y, f));
            }
          }
        }
        // Trees from BioLoader (if any)
        if (result.trees) {
          for (const t of result.trees) {
            const pos = geoToTile(t.lat, t.lon, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
            this.entities.push(new TreeEntity(`tree_${t.id || Math.random()}`, pos.x, pos.y, t.species || 'deciduous', 1.0, t.seed || 0));
          }
        }
      }

      this._updateLocalEcosystem();
      this._elevation?.prefetch?.(center);
      this._fetching = false;
      this.emit('fetch:done');
    });
  }

  _updateLocalEcosystem() {
    const counts = {};
    for (const e of this.entities) {
      if (e.type === ENTITY_TYPES.TREE && e.treeType) {
        counts[e.treeType] = (counts[e.treeType] || 0) + 1;
      }
    }
    let topType = null, max = 0;
    for (const [type, cnt] of Object.entries(counts)) {
      if (cnt > max) { max = cnt; topType = type; }
    }
    if (topType) this.localTreeAsset = topType;
  }

  // ── RENDER FRAME ─────────────────────────────────────────────────────────
  _frame(ts) {
    if (!this._running) return;
    this._raf = requestAnimationFrame(ts2 => this._frame(ts2));

    const dt = Math.min((ts - this._lastT) / 1000, 0.05);
    this._lastT = ts;

    const cam    = this.camera;
    const canvas = this._canvas;
    const ctx    = this._ctx;
    const W      = canvas.width;
    const H      = canvas.height;

    // 1. Update all entities
    for (const e of this.entities) {
      e.update(dt, this);
    }

    // 2. Camera updates
    cam.updateTilt(dt);
    cam.updateRotation(dt, this.playerEntity?.tx ?? 0, this.playerEntity?.ty ?? 0, worldToScreen);
    if (this._input.isRotatingLeft())  cam.rotVel -= 2.2 * dt;
    if (this._input.isRotatingRight()) cam.rotVel += 2.2 * dt;
    if (this.weather) this.weather.update(dt, this.playerEntity?.tx ?? 0, this.playerEntity?.ty ?? 0);

    const { x: pGX, y: pGY } = this._pGlobal();
    const pElev = this._playerElev();

    // 3. Centre camera on player if moving in ISO mode
    if (cam.tilt > 0.08 && this.playerEntity) {
      const { x: px, y: py } = worldToScreen(this.playerEntity.tx, this.playerEntity.ty, pElev, { ...cam, camX: 0, camY: 0 });
      cam.camX += (px - W/2 - cam.camX) * 0.08;
      cam.camY += (py - H/2 - cam.camY) * 0.08;
    }

    // 4. World re‑centre if player moved too far
    if (this.playerEntity) {
      const dFC = Math.hypot(this.playerEntity.tx - this._mapW/2, this.playerEntity.ty - this._mapH/2);
      if (dFC > REFETCH_DIST && !this._fetching) {
        const oldS = worldToScreen(this.playerEntity.tx, this.playerEntity.ty, pElev, cam);
        this.geoCenter = this.playerEntity.getGeo(this.geoCenter, this._mPerTile, this._mapW, this._mapH);
        this.playerEntity.tx = this._mapW/2;
        this.playerEntity.ty = this._mapH/2;
        const newS = worldToScreen(this.playerEntity.tx, this.playerEntity.ty, pElev, cam);
        cam.camX += newS.x - oldS.x;
        cam.camY += newS.y - oldS.y;
        this._lastTileCamX = null;
        this._rebuildAllEntitiesGeo();
        this._doFetch(this.geoCenter);
        this.emit('center:changed', this.geoCenter);
      }
    }

    // 5. Prepare render list sorted by depth
    const renderList = [];
    for (const e of this.entities) {
      if (!e.visible) continue;
      const depth = tileDepth(e.tx, e.ty, cam.rotation) + (e.elevOffset * 0.01);
      renderList.push({ e, depth });
    }
    renderList.sort((a,b) => a.depth - b.depth);

    // 6. Clear canvas
    ctx.fillStyle = this.weather?.mode === 'rain' ? '#020308' : '#04060a';
    ctx.fillRect(0, 0, W, H);
    this._voxelR.beginFrame();
    this._shadows.beginFrame();

    // 7. Draw terrain tiles
    const overAlpha = Math.max(0, Math.min(1, (cam.zoom - 0.02) / 0.015));
    if (overAlpha > 0 && this.debugLayers.overpass) {
      const lod = cam.zoom > 0.25 ? 1 : cam.zoom > 0.10 ? 2 : 4;
      if (lod > 1) {
        this._tileR.drawMergedLayer(this.terrainCache, pGX, pGY, lod, overAlpha);
      } else {
        if (this._lastTileCamX === null || Math.abs(cam.camX - this._lastTileCamX) > 3) {
          this._lastTileCamX = cam.camX;
          const hw = tileHalfWidth(cam.zoom, cam.tileW);
          const hh = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
          const txs = Math.min(120, Math.ceil(W / Math.max(1, hw)) + 4);
          const tys = Math.min(120, Math.ceil(H / Math.max(1, hh)) + 4);
          const vC = screenToWorld(W/2, H/2, cam);
          const cx = Math.round(Math.max(0, Math.min(this._mapW, vC.x)));
          const cy = Math.round(Math.max(0, Math.min(this._mapH, vC.y)));
          this._tileCache = [];
          for (let ty = Math.max(0, cy - tys); ty < Math.min(this._mapH, cy + tys); ty++) {
            for (let tx = Math.max(0, cx - txs); tx < Math.min(this._mapW, cx + txs); tx++) {
              this._tileCache.push({ tx, ty, terrainId: this.terrainCache.get(tx - this._mapW/2 + pGX, ty - this._mapH/2 + pGY) ?? TerrainType.GRASS });
            }
          }
        }
        this._tileR.drawLayer(this._tileCache, this.playerEntity?.tx ?? 0, this.playerEntity?.ty ?? 0, this.terrainCache, pGX, pGY);
      }
    }

    // 8. Draw building shadows
    if (this._shadows.enabled && cam.tilt > 0.05) {
      const buildingEntities = this.entities.filter(e => e.type === ENTITY_TYPES.BUILDING);
      const shadowList = [];
      for (const b of buildingEntities) {
        const groundH = this.terrainRegistry.heights[this.terrainCache.getLocal(b.tx, b.ty, pGX, pGY, this._mapW, this._mapH)] ?? 4;
        const elev = getElevOffset(groundH, cam.tilt, cam.zoom);
        const VU = 8;
        const rVox = b.footprintRadius * VU;
        const engineH = (b.heightM / this._mPerTile) * VU;
        shadowList.push({ p: { x: b.tx, y: b.ty }, elev, r: rVox, engineH });
      }
      this._shadows.drawBuildingShadows(shadowList);
    }

    // 9. Render all entities (including player, buildings, features, trees)
    for (const { e } of renderList) {
      const groundH = this.terrainRegistry.heights[this.terrainCache.getLocal(e.tx, e.ty, pGX, pGY, this._mapW, this._mapH)] ?? 4;
      const groundElevPx = getElevOffset(groundH, cam.tilt, cam.zoom);
      e.render(ctx, cam, groundElevPx, {
        selectedId: this._selectedId,
        terrainCache: this.terrainCache,
        pGX, pGY,
        mPerTile: this._mPerTile,
        featureRenderer: this._featR,
        treeRenderer: this.treeR,
        voxelRenderer: this._voxelR,
        playerRenderer: this._playerR,
        decorateFacade: decorateBuildingFacade,
      });
    }

    // 10. Weather overlay
    if (this.weather) this.weather.draw();

    // 11. Emit HUD info
    if (this.playerEntity) {
      const geo = this.playerEntity.getGeo(this.geoCenter, this._mPerTile, this._mapW, this._mapH);
      this.emit('hud', {
        lat: geo.lat, lon: geo.lon,
        zoom: cam.zoom.toFixed(2),
        tilt: cam.tilt.toFixed(2),
        terrain: this.terrainRegistry.names[this.terrainCache.getLocal(this.playerEntity.tx, this.playerEntity.ty, pGX, pGY, this._mapW, this._mapH)] ?? 'Unknown'
      });
    }
  }

  // ── CLICK HANDLER ────────────────────────────────────────────────────────
  _handleClick({ x: cx, y: cy, button }) {
    if (button === 2) {
      const wPos = screenToWorld(cx, cy, this.camera);
      const geo  = tileToGeo(wPos.x, wPos.y, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
      this.emit('map:rightclick', { lat: geo.lat, lon: geo.lon, screenX: cx, screenY: cy });
      return;
    }

    let best = null, bestDist = Infinity;
    for (const e of this.entities) {
      const groundH = this.terrainRegistry.heights[this.terrainCache.getLocal(e.tx, e.ty, this._pGlobal().x, this._pGlobal().y, this._mapW, this._mapH)] ?? 4;
      const elev = getElevOffset(groundH, this.camera.tilt, this.camera.zoom);
      const { x: sx, y: sy } = worldToScreen(e.tx + 0.5, e.ty + 0.5, elev + e.elevOffset, this.camera);
      const dist = Math.hypot(cx - sx, cy - sy);
      const threshold = 20 * this.camera.zoom;
      if (dist < threshold && dist < bestDist) {
        bestDist = dist;
        best = e;
      }
    }
    if (best) {
      this._selectedId = best.id;
      best.onInteract(this, cx, cy);
      this.emit('entity:click', { entity: best });
    } else {
      this._selectedId = null;
      const wPos = screenToWorld(cx, cy, this.camera);
      const geo  = tileToGeo(wPos.x, wPos.y, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
      this.emit('map:click', { lat: geo.lat, lon: geo.lon, screenX: cx, screenY: cy });
    }
  }
}