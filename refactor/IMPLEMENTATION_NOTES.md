# Refactor Implementation Notes

## 已完成（refactor/app）

1. 建立可執行副本
- 已將正式版必要檔案複製到 `refactor/app/`：
  - `index.html`
  - `manifest.json`
  - `icon-512.png`
  - `css/`
  - `js/`

2. 親屬規則模組化（Phase 1）
- 新增 `js/domain/kinship-engine.js`。
- 集中提供：
  - `hasParentChildLink`
  - `getParentIds`
  - `getChildrenIds`
  - `getAncestorIds`
  - `getDescendantIds`
  - `shareAnyParent`
  - `normalizeParentChild`

3. app.js 接入 KinshipEngine（關鍵流程）
- `validateMarriageRelationship` 改用共用引擎判斷親屬。
- `centerParentsAboveChildren` 父母收集改用 `normalizeParentChild`。
- `getParentIdsForChild` / `hasParentChildLink` 改由引擎提供。

4. 視圖狀態儲存修正
- `autoSave()` 改為從 `canvas` 讀取 `scale/offset`，避免 app/canvas 狀態不一致。

5. 載入順序
- `index.html` 已新增 `js/domain/kinship-engine.js` 並在 `app.js` 前載入。

## 尚未完成（下一步）
- 將更多親屬推論與關係檢查從 `app.js` 抽離。
- `canvas.js` 查找效能優化（personMap/relationshipMap）。
- undo/redo 快照策略優化。
- 完整對照 `refactor/TEST_GATES.md` 執行回歸測試。
