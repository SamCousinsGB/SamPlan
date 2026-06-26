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

export function makePlan({
  name = "Untitled", address = "",
  cellMeters = 0.05, sub = 2,
  wCells = 160, hCells = 120, units = "dual",
} = {}) {
  return {
    id: `p${Date.now().toString(36)}`,
    name,
    meta: { address },
    grid: { cell: 12, sub },          // cell = screen px at zoom 1; sub = fine-snap subdivisions
    scale: { cellMeters },            // canonical real metres per cell
    units,                            // "dual" | "m" | "ft"
    floor: { w: wCells, h: hCells },  // initial view extent / default footprint size
    // Property footprint: a union of rectangles (the building outline). Drawn
    // locked in the background; edited only in the "property" tool.
    property: [{ id: uid(), x: 0, y: 0, w: wCells, h: hCells }],
    rooms: [],                        // start empty — draw rooms inside the footprint
    furniture: [],
    view: { zoom: 1, panX: 40, panY: 40 },
    options: { showFurniture: true, showWallDims: true },
  };
}

// ---- Validation / migration on load (defensive + back-compat with v1 plans) ----
export function normalizePlan(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const floor = {
    w: clampInt(p.floor?.w, 1, 5000, 160),
    h: clampInt(p.floor?.h, 1, 5000, 120),
  };

  // Rooms: prefer new `rooms`; else migrate legacy `boxes`; else start empty.
  let rooms;
  if (Array.isArray(p.rooms)) {
    rooms = p.rooms.map(normalizeRoom).filter(Boolean);
  } else if (Array.isArray(p.boxes)) {
    rooms = p.boxes.map((b) => normalizeRoom({ ...b, name: b.label })).filter(Boolean);
  } else {
    rooms = [];
  }

  // Property footprint: prefer new `property`; else seed a single rect from the floor.
  let property;
  if (Array.isArray(p.property)) {
    property = p.property.map(normalizeRect).filter(Boolean);
  } else {
    property = [{ id: uid(), x: 0, y: 0, w: floor.w, h: floor.h }];
  }
  if (!property.length) property = [{ id: uid(), x: 0, y: 0, w: floor.w, h: floor.h }];

  return {
    id: typeof p.id === "string" ? p.id : `p${Date.now().toString(36)}`,
    name: typeof p.name === "string" && p.name.trim() ? p.name : "Untitled",
    meta: { address: typeof p.meta?.address === "string" ? p.meta.address : "" },
    grid: {
      cell: clampNum(p.grid?.cell, 4, 200, 12),
      sub: clampInt(p.grid?.sub, 1, 10, 2),
    },
    scale: { cellMeters: clampNum(p.scale?.cellMeters, 0.005, 5, 0.05) },
    units: ["dual", "m", "ft"].includes(p.units) ? p.units : "dual",
    floor,
    property,
    rooms,
    furniture: Array.isArray(p.furniture) ? p.furniture.map(normalizeFurniture).filter(Boolean) : [],
    view: {
      zoom: clampNum(p.view?.zoom, 0.05, 12, 1),
      panX: Number.isFinite(p.view?.panX) ? p.view.panX : 40,
      panY: Number.isFinite(p.view?.panY) ? p.view.panY : 40,
    },
    options: {
      showFurniture: p.options?.showFurniture !== false,
      showWallDims: p.options?.showWallDims !== false,
    },
  };
}

function normalizeRoom(r) {
  if (!r || typeof r !== "object") return null;
  return {
    id: typeof r.id === "string" ? r.id : uid(),
    x: clampInt(r.x, 0, 100000, 0),
    y: clampInt(r.y, 0, 100000, 0),
    w: clampInt(r.w, 1, 100000, 1),
    h: clampInt(r.h, 1, 100000, 1),
    name: typeof r.name === "string" ? r.name : "",
    group: typeof r.group === "string" ? r.group : null,
    color: typeof r.color === "string" ? r.color : DEFAULT_COLORS[0],
  };
}

function normalizeRect(r) {
  if (!r || typeof r !== "object") return null;
  return {
    id: typeof r.id === "string" ? r.id : uid(),
    x: clampInt(r.x, 0, 100000, 0),
    y: clampInt(r.y, 0, 100000, 0),
    w: clampInt(r.w, 1, 100000, 1),
    h: clampInt(r.h, 1, 100000, 1),
  };
}

function normalizeFurniture(f) {
  if (!f || typeof f !== "object" || typeof f.kind !== "string") return null;
  const rot = ((Math.round((Number(f.rot) || 0) / 90) % 4) + 4) % 4 * 90;
  return {
    id: typeof f.id === "string" ? f.id : uid(),
    kind: f.kind,
    x: clampNum(f.x, -100000, 100000, 0),
    y: clampNum(f.y, -100000, 100000, 0),
    rot,
    scaleX: clampNum(f.scaleX, 0.1, 50, 1),
    scaleY: clampNum(f.scaleY, 0.1, 50, 1),
  };
}

function clampInt(v, min, max, fallback) {
  return Math.round(clampNum(v, min, max, fallback));
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
