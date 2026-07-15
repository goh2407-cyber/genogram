# Parent Family Gentle Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a close partner's existing parents block a second centered parent pair, move only the currently selected child the smallest safe distance outward so both parent families retain clean centered trunks.

**Architecture:** Keep the movement policy in `GenogramApp`: detect the narrow spouse-parent collision, calculate a bounded existing-person adjustment, preview it as an additional ghost, and apply it in the same history transaction as the new parent pair. Reuse `FamilyRoutePlanner` only as the existing pure safety check; Canvas already resolves relationship-preview endpoints through `ghostPeople`, so no drawing-style change is required.

**Tech Stack:** Vanilla JavaScript, HTML Canvas 2D, Playwright, Node.js, Git, PowerShell 5.1.

## Global Constraints

- Only the person currently receiving parents may move; the partner, the partner's parents, and every other existing person stay fixed.
- Search away from the same-row partner from `CELL_WIDTH / 2`, in 10px increments, up to `CELL_WIDTH`; use the first safe position.
- If the collision is not caused by the partner's existing parents, or no bounded safe position exists, retain the current rigid parent-pair fallback and do not move the child.
- Parent spacing remains exactly `GenogramApp.GRID.CELL_WIDTH` (currently 120px).
- Preview does not mutate data; cancel writes no history; commit and the child move form one Undo entry.
- `parent-pair` pointer move, click, and Alt remain confirmation-only and cannot reposition the computed candidate.
- Parent-child direction remains `from=parent`, `to=child`; never infer kinship from coordinates.
- Person lookup uses `personMap`; do not add `this.persons.find(...)`.
- Do not change JSON schema, clinical symbols, relationship colors, dash patterns, hit-test semantics, or export semantics.
- Root `/`, `geno/`, and `refactor/app/` JavaScript copies must have byte-identical MD5 hashes.
- Work remains on `codex/view-controls-release-hardening`; do not merge or push without user confirmation.

---

### Task 1: Lock the close-partner failure and fallback behavior

**Files:**
- Modify: `refactor/verify_placement.js:393-570`
- Test: `refactor/verify_placement.js --quick-add`

**Interfaces:**
- Consumes: `app.handleQuickAddClick(person, 'parent')`, `app.placementSession.request.existingPersonAdjustment`, `app.placementSession.ghostPeople`, `app.commitPlacement()`, `app.undo()`.
- Produces: a browser-backed fixture proving a 70px outward move for the current 50px symbol/10px safety-margin geometry, no mutation during preview/cancel, centered formal routes, and unchanged fallback behavior.

- [ ] **Step 1: Add the failing close-partner fixture after `parentOccupied`**

Insert this block inside the existing `quickE2E` `page.evaluate()` callback:

```js
base=reset();
const baseStartX=base.x;
const closePartner=new Person({id:'close-partner',gender:'female',x:base.x+g.CELL_WIDTH,y:base.y});
const closeFather=new Person({id:'close-father',gender:'male',x:closePartner.x-g.CELL_WIDTH/2,y:g.ORIGIN_Y});
const closeMother=new Person({id:'close-mother',gender:'female',x:closePartner.x+g.CELL_WIDTH/2,y:g.ORIGIN_Y});
app.persons.push(closePartner,closeFather,closeMother);
app.relationships.push(
    new Relationship({id:'close-couple',type:'married',fromPersonId:base.id,toPersonId:closePartner.id}),
    new Relationship({id:'close-parents',type:'married',fromPersonId:closeFather.id,toPersonId:closeMother.id}),
    new Relationship({id:'close-father-edge',type:'parent-child',fromPersonId:closeFather.id,toPersonId:closePartner.id}),
    new Relationship({id:'close-mother-edge',type:'parent-child',fromPersonId:closeMother.id,toPersonId:closePartner.id})
);
app._syncPersonMap();
const stableIds=['close-partner','close-father','close-mother'];
const stableBefore=Object.fromEntries(stableIds.map(id=>{const p=app.personMap.get(id);return [id,{x:p.x,y:p.y}];}));
const knownIds=new Set(app.persons.map(person=>person.id));

app.handleQuickAddClick(base,'parent');
const firstAdjustment=app.placementSession.request.existingPersonAdjustment||null;
const separationPreview={
    adjustment:firstAdjustment,
    expectedX:baseStartX-(g.CELL_WIDTH/2+10),
    baseUnchanged:app.personMap.get(base.id).x===baseStartX,
    ghostAtTarget:!!firstAdjustment&&app.placementSession.ghostPeople.some(person=>
        person.id===base.id&&person.x===firstAdjustment.to.x&&person.y===firstAdjustment.to.y),
    history:app.history.getUndoCount()
};
app.cancelPlacement();
const separationCancel={
    baseX:app.personMap.get(base.id).x,
    people:app.persons.length,
    rels:app.relationships.length,
    history:app.history.getUndoCount()
};

app.handleQuickAddClick(app.personMap.get(base.id),'parent');
app.commitPlacement();
const adjustedBase=app.personMap.get(base.id);
const newParents=app.persons.filter(person=>!knownIds.has(person.id));
const fixedUnchanged=stableIds.every(id=>{
    const person=app.personMap.get(id),before=stableBefore[id];
    return person.x===before.x&&person.y===before.y;
});
const familyRels=app.relationships.filter(rel=>rel.type==='parent-child');
const otherRels=app.relationships.filter(rel=>rel.type!=='parent-child');
const plans=app.canvas.getFamilyRoutePlans(familyRels,app.persons,otherRels,app.getKinshipEngine());
const basePlan=plans.find(plan=>plan.family.childIds.includes(base.id));
const partnerPlan=plans.find(plan=>plan.family.childIds.includes(closePartner.id));
const separationCommitted={
    baseX:adjustedBase.x,
    movedBy:baseStartX-adjustedBase.x,
    parents:newParents.length,
    parentSpacing:newParents.length===2?Math.abs(newParents[1].x-newParents[0].x):null,
    parentCenter:newParents.length===2?(newParents[0].x+newParents[1].x)/2:null,
    fixedUnchanged,
    history:app.history.getUndoCount(),
    sourcesCentered:!!basePlan&&!!partnerPlan&&basePlan.source.x===adjustedBase.x&&partnerPlan.source.x===closePartner.x
};
app.undo();
const separationUndo={
    baseX:app.personMap.get(base.id).x,
    people:app.persons.length,
    rels:app.relationships.length,
    history:app.history.getUndoCount(),
    fixedUnchanged:stableIds.every(id=>{
        const person=app.personMap.get(id),before=stableBefore[id];
        return person.x===before.x&&person.y===before.y;
    })
};
result.gentleParentSeparation={preview:separationPreview,cancel:separationCancel,
    committed:separationCommitted,undo:separationUndo};
```

- [ ] **Step 2: Add the bounded-fallback fixture**

Insert this immediately after the close-partner fixture:

```js
base=reset();
const fallbackPartner=new Person({id:'fallback-partner',x:base.x+g.CELL_WIDTH,y:base.y});
const fallbackFather=new Person({id:'fallback-father',x:fallbackPartner.x-g.CELL_WIDTH/2,y:g.ORIGIN_Y});
const fallbackMother=new Person({id:'fallback-mother',x:fallbackPartner.x+g.CELL_WIDTH/2,y:g.ORIGIN_Y});
const blockedDistances=[];
for(let distance=g.CELL_WIDTH/2;distance<g.CELL_WIDTH;distance+=10)blockedDistances.push(distance);
blockedDistances.push(g.CELL_WIDTH);
const shiftBlockers=blockedDistances.map((distance,index)=>
    new Person({id:`shift-blocker-${index}`,x:base.x-distance,y:base.y}));
app.persons.push(fallbackPartner,fallbackFather,fallbackMother,...shiftBlockers);
app.relationships.push(
    new Relationship({type:'married',fromPersonId:base.id,toPersonId:fallbackPartner.id}),
    new Relationship({type:'married',fromPersonId:fallbackFather.id,toPersonId:fallbackMother.id}),
    new Relationship({type:'parent-child',fromPersonId:fallbackFather.id,toPersonId:fallbackPartner.id}),
    new Relationship({type:'parent-child',fromPersonId:fallbackMother.id,toPersonId:fallbackPartner.id})
);
app._syncPersonMap();
const fallbackBaseX=base.x;
app.handleQuickAddClick(base,'parent');
const fallbackPair=app.placementSession.ghostPeople.slice(0,2);
result.gentleParentFallback={
    adjustment:app.placementSession.request.existingPersonAdjustment||null,
    childUnchanged:app.personMap.get(base.id).x===fallbackBaseX,
    pairShifted:(fallbackPair[0].x+fallbackPair[1].x)/2!==fallbackBaseX,
    pairSpacing:Math.abs(fallbackPair[1].x-fallbackPair[0].x)
};
app.cancelPlacement();
```

- [ ] **Step 3: Add exact assertions after the existing blocked-pair assertion**

```js
const gentle=quickE2E.gentleParentSeparation;
assert('close partner parents preview the smallest safe outward child adjustment without writes',
    gentle.preview.adjustment&&gentle.preview.adjustment.personId==='e2e-base'&&
    gentle.preview.adjustment.from.x===data.grid.ORIGIN_X&&
    gentle.preview.adjustment.to.x===gentle.preview.expectedX&&
    gentle.preview.baseUnchanged&&gentle.preview.ghostAtTarget&&gentle.preview.history===0,
    JSON.stringify(gentle.preview));
assert('canceling gentle parent separation leaves people relationships and history unchanged',
    gentle.cancel.baseX===data.grid.ORIGIN_X&&gentle.cancel.people===4&&gentle.cancel.rels===4&&gentle.cancel.history===0,
    JSON.stringify(gentle.cancel));
assert('gentle parent separation moves only the current child and centers both formal family sources',
    gentle.committed.baseX===gentle.preview.expectedX&&gentle.committed.movedBy===data.grid.CELL_WIDTH/2+10&&
    gentle.committed.parents===2&&gentle.committed.parentSpacing===data.grid.CELL_WIDTH&&
    gentle.committed.parentCenter===gentle.committed.baseX&&gentle.committed.fixedUnchanged&&
    gentle.committed.history===1&&gentle.committed.sourcesCentered,
    JSON.stringify(gentle.committed));
assert('one undo removes the new parents and restores the adjusted child',
    gentle.undo.baseX===data.grid.ORIGIN_X&&gentle.undo.people===4&&gentle.undo.rels===4&&
    gentle.undo.history===0&&gentle.undo.fixedUnchanged,
    JSON.stringify(gentle.undo));
assert('unsafe bounded child shifts retain the rigid parent-pair fallback',
    quickE2E.gentleParentFallback.adjustment===null&&quickE2E.gentleParentFallback.childUnchanged&&
    quickE2E.gentleParentFallback.pairShifted&&
    quickE2E.gentleParentFallback.pairSpacing===data.grid.CELL_WIDTH,
    JSON.stringify(quickE2E.gentleParentFallback));
```

- [ ] **Step 4: Run the focused regression and verify RED**

```powershell
$env:NODE_PATH = 'C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\goh2407\.agents\skills\playwright-skill\node_modules'
node refactor/verify_placement.js --quick-add
```

Expected: the new preview/commit assertions fail because `existingPersonAdjustment` is absent and the child stays at its original X; all previously existing assertions remain green.

- [ ] **Step 5: Commit the failing regression**

```powershell
git add refactor/verify_placement.js
git commit -m "test: reproduce close parent-family overlap"
```

---

### Task 2: Calculate, preview, and commit the smallest safe child adjustment

**Files:**
- Modify: `js/app.js:1970-2065`
- Modify: `js/app.js:4539-4558`
- Modify: `js/app.js:4598-4634`
- Test: `refactor/verify_placement.js --quick-add`

**Interfaces:**
- Consumes: `findQuickParentPairChildAdjustment(child, parentY, gap)`, `isQuickParentPairSafe(centerX, parentY, gap, child, obstaclePersons)`.
- Produces: `findQuickParentPairPlacement(child)` with optional `existingPersonAdjustment: { personId, from: {x,y}, to: {x,y} }`; a placement session whose `ghostPeople` includes the adjusted existing child; an atomic commit/Undo transaction.

- [ ] **Step 1: Let the safety check evaluate a virtual child position**

Change the signature and obstacle source in `isQuickParentPairSafe`:

```js
isQuickParentPairSafe(centerX, parentY, gap, child, obstaclePersons = this.persons) {
    if (!Number.isFinite(centerX) || !Number.isFinite(parentY) || !Number.isFinite(gap) || !child) return false;
    const personSize = this.canvas?.personSize || 50;
    const half = personSize / 2;
    const safety = 10;
    const candidateHalf = half + safety;
    const parentXs = [centerX - gap / 2, centerX + gap / 2];
    const routePersons = Array.isArray(obstaclePersons) ? obstaclePersons : this.persons;
    const obstacles = typeof this.canvas?.getPersonRouteObstacles === 'function'
        ? this.canvas.getPersonRouteObstacles(routePersons)
        : [];
```

Keep the existing overlap and `FamilyRoutePlanner.planFamily` body unchanged.

- [ ] **Step 2: Add the targeted adjustment helper before `findQuickParentPairPlacement`**

```js
findQuickParentPairChildAdjustment(child, parentY, gap) {
    const grid = GenogramApp.GRID;
    const spouses = this.getSpouses(child.id).filter(spouse =>
        Math.abs(spouse.y - child.y) < grid.CELL_HEIGHT * 0.5);
    const spouse = this.pickSpouseForChildCreation(child, spouses);
    if (!spouse || spouse.x === child.x) return null;

    const spouseParentIds = new Set(this.getKinshipEngine().getParentIds(spouse.id));
    if (spouseParentIds.size < 2) return null;

    const personSize = this.canvas?.personSize || 50;
    const candidateHalf = personSize / 2 + 10;
    const obstacles = typeof this.canvas?.getPersonRouteObstacles === 'function'
        ? this.canvas.getPersonRouteObstacles(this.persons)
        : [];
    const overlaps = (a, b) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const rectAt = (x, y) => ({
        left: x - candidateHalf, right: x + candidateHalf,
        top: y - candidateHalf, bottom: y + candidateHalf
    });
    const centeredParentXs = [child.x - gap / 2, child.x + gap / 2];
    const blockedBySpouseParent = centeredParentXs.some(x =>
        obstacles.some(obstacle => spouseParentIds.has(obstacle.ownerId) &&
            overlaps(rectAt(x, parentY), obstacle)));
    if (!blockedBySpouseParent) return null;

    const direction = child.x < spouse.x ? -1 : 1;
    const distances = [];
    for (let distance = grid.CELL_WIDTH / 2; distance < grid.CELL_WIDTH; distance += 10) {
        distances.push(distance);
    }
    distances.push(grid.CELL_WIDTH);

    for (const distance of distances) {
        const targetX = child.x + direction * distance;
        const childRect = rectAt(targetX, child.y);
        const destinationFree = obstacles.every(obstacle =>
            obstacle.ownerId === child.id || !overlaps(childRect, obstacle));
        if (!destinationFree) continue;

        const virtualChild = { ...child, x: targetX, y: child.y };
        const obstaclePersons = this.persons.map(person =>
            person.id === child.id ? virtualChild : person);
        if (!this.isQuickParentPairSafe(targetX, parentY, gap, virtualChild, obstaclePersons)) continue;

        return {
            personId: child.id,
            from: { x: child.x, y: child.y },
            to: { x: targetX, y: child.y }
        };
    }
    return null;
}
```

- [ ] **Step 3: Prefer the bounded child adjustment before the existing rigid fallback**

Replace `findQuickParentPairPlacement` with:

```js
findQuickParentPairPlacement(child) {
    const grid = GenogramApp.GRID;
    const parentY = this.getGenerationYByIndex(this.getGenerationIndexByY(child.y) - 1);
    const standardGap = grid.CELL_WIDTH;
    if (this.isQuickParentPairSafe(child.x, parentY, standardGap, child)) {
        return { centerX: child.x, parentY, gap: standardGap };
    }

    const existingPersonAdjustment = this.findQuickParentPairChildAdjustment(
        child, parentY, standardGap);
    if (existingPersonAdjustment) {
        return {
            centerX: existingPersonAdjustment.to.x,
            parentY,
            gap: standardGap,
            existingPersonAdjustment
        };
    }

    const offsets = [];
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

- [ ] **Step 4: Carry the adjustment into the fixed parent-pair request**

In `beginQuickParentPlacement`, construct the request first and conditionally attach the adjustment:

```js
const request = { kind: 'parent-pair', basePersonId: child.id,
    people: [
        { personId: fatherId, gender: 'male', generation: this.getGenerationAbove(child.generation), x: centerX - halfGap, y: parentY },
        { personId: motherId, gender: 'female', generation: this.getGenerationAbove(child.generation), x: centerX + halfGap, y: parentY }
    ],
    relationshipPreview: [
        { type: 'married', fromPersonId: fatherId, toPersonId: motherId },
        { type: 'parent-child', fromPersonId: fatherId, toPersonId: child.id },
        { type: 'parent-child', fromPersonId: motherId, toPersonId: child.id }
    ]
};
if (placement.existingPersonAdjustment) {
    request.existingPersonAdjustment = placement.existingPersonAdjustment;
}
const session = this.beginPlacement(request);
if (placement.existingPersonAdjustment) {
    this.updateStatus('父母位置受阻，確認後會將此人物向外微調', 'info');
}
this.render();
return session;
```

- [ ] **Step 5: Append the adjusted existing child to preview ghosts without mutating data**

After `beginPlacement` creates `ghostPeople`, add:

```js
const adjustment = request.existingPersonAdjustment;
if (adjustment && this.placementSession.ghostPeople) {
    const existingPerson = this.personMap.get(adjustment.personId);
    if (existingPerson) {
        this.placementSession.ghostPeople.push({
            ...existingPerson,
            x: adjustment.to.x,
            y: adjustment.to.y
        });
    }
}
```

Canvas requires no change: `drawPlacementPreview()` builds `ghostMap` from all ghosts, so the entry with the real child ID becomes the endpoint for both neutral parent-child preview lines.

- [ ] **Step 6: Apply the existing-person adjustment inside the parent-pair transaction**

At the start of the `if (session.request.people)` branch in `commitPlacement`, replace the existing standalone `this.saveState();` with:

```js
const adjustment = session.request.existingPersonAdjustment;
this.saveState();
if (adjustment) {
    const adjustedPerson = this.personMap.get(adjustment.personId);
    adjustedPerson.x = adjustment.to.x;
    adjustedPerson.y = adjustment.to.y;
}
```

The existing endpoint validation has already proved that the adjusted child ID exists before this branch runs. Keep new-parent creation, `personMap.set`, parent-child direction, selection clearing, autosave, and rendering unchanged so there is still exactly one history write.

- [ ] **Step 7: Run the focused test and verify GREEN**

```powershell
$env:NODE_PATH = 'C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\goh2407\.agents\skills\playwright-skill\node_modules'
node refactor/verify_placement.js --quick-add
node refactor/verify_placement.js --overlay
```

Expected: all placement checks pass; the close-partner fixture moves only `e2e-base` by 70px, cancel is write-free, Undo is atomic, and the bounded unsafe fixture uses the old rigid fallback.

- [ ] **Step 8: Commit the implementation**

```powershell
git add js/app.js refactor/verify_placement.js
git commit -m "fix: gently separate close parent families"
```

---

### Task 3: Synchronize mirrors and run the release gates

**Files:**
- Modify: `refactor/TEST_GATES.md:36-45`
- Update ignored local mirror: `geno/js/app.js`
- Update ignored local mirror: `refactor/app/js/app.js`
- Test: all `refactor/verify_*.js`, `refactor/smoke_visual.js`, `refactor/visual_golden.js`

**Interfaces:**
- Consumes: the completed `js/app.js` behavior and regression fixture.
- Produces: byte-identical app mirrors, updated gate wording, visual evidence for the reported scenario, and a clean fully verified branch.

- [ ] **Step 1: Update the placement gate wording**

Replace the placement bullet in `refactor/TEST_GATES.md` with:

```markdown
- `node refactor/verify_placement.js`：快速父母固定使用 120px 系統格距；近距離伴侶的既有父母擋住第二組置中位置時，只將目前子女向外移動最小安全距離（最多 120px），預覽不寫資料、取消零變更、提交與移動共用一次 Undo；其他受阻情境維持父母剛性平移。
```

- [ ] **Step 2: Synchronize the two ignored app mirrors**

```powershell
Copy-Item -LiteralPath 'js\app.js' -Destination 'geno\js\app.js' -Force
Copy-Item -LiteralPath 'js\app.js' -Destination 'refactor\app\js\app.js' -Force
node refactor/verify_mirror_sync.js
```

Expected: raw MD5 checks pass for every JS/CSS triplet; root/refactor index checks and `geno` local dependency checks remain green.

- [ ] **Step 3: Run every automated regression, smoke test, and Golden comparison**

```powershell
$env:NODE_PATH = 'C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\goh2407\.agents\skills\playwright-skill\node_modules'
$scripts = Get-ChildItem -LiteralPath 'refactor' -File -Filter 'verify_*.js' | Sort-Object Name
foreach ($script in $scripts) {
    node $script.FullName
    if ($LASTEXITCODE -ne 0) { throw "Regression failed: $($script.Name)" }
}
node refactor/smoke_visual.js
if ($LASTEXITCODE -ne 0) { throw 'Regression failed: smoke_visual.js' }
node refactor/visual_golden.js
if ($LASTEXITCODE -ne 0) { throw 'Regression failed: visual_golden.js' }
```

Expected: 21/21 verification scripts exit 0, smoke reports `SMOKE OK` with no console/page error, and all 16 Golden fixtures report `diffPixels=0` without updating baselines.

- [ ] **Step 4: Capture and inspect the exact reported scenario outside the repository**

Create `%TEMP%\verify-gentle-parent-separation.js` with this content:

```js
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
    const root = process.argv[2];
    if (!root) throw new Error('worktree path argument is required');
    const previewPath = path.join(process.env.TEMP, 'gentle-parent-preview.png');
    const commitPath = path.join(process.env.TEMP, 'gentle-parent-commit.png');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 780 } });
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.waitForFunction(() => window.app && window.app.canvas && !window.app.isLoading);
    await page.evaluate(async () => {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const app = window.app;
        const g = GenogramApp.GRID;
        const base = new Person({ id: 'visual-base', gender: 'male', x: g.ORIGIN_X, y: g.ORIGIN_Y + g.CELL_HEIGHT });
        const partner = new Person({ id: 'visual-partner', gender: 'female', x: base.x + g.CELL_WIDTH, y: base.y });
        const father = new Person({ id: 'visual-father', gender: 'male', x: partner.x - g.CELL_WIDTH / 2, y: g.ORIGIN_Y });
        const mother = new Person({ id: 'visual-mother', gender: 'female', x: partner.x + g.CELL_WIDTH / 2, y: g.ORIGIN_Y });
        app.persons = [base, partner, father, mother];
        app.relationships = [
            new Relationship({ type: 'married', fromPersonId: base.id, toPersonId: partner.id }),
            new Relationship({ type: 'married', fromPersonId: father.id, toPersonId: mother.id }),
            new Relationship({ type: 'parent-child', fromPersonId: father.id, toPersonId: partner.id }),
            new Relationship({ type: 'parent-child', fromPersonId: mother.id, toPersonId: partner.id })
        ];
        app._syncPersonMap();
        app.history.clear();
        app.selectedPersonId = base.id;
        app.selectedPersonIds = [];
        app.selectedRelationshipId = null;
        window.__gentleFixture = {
            baseStartX: base.x,
            knownIds: app.persons.map(person => person.id),
            fixed: [partner, father, mother].map(person => ({ id: person.id, x: person.x, y: person.y }))
        };
        app.handleQuickAddClick(base, 'parent');
        app.render();
    });
    await page.locator('#genogramCanvas').screenshot({ path: previewPath });
    const metrics = await page.evaluate(() => {
        const app = window.app;
        const fixture = window.__gentleFixture;
        app.commitPlacement();
        const child = app.personMap.get('visual-base');
        const known = new Set(fixture.knownIds);
        const newParents = app.persons.filter(person => !known.has(person.id));
        return {
            childMove: fixture.baseStartX - child.x,
            newParentSpacing: Math.abs(newParents[1].x - newParents[0].x),
            newParentCenterEqualsChild: (newParents[0].x + newParents[1].x) / 2 === child.x,
            partnerFamilyUnchanged: fixture.fixed.every(before => {
                const person = app.personMap.get(before.id);
                return person.x === before.x && person.y === before.y;
            })
        };
    });
    await page.locator('#genogramCanvas').screenshot({ path: commitPath });
    await browser.close();
    console.log(`childMove=${metrics.childMove}`);
    console.log(`newParentSpacing=${metrics.newParentSpacing}`);
    console.log(`newParentCenterEqualsChild=${metrics.newParentCenterEqualsChild}`);
    console.log(`partnerFamilyUnchanged=${metrics.partnerFamilyUnchanged}`);
    console.log(`pageErrors=${pageErrors.length}`);
    console.log(`consoleErrors=${consoleErrors.length}`);
    if (metrics.childMove !== 70 || metrics.newParentSpacing !== 120 ||
        !metrics.newParentCenterEqualsChild || !metrics.partnerFamilyUnchanged ||
        pageErrors.length || consoleErrors.length) process.exitCode = 1;
})().catch(error => {
    console.error(error);
    process.exit(1);
});
```

Run it with:

```powershell
$env:NODE_PATH = 'C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\goh2407\.agents\skills\playwright-skill\node_modules'
node "$env:TEMP\verify-gentle-parent-separation.js" (Get-Location).Path
```

It must print:

```text
childMove=70
newParentSpacing=120
newParentCenterEqualsChild=true
partnerFamilyUnchanged=true
pageErrors=0
consoleErrors=0
```

Open both PNGs with the local image viewer. Expected committed image: the left child is only slightly farther from the partner, both parent pairs remain fixed-width, both parent-child trunks leave the center of their own marriage line, and the large side-origin L shape from the user's screenshot is absent.

- [ ] **Step 5: Check scope and commit the gate documentation**

```powershell
git diff --check
git status --short --branch
git add refactor/TEST_GATES.md
git commit -m "docs: record gentle parent separation gate"
```

Expected: no whitespace errors; only the intended gate wording is committed; temporary scripts and screenshots remain outside the repository.

- [ ] **Step 6: Verify the final committed tree once more**

```powershell
node refactor/verify_placement.js --quick-add
node refactor/verify_mirror_sync.js
git diff --check
git status --short --branch
```

Expected: focused placement and mirror checks pass, `git diff --check` prints nothing, and the branch is clean.
