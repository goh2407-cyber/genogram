# 家系圖專案慣例

細節規則依檔案分開放在 `.claude/rules/`（動到相關檔案才載入）：
`canvas-drawing.md`（畫布、走線、排列）、`app-features.md`（互動、功能語意、存檔）。

## 版本與部署（2026-11-10 起）

- **程式只有根目錄一份**（`index.html`、`js/`、`css/`）。`geno/` 離線包與 `refactor/app/` 驗證副本已移除，不要再建立副本或同步腳本。
- 對外有兩個版本，都從根目錄來：
  - **公開版**：純 JavaScript、沒有 AI，GitHub repo `goh2407-cyber/genogram`（GitHub Pages）。
  - **內網 AI 版**：`internal/`（gitignored，另有私人 repo）加上根目錄程式，由 `node internal/build.js` 打包。
    改完公開程式要重跑 build，內部版才會是新的。公開 repo 不放 `internal/` 內容。

## 資料存取

- **查找 Person 一律用 `this.personMap.get(id)`**。禁止新增 `this.persons.find(p => p.id === ...)` 呼叫。
- **對 `this.persons` 的任何增刪改**必須同步維護 `this.personMap`：
  - 單筆 `push` 後：`this.personMap.set(p.id, p)`
  - 批次覆寫（`= [...]`、`filter` 重建、`loadData`、`saveState` 復原、`clearAll`、快取 restore）：呼叫 `this._syncPersonMap()`

## 親屬推論

- 查詢父母、子女、祖先、後代一律透過 `KinshipEngine`：App 內 `this.getKinshipEngine().getParentIds(id)` 等。
- `KinshipEngine` 僅信任 `parent-child` 關係的 `from→to` 方向（`from=parent, to=child`）。**不得**以 Y 座標推斷親屬方向。

## Script 載入順序

`index.html` 必須使用以下同步 script 順序（不用 bundler、不可 async/defer）；`verify_script_order.js` 檢查順序、語法與
mixin 無頂層副作用。extras 排在最後。

```text
jspdf → person → layout → relationship → domain/kinship-engine → domain/family-route-planner → history →
canvas → canvas-marriage → canvas-decorations → canvas-family → canvas-household → canvas-export →
storage → ui/modal-manager → ui/property-panel-templates →
app → app-pointer → app-hittest → app-quick-add → app-property-panel → app-relationship-workflow →
app-snap-placement → app-io → extras/genogram-extras
```

## 不可更動的視覺語意

- **臨床符號語意**：方=男、圓=女、三角=懷孕、圓頂方底=同性別、案主灰底、死亡 X、各關係線型／黑紅綠藍配色標準。
- **三方圖例一致**：側欄 CSS 圖例 = `drawExportLegend` 匯出圖例 = `Relationship.getLineStyle()` 實際線條（顏色與虛線間距）。
  改線型時三處要一起動。新增線型時 `verify_legend_consistency.js` 的凍結雜湊與數量要一起更新（先確認既有線型沒變）。
- **UI 設計系統**：以勵馨品牌桃紅 `#ed1261`（`--brand`）為主色；工具列圖示為內嵌 SVG（stroke=currentColor），不用 emoji。

## 測試

- **一鍵回歸**：`node refactor/run_all.js`（自動帶 NODE_PATH；`--quick` 略過 golden；後面接關鍵字只跑名稱相符的腳本）。
- 單支腳本：`NODE_PATH=$HOME/.cache/pw-smoke/node_modules node refactor/verify_xxx.js`。
- **視覺煙霧測試**：`refactor/smoke_visual.js`（載入頁面、建小家庭、驗證零 console error、輸出 refactor/smoke_*.png）。
- **效能基準**：`PYTHONIOENCODING=utf-8 python refactor/benchmarks/fps_bench.py`；
  before/after 比對 `python refactor/benchmarks/compare.py <old.json> <new.json>`。
- Golden 基準圖有差異時逐張人工檢視，禁止整批覆寫 baseline。

## 設計文件

- `refactor/TEST_GATES.md` — 上線前驗收清單
- `refactor/GENERATION_POLICY.md` — 輩分/座標語意規則
- `refactor/REFACTOR_PLAN.md`、`refactor/PERSONMAP_INDEX_DESIGN.md` — 早期重構與 personMap 設計紀錄
- `refactor/CANVAS_DESIGN_SPEC.md` — 未採用（使用者保留現有視覺）
