// src/core/Entity.js
import { worldToScreen, tileDepth } from '../math/projection.js';
import { geoToTile, tileToGeo } from '../math/geo.js';

export const ENTITY_TYPES = {
  PLAYER:    'player',
  BUILDING:  'building',
  FEATURE:   'feature',   // POI, event, generic point
  TREE:      'tree',
  VEHICLE:   'vehicle',
  NPC:       'npc',
  ANIMAL:    'animal',
  PLANT:     'plant',
};

export class Entity {
  /**
   * @param {string} id        Unique identifier
   * @param {string} type      One of ENTITY_TYPES
   * @param {number} tx        World tile X (local to current map centre)
   * @param {number} ty        World tile Y
   * @param {number} [elevOffset=0]   Additional Z offset (px, after ground elevation)
   */
  constructor(id, type, tx, ty, elevOffset = 0) {
    this.id = id;
    this.type = type;
    this.tx = tx;
    this.ty = ty;
    this.elevOffset = elevOffset;   // px, added to ground elevation
    this.bboxRadius = 0.4;          // tile units, for collision / picking
    this.visible = true;
    this._cache = {};               // renderer-specific cache
  }

  // ---- Position helpers -------------------------------------------------
  getPosition(geoCenter, mPerTile, mapW, mapH) {
    return { x: this.tx, y: this.ty };
  }

  getGeo(geoCenter, mPerTile, mapW, mapH) {
    return tileToGeo(this.tx, this.ty, geoCenter, mPerTile, mapW, mapH);
  }

  setGeo(lat, lon, geoCenter, mPerTile, mapW, mapH) {
    const pos = geoToTile(lat, lon, geoCenter, mPerTile, mapW, mapH);
    this.tx = pos.x;
    this.ty = pos.y;
  }

  // ---- Render -----------------------------------------------------------
  /**
   * Called by FeatureRenderer (or generic EntityRenderer) each frame.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} cam
   * @param {number} groundElevPx   Final elevation from terrain (px)
   * @param {object} extra          Optional frame data (weather, time, etc.)
   */
  render(ctx, cam, groundElevPx, extra = {}) {
    // Default: draw a simple coloured circle
    const { x, y } = worldToScreen(this.tx + 0.5, this.ty + 0.5, groundElevPx + this.elevOffset, cam);
    ctx.beginPath();
    ctx.arc(x, y, 8 * cam.zoom, 0, Math.PI * 2);
    ctx.fillStyle = this.color || '#888';
    ctx.fill();
    if (this.label) {
      ctx.fillStyle = 'white';
      ctx.font = '10px sans-serif';
      ctx.fillText(this.label, x - 10, y - 8);
    }
  }

  // ---- Update (AI, animation, movement) --------------------------------
  update(dt, engine) {
    // override in subclasses
  }

  // ---- Interaction -----------------------------------------------------
  onInteract(engine, screenX, screenY) {
    engine.emit('entity:interact', { entity: this, screenX, screenY });
  }

  // ---- Serialisation ---------------------------------------------------
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      tx: this.tx,
      ty: this.ty,
      elevOffset: this.elevOffset,
      // subclasses should call super.toJSON() and extend
    };
  }

  static fromJSON(data) {
    const e = new Entity(data.id, data.type, data.tx, data.ty, data.elevOffset);
    // restore any additional fields
    return e;
  }
}