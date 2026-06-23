# SamPlan

A fast, dead-simple floorplanner — "MS Paint for floorplans". Pick a grid and a
floorspace, resize the room, then drop down labelled boxes that snap to the grid.
Pure static web app: no backend, no build step.

## Use it

1. **New plan** → choose a grid size (px per cell) and a floorspace (width × height in cells).
2. **Floor** mode → drag the handles to resize the room.
3. **Edit** mode → drag on the grid to draw a box. It snaps to cells and asks for a label.
   - Click a box to select it; drag the body to move, drag the handles to resize.
   - Double-click (or **Enter**) to rename. Pick a colour in the side panel.
   - **Delete/Backspace** removes the selected box; **arrow keys** nudge it one cell.
   - **Ctrl+Z / Ctrl+Shift+Z** undo / redo.
4. **Pan** with space-drag or middle-mouse; **zoom** with the mouse wheel (or the toolbar).

Everything autosaves to your browser. Use **Export** / **Import** to back up a plan as a
`.json` file or move it between machines.

## Run locally

ES modules and Canvas need HTTP (not `file://`):

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Deploy (GitHub Pages)

It's already a static site. Push to GitHub, then **Settings → Pages → Deploy from branch →
`main` / `/ (root)`**. The included `.nojekyll` makes Pages serve the files as-is.

## Project layout

```
index.html        markup: toolbar, canvas, dialogs
css/styles.css    styling
js/main.js        bootstrap + app state, undo, persistence orchestration
js/state.js       plan model, localStorage, import/export, undo stack
js/grid.js        cell<->pixel math, snapping, hit-testing
js/render.js      all canvas drawing
js/input.js       pointer + keyboard interaction / tools
js/ui.js          toolbar, dialog, plan list, side panel, inline label editor
```

Plans live in `localStorage` under `samplan:*` keys.
