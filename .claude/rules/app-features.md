---
paths:
  - "js/app*.js"
  - "js/extras/**"
  - "js/ui/**"
  - "js/relationship.js"
  - "js/person.js"
  - "js/storage.js"
---

# App 互動與功能規則

> 2026-11-10 從 CLAUDE.md 搬出。只在動到上述檔案時載入。

## 檔案分工

- `js/app.js` 保留 class、constructor、static、初始化與主要 DOM 綁定、render / requestRender、updateStatus、
  getState / saveState / loadData、getKinshipEngine，以及檔尾 DOMContentLoaded 啟動碼。
- App mixin：`app-pointer.js` 指標／鍵盤互動、`app-hittest.js` 命中判定、`app-quick-add.js` 快速新增與輩分、
  `app-property-panel.js` 屬性面板與標籤控制、`app-relationship-workflow.js` 關係流程、
  `app-snap-placement.js` 吸附與放置、`app-io.js` 儲存／載入／匯出／自動儲存／排列預覽。
  皆以 `Object.assign(GenogramApp.prototype, {...})` 掛回原型，在 `app.js` 之後同步載入，DOMContentLoaded 才建立 App。
- `js/ui/property-panel-templates.js` 屬性面板靜態模板（`PROPERTY_PANEL_TEMPLATES`），**必須在 app.js 之前載入**。
- **延伸功能**：`js/extras/genogram-extras.js` + `css/extras.css`（清單分頁、重大事件 `app.events`、畫面去識別化
  `viewOptions.deidentifyScreen`、隱藏暴力線 `showAbuseRelationships`、檢視模式、Word 匯出），排在所有 app mixin 之後載入。
  線條可見性一律走 `Relationship.isVisibleInView(type, view)`。回歸 `verify_extras.js`。
- Word 匯出程式庫在本機 `js/vendor/docx.iife.js`（docx 9.7.2 IIFE，MIT 授權寫在檔頭），按匯出時用 `<script>` 載入
  （file:// 不能用 import()），全程不連外。回歸 `verify_word_export.js`。

## 載入與存檔

- 舊資料方向由 `App.normalizeLoadedFamilyRelationships()` 在載入時正規化：`parent-child` 一律信任 `from→to`，
  只有舊版 `family` 型別（無方向資料）才以 Y 座標推斷。存檔 schema 版號 1.1（`storage.migrate` 對更新的版號會提醒）。
- `getState()` 對 households/lifeCircles 必須深拷貝（拖曳 history 依賴）。

## 互動

- **拖曳吸附**：`App.computeDragSnap()` 即時吸附（X：他人對齊/父母中點/同列等距〔成對延伸·正中、單鄰居 CELL_WIDTH、
  手足以父母中點鏡像〕；Y：輩分列與列上他人）。放開時有 X 輔助線則保留精準 X；位移 <3px 視為點擊不重排。
  回歸 `verify_drag.js`（等距/鏡像/對齊/父母中點吸附、輔助線清理、跨輩拖曳、history 合併）與
  `verify_fixes.js`（標題對齊、blur 清理、1px 手震、lineCap 不洩漏、off-row Y 假對齊、zoom 標尺）。
- **文字位置拉桿（成員／關係線文字／同住圈名稱共用）**：`getLabelEditTarget()`（app-property-panel）統一三種目標；
  關係文字位移存 `Relationship.labelOffset {x,y}`、同住圈名稱存 `household.labelOffset {x,y}`
  （一律換新物件，history 是淺拷貝）。回歸 `verify_text_label_move.js`。
- 生活圈點擊 = 「平滑邊界帶或頂點」（`isPointOnLifeCircleEdge`），圈內空白讓給同住框與畫布平移；
  pointerdown 順序：圈邊界 > 同住框。整框拖曳放開 = 剛體平移（只吸附錨點）。
- 下排快速鈕（兒子／女兒／懷孕）會依「提起」後的姓名／備註框自動下移（`getQuickButtonLayout`）。

## 空白畫布引導

- 引導卡 `#emptyState` 只在畫布完全空白且為選取工具時顯示。「先看一張範例」呼叫 `loadSampleFamily()`（app-io）：
  虛構三代 8 人，畫布已有成員時不動作，Ctrl+Z 一次回到空白。回歸 `verify_sample_family.js`。

## 功能語意（2026-10-13 新增）

- **重大事件**（extras 的「事件」分頁，原「記事」）：參考網站用法——「年份」「事件內容」兩欄＋「加入事件」，
  清單每筆「改／刪」（改＝帶回上方表單）；不再分類。事件卡標題「重大事件」、依年份排序、可拖曳。
- **前任關係** `ex-partner`：伴侶類，長虛線＋單斜線（與 engaged-separated 同外觀，但只有前任出現在圖例與按鈕）。
- **寵物** `gender: 'pet'` ＋ `petType`（diamond／cat／dog／bird／fish）：`petType` 只在寵物時寫入存檔；
  寵物沒有快速新增鈕、不能有伴侶類關係。
- **家人不能結婚**：`validateMarriageRelationship` → `coupleKinshipProblem(idA, idB, kinship)`（直系、手足、六親等內旁系，
  `collateralKinshipDegree`）；擋下時 `rejectMarriage` 跳提示。AI 助手用「套用整批後」的 KinshipEngine 呼叫同一函式。
