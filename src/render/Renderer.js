/**
 * GOE Core — WorldRenderer
 *
 * WorldRenderer is the single rendering orchestrator for GOE.
 * The Engine only holds a reference to WorldRenderer and calls:
 *
 *   renderer.beginFrame()
 *   renderer.drawOSMLayer(canvas, geoCenter)
 *   renderer.drawTerrain({ terrainCache, focusX, focusY, overAlpha, lod, tileCache, playerTx, playerTy })
 *   renderer.submitEntity(entity, elevPx, extra)
 *   renderer.submitEntityLOD(entity, groundElevPx)
 *   renderer.submitAltitudeLine(entity, groundElevPx, totalElevPx)
 *   renderer.updateWeather(dt, playerX, playerY)
 *   renderer.flush()
 *   renderer.drawDebugOverlay(entities, terrainCache, terrainRegistry)
 *
 * All sub-renderers (VoxelRenderer, TileRenderer, OSMLayerRenderer,
 * ShadowSystem, RenderPipeline, WeatherSystem) are fully internal.
 * The Engine never imports or instantiates them directly.
 *
 * Internal rendering responsibilities:
 *   • VoxelRenderer      — isometric box / blueprint drawing
 *   • ShadowSystem       — shadow caster accumulation + AO
 *   • RenderPipeline     — depth-sorted world objects + UI overlays
 *   • TileRenderer       — terrain bake + tile layer draw
 *   • OSMLayerRenderer   — slippy-map tile overlay
 *   • WeatherSystem      — particle weather effects
 */

import { VoxelRenderer }     from './VoxelRenderer.js';
import { ShadowSystem }      from './ShadowSystem.js';
import { RenderPipeline }    from './RendererPipeline.js';
import { TileRenderer }      from './TileRenderer.js';
import { OSMLayerRenderer }  from './OSMLayerRenderer.js';
import { WeatherSystem }     from './WeatherSystem.js';
import {
  shadeHex,
  worldToScreen,
  tileHalfWidth,
  getElevOffset,
  frontDepth,
} from '../math/projection.js';

export class WorldRenderer {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {Camera}   cam
   * @param {object}   [opts]
   * @param {object}   [opts.shadow]           - ShadowSystem options
   * @param {Function} [opts.tileURLFn]        - Slippy-map URL factory   (z,x,y)=>string
   * @param {object}   [opts.terrainRegistry]  - Required for TileRenderer
   */
  constructor(ctx, cam, opts = {}) {
    this.ctx = ctx;
    this.cam = cam;

    // ── Core sub-renderers ────────────────────────────────────────────────
    this._voxel    = new VoxelRenderer(ctx, cam);
    this._shadows  = new ShadowSystem(ctx, cam, opts.shadow ?? {});
    this._pipeline = new RenderPipeline(ctx, cam);

    // ── Higher-level sub-renderers ────────────────────────────────────────
    this._tileRenderer = opts.terrainRegistry
      ? new TileRenderer(this, opts.terrainRegistry)
      : null;

    this._osmLayer = opts.tileURLFn
      ? new OSMLayerRenderer(this, opts.tileURLFn)
      : null;

    this._weather = null; // created lazily via initWeather()
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Configuration  — called once (or on change) after construction
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Attach (or replace) a TileRenderer.  Call this when the terrain
   * registry is available if it wasn't passed to the constructor.
   */
  setTerrainRegistry(terrainRegistry) {
    this._tileRenderer = new TileRenderer(this, terrainRegistry);
  }

  /**
   * Set or change the OSM tile URL factory.
   * Replaces the direct Engine.setTileSource / Engine._osmLayer.setURLFn pattern.
   */
  setTileSource(urlFn) {
    if (this._osmLayer) {
      this._osmLayer.setURLFn(urlFn);
    } else {
      this._osmLayer = new OSMLayerRenderer(this, urlFn);
    }
  }

  /**
   * Evict the OSM tile cache (e.g. after a panTo).
   */
  resetOSMTileCache() {
    this._osmLayer?.resetTileCache();
  }

  /**
   * Create the WeatherSystem (idempotent — safe to call multiple times).
   * @returns {WeatherSystem}
   */
  initWeather() {
    if (!this._weather) {
      this._weather = new WeatherSystem(this);
      this._weather.setMode('none');
    }
    return this._weather;
  }

  /** Read-only access for Engine.weather-event passthrough. */
  get weather() { return this._weather; }

  // ══════════════════════════════════════════════════════════════════════════
  // Per-frame rendering API  (called by Engine._frameOptimized)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Must be called once at the start of every frame, before any draw calls.
   */
  beginFrame() {
    this._voxel.beginFrame();
    this._shadows.beginFrame();
    this._pipeline.beginFrame();
  }

  // ── Layer 1 : OSM slippy-map tiles ───────────────────────────────────────

  /**
   * Draw slippy-map tile overlay.
   * No-op when no tile source has been configured.
   *
   * @param {HTMLCanvasElement}          canvas
   * @param {{ lat: number, lon: number }} geoCenter
   */
  drawOSMLayer(canvas, geoCenter) {
    this._osmLayer?.draw(canvas, geoCenter);
  }

  // ── Layer 2 : Terrain ────────────────────────────────────────────────────

  /**
   * Draw the terrain tile layer (merged LOD or full-detail tile grid).
   *
   * @param {object}  opts
   * @param {object}  opts.terrainCache
   * @param {number}  opts.focusX       Global tile X  (= cam.focusX)
   * @param {number}  opts.focusY       Global tile Y  (= cam.focusY)
   * @param {number}  opts.overAlpha    Opacity of the terrain layer (0–1)
   * @param {number}  opts.lod          LOD level: 1 = full detail, 2/4 = merged blocks
   * @param {Array}   [opts.tileCache]  Pre-built tile list; required when lod === 1
   * @param {number}  [opts.playerTx]   Player global tile X (for highlight)
   * @param {number}  [opts.playerTy]   Player global tile Y
   */
  drawTerrain(opts) {
    if (!this._tileRenderer) return;
    const { terrainCache, focusX, focusY, overAlpha, lod, tileCache, playerTx = 0, playerTy = 0 } = opts;
    if (overAlpha <= 0) return;
    if (lod > 1) {
      this._tileRenderer.drawMergedLayer(terrainCache, focusX, focusY, lod, overAlpha);
    } else {
      this._tileRenderer.drawLayer(tileCache, playerTx, playerTy, terrainCache, focusX, focusY);
    }
  }

  /**
   * Mark the terrain bake dirty (e.g. after terrain data changes).
   */
  invalidateTerrain() {
    this._tileRenderer?.invalidate();
  }

  /**
   * Force a synchronous terrain rebake (e.g. on first mount).
   */
  invalidateTerrainSync(terrainCache, focusX, focusY) {
    this._tileRenderer?.invalidateSync(terrainCache, focusX, focusY);
  }

  // ── Layer 3 : Entities ───────────────────────────────────────────────────

  /**
   * Submit an entity for rendering.
   * Delegates to entity.render(this, elevPx, extra) — entities retain full
   * control of their draw logic via WorldRenderer's voxel/blueprint API.
   *
   * @param {Entity} entity
   * @param {number} elevPx   Total elevation offset in pixels
   * @param {object} extra    { selectedId, terrainCache, mPerTile }
   */
  submitEntity(entity, elevPx, extra) {
    entity.render(this, elevPx, extra);
  }

  /**
   * Submit a low-detail dot for an entity (used during camera animation or low zoom).
   *
   * @param {Entity} entity
   * @param {number} groundElevPx
   */
  submitEntityLOD(entity, groundElevPx) {
    const cam   = this.cam;
    const geomR = entity._geometricR ?? entity.bboxRadius ?? 0.35;
    const depth = frontDepth(entity.tx, entity.ty, cam.rotation, geomR);
    this._pipeline.submitWorldObject(depth, ctx => {
      const sc = worldToScreen(entity.tx + 0.5, entity.ty + 0.5, groundElevPx, cam);
      const r  = Math.max(2, cam.zoom * cam.tileW * 0.3);
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, r, 0, Math.PI * 2);
      ctx.fillStyle = entity._lodColor ?? '#78909C';
      ctx.fill();
    });
  }

  /**
   * Submit a vertical drop-line for a flying entity.
   *
   * @param {Entity} entity
   * @param {number} groundElevPx
   * @param {number} totalElevPx
   */
  submitAltitudeLine(entity, groundElevPx, totalElevPx) {
    const cam   = this.cam;
    const geomR = entity._geometricR ?? entity.bboxRadius ?? 0.35;
    const depth = frontDepth(entity.tx, entity.ty, cam.rotation, geomR);
    this._pipeline.submitWorldObject(depth, () => {
      const ground = worldToScreen(entity.tx + 0.5, entity.ty + 0.5, groundElevPx, cam);
      const airPos = worldToScreen(entity.tx + 0.5, entity.ty + 0.5, totalElevPx,  cam);
      this.drawLine(ground.x, ground.y, airPos.x, airPos.y, 'rgba(180,200,255,0.25)', 1);
      this.drawCircle(ground.x, ground.y, 2, 'rgba(180,200,255,0.4)');
    });
  }

  // ── Layer 4 : Weather update ─────────────────────────────────────────────

  /**
   * Tick the weather simulation.  Call each frame before flush().
   *
   * @param {number} dt
   * @param {number} playerX  Global tile X
   * @param {number} playerY  Global tile Y
   */
  updateWeather(dt, playerX, playerY) {
    this._weather?.update(dt, playerX, playerY);
  }

  // ── Layer 5 : Flush ──────────────────────────────────────────────────────

  /**
   * Flush all deferred commands in order:
   *   shadows → depth-sorted world geometry → weather particles → UI overlays
   *
   * Must be called once per frame after all entity submissions.
   */
  flush() {
    this._pipeline.flush(this._shadows, this._weather);
  }

  // ── Layer 6 : Debug overlay ──────────────────────────────────────────────

  /**
   * Draw debug collision shapes and facing arrows over all entities.
   * Call AFTER flush() so the overlay sits on top of everything.
   *
   * @param {Entity[]} entities
   * @param {object}   terrainCache
   * @param {object}   terrainRegistry
   */
  drawDebugOverlay(entities, terrainCache, terrainRegistry) {
    const ctx = this.ctx;
    const cam = this.cam;
    const hw  = tileHalfWidth(cam.zoom, cam.tileW);
    if (hw < 3) return;

    ctx.save();

    for (const e of entities) {
      const groundH = terrainRegistry.heights[terrainCache.get(e.tx, e.ty)] ?? 4;
      const elevPx  = getElevOffset(groundH, cam.tilt, cam.zoom);
      const { x: sx, y: sy } = worldToScreen(e.tx + 0.5, e.ty + 0.5, elevPx, cam);

      // Collision shape
      if (e._isBuildingBox || e._isCollider) {
        const hw2 = (e._halfW ?? e.bboxRadius) * hw * 2;
        const hd2 = (e._halfD ?? e.bboxRadius) * hw * 2;
        ctx.strokeStyle = e._isCollider ? 'rgba(255,80,80,0.7)' : 'rgba(255,200,0,0.5)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(sx - hw2, sy - hd2, hw2 * 2, hd2 * 2);
      } else if (e.bboxRadius) {
        const r = e.bboxRadius * hw * 2;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.strokeStyle = e.solid ? 'rgba(255,100,100,0.5)' : 'rgba(100,180,255,0.35)';
        ctx.lineWidth   = 1;
        ctx.stroke();
      }

      // Facing arrow (blueprints only)
      if (e._facingAngle != null && e._bpKey) {
        const bearing  = e._facingAngle * Math.PI / 180;
        const camRot   = cam.rotation;
        const wx =  Math.sin(bearing);
        const wz = -Math.cos(bearing);
        const screenDX = (wx * Math.cos(camRot) - wz * Math.sin(camRot)) * hw;
        const screenDY = (wx * Math.sin(camRot) + wz * Math.cos(camRot)) * hw * cam.tilt;

        const len = Math.max(12, hw * 1.5);
        const mag = Math.hypot(screenDX, screenDY) || 1;
        const nx  = (screenDX / mag) * len;
        const ny  = (screenDY / mag) * len;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + nx, sy - ny);
        ctx.strokeStyle = 'rgba(0,255,150,0.9)';
        ctx.lineWidth   = 2;
        ctx.stroke();

        const ax = nx / len, ay = -ny / len;
        ctx.beginPath();
        ctx.moveTo(sx + nx, sy - ny);
        ctx.lineTo(sx + nx - ax * 6 + ay * 4, sy - ny - ay * 6 - ax * 4);
        ctx.lineTo(sx + nx - ax * 6 - ay * 4, sy - ny - ay * 6 + ax * 4);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,255,150,0.9)';
        ctx.fill();

        if (hw > 8) {
          ctx.fillStyle = 'rgba(0,255,150,0.9)';
          ctx.font      = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${Math.round(e._facingAngle)}°`, sx + nx * 1.4, sy - ny * 1.4);
        }
      }

      // Entity key at high zoom
      if (hw > 20 && e._bpKey) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font      = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(e._bpKey, sx, sy + 4);
      }
    }

    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Weather passthrough
  // ══════════════════════════════════════════════════════════════════════════

  /** @param {string} mode */
  setWeatherMode(mode) {
    this.initWeather().setMode(mode);
  }

  /** @param {{ x: number, y: number }} wind */
  setWeatherWind(wind) {
    if (this._weather) this._weather.wind = wind;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Voxel / Blueprint drawing  (called by Entity.render implementations)
  // ══════════════════════════════════════════════════════════════════════════

  get shadowSystem() { return this._shadows; }

  beginTile(tx, ty, elevPx) {
    this._voxel.beginTile(tx, ty, elevPx);
  }

  box(x, y, z, w, h, d, top, right, front) {
    this._voxel.box(x, y, z, w, h, d, top, right, front);
  }

  drawBlueprintRotated(blueprint, tx, ty, elevPx, angleDeg, colorOverride = null) {
    this._voxel.beginTile(tx, ty, elevPx);
    this._voxel.setRotation(angleDeg ?? 180);
    for (const p of blueprint) {
      const top   = colorOverride ? colorOverride                : p.top;
      const right = colorOverride ? shadeHex(colorOverride, 0.7) : p.right ?? p.top;
      const front = colorOverride ? shadeHex(colorOverride, 0.4) : p.front ?? p.top;
      this._voxel.box(p.x, p.y, p.z, p.w, p.h, p.d, top, right, front);
    }
    this._voxel.clearRotation();
  }

  drawBlueprint(blueprint, tx, ty, elevPx, colorOverride = null) {
    this._voxel.beginTile(tx, ty, elevPx);
    for (const p of blueprint) {
      const top   = colorOverride ? colorOverride                : p.top;
      const right = colorOverride ? shadeHex(colorOverride, 0.7) : p.right ?? p.top;
      const front = colorOverride ? shadeHex(colorOverride, 0.4) : p.front ?? p.top;
      this._voxel.box(p.x, p.y, p.z, p.w, p.h, p.d, top, right, front);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Primitive drawing API  (called by Entity.render + internal helpers)
  // ══════════════════════════════════════════════════════════════════════════

  drawLine(x1, y1, x2, y2, strokeStyle, lineWidth = 1.2, lineCap = 'round') {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth   = lineWidth;
    ctx.lineCap     = lineCap;
    ctx.stroke();
  }

  drawCircle(x, y, radius, fillStyle) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  strokeCircle(x, y, radius, strokeStyle, lineWidth = 1.5) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth   = lineWidth;
    ctx.stroke();
  }

  drawPolygon(points, fillStyle = null, strokeStyle = null, lineWidth = 0.5) {
    const { ctx } = this;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    if (fillStyle)   { ctx.fillStyle   = fillStyle;   ctx.fill(); }
    if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  fillRect(x, y, w, h, fillStyle) {
    this.ctx.fillStyle = fillStyle;
    this.ctx.fillRect(x, y, w, h);
  }

  drawTransformedImage(img, transform, srcW = 256, srcH = 256) {
    const { ctx }                        = this;
    const { m11, m12, m21, m22, dx, dy } = transform;
    ctx.save();
    ctx.setTransform(m11, m12, m21, m22, dx, dy);
    ctx.drawImage(img, 0, 0, srcW, srcH);
    ctx.restore();
  }

  drawImage(img, ...args) {
    this.ctx.drawImage(img, ...args);
  }

  drawLabel(lx, ly, text, bgColor = 'rgba(0,0,0,0.55)', textColor = '#ffffff', fontSize = 11) {
    const { ctx } = this;
    ctx.font         = `500 ${fontSize}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    const tw         = ctx.measureText(text).width;
    ctx.fillStyle    = bgColor;
    ctx.beginPath();
    ctx.roundRect?.(lx - tw / 2 - 5, ly - fontSize - 2, tw + 10, fontSize + 6, 4)
      ?? ctx.rect(lx - tw / 2 - 5, ly - fontSize - 2, tw + 10, fontSize + 6);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.fillText(text, lx, ly);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Pipeline submission  (called by Entity.render implementations)
  // ══════════════════════════════════════════════════════════════════════════

  submitShadow(hullData)                       { this._pipeline.submitShadow(hullData); }
  submitWorldObject(depth, context, renderFn, priority) { 
    this._pipeline.submitWorldObject(depth, context, renderFn, priority); 
  }
  submitOverlay(renderFn)                      { this._pipeline.submitOverlay(renderFn); }

  // ══════════════════════════════════════════════════════════════════════════
  // Lighting / shadow helpers  (called by Entity.render implementations)
  // ══════════════════════════════════════════════════════════════════════════

  getLightFactor(normalAngle)  { return this._shadows.getLightFactor(normalAngle); }
  aoFactor(...args)            { return this._shadows.aoFactor(...args); }
  applyAO(hex, factor)         { return this._shadows.applyAO(hex, factor); }

  setSunAngle(angle, elevation) {
    this._shadows.sunAngle = angle;
    if (elevation != null) this._shadows.sunElevation = elevation;
  }

  toggleShadows(value) {
    this._shadows.enabled = value ?? !this._shadows.enabled;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Utility
  // ══════════════════════════════════════════════════════════════════════════

  worldToScreen(tx, ty, elevPx) {
    return worldToScreen(tx, ty, elevPx, this.cam);
  }

  /**
   * Swap render target for off-screen baking (SpriteCache).
   */
  setRenderTarget(targetCtx, targetCam) {
    this.ctx = targetCtx;
    if (targetCam) this.cam = targetCam;
    if (this._voxel)    { this._voxel.ctx    = targetCtx; if (targetCam) this._voxel.cam    = targetCam; }
    if (this._shadows)  { this._shadows.ctx  = targetCtx; if (targetCam) this._shadows.cam  = targetCam; }
    if (this._pipeline) { this._pipeline.ctx = targetCtx; if (targetCam) this._pipeline.cam = targetCam; }
  }

  /** @deprecated Use beginFrame() */
  beginPipeline() { this.beginFrame(); }
}