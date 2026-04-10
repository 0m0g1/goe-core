/**
 * GOE Core — RenderPipeline
 * Defers and sorts render commands into strict layers to solve z-fighting
 * and ensure UI overlays (labels, clusters) are always drawn on top of 3D geometry.
 */
export class RenderPipeline {
  constructor(ctx, cam) {
    this.ctx = ctx;
    this.cam = cam;
    
    this.shadowCasters = [];
    this.worldObjects  = [];
    this.uiOverlays    = [];
  }

  beginFrame() {
    this.shadowCasters.length = 0;
    this.worldObjects.length  = 0;
    this.uiOverlays.length    = 0;
  }

  /**
   * Submit a footprint to the volumetric shadow pass.
   */
  submitShadow(hullData) {
    this.shadowCasters.push(hullData);
  }

  /**
   * Submit a 3D object or sprite. Will be depth-sorted.
   */
  submitWorldObject(depth, renderFn) {
    this.worldObjects.push({ depth, renderFn });
  }

  /**
   * Submit screen-space UI (labels, badges). Drawn last, ignores depth.
   */
  submitOverlay(renderFn) {
    this.uiOverlays.push(renderFn);
  }

  /**
   * Execute the deferred rendering sequence.
   */
  flush(shadowSystem, weatherSystem) {
    const { ctx } = this;

    // 1. Shadows (Multiply blending on top of terrain)
    if (this.shadowCasters.length > 0 && shadowSystem?.enabled) {
      shadowSystem.drawShadows(this.shadowCasters);
    }

    // 2. Y-Sorted World Geometry (Voxels, Trees, Players, Flat Features)
    this.worldObjects.sort((a, b) => a.depth - b.depth);
    for (const obj of this.worldObjects) {
      obj.renderFn(ctx);
    }

    // 3. Weather Overlay (Rain, snow, fog)
    if (weatherSystem) {
      weatherSystem.draw();
    }

    // 4. UI / Overlays (Always on top of geometry and weather)
    for (const overlay of this.uiOverlays) {
      overlay(ctx);
    }
  }
}