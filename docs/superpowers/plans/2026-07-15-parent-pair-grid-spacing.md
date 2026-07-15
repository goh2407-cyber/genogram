# Parent Pair Grid Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make quick-created parent pairs use one 120px grid unit, retain the V-shaped placement preview, and show a clean formal family route after commit.

**Architecture:** Keep placement search and commit semantics in `GenogramApp`, with the two new parents treated as one rigid unit. Keep editor-only visibility in `GenogramCanvas`, while leaving `FamilyRoutePlanner` and all clinical styles untouched. Extend the existing Playwright regression script before changing production code, then synchronize the three JavaScript copies.

**Tech Stack:** Vanilla JavaScript, HTML Canvas 2D, Playwright, Node.js, Git.

## Global Constraints

- Parent spacing is exactly `GenogramApp.GRID.CELL_WIDTH` (currently 120px); 180px is not a fallback.
- The V-shaped neutral dashed preview remains unchanged during placement.
- Existing people never move when a blocked parent pair is shifted.
- After a parent-pair commit, clear person and relationship selection so no blue selection or quick-add UI covers the formal route.
- Do not modify clinical relationship colors, line styles, symbol semantics, `Relationship.getLineStyle()`, or `DASH_PATTERNS`.
- Root `/`, `geno/`, and `refactor/app/` JavaScript copies must have matching MD5 hashes.
- Work stays on `codex/genogram-ux-drawing-optimization`; do not merge `main` without user confirmation.

---

### Task 1: Lock the regression behavior

**Files:**
- Modify: `refactor/verify_placement.js:393-520`
- Modify: `refactor/verify_placement.js:646-705`

**Interfaces:**
- Consumes: `GenogramApp.GRID.CELL_WIDTH`, `app.handleQuickAddClick(person, 'parent')`, `app.commitPlacement()`, `GenogramCanvas.render()`.
- Produces: regression assertions for rigid spacing, clean selection state, quick-button suppression, and the unchanged three-segment V preview.

- [ ] **Step 1: Change the blocked-pair fixture to require a shifted 120px unit**

Record `pairCenter` and assert the pair moves from the original center while preserving the system gap:

```js
const pairCenter = (pairGhosts[0].x + pairGhosts[1].x) / 2;
result.parentOccupied = {
    shifted: pairCenter !== base.x,
    spacing: Math.abs(pairGhosts[1].x - pairGhosts[0].x),
    // retain history, coordinate, endpoint, and direction checks
};
```

Replace the old 180px assertion with:

```js
assert('blocked parent pair shifts as a rigid system-width unit without moving existing people',
    quickE2E.parentOccupied.shifted &&
    quickE2E.parentOccupied.spacing === data.grid.CELL_WIDTH &&
    quickE2E.parentOccupied.existingUnchanged);
```

- [ ] **Step 2: Require parent-pair commit to clear transient selection**

Capture the completed positions and selection state:

```js
result.parent = {
    people: app.persons.length,
    rels: app.relationships.length,
    spacing: Math.abs(app.persons[2].x - app.persons[1].x),
    centered: (app.persons[1].x + app.persons[2].x) / 2 === base.x,
    nextRow: app.persons[1].y === base.y - g.CELL_HEIGHT && app.persons[2].y === base.y - g.CELL_HEIGHT,
    selectionCleared: app.selectedPersonId === null && app.selectedPersonIds.length === 0 && app.selectedRelationshipId === null
};
```

Assert `spacing === CELL_WIDTH`, `centered`, `nextRow`, and `selectionCleared` along with the existing relationship/history checks.

- [ ] **Step 3: Instrument quick-button rendering during placement**

In the overlay fixture, select the base person, replace `drawQuickAddButtons` with a counter, render before/during/after a placement session, then restore the method:

```js
let quickButtonCalls = 0;
const realQuickButtons = app.canvas.drawQuickAddButtons;
app.canvas.drawQuickAddButtons = () => { quickButtonCalls++; };
app.selectedPersonId = base.id;
app.render();
const beforePlacementCalls = quickButtonCalls;
const active = app.beginPlacement({ kind: 'partner', basePersonId: base.id, personId: 'button-ghost' });
app.render();
const duringPlacementCalls = quickButtonCalls - beforePlacementCalls;
app.cancelPlacement();
app.render();
const afterCancelCalls = quickButtonCalls - beforePlacementCalls - duringPlacementCalls;
app.canvas.drawQuickAddButtons = realQuickButtons;
```

Assert `beforePlacementCalls > 0`, `duringPlacementCalls === 0`, and `afterCancelCalls > 0`.

- [ ] **Step 4: Keep the V preview contract exact**

Use the existing captured `pairSegments` and require the three endpoint-to-endpoint segments (father–mother, father–child, mother–child) to remain:

```js
assert('parent-pair overlay retains exactly three V-preview relationships',
    overlay.pairRelationshipSegments === 3,
    `segments=${overlay.pairRelationshipSegments}`);
```

- [ ] **Step 5: Run the focused tests and verify RED**

Run:

```powershell
$env:NODE_PATH = (npm root -g)
node refactor/verify_placement.js --quick-add
node refactor/verify_placement.js --overlay
```

Expected: the new 120px blocked-pair, cleared-selection, and hidden-quick-button assertions fail against the old implementation; the V-preview assertion passes.

- [ ] **Step 6: Commit the failing regression tests**

```powershell
git add refactor/verify_placement.js
git commit -m "test: cover parent pair grid spacing"
```

---

### Task 2: Implement fixed spacing and clean completion

**Files:**
- Modify: `js/app.js:1972-1988`
- Modify: `js/app.js:4495-4515`
- Modify: `js/canvas.js:371-377`
- Modify: `refactor/TEST_GATES.md:36-45`
- Modify: `geno/js/app.js`
- Modify: `geno/js/canvas.js`
- Modify: `refactor/app/js/app.js`
- Modify: `refactor/app/js/canvas.js`

**Interfaces:**
- Consumes: existing `isQuickParentPairSafe(centerX, parentY, gap, child)` and `placementPreview` injection.
- Produces: `findQuickParentPairPlacement(child): { centerX, parentY, gap }` with a constant system gap and a parent-pair-specific clean commit state.

- [ ] **Step 1: Restrict parent-pair search to the system gap**

Replace the nested gap loop with a single value:

```js
findQuickParentPairPlacement(child) {
    const grid = GenogramApp.GRID;
    const parentY = this.getGenerationYByIndex(this.getGenerationIndexByY(child.y) - 1);
    const standardGap = grid.CELL_WIDTH;
    const offsets = [0];
    for (let distance = 1; distance <= this.persons.length + 4; distance++) {
        offsets.push(-distance * grid.CELL_WIDTH, distance * grid.CELL_WIDTH);
    }
    for (const offset of offsets) {
        const centerX = child.x + offset;
        if (this.isQuickParentPairSafe(centerX, parentY, standardGap, child)) {
            return { centerX, parentY, gap: standardGap };
        }
    }
    return { centerX: child.x, parentY, gap: standardGap };
}
```

- [ ] **Step 2: Clear transient selection only for parent-pair commit**

After creating the two people and three relationships, replace the first-person selection with a clean state:

```js
this.placementSession = null;
this.selectedPersonId = null;
this.selectedPersonIds = [];
this.selectedRelationshipId = null;
this.setTool('select');
this.autoSave();
this.render();
```

Remove `if (index === 0) this.selectedPersonId = person.id;`. Do not change single-person placement, which still selects the created person.

- [ ] **Step 3: Hide quick-add buttons while any placement preview is active**

Change the Canvas render guard without changing drawing styles:

```js
if (selectedId && !this.isDragging && !this.placementPreview) {
    const selPerson = this.personMap.get(selectedId);
    if (selPerson) this.drawQuickAddButtons(selPerson);
}
```

- [ ] **Step 4: Update the test gate wording**

Change the placement gate to:

```markdown
- `node refactor/verify_placement.js`：快速父母固定使用 120px 系統格距；受阻時整組平移、既有人物座標不變；預覽保留 V 字，提交後清除暫時選取。
```

- [ ] **Step 5: Synchronize the three JavaScript copies**

Copy only the changed JavaScript files:

```powershell
Copy-Item -LiteralPath 'js/app.js' -Destination 'geno/js/app.js' -Force
Copy-Item -LiteralPath 'js/app.js' -Destination 'refactor/app/js/app.js' -Force
Copy-Item -LiteralPath 'js/canvas.js' -Destination 'geno/js/canvas.js' -Force
Copy-Item -LiteralPath 'js/canvas.js' -Destination 'refactor/app/js/canvas.js' -Force
```

Verify each triplet has one unique MD5 hash:

```powershell
Get-FileHash js/app.js,geno/js/app.js,refactor/app/js/app.js -Algorithm MD5
Get-FileHash js/canvas.js,geno/js/canvas.js,refactor/app/js/canvas.js -Algorithm MD5
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
$env:NODE_PATH = (npm root -g)
node refactor/verify_placement.js --quick-add
node refactor/verify_placement.js --overlay
```

Expected: all focused checks pass, including exact 120px spacing, hidden quick buttons, clean selection, and three V-preview relationships.

- [ ] **Step 7: Commit the implementation**

```powershell
git add js/app.js js/canvas.js refactor/verify_placement.js refactor/TEST_GATES.md
git commit -m "fix: align quick parent pairs to grid"
```

The `geno/` and `refactor/app/` copies are gitignored local mirrors; verify their hashes even when Git does not stage them.

---

### Task 3: Verify formal routing and full compatibility

**Files:**
- Create temporarily outside the repository: `%TEMP%\verify-parent-pair-visual.js`
- Create temporarily outside the repository: `%TEMP%\parent-pair-preview-after.png`
- Create temporarily outside the repository: `%TEMP%\parent-pair-commit-after.png`

**Interfaces:**
- Consumes: the local `index.html`, Playwright Chromium, `window.app`, and Canvas screenshots.
- Produces: visual evidence that preview and completed states match the approved behavior without modifying repository assets.

- [ ] **Step 1: Run the complete relevant regression suite**

Run:

```powershell
$env:NODE_PATH = (npm root -g)
node refactor/verify_placement.js
node refactor/verify_family_route_planner.js
node refactor/verify_family_routing.js
node refactor/verify_drag.js
node refactor/verify_fixes.js
node refactor/smoke_visual.js
```

Expected: every script exits 0, with no console or page errors.

- [ ] **Step 2: Verify the three-copy JavaScript invariant**

Run:

```powershell
$files = Get-ChildItem -LiteralPath 'js' -File -Filter '*.js'
foreach ($file in $files) {
    $hashes = @(
        (Get-FileHash -LiteralPath $file.FullName -Algorithm MD5).Hash,
        (Get-FileHash -LiteralPath (Join-Path 'geno/js' $file.Name) -Algorithm MD5).Hash,
        (Get-FileHash -LiteralPath (Join-Path 'refactor/app/js' $file.Name) -Algorithm MD5).Hash
    ) | Select-Object -Unique
    if ($hashes.Count -ne 1) { throw "JS mirror mismatch: $($file.Name)" }
}
```

Expected: no exception.

- [ ] **Step 3: Capture preview and committed screenshots in visible Chromium**

The temporary script must load the local file URL, create one child at a grid position, select it, click the parent quick-add path, and save the preview screenshot. It then commits and saves the final screenshot while collecting `pageerror` and console-error events.

Expected preview: two parents one system grid unit apart, three neutral dashed V-preview segments, no quick-add buttons.

Expected completion: horizontal parent partner line with one centered vertical child trunk, no selection border, no quick-add buttons, no console/page errors.

- [ ] **Step 4: Inspect both screenshots and repository state**

Open the two screenshots for visual inspection, then run:

```powershell
git diff --check
git status --short --branch
```

Expected: no whitespace errors and only intentional branch commits; no temporary scripts or screenshots appear in the repository.

- [ ] **Step 5: Record verification if documentation changed**

If regression counts or test-date records require an update, edit only `refactor/TEST_GATES.md`, run `git diff --check`, and commit:

```powershell
git add refactor/TEST_GATES.md
git commit -m "docs: record parent spacing verification"
```

Otherwise, do not create an empty commit.
