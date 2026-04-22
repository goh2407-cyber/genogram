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
- **效能基準**：`PYTHONIOENCODING=utf-8 python refactor/benchmarks/fps_bench.py`
- **before/after 比對**：`python refactor/benchmarks/compare.py <old.json> <new.json>`

## 視覺凍結（使用者決定 2026-04-22）

Canvas 畫圖（顏色、線寬、dash、halo、ring、網格等）與 DOM UI 介面
維持 Sprint 1 完成時的狀態（commit `98e4891`）。後續 Sprint **不** 觸動
視覺；僅做效能、資料正確性、架構優化。
