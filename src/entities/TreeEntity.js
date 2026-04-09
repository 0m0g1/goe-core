// src/entities/TreeEntity.js
import { Entity, ENTITY_TYPES } from '../core/Entity.js';

export class TreeEntity extends Entity {
  constructor(id, tx, ty, treeType = 'deciduous', scale = 1.0, seed = 0) {
    super(id, ENTITY_TYPES.TREE, tx, ty);
    this.treeType = treeType;
    this.scale = scale;
    this.seed = seed;
    this.bboxRadius = 0.5;
  }

  render(ctx, cam, groundElevPx, extra) {
    extra.treeRenderer.drawTree(this.tx, this.ty, groundElevPx, {
      type: this.treeType,
      scale: this.scale,
      seed: this.seed,
    });
  }
}