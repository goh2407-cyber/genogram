# Desktop RWD、走線與圖例同步優化設計

日期：2026-07-15  
狀態：使用者已核准設計方向，等待書面規格確認

## 1. 背景

目前家系圖在寬螢幕已有穩定的桌機介面，也具備 Inspector 收合、工具列圖示模式與 980px 自動收合行為，但 CSS 同時存在 1560、1180、1170、980、768px 等多組重疊斷點。1024–1180px 的筆電與平板橫向容易遇到工具列、文件名稱、全域操作及右側 Inspector 互相擠壓。

關係線已具備家庭走線規劃器、婚姻幾何、平行情感線及三方圖例，但側欄圖例的分組與列對齊仍可改善；規劃器目前只移除連續重複點，尚未移除共線中繼點。這次調整必須保留現有臨床符號與配色，不重新設計任何關係線語意。

## 2. 目標

1. 讓 1024–1920px 的桌機、筆電與平板橫向介面穩定可用。
2. 在 1024–1180px 保留最大畫布寬度，Inspector 預設為窄軌並可覆蓋展開。
3. 改善側欄圖例與匯出圖例的分組、對齊與閱讀層級。
4. 清理關係路徑中的冗餘幾何，維持畫面、命中、編輯與匯出的單一路徑來源。
5. 保持根目錄、`geno/`、`refactor/app/` 三副本一致。

## 3. 不在範圍內

- 不做 1024px 以下的手機版或平板直向專用版。
- 不新增底部導覽、漢堡選單或手機手勢。
- 不更改人物符號、臨床圖示、關係類型、資料格式或儲存格式。
- 不更改任何關係線顏色、粗細、實線／虛線／點線節奏、波浪／鋸齒形狀、箭頭、斜線、圓、房屋、X、暴力或虐待標記。
- 不因走線優化自動移動人物。
- 不重構與本需求無關的 Canvas、Storage 或 KinshipEngine。

## 4. 已評估方案

### 4.1 中尺寸 Inspector

1. **窄軌＋覆蓋式展開（採用）**：平時只占 52px，展開時覆蓋畫布，不改變 Canvas 寬度。
2. 固定縮窄面板：操作直接，但 1024px 時永久少約 260–296px 畫布。
3. 工具列換行：保留固定面板，但同時犧牲畫布寬度與高度。

採用方案 1，因為家系圖的主要工作面是 Canvas；中尺寸裝置應優先保留圖面空間。

### 4.2 圖例與走線

1. 只整理走線。
2. 只整理圖例。
3. **走線與圖例同步優化（採用）**。

採用方案 3，但以保守方式實施：只整理幾何、分組、間距與一致性，不改線型圖示或顏色。

## 5. Responsive Shell 設計

### 5.1 支援範圍與模式

| Viewport 寬度 | 模式 | Inspector | 工具列與文件資訊 |
|---|---|---|---|
| `>= 1561px` | 寬桌機 | 316px 固定面板，可手動收合 | 顯示完整標籤與文件資訊 |
| `1181–1560px` | 標準桌機／筆電 | 固定面板，可手動收合 | 工具按鈕使用圖示模式；不得碰撞 |
| `1024–1180px` | Compact | 預設 52px 窄軌；展開為 296px 覆蓋層 | 工具列與全域操作使用圖示模式；隱藏文件名稱；不得換行 |
| `< 1024px` | 非支援範圍 | 不提供手機重排 | 應用維持 1024px 最小版面寬度，瀏覽器可水平捲動 |

現有 768px 將側欄移出畫面的舊手機規則不再負責產品行為；它必須移除或被 1024px 最小寬度策略完整取代，避免與 Compact 模式衝突。

### 5.2 Inspector 狀態

Inspector 的「版面模式」與「使用者選擇」分開處理：

- Desktop 模式：`expanded` 或 `collapsed`，沿用推擠 Canvas 的既有行為。
- Compact 模式：`rail` 或 `overlay-open`；兩種狀態都不改變 Canvas 的 layout width。
- 進入 Compact 時預設關閉為 `rail`。
- Compact 中點擊窄軌／toggle 開啟 296px 覆蓋層；再次點擊關閉。
- 點擊 Canvas 空白處或按 `Escape` 關閉 Compact 覆蓋層。
- `Escape` 必須遵守既有優先順序：先處理開啟中的 Modal、放置預覽、連線或拖曳，再處理 Inspector 覆蓋層。
- 回到 Desktop 時，若使用者曾手動選擇收合，保留其選擇；否則恢復固定展開。
- Compact 覆蓋層開關不得寫入家系圖資料、LocalStorage 圖面狀態或 Undo history。

### 5.3 Compact 視覺與互動

- 覆蓋層固定在 global bar 下方、畫面右側，寬 296px，使用現有白色面板、邊線與陰影語彙。
- 52px 窄軌只顯示可操作的 Inspector toggle，不複製 tab 或內容。
- 覆蓋層開啟時仍保留屬性／圖例／檢視三個 tab 與原有 ARIA 關係。
- 所有圖示按鈕的可點擊區至少 36×36px，保留 `title` 與 `aria-label`。
- Canvas tool dock 不換行；在 1180px 以下隱藏文字標籤並維持置中。
- 文件名稱在 1180px 以下隱藏，避免與中央 dock 相撞。
- Compact 覆蓋層不觸發 Canvas resize；Desktop 推擠式收合才觸發 resize。

## 6. 關係線幾何優化

### 6.1 不變條件

以下輸出必須逐項保持：

- `Relationship.getLineStyle()` 的 `color`、`width`、`pattern`、`decoration`。
- `DASH_PATTERNS` 的所有數值。
- Canvas 的 `lineCap = round`、`lineJoin = round` 與各特殊 pattern 的繪法。
- 婚姻線的 routeMode 語意、親子 `from=parent → to=child` 方向、情感線方向與箭頭。
- 既有 18px 平行情感線間距與以人物 id 正規化方向的對稱排列。

### 6.2 路徑清理

`FamilyRoutePlanner` 的輸出在回傳前執行單一、純函式式清理：

1. 移除非有限座標。
2. 移除連續重複點。
3. 移除位於同一水平線或垂直線上的共線中繼點。
4. 若最後只剩一點，保留現有雙點退化 fallback，避免 Canvas path 無法繪製。

清理不得改變路徑端點、不得把正交線變成斜線，也不得將原本安全的路徑移入障礙物。

### 6.3 路徑來源一致性

- 家庭關係的畫面、hit-test、鉛筆錨點與 PNG／JPEG／SVG／PDF 匯出共用清理後的 planner path。
- 婚姻關係繼續共用 `getMarriageGeometry()`。
- 情感關係繼續共用 `getSmartPath()` 及既有平行 offset；不建立只供畫面或只供匯出的第二套幾何。
- 無安全候選時沿用現有有限座標 fallback，並保持結果具確定性。

## 7. 圖例資訊架構

### 7.1 分組與順序

側欄與匯出圖例統一為三個主群組：

1. 家庭與伴侶：親生／收養／寄養子女、結婚、訂婚、同居、法律同居、分居、法律分居、離婚、喪偶、外遇。
2. 情感關係：正向與負向情感關係，沿用目前類型順序。
3. 暴力與特殊關係：暴力、各類虐待、忽視、操控、控制。

不得刪除現有關係類型。關係建立 Modal 的按鈕類型、文字與功能保持不變。

### 7.2 單一 metadata 來源

在 `Relationship` 提供只讀的圖例 section metadata，包含：

- section id 與顯示名稱；
- entry 的 type、顯示文字及現有 `.legend-line` class；
- 固定順序。

側欄圖例與匯出圖例都讀取這份 metadata。線條視覺仍由既有 `.legend-line` SVG、`Relationship.getLineStyle()` 與 Canvas 裝飾繪製負責，不在 metadata 複製顏色或 dash 數值。

### 7.3 側欄版面

- 保留現有 40×14px 圖例 SVG，不修改圖示內容。
- 每列使用固定 sample 欄、12px 間距及一致文字基線。
- 群組標題與內容之間使用現有設計 token，不新增品牌外配色。
- 列高至少 30px；hover 只能改背景，不改線條顏色。
- Desktop 固定面板與 Compact 296px 覆蓋層均使用單欄排列，不做雙欄壓縮。

### 7.4 匯出圖例

- 群組、順序與名稱跟側欄相同。
- 繼續使用實際 line style 與裝飾繪製函式。
- 匯出圖例的換欄或換頁只改排版，不縮放或重畫臨床符號。
- View 選項隱藏情感關係時，沿用既有規則移除對應匯出 section；暴力／虐待仍保留。

## 8. 資料與錯誤處理

- 本功能不新增可序列化欄位，不改 JSON schema。
- resize、media-query 切換與 Inspector overlay 開關不得建立 history。
- 若媒體查詢 API 不可用，fallback 為 Desktop 既有布局。
- 若圖例 metadata 遇到未知 type，忽略該 entry 並保留應用可用性；測試必須保證正式 metadata 不含未知 type。
- 所有 resize 後 render 必須維持零 `NaN`／`Infinity`、零 page error、零 console error。

## 9. 可及性

- Inspector toggle 的 `aria-expanded` 在 Desktop 表示面板是否展開，在 Compact 表示 overlay 是否開啟。
- Compact rail 的 toggle 文字為「展開檢視面板」；開啟後為「收合檢視面板」。
- Overlay 不使用 modal 語意，Canvas 仍可見；但點擊 Canvas 會關閉 overlay。
- tab 的 roving tabindex、Home／End／左右鍵行為保持不變。
- `prefers-reduced-motion` 下取消 overlay 與面板寬度動畫。

## 10. 驗收與測試

### 10.1 RWD

- 1920×1080：完整桌機 shell、316px Inspector、無碰撞。
- 1366×768：標準桌機 shell、Inspector 寬 296–336px、工具列無碰撞。
- 1180×820：Compact rail 預設 52px，Canvas 不被 296px 永久推擠。
- 1024×768：工具列不換行、不溢出；文件名稱隱藏；overlay 開關不改 Canvas width。
- 1023px：應用保持 1024px 最小布局，不套用手機重排。
- Compact overlay 可由 toggle 開關，並可由 Canvas click 與合適優先序的 Escape 關閉。
- Desktop／Compact 來回切換保留既有手動收合選擇。

### 10.2 線條

- 路徑清理測試覆蓋重複點、水平共線、垂直共線、退化單點與非有限點。
- 清理前後端點相同、所有段保持水平或垂直、障礙物安全性不下降。
- 畫面、命中、鉛筆與匯出的點序列完全一致。
- `Relationship.getLineStyle()` 與 `DASH_PATTERNS` 建立凍結快照；本功能不得改變快照。
- 既有婚姻、親子、情感、暴力／虐待與 7 條平行情感線測試全數通過。

### 10.3 圖例與視覺

- 側欄與匯出圖例的 section、entry 數量、順序、文字一致。
- 既有 40×14px `.legend-line` SVG data URI 的內容 hash 不變。
- View 隱藏情感關係時，匯出圖例仍保留暴力／虐待類型。
- 1024、1180、1366、1920px 各產生一張 shell 視覺快照供人工檢查。
- Golden 差異必須逐張分類：只允許核准的路徑位置／圖例排版差異；人物符號、線色或線型差異視為失敗。

### 10.4 發布 Gate

- 完整 `verify_*.js` 套件通過。
- `smoke_visual.js` 通過且零 console/page error。
- Golden 16/16 通過；若核准更新 baseline，更新前後差異圖需保留供檢查。
- 根目錄、`geno/`、`refactor/app/` 的 JS 與 CSS raw MD5 一致；`geno/index.html` 保留本地 vendor 路徑及離線能力。

## 11. 預計修改範圍

- `css/styles.css`：整理斷點、Compact rail／overlay、圖例列與群組版面。
- `index.html`：圖例容器與 1024px 最小 viewport 宣告；不修改現有線條 SVG data URI。
- `js/app.js`：Responsive Inspector 狀態與圖例 section render。
- `js/domain/family-route-planner.js`：正交路徑清理。
- `js/relationship.js`：只讀圖例 metadata，不改 `getLineStyle()`。
- `js/canvas.js`：匯出圖例讀取共用 metadata；不改臨床線條樣式。
- `refactor/verify_ui_shell.js`：1024–1920px RWD 與 overlay 驗收。
- `refactor/verify_family_route_planner.js`、`refactor/verify_family_routing.js`：路徑清理與共用幾何驗收。
- 新增 `refactor/verify_legend_consistency.js`，驗證側欄／匯出分組與既有線條 SVG hash。
- 同步 `geno/` 與 `refactor/app/` 本機副本。

## 12. 完成定義

使用者可在 1024px 寬度下保有穩定、不換行的工具列與大部分 Canvas；Inspector 以窄軌待命並可覆蓋展開。側欄與匯出圖例具有相同的三段分組、順序與線條來源。家庭路徑不含可移除的重複／共線中繼點，且畫面、命中、編輯與匯出維持相同幾何。任何臨床圖示、關係線顏色、粗細、dash、pattern 或 decoration 均不得因本功能改變。
