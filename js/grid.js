// grid.js — coordinate math between screen pixels and grid cells, snapping,
// hit-testing and clamping. All "world" units are grid cells (integers in the model);
// screen units are CSS pixels relative to the canvas.

// Effective pixel size of one cell on screen.
export function cellPx(plan) {
  return plan.grid.cell * plan.view.zoom;
}

// Grid-cell coords -> screen pixels.
export function cellsToPx(plan, cx, cy) {
  const s = cellPx(plan);
  return {
    x: plan.view.panX + cx * s,
    y: plan.view.panY + cy * s,
  };
}

// Screen pixels -> fractional grid-cell coords.
export function pxToCells(plan, px, py) {
  const s = cellPx(plan);
  return {
    x: (px - plan.view.panX) / s,
    y: (py - plan.view.panY) / s,
  };
}

// Snap a fractional cell coord to the nearest whole cell.
export function snap(v) {
  return Math.round(v);
}

// Adaptive snap step (in cells), chosen from "nice" real-world increments so the
// on-screen snap spacing stays comfortable: coarse when zoomed out (e.g. 0.5 m),
// fine when zoomed in (down to 0.05 m). Every option is a whole number of cells,
// which keeps room/property geometry on the integer lattice that wall-tracing needs.
export function snapStep(plan) {
  const cm = plan?.scale?.cellMeters || 0.05;
  const s = cellPx(plan);
  if (!s) return 1;
  const targetM = 26 / (s / cm);                  // metres ≈ 26px on screen
  const stepsM = [cm, 0.1, 0.25, 0.5, 1, 2, 5, 10];
  let chosen = stepsM[stepsM.length - 1];
  for (const m of stepsM) { if (m >= targetM - 1e-9) { chosen = m; break; } }
  return Math.max(1, Math.round(chosen / cm));    // cells
}

// Finer snap for furniture (which needn't sit on the integer lattice) so small
// pieces — doors, windows — can be positioned and resized precisely. Still
// adaptive: coarse when zoomed out, down to 25 mm when zoomed in.
export function snapStepFine(plan) {
  const cm = plan?.scale?.cellMeters || 0.05;
  const s = cellPx(plan);
  if (!s) return 1;
  const targetM = 11 / (s / cm);
  const stepsM = [cm / 2, cm, 0.1, 0.25, 0.5, 1];
  let chosen = stepsM[stepsM.length - 1];
  for (const m of stepsM) { if (m >= targetM - 1e-9) { chosen = m; break; } }
  return chosen / cm;                              // cells (may be 0.5)
}

// Snap a fractional cell coord to the nearest multiple of `step` cells.
export function snapTo(v, step) {
  if (!step) return Math.round(v);
  return Math.round(v / step) * step;
}

// Clamp a box rect (in cells) to stay within the floor bounds. Preserves size
// where possible; if the box is larger than the floor it is pinned to 0.
export function clampBoxToFloor(box, floor) {
  const w = Math.min(box.w, floor.w);
  const h = Math.min(box.h, floor.h);
  const x = Math.min(Math.max(0, box.x), floor.w - w);
  const y = Math.min(Math.max(0, box.y), floor.h - h);
  return { ...box, x, y, w, h };
}

// Topmost box at a given cell coord (iterate last-drawn-first = topmost).
export function boxAt(boxes, cx, cy) {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.h) return b;
  }
  return null;
}

// Resize-handle hit testing. Returns a handle id ("nw","n","ne","e","se","s","sw","w")
// if the screen point is within `tol` px of one of the box's 8 handles, else null.
export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function handlePoints(plan, box) {
  const a = cellsToPx(plan, box.x, box.y);
  const b = cellsToPx(plan, box.x + box.w, box.y + box.h);
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  return {
    nw: { x: a.x, y: a.y },
    n: { x: midX, y: a.y },
    ne: { x: b.x, y: a.y },
    e: { x: b.x, y: midY },
    se: { x: b.x, y: b.y },
    s: { x: midX, y: b.y },
    sw: { x: a.x, y: b.y },
    w: { x: a.x, y: midY },
  };
}

export function handleAt(plan, box, px, py, tol = 8) {
  const pts = handlePoints(plan, box);
  for (const id of HANDLES) {
    const p = pts[id];
    if (Math.abs(px - p.x) <= tol && Math.abs(py - p.y) <= tol) return id;
  }
  return null;
}

// CSS cursor for a given handle id.
export function handleCursor(id) {
  switch (id) {
    case "nw": case "se": return "nwse-resize";
    case "ne": case "sw": return "nesw-resize";
    case "n": case "s": return "ns-resize";
    case "e": case "w": return "ew-resize";
    default: return "default";
  }
}

// Like resizeRect but lets the dragged edge cross the opposite (anchored) edge:
// the rect flips to the other side instead of jamming at minimum size. Reports
// which axes inverted and the handle now under the cursor (so the drag can keep
// going). The anchored (opposite) edge never moves.
export function resizeRectFlip(rect, handle, sx, sy, minSize = 1) {
  let x = rect.x, y = rect.y, x2 = x + rect.w, y2 = y + rect.h;
  let w = handle.includes("w"), e = handle.includes("e");
  let n = handle.includes("n"), s = handle.includes("s");
  if (w) x = sx; if (e) x2 = sx;
  if (n) y = sy; if (s) y2 = sy;
  let flipX = false, flipY = false;
  if (x2 < x) { const t = x; x = x2; x2 = t; flipX = true; const tw = w; w = e; e = tw; }
  if (y2 < y) { const t = y; y = y2; y2 = t; flipY = true; const tn = n; n = s; s = tn; }
  if (x2 - x < minSize) { if (w) x = x2 - minSize; else x2 = x + minSize; }
  if (y2 - y < minSize) { if (n) y = y2 - minSize; else y2 = y + minSize; }
  const nh = (n ? "n" : s ? "s" : "") + (w ? "w" : e ? "e" : "");
  return { x, y, w: x2 - x, h: y2 - y, flipX, flipY, handle: nh || handle };
}

// Apply a resize-handle drag to a rect (all in cells, already snapped).
// Returns a new {x,y,w,h} with a minimum size of 1 cell, never inverted.
export function resizeRect(rect, handle, snappedX, snappedY) {
  let { x, y, w, h } = rect;
  let x2 = x + w;
  let y2 = y + h;

  if (handle.includes("w")) x = Math.min(snappedX, x2 - 1);
  if (handle.includes("e")) x2 = Math.max(snappedX, x + 1);
  if (handle.includes("n")) y = Math.min(snappedY, y2 - 1);
  if (handle.includes("s")) y2 = Math.max(snappedY, y + 1);

  return { x, y, w: x2 - x, h: y2 - y };
}
