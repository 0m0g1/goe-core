/**
 * GOE Core — InputManager
 * Normalises keyboard, mouse, and touch input into a clean state object.
 * Fires callbacks for actions the Engine needs to respond to.
 */
import { EventEmitter } from './EventEmitter.js';

const LISTEN_KEYS = new Set([
  'w','a','s','d','q','e',
  'W','A','S','D','Q','E',
  'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
]);

export class InputManager extends EventEmitter {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @param {number} [opts.zoomSpeed]
   */
  constructor(canvas, opts = {}) {
    super();
    this.canvas     = canvas;
    this.zoomSpeed  = opts.zoomSpeed ?? 0.0014;
    this.keys       = new Set();
    this._drag      = null;   // left-drag pan
    this._rightDrag = null;   // right-drag rotate
    this._touches   = {};
    this._lastPinch = null;
    this._dragged   = false;

    this._bind();
  }

  // ── BIND / UNBIND ──────────────────────────────────────────────────────────

  _bind() {
    const c = this.canvas;

    this._onKD = e => { if (LISTEN_KEYS.has(e.key)) { this.keys.add(e.key); e.preventDefault(); } };
    this._onKU = e => this.keys.delete(e.key);
    window.addEventListener('keydown', this._onKD);
    window.addEventListener('keyup',   this._onKU);

    this._onWheel = e => {
      e.preventDefault();
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 32;
      if (e.deltaMode === 2) d *= 400;
      this.emit('wheel', { delta: d, x: e.clientX, y: e.clientY });
    };
    c.addEventListener('wheel', this._onWheel, { passive: false });

    // Mouse down
    this._onMD = e => {
      if (e.button === 2) {
        this._rightDrag = { lastX: e.clientX };
        e.preventDefault();
      } else if (e.button === 0) {
        this._drag    = { lastX: e.clientX, lastY: e.clientY, sx: e.clientX, sy: e.clientY };
        this._dragged = false;
      }
    };
    // Mouse move
    this._onMM = e => {
      if (this._rightDrag) {
        const dx = e.clientX - this._rightDrag.lastX;
        this._rightDrag.lastX = e.clientX;
        this.emit('rotate', { delta: dx * 0.008 });
      }
      if (this._drag) {
        const dx = e.clientX - this._drag.lastX;
        const dy = e.clientY - this._drag.lastY;
        this._drag.lastX = e.clientX; this._drag.lastY = e.clientY;
        if (Math.abs(e.clientX-this._drag.sx)>4 || Math.abs(e.clientY-this._drag.sy)>4)
          this._dragged = true;
        this.emit('pan', { dx, dy });
      }
      this.emit('mousemove', { x: e.clientX, y: e.clientY });
    };
    // Mouse up
    this._onMU = e => {
      if (e.button === 2) { this._rightDrag = null; }
      else if (e.button === 0) {
        if (!this._dragged) this.emit('click', { x: e.clientX, y: e.clientY, button: 0 });
        this._drag = null; this._dragged = false;
      }
    };
    this._onRC = e => {
      e.preventDefault();
      this.emit('click', { x: e.clientX, y: e.clientY, button: 2 });
    };
    this._onML = () => { this._drag = null; this._rightDrag = null; };

    c.addEventListener('mousedown',   this._onMD);
    c.addEventListener('mousemove',   this._onMM);
    c.addEventListener('mouseup',     this._onMU);
    c.addEventListener('contextmenu', this._onRC);
    c.addEventListener('mouseleave',  this._onML);

    // Touch
    this._onTS = e => {
      e.preventDefault();
      for (const t of e.changedTouches) this._touches[t.identifier] = { x: t.clientX, y: t.clientY };
    };
    this._onTM = e => {
      e.preventDefault();
      for (const t of e.changedTouches) this._touches[t.identifier] = { x: t.clientX, y: t.clientY };
      const ids = Object.keys(this._touches);
      if (ids.length === 2) {
        const a = this._touches[ids[0]], b = this._touches[ids[1]];
        const dist = Math.hypot(b.x-a.x, b.y-a.y);
        const cx = (a.x+b.x)/2, cy = (a.y+b.y)/2;
        if (this._lastPinch) this.emit('pinch', { dist, lastDist: this._lastPinch, cx, cy });
        this._lastPinch = dist;
      } else {
        this._lastPinch = null;
        if (ids.length === 1) {
          const id = ids[0];
          // single-finger pan
        }
      }
    };
    this._onTE = e => {
      for (const t of e.changedTouches) delete this._touches[t.identifier];
      if (Object.keys(this._touches).length < 2) this._lastPinch = null;
    };
    c.addEventListener('touchstart', this._onTS, { passive: false });
    c.addEventListener('touchmove',  this._onTM, { passive: false });
    c.addEventListener('touchend',   this._onTE, { passive: false });
  }

  // ── MOVEMENT VECTOR ────────────────────────────────────────────────────────

  /** Returns a normalised { dx, dy } movement direction from WASD/Arrow keys. */
  getMovementVector() {
    let dx = 0, dy = 0;
    if (this.keys.has('a') || this.keys.has('A') || this.keys.has('ArrowLeft'))  dx -= 1;
    if (this.keys.has('d') || this.keys.has('D') || this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('w') || this.keys.has('W') || this.keys.has('ArrowUp'))    dy -= 1;
    if (this.keys.has('s') || this.keys.has('S') || this.keys.has('ArrowDown'))  dy += 1;
    if (dx === 0 && dy === 0) return null;
    const len = Math.hypot(dx, dy);
    return { dx: dx/len, dy: dy/len };
  }

  isRotatingLeft()  { return this.keys.has('q') || this.keys.has('Q'); }
  isRotatingRight() { return this.keys.has('e') || this.keys.has('E'); }

  // ── DESTROY ────────────────────────────────────────────────────────────────

  destroy() {
    window.removeEventListener('keydown', this._onKD);
    window.removeEventListener('keyup',   this._onKU);
    const c = this.canvas;
    c.removeEventListener('wheel',       this._onWheel);
    c.removeEventListener('mousedown',   this._onMD);
    c.removeEventListener('mousemove',   this._onMM);
    c.removeEventListener('mouseup',     this._onMU);
    c.removeEventListener('contextmenu', this._onRC);
    c.removeEventListener('mouseleave',  this._onML);
    c.removeEventListener('touchstart',  this._onTS);
    c.removeEventListener('touchmove',   this._onTM);
    c.removeEventListener('touchend',    this._onTE);
    this.removeAllListeners();
  }
}