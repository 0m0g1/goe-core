/**
 * GOE Core — Engine (WorldRenderer architecture)
 *
 * Single WorldRenderer orchestrates every canvas operation.
 * No entity or subsystem holds a CanvasRenderingContext2D directly.
 *
 * Performance optimisations integrated:
 *   - Frustum culling (CULL_MARGIN = 4)
 *   - Tile cache rebuilt only when camera moves
 *   - Physics world updates only when dynamic entities exist
 *   - LOD for blueprints (trees/buildings) at low zoom
 *   - Camera animation throttle drops expensive geometry
 *   - VoxelRenderer: cached hex colours, no save/restore
 *   - OSMLayerRenderer: concurrent tile fetch limit (6)
 */
import { EventEmitter }      from './core/EventEmitter.js';
import { Camera }            from './core/Camera.js';
import { InputManager }      from './core/InputManager.js';
import { TerrainCache }      from './terrain/TerrainCache.js';
import { createTerrainRegistry, TerrainType } from './terrain/types.js';
import { TileRenderer }      from './render/TileRenderer.js';
import { FeatureRenderer, decorateBuildingFacade } from './render/FeatureRenderer.js';
import { resolveFeatureType } from './terrain/FeatureTypes.js';
import { OSMLayerRenderer }  from './render/OSMLayerRenderer.js';
import { WorldRenderer }     from './render/Renderer.js';
import { drawPlayer }        from './assets/PlayerBlueprint.js';
import { Blueprints }        from './assets/BluePrintLibrary.js';
import {
  worldToScreen, screenToWorld, tileHalfWidth, tileHalfHeight,
  getElevOffset, tileDepth,
} from './math/projection.js';
import {
  geoToTile, tileToGeo, lonToGlobalX, latToGlobalY,
} from './math/geo.js';
import { preprocessBuildings } from './loaders/geo/BuildingPreprocessor.js';
import { WeatherSystem } from './render/WeatherSystem.js';

import PhysicsWorld2D from 'https://esm.sh/yaphe-engine@1.0.5/src/modules/2d/physicsworld2d.js';
import Particle2D     from 'https://esm.sh/yaphe-engine@1.0.5/src/modules/2d/particle2d.js';
import Spring2D       from 'https://esm.sh/yaphe-engine@1.0.5/src/modules/2d/spring2d.js';
import Constraint2D   from 'https://esm.sh/yaphe-engine@1.0.5/src/modules/2d/constraint2d.js';
import Vector2D       from 'https://esm.sh/yaphe-engine@1.0.5/src/modules/2d/vector2d.js';

import { Entity, ENTITY_TYPES } from './core/Entity.js';
import { Quadtree } from './spatial/Quadtree.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tree blueprint key mapping
// ─────────────────────────────────────────────────────────────────────────────
const TREE_BLUEPRINT_KEY = {
  conifer:   'tree_pine',
  palm:      'tree_palm',
  forest:    'forest',
  park:      'park',
  deciduous: 'tree_oak',
};

// ─────────────────────────────────────────────────────────────────────────────
// PlayerEntity
// ─────────────────────────────────────────────────────────────────────────────
class PlayerEntity extends Entity {
  constructor(id = 'player', tx = 40, ty = 40) {
    super(id, ENTITY_TYPES.PLAYER, tx, ty);
    this.walkCycle  = 0;
    this.isMoving   = false;
    this.faceAngle  = Math.PI / 2;
    this.speedMult  = 1.0;
    this.physicsEnabled = true;
    this.physicsRadius  = 0.5;
    this.fixed          = false;
    this.solid          = false;   // Player is not solid (doesn't block others)
    this.bboxRadius     = 0.5;

    this._posHistory      = [];
    this._POS_HISTORY_MAX = 10;
    this.solid = true;
  }

  update(dt, engine) {
    const input = engine._input;
    const mv    = input.getMovementVector();

    if (mv) {
        this.isMoving  = true;
        this.faceAngle = Math.atan2(-mv.dy, mv.dx);

        const cam = engine.camera;
        const hw  = tileHalfWidth(cam.zoom, cam.tileW);
        const hh  = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
        const cr  = Math.cos(cam.rotation), sr = Math.sin(cam.rotation);
        const rx  = (mv.dx / hw + mv.dy / hh) * 0.5;
        const ry  = (mv.dy / hh - mv.dx / hw) * 0.5;
        const wx  = rx * cr - ry * sr;
        const wy  = rx * sr + ry * cr;
        const spd = (0.22 * this.speedMult) * dt * 60 / (Math.hypot(wx, wy) || 1);

        this.walkCycle += dt * 15 * this.speedMult;

        // Try full move, then axis-separated fallbacks
        const attempts = [
            { x: this.tx + wx * spd, y: this.ty + wy * spd },  // full
            { x: this.tx + wx * spd, y: this.ty },              // x only
            { x: this.tx,            y: this.ty + wy * spd },   // y only
        ];

        let moved = false;
        for (const attempt of attempts) {
            if (!this._isBlocked(attempt.x, attempt.y, engine)) {
                this.tx = Math.max(0.5, Math.min(engine._mapW - 0.5, attempt.x));
                this.ty = Math.max(0.5, Math.min(engine._mapH - 0.5, attempt.y));
                moved = true;
                break;
            }
        }

    } else {
        this.isMoving  = false;
        this.walkCycle = 0;
    }

    // Pushout — if somehow inside a solid, eject
    this._resolveOverlap(engine);

    // Contact-push dynamic physics entities (unchanged)
    for (const other of engine.entities) {
      if (other === this || !other._particle || other.fixed) continue;
      const dx   = other.tx - this.tx;
      const dy   = other.ty - this.ty;
      const dist = Math.hypot(dx, dy);
      const minD = this.physicsRadius + other.physicsRadius;
      if (dist < minD && dist > 0) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = minD - dist;
        const avg = this.getAverageHistoryPos();
        const pvx = this.tx - avg.x, pvy = this.ty - avg.y;
        const dot = pvx * nx + pvy * ny;
        const KICK = 0.5;
        const evx = nx * overlap + nx * Math.max(0, dot) * KICK;
        const evy = ny * overlap + ny * Math.max(0, dot) * KICK;
        const p   = other._particle;
        p.prevPosition.x = p.position.x - evx;
        p.prevPosition.y = p.position.y - evy;
        p.position.x += nx * overlap;
        p.position.y += ny * overlap;
      }
    }

    this._posHistory.push({ x: this.tx, y: this.ty });
    if (this._posHistory.length > this._POS_HISTORY_MAX) this._posHistory.shift();
  }

  _isBlocked(newX, newY, engine) {
    const queryRadius = this.bboxRadius + 1.5;
    const range = {
        x: newX - queryRadius,
        y: newY - queryRadius,
        w: queryRadius * 2,
        h: queryRadius * 2,
    };
    const candidates = engine._spatialTree.queryRange(range);
    for (const candidate of candidates) {
        const other = candidate.entity;
        if (other === this || !other.solid) continue;
        if (this._overlaps(newX, newY, other)) return true;
    }
    return false;
  }

  _overlaps(px, py, other) {
      if (other.type === 'building') {
          const r = other.bboxRadius;
          const cx = Math.max(other.tx - r, Math.min(other.tx + r, px));
          const cy = Math.max(other.ty - r, Math.min(other.ty + r, py));
          return Math.hypot(px - cx, py - cy) < this.bboxRadius;
      }
      // circle-circle
      const dx = px - other.tx, dy = py - other.ty;
      const minDist = this.bboxRadius + other.bboxRadius;
      return dx * dx + dy * dy < minDist * minDist;
  }

  _resolveOverlap(engine) {
      // If currently overlapping any solid, push out along shortest axis
      for (const e of engine.entities) {
          if (e === this || !e.solid) continue;
          if (!this._overlaps(this.tx, this.ty, e)) continue;

          if (e.type === 'building') {
              const r = e.bboxRadius;
              // Find which face is closest and push to that face
              const overlapL = (this.tx + this.bboxRadius) - (e.tx - r);
              const overlapR = (e.tx + r) - (this.tx - this.bboxRadius);
              const overlapT = (this.ty + this.bboxRadius) - (e.ty - r);
              const overlapB = (e.ty + r) - (this.ty - this.bboxRadius);
              const min = Math.min(overlapL, overlapR, overlapT, overlapB);
              if (min === overlapL) this.tx -= overlapL;
              else if (min === overlapR) this.tx += overlapR;
              else if (min === overlapT) this.ty -= overlapT;
              else this.ty += overlapB;
          } else {
              const dx = this.tx - e.tx, dy = this.ty - e.ty;
              const dist = Math.hypot(dx, dy) || 0.001;
              const push = this.bboxRadius + e.bboxRadius - dist;
              this.tx += (dx / dist) * push;
              this.ty += (dy / dist) * push;
          }
      }
  }

  getAverageHistoryPos() {
    if (!this._posHistory.length) return { x: this.tx, y: this.ty };
    const sum = this._posHistory.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 }
    );
    return { x: sum.x / this._posHistory.length, y: sum.y / this._posHistory.length };
  }

  render(wr, groundElevPx, extra) {
    drawPlayer(wr, this.tx, this.ty, groundElevPx + this.elevOffset, this, extra.mPerTile);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FeatureEntity
// ─────────────────────────────────────────────────────────────────────────────
class FeatureEntity extends Entity {
  constructor(id, tx, ty, data = {}) {
    super(id, ENTITY_TYPES.FEATURE, tx, ty);
    this.data  = data;
    this.label = data.label || data.title || data.name || '';
    this.color = data.color || '#60a5fa';
    this.ftype = resolveFeatureType(this.label, data.tags || {}, this.color);

    // Forward altitude properties from data
    this.altitudeM        = data.altitudeM        ?? 0;
    this.visualAlt        = data.visualAlt        ?? 0;
    this.showAltitudeLine = data.showAltitudeLine  ?? false;

    this.bboxRadius     = 0.35;
    this.physicsEnabled = data.physics === true;
    this.physicsRadius  = data.physicsRadius || 0.35;
    this.fixed          = data.fixed ?? true;
    this.solid          = false;
  }

  render(wr, groundElevPx, extra) {
    extra.featureResolver.drawFeature(
      wr, this, extra.selectedId === this.id, extra.terrainCache, extra.pGX, extra.pGY
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BuildingEntity
// ─────────────────────────────────────────────────────────────────────────────
class BuildingEntity extends Entity {
  constructor(id, tx, ty, footprintRadiusTiles, heightM, colorSet = null) {
    super(id, ENTITY_TYPES.BUILDING, tx, ty);
    this.footprintRadius = footprintRadiusTiles;
    this.heightM         = heightM;
    this.colorSet        = colorSet;
    this.bboxRadius      = footprintRadiusTiles;
    this.physicsEnabled  = true;
    this.fixed           = true;
    this.physicsRadius   = footprintRadiusTiles;
    this.solid = true;
  }

  render(wr, groundElevPx, extra) {
    const VU    = 8;
    const rVox  = this.footprintRadius * VU;
    const hVox  = (this.heightM / extra.mPerTile) * VU;
    const elev  = groundElevPx + this.elevOffset;
    const depth = tileDepth(this.tx, this.ty, wr.cam.rotation);

    // 1. Volumetric shadow footprint
    wr.submitShadow({ p: { x: this.tx, y: this.ty }, elev, r: rVox, engineH: hVox });

    // 2. Voxel geometry
    wr.submitWorldObject(depth, () => {
      wr.beginTile(this.tx, this.ty, elev);
      wr.box(
        -rVox, 0, -rVox, rVox * 2, hVox, rVox * 2,
        this.colorSet?.top   || '#b0a090',
        this.colorSet?.right || '#8a7a6a',
        this.colorSet?.left  || '#6a5a4a',
      );

      if (extra.decorateFacade) {
        const entry = {
          p: { x: this.tx, y: this.ty },
          r: rVox, engineH: hVox, elev,
          tc: this.colorSet ?? { top: '#b0a090' },
        };
        extra.decorateFacade(wr.ctx, wr.cam, entry, wr._voxel, this._facadeSeed ?? 0);
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TreeEntity — blueprint lookup; no TreeRenderer class needed
// ─────────────────────────────────────────────────────────────────────────────
class TreeEntity extends Entity {
  constructor(id, tx, ty, treeType = 'deciduous', scale = 1.0, seed = 0) {
    super(id, ENTITY_TYPES.TREE, tx, ty);
    this.treeType       = treeType;
    this.scale          = scale;
    this.seed           = seed;
    this.bboxRadius     = 0.5;
    this.physicsEnabled = true;
    this.fixed          = true;
    this.physicsRadius  = 0.5;
    this.solid = true;
  }

  render(wr, groundElevPx, extra) {
    const bpKey    = TREE_BLUEPRINT_KEY[this.treeType] ?? 'tree_oak';
    const blueprint = Blueprints[bpKey] ?? Blueprints['tree'];
    const elev     = groundElevPx + this.elevOffset;
    const depth    = tileDepth(this.tx, this.ty, wr.cam.rotation);

    wr.submitWorldObject(depth, () => {
      if (wr.cam.tilt < 0.04) return;
      const isoA = Math.min(1, (wr.cam.tilt - 0.04) / 0.12);
      wr.ctx.globalAlpha = isoA;
      wr.drawBlueprint(blueprint, this.tx, this.ty, elev);
      wr.ctx.globalAlpha = 1;
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────
const MAP_W        = 80;
const MAP_H        = 80;
const REFETCH_DIST = 18;
const M_PER_TILE   = 2;

// Performance tunables
const CULL_MARGIN             = 4;          // tiles margin for frustum culling
const LOD_BLUEPRINT_MIN_ZOOM  = 0.05;       // min zoom to draw trees/buildings
const TILE_CACHE_DIRTY_PX     = 2;          // px movement to rebuild tile cache
const TILE_CACHE_DIRTY_ZOOM   = 0.002;
const TILE_CACHE_DIRTY_TILT   = 0.005;
const CAMERA_SETTLE_MS        = 120;        // ms before full quality resumes
const MAX_CONCURRENT_TILES    = 6;          // OSM tile fetch throttle

export class Engine extends EventEmitter {
  constructor(opts = {}) {
    super();
    this._opts       = opts;
    this._mPerTile   = opts.mPerTile ?? M_PER_TILE;
    this._mapW       = opts.mapW     ?? MAP_W;
    this._mapH       = opts.mapH     ?? MAP_H;
    this._showPlayer = opts.showPlayer ?? true;
    this._running    = false;

    this.geoCenter     = opts.geoCenter ?? { lat: 51.505, lon: -0.09 };
    this._lastFetchPos = { lat: 0, lon: 0 };
    this._fetching     = false;

    this.camera = new Camera({
      mapW: this._mapW, mapH: this._mapH, mPerTile: this._mPerTile,
      ...opts.cameraOpts,
    });

    this.entities     = [];
    this.playerEntity = null;
    this._selectedId  = null;

    this.physicsWorld   = null;
    this.physicsEnabled = true;

    this.terrainRegistry = createTerrainRegistry(opts.terrainOverrides);
    this.terrainCache    = new TerrainCache();
    this.terrainCache.setOrigin(0, 0);
    this.terrainCache.mPerTile = this._mPerTile;
    this._loaders = [];

    this._shadowOpts = {
      sunAngle:     opts.sunAngle     ?? Math.PI * 1.25,
      sunElevation: opts.sunElevation ?? Math.PI / 5,
      shadowAlpha:  opts.shadowAlpha  ?? 0.22,
      aoStrength:   opts.aoStrength   ?? 0.28,
      enabled:      opts.shadows      ?? true,
    };

    this._tileURLFn = opts.tileURLFn ?? ((z, x, y) => `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`);
    this._elevation = opts.elevationLoader ?? null;

    this.debugLayers = {
      osmTiles:  true,
      overpass:  true,
      buildings: true,
      features:  true,
      player:    true,
    };

    this._tileCache    = [];
    this._tileCacheState = null;          // for dirty tracking
    this._lastTileCamX = null;
    this._lastTileCamY = null;
    this._lastTileZoom = null;
    this._lastTileRot  = null;

    this.weather = null;
    this.localTreeAsset = 'tree';
    this._featureCache  = new Map();

    // Camera animation flag (throttle heavy geometry)
    this._cameraAnimating = false;
    this._cameraSettleTimer = null;

    this._spatialTree = null;
    
  }

  // ── Backward compatibility getters ────────────────────────────────────────
  get player()    { return this.playerEntity; }
  get features()  { return this.entities.filter(e => e.type === ENTITY_TYPES.FEATURE); }
  get buildings() { return this.entities.filter(e => e.type === ENTITY_TYPES.BUILDING); }
  get trees()     { return this.entities.filter(e => e.type === ENTITY_TYPES.TREE); }

  // ── Physics helpers ───────────────────────────────────────────────────────
  _attachPhysics(entity) {
    if (!this.physicsWorld || !entity.physicsEnabled) return;
    if (entity._particle) return;
    const p = new Particle2D(entity.tx, entity.ty);
    p.radius = entity.physicsRadius;
    p.fixed  = entity.fixed;
    p.isCollidable = true;
    entity._particle = p;
    this.physicsWorld.particles.push(p);
  }

  _detachPhysics(entity) {
    if (entity._particle && this.physicsWorld) {
      const idx = this.physicsWorld.particles.indexOf(entity._particle);
      if (idx !== -1) this.physicsWorld.particles.splice(idx, 1);
      entity._particle = null;
    }
  }

  // ── Performance helpers ───────────────────────────────────────────────────
  _isTileVisible(tx, ty, cam, W, H) {
    const sc = worldToScreen(tx + 0.5, ty + 0.5, 0, cam);
    const hw = tileHalfWidth(cam.zoom, cam.tileW);
    const hh = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
    const mx = hw * CULL_MARGIN * 2;
    const my = hh * CULL_MARGIN * 2;
    return (sc.x > -mx && sc.x < W + mx && sc.y > -my && sc.y < H + my);
  }

  _isTileCacheDirty() {
    const c = this._tileCacheState;
    if (!c) return true;
    const cam = this.camera;
    return (
      Math.abs(cam.camX - c.camX) > TILE_CACHE_DIRTY_PX   ||
      Math.abs(cam.camY - c.camY) > TILE_CACHE_DIRTY_PX   ||
      Math.abs(cam.zoom - c.zoom)  > TILE_CACHE_DIRTY_ZOOM  ||
      Math.abs(cam.tilt - c.tilt)  > TILE_CACHE_DIRTY_TILT  ||
      Math.abs(cam.rotation - c.rot) > 0.002
    );
  }

  _saveTileCacheState() {
    const cam = this.camera;
    this._tileCacheState = {
      camX: cam.camX, camY: cam.camY,
      zoom: cam.zoom, tilt: cam.tilt, rot: cam.rotation,
    };
  }

  _markCameraAnimating() {
    this._cameraAnimating = true;
    if (this._cameraSettleTimer) clearTimeout(this._cameraSettleTimer);
    this._cameraSettleTimer = setTimeout(() => {
      this._cameraAnimating = false;
    }, CAMERA_SETTLE_MS);
  }

  // ── Patch VoxelRenderer (hot‑path optimisations) ─────────────────────────
  _patchVoxelRenderer(voxel) {
    if (voxel.__perfPatched) return;
    voxel.__perfPatched = true;

    const hexCache = new Map();
    const cachedHex = (hex) => {
      if (hexCache.has(hex)) return hexCache.get(hex);
      let h = hex;
      if (h.length === 4) {
        h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
      }
      hexCache.set(hex, h);
      return h;
    };

    const origBeginFrame = voxel.beginFrame?.bind(voxel);
    voxel.beginFrame = function() {
      if (origBeginFrame) origBeginFrame();
      this.ctx.globalAlpha = 1;
      this.ctx.shadowBlur = 0;
      this.ctx.shadowColor = 'transparent';
      this.ctx.lineCap = 'butt';
      this.ctx.lineJoin = 'miter';
    };

    const origBox = voxel.box?.bind(voxel);
    voxel.box = function(x, y, z, w, h, d, top, right, front) {
      this._topFill   = cachedHex(top);
      this._rightFill = cachedHex(right ?? top);
      this._frontFill = cachedHex(front ?? top);
      origBox(x, y, z, w, h, d, this._topFill, this._rightFill, this._frontFill);
    };
  }

  // ── Patch OSMLayerRenderer (concurrent tile throttle) ────────────────────
  _patchOSMLayerRenderer(osmLayer) {
    if (osmLayer.__perfPatched) return;
    osmLayer.__perfPatched = true;

    osmLayer._inFlight = 0;
    osmLayer._pendingLoads = [];

    const startLoad = (img, src) => {
      if (osmLayer._inFlight < MAX_CONCURRENT_TILES) {
        osmLayer._inFlight++;
        img.onload = () => { osmLayer._inFlight--; osmLayer._flushPending(); };
        img.onerror = () => { osmLayer._inFlight--; osmLayer._flushPending(); };
        img.src = src;
      } else {
        osmLayer._pendingLoads.push({ img, src });
      }
    };

    osmLayer._flushPending = function() {
      while (this._inFlight < MAX_CONCURRENT_TILES && this._pendingLoads.length) {
        const { img, src } = this._pendingLoads.shift();
        this._inFlight++;
        img.onload = () => { this._inFlight--; this._flushPending(); };
        img.onerror = () => { this._inFlight--; this._flushPending(); };
        img.src = src;
      }
    };

    if (osmLayer._loadTile) {
      const origLoadTile = osmLayer._loadTile.bind(osmLayer);
      osmLayer._loadTile = function(img, src) {
        startLoad(img, src);
      };
    } else {
      osmLayer._startLoad = startLoad;
    }
  }

  // ── MOUNT ─────────────────────────────────────────────────────────────────
  mount(canvas) {
    if (this._running) return;
    this._canvas  = canvas;
    this._ctx     = canvas.getContext('2d');
    this._running = true;

    const cam = this.camera;

    // ── Single WorldRenderer — the only gateway to the canvas ──────────────
    this._renderer = new WorldRenderer(this._ctx, cam, { shadow: this._shadowOpts });
    this._patchVoxelRenderer(this._renderer._voxel);   // apply hot‑path patch

    // Subsystems accept WorldRenderer instead of raw ctx/cam
    this._tileR    = new TileRenderer(this._renderer, this.terrainRegistry);
    this._featR    = new FeatureRenderer(this._renderer, this.terrainRegistry);
    this._osmLayer = new OSMLayerRenderer(this._renderer, this._tileURLFn);
    this._patchOSMLayerRenderer(this._osmLayer);       // throttle tile loading

    this.physicsWorld = new PhysicsWorld2D(this._mapW, this._mapH, 0.0);

    const resize = () => {
      canvas.width  = canvas.offsetWidth  || window.innerWidth;
      canvas.height = canvas.offsetHeight || window.innerHeight;
    };
    resize();
    this._ro = new ResizeObserver(resize);
    this._ro.observe(canvas);

    this._input = new InputManager(canvas, { zoomSpeed: cam.zoomSpeed });
    this._input.on('wheel',  ({ delta, x, y }) => {
      this._markCameraAnimating();
      cam.zoom_at(cam.zoom - delta * cam.zoomSpeed * cam.zoom, x ?? 0, y ?? 0);
    });
    this._input.on('pinch',  ({ dist, lastDist, cx, cy }) => {
      this._markCameraAnimating();
      cam.zoom_at(cam.zoom * (dist / lastDist), cx ?? 0, cy ?? 0);
    });
    this._input.on('pan',    ({ dx, dy }) => { cam.camX -= dx; cam.camY -= dy; });
    this._input.on('rotate', ({ delta }) => {
      this._markCameraAnimating();
      cam.rotVel += delta * 5;
    });
    this._input.on('click',  ev => this._handleClick(ev));

    for (const loader of this._loaders) loader.init?.(this);

    this.playerEntity = new PlayerEntity('player', this._mapW / 2, this._mapH / 2);
    this.entities.push(this.playerEntity);
    this._attachPhysics(this.playerEntity);

    this._doFetch(this.geoCenter);
    this._lastT = 0;
    this._raf   = requestAnimationFrame(ts => {
      this._centreCameraOnPlayer();
      this._frameOptimized(ts);
    });

    // WeatherSystem also routes through WorldRenderer
    this.weather = new WeatherSystem(this._renderer);
    this.weather.setMode('none');

    this._spatialTree = new Quadtree({ x: 0, y: 0, w: this._mapW, h: this._mapH }, 8);

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

  // ── PUBLIC API ────────────────────────────────────────────────────────────
  setTileSource(urlFn) {
    this._tileURLFn = urlFn;
    this._osmLayer?.setURLFn(urlFn);
  }

  addEntity(entity) {
    this.entities.push(entity);
    if (entity.physicsEnabled) this._attachPhysics(entity);
  }

  removeEntity(id) {
    const idx = this.entities.findIndex(e => e.id === id);
    if (idx !== -1) {
      this._detachPhysics(this.entities[idx]);
      this.entities.splice(idx, 1);
    }
  }

  selectEntity(id) {
    this._selectedId = id;
    const ent = this.entities.find(e => e.id === id);
    if (ent) this._flyToTile(ent.tx + 0.5, ent.ty + 0.5);
  }

  setFeatures(rawFeatures) {
    const toRemove = this.entities.filter(e => e.type === ENTITY_TYPES.FEATURE);
    for (const e of toRemove) this._detachPhysics(e);
    this.entities = this.entities.filter(e => e.type !== ENTITY_TYPES.FEATURE);

    const { x: pGX, y: pGY } = this._pGlobal();
    const toLocal = (globalX, globalY) => ({
      x: globalX - pGX + this._mapW / 2,
      y: globalY - pGY + this._mapH / 2
    });

    for (const f of rawFeatures) {
      const lat = f.latitude ?? f.lat;
      const lon = f.longitude ?? f.lon;
      if (lat == null || lon == null) continue;
      const globalX = lonToGlobalX(lon, this.geoCenter.lat, this._mPerTile);
      const globalY = latToGlobalY(lat, this._mPerTile);
      const local = toLocal(globalX, globalY);
      if (local.x < 0 || local.x >= this._mapW || local.y < 0 || local.y >= this._mapH) continue;
      const feature = new FeatureEntity(f.id, local.x, local.y, f);
      this.entities.push(feature);
      if (feature.physicsEnabled) this._attachPhysics(feature);
    }
    this.emit('features:changed', this.features);
  }

  addFeature(f) {
    const lat = f.latitude ?? f.lat;
    const lon = f.longitude ?? f.lon;
    if (lat == null || lon == null) return;
    const pos     = geoToTile(lat, lon, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
    const feature = new FeatureEntity(f.id, pos.x, pos.y, f);
    this.entities.push(feature);
    if (feature.physicsEnabled) this._attachPhysics(feature);
  }

  setParcels(parcels) { /* optional */ }
  use(loader) { this._loaders.push(loader); return this; }
  setElevationLoader(loader) {
    this._elevation = loader;
    if (this._running && this.geoCenter) loader.prefetch?.(this.geoCenter);
  }

  panTo(lat, lon) {
    const prevGeo = { ...this.geoCenter };
    this.geoCenter = { lat, lon };
    this._osmLayer.resetTileCache();
    this._exactPG  = null;
    if (this.playerEntity) {
      this.playerEntity.tx = this._mapW / 2;
      this.playerEntity.ty = this._mapH / 2;
      this.playerEntity._posHistory = [];
    }
    this._lastFetchPos = { lat: 0, lon: 0 };
    this._fetching     = false;
    this._rebuildAllEntitiesGeo(prevGeo);
    this._centreCameraOnPlayer();
    this._doFetch(this.geoCenter);
  }

  flyTo(lat, lon, zoom) {
    this.panTo(lat, lon);
    if (zoom != null) this.camera.zoom = zoom;
  }

  rotateTo(radians)        { this.camera.rotation = radians; }
  toggleLayer(name, value) { if (name in this.debugLayers) this.debugLayers[name] = value ?? !this.debugLayers[name]; }

  toggleShadows(value)                    { this._renderer.toggleShadows(value); }
  setSunAngle(angle, elevation)           { this._renderer.setSunAngle(angle, elevation); }

  // ── INTERNAL HELPERS ──────────────────────────────────────────────────────
  _rebuildAllEntitiesGeo(prevGeoCenter = this.geoCenter, shiftX, shiftY) {
    if (shiftX !== undefined && shiftY !== undefined) {
      // Integer tile shift — no geo math needed, just subtract the same offset
      // applied to the terrain grid. Entities stay visually locked to the world.
      for (const e of this.entities) {
        if (e.type === ENTITY_TYPES.PLAYER) continue;
        e.tx -= shiftX;
        e.ty -= shiftY;
        e._geoDirty = true;   // geo will be recomputed lazily on next HUD/click
        if (e._particle) {
          e._particle.position.x     = e.tx;
          e._particle.position.y     = e.ty;
          if (e._particle.prevPosition) {
            e._particle.prevPosition.x -= shiftX;
            e._particle.prevPosition.y -= shiftY;
          }
        }
      }
      return;
    }
    // Full geo rebuild — only used by panTo / flyTo
    for (const e of this.entities) {
      if (e.type === ENTITY_TYPES.PLAYER) continue;
      const geo = e.getGeo(prevGeoCenter, this._mPerTile, this._mapW, this._mapH);
      e.setGeo(geo.lat, geo.lon, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
      e._geoDirty = false;
      if (e._particle) {
        const dx = e.tx - e._particle.position.x;
        const dy = e.ty - e._particle.position.y;
        e._particle.position.x     = e.tx;
        e._particle.position.y     = e.ty;
        if (e._particle.prevPosition) {
          e._particle.prevPosition.x += dx;
          e._particle.prevPosition.y += dy;
        }
      }
    }
  }

  _centreCameraOnPlayer() {
    if (!this._canvas || !this.playerEntity) return;
    const elev = this._playerElev();
    const { x, y } = worldToScreen(
      this.playerEntity.tx, this.playerEntity.ty, elev,
      { ...this.camera, camX: 0, camY: 0 }
    );
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
    const geo  = this.playerEntity.getGeo(this.geoCenter, this._mPerTile, this._mapW, this._mapH);
    const elevM = this._elevation?.sampleElevation(geo.lat, geo.lon) ?? 0;
    return getElevOffset(this._elevation?.toTileHeight(elevM) ?? 4, this.camera.tilt, this.camera.zoom);
  }

  _pGlobal() {
    if (!this._exactPG) {
      this._exactPG = {
        x: lonToGlobalX(this.geoCenter.lon, this.geoCenter.lat, this._mPerTile),
        y: latToGlobalY(this.geoCenter.lat, this._mPerTile),
      };
    }
    return this._exactPG;
  }

  // ── FETCH ─────────────────────────────────────────────────────────────────
  // ── FETCH ─────────────────────────────────────────────────────────────────
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
      // Get current global offset of the map centre (in global tile units)
      const { x: pGX, y: pGY } = this._pGlobal();

      // Helper: global tile → local (0..mapW, 0..mapH)
      const toLocal = (globalX, globalY) => ({
        x: globalX - pGX + this._mapW / 2,
        y: globalY - pGY + this._mapH / 2
      });

      for (const result of results) {
        if (result.terrainUpdates) {
          this.terrainCache.merge(result.terrainUpdates);
        }
        if (result.weatherUpdate && this.weather) {
          this.weather.setMode(result.weatherUpdate.mode);
          this.weather.wind = result.weatherUpdate.wind;
          this.emit('weather:changed', result.weatherUpdate);
        }
      }

      const existing = new Map();
      for (const e of this.entities) {
        if (e.type !== ENTITY_TYPES.PLAYER) existing.set(e.id, e);
      }

      const upsert = (entity) => {
          const old = existing.get(entity.id);
          if (old) {
              old.tx = entity.tx;
              old.ty = entity.ty;
              old.solid = entity.solid;           // sync solid flag
              old.bboxRadius = entity.bboxRadius; // sync radius
              if (old._particle) {
                  old._particle.position.x = old.tx;
                  old._particle.position.y = old.ty;
              }
          } else {
              this.entities.push(entity);
              if (entity.physicsEnabled) this._attachPhysics(entity);
              existing.set(entity.id, entity);
          }
      };

      for (const result of results) {
        // ── Buildings ──────────────────────────────────────────────────────
        if (result.buildingWays) {
          const buildings = preprocessBuildings(result.buildingWays);
          for (const b of buildings) {
            const globalX = lonToGlobalX(b.centroid.lon, this.geoCenter.lat, this._mPerTile);
            const globalY = latToGlobalY(b.centroid.lat, this._mPerTile);
            const local = toLocal(globalX, globalY);
            if (local.x < 0 || local.x >= this._mapW || local.y < 0 || local.y >= this._mapH) continue;
            const halfSideM     = Math.sqrt(Math.max(16, b.areaM2));  // min 4×4m footprint
            const halfSideTiles = halfSideM / this._mPerTile / 2;
            const colorSet      = this.terrainRegistry.colors[TerrainType.BUILDING];
            const building      = new BuildingEntity(
              `building_${b.id || Math.random()}`,
              local.x, local.y, halfSideTiles, b.heightM, colorSet
            );
            building._facadeSeed = Math.abs(Math.round(local.x * 31 + local.y * 17)) % 1000;
            upsert(building);
          }
        }

        // ── Features (POIs) ────────────────────────────────────────────────
        if (result.features) {
          for (const f of result.features) {
            const lat = f.latitude ?? f.lat;
            const lon = f.longitude ?? f.lon;
            if (lat == null || lon == null) continue;
            const globalX = lonToGlobalX(lon, this.geoCenter.lat, this._mPerTile);
            const globalY = latToGlobalY(lat, this._mPerTile);
            const local = toLocal(globalX, globalY);
            if (local.x < 0 || local.x >= this._mapW || local.y < 0 || local.y >= this._mapH) continue;
            const feature = new FeatureEntity(f.id, local.x, local.y, f);
            upsert(feature);
          }
        }

        // ── Trees ──────────────────────────────────────────────────────────
        if (result.trees) {
          for (const t of result.trees) {
            const globalX = lonToGlobalX(t.lon, this.geoCenter.lat, this._mPerTile);
            const globalY = latToGlobalY(t.lat, this._mPerTile);
            const local = toLocal(globalX, globalY);
            if (local.x < 0 || local.x >= this._mapW || local.y < 0 || local.y >= this._mapH) continue;
            const tree = new TreeEntity(
              `tree_${t.id ?? `${Math.round(t.lat * 1e6)}_${Math.round(t.lon * 1e6)}`}`,
              local.x, local.y, t.species || 'deciduous', 1.0, t.seed || 0
            );
            upsert(tree);
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
      if (e.type === ENTITY_TYPES.TREE && e.treeType)
        counts[e.treeType] = (counts[e.treeType] || 0) + 1;
    }
    let topType = null, max = 0;
    for (const [type, cnt] of Object.entries(counts)) {
      if (cnt > max) { max = cnt; topType = type; }
    }
    if (topType) this.localTreeAsset = topType;
  }

  // ── OPTIMISED RENDER FRAME (replaces old _frame) ──────────────────────────
  _frameOptimized(ts) {
    if (!this._running) return;
    this._raf = requestAnimationFrame(ts2 => this._frameOptimized(ts2));

    const dt = Math.min((ts - (this._lastT || ts)) / 1000, 0.05);
    this._lastT = ts;

    const cam    = this.camera;
    const canvas = this._canvas;
    const ctx    = this._ctx;
    const W      = canvas.width;
    const H      = canvas.height;

    if (this._spatialTree) {
        // Collect all solid entities (those that block movement)
        const collidables = this.entities.filter(e => e.solid === true);
        const byType = {};
        for (const e of collidables) byType[e.type] = (byType[e.type] || 0) + 1;
        const objects = collidables.map(e => ({
            x: e.tx, y: e.ty,
            entity: e,
            radius: e.bboxRadius
        }));
        this._spatialTree.rebuild(objects);
    }

    // 1. Update entities
    for (const e of this.entities) e.update(dt, this);

    // 2. Camera
    cam.updateTilt(dt);
    cam.updateRotation(dt, this.playerEntity?.tx ?? 0, this.playerEntity?.ty ?? 0, worldToScreen);
    if (this._input.isRotatingLeft())  cam.rotVel -= 2.2 * dt;
    if (this._input.isRotatingRight()) cam.rotVel += 2.2 * dt;
    if (this.weather) this.weather.update(dt, this.playerEntity?.tx ?? 0, this.playerEntity?.ty ?? 0);

    // 3. Elevations (cached for frame)
    const pElev = this._playerElev();

    // 4. Physics – skip if nothing dynamic
    if (this.physicsWorld && this.physicsEnabled) {
      let hasDynamic = false;
      for (const e of this.entities) {
        if (e._particle && !e.fixed) { hasDynamic = true; break; }
      }
      if (hasDynamic) {
        if (this.playerEntity?._particle) {
          const pp = this.playerEntity._particle;
          pp.position.x = this.playerEntity.tx;
          pp.position.y = this.playerEntity.ty;
        }
        this.physicsWorld.update();
        for (const e of this.entities) {
          if (!e._particle) continue;
          if (e === this.playerEntity || e.fixed) {
            e._particle.position.x     = e.tx;
            e._particle.position.y     = e.ty;
            e._particle.prevPosition.x = e.tx;
            e._particle.prevPosition.y = e.ty;
          } else {
            e.syncPhysics();
          }
        }
      }
    }

    // 5. World re-centre
    let didRecentre = false;
    if (this.playerEntity) {
      const dx  = this.playerEntity.tx - this._mapW / 2;
      const dy  = this.playerEntity.ty - this._mapH / 2;
      const dFC = Math.hypot(dx, dy);

      if (dFC > REFETCH_DIST) {
        didRecentre = true;
        const nx = dx / dFC, ny = dy / dFC;
        const shiftX = Math.round(nx * REFETCH_DIST);
        const shiftY = Math.round(ny * REFETCH_DIST);
        const snapTx = this._mapW / 2 + shiftX;
        const snapTy = this._mapH / 2 + shiftY;
        const oldScreen = worldToScreen(snapTx, snapTy, pElev, cam);
        const prevGeo   = { ...this.geoCenter };

        if (!this._exactPG) this._pGlobal();
        this._exactPG.x += shiftX;
        this._exactPG.y += shiftY;
        this.geoCenter = tileToGeo(snapTx, snapTy, this.geoCenter, this._mPerTile, this._mapW, this._mapH);
        this._osmLayer.resetTileCache();

        this._osmLayer.resetTileCache();

        this.playerEntity.tx -= shiftX;
        this.playerEntity.ty -= shiftY;
        for (const p of this.playerEntity._posHistory) { p.x -= shiftX; p.y -= shiftY; }
        if (this.playerEntity._particle?.prevPosition) {
          this.playerEntity._particle.prevPosition.x -= shiftX;
          this.playerEntity._particle.prevPosition.y -= shiftY;
        }

        const newScreen = worldToScreen(this._mapW / 2, this._mapH / 2, pElev, cam);
        cam.camX += newScreen.x - oldScreen.x;
        cam.camY += newScreen.y - oldScreen.y;

        this._rebuildAllEntitiesGeo(prevGeo, shiftX, shiftY);

        for (const t of this._tileCache) {
          t.tx -= shiftX;
          t.ty -= shiftY;
        }
        this._tileCacheState = null; 

        this._tileCacheState = null;   // force full rebuild with new pGX/pGY
        this._tileCache = [];          // clear stale entries immediately
        this._skipTileCacheThisFrame = true;  

        this._doFetch(this.geoCenter);
        this.emit('center:changed', this.geoCenter);
      }
    }

    let pGX, pGY;
    { const r = this._pGlobal(); pGX = r.x; pGY = r.y; }

    // 6. Smooth camera follow
    if (!didRecentre && cam.tilt > 0.08 && this.playerEntity) {
      const { x: px, y: py } = worldToScreen(
        this.playerEntity.tx, this.playerEntity.ty, pElev,
        { ...cam, camX: 0, camY: 0 }
      );
      cam.camX += (px - W / 2 - cam.camX) * 0.08;
      cam.camY += (py - H / 2 - cam.camY) * 0.08;
    }

    // ═══════════════════════ RENDERING ════════════════════════════════════
    ctx.fillStyle = this.weather?.mode === 'rain' ? '#020308' : '#04060a';
    ctx.fillRect(0, 0, W, H);

    this._renderer.beginFrame();
    this._featR.frameNow = ts;

    // 7. OSM tiles
    if (this.debugLayers.osmTiles) {
      this._osmLayer.draw(canvas, this.geoCenter);
    }

    // 8. Terrain tiles – rebuild cache only when camera moved
    const overAlpha = Math.max(0, Math.min(1, (cam.zoom - 0.02) / 0.015));
    if (overAlpha > 0 && this.debugLayers.overpass) {
      const lod = cam.zoom > 0.25 ? 1 : cam.zoom > 0.10 ? 2 : 4;

      if (lod > 1) {
        this._tileR.drawMergedLayer(this.terrainCache, pGX, pGY, lod, overAlpha);
      } else {   
          if (this._isTileCacheDirty()) {
            this._saveTileCacheState();
            const hw  = tileHalfWidth(cam.zoom, cam.tileW);
            const hh  = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
            const txs = Math.min(120, Math.ceil(W / Math.max(1, hw)) + 4);
            const tys = Math.min(120, Math.ceil(H / Math.max(1, hh)) + 4);
            const vC  = screenToWorld(W / 2, H / 2, cam);
            const cx  = Math.round(Math.max(0, Math.min(this._mapW, vC.x)));
            const cy  = Math.round(Math.max(0, Math.min(this._mapH, vC.y)));
            this._tileCache = [];
            for (let ty = Math.max(0, cy - tys); ty < Math.min(this._mapH, cy + tys); ty++) {
              for (let tx = Math.max(0, cx - txs); tx < Math.min(this._mapW, cx + txs); tx++) {
                this._tileCache.push({
                  tx, ty,
                  terrainId: this.terrainCache.get(
                    tx - this._mapW / 2 + pGX,
                    ty - this._mapH / 2 + pGY
                  ) ?? TerrainType.GRASS,
                });
              }
            }
        }
        this._skipTileCacheThisFrame = false;
        this._tileR.drawLayer(
          this._tileCache,
          this.playerEntity?.tx ?? 0,
          this.playerEntity?.ty ?? 0,
          this.terrainCache, pGX, pGY
        );
      }
    }

    // 9. Entities – with frustum culling & LOD
    if (overAlpha > 0) {
      const featuresOnly = this.entities.filter(e => e.type === ENTITY_TYPES.FEATURE && e.visible);
      if (this.debugLayers.features && featuresOnly.length > 0) {
        this._featR.drawAll(this._renderer, featuresOnly, this._selectedId, this.terrainCache, pGX, pGY);
      }

      const drawBlueprints = cam.zoom >= LOD_BLUEPRINT_MIN_ZOOM;

      for (const e of this.entities) {
        if (!e.visible) continue;
        if (e.type === ENTITY_TYPES.FEATURE && this.debugLayers.features) continue;

        // Frustum culling
        if (!this._isTileVisible(e.tx, e.ty, cam, W, H)) continue;

        // LOD for heavy blueprints
        const isHeavy = (e.type === ENTITY_TYPES.TREE || e.type === ENTITY_TYPES.BUILDING);
        if (isHeavy && !drawBlueprints) continue;

        // Camera animation throttle: replace heavy geometry with a dot
        if (isHeavy && this._cameraAnimating) {
          const elev = this.terrainRegistry.heights[
            this.terrainCache.getLocal(e.tx, e.ty, pGX, pGY, this._mapW, this._mapH)
          ] ?? 4;
          const groundElevPx = getElevOffset(elev, cam.tilt, cam.zoom) + (e.elevOffset ?? 0);
          const depth = tileDepth(e.tx, e.ty, cam.rotation);
          this._renderer.submitWorldObject(depth, () => {
            const sc = worldToScreen(e.tx + 0.5, e.ty + 0.5, groundElevPx, cam);
            const r  = Math.max(2, cam.zoom * cam.tileW * 0.3);
            ctx.beginPath();
            ctx.arc(sc.x, sc.y, r, 0, Math.PI * 2);
            ctx.fillStyle = e.type === ENTITY_TYPES.TREE ? '#2E7D32' : '#78909C';
            ctx.fill();
          });
          continue;
        }

        const groundH = this.terrainRegistry.heights[
          this.terrainCache.getLocal(e.tx, e.ty, pGX, pGY, this._mapW, this._mapH)
        ] ?? 4;

        const groundElevPx = getElevOffset(groundH, cam.tilt, cam.zoom);
        const altPx        = e.getAltitudePx(cam);
        const totalElevPx  = groundElevPx + altPx;

        e.render(this._renderer, totalElevPx, {
          selectedId:      this._selectedId,
          terrainCache:    this.terrainCache,
          pGX, pGY,
          mPerTile:        this._mPerTile,
          featureResolver: this._featR,
          decorateFacade:  decorateBuildingFacade,
        });

        // Altitude line — any entity can opt in via showAltitudeLine
        if (altPx > 0 && e.showAltitudeLine && cam.zoom > 0.08) {
          const depth = tileDepth(e.tx, e.ty, cam.rotation);
          this._renderer.submitWorldObject(depth, () => {
            const ground = worldToScreen(e.tx + 0.5, e.ty + 0.5, groundElevPx, cam);
            const airPos = worldToScreen(e.tx + 0.5, e.ty + 0.5, totalElevPx, cam);
            this._renderer.drawLine(
              ground.x, ground.y, airPos.x, airPos.y,
              'rgba(180,200,255,0.25)', 1
            );
            this._renderer.drawCircle(ground.x, ground.y, 2, 'rgba(180,200,255,0.4)');
          });
        }
      }
    }

    // 10. Flush pipeline
    this._renderer.flush(this.weather);

    // 11. HUD
    if (this.playerEntity) {
      const geo = this.playerEntity.getGeo(this.geoCenter, this._mPerTile, this._mapW, this._mapH);
      this.emit('hud', {
        lat:     geo.lat,
        lon:     geo.lon,
        zoom:    cam.zoom.toFixed(2),
        tilt:    cam.tilt.toFixed(2),
        terrain: this.terrainRegistry.names[
          this.terrainCache.getLocal(
            this.playerEntity.tx, this.playerEntity.ty,
            pGX, pGY, this._mapW, this._mapH
          )
        ] ?? 'Unknown',
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
    const { x: pGX, y: pGY } = this._pGlobal();

    for (const e of this.entities) {
      const groundH = this.terrainRegistry.heights[
        this.terrainCache.getLocal(e.tx, e.ty, pGX, pGY, this._mapW, this._mapH)
      ] ?? 4;
      const elev    = getElevOffset(groundH, this.camera.tilt, this.camera.zoom);
      const { x: sx, y: sy } = worldToScreen(e.tx + 0.5, e.ty + 0.5, elev + e.elevOffset, this.camera);
      const dist    = Math.hypot(cx - sx, cy - sy);
      const thresh  = 20 * this.camera.zoom;
      if (dist < thresh && dist < bestDist) { bestDist = dist; best = e; }
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