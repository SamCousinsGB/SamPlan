// export.js — print-resolution image export. Reuses render.drawScene with the
// PRINT palette and a view fitted to the plan, then adds a listing title block.

import { drawScene, PRINT } from "./render.js";
import { contentBounds, totalAreaCells } from "./rooms.js";
import { fmtArea, niceScaleMetres, cellMeters } from "./units.js";

const DISCLAIMER =
  "For illustrative purposes only. Not to scale. All measurements are approximate.";

export function renderToCanvas(plan, { pxWidth = 2400, includeFurniture = false } = {}) {
  const bounds = contentBounds(plan);
  const margin = Math.round(pxWidth * 0.07);
  const titleH = Math.round(pxWidth * 0.11);

  const scale = (pxWidth - margin * 2) / Math.max(1, bounds.w); // px per cell
  const H = Math.round(bounds.h * scale + margin * 2 + titleH);

  const canvas = document.createElement("canvas");
  canvas.width = pxWidth;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Fitted view: map bounds top-left to (margin, margin) at `scale` px/cell.
  const zoom = scale / plan.grid.cell;
  const view = { zoom, panX: margin - bounds.x * scale, panY: margin - bounds.y * scale };
  const fitted = { ...plan, view };

  drawScene(ctx, fitted, {
    palette: PRINT, W: pxWidth, H,
    showGrid: false, showFurniture: includeFurniture, showDims: true, showSelection: false,
  });

  drawTitleBlock(ctx, plan, { x: 0, y: H - titleH, w: pxWidth, h: titleH, scale });
  return canvas;
}

function drawTitleBlock(ctx, plan, box) {
  const { x, y, w, h } = box;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.04, y); ctx.lineTo(x + w * 0.96, y);
  ctx.stroke();

  const pad = w * 0.04;
  ctx.fillStyle = "#111111";
  ctx.textBaseline = "alphabetic";

  // Left: name + address
  ctx.textAlign = "left";
  ctx.font = `700 ${Math.round(h * 0.26)}px system-ui, sans-serif`;
  ctx.fillText(plan.name || "Floorplan", x + pad, y + h * 0.34);
  if (plan.meta?.address) {
    ctx.font = `${Math.round(h * 0.15)}px system-ui, sans-serif`;
    ctx.fillStyle = "#333";
    ctx.fillText(plan.meta.address, x + pad, y + h * 0.55);
  }

  // Right: total area
  ctx.fillStyle = "#111111";
  ctx.textAlign = "right";
  ctx.font = `${Math.round(h * 0.14)}px system-ui, sans-serif`;
  ctx.fillText("Approximate total area", x + w - pad, y + h * 0.30);
  ctx.font = `700 ${Math.round(h * 0.24)}px system-ui, sans-serif`;
  ctx.fillText(fmtArea(plan, totalAreaCells(plan)), x + w - pad, y + h * 0.56);

  // Scale bar (bottom-left)
  drawScaleBar(ctx, plan, box, x + pad, y + h * 0.80);

  // Disclaimer (bottom-right)
  ctx.fillStyle = "#555";
  ctx.textAlign = "right";
  ctx.font = `${Math.round(h * 0.11)}px system-ui, sans-serif`;
  ctx.fillText(DISCLAIMER, x + w - pad, y + h * 0.86);
}

function drawScaleBar(ctx, plan, box, x, y) {
  const scale = box.scale;                 // px per cell on the exported canvas
  const metresPerPx = cellMeters(plan) / scale;
  const metres = niceScaleMetres(metresPerPx);
  const barPx = metres / metresPerPx;
  ctx.strokeStyle = "#111111";
  ctx.fillStyle = "#111111";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + barPx, y);
  ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6);
  ctx.moveTo(x + barPx, y - 6); ctx.lineTo(x + barPx, y + 6);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.font = `${Math.round(box.h * 0.1)}px system-ui, sans-serif`;
  ctx.fillText(`${metres} m`, x, y - 10);
}

// ---- downloads ----
function safeName(name) {
  return (name || "floorplan").replace(/[^\w.-]+/g, "_");
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportImage(plan, { type = "image/png", includeFurniture = false } = {}) {
  const canvas = renderToCanvas(plan, { includeFurniture });
  const ext = type === "image/jpeg" ? "jpg" : "png";
  canvas.toBlob(
    (blob) => blob && download(blob, `${safeName(plan.name)}.${ext}`),
    type,
    type === "image/jpeg" ? 0.92 : undefined
  );
}
