// ui.js — DOM wiring: toolbar, furniture palette, property panels, setup dialog,
// share/export, inline label editor and view-only mode. Assigns DOM-facing
// helpers onto `app`.

import { cellsToPx, cellPx } from "./grid.js";
import { catalogue, CATEGORIES, itemsByCategory } from "./furniture.js";
import { fmtDims, fmtArea, cellMeters } from "./units.js";
import { roomGroups, totalAreaCells } from "./rooms.js";
import * as store from "./state.js";

export function attachUI(app) {
  const $ = (id) => document.getElementById(id);
  const toolButtons = [...document.querySelectorAll(".tool-btn")];

  const planList = $("plan-list");
  const previewBtn = $("btn-preview");
  const dimsBtn = $("btn-dims");
  const unitOpts = [...document.querySelectorAll(".unit-opt")];
  const moreBtn = $("btn-more");
  const morePop = $("more-pop");
  const areaReadout = $("area-readout");
  const hud = $("hud");
  const toast = $("toast");
  const palette = $("palette");
  const paletteBody = $("palette-body");
  const inlineInput = $("inline-label");

  const panel = $("panel");
  const panelRoom = $("panel-room");
  const panelFurn = $("panel-furn");
  const panelProp = $("panel-prop");
  const roomName = $("room-name");
  const roomDims = $("room-dims");
  const roomColor = $("room-color");
  const furnName = $("furn-name");
  const furnSize = $("furn-size");
  const propW = $("prop-w");
  const propH = $("prop-h");

  const propertyBar = $("property-bar");

  const dialog = $("setup-dialog");
  const setupForm = $("setup-form");

  // ---------- HUD / toast ----------
  app.setHud = (text) => { hud.textContent = text || defaultHint(); };
  function defaultHint() {
    switch (app.ui.tool) {
      case "room": return "Room — drag on the canvas to add a room · click to select · double-click to rename · drag handles to resize";
      case "furniture": return "Furniture — click an item to add it, then drag it into place · R rotates · Del removes";
      case "property": return "Property — drag to add sections · drag handles to resize · Done when finished";
      default: return "Click to select · drag to move · drag handles to resize";
    }
  }
  let toastTimer = null;
  app.toast = (msg) => {
    toast.textContent = msg; toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), 2200);
  };

  // ---------- tool buttons / palette visibility ----------
  app.refreshToolButtons = () => {
    toolButtons.forEach((b) => b.classList.toggle("is-active", b.dataset.tool === app.ui.tool));
    palette.hidden = app.ui.tool !== "furniture" || app.ui.preview;
    // Footprint edit bar shows only while in the property tool (not in preview).
    propertyBar.hidden = !(app.ui.tool === "property" && !app.ui.preview);
    // Reflect view-option state on the More-menu items.
    dimsBtn.classList.toggle("is-on", !!app.plan.options.showWallDims);
    previewBtn.classList.toggle("is-on", !!app.ui.preview);
    unitOpts.forEach((b) => b.classList.toggle("is-on", b.dataset.unit === app.plan.units));
    app.setHud("");
  };

  app.refreshArea = () => {
    areaReadout.textContent = fmtArea(app.plan, totalAreaCells(app.plan));
  };

  app.refreshPlanList = () => {
    planList.innerHTML = "";
    for (const e of store.loadIndex()) {
      const opt = document.createElement("option");
      opt.value = e.id; opt.textContent = e.name;
      planList.appendChild(opt);
    }
    planList.value = app.plan.id;
  };

  // ---------- property panel ----------
  app.refreshPanel = () => {
    const ui = app.ui;
    panelRoom.hidden = panelFurn.hidden = panelProp.hidden = true;
    if (!ui.selType || ui.preview) { panel.hidden = true; return; }
    panel.hidden = false;
    if (ui.selType === "room") {
      const r = app.plan.rooms.find((x) => x.id === ui.selId);
      if (!r) { panel.hidden = true; return; }
      panelRoom.hidden = false;
      if (document.activeElement !== roomName) roomName.value = r.name || "";
      roomColor.value = toHex(r.color);
      $("room-unmerge").hidden = !r.group;
      const g = roomGroups(app.plan).find((gr) => gr.rooms.some((x) => x.id === r.id));
      const dims = g ? fmtDims(app.plan, g.bbox.w, g.bbox.h).replace("\n", "  ") : "";
      roomDims.textContent = `${dims}\n${fmtArea(app.plan, g ? g.areaCells : r.w * r.h)}`;
    } else if (ui.selType === "furniture") {
      const f = app.plan.furniture.find((x) => x.id === ui.selId);
      if (!f) { panel.hidden = true; return; }
      panelFurn.hidden = false;
      const def = catalogue[f.kind];
      furnName.textContent = def ? def.name : f.kind;
      furnSize.textContent = def ? `${def.wmm} × ${def.hmm} mm` : "";
    } else if (ui.selType === "property") {
      const r = app.plan.property.find((x) => x.id === ui.selId);
      if (!r) { panel.hidden = true; return; }
      panelProp.hidden = false;
      const cm = cellMeters(app.plan);
      if (document.activeElement !== propW) propW.value = (r.w * cm).toFixed(2);
      if (document.activeElement !== propH) propH.value = (r.h * cm).toFixed(2);
    } else {
      panel.hidden = true;
    }
  };

  // ---------- inline room rename ----------
  let editingRoom = null;
  app.beginLabelEdit = (room) => {
    editingRoom = room;
    app.ui.editingLabelId = room.group || room.id;
    const s = cellPx(app.plan);
    const c = cellsToPx(app.plan, room.x + room.w / 2, room.y + room.h / 2);
    const width = Math.max(70, Math.min(room.w * s * 0.9, 200));
    inlineInput.style.left = c.x - width / 2 + "px";
    inlineInput.style.top = c.y - 13 + "px";
    inlineInput.style.width = width + "px";
    inlineInput.value = room.name || "";
    inlineInput.hidden = false;
    app.render();
    inlineInput.focus();
    inlineInput.select();
  };
  function finishLabel(save) {
    if (!editingRoom) return;
    if (save) editingRoom.name = inlineInput.value;
    app.ui.editingLabelId = null;
    inlineInput.hidden = true;
    editingRoom = null;
    save ? app.commit() : app.render();
  }
  inlineInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); finishLabel(true); }
    else if (e.key === "Escape") { e.preventDefault(); finishLabel(false); }
  });
  inlineInput.addEventListener("blur", () => finishLabel(true));

  // ---------- furniture palette ----------
  function buildPalette() {
    paletteBody.innerHTML = "";
    for (const cat of CATEGORIES) {
      const h = document.createElement("div");
      h.className = "palette-cat"; h.textContent = cat;
      paletteBody.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "palette-grid";
      for (const def of itemsByCategory(cat)) {
        const item = document.createElement("button");
        item.className = "palette-item";
        item.dataset.kind = def.id;
        const c = document.createElement("canvas");
        drawThumb(c, def);
        const label = document.createElement("span");
        label.textContent = def.name;
        item.append(c, label);
        // One click adds exactly one item to the centre of the view (see main.js).
        item.addEventListener("click", () => app.addFurniture(def.id));
        grid.appendChild(item);
      }
      paletteBody.appendChild(grid);
    }
  }
  function drawThumb(canvas, def) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 54 * dpr; canvas.height = 40 * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const pad = 5, bw = 54 - pad * 2, bh = 40 - pad * 2;
    const ar = def.wmm / def.hmm;
    let w = bw, h = bw / ar;
    if (h > bh) { h = bh; w = bh * ar; }
    ctx.translate((54 - w) / 2, (40 - h) / 2);
    ctx.strokeStyle = "#46505f"; ctx.fillStyle = "#ffffff"; ctx.lineWidth = 1; ctx.lineJoin = "round";
    def.draw(ctx, w, h);
  }

  // ---------- tool buttons (radio: one is always active) ----------
  toolButtons.forEach((b) => b.addEventListener("click", () => app.setTool(b.dataset.tool)));

  // ---------- More menu (open/close) ----------
  const closeMenu = () => { morePop.hidden = true; moreBtn.setAttribute("aria-expanded", "false"); };
  const openMenu = () => { morePop.hidden = false; moreBtn.setAttribute("aria-expanded", "true"); };
  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    morePop.hidden ? openMenu() : closeMenu();
  });
  document.addEventListener("click", (e) => {
    if (!morePop.hidden && !$("more-menu").contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  // ---------- plan management (in the menu) ----------
  planList.addEventListener("change", () => app.switchPlan(planList.value));
  $("btn-new").addEventListener("click", () => { closeMenu(); app.openSetup(false); });
  $("btn-rename").addEventListener("click", () => {
    closeMenu();
    const name = prompt("Rename plan:", app.plan.name);
    if (name !== null) app.renamePlan(name);
  });
  $("btn-delete").addEventListener("click", () => {
    closeMenu();
    if (confirm(`Delete "${app.plan.name}"?`)) app.deleteCurrentPlan();
  });

  // ---------- view options (in the menu) ----------
  previewBtn.addEventListener("click", () => { app.togglePreview(); closeMenu(); });
  dimsBtn.addEventListener("click", () => { app.toggleDimensions(); closeMenu(); });
  unitOpts.forEach((b) =>
    b.addEventListener("click", () => { app.setUnits(b.dataset.unit); closeMenu(); }));

  // ---------- property section panel ----------
  const onPropInput = () =>
    app.setPropertySize(parseFloat(propW.value), parseFloat(propH.value));
  propW.addEventListener("input", onPropInput);
  propH.addEventListener("input", onPropInput);
  $("prop-delete").addEventListener("click", () => app.deleteSelected());

  // ---------- property edit bar ----------
  $("prop-done").addEventListener("click", () => app.finishProperty());
  $("prop-reset").addEventListener("click", () => app.resetPropertyRect());

  // ---------- room open-plan merge (in the room panel) ----------
  $("room-merge").addEventListener("click", () => app.mergeSelected());
  $("room-unmerge").addEventListener("click", () => app.unmergeSelected());

  // ---------- export / fit ----------
  $("btn-export").addEventListener("click", () => app.exportImage("image/png"));
  $("btn-zoom-fit").addEventListener("click", () => app.zoomFit());

  // ---------- panel inputs ----------
  roomName.addEventListener("input", () => {
    const r = app.plan.rooms.find((x) => x.id === app.ui.selId);
    if (r) { r.name = roomName.value; app.render(); app.save(); }
  });
  roomColor.addEventListener("input", () => {
    const r = app.plan.rooms.find((x) => x.id === app.ui.selId);
    if (r) { r.color = roomColor.value; app.render(); app.save(); }
  });
  $("room-delete").addEventListener("click", () => app.deleteSelected());
  $("furn-rotate").addEventListener("click", () => app.rotateSelected());
  $("furn-delete").addEventListener("click", () => app.deleteSelected());

  // ---------- setup dialog ----------
  app.openSetup = (firstRun = false) => {
    $("setup-cancel").style.display = firstRun ? "none" : "";
    dialog.showModal();
    $("setup-name").select();
  };
  $("setup-cancel").addEventListener("click", () => dialog.close());
  setupForm.addEventListener("submit", (e) => {
    if (e.submitter && e.submitter.id === "setup-cancel") return;
    const cellMeters = 0.05; // 50 mm grid — fixed for simplicity
    const wM = clampNum(parseFloat($("setup-w").value), 1, 100, 8);
    const hM = clampNum(parseFloat($("setup-h").value), 1, 100, 6);
    app.newPlan({
      name: $("setup-name").value.trim() || "Untitled",
      cellMeters,
      wCells: Math.round(wM / cellMeters),
      hCells: Math.round(hM / cellMeters),
    });
    // Start in property mode so the footprint is the first thing you set.
    app.enterPropertyMode();
  });

  buildPalette();
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function toHex(color) {
  return /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#4f9dff";
}
