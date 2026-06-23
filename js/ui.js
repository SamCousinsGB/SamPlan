// ui.js — DOM wiring: toolbar, setup dialog, plan list, side panel, HUD and the
// inline label editor. Assigns the DOM-facing helpers onto `app` so input.js and
// main.js can call them.

import { cellsToPx, cellPx } from "./grid.js";
import * as store from "./state.js";

export function attachUI(app) {
  const $ = (id) => document.getElementById(id);

  const canvas = app.canvas;
  const modeButtons = [...document.querySelectorAll(".mode-btn")];
  const planList = $("plan-list");
  const zoomReadout = $("zoom-readout");
  const hud = $("hud");

  const boxPanel = $("box-panel");
  const boxLabel = $("box-label");
  const boxColor = $("box-color");
  const boxDelete = $("box-delete");
  const inlineInput = $("inline-label");

  const dialog = $("setup-dialog");
  const setupForm = $("setup-form");
  const setupName = $("setup-name");
  const setupCell = $("setup-cell");
  const setupW = $("setup-w");
  const setupH = $("setup-h");
  const setupCancel = $("setup-cancel");

  const fileImport = $("file-import");

  // ---------------- helpers exposed on app ----------------
  app.setHud = (text) => {
    hud.textContent = text || defaultHint();
  };
  function defaultHint() {
    return app.ui.mode === "floor"
      ? "Floor mode — drag the handles to resize the floor"
      : "Edit mode — drag to draw a box · double-click to rename · arrows nudge · Del to delete";
  }

  app.refreshModeButtons = () => {
    modeButtons.forEach((b) =>
      b.classList.toggle("is-active", b.dataset.mode === app.ui.mode)
    );
    app.setHud("");
    app.refreshPanel();
  };

  app.refreshPlanList = () => {
    const index = store.loadIndex();
    planList.innerHTML = "";
    for (const e of index) {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = e.name;
      planList.appendChild(opt);
    }
    planList.value = app.plan.id;
  };

  app.refreshPanel = () => {
    zoomReadout.textContent = Math.round(app.plan.view.zoom * 100) + "%";
    const sel =
      app.ui.mode === "edit"
        ? app.plan.boxes.find((b) => b.id === app.ui.selectedId)
        : null;
    if (sel) {
      boxPanel.hidden = false;
      if (document.activeElement !== boxLabel) boxLabel.value = sel.label || "";
      boxColor.value = toHex(sel.color);
    } else {
      boxPanel.hidden = true;
    }
  };

  // ---------------- inline label editor ----------------
  let editingBox = null;
  app.beginLabelEdit = (box) => {
    editingBox = box;
    app.ui.editingLabelId = box.id;
    const tl = cellsToPx(app.plan, box.x, box.y);
    const s = cellPx(app.plan);
    inlineInput.style.left = tl.x + "px";
    inlineInput.style.top = tl.y + (box.h * s) / 2 - 14 + "px";
    inlineInput.style.width = Math.max(64, box.w * s) + "px";
    inlineInput.value = box.label || "";
    inlineInput.hidden = false;
    app.render(); // hide the underlying drawn label while editing
    inlineInput.focus();
    inlineInput.select();
  };

  function finishLabelEdit(save) {
    if (!editingBox) return;
    if (save) editingBox.label = inlineInput.value;
    app.ui.editingLabelId = null;
    inlineInput.hidden = true;
    editingBox = null;
    if (save) app.commit();
    else app.render();
    app.refreshPanel();
  }

  inlineInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); finishLabelEdit(true); }
    else if (e.key === "Escape") { e.preventDefault(); finishLabelEdit(false); }
  });
  inlineInput.addEventListener("blur", () => finishLabelEdit(true));

  // ---------------- mode buttons ----------------
  modeButtons.forEach((b) =>
    b.addEventListener("click", () => app.setMode(b.dataset.mode))
  );

  // ---------------- plan management ----------------
  $("btn-new").addEventListener("click", () => app.openSetup(false));

  planList.addEventListener("change", () => app.switchPlan(planList.value));

  $("btn-rename").addEventListener("click", () => {
    const name = prompt("Rename plan:", app.plan.name);
    if (name !== null) app.renamePlan(name);
  });

  $("btn-delete").addEventListener("click", () => {
    if (confirm(`Delete "${app.plan.name}"? This cannot be undone.`)) {
      app.deleteCurrentPlan();
    }
  });

  // ---------------- export / import ----------------
  $("btn-export").addEventListener("click", () => app.exportCurrent());
  $("btn-import").addEventListener("click", () => fileImport.click());
  fileImport.addEventListener("change", () => {
    const file = fileImport.files?.[0];
    if (file) app.importFile(file);
    fileImport.value = ""; // allow re-importing the same file
  });

  // ---------------- zoom ----------------
  $("btn-zoom-in").addEventListener("click", () => app.zoomBy(1.2));
  $("btn-zoom-out").addEventListener("click", () => app.zoomBy(1 / 1.2));
  $("btn-zoom-fit").addEventListener("click", () => app.zoomFit());

  // ---------------- side panel ----------------
  boxLabel.addEventListener("input", () => {
    const sel = app.plan.boxes.find((b) => b.id === app.ui.selectedId);
    if (sel) { sel.label = boxLabel.value; app.render(); app.save(); }
  });
  boxColor.addEventListener("input", () => {
    const sel = app.plan.boxes.find((b) => b.id === app.ui.selectedId);
    if (sel) { sel.color = boxColor.value; app.render(); app.save(); }
  });
  boxDelete.addEventListener("click", () => {
    const sel = app.plan.boxes.find((b) => b.id === app.ui.selectedId);
    if (!sel) return;
    app.pushUndo();
    app.plan.boxes = app.plan.boxes.filter((b) => b.id !== sel.id);
    app.ui.selectedId = null;
    app.commit();
  });

  // ---------------- setup dialog ----------------
  app.openSetup = (firstRun = false) => {
    setupCancel.style.display = firstRun ? "none" : "";
    dialog.showModal();
    setupName.select();
  };

  setupCancel.addEventListener("click", () => dialog.close());

  setupForm.addEventListener("submit", (e) => {
    // form method="dialog" closes the dialog automatically; create the plan.
    if (e.submitter && e.submitter.id === "setup-cancel") return;
    const name = setupName.value.trim() || "Untitled";
    const cell = clamp(parseInt(setupCell.value, 10), 4, 200, 25);
    const w = clamp(parseInt(setupW.value, 10), 1, 500, 20);
    const h = clamp(parseInt(setupH.value, 10), 1, 500, 15);
    app.newPlan({ name, cell, w, h });
  });
}

// ---- small utils ----
function clamp(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function toHex(color) {
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) return color;
  return "#4f9dff";
}
