// rooms.js — room occupancy, total area, wall-edge classification and grouping.
// Rooms snap to whole cells, so all of this works on an integer cell lattice,
// which keeps wall tracing exact. (Furniture uses the finer subgrid.)

const key = (x, y) => `${x},${y}`;

// ---- memoisation: these are O(total cells) and were rebuilt every render frame,
// which made panning a large plan janky. Cache by a cheap geometry signature so a
// pan/zoom (geometry unchanged) reuses the result; an edit invalidates it. ----
function roomsSig(plan) {
  let s = "";
  for (const r of plan.rooms) s += `${r.id}:${r.x},${r.y},${r.w},${r.h},${r.group || ""};`;
  return s;
}
function propSig(plan) {
  let s = "";
  for (const r of propertyRects(plan)) s += `${r.id}:${r.x},${r.y},${r.w},${r.h};`;
  return s;
}
const _occ = { sig: undefined, val: null };
const _walls = { sig: undefined, val: null };
const _outline = { sig: undefined, val: null };

// Map of every occupied integer cell -> { roomId, group }. Last room wins on
// overlap (rooms shouldn't overlap, but stay graceful if they do).
export function occupancy(plan) {
  const sig = roomsSig(plan);
  if (_occ.sig === sig) return _occ.val;
  const map = new Map();
  for (const r of plan.rooms) {
    const g = r.group || r.id;
    for (let y = Math.round(r.y); y < Math.round(r.y + r.h); y++) {
      for (let x = Math.round(r.x); x < Math.round(r.x + r.w); x++) {
        map.set(key(x, y), { roomId: r.id, group: g });
      }
    }
  }
  _occ.sig = sig; _occ.val = map;
  return map;
}

export function totalAreaCells(plan) {
  return occupancy(plan).size;
}

// Wall segments in cell coordinates. type: "external" (outer boundary, thick)
// or "internal" (between two different room groups, thin). Same-group adjoining
// cells share no wall (open plan). Each edge is emitted exactly once.
export function wallSegments(plan) {
  const sig = roomsSig(plan);
  if (_walls.sig === sig) return _walls.val;
  const occ = occupancy(plan);
  const segs = [];
  for (const [k, info] of occ) {
    const [x, y] = k.split(",").map(Number);
    const right = occ.get(key(x + 1, y));
    const below = occ.get(key(x, y + 1));
    const left = occ.get(key(x - 1, y));
    const above = occ.get(key(x, y - 1));

    // vertical edge on the right (owned by the left cell)
    if (!right) segs.push(edge(x + 1, y, x + 1, y + 1, "external"));
    else if (right.group !== info.group) segs.push(edge(x + 1, y, x + 1, y + 1, "internal"));
    // horizontal edge on the bottom (owned by the top cell)
    if (!below) segs.push(edge(x, y + 1, x + 1, y + 1, "external"));
    else if (below.group !== info.group) segs.push(edge(x, y + 1, x + 1, y + 1, "internal"));
    // left/top only when the neighbour is empty (external) — internal handled above
    if (!left) segs.push(edge(x, y, x, y + 1, "external"));
    if (!above) segs.push(edge(x, y, x + 1, y, "external"));
  }
  _walls.sig = sig; _walls.val = segs;
  return segs;
}

function edge(x1, y1, x2, y2, type) {
  return { x1, y1, x2, y2, type };
}

// ---- Property footprint (a union of rectangles drawn locked in the background) ----
export function propertyRects(plan) {
  return Array.isArray(plan.property) ? plan.property : [];
}

function cellSet(rects) {
  const set = new Set();
  for (const r of rects) {
    for (let y = Math.round(r.y); y < Math.round(r.y + r.h); y++)
      for (let x = Math.round(r.x); x < Math.round(r.x + r.w); x++)
        set.add(key(x, y));
  }
  return set;
}

// Outer boundary segments of the property union (cells where a neighbour is empty).
export function propertyOutline(plan) {
  const sig = propSig(plan);
  if (_outline.sig === sig) return _outline.val;
  const occ = cellSet(propertyRects(plan));
  const segs = [];
  for (const k of occ) {
    const [x, y] = k.split(",").map(Number);
    if (!occ.has(key(x + 1, y))) segs.push(edge(x + 1, y, x + 1, y + 1, "external"));
    if (!occ.has(key(x - 1, y))) segs.push(edge(x, y, x, y + 1, "external"));
    if (!occ.has(key(x, y + 1))) segs.push(edge(x, y + 1, x + 1, y + 1, "external"));
    if (!occ.has(key(x, y - 1))) segs.push(edge(x, y, x + 1, y, "external"));
  }
  _outline.sig = sig; _outline.val = segs;
  return segs;
}

export function propertyBounds(plan) {
  const rects = propertyRects(plan);
  if (!rects.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Topmost property rect at a (fractional) cell point.
export function propertyRectAt(plan, cx, cy) {
  const rects = propertyRects(plan);
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) return r;
  }
  return null;
}

// Group rooms into labelled areas. Ungrouped rooms are their own group.
// Returns [{ group, name, rooms[], bbox{x,y,w,h}, areaCells, anchor{x,y} }].
export function roomGroups(plan) {
  const byGroup = new Map();
  for (const r of plan.rooms) {
    const g = r.group || r.id;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(r);
  }
  const out = [];
  for (const [group, rooms] of byGroup) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let area = 0;
    let biggest = rooms[0];
    for (const r of rooms) {
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
      area += r.w * r.h;
      if (r.w * r.h > biggest.w * biggest.h) biggest = r;
    }
    const name = rooms.map((r) => r.name).find((n) => n && n.trim()) || "";
    out.push({
      group, name, rooms,
      bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      areaCells: area,
      anchor: { x: biggest.x + biggest.w / 2, y: biggest.y + biggest.h / 2 },
    });
  }
  return out;
}

// Topmost room at a (fractional) cell point.
export function roomAt(plan, cx, cy) {
  for (let i = plan.rooms.length - 1; i >= 0; i--) {
    const r = plan.rooms[i];
    if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) return r;
  }
  return null;
}

// Bounding box (in cells) of everything drawn — used to fit/zoom and to export.
export function contentBounds(plan) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x, y, w, h) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  };
  for (const r of plan.rooms) grow(r.x, r.y, r.w, r.h);
  for (const r of propertyRects(plan)) grow(r.x, r.y, r.w, r.h);
  if (!plan.rooms.length && !propertyRects(plan).length) {
    grow(0, 0, plan.floor?.w || 20, plan.floor?.h || 15);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Bounds of just the rooms — what the clean export/print should frame. Falls
// back to the full content bounds when nothing has been drawn yet.
export function exportBounds(plan) {
  if (!plan.rooms.length) return contentBounds(plan);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of plan.rooms) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
