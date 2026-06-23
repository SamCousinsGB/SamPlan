// main.js — bootstrap. Owns the `app` object: current plan, ui state, undo,
// and the core mutation/render/persist methods. Delegates DOM wiring to ui.js
// and interaction to input.js.

import { scheduleRender, resizeCanvas } from "./render.js";
import { attachInput } from "./input.js";
import { attachUI } from "./ui.js";
import { pxToCells, cellPx } from "./grid.js";
import * as store from "./state.js";

const canvas = document.getElementById("canvas");

const app = {
  canvas,
  plan: store.makePlan(),
  ui: { mode: "edit", selectedId: null, draft: null, editingLabelId: null },
  _undo: store.createUndo(),
};

// ---- render / persist ----
app.render = () => scheduleRender({ canvas, plan: app.plan, ui: app.ui });

let saveTimer = null;
app.save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.savePlan(app.plan), 350);
};

app.commit = () => {
  app.render();
  app.save();
  app.refreshPanel?.();
};

// ---- undo / redo ----
app.pushUndo = () => app._undo.push(app.plan);

app.undo = () => {
  const prev = app._undo.undo(app.plan);
  if (!prev) return;
  prev.id = app.plan.id;
  app.plan = prev;
  app.ui.selectedId = null;
  app.commit();
};
app.redo = () => {
  const next = app._undo.redo(app.plan);
  if (!next) return;
  next.id = app.plan.id;
  app.plan = next;
  app.ui.selectedId = null;
  app.commit();
};

// ---- view ----
app.clampZoom = (z) => Math.min(6, Math.max(0.2, z));

app.zoomBy = (factor) => {
  const r = canvas.getBoundingClientRect();
  const cx = r.width / 2, cy = r.height / 2;
  const before = pxToCells(app.plan, cx, cy);
  app.plan.view.zoom = app.clampZoom(app.plan.view.zoom * factor);
  const s = cellPx(app.plan);
  app.plan.view.panX = cx - before.x * s;
  app.plan.view.panY = cy - before.y * s;
  app.commit();
};

app.zoomFit = () => {
  const r = canvas.getBoundingClientRect();
  const margin = 48;
  const base = app.plan.grid.cell;
  const zw = (r.width - margin * 2) / (app.plan.floor.w * base);
  const zh = (r.height - margin * 2) / (app.plan.floor.h * base);
  const z = app.clampZoom(Math.min(zw, zh));
  app.plan.view.zoom = z;
  const fw = app.plan.floor.w * base * z;
  const fh = app.plan.floor.h * base * z;
  app.plan.view.panX = (r.width - fw) / 2;
  app.plan.view.panY = (r.height - fh) / 2;
  app.commit();
};

// ---- mode ----
app.setMode = (mode) => {
  app.ui.mode = mode;
  if (mode === "floor") app.ui.selectedId = null;
  app.refreshModeButtons?.();
  app.commit();
};

// ---- plan lifecycle ----
app.setPlan = (plan, { fit = true } = {}) => {
  app.plan = plan;
  app.ui.selectedId = null;
  app.ui.draft = null;
  app.ui.editingLabelId = null;
  app._undo = store.createUndo();
  store.savePlan(plan);
  app.refreshPlanList?.();
  if (fit) app.zoomFit();
  else app.commit();
};

app.newPlan = ({ name, cell, w, h }) => {
  app.setPlan(store.makePlan({ name, cell, w, h }));
};

app.switchPlan = (id) => {
  const plan = store.loadPlan(id);
  if (plan) app.setPlan(plan);
};

app.renamePlan = (name) => {
  if (!name || !name.trim()) return;
  app.plan.name = name.trim();
  store.savePlan(app.plan);
  app.refreshPlanList?.();
};

app.deleteCurrentPlan = () => {
  const id = app.plan.id;
  store.deletePlan(id);
  const index = store.loadIndex();
  if (index.length) app.switchPlan(index[0].id);
  else app.openSetup(true);
  app.refreshPlanList?.();
};

app.exportCurrent = () => store.exportPlan(app.plan);

app.importFile = async (file) => {
  try {
    const plan = await store.importPlanFromFile(file);
    app.setPlan(plan);
  } catch (err) {
    alert("Could not import that file — is it a valid SamPlan JSON?");
    console.warn(err);
  }
};

// ---- wire it all up ----
attachUI(app);
attachInput(app);

window.addEventListener("resize", () => {
  resizeCanvas(canvas);
  app.render();
});

function boot() {
  resizeCanvas(canvas);
  const lastId = store.lastPlanId();
  let plan = lastId ? store.loadPlan(lastId) : null;
  if (!plan) {
    const index = store.loadIndex();
    if (index.length) plan = store.loadPlan(index[0].id);
  }
  if (plan) {
    app.plan = plan;
    store.savePlan(plan);
    app.refreshPlanList();
    app.refreshModeButtons();
    app.zoomFit();
  } else {
    app.refreshModeButtons();
    app.render();
    app.openSetup(true); // first run — no plans yet
  }
}

boot();
