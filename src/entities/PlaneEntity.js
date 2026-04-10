import { Entity, ENTITY_TYPES } from './core/Entity.js';
import { Blueprints } from './assets/BluePrintLibrary.js';
import { tileDepth, getElevOffset } from './math/projection.js';
import { geoToTile } from './math/geo.js';

const MS_TO_TILES_PER_SEC = 1 / 111320 / 2 * 1e5; // rough: m/s → tiles/s

export class PlaneEntity extends Entity {
  constructor(id, tx, ty, data = {}) {
    super(id, ENTITY_TYPES.FEATURE, tx, ty); // reuse FEATURE type for now
    this.data        = data;
    this.label       = data.callsign || data.label || '';
    this.heading     = data.heading ?? 0;       // degrees, 0=north
    this.velocityMs  = data.velocity ?? 200;    // m/s
    this.altitudeM   = data.altitude ?? 1000;   // real metres
    this.visualAlt   = data.visualAlt ?? 20;    // engine elevation units
    this.solid       = false;
    this.physicsEnabled = false;
    this.bboxRadius  = 0;
    this._age        = 0; // seconds since last real position fix
  }

  update(dt, engine) {
    this._age += dt;

    // Dead-reckoning: move plane along heading at velocity
    // heading: 0=N, 90=E (aviation convention)
    const hdgRad = (this.heading - 90) * Math.PI / 180; // convert to math angle
    const speedTps = (this.velocityMs / 111320) / engine._mPerTile; // tiles per sec
    this.tx += Math.cos(hdgRad) * speedTps * dt;
    this.ty += Math.sin(hdgRad) * speedTps * dt;

    // Slowly drift off screen — no wraparound needed, engine re-fetches
  }

  render(wr, groundElevPx, extra) {
    const cam = wr.cam;

    // Visual altitude: scale visualAlt by zoom and tilt the same way ground elev works
    const altPx = this.visualAlt * cam.zoom * cam.tileW * cam.tilt * 0.5;
    const elev  = groundElevPx + altPx;
    const depth = tileDepth(this.tx, this.ty, cam.rotation) - 99999; // always on top

    wr.submitWorldObject(depth, () => {
      if (cam.tilt < 0.03) return;

      const blueprint = Blueprints['airplane_jet'] ?? Blueprints['tree']; // fallback
      const sc = wr.worldToScreen(this.tx + 0.5, this.ty + 0.5, elev);

      // Draw a simple plane icon if no blueprint available
      if (!Blueprints['airplane_jet']) {
        wr.ctx.save();
        wr.ctx.translate(sc.x, sc.y);
        wr.ctx.rotate((this.heading * Math.PI) / 180);
        wr.ctx.fillStyle = '#e0e0ff';
        wr.ctx.beginPath();
        wr.ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
        wr.ctx.fill();
        wr.ctx.restore();
      } else {
        wr.drawBlueprint(blueprint, this.tx, this.ty, elev);
      }

      // Altitude line — visual thread from ground to plane
      if (cam.zoom > 0.08) {
        const ground = wr.worldToScreen(this.tx + 0.5, this.ty + 0.5, groundElevPx);
        wr.drawLine(ground.x, ground.y, sc.x, sc.y, 'rgba(180,200,255,0.25)', 1);
        wr.drawCircle(ground.x, ground.y, 2, 'rgba(180,200,255,0.4)'); // ground shadow dot
      }

      // Label
      if (cam.zoom > 0.06 && this.label) {
        wr.drawLabel(sc.x, sc.y - 12, this.label, 'rgba(10,20,40,0.7)', '#a0cfff', 10);
      }
    });
  }
}