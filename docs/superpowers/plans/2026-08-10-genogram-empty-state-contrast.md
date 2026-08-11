# Genogram Empty State and UI Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓空白家系圖有明確的第一步引導，並提高非臨床 UI 的文字、控制邊界與焦點對比，不改變 Canvas 臨床語意。

**Architecture:** 空狀態是 `.canvas-container` 內的編輯器 DOM overlay，完全不參與 Canvas render/export。`GenogramApp.updateEmptyState()` 是唯一顯示入口，只依 `persons.length` 與 `placementSession` 決定 `hidden`。對比修正收斂為 CSS design tokens，對一般文字用 4.5:1、控制邊界與 focus indicator 用 3:1 的自動化契約。

**Tech Stack:** 語意化 HTML、CSS custom properties、原生 JavaScript、Playwright、Node.js、Windows PowerShell 5.1。

## Global Constraints

- 先完成 release hardening 與 label-safe routing 兩份計畫，再執行本計畫。
- 只調整非臨床 UI；不改 Canvas 關係線色、性別底色、案主灰底、醫學標記、圖例線型或虛線間距。
- CSS 不新增畫布網格；背景網格仍只由 `canvas.js drawGrid()` 繪製。
- 空狀態的顯示／隱藏不得呼叫 `saveState()`、`autoSave()` 或改動 JSON；不得進入 PNG、JPEG、SVG、PDF 或剪貼簿。
- Overlay 大區塊 `pointer-events:none`，只有 CTA `pointer-events:auto`；空狀態文字區下方的 Canvas 仍可收到 pointerdown。
- 重用現有 gender modal 與 placement transaction，不另建快速新增邏輯。
- 根目錄、`geno/`、`refactor/app/` 對應 CSS/JS raw MD5 一致；HTML 只保留 `geno` 已知的本地 vendor 差異。
- `geno/` 與 `refactor/app/` 是 gitignored 本機副本：每階段同步並跑驗證，不強制 stage。
- 執行前使用 frontend-design 對空狀態做視覺約束，用 superpowers:test-driven-development 實作，完成前用 superpowers:verification-before-completion。

---

## File Map

- Create: `refactor/verify_empty_state_contrast.js` — 空狀態生命週期、pointer passthrough、history/storage isolation、export isolation、contrast 與 100%/125% 顯示。
- Modify: `index.html:210-212` — 新增 `canvasEmptyState` 與 CTA。
- Modify: `css/styles.css:8-95,332-345,592-710,1570-1640` — 新 token、空狀態、form/control border、disabled 與 focus-visible。
- Modify: `js/app.js:175-240,4247-4295` — 快取 DOM、CTA 綁定、`updateEmptyState()` 與 render 同步。
- Modify: `refactor/TEST_GATES.md` — 新增 empty/contrast gate 與顯示比例檢查。
- Mirror: `geno/index.html`, `refactor/app/index.html`, corresponding CSS and JS.

## Shared Test Environment

```powershell
$env:NODE_PATH = 'C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\goh2407\.agents\skills\playwright-skill\node_modules'
node -e "require('playwright'); console.log('empty-state test dependencies ok')"
```

Expected: `empty-state test dependencies ok`.

---

### Task 1: Add a State-Derived Empty Canvas Onboarding

**Files:**
- Create: `refactor/verify_empty_state_contrast.js`
- Modify: `index.html:210-212`
- Modify: `css/styles.css:332-345`
- Modify: `js/app.js:175-240,4247-4295`
- Mirror: root/geno/refactor app HTML, CSS and JS

**Interfaces:**
- Produces: `#canvasEmptyState[role="region"]` and `#emptyStateAdd`.
- Produces: `GenogramApp.updateEmptyState()`.
- Visibility invariant: `hidden === !(persons.length === 0 && placementSession === null)`.

- [ ] **Step 1: Write the failing lifecycle contract**

Create `refactor/verify_empty_state_contrast.js`:

```js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const URL = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const SHOT_DIR = path.join(__dirname, 'smoke_empty_state');

function createChecks() {
    const failures = [];
    let passes = 0;
    return {
        failures,
        check(name, condition, detail = '') {
            if (condition) { passes++; console.log(`PASS | ${name}`); }
            else { failures.push(name); console.log(`FAIL | ${name}${detail ? ' — ' + detail : ''}`); }
        },
        get passes() { return passes; }
    };
}

(async () => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const browser = await chromium.launch();
    const checks = createChecks();
    const variants = [
        { name: '100', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
        { name: '125', viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1.25 }
    ];

    for (const variant of variants) {
        const context = await browser.newContext({
            viewport: variant.viewport,
            deviceScaleFactor: variant.deviceScaleFactor
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push('pageerror: ' + error.message));
        page.on('console', message => {
            if (message.type() === 'error') errors.push('console: ' + message.text());
        });
        await page.addInitScript(() => localStorage.clear());
        await page.goto(URL);
        await page.waitForFunction(() => window.app?.canvas && window.app.isLoading === false);
        await page.waitForFunction(() => !document.getElementById('canvasEmptyState')?.hidden);

        const initial = await page.evaluate(() => {
            const app = window.app;
            app.persons = [];
            app.relationships = [];
            app.households = [];
            app.lifeCircles = [];
            app._syncPersonMap();
            app.cancelPlacement();
            app.render();
            const node = document.getElementById('canvasEmptyState');
            const card = node.querySelector('.canvas-empty-card');
            const button = document.getElementById('emptyStateAdd');
            const container = document.getElementById('canvasContainer');
            const history = [app.history.getUndoCount(), app.history.getRedoCount()];
            const storage = localStorage.getItem('genogram_autosave');
            app.updateEmptyState();
            app.updateEmptyState();
            return {
                visible: !node.hidden,
                role: node.getAttribute('role'),
                labelled: node.getAttribute('aria-labelledby') === 'canvasEmptyTitle',
                overlayPointer: getComputedStyle(node).pointerEvents,
                buttonPointer: getComputedStyle(button).pointerEvents,
                historyBefore: history,
                historyAfter: [app.history.getUndoCount(), app.history.getRedoCount()],
                storageBefore: storage,
                storageAfter: localStorage.getItem('genogram_autosave'),
                card: card.getBoundingClientRect().toJSON(),
                container: container.getBoundingClientRect().toJSON(),
                button: button.getBoundingClientRect().toJSON()
            };
        });

        checks.check(`${variant.name}% empty state is visible and labelled`,
            initial.visible && initial.role === 'region' && initial.labelled, JSON.stringify(initial));
        checks.check(`${variant.name}% overlay passes pointers except CTA`,
            initial.overlayPointer === 'none' && initial.buttonPointer === 'auto', JSON.stringify(initial));
        checks.check(`${variant.name}% empty-state updates do not touch history`,
            JSON.stringify(initial.historyBefore) === JSON.stringify(initial.historyAfter), JSON.stringify(initial));
        checks.check(`${variant.name}% empty-state updates do not touch storage`,
            initial.storageBefore === initial.storageAfter, JSON.stringify(initial));
        checks.check(`${variant.name}% card stays inside the canvas`,
            initial.card.x >= initial.container.x && initial.card.y >= initial.container.y
                && initial.card.x + initial.card.width <= initial.container.x + initial.container.width
                && initial.card.y + initial.card.height <= initial.container.y + initial.container.height,
            JSON.stringify(initial));
        checks.check(`${variant.name}% CTA has a 44px target`,
            initial.button.height >= 44 && initial.button.width >= 44, JSON.stringify(initial.button));

        await page.evaluate(() => {
            window.__emptyStateCanvasDowns = 0;
            document.getElementById('genogramCanvas').addEventListener('pointerdown', () => {
                window.__emptyStateCanvasDowns++;
            });
        });
        const titleBox = await page.locator('#canvasEmptyTitle').boundingBox();
        await page.mouse.click(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
        checks.check(`${variant.name}% empty copy does not block canvas pointerdown`,
            await page.evaluate(() => window.__emptyStateCanvasDowns === 1));

        await page.click('#emptyStateAdd');
        checks.check(`${variant.name}% CTA opens the existing gender modal`,
            await page.locator('#genderModal').evaluate(node => node.classList.contains('active')));
await page.locator('#genderModal .gender-btn[data-gender="male"]').first().click();
        const placement = await page.evaluate(() => ({
            active: Boolean(window.app.placementSession),
            emptyHidden: document.getElementById('canvasEmptyState').hidden,
            personCount: window.app.persons.length
        }));
        checks.check(`${variant.name}% placement hides onboarding without creating data`,
            placement.active && placement.emptyHidden && placement.personCount === 0,
            JSON.stringify(placement));

        await page.keyboard.press('Escape');
        const cancelled = await page.evaluate(() => ({
            active: Boolean(window.app.placementSession),
            visible: !document.getElementById('canvasEmptyState').hidden
        }));
        checks.check(`${variant.name}% cancelling placement restores onboarding`,
            !cancelled.active && cancelled.visible, JSON.stringify(cancelled));

        const loaded = await page.evaluate(() => {
            const app = window.app;
            app.loadData({ persons: [{ id: 'loaded-person', x: 300, y: 260,
                gender: 'female', name: '已載入成員' }], relationships: [], households: [], lifeCircles: [] });
            app.render();
            return { count: app.persons.length,
                hidden: document.getElementById('canvasEmptyState').hidden };
        });
        checks.check(`${variant.name}% loading the first person hides onboarding`,
            loaded.count === 1 && loaded.hidden, JSON.stringify(loaded));

        const exportIsolation = await page.evaluate(() => {
            const app = window.app;
            const node = document.getElementById('canvasEmptyState');
            const first = app.canvas.exportToPNG(app.persons, app.relationships, [], [], true, false, 1,
                app.viewOptions);
            node.hidden = false;
            const second = app.canvas.exportToPNG(app.persons, app.relationships, [], [], true, false, 1,
                app.viewOptions);
            app.updateEmptyState();
            return { equal: first === second, firstPrefix: first?.slice(0, 22) };
        });
        checks.check(`${variant.name}% DOM onboarding never enters canvas export`,
            exportIsolation.equal && exportIsolation.firstPrefix === 'data:image/png;base64,',
            JSON.stringify(exportIsolation));

        page.once('dialog', dialog => dialog.accept());
        await page.click('#clearAllBtn');
        await page.waitForFunction(() => !document.getElementById('canvasEmptyState').hidden);
        checks.check(`${variant.name}% clear restores onboarding`,
            await page.evaluate(() => window.app.persons.length === 0
                && !document.getElementById('canvasEmptyState').hidden));

        await page.locator('#canvasContainer').screenshot({
            path: path.join(SHOT_DIR, `empty-${variant.name}.png`)
        });
        checks.check(`${variant.name}% has zero page/console errors`,
            errors.length === 0, errors.join(' | '));
        await context.close();
    }

    await browser.close();
    console.log(`\n===== empty-state-contrast ===== ${checks.passes}/${checks.passes + checks.failures.length} pass`);
    process.exit(checks.failures.length ? 1 : 0);
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
```

- [ ] **Step 2: Run the contract and verify RED**

```powershell
node refactor/verify_empty_state_contrast.js
```

Expected: FAIL because the empty-state elements and `updateEmptyState()` do not exist.

- [ ] **Step 3: Add semantic markup and pointer-safe styles**

Inside `#canvasContainer`, immediately after `#genogramCanvas`, add:

```html
<section id="canvasEmptyState" class="canvas-empty-state" role="region"
    aria-labelledby="canvasEmptyTitle" aria-describedby="canvasEmptyDescription" hidden>
    <div class="canvas-empty-card">
        <span class="canvas-empty-kicker">開始建立家系圖</span>
        <h2 id="canvasEmptyTitle">先新增第一位成員</h2>
        <p id="canvasEmptyDescription">建立後可以用人物旁的快速按鈕新增父母、伴侶與子女。</p>
        <button type="button" id="emptyStateAdd" class="canvas-empty-action">新增第一位成員</button>
        <span class="canvas-empty-shortcut">也可按 N 開始</span>
    </div>
</section>
```

Add after the canvas container styles:

```css
.canvas-empty-state {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: grid;
    place-items: center;
    padding: 24px;
    pointer-events: none;
}

.canvas-empty-state[hidden] { display: none; }

.canvas-empty-card {
    width: min(420px, calc(100% - 24px));
    padding: 28px 30px 26px;
    color: var(--ink-body);
    text-align: center;
    background: rgb(255 255 255 / 94%);
    border: 1px solid var(--line-ui);
    border-radius: 16px;
    box-shadow: 0 18px 48px rgb(23 33 43 / 12%);
    backdrop-filter: blur(8px);
}

.canvas-empty-kicker,
.canvas-empty-shortcut {
    display: block;
    color: var(--ink-muted);
    font-size: 12px;
}

.canvas-empty-kicker {
    margin-bottom: 6px;
    font-weight: 700;
    letter-spacing: .08em;
}

.canvas-empty-card h2 {
    margin: 0;
    color: var(--ink-strong);
    font-size: clamp(20px, 2.4vw, 26px);
    line-height: 1.3;
}

.canvas-empty-card p {
    margin: 10px auto 18px;
    max-width: 34ch;
    color: var(--ink-body);
    line-height: 1.65;
}

.canvas-empty-action {
    min-height: 44px;
    padding: 10px 20px;
    color: #fff;
    background: var(--brand-hover);
    border: 1px solid var(--brand-hover);
    border-radius: 999px;
    box-shadow: 0 6px 18px rgb(204 14 83 / 22%);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    pointer-events: auto;
}

.canvas-empty-action:hover { background: var(--brand-active); }
.canvas-empty-shortcut { margin-top: 10px; }
```

- [ ] **Step 4: Derive visibility from App state**

Cache `canvasEmptyState` and `emptyStateAdd`, bind the CTA once in `setupEventListeners()`:

```js
this.elements.emptyStateAdd?.addEventListener('click', () =>
    this.showGenderModal('parent', '新增第一位成員'));
```

Add:

```js
updateEmptyState() {
    const node = this.elements.canvasEmptyState;
    if (!node) return;
    node.hidden = !(this.persons.length === 0 && this.placementSession === null);
}
```

Call `updateEmptyState()` at the end of `GenogramApp.render()`, after life-circle preview drawing. Do not add calls to save/history/storage.

In the existing zero-delay initialization callback, render the initial empty workspace so the onboarding appears without requiring the first user event:

```js
if (this.persons.length === 0) {
    this.updateStatus('就緒', null, {
        autoHideMs: GenogramApp.STATUS_TIMEOUTS.passive
    });
    this.render();
}
```

- [ ] **Step 5: Run lifecycle gates and verify GREEN**

```powershell
node refactor/verify_empty_state_contrast.js
node refactor/verify_modal_flow.js
node refactor/verify_ui_shell.js
node refactor/verify_empty_state_contrast.js
```

Expected: the new lifecycle/pointer/export assertions pass at 100% and 125%; all existing scripts exit 0.

- [ ] **Step 6: Synchronize and commit Task 1**

```powershell
Copy-Item -LiteralPath 'js\app.js' -Destination 'geno\js\app.js' -Force
Copy-Item -LiteralPath 'js\app.js' -Destination 'refactor\app\js\app.js' -Force
Copy-Item -LiteralPath 'css\styles.css' -Destination 'geno\css\styles.css' -Force
Copy-Item -LiteralPath 'css\styles.css' -Destination 'refactor\app\css\styles.css' -Force
node refactor/verify_mirror_sync.js
node refactor/verify_geno_deploy.js
git add index.html css/styles.css js/app.js refactor/verify_empty_state_contrast.js
git commit -m "feat: guide first-time genogram creation"
```

---

### Task 2: Raise Non-Clinical UI Contrast and Focus Visibility

**Files:**
- Modify: `css/styles.css:8-95,592-710,1174-1210,1364-1475,1570-1640`
- Extend: `refactor/verify_empty_state_contrast.js`
- Mirror: `geno/css/styles.css`, `refactor/app/css/styles.css`

**Token contract:**

| Token | Value | Intended use | Contrast on white |
|---|---:|---|---:|
| `--text-muted` | `#617187` | small secondary copy and input hint | 4.976:1 |
| `--ink-muted` | `#596773` | inspector eyebrow and empty-state metadata | 5.813:1 |
| `--control-border` | `#84909d` | interactive control boundary | 3.252:1 |
| `--focus-ring` | `#cc0e53` | focus-visible indicator | 5.592:1 |
| `--text-disabled` | `#596773` | disabled text on `#f1f5f9` | 5.306:1 |

- [ ] **Step 1: Add RED token and computed-style checks**

Add these helpers at the top of `verify_empty_state_contrast.js`:

```js
function srgb(channel) {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
    const value = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
    return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

function contrast(foreground, background) {
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
```

Inside each viewport loop, collect tokens and representative styles:

```js
const contrastState = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const tokens = Object.fromEntries([
        '--text-muted', '--ink-muted', '--control-border', '--focus-ring', '--text-disabled'
    ].map(name => [name, root.getPropertyValue(name).trim().toLowerCase()]));
    const action = document.getElementById('emptyStateAdd');
    return {
        tokens,
        actionForeground: getComputedStyle(action).color,
        actionBackground: getComputedStyle(action).backgroundColor,
        emptyKickerColor: getComputedStyle(document.querySelector('.canvas-empty-kicker')).color,
        undoDisabled: document.getElementById('undoBtn').disabled
    };
});
```

Assert exact token values and numeric thresholds:

```js
const expectedTokens = {
    '--text-muted': '#617187', '--ink-muted': '#596773',
    '--control-border': '#84909d', '--focus-ring': '#cc0e53',
    '--text-disabled': '#596773'
};
checks.check(`${variant.name}% contrast tokens are exact`,
    JSON.stringify(contrastState.tokens) === JSON.stringify(expectedTokens),
    JSON.stringify(contrastState.tokens));
checks.check(`${variant.name}% muted text reaches 4.5:1`,
    ['#ffffff', '#fafbfc', '#f6f7f9', '#f5f7f8', '#f1f5f9'].every(background =>
        contrast(contrastState.tokens['--text-muted'], background) >= 4.5
        && contrast(contrastState.tokens['--ink-muted'], background) >= 4.5));
checks.check(`${variant.name}% control border and focus ring reach 3:1`,
    ['#ffffff', '#fafbfc', '#f6f7f9'].every(background =>
        contrast(contrastState.tokens['--control-border'], background) >= 3
        && contrast(contrastState.tokens['--focus-ring'], background) >= 3));
checks.check(`${variant.name}% disabled text reaches 4.5:1 on disabled surface`,
    contrast(contrastState.tokens['--text-disabled'], '#f1f5f9') >= 4.5);
checks.check(`${variant.name}% empty CTA text reaches 4.5:1`,
    contrast('#ffffff', '#cc0e53') >= 4.5);
```

Create a person form, inspect the applied styles, then restore the empty fixture:

```js
const controlState = await page.evaluate(() => {
    const app = window.app;
    const person = new Person({ id: 'contrast-person', x: 300, y: 260,
        gender: 'male', name: '' });
    app.persons = [person];
    app._syncPersonMap();
    app.selectPerson(person.id);
    const input = document.getElementById('personName');
    const border = getComputedStyle(input).borderTopColor;
    const placeholder = getComputedStyle(input, '::placeholder').color;
    input.disabled = true;
    const disabled = getComputedStyle(input);
    const result = {
        border,
        placeholder,
        disabledColor: disabled.color,
        disabledBackground: disabled.backgroundColor
    };
    app.persons = [];
    app._syncPersonMap();
    app.selectedPersonId = null;
    app.updatePropertyPanel();
    app.render();
    return result;
});
checks.check(`${variant.name}% form control uses tested border and hint tokens`,
    controlState.border === 'rgb(132, 144, 157)'
        && controlState.placeholder === 'rgb(97, 113, 135)',
    JSON.stringify(controlState));
checks.check(`${variant.name}% disabled form control uses tested colors`,
    controlState.disabledColor === 'rgb(89, 103, 115)'
        && controlState.disabledBackground === 'rgb(241, 245, 249)',
    JSON.stringify(controlState));
```

Add a keyboard-visible focus check:

```js
await page.locator('#emptyStateAdd').focus();
await page.keyboard.press('Tab');
await page.keyboard.press('Shift+Tab');
const focusStyle = await page.locator('#emptyStateAdd').evaluate(node => ({
    outlineColor: getComputedStyle(node).outlineColor,
    outlineWidth: parseFloat(getComputedStyle(node).outlineWidth),
    focused: document.activeElement === node
}));
checks.check(`${variant.name}% CTA has a solid keyboard focus indicator`,
    focusStyle.focused && focusStyle.outlineColor === 'rgb(204, 14, 83)'
        && focusStyle.outlineWidth >= 2,
    JSON.stringify(focusStyle));
```

Expected RED: the current muted/border tokens are too light and the focus outline is translucent.

- [ ] **Step 2: Add exact tokens**

Update/add only these root variables:

```css
:root {
    --text-muted: #617187;
    --ink-muted: #596773;
    --control-border: #84909d;
    --focus-ring: #cc0e53;
    --text-disabled: #596773;
    --surface-disabled: #f1f5f9;
}
```

Do not change `--brand:#ed1261`; the brand token remains the visual identity color. White normal-size text uses `--brand-hover:#cc0e53` where AA text contrast is required, including the empty-state CTA.

- [ ] **Step 3: Apply tokens to interactive UI only**

Update form controls and placeholders:

```css
.form-group input,
.form-group select,
.form-group textarea {
    border-color: var(--control-border);
}

.form-group input::placeholder,
.form-group textarea::placeholder {
    color: var(--text-muted);
    opacity: 1;
}

.form-group input:disabled,
.form-group select:disabled,
.form-group textarea:disabled {
    color: var(--text-disabled);
    background: var(--surface-disabled);
    border-color: var(--control-border);
    opacity: 1;
}

.tool-btn:disabled {
    color: rgb(255 255 255 / 70%);
    opacity: 1;
    cursor: not-allowed;
}
```

Use `--control-border` for the default borders of `.gender-btn`, `.child-option`, `.export-option-btn`, `.inspector-toggle`, and any other button whose boundary is necessary to identify it as a control. Keep `--line-ui` / `--border-light` for decorative separators.

Replace translucent focus-only rules with:

```css
button:focus-visible,
[tabindex]:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
}

.form-group input:focus-visible,
.form-group select:focus-visible,
.form-group textarea:focus-visible {
    border-color: var(--focus-ring);
    box-shadow: none;
}
```

Remove or override both earlier `.tool-btn:focus-visible` and combined `button:focus-visible, [tabindex]:focus-visible` declarations so the final computed outline is opaque `rgb(204, 14, 83)`.

- [ ] **Step 4: Verify contrast at both display variants**

```powershell
node refactor/verify_empty_state_contrast.js
node refactor/verify_ui_shell.js
node refactor/verify_status_ux.js
node refactor/verify_view_controls.js
```

Expected: exact tokens, threshold calculations, focus indicator, 100% and 125% layout all pass; existing scripts exit 0.

- [ ] **Step 5: Visually inspect non-clinical changes**

Open and inspect:

- `refactor/smoke_empty_state/empty-100.png`
- `refactor/smoke_empty_state/empty-125.png`

Confirm the empty card does not compete with the clinical canvas, the CTA is visually primary, small copy is readable, and the compact inspector at the 125% variant does not cover the CTA. If the Windows font fallback changes wrapping, adjust only card width/padding within the tested canvas bounds; do not reduce font size below 12px.

- [ ] **Step 6: Synchronize and commit Task 2**

```powershell
Copy-Item -LiteralPath 'css\styles.css' -Destination 'geno\css\styles.css' -Force
Copy-Item -LiteralPath 'css\styles.css' -Destination 'refactor\app\css\styles.css' -Force
node refactor/verify_mirror_sync.js
git add css/styles.css refactor/verify_empty_state_contrast.js
git commit -m "fix: improve non-clinical UI contrast and focus"
```

---

### Task 3: Run Visual, Offline and Full Release Gates

**Files:**
- Modify: `refactor/TEST_GATES.md`

- [ ] **Step 1: Prove clinical Canvas pixels did not change**

```powershell
node refactor/visual_golden.js
```

Expected: all 17 fixtures report `diffPixels=0`. The empty state is DOM-only and contrast tokens do not alter Canvas colors.

- [ ] **Step 2: Run every permanent contract**

```powershell
$verifyScripts = Get-ChildItem -LiteralPath 'refactor' -Filter 'verify_*.js' |
    Sort-Object Name
foreach ($script in $verifyScripts) {
    Write-Host "RUN $($script.Name)"
    node $script.FullName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
node refactor/smoke_visual.js
node refactor/visual_golden.js
```

Expected: every script exits 0; smoke has zero page/console errors; golden is still 17/17 with zero differing pixels.

- [ ] **Step 3: Verify state, mirrors and offline deployment**

```powershell
node refactor/verify_empty_state_contrast.js
node refactor/verify_mirror_sync.js
node refactor/verify_geno_deploy.js
git diff --check
```

Expected: all exit 0 and `git diff --check` prints nothing.

- [ ] **Step 4: Update the release checklist**

In `refactor/TEST_GATES.md`, record:

- the exact `verify_empty_state_contrast.js` command;
- 100% viewport `1280×800@1x` and 125% effective viewport `1024×640@1.25x`;
- token values and required ratios;
- empty-state pointer/history/storage/export invariants;
- screenshot paths;
- 17-image clinical golden requirement;
- mirror and offline deploy commands.

- [ ] **Step 5: Commit documentation and final gate evidence**

```powershell
git add refactor/TEST_GATES.md
git diff --cached --check
git commit -m "docs: add empty state and contrast release gates"
git status --short
```

Expected: commit succeeds and the working tree is clean.

---

## Completion Evidence

The implementation handoff must include:

- `verify_empty_state_contrast.js` pass counts for both display variants;
- computed token values and contrast ratios;
- pointer, modal, placement, clear, history/storage and export-isolation results;
- paths to both screenshots;
- 17-fixture golden output with `diffPixels=0`;
- mirror and offline deploy verification output;
- confirmation that Canvas clinical colors and relation style constants were untouched.
