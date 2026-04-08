/**
 * GOE Core — Camera
 * Holds all view state for the isometric renderer:
 *   zoom, tilt, rotation, camX/Y scroll offset, and derived half-width/height.
 *
 * The Camera object is passed by reference to all renderers so they always
 * read current state without extra parameter passing.
 */
import { zoomToTilt, applyZoom } from '../math/projection.js';

export class Camera {
  /**
   * @param {object} [opts]
   * @param {number} [opts.zoom]
   * @param {number} [opts.rotation]
   * @param {number} [opts.zoomMin]
   * @param {number} [opts.zoomMax]
   * @param {number} [opts.zoomFlat]    Tilt begins at this zoom
   * @param {number} [opts.zoomIso]     Full ISO at this zoom
   * @param {number} [opts.zoomSpeed]   Wheel sensitivity
   * @param {number} [opts.tileW]       Tile pixel width
   * @param {number} [opts.mapW]        Chunk width (tiles)
   * @param {number} [opts.mapH]        Chunk height (tiles)
   * @param {number} [opts.mPerTile]    Real metres per tile
   */
  constructor(opts = {}) {
    this.zoom     = opts.zoom     ?? 0.14;
    this.tilt     = 0;
    this.tiltVel  = 0;
    this.rotation = opts.rotation ?? 0;
    this.rotVel   = 0;
    this.camX     = 0;
    this.camY     = 0;

    this.zoomMin   = opts.zoomMin   ?? 0.0005;
    this.zoomMax   = opts.zoomMax   ?? 3.5;
    this.zoomFlat  = opts.zoomFlat  ?? 0.18;
    this.zoomIso   = opts.zoomIso   ?? 0.58;
    this.zoomSpeed = opts.zoomSpeed ?? 0.0014;

    this.tileW    = opts.tileW   ?? 64;
    this.mapW     = opts.mapW    ?? 80;
    this.mapH     = opts.mapH    ?? 80;
    this.mPerTile = opts.mPerTile ?? 2;
  }

  /** Integrate tilt physics toward the target tilt for the current zoom. */
  updateTilt(dt) {
    const target  = zoomToTilt(this.zoom, this.zoomFlat, this.zoomIso);
    this.tiltVel += (target - this.tilt) * 9 * dt;
    this.tiltVel *= Math.pow(0.72, dt * 60);
    this.tilt     = Math.max(0, Math.min(1, this.tilt + this.tiltVel * dt));
  }

  /** Integrate rotation velocity and compensate camera position. */
  updateRotation(dt, pivotX, pivotY, worldToScreenFn) {
    if (Math.abs(this.rotVel) <= 0.0005) return;
    const oldRot = this.rotation;
    this.rotation  += this.rotVel * dt;
    this.rotVel    *= Math.pow(0.78, dt * 60);
    // Keep the pivot point fixed on screen
    if (pivotX != null && worldToScreenFn) {
      const o = worldToScreenFn(pivotX, pivotY, 0, { ...this, rotation: oldRot });
      const n = worldToScreenFn(pivotX, pivotY, 0, this);
      this.camX += n.x - o.x;
      this.camY += n.y - o.y;
    }
  }

  /** Apply a wheel / pinch zoom anchored to a screen point. */
  zoom_at(newZoom, ax, ay) {
    applyZoom(this, newZoom, ax, ay, this.zoomMin, this.zoomMax);
  }

  zoomIn (ax = 0, ay = 0) { this.zoom_at(this.zoom * 1.3, ax, ay); }
  zoomOut(ax = 0, ay = 0) { this.zoom_at(this.zoom / 1.3, ax, ay); }

  rotateLeft ()  { this.rotVel -= 1.2; }
  rotateRight()  { this.rotVel += 1.2; }

  /** Serialise camera state for save/restore. */
  serialize() {
    return { zoom: this.zoom, tilt: this.tilt, rotation: this.rotation, camX: this.camX, camY: this.camY };
  }

  restore(state) {
    Object.assign(this, state);
  }
}