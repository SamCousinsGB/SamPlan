// units.js — real-world conversion + dual metric/imperial formatting.
// Geometry lives in grid cells; one cell is `plan.scale.cellMeters` metres.

const FT_PER_M = 3.280839895;
const IN_PER_M = 39.3700787;
const SQFT_PER_SQM = 10.7639104;

export function cellMeters(plan) {
  return plan?.scale?.cellMeters || 0.05;
}

export function cellsToM(plan, cells) {
  return cells * cellMeters(plan);
}

// Metres -> { ft, inch } with inches rounded; carries 12" up to a foot.
export function mToFtIn(m) {
  let totalIn = Math.round(m * IN_PER_M);
  let ft = Math.floor(totalIn / 12);
  let inch = totalIn - ft * 12;
  if (inch === 12) { ft += 1; inch = 0; }
  return { ft, inch };
}

// e.g. 13'9"
export function fmtFtIn(m) {
  const { ft, inch } = mToFtIn(m);
  return `${ft}'${inch}"`;
}

// e.g. 4.20m
export function fmtM(m) {
  return `${m.toFixed(2)}m`;
}

// Length of `cells` cells, formatted per plan.units. Default "dual".
export function fmtLen(plan, cells) {
  const m = cellsToM(plan, cells);
  const unit = plan?.units || "dual";
  if (unit === "m") return fmtM(m);
  if (unit === "ft") return fmtFtIn(m);
  return `${fmtM(m)} (${fmtFtIn(m)})`;
}

// "4.20m x 3.65m (13'9\" x 12'0\")" — Rightmove-style room dimensions.
export function fmtDims(plan, wCells, hCells) {
  const wM = cellsToM(plan, wCells);
  const hM = cellsToM(plan, hCells);
  const unit = plan?.units || "dual";
  if (unit === "m") return `${fmtM(wM)} x ${fmtM(hM)}`;
  if (unit === "ft") return `${fmtFtIn(wM)} x ${fmtFtIn(hM)}`;
  return `${fmtM(wM)} x ${fmtM(hM)}\n(${fmtFtIn(wM)} x ${fmtFtIn(hM)})`;
}

// Area of `areaCells` cells² formatted per plan.units.
export function fmtArea(plan, areaCells) {
  const m2 = areaCells * cellMeters(plan) * cellMeters(plan);
  const sqft = m2 * SQFT_PER_SQM;
  const unit = plan?.units || "dual";
  if (unit === "m") return `${m2.toFixed(1)} m²`;
  if (unit === "ft") return `${Math.round(sqft)} sq ft`;
  return `${m2.toFixed(1)} m² (${Math.round(sqft)} sq ft)`;
}

// Metres for a nice scale-bar segment given the current zoom; returns the
// metric length (in metres) that is a "round" number near `targetPx` pixels.
export function niceScaleMetres(metresPerPx) {
  const target = 120 * metresPerPx; // ~120px bar
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  for (const mult of [1, 2, 5, 10]) {
    if (pow * mult >= target) return pow * mult;
  }
  return pow * 10;
}
