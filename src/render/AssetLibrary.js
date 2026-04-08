/**
 * GOE Core — AssetLibrary
 * Pre-renders canvas sprites for all map feature types.
 * All sprites are 128×128 px, drawn once and cached.
 *
 * Usage:
 *   const lib = new AssetLibrary();
 *   const sprite = lib.get('bench');   // OffscreenCanvas or HTMLCanvasElement
 */

const SZ = 128;
const C  = SZ / 2;

function makeCanvas() {
  try { return new OffscreenCanvas(SZ, SZ); }
  catch { const c = document.createElement('canvas'); c.width = c.height = SZ; return c; }
}

// ─── Primitive helpers ────────────────────────────────────────────────────────

function circle(ctx, x, y, r, fill, stroke, sw = 2) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill)   { ctx.fillStyle   = fill;   ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
}

function rect(ctx, x, y, w, h, fill, stroke, sw = 1.5, r = 4) {
  ctx.beginPath(); ctx.roundRect?.(x, y, w, h, r) ?? ctx.rect(x, y, w, h);
  if (fill)   { ctx.fillStyle   = fill;   ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
}

function poly(ctx, pts, fill, stroke, sw = 1.5) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill)   { ctx.fillStyle   = fill;   ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
}

function glow(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color + 'cc'); g.addColorStop(1, color + '00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// ─── Individual sprite draw functions ────────────────────────────────────────

const DRAWERS = {

  // ── Amenities ──────────────────────────────────────────────────────────────

  bench(ctx) {
    // Seat slats
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(28, 52, 72, 10); ctx.fillRect(28, 64, 72, 10);
    // Legs
    ctx.fillStyle = '#6B5010';
    ctx.fillRect(32, 74, 8, 18); ctx.fillRect(88, 74, 8, 18);
    // Back rest
    ctx.fillStyle = '#A07820';
    ctx.fillRect(28, 34, 72, 8); ctx.fillRect(28, 44, 72, 8);
    // Back supports
    ctx.fillStyle = '#6B5010';
    ctx.fillRect(32, 34, 6, 28); ctx.fillRect(90, 34, 6, 28);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(C, 96, 36, 8, 0, 0, Math.PI * 2); ctx.fill();
  },

  waste_basket(ctx) {
    glow(ctx, C, C, 42, '#5a8a5a');
    // Body - trapezoidal bin
    poly(ctx, [[44,42],[84,42],[88,88],[40,88]], '#2d6e3a', '#1a4a25', 2);
    // Lid
    poly(ctx, [[38,38],[90,38],[84,42],[44,42]], '#3d8e4a', '#1a4a25', 2);
    // Lid knob
    circle(ctx, C, 34, 5, '#4aaa56', '#1a4a25', 1.5);
    // Recycle symbol (simplified)
    ctx.strokeStyle = '#7dcc88'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(C, 64, 14, -Math.PI*0.5, Math.PI*1.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(C+11, 58); ctx.lineTo(C+14, 52); ctx.lineTo(C+18, 58); ctx.stroke();
  },

  recycling(ctx) {
    glow(ctx, C, C, 42, '#4a7acc');
    poly(ctx, [[44,42],[84,42],[88,88],[40,88]], '#1a4a8e', '#0d2f5a', 2);
    poly(ctx, [[38,38],[90,38],[84,42],[44,42]], '#2a5aae', '#0d2f5a', 2);
    circle(ctx, C, 34, 5, '#3a6abe', '#0d2f5a', 1.5);
    // Blue recycling arrows
    ctx.strokeStyle = '#7aaaf0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    const a = (ang) => [C + 16*Math.cos(ang), 64 + 16*Math.sin(ang)];
    for (let i = 0; i < 3; i++) {
      const start = -Math.PI/2 + (i * 2*Math.PI/3);
      const end   = start + Math.PI*0.5;
      ctx.beginPath(); ctx.arc(C, 64, 16, start, end); ctx.stroke();
    }
  },

  drinking_water(ctx) {
    glow(ctx, C, C, 44, '#4ab0e0');
    // Tap post
    rect(ctx, 56, 50, 16, 42, '#7aaabf', '#3a7a9f', 2, 3);
    // Tap head
    rect(ctx, 46, 40, 36, 16, '#8ab8cf', '#3a7a9f', 2, 4);
    // Spout
    ctx.beginPath(); ctx.moveTo(C, 56); ctx.lineTo(C, 72); ctx.lineTo(C+14, 78);
    ctx.strokeStyle = '#8ab8cf'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();
    // Water drops
    ctx.fillStyle = '#4ab0e0aa';
    for (let i = 0; i < 4; i++) {
      const x = C+12 + (i%2)*6, y = 80+i*5;
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI*2); ctx.fill();
    }
    // Base
    rect(ctx, 44, 90, 40, 8, '#5a8aaa', '#2a5a7a', 2, 2);
  },

  toilets(ctx) {
    glow(ctx, C, C, 42, '#b0c8e8');
    // WC door outline
    rect(ctx, 34, 28, 60, 72, '#d8e8f8', '#6090c0', 2, 6);
    // Handle
    circle(ctx, 82, C, 5, '#6090c0', '#3060a0', 1.5);
    // Male/female symbols
    ctx.fillStyle = '#3060a0';
    ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('WC', C, C);
  },

  post_box(ctx) {
    glow(ctx, C, C, 42, '#e05050');
    // Box body
    rect(ctx, 36, 38, 56, 52, '#cc2222', '#8a1111', 2, 4);
    // Dome top
    ctx.beginPath(); ctx.arc(C, 38, 28, Math.PI, 0); ctx.fillStyle = '#dd3333'; ctx.fill();
    ctx.strokeStyle = '#8a1111'; ctx.lineWidth = 2; ctx.stroke();
    // Slot
    rect(ctx, 46, 52, 36, 6, '#6a0000', null, 0, 1);
    // Royal cypher (simplified crown)
    ctx.fillStyle = '#ffcc44';
    ctx.font = 'bold 14px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✉', C, 72);
  },

  telephone(ctx) {
    glow(ctx, C, C, 42, '#e0c840');
    rect(ctx, 36, 20, 56, 88, '#cc9900', '#886600', 2, 3);
    rect(ctx, 42, 24, 44, 60, '#ffe066', '#886600', 1.5, 2);
    ctx.fillStyle = '#cc9900';
    ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('☎', C, 62);
    rect(ctx, 44, 88, 40, 14, '#aa7700', '#664400', 1.5, 2);
  },

  // ── Food & Drink ───────────────────────────────────────────────────────────

  cafe(ctx) {
    glow(ctx, C, C, 48, '#c8843c');
    // Cup
    poly(ctx, [[42,52],[86,52],[80,88],[48,88]], '#e8c090', '#a06030', 2);
    // Handle
    ctx.beginPath(); ctx.arc(86, 70, 12, -Math.PI*0.5, Math.PI*0.5);
    ctx.strokeStyle = '#a06030'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();
    // Saucer
    ctx.beginPath(); ctx.ellipse(C, 90, 32, 7, 0, 0, Math.PI*2);
    ctx.fillStyle = '#d8b070'; ctx.fill();
    // Steam wisps
    ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    [[C-10, 42],[C, 38],[C+10, 42]].forEach(([x,y]) => {
      ctx.beginPath();
      ctx.moveTo(x, y+10); ctx.quadraticCurveTo(x-6, y+5, x, y); ctx.stroke();
    });
  },

  restaurant(ctx) {
    glow(ctx, C, C, 48, '#e05050');
    ctx.fillStyle = '#cc2222';
    // Fork
    [[C-16, 30],[C-20, 30],[C-20, 50],[C-18, 52],[C-18, 86],[C-14, 86],[C-14, 52],[C-12, 50],[C-12, 30]].reduce((a,b,i) => {
      if(i===0) ctx.moveTo(...b); else ctx.lineTo(...b); return b;
    });
    ctx.closePath(); ctx.fill();
    // Knife
    poly(ctx, [[C+14,30],[C+18,30],[C+20,52],[C+18,52],[C+18,86],[C+14,86],[C+14,52],[C+12,52]], '#cc2222', null);
    ctx.fillStyle = '#cc2222'; ctx.fill();
    // Plate
    circle(ctx, C+2, C+20, 24, null, '#cc222260', 3);
  },

  fast_food(ctx) {
    glow(ctx, C, C, 48, '#e0a020');
    // Burger bun top
    ctx.beginPath(); ctx.arc(C, 54, 32, Math.PI, 0); ctx.fillStyle = '#d4813a'; ctx.fill();
    ctx.strokeStyle = '#9a5520'; ctx.lineWidth = 2; ctx.stroke();
    // Sesame
    ctx.fillStyle = '#e8a060';
    [[C-10,44],[C+8,42],[C-2,38]].forEach(([x,y]) => { ctx.beginPath(); ctx.ellipse(x,y,4,2.5,0.3,0,Math.PI*2); ctx.fill(); });
    // Patty
    ctx.fillStyle = '#6b3318'; ctx.fillRect(30, 54, 68, 10);
    // Lettuce
    ctx.fillStyle = '#4a9a2a'; ctx.fillRect(28, 64, 72, 8);
    // Tomato
    ctx.fillStyle = '#cc2222'; ctx.fillRect(30, 72, 68, 6);
    // Bun bottom
    ctx.beginPath(); ctx.arc(C, 84, 28, 0, Math.PI); ctx.fillStyle = '#d4813a'; ctx.fill();
  },

  bar(ctx) {
    glow(ctx, C, C, 48, '#aa6622');
    // Beer mug body
    poly(ctx, [[38,44],[80,44],[76,90],[42,90]], '#e8c040', '#a07010', 2);
    // Handle
    ctx.beginPath(); ctx.arc(84, 64, 14, -Math.PI*0.5, Math.PI*0.5);
    ctx.strokeStyle = '#c09020'; ctx.lineWidth = 7; ctx.stroke();
    // Foam
    ctx.fillStyle = '#fffff0';
    ctx.beginPath(); ctx.ellipse(59, 44, 22, 10, 0, 0, Math.PI*2); ctx.fill();
    // Bubbles
    ctx.fillStyle = '#fff8d0aa';
    [[46,60],[52,72],[48,80]].forEach(([x,y]) => { ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); });
  },

  // ── Shopping ───────────────────────────────────────────────────────────────

  supermarket(ctx) {
    glow(ctx, C, C, 48, '#2a7acc');
    // Shopping cart
    ctx.strokeStyle = '#1a5aaa'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(28, 36); ctx.lineTo(38, 36); ctx.lineTo(46, 72); ctx.lineTo(84, 72); ctx.lineTo(88, 48); ctx.lineTo(40, 48);
    ctx.stroke();
    ctx.strokeStyle = '#1a5aaa'; ctx.lineWidth = 3;
    // Wheels
    circle(ctx, 50, 82, 8, '#2a7acc', '#1a5aaa', 2);
    circle(ctx, 78, 82, 8, '#2a7acc', '#1a5aaa', 2);
  },

  convenience(ctx) {
    glow(ctx, C, C, 48, '#e05080');
    // Store front
    rect(ctx, 24, 36, 80, 64, '#f0d0e0', '#c04060', 2, 3);
    // Awning
    rect(ctx, 20, 32, 88, 14, '#e03060', '#a01040', 2, 2);
    // Window
    rect(ctx, 34, 48, 30, 30, '#c8e8f8', '#6090b0', 1.5, 2);
    rect(ctx, 70, 48, 26, 30, '#c8e8f8', '#6090b0', 1.5, 2);
    // Door
    rect(ctx, 47, 70, 16, 28, '#d4c0cc', '#8060a0', 1.5, 2);
    // Sign
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SHOP', C, 40);
  },

  pharmacy(ctx) {
    glow(ctx, C, C, 48, '#22cc44');
    circle(ctx, C, C, 38, '#ffffff', '#00aa33', 3);
    // Green cross
    ctx.fillStyle = '#00aa33';
    ctx.fillRect(C-6, 44, 12, 40);
    ctx.fillRect(44, C-6, 40, 12);
    // Small pulse line
    ctx.strokeStyle = '#00aa33'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(36, C+18); ctx.lineTo(46, C+18); ctx.lineTo(52, C+8);
    ctx.lineTo(56, C+26); ctx.lineTo(60, C+14); ctx.lineTo(66, C+14);
    ctx.lineTo(72, C+18); ctx.lineTo(82, C+18);
    ctx.stroke();
  },

  clothes(ctx) {
    glow(ctx, C, C, 48, '#cc44cc');
    ctx.strokeStyle = '#882288'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Hanger hook
    ctx.beginPath(); ctx.arc(C, 28, 10, Math.PI*0.1, Math.PI*0.9); ctx.stroke();
    // Hanger arms
    ctx.beginPath();
    ctx.moveTo(C, 38); ctx.lineTo(C-34, 60); ctx.lineTo(C-34, 90);
    ctx.moveTo(C, 38); ctx.lineTo(C+34, 60); ctx.lineTo(C+34, 90);
    ctx.moveTo(C-34, 90); ctx.lineTo(C+34, 90);
    ctx.stroke();
  },

  // ── Health ─────────────────────────────────────────────────────────────────

  hospital(ctx) {
    glow(ctx, C, C, 52, '#ee2222');
    circle(ctx, C, C, 44, '#ffffff', '#cc0000', 3);
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(C-8, 40, 16, 48);
    ctx.fillRect(40, C-8, 48, 16);
  },

  doctors(ctx) {
    glow(ctx, C, C, 46, '#2244cc');
    rect(ctx, 30, 28, 68, 72, '#e8f0ff', '#2244cc', 2, 6);
    // Stethoscope
    ctx.strokeStyle = '#1133aa'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(C, 60, 18, 0, Math.PI); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(C-18, 60); ctx.lineTo(C-18, 40); ctx.arc(C-18, 36, 4, Math.PI*0.5, Math.PI*2.5);
    ctx.moveTo(C+18, 60); ctx.lineTo(C+18, 80); ctx.arc(C+18, 80, 6, 0, Math.PI*2);
    ctx.stroke();
  },

  // ── Education / Religion / Culture ─────────────────────────────────────────

  school(ctx) {
    glow(ctx, C, C, 48, '#e0a020');
    // Building
    rect(ctx, 22, 46, 84, 58, '#f8e8a0', '#c08800', 2, 2);
    // Roof
    poly(ctx, [[18,46],[C,20],[110,46]], '#d08800', '#a06000', 2);
    // Bell
    circle(ctx, C, 36, 7, '#e0c000', '#a09000', 1.5);
    // Windows
    [[36,56],[68,56],[36,76],[68,76]].forEach(([x,y]) => rect(ctx,x,y,16,14,'#c8e8ff','#6090c0',1.5,2));
    // Door
    rect(ctx, C-10, 80, 20, 24, '#c09050', '#805020', 1.5, 2);
  },

  library(ctx) {
    glow(ctx, C, C, 48, '#8866aa');
    // Book stack
    [[28,'#c05050'],[28+18,'#50a050'],[28+36,'#5050c0'],[28+54,'#c0a020']].forEach(([x,c],i) => {
      rect(ctx, x, 36+i*2, 16, 56-i*2, c, 'rgba(0,0,0,0.3)', 1.5, 1);
      // Pages line
      ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x+2, 38+i*2); ctx.lineTo(x+2, 88); ctx.stroke();
    });
    // Bookmark
    ctx.fillStyle = '#ffcc00';
    poly(ctx, [[88,30],[96,30],[96,52],[92,47],[88,52]], '#ffcc00', '#cc9900', 1);
  },

  place_of_worship(ctx) {
    glow(ctx, C, C, 48, '#ccaa44');
    // Building base
    rect(ctx, 32, 54, 64, 54, '#f0e8d0', '#b09050', 2, 2);
    // Tower
    rect(ctx, 50, 28, 28, 56, '#f0e8d0', '#b09050', 2, 2);
    // Cross
    ctx.fillStyle = '#8a6020';
    ctx.fillRect(C-3, 14, 6, 22); ctx.fillRect(C-10, 20, 20, 6);
    // Rose window (circular)
    circle(ctx, C, 42, 8, null, '#b09050', 1.5);
    circle(ctx, C, 42, 3, '#ccaa44', null);
    // Door arch
    ctx.beginPath(); ctx.arc(C, 76, 12, Math.PI, 0);
    ctx.lineTo(C+12, 100); ctx.lineTo(C-12, 100); ctx.closePath();
    ctx.fillStyle = '#c8b880'; ctx.fill();
  },

  // ── Transport ──────────────────────────────────────────────────────────────

  bus_stop(ctx) {
    glow(ctx, C, C, 44, '#4488cc');
    // Pole
    ctx.fillStyle = '#336699'; ctx.fillRect(C-3, 30, 6, 72);
    // Sign
    rect(ctx, C-24, 28, 48, 28, '#3366cc', '#1144aa', 2, 4);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('BUS', C, 42);
    // Timetable box
    rect(ctx, C-18, 60, 36, 28, '#f0f8ff', '#3366cc', 1.5, 2);
    ctx.fillStyle = '#336699'; ctx.font = '8px sans-serif';
    ['08:10','09:25','10:40'].forEach((t,i) => {
      ctx.textAlign = 'center'; ctx.fillText(t, C, 68+i*8);
    });
  },

  parking(ctx) {
    glow(ctx, C, C, 46, '#4466aa');
    rect(ctx, 24, 24, 80, 80, '#1a3a7a', '#0a2060', 2, 8);
    ctx.fillStyle = '#4488ee';
    ctx.font = 'bold 60px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('P', C+2, C+4);
  },

  fuel(ctx) {
    glow(ctx, C, C, 46, '#ee8822');
    // Pump body
    rect(ctx, 36, 38, 44, 60, '#cc6600', '#884400', 2, 4);
    // Display screen
    rect(ctx, 42, 44, 32, 16, '#111111', '#333333', 1.5, 2);
    ctx.fillStyle = '#00ff66'; ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center'; ctx.fillText('1.45', C+4, 55);
    // Hose
    ctx.strokeStyle = '#553300'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(80, 62); ctx.quadraticCurveTo(96, 72, 90, 88); ctx.stroke();
    // Nozzle
    rect(ctx, 82, 86, 16, 8, '#444444', '#222222', 1.5, 2);
  },

  // ── Parks & Nature ─────────────────────────────────────────────────────────

  park(ctx) {
    glow(ctx, C, C, 52, '#2a8a2a');
    // Ground
    circle(ctx, C, C+10, 40, '#3a9a3a', '#1a6a1a', 2);
    // Tree canopy (layered circles)
    circle(ctx, C, C-8, 28, '#2d8a1e', '#1a5a0e', 2);
    circle(ctx, C-14, C+2, 22, '#348c24', '#1a5a0e', 1.5);
    circle(ctx, C+14, C+2, 22, '#2e8820', '#1a5a0e', 1.5);
    circle(ctx, C, C-4, 24, '#3a9626', '#1a6a10', 2);
    // Trunk
    rect(ctx, C-5, C+16, 10, 20, '#6b4010', '#3a2000', 1.5, 2);
  },

  tree(ctx) {
    // Single deciduous tree
    glow(ctx, C, C, 44, '#2a8a2a');
    circle(ctx, C, C-6, 32, '#2a8a1a', '#1a5a0a', 2.5);
    circle(ctx, C-16, C+4, 20, '#348c24', null);
    circle(ctx, C+16, C+4, 20, '#308a22', null);
    circle(ctx, C, C-14, 22, '#3a9628', null);
    rect(ctx, C-5, C+22, 10, 22, '#6b4010', '#3a2000', 1.5, 2);
    circle(ctx, C, C+6, 10, '#1a4a0a66', null);
  },

  forest(ctx) {
    glow(ctx, C, C, 52, '#1a5a1a');
    // Multiple trees
    const trees = [[C-22, C+8, 20],[C+22, C+8, 20],[C, C-8, 26],[C-12, C+20, 16],[C+12, C+20, 16]];
    trees.forEach(([x,y,r]) => {
      circle(ctx, x, y, r, '#1e6a14', '#0e3a08', 1.5);
      circle(ctx, x, y-r*0.3, r*0.7, '#2a8020', null);
    });
    // Trunks
    [[C-22,C+28],[C+22,C+28],[C,C+18]].forEach(([x,y]) => {
      rect(ctx, x-3, y, 6, 12, '#5a3008', null, 0, 1);
    });
  },

  garden(ctx) {
    glow(ctx, C, C, 48, '#4aaa2a');
    // Flower bed
    ctx.fillStyle = '#8B4513';
    ctx.beginPath(); ctx.ellipse(C, C+20, 38, 18, 0, 0, Math.PI*2); ctx.fill();
    // Flowers
    const flowers = [[C-16,C+6,'#ee4444'],[C,C,'#eeaa00'],[C+16,C+6,'#ee44ee'],[C-8,C+18,'#ee6622'],[C+8,C+18,'#44aaee']];
    flowers.forEach(([x,y,c]) => {
      circle(ctx, x, y, 10, c, '#00000033', 1);
      circle(ctx, x, y, 5, '#ffff88', null);
    });
    // Path
    ctx.fillStyle = '#d4c090';
    ctx.beginPath(); ctx.ellipse(C, C+30, 12, 6, 0, 0, Math.PI*2); ctx.fill();
  },

  // ── Generic fallback ───────────────────────────────────────────────────────

  default(ctx, color = '#60a5fa') {
    glow(ctx, C, C, 44, color);
    circle(ctx, C, C, 28, color, 'rgba(0,0,0,0.4)', 2.5);
    circle(ctx, C, C, 10, 'rgba(255,255,255,0.9)', null);
  },
};

// ─── Library class ────────────────────────────────────────────────────────────

export class AssetLibrary {
  constructor() {
    this._cache = new Map();
  }

  /**
   * Get a pre-rendered sprite canvas for a given asset key.
   * @param {string} key   e.g. 'bench', 'pharmacy', 'cafe'
   * @param {string} [color]  Fallback colour for the default sprite
   * @returns {HTMLCanvasElement|OffscreenCanvas}
   */
  get(key, color) {
    const cacheKey = key + (color ?? '');
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const canvas = makeCanvas();
    const ctx    = canvas.getContext('2d');
    const draw   = DRAWERS[key] ?? ((c) => DRAWERS.default(c, color));
    draw(ctx, color);

    this._cache.set(cacheKey, canvas);
    return canvas;
  }

  /** Pre-warm a list of keys. */
  preload(keys) {
    keys.forEach(k => this.get(k));
  }

  /** Clear all cached sprites. */
  clear() { this._cache.clear(); }
}

export const ASSET_KEYS = Object.keys(DRAWERS).filter(k => k !== 'default');