---
paths:
  - "js/canvas*.js"
  - "js/domain/family-route-planner.js"
  - "js/layout.js"
---

# 畫布繪製與走線規則

> 2026-11-10 從 CLAUDE.md 搬出。只在動到上述檔案時載入。

## 檔案分工

- `js/canvas.js` 保留 class、constructor、static、render、人物與生活圈繪製、衍生幾何及 labelRoutingWarnings accessor。
- Canvas mixin：`canvas-marriage.js` 婚姻幾何、`canvas-decorations.js` 線型裝飾、`canvas-family.js` 家庭線規劃與繪製、
  `canvas-household.js` 同住框與輪廓 helper、`canvas-export.js` 匯出。皆以 `Object.assign(GenogramCanvas.prototype, {...})` 掛回原型。
  marching squares 等 static 方法仍留在 `canvas.js`。
- **Canvas 層**不自建 personMap：`App.render()` 注入 `this.canvas.personMap`，canvas 方法直接用 `this.personMap.get(id)`。
  外部直接呼叫 canvas.render 時會 fallback 重建以避免 ReferenceError。
- `js/layout.js` 自動排列引擎：2026-09-03 起為自家分層佈局（Sugiyama-lite），**不依賴 dagre**。
  語意：配偶同列相鄰、同一父母子女同列、手足長→幼、多婚依婚期、獨立人物不動。回歸：`verify_auto_layout.js`。
  婚姻線橫桿距離 `Relationship.routeLift`（R-1）。

## 家庭線固定走法（2026-10-27，使用者看過 DEMO 後選定，仿網路版）

`FamilyRoutePlanner._planNormal` 不再搜尋／避讓／側邊車道／分開走。下垂點固定在婚姻線中點（`canvas._getFamilySource`；
只有符號壓在婚姻線上的其他人才改到最近空位），橫桿高度只看父母那一列（父母 y + `canvas.generationGap`
〔App.render 注入 GRID.CELL_HEIGHT〕− 半徑 − 16，父母姓名較長再往下），子女被拖到更高才上移。擋到別人只回報
`safe=false`／`collisions`，不改線、拖曳放開也**不再自動挪人**（已移除 `findSafeFamilyRouteAdjustment`）。
回歸 `verify_family_route_planner.js`、`verify_family_routing.js`、`verify_drag.js` 第 8 項。

**記號不讓（2026-11-13，使用者回報「子女線變成沒有直線」，看過 A 記號右挪／B 線穿過記號／C 子女線讓開 三種對照後選 B）**：
線上記號（離婚斜線、喪偶 ×…）留在婚姻線中點，下垂點**不**避開記號，子女線直接穿過；不要再改回避讓或把記號挪開。
回歸 `verify_family_routing.js`（divorce slash stays at the midpoint）。

**穿人提示圈（2026-11-10）**：子女線穿過別人的「符號」時，`drawFamilyCollisionHints()` 在那個人外圍畫桃紅虛線圈
（只在 `render()`，不進匯出；`canvas.showRouteHints = false` 可關）。只看符號，文字壓線不提示——編輯器不顯示文字警告是既有決定。
回歸 `verify_route_hint.js`。

## 畫布外觀

- 人物淡性別底色見 `GenogramCanvas.GENDER_FILLS`；快速新增按鈕與關係編輯鉛筆為向量繪製（不用 emoji fillText）。
- 背景網格僅由 `canvas.js drawGrid()` 繪製，CSS **不得**再疊網格。
- 輔助線桃紅 `#ed1261` 由 `canvas.drawAlignmentGuides()` 繪製，僅出現在 render()，不進匯出。
- **畫面／匯出去識別化**一律用 `canvas.displayOverride`（只換畫字內容），**不可**換人物複本或改 showNotes，否則繞線會跑掉。
- **寵物外形**在 `GenogramCanvas.PET_SHAPES`（SVG path，-50..50），螢幕／匯出／選取外框／醫療裁切與彈窗圖示共用。
- **關係線提起／放下**（`GenogramCanvas.REL_FX`、`relFx`、`_relWidthBoost`）：只套用伴侶類與情感類；選取時延後到淡化層之上
  加粗＋影子重畫，兩端成員補畫；匯出不套用。回歸 `verify_pets_relations.js`。
- 文字命中框於繪製時寫入 `canvas.textLabelBoxes`（文字位置拉桿用）。

## 文字清晰度（2026-10-13，使用者主管要求）

- 螢幕畫布不透明（`getContext('2d', {alpha:false})`，底色由 `clear()` 填 `--bg-canvas`）、文字基準點對齊整數裝置像素
  （`_installTextSnap`，只裝在螢幕 ctx）、畫布像素尺寸取整數且 CSS 尺寸 = 像素 ÷ dpr。
- 畫布文字：微軟正黑體 15px（Mac 退回 Noto Sans TC）；`GenogramCanvas.TEXT_STYLE`：姓名 600 `#1c1d21`、年齡 700 +2px、
  關係線文字 500 13px `#2b2d33`、備註維持 `#666`。介面字型不變。
- 試過把文字改成 DOM 疊層，未採用（已移除）。

## 同住框／生活圈

- 生活圈在 `canvas.render()` 步驟 0.5「最底層」繪製（App.render 注入 `lifeCirclesToDraw`），螢幕與匯出 z-order 一致；
  形狀用 `buildSmoothClosedPath()`（Path2D，控制點夾制 45% 邊長防過衝），螢幕／匯出／點擊判定三處共用。
- **生活圈（LC-4）**：`drawLifeCircleSet()` 兩道繪製（先填色後描邊）；名稱錨點 `getLifeCircleLabelAnchor(lc, persons, textW)`；
  平滑曲線幾何統一由 `_smoothControlPoints()` 供 `buildSmoothClosedPath` / `sampleSmoothClosedPath` 共用（改一處兩處同步）。
  回歸 `verify_lifecircle_style.js`。
- 同住框狗骨頭膠囊僅限「單列成員」（Y 跨距 < 60），多列走凹包。
- 回歸 `verify_hh_lc.js`（undo 語意、剛體拖框、狗骨頭限單列、巢狀框命中、ghost 清洗、邊界帶命中、z-order、屬性面板）。
