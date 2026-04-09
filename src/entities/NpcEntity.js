class NPC extends Entity {
  constructor(id, tx, ty, dialogueTree) {
    super(id, ENTITY_TYPES.NPC, tx, ty);
    this.dialogue = dialogueTree;
    this.speed = 0.5;
    this.wanderTarget = null;
  }
  update(dt, engine) {
    if (!this.wanderTarget || Math.hypot(this.tx - this.wanderTarget.x, this.ty - this.wanderTarget.y) < 0.2) {
      this.wanderTarget = {
        x: this.tx + (Math.random() - 0.5) * 4,
        y: this.ty + (Math.random() - 0.5) * 4
      };
    }
    const dx = this.wanderTarget.x - this.tx;
    const dy = this.wanderTarget.y - this.ty;
    const len = Math.hypot(dx, dy);
    if (len > 0.01) {
      this.tx += (dx / len) * this.speed * dt;
      this.ty += (dy / len) * this.speed * dt;
    }
  }
  render(ctx, cam, groundElevPx, extra) {
    // draw a little person sprite
    const { x, y } = worldToScreen(this.tx+0.5, this.ty+0.5, groundElevPx + this.elevOffset, cam);
    ctx.fillStyle = '#f0c0a0';
    ctx.beginPath(); ctx.arc(x, y-4, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#40a0c0';
    ctx.fillRect(x-4, y-2, 8, 12);
  }
  onInteract(engine) {
    // show dialogue UI
    engine.emit('npc:talk', { npc: this, dialogue: this.dialogue });
  }
}