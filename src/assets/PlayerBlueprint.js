/**
 * GOE Core — PlayerBlueprint
 *
 * Draws the animated isometric humanoid explorer through the WorldRenderer
 * pipeline, replicating the original PlayerRenderer canvas drawing exactly.
 *
 * The character is drawn via direct 2D canvas calls (paths, ellipses, lines)
 * submitted inside a submitWorldObject callback — no voxel boxes are used,
 * preserving the original look, limb animation, eye rendering, and shoe
 * perspective that voxel boxes could not faithfully reproduce.
 */
import { tileDepth, worldToScreen, tileHalfHeight } from '../math/projection.js';

// ─── Visibility thresholds (match original PlayerRenderer exactly) ────────────
const HUMAN_HEIGHT_M  = 1.8;
const TILT_FADE_START = 0.10;
const TILT_FADE_END   = 0.25;

// ─── Palette (match original) ─────────────────────────────────────────────────
const skin     = '#f2cdab';
const skinSh   = '#d4ae8c';
const clothTop = '#e8f0e1';
const clothBot = '#d0d9c8';
const shoe     = '#a38465';
const hair     = '#e8b851';

// ─── Internal canvas drawing — mirrors PlayerRenderer.draw() exactly ──────────

/**
 * Performs all canvas drawing for one frame of the player character.
 * Called inside a submitWorldObject callback so it inherits the correct
 * depth-sort position from the WorldRenderer pipeline.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} cam      Camera (tilt, zoom, tileW, rotation)
 * @param {number} sx       Screen X of tile origin
 * @param {number} sy       Screen Y of tile origin
 * @param {object} player   { isMoving, walkCycle, faceAngle }
 * @param {number} mPerTile
 * @param {number} alpha    Fade-in alpha [0–1]
 */
function _drawPlayerCanvas(ctx, cam, sx, sy, player, mPerTile, alpha) {
  // ── Derived sizing (identical to original) ────────────────────────────────
  const playerTileH = HUMAN_HEIGHT_M / mPerTile;
  const ph  = playerTileH * tileHalfHeight(cam.tilt, cam.zoom, cam.tileW) * 2;
  const pw  = ph * 0.35;

  const headW = pw * 0.85, headH = pw * 0.95, torsoH = ph * 0.42;
  const ulH   = ph * 0.28, llH   = ph * 0.24;
  const uaH   = ph * 0.28, laH   = ph * 0.22;
  const lw    = pw * 0.28;

  ctx.globalAlpha = alpha;

  // ── Ground shadow ─────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.ellipse(sx, sy + pw * 0.12, pw * 0.65, pw * 0.18, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.fill();

  // ── Animation state (identical derivation to original) ───────────────────
  const bob   = player.isMoving
    ? Math.abs(Math.sin(-player.walkCycle * 2)) * ph * 0.06
    : 0;
  const cycle = -player.walkCycle;
  const lx    = Math.cos(player.faceAngle);
  const ly    = Math.sin(player.faceAngle);
  const side  = Math.abs(lx);

  const feetY  = sy;
  const hipY   = feetY - ulH - llH;
  const shouY  = hipY - torsoH;
  const headCY = shouY - headH * 0.55 - bob;

  // ── Leg drawing (identical to original drawLeg) ───────────────────────────
  const drawLeg = (isL) => {
    const ph2  = isL ? cycle : cycle + Math.PI;
    const sw   = player.isMoving ? Math.sin(ph2) : 0;
    const lift = player.isMoving ? Math.max(0, -Math.cos(ph2)) : 0;
    const hXO  = (isL ? -torsoH * 0.28 : torsoH * 0.28) * (1 - side * 0.5);
    const hX   = sx + hXO * pw / ph;
    const hY   = hipY - bob;
    const kX   = hX + sw * ulH * 0.75 * 0.5 * lx;
    const kY   = hY + ulH - lift * ulH * 0.35;
    const fX   = kX - lift * llH * 0.6 * 0.4 * lx + sw * ulH * 0.35 * lx;
    const fY   = Math.min(feetY, kY + llH - lift * llH * 0.4);

    ctx.lineCap    = 'round';
    ctx.lineJoin   = 'round';
    ctx.lineWidth  = lw * 1.35;
    ctx.strokeStyle = clothBot;
    ctx.beginPath();
    ctx.moveTo(hX, hY);
    ctx.lineTo(kX, kY);
    ctx.stroke();

    ctx.lineWidth  = lw * 1.1;
    ctx.strokeStyle = skinSh;
    ctx.beginPath();
    ctx.moveTo(kX, kY);
    ctx.lineTo(fX, fY);
    ctx.stroke();

    // Shoe
    const fW = pw * 0.38, fH = pw * 0.16;
    ctx.save();
    ctx.translate(fX, fY);
    ctx.scale((lx >= 0 ? 1 : -1) * Math.max(0.4, Math.abs(lx)), 1);
    ctx.fillStyle = shoe;
    ctx.beginPath();
    ctx.roundRect(-fW * 0.35, -fH, fW, fH, fH * 0.4);
    ctx.fill();
    ctx.restore();
  };

  // ── Arm drawing (identical to original drawArm) ───────────────────────────
  const drawArm = (isL) => {
    const ph2  = isL ? cycle + Math.PI : cycle;
    const sw   = player.isMoving ? Math.sin(ph2) * 0.65 : 0;
    const shXO = (isL ? -pw * 0.52 : pw * 0.52) * (1 - side * 0.4);
    const shX  = sx + shXO;
    const shY  = shouY - bob + torsoH * 0.08;
    const eX   = shX + sw * uaH * 0.55 * lx;
    const eY   = shY + uaH - Math.abs(sw) * uaH * 0.12;
    const hndX = eX + sw * laH * 0.4 * lx;
    const hndY = eY + laH;

    ctx.lineCap    = 'round';
    ctx.lineJoin   = 'round';
    ctx.lineWidth  = lw * 1.05;
    ctx.strokeStyle = skin;
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(eX, eY);
    ctx.stroke();

    ctx.lineWidth  = lw * 0.88;
    ctx.strokeStyle = isL ? skinSh : skin;
    ctx.beginPath();
    ctx.moveTo(eX, eY);
    ctx.lineTo(hndX, hndY);
    ctx.stroke();

    // Hand
    ctx.beginPath();
    ctx.arc(hndX, hndY, lw * 0.48, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();
  };

  // ── Body + head drawing (identical to original drawBody) ──────────────────
  const drawBody = () => {
    const bY = shouY - bob;

    // Torso
    ctx.beginPath();
    ctx.moveTo(sx - pw * 0.5, bY);
    ctx.lineTo(sx + pw * 0.5, bY);
    ctx.lineTo(sx + pw * 0.4, bY + torsoH);
    ctx.lineTo(sx - pw * 0.4, bY + torsoH);
    ctx.closePath();
    ctx.fillStyle = clothTop;
    ctx.fill();

    // Neck
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(sx, bY, pw * 0.16, torsoH * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    const hcX = sx + lx * pw * 0.1;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(hcX, headCY, headW * 0.5, headH * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(hcX, headCY - headH * 0.16, headW * 0.48, headH * 0.28, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Eyes (only when face is visible, i.e. not looking directly away)
    if (ly < 0.6) {
      const eR = Math.max(0.8, pw * 0.11);
      const eS = headW * 0.18;
      const eY = headCY - headH * 0.06;
      const eO = lx * headW * 0.1;

      // Whites
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(hcX - eS + eO, eY, eR * 1.2, eR, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hcX + eS + eO, eY, eR * 1.2, eR, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pupils
      const pO = lx * eR * 0.35;
      ctx.fillStyle = '#1a0d00';
      ctx.beginPath();
      ctx.arc(hcX - eS + eO + pO, eY, eR * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hcX + eS + eO + pO, eY, eR * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // ── Depth-sorted draw order (identical to original) ───────────────────────
  // bZ / sZ bias the draw order of limbs relative to the body so that the
  // correct arm/leg appears in front depending on the facing direction.
  const bZ = -ly * 10;
  const sZ = -lx * 24;

  [
    { z: bZ + sZ,       draw: () => drawArm(true)  },
    { z: bZ - sZ,       draw: () => drawArm(false) },
    { z: bZ + sZ * 0.6, draw: () => drawLeg(true)  },
    { z: bZ - sZ * 0.6, draw: () => drawLeg(false) },
    { z: 0,             draw: drawBody              },
  ]
    .sort((a, b) => a.z - b.z)
    .forEach(el => el.draw());

  ctx.globalAlpha = 1;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Submit the player character to the WorldRenderer's pipeline.
 *
 * Behaviour is visually identical to the original PlayerRenderer:
 *  - Fades in between TILT_FADE_START and TILT_FADE_END
 *  - Animated walking with leg lift, arm swing, head bob
 *  - Eyes with pupils that follow faceAngle
 *  - Perspective-scaled shoes
 *  - Ground shadow ellipse rendered just below the body
 *
 * @param {WorldRenderer} wr
 * @param {number}  wx            World tile X
 * @param {number}  wy            World tile Y
 * @param {number}  groundElevPx  Ground elevation in screen pixels
 * @param {object}  player        { isMoving, walkCycle, faceAngle, elevOffset? }
 * @param {number}  [mPerTile=2]
 */
export function drawPlayer(wr, wx, wy, groundElevPx, player, mPerTile = 2) {
  const { cam } = wr;
  if (cam.tilt < TILT_FADE_START) return;

  const alpha = Math.min(
    1,
    (cam.tilt - TILT_FADE_START) / (TILT_FADE_END - TILT_FADE_START),
  );

  const elev  = groundElevPx + (player.elevOffset ?? 0);
  const depth = tileDepth(wx, wy, cam.rotation);

  // Resolve screen position once — passed into the drawing function so it
  // doesn't need to call worldToScreen again inside the callback.
  const { x: sx, y: sy } = worldToScreen(wx, wy, elev, cam);

  wr.submitWorldObject(depth, () => {
    _drawPlayerCanvas(wr.ctx, cam, sx, sy, player, mPerTile, alpha);
  });
}