// render.js — all canvas drawing. The same `drawScene` renders both the dark
// editor and the black-and-white listing/print output, selected by a palette.

import { cellPx, cellsToPx, handlePoints, HANDLES, snapStep } from "./grid.js";
import { roomGroups, wallSegments, propertyRects, propertyOutline, propertyBounds } from "./rooms.js";
import { catalogue, furnitureCells } from "./furniture.js";
import { fmtDims, fmtLen, cellMeters, niceScaleMetres } from "./units.js";

export const EDITOR = {
  bg: "#eef1f6",
  grid: "rgba(30,41,80,0.055)", gridMajor: "rgba(30,41,80,0.13)",
  tint: true, roomFillSel: "rgba(99,102,241,0.16)",
  wallExt: "#1e2533", wallInt: "#7a8492",
  text: "#0f172a", textSub: "#5b6478",
  furniture: "#46505f", furnitureFill: "#ffffff",
  dim: "#5b6478", selection: "#4f46e5",
  propFill: "rgba(79,70,229,0.045)", propLine: "#9aa3b8", propEdge: "rgba(79,70,229,0.5)",
};

export const PRINT = {
  bg: "#ffffff",
  grid: null, gridMajor: null,
  tint: false, roomFill: "#ffffff", roomFillSel: "#ffffff",
  wallExt: "#111111", wallInt: "#444444",
  text: "#111111", textSub: "#222222",
  furniture: "#1a1a1a", furnitureFill: "#ffffff",
  dim: "#222222", selection: null,
  propFill: null, propLine: null, propEdge: null,
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
    showProperty: !preview,
    showFurniture: preview ? false : plan.options.showFurniture,
    showDims: plan.options.showWallDims,
    showSelection: !preview,
    ui,
  });
  if (!preview) drawScaleBar(ctx, plan, W, H);
}

// Fixed scale reference, pinned to the bottom-right of the viewport (screen space,
// so it stays put while you pan). Picks a round metric length near ~120px.
function drawScaleBar(ctx, plan, W, H) {
  const s = cellPx(plan);
  if (s <= 0) return;
  const metresPerPx = cellMeters(plan) / s;
  const metres = niceScaleMetres(metresPerPx);
  const barPx = metres / metresPerPx;
  if (!isFinite(barPx) || barPx < 8) return;
  const pad = 22, x2 = W - pad, x1 = x2 - barPx, y = H - pad;
  const label = metres >= 1 ? `${metres} m` : `${Math.round(metres * 100)} cm`;

  ctx.save();
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  // soft backing so it reads over the grid
  const lw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  roundRect(ctx, Math.min(x1, x2 - lw) - 12, y - 30, Math.max(barPx, lw) + 24, 40, 9);
  ctx.fill();
  ctx.strokeStyle = "#334155"; ctx.fillStyle = "#334155";
  ctx.lineWidth = 2; ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x1, y); ctx.lineTo(x2, y);
  ctx.moveTo(x1, y - 5); ctx.lineTo(x1, y + 5);
  ctx.moveTo(x2, y - 5); ctx.lineTo(x2, y + 5);
  ctx.stroke();
  ctx.fillText(label, (x1 + x2) / 2, y - 7);
  ctx.restore();
}

// Core scene renderer, reused by the editor and by export.js (with a fitted view).
export function drawScene(ctx, plan, opts) {
  const {
    palette, W, H,
    showGrid = true, showProperty = false,
    showFurniture = true, showDims = true,
    showSelection = false, ui = null, fontScale = 1,
  } = opts;

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  if (showGrid && palette.grid) drawGrid(ctx, plan, palette, W, H);
  if (showProperty) drawPropertyLayer(ctx, plan, palette, ui, showDims);
  drawRooms(ctx, plan, palette, ui, fontScale);
  if (showFurniture) drawFurniture(ctx, plan, palette, fontScale);
  drawWalls(ctx, plan, palette);
  if (showDims) drawWallDimensions(ctx, plan, palette, fontScale);

  if (showSelection && ui) {
    drawDraft(ctx, plan, ui);
    drawSelection(ctx, plan, ui);
  }
}

// Property footprint: a union of rectangles drawn locked in the background.
// `editing` (the property tool) reveals each rectangle's edges so overlaps read.
function drawPropertyLayer(ctx, plan, palette, ui, showDims) {
  const rects = propertyRects(plan);
  if (!rects.length || !palette.propFill) return;
  const s = cellPx(plan);
  const editing = ui && ui.tool === "property";

  ctx.fillStyle = palette.propFill;
  for (const r of rects) {
    const p = cellsToPx(plan, r.x, r.y);
    ctx.fillRect(p.x, p.y, r.w * s, r.h * s);
  }

  if (editing) {
    ctx.strokeStyle = palette.propEdge;
    ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    for (const r of rects) {
      const p = cellsToPx(plan, r.x, r.y);
      ctx.strokeRect(p.x, p.y, r.w * s, r.h * s);
    }
    ctx.setLineDash([]);
  }

  // Union outline (the building shell), thick.
  ctx.strokeStyle = palette.propLine;
  ctx.lineWidth = clamp(s * 0.4, 2, 9);
  ctx.lineCap = "square";
  ctx.beginPath();
  for (const seg of propertyOutline(plan)) {
    const a = cellsToPx(plan, seg.x1, seg.y1);
    const b = cellsToPx(plan, seg.x2, seg.y2);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.lineCap = "butt";

  // Always label the footprint while editing it; otherwise honour the Dims toggle.
  if (editing || showDims) drawPropertyDims(ctx, plan, palette);
}

// Property name + overall size, as one centred label below the footprint.
function drawPropertyDims(ctx, plan, palette) {
  const b = propertyBounds(plan);
  if (!b) return;
  const s = cellPx(plan);
  if (s < 5) return;
  const a = cellsToPx(plan, b.x, b.y);
  const w = b.w * s, h = b.h * s;
  // Same dimension formatter as room labels, so sizes read identically everywhere.
  const label = `${plan.name || "Property"} · ${fmtDims(plan, b.w, b.h).replace("\n", "  ")}`;
  ctx.save();
  ctx.fillStyle = palette.dim;
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText(label, a.x + w / 2, a.y + h + 8);
  ctx.restore();
}

function drawGrid(ctx, plan, palette, W, H) {
  const s = cellPx(plan);
  if (s < 3) return;
  const major = Math.max(1, Math.round(1 / cellMeters(plan))); // a line every metre
  const o = cellsToPx(plan, 0, 0);
  // visible cell range
  const c0x = Math.floor(-o.x / s) - 1, c1x = Math.ceil((W - o.x) / s) + 1;
  const c0y = Math.floor(-o.y / s) - 1, c1y = Math.ceil((H - o.y) / s) + 1;

  // minor lines at the snap increment, so the grid shows exactly where things snap
  const step = snapStep(plan);
  if (step * s >= 7 && step < major) {
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let cx = Math.ceil(c0x / step) * step; cx <= c1x; cx += step) {
      if (cx % major === 0) continue;
      const x = Math.round(o.x + cx * s) + 0.5;
      ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    for (let cy = Math.ceil(c0y / step) * step; cy <= c1y; cy += step) {
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

function drawRooms(ctx, plan, palette, ui, fontScale = 1) {
  const s = cellPx(plan);
  // fills — in the editor each room is tinted with its own colour; print stays white
  for (const r of plan.rooms) {
    const p = cellsToPx(plan, r.x, r.y);
    const sel = ui && ui.selType === "room" && ui.selIds?.includes(r.id);
    if (palette.tint) ctx.fillStyle = sel ? palette.roomFillSel : rgba(r.color, 0.13);
    else ctx.fillStyle = sel ? palette.roomFillSel : palette.roomFill;
    ctx.fillRect(p.x, p.y, r.w * s, r.h * s);
  }
  // labels (per group so merged rooms get one label + max dims)
  for (const g of roomGroups(plan)) {
    if (ui && ui.editingLabelId === g.group) continue;
    const c = cellsToPx(plan, g.anchor.x, g.anchor.y);
    drawRoomLabel(ctx, plan, palette, g, c.x, c.y, s, fontScale);
  }
}

function drawRoomLabel(ctx, plan, palette, g, cx, cy, s, fontScale = 1) {
  const nameSize = Math.max(11, Math.min(20, s * 0.7)) * fontScale;
  const dimSize = Math.max(9, Math.min(14, s * 0.5)) * fontScale;
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
  // Real wall thickness (mm) drawn to scale, with a small floor so they stay
  // visible when zoomed right out.
  const cm = cellMeters(plan);
  const extMm = plan.walls?.external ?? 100;
  const intMm = plan.walls?.internal ?? 75;
  const extW = Math.max(1.5, (extMm / 1000 / cm) * s);
  const intW = Math.max(1, (intMm / 1000 / cm) * s);
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

function drawFurniture(ctx, plan, palette, fontScale = 1) {
  const s = cellPx(plan);
  for (const item of plan.furniture) {
    const def = catalogue[item.kind];
    if (!def) continue;
    const { w, h } = furnitureCells(plan, item);
    const center = cellsToPx(plan, item.x + w / 2, item.y + h / 2);
    const nw = (def.wmm / 1000 / cellMeters(plan)) * (item.scaleX || 1) * s;
    const nh = (def.hmm / 1000 / cellMeters(plan)) * (item.scaleY || 1) * s;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(((item.rot || 0) * Math.PI) / 180);
    if (item.flipX || item.flipY) ctx.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
    ctx.translate(-nw / 2, -nh / 2);
    ctx.strokeStyle = palette.furniture;
    ctx.fillStyle = palette.furnitureFill;
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.lineJoin = "round";
    def.draw(ctx, nw, nh);
    ctx.restore();

    // Optional label, laid along the item's longest axis so it fits: horizontal
    // for wide pieces, vertical for tall ones. Shrinks if still too long, and
    // sits on a small backing tag so it stays readable over the symbol's lines.
    if (item.label) {
      const shortPx = Math.min(w, h) * s, longPx = Math.max(w, h) * s;
      const vertical = h > w;
      let size = Math.max(9, Math.min(s * 0.5, shortPx * 0.5)) * fontScale;
      ctx.save();
      ctx.translate(center.x, center.y);
      if (vertical) ctx.rotate(-Math.PI / 2);
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      let tw = ctx.measureText(item.label).width;
      if (tw > longPx * 0.92) {
        size *= (longPx * 0.92) / tw;
        ctx.font = `600 ${size}px system-ui, sans-serif`;
        tw = ctx.measureText(item.label).width;
      }
      // backing tag — clears the symbol behind the text
      const padX = size * 0.4, padY = size * 0.24;
      const bw = tw + padX * 2, bh = size + padY * 2;
      ctx.fillStyle = palette.furnitureFill || "#ffffff";
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, Math.min(6 * fontScale, bh * 0.3));
      ctx.fill();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = palette.text;
      ctx.fillText(item.label, 0, 0);
      ctx.restore();
    }
  }
}

// Running dimension lines along the top (widths) and left (heights) of the plan.
function drawWallDimensions(ctx, plan, palette, fontScale = 1) {
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
  const off = 22 * fontScale; // px outside the walls
  const minGap = 14 * fontScale;

  ctx.strokeStyle = palette.dim;
  ctx.fillStyle = palette.dim;
  ctx.lineWidth = Math.max(1, fontScale);
  ctx.font = `${Math.round(11 * fontScale)}px system-ui, sans-serif`;

  // top: width segments
  const topY = cellsToPx(plan, 0, minY).y - off;
  for (let i = 0; i < xb.length - 1; i++) {
    const a = cellsToPx(plan, xb[i], minY).x;
    const b = cellsToPx(plan, xb[i + 1], minY).x;
    if (b - a < minGap) continue;
    dimLine(ctx, a, topY, b, topY, fmtLen(plan, xb[i + 1] - xb[i]), "h", fontScale);
  }
  // left: height segments
  const leftX = cellsToPx(plan, minX, 0).x - off;
  for (let i = 0; i < yb.length - 1; i++) {
    const a = cellsToPx(plan, minX, yb[i]).y;
    const b = cellsToPx(plan, minX, yb[i + 1]).y;
    if (b - a < minGap) continue;
    dimLine(ctx, leftX, a, leftX, b, fmtLen(plan, yb[i + 1] - yb[i]), "v", fontScale);
  }
}

function dimLine(ctx, x1, y1, x2, y2, text, dir, fontScale = 1) {
  const tick = 4 * fontScale, pad = 6 * fontScale;
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
    ctx.fillText(label, (x1 + x2) / 2, y1 - pad);
  } else {
    ctx.translate((x1 + x2) / 2 - pad, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label, 0, 0);
  }
  ctx.restore();
}

function drawDraft(ctx, plan, ui) {
  if (!ui.draft) return;
  const s = cellPx(plan);
  const p = cellsToPx(plan, ui.draft.x, ui.draft.y);
  const w = ui.draft.w * s, h = ui.draft.h * s;
  const prop = ui.tool === "property";
  ctx.fillStyle = prop ? "rgba(90,101,115,0.16)" : "rgba(79,70,229,0.15)";
  ctx.fillRect(p.x, p.y, w, h);
  ctx.strokeStyle = prop ? "#5b6478" : "#4f46e5";
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(p.x, p.y, w, h);
  ctx.setLineDash([]);
  drawSizeTag(ctx, plan, ui.draft.w, ui.draft.h, p.x + w / 2, p.y + h / 2, prop);
}

// Live "W × H" pill drawn at the centre of a rectangle being drawn/resized.
function drawSizeTag(ctx, plan, wCells, hCells, cx, cy, prop = false) {
  if (wCells < 1 || hCells < 1) return;
  const text = `${(wCells * cellMeters(plan)).toFixed(2)} × ${(hCells * cellMeters(plan)).toFixed(2)} m`;
  ctx.save();
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = prop ? "rgba(71,80,95,0.94)" : "rgba(79,70,229,0.94)";
  roundRect(ctx, cx - tw / 2 - 7, cy - 11, tw + 14, 22, 6);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSelection(ctx, plan, ui) {
  if (!ui.selType) return;
  const s = cellPx(plan);
  if (ui.selType === "room") {
    const ids = ui.selIds?.length ? ui.selIds : (ui.selId ? [ui.selId] : []);
    ctx.strokeStyle = EDITOR.selection; ctx.lineWidth = 2;
    for (const id of ids) {
      const r = plan.rooms.find((x) => x.id === id);
      if (!r) continue;
      const a = cellsToPx(plan, r.x, r.y);
      ctx.strokeRect(a.x - 1, a.y - 1, r.w * s + 2, r.h * s + 2);
    }
    if (ids.length === 1) {
      const r = plan.rooms.find((x) => x.id === ids[0]);
      if (r) drawHandles(ctx, plan, r);
    }
  } else if (ui.selType === "furniture") {
    const item = plan.furniture.find((x) => x.id === ui.selId);
    if (!item) return;
    const { w, h } = furnitureCells(plan, item);
    const a = cellsToPx(plan, item.x, item.y);
    ctx.strokeStyle = EDITOR.selection; ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(a.x - 1, a.y - 1, w * s + 2, h * s + 2);
    ctx.setLineDash([]);
    drawHandles(ctx, plan, { x: item.x, y: item.y, w, h });
  } else if (ui.selType === "property") {
    const r = propertyRects(plan).find((x) => x.id === ui.selId);
    if (!r) return;
    const a = cellsToPx(plan, r.x, r.y);
    ctx.strokeStyle = EDITOR.selection; ctx.lineWidth = 2;
    ctx.strokeRect(a.x - 1, a.y - 1, r.w * s + 2, r.h * s + 2);
    drawHandles(ctx, plan, r);
  }
}

// "#4f9dff" -> "rgba(79,157,255,a)". Falls back to the accent on a bad value.
function rgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(79,70,229,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
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
