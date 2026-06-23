// render.js — all canvas drawing. One full redraw per frame, coalesced via rAF.

import { cellPx, cellsToPx, handlePoints, HANDLES } from "./grid.js";

let scheduled = false;
let renderArgs = null;

// scheduleRender(ctx-bundle) — coalesce many change events into one rAF redraw.
export function scheduleRender(bundle) {
  renderArgs = bundle;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if (renderArgs) draw(renderArgs);
  });
}

// Resize the canvas backing store to the element size * devicePixelRatio.
// Returns true if the size changed.
export function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}

function draw({ canvas, plan, ui }) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // work in CSS pixels
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;

  // Background
  ctx.fillStyle = "#161a20";
  ctx.fillRect(0, 0, W, H);

  drawGrid(ctx, plan, W, H);
  drawFloor(ctx, plan);
  drawBoxes(ctx, plan, ui);
  drawDraftBox(ctx, plan, ui);
  drawSelection(ctx, plan, ui);
}

function drawGrid(ctx, plan, W, H) {
  const s = cellPx(plan);
  if (s < 4) return; // too dense to be useful

  const origin = cellsToPx(plan, 0, 0);
  const end = cellsToPx(plan, plan.floor.w, plan.floor.h);

  // Clip grid lines to the floor area only.
  ctx.save();
  ctx.beginPath();
  ctx.rect(origin.x, origin.y, end.x - origin.x, end.y - origin.y);
  ctx.clip();

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let cx = 0; cx <= plan.floor.w; cx++) {
    const x = Math.round(origin.x + cx * s) + 0.5;
    ctx.moveTo(x, origin.y);
    ctx.lineTo(x, end.y);
  }
  for (let cy = 0; cy <= plan.floor.h; cy++) {
    const y = Math.round(origin.y + cy * s) + 0.5;
    ctx.moveTo(origin.x, y);
    ctx.lineTo(end.x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawFloor(ctx, plan) {
  const a = cellsToPx(plan, 0, 0);
  const b = cellsToPx(plan, plan.floor.w, plan.floor.h);
  // subtle fill so the floor reads as a surface
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  // boundary wall
  ctx.strokeStyle = "#aeb6c4";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    Math.round(a.x) + 0.5,
    Math.round(a.y) + 0.5,
    Math.round(b.x - a.x),
    Math.round(b.y - a.y)
  );
}

function drawBoxes(ctx, plan, ui) {
  const s = cellPx(plan);
  for (const box of plan.boxes) {
    const p = cellsToPx(plan, box.x, box.y);
    const w = box.w * s;
    const h = box.h * s;
    ctx.fillStyle = withAlpha(box.color, 0.85);
    ctx.fillRect(p.x, p.y, w, h);
    ctx.strokeStyle = box.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p.x + 0.75, p.y + 0.75, w - 1.5, h - 1.5);
    if (box.label && !(ui.editingLabelId === box.id)) {
      drawLabel(ctx, box.label, p.x, p.y, w, h);
    }
  }
}

function drawLabel(ctx, text, x, y, w, h) {
  const fontSize = Math.max(10, Math.min(18, h * 0.4));
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Truncate to fit the box width.
  let label = text;
  const pad = 6;
  if (ctx.measureText(label).width > w - pad) {
    while (label.length > 1 && ctx.measureText(label + "…").width > w - pad) {
      label = label.slice(0, -1);
    }
    label += "…";
  }
  // Slight shadow for legibility over any color.
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillText(label, x + w / 2 + 0.5, y + h / 2 + 0.5);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, x + w / 2, y + h / 2);
}

// The rubber-band box currently being drawn in edit mode.
function drawDraftBox(ctx, plan, ui) {
  if (!ui.draft) return;
  const s = cellPx(plan);
  const p = cellsToPx(plan, ui.draft.x, ui.draft.y);
  ctx.fillStyle = "rgba(79,157,255,0.25)";
  ctx.fillRect(p.x, p.y, ui.draft.w * s, ui.draft.h * s);
  ctx.strokeStyle = "#4f9dff";
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(p.x, p.y, ui.draft.w * s, ui.draft.h * s);
  ctx.setLineDash([]);
}

// Selection outline + handles for the selected box (edit mode) or floor (floor mode).
function drawSelection(ctx, plan, ui) {
  if (ui.mode === "floor") {
    drawHandlesFor(ctx, plan, { x: 0, y: 0, w: plan.floor.w, h: plan.floor.h }, "#4f9dff");
    return;
  }
  const box = plan.boxes.find((b) => b.id === ui.selectedId);
  if (!box) return;
  const a = cellsToPx(plan, box.x, box.y);
  const s = cellPx(plan);
  ctx.strokeStyle = "#4f9dff";
  ctx.lineWidth = 2;
  ctx.strokeRect(a.x - 1, a.y - 1, box.w * s + 2, box.h * s + 2);
  drawHandlesFor(ctx, plan, box, "#4f9dff");
}

function drawHandlesFor(ctx, plan, rect, color) {
  const pts = handlePoints(plan, rect);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  for (const id of HANDLES) {
    const p = pts[id];
    ctx.beginPath();
    ctx.rect(p.x - 4, p.y - 4, 8, 8);
    ctx.fill();
    ctx.stroke();
  }
}

// ---- color helpers ----
function withAlpha(hex, alpha) {
  const c = hexToRgb(hex);
  if (!c) return hex;
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
