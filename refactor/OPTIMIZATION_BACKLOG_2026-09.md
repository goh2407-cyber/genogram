# 家系圖優化工作清單（2026-09-02 體檢後）

> 來源：2026-09-02 全面體檢（讀 `IMPROVEMENT_ROADMAP.md`、`docs/audits/2026-07-15` 稽核、
> 以 26 人範例檔在 1440 / 1280 寬度實跑截圖、逐項對照程式碼）。
> 本清單只列「尚未做」的項目；已完成的臨床補完、走法、檢視分頁、Fit 等見 roadmap §7。
>
> 每項做完：打勾、填日期、寫驗證結果。動到 pixel 的一律先跑 golden 再改。
>
> **不變約束**（每項都要守）：臨床符號語意凍結；匯出 == 螢幕（不用 `isExport` 分支）；
> 三副本 `js/`、`css/` md5 一致（`geno/index.html` 保留本地資產路徑，不可被 root 覆蓋）；
> 不引入 bundler；手動優先、不做自動佈局。

## 狀態總覽

| 批次 | 項目數 | 完成 | 說明 |
|---|---:|---:|---|
| 第一批：一天內、零臨床風險 | 8 | 8 | 2026-09-02 全部完成，見「完成紀錄」；golden 16/16 |
| 第二批：個案記錄層 | 4 | 0 | 出生年、匯出頁首、最近檔案、日期文字避讓 |
| 第三批：需要設計拍板 | 4 | 0 | 去識別化、觸控、LOD、拆檔 |

> ✅ **已拍板（2026-09-02）**：golden `15-maximal`、`16-multifamily` 的基準原停在 2026-07-15，與 2026-08-11「自動模式一律畫字面直線、
> 避讓靠手動走法或移動人物」的設計不符。使用者決定**維持 8 月的直線走法、程式不動**，基準已用 `--update` 更新為現況，16/16 = 0 差異。
> 順帶觀察（未處理、列入 2-4）：夾人時婚姻線日期文字會印在被夾者符號上被遮住。

---

## 第一批：一天內、零臨床風險（✅ 2026-09-02 完成）

### 1-1. 畫布 HUD 按鈕改「螢幕固定像素」 ✅
- [x] 快速新增鈕（`drawQuickAddButtons`，半徑 18 世界座標）→ `18 * hud`（`hud = 1/scale`）
- [x] 鉛筆 / ⇄ 對調鈕（`drawRelationshipEditButton`，半徑 14、offset 24/+30）同步改
- [x] 走法鈕列 `自 ㄇ 一 ㄩ`（`_routeButtonCenters` / `drawRelationshipRouteButtons`，半徑 13、間距 30）同步改
- [x] hit-test 全部共用同一份幾何：新增 `getQuickButtonLayout(person)` 供 draw / `getQuickButtonAt` / `isPointInQuickAddZone`；`_editButtonGeom` 回傳 `hud`
- 位置規則：縮小（hud>1）整圈依 hud 放大維持螢幕間距；放大（hud<1）以符號邊緣為錨、邊緣外距離固定螢幕像素。scale=1 與原版完全相同。
- 驗證：golden 16 張中 01–14 = 0 差異；`verify_pencil` 6/6、`verify_marriage_geom` 17/17、`verify_drag` 19/19；
  自訂檢查 40% / 100% / 200% 三種縮放螢幕半徑恆為 18 / 14 / 13 px、40% 真實點擊父母鈕有反應。
- 狀態：完成 2026-09-02

### 1-2. 標題列顯示檔名 + 未儲存標記 ✅
- [x] `#documentName` 於 載入 / 另存 / Ctrl+S 寫回 後更新；未連結檔案顯示「未命名家系圖」
- [x] `#documentDirty`（桃紅 ●）：`isDirty && 有內容` 時顯示；tooltip 依是否連結檔案提示 Ctrl+S 或「另存」
- [x] `isDirty` 於每個 `history.pushState` 呼叫點（saveState / 屬性 commit / 拖曳合併 / 套用排列）與 undo/redo 設 true；
      `saveToFile` 成功、`downloadFile` 成功、`loadData` 設 false；從瀏覽器暫存恢復設 true（內容尚未在檔案裡）
- [x] `autoSave()` 每次重新評估標題列；`document.title` 同步（多分頁辨識）
- 檔案：`js/app.js`（`markDirty` / `updateDocumentTitle`）、三份 `index.html`、`css/styles.css`
- 驗證：自訂檢查 5 項（初始乾淨 → 變更 ● → 載入乾淨 → 屬性編輯 ● → 寫回乾淨）；`verify_ui_shell`、`verify_roundtrip` 綠
- 狀態：完成 2026-09-02

### 1-3. 狀態提示白話化 + 不遮圖 ✅
- [x] 舊檔相容訊息改為「已自動整理舊版檔案的關係資料：修正親子方向 N 筆、合併重複關係 N 筆、移除無效關係 N 筆」，只列非零項、6 秒淡出
- [x] 狀態膠囊移到畫布**底部**（`bottom: 76px`，縮放列與排列預覽列之上），不再壓住上排人物；hidden 動畫方向改為往下
- [x] golden harness 排除 `#statusBar`（與既有排除 Fit 鈕同理；狀態列由 `verify_status_ux` 獨立驗證）→ 01–14 基準重建（唯一差異為原頂部「就緒」膠囊 6504 px，已逐張確認）
- 驗證：`verify_status_ux` 綠；自訂檢查狀態列在畫布下 30% 且不與縮放列重疊
- 狀態：完成 2026-09-02

### 1-4. 關係屬性面板補「變更類型」與新屬性 ✅
- [x] 「變更類型…」按鈕 → 設 `editingRelationshipId` 後開既有 `showRelationshipEditModal`
- [x] 親子線顯示「子女線型」分段按鈕（親生/收養/寄養），新增 `setLinkTypeById(id, linkType)`（saveState → 改 → `_dataVersion++` → autoSave → render），不經 modal
- [x] 婚姻線顯示「婚姻線走法」分段按鈕（自動/ㄇ/一/ㄩ），呼叫既有 `setRouteModeById`
- [x] 群組顯示狀態每次明確設定；CSS 補 `.property-form .form-group[hidden] { display:none !important }`（`.form-group` 的 `display:flex` 原本會蓋掉 `[hidden]`）
- 驗證：自訂檢查 7 項（親子/婚姻各自只顯示對應群組、切換寫入資料 + history +1 + ●、Undo 回復、modal 改類型）；`verify_childlink` 7/7、`verify_marriage_geom` 17/17
- 狀態：完成 2026-09-02

### 1-5. 關係類型對話框改 3 欄 + 最近使用置頂 ✅
- [x] 關係 modal 加 `modal--wide`（680px）、`.btn-grid` 三欄；≤1023px 退回兩欄
- [x] 「最近使用」群組（最多 6 筆，`localStorage['genogram_recent_rel_types']`，不進 JSON / history）；開 modal 時複製對應靜態按鈕（含圖例線）、關閉時清空，不影響依靜態 DOM 的檢查
- [x] `.rel-btn` 點擊抽成 `handleRelationshipTypeButton(e)`，靜態與複製鈕共用
- 驗證：自訂檢查 9 項；`verify_modal_flow`、`verify_modal_keyboard_history`、`verify_legend_consistency` 綠
- 狀態：完成 2026-09-02

### 1-6. 工具列：清空與刪除分開 ✅
- [x] 「刪除 (Del)」與「清空畫布」之間加 `.tool-divider`（三份 index.html）
- 驗證：`verify_ui_shell`（1920/1366/1181/1180/1024 全綠）；1440 全域列高度 ≤ 66
- 狀態：完成 2026-09-02

### 1-7. 說明文件全面更新 ✅
- [x] 說明視窗（三份 index.html）：移除 PWA 安裝敘述；改「選取關係線後出現鉛筆 / ⇄」；補收養/寄養、多胞胎、生育結果、走法 ㄇ一ㄩ、檢視、符合全圖、Alt 精準放置、Shift 多選、右鍵/空白鍵平移、標籤搖桿、標題列 ●
- [x] `使用說明.txt` 全文更新（同上，含離線臨床版 geno 說明）
- [x] `README.md` 補建立關係 / 快速新增 / 標題列 / 快速鍵段落
- 狀態：完成 2026-09-02

### 1-8. 工程腳本：一鍵回歸 + 三副本同步 ✅
- [x] `refactor/run_all.js`：跑所有 `verify_*.js` + smoke + golden，彙整表 + exit code；自動帶 `NODE_PATH`；`--quick`、關鍵字過濾、`--list`
- [x] `refactor/sync_mirrors.js`：root → geno/、refactor/app/ 複製 js/** 與 css；index.html 只到 refactor/app/，geno/index.html 不覆蓋（比對非資產內容並提示）；結尾自動跑 `verify_mirror_sync`
- [x] `refactor/README.md`、`CLAUDE.md`、`AGENTS.md` 記錄用法
- 驗證：`run_all.js` 31 支：30 通過，僅 golden 因 15/16 既有漂移失敗（見上方待拍板）
- 狀態：完成 2026-09-02

---

## 第二批：個案記錄層（roadmap Phase 3）

### 2-1. 出生年月 → 自動年齡
- [ ] `Person.birthDate`（YYYY 或 YYYY-MM，可空）、`Person.deathDate`；`age` 改為「有 birthDate 就算、否則沿用手填」
- [ ] 屬性面板：出生年月欄位；有值時年齡欄唯讀顯示計算值
- [ ] 「基準日」（預設今天）可在檢視分頁調整 → 看「事件當下幾歲」
- [ ] 舊檔相容：無 birthDate 的人物行為完全不變；`toJSON` 只在有值時寫入
- 驗證：`verify_roundtrip.js` 加案例；golden 0 差異（無 birthDate 時）
- 狀態：

### 2-2. 匯出頁首 / 頁尾
- [ ] 匯出對話框加「標題 / 案號 / 日期 / 繪製者」可選欄位（session 記憶、不進 JSON 或另存 `meta`）
- [ ] PNG/JPEG/SVG/PDF 一致加頁首；PDF 加 A4 / A3 直橫向選項
- [ ] 複製圖片同步
- 驗證：`verify_view_export.js` 擴充；肉眼比對四格式
- 狀態：

### 2-3. 多個案：最近檔案 + 清除本機暫存
- [ ] File System Access handle 存 IndexedDB → 「最近檔案」清單（重整後可一鍵重開、Ctrl+S 直接寫回）
- [ ] 「關閉個案並清除本機暫存」按鈕（共用電腦隱私），有二次確認
- [ ] autosave 改為 per-file key（以檔名/handle 區分），避免換案覆蓋
- 驗證：新測試 `verify_recent_files.js`；`verify_roundtrip.js`
- 狀態：

### 2-4. 婚姻線日期文字避開被夾者符號（低）
- [ ] 自動直線穿過中間人物時，日期/說明文字目前印在該人物符號上（見 golden 15/16）；改為沿線找不與符號重疊的位置，或退到線的另一側
- 不改線的幾何（使用者 2026-09-02 決定直線走法不動），只動文字位置；golden 15/16 需重新人工確認
- 狀態：

---

## 第三批：需要設計拍板

### 3-1. 一鍵去識別化匯出
- 姓名→代號（案主=IP、其餘依輩分+序號）、日期→年份/年齡帶、剝除備註；只動輸出、磁碟不變
- 前置：2-1（年齡帶需要出生年）、2-2（匯出選項框架）
- 狀態：

### 3-2. 雙指縮放 / 平移（平板）
- 多 pointer 追蹤（`activePointers` Map）；兩指距離→scale、中點位移→pan；單指維持既有行為
- 驗證：Playwright touch 模擬新測試
- 狀態：

### 3-3. 低縮放時姓名可讀性 + 定位案主
- 「定位案主」鈕（縮放列）：置中並放大到 100%
- 低於某比例時姓名改螢幕固定字級（需拍板門檻；會動 pixel → golden 只在 scale=1 不受影響）
- 狀態：

### 3-4. 拆檔（不用 bundler）
- 沿 `js/domain/`、`js/ui/` 先例，從 `app.js` / `canvas.js` 拆出：匯出、屬性面板、放置（placement）、快速新增
- 每拆一塊跑 `run_all.js`；三份 `index.html` 同步 `<script>` 順序
- 狀態：

---

## 明確不做（沿用 roadmap §4 + 使用者決定）
- 自動佈局 / couple-vertex packer（2026-06-18 決定）
- 換繪圖技術（SVG / WebGL / Konva）
- 雲端協作、雲端 AI 轉圖、GEDCOM 雙向
- 節點貼照片、醫療/犯罪史面板

## 完成紀錄

| 日期 | 項目 | 驗證 | 備註 |
|---|---|---|---|
| 2026-09-02 | 1-1 HUD 固定像素 | golden 01–14 0 差異；pencil 6/6、marriage-geom 17/17、drag 19/19；三縮放自訂檢查 17/17 | `canvas.js` 新增 `hudUnit()`、`getQuickButtonLayout()` |
| 2026-09-02 | 1-2 標題列檔名 + ● | 自訂 5/5；ui_shell、roundtrip 綠 | `markDirty` / `updateDocumentTitle` |
| 2026-09-02 | 1-3 狀態列白話化 + 移底部 | status_ux 綠；golden harness 排除 statusBar、01–14 基準重建（僅膠囊差異） | 15/16 既有漂移待拍板 |
| 2026-09-02 | 1-4 關係面板 變更類型 / 線型 / 走法 | 自訂 7/7；childlink 7/7 | 新增 `setLinkTypeById`；修 `[hidden]` 被 `.form-group` 蓋掉 |
| 2026-09-02 | 1-5 三欄 + 最近使用 | 自訂 9/9；modal_flow、modal_keyboard_history、legend_consistency 綠 | `handleRelationshipTypeButton` |
| 2026-09-02 | 1-6 刪除/清空分隔 | ui_shell 綠 | 三份 index.html |
| 2026-09-02 | 1-7 說明文件 | 肉眼 + 自訂 1 項 | 說明視窗 ×3、使用說明.txt、README |
| 2026-09-02 | 1-8 run_all / sync_mirrors | run_all 30/31（golden 15/16 基準過舊，同日拍板更新後 31/31） | refactor/README、CLAUDE.md、AGENTS.md |
| 2026-09-02 | golden 15/16 基準更新 | `--update` 後重跑 16/16 = 0 差異 | 使用者決定維持 8 月直線走法，程式不動 |
