# Refactor Plan (Draft)

## 目標
- 提高資料正確性（尤其親子與伴侶語意）。
- 提高可維護性（降低 `app.js` / `canvas.js` 單檔複雜度）。
- 提高發布可控性（避免「已 push 但前端仍舊版」）。

## 目前主要風險
1. 親子方向語意混用（有時看 `from/to`，有時看 `Y`）。
2. PWA cache-first + 固定 cache 名稱，容易卡舊版。
3. 視圖儲存讀寫來源不一致（`app` vs `canvas`）。
4. render 流程大量 `find` 查找，資料變大會卡。
5. undo/redo 使用 JSON 深拷貝，長期擴充風險高。

## 目標架構（建議）
- `domain/`（純資料規則）
  - `relationship-engine`: 親子、伴侶、手足、祖先/後代判定。
  - `validation-engine`: 新增/修改關係是否合法。
- `layout/`
  - 專注座標與佈局，不負責改寫親屬語意。
- `render/`
  - `canvas-renderer`: 只做畫圖，不負責業務判斷。
- `app/`
  - 事件、狀態、UI 協調。

## 分階段重構

### Phase 1: 資料語意統一（優先）
- 規則：`parent-child` 一律 `from=parent`, `to=child`。
- UI 拖曳只能改座標，不得改變血緣方向。
- 所有關係判斷改用共用 helper，不再重複實作。

### Phase 2: 渲染性能優化
- 每次 render 建立 `personMap`、`relationshipMap`。
- 將 `O(n)` 的重複 `find` 改為 `O(1)` 查表。
- 針對大圖（>200 人）做基本效能檢查。

### Phase 3: 存檔與歷史重構
- undo/redo 改為結構化快照或差量記錄（command/event）。
- 視圖狀態統一由 `canvas` 單一來源管理。
- 檔案版本 migration 以明確版本號與遷移表管理。

### Phase 4: PWA 發布穩定化
- 啟用 manifest。
- cache 名稱版本化（或 hash）與更新通知機制。
- 至少對 `index.html` 採 network-first（避免入口卡舊版）。

## 不在本次重構範圍
- 新 UI 主題重設計。
- 新增後端服務。
- 大幅改變現有使用流程（快捷按鈕保留）。

## 完成定義（Definition of Done）
- `TEST_GATES.md` 全項目通過。
- 至少一次真實使用流程回歸測試（新增人員、加關係、匯出、載入、Undo/Redo）。
- 同步更新 README 的部署/更新說明。
