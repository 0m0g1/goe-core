import { worldToScreen, getElevOffset } from '../math/projection.js';

export class WeatherSystem {
  constructor(ctx, cam) {
    this.ctx = ctx;
    this.cam = cam;
    this.particles = [];
    this.mode = 'none'; 
    this.wind = { x: 0.05, y: 0.02 };
  }

  setMode(mode) {
    this.mode = mode;
    this.particles = [];
    if (mode === 'none') return;

    // INCREASED: 1200 particles for a thick downpour
    const count = mode === 'rain' ? 1200 : 600;
    for (let i = 0; i < count; i++) {
      this.particles.push(this._createParticle());
    }
  }

  _createParticle() {
    return {
      tx: (Math.random() - 0.5) * 80, // Slightly wider spawn area
      ty: (Math.random() - 0.5) * 80,
      tz: Math.random() * 25 + 5,    
      speed: Math.random() * 20 + 15, // Faster falling
      size: Math.random() * 2 + 1.5   // Thicker drops
    };
  }

  update(dt, playerX, playerY) {
    if (this.mode === 'none') return;

    for (let p of this.particles) {
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

  draw() {
    if (this.mode === 'none') return;

    const { ctx, cam } = this;
    
    // BOLDER COLORS: Higher alpha and brighter blue-white
    ctx.strokeStyle = this.mode === 'rain' ? 'rgba(200, 220, 255, 0.7)' : 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = this.mode === 'rain' ? 1.5 : 2.5; // Thicker lines
    ctx.lineCap = 'round';

    for (let p of this.particles) {
      const elev = getElevOffset(p.tz * 8, cam.tilt, cam.zoom);
      const pos = worldToScreen(p.tx, p.ty, elev, cam);

      if (pos.x < -20 || pos.x > ctx.canvas.width + 20 || pos.y < -20 || pos.y > ctx.canvas.height + 20) continue;

      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      
      if (this.mode === 'rain') {
        // LONGER STREAKS: Increased the multiplier from 10 to 25
        const length = 25 * cam.zoom;
        // The angle of the drop is affected by wind
        ctx.lineTo(pos.x + this.wind.x * 50, pos.y + length);
      } else {
        ctx.arc(pos.x, pos.y, p.size * cam.zoom, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
  }
}