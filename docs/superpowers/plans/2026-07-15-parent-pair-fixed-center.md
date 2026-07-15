# Parent Pair Fixed Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a quick-created parent pair at its system-computed position throughout preview and confirmation so its midpoint cannot be displaced by pointer movement or clicks.

**Architecture:** Preserve the existing automatic placement calculation in `beginQuickParentPlacement()` and make `updatePlacement()` idempotent only for `kind === 'parent-pair'`. All single-person placement modes continue using the existing pointer and Alt behavior. Add a browser-backed regression around the real pointer handlers, then synchronize the three JavaScript mirrors.

**Tech Stack:** Vanilla JavaScript, HTML Canvas 2D, Playwright, Node.js, Git.

## Global Constraints

- Parent pair positions are computed once when preview begins and remain fixed until cancel or commit.
- Standard clear-space placement uses a 120px parent gap and `parent midpoint X === child X`.
- Pointer move, pointer down, and Alt do not reposition a `parent-pair` session.
- Partner, child, sibling, parent-with-one-existing-parent, and free-person placement retain current pointer behavior.
- Do not modify `Relationship.getLineStyle()`, `DASH_PATTERNS`, clinical line colors, V-preview color, or symbol semantics.
- Existing people and the child are never moved automatically.
- Root `/`, `geno/`, and `refactor/app/` JavaScript copies must have matching MD5 hashes.
- Work stays on `codex/parent-pair-fixed-center`; do not merge `main` without user confirmation.

---

### Task 1: Add a failing real-interaction regression

**Files:**
- Modify: `refactor/verify_placement.js:393-525`

**Interfaces:**
- Consumes: `app.handleQuickAddClick(base, 'parent')`, `app.handlePointerMove(event)`, `app.handlePointerDown(event)`, `app.placementSession.ghostPeople`.
- Produces: a regression fixture proving parent-pair coordinates stay byte-for-byte stable through normal and Alt pointer interaction.

- [ ] **Step 1: Add a helper that drives the real pointer handlers in world coordinates**

Inside the existing `quickE2E` `page.evaluate()` block, add:

```js
const pointerEventAt = (worldX, worldY, altKey = false) => {
    const rect = app.canvas.canvas.getBoundingClientRect();
    return {
        button: 0,
        target: null,
        pointerId: 999,
        clientX: rect.left + worldX * app.canvas.scale + app.canvas.offsetX,
        clientY: rect.top + worldY * app.canvas.scale + app.canvas.offsetY,
        altKey
    };
};
const pairSnapshot = () => ({
    candidate: { x: app.placementSession.candidate.x, y: app.placementSession.candidate.y },
    ghosts: app.placementSession.ghostPeople.map(person => ({ x: person.x, y: person.y }))
});
```

- [ ] **Step 2: Add normal pointer-move and pointer-down coverage**

Create a parent pair, move to a distant cell, then confirm at another distant cell:

```js
base = reset();
app.handleQuickAddClick(base, 'parent');
const normalInitial = pairSnapshot();
app.handlePointerMove(pointerEventAt(base.x + g.CELL_WIDTH * 4, g.ORIGIN_Y));
const normalMoved = pairSnapshot();
app.handlePointerDown(pointerEventAt(base.x + g.CELL_WIDTH * 5, g.ORIGIN_Y));
const normalParents = app.persons.slice(1).map(person => ({ x: person.x, y: person.y }));
result.parentPairLocked = {
    normalInitial,
    normalMoved,
    normalParents,
    normalSelectionCleared: app.selectedPersonId === null
};
```

- [ ] **Step 3: Add Alt coverage and keep other placement modes movable**

Create a second fixture and use Alt for both move and commit:

```js
base = reset();
app.handleQuickAddClick(base, 'parent');
const altInitial = pairSnapshot();
app.handlePointerMove(pointerEventAt(base.x + g.CELL_WIDTH * 3.37, g.ORIGIN_Y + 43, true));
const altMoved = pairSnapshot();
app.handlePointerDown(pointerEventAt(base.x + g.CELL_WIDTH * 4.61, g.ORIGIN_Y + 71, true));
const altParents = app.persons.slice(1).map(person => ({ x: person.x, y: person.y }));
Object.assign(result.parentPairLocked, { altInitial, altMoved, altParents });
```

Update the existing mixed-kind pointer assertion so `parent` stays fixed while `son`, `partner`, and `sibling` still move:

```js
const movedAsDesigned = Object.entries(quickE2E.pointerKinds).every(([type, item]) =>
    type === 'parent' ? item.x === item.before.x : item.x !== item.before.x);
```

- [ ] **Step 4: Assert exact coordinate stability**

Add:

```js
const locked = quickE2E.parentPairLocked;
assert('parent-pair pointer move and click only confirm the automatic position',
    JSON.stringify(locked.normalMoved) === JSON.stringify(locked.normalInitial) &&
    JSON.stringify(locked.normalParents) === JSON.stringify(locked.normalInitial.ghosts) &&
    locked.normalSelectionCleared);
assert('Alt does not unlock automatic parent-pair placement',
    JSON.stringify(locked.altMoved) === JSON.stringify(locked.altInitial) &&
    JSON.stringify(locked.altParents) === JSON.stringify(locked.altInitial.ghosts));
```

- [ ] **Step 5: Run the focused regression and verify RED**

Run:

```powershell
$env:NODE_PATH = 'C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\goh2407\.agents\skills\playwright-skill\node_modules'
node refactor/verify_placement.js --quick-add
```

Expected: the new normal and Alt parent-pair lock assertions fail because current `updatePlacement()` moves the pair; existing non-parent placement assertions pass.

- [ ] **Step 6: Commit the failing regression**

```powershell
git add refactor/verify_placement.js
git commit -m "test: reproduce parent preview anchor drift"
```

---

### Task 2: Lock parent-pair placement and verify all drawing behavior

**Files:**
- Modify: `js/app.js:4445-4467`
- Modify: `refactor/TEST_GATES.md:36-45`
- Modify local mirror: `geno/js/app.js`
- Modify local mirror: `refactor/app/js/app.js`
- Test: `refactor/verify_placement.js`

**Interfaces:**
- Consumes: `placementSession.request.kind` and the candidate/ghost state created by `beginPlacement(request)`.
- Produces: `updatePlacement(x, y, bypassSnap)` that is idempotent for `parent-pair` and unchanged for every other kind.

- [ ] **Step 1: Add the parent-pair early return**

Immediately after reading `originalRequest`, add:

```js
if (originalRequest.kind === 'parent-pair') {
    return this.placementSession.candidate;
}
```

The complete opening becomes:

```js
updatePlacement(x, y, bypassSnap = false) {
    if (!this.placementSession) return null;
    const originalRequest = this.placementSession.request;
    if (originalRequest.kind === 'parent-pair') {
        return this.placementSession.candidate;
    }
    const request = originalRequest.kind === 'person' && !originalRequest.basePersonId
        ? { ...originalRequest, x, y }
        : { ...originalRequest, pointerX: x };
```

Do not modify `getPlacementCandidate()`, route planning, preview drawing, or commit code.

- [ ] **Step 2: Update the test gate wording**

Change the placement gate to:

```markdown
- `node refactor/verify_placement.js`：快速父母固定使用 120px 系統格距；預覽開始後 pointer move／確認點擊／Alt 均不得移動父母配對；受阻時沿用預先計算的安全格位；預覽保留 V 字，提交後清除暫時選取。
```

- [ ] **Step 3: Run focused tests and verify GREEN**

Run:

```powershell
$env:NODE_PATH = 'C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\goh2407\.agents\skills\playwright-skill\node_modules'
node refactor/verify_placement.js --quick-add
node refactor/verify_placement.js --overlay
```

Expected: all focused checks pass; normal and Alt parent-pair snapshots remain identical while other placement kinds still follow the pointer.

- [ ] **Step 4: Synchronize and verify the JavaScript mirrors**

```powershell
Copy-Item -LiteralPath 'js/app.js' -Destination 'geno/js/app.js' -Force
Copy-Item -LiteralPath 'js/app.js' -Destination 'refactor/app/js/app.js' -Force
Get-FileHash js/app.js,geno/js/app.js,refactor/app/js/app.js -Algorithm MD5
```

Expected: all three MD5 hashes are identical. Then run the repository-wide JavaScript mirror check for every root `js/*.js` file; expected mismatch count is 0.

- [ ] **Step 5: Run the full regression suite**

Run:

```powershell
$env:NODE_PATH = 'C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\goh2407\.agents\skills\playwright-skill\node_modules'
$scripts = Get-ChildItem -LiteralPath 'refactor' -File -Filter 'verify*.js' | Sort-Object Name
foreach ($script in $scripts) {
    node $script.FullName
    if ($LASTEXITCODE -ne 0) { throw "Regression failed: $($script.Name)" }
}
node refactor/smoke_visual.js
if ($LASTEXITCODE -ne 0) { throw 'Regression failed: smoke_visual.js' }
```

Expected: every script exits 0; placement, route planner, family routing, drag, relationship edges, UI shell, offline deployment, and smoke visual checks report no console/page errors.

- [ ] **Step 6: Re-run the visible-browser reproduction**

Run `C:\Users\goh2407\AppData\Local\Temp\playwright-test-parent-pair-anchor.js` through the Playwright skill executor, after changing its assertions to require:

```js
after.parentCenterX === before.ghostCenterX
after.parentCenterX === before.child.x
after.spacing === 120
```

Expected: initial preview and committed parent pair have the same coordinates, centered over the child, with zero console/page errors. Visually inspect the screenshot for a symmetric V preview or centered formal trunk as appropriate.

- [ ] **Step 7: Commit the implementation**

```powershell
git add js/app.js refactor/verify_placement.js refactor/TEST_GATES.md
git commit -m "fix: keep automatic parent pair centered"
```

The `geno/` and `refactor/app/` JavaScript copies are gitignored local mirrors; they must still pass the MD5 check even though Git does not stage them.
