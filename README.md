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
  300/400/500/600mm, bath 1700×700, and more. Click an item to drop it in view, then drag it
  into place. A staging layer, kept off the clean export.
- **Property footprint** — every plan starts by drawing the building outline: drag one or
  more rectangles that union into the exact shape (an L-plan, a return, etc.), tweak sizes, then
  hit **Done**. From then on it sits **locked in the background** while you draw rooms inside it.
  Re-enter any time with the **Property** button. A guide only — not counted in the floor area
  or the clean export.
- **Dimensions toggle** — show or hide the running room and property dimensions.
- **Listing preview** — a clean black-and-white view that matches what portals expect.
- **Export** — print-resolution PNG/JPEG with a title block (name/address, total area, scale
  bar, "not to scale" disclaimer).
- **Live shareable link** — the whole plan is encoded into the page URL and updates as you
  edit (no backend, no Share button). Copy the address bar and send it; whoever opens it lands
  straight in the editor on that plan, fully editable, and their URL keeps updating as they go.

Everything autosaves to your browser; named plans can be switched, renamed and deleted.

## Tools & shortcuts

Selecting, moving and resizing are always on — there's no "select mode" to switch into.

| | |
|---|---|
| Select / move | click any room or item, drag to move, drag handles to resize |
| **Draw Room** | toggle on, then drag on the canvas to add a room · double-click to rename |
| **Furniture** | open the palette, click an item to add it, then drag into place · **R** rotates |
| **Property** | edit the background footprint — drag to add sections, move/resize/delete them, **Done** to lock |
| Pan | space-drag or middle-mouse · Zoom | mouse wheel · **Fit** recentres |
| Delete | remove selected · Arrows | nudge · **Esc** | back to select · **Ctrl+Z / Ctrl+Shift+Z** | undo / redo |

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
