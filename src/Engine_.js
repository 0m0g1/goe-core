
// import { EventEmitter }      from './core/EventEmitter.js';
// import { Camera }            from './core/Camera.js';
// import { InputManager }      from './core/InputManager.js';
// import { TerrainCache }      from './terrain/TerrainCache.js';
// import { createTerrainRegistry, TerrainType } from './terrain/types.js';
// import { WorldRenderer }     from './render/Renderer.js';
// import { drawPlayer }        from './assets/PlayerBlueprint.js';
// import {
//   worldToScreen, screenToWorld, tileHalfWidth, tileHalfHeight,
//   getElevOffset, tileDepth, frontDepth,
// } from './math/projection.js';
// import {
//   geoToTile, tileToGeo, lonToGlobalX, latToGlobalY,
// } from './math/geo.js';

// import PhysicsWorld2D from 'https://esm.sh/yaphe-engine@1.0.5/src/modules/2d/physicsworld2d.js';
// import Particle2D     from 'https://esm.sh/yaphe-engine@1.0.5/src/modules/2d/particle2d.js';
// import { Entity }     from './core/Entity.js';
// import { Quadtree }   from './spatial/Quadtree.js';
// import { RenderTree } from './spatial/RenderTree.js';
// import { SpriteCache } from './spatial/SpriteCache.js';

// // ─────────────────────────────────────────────────────────────────────────────
// // PlayerEntity
// // ─────────────────────────────────────────────────────────────────────────────
// class PlayerEntity extends Entity {
//   constructor(id = 'player', tx = 0, ty = 0) {
//     super(id, 'player', tx, ty);
//     this.walkCycle  = 0;
//     this.isMoving   = false;
//     this.faceAngle  = Math.PI / 2;
//     this.speedMult  = 1.0;
//     this.physicsEnabled = true;
//     this.physicsRadius  = 0.5;
//     this.fixed          = false;
//     this.solid          = true;
//     this.bboxRadius     = 0.5;

//     this._posHistory      = [];
//     this._POS_HISTORY_MAX = 10;
//   }

//   update(dt, engine) {
//     const input = engine._input;
//     const mv    = input.getMovementVector();

//     if (mv) {
//       this.isMoving  = true;
//       this.faceAngle = Math.atan2(-mv.dy, mv.dx);

//       const cam = engine.camera;
//       const hw  = tileHalfWidth(cam.zoom, cam.tileW);
//       const hh  = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
//       const cr  = Math.cos(cam.rotation), sr = Math.sin(cam.rotation);
//       const rx  = (mv.dx / hw + mv.dy / hh) * 0.5;
//       const ry  = (mv.dy / hh - mv.dx / hw) * 0.5;
//       const wx  = rx * cr - ry * sr;
//       const wy  = rx * sr + ry * cr;
//       const spd = (0.22 * this.speedMult) * dt * 60 / (Math.hypot(wx, wy) || 1);

//       this.walkCycle += dt * 15 * this.speedMult;

//       const attempts = [
//         { x: this.tx + wx * spd, y: this.ty + wy * spd },
//         { x: this.tx + wx * spd, y: this.ty },
//         { x: this.tx,            y: this.ty + wy * spd },
//       ];

//       for (const attempt of attempts) {
//         if (!this._isBlocked(attempt.x, attempt.y, engine)) {
//           this.tx = attempt.x;
//           this.ty = attempt.y;
//           break;
//         }
//       }
//     } else {
//       this.isMoving  = false;
//       this.walkCycle = 0;
//     }

//     this._resolveOverlap(engine);

//     const pushRadius = this.physicsRadius + 2;
//     const pushRange  = {
//       x: this.tx - pushRadius, y: this.ty - pushRadius,
//       w: pushRadius * 2,       h: pushRadius * 2,
//     };
//     const pushCandidates = engine._spatialTree?.queryRange(pushRange) ?? [];
//     for (const candidate of pushCandidates) {
//       const other = candidate.entity;
//       if (other === this || !other._particle || other.fixed) continue;
//       const dx   = other.tx - this.tx;
//       const dy   = other.ty - this.ty;
//       const dist = Math.hypot(dx, dy);
//       const minD = this.physicsRadius + other.physicsRadius;
//       if (dist < minD && dist > 0) {
//         const nx = dx / dist, ny = dy / dist;
//         const overlap = minD - dist;
//         const avg = this.getAverageHistoryPos();
//         const pvx = this.tx - avg.x, pvy = this.ty - avg.y;
//         const dot = pvx * nx + pvy * ny;
//         const KICK = 0.5;
//         const evx = nx * overlap + nx * Math.max(0, dot) * KICK;
//         const evy = ny * overlap + ny * Math.max(0, dot) * KICK;
//         const p = other._particle;
//         p.prevPosition.x = p.position.x - evx;
//         p.prevPosition.y = p.position.y - evy;
//         p.position.x += nx * overlap;
//         p.position.y += ny * overlap;
//       }
//     }

//     this._posHistory.push({ x: this.tx, y: this.ty });
//     if (this._posHistory.length > this._POS_HISTORY_MAX) this._posHistory.shift();
//   }

//   _isBlocked(newX, newY, engine) {
//     const qr = this.bboxRadius + 1.5;
//     const range = { x: newX - qr, y: newY - qr, w: qr * 2, h: qr * 2 };
//     const candidates = engine._spatialTree.queryRange(range);
//     for (const candidate of candidates) {
//       const other = candidate.entity;
//       if (other === this || !other.solid) continue;
//       if (this._overlaps(newX, newY, other)) return true;
//     }
//     return false;
//   }

//   _overlaps(px, py, other) {
//     if (other._isBuildingBox) {
//       const hw = other._halfW ?? other.bboxRadius;
//       const hd = other._halfD ?? other.bboxRadius;
//       const cx = Math.max(other.tx - hw, Math.min(other.tx + hw, px));
//       const cy = Math.max(other.ty - hd, Math.min(other.ty + hd, py));
//       return Math.hypot(px - cx, py - cy) < this.bboxRadius;
//     }
//     const dx = px - other.tx, dy = py - other.ty;
//     const minDist = this.bboxRadius + other.bboxRadius;
//     return dx * dx + dy * dy < minDist * minDist;
//   }

//   _resolveOverlap(engine) {
//     const qr = this.bboxRadius + 2;
//     const range = { x: this.tx - qr, y: this.ty - qr, w: qr * 2, h: qr * 2 };
//     const candidates = engine._spatialTree?.queryRange(range) ?? [];
//     for (const candidate of candidates) {
//       const e = candidate.entity;
//       if (e === this || !e.solid) continue;
//       if (!this._overlaps(this.tx, this.ty, e)) continue;
//       if (e._isBuildingBox) {
//         const hw = e._halfW ?? e.bboxRadius;
//         const hd = e._halfD ?? e.bboxRadius;
//         const overlapL = (this.tx + this.bboxRadius) - (e.tx - hw);
//         const overlapR = (e.tx + hw) - (this.tx - this.bboxRadius);
//         const overlapT = (this.ty + this.bboxRadius) - (e.ty - hd);
//         const overlapB = (e.ty + hd) - (this.ty - this.bboxRadius);
//         const min = Math.min(overlapL, overlapR, overlapT, overlapB);
//         if      (min === overlapL) this.tx -= overlapL;
//         else if (min === overlapR) this.tx += overlapR;
//         else if (min === overlapT) this.ty -= overlapT;
//         else                       this.ty += overlapB;
//       } else {
//         const dx = this.tx - e.tx, dy = this.ty - e.ty;
//         const dist = Math.hypot(dx, dy) || 0.001;
//         const push = this.bboxRadius + e.bboxRadius - dist;
//         this.tx += (dx / dist) * push;
//         this.ty += (dy / dist) * push;
//       }
//     }
//   }

//   getAverageHistoryPos() {
//     if (!this._posHistory.length) return { x: this.tx, y: this.ty };
//     const sum = this._posHistory.reduce(
//       (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 }
//     );
//     return { x: sum.x / this._posHistory.length, y: sum.y / this._posHistory.length };
//   }

//   render(wr, groundElevPx, extra) {
//     drawPlayer(wr, this.tx, this.ty, groundElevPx + this.elevOffset, this, extra.mPerTile);
//   }
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // GenericEntity
// // ─────────────────────────────────────────────────────────────────────────────
// class GenericEntity extends Entity {
//   constructor(def) {
//     super(def.id, def.type ?? 'generic', def.tx, def.ty);
//     this.solid            = def.solid            ?? false;
//     this.bboxRadius       = def.bboxRadius       ?? 0.35;
//     this.physicsEnabled   = def.physicsEnabled   ?? false;
//     this.physicsRadius    = def.physicsRadius     ?? 0.35;
//     this.fixed            = def.fixed             ?? true;
//     this.elevOffset       = def.elevOffset        ?? 0;
//     this.altitudeM        = def.altitudeM         ?? 0;
//     this.visualAlt        = def.visualAlt         ?? 0;
//     this.showAltitudeLine = def.showAltitudeLine  ?? false;

//     this._isBuildingBox = def._isBuildingBox ?? false;
//     this._scale         = def._scale         ?? 1;
//     this._facingAngle   = def._facingAngle   ?? 0;
//     this._bpKey         = def._bpKey         ?? null;
//     this._lodColor      = def._lodColor      ?? null;
//     this._areaM2        = def._areaM2        ?? null;
//     this._heightM       = def._heightM       ?? null;
//     this.renderHeavy    = def.renderHeavy    ?? false;
//     this._renderFn      = def.renderFn       ?? null;
//     this._updateFn      = def.updateFn       ?? null;
//     this._procBlueprint = def._procBlueprint ?? null;
//     this._batches       = def._batches       ?? null;

//     this._cachedTerrainId = null;
//   }

//   update(dt, engine) {
//     if (this._updateFn) this._updateFn(dt, engine, this);
//   }

//   render(wr, groundElevPx, extra) {
//     if (this._renderFn) this._renderFn(wr, groundElevPx, extra, this);
//   }
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // Engine constants
// // ─────────────────────────────────────────────────────────────────────────────

// const MAP_W = 80;
// const MAP_H = 80;

// const REFETCH_GEO_DIST = 0.002;
// const M_PER_TILE       = 2;

// const CULL_MARGIN             = 4;
// const LOD_HEAVY_MIN_ZOOM      = 0.05;
// const TILE_CACHE_DIRTY_PX     = 2;
// const TILE_CACHE_DIRTY_ZOOM   = 0.002;
// const TILE_CACHE_DIRTY_TILT   = 0.005;
// const CAMERA_SETTLE_MS        = 120;
// const MAX_CONCURRENT_TILES    = 6;

// const MAX_TERRAIN_ENTRIES = 200_000;
// const TERRAIN_EVICT_TO    = 160_000;

// const SPATIAL_SOLID_RADIUS = 20;
// const RENDER_CULL_MARGIN   = CULL_MARGIN * 2;
// const QUADTREE_HALF        = 400;

// // ─────────────────────────────────────────────────────────────────────────────
// // Engine
// // ─────────────────────────────────────────────────────────────────────────────
// export class Engine extends EventEmitter {
//   constructor(opts = {}) {
//     super();
//     this._opts       = opts;
//     this._mPerTile   = opts.mPerTile ?? M_PER_TILE;
//     this._mapW       = opts.mapW     ?? MAP_W;
//     this._mapH       = opts.mapH     ?? MAP_H;
//     this._showPlayer = opts.showPlayer ?? true;
//     this._running    = false;

//     this.geoCenter     = opts.geoCenter ?? { lat: 51.505, lon: -0.09 };
//     this._lastFetchPos = { lat: 0, lon: 0 };
//     this._fetching     = false;

//     this._fetchFreshIds = new Set();
//     this._fetchPending  = 0;

//     this.camera = new Camera({
//       mapW: this._mapW, mapH: this._mapH, mPerTile: this._mPerTile,
//       ...opts.cameraOpts,
//     });

//     this.entities         = [];
//     this._dynamicEntities = [];
//     this.playerEntity     = null;
//     this._selectedId      = null;

//     this.physicsWorld   = null;
//     this.physicsEnabled = true;

//     this.terrainRegistry = createTerrainRegistry(opts.terrainOverrides);
//     this.terrainCache    = new TerrainCache();
//     this.terrainCache.mPerTile = this._mPerTile;
//     this._loaders = [];

//     this._shadowOpts = {
//       sunAngle:     opts.sunAngle     ?? Math.PI * 1.25,
//       sunElevation: opts.sunElevation ?? Math.PI / 5,
//       shadowAlpha:  opts.shadowAlpha  ?? 0.22,
//       aoStrength:   opts.aoStrength   ?? 0.28,
//       enabled:      opts.shadows      ?? true,
//     };

//     this._tileURLFn = opts.tileURLFn ?? ((z, x, y) => `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`);
//     this._elevation = opts.elevationLoader ?? null;

//     this.debugLayers = {
//       osmTiles:  true,
//       overpass:  true,
//       entities:  true,
//       player:    true,
//       colliders: false,
//     };

//     this._tileCache      = [];
//     this._tileCacheState = null;

//     this._featureCache = new Map();

//     this._cameraAnimating   = false;
//     this._cameraSettleTimer = null;

//     this._spatialTree  = null;
//     this._entityMap    = new Map();
//     this._spatialDirty = true;

//     this._renderTree      = null;
//     this._renderTreeDirty = true;
//   }

//   // ── Physics helpers ───────────────────────────────────────────────────────
//   _attachPhysics(entity) {
//     if (!this.physicsWorld || !entity.physicsEnabled) return;
//     if (entity._particle) return;
//     if (entity.fixed) return;
//     const p = new Particle2D(entity.tx, entity.ty);
//     p.radius = entity.physicsRadius;
//     p.fixed  = false;
//     p.isCollidable = true;
//     entity._particle = p;
//     this.physicsWorld.particles.push(p);
//   }

//   _detachPhysics(entity) {
//     if (entity._particle && this.physicsWorld) {
//       const idx = this.physicsWorld.particles.indexOf(entity._particle);
//       if (idx !== -1) this.physicsWorld.particles.splice(idx, 1);
//       entity._particle = null;
//     }
//   }

//   // ── Performance helpers ───────────────────────────────────────────────────
//   _isTileCacheDirty() {
//     const c = this._tileCacheState;
//     if (!c) return true;
//     const cam = this.camera;
//     return (
//       Math.abs(cam.camX     - c.camX)   > TILE_CACHE_DIRTY_PX   ||
//       Math.abs(cam.camY     - c.camY)   > TILE_CACHE_DIRTY_PX   ||
//       Math.abs(cam.focusX   - c.focusX) > 0.5                    ||
//       Math.abs(cam.focusY   - c.focusY) > 0.5                    ||
//       Math.abs(cam.zoom     - c.zoom)   > TILE_CACHE_DIRTY_ZOOM  ||
//       Math.abs(cam.tilt     - c.tilt)   > TILE_CACHE_DIRTY_TILT  ||
//       Math.abs(cam.rotation - c.rot)    > 0.002
//     );
//   }

//   _saveTileCacheState() {
//     const cam = this.camera;
//     this._tileCacheState = {
//       camX: cam.camX, camY: cam.camY,
//       focusX: cam.focusX, focusY: cam.focusY,
//       zoom: cam.zoom, tilt: cam.tilt, rot: cam.rotation,
//     };
//   }

//   _markCameraAnimating() {
//     this._cameraAnimating = true;
//     if (this._cameraSettleTimer) clearTimeout(this._cameraSettleTimer);
//     this._cameraSettleTimer = setTimeout(() => {
//       this._cameraAnimating = false;
//     }, CAMERA_SETTLE_MS);
//   }

//   _patchVoxelRenderer(voxel) {
//     if (voxel.__perfPatched) return;
//     voxel.__perfPatched = true;
//     const hexCache = new Map();
//     const cachedHex = (hex) => {
//       if (hexCache.has(hex)) return hexCache.get(hex);
//       let h = hex;
//       if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
//       hexCache.set(hex, h);
//       return h;
//     };
//     const origBeginFrame = voxel.beginFrame?.bind(voxel);
//     voxel.beginFrame = function() {
//       if (origBeginFrame) origBeginFrame();
//       this.ctx.globalAlpha  = 1;
//       this.ctx.shadowBlur   = 0;
//       this.ctx.shadowColor  = 'transparent';
//       this.ctx.lineCap      = 'butt';
//       this.ctx.lineJoin     = 'miter';
//     };
//     const origBox = voxel.box?.bind(voxel);
//     voxel.box = function(x, y, z, w, h, d, top, right, front) {
//       this._topFill   = cachedHex(top);
//       this._rightFill = cachedHex(right ?? top);
//       this._frontFill = cachedHex(front ?? top);
//       origBox(x, y, z, w, h, d, this._topFill, this._rightFill, this._frontFill);
//     };
//   }

//   // ── GEO HELPERS ───────────────────────────────────────────────────────────

//   _geoToGlobalTile(lat, lon) {
//     return {
//       tx: lonToGlobalX(lon, lat, this._mPerTile),
//       ty: latToGlobalY(lat, this._mPerTile),
//     };
//   }

//   _playerGeo() {
//     if (!this.playerEntity) return this.geoCenter;
//     const refTx = lonToGlobalX(this.geoCenter.lon, this.geoCenter.lat, this._mPerTile);
//     const refTy = latToGlobalY(this.geoCenter.lat, this._mPerTile);
//     const dxM   = (this.playerEntity.tx - refTx) * this._mPerTile;
//     const dyM   = (this.playerEntity.ty - refTy) * this._mPerTile;
//     const cosLat = Math.cos(this.geoCenter.lat * Math.PI / 180);
//     return {
//       lat: this.geoCenter.lat - (dyM / 111_111),
//       lon: this.geoCenter.lon + (dxM / (111_111 * cosLat)),
//     };
//   }

//   // ── MOUNT ─────────────────────────────────────────────────────────────────
//   mount(canvas) {
//     if (this._running) return;
//     this._canvas  = canvas;
//     this._ctx     = canvas.getContext('2d');
//     this._running = true;

//     const cam = this.camera;

//     // WorldRenderer owns all sub-renderers now.
//     // Pass terrainRegistry and tileURLFn so it can build TileRenderer and OSMLayerRenderer.
//     this._renderer = new WorldRenderer(this._ctx, cam, {
//       shadow:           this._shadowOpts,
//       terrainRegistry:  this.terrainRegistry,
//       tileURLFn:        this._tileURLFn,
//     });
//     this._patchVoxelRenderer(this._renderer._voxel);

//     // Initialise the weather system inside the renderer.
//     this._renderer.initWeather();

//     this.physicsWorld = new PhysicsWorld2D(this._mapW * 10, this._mapH * 10, 0.0);

//     const resize = () => {
//       canvas.width  = canvas.offsetWidth  || window.innerWidth;
//       canvas.height = canvas.offsetHeight || window.innerHeight;
//     };
//     resize();
//     this._ro = new ResizeObserver(resize);
//     this._ro.observe(canvas);

//     this._input = new InputManager(canvas, { zoomSpeed: cam.zoomSpeed });
//     this._input.on('wheel',  ({ delta, x, y }) => {
//       this._markCameraAnimating();
//       cam.zoom_at(cam.zoom - delta * cam.zoomSpeed * cam.zoom, x ?? 0, y ?? 0);
//     });
//     this._input.on('pinch',  ({ dist, lastDist, cx, cy }) => {
//       this._markCameraAnimating();
//       cam.zoom_at(cam.zoom * (dist / lastDist), cx ?? 0, cy ?? 0);
//     });
//     this._input.on('pan',    ({ dx, dy }) => { cam.camX -= dx; cam.camY -= dy; });
//     this._input.on('rotate', ({ delta }) => {
//       this._markCameraAnimating();
//       cam.rotVel += delta * 5;
//     });
//     this._input.on('click',  ev => this._handleClick(ev));

//     for (const loader of this._loaders) {
//       loader.init?.(this);
//       if (typeof loader.setPartialResultCallback === 'function') {
//         loader.setPartialResultCallback(partial => this._ingestLoaderResult(partial));
//       }
//     }

//     const spawnTile = this._geoToGlobalTile(this.geoCenter.lat, this.geoCenter.lon);
//     this.playerEntity = new PlayerEntity('player', spawnTile.tx, spawnTile.ty);
//     this.entities.push(this.playerEntity);
//     this._attachPhysics(this.playerEntity);

//     cam.focusX = spawnTile.tx;
//     cam.focusY = spawnTile.ty;

//     this._doFetch(this.geoCenter);
//     this._lastT = 0;
//     this._raf   = requestAnimationFrame(ts => {
//       this._centreCameraOnPlayer();
//       this._frameOptimized(ts);
//     });

//     this._spatialTree  = new Quadtree({ x: 0, y: 0, w: 1, h: 1 }, 8);
//     this._renderTree   = new RenderTree({ x: 0, y: 0, w: 1, h: 1 }, 8);
//     this._spatialDirty = true;
//     this._renderTreeDirty = true;

//     this._spriteCache      = new SpriteCache();
//     this._treeRebuildTimer = 0;

//     return this;
//   }

//   destroy() {
//     this._running = false;
//     cancelAnimationFrame(this._raf);
//     this._ro?.disconnect();
//     this._input?.destroy();
//     for (const loader of this._loaders) loader.destroy?.();
//     this.removeAllListeners();
//   }

//   // ── PUBLIC API ────────────────────────────────────────────────────────────

//   /**
//    * Change the OSM tile URL factory.
//    * Delegates directly to the renderer — no separate _osmLayer reference needed.
//    */
//   setTileSource(urlFn) {
//     this._tileURLFn = urlFn;
//     this._renderer?.setTileSource(urlFn);
//   }

//   addEntity(entity) {
//     this.entities.push(entity);
//     if (entity.type !== 'player') this._entityMap.set(entity.id, entity);
//     if (entity.physicsEnabled) this._attachPhysics(entity);
//     if (!entity.fixed) this._dynamicEntities.push(entity);
//     this._spatialDirty    = true;
//     this._renderTreeDirty = true;
//   }

//   removeEntity(id) {
//     const idx = this.entities.findIndex(e => e.id === id);
//     if (idx !== -1) {
//       const entity = this.entities[idx];
//       this._detachPhysics(entity);
//       this.entities.splice(idx, 1);
//       if (!entity.fixed) {
//         this._dynamicEntities = this._dynamicEntities.filter(e => e.id !== id);
//       }
//       if (entity.type !== 'player') this._entityMap.delete(id);
//       this._spatialDirty    = true;
//       this._renderTreeDirty = true;
//     }
//   }

//   selectEntity(id) {
//     this._selectedId = id;
//     const ent = this.entities.find(e => e.id === id);
//     if (ent) {
//       const { x, y } = worldToScreen(ent.tx + 0.5, ent.ty + 0.5, 0, this.camera);
//       this.camera.camX = x - (this._canvas?.width  ?? 800) / 2;
//       this.camera.camY = y - (this._canvas?.height ?? 600) / 2;
//     }
//   }

//   use(loader) {
//     this._loaders.push(loader);
//     if (this._running) {
//       loader.init?.(this);
//       if (typeof loader.setPartialResultCallback === 'function') {
//         loader.setPartialResultCallback(partial => this._ingestLoaderResult(partial));
//       }
//     }
//     return this;
//   }

//   setElevationLoader(loader) {
//     this._elevation = loader;
//     if (this._running && this.geoCenter) loader.prefetch?.(this.geoCenter);
//   }

//   /**
//    * Teleport the player to a new geographic location.
//    */
//   panTo(lat, lon) {
//     this.geoCenter = { lat, lon };
//     // Delegate OSM tile cache reset to the renderer.
//     this._renderer?.resetOSMTileCache();

//     if (this.playerEntity) {
//       const tile = this._geoToGlobalTile(lat, lon);
//       this.playerEntity.tx = tile.tx;
//       this.playerEntity.ty = tile.ty;
//       this.playerEntity._posHistory = [];
//       if (this.playerEntity._particle) {
//         this.playerEntity._particle.position.x     = tile.tx;
//         this.playerEntity._particle.position.y     = tile.ty;
//         this.playerEntity._particle.prevPosition.x = tile.tx;
//         this.playerEntity._particle.prevPosition.y = tile.ty;
//       }
//     }

//     for (let i = this.entities.length - 1; i >= 0; i--) {
//       const e = this.entities[i];
//       if (e.type === 'player') continue;
//       this._detachPhysics(e);
//       this.entities.splice(i, 1);
//       this._entityMap.delete(e.id);
//     }
//     this._dynamicEntities = this._dynamicEntities.filter(e => e.type === 'player');

//     this._lastFetchPos = { lat: 0, lon: 0 };
//     this._fetching     = false;
//     this._spatialDirty    = true;
//     this._renderTreeDirty = true;
//     this._tileCacheState  = null;

//     this._centreCameraOnPlayer();
//     this._doFetch(this.geoCenter);
//   }

//   flyTo(lat, lon, zoom) {
//     this.panTo(lat, lon);
//     if (zoom != null) this.camera.zoom = zoom;
//   }

//   rotateTo(radians)        { this.camera.rotation = radians; }
//   toggleLayer(name, value) { if (name in this.debugLayers) this.debugLayers[name] = value ?? !this.debugLayers[name]; }
//   toggleShadows(value)     { this._renderer.toggleShadows(value); }
//   setSunAngle(angle, elev) { this._renderer.setSunAngle(angle, elev); }

//   // ── INTERNAL HELPERS ──────────────────────────────────────────────────────

//   _centreCameraOnPlayer() {
//     if (!this._canvas || !this.playerEntity) return;
//     const cam  = this.camera;
//     cam.focusX = this.playerEntity.tx;
//     cam.focusY = this.playerEntity.ty;
//     const elev = this._playerElev();
//     cam.camX   = -this._canvas.width  / 2;
//     cam.camY   = -(elev + this._canvas.height / 2);
//   }

//   _playerElev() {
//     if (!this.playerEntity) return 0;
//     const geo   = this._playerGeo();
//     const elevM = this._elevation?.sampleElevation(geo.lat, geo.lon) ?? 0;
//     return getElevOffset(this._elevation?.toTileHeight(elevM) ?? 4, this.camera.tilt, this.camera.zoom);
//   }

//   // ── FETCH ─────────────────────────────────────────────────────────────────
//   _doFetch(center) {
//     if (this._fetching) return;

//     const d = Math.hypot(
//       center.lat - this._lastFetchPos.lat,
//       center.lon - this._lastFetchPos.lon,
//     );
//     if (d < 0.001 && this._lastFetchPos.lat !== 0) return;

//     this._fetching      = true;
//     this._lastFetchPos  = { ...center };
//     this._fetchFreshIds = new Set();
//     this._fetchPending  = this._loaders.length;

//     this.emit('fetch:start');

//     const fetches = this._loaders.map(l =>
//       l.fetch(center).catch(err => {
//         console.error(`[GOECore] Loader ${l.id} failed:`, err);
//         return {};
//       })
//     );

//     fetches.forEach(p => p.then(result => {
//       if (result?.entities) {
//         for (const def of result.entities) {
//           if (def?.id) this._fetchFreshIds.add(def.id);
//         }
//       }

//       if (--this._fetchPending > 0) return;

//       if (this._fetchFreshIds.size > 0) {
//         for (let i = this.entities.length - 1; i >= 0; i--) {
//           const e = this.entities[i];
//           if (e.type === 'player') continue;
//           if (this._fetchFreshIds.has(e.id)) continue;
//           this._detachPhysics(e);
//           this.entities.splice(i, 1);
//           this._entityMap.delete(e.id);
//         }
//         this._dynamicEntities = this._dynamicEntities.filter(
//           e => e.type === 'player' || this._fetchFreshIds.has(e.id)
//         );
//         this._spatialDirty    = true;
//         this._renderTreeDirty = true;
//       }

//       this._elevation?.prefetch?.(center);
//       for (const loader of this._loaders) {
//         loader._cache?.evictDistant(center.lat, center.lon, 0.5);
//       }

//       this._fetching = false;
//       this.emit('fetch:done');
//     }));

//     this._renderTreeDirty = true;
//   }

//   // ── PARTIAL RESULT INGESTION ──────────────────────────────────────────────
//   _ingestLoaderResult(result) {
//     if (!result || typeof result !== 'object') return;

//     if (result.terrainUpdates?.size) {
//       if (!this._pendingTerrainUpdates) this._pendingTerrainUpdates = new Map();
//       for (const [k, v] of result.terrainUpdates) {
//         this._pendingTerrainUpdates.set(k, v);
//       }
//     }

//     if (result.terrainUpdates?.size) {
//       this.terrainCache.merge(result.terrainUpdates);
//       if (this.playerEntity) {
//         this.terrainCache.evictDistant(this.playerEntity.tx, this.playerEntity.ty, 600);
//       }
//     }

//     if (result.weatherUpdate && this._renderer?.weather) {
//       // Delegate weather updates to the renderer instead of this.weather.
//       this._renderer.setWeatherMode(result.weatherUpdate.mode);
//       this._renderer.setWeatherWind(result.weatherUpdate.wind);
//       this.emit('weather:changed', result.weatherUpdate);
//     }

//     if (!result.entities?.length) return;

//     for (const def of result.entities) {
//       if (def.id) this._fetchFreshIds.add(def.id);

//       const lat = def.latitude ?? def.lat;
//       const lon = def.longitude ?? def.lon;

//       let tx = def.tx;
//       let ty = def.ty;

//       if (lat != null && lon != null) {
//         tx = lonToGlobalX(lon, this.geoCenter.lat, this._mPerTile);
//         ty = latToGlobalY(lat, this._mPerTile);
//       } else if (tx == null || ty == null) {
//         continue;
//       }

//       const entity = new GenericEntity({ ...def, tx, ty });
//       const old    = this._entityMap.get(entity.id);

//       if (old) {
//         old.tx             = entity.tx;
//         old.ty             = entity.ty;
//         old.solid          = entity.solid;
//         old.bboxRadius     = entity.bboxRadius;
//         old._renderFn      = entity._renderFn;
//         old._procBlueprint = entity._procBlueprint;
//         old._ring          = entity._ring;
//         old._nodes         = entity._nodes;
//         old._batches       = entity._batches;
//         old._geometricR    = entity._geometricR;
//         old.renderHeavy    = entity.renderHeavy;
//         old._lodColor      = entity._lodColor;
//         if (old._particle) {
//           old._particle.position.x = old.tx;
//           old._particle.position.y = old.ty;
//         }
//       } else {
//         this.addEntity(entity);
//       }
//     }
//   }

//   // ── OPTIMISED RENDER FRAME ────────────────────────────────────────────────
//   _frameOptimized(ts) {
//     if (!this._running) return;
//     this._raf = requestAnimationFrame(ts2 => this._frameOptimized(ts2));

//     // Apply terrain updates accumulated since last frame
//     if (this._pendingTerrainUpdates?.size) {
//       this.terrainCache.merge(this._pendingTerrainUpdates);
//       if (this.playerEntity) {
//         this.terrainCache.evictDistant(this.playerEntity.tx, this.playerEntity.ty, 600);
//       }
//       this._pendingTerrainUpdates = null;
//       this._tileCacheState = null;
//     }

//     const dt = Math.min((ts - (this._lastT || ts)) / 1000, 0.05);
//     this._lastT = ts;

//     const cam    = this.camera;
//     const canvas = this._canvas;
//     const ctx    = this._ctx;
//     const W      = canvas.width;
//     const H      = canvas.height;

//     // ── 1. Update all entities ────────────────────────────────────────────
//     for (const e of this.entities) e.update(dt, this);

//     // ── Update camera focus to player's current global position ──────────
//     if (this.playerEntity) {
//       cam.focusX = this.playerEntity.tx;
//       cam.focusY = this.playerEntity.ty;
//     }

//     // ── Geo-based fetch trigger ───────────────────────────────────────────
//     if (this.playerEntity) {
//       const playerGeo = this._playerGeo();
//       const geoD = Math.hypot(
//         playerGeo.lat - this._lastFetchPos.lat,
//         playerGeo.lon - this._lastFetchPos.lon,
//       );
//       if (geoD > REFETCH_GEO_DIST) {
//         this.geoCenter = playerGeo;
//         this._doFetch(this.geoCenter);
//         this.emit('center:changed', this.geoCenter);
//       }
//     }

//     // ── 2. Rebuild collision spatial index when dirty (FIX 2) ─────────────
//     if (this._spatialTree && this._spatialDirty) {
//       if (!this._collidableScratch) this._collidableScratch = [];
//       const scratch = this._collidableScratch;
//       scratch.length = 0;

//       const px = this.playerEntity?.tx ?? 0;
//       const py = this.playerEntity?.ty ?? 0;

//       this._spatialTree = new Quadtree(
//         { x: px - QUADTREE_HALF, y: py - QUADTREE_HALF, w: QUADTREE_HALF * 2, h: QUADTREE_HALF * 2 },
//         8,
//       );

//       for (const e of this.entities) {
//         if (!e.solid) continue;
//         if (Math.abs(e.tx - px) > SPATIAL_SOLID_RADIUS ||
//             Math.abs(e.ty - py) > SPATIAL_SOLID_RADIUS) continue;
//         scratch.push({ x: e.tx, y: e.ty, entity: e, radius: e.bboxRadius });
//       }
//       this._spatialTree.rebuild(scratch);
//       this._spatialDirty = false;
//     }

//     // ── 3. Rebuild render tree when entities change (FIX 6) ───────────────
//     if (this._renderTreeDirty) {
//       const now = performance.now();
//       if (!this._fetching || (now - this._treeRebuildTimer > 250)) {
//         const px = this.playerEntity?.tx ?? 0;
//         const py = this.playerEntity?.ty ?? 0;
//         this._renderTree = new RenderTree(
//           { x: px - QUADTREE_HALF, y: py - QUADTREE_HALF, w: QUADTREE_HALF * 2, h: QUADTREE_HALF * 2 },
//           8,
//         );
//         this._renderTree.rebuild(this.entities);
//         this._renderTreeDirty  = false;
//         this._treeRebuildTimer = now;
//       }
//     }

//     // ── 4. Camera physics ─────────────────────────────────────────────────
//     cam.updateTilt(dt);
//     cam.updateRotation(
//       dt,
//       this.playerEntity?.tx ?? 0,
//       this.playerEntity?.ty ?? 0,
//       worldToScreen,
//     );
//     if (this._input.isRotatingLeft())  cam.rotVel -= 2.2 * dt;
//     if (this._input.isRotatingRight()) cam.rotVel += 2.2 * dt;

//     // ── 5. Weather tick ───────────────────────────────────────────────────
//     this._renderer.updateWeather(dt, this.playerEntity?.tx ?? 0, this.playerEntity?.ty ?? 0);

//     // ── 6. Player elevation ───────────────────────────────────────────────
//     const pElev = this._playerElev();

//     // ── 7. Physics ────────────────────────────────────────────────────────
//     if (this.physicsWorld && this.physicsEnabled) {
//       const hasDynamic = this._dynamicEntities.length > 0;
//       if (hasDynamic) {
//         if (this.playerEntity?._particle) {
//           const pp = this.playerEntity._particle;
//           pp.position.x = this.playerEntity.tx;
//           pp.position.y = this.playerEntity.ty;
//         }
//         this.physicsWorld.update();
//         for (const e of this._dynamicEntities) {
//           if (!e._particle) continue;
//           if (e === this.playerEntity || e.fixed) {
//             e._particle.position.x     = e.tx;
//             e._particle.position.y     = e.ty;
//             e._particle.prevPosition.x = e.tx;
//             e._particle.prevPosition.y = e.ty;
//           } else {
//             e.syncPhysics();
//           }
//         }
//       }
//     }

//     // ── 8. Smooth camera follow ───────────────────────────────────────────
//     if (cam.tilt > 0.08 && this.playerEntity) {
//       cam.camX += (-W / 2 - cam.camX) * 0.08;
//       cam.camY += (-(pElev + H / 2) - cam.camY) * 0.08;
//     }

//     // ═══════════════════════ RENDERING ═══════════════════════════════════
//     ctx.fillStyle = this._renderer.weather?.mode === 'rain' ? '#020308' : '#04060a';
//     ctx.fillRect(0, 0, W, H);

//     this._renderer.beginFrame();

//     // 9. OSM tiles
//     if (this.debugLayers.osmTiles) {
//       this._renderer.drawOSMLayer(canvas, this.geoCenter);
//     }

//     // 10. Terrain
//     const focusX    = cam.focusX;
//     const focusY    = cam.focusY;
//     const overAlpha = Math.max(0, Math.min(1, (cam.zoom - 0.02) / 0.015));
//     const terrainHW = tileHalfWidth(cam.zoom, cam.tileW);

//     if (overAlpha > 0 && this.debugLayers.overpass && terrainHW >= 2) {
//       const lod = cam.zoom > 0.25 ? 1 : cam.zoom > 0.10 ? 2 : 4;

//       if (lod > 1) {
//         this._renderer.drawTerrain({
//           terrainCache: this.terrainCache,
//           focusX, focusY,
//           overAlpha,
//           lod,
//         });
//       } else {
//         if (this._isTileCacheDirty()) {
//           this._saveTileCacheState();
//           const hw  = terrainHW;
//           const hh  = tileHalfHeight(cam.tilt, cam.zoom, cam.tileW);
//           const txs = Math.min(120, Math.ceil(W / Math.max(1, hw)) + 4);
//           const tys = Math.min(120, Math.ceil(H / Math.max(1, hh)) + 4);

//           const vC = screenToWorld(W / 2, H / 2, cam);
//           const cx = Math.round(vC.x);
//           const cy = Math.round(vC.y);

//           let writeIdx = 0;
//           for (let ty = cy - tys; ty < cy + tys; ty++) {
//             for (let tx = cx - txs; tx < cx + txs; tx++) {
//               const terrainId = this.terrainCache.get(tx, ty) ?? TerrainType.GRASS;
//               if (writeIdx < this._tileCache.length) {
//                 const slot    = this._tileCache[writeIdx];
//                 slot.tx       = tx;
//                 slot.ty       = ty;
//                 slot.terrainId = terrainId;
//               } else {
//                 this._tileCache.push({ tx, ty, terrainId });
//               }
//               writeIdx++;
//             }
//           }
//           this._tileCache.length = writeIdx;
//         }

//         this._renderer.drawTerrain({
//           terrainCache: this.terrainCache,
//           focusX, focusY,
//           overAlpha,
//           lod: 1,
//           tileCache: this._tileCache,
//           playerTx: this.playerEntity?.tx ?? 0,
//           playerTy: this.playerEntity?.ty ?? 0,
//         });
//       }
//     }

//     // 11. Entity rendering (FIX 6 RenderTree query)
//     if (overAlpha > 0 && this.debugLayers.entities) {
//       const drawHeavy = cam.zoom >= LOD_HEAVY_MIN_ZOOM;
//       const hw        = tileHalfWidth(cam.zoom, cam.tileW);
//       const subPixel  = hw < 1.5;   // FIX 5

//       if (!subPixel && this._renderTree) {
//         const worldCorners = [
//           screenToWorld(0, 0, cam),
//           screenToWorld(W, 0, cam),
//           screenToWorld(W, H, cam),
//           screenToWorld(0, H, cam),
//         ];
//         const visibleEntities = this._renderTree.queryFrustum(worldCorners, RENDER_CULL_MARGIN);

//         if (this.playerEntity && !visibleEntities.includes(this.playerEntity)) {
//           visibleEntities.push(this.playerEntity);
//         }

//         // FIX 4 — cache terrain lookup for visible entities only
//         for (const e of visibleEntities) {
//           if (!e.visible) continue;
//           e._cachedTerrainId = this.terrainCache.get(e.tx, e.ty);
//         }

//         for (const e of visibleEntities) {
//           if (!e.visible) continue;
//           if (e.renderHeavy && !drawHeavy) continue;

//           const terrainId    = e._cachedTerrainId ?? this.terrainCache.get(e.tx, e.ty);
//           const groundH      = this.terrainRegistry.heights[terrainId] ?? 4;
//           const groundElevPx = getElevOffset(groundH, cam.tilt, cam.zoom);
//           const altPx        = e.getAltitudePx?.(cam) ?? 0;
//           const totalElevPx  = groundElevPx + altPx;

//           if (e.renderHeavy && this._cameraAnimating) {
//             this._renderer.submitEntityLOD(e, groundElevPx);
//             continue;
//           }

//           this._renderer.submitEntity(e, totalElevPx, {
//             selectedId:   this._selectedId,
//             terrainCache: this.terrainCache,
//             mPerTile:     this._mPerTile,
//           });

//           if (altPx > 0 && e.showAltitudeLine && cam.zoom > 0.08) {
//             this._renderer.submitAltitudeLine(e, groundElevPx, totalElevPx);
//           }
//         }

//       } else if (this.playerEntity?.visible) {
//         // subPixel path — only render the player
//         const terrainId    = this.terrainCache.get(this.playerEntity.tx, this.playerEntity.ty);
//         const groundH      = this.terrainRegistry.heights[terrainId] ?? 4;
//         const groundElevPx = getElevOffset(groundH, cam.tilt, cam.zoom);
//         const altPx        = this.playerEntity.getAltitudePx?.(cam) ?? 0;
//         this._renderer.submitEntity(this.playerEntity, groundElevPx + altPx, {
//           selectedId:   this._selectedId,
//           terrainCache: this.terrainCache,
//           mPerTile:     this._mPerTile,
//         });
//       }
//     }

//     // 12. Flush pipeline (shadows → world objects → weather → overlays)
//     this._renderer.flush();

//     // 13. Debug overlay
//     if (this.debugLayers.colliders) {
//       this._renderer.drawDebugOverlay(
//         this.entities,
//         this.terrainCache,
//         this.terrainRegistry,
//       );
//     }

//     // 14. HUD
//     if (this.playerEntity) {
//       const geo = this._playerGeo();
//       this.emit('hud', {
//         lat:     geo.lat,
//         lon:     geo.lon,
//         zoom:    cam.zoom.toFixed(2),
//         tilt:    cam.tilt.toFixed(2),
//         terrain: this.terrainRegistry.names[
//           this.terrainCache.get(this.playerEntity.tx, this.playerEntity.ty)
//         ] ?? 'Unknown',
//         renderCount: this._renderTree?.size ?? this.entities.length,
//       });
//     }
//   }

//   // ── CLICK HANDLER ─────────────────────────────────────────────────────────
//   _handleClick({ x: cx, y: cy, button }) {
//     if (button === 2) {
//       const wPos = screenToWorld(cx, cy, this.camera);
//       this.emit('map:rightclick', { screenX: cx, screenY: cy, globalTx: wPos.x, globalTy: wPos.y });
//       return;
//     }

//     const wClick = screenToWorld(cx, cy, this.camera);
//     const hw     = tileHalfWidth(this.camera.zoom, this.camera.tileW);
//     const pickRadiusTiles = hw > 0 ? (20 / hw) + 1.0 : 3.0;

//     const candidates = this._renderTree
//       ? this._renderTree.queryRange({
//           x: wClick.x - pickRadiusTiles,
//           y: wClick.y - pickRadiusTiles,
//           w: pickRadiusTiles * 2,
//           h: pickRadiusTiles * 2,
//         })
//       : this.entities;

//     let best = null, bestDist = Infinity;
//     const thresh = 20 * this.camera.zoom;

//     for (const e of candidates) {
//       const terrainId = this.terrainCache.get(e.tx, e.ty);
//       const groundH   = this.terrainRegistry.heights[terrainId] ?? 4;
//       const elev      = getElevOffset(groundH, this.camera.tilt, this.camera.zoom);
//       const { x: sx, y: sy } = worldToScreen(e.tx + 0.5, e.ty + 0.5, elev + (e.elevOffset ?? 0), this.camera);
//       const dist = Math.hypot(cx - sx, cy - sy);
//       if (dist < thresh && dist < bestDist) { bestDist = dist; best = e; }
//     }

//     if (best) {
//       this._selectedId = best.id;
//       best.onInteract?.(this, cx, cy);
//       this.emit('entity:click', { entity: best });
//     } else {
//       this._selectedId = null;
//       this.emit('map:click', { globalTx: wClick.x, globalTy: wClick.y, screenX: cx, screenY: cy });
//     }
//   }
// }