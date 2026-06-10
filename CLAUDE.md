# 家系圖專案慣例

## 資料存取（Sprint 2 Phase A 後）

- **查找 Person 一律用 `this.personMap.get(id)`**。禁止新增
  `this.persons.find(p => p.id === ...)` 呼叫 — Sprint 2 已把 51 處
  改為 O(1) 查表。
- **對 `this.persons` 的任何增刪改**必須同步維護 `this.personMap`：
  - 單筆 `push` 後：`this.personMap.set(p.id, p)`
  - 批次覆寫（`= [...]`、`filter` 重建、`loadData`、`saveState` 復原、
    `clearAll`、快取 restore）：呼叫 `this._syncPersonMap()`
- **Canvas 層**不自建 personMap：`App.render()` 注入
  `this.canvas.personMap`，canvas 方法直接用 `this.personMap.get(id)`。
  外部直接呼叫 canvas.render 時會 fallback 重建以避免 ReferenceError。

## 親屬推論

- 查詢父母、子女、祖先、後代一律透過 `KinshipEngine`：
  App 內 `this.getKinshipEngine().getParentIds(id)` 等。
- `KinshipEngine` 僅信任 `parent-child` 關係的 `from→to` 方向
  （`from=parent, to=child`）。**不得**以 Y 座標推斷親屬方向。
- 舊資料方向由 `App.migrateRelationships()` 在載入時正規化。

## 三副本同步

根 `/`、`geno/`、`refactor/app/` 三份 js 副本必須 md5 一致。
主 Opus 負責每個 Sprint 結束時同步（`geno/`、`refactor/app/` 為 gitignored
本機副本）。

## 設計文件

- `refactor/REFACTOR_PLAN.md` — 原始重構計畫（風險 #1–#5）
- `refactor/TEST_GATES.md` — 上線前驗收清單
- `refactor/GENERATION_POLICY.md` — 輩分/座標語意規則
- `refactor/PERSONMAP_INDEX_DESIGN.md` — Sprint 2 Phase A personMap 設計
- `refactor/CANVAS_DESIGN_SPEC.md` — 未採用（使用者保留現有視覺）
- `refactor/benchmarks/` — FPS 基準測試工具

## 測試

- **邏輯層**（Node 直測 KinshipEngine）：Sprint 1 時 18/18 pass
- **UI 層**（Playwright headless）：Sprint 1 時 14/14 pass
- **視覺煙霧測試**：`NODE_PATH=<playwright所在node_modules> node refactor/smoke_visual.js`
  （載入頁面、建小家庭、驗證零 console error、輸出 refactor/smoke_*.png）
- **拖曳吸附回歸**：`node refactor/verify_drag.js`（16 項：等距/鏡像/對齊/
  父母中點吸附、輔助線清理、跨輩拖曳、history 合併）與
  `node refactor/verify_fixes.js`（12 項：標題對齊、blur 清理、1px 手震、
  lineCap 不洩漏、off-row Y 假對齊、zoom 標尺）— 同樣需要 NODE_PATH
- **同住框/生活圈回歸**：`node refactor/verify_hh_lc.js`（19 項：undo 語意、
  剛體拖框、狗骨頭限單列、巢狀框命中、ghost 清洗、邊界帶命中、
  z-order、屬性面板）
- **效能基準**：`PYTHONIOENCODING=utf-8 python refactor/benchmarks/fps_bench.py`
- **before/after 比對**：`python refactor/benchmarks/compare.py <old.json> <new.json>`

## 視覺基準（2026-06-10 更新）

原 2026-04-22 視覺凍結（commit `98e4891` 基準）已由使用者於
2026-06-10 解除，並完成全面視覺更新：

- **UI 設計系統**：以勵馨品牌桃紅 `#ed1261`（`--brand`）為主色；
  工具列圖示為內嵌 SVG（stroke=currentColor），不用 emoji。
- **Canvas**：人物淡性別底色見 `GenogramCanvas.GENDER_FILLS`；
  快速新增按鈕與關係編輯鉛筆為向量繪製（不用 emoji fillText）。
- **不可更動**：臨床符號語意（方=男、圓=女、三角=懷孕、圓頂方底=
  同性別、案主灰底、死亡 X、各關係線型/黑紅綠藍配色標準）。
- 背景網格僅由 `canvas.js drawGrid()` 繪製，CSS **不得**再疊網格。
- **拖曳吸附（2026-06-10 新增）**：`App.computeDragSnap()` 即時吸附
  （X：他人對齊/父母中點/同列等距〔成對延伸·正中、單鄰居 CELL_WIDTH、
  手足以父母中點鏡像〕；Y：輩分列與列上他人）；輔助線桃紅 `#ed1261`
  由 `canvas.drawAlignmentGuides()` 繪製，僅出現在 render()，不進匯出。
  放開時有 X 輔助線則保留精準 X；位移 <3px 視為點擊不重排。
- **三方圖例一致**：側欄 CSS 圖例 = `drawExportLegend` 匯出圖例 =
  `Relationship.getLineStyle()` 實際線條（顏色與虛線間距）。改線型時
  三處要一起動。
- **同住框/生活圈（2026-06-11 體檢後）**：
  - 生活圈在 `canvas.render()` 步驟 0.5「最底層」繪製（App.render 注入
    `lifeCirclesToDraw`），螢幕與匯出 z-order 一致；形狀用
    `buildSmoothClosedPath()`（Path2D，控制點夾制 45% 邊長防過衝），
    螢幕/匯出/點擊判定三處共用。
  - 生活圈點擊 = 「平滑邊界帶或頂點」（`isPointOnLifeCircleEdge`），
    圈內空白讓給同住框與畫布平移；pointerdown 順序：圈邊界 > 同住框。
  - 同住框狗骨頭膠囊僅限「單列成員」（Y 跨距 < 60），多列走凹包；
    整框拖曳放開 = 剛體平移（只吸附錨點）。
  - `getState()` 對 households/lifeCircles 必須深拷貝（拖曳 history 依賴）。
