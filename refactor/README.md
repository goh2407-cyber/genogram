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
2. 逐步實作重構（可在 `geno/` 或新分支驗證）。
3. 依 `TEST_GATES.md` 全部勾選通過。
4. 通過後再安排合併與上線。

## 一鍵回歸與三副本同步（2026-09 新增）

```bash
# 全部回歸（29 支 verify_*.js + smoke + golden），自動帶 NODE_PATH=~/.cache/pw-smoke/node_modules
node refactor/run_all.js
node refactor/run_all.js --quick          # 略過 golden
node refactor/run_all.js drag pencil      # 只跑名稱含關鍵字的腳本
node refactor/run_all.js --list

# root → geno/、refactor/app/ 同步 js/** 與 css；index.html 只複製到 refactor/app/
# （geno/index.html 保留本地字型/vendor 路徑，不覆蓋，只比對內容並提示）；結尾自動跑 verify_mirror_sync
node refactor/sync_mirrors.js
node refactor/sync_mirrors.js --dry-run
```

- `OPTIMIZATION_BACKLOG_2026-09.md`: 2026-09 體檢後的優化工作清單（四批次）與完成紀錄。
- 拆檔（3-4，2026-09-03）：`js/canvas-export.js`（匯出層 mixin，載於 canvas.js 之後）、`js/ui/property-panel-templates.js`
  （面板模板，載於 app.js 之前）。不用 bundler；新增檔案後跑 `sync_mirrors.js` 讓 geno/、refactor/app/ 一併取得。
