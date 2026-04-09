// ─────────────────────────────────────────────────────────────────────────────
// Entity system – base classes with physics support

import { geoToTile, tileToGeo } from "../math/geo.js";

// ─────────────────────────────────────────────────────────────────────────────
export const ENTITY_TYPES = {
  PLAYER:    'player',
  BUILDING:  'building',
  FEATURE:   'feature',
  TREE:      'tree',
  VEHICLE:   'vehicle',
  NPC:       'npc',
  ANIMAL:    'animal',
  PLANT:     'plant',
};

export class Entity {
  constructor(id, type, tx, ty, elevOffset = 0) {
    this.id = id;
    this.type = type;
    this.tx = tx;
    this.ty = ty;
    this.elevOffset = elevOffset;   // additional px above ground
    this.bboxRadius = 0.4;          // tile units (for manual collision checks)
    this.visible = true;

    // Physics properties (Yaphe)
    this.physicsEnabled = false;     // whether this entity participates in physics
    this.physicsRadius = 0.4;       // collision radius in tile units
    this.fixed = false;             // if true, particle is immovable
    this._particle = null;          // reference to Yaphe Particle2D
  }

  getGeo(geoCenter, mPerTile, mapW, mapH) {
    return tileToGeo(this.tx, this.ty, geoCenter, mPerTile, mapW, mapH);
  }

  setGeo(lat, lon, geoCenter, mPerTile, mapW, mapH) {
    const pos = geoToTile(lat, lon, geoCenter, mPerTile, mapW, mapH);
    this.tx = pos.x;
    this.ty = pos.y;
  }

  // Sync physics particle position back to entity
  syncPhysics() {
    if (this._particle) {
      this.tx = this._particle.position.x;
      this.ty = this._particle.position.y;
    }
  }

  // Remove physics particle from the world (call before removing entity)
  removePhysics(physicsWorld) {
    if (this._particle && physicsWorld) {
      const idx = physicsWorld.particles.indexOf(this._particle);
      if (idx !== -1) physicsWorld.particles.splice(idx, 1);
      // Also remove from quadtree? PhysicsWorld2D handles that in its update.
      this._particle = null;
    }
  }

  render(ctx, cam, groundElevPx, extra) {
    // fallback: coloured circle
    const { x, y } = worldToScreen(this.tx + 0.5, this.ty + 0.5, groundElevPx + this.elevOffset, cam);
    ctx.beginPath();
    ctx.arc(x, y, 6 * cam.zoom, 0, Math.PI * 2);
    ctx.fillStyle = this.color || '#888';
    ctx.fill();
  }

  update(dt, engine) {} // override in subclasses

  onInteract(engine, screenX, screenY) {
    engine.emit('entity:interact', { entity: this, screenX, screenY });
  }
}

