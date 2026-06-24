// main.js — bootstrap and the `app` object: current plan, ui/tool state, undo,
// and all mutation/render/persist orchestration. DOM wiring lives in ui.js,
// interaction in input.js.

import { scheduleRender, resizeCanvas } from "./render.js";
import { attachInput } from "./input.js";
import { attachUI } from "./ui.js";
import { furnitureCells } from "./furniture.js";
import { contentBounds } from "./rooms.js";
import * as store from "./state.js";
import { exportImage as doExportImage } from "./export.js";
import { makeShareLink, sharedParam, decodePlan } from "./share.js";

const canvas = document.getElementById("canvas");

const app = {
  canvas,
  plan: store.makePlan(),
  ui: {
    tool: "select", selType: null, selId: null,
    draft: null, placingKind: null, measure: null,
    editingLabelId: null, preview: false, viewOnly: false,
  },
  _undo: store.createUndo(),
};

// ---- render / persist ----
app.render = () => scheduleRender({ canvas, plan: app.plan, ui: app.ui });

let saveTimer = null;
app.save = () => {
  if (app.ui.viewOnly) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.savePlan(app.plan), 350);
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
  app.ui.selType = null; app.ui.selId = null;
  app.commit();
};
app.redo = () => {
  const next = app._undo.redo(app.plan);
  if (!next) return;
  next.id = app.plan.id; app.plan = next;
  app.ui.selType = null; app.ui.selId = null;
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
app.setTool = (tool) => {
  app.ui.tool = tool;
  if (tool !== "furniture") app.ui.placingKind = null;
  if (tool !== "measure") app.ui.measure = null;
  app.refreshToolButtons();
  app.refreshPalette?.();
  app.render();
};
app.setUnits = (u) => { app.plan.units = u; app.refreshToolButtons(); app.commit(); };
app.togglePreview = () => {
  app.ui.preview = !app.ui.preview;
  if (app.ui.preview) { app.ui.selType = null; app.ui.selId = null; }
  app.refreshToolButtons();
  app.commit();
};

// ---- selection ops (shared by input keys and panel buttons) ----
app.deleteSelected = () => {
  const ui = app.ui;
  if (!ui.selType) return;
  app.pushUndo();
  if (ui.selType === "room") app.plan.rooms = app.plan.rooms.filter((r) => r.id !== ui.selId);
  else if (ui.selType === "furniture") app.plan.furniture = app.plan.furniture.filter((f) => f.id !== ui.selId);
  else if (ui.selType === "compass") app.plan.compass = null;
  ui.selType = null; ui.selId = null;
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

// ---- open-plan merge (connected cluster of touching rooms) ----
function touching(a, b) {
  const ax2 = a.x + a.w, ay2 = a.y + a.h, bx2 = b.x + b.w, by2 = b.y + b.h;
  const h = (a.x === bx2 || ax2 === b.x) && (a.y < by2 && ay2 > b.y);
  const v = (a.y === by2 || ay2 === b.y) && (a.x < bx2 && ax2 > b.x);
  return h || v;
}
app.mergeSelected = () => {
  if (app.ui.selType !== "room") { app.toast("Select a room first"); return; }
  const sel = app.plan.rooms.find((r) => r.id === app.ui.selId);
  if (!sel) return;
  const cluster = new Set([sel.id]);
  let added = true;
  while (added) {
    added = false;
    for (const r of app.plan.rooms) {
      if (cluster.has(r.id)) continue;
      for (const id of cluster) {
        const o = app.plan.rooms.find((x) => x.id === id);
        if (o && touching(r, o)) { cluster.add(r.id); added = true; break; }
      }
    }
  }
  if (cluster.size < 2) { app.toast("No adjacent room to merge with"); return; }
  app.pushUndo();
  const group = sel.group || sel.id;
  for (const r of app.plan.rooms) if (cluster.has(r.id)) r.group = group;
  app.commit();
  app.toast("Rooms merged (open-plan)");
};
app.unmergeSelected = () => {
  if (app.ui.selType !== "room") return;
  const r = app.plan.rooms.find((x) => x.id === app.ui.selId);
  if (!r || !r.group) return;
  app.pushUndo();
  r.group = null;
  app.commit();
};

// ---- export / share ----
app.exportImage = (type) => doExportImage(app.plan, { type, includeFurniture: false });

app.share = async () => {
  let link;
  try {
    link = await makeShareLink(app.plan);
    if (link.length > 14000) app.toast("Large plan — link may be too long for some browsers");
    await navigator.clipboard.writeText(link);
    app.toast("View-only link copied to clipboard");
  } catch (e) {
    console.warn(e);
    if (link) prompt("Copy this view-only link:", link);
  }
};

app.makeCopyToEdit = () => {
  const clone = store.normalizePlan({
    ...app.plan, id: undefined,
    name: (app.plan.name || "Floorplan") + " (copy)",
  });
  history.replaceState(null, "", location.pathname);
  document.body.classList.remove("viewonly");
  document.getElementById("viewonly-bar").hidden = true;
  app.ui.viewOnly = false; app.ui.preview = false;
  app.setPlan(clone);
  app.refreshToolButtons();
};

// ---- plan lifecycle ----
app.setPlan = (plan, { fit = true } = {}) => {
  app.plan = plan;
  app.ui.selType = null; app.ui.selId = null;
  app.ui.draft = null; app.ui.measure = null;
  app.ui.placingKind = null; app.ui.editingLabelId = null;
  app._undo = store.createUndo();
  if (!app.ui.viewOnly) store.savePlan(plan);
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
      app.plan = store.normalizePlan(raw);
      app.ui.viewOnly = true;
      app.ui.preview = true;
      app.enterViewOnly();
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
