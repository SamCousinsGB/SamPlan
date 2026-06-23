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
