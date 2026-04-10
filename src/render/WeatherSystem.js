/**
 * GOE Core — WeatherSystem
 *
 * All drawing goes through WorldRenderer.
 * WeatherSystem never touches CanvasRenderingContext2D directly.
 */
import { getElevOffset } from '../math/projection.js';

export class WeatherSystem {
  /**
   * @param {WorldRenderer} worldRenderer
   */
  constructor(worldRenderer) {
    this._wr = worldRenderer;

    this.particles  = [];
    this.mode       = 'none';
    this.wind       = { x: 0.05, y: 0.02 };
    this.flashAlpha = 0;
  }

  // Convenience accessors kept so internal helpers don't need _wr.cam everywhere
  get cam() { return this._wr.cam; }

  // ── Mode management ───────────────────────────────────────────────────────

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode       = mode;
    this.particles  = [];
    this.flashAlpha = 0;
    if (mode === 'none' || mode === 'cloudy') return;

    let count = 600;
    if (mode === 'rain' || mode === 'sand') count = 1000;
    if (mode === 'thunderstorm')            count = 1500;
    if (mode === 'fog')                     count = 150;

    for (let i = 0; i < count; i++) this.particles.push(this._createParticle());
  }

  _createParticle() {
    const isFog = this.mode === 'fog';
    return {
      tx:    (Math.random() - 0.5) * 100,
      ty:    (Math.random() - 0.5) * 100,
      tz:    Math.random() * 25 + (isFog ? 0 : 5),
      speed: isFog ? Math.random() * 2 + 1 : Math.random() * 20 + 15,
      size:  isFog ? Math.random() * 40 + 20 : Math.random() * 2 + 1.5,
    };
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt, playerX, playerY) {
    if (this.mode === 'none') return;

    if (this.mode === 'thunderstorm') {
      if (this.flashAlpha > 0) this.flashAlpha -= dt * 2;
      if (Math.random() < 0.005) this.flashAlpha = 0.6;
    }

    for (const p of this.particles) {
      p.tz -= p.speed * dt;
      p.tx += this.wind.x * dt;
      p.ty += this.wind.y * dt;

      if (p.tz < 0) {
        Object.assign(p, this._createParticle());
        p.tx += playerX;
        p.ty += playerY;
      }
    }
  }

  // ── Draw — called by RenderPipeline.flush() ───────────────────────────────

  draw() {
    if (this.mode === 'none') return;
    const { _wr: wr, cam } = this;
    const ctx = wr.ctx;
    const W   = ctx.canvas.width;
    const H   = ctx.canvas.height;

    // 1. Global overlays
    if (this.mode === 'cloudy' || this.mode === 'thunderstorm') {
      wr.fillRect(0, 0, W, H, 'rgba(0,0,20,0.2)');
    }
    if (this.flashAlpha > 0) {
      wr.fillRect(0, 0, W, H, `rgba(255,255,255,${this.flashAlpha})`);
    }

    // 2. Determine particle style
    const isLine   = (this.mode === 'rain' || this.mode === 'thunderstorm' || this.mode === 'sand');
    const isCircle = !isLine; // snow or fog

    const lineStyle   = this._lineStyle();
    const circleStyle = this._circleStyle();

    // 3. Draw particles
    for (const p of this.particles) {
      const elev = getElevOffset(p.tz * 8, cam.tilt, cam.zoom);
      const pos  = wr.worldToScreen(p.tx, p.ty, elev);

      if (pos.x < -100 || pos.x > W + 100 || pos.y < -100 || pos.y > H + 100) continue;

      if (isLine) {
        const length = (this.mode === 'sand' ? 10 : 25) * cam.zoom;
        wr.drawLine(
          pos.x,
          pos.y,
          pos.x + this.wind.x * 50,
          pos.y + length,
          lineStyle.color,
          lineStyle.width,
        );
      } else {
        const r = p.size * cam.zoom;
        if (this.mode === 'fog') {
          wr.drawCircle(pos.x, pos.y, r, circleStyle.fill);
        } else {
          // Snow — stroke circle
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = circleStyle.stroke;
          ctx.lineWidth   = 2;
          ctx.stroke();
        }
      }
    }
  }

  _lineStyle() {
    switch (this.mode) {
      case 'rain':
      case 'thunderstorm': return { color: 'rgba(200,220,255,0.6)', width: 1.2 };
      case 'sand':         return { color: 'rgba(194,178,128,0.7)', width: 1.5 };
      default:             return { color: 'rgba(255,255,255,0.9)', width: 2   };
    }
  }

  _circleStyle() {
    if (this.mode === 'fog')  return { fill: 'rgba(200,200,210,0.05)' };
    return { stroke: 'rgba(255,255,255,0.9)' }; // snow
  }
}