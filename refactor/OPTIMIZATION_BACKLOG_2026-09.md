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
| 第二批：個案記錄層 | 4 | 4 | 2026-09-03 全部完成（含 2-4 日期文字避讓） |
| 第三批：需要設計拍板 | 4 | 4 | 2026-09-03 全部完成（3-4 拆檔第一階段） |
| 第四批：同住框與生活圈 | 7 | 7 | 2026-09-03 全部完成 |

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

### 2-1. 出生年月 → 自動年齡 ✅
- [x] `Person.birthDate` / `deathDate`（YYYY | YYYY-MM | YYYY-MM-DD，`normalizeDateString` 正規化，接受 1985/6、1985年6月）
- [x] `getDisplayAge(ref)`：在世依基準日計算；過世有死亡年月 → 享年；否則沿用手填 `age`。canvas.drawPerson 與匯出同用
- [x] 屬性面板：出生年月 / 死亡年月（過世才顯示）；有計算值時年齡欄唯讀 + 提示；格式錯誤標紅不寫入、不推 history
- [x] 檢視分頁「年齡基準日」（session-only，不進 JSON）
- [x] 舊檔相容：`toJSON` 只在有值時寫入，無 birthDate 者逐 byte 不變
- 驗證：新測試 `verify_birthdate.js` 32/32；golden 16/16；run_all 全綠
- 狀態：完成 2026-09-03（commit 24c5f98）

### 2-2. 匯出頁首 ✅
- [x] 匯出對話框「加上頁首」：標題 / 案號 / 繪製者 / 日期；標題・案號・繪製者屬個案內容 → 存進 JSON `meta`（只在有值時，舊檔不變），日期預設今天不存
- [x] PNG / JPEG / SVG(內嵌 PNG) / PDF 共用 `drawExportHeader`；無頁首時輸出逐 byte 不變
- [x] PDF 紙張 A4 / A3、方向 自動/橫/直（`storage.exportPDF(options)`）
- [x] 決定：「複製圖片」不加頁首（快速貼上用途），對話框內有註明
- [x] 「加上頁首」勾選、紙張、繪製者預設 記在 localStorage 偏好；meta 隨 loadData / 暫存恢復 / 清空 同步；`migrate()` 保留 meta
- 驗證：新測試 `verify_export_header.js` 19/19；肉眼確認頁首排版
- 狀態：完成 2026-09-03（commit 6e942ce + migrate 修正）

### 2-3. 多個案：最近檔案 + 清除本機暫存 ✅
- [x] `storage` 以 IndexedDB 存 FileSystemFileHandle（最多 8 筆，只存 handle 與檔名，不存內容）；開檔 / 另存 自動記錄
- [x] 「載入」改為先開「開啟檔案」對話框：最近檔案清單（點一下重開並連結，需要時請求權限）、「瀏覽檔案…」、「清除本機暫存並關閉個案」
- [x] 清除本機暫存：瀏覽器暫存 + 最近檔案 + 畫布 + 歷史 + meta → 空白新個案；有二次確認；不刪磁碟 JSON
- [x] 檔案不存在 → 自動從清單移除；權限被拒 → 提示改用瀏覽；無 FS API 的瀏覽器退回原本 file input
- [ ] ~~autosave 改 per-file key~~ **決定不做**：暫存槽只放「最後一次工作階段」；per-file 會把多個個案內容都留在 localStorage，隱私更差。換案問題已由最近檔案清單解決
- 驗證：新測試 `verify_recent_files.js` 16/16；run_all 全綠
- 狀態：完成 2026-09-03

### 2-4. 婚姻線日期文字避開被夾者符號（低）
- [ ] 自動直線穿過中間人物時，日期/說明文字目前印在該人物符號上（見 golden 15/16）；改為沿線找不與符號重疊的位置，或退到線的另一側
- 不改線的幾何（使用者 2026-09-02 決定直線走法不動），只動文字位置：線段夠長 → 沿線左右滑到最近空位；塞不下 → 抬到被夾者符號頂端之上。golden 15/16 已肉眼確認只有日期文字移動並更新基準
- 驗證：新測試 `verify_date_label_avoid.js` 7/7（窄／寬線段、對照、匯出==螢幕）
- 狀態：完成 2026-09-03

---

## 第三批：需要設計拍板

### 3-1. 一鍵去識別化匯出
- 姓名→代號（案主=IP、其餘依輩分+序號）、日期→年份/年齡帶、剝除備註；只動輸出、磁碟不變
- 前置：2-1（年齡帶需要出生年）、2-2（匯出選項框架）
- 做法：`getExportDataset(true)` 回傳複本（姓名→案主／男1／女1…依 y、x 排序確定；年齡→十年年齡帶含出生年月算出者與享年；備註清空；出生／死亡年月移除），匯出期間 `canvas.personMap` 指向複本、結束還原；備註／關係說明強制關閉；頁首標題→「家系圖（去識別化）」並標「去識別化版本」，案號保留。複製圖片沿用勾選。每次開對話框預設不勾
- 驗證：新測試 `verify_deidentify.js` 11/11（輸出零真名、原資料逐 byte 不變）
- 狀態：完成 2026-09-03

### 3-2. 雙指縮放 / 平移（平板）
- 多 pointer 追蹤（`activePointers` Map）；兩指距離→scale、中點位移→pan；單指維持既有行為
- 做法：`touchPointers` Map 追蹤手指；第二指落下 → `beginPinch`（取消單指操作、座標還原到起點、不寫 history），以起始中點對應的世界點為錨縮放平移；放開一指後剩餘手指忽略到全部放開；`#genogramCanvas { touch-action: none }`；setPointerCapture 加 try/catch
- 驗證：新測試 `verify_pinch.js` 9/9（合成 PointerEvent）
- 狀態：完成 2026-09-03

### 3-3. 低縮放時姓名可讀性 + 定位案主
- 「定位案主」鈕（縮放列）：置中並放大到 100%
- 低縮放螢幕 LOD：<75% 時姓名字級放大（最多 1.6 倍）、<50% 時備註不畫；只影響螢幕（匯出期間 `lodScale=1`），幾何／命中仍用基準字級
- 「定位案主」鈕在縮放列（golden harness 與 Fit 鈕同樣排除）
- 驗證：新測試 `verify_locate_lod.js` 9/9
- 狀態：完成 2026-09-03

### 3-4. 拆檔（不用 bundler）✅（第一階段）
- [x] `js/canvas-export.js`：exportToPNG/JPEG、頁首、匯出圖例、drawLifeCirclesExport/drawPersonForExport、匯出期間衍生狀態捕捉/還原（11 個方法 + EXPORT_HEADER），以 prototype mixin 掛回 GenogramCanvas；canvas.js 6376→5976 行
- [x] `js/ui/property-panel-templates.js`：PROPERTY_PANEL_TEMPLATES（181 行）自 app.js 抽出
- [x] 三份 index.html 加 `<script>`（順序見 CLAUDE.md）；sync_mirrors 自動帶新檔
- [ ] 後續可再拆：放置（placement）、快速新增、開啟檔案／最近檔案（storage 已獨立）— 視需要
- 驗證：run_all 全綠、golden 16/16（純搬移零行為變更）
- 狀態：第一階段完成 2026-09-03

---

## 第四批：同住框與生活圈（2026-09-03 體檢後，使用者同意一起做）

### HH-1. 同住框邊界保留姓名／備註文字區 ❌ 撤回（2026-09-03 使用者：文字交給面板搖桿調整，不必刻意避開）
- [x] `getHouseholdBounds` 取樣點加入成員 `getPersonLabelGeometry` 的文字區塊四角（含 padding），框線不再切到姓名
- [x] draw / hit-test / 匯出邊界共用同一份 bounds（原本就共用，不另分支）
- 驗證：`verify_hh_lc.js` H1–H7 綠；`verify_household_edit.js` HH-1 兩項
- **做法修正**：第一版讀 `getPersonLabelGeometry` 違反 2026-08-11「靜態外框只依符號座標」規格（H7 失敗）；改為每位成員下方加**固定文字保留區**（常數高度，有備註者再加兩行；不讀文字位置／寬度），文字微調時框線不動
- 狀態：2026-09-03 完成後同日依使用者意見撤回；改做 HH-5

### HH-2. 同住框名稱顯示於框上 + 圖例
- [x] `household.label`（可空）顯示在框頂部（白 halo），螢幕與匯出一致；面板加「名稱」欄（備註維持面板內）
- [x] 匯出圖例「特殊」段加一筆「虛線框 = 同住」；側欄圖例同步
- 驗證：`verify_legend_consistency` 綠（圖形符號區用 `.legend-extra`，不動三大群組契約）；`household.label` 進 getState/JSON
- 狀態：完成 2026-09-03

### HH-3. 成員增減不必重圈
- [x] 面板成員改成可移除的標籤（✕）；「把目前選取的人加入此框」按鈕；成員歸零自動刪框
- 驗證：`verify_household_edit.js` HH-3 六項（✕ 移除、下拉加入、Undo、剩 1 人保留、歸零刪框）
- 狀態：完成 2026-09-03

### HH-4. 已選好人直接按 H 建框
- [x] 已有多選（Shift 或框選）≥2 人時按 H／點同住工具 → 直接建立；只單選 1 人 → 進工具、選取不變（切工具不得改選取，見 verify_manual_label_controls），按 Enter 建 1 人框或再點人納入
- 狀態：完成 2026-09-03（commit 9696621 修正）

### HH-5. 同住框自動繞開非成員 ✅
- [x] 第一版（凹包 + 收緊）在模糊測試 63 組版面中出現 5 組自交、2 組繪圖尖刺（使用者截圖亦見尖刺）→ **改為光柵化聯集輪廓**：
  成員泡泡（r=符號半徑+25）∪ 成員最小生成樹走廊（遇障礙物三點繞道）∪ 成員間關係線帶 − 非成員圓（排除半徑 48.5），
  cell=5 px 光柵 → marching squares 取最大輪廓 → Chaikin 平滑兩次 → 弧長 6px 重取樣。由建構保證單一簡單多邊形、不自交、無尖刺。
- [x] 非成員被帶子圍成「島」時：先拿掉穿過它附近的關係線帶；仍被包住就從它挖一條通道到最近外框（島→灣）；通道會切斷成員連通時放棄（寧可包到人不能少成員）
- [x] 障礙物挖洞切斷成員連通時，由最靠近成員的洞開始逐一放棄
- [x] 簽章快取（成員座標／附近障礙物／走廊／連線一致就沿用）；外接框內有障礙物時不用膠囊
- [x] draw / hit-test / 匯出共用 `getHouseholdBounds`（回傳 `dogBoneAllowed`、`enclosedObstacles`）；凹包只留作最後退路
- 起因：使用者截圖「居草屯」不在同住裡卻被框到，要手動微調人物位置才會繞過；第一版又在「太近」時出現尖刺
- 驗證：`verify_household_fuzz.js`（63 組隨機版面 + 使用者版面×3 間距：無自交／尖刺／非有限值／零長度、成員在內、非成員在外 全 0 違規）、
  `verify_household_obstacle.js` 6/6、`verify_household_edit.js` 16/16、`verify_hh_lc` H1–H7 綠
- 狀態：完成 2026-09-03
- 可調參數：走廊半寬 `padding*0.7`（目前 17.5，想要框更「胖」可加大，但更容易碰到非成員）

### LC-1. 生活圈頂點可編輯
- [x] 選取狀態下拖單一頂點；雙擊邊線插入頂點；Alt+點頂點刪除（至少保留 3 點）；皆進 history
- 驗證：新測試 `verify_lifecircle_edit.js` 15/15（真實滑鼠：拖頂點、Alt 刪、雙擊插入、橢圓、Backspace、標籤位置）
- 狀態：完成 2026-09-03（commit 23ee597）

### LC-2. 生活圈畫法更快
- [x] 生活圈工具下「拖一下」拉橢圓（放開轉 16 點多邊形）；點頂點畫法保留（第 1 個頂點延後到放開時決定）；畫的過程 Backspace 退回上一個頂點
- 狀態：完成 2026-09-03

### LC-3. 生活圈標籤與說明
- [x] 標籤位置可選（頂部／中央／底部，`labelPosition`，預設值不寫入 JSON）；面板加「說明」欄（`notes`，不畫在畫布）
- 狀態：完成 2026-09-03

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
| 2026-09-03 | 2-1 出生年月自動年齡 | verify_birthdate 32/32；golden 16/16 | Person.birthDate/deathDate、getDisplayAge、檢視分頁基準日 |
| 2026-09-03 | 2-2 匯出頁首 + meta + PDF 紙張 | verify_export_header 19/19 | drawExportHeader；migrate 保留 meta |
| 2026-09-03 | 2-3 最近檔案 + 清除本機暫存 | verify_recent_files 16/16 | IndexedDB handle；開啟檔案對話框；per-file autosave 決定不做 |
| 2026-09-03 | HH-1～4 同住框 | verify_household_edit 16/16；hh_lc、legend、manual_label 綠 | 固定文字保留區守靜態外框規格；HH-4 切工具不改選取 |
| 2026-09-03 | LC-1～3 生活圈 | verify_lifecircle_edit 15/15 | 頂點編輯、橢圓、Backspace、名稱位置/說明 |
| 2026-09-03 | 2-4 日期文字避讓 | verify_date_label_avoid 7/7；golden 15/16 人工確認後更新 | 只動文字不動線 |
| 2026-09-03 | 3-3 定位案主 + LOD | verify_locate_lod 9/9 | LOD 只影響螢幕 |
| 2026-09-03 | 3-2 雙指縮放/平移 | verify_pinch 9/9 | touch-action none |
| 2026-09-03 | 3-1 去識別化匯出 | verify_deidentify 11/11 | 只動輸出 |
| 2026-09-03 | 3-4 拆檔第一階段 | run_all 全綠、golden 16/16 | canvas-export.js、property-panel-templates.js |
| 2026-09-03 | HH-5 同住框繞開非成員（光柵輪廓） | household_fuzz 63 組零硬性違規；obstacle 6/6；hh_lc 綠 | 取代凹包；HH-1 撤回 |
