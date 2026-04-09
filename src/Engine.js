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
import { FeatureRenderer, decorateBuildingFacade } from './render/FeatureRenderer.js';
import { resolveFeatureType } from './terrain/FeatureTypes.js';
import { PlayerRenderer }    from './render/PlayerRenderer.js';
import { OSMLayerRenderer }  from './render/OSMLayerRenderer.js';
import { VoxelRenderer }     from './render/VoxelRenderer.js';
import { ShadowSystem } from './render/ShadowSystem.js';
import {
  worldToScreen, screenToWorld, tileHalfWidth, tileHalfHeight,
  getElevOffset, zoomToTilt, tileDepth,
} from './math/projection.js';
import {
  geoToTile, tileToGeo, lonToGlobalX, latToGlobalY,
} from './math/geo.js';
import { preprocessBuildings } from './loaders/geo/BuildingPreprocessor.js';
import { WeatherSystem } from './render/WeatherSystem.js';

const MAP_W        = 80;
const MAP_H        = 80;
const REFETCH_DIST = 18;   // tiles from centre before re-fetch
const PLAYER_SPEED = 0.22;
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

    // Elevation loader (optional)
    this._elevation = opts.elevationLoader ?? null;


    this.debugLayers = {
      osmTiles:    true,
      overpass:    true,
      buildings:   true,
      features:    true,
      player:      true,
    };

    this._tileCache       = [];
    this._lastTileCamX    = null;
    this._lastTileCamY    = null;
    this._lastTileZoom    = null;
    this._lastTileRot     = null;

    this._lastBuildingRot = null;
    this._cachedDrawList  = [];

    this.weather = null;
    this.localTreeAsset = 'tree'; // Default
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

    const cam = this.camera;
    this._voxelR   = new VoxelRenderer(this._ctx, cam);
    this._tileR    = new TileRenderer(this._ctx, cam, this.terrainRegistry);
    this._featR    = new FeatureRenderer(this._ctx, cam, this.terrainRegistry, this._voxelR);
    this._playerR  = new PlayerRenderer(this._ctx, cam);
    this._osmLayer = new OSMLayerRenderer(this._ctx, cam, this._tileURLFn);
     this._shadows = new ShadowSystem(this._ctx, this.camera, this._shadowOpts);

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

    for (const loader of this._loaders) loader.init(this);
    this._doFetch(this.geoCenter);

    this._lastT = 0;
    this._raf   = requestAnimationFrame(ts => {
      // Centre ONCE after layout is stable, then start the loop
      this._centreCameraOnPlayer();
      this._frame(ts);
    });

    this.weather = new WeatherSystem(this._ctx, this.camera);
    this.weather.setMode('none'); // Test it out!

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


  // Add this method to Engine.js
_updateLocalEcosystem() {
    const counts = {};
    
    // 1. Scan BioLoader data to find the local "Dominant Species"
    this._features.forEach(f => {
      // Check if it's a scientific plant record from BioLoader
      if (f.data?.subType === 'plant' && f.data?.tags?.genus) {
        const genus = f.data.tags.genus;
        counts[genus] = (counts[genus] || 0) + 1;
      }
    });

    // 2. Determine the winner
    let topGenus = null;
    let max = 0;
    for (const [genus, count] of Object.entries(counts)) {
      if (count > max) { max = count; topGenus = genus; }
    }

    // 3. Mapping Genus -> Human Label & Voxel Blueprint
    const speciesMap = {
      'anemone':    { label: 'Windflower',  asset: 'flower_anemone' },
      'fagus':      { label: 'Beech Tree',  asset: 'tree_oak' },
      'quercus':    { label: 'Oak Tree',    asset: 'tree_oak' },
      'pinus':      { label: 'Pine Tree',   asset: 'tree_pine' },
      'picea':      { label: 'Spruce Tree', asset: 'tree_pine' },
      'phoenix':    { label: 'Palm Tree',   asset: 'tree_palm' },
      'anthriscus': { label: 'Cow Parsley', asset: 'flower_wild' }
    };

    const localIdentity = speciesMap[topGenus] || { label: 'Wild Tree', asset: 'tree' };

    // 4. IDENTITY GRAFTING: Loop through all features
    this._features.forEach(f => {
      const isOSMTree = f.data?.tags?.natural === 'tree';
      const isGeneric = !f.data?.scientificName; // Scientific names only exist on BioLoader items

      if (isOSMTree && isGeneric) {
        // Force the generic OSM tree to adopt the local identity
        f.label = localIdentity.label;
        
        // Re-resolve the feature type using the new identity
        // This ensures the 3D model (blueprint) changes too
        f.ftype = resolveFeatureType("", { genus: topGenus });
        
        // Update the asset key directly for the blueprint lookup
        f.asset = localIdentity.asset; 
      }
    });

    if (topGenus && !speciesMap[topGenus]) {
      console.warn(`[Ecosystem] New genus detected: "${topGenus}". Add this to your speciesMap!`);
    }

    console.log(`[Ecosystem] Region identified as ${localIdentity.label} biome.`);
  }

  // ── FEATURE NORMALISATION ─────────────────────────────────────────────────

  _normaliseFeature(raw) {
      const lat = Number(raw.latitude ?? raw.lat ?? NaN);
      const lon = Number(raw.longitude ?? raw.lng ?? raw.lon ?? NaN);
      const pos = (Number.isFinite(lat) && Number.isFinite(lon))
        ? geoToTile(lat, lon, this.geoCenter, this._mPerTile, this._mapW, this._mapH)
        : { x: -999, y: -999 };
    
      const tags = raw.tags ?? (raw.data?.tags ?? {});
      let ftype = resolveFeatureType(raw?.title ?? (raw?.label ?? ""), tags, raw.color ?? raw.colour ?? null);

      // ── ECOSYSTEM OVERRIDE ──
      // If OSM says "it's a tree" but doesn't say what kind, use the local dominant species
      if (tags.natural === 'tree' && !tags.genus && !raw.scientificName) {
        if (this.localTreeAsset && this.localTreeAsset !== 'tree') {
          const speciesConfig = resolveFeatureType("", { genus: this.localTreeAsset });
          if (speciesConfig.asset !== 'default') ftype = speciesConfig;
        }
      }
    
      return {
        id:    raw.id ?? String(Math.random()),
        tx:    pos.x,
        ty:    pos.y,
        color: raw.color ?? raw.colour ?? ftype.color,
        label: raw.label ?? raw.title ?? raw.name ?? tags.name ?? ftype.label ?? '',
        // Store the resolved config on the feature so the renderer doesn't have to re-guess
        ftype: ftype, 
        data:  { ...raw, ...raw.data },
        tags
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

      this._fetching     = true;
      this._lastFetchPos = { ...center };
      this.emit('fetch:start');

      const fetches = this._loaders.map(l =>
        l.fetch(center).catch(err => { console.error(`[GOECore] Loader ${l.id} failed:`, err); return {}; })
      );

      Promise.all(fetches).then(results => {
        const { x: pGX, y: pGY } = this._pGlobal();

        // 1. FIRST PASS: Handle Terrain, Buildings, and Weather
        // We do this first so the TerrainCache is ready for our animal checks
        for (const result of results) {
          if (result.terrainUpdates) {
            this.terrainCache.merge(result.terrainUpdates);
          }
          if (result.buildingWays) {
            this._buildings = preprocessBuildings(result.buildingWays);
          }
          if (result.weatherUpdate && this.weather) {
            this.weather.setMode(result.weatherUpdate.mode);
            this.weather.wind = result.weatherUpdate.wind;
            this.emit('weather:changed', result.weatherUpdate);
          }
        }

        // 2. SECOND PASS: Handle Features (with Procedural Filtering)
        results.forEach(result => {
          if (result.features) {
            result.features.forEach(f => {
              if (f.data?.isProcedural) {
                // Project to tile space to check the ground
                const pos = geoToTile(f.latitude, f.longitude, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
                const terrainId = this.terrainCache.getLocal(pos.x, pos.y, pGX, pGY, this._mapW, this._mapH);
                
                // Only add if it's Grass (1) or Forest/Wood (7)
                // This prevents squirrels spawning in the middle of a skyscraper
                if (terrainId === 1 || terrainId === 7) { 
                  this.addFeature(f);
                }
              } else {
                // Always add real scientific sightings from GBIF/OSM
                this.addFeature(f);
              }
            });
          }
        });
        
        // 3. Update Ecosystem (Now that all features are added)
        this._updateLocalEcosystem();

        this._elevation?.prefetch?.(center);
        this._fetching = false;
        this.emit('fetch:done');
      });
    }

  // ── RENDER FRAME ──────────────────────────────────────────────────────────

  _getMovementState(tx, ty, pGX, pGY) {
      const tid = this.terrainCache.getLocal(tx, ty, pGX, pGY, this._mapW, this._mapH);
      const isWater = tid === TerrainType.WATER;
      const isDeepWater = tid === TerrainType.DEEP_WATER;

      // 1. Building Collision
      // We check the cachedDrawList which is now populated BEFORE movement
      let insideBuilding = false;
      for (const b of this._cachedDrawList) {
        // b.r is in Voxel Units (8 per tile). 
        // We add a small player-radius buffer (0.2 tiles)
        const halfSideTiles = b.r / 8;           // b.r is in voxel units, 8 VU = 1 tile
        const hitRadius = halfSideTiles * 1.42 + 0.15;
        const dx = tx - b.p.x;
        const dy = ty - b.p.y;
        
        // Fast square-distance check (cheaper than hypot)
        if (dx * dx + dy * dy < hitRadius * hitRadius) {
          insideBuilding = true;
          break;
        }
      }

      // 2. Feature Collision
      let insideFeature = false;
      if (!insideBuilding) {
        for (const f of this._features) {
          const dx = tx - (f.tx + 0.5);
          const dy = ty - (f.ty + 0.5);
          if (dx * dx + dy * dy < 0.25) { // 0.5 tile diameter
            insideFeature = true;
            break;
          }
        }
      }

      const isBlocked = isDeepWater || insideBuilding || insideFeature;

      return {
        isBlocked,
        isSwimming: isWater && !isBlocked,
        speedMult: isWater ? 0.45 : 1.0
      };
    }

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

        // 1. Update Physics
        cam.updateTilt(dt);
        cam.updateRotation(dt, this.player.x, this.player.y, worldToScreen);
        if (this._input.isRotatingLeft())  cam.rotVel -= 2.2 * dt;
        if (this._input.isRotatingRight()) cam.rotVel += 2.2 * dt;
        if (this.weather) this.weather.update(dt, this.player.x, this.player.y);

        const { x: pGX, y: pGY } = this._pGlobal();
        const pElev = this._playerElev();

        // 2. PRE-CALCULATE PLAYER SCREEN POSITION (For Transparency Check)
        const pScr = worldToScreen(this.player.x, this.player.y, pElev, cam);
        const pDepth = tileDepth(this.player.x, this.player.y, cam.rotation);

        // 3. Nature AI (Flee/Wiggle)
        this._features.forEach(f => {
          if (f.data?.category === 'nature') {
            const dx = f.tx - this.player.x, dy = f.ty - this.player.y;
            const distSq = dx * dx + dy * dy;

            if (f.data.subType === 'animal') {
              // this._features.forEach(other => {
              //     if (other.id !== f.id && other.data?.subType === 'animal') {
              //         const sepX = f.tx - other.tx;
              //         const sepY = f.ty - other.ty;
              //         const sepDistSq = sepX * sepX + sepY * sepY;

              //         // If they are within 0.6 tiles of each other, push away!
              //         if (sepDistSq < 0.36) { 
              //             const pushStrength = 0.02; 
              //             f.tx += sepX * pushStrength;
              //             f.ty += sepY * pushStrength;
              //         }
              //     }
              // });
              
              if (distSq < 64) {
                const angle = Math.atan2(dy, dx);
                const moveX = Math.cos(angle) * 0.05;
                const moveY = Math.sin(angle) * 0.05;
                
                f.tx += moveX;
                f.ty += moveY;

                // ── NEW: Update geographic lat/lon so they don't teleport back on reset ──
                const newGeo = tileToGeo(f.tx, f.ty, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
                f.data.latitude = newGeo.lat;
                f.data.longitude = newGeo.lon;
                // ────────────────────────────────────────────────────────────────────────
              }
            } else if (f.data.subType === 'plant') {
              f.data.wiggle = (distSq < 1.5) ? Math.sin(ts * 0.02) * 0.2 : 0;
            }
          }
        });

        // 4. Projection Prep
        if (this._buildings.length > 0) {
          const rotChanged = this._lastBuildingRot === null || Math.abs(cam.rotation - this._lastBuildingRot) > 0.02;
          if (rotChanged || this._cachedDrawList.length !== this._buildings.length) {
            this._lastBuildingRot = cam.rotation;
            this._cachedDrawList = [];
            for (const b of this._buildings) {
              const p = geoToTile(b.centroid.lat, b.centroid.lon, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
              if (p.x < 0 || p.x >= this._mapW || p.y < 0 || p.y >= this._mapH) continue;
              const VU = 8;
              const r = Math.max(VU, Math.min(VU * 20, (Math.sqrt(Math.max(1, b.areaM2)) / this._mPerTile / 2) * VU));
              const cr = Math.cos(cam.rotation), sr = Math.sin(cam.rotation);
              const frontX = p.x + (r / VU) * Math.abs(cr), frontY = p.y + (r / VU) * Math.abs(sr);
              const gx = Math.round(p.x) - this._mapW / 2 + pGX, gy = Math.round(p.y) - this._mapH / 2 + pGY;
              const elev = getElevOffset(this.terrainRegistry.heights[this.terrainCache.get(gx, gy) ?? TerrainType.GRASS] ?? 1, cam.tilt, cam.zoom);
              this._cachedDrawList.push({ p, r, engineH: Math.max(VU, Math.min(VU * 60, (b.heightM / this._mPerTile) * VU)), tc: this.terrainRegistry.colors[TerrainType.BUILDING], depth: tileDepth(frontX, frontY, cam.rotation), elev });
            }
          }
        }

        // 5. Movement
        const mv = this._input.getMovementVector();
        if (mv) {
          this.player.isMoving = true; this.player.faceAngle = Math.atan2(-mv.dy, mv.dx);
          const hw = tileHalfWidth(cam.zoom, cam.tileW), hh = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
          const cr = Math.cos(cam.rotation), sr = Math.sin(cam.rotation);
          const rx = (mv.dx / hw + mv.dy / hh) * 0.5, ry = (mv.dy / hh - mv.dx / hw) * 0.5;
          const wx = rx * cr - ry * sr, wy = rx * sr + ry * cr;
          const tState = this._getMovementState(this.player.x, this.player.y, pGX, pGY);
          const spd = (PLAYER_SPEED * tState.speedMult) * dt * 60 / (Math.hypot(wx, wy) || 1);
          this.player.walkCycle += dt * 15 * tState.speedMult;
          const nX = this.player.x + wx * spd, nY = this.player.y + wy * spd;
          if (!this._getMovementState(nX, nY, pGX, pGY).isBlocked) { this.player.x = nX; this.player.y = nY; }
          else if (!this._getMovementState(nX, this.player.y, pGX, pGY).isBlocked) { this.player.x = nX; }
          else if (!this._getMovementState(this.player.x, nY, pGX, pGY).isBlocked) { this.player.y = nY; }
          this.player.x = Math.max(0.5, Math.min(this._mapW - 0.5, this.player.x));
          this.player.y = Math.max(0.5, Math.min(this._mapH - 0.5, this.player.y));
          if (cam.tilt > 0.08) {
            const { x: px, y: py } = worldToScreen(this.player.x, this.player.y, pElev, { ...cam, camX: 0, camY: 0 });
            cam.camX += (px - W / 2 - cam.camX) * 0.08; cam.camY += (py - H / 2 - cam.camY) * 0.08;
          }
          this.emit('player:move', { x: this.player.x, y: this.player.y, geo: tileToGeo(this.player.x, this.player.y, this.geoCenter, this._mPerTile, this._mapW, this._mapH), isSwimming: tState.isSwimming });
        } else { this.player.isMoving = false; this.player.walkCycle = 0; }

        // 6. World Re-centre
        const dFC = Math.hypot(this.player.x - this._mapW/2, this.player.y - this._mapH/2);
        if (dFC > REFETCH_DIST && !this._fetching) {
          const oldS = worldToScreen(this.player.x, this.player.y, pElev, cam);
          this.geoCenter = tileToGeo(this.player.x, this.player.y, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
          this.player.x = this._mapW/2; this.player.y = this._mapH/2;
          const newS = worldToScreen(this.player.x, this.player.y, pElev, cam);
          cam.camX += newS.x - oldS.x; cam.camY += newS.y - oldS.y;
          this._lastTileCamX = null; this._cachedDrawList = []; this._rebuildFeatures(); this._doFetch(this.geoCenter);
          this.emit('center:changed', this.geoCenter);
        }

        // 7. Sort Render List
        const renderList = [];
        for (const b of this._cachedDrawList) renderList.push({ type:'b', d:b.depth, data:b });
        for (const f of this._features) renderList.push({ type:'f', d:tileDepth(f.tx, f.ty, cam.rotation), data:f });
        renderList.push({ type:'p', d:pDepth, data:this.player });
        renderList.sort((a,b) => a.d - b.d);

        // 8. Render Pass
        ctx.fillStyle = this.weather?.mode === 'rain' ? '#020308' : '#04060a'; 
        ctx.fillRect(0, 0, W, H);
        this._voxelR.beginFrame();
        this._shadows.beginFrame();

        // 8a. Tiles
        const overAlpha = Math.max(0, Math.min(1, (cam.zoom - 0.02) / 0.015));
        if (overAlpha > 0 && this.debugLayers.overpass) {
          const lod = cam.zoom > 0.25 ? 1 : cam.zoom > 0.10 ? 2 : 4;
          if (lod > 1) this._tileR.drawMergedLayer(this.terrainCache, pGX, pGY, lod, overAlpha);
          else {
            if (this._lastTileCamX === null || Math.abs(cam.camX - this._lastTileCamX) > 3) {
              this._lastTileCamX = cam.camX;
              const hw = tileHalfWidth(cam.zoom, cam.tileW), hh = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
              const txs = Math.min(120, Math.ceil(W / Math.max(1, hw)) + 4), tys = Math.min(120, Math.ceil(H / Math.max(1, hh)) + 4);
              const vC = screenToWorld(W / 2, H / 2, cam);
              const cx = Math.round(Math.max(0, Math.min(this._mapW, vC.x))), cy = Math.round(Math.max(0, Math.min(this._mapH, vC.y)));
              this._tileCache = [];
              for (let ty = Math.max(0, cy - tys); ty < Math.min(this._mapH, cy + tys); ty++)
                for (let tx = Math.max(0, cx - txs); tx < Math.min(this._mapW, cx + txs); tx++)
                  this._tileCache.push({ tx, ty, terrainId: this.terrainCache.get(tx - this._mapW / 2 + pGX, ty - this._mapH / 2 + pGY) ?? TerrainType.GRASS });
            }
            this._tileR.drawLayer(this._tileCache, this.player.x, this.player.y, this.terrainCache, pGX, pGY);
          }
        }

        if (this._shadows.enabled && cam.tilt > 0.05) this._shadows.drawBuildingShadows(this._cachedDrawList);
        this._featR.frameNow = ts;

        // 8b. DRAW SORTED OBJECTS WITH TRANSPARENCY
        for (const item of renderList) {
          let isObstructing = false;

          // detection logic: If item is in front of player (depth-wise)
          if (item.d > pDepth) {
              if (item.type === 'b') {
                  // Building check: Screen distance check
                  const bPos = worldToScreen(item.data.p.x, item.data.p.y, item.data.elev, cam);
                  const dx = Math.abs(bPos.x - pScr.x);
                  const dy = pScr.y - bPos.y; // positive dy means player is "behind" building base
                  // If player is within building width and behind it visually
                  if (dx < item.data.r * cam.zoom * 2 && dy > 0 && dy < item.data.engineH * cam.zoom * 1.5) {
                      isObstructing = true;
                  }
              } else if (item.type === 'f') {
                  // Feature/Tree check: simple radius
                  const fPos = worldToScreen(item.data.tx+0.5, item.data.ty+0.5, 0, cam);
                  const dist = Math.hypot(fPos.x - pScr.x, fPos.y - pScr.y);
                  if (dist < 40 * cam.zoom) isObstructing = true;
              }
          }

          ctx.globalAlpha = isObstructing ? 0.35 : 1.0;

          if (item.type === 'b') {
            const b = item.data; this._voxelR.beginTile(b.p.x, b.p.y, b.elev);
            this._voxelR.box(-b.r, 0, -b.r, b.r * 2, b.engineH, b.r * 2, b.tc.top, b.tc.right, b.tc.left);
            decorateBuildingFacade(ctx, cam, b, this._voxelR, Math.abs(Math.round(b.p.x * 31 + b.p.y * 17)));
          } else if (item.type === 'f') {
            this._featR.drawFeature(item.data, this._selectedId === item.data.id, this.terrainCache, pGX, pGY);
          } else if (item.type === 'p') {
            ctx.globalAlpha = 1.0; // Never make the player transparent
            this._playerR.draw(this.player.x, this.player.y, pElev, this.player, this._mPerTile);
          }
          
          ctx.globalAlpha = 1.0;
        }

        if (this.weather) this.weather.draw();

        const geo = tileToGeo(this.player.x, this.player.y, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
        this.emit('hud', { lat: geo.lat, lon: geo.lon, zoom: cam.zoom.toFixed(2), tilt: cam.tilt.toFixed(2), terrain: this.terrainRegistry.names[this.terrainCache.getLocal(this.player.x, this.player.y, pGX, pGY, this._mapW, this._mapH)] ?? 'Unknown' });
      }

  // ── BUILDING DRAW ─────────────────────────────────────────────────────────

  _drawBuildings(pGX, pGY) {
    if (!this._buildings.length) return;
    const cam = this.camera;

    const rotChanged =
      this._lastBuildingRot === null ||
      Math.abs(cam.rotation - this._lastBuildingRot) > 0.02;

    const countChanged = this._cachedDrawList.length !== this._buildings.length;

    if (rotChanged || countChanged) {
      this._lastBuildingRot = cam.rotation;
      this._cachedDrawList  = [];

      for (const b of this._buildings) {
        const p = geoToTile(
          b.centroid.lat, b.centroid.lon,
          this.geoCenter, this._mPerTile, this._mapW, this._mapH
        );
        if (p.x < 0 || p.x >= this._mapW || p.y < 0 || p.y >= this._mapH) continue;
        if (cam.tilt < 0.05) continue;

        const VU           = 8;
        const tileSize     = this._mPerTile;
        const halfSideM    = Math.sqrt(Math.max(1, b.areaM2));
        const r            = Math.max(VU, Math.min(VU * 20, (halfSideM / tileSize / 2) * VU));
        const footprintTiles = r / VU;

        const cr    = cam._cr ?? Math.cos(cam.rotation);
        const sr    = cam._sr ?? Math.sin(cam.rotation);
        const backX = p.x - footprintTiles * Math.abs(cr);
        const backY = p.y - footprintTiles * Math.abs(sr);
        const depth = tileDepth(backX, backY, cam.rotation);

        const gx          = Math.round(p.x) - this._mapW / 2 + pGX;
        const gy          = Math.round(p.y) - this._mapH / 2 + pGY;
        const terrainType = this.terrainCache.get(gx, gy) ?? TerrainType.GRASS;
        const elev        = getElevOffset(
          this.terrainRegistry.heights[terrainType] ?? 1,
          cam.tilt, cam.zoom
        );
        const engineH = Math.max(VU, Math.min(VU * 60, (b.heightM / tileSize) * VU));
        const tc      = this.terrainRegistry.colors[TerrainType.BUILDING];

        this._cachedDrawList.push({ p, elev, r, engineH, tc, depth });
      }

      this._cachedDrawList.sort((a, b) => a.depth - b.depth);
    }

    if (this._shadows.enabled) {
      this._shadows.drawBuildingShadows(this._cachedDrawList);
    }

    for (const { p, elev, r, engineH, tc } of this._cachedDrawList) {
      this._voxelR.beginTile(p.x, p.y, elev);
      this._voxelR.box(-r, 0, -r, r * 2, engineH, r * 2, tc.top, tc.right, tc.left);
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

  /** Toggle shadow + AO rendering. */
  toggleShadows(value) {
    if (this._shadows) this._shadows.enabled = value ?? !this._shadows.enabled;
  }
 
  /**
   * Change sun direction at runtime.
   * @param {number} angle      Compass radians (0 = +X right, PI/2 = +Y down)
   * @param {number} [elevation] 0 = horizon, PI/2 = zenith
   */
  setSunAngle(angle, elevation) {
    if (!this._shadows) return;
    this._shadows.sunAngle     = angle;
    if (elevation != null) this._shadows.sunElevation = elevation;
  }
 
}