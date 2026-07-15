# Clinical Workspace and Smart Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the premium “安定臨床” workspace and let users preview and place new people into predictable, aligned grid positions without automatic whole-chart rearrangement.

**Architecture:** Preserve the current no-build HTML/CSS/Canvas architecture. `GenogramApp` owns placement state and computes candidates by reusing the existing grid and snap rules; `GenogramCanvas` only renders injected placement overlays. The UI shell is reorganized with semantic HTML and CSS tokens while existing element IDs, handlers, keyboard shortcuts, data models, and export drawing remain compatible.

**Tech Stack:** Vanilla HTML, CSS, JavaScript, Canvas 2D, Node.js, Playwright, pixelmatch/pngjs.

## Global Constraints

- Work only on `codex/genogram-ux-drawing-optimization`; do not merge to `main`.
- Preserve the existing Logo and all professional relationship-line colors.
- Preserve all clinical symbol semantics and `from=parent, to=child` direction.
- Person lookup uses `this.personMap.get(id)`; every persons mutation keeps `personMap` synchronized.
- Kinship queries use `KinshipEngine`; never infer parents from Y coordinates.
- Screen and export share the existing drawing core; placement overlays never enter export.
- Keep existing JSON, Undo/Redo, shortcuts, and export formats compatible.
- Do not add a bundler, UI framework, SVG/WebGL renderer, or bitmap person renderer.
- Root, `geno/`, and `refactor/app/` JavaScript copies must remain MD5-identical; preserve the local-resource differences in `geno/index.html`.
- Any edited `.ps1` must be UTF-8 with BOM; this plan does not require a `.ps1` change.

## File Structure

- Modify `index.html`: semantic global bar, floating canvas tools, tabbed inspector shell; preserve all functional IDs.
- Modify `css/styles.css`: “安定臨床” tokens, shell layout, components, responsiveness, focus/motion rules.
- Modify `js/app.js`: inspector state, placement session state, candidate calculation, pointer/keyboard lifecycle, quick-add integration.
- Modify `js/canvas.js`: draw injected placement cell, person ghost, relationship ghost, and occupancy state.
- Create `refactor/verify_ui_shell.js`: Playwright checks for structure, responsiveness, accessibility, and unchanged commands.
- Create `refactor/verify_placement.js`: Playwright checks for candidate geometry, occupied-cell fallback, cancel, commit, personMap, and history.
- Update ignored local copies `geno/` and `refactor/app/` only after root verification passes.

---

### Task 1: Lock the New UI Contract with a Failing Browser Test

**Files:**
- Create: `refactor/verify_ui_shell.js`
- Test: `index.html`
- Test: `css/styles.css`

**Interfaces:**
- Consumes: existing IDs `addPerson`, `selectTool`, `boxSelectTool`, `connectTool`, `householdTool`, `lifeCircleTool`, `undo`, `redo`, `save`, `export`.
- Produces: IDs `globalBar`, `canvasToolDock`, `inspectorPanel`, `inspectorToggle`; tabs with `[data-inspector-tab="properties|legend|view"]`; body state class `inspector-collapsed`.

- [ ] **Step 1: Write the failing UI contract test**

Create a Playwright script that loads root `index.html`, collects console/page errors, and asserts:

```js
const required = [
  '#globalBar', '#canvasToolDock', '#inspectorPanel', '#inspectorToggle',
  '[data-inspector-tab="properties"]',
  '[data-inspector-tab="legend"]',
  '[data-inspector-tab="view"]'
];
for (const selector of required) {
  if (!(await page.locator(selector).count())) fail(`${selector} missing`);
}
for (const id of ['addPerson', 'selectTool', 'boxSelectTool', 'connectTool', 'householdTool', 'lifeCircleTool']) {
  if (!(await page.locator(`#${id}`).count())) fail(`existing command #${id} missing`);
}
```

At 1366×768 assert inspector width is between 296px and 336px. At 1024×768 click `#inspectorToggle`, assert `body.inspector-collapsed`, and assert the canvas container gains usable width. Assert every icon-only command has `title` and `aria-label`. Assert zero console/page errors.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
$env:NODE_PATH = Join-Path $HOME '.cache/pw-smoke/node_modules'
node refactor/verify_ui_shell.js
```

Expected: FAIL because `#globalBar`, `#canvasToolDock`, and inspector tabs do not exist.

- [ ] **Step 3: Commit the failing contract test**

```powershell
git add refactor/verify_ui_shell.js
git commit -m "test: define clinical workspace UI contract"
```

---

### Task 2: Build the Premium Clinical Workspace Shell

**Files:**
- Modify: `index.html:32-313`
- Modify: `css/styles.css:7-690`
- Modify: `js/app.js:130-230`
- Test: `refactor/verify_ui_shell.js`

**Interfaces:**
- Consumes: existing command IDs and event listeners.
- Produces: `setInspectorTab(tabName)`, `setInspectorCollapsed(collapsed)`, `currentInspectorTab`, and stable inspector DOM containers `propertyContent`, `legendContent`, `viewContent`.

- [ ] **Step 1: Restructure HTML without renaming functional commands**

Replace the monolithic dark toolbar with:

```html
<header class="global-bar" id="globalBar">
  <div class="brand-lockup"><!-- existing logo SVG and title --></div>
  <div class="document-context"><span class="document-name">未命名家系圖</span></div>
  <nav class="global-actions" aria-label="檔案與歷程操作"><!-- existing undo/save/export buttons --></nav>
</header>
```

Move drawing commands into:

```html
<nav class="canvas-tool-dock" id="canvasToolDock" aria-label="畫布工具">
  <!-- existing add/select/connect/box/household/life-circle buttons, same IDs -->
</nav>
```

Create the inspector header, collapse button, tablist, and three tab panels. Move the existing property and legend DOM into their corresponding panels without rewriting legend swatches or colors.

- [ ] **Step 2: Implement the visual tokens and shell CSS**

Define tokens in `:root`:

```css
--surface-canvas: #fbfcfd;
--surface-panel: #ffffff;
--surface-subtle: #f5f7f8;
--ink-strong: #17212b;
--ink-body: #42515d;
--ink-muted: #74818c;
--line-ui: #dfe4e8;
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--control-sm: 36px;
--control-md: 40px;
--motion-fast: 140ms ease;
```

Use borders for static separation and shadows only on floating elements. Keep `--brand: #ed1261`. Do not modify any `--color-*` relationship variable or `.legend-line` background data.

- [ ] **Step 3: Add inspector state methods**

Add to `GenogramApp`:

```js
setInspectorTab(tabName) {
  const allowed = new Set(['properties', 'legend', 'view']);
  const next = allowed.has(tabName) ? tabName : 'properties';
  this.currentInspectorTab = next;
  document.querySelectorAll('[data-inspector-tab]').forEach(button => {
    const active = button.dataset.inspectorTab === next;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-inspector-panel]').forEach(panel => {
    panel.hidden = panel.dataset.inspectorPanel !== next;
  });
}

setInspectorCollapsed(collapsed) {
  document.body.classList.toggle('inspector-collapsed', Boolean(collapsed));
  this.elements.inspectorToggle.setAttribute('aria-expanded', String(!collapsed));
  requestAnimationFrame(() => this.canvas.resize());
}
```

Wire tabs and toggle once in `bindEvents()`. Do not store these UI preferences in the genogram JSON.

- [ ] **Step 4: Add responsive and accessible behavior**

At widths below 1180px, start with icon-only labels in the dock. Below 980px, collapse the inspector by default but leave the toggle visible. Add `:focus-visible` rings and:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 5: Run UI and existing smoke tests**

Run:

```powershell
$env:NODE_PATH = Join-Path $HOME '.cache/pw-smoke/node_modules'
node refactor/verify_ui_shell.js
node refactor/smoke_visual.js
node refactor/visual_golden.js
```

Expected: UI shell PASS, smoke has zero console errors, and all 16 canvas golden fixtures have `diffPixels=0`.

- [ ] **Step 6: Commit the workspace shell**

```powershell
git add index.html css/styles.css js/app.js refactor/verify_ui_shell.js
git commit -m "feat: build premium clinical workspace shell"
```

---

### Task 3: Define Smart Placement as Pure App Logic

**Files:**
- Create: `refactor/verify_placement.js`
- Modify: `js/app.js:40-100,1684-1760,1970-2050,3924-4070`
- Test: `refactor/verify_placement.js`

**Interfaces:**
- Consumes: `GenogramApp.GRID`, `personMap`, `getKinshipEngine()`, and existing generation helpers.
- Produces:
  - `getPlacementCandidate(request): {x:number,y:number,occupied:boolean,guides:Object,relationshipPreview:Array}`
  - `findNearestOpenCell(x, y, excludedIds = new Set()): {x:number,y:number,occupied:boolean}`
  - `beginPlacement(request)`, `updatePlacement(x, y, bypassSnap = false)`, `cancelPlacement()`, `commitPlacement()`
  - `placementSession: null | {request,candidate,ghostPerson}`

- [ ] **Step 1: Write failing placement geometry tests**

Create browser assertions for these exact cases using `GenogramApp.GRID.CELL_WIDTH` and `CELL_HEIGHT` rather than duplicated numbers:

```js
// partner: same row, nearest open side
candidate = app.getPlacementCandidate({ kind: 'partner', basePersonId: base.id });
assert(candidate.y === base.y);
assert(Math.abs(candidate.x - base.x) === grid.CELL_WIDTH);

// child: next row and parent midpoint when two parents exist
candidate = app.getPlacementCandidate({ kind: 'child', basePersonId: base.id });
assert(candidate.y === app.getGenerationYByIndex(app.getGenerationIndexByY(base.y) + 1));
assert(candidate.x === (base.x + spouse.x) / 2);

// occupied first choice: same-row nearest free cell; existing person remains unchanged
```

Also assert parent candidates use the previous generation row, sibling candidates share the base row, and all lookups work after reordering `app.persons` because logic uses `personMap`.

- [ ] **Step 2: Run and verify the geometry test fails**

```powershell
$env:NODE_PATH = Join-Path $HOME '.cache/pw-smoke/node_modules'
node refactor/verify_placement.js --logic
```

Expected: FAIL with `getPlacementCandidate is not a function`.

- [ ] **Step 3: Implement deterministic open-cell search**

Implement `findNearestOpenCell()` by testing the requested cell first, then offsets `-1,+1,-2,+2...` on the same row. A cell is occupied when a non-excluded person is within `CELL_WIDTH * 0.35` horizontally and `CELL_HEIGHT * 0.35` vertically. Return the first free cell without moving any person.

- [ ] **Step 4: Implement relationship-aware candidate calculation**

Use `KinshipEngine` only for parent/spouse/child context. Candidate rules:

```js
const rules = {
  partner: { rowDelta: 0, preferredX: base.x + grid.CELL_WIDTH },
  sibling: { rowDelta: 0, preferredX: base.x + grid.CELL_WIDTH },
  child:   { rowDelta: 1, preferredX: parentsMid ?? base.x },
  parent:  { rowDelta: -1, preferredX: base.x }
};
```

For a two-parent child, use the midpoint. For sibling, reuse shared parent IDs to generate `relationshipPreview`. Return guides in the same shape accepted by `drawAlignmentGuides()`.

- [ ] **Step 5: Run logic tests and regression tests**

```powershell
node refactor/verify_placement.js --logic
node refactor/verify_drag.js
node refactor/verify_fixes.js
```

Expected: placement logic PASS, drag 16/16, all fix checks pass.

- [ ] **Step 6: Commit pure placement logic**

```powershell
git add js/app.js refactor/verify_placement.js
git commit -m "feat: calculate relationship-aware placement cells"
```

---

### Task 4: Render Placement Ghosts as Non-Exported Overlays

**Files:**
- Modify: `js/canvas.js:252-400,4963-5100`
- Modify: `js/app.js:3819-3850`
- Test: `refactor/verify_placement.js`

**Interfaces:**
- Consumes: `canvas.placementPreview` injected by `App.render()`.
- Produces: `drawPlacementPreview(preview)` and `drawPlacementCell(candidate)`; neither is called by export methods.

- [ ] **Step 1: Add failing pixel/state tests**

Start a placement session and assert a screenshot contains the brand-colored candidate-cell outline near the candidate. Export PNG during the same session and compare it with an export after `cancelPlacement()`; pixel buffers must match exactly.

- [ ] **Step 2: Run and verify overlay tests fail**

```powershell
node refactor/verify_placement.js --overlay
```

Expected: FAIL because no placement overlay is rendered.

- [ ] **Step 3: Inject placement state during normal render only**

In `App.render()`:

```js
this.canvas.placementPreview = this.placementSession
  ? this.placementSession.candidate
  : null;
```

Do not add placement state to `drawPersonForExport()`, `exportToPNG()`, `exportToSVG()`, or PDF export paths.

- [ ] **Step 4: Draw the overlay after people and before interactive buttons**

`drawPlacementPreview()` must save/restore context, use `#ed1261` only for the editing overlay, draw a translucent person ghost via the existing symbol geometry, show a rounded candidate cell, and draw relationship previews with a neutral selection dash. Use `occupied` to show an unavailable marker without changing relationship colors.

- [ ] **Step 5: Run overlay, golden, and export tests**

```powershell
node refactor/verify_placement.js --overlay
node refactor/visual_golden.js
node refactor/verify_roundtrip.js
```

Expected: overlay tests PASS, 16 golden fixtures remain zero-diff, roundtrip 8/8.

- [ ] **Step 6: Commit overlay rendering**

```powershell
git add js/app.js js/canvas.js refactor/verify_placement.js
git commit -m "feat: preview smart placement on canvas"
```

---

### Task 5: Add the Placement Interaction Lifecycle

**Files:**
- Modify: `js/app.js:250-330,571-1130,1684-1760`
- Test: `refactor/verify_placement.js`

**Interfaces:**
- Consumes: Task 3 placement methods and Task 4 overlay renderer.
- Produces: placement pointer lifecycle; Escape cancel; Alt bypass; one-history-entry commit.

- [ ] **Step 1: Write failing interaction tests**

Automate: click Add Person → choose gender → move mouse to canvas → see preview → click to commit. Assert person count increases only on final canvas click, `personMap.get(newId)` returns the person, tool returns to select, and history increases once. Start another placement and press Escape; assert counts and history do not change. Hold Alt and assert candidate follows pointer without snapping to the nearest cell.

- [ ] **Step 2: Run and verify interaction tests fail**

```powershell
node refactor/verify_placement.js --interaction
```

Expected: FAIL because gender selection still creates immediately instead of entering placement mode.

- [ ] **Step 3: Route general add-person through placement mode**

After gender selection, call:

```js
this.beginPlacement({
  kind: 'person',
  gender,
  generation: this.pendingGeneration
});
```

Pointer move calls `updatePlacement(point.x, point.y, e.altKey)`. Pointer down commits only when `placementSession` exists and the pointer is over the canvas. Escape calls `cancelPlacement()` before other Escape behavior.

- [ ] **Step 4: Make commit atomic**

`commitPlacement()` calls `saveState()` once, creates the `Person`, pushes it, immediately calls `personMap.set(person.id, person)`, creates any requested relationships, clears placement state, selects the new person, autosaves, and renders. Cancellation clears state without `saveState()`.

- [ ] **Step 5: Run interaction and existing history tests**

```powershell
node refactor/verify_placement.js --interaction
node refactor/verify_drag.js
node refactor/verify_hh_lc.js
```

Expected: placement interaction PASS, drag 16/16, HH/LC checks all pass.

- [ ] **Step 6: Commit the placement lifecycle**

```powershell
git add js/app.js refactor/verify_placement.js
git commit -m "feat: place new people with canvas previews"
```

---

### Task 6: Apply Smart Placement to Quick-Add Relatives

**Files:**
- Modify: `js/app.js:1703-2050`
- Test: `refactor/verify_placement.js`
- Test: `refactor/verify_childlink.js`

**Interfaces:**
- Consumes: `getPlacementCandidate()`, `beginPlacement()`, `commitPlacement()`, `KinshipEngine`, and existing relationship constructors.
- Produces: quick-add requests for `parent`, `partner`, `sibling`, and `child` with previewed relationships.

- [ ] **Step 1: Write failing quick-add tests**

For each quick-add type, assert the suggested row and X, relationship direction, single history entry, and preservation of existing people. For parent creation, keep the existing one-click two-parent behavior but preview the pair and all three relationships as one placement transaction. For child creation with a spouse, assert the child uses the couple midpoint.

- [ ] **Step 2: Run and verify quick-add tests fail**

```powershell
node refactor/verify_placement.js --quick-add
```

Expected: FAIL because current quick-add creates immediately at fixed/rightmost coordinates.

- [ ] **Step 3: Convert quick-add constructors into placement requests**

Replace direct coordinate selection in `createParentsForPerson()`, `createChildForPerson()`, and `createQuickPersonWithGender()` with requests that contain all persons and relationships to commit. Do not duplicate kinship direction logic; every new parent-child relationship is constructed `fromPersonId=parent.id`, `toPersonId=child.id`.

- [ ] **Step 4: Preserve atomic history and status feedback**

Remove pre-modal `saveState()` calls that would create empty history entries. Save only when the preview is confirmed. Status text must distinguish “選擇格位” from “已建立…”. Escape returns to the prior selection without data changes.

- [ ] **Step 5: Run quick-add and relationship regression tests**

```powershell
node refactor/verify_placement.js --quick-add
node refactor/verify_childlink.js
node refactor/verify_twins.js
node refactor/verify_marriage_geom.js
```

Expected: new quick-add tests PASS; existing child-link, twins, and marriage geometry suites remain fully green.

- [ ] **Step 6: Commit quick-add placement**

```powershell
git add js/app.js refactor/verify_placement.js
git commit -m "feat: preview aligned quick-add relatives"
```

---

### Task 7: Polish, Synchronize Copies, and Run the Release Gate

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`
- Modify: `js/app.js`
- Modify: `js/canvas.js`
- Modify ignored copies: `geno/index.html`, `geno/css/styles.css`, `geno/js/app.js`, `geno/js/canvas.js`, `refactor/app/index.html`, `refactor/app/css/styles.css`, `refactor/app/js/app.js`, `refactor/app/js/canvas.js`
- Test: all relevant `refactor/verify_*.js` and `refactor/visual_golden.js`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: phase-one release candidate for user review on the feature branch.

- [ ] **Step 1: Perform a desktop and laptop visual QA pass**

Capture 1440×900 and 1024×768 screenshots with: empty canvas, selected person/property inspector, legend tab, collapsed inspector, active placement preview, and occupied-cell fallback. Check alignment on an 8px rhythm, tool target sizes, no clipped labels, and no canvas obstruction.

- [ ] **Step 2: Fix only issues found in the QA pass**

Limit changes to spacing, responsive rules, focus states, labels, and placement overlay clarity. Do not expand scope into focus mode, semantic zoom, label collision, minimap, or local arrangement; those belong to later plans.

- [ ] **Step 3: Synchronize the three copies safely**

Copy changed root JS/CSS to both local copies. For HTML, apply the same structural changes while retaining `geno/index.html` local font/js vendor references. Verify root/`geno`/`refactor/app` MD5 equality for `js/app.js`, `js/canvas.js`, and `css/styles.css`.

- [ ] **Step 4: Run the full phase-one release gate**

```powershell
$env:NODE_PATH = Join-Path $HOME '.cache/pw-smoke/node_modules'
node refactor/verify_ui_shell.js
node refactor/verify_placement.js
node refactor/visual_golden.js
node refactor/verify_drag.js
node refactor/verify_fixes.js
node refactor/verify_hh_lc.js
node refactor/verify_marriage_geom.js
node refactor/verify_roundtrip.js
node refactor/verify_childlink.js
node refactor/verify_twins.js
node refactor/verify_pencil.js
node refactor/smoke_visual.js
node refactor/verify_geno_deploy.js
```

Expected: every suite passes, all 16 frozen canvas fixtures remain zero-diff, smoke has zero console/page errors, and the deploy copy makes zero external requests.

- [ ] **Step 5: Run syntax, diff, and status checks**

```powershell
node --check js/app.js
node --check js/canvas.js
git diff --check
git status --short
```

Expected: syntax checks exit 0, no whitespace errors, and status lists only intended phase-one files.

- [ ] **Step 6: Commit the synchronized release candidate**

```powershell
git add index.html css/styles.css js/app.js js/canvas.js refactor/verify_ui_shell.js refactor/verify_placement.js
git add -f geno/index.html geno/css/styles.css geno/js/app.js geno/js/canvas.js refactor/app/index.html refactor/app/css/styles.css refactor/app/js/app.js refactor/app/js/canvas.js
git commit -m "chore: finalize clinical workspace placement release"
```

- [ ] **Step 7: Stop for user review**

Serve the feature branch locally, provide the user with the app URL and the two QA screenshots, and wait for explicit confirmation. Do not merge or push changes to `main`.
