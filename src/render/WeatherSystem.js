import { worldToScreen, getElevOffset } from '../math/projection.js';

export class WeatherSystem {
  constructor(ctx, cam) {
    this.ctx = ctx;
    this.cam = cam;
    this.particles = [];
    this.mode = 'none'; 
    this.wind = { x: 0.05, y: 0.02 };
    this.flashAlpha = 0; // For thunderstorms
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.particles = [];
    if (mode === 'none' || mode === 'cloudy') return;

    // Adjust particle density based on weather severity
    let count = 600;
    if (mode === 'rain' || mode === 'sand') count = 1000;
    if (mode === 'thunderstorm') count = 1500;
    if (mode === 'fog') count = 150; // Fewer but larger particles

    for (let i = 0; i < count; i++) {
      this.particles.push(this._createParticle());
    }
  }

  _createParticle() {
    const isFog = this.mode === 'fog';
    return {
      tx: (Math.random() - 0.5) * 100,
      ty: (Math.random() - 0.5) * 100,
      tz: Math.random() * 25 + (isFog ? 0 : 5),
      speed: isFog ? Math.random() * 2 + 1 : Math.random() * 20 + 15,
      size: isFog ? Math.random() * 40 + 20 : Math.random() * 2 + 1.5
    };
  }

  update(dt, playerX, playerY) {
    if (this.mode === 'none') return;

    // Handle Thunderstorm Flashes
    if (this.mode === 'thunderstorm') {
      if (this.flashAlpha > 0) this.flashAlpha -= dt * 2;
      if (Math.random() < 0.005) this.flashAlpha = 0.6; // Random lightning strike
    }

    for (let p of this.particles) {
      p.tz -= p.speed * dt;
      p.tx += this.wind.x * dt;
      p.ty += this.wind.y * dt;

      // Reset particles when they hit the ground (tz < 0)
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

    // 1. Draw Global Overlays (Clouds/Thunder/Fog base)
    if (this.mode === 'cloudy' || this.mode === 'thunderstorm') {
        ctx.fillStyle = `rgba(0, 0, 20, 0.2)`; // Dim the world
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    
    if (this.flashAlpha > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    // 2. Set Particle Styles
    this._setStyles(ctx);

    for (let p of this.particles) {
      const elev = getElevOffset(p.tz * 8, cam.tilt, cam.zoom);
      const pos = worldToScreen(p.tx, p.ty, elev, cam);

      if (pos.x < -100 || pos.x > ctx.canvas.width + 100 || pos.y < -100 || pos.y > ctx.canvas.height + 100) continue;

      if (this.mode === 'rain' || this.mode === 'thunderstorm' || this.mode === 'sand') {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        const length = (this.mode === 'sand' ? 10 : 25) * cam.zoom;
        ctx.lineTo(pos.x + this.wind.x * 50, pos.y + length);
        ctx.stroke();
      } else {
        // Snow or Fog (Circles)
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size * cam.zoom, 0, Math.PI * 2);
        if (this.mode === 'fog') ctx.fill();
        else ctx.stroke();
      }
    }
  }

  _setStyles(ctx) {
    switch (this.mode) {
      case 'rain':
      case 'thunderstorm':
        ctx.strokeStyle = 'rgba(200, 220, 255, 0.6)';
        ctx.lineWidth = 1.2;
        break;
      case 'snow':
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2;
        break;
      case 'fog':
        ctx.fillStyle = 'rgba(200, 200, 210, 0.05)';
        break;
      case 'sand':
        ctx.strokeStyle = 'rgba(194, 178, 128, 0.7)'; // Sandy beige
        ctx.lineWidth = 1.5;
        break;
    }
    ctx.lineCap = 'round';
  }
}