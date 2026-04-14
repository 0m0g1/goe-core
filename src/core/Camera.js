/**
 * GOE Core — Camera
 *
 * CHUNKING REFACTOR
 * -----------------
 * Two new fields replace the old local-chunk origin maths:
 *
 *   focusX / focusY  — the global tile coordinate the camera is aimed at
 *                      (kept == playerEntity.tx / .ty every frame).
 *
 * worldToScreen() and screenToWorld() in projection.js now subtract
 * cam.focusX / cam.focusY instead of cam.mapW/2 and cam.mapH/2.
 * camX / camY remain pixel offsets (scroll nudge + rotation compensation).
 *
 * mapW / mapH are kept as the "render chunk tile radius" used by
 * TileRenderer and by the spatial-tree bounds calculation. They are no
 * longer the coordinate origin.
 */
import { zoomToTilt, applyZoom } from '../math/projection.js';

export class Camera {
  /**
   * @param {object} [opts]
   * @param {number} [opts.zoom]
   * @param {number} [opts.rotation]
   * @param {number} [opts.zoomMin]
   * @param {number} [opts.zoomMax]
   * @param {number} [opts.zoomFlat]   Tilt begins at this zoom
   * @param {number} [opts.zoomIso]    Full ISO tilt at this zoom
   * @param {number} [opts.zoomSpeed]  Wheel / pinch sensitivity
   * @param {number} [opts.tileW]      Tile pixel width (source art)
   * @param {number} [opts.mapW]       Render chunk width  (tiles)
   * @param {number} [opts.mapH]       Render chunk height (tiles)
   * @param {number} [opts.mPerTile]   Real metres per tile
   * @param {number} [opts.focusX]     Initial global tile focus X
   * @param {number} [opts.focusY]     Initial global tile focus Y
   */
  constructor(opts = {}) {
    this.zoom     = opts.zoom     ?? 0.14;
    this.tilt     = 0;
    this.tiltVel  = 0;
    this.rotation = opts.rotation ?? 0;
    this.rotVel   = 0;

    // Pixel scroll offset — (0,0) means the focus tile is at screen origin.
    // Set to (-canvas.width/2, -canvas.height/2) to centre the focus on screen.
    this.camX = 0;
    this.camY = 0;

    // Global tile coordinates the camera is centred on.
    // Updated every frame to track the player.
    this.focusX = opts.focusX ?? 0;
    this.focusY = opts.focusY ?? 0;

    this.zoomMin   = opts.zoomMin   ?? 0.0005;
    this.zoomMax   = opts.zoomMax   ?? 3.5;
    this.zoomFlat  = opts.zoomFlat  ?? 0.18;
    this.zoomIso   = opts.zoomIso   ?? 0.58;
    this.zoomSpeed = opts.zoomSpeed ?? 0.0014;

    this.tileW    = opts.tileW    ?? 64;
    this.mapW     = opts.mapW     ?? 80;   // render-chunk tile width
    this.mapH     = opts.mapH     ?? 80;   // render-chunk tile height
    this.mPerTile = opts.mPerTile ?? 2;
  }

  /** Integrate tilt physics toward the target tilt for the current zoom. */
  updateTilt(dt) {
    const target  = zoomToTilt(this.zoom, this.zoomFlat, this.zoomIso);
    this.tiltVel += (target - this.tilt) * 9 * dt;
    this.tiltVel *= Math.pow(0.72, dt * 60);
    this.tilt     = Math.max(0, Math.min(1, this.tilt + this.tiltVel * dt));
  }

  /**
   * Integrate rotation velocity and compensate camX/camY so the pivot
   * tile stays fixed on screen.
   *
   * @param {number} dt
   * @param {number} pivotX  Global tile X to keep fixed (usually player.tx)
   * @param {number} pivotY  Global tile Y to keep fixed (usually player.ty)
   * @param {Function} worldToScreenFn
   */
  updateRotation(dt, pivotX, pivotY, worldToScreenFn) {
    if (Math.abs(this.rotVel) <= 0.0005) return;
    const oldRot   = this.rotation;
    this.rotation += this.rotVel * dt;
    this.rotVel   *= Math.pow(0.78, dt * 60);
    if (pivotX != null && worldToScreenFn) {
      const o = worldToScreenFn(pivotX, pivotY, 0, { ...this, rotation: oldRot });
      const n = worldToScreenFn(pivotX, pivotY, 0, this);
      this.camX += n.x - o.x;
      this.camY += n.y - o.y;
    }
  }

  /** Zoom anchored to a screen point. */
  zoom_at(newZoom, ax, ay) {
    applyZoom(this, newZoom, ax, ay, this.zoomMin, this.zoomMax);
  }

  zoomIn (ax = 0, ay = 0) { this.zoom_at(this.zoom * 1.3, ax, ay); }
  zoomOut(ax = 0, ay = 0) { this.zoom_at(this.zoom / 1.3, ax, ay); }

  rotateLeft ()  { this.rotVel -= 1.2; }
  rotateRight()  { this.rotVel += 1.2; }

  serialize() {
    return {
      zoom: this.zoom, tilt: this.tilt,
      rotation: this.rotation,
      camX: this.camX, camY: this.camY,
      focusX: this.focusX, focusY: this.focusY,
    };
  }

  restore(state) { Object.assign(this, state); }
}