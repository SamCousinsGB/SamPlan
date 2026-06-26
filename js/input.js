// input.js — pointer + keyboard interaction. Selection (click/move/resize) is the
// always-on ground state. The "room" tool arms rectangle drawing; "furniture" opens
// the palette; "property" edits the locked background footprint. Outside the
// property tool the footprint is inert — clicks fall through to rooms.

import {
  pxToCells, snapTo, snapStep, snapStepFine, cellPx,
  handleAt, handleCursor, resizeRect, resizeRectFlip,
} from "./grid.js";
import { roomAt, propertyRectAt, propertyRects } from "./rooms.js";
import { furnitureCells, catalogue } from "./furniture.js";
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
  function selectedRoom(plan, ui) {
    return ui.selType === "room" ? plan.rooms.find((r) => r.id === ui.selId) : null;
  }
  function selectedProp(plan, ui) {
    return ui.selType === "property" ? propertyRects(plan).find((r) => r.id === ui.selId) : null;
  }
  function selectedFurniture(plan, ui) {
    return ui.selType === "furniture" ? plan.furniture.find((f) => f.id === ui.selId) : null;
  }
  // Resize handle of a furniture item (its axis-aligned bounding box).
  function furnitureHandleAt(plan, item, px, py) {
    const bb = furnitureCells(plan, item);
    return handleAt(plan, { x: item.x, y: item.y, w: bb.w, h: bb.h }, px, py);
  }
  // A mirror across a screen axis maps to a local flip that depends on rotation
  // (at 90°/270° the item's local axes are swapped on screen).
  function flipScreenX(item) {
    if (((item.rot || 0) / 90) % 2 === 0) item.flipX = !item.flipX; else item.flipY = !item.flipY;
  }
  function flipScreenY(item) {
    if (((item.rot || 0) / 90) % 2 === 0) item.flipY = !item.flipY; else item.flipX = !item.flipX;
  }

  // Clamp a resized rect into the x,y >= 0 region WITHOUT moving the opposite
  // edge: if the left/top edge crossed the origin, pin it to 0 and shrink the
  // span instead of keeping the (now wrong) width. Writes back onto `rect`.
  function applyResize(rect, handle, cell, step) {
    const r = resizeRect(rect, handle, snapTo(cell.x, step), snapTo(cell.y, step));
    let { x, y, w, h } = r;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    rect.x = x; rect.y = y;
    rect.w = Math.max(1, w); rect.h = Math.max(1, h);
  }

  // ---------------- pointer down ----------------
  canvas.addEventListener("pointerdown", (e) => {
    const plan = app.plan, ui = app.ui;
    const pt = local(e);

    // Pan: right mouse, middle mouse, or space+left.
    if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceDown)) {
      drag = { type: "pan", sx: pt.x, sy: pt.y, panX: plan.view.panX, panY: plan.view.panY };
      capture(e); canvas.style.cursor = "grabbing"; e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const cell = pxToCells(plan, pt.x, pt.y);
    const step = snapStep(plan);

    // ---- property tool: edit the footprint rectangles (locked elsewhere) ----
    if (ui.tool === "property") {
      const sp = selectedProp(plan, ui);
      if (sp) {
        const h = handleAt(plan, sp, pt.x, pt.y);
        if (h) { app.pushUndo(); drag = { type: "prop-resize", handle: h, rect: sp }; capture(e); return; }
      }
      const hit = propertyRectAt(plan, cell.x, cell.y);
      if (hit) { select(ui, "property", hit.id); app.pushUndo();
        drag = { type: "prop-move", rect: hit, gx: cell.x - hit.x, gy: cell.y - hit.y };
        capture(e); app.commit(); return; }
      const ox = snapTo(cell.x, step), oy = snapTo(cell.y, step);
      ui.draft = { x: ox, y: oy, w: 0, h: 0 };
      drag = { type: "prop-draw", ox, oy };
      capture(e); return;
    }

    // Resize handle of the currently selected room.
    const sr = selectedRoom(plan, ui);
    if (sr) {
      const h = handleAt(plan, sr, pt.x, pt.y);
      if (h) { app.pushUndo(); drag = { type: "room-resize", handle: h, room: sr }; capture(e); return; }
    }

    // Resize handle of the currently selected furniture.
    const sf = selectedFurniture(plan, ui);
    if (sf) {
      const h = furnitureHandleAt(plan, sf, pt.x, pt.y);
      if (h) { app.pushUndo(); drag = { type: "furn-resize", handle: h, item: sf }; capture(e); return; }
    }

    // Furniture is always selectable/movable in select/room/furniture tools.
    const fHit = furnitureAt(plan, cell.x, cell.y);
    if (fHit) {
      select(ui, "furniture", fHit.id); app.pushUndo();
      drag = { type: "furn-move", item: fHit, gx: cell.x - fHit.x, gy: cell.y - fHit.y };
      capture(e); app.commit(); return;
    }

    if (ui.tool === "room") {
      const hit = roomAt(plan, cell.x, cell.y);
      if (hit) {
        if (e.shiftKey) { toggleRoom(ui, hit.id); app.render(); app.refreshPanel?.(); return; }
        select(ui, "room", hit.id); app.pushUndo();
        drag = { type: "room-move", room: hit, gx: cell.x - hit.x, gy: cell.y - hit.y };
        capture(e); app.commit(); return;
      }
      // draw a new room (snaps to the adaptive grid)
      const ox = snapTo(cell.x, step), oy = snapTo(cell.y, step);
      ui.draft = { x: ox, y: oy, w: 0, h: 0 };
      drag = { type: "room-draw", ox, oy };
      capture(e); return;
    }

    // ---- ground state: select / move a room, or clear ----
    const rHit = roomAt(plan, cell.x, cell.y);
    if (rHit) {
      if (e.shiftKey) { toggleRoom(ui, rHit.id); app.render(); app.refreshPanel?.(); return; }
      select(ui, "room", rHit.id); app.pushUndo();
      drag = { type: "room-move", room: rHit, gx: cell.x - rHit.x, gy: cell.y - rHit.y };
      capture(e); app.commit(); return;
    }
    if (ui.selType && !e.shiftKey) { clearSelection(ui); app.commit(); }
  });

  // ---------------- pointer move ----------------
  canvas.addEventListener("pointermove", (e) => {
    const plan = app.plan, ui = app.ui;
    const pt = local(e);
    if (!drag) { hoverCursor(plan, ui, pt); return; }

    const cell = pxToCells(plan, pt.x, pt.y);
    const step = snapStep(plan);

    switch (drag.type) {
      case "pan":
        plan.view.panX = drag.panX + (pt.x - drag.sx);
        plan.view.panY = drag.panY + (pt.y - drag.sy);
        app.render();
        break;
      case "room-draw": {
        const cx = snapTo(cell.x, step), cy = snapTo(cell.y, step);
        const x = Math.max(0, Math.min(drag.ox, cx));
        const y = Math.max(0, Math.min(drag.oy, cy));
        ui.draft = { x, y, w: Math.abs(cx - drag.ox), h: Math.abs(cy - drag.oy) };
        app.setHud(`Room: ${app.fmtCells(ui.draft.w)} × ${app.fmtCells(ui.draft.h)}`);
        app.render();
        break;
      }
      case "room-move": {
        drag.room.x = Math.max(0, snapTo(cell.x - drag.gx, step));
        drag.room.y = Math.max(0, snapTo(cell.y - drag.gy, step));
        app.render();
        break;
      }
      case "room-resize": {
        applyResize(drag.room, drag.handle, cell, step);
        app.setHud(`Room: ${app.fmtCells(drag.room.w)} × ${app.fmtCells(drag.room.h)}`);
        app.render();
        break;
      }
      case "furn-move": {
        const fstep = snapStepFine(plan);
        drag.item.x = snapTo(cell.x - drag.gx, fstep);
        drag.item.y = snapTo(cell.y - drag.gy, fstep);
        app.render();
        break;
      }
      case "furn-resize": {
        const item = drag.item, def = catalogue[item.kind];
        if (!def) break;
        const fstep = snapStepFine(plan);
        const bb = furnitureCells(plan, item);
        // Allow dragging past the opposite edge: the item flips instead of jamming.
        const r = resizeRectFlip({ x: item.x, y: item.y, w: bb.w, h: bb.h },
          drag.handle, snapTo(cell.x, fstep), snapTo(cell.y, fstep), Math.max(fstep, 0.5));
        item.x = r.x; item.y = r.y;
        if (r.flipX) flipScreenX(item);
        if (r.flipY) flipScreenY(item);
        drag.handle = r.handle;  // follow the handle through the flip
        const cm = cellMeters(plan);
        const rotated = ((item.rot || 0) / 90) % 2 !== 0;
        const localW = rotated ? r.h : r.w, localH = rotated ? r.w : r.h;
        item.scaleX = Math.max(0.05, localW / (def.wmm / 1000 / cm));
        item.scaleY = Math.max(0.05, localH / (def.hmm / 1000 / cm));
        app.setHud(`${def.name}: ${app.fmtCells(r.w)} × ${app.fmtCells(r.h)}`);
        app.render();
        break;
      }
      case "prop-draw": {
        const cx = snapTo(cell.x, step), cy = snapTo(cell.y, step);
        const x = Math.max(0, Math.min(drag.ox, cx));
        const y = Math.max(0, Math.min(drag.oy, cy));
        ui.draft = { x, y, w: Math.abs(cx - drag.ox), h: Math.abs(cy - drag.oy) };
        app.setHud(`Property section: ${app.fmtCells(ui.draft.w)} × ${app.fmtCells(ui.draft.h)}`);
        app.render();
        break;
      }
      case "prop-move": {
        drag.rect.x = Math.max(0, snapTo(cell.x - drag.gx, step));
        drag.rect.y = Math.max(0, snapTo(cell.y - drag.gy, step));
        app.render();
        break;
      }
      case "prop-resize": {
        applyResize(drag.rect, drag.handle, cell, step);
        app.setHud(`Property section: ${app.fmtCells(drag.rect.w)} × ${app.fmtCells(drag.rect.h)}`);
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
      } else { clearSelection(ui); app.commit(); } // a click on empty deselects
    } else if (drag.type === "prop-draw") {
      const d = ui.draft; ui.draft = null;
      if (d && d.w >= 1 && d.h >= 1) {
        app.pushUndo();
        const rect = { id: uid(), x: d.x, y: d.y, w: d.w, h: d.h };
        plan.property.push(rect);
        select(ui, "property", rect.id);
        app.commit();
      } else { clearSelection(ui); app.commit(); }
    } else {
      app.commit();
    }
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    canvas.style.cursor = "default";
    drag = null;
    app.setHud("");
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  // Right-drag pans, so suppress the canvas context menu.
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---------------- wheel zoom ----------------
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const plan = app.plan, pt = local(e);
    const before = pxToCells(plan, pt.x, pt.y);
    plan.view.zoom = app.clampZoom(plan.view.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    const s = cellPx(plan);
    plan.view.panX = pt.x - before.x * s;
    plan.view.panY = pt.y - before.y * s;
    app.commit();
  }, { passive: false });

  // ---------------- double-click: rename room ----------------
  canvas.addEventListener("dblclick", (e) => {
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
    const plan = app.plan, ui = app.ui;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); app.redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { e.preventDefault(); app.copySelected(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") { e.preventDefault(); app.pasteClipboard(); return; }

    if (e.key === "Escape") {
      ui.draft = null;
      clearSelection(ui); app.commit(); return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && ui.selType) {
      e.preventDefault(); app.deleteSelected(); return;
    }
    if ((e.key === "r" || e.key === "R") && ui.selType === "furniture") {
      e.preventDefault(); app.rotateSelected(); return;
    }
    if ((e.key === "f" || e.key === "F") && ui.selType === "furniture") {
      e.preventDefault(); app.flipSelected(); return;
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
  function select(ui, type, id) { ui.selType = type; ui.selId = id; ui.selIds = [id]; }
  function clearSelection(ui) { ui.selType = null; ui.selId = null; ui.selIds = []; }
  // Shift-click toggles a room in/out of the multi-selection (for open-plan merge).
  function toggleRoom(ui, id) {
    ui.selType = "room";
    if (!Array.isArray(ui.selIds)) ui.selIds = [];
    const i = ui.selIds.indexOf(id);
    if (i >= 0) {
      ui.selIds.splice(i, 1);
      ui.selId = ui.selIds[ui.selIds.length - 1] || null;
      if (!ui.selIds.length) ui.selType = null;
    } else {
      ui.selIds.push(id);
      ui.selId = id;
    }
  }

  function nudge(plan, ui, dx, dy) {
    if (ui.selType === "room") {
      const ids = ui.selIds?.length ? ui.selIds : [ui.selId];
      for (const id of ids) {
        const r = plan.rooms.find((x) => x.id === id);
        if (r) { r.x = Math.max(0, r.x + dx); r.y = Math.max(0, r.y + dy); }
      }
    } else if (ui.selType === "property") {
      const r = selectedProp(plan, ui);
      if (r) { r.x = Math.max(0, r.x + dx); r.y = Math.max(0, r.y + dy); }
    } else if (ui.selType === "furniture") {
      const f = plan.furniture.find((x) => x.id === ui.selId);
      if (f) { f.x += dx; f.y += dy; } // nudge by one cell (50 mm)
    }
  }

  function capture(e) { try { canvas.setPointerCapture(e.pointerId); } catch {} }

  function hoverCursor(plan, ui, pt) {
    if (spaceDown) { canvas.style.cursor = "grab"; return; }
    const cell = pxToCells(plan, pt.x, pt.y);
    let cur = "default";

    if (ui.tool === "property") {
      const sp = selectedProp(plan, ui);
      const ph = sp && handleAt(plan, sp, pt.x, pt.y);
      if (ph) cur = handleCursor(ph);
      else cur = propertyRectAt(plan, cell.x, cell.y) ? "move" : "crosshair";
      canvas.style.cursor = cur;
      return;
    }

    const sr = selectedRoom(plan, ui);
    const h = sr && handleAt(plan, sr, pt.x, pt.y);
    const sf = selectedFurniture(plan, ui);
    const fh = sf && furnitureHandleAt(plan, sf, pt.x, pt.y);
    if (h) cur = handleCursor(h);
    else if (fh) cur = handleCursor(fh);
    else if (furnitureAt(plan, cell.x, cell.y)) cur = "move";
    else if (ui.tool === "room") cur = roomAt(plan, cell.x, cell.y) ? "move" : "crosshair";
    else if (roomAt(plan, cell.x, cell.y)) cur = "move";
    canvas.style.cursor = cur;
  }
}
