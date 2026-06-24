// render.js — all canvas drawing. The same `drawScene` renders both the dark
// editor and the black-and-white listing/print output, selected by a palette.

import { cellPx, cellsToPx, handlePoints, HANDLES } from "./grid.js";
import { roomGroups, wallSegments } from "./rooms.js";
import { catalogue, furnitureCells } from "./furniture.js";
import { fmtDims, fmtLen, cellMeters } from "./units.js";

export const EDITOR = {
  bg: "#161a20",
  grid: "rgba(255,255,255,0.05)", gridMajor: "rgba(255,255,255,0.13)",
  roomFill: "rgba(255,255,255,0.02)", roomFillSel: "rgba(79,157,255,0.10)",
  wallExt: "#aeb6c4", wallInt: "#7f8796",
  text: "#e9ecf2", textSub: "#aab2c0",
  furniture: "#cdd3de", furnitureFill: "#161a20",
  dim: "#8b93a3", compass: "#cdd3de", selection: "#4f9dff",
};

export const PRINT = {
  bg: "#ffffff",
  grid: null, gridMajor: null,
  roomFill: "#ffffff", roomFillSel: "#ffffff",
  wallExt: "#111111", wallInt: "#444444",
  text: "#111111", textSub: "#222222",
  furniture: "#1a1a1a", furnitureFill: "#ffffff",
  dim: "#222222", compass: "#111111", selection: null,
};

let scheduled = false;
let renderArgs = null;

export function scheduleRender(bundle) {
  renderArgs = bundle;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if (renderArgs) drawEditor(renderArgs);
  });
}

export function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  const w = Math.round(r.width * dpr);
  const h = Math.round(r.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}

function drawEditor({ canvas, plan, ui }) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = canvas.width / dpr, H = canvas.height / dpr;
  const preview = !!ui.preview;
  drawScene(ctx, plan, {
    palette: preview ? PRINT : EDITOR,
    W, H,
    showGrid: !preview,
    showFurniture: preview ? false : plan.options.showFurniture,
    showDims: plan.options.showWallDims,
    showSelection: !preview,
    ui,
  });
}

// Core scene renderer, reused by the editor and by export.js (with a fitted view).
export function drawScene(ctx, plan, opts) {
  const {
    palette, W, H,
    showGrid = true, showFurniture = true, showDims = true,
    showSelection = false, ui = null,
  } = opts;

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  if (showGrid && palette.grid) drawGrid(ctx, plan, palette, W, H);
  drawRooms(ctx, plan, palette, ui);
  if (showFurniture) drawFurniture(ctx, plan, palette);
  drawWalls(ctx, plan, palette);
  if (showDims) drawWallDimensions(ctx, plan, palette);
  if (plan.compass) drawCompass(ctx, plan, palette);

  if (showSelection && ui) {
    drawDraft(ctx, plan, ui);
    drawMeasure(ctx, plan, ui, palette);
    drawSelection(ctx, plan, ui);
  }
}

function drawGrid(ctx, plan, palette, W, H) {
  const s = cellPx(plan);
  if (s < 3) return;
  const major = Math.max(1, Math.round(1 / cellMeters(plan))); // a line every metre
  const o = cellsToPx(plan, 0, 0);
  // visible cell range
  const c0x = Math.floor(-o.x / s) - 1, c1x = Math.ceil((W - o.x) / s) + 1;
  const c0y = Math.floor(-o.y / s) - 1, c1y = Math.ceil((H - o.y) / s) + 1;

  if (s >= 6) {
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let cx = c0x; cx <= c1x; cx++) {
      if (cx % major === 0) continue;
      const x = Math.round(o.x + cx * s) + 0.5;
      ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    for (let cy = c0y; cy <= c1y; cy++) {
      if (cy % major === 0) continue;
      const y = Math.round(o.y + cy * s) + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();
  }
  // major (metre) lines
  ctx.strokeStyle = palette.gridMajor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let cx = Math.ceil(c0x / major) * major; cx <= c1x; cx += major) {
    const x = Math.round(o.x + cx * s) + 0.5;
    ctx.moveTo(x, 0); ctx.lineTo(x, H);
  }
  for (let cy = Math.ceil(c0y / major) * major; cy <= c1y; cy += major) {
    const y = Math.round(o.y + cy * s) + 0.5;
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.stroke();
}

function drawRooms(ctx, plan, palette, ui) {
  const s = cellPx(plan);
  // fills
  for (const r of plan.rooms) {
    const p = cellsToPx(plan, r.x, r.y);
    const sel = ui && ui.selType === "room" && ui.selId === r.id;
    ctx.fillStyle = sel ? palette.roomFillSel : palette.roomFill;
    ctx.fillRect(p.x, p.y, r.w * s, r.h * s);
  }
  // labels (per group so merged rooms get one label + max dims)
  for (const g of roomGroups(plan)) {
    if (ui && ui.editingLabelId === g.group) continue;
    const c = cellsToPx(plan, g.anchor.x, g.anchor.y);
    drawRoomLabel(ctx, plan, palette, g, c.x, c.y, s);
  }
}

function drawRoomLabel(ctx, plan, palette, g, cx, cy, s) {
  const nameSize = Math.max(11, Math.min(20, s * 0.7));
  const dimSize = Math.max(9, Math.min(14, s * 0.5));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const dims = fmtDims(plan, g.bbox.w, g.bbox.h).split("\n");
  const lines = [];
  if (g.name) lines.push({ t: g.name, size: nameSize, sub: false });
  for (const d of dims) lines.push({ t: d, size: dimSize, sub: true });
  if (!lines.length) return;

  const lineH = (l) => l.size * 1.25;
  const totalH = lines.reduce((a, l) => a + lineH(l), 0);
  let y = cy - totalH / 2;
  for (const l of lines) {
    y += lineH(l) / 2;
    ctx.font = `${l.sub ? "" : "600 "}${l.size}px system-ui, sans-serif`;
    ctx.fillStyle = l.sub ? palette.textSub : palette.text;
    ctx.fillText(l.t, cx, y);
    y += lineH(l) / 2;
  }
}

function drawWalls(ctx, plan, palette) {
  const s = cellPx(plan);
  const segs = wallSegments(plan);
  const extW = clamp(s * 0.5, 2.5, 12);
  const intW = clamp(s * 0.28, 1.2, 7);
  ctx.lineCap = "square";

  for (const [type, color, width] of [
    ["external", palette.wallExt, extW],
    ["internal", palette.wallInt, intW],
  ]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const seg of segs) {
      if (seg.type !== type) continue;
      const a = cellsToPx(plan, seg.x1, seg.y1);
      const b = cellsToPx(plan, seg.x2, seg.y2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

function drawFurniture(ctx, plan, palette) {
  const s = cellPx(plan);
  for (const item of plan.furniture) {
    const def = catalogue[item.kind];
    if (!def) continue;
    const { w, h } = furnitureCells(plan, item);
    const center = cellsToPx(plan, item.x + w / 2, item.y + h / 2);
    const nw = (def.wmm / 1000 / cellMeters(plan)) * s;
    const nh = (def.hmm / 1000 / cellMeters(plan)) * s;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(((item.rot || 0) * Math.PI) / 180);
    ctx.translate(-nw / 2, -nh / 2);
    ctx.strokeStyle = palette.furniture;
    ctx.fillStyle = palette.furnitureFill;
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.lineJoin = "round";
    def.draw(ctx, nw, nh);
    ctx.restore();
  }
}

// Running dimension lines along the top (widths) and left (heights) of the plan.
function drawWallDimensions(ctx, plan, palette) {
  if (!plan.rooms.length) return;
  const s = cellPx(plan);
  if (s < 5) return;
  const xs = new Set(), ys = new Set();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of plan.rooms) {
    xs.add(r.x); xs.add(r.x + r.w); ys.add(r.y); ys.add(r.y + r.h);
    minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x + r.w);
    minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y + r.h);
  }
  const xb = [...xs].sort((a, b) => a - b);
  const yb = [...ys].sort((a, b) => a - b);
  const off = 22; // px outside the walls

  ctx.strokeStyle = palette.dim;
  ctx.fillStyle = palette.dim;
  ctx.lineWidth = 1;
  ctx.font = "10px system-ui, sans-serif";

  // top: width segments
  const topY = cellsToPx(plan, 0, minY).y - off;
  for (let i = 0; i < xb.length - 1; i++) {
    const a = cellsToPx(plan, xb[i], minY).x;
    const b = cellsToPx(plan, xb[i + 1], minY).x;
    if (b - a < 14) continue;
    dimLine(ctx, a, topY, b, topY, fmtLen(plan, xb[i + 1] - xb[i]), "h");
  }
  // left: height segments
  const leftX = cellsToPx(plan, minX, 0).x - off;
  for (let i = 0; i < yb.length - 1; i++) {
    const a = cellsToPx(plan, minX, yb[i]).y;
    const b = cellsToPx(plan, minX, yb[i + 1]).y;
    if (b - a < 14) continue;
    dimLine(ctx, leftX, a, leftX, b, fmtLen(plan, yb[i + 1] - yb[i]), "v");
  }
}

function dimLine(ctx, x1, y1, x2, y2, text, dir) {
  const tick = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  if (dir === "h") {
    ctx.moveTo(x1, y1 - tick); ctx.lineTo(x1, y1 + tick);
    ctx.moveTo(x2, y2 - tick); ctx.lineTo(x2, y2 + tick);
  } else {
    ctx.moveTo(x1 - tick, y1); ctx.lineTo(x1 + tick, y1);
    ctx.moveTo(x2 - tick, y2); ctx.lineTo(x2 + tick, y2);
  }
  ctx.stroke();
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = text.replace(/\n.*/, ""); // metric only on the tick line, keep compact
  if (dir === "h") {
    ctx.fillText(label, (x1 + x2) / 2, y1 - 6);
  } else {
    ctx.translate((x1 + x2) / 2 - 6, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label, 0, 0);
  }
  ctx.restore();
}

function drawCompass(ctx, plan, palette) {
  const s = cellPx(plan);
  const r = clamp((0.5 / cellMeters(plan)) * s, 18, 80);
  const c = cellsToPx(plan, plan.compass.x, plan.compass.y);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(((plan.compass.rot || 0) * Math.PI) / 180);
  ctx.strokeStyle = palette.compass;
  ctx.fillStyle = palette.compass;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  // N arrow
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.85);
  ctx.lineTo(r * 0.22, r * 0.1);
  ctx.lineTo(0, -r * 0.1);
  ctx.lineTo(-r * 0.22, r * 0.1);
  ctx.closePath();
  ctx.fill();
  // ticks
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.rotate((i * Math.PI) / 2);
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, -r * 0.8); ctx.stroke();
    ctx.restore();
  }
  ctx.font = `${Math.max(10, r * 0.32)}px system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("N", 0, -r * 1.25);
  ctx.restore();
}

function drawDraft(ctx, plan, ui) {
  if (!ui.draft) return;
  const s = cellPx(plan);
  const p = cellsToPx(plan, ui.draft.x, ui.draft.y);
  ctx.fillStyle = "rgba(79,157,255,0.22)";
  ctx.fillRect(p.x, p.y, ui.draft.w * s, ui.draft.h * s);
  ctx.strokeStyle = "#4f9dff";
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(p.x, p.y, ui.draft.w * s, ui.draft.h * s);
  ctx.setLineDash([]);
}

function drawMeasure(ctx, plan, ui, palette) {
  if (!ui.measure) return;
  const a = cellsToPx(plan, ui.measure.x1, ui.measure.y1);
  const b = cellsToPx(plan, ui.measure.x2, ui.measure.y2);
  ctx.strokeStyle = "#ffcf4f";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  const dx = ui.measure.x2 - ui.measure.x1, dy = ui.measure.y2 - ui.measure.y1;
  const dist = Math.hypot(dx, dy);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const text = fmtLen(plan, dist).replace("\n", "  ");
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = "rgba(20,22,28,0.85)";
  ctx.fillRect(mid.x - w / 2, mid.y - 20, w, 16);
  ctx.fillStyle = "#ffcf4f";
  ctx.fillText(text, mid.x, mid.y - 5);
}

function drawSelection(ctx, plan, ui) {
  if (!ui.selType) return;
  const s = cellPx(plan);
  if (ui.selType === "room") {
    const r = plan.rooms.find((x) => x.id === ui.selId);
    if (!r) return;
    const a = cellsToPx(plan, r.x, r.y);
    ctx.strokeStyle = EDITOR.selection; ctx.lineWidth = 2;
    ctx.strokeRect(a.x - 1, a.y - 1, r.w * s + 2, r.h * s + 2);
    drawHandles(ctx, plan, r);
  } else if (ui.selType === "furniture") {
    const item = plan.furniture.find((x) => x.id === ui.selId);
    if (!item) return;
    const { w, h } = furnitureCells(plan, item);
    const a = cellsToPx(plan, item.x, item.y);
    ctx.strokeStyle = EDITOR.selection; ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(a.x - 1, a.y - 1, w * s + 2, h * s + 2);
    ctx.setLineDash([]);
  } else if (ui.selType === "compass" && plan.compass) {
    const r = clamp((0.5 / cellMeters(plan)) * s, 18, 80);
    const c = cellsToPx(plan, plan.compass.x, plan.compass.y);
    ctx.strokeStyle = EDITOR.selection; ctx.lineWidth = 2;
    ctx.strokeRect(c.x - r - 2, c.y - r - 2, r * 2 + 4, r * 2 + 4);
  }
}

function drawHandles(ctx, plan, rect) {
  const pts = handlePoints(plan, rect);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = EDITOR.selection;
  ctx.lineWidth = 1.5;
  for (const id of HANDLES) {
    const p = pts[id];
    ctx.beginPath();
    ctx.rect(p.x - 4, p.y - 4, 8, 8);
    ctx.fill(); ctx.stroke();
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
