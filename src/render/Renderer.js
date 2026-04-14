/**
 * GOE Core — WorldRenderer
 *
 * Changes:
 *   • drawDebugOverlay() added — draws collision shapes + facing arrows for
 *     all blueprint entities.  Called from Engine after flush() when
 *     debugLayers.colliders is true.
 */
import { VoxelRenderer }  from './VoxelRenderer.js';
import { ShadowSystem }   from './ShadowSystem.js';
import { RenderPipeline } from './RendererPipeline.js';
import { shadeHex, worldToScreen, tileHalfWidth, getElevOffset } from '../math/projection.js';

export class WorldRenderer {
  constructor(ctx, cam, opts = {}) {
    this.ctx = ctx;
    this.cam = cam;

    this._voxel    = new VoxelRenderer(ctx, cam);
    this._shadows  = new ShadowSystem(ctx, cam, opts.shadow ?? {});
    this._pipeline = new RenderPipeline(ctx, cam);
  }

  get shadowSystem() { return this._shadows; }

  beginFrame() {
    this._voxel.beginFrame();
    this._shadows.beginFrame();
    this._pipeline.beginFrame();
  }

  flush(weatherSystem) {
    this._pipeline.flush(this._shadows, weatherSystem);
  }

  // ── Voxel / Blueprint drawing ─────────────────────────────────────────────

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

  // ── Primitive drawing API ─────────────────────────────────────────────────

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
    const { ctx }                    = this;
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

  // ── Debug overlay ─────────────────────────────────────────────────────────

  /**
   * Draw debug collision shapes + facing arrows over all entities.
   * Call AFTER flush() so the overlay sits on top of everything.
   *
   * @param {Entity[]} entities
   * @param {object}   cam
   * @param {number}   pGX         global origin X
   * @param {number}   pGY         global origin Y
   * @param {object}   terrainCache
   * @param {object}   terrainRegistry
   */
  drawDebugOverlay(entities, cam, pGX, pGY, terrainCache, terrainRegistry) {
    const ctx = this.ctx;
    const hw  = tileHalfWidth(cam.zoom, cam.tileW);
    if (hw < 3) return;

    ctx.save();

    for (const e of entities) {
      const groundH = terrainRegistry.heights[
        terrainCache.getLocal?.(e.tx, e.ty, pGX, pGY, 80, 80)
      ] ?? 4;
      const elevPx = getElevOffset(groundH, cam.tilt, cam.zoom);
      const { x: sx, y: sy } = worldToScreen(e.tx + 0.5, e.ty + 0.5, elevPx, cam);

      // ── Collision shape ───────────────────────────────────────────────────
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

      // ── Facing arrow (blueprints only) ────────────────────────────────────
      if (e._facingAngle != null && e._bpKey) {
        // compassBearing → screen direction
        // North = -Y on screen (up), East = +X
        const bearing  = e._facingAngle * Math.PI / 180;
        const camRot   = cam.rotation;
        const wx =  Math.sin(bearing);   // east component
        const wz = -Math.cos(bearing);   // north component (neg because Z=south)
        // Project into isometric screen space
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

        // Arrowhead
        const ax = nx / len, ay = -ny / len;
        ctx.beginPath();
        ctx.moveTo(sx + nx, sy - ny);
        ctx.lineTo(sx + nx - ax * 6 + ay * 4, sy - ny - ay * 6 - ax * 4);
        ctx.lineTo(sx + nx - ax * 6 - ay * 4, sy - ny - ay * 6 + ax * 4);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,255,150,0.9)';
        ctx.fill();

        // Label: compass degrees
        if (hw > 8) {
          ctx.fillStyle  = 'rgba(0,255,150,0.9)';
          ctx.font       = '10px monospace';
          ctx.textAlign  = 'center';
          ctx.fillText(`${Math.round(e._facingAngle)}°`, sx + nx * 1.4, sy - ny * 1.4);
        }
      }

      // ── Entity ID at high zoom ────────────────────────────────────────────
      if (hw > 20 && e._bpKey) {
        ctx.fillStyle  = 'rgba(255,255,255,0.6)';
        ctx.font       = '9px monospace';
        ctx.textAlign  = 'center';
        ctx.fillText(e._bpKey, sx, sy + 4);
      }
    }

    ctx.restore();
  }

  // Add this inside WorldRenderer
  setRenderTarget(targetCtx, targetCam) {
    this.ctx = targetCtx;
    if (targetCam) this.cam = targetCam;

    if (this._voxel) {
      this._voxel.ctx = targetCtx;
      if (targetCam) this._voxel.cam = targetCam;
    }
    if (this._shadows) {
      this._shadows.ctx = targetCtx;
      if (targetCam) this._shadows.cam = targetCam;
    }
    if (this._pipeline) {
      this._pipeline.ctx = targetCtx;
      if (targetCam) this._pipeline.cam = targetCam;
    }
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

  worldToScreen(tx, ty, elevPx) {
    return worldToScreen(tx, ty, elevPx, this.cam);
  }
}