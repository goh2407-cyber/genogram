# Genogram Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 modal 點擊攔截、動態 DOM XSS、合法 `0` 值遺失，以及 modal／屬性編輯／Undo 的鍵盤責任。

**Architecture:** 新增無框架 `ModalManager`，集中管理 overlay、focus trap、Escape 與焦點還原；`GenogramApp` 保留流程清理責任。屬性面板維持現有欄位與事件，但所有個案資料只經 `textContent`、`value`、`checked` 與白名單屬性進 DOM。屬性編輯以 focus→blur 為一個 history transaction。

**Tech Stack:** 原生 JavaScript、HTML、CSS、Canvas、Playwright、Node.js contract scripts、Windows PowerShell 5.1。

## Global Constraints

- 執行順序固定為：modal pointer → DOM XSS → `0` 值 → modal／Undo 鍵盤。
- 不更動臨床符號、關係線型、顏色、虛線間距或親屬方向語意。
- Person 查找使用 `this.personMap.get(id)`；批次覆寫後呼叫 `_syncPersonMap()`。
- 根目錄、`geno/`、`refactor/app/` 的 JS／CSS 副本維持 raw MD5 一致。
- `geno/` 與 `refactor/app/` 是 gitignored 本機部署副本：每階段要複製並驗證，但不用 `git add -f` 強制納入 commit。
- 根目錄與 `refactor/app/index.html` raw MD5 一致；`geno/index.html` 保留本地 jsPDF、Dagre、字型與零外連。
- 動態個案資料不得進入 `innerHTML`、`outerHTML` 或 `insertAdjacentHTML`。
- 不新增 runtime dependency；Playwright 只用於既有 `refactor/verify_*.js`。
- 實作時先用 superpowers:test-driven-development，宣告完成前用 superpowers:verification-before-completion。

---

## File Map

- Create: `js/ui/modal-manager.js` — modal stack、pointer inert、焦點、Tab 與 Escape。
- Create: `refactor/verify_modal_flow.js` — overlay、backdrop、快速重開與焦點契約。
- Create: `refactor/verify_dom_security.js` — 多欄位 DOM XSS payload 契約。
- Create: `refactor/verify_zero_roundtrip.js` — constructor、JSON、File、LocalStorage、history、表單的 `0` 值往返。
- Create: `refactor/verify_modal_keyboard_history.js` — modal keyboard、原生文字 Undo 與 App history 合併。
- Modify: `index.html` — script 順序與五個 modal 的 ARIA／初始 hidden 狀態。
- Modify: `css/styles.css` — inactive overlay 永不接收 pointer。
- Modify: `js/app.js` — modal adapter、安全屬性面板、0 值表單、property edit session。
- Modify: `js/person.js` — nullish 預設。
- Modify: `refactor/TEST_GATES.md` — 新增四支發布閘門。
- Mirror: `geno/`、`refactor/app/` 對應 HTML／CSS／JS。

## Shared Test Environment

每個 Playwright step 先在 PowerShell 設定：

```powershell
$env:NODE_PATH = 'C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\goh2407\.agents\skills\playwright-skill\node_modules'
```

若 `node -e "require('playwright')"` 失敗，停止並回報 dependency gate；不要把測試標為通過。

---

### Task 1: Modal Pointer、ARIA 與單一開關入口

**Files:**
- Create: `js/ui/modal-manager.js`
- Create: `refactor/verify_modal_flow.js`
- Modify: `index.html:283-630,642-650`
- Modify: `css/styles.css:982-1019`
- Modify: `js/app.js:118-139,145-169,175-238,431-585,1994-2020,3361-3410,3736-3778,5336-5366`
- Mirror: `geno/js/ui/modal-manager.js`, `refactor/app/js/ui/modal-manager.js`, corresponding `app.js`, `styles.css`, and modal markup

**Interfaces:**
- Produces: `window.ModalManager`.
- Produces: `ModalManager.register(overlay, { requestClose, initialFocus })`.
- Produces: `open(overlay, trigger?)`, `close(overlay, { restoreFocus? })`, `closeAll()`, `hasOpenModal()`, `handleKeyDown(event)`.
- `GenogramApp.handleKeyDown()` consumes `modalManager.handleKeyDown(event)` before any application shortcut.

- [ ] **Step 1: Write the failing modal contract**

Create `refactor/verify_modal_flow.js`:

```js
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp({ width: 1200, height: 800 });
    const { failures, passes, check } = createChecks();
    const ids = ['genderModal', 'relationshipModal', 'childrenModal', 'helpModal', 'exportModal'];

    const initial = await page.evaluate(ids => ids.map(id => {
        const overlay = document.getElementById(id);
        const dialog = overlay?.querySelector('.modal');
        return {
            id,
            hidden: overlay?.hidden,
            inert: overlay?.inert,
            ariaHidden: overlay?.getAttribute('aria-hidden'),
            pointer: overlay ? getComputedStyle(overlay).pointerEvents : null,
            role: dialog?.getAttribute('role'),
            ariaModal: dialog?.getAttribute('aria-modal'),
            labelled: Boolean(dialog?.getAttribute('aria-labelledby')
                && document.getElementById(dialog.getAttribute('aria-labelledby')))
        };
    }), ids);
    check('all modal overlays start hidden, inert, aria-hidden and pointer transparent',
        initial.every(item => item.hidden && item.inert && item.ariaHidden === 'true'
            && item.pointer === 'none'), JSON.stringify(initial));
    check('all dialog surfaces expose role, aria-modal and labelledby',
        initial.every(item => item.role === 'dialog' && item.ariaModal === 'true' && item.labelled),
        JSON.stringify(initial));

    await page.focus('#addPerson');
    await page.click('#addPerson');
    const opened = await page.evaluate(() => {
        const overlay = document.getElementById('genderModal');
        return {
            active: overlay.classList.contains('active'), hidden: overlay.hidden,
            inert: overlay.inert, ariaHidden: overlay.getAttribute('aria-hidden'),
            pointer: getComputedStyle(overlay).pointerEvents,
            focusInside: overlay.contains(document.activeElement)
        };
    });
    check('open modal is active, exposed, interactive and owns focus',
        opened.active && !opened.hidden && !opened.inert && opened.ariaHidden === 'false'
            && opened.pointer === 'auto' && opened.focusInside, JSON.stringify(opened));

    await page.click('#cancelGender');
    await page.waitForTimeout(340);
    const closed = await page.evaluate(() => {
        const overlay = document.getElementById('genderModal');
        return {
            active: overlay.classList.contains('active'), hidden: overlay.hidden,
            inert: overlay.inert, pointer: getComputedStyle(overlay).pointerEvents,
            focusId: document.activeElement?.id
        };
    });
    check('close immediately disables pointer and eventually applies hidden',
        !closed.active && closed.hidden && closed.inert && closed.pointer === 'none',
        JSON.stringify(closed));
    check('close restores focus to the trigger', closed.focusId === 'addPerson', closed.focusId);

    await page.evaluate(() => {
        window.__modalCanvasDowns = 0;
        document.getElementById('genogramCanvas')
            .addEventListener('pointerdown', () => window.__modalCanvasDowns++);
    });
    const rect = await page.locator('#genogramCanvas').boundingBox();
    await page.mouse.click(rect.x + 24, rect.y + 80);
    check('closed overlay no longer blocks a real canvas click',
        await page.evaluate(() => window.__modalCanvasDowns === 1));

    await page.click('#helpBtn');
    await page.locator('#helpModal .modal').click({ position: { x: 20, y: 20 } });
    check('click inside dialog does not backdrop-close it',
        await page.locator('#helpModal').evaluate(node => node.classList.contains('active')));
    await page.locator('#helpModal').click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(340);
    check('click on the backdrop requests close',
        await page.locator('#helpModal').evaluate(node => node.hidden));

    const rapid = await page.evaluate(async () => {
        const app = window.app;
        app.showGenderModal('parent');
        app.closeGenderModal();
        app.showGenderModal('parent');
        await new Promise(resolve => setTimeout(resolve, 340));
        const overlay = document.getElementById('genderModal');
        const result = { active: overlay.classList.contains('active'), hidden: overlay.hidden,
            inert: overlay.inert, pointer: getComputedStyle(overlay).pointerEvents };
        app.closeGenderModal();
        return result;
    });
    check('stale close timer cannot hide a rapidly reopened modal',
        rapid.active && !rapid.hidden && !rapid.inert && rapid.pointer === 'auto', JSON.stringify(rapid));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL MODAL FLOW CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
```

- [ ] **Step 2: Run the contract and verify RED**

```powershell
node refactor/verify_modal_flow.js
```

Expected: FAIL because overlays are not `hidden`/`inert`, pointer-events is not `none`, ARIA dialog metadata is absent, and focus is not managed.

- [ ] **Step 3: Add the focused modal manager**

Create `js/ui/modal-manager.js` exactly as follows:

```js
class ModalManager {
    constructor({ transitionMs = 300 } = {}) {
        this.transitionMs = transitionMs;
        this.entries = new Map();
        this.stack = [];
        this.pendingHide = new Map();
    }

    register(overlay, { requestClose, initialFocus } = {}) {
        if (!overlay || this.entries.has(overlay)) return;
        const entry = {
            overlay,
            requestClose: typeof requestClose === 'function' ? requestClose : () => this.close(overlay),
            initialFocus: initialFocus || null,
            returnFocus: null
        };
        this.entries.set(overlay, entry);
        overlay.hidden = true;
        overlay.inert = true;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.addEventListener('pointerdown', event => {
            if (event.target === overlay && this.top() === overlay) entry.requestClose('backdrop');
        });
    }

    top() {
        return this.stack.length ? this.stack[this.stack.length - 1] : null;
    }

    hasOpenModal() {
        return this.stack.length > 0;
    }

    open(overlay, trigger = document.activeElement) {
        const entry = this.entries.get(overlay);
        if (!entry) throw new Error('Modal must be registered before open()');
        this._cancelPendingHide(overlay);
        const oldTop = this.top();
        if (oldTop && oldTop !== overlay) {
            oldTop.inert = true;
            oldTop.setAttribute('aria-hidden', 'true');
        }
        this.stack = this.stack.filter(item => item !== overlay);
        this.stack.push(overlay);
        if (trigger instanceof HTMLElement && !trigger.closest('.modal-overlay')) {
            entry.returnFocus = trigger;
        }
        overlay.hidden = false;
        overlay.inert = false;
        overlay.setAttribute('aria-hidden', 'false');
        overlay.classList.add('active');
        overlay.style.zIndex = String(1000 + this.stack.length);
        requestAnimationFrame(() => {
            if (this.top() !== overlay) return;
            const preferred = typeof entry.initialFocus === 'string'
                ? overlay.querySelector(entry.initialFocus)
                : entry.initialFocus;
            (preferred || this._focusables(overlay)[0] || overlay.querySelector('.modal'))?.focus();
        });
    }

    close(overlay, { restoreFocus = true } = {}) {
        const entry = this.entries.get(overlay);
        if (!entry) return;
        overlay.classList.remove('active');
        overlay.inert = true;
        overlay.setAttribute('aria-hidden', 'true');
        this.stack = this.stack.filter(item => item !== overlay);
        const nextTop = this.top();
        if (nextTop) {
            nextTop.inert = false;
            nextTop.setAttribute('aria-hidden', 'false');
        }

        const finish = () => {
            this._cancelPendingHide(overlay);
            if (!overlay.classList.contains('active')) {
                overlay.hidden = true;
                overlay.style.removeProperty('z-index');
                entry.returnFocus = null;
            }
        };
        const onEnd = event => {
            if (event.target === overlay && event.propertyName === 'opacity') finish();
        };
        overlay.addEventListener('transitionend', onEnd);
        const timer = setTimeout(finish, this.transitionMs);
        this.pendingHide.set(overlay, { timer, onEnd });

        if (restoreFocus) {
            queueMicrotask(() => {
                const target = entry.returnFocus;
                if (target?.isConnected && !target.hidden && !target.closest('[inert]')) target.focus();
            });
        }
    }

    closeAll({ restoreFocus = false } = {}) {
        [...this.stack].reverse().forEach(overlay => this.close(overlay, { restoreFocus }));
    }

    handleKeyDown(event) {
        const overlay = this.top();
        if (!overlay) return false;
        const entry = this.entries.get(overlay);
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            entry.requestClose('escape');
            return true;
        }
        if (event.key === 'Tab') {
            this._trapTab(event, overlay);
            return true;
        }
        return true;
    }

    _focusables(overlay) {
        return [...overlay.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), '
            + 'textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )].filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
    }

    _trapTab(event, overlay) {
        const focusables = this._focusables(overlay);
        if (!focusables.length) {
            event.preventDefault();
            overlay.querySelector('.modal')?.focus();
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    _cancelPendingHide(overlay) {
        const pending = this.pendingHide.get(overlay);
        if (!pending) return;
        clearTimeout(pending.timer);
        overlay.removeEventListener('transitionend', pending.onEnd);
        this.pendingHide.delete(overlay);
    }
}

if (typeof window !== 'undefined') window.ModalManager = ModalManager;
```

- [ ] **Step 4: Add modal markup and CSS invariants**

Add `hidden inert aria-hidden="true"` to each overlay. Add `role="dialog" aria-modal="true" tabindex="-1"` to each direct `.modal`, then add the following exact `aria-labelledby` / title-ID pairs without changing the modal body:

| Overlay | `.modal` attribute | Existing `<h3>` attribute |
|---|---|---|
| `genderModal` | `aria-labelledby="genderModalTitle"` | `id="genderModalTitle"` |
| `relationshipModal` | `aria-labelledby="relationshipModalTitle"` | `id="relationshipModalTitle"` |
| `childrenModal` | `aria-labelledby="childrenModalTitle"` | `id="childrenModalTitle"` |
| `helpModal` | `aria-labelledby="helpModalTitle"` | `id="helpModalTitle"` |
| `exportModal` | `aria-labelledby="exportModalTitle"` | `id="exportModalTitle"` |

The gender modal opening tag becomes:

```html
<div class="modal-overlay" id="genderModal" hidden inert aria-hidden="true">
    <div class="modal" role="dialog" aria-modal="true"
        aria-labelledby="genderModalTitle" tabindex="-1">
        <h3 class="modal-title" id="genderModalTitle">選擇性別</h3>
    </div>
</div>
```

The snippet above shows the attributes only; retain the current `.modal-content` and `.modal-actions` nodes between the title and closing `.modal`. Add before `js/app.js` in all three HTML copies:

```html
<script src="js/ui/modal-manager.js"></script>
```

Add to `css/styles.css`:

```css
.modal-overlay {
    pointer-events: none;
}

.modal-overlay.active {
    pointer-events: auto;
}

.modal-overlay[hidden] {
    display: none;
}
```

- [ ] **Step 5: Route all App modal operations through the manager**

Initialize and register after `cacheElements()` and before event binding:

```js
this.modalManager = new ModalManager({ transitionMs: 300 });
this.setupModalManager();
```

Cache `exportModal` and `cancelExport`, then add:

```js
setupModalManager() {
    const registrations = [
        [this.elements.genderModal, () => this.closeGenderModal(), '.gender-btn'],
        [this.elements.relationshipModal, () => this.closeRelationshipModal(), '.rel-btn'],
        [this.elements.childrenModal, () => this.closeChildrenModal(), '#skipChildren'],
        [this.elements.helpModal, () => this.closeHelpModal(), '#closeHelp'],
        [this.elements.exportModal, () => this.closeExportModal(), '.export-option-btn']
    ];
    registrations.forEach(([overlay, requestClose, initialFocus]) =>
        this.modalManager.register(overlay, { requestClose, initialFocus }));
}

openHelpModal() {
    this.modalManager.open(this.elements.helpModal);
}

closeHelpModal() {
    this.modalManager.close(this.elements.helpModal);
}
```

Replace every modal `.classList.add('active')` with `this.modalManager.open(overlay)` and every `.classList.remove('active')` with `this.modalManager.close(overlay)`. `closeGenderModal()`, `closeRelationshipModal()`, and `closeChildrenModal()` retain their existing pending-state cleanup before calling `close()`.

At the start of `handleKeyDown(e)`:

```js
if (this.modalManager?.handleKeyDown(e)) return;
```

Bind help/export controls once in `setupEventListeners()`; remove listeners created inside `showExportModal()`:

```js
this.elements.helpBtn?.addEventListener('click', () => this.openHelpModal());
this.elements.closeHelpBtn?.addEventListener('click', () => this.closeHelpModal());
this.elements.cancelExport?.addEventListener('click', () => this.closeExportModal());
document.querySelectorAll('.export-option-btn').forEach(button => {
    button.addEventListener('click', () => {
        const format = button.dataset.format;
        this.closeExportModal();
        this.handleExportFormat(format);
    });
});
```

Do not edit the existing `handleExportFormat(format)` method; the one-time listeners above continue to call that method after closing the modal.

- [ ] **Step 6: Synchronize mirrors and verify GREEN**

Use mechanical copies for identical assets:

```powershell
Copy-Item -LiteralPath 'js\ui\modal-manager.js' -Destination 'geno\js\ui\modal-manager.js' -Force
Copy-Item -LiteralPath 'js\ui\modal-manager.js' -Destination 'refactor\app\js\ui\modal-manager.js' -Force
Copy-Item -LiteralPath 'js\app.js' -Destination 'geno\js\app.js' -Force
Copy-Item -LiteralPath 'js\app.js' -Destination 'refactor\app\js\app.js' -Force
Copy-Item -LiteralPath 'css\styles.css' -Destination 'geno\css\styles.css' -Force
Copy-Item -LiteralPath 'css\styles.css' -Destination 'refactor\app\css\styles.css' -Force
```

Apply the same modal ARIA/script patch to all three HTML files, preserving `geno` local vendor URLs.

```powershell
node refactor/verify_modal_flow.js
node refactor/verify_status_ux.js
node refactor/verify_ui_shell.js
node refactor/verify_mirror_sync.js
node refactor/verify_geno_deploy.js
```

Expected: modal flow prints `ALL MODAL FLOW CHECKS PASSED`; all existing checks exit 0.

- [ ] **Step 7: Commit Task 1**

```powershell
git add index.html css/styles.css js/app.js js/ui/modal-manager.js refactor/verify_modal_flow.js
git commit -m "fix: make modal state pointer-safe and accessible"
```

---

### Task 2: Remove Dynamic DOM XSS Sinks

**Files:**
- Create: `refactor/verify_dom_security.js`
- Modify: `js/app.js:2743-3058,3175-3343,3736-3767`
- Mirror: `geno/js/app.js`, `refactor/app/js/app.js`

**Interfaces:**
- Produces: `setPropertyPanelTemplate(templateKey)` accepting keys from a frozen static-template registry only.
- Produces: `createTwinSettingsElement(person): HTMLElement`.
- Preserves all current element IDs consumed by `setupPropertyFormEvents()`.

- [ ] **Step 1: Write the failing XSS contract**

Create `refactor/verify_dom_security.js`:

```js
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();
    const payload = '<img src=x onerror="window.__domXss=(window.__domXss||0)+1">';
    const result = await page.evaluate(payload => {
        window.__domXss = 0;
        const app = window.app;
        app.loadData({
            persons: [
                { id: 'x-a', x: 300, y: 240, name: payload, notes: payload, gender: 'male' },
                { id: 'x-b', x: 520, y: 240, name: payload, gender: 'female' }
            ],
            relationships: [{ id: 'x-rel', fromPersonId: 'x-a',
                toPersonId: 'x-b', type: 'married', date: payload }],
            households: [{ id: 'x-house', ids: ['x-a', 'x-b'], notes: payload }],
            lifeCircles: [{ id: 'x-circle', label: payload,
                color: GenogramApp.LIFE_CIRCLE_COLORS[0],
                points: [{ x: 200, y: 160 }, { x: 620, y: 160 }, { x: 620, y: 360 }] }]
        });
        const a = app.personMap.get('x-a');
        const b = app.personMap.get('x-b');

        const inspect = () => ({
            injected: app.elements.propertyContent.querySelectorAll('img,script,iframe,svg[onload]').length,
            text: app.elements.propertyContent.textContent,
            values: [...app.elements.propertyContent.querySelectorAll('input,textarea')].map(node => node.value)
        });
        app.selectPerson(a.id); const person = inspect();
        app.selectRelationship('x-rel'); const relationship = inspect();
        app.selectedRelationshipId = null; app.selectedHouseholdId = 'x-house';
        app.updatePropertyPanel(); const household = inspect();
        app.selectedHouseholdId = null; app.selectedLifeCircleId = 'x-circle';
        app.updatePropertyPanel(); const circle = inspect();
        app.pendingParents = [a.id, b.id];
        app.showChildrenModal([a, b]);
        const children = {
            injected: app.elements.childrenList.querySelectorAll('img,script,iframe').length,
            text: app.elements.childrenList.textContent
        };
        app.closeChildrenModal();
        const state = app.getState();
        const persisted = [
            state.persons[0].name, state.persons[0].notes,
            state.relationships[0].date, state.households[0].notes,
            state.lifeCircles[0].label
        ];
        return { person, relationship, household, circle, children,
            persisted, executed: window.__domXss };
    }, payload);

    for (const [name, view] of Object.entries(result)) {
        if (name === 'executed' || name === 'persisted') continue;
        check(`${name} renders payload as literal text/value`,
            view.injected === 0 && (view.text.includes(payload) || view.values?.includes(payload)),
            JSON.stringify(view));
    }
    check('raw payload survives state serialization as plain text',
        result.persisted.every(value => value === payload), JSON.stringify(result.persisted));
    check('no injected event handler executes', result.executed === 0, String(result.executed));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL DOM SECURITY CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node refactor/verify_dom_security.js
```

Expected: FAIL; person name, notes, relationship date, household member names, life-circle label, or child name creates an `<img>` and increments `window.__domXss`.

- [ ] **Step 3: Make property templates static and assign data through DOM properties**

Move the current relationship, household, life-circle and person form structures into a file-scope frozen registry. Each registry value is a source-code literal; replace every case-data expression with an empty host carrying the same ID used by the event code. Add a key-only helper:

```js
const PROPERTY_PANEL_TEMPLATES = Object.freeze({
    empty: '<p class="empty-hint">點選成員、關係線或圈選框以編輯屬性</p>',
    relationship: `
        <div class="property-form">
            <div class="form-group">
                <label>關係類型</label>
                <div class="property-readonly"><strong id="relationshipTypeName"></strong></div>
                <small id="relationshipEndpoints" class="property-help"></small>
            </div>
            <div class="form-group">
                <label for="relationshipDate">時間/說明 (顯示於線上)</label>
                <textarea id="relationshipDate" rows="2" placeholder="例如：結婚 2010 (換行) 離婚 2020"></textarea>
            </div>
            <button class="btn-cancel property-delete" id="deleteRelationshipBtn">刪除此關係</button>
        </div>`
});

setPropertyPanelTemplate(templateKey) {
    const html = PROPERTY_PANEL_TEMPLATES[templateKey];
    if (typeof html !== 'string') throw new Error(`Unknown property template: ${templateKey}`);
    this.elements.propertyContent.innerHTML = html;
    return this.elements.propertyContent;
}
```

Add `household`, `lifeCircle`, and `person` registry entries by moving their current control markup verbatim and replacing data-bearing locations with these empty hosts:

| Key | Required value hosts | Required structural host |
|---|---|---|
| `household` | `#householdMemberCount`, `#householdMembers`, `#householdNotes` | `#deleteHouseholdBtn` |
| `lifeCircle` | `#lifeCircleLabel` | `#lifeCircleSwatches`, `#deleteLifeCircleBtn` |
| `person` | all current `#person*` and `#med*` fields | `#twinSettingsHost`, `#deletePersonBtn` |

The registry literals contain no `${...}` expressions. Calls use only the four literal keys plus `empty`; no caller may forward a runtime string.

For the relationship branch, use a static template and then assign:

```js
const root = this.setPropertyPanelTemplate('relationship');
root.querySelector('#relationshipTypeName').textContent = typeName;
root.querySelector('#relationshipEndpoints').textContent =
    `${fromPerson?.name || '未命名'} ↔ ${toPerson?.name || '未命名'}`;
root.querySelector('#relationshipDate').value = relationship.date || '';
```

For household and life-circle branches, use the same pattern:

```js
root.querySelector('#householdMembers').textContent = memberNames || '（無成員）';
root.querySelector('#householdNotes').value = household.notes || '';
root.querySelector('#lifeCircleLabel').value = lc.label || '';
```

Build swatches from the existing color whitelist only:

```js
const swatchHost = root.querySelector('#lifeCircleSwatches');
GenogramApp.LIFE_CIRCLE_COLORS.forEach(color => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lc-color-swatch';
    button.dataset.color = color;
    button.setAttribute('aria-label', `選擇生活圈顏色 ${color}`);
    button.style.background = color.replace(/,\s*[\d.]+\)/, ', 0.85)');
    button.classList.toggle('active', lc.color === color);
    swatchHost.appendChild(button);
});
```

For the person form, remove all data interpolation from the existing static controls, then assign exact values after insertion:

```js
const valueById = {
    personName: person.name || '',
    personAge: person.age ?? '',
    personNotes: person.notes || '',
    personGender: person.gender,
    personLossType: person.lossType || '',
    medLeftHalf: person.medical?.leftHalf || 'none',
    medBottomHalf: person.medical?.bottomHalf || 'none'
};
Object.entries(valueById).forEach(([id, value]) => {
    const field = root.querySelector(`#${id}`);
    if (field) field.value = value;
});
const checkedById = {
    personDeceased: Boolean(person.isDeceased),
    personIP: Boolean(person.isIdentifiedPatient),
    medSmoker: Boolean(person.medical?.isSmoker),
    medObese: Boolean(person.medical?.isObese),
    medLang: Boolean(person.medical?.hasLanguageProblem)
};
Object.entries(checkedById).forEach(([id, checked]) => {
    const field = root.querySelector(`#${id}`);
    if (field) field.checked = checked;
});
if (person.transgender !== 'mtf') {
    const option = document.createElement('option');
    option.value = 'pregnancy';
    option.textContent = '懷孕 / 性別未定 (三角形)';
    root.querySelector('#personGender').appendChild(option);
    root.querySelector('#personGender').value = person.gender;
}
```

- [ ] **Step 4: Replace the twin HTML builder with safe nodes**

Replace `generateTwinSettingsHTML()` with:

```js
createTwinSettingsElement(person) {
    const section = document.createElement('div');
    section.className = 'form-group twin-settings';
    const heading = document.createElement('h4');
    heading.textContent = '多胞胎設定';
    section.appendChild(heading);
    const siblings = this.getFullSiblings(person);
    if (!siblings.length) {
        const empty = document.createElement('div');
        empty.className = 'property-help';
        empty.textContent = '（尚無同父母的兄弟姊妹）';
        section.appendChild(empty);
        return section;
    }
    const help = document.createElement('div');
    help.className = 'property-help';
    help.textContent = '勾選與此人是多胞胎的兄弟姊妹：';
    section.appendChild(help);
    siblings.forEach(sibling => {
        const row = document.createElement('div');
        row.className = 'checkbox-group';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `twin_${sibling.id}`;
        input.dataset.siblingId = sibling.id;
        input.className = 'twin-checkbox';
        input.checked = Boolean(person.twinGroup && sibling.twinGroup === person.twinGroup);
        const label = document.createElement('label');
        label.htmlFor = input.id;
        const symbol = sibling.gender === 'male' ? '□' : sibling.gender === 'female' ? '○' : '◇';
        label.textContent = `${symbol} ${sibling.name || '(未命名)'}`;
        row.append(input, label);
        section.appendChild(row);
    });
    if (person.twinGroup) {
        const row = document.createElement('div');
        row.className = 'checkbox-group twin-zygosity-row';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = 'twin_zygosity_mono';
        input.className = 'twin-zygosity-checkbox';
        input.checked = person.zygosity === 'mono';
        const label = document.createElement('label');
        label.htmlFor = input.id;
        label.textContent = '同卵雙胞胎（加畫連接橫桿）';
        row.append(input, label);
        section.appendChild(row);
    }
    return section;
}
```

Append it with `root.querySelector('#twinSettingsHost').appendChild(this.createTwinSettingsElement(person))`.

- [ ] **Step 5: Make the child list safe**

Replace `option.innerHTML` in `showChildrenModal()`:

```js
const icon = document.createElement('span');
const safeGender = ['male', 'female', 'pregnancy', 'same'].includes(child.gender)
    ? child.gender : 'same';
icon.className = `child-icon ${safeGender}`;
const label = document.createElement('span');
label.textContent = child.name || (child.gender === 'male' ? '男性' : '女性');
option.replaceChildren(icon, label);
```

For the no-children state, create a `<p>` and set `textContent`; use `childrenList.replaceChildren()` to clear.

- [ ] **Step 6: Verify source and runtime GREEN**

```powershell
Copy-Item -LiteralPath 'js\app.js' -Destination 'geno\js\app.js' -Force
Copy-Item -LiteralPath 'js\app.js' -Destination 'refactor\app\js\app.js' -Force
node refactor/verify_dom_security.js
node refactor/verify_view_rendering.js
node refactor/verify_hh_lc.js
node refactor/verify_twins.js
node refactor/verify_mirror_sync.js
```

Then inspect remaining sinks:

```powershell
rg -n "\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=" js\app.js
```

Expected: any remaining `innerHTML` assignment contains only a fixed source literal and is documented immediately above as `// Trusted static template: no case data`. Runtime XSS test and regressions exit 0.

- [ ] **Step 7: Commit Task 2**

```powershell
git add js/app.js refactor/verify_dom_security.js
git commit -m "fix: render case data through safe DOM sinks"
```

---

### Task 3: Preserve Legal Zero Values Through Every Data Path

**Files:**
- Create: `refactor/verify_zero_roundtrip.js`
- Modify: `js/person.js:9-45`
- Modify: `js/app.js:2967-2977,3192-3197`
- Mirror: corresponding `person.js` and `app.js`

**Interfaces:**
- `Person.age`: `number|null`, where `0` is valid.
- `Person.x`, `Person.y`: number; default to `100` only for `null`/`undefined`.
- Age form: empty string → `null`; `"0"` → `0`.

- [ ] **Step 1: Write the failing zero round-trip contract**

Create `refactor/verify_zero_roundtrip.js`:

```js
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();
    const result = await page.evaluate(async () => {
        const input = { id: 'zero', name: '新生兒', gender: 'male', age: 0, x: 0, y: 0 };
        const direct = new Person(input);
        const roundTrip = Person.fromJSON(direct.toJSON());
        const clone = direct.clone();

        const storage = new StorageManager();
        storage.clearAutoSave();
        storage.autoSave([direct], [], [], []);
        const local = storage.loadAutoSave().persons[0];
        const file = new File([JSON.stringify({ version: '1.0', persons: [input],
            relationships: [], households: [], lifeCircles: [] })], 'zero.json',
            { type: 'application/json' });
        const fromFile = (await storage.loadFromFile(file)).persons[0];

        const history = new HistoryManager();
        history.pushState({ persons: [direct.toJSON()], relationships: [], households: [], lifeCircles: [] });
        const restoredState = history.undo({ persons: [{ ...direct.toJSON(), age: 1, x: 1, y: 1 }],
            relationships: [], households: [], lifeCircles: [] });
        const fromHistory = Person.fromJSON(restoredState.persons[0]);

        const app = window.app;
        app.loadData({ persons: [input], relationships: [], households: [], lifeCircles: [] });
        app.selectPerson('zero');
        const fieldValue = document.getElementById('personAge').value;
        document.getElementById('personAge').value = '0';
        document.getElementById('personAge').dispatchEvent(new Event('input', { bubbles: true }));
        const appPerson = app.personMap.get('zero');
        return {
            values: [direct, roundTrip, clone, local, fromFile, fromHistory, appPerson]
                .map(person => ({ age: person.age, x: person.x, y: person.y })),
            fieldValue
        };
    });
    check('constructor, JSON, clone, localStorage, File, history and App preserve all zeroes',
        result.values.every(value => value.age === 0 && value.x === 0 && value.y === 0),
        JSON.stringify(result.values));
    check('age input displays numeric zero rather than an empty field', result.fieldValue === '0', result.fieldValue);
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL ZERO ROUNDTRIP CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node refactor/verify_zero_roundtrip.js
```

Expected: FAIL; current `Person` returns `age:null`, `x:100`, `y:100`, and the age input is empty.

- [ ] **Step 3: Apply nullish defaults and explicit age parsing**

In `Person`:

```js
this.age = data.age ?? null;
this.x = data.x ?? 100;
this.y = data.y ?? 100;
```

Do not change the empty-string or enum defaults in the same commit.

In the property form assignment:

```js
document.getElementById('personAge').value = person.age ?? '';
```

In the age input handler:

```js
const raw = e.target.value;
person.age = raw === '' ? null : Number(raw);
```

The HTML `min="0" max="150"` remains unchanged.

- [ ] **Step 4: Synchronize and verify GREEN**

```powershell
Copy-Item -LiteralPath 'js\person.js' -Destination 'geno\js\person.js' -Force
Copy-Item -LiteralPath 'js\person.js' -Destination 'refactor\app\js\person.js' -Force
Copy-Item -LiteralPath 'js\app.js' -Destination 'geno\js\app.js' -Force
Copy-Item -LiteralPath 'js\app.js' -Destination 'refactor\app\js\app.js' -Force
node refactor/verify_zero_roundtrip.js
node refactor/verify_roundtrip.js
node refactor/verify_fit_view.js
node refactor/verify_mirror_sync.js
```

Expected: zero contract prints `ALL ZERO ROUNDTRIP CHECKS PASSED`; existing round-trip and fit checks exit 0.

- [ ] **Step 5: Commit Task 3**

```powershell
git add js/person.js js/app.js refactor/verify_zero_roundtrip.js
git commit -m "fix: preserve zero-valued person fields"
```

---

### Task 4: Modal Keyboard Isolation and Atomic Property Undo

**Files:**
- Create: `refactor/verify_modal_keyboard_history.js`
- Modify: `js/app.js:123-139,1663-1770,2675-2697,2797-3058,3175-3343,5068-5129`
- Test: `refactor/verify_modal_flow.js`, `refactor/verify_drag.js`, `refactor/verify_hh_lc.js`, and property-related verify scripts
- Mirror: `geno/js/app.js`, `refactor/app/js/app.js`

**Interfaces:**
- Produces: `isEditableTarget(target): boolean`.
- Produces: `beginPropertyEditSession(field)`, `commitPropertyEditSession()`, `cancelPropertyEditSession()`.
- One focus→blur edit pushes exactly one pre-change `getState()` into history when state differs.

- [ ] **Step 1: Write the failing keyboard/history contract**

Create `refactor/verify_modal_keyboard_history.js`:

```js
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();
    await page.focus('#addPerson');
    await page.click('#addPerson');
    const modal = page.locator('#genderModal');
    const first = modal.locator('button:not([disabled])').first();
    const last = modal.locator('button:not([disabled])').last();
    await last.focus();
    await page.keyboard.press('Tab');
    check('Tab wraps within the top modal', await first.evaluate(node => node === document.activeElement));
    await first.focus();
    await page.keyboard.press('Shift+Tab');
    check('Shift+Tab wraps backward within the top modal', await last.evaluate(node => node === document.activeElement));
    await page.keyboard.press('Escape');
    check('Escape closes only the top modal', await modal.evaluate(node => !node.classList.contains('active')));
    check('Escape restores the modal trigger focus', await page.evaluate(() => document.activeElement?.id === 'addPerson'));

    const setup = await page.evaluate(() => {
        const app = window.app;
        app.history.clear();
        app.persons = [new Person({ id: 'edit', x: 300, y: 260, name: '原名', age: 0 })];
        app._syncPersonMap();
        app.relationships = []; app.households = []; app.lifeCircles = [];
        app.selectPerson('edit');
        return app.history.getUndoCount();
    });
    check('fixture starts with empty history', setup === 0, String(setup));

    const name = page.locator('#personName');
    await name.focus();
    await name.press('End');
    await page.keyboard.type('甲乙');
    const historyWhileTyping = await page.evaluate(() => window.app.history.getUndoCount());
    check('typing does not push one history entry per keystroke', historyWhileTyping === 0,
        String(historyWhileTyping));
    await page.keyboard.press('Control+z');
    check('Ctrl+Z in a text field stays native', await name.inputValue() === '原名');
    check('native text undo does not consume App history',
        await page.evaluate(() => window.app.history.getUndoCount() === 0));

    await page.keyboard.type('新名稱');
    await page.locator('#canvasContainer').click({ position: { x: 30, y: 80 } });
    const committed = await page.evaluate(() => ({
        name: window.app.personMap.get('edit').name,
        undo: window.app.history.getUndoCount()
    }));
    check('blur commits one property history transaction',
        committed.name === '原名新名稱' && committed.undo === 1, JSON.stringify(committed));
    await page.evaluate(() => window.app.undo());
    check('one App Undo restores the full field edit',
        await page.evaluate(() => window.app.personMap.get('edit').name === '原名'));

    await page.click('#personDeceased');
    check('a discrete checkbox change commits one App history entry',
        await page.evaluate(() => window.app.personMap.get('edit').isDeceased
            && window.app.history.getUndoCount() === 1));
    await page.evaluate(() => window.app.undo());
    check('one App Undo restores a discrete checkbox change',
        await page.evaluate(() => !window.app.personMap.get('edit').isDeceased));

    await page.click('#helpBtn');
    await page.keyboard.press('Delete');
    check('background delete shortcut is blocked while modal is open',
        await page.evaluate(() => window.app.persons.length === 1));
    const transientCleanup = await page.evaluate(() => {
        const app = window.app;
        app.dragGuides = { x: { pos: 300 } };
        app.canvas.dragGuides = app.dragGuides;
        app.undo();
        return {
            modalActive: document.getElementById('helpModal').classList.contains('active'),
            appGuides: app.dragGuides,
            canvasGuides: app.canvas.dragGuides
        };
    });
    check('programmatic Undo clears modal and stale drawing guides',
        !transientCleanup.modalActive && transientCleanup.appGuides === null
            && transientCleanup.canvasGuides === null,
        JSON.stringify(transientCleanup));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL MODAL KEYBOARD AND HISTORY CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
node refactor/verify_modal_keyboard_history.js
```

Expected: FAIL because focus is not trapped/restored and continuous text property changes are absent from App history.

- [ ] **Step 3: Add editable-target and property-session helpers**

Initialize `this.propertyEditSession = null` in the constructor. Add:

```js
isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.matches('textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]')) {
        return true;
    }
    if (target.matches('input')) {
        return !new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image',
            'radio', 'range', 'reset', 'submit']).has(target.type);
    }
    return Boolean(target.closest('[contenteditable="true"], [role="textbox"], [role="combobox"]'));
}

beginPropertyEditSession(field) {
    if (!field || this.propertyEditSession?.field === field) return;
    this.commitPropertyEditSession();
    this.propertyEditSession = {
        field,
        before: this.getState(),
        beforeSignature: JSON.stringify(this.getState())
    };
}

commitPropertyEditSession() {
    const session = this.propertyEditSession;
    this.propertyEditSession = null;
    if (!session) return false;
    const afterSignature = JSON.stringify(this.getState());
    if (afterSignature === session.beforeSignature) return false;
    this.history.pushState(session.before);
    this.updateToolbar();
    return true;
}

cancelPropertyEditSession() {
    this.propertyEditSession = null;
}

bindPropertyEdit(field, apply,
    { eventName = 'input', render = true, commitOnChange = false } = {}) {
    if (!field) return;
    field.addEventListener('focus', () => this.beginPropertyEditSession(field));
    field.addEventListener(eventName, event => {
        apply(event);
        if (render) this.render();
        this.autoSave();
        if (commitOnChange) this.commitPropertyEditSession();
    });
    field.addEventListener('blur', () => this.commitPropertyEditSession());
}
```

Avoid calling `getState()` twice by storing once in final implementation:

```js
const before = this.getState();
this.propertyEditSession = { field, before, beforeSignature: JSON.stringify(before) };
```

- [ ] **Step 4: Bind every editable property through the transaction helper**

Representative bindings:

```js
this.bindPropertyEdit(document.getElementById('personName'), event => {
    person.name = event.target.value;
});
this.bindPropertyEdit(document.getElementById('personAge'), event => {
    person.age = event.target.value === '' ? null : Number(event.target.value);
});
this.bindPropertyEdit(document.getElementById('personGender'), event => {
    person.gender = event.target.value;
}, { eventName: 'change', commitOnChange: true });
this.bindPropertyEdit(document.getElementById('personDeceased'), event => {
    person.isDeceased = event.target.checked;
}, { eventName: 'change', commitOnChange: true });
```

Apply the same helper to relationship date, household notes, life-circle label/color, person notes, loss type, IP, medical selects/checks, twin membership, and zygosity. Text/number/textarea fields commit on blur; selects, checkboxes, radio-like controls and color swatches use `commitOnChange:true`. Remove the corresponding pre-change `saveState()` calls and the duplicate `personNotes` input listener. Discrete delete/create operations keep their existing `saveState()` behavior.

Before `selectPerson()`, `selectRelationship()`, `updatePropertyPanel()` replacing an existing form, `undo()`, `redo()`, and `loadData()`, call `commitPropertyEditSession()` unless the operation is restoring history; `undo()`/`redo()` commit first, then close modal/interaction state and perform history traversal.

- [ ] **Step 5: Give modal the first keyboard priority**

Use this exact top of `handleKeyDown(e)`:

```js
if (this.modalManager?.handleKeyDown(e)) return;
if (this.isEditableTarget(e.target) || this.isEditableTarget(document.activeElement)) return;
```

Remove the old tag-name-only `isTyping` block. Delete the modal-specific branches from the later Escape switch because the manager now owns top-modal Escape. Keep placement, life-circle, connecting and compact inspector ordering for the no-modal case.

Add one transient-state reset helper:

```js
resetTransientStateForHistory() {
    this.modalManager?.closeAll({ restoreFocus: false });
    this.pendingGeneration = null;
    this.quickAddContext = null;
    this.pendingParents = null;
    this.selectedChildrenIds = [];
    this.cancelPlacement();
    this.cancelRelationshipWorkflow();
    this.isBoxSelecting = false;
    this.isDrawingLifeCircle = false;
    this.currentLifeCirclePoints = [];
    this.lifeCircleMousePos = null;
    this.dragGuides = null;
    if (this.canvas) {
        this.canvas.dragGuides = null;
        this.canvas.placementPreview = null;
        this.canvas.draggedPerson = null;
        this.canvas.draggedHousehold = null;
        this.canvas.draggedLifeCircle = null;
    }
}
```

At the start of programmatic `undo()` and `redo()`, call `commitPropertyEditSession()` and then `resetTransientStateForHistory()`. Remove their now-duplicate direct `cancelPlacement()` / `cancelRelationshipWorkflow()` calls, and keep the existing preview-cancellation and state-restoration order.

- [ ] **Step 6: Synchronize and verify GREEN**

```powershell
Copy-Item -LiteralPath 'js\app.js' -Destination 'geno\js\app.js' -Force
Copy-Item -LiteralPath 'js\app.js' -Destination 'refactor\app\js\app.js' -Force
node refactor/verify_modal_keyboard_history.js
node refactor/verify_modal_flow.js
node refactor/verify_drag.js
node refactor/verify_hh_lc.js
node refactor/verify_relationship_edges.js
node refactor/verify_mirror_sync.js
```

Expected: new keyboard/history contract passes; drag, household/life-circle, relationship and mirror regressions exit 0.

- [ ] **Step 7: Commit Task 4**

```powershell
git add js/app.js refactor/verify_modal_keyboard_history.js
git commit -m "fix: isolate modal keys and make property edits undoable"
```

---

### Task 5: Release-Hardening Gate and Documentation

**Files:**
- Modify: `refactor/TEST_GATES.md`
- Test only: all `refactor/verify_*.js`, `refactor/smoke_visual.js`, `refactor/visual_golden.js`

**Interfaces:**
- Produces four permanent gates: modal flow, DOM security, zero roundtrip, modal keyboard/history.
- Does not change product behavior.

- [ ] **Step 1: Record the exact gates**

Add a release-hardening section to `refactor/TEST_GATES.md` containing these commands and expected success banners:

```powershell
node refactor/verify_modal_flow.js
node refactor/verify_dom_security.js
node refactor/verify_zero_roundtrip.js
node refactor/verify_modal_keyboard_history.js
```

Document that a missing Playwright runtime is a blocked gate, not a pass.

- [ ] **Step 2: Run every verify script fresh**

```powershell
$scripts = Get-ChildItem -LiteralPath 'refactor' -File -Filter 'verify_*.js' | Sort-Object Name
$failed = @()
foreach ($script in $scripts) {
    node $script.FullName
    if ($LASTEXITCODE -ne 0) { $failed += $script.Name }
}
if ($failed.Count) { throw ('Failed: ' + ($failed -join ', ')) }
```

Expected: every script exits 0 and `$failed.Count` is 0.

- [ ] **Step 3: Run visual, mirror, and offline gates**

```powershell
node refactor/smoke_visual.js
node refactor/visual_golden.js
node refactor/verify_mirror_sync.js
node refactor/verify_geno_deploy.js
git diff --check
git status --short
```

Expected: smoke succeeds with zero console error; golden reports all 16 fixtures `diffPixels=0`; mirror and geno deployment pass. `git status` contains only the planned test-gate documentation before commit.

- [ ] **Step 4: Commit Task 5**

```powershell
git add -f refactor/TEST_GATES.md
git commit -m "docs: add release hardening gates"
```

## Completion Evidence

Record each item and its command output in the implementation handoff:

- Hidden modal pointer-events is `none` immediately and `hidden` after transition.
- All five modal types have ARIA, focus trap, Escape and focus restoration.
- Runtime case data enters DOM only through safe text/value properties.
- `age:0`, `x:0`, `y:0` pass every persistence path.
- Text editing uses native Ctrl/Cmd+Z while focused; a completed field edit is one App Undo.
- Full verify, smoke, 16 golden, mirror, offline and diff checks pass.
