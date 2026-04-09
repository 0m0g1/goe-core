// src/entities/FeatureEntity.js
import { Entity, ENTITY_TYPES } from '../core/Entity.js';
import { resolveFeatureType } from '../terrain/FeatureTypes.js';

export class FeatureEntity extends Entity {
  constructor(id, tx, ty, data = {}) {
    super(id, ENTITY_TYPES.FEATURE, tx, ty);
    this.data = data;
    this.label = data.label || data.title || data.name || '';
    this.color = data.color || '#60a5fa';
    this.ftype = resolveFeatureType(this.label, data.tags || {}, this.color);
    this.bboxRadius = 0.35;
  }

  render(ctx, cam, groundElevPx, extra) {
    extra.featureRenderer.drawFeature(this, extra.selectedId === this.id, extra.terrainCache, extra.pGX, extra.pGY);
  }
}