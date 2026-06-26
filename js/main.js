// main.js — bootstrap and the `app` object: current plan, ui/tool state, undo,
// and all mutation/render/persist orchestration. DOM wiring lives in ui.js,
// interaction in input.js.

import { scheduleRender, resizeCanvas } from "./render.js";
import { attachInput } from "./input.js";
import { attachUI } from "./ui.js";
import { catalogue, furnitureCells } from "./furniture.js";
import { contentBounds, propertyBounds } from "./rooms.js";
import { pxToCells, snapTo, snapStepFine } from "./grid.js";
import { cellMeters } from "./units.js";
import * as store from "./state.js";
import { exportImage as doExportImage } from "./export.js";
import { encodePlan, sharedParam, decodePlan } from "./share.js";

const canvas = document.getElementById("canvas");

const app = {
  canvas,
  plan: store.makePlan(),
  ui: {
    tool: "room", selType: null, selId: null, selIds: [],
    draft: null, editingLabelId: null, preview: false,
  },
  _undo: store.createUndo(),
};

// ---- render / persist ----
app.render = () => scheduleRender({ canvas, plan: app.plan, ui: app.ui });

let saveTimer = null;
app.save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { store.savePlan(app.plan); app.syncUrl(); }, 350);
};

// Keep the address bar holding an always-current, editable share link. Anyone
// who opens it lands straight in the editor on this exact plan (see boot()).
app.syncUrl = async () => {
  try {
    const enc = await encodePlan(app.plan);
    history.replaceState(null, "", location.pathname + "#view=" + enc);
  } catch (e) { /* URL too long / encode failed — keep the last good hash */ }
};

app.commit = () => {
  app.render();
  app.save();
  app.refreshPanel?.();
  app.refreshArea?.();
};

// ---- undo / redo ----
app.pushUndo = () => app._undo.push(app.plan);
app.undo = () => {
  const prev = app._undo.undo(app.plan);
  if (!prev) return;
  prev.id = app.plan.id; app.plan = prev;
  app.ui.selType = null; app.ui.selId = null; app.ui.selIds = [];
  app.commit();
};
app.redo = () => {
  const next = app._undo.redo(app.plan);
  if (!next) return;
  next.id = app.plan.id; app.plan = next;
  app.ui.selType = null; app.ui.selId = null; app.ui.selIds = [];
  app.commit();
};

// ---- view ----
app.clampZoom = (z) => Math.min(12, Math.max(0.05, z));
app.zoomFit = () => {
  const r = canvas.getBoundingClientRect();
  const b = contentBounds(app.plan);
  const margin = 60;
  const base = app.plan.grid.cell;
  const z = app.clampZoom(Math.min(
    (r.width - margin * 2) / (b.w * base),
    (r.height - margin * 2) / (b.h * base)
  ));
  app.plan.view.zoom = z;
  const fw = b.w * base * z, fh = b.h * base * z;
  app.plan.view.panX = (r.width - fw) / 2 - b.x * base * z;
  app.plan.view.panY = (r.height - fh) / 2 - b.y * base * z;
  app.commit();
};

// ---- tools ----
// One tool is always active (radio). "room" draws rooms (and selects/moves);
// "furniture" opens the palette; "property" edits the background footprint.
// Selecting/moving existing objects works in every tool. Switching clears selection.
app.setTool = (tool) => {
  app.ui.tool = tool;
  app.ui.draft = null;
  app.ui.selType = null; app.ui.selId = null; app.ui.selIds = [];
  app.refreshToolButtons();
  app.render();
};

// Add one piece of furniture near the centre of the view, but kept inside the
// property footprint so it never lands on top of / outside a wall.
app.addFurniture = (kind) => {
  const def = catalogue[kind];
  if (!def) return;
  const r = canvas.getBoundingClientRect();
  const c = pxToCells(app.plan, r.width / 2, r.height / 2);
  const step = snapStepFine(app.plan);
  const w0 = def.wmm / 1000 / cellMeters(app.plan);
  const h0 = def.hmm / 1000 / cellMeters(app.plan);
  let x = c.x - w0 / 2, y = c.y - h0 / 2;
  const b = propertyBounds(app.plan);
  if (b) {
    x = w0 >= b.w ? b.x + (b.w - w0) / 2 : Math.min(Math.max(x, b.x), b.x + b.w - w0);
    y = h0 >= b.h ? b.y + (b.h - h0) / 2 : Math.min(Math.max(y, b.y), b.y + b.h - h0);
  }
  const item = {
    id: store.uid(), kind, rot: 0, scaleX: 1, scaleY: 1, flipX: false, flipY: false,
    label: def.name,                       // default the label to the item's name
    x: snapTo(x, step), y: snapTo(y, step),
  };
  app.pushUndo();
  app.plan.furniture.push(item);
  app.ui.selType = "furniture"; app.ui.selId = item.id;
  app.commit();
  app.toast(`Added ${def.name} — drag to position`);
};
app.setUnits = (u) => { app.plan.units = u; app.refreshToolButtons(); app.commit(); };
// Metres label for a cell count — used in the live draw/resize HUD.
app.fmtCells = (cells) => `${(cells * cellMeters(app.plan)).toFixed(2)} m`;
app.togglePreview = () => {
  if (!app.ui.preview && !app.plan.rooms.length) {
    app.toast("Add rooms first to preview the listing");
    return;
  }
  app.ui.preview = !app.ui.preview;
  if (app.ui.preview) { app.ui.selType = null; app.ui.selId = null; app.ui.selIds = []; }
  app.refreshToolButtons();
  app.commit();
};
app.toggleDimensions = () => {
  app.plan.options.showWallDims = !app.plan.options.showWallDims;
  app.refreshToolButtons();
  app.commit();
};
// Set real wall thickness (mm), drawn to scale. Property outline reads as the
// external building line; rooms inside read as internal/usable space.
app.setWalls = () => {
  const w = app.plan.walls;
  const ext = prompt("External wall thickness (mm):", w.external);
  if (ext === null) return;
  const int = prompt("Internal wall thickness (mm):", w.internal);
  if (int === null) return;
  const e = parseFloat(ext), i = parseFloat(int);
  if (Number.isFinite(e)) w.external = Math.min(600, Math.max(10, Math.round(e)));
  if (Number.isFinite(i)) w.internal = Math.min(600, Math.max(10, Math.round(i)));
  app.commit();
  app.toast(`Walls: ${w.external} mm external · ${w.internal} mm internal`);
};
app.toggleExportFurniture = () => {
  app.plan.options.exportFurniture = !app.plan.options.exportFurniture;
  app.refreshToolButtons();
  app.save();
  app.toast(app.plan.options.exportFurniture
    ? "Furniture will be included in exports"
    : "Furniture left out of exports");
};

// ---- property footprint (edited only in the "property" tool) ----
app.enterPropertyMode = () => app.setTool("property");
app.finishProperty = () => { app.setTool("room"); app.commit(); };

// Reset the whole footprint to a single rectangle of the default floor size.
app.resetPropertyRect = () => {
  app.pushUndo();
  const f = app.plan.floor;
  const rect = { id: store.uid(), x: 0, y: 0, w: f.w, h: f.h };
  app.plan.property = [rect];
  app.ui.selType = "property"; app.ui.selId = rect.id;
  app.commit();
};

// Exact size (metres) for the selected footprint rectangle, typed in the panel.
app.setPropertySize = (wM, hM) => {
  if (app.ui.selType !== "property") return;
  const r = app.plan.property.find((x) => x.id === app.ui.selId);
  if (!r) return;
  const cm = cellMeters(app.plan);
  if (Number.isFinite(wM) && wM > 0) r.w = Math.max(1, Math.round(wM / cm));
  if (Number.isFinite(hM) && hM > 0) r.h = Math.max(1, Math.round(hM / cm));
  app.render(); app.save();
};

// ---- selection ops (shared by input keys and panel buttons) ----
app.deleteSelected = () => {
  const ui = app.ui;
  if (!ui.selType) return;
  app.pushUndo();
  if (ui.selType === "room") {
    const ids = ui.selIds?.length ? ui.selIds : [ui.selId];
    app.plan.rooms = app.plan.rooms.filter((r) => !ids.includes(r.id));
  }
  else if (ui.selType === "furniture") app.plan.furniture = app.plan.furniture.filter((f) => f.id !== ui.selId);
  else if (ui.selType === "property") app.plan.property = app.plan.property.filter((r) => r.id !== ui.selId);
  ui.selType = null; ui.selId = null; ui.selIds = [];
  app.commit();
};
app.rotateSelected = () => {
  if (app.ui.selType !== "furniture") return;
  const f = app.plan.furniture.find((x) => x.id === app.ui.selId);
  if (!f) return;
  app.pushUndo();
  const before = furnitureCells(app.plan, f);
  const cx = f.x + before.w / 2, cy = f.y + before.h / 2;
  f.rot = ((f.rot || 0) + 90) % 360;
  const after = furnitureCells(app.plan, f);
  f.x = cx - after.w / 2; f.y = cy - after.h / 2;
  app.commit();
};
// Exact size (metres) for the selected room, typed in the panel. Snaps to the
// plan's grid precision (50/25/10 mm) — pick a finer grid for millimetre work.
app.setRoomSize = (wM, hM) => {
  if (app.ui.selType !== "room") return;
  const r = app.plan.rooms.find((x) => x.id === app.ui.selId);
  if (!r) return;
  const cm = cellMeters(app.plan);
  if (Number.isFinite(wM) && wM > 0) r.w = Math.max(1, Math.round(wM / cm));
  if (Number.isFinite(hM) && hM > 0) r.h = Math.max(1, Math.round(hM / cm));
  app.render(); app.save(); app.refreshArea?.(); app.refreshPanel?.();
};
app.flipSelected = () => {
  if (app.ui.selType !== "furniture") return;
  const f = app.plan.furniture.find((x) => x.id === app.ui.selId);
  if (!f) return;
  app.pushUndo();
  f.flipX = !f.flipX;
  app.commit();
};
app.setFurnLabel = (text) => {
  if (app.ui.selType !== "furniture") return;
  const f = app.plan.furniture.find((x) => x.id === app.ui.selId);
  if (!f) return;
  f.label = (text || "").slice(0, 40);
  app.render(); app.save();
};

// ---- open-plan merge: merge exactly the rooms you shift-clicked, nothing else ----
app.selectedRooms = () => {
  const ids = app.ui.selType === "room" ? (app.ui.selIds || []) : [];
  return app.plan.rooms.filter((r) => ids.includes(r.id));
};
app.mergeSelected = () => {
  const rooms = app.selectedRooms();
  if (rooms.length < 2) { app.toast("Shift-click two or more rooms, then Merge"); return; }
  app.pushUndo();
  const primary = rooms.find((r) => r.id === app.ui.selId) || rooms[0];
  // Reuse an existing group if any of the picked rooms already belongs to one.
  const group = rooms.find((r) => r.group)?.group || primary.id;
  const distinctNames = new Set(rooms.map((r) => (r.name || "").trim()).filter(Boolean));
  for (const r of rooms) {
    r.group = group;
    r.color = primary.color;                  // unify colour so it reads as one room
    if (distinctNames.size > 1) r.name = "";  // conflicting labels -> clear, re-label once
  }
  app.commit();
  app.toast(`Merged ${rooms.length} rooms (open-plan)`);
};
app.unmergeSelected = () => {
  const rooms = app.selectedRooms();
  if (!rooms.some((r) => r.group)) return;
  app.pushUndo();
  for (const r of rooms) r.group = null;
  app.commit();
};

// ---- clipboard: copy/paste rooms, furniture and property sections ----
app.clipboard = null;
app.copySelected = () => {
  const ui = app.ui;
  if (ui.selType === "room") {
    const ids = ui.selIds?.length ? ui.selIds : [ui.selId];
    const items = app.plan.rooms.filter((r) => ids.includes(r.id)).map((r) => ({ ...r }));
    if (!items.length) return;
    app.clipboard = { type: "room", items };
  } else if (ui.selType === "furniture") {
    const f = app.plan.furniture.find((x) => x.id === ui.selId);
    if (!f) return;
    app.clipboard = { type: "furniture", items: [{ ...f }] };
  } else if (ui.selType === "property") {
    const r = app.plan.property.find((x) => x.id === ui.selId);
    if (!r) return;
    app.clipboard = { type: "property", items: [{ ...r }] };
  } else return;
  app.toast("Copied — Ctrl+V to paste");
};
app.pasteClipboard = () => {
  const cb = app.clipboard;
  if (!cb || !cb.items?.length) return;
  app.pushUndo();
  const off = Math.max(1, Math.round(0.5 / cellMeters(app.plan))); // ~0.5 m offset
  if (cb.type === "room") {
    const groupMap = {}; const newIds = [];
    for (const src of cb.items) {
      const id = store.uid();
      const group = src.group ? (groupMap[src.group] || (groupMap[src.group] = store.uid())) : null;
      app.plan.rooms.push({ ...src, id, x: Math.max(0, src.x + off), y: Math.max(0, src.y + off), group });
      newIds.push(id);
    }
    app.ui.selType = "room"; app.ui.selIds = newIds; app.ui.selId = newIds[newIds.length - 1];
  } else if (cb.type === "furniture") {
    const src = cb.items[0], id = store.uid();
    app.plan.furniture.push({ ...src, id, x: src.x + off, y: src.y + off });
    app.ui.selType = "furniture"; app.ui.selId = id; app.ui.selIds = [id];
  } else if (cb.type === "property") {
    const src = cb.items[0], id = store.uid();
    app.plan.property.push({ ...src, id, x: Math.max(0, src.x + off), y: Math.max(0, src.y + off) });
    app.ui.selType = "property"; app.ui.selId = id; app.ui.selIds = [id];
  }
  app.commit();
  app.toast("Pasted");
};

// ---- export ----
app.exportImage = (type) => {
  if (!app.plan.rooms.length) { app.toast("Add rooms before exporting"); return; }
  doExportImage(app.plan, { type, includeFurniture: app.plan.options.exportFurniture });
};

// ---- plan lifecycle ----
app.setPlan = (plan, { fit = true } = {}) => {
  app.plan = plan;
  app.ui.tool = "room";
  app.ui.selType = null; app.ui.selId = null; app.ui.selIds = [];
  app.ui.draft = null; app.ui.editingLabelId = null;
  app._undo = store.createUndo();
  store.savePlan(plan);
  app.refreshPlanList?.();
  app.refreshToolButtons?.();
  if (fit) app.zoomFit(); else app.commit();
};
app.newPlan = (opts) => app.setPlan(store.makePlan(opts));
app.switchPlan = (id) => { const p = store.loadPlan(id); if (p) app.setPlan(p); };
app.renamePlan = (name) => {
  if (!name || !name.trim()) return;
  app.plan.name = name.trim();
  store.savePlan(app.plan);
  app.refreshPlanList?.();
};
app.deleteCurrentPlan = () => {
  store.deletePlan(app.plan.id);
  const idx = store.loadIndex();
  if (idx.length) app.switchPlan(idx[0].id);
  else app.openSetup(true);
  app.refreshPlanList?.();
};

// ---- boot ----
attachUI(app);
attachInput(app);

window.addEventListener("resize", () => { resizeCanvas(canvas); app.render(); });

async function boot() {
  resizeCanvas(canvas);
  const shared = sharedParam();
  if (shared) {
    try {
      const raw = await decodePlan(shared);
      const plan = store.normalizePlan(raw);
      // Load the shared plan straight into the editor. It's saved locally under
      // its own id, so re-opening the same link reuses it (no duplicates), and
      // edits flow back into the URL via app.syncUrl().
      store.savePlan(plan);
      app.plan = plan;
      app.refreshPlanList();
      app.refreshToolButtons();
      app.zoomFit();
      return;
    } catch (e) {
      console.warn("Bad share link:", e);
    }
  }
  const lastId = store.lastPlanId();
  let plan = lastId ? store.loadPlan(lastId) : null;
  if (!plan) { const idx = store.loadIndex(); if (idx.length) plan = store.loadPlan(idx[0].id); }
  if (plan) {
    app.plan = plan;
    store.savePlan(plan);
    app.refreshPlanList();
    app.refreshToolButtons();
    app.zoomFit();
  } else {
    app.refreshToolButtons();
    app.render();
    app.openSetup(true);
  }
}

boot();

// ---- offline / installable (PWA) ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed:", e));
  });
}
