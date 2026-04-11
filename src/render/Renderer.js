/**
 * GOE Core — WorldRenderer
 *
 * The single gateway to the canvas. No subsystem should hold a CanvasRenderingContext2D
 * or draw directly; everything is submitted through this class.
 *
 * Wraps:
 *   VoxelRenderer   — voxel-space box drawing + projection
 *   ShadowSystem    — sun angle, AO, volumetric shadows
 *   RenderPipeline  — depth-sorted world objects + UI overlays
 *
 * Subsystems interact only via:
 *   beginTile / box / drawBlueprint   — voxel geometry
 *   drawLine / drawCircle / drawPolygon / fillRect / drawTransformedImage — primitives
 *   submitShadow / submitWorldObject / submitOverlay  — pipeline queues
 */
import { VoxelRenderer }  from './VoxelRenderer.js';
import { ShadowSystem }   from './ShadowSystem.js';
import { RenderPipeline } from '../core/RendererPipeline.js';   // adjust path if needed
import { shadeHex, worldToScreen } from '../math/projection.js';

export class WorldRenderer {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object}                  cam
   * @param {object}                  [opts]
   * @param {object}                  [opts.shadow]  Forwarded to ShadowSystem
   */
  constructor(ctx, cam, opts = {}) {
    this.ctx = ctx;
    this.cam = cam;

    this._voxel    = new VoxelRenderer(ctx, cam);
    this._shadows  = new ShadowSystem(ctx, cam, opts.shadow ?? {});
    this._pipeline = new RenderPipeline(ctx, cam);
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  get shadowSystem() { return this._shadows; }

  // ── Frame lifecycle ───────────────────────────────────────────────────────

  beginFrame() {
    this._voxel.beginFrame();
    this._shadows.beginFrame();
    this._pipeline.beginFrame();
  }

  /**
   * Execute the deferred rendering pipeline.
   * Order: shadows → depth-sorted world objects → weather → UI overlays.
   * @param {WeatherSystem} [weatherSystem]
   */
  flush(weatherSystem) {
    this._pipeline.flush(this._shadows, weatherSystem);
  }

  // ── Voxel / Blueprint drawing ─────────────────────────────────────────────

  /** Set the tile-space origin for subsequent box() calls. */
  beginTile(tx, ty, elevPx) {
    this._voxel.beginTile(tx, ty, elevPx);
  }

  /**
   * Draw a single voxel box relative to the current tile origin.
   * Mirrors VoxelRenderer.box() directly.
   */
  box(x, y, z, w, h, d, top, right, front) {
    this._voxel.box(x, y, z, w, h, d, top, right, front);
  }


  drawBlueprintRotated(blueprint, tx, ty, elevPx, angleDeg, colorOverride = null) {
    this._voxel.beginTile(tx, ty, elevPx);
    const rad = (angleDeg ?? 0) * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    for (const p of blueprint) {
      // Rotate box CENTER around Y axis, then recompute corner
      const cx = p.x + p.w / 2;
      const cz = p.z + p.d / 2;
      const rx = cx * cos - cz * sin;
      const rz = cx * sin + cz * cos;

      // After rotation the box half-extents swap for 90° multiples,
      // but for arbitrary angles we keep w/d and accept slight shape error
      // (good enough for OSM compass angles which are usually near 0/90/180/270)
      const snap = Math.round(angleDeg / 90) * 90;
      let rw = p.w, rd = p.d;
      if (Math.abs(snap % 180) === 90) { rw = p.d; rd = p.w; }

      const top   = colorOverride ? colorOverride                  : p.top;
      const right = colorOverride ? shadeHex(colorOverride, 0.7)   : p.right ?? p.top;
      const front = colorOverride ? shadeHex(colorOverride, 0.4)   : p.front ?? p.top;

      this._voxel.box(
        rx - rw / 2, p.y, rz - rd / 2,
        rw, p.h, rd,
        top, right, front,
      );
    }
  }

  /**
   * Draw a full blueprint (array of {x,y,z,w,h,d,top,right,front} descriptors)
   * at a world tile position.
   *
   * @param {Array}       blueprint
   * @param {number}      tx
   * @param {number}      ty
   * @param {number}      elevPx
   * @param {string|null} [colorOverride]  Tints every box when set
   */
  drawBlueprint(blueprint, tx, ty, elevPx, colorOverride = null) {
    this._voxel.beginTile(tx, ty, elevPx);
    for (const p of blueprint) {
      const top   = colorOverride ? colorOverride             : p.top;
      const right = colorOverride ? shadeHex(colorOverride, 0.7) : p.right ?? p.top;
      const front = colorOverride ? shadeHex(colorOverride, 0.4) : p.front ?? p.top;
      this._voxel.box(p.x, p.y, p.z, p.w, p.h, p.d, top, right, front);
    }
  }

  // ── Primitive drawing API ─────────────────────────────────────────────────

  /** Stroke a line on the canvas. */
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

  /** Fill a circle on the canvas. */
  drawCircle(x, y, radius, fillStyle) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  /** Stroke a circle on the canvas. */
  strokeCircle(x, y, radius, strokeStyle, lineWidth = 1.5) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth   = lineWidth;
    ctx.stroke();
  }

  /**
   * Draw a closed polygon.
   * @param {Array<{x,y}>} points
   */
  drawPolygon(points, fillStyle = null, strokeStyle = null, lineWidth = 0.5) {
    const { ctx } = this;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    if (fillStyle)   { ctx.fillStyle   = fillStyle;   ctx.fill(); }
    if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  /** Fill a rectangle on the canvas. */
  fillRect(x, y, w, h, fillStyle) {
    this.ctx.fillStyle = fillStyle;
    this.ctx.fillRect(x, y, w, h);
  }

  /**
   * Draw an image via an affine transform.
   * Used for slippy-map tiles, baked terrain images, etc.
   *
   * @param {CanvasImageSource} img
   * @param {{m11,m12,m21,m22,dx,dy}} transform
   * @param {number} [srcW=256]
   * @param {number} [srcH=256]
   */
  drawTransformedImage(img, transform, srcW = 256, srcH = 256) {
    const { ctx }                    = this;
    const { m11, m12, m21, m22, dx, dy } = transform;
    ctx.save();
    ctx.setTransform(m11, m12, m21, m22, dx, dy);
    ctx.drawImage(img, 0, 0, srcW, srcH);
    ctx.restore();
  }

  /**
   * Draw a canvas image at a screen position with optional size.
   * Delegates to standard drawImage overloads.
   */
  drawImage(img, ...args) {
    this.ctx.drawImage(img, ...args);
  }

  /**
   * Draw a text label with a dark pill background.
   * Convenience used by FeatureRenderer, cluster badges, etc.
   */
  drawLabel(lx, ly, text, bgColor = 'rgba(0,0,0,0.55)', textColor = '#ffffff', fontSize = 11) {
    const { ctx } = this;
    ctx.font           = `500 ${fontSize}px sans-serif`;
    ctx.textAlign      = 'center';
    ctx.textBaseline   = 'bottom';
    const tw           = ctx.measureText(text).width;
    ctx.fillStyle      = bgColor;
    ctx.beginPath();
    ctx.roundRect?.(lx - tw / 2 - 5, ly - fontSize - 2, tw + 10, fontSize + 6, 4)
      ?? ctx.rect(lx - tw / 2 - 5, ly - fontSize - 2, tw + 10, fontSize + 6);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.fillText(text, lx, ly);
  }

  // ── Pipeline submission ───────────────────────────────────────────────────

  submitShadow(hullData)             { this._pipeline.submitShadow(hullData); }
  submitWorldObject(depth, renderFn) { this._pipeline.submitWorldObject(depth, renderFn); }
  submitOverlay(renderFn)            { this._pipeline.submitOverlay(renderFn); }

  // ── ShadowSystem delegation ───────────────────────────────────────────────

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

  // ── Projection convenience ────────────────────────────────────────────────

  worldToScreen(tx, ty, elevPx) {
    return worldToScreen(tx, ty, elevPx, this.cam);
  }
}