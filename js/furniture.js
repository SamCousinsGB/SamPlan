// furniture.js — UK-dimensioned furniture catalogue + black-and-white line-art
// symbols. Each item draws into a local box (0,0)-(w,h) in px; the caller sets
// stroke/fill and handles rotation. Dimensions are true UK sizes in millimetres.

// ---- low-level drawing helpers (assume ctx stroke/fill already set) ----
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function rect(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
}
function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function circle(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}
function ellipse(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
}

// ---- symbol drawers ----
// Beds: pillows at the "head" (top, the short edge), duvet fold line.
function drawBed(ctx, w, h) {
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  const pad = Math.min(w, h) * 0.08;
  const pillowH = h * 0.16;
  if (w > h * 0.62) {
    // double+: two pillows side by side
    const pw = (w - pad * 3) / 2;
    rrect(ctx, pad, pad, pw, pillowH, pillowH * 0.3); ctx.stroke();
    rrect(ctx, pad * 2 + pw, pad, pw, pillowH, pillowH * 0.3); ctx.stroke();
  } else {
    rrect(ctx, pad, pad, w - pad * 2, pillowH, pillowH * 0.3); ctx.stroke();
  }
  line(ctx, 0, pad * 2 + pillowH, w, pad * 2 + pillowH); // duvet fold
}

function drawWardrobe(ctx, w, h) {
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  line(ctx, w / 2, 0, w / 2, h);                 // door split
  const r = Math.min(w, h) * 0.04;
  circle(ctx, w / 2 - w * 0.06, h / 2, r); ctx.stroke();
  circle(ctx, w / 2 + w * 0.06, h / 2, r); ctx.stroke();
}

function drawUnit(ctx, w, h) {            // generic kitchen carcass
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  line(ctx, 0, h * 0.85, w, h * 0.85);   // worktop front lip
}

function drawSinkUnit(ctx, w, h) {
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  rrect(ctx, w * 0.1, h * 0.2, w * 0.55, h * 0.6, 4); ctx.stroke(); // bowl
  circle(ctx, w * 0.82, h * 0.25, Math.min(w, h) * 0.05); ctx.stroke(); // tap
}

function drawHob(ctx, w, h) {
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  const r = Math.min(w, h) * 0.16;
  circle(ctx, w * 0.3, h * 0.3, r); ctx.stroke();
  circle(ctx, w * 0.7, h * 0.3, r); ctx.stroke();
  circle(ctx, w * 0.3, h * 0.7, r); ctx.stroke();
  circle(ctx, w * 0.7, h * 0.7, r); ctx.stroke();
}

function drawOven(ctx, w, h) {
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  rect(ctx, w * 0.12, h * 0.18, w * 0.76, h * 0.64); ctx.stroke();
  line(ctx, w * 0.12, h * 0.32, w * 0.88, h * 0.32); // handle bar
}

function drawAppliance(ctx, w, h, letter) {
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.min(w, h) * 0.4}px system-ui, sans-serif`;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillText(letter, w / 2, h / 2);
  ctx.restore();
}

function drawBath(ctx, w, h) {
  rrect(ctx, 0, 0, w, h, Math.min(w, h) * 0.12); ctx.fill(); ctx.stroke();
  const inset = Math.min(w, h) * 0.12;
  // tub inset toward the far end (taps at the near short side = left)
  rrect(ctx, inset * 1.8, inset, w - inset * 2.6, h - inset * 2, Math.min(w, h) * 0.18);
  ctx.stroke();
  circle(ctx, inset * 0.9, h * 0.35, Math.min(w, h) * 0.05); ctx.stroke(); // tap
  circle(ctx, inset * 0.9, h * 0.65, Math.min(w, h) * 0.05); ctx.stroke(); // tap
  circle(ctx, w - inset * 1.3, h / 2, Math.min(w, h) * 0.04); ctx.stroke(); // plug
}

function drawShower(ctx, w, h) {
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  line(ctx, 0, 0, w, h);           // diagonal
  line(ctx, w, 0, 0, h);           // diagonal -> tray
  circle(ctx, w / 2, h / 2, Math.min(w, h) * 0.06); ctx.stroke(); // drain
}

function drawBasin(ctx, w, h) {
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  ellipse(ctx, w / 2, h * 0.55, w * 0.36, h * 0.32); ctx.stroke();
  circle(ctx, w / 2, h * 0.16, Math.min(w, h) * 0.06); ctx.stroke(); // tap
}

function drawWC(ctx, w, h) {
  rect(ctx, w * 0.1, 0, w * 0.8, h * 0.22); ctx.fill(); ctx.stroke(); // cistern
  ellipse(ctx, w / 2, h * 0.6, w * 0.32, h * 0.34); ctx.fill(); ctx.stroke(); // bowl
}

function drawSofa(ctx, w, h) {
  rrect(ctx, 0, 0, w, h, Math.min(w, h) * 0.12); ctx.fill(); ctx.stroke();
  const back = h * 0.22, arm = w * 0.12;
  line(ctx, 0, back, w, back);                 // backrest
  line(ctx, arm, back, arm, h);                // left arm
  line(ctx, w - arm, back, w - arm, h);        // right arm
  // seat cushion divisions
  const seats = w > h * 1.9 ? 3 : 2;
  for (let i = 1; i < seats; i++) {
    const x = arm + ((w - arm * 2) / seats) * i;
    line(ctx, x, back, x, h);
  }
}

function drawArmchair(ctx, w, h) {
  rrect(ctx, 0, 0, w, h, Math.min(w, h) * 0.14); ctx.fill(); ctx.stroke();
  const back = h * 0.24, arm = w * 0.18;
  line(ctx, 0, back, w, back);
  line(ctx, arm, back, arm, h);
  line(ctx, w - arm, back, w - arm, h);
}

function drawTable(ctx, w, h) {
  rrect(ctx, 0, 0, w, h, Math.min(w, h) * 0.08); ctx.fill(); ctx.stroke();
}

function drawTVUnit(ctx, w, h) {
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  line(ctx, w * 0.5, 0, w * 0.5, h);
}

function drawDoor(ctx, w, h) {
  // hinge at bottom-left, leaf opens up; swing arc radius = leaf length
  const r = Math.min(w, h);
  line(ctx, 0, h, 0, h - r);             // open leaf
  ctx.beginPath();
  ctx.arc(0, h, r, -Math.PI / 2, 0);     // swing arc
  ctx.stroke();
}

function drawWindow(ctx, w, h) {
  rect(ctx, 0, h * 0.3, w, h * 0.4); ctx.fill(); ctx.stroke();
  line(ctx, 0, h * 0.5, w, h * 0.5);     // glazing line
}

function drawStairs(ctx, w, h) {
  rect(ctx, 0, 0, w, h); ctx.stroke();
  const steps = 8;
  const horiz = w > h;
  for (let i = 1; i < steps; i++) {
    if (horiz) line(ctx, (w / steps) * i, 0, (w / steps) * i, h);
    else line(ctx, 0, (h / steps) * i, w, (h / steps) * i);
  }
  // direction arrow (up)
  ctx.save();
  if (horiz) { line(ctx, w * 0.1, h / 2, w * 0.9, h / 2);
    line(ctx, w * 0.9, h / 2, w * 0.78, h * 0.38);
    line(ctx, w * 0.9, h / 2, w * 0.78, h * 0.62); }
  else { line(ctx, w / 2, h * 0.9, w / 2, h * 0.1);
    line(ctx, w / 2, h * 0.1, w * 0.38, h * 0.22);
    line(ctx, w / 2, h * 0.1, w * 0.62, h * 0.22); }
  ctx.restore();
}

function drawGeneric(ctx, w, h) {
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
}

function drawChair(ctx, w, h) {
  rrect(ctx, 0, 0, w, h, Math.min(w, h) * 0.16); ctx.fill(); ctx.stroke();
  line(ctx, w * 0.14, h * 0.28, w * 0.86, h * 0.28); // backrest
}
function drawRound(ctx, w, h) {           // round table / stool / pouffe
  ellipse(ctx, w / 2, h / 2, w / 2, h / 2); ctx.fill(); ctx.stroke();
}
function drawDesk(ctx, w, h) {
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  rect(ctx, w * 0.64, h * 0.12, w * 0.28, h * 0.76); ctx.stroke();  // drawer pedestal
  line(ctx, w * 0.64, h * 0.5, w * 0.92, h * 0.5);
}
function drawShelf(ctx, w, h) {           // bookcase — vertical dividers
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  const n = Math.max(2, Math.round(w / h));
  for (let i = 1; i < n; i++) line(ctx, (w / n) * i, 0, (w / n) * i, h);
}
function drawDrawers(ctx, w, h) {         // chest of drawers / sideboard
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  const n = 3;
  for (let i = 1; i < n; i++) line(ctx, 0, (h / n) * i, w, (h / n) * i);
  for (let i = 0; i < n; i++) { circle(ctx, w / 2, (h / n) * (i + 0.5), Math.min(w, h) * 0.045); ctx.stroke(); }
}
function drawLSofa(ctx, w, h) {           // corner / L-shaped sofa
  const t = Math.min(w, h) * 0.55;
  ctx.beginPath();
  ctx.moveTo(0, h - t); ctx.lineTo(w - t, h - t); ctx.lineTo(w - t, 0);
  ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fill(); ctx.stroke();
}
function drawRange(ctx, w, h) {           // range cooker
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  const r = Math.min(w, h) * 0.11;
  for (const cx of [0.25, 0.5, 0.75]) for (const cy of [0.3, 0.7]) { circle(ctx, w * cx, h * cy, r); ctx.stroke(); }
}
function drawRail(ctx, w, h) {            // towel rail / radiator
  rect(ctx, 0, 0, w, h); ctx.stroke();
  const horiz = w >= h, n = 4;
  for (let i = 1; i < n; i++) {
    if (horiz) line(ctx, 0, (h / n) * i, w, (h / n) * i);
    else line(ctx, (w / n) * i, 0, (w / n) * i, h);
  }
}
function drawPlant(ctx, w, h) {
  ellipse(ctx, w / 2, h / 2, w / 2, h / 2); ctx.stroke();
  circle(ctx, w / 2, h / 2, Math.min(w, h) * 0.2); ctx.fill(); ctx.stroke();
}
function drawRug(ctx, w, h) {
  ctx.save();
  ctx.setLineDash([Math.min(w, h) * 0.09, Math.min(w, h) * 0.06]);
  rrect(ctx, 0, 0, w, h, Math.min(w, h) * 0.05); ctx.stroke();
  ctx.restore();
}
function drawPiano(ctx, w, h) {
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  line(ctx, 0, h * 0.68, w, h * 0.68); // keyboard
}
function drawCot(ctx, w, h) {
  rect(ctx, 0, 0, w, h); ctx.fill(); ctx.stroke();
  const n = Math.max(4, Math.round(w / (h * 0.18)));
  for (let i = 1; i < n; i++) line(ctx, (w / n) * i, h * 0.12, (w / n) * i, h * 0.88);
}
function drawCar(ctx, w, h) {
  const vert = h >= w;
  rrect(ctx, w * 0.04, h * 0.02, w * 0.92, h * 0.96, Math.min(w, h) * 0.14); ctx.stroke();
  // windscreen band across the short axis
  if (vert) { line(ctx, w * 0.04, h * 0.3, w * 0.96, h * 0.3); line(ctx, w * 0.04, h * 0.72, w * 0.96, h * 0.72); }
  else { line(ctx, w * 0.3, h * 0.04, w * 0.3, h * 0.96); line(ctx, w * 0.72, h * 0.04, w * 0.72, h * 0.96); }
}

// ---- catalogue (id -> definition). wmm × hmm at rotation 0. ----
const APP = (letter) => (c, w, h) => drawAppliance(c, w, h, letter);

const ITEMS = [
  // Bedroom
  ["bed-single", "Single bed", "Bedroom", 900, 1900, drawBed],
  ["bed-smalldouble", "Small double", "Bedroom", 1200, 1900, drawBed],
  ["bed-double", "Double bed", "Bedroom", 1350, 1900, drawBed],
  ["bed-king", "King bed", "Bedroom", 1500, 2000, drawBed],
  ["bed-superking", "Super king", "Bedroom", 1800, 2000, drawBed],
  ["bunk", "Bunk bed", "Bedroom", 900, 1900, drawBed],
  ["cot", "Cot", "Bedroom", 700, 1300, drawCot],
  ["wardrobe", "Wardrobe", "Bedroom", 600, 600, drawWardrobe],
  ["wardrobe-2", "Double wardrobe", "Bedroom", 1200, 600, drawWardrobe],
  ["wardrobe-3", "Triple wardrobe", "Bedroom", 1800, 600, drawWardrobe],
  ["drawers", "Chest of drawers", "Bedroom", 800, 450, drawDrawers],
  ["dressing", "Dressing table", "Bedroom", 1200, 450, drawDesk],
  ["bedside", "Bedside table", "Bedroom", 400, 400, drawTable],
  ["ottoman", "Blanket box", "Bedroom", 1000, 450, drawTable],

  // Living
  ["sofa-2", "2-seat sofa", "Living", 1500, 900, drawSofa],
  ["sofa-3", "3-seat sofa", "Living", 2000, 900, drawSofa],
  ["sofa-4", "4-seat sofa", "Living", 2500, 950, drawSofa],
  ["sofa-corner", "Corner sofa", "Living", 2400, 1800, drawLSofa],
  ["chaise", "Chaise sofa", "Living", 1800, 950, drawSofa],
  ["armchair", "Armchair", "Living", 900, 900, drawArmchair],
  ["recliner", "Recliner", "Living", 950, 1000, drawArmchair],
  ["coffee", "Coffee table", "Living", 1100, 600, drawTable],
  ["coffee-round", "Round coffee table", "Living", 800, 800, drawRound],
  ["tv", "TV unit", "Living", 1200, 400, drawTVUnit],
  ["sideboard", "Sideboard", "Living", 1600, 450, drawDrawers],
  ["bookcase", "Bookcase", "Living", 900, 300, drawShelf],
  ["console", "Console table", "Living", 1100, 350, drawTable],
  ["pouffe", "Pouffe", "Living", 600, 600, drawRound],
  ["fireplace", "Fireplace", "Living", 1300, 350, drawGeneric],
  ["piano", "Upright piano", "Living", 1500, 600, drawPiano],
  ["plant", "Plant", "Living", 500, 500, drawPlant],
  ["rug-l", "Rug (large)", "Living", 2300, 1600, drawRug],
  ["rug-m", "Rug (medium)", "Living", 1700, 1200, drawRug],

  // Dining
  ["dining-4", "Dining table (4)", "Dining", 1200, 800, drawTable],
  ["dining-6", "Dining table (6)", "Dining", 1800, 900, drawTable],
  ["dining-8", "Dining table (8)", "Dining", 2200, 1000, drawTable],
  ["dining-round", "Round dining table", "Dining", 1200, 1200, drawRound],
  ["dining-chair", "Dining chair", "Dining", 450, 500, drawChair],
  ["bar-stool", "Bar stool", "Dining", 400, 400, drawRound],
  ["bench", "Dining bench", "Dining", 1200, 350, drawTable],

  // Kitchen
  ["unit-300", "Base unit 300", "Kitchen", 300, 600, drawUnit],
  ["unit-400", "Base unit 400", "Kitchen", 400, 600, drawUnit],
  ["unit-500", "Base unit 500", "Kitchen", 500, 600, drawUnit],
  ["unit-600", "Base unit 600", "Kitchen", 600, 600, drawUnit],
  ["unit-1000", "Base unit 1000", "Kitchen", 1000, 600, drawUnit],
  ["island", "Kitchen island", "Kitchen", 1800, 900, drawUnit],
  ["larder", "Larder unit", "Kitchen", 600, 600, drawUnit],
  ["sink", "Sink unit", "Kitchen", 1000, 600, drawSinkUnit],
  ["hob", "Hob", "Kitchen", 600, 520, drawHob],
  ["oven", "Oven", "Kitchen", 600, 600, drawOven],
  ["range", "Range cooker", "Kitchen", 900, 600, drawRange],
  ["extractor", "Extractor", "Kitchen", 600, 300, drawGeneric],
  ["fridge", "Fridge/freezer", "Kitchen", 600, 650, APP("F")],
  ["fridge-american", "American fridge", "Kitchen", 900, 700, APP("F")],
  ["dishwasher", "Dishwasher", "Kitchen", 600, 600, APP("DW")],
  ["washer", "Washing machine", "Kitchen", 600, 600, APP("W")],
  ["dryer", "Tumble dryer", "Kitchen", 600, 600, APP("TD")],
  ["microwave", "Microwave", "Kitchen", 500, 320, APP("M")],

  // Bathroom
  ["bath", "Bath", "Bathroom", 1700, 700, drawBath],
  ["bath-corner", "Corner bath", "Bathroom", 1500, 1500, drawBath],
  ["shower", "Shower", "Bathroom", 900, 900, drawShower],
  ["shower-800", "Shower 800", "Bathroom", 800, 800, drawShower],
  ["basin", "Basin", "Bathroom", 550, 450, drawBasin],
  ["vanity", "Vanity unit", "Bathroom", 1200, 500, drawBasin],
  ["wc", "WC", "Bathroom", 500, 700, drawWC],
  ["bidet", "Bidet", "Bathroom", 400, 600, drawWC],
  ["towel-rail", "Towel rail", "Bathroom", 600, 150, drawRail],

  // Office
  ["desk", "Desk", "Office", 1400, 700, drawDesk],
  ["desk-corner", "Corner desk", "Office", 1600, 1200, drawDesk],
  ["office-chair", "Office chair", "Office", 600, 600, drawRound],
  ["filing", "Filing cabinet", "Office", 450, 600, drawDrawers],
  ["bookshelf", "Bookshelf", "Office", 900, 300, drawShelf],

  // Outdoor
  ["patio-table", "Patio table", "Outdoor", 1400, 800, drawTable],
  ["patio-round", "Round patio table", "Outdoor", 1200, 1200, drawRound],
  ["garden-bench", "Garden bench", "Outdoor", 1500, 500, drawTable],
  ["bbq", "BBQ", "Outdoor", 1200, 600, drawGeneric],
  ["shed", "Shed", "Outdoor", 1800, 1200, drawGeneric],
  ["car", "Car / parking", "Outdoor", 1800, 4500, drawCar],

  // Structure
  ["door", "Door", "Structure", 762, 762, drawDoor],
  ["door-double", "Double door", "Structure", 1500, 1500, drawDoor],
  ["window", "Window", "Structure", 1200, 150, drawWindow],
  ["radiator", "Radiator", "Structure", 1000, 150, drawRail],
  ["stairs", "Stairs", "Structure", 900, 2400, drawStairs],
  ["column", "Column", "Structure", 300, 300, drawRound],
];

export const catalogue = Object.fromEntries(
  ITEMS.map(([id, name, category, wmm, hmm, draw]) => [
    id, { id, name, category, wmm, hmm, draw: draw || drawGeneric },
  ])
);

export const CATEGORIES = ["Bedroom", "Living", "Dining", "Kitchen", "Bathroom", "Office", "Outdoor", "Structure"];

export function itemsByCategory(cat) {
  return ITEMS.filter((i) => i[2] === cat).map((i) => catalogue[i[0]]);
}

// Footprint of a placed furniture item in grid cells, accounting for the item's
// own scale (set by resizing) and its rotation.
export function furnitureCells(plan, item) {
  const def = catalogue[item.kind];
  if (!def) return { w: 1, h: 1, def: null };
  const cm = plan.scale.cellMeters;
  const wC = (def.wmm / 1000 / cm) * (item.scaleX || 1);
  const hC = (def.hmm / 1000 / cm) * (item.scaleY || 1);
  const rotated = ((item.rot || 0) / 90) % 2 !== 0;
  return { w: rotated ? hC : wC, h: rotated ? wC : hC, def };
}
