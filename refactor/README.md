# Genogram Refactor Folder

這個資料夾用來放「重構方案與測試門檻」，目標是先完成驗證，再決定是否上線。

## 原則
- 正式版程式碼（`js/`, `css/`, `index.html`）不因本資料夾內容而直接改動。
- 任何重構實作都要先通過本資料夾定義的測試 Gate。
- 只有在驗證結果穩定後，才可安排上線。

## 文件說明
- `REFACTOR_PLAN.md`: 重構目標、架構拆分、分階段執行順序。
- `TEST_GATES.md`: 上線前的功能/相容性/效能驗收清單。
- `GENERATION_POLICY.md`: 輩分在系統中的角色與建議規則。

## 建議流程
1. 先閱讀 `REFACTOR_PLAN.md` 並確認範圍。
2. 逐步實作重構（在新分支驗證）。
3. 依 `TEST_GATES.md` 全部勾選通過。
4. 通過後再安排合併與上線。

## 一鍵回歸（2026-09 新增）

```bash
# 全部回歸（所有 verify_*.js + smoke + golden），自動帶 NODE_PATH=~/.cache/pw-smoke/node_modules
node refactor/run_all.js
node refactor/run_all.js --quick          # 略過 golden
node refactor/run_all.js drag pencil      # 只跑名稱含關鍵字的腳本
node refactor/run_all.js --list
```

2026-11-10 起程式只有根目錄一份：`geno/`、`refactor/app/` 副本與 `sync_mirrors.js`、`verify_mirror_sync.js`、
`verify_geno_deploy.js` 已移除（舊文件裡提到「三副本」的段落是當時的紀錄）。

- `OPTIMIZATION_BACKLOG_2026-09.md`: 2026-09 體檢後的優化工作清單（四批次）與完成紀錄。
- 拆檔（3-4，2026-09-03）：`js/canvas-export.js`（匯出層 mixin，載於 canvas.js 之後）、`js/ui/property-panel-templates.js`
  （面板模板，載於 app.js 之前）。不用 bundler。
