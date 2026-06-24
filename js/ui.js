// ui.js — DOM wiring: toolbar, furniture palette, property panels, setup dialog,
// share/export, inline label editor and view-only mode. Assigns DOM-facing
// helpers onto `app`.

import { cellsToPx, cellPx } from "./grid.js";
import { catalogue, CATEGORIES, itemsByCategory } from "./furniture.js";
import { fmtDims, fmtArea } from "./units.js";
import { roomGroups, totalAreaCells } from "./rooms.js";
import * as store from "./state.js";

export function attachUI(app) {
  const $ = (id) => document.getElementById(id);
  const toolButtons = [...document.querySelectorAll(".tool-btn")];

  const planList = $("plan-list");
  const unitSelect = $("unit-select");
  const previewBtn = $("btn-preview");
  const areaReadout = $("area-readout");
  const hud = $("hud");
  const toast = $("toast");
  const palette = $("palette");
  const paletteBody = $("palette-body");
  const inlineInput = $("inline-label");

  const panel = $("panel");
  const panelRoom = $("panel-room");
  const panelFurn = $("panel-furn");
  const panelCompass = $("panel-compass");
  const roomName = $("room-name");
  const roomDims = $("room-dims");
  const roomColor = $("room-color");
  const furnName = $("furn-name");
  const furnSize = $("furn-size");
  const compassRot = $("compass-rot");

  const dialog = $("setup-dialog");
  const setupForm = $("setup-form");

  // ---------- HUD / toast ----------
  app.setHud = (text) => { hud.textContent = text || defaultHint(); };
  function defaultHint() {
    switch (app.ui.tool) {
      case "room": return "Room — drag to draw, double-click to rename, drag handles to resize";
      case "furniture": return "Furniture — pick an item then click to place · R rotates · Esc cancels";
      case "compass": return "Compass — click to place the north point, drag to move";
      case "measure": return "Measure — drag to read a distance in metres & feet";
      default: return "Select — click to select, drag to move, Del to delete";
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
    palette.hidden = app.ui.tool !== "furniture";
    previewBtn.classList.toggle("is-active", !!app.ui.preview);
    unitSelect.value = app.plan.units;
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
    panelRoom.hidden = panelFurn.hidden = panelCompass.hidden = true;
    if (!ui.selType || ui.preview) { panel.hidden = true; return; }
    panel.hidden = false;
    if (ui.selType === "room") {
      const r = app.plan.rooms.find((x) => x.id === ui.selId);
      if (!r) { panel.hidden = true; return; }
      panelRoom.hidden = false;
      if (document.activeElement !== roomName) roomName.value = r.name || "";
      roomColor.value = toHex(r.color);
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
    } else if (ui.selType === "compass" && app.plan.compass) {
      panelCompass.hidden = false;
      compassRot.value = app.plan.compass.rot || 0;
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
        item.addEventListener("click", () => {
          app.ui.placingKind = app.ui.placingKind === def.id ? null : def.id;
          highlightPalette();
          app.setHud(app.ui.placingKind ? `Click to place: ${def.name}` : "");
        });
        grid.appendChild(item);
      }
      paletteBody.appendChild(grid);
    }
  }
  function highlightPalette() {
    paletteBody.querySelectorAll(".palette-item").forEach((el) =>
      el.classList.toggle("is-active", el.dataset.kind === app.ui.placingKind));
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
    ctx.strokeStyle = "#cdd3de"; ctx.fillStyle = "#2a2f38"; ctx.lineWidth = 1; ctx.lineJoin = "round";
    def.draw(ctx, w, h);
  }
  app.refreshPalette = highlightPalette;

  // ---------- tool buttons ----------
  toolButtons.forEach((b) => b.addEventListener("click", () => app.setTool(b.dataset.tool)));

  // ---------- plan management ----------
  $("btn-new").addEventListener("click", () => app.openSetup(false));
  planList.addEventListener("change", () => app.switchPlan(planList.value));
  $("btn-rename").addEventListener("click", () => {
    const name = prompt("Rename plan:", app.plan.name);
    if (name !== null) app.renamePlan(name);
  });
  $("btn-delete").addEventListener("click", () => {
    if (confirm(`Delete "${app.plan.name}"?`)) app.deleteCurrentPlan();
  });

  // ---------- units / preview ----------
  unitSelect.addEventListener("change", () => app.setUnits(unitSelect.value));
  previewBtn.addEventListener("click", () => app.togglePreview());

  // ---------- merge ----------
  $("btn-merge").addEventListener("click", () => app.mergeSelected());
  $("btn-unmerge").addEventListener("click", () => app.unmergeSelected());

  // ---------- share / export ----------
  $("btn-share").addEventListener("click", () => app.share());
  $("btn-export-png").addEventListener("click", () => app.exportImage("image/png"));
  $("btn-export-jpg").addEventListener("click", () => app.exportImage("image/jpeg"));
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
  compassRot.addEventListener("input", () => {
    if (app.plan.compass) { app.plan.compass.rot = +compassRot.value; app.render(); app.save(); }
  });
  $("compass-delete").addEventListener("click", () => {
    app.plan.compass = null; app.ui.selType = null; app.commit();
  });

  // ---------- view-only ----------
  app.enterViewOnly = () => {
    document.body.classList.add("viewonly");
    $("viewonly-bar").hidden = false;
    $("btn-copy-edit").addEventListener("click", () => app.makeCopyToEdit());
    $("btn-vo-png").addEventListener("click", () => app.exportImage("image/png"));
  };

  // ---------- setup dialog ----------
  app.openSetup = (firstRun = false) => {
    $("setup-cancel").style.display = firstRun ? "none" : "";
    dialog.showModal();
    $("setup-name").select();
  };
  $("setup-cancel").addEventListener("click", () => dialog.close());
  setupForm.addEventListener("submit", (e) => {
    if (e.submitter && e.submitter.id === "setup-cancel") return;
    const cellMeters = parseFloat($("setup-grid").value) || 0.05;
    const wM = clampNum(parseFloat($("setup-w").value), 1, 100, 8);
    const hM = clampNum(parseFloat($("setup-h").value), 1, 100, 6);
    app.newPlan({
      name: $("setup-name").value.trim() || "Untitled",
      address: $("setup-address").value.trim(),
      cellMeters,
      wCells: Math.round(wM / cellMeters),
      hCells: Math.round(hM / cellMeters),
    });
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
