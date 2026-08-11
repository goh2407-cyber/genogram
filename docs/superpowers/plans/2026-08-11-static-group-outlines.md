# Stable Group Outlines and Text Hit Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep household/life-circle geometry stable while labels move, and let users click visible name/note text to adjust it without showing the quick-add ring.

**Architecture:** Household geometry will derive only from person symbols and relationship samples. App-level hit testing will distinguish visible label bounds from person symbols, store a transient `labelEditingPersonId`, and pass a render-only suppression flag to Canvas; no persisted data model changes are required.

**Tech Stack:** Vanilla JavaScript, Canvas 2D, Playwright browser contracts, PowerShell on Windows.

## Global Constraints

- Root `/`, `geno/`, and `refactor/app/` JavaScript mirrors must remain raw-MD5 identical.
- `geno/index.html` must retain local font, jsPDF, and dagre dependencies and make zero external requests.
- Text nudges only change `Person.labelPlacement`; person coordinates, relationships, households, and life-circle points remain unchanged.
- Clicking a visible name/note enters label editing; clicking a person symbol retains the quick-add ring.
- Hidden names/notes create no label hit target.
- Do not modify `refactor/visual_golden.js` or visual baselines.

---

### Task 1: Make household geometry independent of labels

**Files:**
- Modify: `refactor/verify_hh_lc.js`
- Modify: `js/canvas.js:5107-5197`

**Interfaces:**
- Consumes: `GenogramCanvas.getHouseholdBounds(household, persons, relationships)` and `GenogramApp.adjustSelectedPersonLabel(direction)`.
- Produces: household `{ points, hullPoints, minX, minY, maxX, maxY, width, height }` that is invariant under `Person.labelPlacement` changes.

- [ ] **Step 1: Write the failing household/life-circle independence contract**

Append an H7 browser fixture to `refactor/verify_hh_lc.js` that records geometry, runs the real nudge command, and compares stable state:

```js
    r = await page.evaluate(() => {
        const app = window.app;
        const memberA = window._P.p1;
        const memberB = window._P.p2;
        memberA.labelPlacement = null;
        app.households = [{ id: 'label-stable-household',
            ids: [memberA.id, memberB.id], notes: '' }];
        app.lifeCircles = [{ id: 'label-stable-circle', color: '#90caf9',
            label: '固定生活圈', points: [
                { x: 240, y: 220 }, { x: 520, y: 220 },
                { x: 520, y: 420 }, { x: 240, y: 420 }
            ] }];
        app._syncPersonMap();
        app.selectPerson(memberA.id);
        const before = {
            household: app.canvas.getHouseholdBounds(
                app.households[0], app.persons, app.relationships),
            lifeCircle: JSON.stringify(app.lifeCircles[0].points),
            person: { x: memberA.x, y: memberA.y },
            label: app.canvas.getPersonLabelGeometry(memberA).bounds
        };
        app.adjustSelectedPersonLabel('right');
        const after = {
            household: app.canvas.getHouseholdBounds(
                app.households[0], app.persons, app.relationships),
            lifeCircle: JSON.stringify(app.lifeCircles[0].points),
            person: { x: memberA.x, y: memberA.y },
            label: app.canvas.getPersonLabelGeometry(memberA).bounds,
            exportOk: app.canvas.exportToPNG(app.persons, app.relationships,
                app.households, app.lifeCircles, true, false, 1, app.viewOptions)
                .startsWith('data:image/png;base64,')
        };
        return { before, after };
    });
    check('H7 文字微調不改變同住框、生活圈或人物座標',
        JSON.stringify(r.before.household) === JSON.stringify(r.after.household)
            && r.before.lifeCircle === r.after.lifeCircle
            && JSON.stringify(r.before.person) === JSON.stringify(r.after.person)
            && r.after.label.left === r.before.label.left + 12
            && r.after.exportOk,
        JSON.stringify(r));
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor\verify_hh_lc.js
```

Expected: the new H7 assertion fails because `getHouseholdBounds()` includes `getPersonLabelGeometry()` bounds.

- [ ] **Step 3: Remove label bounds from household hull inputs**

In `js/canvas.js`, keep the existing 16 symbol perimeter points and relationship samples, but delete the label expansion block from `getHouseholdBounds()`:

```js
        members.forEach(m => {
            if (!m || typeof m.x !== 'number' || typeof m.y !== 'number') return;
            const r = personRadius + padding;
            for (let i = 0; i < 16; i++) {
                const angle = (i * Math.PI * 2) / 16;
                const px = m.x + Math.cos(angle) * r;
                const py = m.y + Math.sin(angle) * r;
                if (!isNaN(px) && !isNaN(py)) points.push({ x: px, y: py });
            }
        });
```

Do not change household padding, concave-hull logic, relationship samples, hit testing, or life-circle drawing.

- [ ] **Step 4: Run focused GREEN gates**

Run:

```powershell
node refactor\verify_hh_lc.js
node refactor\verify_manual_label_controls.js
node refactor\verify_view_export.js
```

Expected: H7 and all existing checks pass with zero page/console errors.

- [ ] **Step 5: Commit Task 1**

```powershell
git add js/canvas.js refactor/verify_hh_lc.js
git commit -m "fix: keep household outlines independent of labels"
```

---

### Task 2: Add label-only click context and suppress the quick-add ring

**Files:**
- Modify: `refactor/verify_manual_label_controls.js`
- Modify: `js/app.js:190-260, 1018-1215, 2018-2027, 2898-2930, 3158-3190, 4370-4405`
- Modify: `js/canvas.js:277-405`

**Interfaces:**
- Consumes: `GenogramCanvas.getPersonLabelGeometry(person, viewOptions)` and existing person selection/property controls.
- Produces: `GenogramApp.getPersonLabelAt(x, y): Person|null`, transient `GenogramApp.labelEditingPersonId: string|null`, and render-only `GenogramCanvas.suppressQuickAddButtons: boolean`.

- [ ] **Step 1: Write the failing real-pointer label hit contract**

Extend `refactor/verify_manual_label_controls.js` with a fixture that clears selection, instruments quick-button drawing, and clicks the current label bounds using actual mouse coordinates:

```js
    const hitFixture = await page.evaluate(() => {
        const app = window.app;
        const person = app.personMap.get('label-target');
        person.labelPlacement = null;
        app.selectedPersonId = null;
        app.labelEditingPersonId = null;
        app.viewOptions = { ...app.viewOptions, showNames: true, showNotes: true };
        const original = app.canvas.drawQuickAddButtons;
        window.__quickDraws = 0;
        app.canvas.drawQuickAddButtons = function(candidate) {
            window.__quickDraws++;
            return original.call(this, candidate);
        };
        app.render();
        const bounds = app.canvas.getPersonLabelGeometry(person, app.viewOptions).bounds;
        const rect = app.canvas.canvas.getBoundingClientRect();
        const world = { x: (bounds.left + bounds.right) / 2,
            y: (bounds.top + bounds.bottom) / 2 };
        return {
            labelScreen: {
                x: rect.left + app.canvas.offsetX + world.x * app.canvas.scale,
                y: rect.top + app.canvas.offsetY + world.y * app.canvas.scale
            },
            symbolScreen: {
                x: rect.left + app.canvas.offsetX + person.x * app.canvas.scale,
                y: rect.top + app.canvas.offsetY + person.y * app.canvas.scale
            },
            oldLabelWorld: world
        };
    });
    await page.mouse.click(hitFixture.labelScreen.x, hitFixture.labelScreen.y);
    const afterLabelClick = await page.evaluate(() => ({
        selected: window.app.selectedPersonId,
        editing: window.app.labelEditingPersonId,
        quickDraws: window.__quickDraws,
        controls: document.querySelectorAll('[data-label-nudge]').length
    }));
    check('clicking visible label text opens label controls without quick-add ring',
        afterLabelClick.selected === 'label-target'
            && afterLabelClick.editing === 'label-target'
            && afterLabelClick.quickDraws === 0
            && afterLabelClick.controls === 8,
        JSON.stringify(afterLabelClick));
```

Add checks that a nudge preserves `labelEditingPersonId` with zero quick draws, a symbol click clears it and draws the ring, hidden names/notes make `getPersonLabelAt()` return `null`, and a blank click clears the context.

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
node refactor\verify_manual_label_controls.js
```

Expected: fail because `getPersonAt()` only detects symbols and no label-editing context exists.

- [ ] **Step 3: Add visible-label hit testing and transient selection context**

Initialize the transient state in `GenogramApp`:

```js
        this.labelEditingPersonId = null;
```

Add an App helper beside `getPersonAt()`:

```js
    getPersonLabelAt(x, y) {
        const view = this.canvas.normalizeViewOptions(this.viewOptions);
        for (let i = this.persons.length - 1; i >= 0; i--) {
            const person = this.persons[i];
            const bounds = this.canvas.getPersonLabelGeometry(person, view).bounds;
            if (bounds && x >= bounds.left && x <= bounds.right
                && y >= bounds.top && y <= bounds.bottom) return person;
        }
        return null;
    }
```

In select-tool pointerdown, check `getPersonLabelAt()` before ordinary symbol handling. A label click calls:

```js
        this.selectedPersonIds = [];
        this.selectPerson(clickedLabelPerson.id, { labelEditing: true });
        this.updateStatus('已選取人物文字，可在屬性面板調整位置', 'info');
        return;
```

Change `selectPerson` to accept the transient mode and ensure other selection paths clear it:

```js
    selectPerson(id, { labelEditing = false } = {}) {
        this.commitPropertyEditSession();
        this.selectedRelationshipId = null;
        this.selectedHouseholdId = null;
        this.selectedLifeCircleId = null;
        this.selectedPersonId = id;
        this.labelEditingPersonId = labelEditing ? id : null;
        this.updatePropertyPanel();
        this.render();
    }
```

Also set `labelEditingPersonId = null` when selecting a relationship/household/life circle, clicking blank canvas, changing tools, loading/clearing data, or when the referenced person no longer exists. Do not add it to saved JSON or history state.

- [ ] **Step 4: Suppress invisible quick-button hits and rendering**

Before Canvas render in `GenogramApp.render()`:

```js
        this.canvas.suppressQuickAddButtons =
            this.labelEditingPersonId === this.selectedPersonId;
```

Gate both quick-button pointer detection in App and drawing in Canvas:

```js
        if (this.selectedPersonId && this.currentTool === 'select'
            && this.labelEditingPersonId !== this.selectedPersonId) {
            // existing getQuickButtonAt logic
        }
```

```js
        if (selectedId && !this.isDragging && !this.placementPreview
            && !this.suppressQuickAddButtons) {
            // existing drawQuickAddButtons logic
        }
```

- [ ] **Step 5: Run focused GREEN gates**

Run:

```powershell
node refactor\verify_manual_label_controls.js
node refactor\verify_ui_shell.js
node refactor\verify_modal_keyboard_history.js
node refactor\verify_dom_security.js
```

Expected: real label/symbol/blank clicks and all existing controls pass with zero page/console errors.

- [ ] **Step 6: Commit Task 2**

```powershell
git add js/app.js js/canvas.js refactor/verify_manual_label_controls.js
git commit -m "feat: select label text without showing quick actions"
```

---

### Task 3: Sync mirrors, verify deployment, and publish

**Files:**
- Modify mechanically: `geno/js/app.js`, `geno/js/canvas.js`
- Modify mechanically: `refactor/app/js/app.js`, `refactor/app/js/canvas.js`
- Modify: `refactor/TEST_GATES.md`

**Interfaces:**
- Consumes: Task 1 household geometry and Task 2 label-editing context.
- Produces: identical root/geno/refactor mirrors and a deployed offline `geno` copy.

- [ ] **Step 1: Document the permanent gates**

Add these commands and requirements to `refactor/TEST_GATES.md`:

```powershell
node refactor\verify_hh_lc.js
node refactor\verify_manual_label_controls.js
```

State that label nudges must not alter household hulls or life-circle points, and label clicks suppress quick actions while symbol clicks retain them.

- [ ] **Step 2: Sync tracked source into both mirrors**

```powershell
Copy-Item js\app.js geno\js\app.js -Force
Copy-Item js\app.js refactor\app\js\app.js -Force
Copy-Item js\canvas.js geno\js\canvas.js -Force
Copy-Item js\canvas.js refactor\app\js\canvas.js -Force
```

- [ ] **Step 3: Run syntax, focused, full, mirror, and deployment gates**

```powershell
node --check js\app.js
node --check js\canvas.js
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor\verify_hh_lc.js
node refactor\verify_manual_label_controls.js
node refactor\verify_view_export.js
node refactor\verify_ui_shell.js
node refactor\verify_mirror_sync.js
node refactor\verify_geno_deploy.js
git diff --check
```

Then run every `refactor/verify_*.js` except `verify_geno_deploy.js`; expected: all exit 0. Do not run or update visual golden baselines.

- [ ] **Step 4: Commit and push feature branch**

```powershell
git add -- refactor/TEST_GATES.md js/app.js js/canvas.js refactor/verify_hh_lc.js refactor/verify_manual_label_controls.js
git commit -m "feat: keep group outlines stable while editing labels"
git push origin codex/genogram-hardening
```

- [ ] **Step 5: Update the actual main-project geno deployment**

Copy the worktree `geno/js/app.js` and `geno/js/canvas.js` into the main project
`geno/js/`, compare SHA-256 hashes, and run `node refactor/verify_geno_deploy.js` from the main project root. Expected: app ready, local font/jsPDF/dagre, zero console/page errors, and zero external requests.
