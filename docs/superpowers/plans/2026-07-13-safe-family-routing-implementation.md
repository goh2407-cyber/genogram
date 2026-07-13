# Safe Family Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic obstacle-aware family routing, a maximum 60px release correction, and safer 120/180px quick-parent placement without changing clinical colors or symbols.

**Architecture:** A browser/Node-compatible pure `FamilyRoutePlanner` owns finite route candidates and safety checks. `GenogramCanvas` measures display obstacles, supplies marriage geometry, and consumes one plan for drawing, hit testing, highlighting, and export; `GenogramApp` only asks Canvas for a safe release adjustment and chooses the quick-parent pair geometry.

**Tech Stack:** Native JavaScript, Canvas 2D, Node assertion scripts, Playwright browser regression scripts.

## Global Constraints

- Parent/child meaning comes only from `KinshipEngine`; never infer relationship direction from Y.
- Person lookup uses `personMap`; any person mutation keeps `personMap` synchronized.
- Do not modify `Relationship.getLineStyle()`, `DASH_PATTERNS`, clinical line colors, or clinical symbol geometry.
- Extra drag correction is horizontal only, at most `GRID.CELL_WIDTH / 2` (60px), and `Alt` bypasses it.
- Quick-created parents remain one rigid pair and one history transaction; existing people never move.
- Root, `geno/`, and `refactor/app/` JavaScript/HTML copies must be MD5-identical at completion.
- No merge to `main` before explicit user confirmation.

---

### Task 1: Pure finite family route planner

**Files:**
- Create: `js/domain/family-route-planner.js`
- Create: `refactor/verify_family_route_planner.js`

**Interfaces:**
- Consumes: `planFamily({ parents, children, source, sourceRange, obstacles, personSize, margin })` with world-coordinate plain objects.
- Produces: `{ mode, safe, sourcePath, barPath, childPaths, relationshipPaths, collisions, suggestedDx }` and static `pathIntersectsObstacles(points, obstacles, allowedOwnerIds)`.

- [ ] **Step 1: Write the failing deterministic planner tests**

```js
const assert = require('assert');
const FamilyRoutePlanner = require('../js/domain/family-route-planner.js');

const normal = FamilyRoutePlanner.planFamily({
  parents: [{ id: 'dad', x: 440, y: 300 }, { id: 'mom', x: 560, y: 300 }],
  children: [{ id: 'kid', x: 500, y: 420 }],
  source: { x: 500, y: 300 }, sourceRange: { minX: 465, maxX: 535 },
  obstacles: [], personSize: 50, margin: 10
});
assert.equal(normal.mode, 'normal-trunk');
assert.equal(normal.safe, true);
assert.deepEqual(normal.relationshipPaths['dad->kid'], normal.relationshipPaths['mom->kid']);
assert.ok(normal.relationshipPaths['dad->kid'].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));

const blocked = FamilyRoutePlanner.planFamily({
  parents: [{ id: 'dad', x: 440, y: 300 }, { id: 'mom', x: 560, y: 300 }],
  children: [{ id: 'kid', x: 500, y: 500 }],
  source: { x: 500, y: 300 }, sourceRange: { minX: 465, maxX: 535 },
  obstacles: [{ ownerId: 'other', kind: 'symbol', left: 485, right: 515, top: 340, bottom: 420 }],
  personSize: 50, margin: 10
});
assert.equal(blocked.safe, true);
assert.notEqual(blocked.trunkX, 500);

const reversed = FamilyRoutePlanner.planFamily({
  parents: [{ id: 'dad', x: 440, y: 420 }, { id: 'mom', x: 560, y: 420 }],
  children: [{ id: 'kid', x: 500, y: 180 }], obstacles: [], personSize: 50, margin: 10
});
assert.equal(reversed.mode, 'reversed');
assert.ok(reversed.relationshipPaths['dad->kid'][0].y > reversed.relationshipPaths['dad->kid'].at(-1).y);

const sameRow = FamilyRoutePlanner.planFamily({
  parents: [{ id: 'dad', x: 300, y: 300 }],
  children: [{ id: 'kid', x: 500, y: 300 }], obstacles: [], personSize: 50, margin: 10
});
assert.equal(sameRow.mode, 'same-row');
assert.ok(sameRow.relationshipPaths['dad->kid'].every((p, i, a) => i === 0 || p.x === a[i - 1].x || p.y === a[i - 1].y));
```

- [ ] **Step 2: Run the planner test and verify RED**

Run: `node refactor/verify_family_route_planner.js`

Expected: FAIL with `Cannot find module '../js/domain/family-route-planner.js'`.

- [ ] **Step 3: Implement the finite candidate planner**

```js
class FamilyRoutePlanner {
  static planFamily(input) {
    const parents = [...(input.parents || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const children = [...(input.children || [])].sort((a, b) => a.x - b.x || String(a.id).localeCompare(String(b.id)));
    if (!parents.length || !children.length) return this.emptyPlan();
    const parentY = parents.reduce((sum, p) => sum + p.y, 0) / parents.length;
    const childY = children.reduce((sum, p) => sum + p.y, 0) / children.length;
    if (Math.abs(childY - parentY) < (input.personSize || 50)) return this.planPairwise('same-row', input, parents, children);
    if (childY < parentY) return this.planPairwise('reversed', input, parents, children);
    return this.planNormal(input, parents, children);
  }
}

if (typeof window !== 'undefined') window.FamilyRoutePlanner = FamilyRoutePlanner;
if (typeof module !== 'undefined' && module.exports) module.exports = FamilyRoutePlanner;
```

Implement `planNormal` with a constant candidate set: preferred source X, children center, source X ± 30/60 clamped to `sourceRange`, then left/right family lanes. Score candidates by collisions, vertical reversal, bends, length, then X. `planPairwise` tries the direct orthogonal middle lane followed by deterministic left/right lanes. Remove duplicate consecutive points and reject all non-finite output.

- [ ] **Step 4: Run planner tests and verify GREEN**

Run: `node refactor/verify_family_route_planner.js`

Expected: all planner assertions print `PASS`, including normal, blocked, same-row, reversed, labels, twins, zero-length, and three-run determinism fixtures.

- [ ] **Step 5: Commit Task 1**

```powershell
git add js/domain/family-route-planner.js refactor/verify_family_route_planner.js
git commit -m "feat: add deterministic family route planner"
```

### Task 2: Canvas obstacle measurement and shared family geometry

**Files:**
- Modify: `index.html:683-689`
- Modify: `js/canvas.js:252-310,3440-3908,4479-4715`
- Create: `refactor/verify_family_routing.js`

**Interfaces:**
- Consumes: `window.FamilyRoutePlanner` and normalized family groups from `KinshipEngine`.
- Produces: `GenogramCanvas.getFamilyRoutePlans(familyRels, persons, otherRels, kinship)`, `getPersonRouteObstacles(persons)`, and `getFamilyRouteSafety(personId)`.

- [ ] **Step 1: Add a failing browser regression**

```js
const result = await page.evaluate(() => {
  const app = window.app;
  // Create two parents, one child, a central unrelated obstacle, and long parent labels.
  // Render, then compare the selected parent-child hit path to Canvas' cached draw path.
  const route = app.canvas.getRelationshipPath(parent, child, edge, app.relationships);
  return {
    plannerLoaded: typeof window.FamilyRoutePlanner === 'function',
    finite: route.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)),
    noObstacleCrossing: !window.FamilyRoutePlanner.pathIntersectsObstacles(route, [obstacleRect], new Set([child.id])),
    shared: JSON.stringify(route) === JSON.stringify(app.canvas._familyRelationshipPaths.get(edge.id))
  };
});
assert(result.plannerLoaded && result.finite && result.noObstacleCrossing && result.shared);
```

- [ ] **Step 2: Run the browser regression and verify RED**

Run: `$env:NODE_PATH='C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'; node refactor/verify_family_routing.js`

Expected: FAIL because `FamilyRoutePlanner` is not loaded and `_familyRelationshipPaths` is absent.

- [ ] **Step 3: Load the planner before Canvas**

```html
<script src="js/domain/kinship-engine.js"></script>
<script src="js/domain/family-route-planner.js"></script>
<script src="js/history.js"></script>
<script src="js/canvas.js"></script>
```

- [ ] **Step 4: Add exact symbol/name/note obstacle measurement**

```js
getPersonRouteObstacles(persons) {
  const boxes = [];
  persons.forEach(person => {
    boxes.push({ ownerId: person.id, kind: 'symbol', left: person.x - 35, right: person.x + 35,
      top: person.y - 35, bottom: person.y + 35 });
    // measure name and the same maximum two note lines with the fonts used by drawPerson().
  });
  return boxes;
}
```

- [ ] **Step 5: Replace duplicate family geometry with planner output**

`drawFamilies()` builds each normalized family once, asks `FamilyRoutePlanner.planFamily()`, stores every relationship path in `_familyRelationshipPaths`, and draws `sourcePath`, `barPath`, twin paths, and child paths. Existing `DASH_PATTERNS` selection remains unchanged: one-child routes use that child's link dash, shared trunks stay solid, and each child drop uses its current biological/adopted/foster dash. `getRelationshipPath()` returns the cached path when its family signature matches or calls the same plan builder on demand.

- [ ] **Step 6: Run focused Canvas regressions**

Run:

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node refactor/verify_family_routing.js
node refactor/verify_childlink.js
node refactor/verify_twins.js
node refactor/verify_pencil.js
node refactor/verify_relationship_edges.js
```

Expected: all assertions pass with zero console/page errors.

- [ ] **Step 7: Commit Task 2**

```powershell
git add index.html js/canvas.js refactor/verify_family_routing.js
git commit -m "feat: share obstacle-aware family geometry"
```

### Task 3: Release correction and quick-parent pair safety

**Files:**
- Modify: `js/app.js:1186-1393,1874-1914,4249-4347`
- Modify: `js/canvas.js` (safe-offset query only)
- Modify: `refactor/verify_drag.js`
- Modify: `refactor/verify_placement.js`

**Interfaces:**
- Consumes: `GenogramCanvas.findSafeFamilyRouteAdjustment(personId, [-60, 60], persons, relationships)`.
- Produces: horizontal-only release correction and `findQuickParentPairPlacement(child)` returning `{ centerX, parentY, gap }` where `gap` is exactly 120 or 180.

- [ ] **Step 1: Add failing drag and parent-placement assertions**

```js
assert('unsafe single drag corrects by at most half a cell and keeps Y',
  Math.abs(after.x - snapped.x) <= data.grid.CELL_WIDTH / 2 && after.y === snapped.y);
assert('Alt release bypasses route correction', altAfter.x === altSnapped.x);
assert('parent pair expands to 180 only when 120 is blocked', crowded.spacing === 180);
assert('parent pair remains rigid and leaves existing people unchanged', crowded.rigid && crowded.existingUnchanged);
assert('one undo restores the complete drag or parent transaction', undoCount === 1);
```

- [ ] **Step 2: Run both regressions and verify RED**

Run:

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node refactor/verify_drag.js
node refactor/verify_placement.js
```

Expected: the new route-correction and 180px assertions fail while existing assertions remain green.

- [ ] **Step 3: Apply release correction inside the existing drag transaction**

After grid/Y snapping and before clearing `draggedPerson`, only for one individually dragged person and when `!e.altKey`, ask Canvas for `[-GRID.CELL_WIDTH / 2, GRID.CELL_WIDTH / 2]`. Reject occupied candidates, never alter Y/generation, and leave the current X unchanged if neither route is safer. The existing `dragStartSnapshot` remains the only history entry.

- [ ] **Step 4: Choose quick-parent gap deterministically**

```js
findQuickParentPairPlacement(child) {
  const grid = GenogramApp.GRID;
  const parentY = this.getGenerationYByIndex(this.getGenerationIndexByY(child.y) - 1);
  const offsets = [0];
  for (let d = 1; d <= this.persons.length + 4; d++) offsets.push(-d * grid.CELL_WIDTH, d * grid.CELL_WIDTH);
  for (const offset of offsets) {
    for (const gap of [grid.CELL_WIDTH, grid.CELL_WIDTH * 1.5]) {
      const centerX = child.x + offset;
      if (this.isQuickParentPairSafe(centerX, parentY, gap, child.id)) return { centerX, parentY, gap };
    }
  }
  return { centerX: child.x, parentY, gap: grid.CELL_WIDTH };
}
```

Use the result in `beginQuickParentPlacement()`; preserve `parent-pair`, three preview relationships, rigid `ghostPeople`, and the current atomic `commitPlacement()`.

- [ ] **Step 5: Run drag and placement regressions and verify GREEN**

Run:

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node refactor/verify_drag.js
node refactor/verify_fixes.js
node refactor/verify_placement.js
```

Expected: all old and new assertions pass.

- [ ] **Step 6: Commit Task 3**

```powershell
git add js/app.js js/canvas.js refactor/verify_drag.js refactor/verify_placement.js
git commit -m "feat: add gentle route-safe placement correction"
```

### Task 4: Copy synchronization and release verification

**Files:**
- Copy: `js/domain/family-route-planner.js` to `geno/js/domain/` and `refactor/app/js/domain/`
- Copy: `js/app.js`, `js/canvas.js`, `index.html` to corresponding `geno/` and `refactor/app/` paths
- Modify: `refactor/TEST_GATES.md` with the new verification commands

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: MD5-identical runtime copies and fresh release evidence.

- [ ] **Step 1: Synchronize the three runtime copies**

Use `Copy-Item -LiteralPath` for each exact source/destination pair, then compute `Get-FileHash -Algorithm MD5` for every triple. Expected: one unique hash per logical file.

- [ ] **Step 2: Run syntax and focused route gates**

Run:

```powershell
node --check js/domain/family-route-planner.js
node --check js/canvas.js
node --check js/app.js
node refactor/verify_family_route_planner.js
$env:NODE_PATH='C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node refactor/verify_family_routing.js
node refactor/verify_drag.js
node refactor/verify_placement.js
```

Expected: zero syntax errors and every assertion passes.

- [ ] **Step 3: Run the complete project regression gates**

Run every `refactor/verify_*.js`, `refactor/smoke_visual.js`, and `refactor/visual_golden.js` with the configured Playwright `NODE_PATH`. Expected: zero failed assertions, zero console/page errors, and unchanged clinical color samples. Any expected route-only golden change is reviewed individually; no blanket baseline overwrite.

- [ ] **Step 4: Run deployment and performance checks**

Run `node refactor/verify_geno_deploy.js` and `PYTHONIOENCODING=utf-8 python refactor/benchmarks/fps_bench.py`. Expected: offline runtime dependencies pass, three-copy checks pass, and the 240-person render remains below the documented 50ms target.

- [ ] **Step 5: Commit synchronized copies and gates**

```powershell
git add refactor/TEST_GATES.md
git add -f geno/js/domain/family-route-planner.js refactor/app/js/domain/family-route-planner.js
git commit -m "test: verify safe family routing release gates"
```

- [ ] **Step 6: Stop before integration**

Report branch, commits, exact test counts, visual artifacts, and any expected golden differences. Do not merge or push to `main`; wait for the user's visual confirmation.
