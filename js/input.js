// input.js — pointer + keyboard interaction. Reads/writes app.plan and app.ui,
// and calls back into app for rendering, autosave, undo and label editing.
//
// app shape used here:
//   app.canvas, app.plan, app.ui
//   app.render()        -> schedule a redraw (no save) — for transient drags
//   app.commit()        -> redraw + autosave + refresh side panel
//   app.pushUndo()      -> snapshot current plan for undo
//   app.beginLabelEdit(box)
//   app.setHud(text)
//   app.clampZoom(z)

import {
  pxToCells, snap, clampBoxToFloor, boxAt,
  handleAt, handleCursor, resizeRect, cellPx,
} from "./grid.js";
import { uid, nextColor } from "./state.js";

const MIN_DRAW_CELLS = 1;

export function attachInput(app) {
  const canvas = app.canvas;
  let spaceDown = false;
  let drag = null; // {type, ...}

  function localPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ---------------- pointer down ----------------
  canvas.addEventListener("pointerdown", (e) => {
    canvas.focus?.();
    const plan = app.plan;
    const ui = app.ui;
    const pt = localPoint(e);

    // Pan: middle mouse, or space + left.
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      drag = { type: "pan", startX: pt.x, startY: pt.y,
               panX: plan.view.panX, panY: plan.view.panY };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const cell = pxToCells(plan, pt.x, pt.y);

    if (ui.mode === "floor") {
      // Resize the floor via its handles.
      const floorRect = { x: 0, y: 0, w: plan.floor.w, h: plan.floor.h };
      const handle = handleAt(plan, floorRect, pt.x, pt.y);
      if (handle) {
        app.pushUndo();
        drag = { type: "floor-resize", handle };
        canvas.setPointerCapture(e.pointerId);
      }
      return;
    }

    // ---- edit mode ----
    const sel = plan.boxes.find((b) => b.id === ui.selectedId);
    if (sel) {
      const handle = handleAt(plan, sel, pt.x, pt.y);
      if (handle) {
        app.pushUndo();
        drag = { type: "box-resize", handle, box: sel };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
    }

    const hit = boxAt(plan.boxes, cell.x, cell.y);
    if (hit) {
      ui.selectedId = hit.id;
      app.pushUndo();
      drag = {
        type: "box-move",
        box: hit,
        grabDX: cell.x - hit.x,
        grabDY: cell.y - hit.y,
      };
      canvas.setPointerCapture(e.pointerId);
      app.commit();
      return;
    }

    // Empty space inside the floor: start drawing a new box.
    if (cell.x >= 0 && cell.y >= 0 && cell.x < plan.floor.w && cell.y < plan.floor.h) {
      ui.selectedId = null;
      drag = { type: "draw", ox: snap(cell.x), oy: snap(cell.y) };
      canvas.setPointerCapture(e.pointerId);
      app.commit();
    } else {
      // clicked outside floor: deselect
      if (ui.selectedId) { ui.selectedId = null; app.commit(); }
    }
  });

  // ---------------- pointer move ----------------
  canvas.addEventListener("pointermove", (e) => {
    const plan = app.plan;
    const ui = app.ui;
    const pt = localPoint(e);

    if (!drag) {
      updateHoverCursor(plan, ui, pt);
      return;
    }

    const cell = pxToCells(plan, pt.x, pt.y);

    switch (drag.type) {
      case "pan": {
        plan.view.panX = drag.panX + (pt.x - drag.startX);
        plan.view.panY = drag.panY + (pt.y - drag.startY);
        app.render();
        break;
      }
      case "floor-resize": {
        const r = resizeRect(
          { x: 0, y: 0, w: plan.floor.w, h: plan.floor.h },
          drag.handle, snap(cell.x), snap(cell.y)
        );
        // Floor stays anchored at origin; only width/height grow from 0,0.
        plan.floor.w = Math.max(1, r.x + r.w);
        plan.floor.h = Math.max(1, r.y + r.h);
        app.setHud(`Floor: ${plan.floor.w} × ${plan.floor.h} cells`);
        app.render();
        break;
      }
      case "box-resize": {
        const r = resizeRect(drag.box, drag.handle, snap(cell.x), snap(cell.y));
        Object.assign(drag.box, clampBoxToFloor(r, plan.floor));
        app.setHud(`Box: ${drag.box.w} × ${drag.box.h} cells`);
        app.render();
        break;
      }
      case "box-move": {
        const nx = snap(cell.x - drag.grabDX);
        const ny = snap(cell.y - drag.grabDY);
        Object.assign(drag.box, clampBoxToFloor({ ...drag.box, x: nx, y: ny }, plan.floor));
        app.setHud(`Box at ${drag.box.x}, ${drag.box.y}`);
        app.render();
        break;
      }
      case "draw": {
        const cx = snap(cell.x);
        const cy = snap(cell.y);
        const x = Math.max(0, Math.min(drag.ox, cx));
        const y = Math.max(0, Math.min(drag.oy, cy));
        const x2 = Math.min(plan.floor.w, Math.max(drag.ox, cx));
        const y2 = Math.min(plan.floor.h, Math.max(drag.oy, cy));
        ui.draft = { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
        app.setHud(`New box: ${ui.draft.w} × ${ui.draft.h} cells`);
        app.render();
        break;
      }
    }
  });

  // ---------------- pointer up ----------------
  function endDrag(e) {
    const plan = app.plan;
    const ui = app.ui;
    if (!drag) return;

    if (drag.type === "draw" && ui.draft) {
      const d = ui.draft;
      ui.draft = null;
      if (d.w >= MIN_DRAW_CELLS && d.h >= MIN_DRAW_CELLS) {
        app.pushUndo();
        const box = { id: uid(), x: d.x, y: d.y, w: d.w, h: d.h,
                      label: "", color: nextColor() };
        plan.boxes.push(box);
        ui.selectedId = box.id;
        app.commit();
        app.beginLabelEdit(box); // jump straight to naming it
      } else {
        app.render();
      }
    } else if (drag.type === "pan") {
      app.commit(); // persist view
    } else {
      app.commit(); // move/resize finished -> autosave
    }

    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    canvas.style.cursor = "default";
    drag = null;
    app.setHud("");
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // ---------------- wheel zoom (toward cursor) ----------------
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const plan = app.plan;
    const pt = localPoint(e);
    const before = pxToCells(plan, pt.x, pt.y);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    plan.view.zoom = app.clampZoom(plan.view.zoom * factor);
    // Keep the cell under the cursor fixed on screen.
    const s = cellPx(plan);
    plan.view.panX = pt.x - before.x * s;
    plan.view.panY = pt.y - before.y * s;
    app.commit();
  }, { passive: false });

  // ---------------- double-click: edit label ----------------
  canvas.addEventListener("dblclick", (e) => {
    const plan = app.plan;
    if (app.ui.mode !== "edit") return;
    const pt = localPoint(e);
    const cell = pxToCells(plan, pt.x, pt.y);
    const hit = boxAt(plan.boxes, cell.x, cell.y);
    if (hit) {
      app.ui.selectedId = hit.id;
      app.commit();
      app.beginLabelEdit(hit);
    }
  });

  // ---------------- keyboard ----------------
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") spaceDown = true;

    // Don't hijack typing in inputs/dialogs.
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;

    const plan = app.plan;
    const ui = app.ui;

    // Undo / redo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) app.redo(); else app.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault(); app.redo(); return;
    }

    if (ui.mode !== "edit") return;
    const sel = plan.boxes.find((b) => b.id === ui.selectedId);

    if ((e.key === "Delete" || e.key === "Backspace") && sel) {
      e.preventDefault();
      app.pushUndo();
      plan.boxes = plan.boxes.filter((b) => b.id !== sel.id);
      ui.selectedId = null;
      app.commit();
      return;
    }
    if (e.key === "Escape" && ui.selectedId) {
      ui.selectedId = null; app.commit(); return;
    }
    if (sel && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      app.pushUndo();
      Object.assign(sel, clampBoxToFloor({ ...sel, x: sel.x + dx, y: sel.y + dy }, plan.floor));
      app.commit();
    }
    if (e.key === "Enter" && sel) {
      e.preventDefault();
      app.beginLabelEdit(sel);
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") { spaceDown = false; canvas.style.cursor = "default"; }
  });

  function updateHoverCursor(plan, ui, pt) {
    if (spaceDown) { canvas.style.cursor = "grab"; return; }
    let cur = "default";
    if (ui.mode === "floor") {
      const h = handleAt(plan, { x: 0, y: 0, w: plan.floor.w, h: plan.floor.h }, pt.x, pt.y);
      if (h) cur = handleCursor(h);
    } else {
      const sel = plan.boxes.find((b) => b.id === ui.selectedId);
      const h = sel && handleAt(plan, sel, pt.x, pt.y);
      if (h) cur = handleCursor(h);
      else {
        const cell = pxToCells(plan, pt.x, pt.y);
        cur = boxAt(plan.boxes, cell.x, cell.y) ? "move" : "crosshair";
      }
    }
    canvas.style.cursor = cur;
  }
}
