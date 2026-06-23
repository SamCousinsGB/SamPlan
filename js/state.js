// state.js — the plan data model, persistence (localStorage), undo, import/export.

const LS_INDEX = "samplan:index";       // JSON: [{id, name}]
const LS_PLAN = (id) => `samplan:plan:${id}`;
const LS_LAST = "samplan:last";          // id of last-open plan

const DEFAULT_COLORS = [
  "#4f9dff", "#42c98e", "#ffb24f", "#ff6b9d",
  "#a78bfa", "#f97373", "#38bdf8", "#facc15",
];

let nextColorIdx = 0;
export function nextColor() {
  const c = DEFAULT_COLORS[nextColorIdx % DEFAULT_COLORS.length];
  nextColorIdx++;
  return c;
}

let idSeq = 1;
export function uid() {
  // Small, monotonically-increasing-ish id. Good enough for a local app.
  return `b${Date.now().toString(36)}${(idSeq++).toString(36)}`;
}

export function makePlan({ name = "Untitled", cell = 25, w = 20, h = 15 } = {}) {
  return {
    id: `p${Date.now().toString(36)}`,
    name,
    grid: { cell },
    floor: { w, h },
    boxes: [],
    view: { zoom: 1, panX: 40, panY: 40 },
  };
}

// ---- Validation / migration on load (defensive against hand-edited JSON) ----
export function normalizePlan(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const cell = clampNum(p.grid?.cell, 4, 200, 25);
  const out = {
    id: typeof p.id === "string" ? p.id : `p${Date.now().toString(36)}`,
    name: typeof p.name === "string" && p.name.trim() ? p.name : "Untitled",
    grid: { cell },
    floor: {
      w: clampNum(p.floor?.w, 1, 1000, 20),
      h: clampNum(p.floor?.h, 1, 1000, 15),
    },
    boxes: Array.isArray(p.boxes) ? p.boxes.map(normalizeBox).filter(Boolean) : [],
    view: {
      zoom: clampNum(p.view?.zoom, 0.1, 8, 1),
      panX: Number.isFinite(p.view?.panX) ? p.view.panX : 40,
      panY: Number.isFinite(p.view?.panY) ? p.view.panY : 40,
    },
  };
  return out;
}

function normalizeBox(b) {
  if (!b || typeof b !== "object") return null;
  const x = clampNum(b.x, 0, 100000, 0);
  const y = clampNum(b.y, 0, 100000, 0);
  const w = clampNum(b.w, 1, 100000, 1);
  const h = clampNum(b.h, 1, 100000, 1);
  return {
    id: typeof b.id === "string" ? b.id : uid(),
    x, y, w, h,
    label: typeof b.label === "string" ? b.label : "",
    color: typeof b.color === "string" ? b.color : DEFAULT_COLORS[0],
  };
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ---------------- Persistence ----------------
export function loadIndex() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_INDEX) || "[]");
    return Array.isArray(raw) ? raw.filter((e) => e && e.id) : [];
  } catch {
    return [];
  }
}

function saveIndex(index) {
  localStorage.setItem(LS_INDEX, JSON.stringify(index));
}

export function savePlan(plan) {
  try {
    localStorage.setItem(LS_PLAN(plan.id), JSON.stringify(plan));
    const index = loadIndex();
    const existing = index.find((e) => e.id === plan.id);
    if (existing) existing.name = plan.name;
    else index.push({ id: plan.id, name: plan.name });
    saveIndex(index);
    localStorage.setItem(LS_LAST, plan.id);
  } catch (err) {
    console.warn("savePlan failed:", err);
  }
}

export function loadPlan(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_PLAN(id)));
    return raw ? normalizePlan(raw) : null;
  } catch {
    return null;
  }
}

export function deletePlan(id) {
  localStorage.removeItem(LS_PLAN(id));
  saveIndex(loadIndex().filter((e) => e.id !== id));
  if (localStorage.getItem(LS_LAST) === id) localStorage.removeItem(LS_LAST);
}

export function lastPlanId() {
  return localStorage.getItem(LS_LAST);
}

// ---------------- Import / Export ----------------
export function exportPlan(plan) {
  const data = JSON.stringify(plan, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(plan.name || "floorplan").replace(/[^\w.-]+/g, "_")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importPlanFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const plan = normalizePlan(JSON.parse(reader.result));
        // Give imported plan a fresh id so it doesn't clobber an existing one.
        plan.id = `p${Date.now().toString(36)}`;
        resolve(plan);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// ---------------- Undo (bounded snapshot stack) ----------------
const UNDO_LIMIT = 50;

export function createUndo() {
  let stack = [];
  let redo = [];
  return {
    push(plan) {
      stack.push(snapshot(plan));
      if (stack.length > UNDO_LIMIT) stack.shift();
      redo = [];
    },
    undo(current) {
      if (!stack.length) return null;
      redo.push(snapshot(current));
      return stack.pop();
    },
    redo(current) {
      if (!redo.length) return null;
      stack.push(snapshot(current));
      return redo.pop();
    },
    canUndo: () => stack.length > 0,
    canRedo: () => redo.length > 0,
  };
}

function snapshot(plan) {
  // Deep-ish clone of just the mutable fields we care about.
  return normalizePlan(JSON.parse(JSON.stringify(plan)));
}
