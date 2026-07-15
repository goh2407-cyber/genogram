# Genogram UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the generic add-person prompt, give passive status messages a race-safe fade lifecycle, and remove the favicon 404 without changing active workflow guidance.

**Architecture:** Keep `updateStatus` as the single status entry point and add one cancelable timer plus explicit timeout constants. Success messages auto-hide by default, active information messages remain persistent, and callers may opt into a precise timeout. The generic add command supplies a display-label override while retaining the existing parent-generation placement behavior.

**Tech Stack:** Vanilla HTML/CSS/JavaScript and Playwright Node regression scripts.

## Global Constraints

- Do not change placement generation, quick-add relationship behavior, or clinical drawing semantics.
- Active placement, connection, household, and life-circle instructions must remain persistent.
- Passive success timeout is exactly 3500ms; explicitly passive warning/error timeout is exactly 6000ms.
- A new status message must cancel the previous timer before updating DOM state.
- Use existing `icon-512.png`; do not add an external favicon dependency.
- Apply equivalent HTML markup to root, `geno/`, and `refactor/app/`; retain `geno` local vendor/font paths.
- Use TDD and observe RED before production edits.

---

### Task 1: Lock the wording, status-timer, and favicon behavior in a regression test

**Files:**
- Create: `refactor/verify_status_ux.js`

**Interfaces:**
- Requires: `GenogramApp.STATUS_TIMEOUTS`.
- Requires: `updateStatus(message, type, { autoHideMs } = {})`.
- Requires: `showGenderModal(generation, statusLabel = null)`.

- [ ] **Step 1: Create the complete failing test**

Create `refactor/verify_status_ux.js`:

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
    const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
    const errors = [];
    const failedResponses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) failedResponses.push(response.url()); });
    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);

    const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
    check('favicon points to the bundled icon', favicon === 'icon-512.png', String(favicon));
    check('no favicon request fails', !failedResponses.some(url => /favicon\.ico$/.test(url)), failedResponses.join(' | '));

    await page.click('#addPerson');
    check('generic add prompt names a person rather than a parent',
        await page.locator('#statusBar').textContent() === '選擇新增人物的性別');
    await page.click('#cancelGender');

    const timerResult = await page.evaluate(async () => {
        const app = window.app;
        const constants = { ...GenogramApp.STATUS_TIMEOUTS };
        app.updateStatus('舊訊息', 'success', { autoHideMs: 20 });
        await new Promise(resolve => setTimeout(resolve, 5));
        app.updateStatus('新操作提示', 'info');
        await new Promise(resolve => setTimeout(resolve, 35));
        const newStillVisible = !app.elements.statusBar.classList.contains('hidden')
            && app.elements.statusBar.textContent === '新操作提示';
        app.updateStatus('短訊息', 'success', { autoHideMs: 20 });
        await new Promise(resolve => setTimeout(resolve, 35));
        const passiveHidden = app.elements.statusBar.classList.contains('hidden');
        app.updateStatus('進行中的操作', 'info');
        await new Promise(resolve => setTimeout(resolve, 35));
        const activeVisible = !app.elements.statusBar.classList.contains('hidden');
        app.updateStatus();
        return { constants, newStillVisible, passiveHidden, activeVisible,
            timerCleared: app.statusHideTimer === null };
    });
    check('status constants match the approved design',
        timerResult.constants.passive === 3500 && timerResult.constants.passiveAlert === 6000,
        JSON.stringify(timerResult.constants));
    check('an old timer never hides a newer message', timerResult.newStillVisible);
    check('a passive message hides after its timeout', timerResult.passiveHidden);
    check('active info remains visible', timerResult.activeVisible);
    check('explicit clear cancels and nulls the timer', timerResult.timerCleared);
    check('zero page/console errors', errors.length === 0, errors.join(' | '));

    await browser.close();
    console.log('PASS:');
    passes.forEach(name => console.log('  OK ' + name));
    if (failures.length) {
        console.log('FAIL:');
        failures.forEach(name => console.log('  X ' + name));
        process.exit(1);
    }
    console.log('ALL STATUS UX CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_status_ux.js
```

Expected: exit 1 because the favicon link, timeout constants, third `updateStatus` argument, and generic wording are missing.

- [ ] **Step 3: Commit only after the implementation tasks turn this test green**

Do not commit the RED-only file separately. Keep it uncommitted while Tasks 2–3 implement the behavior.

---

### Task 2: Implement race-safe status auto-hide and the generic add-person label

**Files:**
- Modify: `js/app.js:56-145,282-284,609-620,1820-1841,4883-4903,5313-5351`
- Modify: `css/styles.css:342-382`

**Interfaces:**
- Produces: `GenogramApp.STATUS_TIMEOUTS = { passive: 3500, passiveAlert: 6000 }`.
- Extends: `updateStatus(message = null, type = null, { autoHideMs = undefined } = {})`.
- Extends: `showGenderModal(generation, statusLabel = null)`.

- [ ] **Step 1: Add timeout state and constants**

Add to `GenogramApp` near the generation constants:

```js
static STATUS_TIMEOUTS = Object.freeze({
    passive: 3500,
    passiveAlert: 6000
});
```

Initialize beside `autoSaveTimer`:

```js
this.statusHideTimer = null;
```

- [ ] **Step 2: Replace `updateStatus` with the complete timer-safe implementation**

```js
updateStatus(message = null, type = null, { autoHideMs = undefined } = {}) {
    if (this.statusHideTimer !== null) {
        clearTimeout(this.statusHideTimer);
        this.statusHideTimer = null;
    }
    if (!message) {
        this.elements.statusBar.classList.add('hidden');
        return;
    }
    const bar = this.elements.statusBar;
    bar.textContent = message;
    bar.className = 'status-bar';
    if (type) bar.classList.add(type);
    const duration = autoHideMs !== undefined
        ? autoHideMs
        : (type === 'success' ? GenogramApp.STATUS_TIMEOUTS.passive : null);
    if (Number.isFinite(duration) && duration >= 0) {
        const expectedMessage = message;
        this.statusHideTimer = setTimeout(() => {
            this.statusHideTimer = null;
            if (bar.textContent === expectedMessage) bar.classList.add('hidden');
        }, duration);
    }
}
```

Use `{ autoHideMs: GenogramApp.STATUS_TIMEOUTS.passive }` for both `就緒` call sites. Leave active info calls without a third argument. Remove the standalone 4000ms timer from `saveToFile()` and the 5000ms timer from `loadAutoSave()`; replace the restored-session info call with an explicit 3500ms `autoHideMs`.

For a passive warning/error that is intentionally changed in this scope, call:

```js
this.updateStatus(message, type, { autoHideMs: GenogramApp.STATUS_TIMEOUTS.passiveAlert });
```

Do not bulk-convert operational warning/error calls.

- [ ] **Step 3: Add a label override without changing placement generation**

Change the toolbar binding to:

```js
this.elements.addPersonBtn.addEventListener('click', () =>
    this.showGenderModal('parent', '新增人物'));
```

Replace the method signature/body label lines with:

```js
showGenderModal(generation, statusLabel = null) {
    if (this.isPreviewingLayout) this.cancelPreviewedLayout();
    this.pendingGeneration = generation;
    const level = GenogramApp.GENERATION_LEVELS[generation];
    const label = statusLabel || (level ? level.label : (generation || '外部'));
    const message = statusLabel
        ? '選擇' + label + '的性別'
        : '選擇 ' + label + ' 的性別';
    this.updateStatus(message, 'info');
    this.elements.genderModal.classList.add('active');
}
```

The no-space generic phrase must match `選擇新增人物的性別`. Existing generation calls omit the override and retain `選擇 父母 的性別` and equivalent relative wording.

- [ ] **Step 4: Make hidden status animate instead of using `display:none`**

Add to `.status-bar`:

```css
opacity: 1;
visibility: visible;
```

Replace `.status-bar.hidden` with:

```css
.status-bar.hidden {
    opacity: 0;
    visibility: hidden;
    transform: translate(-50%, -6px);
}
```

Keep `pointer-events: none` and the existing reduced-motion rule.

- [ ] **Step 5: Run the status test**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_status_ux.js
```

Expected at this point: wording and timer checks pass; favicon check remains RED until Task 3.

---

### Task 3: Add the bundled favicon to the tracked root shell

**Files:**
- Modify: `index.html:8-10`

**Interfaces:**
- Produces: `<link rel="icon" href="icon-512.png" type="image/png">` in root; the release-guardrails plan performs byte synchronization and the `geno` local-path restoration.

- [ ] **Step 1: Add the exact favicon tag after the description meta tag**

```html
<link rel="icon" href="icon-512.png" type="image/png">
```

Do not change the root Google Fonts or CDN lines.

- [ ] **Step 2: Run the complete UX contract GREEN**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_status_ux.js
node refactor/verify_ui_shell.js
```

Expected: both scripts exit 0, favicon 404 is absent, generic wording is exact, and the status timer race checks pass.

- [ ] **Step 3: Commit the complete UX slice**

```powershell
git add refactor/verify_status_ux.js js/app.js css/styles.css index.html
git commit -m "fix: polish status and add-person feedback"
```

---

### Task 4: Confirm active workflows remain persistent

**Files:**
- Test only: `js/app.js`
- Test only: `refactor/verify_status_ux.js`

**Interfaces:**
- Consumes `updateStatus` behavior from Task 2.

- [ ] **Step 1: Search for explicit timers and active instructions**

```powershell
rg -n "setTimeout\(\(\) => this\.updateStatus|updateStatus\(.*(請|移動|點擊|連接|圈選|繪製)" js/app.js
```

Expected: no standalone status-clear timeout remains; active instructions call `updateStatus` without `autoHideMs`.

- [ ] **Step 2: Run interaction regressions most sensitive to status changes**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_placement.js
node refactor/verify_hh_lc.js
node refactor/verify_relationship_edges.js
```

Expected: all three exit 0.

- [ ] **Step 3: Check commit and working-tree state**

```powershell
git status --short
git log -3 --oneline
```

Expected: UX files are committed; only pre-existing audit working files and later release-plan work remain.
