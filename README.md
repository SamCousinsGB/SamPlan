# SamPlan

A fast, simple **UK estate-agent floorplan tool** — draw rooms, get Rightmove/Zoopla-ready
plans with dual metric/imperial dimensions, total floor area, a north point, and a UK-sized
furniture library. Pure static web app: HTML5 Canvas + vanilla ES modules, no backend, no
build step.

**Live:** https://samcousinsgb.github.io/SamPlan/

## What it does

- **Rooms** — draw rectangular rooms that snap to the grid; walls are traced automatically
  (thick external / thin internal). Each room is labelled with its name and **dimensions in
  both metres and feet** (`4.20m x 3.65m (13'9" x 12'0")`).
- **Total floor area** — shown live, dual-unit (`75.0 m² (807 sq ft)`).
- **Open-plan merge** — select a room and hit **Merge** to drop the wall between adjoining
  rooms (kitchen/diner), combining them under one label and area.
- **UK furniture library** — true-size B&W symbols: double bed 1350×1900, kitchen carcasses
  300/400/500/600mm, bath 1700×700, and more. A staging layer, kept off the clean export.
- **Compass** — a draggable, rotatable north point.
- **Measure** — drag to read any distance in metres & feet.
- **Listing preview** — a clean black-and-white view that matches what portals expect.
- **Export** — print-resolution PNG/JPEG with a title block (name/address, total area, scale
  bar, "not to scale" disclaimer).
- **Share** — a view-only link with the whole plan encoded in the URL (no backend).

Everything autosaves to your browser; named plans can be switched, renamed and deleted.

## Tools & shortcuts

| | |
|---|---|
| **Select** | click to select, drag to move, drag handles to resize |
| **Room** | drag to draw a room, double-click to rename |
| **Furniture** | pick an item then click to place · **R** rotates · **Esc** cancels |
| **Compass** | place / move the north point |
| **Measure** | drag for a dual-unit distance |
| Pan | space-drag or middle-mouse · Zoom | mouse wheel |
| Delete | remove selected · Arrows | nudge · **Ctrl+Z / Ctrl+Shift+Z** | undo / redo |

## Run locally

ES modules and Canvas need HTTP (not `file://`):

```bash
python -m http.server 8000   # then open http://localhost:8000
```

## Deploy (GitHub Pages)

Static at root with a `.nojekyll` file. Push to `main` → Settings → Pages → Deploy from
branch → `main` / `/ (root)`. Pushing publishes; no build step.

## Project layout

```
index.html        toolbar, canvas, palette, panels, setup dialog
css/styles.css    styling
js/main.js        app state, undo, persistence, export/share orchestration
js/state.js       plan model, localStorage, migration, undo
js/units.js       dual metric/imperial conversion & formatting
js/grid.js        cell<->pixel math, snapping (incl. subgrid), hit-testing, handles
js/rooms.js       room occupancy, total area, wall-edge classification, grouping
js/furniture.js   UK furniture catalogue + B&W symbol drawers
js/render.js      canvas drawing (editor + print palettes), reused by export
js/input.js       pointer + keyboard, the tool model
js/export.js      print-resolution image render + title block
js/share.js       URL-encoded view-only links (compressed)
js/ui.js          toolbar, palette, panels, setup, inline label editor, view-only
```

Plans live in `localStorage` under `samplan:*` keys. v1 plans (boxes) migrate to rooms on load.
