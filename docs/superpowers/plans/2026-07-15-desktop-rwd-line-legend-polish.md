# Desktop RWD、走線與圖例同步優化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不變更任何臨床符號、關係線顏色或線型語意的前提下，完成 1024–1920px 的桌機／筆電／平板橫向 RWD、家庭路徑冗餘點清理，以及側欄與匯出圖例的單一資料來源同步。

**Architecture:** `GenogramApp` 管理 Desktop 收合狀態與 Compact overlay 狀態；CSS 以 52px spacer 保留窄軌寬度，296px Inspector 以 absolute overlay 展開，因此開關 overlay 不改 Canvas layout width。`FamilyRoutePlanner.cleanPath()` 成為唯一的家庭路徑清理器。`Relationship.LEGEND_SECTIONS` 只保存分組、順序、文字、type 與既有 CSS class；實際線色、粗細、pattern、decoration 仍由 `Relationship.getLineStyle()`、`DASH_PATTERNS` 與既有 Canvas 畫法產生。

**Tech Stack:** Vanilla HTML/CSS/JavaScript、Canvas 2D、Playwright Node contracts、既有 `GenogramApp`、`GenogramCanvas`、`Relationship`、`FamilyRoutePlanner`、Golden image 與三副本同步工具。

## Global Constraints

- 不改人物符號、案主灰底、死亡 X、生育結果符號或任何臨床關係語意。
- 不改 `Relationship.getLineStyle()` 的 `color`、`width`、`pattern`、`decoration`。
- 不改 `DASH_PATTERNS`、wave／zigzag、箭頭、斜線、圓、房屋、X 等繪法。
- 不改現有 40×14px `.legend-line` SVG data URI。基線 SHA-256：`e5ea6c3faf6016d975b4948bb4093a03d16526d9d36bc2dc7b2926a60e1b9b88`。
- `getLineStyle()` 函式基線 SHA-256：`39965b588e39143742f8da07d6587cdcea00b0c97b24dc0b718a068d08eb65eb`。
- `DASH_PATTERNS` 基線 SHA-256：`0d4daad95281fa3eb9693cffffc38209574248f52a746b2f411c73349267f0ff`。
- 不做 1024px 以下的手機重排；根版面 `min-width: 1024px`，窄於 1024px 時允許水平捲動。
- Compact overlay 開關不得寫入 JSON、LocalStorage 圖面狀態或 Undo history。
- 家庭路徑端點、正交性與障礙物安全性不得退化；不得藉此移動人物。
- Person 查找維持 `this.personMap.get(id)`；不得新增 `this.persons.find(p => p.id === ...)`。
- 親屬方向只信任 `KinshipEngine` 與 `parent-child from→to`，不得以 Y 座標推論。
- 每個功能切片必須先觀察新測試 RED，再改 production code，再確認 GREEN。
- 每個 Sprint 結束同步根目錄、`geno/`、`refactor/app/`；root 與兩副本的 JS/CSS raw MD5 必須一致。
- Playwright 指令統一使用：

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
```

---

### Task 0: 建立隔離工作區並確認基線

**Files:**
- Test only: `refactor/verify_ui_shell.js`
- Test only: `refactor/verify_family_route_planner.js`
- Test only: `refactor/verify_family_routing.js`
- Test only: `refactor/verify_view_export.js`

**Interfaces:**
- Produces branch: `codex/desktop-rwd-line-legend-polish`。
- Produces worktree: `.worktrees/desktop-rwd-line-legend-polish`。

- [ ] **Step 1: 依 `using-git-worktrees` skill 建立隔離 worktree**

從已含核准規格與本計畫的 `codex/parent-pair-fixed-center` 建立新分支／worktree；不得重用已移除的 `view-controls-release-hardening` worktree。

- [ ] **Step 2: 確認新 worktree 乾淨且 HEAD 正確**

```powershell
git status --short --branch
git log -2 --oneline
```

Expected: 分支為 `codex/desktop-rwd-line-legend-polish`，沒有未追蹤或未提交 production 變更。

- [ ] **Step 3: 跑受影響範圍基線**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_ui_shell.js
node refactor/verify_family_route_planner.js
node refactor/verify_family_routing.js
node refactor/verify_view_export.js
node refactor/visual_golden.js
```

Expected: 現有 contracts 全綠、Golden 16/16；若基線不是綠燈，先停止並診斷，不能把既有失敗混入本功能。

---

### Task 1: 以 TDD 建立 1024–1180px Compact Inspector

**Files:**
- Modify: `refactor/verify_ui_shell.js:1-220`
- Modify: `index.html:206-236`
- Modify: `css/styles.css:1280-1320,1578-1665`
- Modify: `js/app.js:70-78,142-335,380-390,1635-1675`

**Interfaces:**
- Produces: `GenogramApp.isCompactInspector(): boolean`。
- Produces: `GenogramApp.setCompactInspectorOpen(open): boolean`。
- Produces: `GenogramApp.closeCompactInspectorOverlay(): boolean`。
- Produces: `GenogramApp.applyResponsiveInspector(matches): void`。
- Produces body classes: `inspector-compact`、`inspector-overlay-open`；`inspector-collapsed` 只代表 Desktop 收合。
- Produces DOM: `#inspectorRailSpacer`，只在 Compact layout 佔 52px。

- [ ] **Step 1: 先擴充 RWD contract**

在 `refactor/verify_ui_shell.js` 加入可重用量測：

```js
async function shellMetrics(page) {
    return page.evaluate(() => {
        const rect = selector => {
            const r = document.querySelector(selector)?.getBoundingClientRect();
            return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
                width: r.width, height: r.height } : null;
        };
        return {
            app: rect('.app-container'),
            bar: rect('#globalBar'),
            dock: rect('#canvasToolDock'),
            actions: rect('.global-actions'),
            canvas: rect('#canvasContainer'),
            inspector: rect('#inspectorPanel'),
            spacer: rect('#inspectorRailSpacer'),
            compact: document.body.classList.contains('inspector-compact'),
            overlay: document.body.classList.contains('inspector-overlay-open'),
            collapsed: document.body.classList.contains('inspector-collapsed'),
            documentNameVisible: Boolean(document.querySelector('.document-name')?.getClientRects().length),
            scrollWidth: document.documentElement.scrollWidth
        };
    });
}

function overlaps(a, b) {
    return a && b && a.left < b.right && a.right > b.left
        && a.top < b.bottom && a.bottom > b.top;
}
```

新增以下 assertions：

1. 1920px：非 Compact、Inspector 316px、dock 與 global actions 不碰撞。
2. 1366px：非 Compact、Inspector 296–336px、工具列單列。
3. 1181px：仍為 Desktop，不套 overlay。
4. 1180px：預設 `inspector-compact`、rail／spacer 均 52px、文件名稱隱藏。
5. 1024px：global bar 高度不因換行增加，dock 與 actions 不碰撞，可見 icon button 均至少 36×36px。
6. Compact 點 toggle 後 Inspector 為 296px；開啟前後 `#canvasContainer` width 相同。
7. Compact 再點 toggle、點 Canvas、按 Escape 都能關閉 overlay。
8. 若 `connectingFrom` 存在，第一次 Escape 先取消連線且 overlay 保持開啟，第二次 Escape 才關 overlay。
9. Desktop 手動收合 → 進 Compact → 回 1181px，Desktop 收合選擇仍存在。
10. 1023px 時 `.app-container` 實際寬度至少 1024px 且 `scrollWidth >= 1024`，沒有套用舊手機側欄滑出行為。

- [ ] **Step 2: 跑 UI shell 並確認 RED**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_ui_shell.js
```

Expected: exit 1，至少因 `#inspectorRailSpacer` 不存在、1180px 仍走舊 980px 規則、overlay class／方法不存在而失敗。

- [ ] **Step 3: 加入固定 52px 的 Compact rail spacer**

在 `index.html` 的 `#canvasContainer` 後、`#inspectorPanel` 前插入：

```html
<div class="inspector-rail-spacer" id="inspectorRailSpacer" aria-hidden="true"></div>
```

Spacer 在 Desktop `display:none`；Compact 時為 `flex: 0 0 52px`。Inspector 在 Compact 改為相對 `.main-content` 的 absolute right overlay，因此 panel 擴展不會改 flex layout。

- [ ] **Step 4: 整理斷點與 Compact CSS**

移除舊 `@media (max-width: 768px)` 中 `.side-panel { right:-100% }`／`.side-panel.open` 規則，加入：

```css
.app-container { min-width: 1024px; }
.main-content { position: relative; min-width: 0; }
.inspector-rail-spacer { display: none; }

@media (max-width: 1180px) {
    .document-context { display: none; }
    .global-actions .tool-label,
    .canvas-tool-dock .tool-label {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }
    .canvas-tool-dock { flex-wrap: nowrap; }
    .inspector-rail-spacer {
        display: block;
        flex: 0 0 52px;
        width: 52px;
        border-left: 1px solid var(--line-ui);
        background: var(--surface-panel);
    }
    body.inspector-compact .inspector-panel {
        position: absolute;
        z-index: 40;
        inset: 0 0 0 auto;
        width: 52px;
        overflow: hidden;
        box-shadow: none;
    }
    body.inspector-compact:not(.inspector-overlay-open) .inspector-header > div,
    body.inspector-compact:not(.inspector-overlay-open) .inspector-tabs,
    body.inspector-compact:not(.inspector-overlay-open) .inspector-tab-panel { display: none; }
    body.inspector-compact:not(.inspector-overlay-open) .inspector-header { padding: var(--space-2); }
    body.inspector-compact.inspector-overlay-open .inspector-panel {
        width: 296px;
        overflow-y: auto;
        box-shadow: -12px 0 32px rgba(23, 33, 43, .16);
    }
}
```

保留 `@media (max-width:1560px)` 的圖示模式；刪除已被 1180px 規則涵蓋的 1170／980 重複內容。`prefers-reduced-motion` 繼續關閉 panel width 動畫。

- [ ] **Step 5: 將 App 的 Desktop 與 Compact 狀態分離**

Constructor 改為：

```js
this.inspectorUserOverride = false;
this.inspectorDesktopCollapsed = false;
this.inspectorCompact = false;
this.inspectorOverlayOpen = false;
```

取代舊 980px `inspectorAutoCollapsed` 流程，新增：

```js
isCompactInspector() {
    return this.inspectorCompact === true;
}

updateInspectorToggle() {
    const expanded = this.isCompactInspector()
        ? this.inspectorOverlayOpen
        : !this.inspectorDesktopCollapsed;
    const action = expanded ? '收合檢視面板' : '展開檢視面板';
    this.elements.inspectorToggle.setAttribute('aria-expanded', String(expanded));
    this.elements.inspectorToggle.setAttribute('title', action);
    this.elements.inspectorToggle.setAttribute('aria-label', action);
}

setInspectorCollapsed(collapsed) {
    this.inspectorDesktopCollapsed = Boolean(collapsed);
    document.body.classList.toggle('inspector-collapsed',
        !this.isCompactInspector() && this.inspectorDesktopCollapsed);
    this.updateInspectorToggle();
    if (!this.isCompactInspector()) requestAnimationFrame(() => this.canvas.resize());
}

setCompactInspectorOpen(open) {
    if (!this.isCompactInspector()) return false;
    this.inspectorOverlayOpen = Boolean(open);
    document.body.classList.toggle('inspector-overlay-open', this.inspectorOverlayOpen);
    this.updateInspectorToggle();
    return true;
}

closeCompactInspectorOverlay() {
    if (!this.isCompactInspector() || !this.inspectorOverlayOpen) return false;
    this.setCompactInspectorOpen(false);
    return true;
}

applyResponsiveInspector(matches) {
    this.inspectorCompact = matches === true;
    document.body.classList.toggle('inspector-compact', this.inspectorCompact);
    document.body.classList.remove('inspector-overlay-open');
    this.inspectorOverlayOpen = false;
    document.body.classList.toggle('inspector-collapsed',
        !this.inspectorCompact && this.inspectorDesktopCollapsed);
    this.updateInspectorToggle();
    requestAnimationFrame(() => this.canvas.resize());
}
```

使用 `window.matchMedia('(max-width: 1180px)')`。若 `matchMedia` 或 `addEventListener` 不存在，保留 Desktop；不要建立 polyfill 或寫入 persisted state。

- [ ] **Step 6: 綁定 toggle、Canvas click 與 Escape 優先序**

Toggle click：Compact 只切 `setCompactInspectorOpen()`；Desktop 才記錄 `inspectorUserOverride` 並呼叫 `setInspectorCollapsed()`。

Canvas pointerdown wrapper 先關 overlay 再交給既有 handler：

```js
canvas.addEventListener('pointerdown', event => {
    this.closeCompactInspectorOverlay();
    this.handlePointerDown(event);
});
```

Escape 既有 placement／life-circle／relationship modal／connecting 分支不動；在 generic `else` 前插入：

```js
} else if (this.closeCompactInspectorOverlay()) {
    this.updateStatus('檢視面板已收合', 'info');
} else {
```

如此第一個 Escape 仍先取消較高優先互動，只有無較高優先狀態時才關 overlay。

- [ ] **Step 7: 跑 UI shell GREEN**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_ui_shell.js
```

Expected: 所有 1023／1024／1180／1181／1366／1920 assertions 通過，零 page／console error。

- [ ] **Step 8: 提交 RWD 切片**

```powershell
git add refactor/verify_ui_shell.js index.html css/styles.css js/app.js
git commit -m "feat: add compact desktop inspector layout"
```

---

### Task 2: 建立只讀圖例 metadata 並重畫側欄圖例

**Files:**
- Create: `refactor/verify_legend_consistency.js`
- Modify: `js/relationship.js:4-160`
- Modify: `js/app.js:138-335`
- Modify: `index.html:255-323`
- Modify: `css/styles.css:725-775`

**Interfaces:**
- Produces: `Relationship.LEGEND_SECTIONS: readonly section[]`。
- Produces: `Relationship.getLegendSections({ showEmotional = true } = {}): section[]`。
- Produces: `GenogramApp.renderRelationshipLegend(): void`。
- Section schema: `{ id, groupId, groupTitle, title, exportTitle, column, entries }`。
- Entry schema: `{ type, label, legendClass, linkType? }`；禁止 `color`、`width`、`pattern`、`decoration`。

- [ ] **Step 1: 新增會先失敗的圖例一致性 contract**

`refactor/verify_legend_consistency.js` 同時做 source hash 與瀏覽器 DOM 驗證。Hash extractor 先把 CRLF 正規化為 LF，再計算 SHA-256：

```js
const fs = require('fs');
const crypto = require('crypto');
const { openApp, createChecks, finish } = require('./contract_harness');

const hash = text => crypto.createHash('sha256')
    .update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
```

需固定檢查：

```js
check('40x14 legend SVG source is unchanged', legendCssHash ===
    'e5ea6c3faf6016d975b4948bb4093a03d16526d9d36bc2dc7b2926a60e1b9b88');
check('Relationship.getLineStyle is unchanged', lineStyleHash ===
    '39965b588e39143742f8da07d6587cdcea00b0c97b24dc0b718a068d08eb65eb');
check('DASH_PATTERNS is unchanged', dashHash ===
    '0d4daad95281fa3eb9693cffffc38209574248f52a746b2f411c73349267f0ff');
```

在 browser 中檢查 metadata 與 `#legendContent`：

- section 順序：`family`、`emotional-positive`、`emotional-negative`、`special`。
- 主群組順序：`family`、`emotional`、`special`。
- entry 數量：12、7、9、8，共 36。
- 36 個 `type／label／legendClass／linkType` 與目前側欄順序完全一致。
- metadata 任一層不得含 `color／width／pattern／decoration`。
- 每個 type 都是 `Relationship.TYPES` 已知值。
- DOM 的 `[data-legend-section]`／`[data-legend-type]` 順序與 metadata 完全一致。
- 每個 sample 同時具有 `legend-line` 與對應 `legendClass`。
- 側欄只有三個 `[data-legend-group]` 主群組；情感主群組內含正向／負向兩個 subheading。

- [ ] **Step 2: 跑新 contract 並確認 RED**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_legend_consistency.js
```

Expected: exit 1，因 `Relationship.LEGEND_SECTIONS`／`getLegendSections()` 不存在且側欄仍為四段靜態 HTML。

- [ ] **Step 3: 在 Relationship 新增深層凍結的 metadata**

建立 helper，凍結 section、entries 與每個 entry；資料順序如下：

```js
static LEGEND_SECTIONS = Relationship.freezeLegendSections([
    {
        id: 'family', groupId: 'family', groupTitle: '家庭與伴侶',
        title: '家庭與伴侶', exportTitle: '家庭與伴侶', column: 'left',
        entries: [
            { type: 'parent-child', linkType: 'biological', label: '親生子女', legendClass: 'parent-child' },
            { type: 'parent-child', linkType: 'adopted', label: '收養子女', legendClass: 'parent-child-adopted' },
            { type: 'parent-child', linkType: 'foster', label: '寄養子女', legendClass: 'parent-child-foster' },
            { type: 'married', label: '結婚', legendClass: 'married' },
            { type: 'engaged', label: '訂婚', legendClass: 'engaged' },
            { type: 'cohabiting', label: '同居', legendClass: 'cohabiting' },
            { type: 'legal-cohabiting', label: '法律同居', legendClass: 'legal-cohabiting' },
            { type: 'separated', label: '事實分居', legendClass: 'separated' },
            { type: 'legal-separated', label: '法律分居', legendClass: 'legal-separated' },
            { type: 'divorced', label: '離婚', legendClass: 'divorced' },
            { type: 'widowed', label: '喪偶', legendClass: 'widowed' },
            { type: 'affair', label: '外遇', legendClass: 'affair' }
        ]
    },
    {
        id: 'emotional-positive', groupId: 'emotional', groupTitle: '情感關係',
        title: '正向', exportTitle: '情感關係（正向）', column: 'left',
        entries: [
            ['harmony', '和諧'], ['love', '愛'], ['in-love', '熱戀'],
            ['close', '親密/友誼'], ['very-close', '非常親密'],
            ['admiration', '崇拜'], ['focused', '關注']
        ].map(([type, label]) => ({ type, label, legendClass: type }))
    },
    {
        id: 'emotional-negative', groupId: 'emotional', groupTitle: '情感關係',
        title: '負向', exportTitle: '情感關係（負向）', column: 'right',
        entries: [
            ['indifferent', '冷漠'], ['distant', '疏離'], ['cutoff', '斷絕'],
            ['conflict', '衝突'], ['hate', '仇恨'], ['hostile', '敵對'],
            ['distant-hostile', '遠距敵對'], ['close-hostile', '親密敵對'],
            ['conflict-close', '衝突又親密']
        ].map(([type, label]) => ({ type, label, legendClass: type }))
    },
    {
        id: 'special', groupId: 'special', groupTitle: '暴力與特殊關係',
        title: '暴力與特殊關係', exportTitle: '暴力與特殊關係', column: 'right',
        entries: [
            ['violence', '暴力'], ['abuse', '虐待'], ['physical-abuse', '身體虐待'],
            ['emotional-abuse', '情緒虐待'], ['sexual-abuse', '性虐待'],
            ['neglect', '忽視'], ['manipulative', '操控'], ['controlling', '控制']
        ].map(([type, label]) => ({ type, label, legendClass: type }))
    }
]);
```

`getLegendSections({showEmotional})` 只過濾 `groupId === 'emotional'`，不重排、不修改 frozen source。未知 type 由 consumer 忽略；正式 metadata 測試必須保證沒有未知 type。

- [ ] **Step 4: 將側欄靜態清單改為 metadata renderer**

`index.html` 僅保留：

```html
<div class="panel-content legend-content" id="legendContent"></div>
```

`GenogramApp.renderRelationshipLegend()` 使用 `document.createElement()` 建立三個 `.legend-group`，情感群組再建兩個 `.legend-subcategory`。每列：

```html
<div class="legend-item" data-legend-type="...">
    <span class="legend-line ..." aria-hidden="true"></span>
    <span class="legend-label">...</span>
</div>
```

不要用 metadata 建立關係 modal；modal 的按鈕、文字、功能維持原狀。`init()` 在 `waitForCurrentCanvasFonts(true)` 前呼叫 `renderRelationshipLegend()`，維持現有中文字型 warm-up 行為。

- [ ] **Step 5: 只調整圖例排版，不動 SVG block**

在 `/* 關係圖例線條樣式 */` marker 之前調整：

```css
.legend-content { display: grid; gap: 18px; padding: 14px 16px 18px; }
.legend-group { display: grid; gap: 8px; }
.legend-group-title { margin: 0; padding-bottom: 6px; border-bottom: 1px solid var(--line-ui); }
.legend-subcategory { display: grid; gap: 2px; }
.legend-subcategory-title { margin: 5px 0 2px; color: var(--ink-muted); font-size: 11px; }
.legend-item {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    align-items: center;
    column-gap: 12px;
    min-height: 30px;
    padding: 4px 6px;
}
.legend-item:hover { background: var(--surface-subtle); box-shadow: none; }
```

不得編輯 marker 之後、對話框 CSS marker 之前的 `.legend-line` SVG 規則。

- [ ] **Step 6: 跑圖例 contract 與 UI shell GREEN**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_legend_consistency.js
node refactor/verify_ui_shell.js
```

Expected: 36 entries、三主群組、三個 source hashes 全通過；Compact 296px 單欄圖例沒有水平溢出。

- [ ] **Step 7: 提交 metadata／側欄切片**

```powershell
git add refactor/verify_legend_consistency.js js/relationship.js js/app.js index.html css/styles.css
git commit -m "refactor: centralize relationship legend metadata"
```

---

### Task 3: 讓匯出圖例消費相同 metadata 與既有 style

**Files:**
- Modify: `refactor/verify_legend_consistency.js`
- Modify: `refactor/verify_view_export.js:1-160`
- Modify: `js/canvas.js:3147-3280,3360-3405`

**Interfaces:**
- Produces: `GenogramCanvas.getLegendRenderSections(viewOptions = {}): section[]`。
- Produces: `GenogramCanvas.getLegendRenderItem(entry): renderItem | null`。
- `renderItem` schema 延續 `drawLegendSection()`：`{ label, style, color, width, pattern, decoration }`。

- [ ] **Step 1: 先擴充 export／legend contract**

在 `verify_legend_consistency.js` spy `canvas.drawLegendSection()` 並呼叫 `drawExportLegend()`；檢查：

- export section `id／title／entry 順序` 來自 `Relationship.getLegendSections()`。
- `showEmotionalRelationships:false` 時只剩 `家庭與伴侶`、`暴力與特殊關係`。
- 每個 render item 的 `color／width／style／decoration` 等於對應 `new Relationship({type}).getLineStyle()`；parent-child 的 adopted／foster 只在 adapter 使用既有 dash 常數。
- metadata 本身仍沒有視覺 style 欄位。

更新 `verify_view_export.js` 舊預期：

```js
check('hidden emotional sections are removed from the export legend',
    JSON.stringify(result.legendTitles) ===
        JSON.stringify(['家庭與伴侶', '暴力與特殊關係']),
    JSON.stringify(result.legendTitles));
```

- [ ] **Step 2: 跑 contracts 並確認 RED**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_legend_consistency.js
node refactor/verify_view_export.js
```

Expected: exit 1，因 `drawExportLegend()` 仍使用 `legendDataLeft／legendDataRight` 硬編碼資料與舊標題。

- [ ] **Step 3: 新增唯一的 metadata→Canvas style adapter**

```js
getLegendRenderItem(entry) {
    if (!entry || !Object.values(Relationship.TYPES).includes(entry.type)) return null;
    const relationship = new Relationship({ type: entry.type, linkType: entry.linkType });
    const line = relationship.getLineStyle();
    let style = line.pattern;
    if (entry.type === 'parent-child' && entry.linkType === 'adopted') style = 'dashed';
    if (entry.type === 'parent-child' && entry.linkType === 'foster') style = 'dotted';
    const pattern = style === 'dashed' ? DASH_PATTERNS.engaged
        : style === 'dotted' ? DASH_PATTERNS.cohabit
        : DASH_PATTERNS.solid;
    return {
        label: entry.label,
        style,
        color: line.color,
        width: line.width,
        pattern,
        decoration: line.decoration
    };
}

getLegendRenderSections(viewOptions = {}) {
    const view = this.normalizeViewOptions(viewOptions);
    return Relationship.getLegendSections({
        showEmotional: view.showEmotionalRelationships
    }).map(section => ({
        ...section,
        title: section.exportTitle,
        items: section.entries.map(entry => this.getLegendRenderItem(entry)).filter(Boolean)
    }));
}
```

不要新增第二份 color／dash switch；所有 style 都必須從 `getLineStyle()` 與 `DASH_PATTERNS` 派生。

- [ ] **Step 4: 取代 drawExportLegend 的硬編碼資料**

刪除 `legendDataLeft`、`legendDataRight`，改為：

```js
const sections = this.getLegendRenderSections(viewOptions);
const leftSections = sections.filter(section => section.column === 'left');
const rightSections = sections.filter(section => section.column === 'right');
```

尺寸計算與 `drawLegendSection()` 以 `items.length` 進行；左欄依 `family → emotional-positive`、右欄依 `emotional-negative → special` 繪製。兩欄排版可保留，線 sample、pattern 與 decoration 畫法不改。

- [ ] **Step 5: 跑 export、圖例與 view contracts GREEN**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_legend_consistency.js
node refactor/verify_view_export.js
node refactor/verify_view_controls.js
```

Expected: section 同步、隱藏情感規則、style adapter 與三個 frozen hashes 全通過。

- [ ] **Step 6: 提交匯出圖例切片**

```powershell
git add refactor/verify_legend_consistency.js refactor/verify_view_export.js js/canvas.js
git commit -m "refactor: share relationship legend across exports"
```

---

### Task 4: 清理家庭路徑的重複與真正中間共線點

**Files:**
- Modify: `refactor/verify_family_route_planner.js:1-230`
- Modify: `refactor/verify_family_routing.js`
- Modify: `js/domain/family-route-planner.js:500-530`

**Interfaces:**
- Produces: `FamilyRoutePlanner.cleanPath(points): Array<{x,y}>`。
- Keeps: `FamilyRoutePlanner._dedupePoints(points)` 作為相容 wrapper，所有既有 planner caller 自動取得新清理結果。

- [ ] **Step 1: 先寫純函式失敗測試**

在 `verify_family_route_planner.js` 加入：

```js
check('cleanPath drops non-finite and consecutive duplicate points',
    samePoints(FamilyRoutePlanner.cleanPath([
        { x: 0, y: 0 }, { x: NaN, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 0 }
    ]), [{ x: 0, y: 0 }, { x: 20, y: 0 }]));

check('cleanPath removes horizontal and vertical middle points',
    samePoints(FamilyRoutePlanner.cleanPath([
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 },
        { x: 20, y: 10 }, { x: 20, y: 20 }
    ]), [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }]));

check('cleanPath preserves a collinear reversal waypoint',
    samePoints(FamilyRoutePlanner.cleanPath([
        { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 0 }
    ]), [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 0 }]));

check('cleanPath duplicates a single valid point fallback',
    samePoints(FamilyRoutePlanner.cleanPath([{ x: 4, y: 7 }]),
        [{ x: 4, y: 7 }, { x: 4, y: 7 }]));
```

再對所有 planner fixture 加 invariant：端點未變、所有 segment 水平或垂直、沒有可移除的「位於相鄰端點之間」共線點、所有座標有限。

- [ ] **Step 2: 跑 planner 並確認 RED**

```powershell
node refactor/verify_family_route_planner.js
```

Expected: exit 1，因 `FamilyRoutePlanner.cleanPath` 尚不存在，或既有 `_dedupePoints` 保留共線中間點。

- [ ] **Step 3: 實作保守的純路徑清理器**

```js
static cleanPath(points) {
    const finite = [];
    (points || []).forEach(point => {
        if (!this._finitePoint(point)) return;
        const next = { x: point.x, y: point.y };
        const previous = finite[finite.length - 1];
        if (!previous || Math.abs(previous.x - next.x) > 1e-9
            || Math.abs(previous.y - next.y) > 1e-9) finite.push(next);
    });

    const result = [];
    finite.forEach(point => {
        while (result.length >= 2) {
            const a = result[result.length - 2];
            const b = result[result.length - 1];
            const horizontal = Math.abs(a.y - b.y) <= 1e-9
                && Math.abs(b.y - point.y) <= 1e-9
                && b.x >= Math.min(a.x, point.x) - 1e-9
                && b.x <= Math.max(a.x, point.x) + 1e-9;
            const vertical = Math.abs(a.x - b.x) <= 1e-9
                && Math.abs(b.x - point.x) <= 1e-9
                && b.y >= Math.min(a.y, point.y) - 1e-9
                && b.y <= Math.max(a.y, point.y) + 1e-9;
            if (!horizontal && !vertical) break;
            result.pop();
        }
        result.push(point);
    });
    if (result.length === 1) result.push({ ...result[0] });
    return result;
}

static _dedupePoints(points) {
    return this.cleanPath(points);
}
```

「between」條件不可省略；否則會刪掉折返 waypoint，改變實際 route trace 與障礙物安全性。

- [ ] **Step 4: 跑 planner GREEN**

```powershell
node refactor/verify_family_route_planner.js
```

Expected: 新清理 cases 與既有所有 fixture 通過。

- [ ] **Step 5: 驗證畫面、hit、鉛筆與匯出仍共用同一路徑**

在 `verify_family_routing.js` 對 spy 到的 screen／hit-test／edit anchor／export family paths 套同一個 `assertCleanOrthogonalPath()`，並確認相同 family key 的 point array 完全一致。

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_family_routing.js
node refactor/verify_pencil.js
node refactor/verify_childlink.js
```

Expected: 路徑無冗餘、四個 consumer 點序一致，親生／收養／寄養線型不變。

- [ ] **Step 6: 提交路徑清理切片**

```powershell
git add refactor/verify_family_route_planner.js refactor/verify_family_routing.js js/domain/family-route-planner.js
git commit -m "refactor: remove redundant family route points"
```

---

### Task 5: 做四個寬度的瀏覽器視覺驗收

**Files:**
- Test only: `index.html`
- Test only: `css/styles.css`
- Test only: `js/app.js`

**Interfaces:**
- Produces temporary screenshots outside tracked source or under ignored `refactor/golden/current/`。
- Produces no production code unless視覺驗收找到可重現問題；若需修正，先為該問題補 contract。

- [ ] **Step 1: 依 `browser:control-in-app-browser` skill 開啟 worktree 的 index**

使用 local HTTP server，不用 `file://` 判斷 RWD。伺服器綁 localhost，載入 worktree 的 `index.html`。

- [ ] **Step 2: 逐一檢查 1920×1080、1366×768、1180×820、1024×768**

每個寬度檢查：

- global bar 單列、品牌、中央 dock、右側 actions 不互蓋；
- 1366／1920 是固定 Inspector；
- 1180／1024 預設只占 52px rail；
- 296px overlay 開啟時覆蓋 Canvas，但圖面沒有重新縮放／跳動；
- 圖例為三主群組、單欄、sample 與文字基線整齊；
- hover 只改列背景，線條圖示與顏色不變；
- 屬性／圖例／檢視 tab、keyboard roving tabindex 維持可用。

- [ ] **Step 3: 保存四張 shell screenshot 供核對**

命名：`rwd-1920.png`、`rwd-1366.png`、`rwd-1180.png`、`rwd-1024.png`。放在 ignored current／temp 路徑，不把臨時圖片 commit 進 production。

- [ ] **Step 4: 若看到問題，先補自動化重現再修正**

不得只靠手調 CSS。每個修正先加入 `verify_ui_shell.js` 或 `verify_legend_consistency.js` 的失敗 assertion，確認 RED→GREEN 後提交：

```powershell
git add refactor/verify_ui_shell.js refactor/verify_legend_consistency.js index.html css/styles.css js/app.js
git commit -m "fix: harden responsive legend layout"
```

若沒有 production 變更，不建立空 commit。

---

### Task 6: 同步三副本與更新發布 Gate

**Files:**
- Modify: `refactor/TEST_GATES.md:32-60`
- Sync: root JS/CSS → `refactor/app/`
- Sync: root JS/CSS → `geno/`
- Sync: root `index.html` → `refactor/app/index.html`
- Sync selectively: root `index.html` → `geno/index.html`，保留 geno 本地 vendor／字型路徑與離線宣告

**Interfaces:**
- Consumes all Tasks 1–5 contracts。
- Produces 22 支 `verify_*.js`（新增 `verify_legend_consistency.js`）的正式 gate。

- [ ] **Step 1: 同步 root、refactor/app、geno**

使用專案既有 mirror sync 流程。`geno/index.html` 不可整檔盲目覆蓋；套用相同 Inspector spacer／空圖例容器結構，但保留其本地依賴與離線能力。

- [ ] **Step 2: 跑 mirror 與離線部署測試**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_mirror_sync.js
node refactor/verify_geno_deploy.js
```

Expected: JS/CSS raw MD5 三方一致，root 與 `refactor/app` index 一致，geno 零外部 request 且 app 可用。

- [ ] **Step 3: 更新 TEST_GATES**

加入：

- `verify_ui_shell.js` 覆蓋 1023／1024／1180／1181／1366／1920 與 overlay 不 resize。
- `verify_legend_consistency.js` 覆蓋 metadata／側欄／匯出順序與三個 style hash。
- `verify_family_route_planner.js` 覆蓋非有限、重複、between-collinear、退化 fallback。
- `verify_family_routing.js` 鎖 screen／hit／pencil／export clean path 一致。
- 發布總數更新為 22 支 `verify_*.js`。

- [ ] **Step 4: 提交 mirror／gate 切片**

```powershell
git add refactor/TEST_GATES.md
git commit -m "chore: sync responsive legend release gates"
```

`geno/` 與 `refactor/app/` 是專案規定的 gitignored 本機副本：完成同步與測試即可，**不得**使用 `git add -f` 將它們納入版本控制。只 stage `TEST_GATES.md`；不得把 `golden/current`、diff 或 screenshot 暫存檔一起提交。

---

### Task 7: 完整驗證、Golden 與完成前審查

**Files:**
- Test only: all `refactor/verify_*.js`
- Test only: `refactor/smoke_visual.js`
- Test only: `refactor/visual_golden.js`
- Test only: worktree status and diff

**Interfaces:**
- Produces release evidence: 22/22 verify scripts、smoke OK、Golden 16/16、mirror／geno checks green。

- [ ] **Step 1: 跑全部 verify scripts，遇第一個失敗即停**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
$tests = Get-ChildItem refactor -Filter 'verify_*.js' | Sort-Object Name
foreach ($test in $tests) {
    node $test.FullName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

Expected: 22/22 exit 0。不要用 summary output 取代逐支 exit code。

- [ ] **Step 2: 跑 smoke 與 Golden**

```powershell
node refactor/smoke_visual.js
node refactor/visual_golden.js
```

Expected: `SMOKE OK`、零 console/page error、Golden 16/16。共線中間點清理不改 polyline trace，正常應為 0 pixel 差異；不得用 `--update` 掩蓋線色、線型或人物符號差異。

- [ ] **Step 3: 做 style freeze 與 personMap 靜態檢查**

```powershell
node refactor/verify_legend_consistency.js
rg -n "this\.persons\.find\(p\s*=>\s*p\.id" js refactor/app/js geno/js
```

Expected: hashes 全綠；`rg` 對禁用 Person lookup 沒有新增結果。

- [ ] **Step 4: 依 `verification-before-completion` skill 檢查 diff 與工作區**

```powershell
git diff --check
git status --short
git log --oneline --decorate -8
git diff codex/parent-pair-fixed-center...HEAD --stat
```

逐檔確認只包含核准範圍。工作區應乾淨；臨時 screenshot／current images 只能位於 ignored 路徑。

- [ ] **Step 5: 依 `requesting-code-review` skill 做完成前 review**

Review 必查：

- Compact overlay 是否真的不改 Canvas layout width；
- Escape 優先序是否沒有壓過 modal／placement／connect；
- metadata 是否偷帶任何 style 值；
- `getLineStyle()`、`DASH_PATTERNS`、40×14 SVG hashes 是否一致；
- cleanPath 是否保留折返 waypoint 與端點；
- geno 離線本地依賴是否仍可用。

有發現就先補測試與修正，再重跑 Steps 1–4。

- [ ] **Step 6: 完成分支交付**

依 `finishing-a-development-branch` skill 提供中文選項：安全合併回 `codex/parent-pair-fixed-center`、推送／PR、保留分支或捨棄。未經使用者選擇，不自行 push 或建立 PR。

## Definition of Done

- 1024–1180px 預設 52px rail，296px overlay 開關不改 Canvas width。
- 1181–1920px 沿用固定 Inspector 與使用者手動收合選擇。
- 1023px 以下沒有手機重排，應用維持 1024px 最小寬度。
- 側欄與匯出使用同一份 36-entry metadata，呈現三主群組；隱藏情感時仍保留暴力與特殊關係。
- 家庭路徑無非有限座標、連續重複點或可安全移除的 between-collinear 中間點。
- Screen／hit-test／鉛筆／所有視覺匯出共用相同 clean family path。
- `getLineStyle()`、`DASH_PATTERNS`、`.legend-line` SVG 三個 hash 完全不變。
- 22/22 verify、smoke、Golden 16/16、mirror 與 geno offline gate 全綠，worktree 乾淨。
