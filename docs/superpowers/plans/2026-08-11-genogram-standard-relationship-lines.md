# 標準家系圖婚姻線與文字避讓 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓自動家系圖關係線維持標準配偶水平線與中點子女掛接，並以整塊文字側移及有限上方橋接處理碰撞；底部下繞只保留給手動 `under`。

**Architecture:** `GenogramCanvas.getPersonLabelGeometry()` 擴充為唯一的 above/below/left/right label geometry source；`prepareDerivedGeometry()` 先決定衍生文字位置，再建立 canonical `getMarriageRoute()` cache。自動路由只在符號阻擋時評估有限上方 bridge candidates，候選評分同時讀人物／文字障礙、已存在婚姻線及預先推導的家庭線段；家庭規劃、畫面、命中、日期、bounds 與匯出都讀 canonical route 的 `points` 與 `attachmentSegment`。

**Tech Stack:** 原生 JavaScript、Canvas 2D、Playwright、Node.js contract scripts、`pngjs`、`pixelmatch`、Windows PowerShell 5.1。

## Global Constraints

- 不修改 Person 座標、資料 schema、history／Undo、臨床符號、顏色、線型或虛線間距。
- 不自動重排使用者已放置的人物。
- `routeMode="straight"` 保留現有直線／跨列正交幾何；只移動衍生 label placement。
- 自動候選是有界集合；排序鍵為文字碰撞、線交叉、轉折數、長度、候選名稱，不得使用隨機或無界搜尋。
- 路由障礙預設使用完整姓名／備註；文字安全邊距固定為 7 世界座標 px。
- 文字 placement、marriage route、family route cache 都是衍生資料，不得寫入 `getState()`、Person JSON 或匯出 schema。
- 根目錄、`geno/`、`refactor/app/` 的 `canvas.js` raw MD5 必須一致；LR5 未提交的 `refactor/visual_golden.js` 只可在 golden task 中處理。
- 每個 task 先寫 RED contract，再做單一最小實作，通過 focused gate 後才 commit。

---

### Task 1: 建立標準畫法的 RED contract

**Files:**
- Modify: `refactor/verify_label_routing.js`
- Modify: `refactor/verify_marriage_geom.js`
- Modify: `refactor/verify_family_routing.js`

**Interfaces:**
- Consumes: 目前 `canvas.getMarriageRoute()`, `canvas.getMarriageConfiguration()`, `canvas.getPersonLabelGeometry()` 與既有 `FamilyRoutePlanner` metrics。
- Produces: 兩個新 contract：標準無阻擋 auto route 必須是水平 side-port；中間人物阻擋的 auto route 不得選底部 under；family source 必須仍位於 canonical attachment segment。

- [ ] **Step 1: 在 `verify_label_routing.js` 加標準無阻擋 fixture。**

加入兩位同列、有姓名的 `standard-left`／`standard-right` 與 `routeMode:'auto'` 婚姻關係，收集：

```js
const standardRoute = canvas.getMarriageRoute(
    standardLeft, standardRight, standardRel, [standardRel]);
const standardLabelLeft = canvas.getPersonLabelGeometry(standardLeft,
    { showNames: true, showNotes: true });
const standardLabelRight = canvas.getPersonLabelGeometry(standardRight,
    { showNames: true, showNotes: true });
```

斷言 `candidateName === 'direct'`、route 只有兩個 side-port points、水平線 Y 相等、兩個 label bounds 不與 route segment 相交。

- [ ] **Step 2: 在 `verify_label_routing.js` 加中間人物阻擋 fixture。**

使用三個同列人物 `bridge-left`、`bridge-blocker`、`bridge-right`，只建立 left/right 的 auto 婚姻關係。斷言目前實作先呈現預期 RED：route 不得是 `under`／`inner`／`outer-left`／`outer-right`，且不得以兩端 bottom ports 作為 auto route 的第一／最後點；同時記錄 route points 與交叉計數供後續 GREEN 比對。

- [ ] **Step 3: 加 family attachment contract。**

在 `verify_family_routing.js` 的雙親家庭 fixture 中，取 `canvas.getMarriageRoute()` 的 `attachmentSegment`，斷言 `plan.sourcePath` 的起點位於該水平 segment 範圍內且 Y 完全相等；加一個橋接婚姻 fixture，斷言 family source 不回讀 `config.archBarY` 以外的舊推導。

- [ ] **Step 4: 跑 RED 並只記錄失敗。**

```powershell
$env:NODE_PATH = 'C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\goh2407\.agents\skills\playwright-skill\node_modules'
node refactor/verify_label_routing.js
node refactor/verify_marriage_geom.js
node refactor/verify_family_routing.js
```

Expected: 新增的標準／bridge assertions fail；既有 checks 不得因 fixture 污染而失敗。若既有 check 失敗，先修正 fixture 邊界，不修改 production code。

- [ ] **Step 5: Commit contract only。**

```powershell
git add refactor/verify_label_routing.js refactor/verify_marriage_geom.js refactor/verify_family_routing.js
git diff --cached --check
git commit -m "test: define standard relationship line geometry"
```

### Task 2: 擴充 label block 幾何與標籤 placement

**Files:**
- Modify: `js/canvas.js:746-812,3838-3906`
- Modify: `refactor/verify_label_routing.js`
- Mirror: `geno/js/canvas.js`, `refactor/app/js/canvas.js`

**Interfaces:**
- Consumes: existing `personLabelPlacements: Map<string, { side, offsetX, offsetY }>` and `getPersonLabelGeometry(person, options, placement)`.
- Produces: `side:'above'` geometry; `_labelPlacementCandidates(person)` returns `above`, `left`, `right`; `_placeLabelsForRelationshipRoutes(persons, relationships)` replaces forced-only placement while retaining `_placeLabelsForForcedStraight()` as a compatibility wrapper.

- [ ] **Step 1: Add RED assertions for above geometry and whole-block movement.**

在 label contract 建立含姓名及兩行備註的人物，直接呼叫：

```js
const above = canvas.getPersonLabelGeometry(person,
    { showNames: true, showNotes: true }, { side: 'above' });
const below = canvas.getPersonLabelGeometry(person,
    { showNames: true, showNotes: true }, { side: 'below' });
```

要求 `above.bounds.bottom < person.y - canvas.personSize / 2`、above 的 rows 順序仍是 name → notes、每行 X 相同；現況應以 `side:'above'` 未支援或 bounds 在符號下方失敗。

- [ ] **Step 2: Implement above geometry without changing Person data.**

在 `getPersonLabelGeometry()` 先量測所有 rows 的總高度；將 placement side 擴充為 `above`，並用以下規則計算起始 Y：

```js
const totalHeight = measured.reduce((sum, row) => sum + row.lineHeight, 0);
let cursorY = side === 'above'
    ? person.y - half - 8 - totalHeight + offsetY
    : person.y + half + 8 + offsetY;
```

`left`／`right` 維持目前 X 偏移與同一個 cursorY；`getPersonTextLayout()` 必須讀 geometry rows 的實際 Y，不可重新推算成 below。

- [ ] **Step 3: 將 placement candidate 與計畫器改為 route-aware。**

把 `_labelPlacementCandidates()` 改成固定順序 `above`, `left`, `right`；新增 `_placeLabelsForRelationshipRoutes()`，先以 default below bounds 建立 straight／explicit-under 的預覽 points，再對發生文字碰撞的端點評估候選：

```js
const collisions = routeHits + symbolHits + otherLabelHits;
return { ...candidate, order, collisions };
```

候選以 `collisions`、`order` 排序，勝者寫入 `personLabelPlacements`；若所有候選仍碰撞，保留 deterministic warning。原 `_placeLabelsForForcedStraight()` 改成呼叫新 helper，確保既有外部測試不失效。

- [ ] **Step 4: 在 `prepareDerivedGeometry()` 先呼叫新 helper。**

保留順序：清空衍生 caches → `_placeLabelsForRelationshipRoutes(allPersons, allRelationships)` → `_prepareMarriageRoutes(allPersons, allRelationships)`。`getPersonRouteObstacles()` 只能透過 `getPersonLabelGeometry()` 讀 placement map。

- [ ] **Step 5: 跑 focused GREEN。**

```powershell
node refactor/verify_label_routing.js
node refactor/verify_marriage_geom.js
```

Expected: above geometry、整塊 label placement、既有 forced-straight checks 全綠；bridge route assertions 仍可保持 RED，因為 Task 3 尚未完成。

- [ ] **Step 6: 同步 mirror 並 commit。**

```powershell
Copy-Item -LiteralPath 'js\canvas.js' -Destination 'geno\js\canvas.js' -Force
Copy-Item -LiteralPath 'js\canvas.js' -Destination 'refactor\app\js\canvas.js' -Force
node refactor/verify_mirror_sync.js
git add js/canvas.js refactor/verify_label_routing.js
git diff --cached --check
git commit -m "fix: place relationship labels as whole blocks"
```

### Task 3: 將 auto 阻擋路由改為標準上方橋接

**Files:**
- Modify: `js/canvas.js:1378-1684`
- Modify: `js/domain/family-route-planner.js`
- Modify: `refactor/verify_label_routing.js`
- Modify: `refactor/verify_marriage_geom.js`
- Mirror: `geno/js/canvas.js`, `geno/js/domain/family-route-planner.js`, `refactor/app/js/canvas.js`, `refactor/app/js/domain/family-route-planner.js`

**Interfaces:**
- Consumes: Task 2 label placements and `FamilyRoutePlanner.segmentIntersectsRect()`／polyline metrics。
- Produces: `_getFamilyOccupiedSegments(persons, relationships, excludedRelationshipId)` 回傳 `{ relationshipId, kind:'family', start, end }[]`；`_getBridgeMarriageCandidates(fromPerson, toPerson, bridgeYs)` 回傳有限候選；`_marriageCandidateScore(candidate, obstacles, occupiedSegments, fromPerson, toPerson, familySegments = [])` 維持前五個 tuple 欄位且把 family crossings 納入第二欄。

- [ ] **Step 1: 加 RED family-crossing assertion。**

在 bridge fixture 中建立一條會被上代親子主幹穿過的 naive top bridge，呼叫新介面（尚不存在時以 `typeof` assertion 失敗），要求選出的 auto route 不得以未標記的 family segment 交叉；此測試要與一般 `occupiedSegments` 交叉分開計數。

- [ ] **Step 2: Implement bounded family occupied segments。**

新增 `_getFamilyOccupiedSegments()`：用 `KinshipEngine.normalizeParentChild()` 將每一條 parent-child 關係轉成 parent bottom port → child top port 的有限 segment；同一 child 有兩位 parent 時另加入 parents X 範圍的 sibling bar segment。排除目前正在計算的 marriage relationship，不修改 FamilyRoutePlanner 的 persisted input。

- [ ] **Step 3: Implement local bridge candidates。**

新增 `_getBridgeMarriageCandidates()`。對同列左右端點先計算：

```js
const half = this.personSize / 2;
const baseY = Math.min(from.y, to.y) - half - 20;
const bridgeYs = [baseY, baseY - 30, baseY - 60];
```

每個 Y 產生一個 `bridge-near`／`bridge-middle`／`bridge-far` candidate，points 固定為
`from.getConnectionPoint('top') → {x:from.x,y:bridgeY} → {x:to.x,y:bridgeY} → to.getConnectionPoint('top')`；保留該水平段為 `attachmentSegment`，並用 `FamilyRoutePlanner.cleanPath()` 消除連續重點。候選名稱是排序 tuple 的最後欄；不得產生 bottom port 起點的 auto candidate。

- [ ] **Step 4: Change `getMarriageConfiguration()` mode semantics。**

保留 explicit `under` 的 `isArch:true`；將 auto 同列中間符號阻擋標記為 `needsBridge:true`／`isBridge:true`，不要再把它標成自動 under。`straight` 與 explicit `over` 的既有 points、routeMode 與 decoration 保持不變。

- [ ] **Step 5: Change `_prepareMarriageRoutes()` candidate set。**

採用固定分支：

```js
if (routeMode === 'straight') {
    geometry = this.getMarriageGeometry(from, to, config);
} else if (routeMode === 'under') {
    candidates = this._underMarriageCandidates(from, to, config.archBarY, obstacles);
} else if (routeMode === 'over' || config.needsBridge) {
    candidates = this._getBridgeMarriageCandidates(from, to, config.bridgeY);
} else {
    candidates = [{ name: 'direct', ...this.getMarriageGeometry(from, to, config) }];
}
```

對 auto bridge 只加入 bridge candidates；不得因文字 collision 自動加入 under。候選排序呼叫 extended `_marriageCandidateScore()`，若最低分仍有 collision，只加入單一 ephemeral warning，不改 route points。

- [ ] **Step 6: 跑 GREEN geometry gates。**

```powershell
node refactor/verify_label_routing.js
node refactor/verify_marriage_geom.js
node refactor/verify_family_routing.js
node refactor/verify_family_route_planner.js
```

Expected: standard direct、auto bridge、explicit under、family crossing、attachment segment、determinism 全綠；所有新 route 的 `candidateName` 與 points 必須在三次 force recompute 完全一致。

- [ ] **Step 7: 同步 mirror、檢查語法並 commit。**

```powershell
Copy-Item -LiteralPath 'js\canvas.js' -Destination 'geno\js\canvas.js' -Force
Copy-Item -LiteralPath 'js\canvas.js' -Destination 'refactor\app\js\canvas.js' -Force
Copy-Item -LiteralPath 'js\domain\family-route-planner.js' -Destination 'geno\js\domain\family-route-planner.js' -Force
Copy-Item -LiteralPath 'js\domain\family-route-planner.js' -Destination 'refactor\app\js\domain\family-route-planner.js' -Force
node --check js/canvas.js
node --check js/domain/family-route-planner.js
node refactor/verify_mirror_sync.js
git add js/canvas.js js/domain/family-route-planner.js refactor/verify_label_routing.js refactor/verify_marriage_geom.js refactor/verify_family_routing.js
git diff --cached --check
git commit -m "fix: keep auto relationship lines clinically standard"
```

### Task 4: 驗證螢幕、家庭線、匯出與編輯器模式

**Files:**
- Modify: `refactor/verify_view_export.js`
- Modify: `refactor/verify_view_rendering.js`
- Modify: `refactor/verify_relationship_edges.js`
- Modify: `refactor/verify_fixes.js` only if route-mode UI assertions need an exact label
- Modify: `refactor/TEST_GATES.md`

**Interfaces:**
- Consumes: canonical route and label APIs from Tasks 2–3。
- Produces: regression evidence that screen/export/hit/date/family source all consume the same standard route and that explicit `under` remains available only through the relationship editor.

- [ ] **Step 1: Add export identity assertions。**

在 view export contract 比較 export 前後的 `getMarriageRoute().points`、`attachmentSegment`、label placement map 與 family plan identities；PNG、JPEG、forced-throw 三條路徑都必須在 `finally` 還原完全相同的衍生 cache。

- [ ] **Step 2: Add mode-specific relationship edge assertions。**

驗證 `straight` points unchanged、`over` 只使用上方 bridge、`under` 才使用 bottom cardinal ports；auto obstacle route 必須沒有 `candidateName` 為 under，且 hit-test／edit pencil／date anchor 與 route points 完全相同。

- [ ] **Step 3: Run integration gates。**

```powershell
node refactor/verify_relationship_edges.js
node refactor/verify_view_export.js
node refactor/verify_view_rendering.js
node refactor/verify_fixes.js
node refactor/smoke_visual.js
```

Expected: all scripts exit 0，pageerror／console error 為 0；exported pixels 不包含 warning DOM。

- [ ] **Step 4: Document the gate row。**

在 `refactor/TEST_GATES.md` 加入標準 relationship routing row，列出 label、marriage、family、relationship edge、view export、visual golden、mirror 與 smoke commands；明確註記 auto 不使用底部 U，under 只由手動模式觸發。

- [ ] **Step 5: Commit integration contracts and gate docs。**

```powershell
git add refactor/verify_view_export.js refactor/verify_view_rendering.js refactor/verify_relationship_edges.js refactor/verify_fixes.js refactor/TEST_GATES.md
git diff --cached --check
git commit -m "test: cover standard relationship routing across views"
```

### Task 5: 更新示意 golden 並人工確認 15／16／17

**Files:**
- Modify: `refactor/visual_golden.js` (保留既有 LR5 fixture 17)
- Create: `refactor/golden/baseline/17-label-routing.png`
- Create only after visual approval: updated 15／16 baseline PNGs
- Modify: `refactor/TEST_GATES.md` if final command output wording changes

**Interfaces:**
- Consumes: canonical route behaviour and all integration gates。
- Produces: approved standard visual baselines without silently accepting changed pixels。

- [ ] **Step 1: Run comparison before update。**

```powershell
node refactor/visual_golden.js
```

Expected: 01–14 remain `diffPixels=0`; 15／16 show only the newly approved standard-line differences; 17 reports `NO-BASELINE`; no unresolved route warning appears in the canvas screenshot。

- [ ] **Step 2: Inspect actual output files。**

用 `view_image` 逐一檢查：

```text
refactor/golden/current/15-maximal.png
refactor/golden/current/16-multifamily.png
refactor/golden/current/17-label-routing.png
```

人工驗收只接受以下畫面：auto 不出現長底部 U；姓名／備註不被線穿過；家庭線掛在婚姻線的實際水平段；explicit under 只在 fixture 明確標記的關係出現。

- [ ] **Step 3: 只更新核准的 baseline。**

在使用者確認三張 current 圖後執行：

```powershell
node refactor/visual_golden.js --update
```

立即從 `current/` 複製並檢查 SHA-256；若 01–14 或非核准 fixture 發生改變，從 pre-update commit 恢復，不 stage 那些檔案。只 stage 17 以及使用者明確核准的 15／16。

- [ ] **Step 4: Run strict golden and performance。**

```powershell
node refactor/visual_golden.js
$env:PYTHONIOENCODING = 'utf-8'
python refactor/benchmarks/fps_bench.py
```

Expected: every baseline `diffPixels=0`，performance 仍在既有 threshold 內，且沒有 unbounded candidate search。

- [ ] **Step 5: Commit only approved golden changes。**

```powershell
git add refactor/visual_golden.js
git add -f refactor/golden/baseline/17-label-routing.png
git add -f refactor/golden/baseline/15-maximal.png refactor/golden/baseline/16-multifamily.png
git diff --cached --check
git commit -m "test: approve standard relationship line goldens"
```

### Task 6: Final release verification and handoff

**Files:**
- Verify only: all production JS/CSS mirrors, `refactor/TEST_GATES.md`, golden baselines。
- Modify: `.superpowers/sdd/progress.md` (ignored ledger only) with final evidence。

- [ ] **Step 1: Run full verification set。**

```powershell
$env:NODE_PATH = 'C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\goh2407\.agents\skills\playwright-skill\node_modules'
node refactor/verify_label_routing.js
node refactor/verify_marriage_geom.js
node refactor/verify_family_routing.js
node refactor/verify_family_route_planner.js
node refactor/verify_relationship_edges.js
node refactor/verify_view_export.js
node refactor/verify_view_rendering.js
node refactor/verify_hh_lc.js
node refactor/verify_drag.js
node refactor/verify_fixes.js
node refactor/smoke_visual.js
node refactor/verify_mirror_sync.js
node refactor/verify_geno_deploy.js
node refactor/visual_golden.js
```

Expected: every command exits 0, zero page／console errors, all golden `diffPixels=0`。

- [ ] **Step 2: Run syntax and whitespace checks。**

```powershell
node --check js/canvas.js
node --check js/domain/family-route-planner.js
git diff --check HEAD~6..HEAD
git status --short
```

Expected: syntax exits 0，diff check clean，只有使用者明確保留的工作樹變更；不自動 reset 或刪除它們。

- [ ] **Step 3: Record evidence and request final review。**

在 `.superpowers/sdd/progress.md` 記錄各 gate 的實際輸出、golden SHA-256、目前 approved screenshots 與任何 intentional warning；再請 reviewer 檢查 spec coverage、route cache identity、mirror MD5 與 persisted state isolation。

- [ ] **Step 4: Commit final docs only after all gates。**

```powershell
git add -f .superpowers/sdd/progress.md
git diff --cached --check
git commit -m "docs: record standard relationship routing release gates"
```

## Self-review

- Spec coverage: standard horizontal route／midpoint attachment（Tasks 1、3、4）、whole-block above/side placement（Task 2）、top bridge and family crossings（Task 3）、explicit under semantics（Tasks 1、3、4）、screen/export/hit determinism（Task 4）、manual golden approval（Task 5）均有對應 task。
- No production implementation is performed by this plan document；每一個 code change 都先有可重現 RED，再由 focused GREEN 驗證。
- Interface names are consistent: `getPersonLabelGeometry`, `_placeLabelsForRelationshipRoutes`, `_getFamilyOccupiedSegments`, `_getBridgeMarriageCandidates`, `getMarriageRoute`, `attachmentSegment`。
- Existing `refactor/visual_golden.js` LR5 fixture change remains outside the first four commits and is only staged in Task 5 after visual approval。
- No placeholder、TBD、TODO 或未定義的「適當處理」步驟。
