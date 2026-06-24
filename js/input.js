// input.js — pointer + keyboard interaction, organised around a tool model:
// Select · Room · Furniture · Compass · Measure. Reads/writes app.plan & app.ui.

import {
  pxToCells, cellsToPx, snapTo, snapStep, cellPx,
  handleAt, handleCursor, resizeRect,
} from "./grid.js";
import { roomAt } from "./rooms.js";
import { catalogue, furnitureCells } from "./furniture.js";
import { cellMeters } from "./units.js";
import { uid, nextColor } from "./state.js";

export function attachInput(app) {
  const canvas = app.canvas;
  let spaceDown = false;
  let drag = null;

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // ---- hit-testing helpers ----
  function furnitureAt(plan, cx, cy) {
    for (let i = plan.furniture.length - 1; i >= 0; i--) {
      const item = plan.furniture[i];
      const { w, h } = furnitureCells(plan, item);
      if (cx >= item.x && cx < item.x + w && cy >= item.y && cy < item.y + h) return item;
    }
    return null;
  }
  function compassHit(plan, px, py) {
    if (!plan.compass) return false;
    const s = cellPx(plan);
    const r = Math.min(80, Math.max(18, (0.5 / cellMeters(plan)) * s));
    const c = cellsToPx(plan, plan.compass.x, plan.compass.y);
    return Math.hypot(px - c.x, py - c.y) <= r;
  }
  function selectedRoom(plan, ui) {
    return ui.selType === "room" ? plan.rooms.find((r) => r.id === ui.selId) : null;
  }

  // ---------------- pointer down ----------------
  canvas.addEventListener("pointerdown", (e) => {
    const plan = app.plan, ui = app.ui;
    const pt = local(e);

    // Pan: middle mouse, space+left, or any left-drag in view-only mode.
    if (e.button === 1 || (e.button === 0 && (spaceDown || ui.viewOnly))) {
      drag = { type: "pan", sx: pt.x, sy: pt.y, panX: plan.view.panX, panY: plan.view.panY };
      capture(e); canvas.style.cursor = "grabbing"; e.preventDefault();
      return;
    }
    if (ui.viewOnly) return; // view-only: pan/zoom only, no editing
    if (e.button !== 0) return;

    const cell = pxToCells(plan, pt.x, pt.y);
    const step = snapStep(plan);

    // Resize handle of the currently selected room (works in select & room tools)
    const sr = selectedRoom(plan, ui);
    if (sr && (ui.tool === "select" || ui.tool === "room")) {
      const h = handleAt(plan, sr, pt.x, pt.y);
      if (h) { app.pushUndo(); drag = { type: "room-resize", handle: h, room: sr }; capture(e); return; }
    }

    if (ui.tool === "furniture" && ui.placingKind) {
      placeFurniture(plan, ui, cell, step, e);
      return;
    }
    if (ui.tool === "room") {
      const hit = roomAt(plan, cell.x, cell.y);
      if (hit) { select(ui, "room", hit.id); app.pushUndo();
        drag = { type: "room-move", room: hit, gx: cell.x - hit.x, gy: cell.y - hit.y };
        capture(e); app.commit(); return; }
      // draw a new room (whole-cell snap)
      ui.draft = { x: Math.round(cell.x), y: Math.round(cell.y), w: 0, h: 0 };
      drag = { type: "room-draw", ox: Math.round(cell.x), oy: Math.round(cell.y) };
      capture(e); return;
    }
    if (ui.tool === "compass") {
      if (!plan.compass) {
        app.pushUndo();
        plan.compass = { x: snapTo(cell.x, step), y: snapTo(cell.y, step), rot: 0 };
      }
      select(ui, "compass", "compass");
      drag = { type: "compass-move", gx: cell.x - plan.compass.x, gy: cell.y - plan.compass.y };
      capture(e); app.commit(); return;
    }
    if (ui.tool === "measure") {
      const x = snapTo(cell.x, step), y = snapTo(cell.y, step);
      ui.measure = { x1: x, y1: y, x2: x, y2: y };
      drag = { type: "measure" };
      capture(e); app.render(); return;
    }

    // ---- select tool (and furniture tool w/o a queued kind) ----
    const fHit = furnitureAt(plan, cell.x, cell.y);
    if (fHit) {
      select(ui, "furniture", fHit.id); app.pushUndo();
      drag = { type: "furn-move", item: fHit, gx: cell.x - fHit.x, gy: cell.y - fHit.y };
      capture(e); app.commit(); return;
    }
    if (compassHit(plan, pt.x, pt.y)) {
      select(ui, "compass", "compass"); app.pushUndo();
      drag = { type: "compass-move", gx: cell.x - plan.compass.x, gy: cell.y - plan.compass.y };
      capture(e); app.commit(); return;
    }
    const rHit = roomAt(plan, cell.x, cell.y);
    if (rHit) {
      select(ui, "room", rHit.id); app.pushUndo();
      drag = { type: "room-move", room: rHit, gx: cell.x - rHit.x, gy: cell.y - rHit.y };
      capture(e); app.commit(); return;
    }
    if (ui.selType) { clearSelection(ui); app.commit(); }
  });

  function placeFurniture(plan, ui, cell, step, e) {
    const def = catalogue[ui.placingKind];
    if (!def) return;
    const w0 = def.wmm / 1000 / cellMeters(plan);
    const h0 = def.hmm / 1000 / cellMeters(plan);
    const item = {
      id: uid(), kind: ui.placingKind, rot: 0,
      x: snapTo(cell.x - w0 / 2, step), y: snapTo(cell.y - h0 / 2, step),
    };
    app.pushUndo();
    plan.furniture.push(item);
    select(ui, "furniture", item.id);
    drag = { type: "furn-move", item, gx: cell.x - item.x, gy: cell.y - item.y };
    capture(e); app.commit();
  }

  // ---------------- pointer move ----------------
  canvas.addEventListener("pointermove", (e) => {
    const plan = app.plan, ui = app.ui;
    const pt = local(e);
    if (!drag) { if (!ui.viewOnly) hoverCursor(plan, ui, pt); return; }

    const cell = pxToCells(plan, pt.x, pt.y);
    const step = snapStep(plan);

    switch (drag.type) {
      case "pan":
        plan.view.panX = drag.panX + (pt.x - drag.sx);
        plan.view.panY = drag.panY + (pt.y - drag.sy);
        app.render();
        break;
      case "room-draw": {
        const cx = Math.round(cell.x), cy = Math.round(cell.y);
        const x = Math.max(0, Math.min(drag.ox, cx));
        const y = Math.max(0, Math.min(drag.oy, cy));
        ui.draft = { x, y, w: Math.abs(cx - drag.ox), h: Math.abs(cy - drag.oy) };
        app.setHud(`Room: ${ui.draft.w} × ${ui.draft.h} cells`);
        app.render();
        break;
      }
      case "room-move": {
        drag.room.x = Math.max(0, Math.round(cell.x - drag.gx));
        drag.room.y = Math.max(0, Math.round(cell.y - drag.gy));
        app.render();
        break;
      }
      case "room-resize": {
        const r = resizeRect(drag.room, drag.handle, Math.round(cell.x), Math.round(cell.y));
        drag.room.x = Math.max(0, r.x); drag.room.y = Math.max(0, r.y);
        drag.room.w = Math.max(1, r.w); drag.room.h = Math.max(1, r.h);
        app.setHud(`Room: ${drag.room.w} × ${drag.room.h} cells`);
        app.render();
        break;
      }
      case "furn-move": {
        drag.item.x = snapTo(cell.x - drag.gx, step);
        drag.item.y = snapTo(cell.y - drag.gy, step);
        app.render();
        break;
      }
      case "compass-move": {
        plan.compass.x = snapTo(cell.x - drag.gx, step);
        plan.compass.y = snapTo(cell.y - drag.gy, step);
        app.render();
        break;
      }
      case "measure": {
        ui.measure.x2 = snapTo(cell.x, step);
        ui.measure.y2 = snapTo(cell.y, step);
        app.render();
        break;
      }
    }
  });

  // ---------------- pointer up ----------------
  function endDrag(e) {
    const plan = app.plan, ui = app.ui;
    if (!drag) return;
    if (drag.type === "room-draw") {
      const d = ui.draft; ui.draft = null;
      if (d && d.w >= 1 && d.h >= 1) {
        app.pushUndo();
        const room = { id: uid(), x: d.x, y: d.y, w: d.w, h: d.h,
                       name: "", group: null, color: nextColor() };
        plan.rooms.push(room);
        select(ui, "room", room.id);
        app.commit();
        app.beginLabelEdit(room);
      } else app.render();
    } else if (drag.type !== "measure") {
      app.commit();
    }
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    canvas.style.cursor = "default";
    drag = null;
    app.setHud("");
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // ---------------- wheel zoom ----------------
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const plan = app.plan, pt = local(e);
    const before = pxToCells(plan, pt.x, pt.y);
    plan.view.zoom = app.clampZoom(plan.view.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    const s = cellPx(plan);
    plan.view.panX = pt.x - before.x * s;
    plan.view.panY = pt.y - before.y * s;
    app.ui.viewOnly ? app.render() : app.commit();
  }, { passive: false });

  // ---------------- double-click: rename room ----------------
  canvas.addEventListener("dblclick", (e) => {
    if (app.ui.viewOnly) return;
    const plan = app.plan, pt = local(e);
    const cell = pxToCells(plan, pt.x, pt.y);
    const hit = roomAt(plan, cell.x, cell.y);
    if (hit) { select(app.ui, "room", hit.id); app.commit(); app.beginLabelEdit(hit); }
  });

  // ---------------- keyboard ----------------
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") spaceDown = true;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    if (app.ui.viewOnly) return;
    const plan = app.plan, ui = app.ui;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); app.redo(); return; }

    if (e.key === "Escape") {
      ui.placingKind = null; ui.measure = null; clearSelection(ui); app.commit(); return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && ui.selType) {
      e.preventDefault(); app.deleteSelected(); return;
    }
    if ((e.key === "r" || e.key === "R") && ui.selType === "furniture") {
      e.preventDefault(); app.rotateSelected(); return;
    }
    if (e.key === "Enter" && ui.selType === "room") {
      e.preventDefault(); const r = plan.rooms.find((x) => x.id === ui.selId);
      if (r) app.beginLabelEdit(r); return;
    }
    if (e.key.startsWith("Arrow") && ui.selType) {
      e.preventDefault();
      const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      app.pushUndo();
      nudge(plan, ui, dx, dy);
      app.commit();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") { spaceDown = false; canvas.style.cursor = "default"; }
  });

  // ---- selection / mutation helpers ----
  function select(ui, type, id) { ui.selType = type; ui.selId = id; }
  function clearSelection(ui) { ui.selType = null; ui.selId = null; }

  function nudge(plan, ui, dx, dy) {
    if (ui.selType === "room") {
      const r = plan.rooms.find((x) => x.id === ui.selId);
      if (r) { r.x = Math.max(0, r.x + dx); r.y = Math.max(0, r.y + dy); }
    } else if (ui.selType === "furniture") {
      const f = plan.furniture.find((x) => x.id === ui.selId);
      const step = snapStep(plan);
      if (f) { f.x += dx * step; f.y += dy * step; }
    } else if (ui.selType === "compass" && plan.compass) {
      const step = snapStep(plan);
      plan.compass.x += dx * step; plan.compass.y += dy * step;
    }
  }

  function capture(e) { try { canvas.setPointerCapture(e.pointerId); } catch {} }

  function hoverCursor(plan, ui, pt) {
    if (spaceDown) { canvas.style.cursor = "grab"; return; }
    let cur = "default";
    const sr = selectedRoom(plan, ui);
    const h = sr && handleAt(plan, sr, pt.x, pt.y);
    if (h) cur = handleCursor(h);
    else if (ui.tool === "room") cur = "crosshair";
    else if (ui.tool === "furniture" && ui.placingKind) cur = "copy";
    else if (ui.tool === "measure") cur = "crosshair";
    else {
      const cell = pxToCells(plan, pt.x, pt.y);
      if (furnitureAt(plan, cell.x, cell.y) || roomAt(plan, cell.x, cell.y)) cur = "move";
    }
    canvas.style.cursor = cur;
  }
}
