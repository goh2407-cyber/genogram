# 家系圖系統優化路線圖（Improvement Roadmap）

> 整併自三次分析：
> 1. **繪圖架構 / 效能**（render pipeline、模型-視圖耦合、命中測試、佈局、繪圖基元、匯出重複）
> 2. **專業軟體競品對照**（GenoPro / Genogram Analytics / WebGeno / McGoldrick 標準 / 通用繪圖 / AI 新工具）
> 3. **多婚連線重構**（「父母只能左右並排」與「多婚/多角色線重疊」）
> 4. **連接線缺陷對抗式驗證**（切換型別 / 拉線連接 / 線條幾何 — 10 個已確認缺陷，見 §8）
>
> 本文是「怎麼優化這個系統」的單一事實來源。重點不是功能清單，而是 **依賴順序 + 共用機制**：先建一次的東西，後面很多功能都靠它。
>
> 更新：2026-06-17 併入連接線缺陷清單（§8）。

---

## 0. 核心判斷（先看這段）

- **你在臨床段是第一梯隊。** 關係線種類（~30+ 含三類虐待、複合 close-hostile/fused-hostile）、臨床符號集、**同住框 + 生活圈**，都在 McGoldrick 標準線上甚至以上；情感線種類追平 GenoPro（34）、超過 WebGeno（16）。
- **真正落後的不是「畫圖」。** 是「把家系圖當成個案記錄工具」那一層（日期/年齡、分類註記、搜尋、去識別化），加上三個 McGoldrick 結構缺口，加上多婚連線繞線。
- **不要換繪圖技術。** SVG / WebGL / Konva / Three.js 對這個工具都是 downgrade：要重寫凍結的臨床符號、重新引入第二條光柵化路徑、破壞「匯出==螢幕」。真正補足不足的「新技術」是基本功：`requestAnimationFrame`、memoization、pixel-diff 測試閘門。
- **優化的槓桿在「共用機制」**（見 §2）。把它們先建好，臨床補完、連線重構、個案工具層才會又快又安全。

---

## 1. 不可動的約束（每個改動都要遵守）

| 約束 | 內容 |
|---|---|
| 凍結臨床符號 | 方=男/圓=女/三角=孕/圓頂方=同性別/灰底=案主/X=死亡，以及標準關係線型/配色。**線的「繞線/佈局」可改，符號「語意」不可改。** |
| 三副本同步 | 根 `/`、`geno/`、`refactor/app/` 三份 `js/` 必須 md5 一致（docs 不受此限）。每個 sprint 結束同步並重算 md5。 |
| 匯出 == 螢幕 | 匯出重用同一套 draw core。**禁止用 `isExport` 旗標分支改行為**，否則不變式破裂。 |
| 離線 / 隱私 | 全 client-side、localStorage/JSON、無後端。處理受暴/未成年個案——**不上雲、不送第三方**。這是賣點不是限制。 |
| 繁中 Windows | cp950/BOM 地雷；**不引入重 build tooling**（bundler 會改寫檔案破壞編碼與三副本）。中文 .md/.js 存檔後驗 BOM。 |
| 手動優先 | 使用者拖曳定位；dagre 自動佈局只能 **預覽不強制**。任何自動佈局都不得成為權威。 |

---

## 2. 共用機制：先建一次，多處受益（優化的真正槓桿）

> 這一節是整份路線圖最重要的觀念。下面五個東西不是功能，是**地基**。每一個都被後面多個功能重複使用——先把它們做對，後面每個功能都變便宜、變安全。

| 共用機制 | 一次建好，誰受益 | 對應分析 |
|---|---|---|
| **視覺 golden-image 測試閘門**（擴充 `smoke_visual.js`，每種符號/線型一張 fixture，pixel-diff 比對基準） | 連線重構、臨床新符號、去識別化匯出——**所有會動 pixel 的改動的安全網**。把「臨床保真」從肉眼檢查變成自動擋門。 | ① |
| **render-time overlay 機制**（已用於對齊輔助線：只在 `render()` 出現、不進匯出） | 屬性搜尋 highlight、繞線輔助線、（去識別化的反例）。建一套乾淨的 overlay pass，三處共用。 | ①③ + 競品 |
| **`dataVersion` memoize**（已有 `personMap`/`_syncPersonMap` 同款慣例） | 快取 `KinshipEngine`、family/other split、關係 `Path2D`——拖曳時不再每幀重算。 | ① |
| **單一真相圖例**（`Relationship.getLineStyle()` 當權威，匯出圖例與 CSS 圖例從它衍生 + 自動同步測試） | 新增任何線型（收養/寄養線等）只改一處，不再手動同步三個檔。 | ① + 競品 |
| **統一路徑數學**（一個 `GenogramPath`：建一次 Path2D，draw/匯出/hit-test 共用 `getPointAtDistance` 等） | 波浪/鋸齒/平行偏移線在三處幾何一致；新線型只動一個 walker。 | ① |

---

## 3. 分階段路線圖（依「依賴順序」排，不是依主題）

> 順序原則：**地基 → 臨床補完 → 連線重構 → 個案工具 → 互通規模**。
> 每一項標註 依賴（depends-on），確保不會在沒有護欄時動 pixel。

### Phase 0 — 地基穩定（零視覺變化 / 純安全與效能）

| 項目 | 做什麼 | 力氣 | 風險 | 依賴 |
|---|---|---|---|---|
| 0a. Kinship/ split memoize | `KinshipEngine` 與 family/other split 用 `dataVersion` 快取，位置變動不重算（`canvas.js:296`、`283`） | S | 低 | — |
| 0b. rAF 合併重畫 | 64 處 `this.render()` 包進 `scheduleRender()`，一幀一 rAF；匯出/測試保留同步 render | M | 中 | — |
| 0c. **golden-image 測試閘門** | 見 §2；接進測試 gate | M | 低 | — |
| 0d. 單一真相圖例 + 三方同步測試 | 見 §2 | M | 低 | 0c |

> Phase 0 做完：拖曳順暢、render loop 理智、**之後每個視覺改動都有自動擋門**、新增線型只改一處。

### Phase 1 — 臨床補完（最便宜、最貼個案；重用現有基元）

| 缺口 | 怎麼補（重用什麼） | 力氣 | 依賴 |
|---|---|---|---|
| 親生 / 收養 / 寄養 子女線 | parent-child edge 加三態屬性，render 改下行線 dash（已有 `DASH_PATTERNS`） | S | 0c, 0d |
| 同卵 / 異卵 雙胞胎 | `drawTwinConnector` 加 zygosity flag + 一條短橫 bar | S | 0c |
| 虐待線方向性確認 | 確認 abuse/violence 線強制 from→to 方向、箭頭永遠指向受害者、提供「對調方向」 | S | — |
| 流產 / 人工流產 / 死產 | person 子狀態，重用三角 + 縮小 `drawX` | M | 0c |

> 為什麼第一優先：寄養/收養安置、生育創傷正是這個 caseload 的日常；目前「無法正確標示」是臨床記錯，不是少功能。

### Phase 2 — 連線重構（使用者實際痛點：多婚 / 多角色）

> 關鍵發現：渲染器**已經**用 `parents.join('_')` 把小孩依父母配對分組（`canvas.js:3127`），所以「哪個小孩屬於哪段婚姻」render 時已知。痛點大多是 **繞線**，不是資料模型。

| 方案 | 做什麼 | 力氣 | 風險 | 依賴 |
|---|---|---|---|---|
| **A. 正交婚姻繞線 + 每段婚姻分 Y 層**（先做） | 婚姻線改正交（出側點→垂直到共用夫妻 Y→進對方側點），不同 Y 也乾淨；兩 union 下行橫桿太近就下推一階 + X 微錯位；穿越他人婚姻線時用小天橋。**只在「不同 Y / 真的會撞」時啟用，同 Y 維持原直線** | M | 中 | 0c |
| B. 配偶吸附 snap | `computeDragSnap` 加「配偶吸附」候選（`partner.x ± CELL_WIDTH`、`partner.y`）+ 桃紅輔助線；opt-in 不強制；優先級低於 parent-mid | M | 中 | verify_drag |
| C. 顯式 `unionId`（**等需要才上**） | 婚姻/parent-child 加 unionId；載入時從 parent-key **合成**讓舊檔 byte-identical。解「無子女婚姻 / 歸屬模糊 / 一人雙角色」 | L | 高 | 遷移測試 |
| D. 多婚預覽整理（最後） | 依日期排配偶（現任最近）、各 union 小孩塞對應橫桿下；預覽不強制（同 dagre 哲學） | L | 中 | C |

**待拍板的語意決定**：天橋目前「最舊婚姻架最高」（`canvas.js:1114`），McGoldrick 臨床慣例是「**現任最突出、舊的往旁邊**」。要不要改向？（會微動現有外觀）

#### Phase 2A 具體設計（2026-06-17 定，含 GoJS/pedigreejs 比較後的結論）

> **不買 GoJS/yFiles**（見 §0、競品比較）：兩者是「渲染器+佈局」綁死的付費框架，採用＝重寫凍結符號 + build tooling + 授權；它們的 genogram/pedigree 範例又**零情感層**（非你的領域）。但 **GoJS genogram 範例的一個演算法觀念值得免費借**：把「一對夫妻當佈局圖裡的單一頂點」。

三層、由淺到深、每層獨立可上：

- **2A.1 連接邊分流 + 正交婚姻線（先做，解「非並排斜線」）**
  - `person.js getConnectionPoint` 增「可任意 Y 的側點」變體；親子線從 child **頂端**進、婚姻線從 person **側邊**出。
  - `drawMarriageLine` 改正交（出側點→垂直到共用夫妻 Y→進對方側點）。**只在 `|p1.y - p2.y| > ε` 時啟用，同 Y 維持原直線** → 大部分既有圖 golden 0 差異。
  - 護欄：golden（同 Y 不變 + 新增「非並排婚姻」fixture）。

- **2A.2 每段婚姻下行帶去衝突（解「兩婚+一親子疊線」）**
  - `drawFamilies` 已按 `parents.join('_')` 分組；兩 union 下行帶 Y 太近 → **下推一階（仿 `canvas.js:1130` 的 step=30）+ X 微錯位**，使親子下行線與婚姻天橋腳不共用同一垂直走廊。
  - 護欄：新增「兩婚+一親子疊線」完整重現 fixture，鎖 before/after。

- **2A.3 couple-as-single-vertex 佈局（選做，一鍵整理多婚）**
  - 用**現有免費 dagre**：建佈局圖時把每對夫妻併成單一頂點、parent-child 連到 couple 頂點 → dagre 的 Sugiyama 交叉最小化自動把夫妻擺同列、小孩掛對段、降交叉。
  - **預覽不強制**（同現有 dagre auto-layout 哲學、手動優先）。配偶序依婚期（接 2A.4 天橋方向決定）。

- **2A.4 跳線 + 天橋方向定案（選做）**
  - 主力靠 2A.3 排序降交叉；**真的不可避免的交叉才用小跳線**（render 裝飾，極少數，借自通用流程圖工具、**非家系圖標準**）。**不承諾零交叉**（NP-hard，已查證）。
  - 拍板天橋方向（保留最舊架最高 / 改現任最突出）。

**共同約束**：全在共用 draw 函式內改（不用 `isExport` 分支，守匯出==螢幕）；最 invariant-sensitive，**先 golden 鎖再動**；同 Y 常見情況維持原樣。

### Phase 3 — 個案工具層（把「圖」變「個案記錄」）

| 項目 | 做什麼 | 力氣 | 風險 | 依賴 |
|---|---|---|---|---|
| 出生/死亡日期 → 自動年齡 + as-of date | 加 `birthDate/deathDate`，年齡用算的；隱私開關顯示年齡帶；「事件當下幾歲」 | M | 低 | — |
| 分類化個案註記 | Person/Relationship notes 擴成 category（觀察/假設/介入/追蹤）+ 日期 + 記錄者；trauma 紅標 | M | 低 | undo 深拷貝 |
| 屬性搜尋 / highlight overlay | filter 框：依姓名/風險旗標/同住框/輩分/醫療標籤，暗化畫布 highlight 命中 | M | 低 | §2 overlay 機制 |
| **一鍵去識別化匯出**（差異化） | 匯出時 姓名→代號、日期→年份/年齡帶、剝註記；只動輸出、磁碟不變 | M | 中 | 0c（驗去識別變體仍 ==螢幕） |

> 去識別化匯出**全市場沒有任何家系圖工具做**——社工可把圖交督導/法院/訓練而不暴露受害者身分。

### Phase 4 — 互通與規模（想清楚再做）

| 項目 | 做什麼 | 力氣 | 備註 |
|---|---|---|---|
| SVG 內嵌 JSON「匯出即存檔」+ A4 拼貼 | 學 draw.io，匯出 SVG 可重開編輯；大圖多頁列印 | L | SVG 純文字、無重工具 |
| GEDCOM 單向匯入 | 純 JS parser，只匯入結構當種子 | L | **只匯入不匯出**（GEDCOM 表達不了臨床層）；最低優先 |

---

## 4. 明確「不要做」（防 scope creep / 踩隱私雷）

| 別做 | 為什麼 |
|---|---|
| 雲端即時協作（live cursor 同步） | 受暴未成年資料上共享雲端＝機密性災難；離線更安全是賣點 |
| 雲端 AI 把晤談筆記轉圖 | 含受害者姓名/指控的自由文本送第三方 LLM＝合規重災 |
| 完整 GEDCOM 雙向 round-trip | 給「可攜」錯覺，實際靜默丟掉臨床層 |
| 可腳本化報表產生器（GenoPro VBScript skins） | 巨大 scope creep + 打架三副本/無 build；固定 PDF 模板就有 90% 價值 |
| 醫療/犯罪史面板 + 感染傳播 overlay | 變迷你 EHR，可能無法合法持有，爆炸性擴大隱私面 |
| 節點貼客戶照片 | 無 encryption-at-rest 下 PII/生物特徵風險暴增，臨床回報低 |
| 強制全圖自動佈局 | GenoPro 自己都勸阻；手動 + 隨選預覽本就是業界推薦 |
| 換繪圖技術（SVG/WebGL/Konva 全面重寫） | 見 §0：downgrade，破壞匯出==螢幕、重寫凍結符號 |

---

## 5. McGoldrick 保真度檢查表

**已覆蓋（在標準線上甚至以上）**：M/F、孕三角、死亡 X、同性別、跨性別 FTM/MTF、取向標記、醫療半/象限 + S/O/L；婚姻全套（married/engaged/cohabiting/separated/divorced/widowed/affair + slash/X）+ 多婚天橋；親密度梯度（close=雙線、very-close=三線）+ 衝突/恨/cutoff/距離 + 複合型（close-hostile/fused-hostile/conflict-close）；虐待全套含方向；同住框 + 生活圈。

**缺 / 偏離（= Phase 1 + Phase 2）**：
1. ❌ 親生/收養/寄養 子女線（最重要）
2. ❌ 流產/人工流產/死產
3. ⚠️ 同卵 vs 異卵雙胞胎（缺 zygosity bar）
4. ⚠️ 案主用灰底（標準是雙線框）——可作「有記錄的變體」，但**畫布圖例註明**，並確認灰底不撞醫療填色

---

## 6. 每階段回歸護欄（對應現有測試）

| 改動 | 必過的 gate |
|---|---|
| 任何動 pixel（Phase 1/2/3 視覺） | golden-image（0c）+ `smoke_visual` 零 console error |
| 拖曳相關（2B 配偶吸附、snap） | `verify_drag`（16 項）+ 新增配偶吸附測試 |
| 同住框/生活圈相關 | `verify_hh_lc`（19 項）+ `getState` 深拷貝 |
| 圖例/線型（0d、Phase 1 線型） | 三方同步測試（CSS = 匯出圖例 = `getLineStyle`） |
| 效能（0a/0b） | `fps_bench.py` before/after |
| 資料 schema（2C unionId、Phase 3 欄位） | 舊檔 load→save→load identity 測試 |

---

## 7. 建議的起手順序

> **進度（2026-06-17）**
> - ✅ 連接線缺陷 **B1 B2 B3 B4 B9 B10** 已修並三副本同步。
> - ✅ **playwright 已安裝**（`~/.cache/pw-smoke/`，含 chromium + pixelmatch/pngjs）。既有回歸全綠：`verify_drag` 16/16、`verify_fixes`、`verify_hh_lc`、`smoke_visual` 零 console error。
> - ✅ **Phase 0c golden-image 閘門已建**：`refactor/visual_golden.js`（7 fixture：符號/婚姻線/家系幹/多婚/情感/虐待/複合），基準存於 `refactor/golden/baseline/`，重跑 0 差異、無假陽性。指令：`NODE_PATH=$HOME/.cache/pw-smoke/node_modules node refactor/visual_golden.js [--update]`。
> - ✅ **Phase 0a（kinship memoize）已完成**：`getKinshipEngine`／新增 `getRelationshipSplit` 以 `_dataVersion` 快取（長度當 backstop），App.render 一次性注入 canvas、讀後即清。**golden 0 差異（零視覺）、verify_drag 16/16（失效正確）**、全回歸綠、三副本 md5 同步。
> - ⚠️ **效能發現（重要）**：fps_bench before/after 差異全在亞毫秒雜訊內——這台**本來就極快**（render <1ms、pan/zoom 60fps、find=0，連 200 人）。**0a 的實際效益是程式更乾淨 + 建立 dataVersion 模式，不是速度。**
> - 🎯 **策略修正：效能不是瓶頸 → 建議跳過 Phase 0b（rAF 合併）**（它還會動到測試的同步假設、風險高而無收益）。資源轉向高價值的 **Phase 1（臨床補完）** 與 **Phase 2A（連線繞線）**——那是正確性／可讀性，不是速度。
> - golden 閘門已實證價值兩次：① 證明 0a 零視覺；② 揪出多婚 fixture 因「無日期時排序 fallback 隨機 id」而不穩定 → 已加固（給定明確日期）。順帶：真實 app 因 ID 持久化故單檔內穩定，但無日期時天橋架哪條較任意，留 Phase 2A 處理。
> - ✅ **Phase 1 完成（端到端）：親生/收養/寄養 子女線**
>   - 資料：`Relationship.linkType`（biological/adopted/foster，預設 biological、舊檔相容、進 toJSON）
>   - render：`drawFamilies` 子女下行段依 linkType 設 dash（收養虛線 `engaged`／寄養點線 `cohabit`／親生實線；foster 優先；畫完重置不洩漏）。**修正（使用者回報）**：單一子女時主幹也套用線型（原本「上實下虛」），多子女時主幹共用維持實線；golden `12-child-links-single` 鎖定。
>   - UI：關係面板「親屬/結構關係」三顆按鈕（親生/收養/寄養，帶 `data-link-type`）；handler + `createRelationship`/`updateRelationshipType` 接 linkType。**修正**：`updateRelationshipType` early-return 加看 linkType，否則「同為 parent-child、只改親生→收養」會被誤擋
>   - 圖例：CSS swatch（`.legend-line.parent-child-adopted`/`-foster`）+ 匯出圖例 family 段三筆，皆對齊 `DASH_PATTERNS.engaged`/`cohabit`
>   - 驗證：golden `08-child-links` + 01-07 全 0 差異；新測試 `verify_childlink.js` **6/6**（UI/持久化/匯出）；verify_drag 16/16；三副本（js + index.html + css）同步
> - ✅ **同卵雙胞胎 bar 完成（端到端）**：`Person.zygosity`（mono/di，進 toJSON）+ `drawTwinConnector` 同卵時於 V 形中段加水平連接橫桿（異卵不畫）+ UI（屬性面板「同卵雙胞胎」切換，套用整組）。golden fixture `09-twins`（已肉眼確認：左異卵無桿/右同卵有桿）+ 01-08 全 0 差異；新測試 `verify_twins.js` **6/6**；verify_drag 16/16；三副本同步。
> - ✅ **側欄關係圖例 + 存檔補齊新線條**：側欄「家庭關係」加親生/收養/寄養三條（重用 CSS swatch，三副本同步）；`verify_roundtrip.js` **6/6** 證明 `linkType`/`zygosity` 經 toJSON→fromJSON 完整保留、舊檔正確預設。
> - ✅ **虐待線方向性完成（端到端，已簽核改 frozen 線）**：violence/abuse/physical/emotional/sexual-abuse 加 `decoration:'arrow'`，箭頭指向 `to`=受害者（已查證 `getSmartPath` path 為 from→to、肉眼確認 06-abuse 五列箭頭朝右）；匯出圖例同步加箭頭；**新增「⇄ 對調方向」按鈕**（編輯模式，一鍵修正畫反方向）。golden `06-abuse` 經簽核重建（83px 差為箭頭）、其餘 8 張 0 差異；`verify_childlink` **7/7**（含對調方向）；verify_drag 16/16；三副本同步。
>   - **TODO（three-way 收尾）**：CSS 側欄 swatch 的 5 條虐待線補方向箭頭（畫布+匯出圖例已有；側欄目前以正確藍色線型標示、僅缺小箭頭。5 個 URL-encoded 複合 SVG，低價值高 fiddliness，故延後）。
> - ✅ **流產/人工流產 完成（端到端）**：`Person.lossType`（miscarriage/abortion，進 toJSON）+ `drawPerson` 早期分支 `_drawLossSymbol` + UI（屬性面板「生育結果」選擇器）。**符號依使用者提供的「Basic Genogram Symbols」參考圖（簡記號派）對齊**：**流產=小實心圓點 ●、人工流產=X**（不是先前的「三角家族」派的三角+X）。**死產（stillbirth）依使用者決定移除**（不確定用途；舊資料若有此值走正常渲染）。golden `10-loss` 已肉眼確認；`verify_roundtrip` **8/8**、verify_drag 16/16、smoke 零錯誤；三副本同步。
> - 📌 **收養/寄養線顏色確認**：標準（McGoldrick）為**單色**（收養=虛線、寄養=點線，無顏色）；參考圖的藍/綠僅該圖美化。**維持黑色**（單色對影印/去識別化最穩）。來源：genogramai / genogrampro / genosm。
> - ✅ **C 點選關係線/鉛筆位置修正**：抽 `_editButtonAnchor`——family 線鉛筆放「子女下行段（路徑最後一段）中點」而非弧長中點（原本落在主幹/橫桿、且兩親家庭主幹 X 用夫妻中點與單親 x 不符 → 浮在線外）。鉛筆與命中測試共用同一錨點。`verify_pencil.js` 驗證 + 肉眼確認鉛筆落在子女線上。
> - ✅ **D 對調方向鈕上畫布**：鉛筆外側（同法線 offset 54）加一顆「⇄」鈕，點擊直接 `swapRelationshipDirectionById`（不經 modal）；婚姻（非方向性）不顯示。modal 版改為呼叫同一函式。`verify_pencil` 6/6（含 swap 命中、對調、婚姻不顯示）；golden 12/12、verify_drag 16/16；三副本同步。
> - 🎉 **Phase 1（臨床補完）全部完成**：收養/寄養線 ✅、同卵 bar ✅、虐待方向性 ✅、流產損失集 ✅ —— **McGoldrick 三大結構缺口 + 虐待方向性 全補齊**（僅餘案主灰底 vs 雙線框的「有記錄變體」+ CSS 虐待 swatch 箭頭兩個小 TODO）。
> - ✅ **Phase 2A.1 完成：非並排婚姻線正交化**：`drawMarriageLine` 同列維持原直線（`|Δy|≤1`，既有圖 0 差異）、不同列改正交繞線（水平出→垂直→水平入），裝飾仍落垂直段中點（裝飾碼未動）。golden fixture `11-marriage-offset`（已肉眼確認結婚/離婚非並排皆乾淨正交、`//` 落在路徑上）+ 01-10 全 0 差異；verify_drag 16/16；canvas.js 三副本同步。**解掉使用者最初痛點「配偶不同列就歪成斜線」。**
> - ✅ **Phase 2A.0 完成：婚姻線幾何收斂 + 修三處現存不一致**（2026-06-18，對抗式 workflow 觸發）
>   - 背景：使用者問「關係線可不可以自己調成 一/ㄇ/ㄩ 折線」。跑 5-agent workflow（程式碼實況 / 業界研究 / 路由器設計 → 綜合 → 對抗式批判）定調：**值得做，但折線是「把線畫乾淨」的收尾層，非排版層**（業界 McGoldrick/NSGC/GoJS 婚姻線一律直線、靠佈局解重疊）；且批判 agent 對照原始碼挖出 **2A.1 上線時夾帶的現存不一致**。
>   - 我逐項驗證（不照單全收）：**3 真 1 假**。真：① Level-0 跨列婚姻高亮畫直線、主線卻正交（[canvas.js] 舊 1329-1331）；② 同前，hit-test 當直線、點不準（舊 4459-4474）；③ 天橋 hit-test 用側邊連接點、drawBridgeLine 用頂端點，垂直腿差半節點寬（批判沒抓到、我額外發現）。假：批判說裝飾飄離線外——實測 `(centerX, centerY)` 正是正交垂直段中點，裝飾在線上。
>   - 做法：新增**唯一幾何來源** `getMarriageGeometry(from,to,config)→{points,decoration}`（純函數、不查渲染狀態、確定性）+ `drawMarriagePath()`；主線（drawRelationship marriage 分支）、選中高亮、hit-test（getRelationshipPath marriage 分支）三處全部改呼叫它。舊 `drawMarriageLine`/`drawBridgeLine` 標 `@deprecated`（不再被呼叫）。
>   - 驗證：**golden 16/16 0 差異**（純 refactor，主線 pixel 不變，僅修不被 golden 覆蓋的 highlight/hit-test）；新測試 `verify_marriage_geom.js` **13/13**（跨列正交點得到、draw==hit==highlight、天橋垂直腿=節點中心、確定性連算 3 次一致）；pencil 6/6、drag failed=0、fixes/hh_lc/childlink 7/7/twins 8/8/roundtrip 8/8 全綠；canvas.js 三副本 md5 同步。
>   - 新增 golden fixtures（鎖定 F-1 升級案例，供後續 before/after）：`13-multimarriage-overlap`、`14-multimarriage-full`、`15-maximal`（+手足）、`16-multifamily`（+各配偶原生家庭）。已肉眼確認現況亂象並逐層診斷（見對話）。
> - ✅ **Phase 2A.1 完成：同列婚姻線「夾人 → ㄩ 下折越障」**（2026-06-18）
>   - `getMarriageConfiguration` 算 `isArch`/`archBarY`；`_marriageCorridorObstacles` 找「嚴格夾在配偶 X 之間 + 大致同列(`|Δy|<60`)」的他人（確定性：(x,id) 排序）。
>   - getMarriageGeometry 的 arch 用「**正下方中心**連接」(cardinal bottom，使用者要求不貼角邊)，自底部垂直下行→橫越→上行。**方向選 ㄩ(下)而非 ㄇ(上)**：被夾者親子線多從上方來，往下避開；且本婚姻子女本就掛線下方。
>   - **雙向耦合解法**：`archBarY` 由 config 提供，getMarriageGeometry（畫線/高亮/命中）與 `drawFamilies`（子女下行掛接點）共用 → 子女線連到實際 arch 橫桿、不浮空。
>   - 效果：fixture 15/16 本人↔現任不再穿過手足；手足上方親子線不受影響；幼女正確掛橫桿。golden 15/16 已肉眼確認並重建基準。
> - ✅ **Phase 2A.2 完成：天橋「只在同側需跨過才架」**（2026-06-18）
>   - `getMarriageConfiguration` 層級從「婚期排序」改為「**同側、且比本配偶更靠近 hub 的其他配偶數**」(需其他配偶座標 → this.personMap)。對側/單獨配偶 = level 0 = 直線側接。
>   - 效果：fixture 04/13/14（前妻左、現任右為對側）天橋消失 → 兩條直線側接 + 親子下行乾淨零疊線（解掉「天橋腳 vs 親子下行」根因）。golden 04/13/14/15/16 重建基準。
> - ✅ **手動繞線覆寫完成（端到端）**：`Relationship.routeMode`（auto/over/straight/under，預設 auto、進 toJSON、舊檔相容）+ getMarriageConfiguration honor + 編輯 modal「婚姻線走法」選擇器（僅 marriage 顯示、高亮現值、點選即套用關閉看效果）。三形狀對應使用者三草圖：`over`=頂端中心ㄇ、`straight`=側邊直線、`under`=底部中心ㄩ。新測試 `verify_marriage_geom.js` **19/19**（含 2A.1 arch + 2A.2 同側天橋）；routeMode 專測 11/11（幾何/持久化/UI 顯示）；全回歸綠；js+index.html+css 三副本同步。
>   - **ㄇ(over) 的已知限制（使用者確認保留 + 標註）**：頂端中心是「父母線」接點，若該人有父母，ㄇ 婚姻線會與父母線在頂端相疊 → 醜。故 ㄇ 按鈕 title 標「上方無父母時才適用」；**ㄩ/auto 為好的預設**。
> - ✅ **走法選擇器移到「畫布上鉛筆旁」 + 鉛筆方向修正（2026-06-18 使用者回饋）**：
>   - **鉛筆方向**：抽 `_editButtonGeom`（draw/hit-test/swap 共用）。婚姻線 ㄩ 下折時，錨點(橫桿)在節點下方 → 鉛筆/鈕群改朝**下方清空區**（原本固定朝上、擠在「節點與下折橫桿之間」難點選）。
>   - **走法鈕上畫布**：`drawRelationshipRouteButtons` + `getRouteButtonModeAt` + `_routeButtonCenters`，選取婚姻線時於鉛筆外側(offset 56)畫一列 `自 ㄇ 一 ㄩ`（固定螢幕左→右、active 桃紅高亮）；pointerdown 先檢走法鈕 → `App.setRouteModeById` 即時套用重繪。**移除 modal 內走法群組**（HTML/CSS/binding/show-hide 一併清掉），避免兩處重複。
>   - 驗證：pencil 6/6（_editButtonGeom 重構未破壞 family 鉛筆）、golden 16/16、marriage-geom 19/19、drag/roundtrip/childlink 全綠；canvas.js/app.js/index.html/css 三副本 md5 同步。
> - ✅ **按鈕群「Z-index 點擊優先」取代「自動閃避」（2026-06-18 使用者定案：點擊後出現 + z-index 最穩）**：
>   - 一度做的 `_clearButtonOffset`（依節點翻面/推離）因「位置會跳、不可預測」**已撤回**。`_editButtonGeom` 回固定 `baseOffset:24`（保留 ㄩ 朝下的固定規則）。
>   - 改為 **z-index 點擊優先**：pointerdown 在 select 工具一進入就先檢查「鉛筆/⇄/走法鈕」(關係已選取時)，**早於節點命中** → 鈕繪在最上層、點擊也最先判定，疊在角色上也點得到鈕。真實 `page.mouse.click` 驗證：節點疊在走法鈕上 → 點擊選到鈕(routeMode 變)、底下角色未被選。
> - ✅ **快速新增鈕（父母/手足/伴侶/子女）改「選取角色後顯示」（2026-06-18 使用者：hover 不要冒出）**：canvas render 由 `hoveredPersonId` 改 `selectedId` 判定；pointerdown 點擊偵測由 hoveredPersonId 改 `selectedPersonId`；pointermove 移除 hover→鈕的追蹤與 re-render（游標 pointer 改為「選取角色的鈕上」才變）。驗證：hover 未選取→無鈕、選取→有鈕、選取後點兒子鈕→新增子女；golden 16/16、pencil 6/6、drag/hh_lc 全綠；canvas.js/app.js 三副本同步。
> - ✅ **壓力測試 workflow（2026-06-18，5-agent：多婚矩陣/手足多家族/走法覆寫/邊界對抗 → 綜合）**：**136/136 自動不變量檢查全過、0 console error**。draw==hit（每條婚姻 getRelationshipPath===getMarriageGeometry.points）、確定性、裝飾落線(0px)、走法鈕 hit-test、持久化、z-index 點擊優先 全部優秀。
>   - **修掉測試找到的 Bug #1（中度視覺）**：ㄩ 下折橫桿過淺（archBarY = 符號底緣 +24）會壓在被夾成員的**姓名文字**上。修法：新增 `_labelBottomY(p)`（符號底 + 姓名 8+fontSize + 備註最多2行），`botMost` 改用它、`underBarY = botMost + 14` → 橫桿落到姓名下方。golden 15/16 重建（已肉眼確認橫桿在名字下方、子女正確掛接）；marriage-geom 19/19、drag 全綠；canvas.js 三副本同步。
>   - **觀察（不處理）**：同一對配偶建兩條婚姻線(married+divorced)會幾何重疊——臨床上一對配偶只有一條婚姻關係、狀態靠日期標註，非真實情境。
> - ✅ **`geno/` 整理為「可部署 · 全本地離線」發行資料夾（2026-06-18 使用者要上架此版本）**：
>   - 使用者選「全本地自帶」。geno/index.html 的 3 個 **CDN 引用改為本地**：Google Fonts → `fonts/noto-sans-tc.css`（105 個 woff2 子集）、jspdf CDN → `js/vendor/jspdf.umd.min.js`、dagre CDN → `js/vendor/dagre.min.js`。
>   - **⚠️ geno/index.html 自此與 root index.html 分歧（本地 vs CDN），不再 md5 一致 → 日後同步「不可」把 root/index.html 覆蓋到 geno/**（geno/js/* 與 css 仍與 root 同步）。geno/ 為此版的發行快照。
>   - 驗證：新測試 `verify_geno_deploy.js` **封鎖所有 http(s) 請求**後載入 geno → app 就緒、dagre/jspdf 本地載入、Noto Sans TC 本地字體可用、0 console error、**零外部請求**，可建家庭正常渲染。geno 結構：`index.html / css/ / js/(含 vendor,domain) / fonts/ / manifest.json / icon-512.png`，6.3M（字體 4.7M）。
>   - 注意：geno/ 在 .gitignore 內（本機副本）。若要走 GitHub Pages 從本 repo 部署，需另解除忽略或改部署方式；若直接「拿資料夾上傳主機 / 本機開 index.html」則即可用。
>   - 後續：使用者把舊 geno/ 刪除、將乾淨副本 geno-deploy/ 改名為 geno/（單一部署資料夾）；`verify_geno_deploy.js` 可帶資料夾名參數（預設 geno）。
> - ✅ **兩個使用者回報的小 bug 修正（2026-06-18）**：
>   - **A：ㄩ 下折婚姻線的「日期/標籤文字」沒跟著線 → 被列上符號/姓名擋住**。婚姻標籤定位原只處理 isBridge（文字放橋上方），漏了 isArch。修：加 isArch 分支（文字 X=橫桿中點、Y=archBarY）+ 文字改放橫桿「下方」（`textOffsetY = totalHeight + 8`，正向），與 ㄇ 放上方對稱。golden 15/16 重建（標籤移到橫桿下方、不再被擋）。
>   - **B：選取關係線後，滑鼠移到 自/ㄇ/一/ㄩ 走法鈕、鉛筆、⇄ 上沒有 pointer(手)游標**。修：handlePointerMove 加「selectedRelationshipId 時，命中 getRouteButtonModeAt / isPointOnEditButton / isPointOnSwapButton → cursor=pointer」。新測試 `_cursor.js` 驗證（鈕/鉛筆 pointer、空白非 pointer）。
>   - 驗證：marriage-geom 19/19、pencil 6/6、drag 0；canvas.js/app.js 同步 root + geno + refactor/app；geno 離線驗證 6/6 仍過。
> - ❌ **Phase 2A.3（自動佈局）不做（使用者決定 2026-06-18）**：couple-vertex 自製 packer 太複雜、且黑箱排版對臨床個案圖不夠可控。**改以「手動拖曳擺位（既有吸附）+ 手動繞線覆寫（ㄇ/一/ㄩ）」處理多家族糾纏案**——位置與線走法都由使用者掌握，較自動排版可信。15/16 那種「手足夾在配偶間」由使用者自行把配偶拖近、或對該線指定走法。
>   - 連帶不做：拒畫門檻、「ㄇ↔ㄩ 自動翻面」智慧化（auto 夾人固定走 ㄩ 已足夠，特例用手動覆寫）。
> - ⏭️ **仍可選的小改進（非必要）**：拖曳途中一律畫直線、放開才重路由一次（避免拖曳中折線閃跳）。目前拖曳即時重算幾何，多婚/夾人情況拖動時形狀會即時變化——若使用者覺得干擾再做。

0. **修兩個 HIGH 連接線缺陷（暖身，見 §8）** —— B2（連接無預覽線）、B1+B3（親子方向未正規化）。小修、低風險、立刻有感、不碰凍結符號；方向修正一律走既有 `normalizeLoadedFamilyRelationships`，不另造 Y 推斷邏輯。
1. **Phase 0a（kinship memoize）** —— 純效能、零視覺、`fps_bench` 立刻看到、不碰凍結符號。當整條路的 proof-of-concept。
2. **Phase 0c（golden-image 閘門）** —— 之後所有視覺改動的安全網，先建起來。它也是修 B5/B6/B7/B8（線條幾何缺陷）的前提。
3. **Phase 1（收養/寄養線 → 同卵 bar → 方向性 → 流產集）** —— 最便宜、最貼個案的臨床補完，此時已有護欄。

> 連線重構（Phase 2A）在 golden-image 就緒後即可動；個案工具層（Phase 3）與臨床補完可並行，因為它們動的是不同檔案區域。線條幾何缺陷（B5/B7）會被 Phase 0「統一路徑數學」一併清掉，不是額外的工。

---

## 8. 已知缺陷清單（2026-06-17 對抗式驗證）

> 來源：三路 bug 獵查（切換型別 / 拉線連接 / 線條幾何）+ 逐項對抗式驗證（預設懷疑、試圖推翻，只收「確認為真」）。
> 共 **10 個確認缺陷**（3 高 / 5 中 / 2 低）。「歸屬」= 折進哪個 Phase 或共用機制，多數不是額外的工。
>
> **狀態（2026-06-17）**：✅ **B1 B2 B3 B4 B9 B10 已修並三副本 md5 同步**（皆為邏輯/UX/清理，不改 pixel，已 `node --check`）。
> ⏳ **B5 B6 B7 B8（線條幾何）未動**——它們改 pixel，必須等 **Phase 0c golden-image 護欄**就緒、隨 Phase 0「統一路徑數學」一起清。
> ⚠️ golden-image 與既有回歸（verify_drag / smoke_visual）需要 **playwright**，本機使用者尚未安裝。

| 編號 | 問題 | 檔案:行 | 嚴重 | 歸屬 |
|---|---|---|---|---|
| **B1** | 切換型別到 `parent-child` 時**未正規化方向** → `getParentIds/getChildrenIds` 查錯 | `app.js:2932` `updateRelationshipType` | 高 | Phase 1 方向性／走既有正規化 |
| **B2** | 連接模式**無橡皮筋預覽線**：`handlePointerMove` 無 `connect` 分支，`targetX/Y` 從未設定 | `app.js:872` + `canvas.js:320` | 高 | 獨立快修（暖身） |
| **B3** | 點「子→父」順序建立親子線 → **存成反向邊**（要存檔重載才被修正） | `app.js:3042` `createRelationship` | 高 | Phase 1 方向性／走既有正規化 |
| **B4** | 舊 `family` 型別 `getCategory` 回 `emotional` → 同一對可同時存在 `family` + `parent-child` **重複邊** | `relationship.js:121` | 中 | 獨立快修（含建立時正規化） |
| **B5** | wave/zigzag 線：**畫波浪、命中測試卻用直線** → 振幅大時點不到／選錯 | `canvas.js:4387` `getRelationshipPath` 忽略 pattern | 中 | Phase 0 統一路徑數學吸收 |
| **B6** | 複合線（close-hostile / fused-hostile / conflict-close）zigzag **殘留外層虛線** → 本該實線變虛線 | `canvas.js:1838/1847/1861` | 中 | Phase 0 統一路徑／可獨立快修 |
| **B7** | wave/zigzag 裝飾（圈/X/框）畫在**直線中點**，偏離可見線 ~5px | `canvas.js:1582` `drawEmotionalDecorations` | 中 | Phase 0 統一路徑數學吸收 |
| **B8** | 短線 + 末端箭頭時 `endMargin(22) > 線長` → **波浪被壓到幾乎看不見** | `canvas.js:1823` | 中 | 獨立快修（clamp endMargin） |
| **B9** | 點自己連自己：**靜默無反饋**、無提示 | `app.js:652` | 低 | 獨立快修（加 status 提示） |
| **B10** | `lastEditButtonPosition` 存了**從未被讀**（死碼） | `canvas.js:4454` | 低 | 清理 |

### 已驗證為正常（排除誤報，記錄備查）

- 多條情感線平行偏移：**已用 canonical direction（較小 id 起點）解決**，畫線 + 命中測試兩邊一致，不會翻面重疊。
- 鉛筆編輯鈕點擊區與繪製位置一致（共用同一 `getRelationshipPath`）。
- 天橋裝飾中點正確（即使兩端不同 Y）。
- 切換情感子型別不改方向 —— 語意一致，非缺陷。
- 關係建立後 `connectingFrom/To` 在 `render()` 前已由 `closeRelationshipModal()` 清除。

### 缺陷與路線圖的關係（重點）

- **B1/B3**（方向）= Phase 1「虐待線方向性」+ `GENERATION_POLICY` 的同一件事；修法是讓「建立 / 切換」都走**既有的載入正規化函式**，不另造 Y 推斷。
- **B5/B6/B7/B8**（線條幾何）= 「路徑數學寫三遍」的後遺症，會被 Phase 0「統一路徑數學 + golden-image」一次清掉。
- **B2/B4/B9/B10** = 各自獨立的小修，不依賴任何 Phase。
