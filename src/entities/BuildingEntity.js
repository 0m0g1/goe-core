// src/entities/BuildingEntity.js
import { Entity, ENTITY_TYPES } from '../core/Entity.js';
import { worldToScreen, tileDepth, getElevOffset } from '../math/projection.js';

export class BuildingEntity extends Entity {
  constructor(id, tx, ty, footprintRadiusTiles, heightM, colorSet = null) {
    super(id, ENTITY_TYPES.BUILDING, tx, ty);
    this.footprintRadius = footprintRadiusTiles; // in tile units
    this.heightM = heightM;
    this.colorSet = colorSet;   // { top, right, left }
    this.bboxRadius = footprintRadiusTiles;
  }

  render(ctx, cam, groundElevPx, extra) {
    // use VoxelRenderer and facade decorator
    const vr = extra.voxelRenderer;
    const VU = 8;
    const rVox = this.footprintRadius * VU;
    const hVox = (this.heightM / extra.mPerTile) * VU;
    vr.beginTile(this.tx, this.ty, groundElevPx + this.elevOffset);
    vr.box(-rVox, 0, -rVox, rVox * 2, hVox, rVox * 2,
      this.colorSet?.top || '#b0a090',
      this.colorSet?.right || '#8a7a6a',
      this.colorSet?.left || '#6a5a4a'
    );
    if (extra.decorateFacade) {
      extra.decorateFacade(ctx, cam, this, vr);
    }
  }
}