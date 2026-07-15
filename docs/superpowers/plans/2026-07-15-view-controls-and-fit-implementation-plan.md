# View Controls and Fit-to-View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder View tab with seven non-destructive display controls and add reliable manual/automatic fit-to-view behavior shared by screen rendering and exports.

**Architecture:** `GenogramApp` owns session-only `viewOptions`; `GenogramCanvas` normalizes and consumes the policy without mutating domain data. `Relationship.isEmotionalDisplayType()` distinguishes ordinary emotional lines from abuse/violence lines, because the existing broad `emotional` category intentionally contains both. Export methods receive the same policy as screen rendering, while JSON export remains unfiltered.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Canvas 2D, Playwright Node scripts, existing `Person`, `Relationship`, `KinshipEngine`, and `GenogramCanvas` classes.

## Global Constraints

- All `Person` lookup code must use `this.personMap.get(id)`; do not add `this.persons.find(...)`.
- All kinship queries stay in `KinshipEngine`; no coordinate-based kinship inference.
- Do not change gender shapes, identified-patient fill, death X, reproductive-loss symbols, relationship colors, or clinical line semantics.
- `viewOptions` is session-only: never serialize it to JSON, LocalStorage view state, history, undo, or redo.
- Defaults are all `true`; default rendering must remain pixel-identical except for already-approved family-route Golden differences.
- Preserve existing public argument order; add `viewOptions` only as the final optional export argument.
- No new runtime dependency.
- Use TDD: observe each new test fail before production edits, then rerun it to green.

---

### Task 1: Add the centralized view policy and accessible View-tab controls

**Files:**
- Create: `refactor/verify_view_controls.js`
- Modify: `index.html:316`
- Modify: `css/styles.css:587`
- Modify: `js/relationship.js:56`
- Modify: `js/app.js:56-215,245-350`

**Interfaces:**
- Produces: `Relationship.isEmotionalDisplayType(type): boolean`.
- Produces: `GenogramApp.viewOptions` with seven boolean fields.
- Produces: `GenogramApp.setViewOption(key, value, { render = true } = {}): boolean`.
- Produces: checkbox elements with `data-view-option` values matching the seven fields.

- [ ] **Step 1: Write the failing UI/state contract**

Create `refactor/verify_view_controls.js` with this complete harness and first contract:

```js
const { chromium } = require('playwright');
const path = require('path');

const failures = [];
const passes = [];
function check(name, condition, detail = '') {
    (condition ? passes : failures).push(condition ? name : name + (detail ? ' — ' + detail : ''));
}

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);
    await page.click('#viewTab');

    const result = await page.evaluate(() => {
        const expected = [
            'showNames', 'showAges', 'showNotes', 'showMedical',
            'showEmotionalRelationships', 'showHouseholds', 'showLifeCircles'
        ];
        const controls = [...document.querySelectorAll('[data-view-option]')];
        return {
            keys: controls.map(control => control.dataset.viewOption),
            checked: controls.map(control => control.checked),
            state: { ...window.app.viewOptions },
            emotionalConflict: Relationship.isEmotionalDisplayType('conflict'),
            emotionalAbuse: Relationship.isEmotionalDisplayType('emotional-abuse'),
            expected
        };
    });
    check('seven View controls exist in the approved order',
        JSON.stringify(result.keys) === JSON.stringify(result.expected), JSON.stringify(result.keys));
    check('all View controls default on', result.checked.every(Boolean), JSON.stringify(result.checked));
    check('App state defaults match the controls',
        result.expected.every(key => result.state[key] === true), JSON.stringify(result.state));
    check('ordinary emotional lines are hideable', result.emotionalConflict === true);
    check('abuse lines are not classified as hideable emotional lines', result.emotionalAbuse === false);

    const names = page.locator('[data-view-option="showNames"]');
    await names.focus();
    await names.press('Space');
    check('keyboard toggling updates App state',
        await page.evaluate(() => window.app.viewOptions.showNames === false));
    check('view state is not added to persisted data',
        await page.evaluate(() => !Object.prototype.hasOwnProperty.call(window.app.getState(), 'viewOptions')));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));

    await browser.close();
    console.log('PASS:');
    passes.forEach(name => console.log('  OK ' + name));
    if (failures.length) {
        console.log('FAIL:');
        failures.forEach(name => console.log('  X ' + name));
        process.exit(1);
    }
    console.log('ALL VIEW CONTROL STATE CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
```

- [ ] **Step 2: Run the contract and confirm RED**

Run:

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_view_controls.js
```

Expected: exit 1 because `[data-view-option]`, `app.viewOptions`, and `Relationship.isEmotionalDisplayType` do not exist.

- [ ] **Step 3: Add the exact relationship display classifier**

Add after `Relationship.TYPES` in `js/relationship.js`:

```js
static ABUSE_DISPLAY_TYPES = new Set([
    'violence', 'abuse', 'physical-abuse', 'emotional-abuse',
    'sexual-abuse', 'neglect', 'manipulative', 'controlling'
]);

static isEmotionalDisplayType(type) {
    return Relationship.getCategory(type) === 'emotional'
        && !Relationship.ABUSE_DISPLAY_TYPES.has(type);
}
```

Do not change `getCategory()`: abuse relationships must remain directional and continue using the existing emotional-category uniqueness rules.

- [ ] **Step 4: Replace the View placeholder with seven controls**

Replace `index.html:316-319` with:

```html
<section class="panel-section inspector-tab-panel" id="viewContent" data-inspector-panel="view"
    role="tabpanel" aria-labelledby="viewTab" hidden>
    <h3 class="panel-title">畫布檢視</h3>
    <div class="panel-content view-options" aria-label="畫布顯示項目">
        <p class="view-options-hint">暫時隱藏資訊，不會刪除個案資料。</p>
        <label class="view-option"><input type="checkbox" data-view-option="showNames" checked><span>姓名</span></label>
        <label class="view-option"><input type="checkbox" data-view-option="showAges" checked><span>年齡</span></label>
        <label class="view-option"><input type="checkbox" data-view-option="showNotes" checked><span>備註與關係說明</span></label>
        <label class="view-option"><input type="checkbox" data-view-option="showMedical" checked><span>醫學標記</span></label>
        <label class="view-option"><input type="checkbox" data-view-option="showEmotionalRelationships" checked><span>情感關係線</span></label>
        <label class="view-option"><input type="checkbox" data-view-option="showHouseholds" checked><span>同住框</span></label>
        <label class="view-option"><input type="checkbox" data-view-option="showLifeCircles" checked><span>生活圈</span></label>
    </div>
</section>
```

Add after `.empty-hint` in `css/styles.css`:

```css
.view-options {
    display: grid;
    gap: 4px;
}

.view-options-hint {
    margin: 0 0 8px;
    color: var(--ink-muted);
    font-size: 12px;
    line-height: 1.55;
}

.view-option {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 7px 9px;
    color: var(--ink-body);
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
}

.view-option:hover {
    background: var(--surface-subtle);
    border-color: var(--line-ui);
}

.view-option input {
    width: 17px;
    height: 17px;
    margin: 0;
    accent-color: var(--brand);
}
```

- [ ] **Step 5: Initialize and bind the session-only App state**

Add in the constructor before `init()`:

```js
this.viewOptions = {
    showNames: true,
    showAges: true,
    showNotes: true,
    showMedical: true,
    showEmotionalRelationships: true,
    showHouseholds: true,
    showLifeCircles: true
};
```

Add these methods next to `setInspectorTab()`:

```js
setViewOption(key, value, { render = true } = {}) {
    if (!Object.prototype.hasOwnProperty.call(this.viewOptions, key)) return false;
    const next = value === true;
    this.viewOptions[key] = next;
    const control = document.querySelector('[data-view-option="' + key + '"]');
    if (control) control.checked = next;
    if (!next) {
        if (key === 'showEmotionalRelationships' && this.selectedRelationshipId) {
            const selected = this.relationships.find(rel => rel.id === this.selectedRelationshipId);
            if (selected && Relationship.isEmotionalDisplayType(selected.type)) this.selectedRelationshipId = null;
        }
        if (key === 'showHouseholds') this.selectedHouseholdId = null;
        if (key === 'showLifeCircles') this.selectedLifeCircleId = null;
        this.updatePropertyPanel();
    }
    if (render) this.render();
    return true;
}

ensureViewOption(key, { render = true } = {}) {
    if (this.viewOptions[key] === true) return false;
    this.setViewOption(key, true, { render });
    return true;
}
```

In `setupEventListeners()` after the Inspector tab binding, add:

```js
document.querySelectorAll('[data-view-option]').forEach(control => {
    control.addEventListener('change', event => {
        this.setViewOption(event.currentTarget.dataset.viewOption, event.currentTarget.checked);
    });
});
```

- [ ] **Step 6: Run the state contract and confirm GREEN**

Run the Step 2 command.

Expected: `ALL VIEW CONTROL STATE CHECKS PASSED` and exit 0.

- [ ] **Step 7: Commit the independently working state/UI slice**

```powershell
git add refactor/verify_view_controls.js index.html css/styles.css js/relationship.js js/app.js
git commit -m "feat: add centralized view controls"
```

---

### Task 2: Apply the policy to screen drawing and hit testing

**Files:**
- Create: `refactor/contract_harness.js`
- Create: `refactor/verify_view_rendering.js`
- Modify: `js/app.js:464-512,1672-1777,3323-3407,3982-4018`
- Modify: `js/canvas.js:48-79,258-405,705-987`

**Interfaces:**
- Produces: `GenogramCanvas.DEFAULT_VIEW_OPTIONS`.
- Produces: `GenogramCanvas.normalizeViewOptions(options): object`.
- Produces: `GenogramCanvas.getPersonTextLayout(person, options): { name, noteLines, nameY, noteStartY }`.
- Produces: `GenogramCanvas.drawPersonText(person, options): void`.
- Consumes: `Relationship.isEmotionalDisplayType(type)` from Task 1.

- [ ] **Step 1: Add the reusable contract harness and failing rendering test**

Create `refactor/contract_harness.js`:

```js
const { chromium } = require('playwright');
const path = require('path');

async function openApp(viewport = { width: 1366, height: 768 }) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);
    return { browser, page, errors };
}

function createChecks() {
    const failures = [];
    const passes = [];
    const check = (name, condition, detail = '') =>
        (condition ? passes : failures).push(condition ? name : name + (detail ? ' — ' + detail : ''));
    return { failures, passes, check };
}

async function finish(browser, passes, failures, successMessage) {
    await browser.close();
    console.log('PASS:');
    passes.forEach(name => console.log('  OK ' + name));
    if (failures.length) {
        console.log('FAIL:');
        failures.forEach(name => console.log('  X ' + name));
        process.exit(1);
    }
    console.log(successMessage);
}

module.exports = { openApp, createChecks, finish };
```

Create `refactor/verify_view_rendering.js` with this header:

```js
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();
```

Then add this browser assertion block:

```js
const result = await page.evaluate(() => {
    const app = window.app;
    app.persons = [
        new Person({ id: 'a', x: 300, y: 260, gender: 'male', name: '甲', age: 40,
            sexualOrientation: true,
            notes: '第一行', medical: { leftHalf: 'filled', bottomHalf: 'none', centerSymbol: 'none',
                isSmoker: false, isObese: false, hasLanguageProblem: false } }),
        new Person({ id: 'b', x: 540, y: 260, gender: 'female', name: '乙', isDeceased: true }),
        new Person({ id: 'loss', x: 700, y: 420, gender: 'pregnancy', name: '流產', lossType: 'miscarriage' })
    ];
    app._syncPersonMap();
    app.relationships = [
        new Relationship({ id: 'emotion', fromPersonId: 'a', toPersonId: 'b', type: 'conflict' }),
        new Relationship({ id: 'abuse', fromPersonId: 'a', toPersonId: 'b', type: 'emotional-abuse' })
    ];
    app.households = [{ id: 'hh', ids: ['a', 'b'], notes: '' }];
    app.lifeCircles = [{ id: 'lc', label: '學校', color: 'rgba(74,144,226,.15)', points: [
        { x: 220, y: 170 }, { x: 620, y: 170 }, { x: 620, y: 360 }, { x: 220, y: 360 }
    ] }];
    const calls = { relationships: [], households: 0, lifeCircles: 0, medical: 0, orientation: 0, loss: 0 };
    const canvas = app.canvas;
    const originalRelationship = canvas.drawRelationship;
    const originalHouseholds = canvas.drawHouseholds;
    const originalCircle = canvas._drawSingleLifeCircle;
    const originalMedical = canvas.drawMedicalSymbols;
    const originalOrientation = canvas.drawSexualOrientationMarker;
    const originalLoss = canvas._drawLossSymbol;
    canvas.drawRelationship = function(from, to, rel, ...rest) {
        calls.relationships.push(rel.type);
        return originalRelationship.call(this, from, to, rel, ...rest);
    };
    canvas.drawHouseholds = function(...args) { calls.households++; return originalHouseholds.apply(this, args); };
    canvas._drawSingleLifeCircle = function(...args) { calls.lifeCircles++; return originalCircle.apply(this, args); };
    canvas.drawMedicalSymbols = function(...args) { calls.medical++; return originalMedical.apply(this, args); };
    canvas.drawSexualOrientationMarker = function(...args) { calls.orientation++; return originalOrientation.apply(this, args); };
    canvas._drawLossSymbol = function(...args) { calls.loss++; return originalLoss.apply(this, args); };
    app.setViewOption('showEmotionalRelationships', false, { render: false });
    app.setViewOption('showHouseholds', false, { render: false });
    app.setViewOption('showLifeCircles', false, { render: false });
    app.setViewOption('showMedical', false, { render: false });
    app.render();
    canvas.drawRelationship = originalRelationship;
    canvas.drawHouseholds = originalHouseholds;
    canvas._drawSingleLifeCircle = originalCircle;
    canvas.drawMedicalSymbols = originalMedical;
    canvas.drawSexualOrientationMarker = originalOrientation;
    canvas._drawLossSymbol = originalLoss;
    const textLayout = canvas.getPersonTextLayout(app.persons[0], {
        ...app.viewOptions, showNames: false, showNotes: true
    });
    const originalRelationshipHit = canvas.isPointOnRelationship;
    canvas.isPointOnRelationship = () => true;
    const relationshipHit = app.getRelationshipAt(420, 260);
    canvas.isPointOnRelationship = originalRelationshipHit;
    const hiddenHits = {
        household: app.getHouseholdAt(420, 185),
        lifeCircle: app.getLifeCircleAt(420, 170),
        relationship: relationshipHit
    };
    app.setTool('household');
    const householdReopened = app.viewOptions.showHouseholds;
    app.setTool('lifeCircle');
    const circleReopened = app.viewOptions.showLifeCircles;
    return { calls, textLayout, hiddenHits: {
        household: hiddenHits.household && hiddenHits.household.id,
        lifeCircle: hiddenHits.lifeCircle && hiddenHits.lifeCircle.id,
        relationship: hiddenHits.relationship && hiddenHits.relationship.type
    }, householdReopened, circleReopened };
});
check('hidden ordinary emotion is not drawn but abuse remains',
    !result.calls.relationships.includes('conflict') && result.calls.relationships.includes('emotional-abuse'),
    JSON.stringify(result.calls.relationships));
check('hidden households are neither drawn nor hit', result.calls.households === 0 && result.hiddenHits.household === null);
check('hidden life circles are neither drawn nor hit', result.calls.lifeCircles === 0 && result.hiddenHits.lifeCircle === null);
check('hidden medical symbols are not drawn', result.calls.medical === 0);
check('medical toggle preserves orientation and reproductive-loss symbols',
    result.calls.orientation === 1 && result.calls.loss === 1, JSON.stringify(result.calls));
check('hidden emotion is not hit while abuse remains hit-testable', result.hiddenHits.relationship === 'emotional-abuse');
check('notes move to first label row when name is hidden',
    result.textLayout.name === '' && result.textLayout.noteLines[0] === '第一行'
        && result.textLayout.noteStartY === result.textLayout.nameY, JSON.stringify(result.textLayout));
check('starting hidden creation tools reopens their layers', result.householdReopened && result.circleReopened);
```

Finish `refactor/verify_view_rendering.js` with:

```js
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL VIEW RENDERING CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
```

- [ ] **Step 2: Run the rendering contract and confirm RED**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_view_rendering.js
```

Expected: exit 1 because the screen renderer and hit tests do not consume `viewOptions` and `getPersonTextLayout` is missing.

- [ ] **Step 3: Add Canvas defaults, normalization, and text layout**

Add to `GenogramCanvas`:

```js
static DEFAULT_VIEW_OPTIONS = Object.freeze({
    showNames: true,
    showAges: true,
    showNotes: true,
    showMedical: true,
    showEmotionalRelationships: true,
    showHouseholds: true,
    showLifeCircles: true
});

normalizeViewOptions(options = {}) {
    return Object.fromEntries(Object.keys(GenogramCanvas.DEFAULT_VIEW_OPTIONS)
        .map(key => [key, options[key] !== false]));
}

getPersonTextLayout(person, options = {}) {
    const view = this.normalizeViewOptions(options);
    const nameY = person.y + this.personSize / 2 + 8;
    const name = view.showNames ? (person.name || '') : '';
    const noteLines = view.showNotes && person.notes
        ? person.notes.split('\n').filter(Boolean).slice(0, 2)
        : [];
    return {
        name,
        noteLines,
        nameY,
        noteStartY: nameY + (name ? this.fontSize + 4 : 0)
    };
}

drawPersonText(person, options = {}) {
    const text = this.getPersonTextLayout(person, options);
    const S = GenogramCanvas.DRAW_PERSON_STYLES;
    this.ctx.shadowBlur = 0;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    if (text.name) {
        this.ctx.font = this.fontSize + 'px ' + this.fontFamily;
        this.ctx.fillStyle = '#333';
        this.ctx.lineWidth = S.nameHalo.lineWidth;
        this.ctx.strokeStyle = S.nameHalo.color;
        this.ctx.strokeText(text.name, person.x, text.nameY);
        this.ctx.fillText(text.name, person.x, text.nameY);
    }
    if (text.noteLines.length) {
        this.ctx.font = (this.fontSize * .8) + 'px ' + this.fontFamily;
        this.ctx.fillStyle = '#666';
        const lineHeight = this.fontSize * .8 + 2;
        text.noteLines.forEach((line, index) => {
            const y = text.noteStartY + index * lineHeight;
            this.ctx.lineWidth = S.notesHalo.lineWidth;
            this.ctx.strokeStyle = S.notesHalo.color;
            this.ctx.strokeText(line, person.x, y);
            this.ctx.fillText(line, person.x, y);
        });
    }
}
```

Use these exact signatures and normalize once:

```js
_drawLossSymbol(person, isActive, viewOptions = this.viewOptions) {
    const view = this.normalizeViewOptions(viewOptions);
    // Keep the existing loss-symbol geometry, then call drawPersonText below.
}

drawPerson(person, isSelected = false, isConnecting = false, isHighlighted = false,
    viewOptions = this.viewOptions) {
    const view = this.normalizeViewOptions(viewOptions);
    // Keep the existing symbol/state geometry and apply the gates below.
}
```

When `drawPerson` delegates a reproductive-loss person, call `_drawLossSymbol(person, isSelected || isConnecting || isHighlighted, view)`. Apply these exact gates in the normal-person branch:

```js
if (!isDeceased && medical && view.showMedical) {
    this.drawMedicalSymbols(x, y, size, gender, medical, transgender);
}
if (view.showAges && age !== null && age !== '') {
    this.ctx.shadowBlur = 0;
    this.ctx.font = 'bold ' + this.fontSize + 'px ' + this.fontFamily;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = isIdentifiedPatient ? '#fff' : '#333';
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = isIdentifiedPatient ? '#333' : '#fff';
    this.ctx.strokeText(String(age), x, y);
    this.ctx.fillText(String(age), x, y);
}
if (person.sexualOrientation) this.drawSexualOrientationMarker(x, y, halfSize);
this.drawPersonText(person, view);
```

In `_drawLossSymbol`, replace its existing name-only block with `this.drawPersonText(person, view);`. Keep sexual-orientation, transgender, identified-patient, death, pregnancy, and loss-symbol geometry outside the medical/age/text gates.

- [ ] **Step 4: Filter screen layers and hit tests without changing domain data**

In `App.render()`, set `this.canvas.viewOptions = this.viewOptions` immediately before the existing `this.canvas.render` call.

In `GenogramCanvas.render()` normalize once as `view`, then:

```js
const visibleOtherRels = otherRels.filter(rel => view.showEmotionalRelationships
    || !Relationship.isEmotionalDisplayType(rel.type));
if (view.showLifeCircles && this.lifeCirclesToDraw && this.lifeCirclesToDraw.length > 0) {
    this.lifeCirclesToDraw.forEach(lifeCircle => {
        this._drawSingleLifeCircle(lifeCircle, this.selectedLifeCircleId === lifeCircle.id);
    });
}
if (view.showHouseholds && households && households.length > 0) {
    this.drawHouseholds(households, persons, relationships, false, selectedHouseholdId);
}
this.drawFamilies(familyRels, persons, visibleOtherRels, selectedRelationshipId, kinship);
visibleOtherRels.forEach(rel => {
    const fromPerson = this.personMap.get(rel.fromPersonId);
    const toPerson = this.personMap.get(rel.toPersonId);
    if (fromPerson && toPerson) {
        this.drawRelationship(fromPerson, toPerson, rel,
            selectedRelationshipId === rel.id, persons, relationships);
    }
});
if (view.showNotes) {
    visibleOtherRels.forEach(rel => {
        const fromPerson = this.personMap.get(rel.fromPersonId);
        const toPerson = this.personMap.get(rel.toPersonId);
        if (fromPerson && toPerson && rel.date) {
            this.drawRelationshipDate(fromPerson, toPerson, rel, persons, relationships);
        }
    });
}
persons.forEach(person => this.drawPerson(person, isSelected || isMultiSelected,
    isConnecting, isHighlighted, view));
```

Use `visibleOtherRels` for the relationship edit-button lookup. Continue passing the full `relationships` array into geometry helpers so parallel offsets and family-route geometry do not jump when a label/layer is toggled.

Add the following early returns:

```js
// App.getRelationshipAt loop, immediately after const rel
if (!this.viewOptions.showEmotionalRelationships && Relationship.isEmotionalDisplayType(rel.type)) continue;

// App.getHouseholdAt
if (!this.viewOptions.showHouseholds) return null;

// App.getLifeCircleAt
if (!this.viewOptions.showLifeCircles) return null;
```

At the beginning of `setTool()` after cancellation logic, reopen hidden creation layers without an intermediate render:

```js
if (tool === 'household') this.ensureViewOption('showHouseholds', { render: false });
if (tool === 'lifeCircle') this.ensureViewOption('showLifeCircles', { render: false });
```

Immediately before the final render in both `createRelationship()` and `updateRelationshipType()`, add:

```js
if (Relationship.isEmotionalDisplayType(type)) {
    this.ensureViewOption('showEmotionalRelationships', { render: false });
}
```

- [ ] **Step 5: Run the rendering contract and confirm GREEN**

Run the Step 2 command.

Expected: all rendering/hit checks pass with zero console errors.

- [ ] **Step 6: Commit the screen-rendering slice**

```powershell
git add refactor/contract_harness.js refactor/verify_view_rendering.js js/app.js js/canvas.js
git commit -m "feat: apply view policy to canvas rendering"
```

---

### Task 3: Make every visual export obey the current view policy

**Files:**
- Create: `refactor/verify_view_export.js`
- Modify: `js/app.js:5002-5168,5228-5279`
- Modify: `js/canvas.js:1021-1030,2812-3203`

**Interfaces:**
- Produces: `GenogramCanvas.getVisibleExportData(persons, relationships, households, lifeCircles, viewOptions)`.
- Extends: `exportToPNG(persons, relationships, households = [], lifeCircles = [], showNotes = true, showLegend = true, scale = 3, viewOptions = {})`.
- Extends: `exportToJPEG(persons, relationships, households = [], lifeCircles = [], quality = .92, showNotes = true, showLegend = true, scale = 3, viewOptions = {})`.
- Extends: `drawExportLegend(ctx, x, y, viewOptions = {})`.

- [ ] **Step 1: Write the complete failing export contract**

Create `refactor/verify_view_export.js` with this header:

```js
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();
```

Then add this browser assertion:

```js
const result = await page.evaluate(() => {
    const app = window.app;
    app.persons = [
        new Person({ id: 'a', x: 200, y: 200, name: '甲', age: 40, notes: '備註' }),
        new Person({ id: 'b', x: 460, y: 200, gender: 'female', name: '乙' })
    ];
    app._syncPersonMap();
    app.relationships = [
        new Relationship({ id: 'e', fromPersonId: 'a', toPersonId: 'b', type: 'conflict', date: '2020' }),
        new Relationship({ id: 'a2', fromPersonId: 'a', toPersonId: 'b', type: 'abuse', date: '2021' })
    ];
    app.households = [{ id: 'hh', ids: ['a', 'b'] }];
    app.lifeCircles = [{ id: 'lc', points: [{ x: 50, y: 50 }, { x: 600, y: 50 }, { x: 600, y: 350 }] }];
    const view = {
        ...app.viewOptions,
        showNames: false,
        showAges: false,
        showNotes: false,
        showMedical: false,
        showEmotionalRelationships: false,
        showHouseholds: false,
        showLifeCircles: false
    };
    const visible = app.canvas.getVisibleExportData(app.persons, app.relationships,
        app.households, app.lifeCircles, view);
    const before = JSON.stringify(app.persons.map(person => person.toJSON()));
    const legendTitles = [];
    const personViewOptions = [];
    const originalLegendSection = app.canvas.drawLegendSection;
    const originalDrawPersonForExport = app.canvas.drawPersonForExport;
    app.canvas.drawLegendSection = function(ctx, section, ...rest) {
        legendTitles.push(section.title);
        return originalLegendSection.call(this, ctx, section, ...rest);
    };
    app.canvas.drawPersonForExport = function(person, options) {
        personViewOptions.push(options);
        return originalDrawPersonForExport.call(this, person, options);
    };
    const png = app.canvas.exportToPNG(app.persons, app.relationships, app.households,
        app.lifeCircles, true, true, 1, view);
    app.canvas.drawLegendSection = originalLegendSection;
    app.canvas.drawPersonForExport = originalDrawPersonForExport;
    const after = JSON.stringify(app.persons.map(person => person.toJSON()));
    return {
        relTypes: visible.relationships.map(rel => rel.type),
        householdCount: visible.households.length,
        circleCount: visible.lifeCircles.length,
        effectiveNotes: visible.viewOptions.showNotes,
        legendTitles,
        personOptionsApplied: personViewOptions.length === 2 && personViewOptions.every(options =>
            options.showNames === false && options.showAges === false
            && options.showNotes === false && options.showMedical === false),
        pngOk: typeof png === 'string' && png.startsWith('data:image/png'),
        unchanged: before === after
    };
});
check('export retains abuse but removes ordinary emotion',
    JSON.stringify(result.relTypes) === JSON.stringify(['abuse']), JSON.stringify(result.relTypes));
check('export removes hidden household and life-circle layers',
    result.householdCount === 0 && result.circleCount === 0, JSON.stringify(result));
check('View notes off overrides export-dialog notes on', result.effectiveNotes === false);
check('hidden emotional sections are removed from the export legend',
    JSON.stringify(result.legendTitles) === JSON.stringify(['家庭關係', '虐待/暴力']),
    JSON.stringify(result.legendTitles));
check('person-level export options hide names ages notes and medical markers', result.personOptionsApplied);
check('filtered export still produces PNG', result.pngOk);
check('export never mutates Person data', result.unchanged);
```

Append this exact App-path spy and footer:

```js
    const threaded = await page.evaluate(async () => {
        const app = window.app;
        const canvas = app.canvas;
        const pngCalls = [];
        const jpegCalls = [];
        const originalPng = canvas.exportToPNG;
        const originalJpeg = canvas.exportToJPEG;
        canvas.exportToPNG = (...args) => { pngCalls.push(args); return null; };
        canvas.exportToJPEG = (...args) => { jpegCalls.push(args); return null; };
        await app.exportPNG(true, false, 1);
        await app.exportJPEG(true, false, 1);
        await app.exportSVG(true, false, 1);
        await app.exportPDF(true, false, 1);
        await app.copyImageToClipboard();
        canvas.exportToPNG = originalPng;
        canvas.exportToJPEG = originalJpeg;
        return {
            pngCalls: pngCalls.length,
            jpegCalls: jpegCalls.length,
            pngThreaded: pngCalls.every(args => args[args.length - 1] === app.viewOptions),
            jpegThreaded: jpegCalls.every(args => args[args.length - 1] === app.viewOptions)
        };
    });
    check('PNG-backed App paths all forward viewOptions',
        threaded.pngCalls === 4 && threaded.pngThreaded, JSON.stringify(threaded));
    check('JPEG App path forwards viewOptions',
        threaded.jpegCalls === 1 && threaded.jpegThreaded, JSON.stringify(threaded));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL VIEW EXPORT CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
```

- [ ] **Step 2: Run the export contract and confirm RED**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_view_export.js
```

Expected: exit 1 because `getVisibleExportData` and final `viewOptions` export arguments are missing.

- [ ] **Step 3: Add non-mutating export filtering**

Add to `GenogramCanvas`:

```js
getVisibleExportData(persons, relationships, households = [], lifeCircles = [], viewOptions = {}) {
    const view = this.normalizeViewOptions(viewOptions);
    return {
        persons,
        relationships: relationships.filter(rel => view.showEmotionalRelationships
            || !Relationship.isEmotionalDisplayType(rel.type)),
        households: view.showHouseholds ? households : [],
        lifeCircles: view.showLifeCircles ? lifeCircles : [],
        viewOptions: view
    };
}
```

Replace `drawPersonForExport` completely and delete the temporary `person.notes = ''` mutation:

```js
drawPersonForExport(person, viewOptions = {}) {
    this.drawPerson(person, false, false, false, viewOptions);
}
```

In both PNG and JPEG exports:

1. Add `viewOptions = {}` as the final parameter.
2. Call `getVisibleExportData(persons, relationships, households, lifeCircles, viewOptions)` and store the return value as `visible`.
3. Compute `effectiveView` with `{ ...visible.viewOptions, showNotes: visible.viewOptions.showNotes && showNotes }`.
4. Iterate visible relationships/households/life circles for bounds and drawing, but continue passing the original full `relationships` argument into `drawRelationship`, `_calculateContentBounds`, and other offset/path helpers.
5. Pass `effectiveView` to `drawPersonForExport` and `drawExportLegend`.
6. Gate relationship dates with `effectiveView.showNotes`.

Update the signature to `_calculateContentBounds(persons, relationships, households, lifeCircles, viewOptions = {}, allRelationships = relationships)`. Person bottom bounds use `getPersonTextLayout`; a two-line note contributes `2 * (fontSize * .8 + 2)`, and a visible name contributes `fontSize + 4`. Iterate only `relationships`, but pass `allRelationships` into `getRelationshipPath` so hidden parallel lines do not shift visible line geometry between screen and export.

- [ ] **Step 4: Filter emotional sections from the export legend**

Change `drawExportLegend(ctx, x, y, viewOptions = {})` to normalize `viewOptions`, then compute counts and draw sections conditionally:

```js
const showEmotional = view.showEmotionalRelationships;
const leftItemsCount = legendDataLeft.family.items.length
    + (showEmotional ? legendDataLeft.emotional_pos.items.length : 0);
const rightItemsCount = legendDataRight.abuse.items.length
    + (showEmotional ? legendDataRight.emotional_neg.items.length : 0);
// Always draw family and abuse. Draw emotional_pos/emotional_neg only when showEmotional is true.
```

Use `legendHeight = effectiveView.showEmotionalRelationships ? 850 : 480` in PNG/JPEG export canvas sizing. Keep the existing 440px legend width.

- [ ] **Step 5: Thread the policy through every App export path**

Append `this.viewOptions` to calls in `exportPNG`, `exportJPEG`, `exportSVG`, `exportPDF`, and `copyImageToClipboard`. Do not change `exportJSON()`.

Preserve the export-dialog rule by leaving its `showNotes` argument in place; Canvas computes the logical AND with `viewOptions.showNotes`.

- [ ] **Step 6: Run the export contract and confirm GREEN**

Run the Step 2 command.

Expected: all export checks pass and no domain object changes after export.

- [ ] **Step 7: Commit the export slice**

```powershell
git add refactor/verify_view_export.js js/app.js js/canvas.js
git commit -m "feat: apply view controls to visual exports"
```

---

### Task 4: Add manual and conditional automatic fit-to-view

**Files:**
- Create: `refactor/verify_fit_view.js`
- Modify: `index.html:214-219`
- Modify: `css/styles.css:401-437`
- Modify: `js/app.js:154-184,346-350,4021-4080,4922-4953`
- Modify: `js/canvas.js:2812-2887`

**Interfaces:**
- Produces: `GenogramCanvas.getContentBounds(persons, relationships, households, lifeCircles, viewOptions)`.
- Produces: `GenogramApp.fitToView({ onlyIfNeeded = false } = {}): { fitted, limited, scale }`.

- [ ] **Step 1: Write the complete failing fit contract**

Create `refactor/verify_fit_view.js` with:

```js
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp({ width: 1366, height: 768 });
    const { failures, passes, check } = createChecks();
    const result = await page.evaluate(async () => {
```

Continue the same `page.evaluate` callback with:

```js
const app = window.app;
const makeData = xs => ({
    persons: xs.map((x, index) => ({ id: 'p' + index, x, y: 240, gender: index % 2 ? 'female' : 'male', name: 'P' + index })),
    relationships: [], households: [], lifeCircles: []
});
app.loadData(makeData([300, 520]));
await new Promise(resolve => requestAnimationFrame(resolve));
const small = { scale: app.canvas.scale, offsetX: app.canvas.offsetX };
app.loadData(makeData([-900, -300, 300, 900, 1500, 2100]));
await new Promise(resolve => requestAnimationFrame(resolve));
const bounds = app.canvas.getContentBounds(app.persons, app.relationships,
    app.households, app.lifeCircles, app.viewOptions);
const screen = {
    left: bounds.minX * app.canvas.scale + app.canvas.offsetX,
    right: bounds.maxX * app.canvas.scale + app.canvas.offsetX,
    top: bounds.minY * app.canvas.scale + app.canvas.offsetY,
    bottom: bounds.maxY * app.canvas.scale + app.canvas.offsetY
};
const largeScale = app.canvas.scale;
app.resetZoom();
const resetScale = app.canvas.scale;
document.getElementById('fitView').click();
const manualScale = app.canvas.scale;
app.loadData(makeData([-20000, 20000]));
await new Promise(resolve => requestAnimationFrame(resolve));
const limited = app.fitToView();
const originalLoadAutoSave = app.storage.loadAutoSave;
app.storage.loadAutoSave = () => ({
    persons: [new Person({ id: 'saved', x: 300, y: 260, name: '已儲存' })],
    relationships: [], households: [], lifeCircles: [],
    view: { scale: .63, offsetX: 71, offsetY: 82 }
});
app.loadAutoSave();
await new Promise(resolve => requestAnimationFrame(resolve));
const restored = { scale: app.canvas.scale, offsetX: app.canvas.offsetX, offsetY: app.canvas.offsetY };
app.storage.loadAutoSave = originalLoadAutoSave;
app.persons = []; app._syncPersonMap(); app.relationships = []; app.households = []; app.lifeCircles = [];
app.canvas.scale = .5; app.canvas.offsetX = 20; app.canvas.offsetY = 30;
const empty = app.fitToView();
return { small, screen, canvasWidth: app.canvas.width, canvasHeight: app.canvas.height,
    largeScale, resetScale, manualScale, limited, restored, empty,
    zoomText: document.getElementById('zoomLevel').textContent };
```

Close the callback and add these assertions/footer:

```js
    });
check('small load stays at 100%', result.small.scale === 1);
check('large load automatically scales below 100%', result.largeScale < 1);
check('automatic fit keeps 24px viewport inset', result.screen.left >= 23 && result.screen.right <= result.canvasWidth - 23
    && result.screen.top >= 23 && result.screen.bottom <= result.canvasHeight - 23, JSON.stringify(result.screen));
check('reset remains exactly 100%', result.resetScale === 1);
check('manual Fit returns to the automatic scale', Math.abs(result.manualScale - result.largeScale) < .001);
check('extreme content stops at 25% and reports the limit',
    result.limited.limited === true && result.limited.scale === .25, JSON.stringify(result.limited));
check('LocalStorage restore preserves saved zoom and offsets',
    result.restored.scale === .63 && result.restored.offsetX === 71 && result.restored.offsetY === 82,
    JSON.stringify(result.restored));
check('empty Fit returns 100% and zero offsets', result.empty.scale === 1 && result.empty.fitted === false);
check('zoom display follows fitted scale', /%$/.test(result.zoomText));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL FIT VIEW CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
```

- [ ] **Step 2: Run the fit contract and confirm RED**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_fit_view.js
```

Expected: exit 1 because `#fitView`, `getContentBounds`, and `fitToView` do not exist.

- [ ] **Step 3: Add the accessible Fit control**

Insert before `zoomReset`:

```html
<button class="zoom-btn" id="fitView" type="button" title="符合全圖" aria-label="符合全圖">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/></svg>
</button>
```

Add:

```css
#fitView svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}
```

Cache `fitView` in `App.cacheElements()` and bind it to `this.fitToView()` beside the existing zoom listeners.

- [ ] **Step 4: Expose visible content bounds and implement Fit**

Add a public Canvas wrapper:

```js
getContentBounds(persons, relationships, households = [], lifeCircles = [], viewOptions = {}) {
    const visible = this.getVisibleExportData(persons, relationships, households, lifeCircles, viewOptions);
    return this._calculateContentBounds(visible.persons, visible.relationships,
        visible.households, visible.lifeCircles, visible.viewOptions, relationships);
}
```

Add to App next to `resetZoom()`:

```js
fitToView({ onlyIfNeeded = false } = {}) {
    const bounds = this.canvas.getContentBounds(this.persons, this.relationships,
        this.households || [], this.lifeCircles || [], this.viewOptions);
    if (!bounds) {
        this.canvas.scale = 1;
        this.canvas.offsetX = 0;
        this.canvas.offsetY = 0;
        this.updateZoomDisplay();
        this.render();
        return { fitted: false, limited: false, scale: 1 };
    }
    const availableWidth = Math.max(1, this.canvas.width - 48);
    const availableHeight = Math.max(1, this.canvas.height - 48);
    const requested = Math.min(1, availableWidth / bounds.width, availableHeight / bounds.height);
    const limited = requested < this.canvas.minScale;
    const scale = Math.max(this.canvas.minScale, requested);
    if (onlyIfNeeded && requested >= 1) this.canvas.scale = 1;
    else this.canvas.scale = scale;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    this.canvas.offsetX = this.canvas.width / 2 - centerX * this.canvas.scale;
    this.canvas.offsetY = this.canvas.height / 2 - centerY * this.canvas.scale;
    this.updateZoomDisplay();
    this.render();
    if (limited) this.updateStatus('內容範圍很大，已縮至最低 25%；可拖曳畫布查看其餘內容',
        'info', { autoHideMs: 3500 });
    return { fitted: requested < 1, limited, scale: this.canvas.scale };
}
```

In `loadData()`, replace the current `render(); resetZoom();` pair with a single `requestAnimationFrame(() => this.fitToView({ onlyIfNeeded: true }));`. Keep LocalStorage restoration unchanged so it restores saved scale/offset.

- [ ] **Step 5: Run fit and UI-shell tests GREEN**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_fit_view.js
node refactor/verify_ui_shell.js
```

Expected: both scripts exit 0; `verify_ui_shell` includes the new SVG button in icon accessibility and 36px hit-target checks.

- [ ] **Step 6: Commit the Fit slice**

```powershell
git add refactor/verify_fit_view.js index.html css/styles.css js/app.js js/canvas.js
git commit -m "feat: add automatic and manual fit to view"
```

---

### Task 5: Verify the complete feature slice before release work

**Files:**
- Test only: `refactor/verify_view_controls.js`
- Test only: `refactor/verify_view_rendering.js`
- Test only: `refactor/verify_view_export.js`
- Test only: `refactor/verify_fit_view.js`

**Interfaces:**
- Consumes all interfaces from Tasks 1–4.
- Produces a clean feature checkpoint ready for mirror synchronization.

- [ ] **Step 1: Run all new feature contracts together**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
$tests = @(
  'refactor/verify_view_controls.js',
  'refactor/verify_view_rendering.js',
  'refactor/verify_view_export.js',
  'refactor/verify_fit_view.js'
)
foreach ($test in $tests) { node $test; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Expected: four exit-0 results and zero page/console errors.

- [ ] **Step 2: Confirm view settings did not enter saved data**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_roundtrip.js
```

Expected: existing JSON/household/life-circle round-trip checks pass with no `viewOptions` field.

- [ ] **Step 3: Check the worktree before handing off to UX/release plans**

```powershell
git status --short
git log -5 --oneline
```

Expected: only the pre-existing `docs/audits/` working files remain untracked; application and feature-test edits are committed.
