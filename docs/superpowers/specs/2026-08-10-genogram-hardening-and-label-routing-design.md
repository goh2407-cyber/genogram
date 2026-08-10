# 家系圖發布前強化與人物文字避障設計

日期：2026-08-10
狀態：操作方向已由使用者核准，書面規格待確認
基準分支：`codex/parent-pair-fixed-center`（`386c1d2`）

## 1. 背景

本輪稽核確認目前 Canvas 核心效能與既有臨床符號不需重寫，但發布前仍有數項安全、資料正確性、鍵盤流程與易用性問題。使用者另提供一張多重伴侶家系圖，人物「62」沒有姓名、只有兩行診斷備註；下繞的伴侶線進入人物文字區，文字白色 halo 再把線遮住，使關係線看起來斷裂。

目前相關實作有四個不同步點：

1. `.modal-overlay` 隱藏時只有 `visibility: hidden`，沒有立即停用 pointer hit testing 的明確不變量。
2. 屬性面板與子女選擇視窗把匯入的人名、備註、關係說明插入 `innerHTML`。
3. `Person` 建構子以 `||` 設定 `age`、`x`、`y`，合法的 `0` 會被當成缺值。
4. 人物文字、家庭避障、婚姻下繞高度與匯出邊界各自計算文字範圍；其中 `_labelBottomY()` 與 `getPersonRouteObstacles()` 在沒有姓名時會漏掉備註。婚姻 ㄩ 形線即使把橫桿降到文字下方，從人物底部出發的垂直腿仍可能穿過人物自己的置中文字。

## 2. 已核准的執行順序

依風險與相依性分成六個階段：

1. Modal 點擊攔截。
2. DOM XSS。
3. `0` 值存載。
4. Modal／Undo 鍵盤流程。
5. 人物文字與關係線避障。
6. 空狀態與非臨床 UI 對比微調。

前三項屬發布阻擋級的互動、安全與資料正確性修復；第四項先收斂 modal 與 history 狀態；第五項才改動共用幾何；最後進行不影響資料與圖形語意的視覺微調。每一階段必須有獨立測試與可單獨回溯的提交，不把安全修復和 Canvas 幾何混在同一提交。

## 3. 設計目標

1. 關閉的 modal 不可攔截 Canvas 或任何背景控制項的點擊。
2. 匯入資料中的姓名、備註、關係說明、同住框備註與生活圈名稱永遠只被視為純文字。
3. `age: 0`、`x: 0`、`y: 0` 經建構、儲存、載入、Undo／Redo 與 clone 後保持不變。
4. Modal 具備可預測的焦點、Tab、Escape 與背景快捷鍵隔離；屬性編輯可以一筆 Undo 還原。
5. 自動走線在存在安全候選時不得穿過可見人物文字。
6. 使用者強制選擇「一直線」時保留直線幾何，若直線撞到人物文字，移動整個人物文字區而不縮小字型。
7. 螢幕、選取高亮、命中判定、關係編輯控制、日期位置及 PNG／JPEG／SVG／PDF 匯出共用相同幾何。
8. 空白畫布能清楚引導第一次操作；一般 UI 文字與焦點狀態符合 WCAG AA，臨床線色與符號完全不變。

## 4. 不變量與非目標

- 不改變方形、圓形、三角形、同性別符號、案主灰底、死亡 X 或醫學區塊的臨床語意。
- 不改變任何關係線型、顏色、虛線間距或方向語意。
- 親子方向仍只由 `KinshipEngine` 與正規化後的 `from=parent, to=child` 決定，不以 Y 座標推論。
- 不自動重排整張家系圖，也不因避障永久改寫人物座標。
- 文字移位是可重算的顯示幾何，不新增 JSON 欄位，不寫入 Undo history。
- 不引入完整圖形路由函式庫；只增加家系圖需要的有限、確定性候選。
- 不以縮小字型、截斷更多內容或加粗白底作為主要碰撞解法。
- 根目錄、`geno/`、`refactor/app/` 三份應同步的程式副本在每一實作階段結束時必須維持 raw MD5 一致。

## 5. 階段一：Modal 點擊攔截

### 5.1 單一狀態入口

在 `GenogramApp` 收斂 `openModal()` 與 `closeModal()`，由它們管理所有 `.modal-overlay`：

- 開啟：取消 `hidden`／`inert`、設定 `aria-hidden="false"`、加入 `.active`，最後將焦點移入 modal。
- 關閉：立即移除 `.active`、設定 `inert` 與 `aria-hidden="true"`，並立即停用 pointer events；視覺離場動畫結束後再設定 `hidden`，另有固定 timeout fallback，避免漏掉 `transitionend`。
- CSS 基態使用 `pointer-events: none`，只有 `.active` 使用 `pointer-events: auto`。因此即使動畫或 class 清理失敗，非 active overlay 也不能攔截點擊。
- 開啟下一個 modal 前先經單一入口關閉或堆疊目前 modal，不允許多個 overlay 同時可互動。

### 5.2 背景與內容點擊

- 只有 `event.target === overlay` 的背景點擊能觸發可取消 modal 的關閉行為。
- 點擊 `.modal` 內容不得冒泡成背景取消。
- 關閉 gender modal 時必須同步清除 `pendingGeneration` 與 `quickAddContext`；relationship、children、export modal 亦保留各自既有清理語意。

### 5.3 驗收

- 性別選擇完成或取消後，立即點擊 Canvas 可選到人物或開始平移。
- 快速新增、關係、子女、說明與匯出 modal 逐一開關後，頁面不存在透明攔截層。
- 重複快速開關與動畫尚未結束時仍只有一個可互動 modal。

## 6. 階段二：DOM XSS

### 6.1 動態資料不得進入 HTML 字串

屬性面板與子女清單改用 DOM API 建立：

- 靜態結構可由固定模板或 helper 建立，但任何資料欄位只能透過 `textContent`、`value`、`checked`、安全的 `dataset` 或經白名單驗證的屬性設定。
- 人名、人物備註、關係日期／說明、同住框備註、生活圈名稱與匯入檔案內容不得插值到 `innerHTML`。
- 子女選項的性別 class 只允許既有列舉值；生活圈顏色只允許 `LIFE_CIRCLE_COLORS` 白名單。
- 空狀態等完全固定、沒有資料插值的字串可以保留，但優先以 `replaceChildren()` 和共用建立函式減少未來誤用。
- 不自行撰寫以字串替換為主的 HTML sanitizer；本功能不需要接受富文字。

### 6.2 輸入與匯入語意

- 惡意外觀字串仍可作為個案資料保存與 Canvas 純文字顯示，例如 `<img src=x onerror=...>` 必須原樣呈現為文字。
- 不因安全修復改寫或不可逆清洗既有 JSON；安全邊界位於 DOM sink。

### 6.3 驗收

以姓名、人物備註、關係說明、同住框備註與生活圈名稱分別注入含標籤、引號與事件屬性的 payload，驗證：

- DOM 中沒有新增非預期元素或事件處理器。
- 全域測試旗標沒有被執行。
- 屬性欄可再次編輯並保存原始純文字。
- Canvas 與匯出仍以文字方式顯示。

## 7. 階段三：`0` 值存載

### 7.1 預設值規則

- `Person.age` 使用 nullish 預設：只有 `null`／`undefined` 代表未知，`0` 是有效值。
- `Person.x`、`Person.y` 只有缺值時回到預設座標，`0` 必須保留。
- 表單解析時空字串轉成 `null`，數字字串 `"0"` 轉成數字 `0`；不得再用 truthy 判斷。
- 不順便改動空字串、布林 false 與列舉欄位的既有語意，避免擴大 migration 範圍。

### 7.2 往返範圍

同一組 fixture 必須通過：

1. `new Person()` 與 `Person.fromJSON()`。
2. `toJSON()` 與 `clone()`。
3. LocalStorage 自動儲存／恢復。
4. JSON 檔案匯出／匯入。
5. History Undo／Redo。
6. 屬性面板顯示與再次提交。

測試人物至少包含 `{ age: 0, x: 0, y: 0 }`，並驗證 `personMap` 在載入與 Undo／Redo 後同步。

## 8. 階段四：Modal／Undo 鍵盤流程

### 8.1 Modal 焦點

- 每個 modal 具備 `role="dialog"`、`aria-modal="true"` 與可解析的 `aria-labelledby`。
- 開啟時記錄觸發控制項，焦點移到指定初始控制項；關閉後若觸發控制項仍存在且可見，還原焦點。
- Tab／Shift+Tab 限制在最上層 modal 的可操作元素內。
- Escape 永遠先交給最上層 modal 的專屬取消處理，且一次只關閉一層；沒有 modal 時才依序處理 placement、生活圈、connecting、compact inspector 與一般工具狀態。
- Modal 開啟時，背景的新增、刪除、工具切換、儲存與 Canvas Undo 快捷鍵不得生效。

### 8.2 Undo 邊界

- `input`、`textarea`、`select`、`contenteditable` 或具文字輸入語意的元件取得焦點時，Ctrl/Cmd+Z 與 Ctrl/Cmd+Shift+Z 保留給瀏覽器原生文字編輯。
- 人物、關係、同住框與生活圈屬性編輯在 focus 進入時保存「變更前」快照；輸入期間可即時重繪與自動儲存，blur／change 時若資料真的不同，只提交一筆 history。
- 取消 modal 或只開關視窗不新增 history；確認後的新增／修改維持單一原子交易。
- Undo／Redo 前清除 modal、placement preview、連線 ghost、拖曳 guide 與暫存編輯 session，避免復原後殘留過期 UI。

### 8.3 驗收

- Modal 內 Tab 不會跑到背景；Escape 關閉正確視窗並還原焦點。
- 輸入姓名後按 Ctrl+Z 先復原輸入內容，不會刪掉上一個家系圖操作。
- 完成一段屬性修改後，離開輸入框再按 Canvas Undo，恰好回復整段修改一次。
- 快速新增與關係建立取消時 history 長度不變。

## 9. 階段五：人物文字與關係線避障

### 9.1 唯一文字幾何來源

在 `GenogramCanvas` 建立共用的 `getPersonLabelGeometry(person, viewOptions, placement?)`。輸出至少包含：

- 每一列的 `kind`、純文字、font、baseline、`x`、`y`、寬、高與矩形 bounds。
- 整個姓名＋備註區的 aggregate bounds。
- 預設 anchor 與實際 placement。

規則如下：

- 使用與正式繪製相同的 `ctx.font`、`measureText()`、字級及行高。
- 沒有姓名但有備註時，第一行備註從目前 `nameY` 開始，必須產生障礙。
- 姓名隱藏時，備註仍移到第一列；備註隱藏時不產生備註 bounds。
- 整個文字區一起移動，不將姓名與診斷備註拆散。
- `drawPersonText()`、`getPersonRouteObstacles()`、`_labelBottomY()` 與 `getContentBounds()` 不再自行重算文字高度或寬度。
- 匯出 bounds 必須納入文字的 minX／maxX，不只計算下緣，避免長診斷在左右邊界被裁切。

正式走線預設以完整姓名／備註資料建立穩定障礙，使暫時切換「隱藏姓名／備註」不造成整張關係線跳動；實際繪製與匯出裁切則使用目前 view options 的可見文字 bounds。

### 9.2 自動婚姻走線

沿用 `getMarriageConfiguration()`、`getMarriageGeometry()` 與 `drawMarriagePath()` 的單一幾何架構，增加有限候選與矩形相交檢查：

1. 同列、無障礙的主要伴侶維持現有側邊直線。
2. 同側多位伴侶維持確定性的 rank，額外伴侶優先使用不同高度的上方天橋。
3. 需要下繞時，從人物底部 cardinal port 離開，在符號與第一列文字之間的空隙短距離側移，於文字 bounds 外側下行，再於所有相關文字下方橫越，最後鏡像接回另一人物。
4. 若內側走廊不足，固定比較左、右外側走廊；以「零文字碰撞、較少線交叉、較少轉折、較短總長」排序，完全同分時使用固定方向與 ID 次序，確保輸入相同即得到相同點集。
5. 自動候選只要存在安全解，就不得以白色 halo 掩蓋穿線。

線段與文字矩形之間保留 6–8px 世界座標安全距離；精確常數在實作計畫以測試 fixture 決定，不隨縮放改變。

### 9.3 強制一直線時的文字移位

`routeMode="straight"` 是使用者明示的幾何要求，不能偷偷改成折線。處理順序為：

1. 先產生直線。
2. 若直線不碰預設文字區，文字維持符號下方。
3. 若碰撞，依序評估整個文字區的左、右候選；候選不得碰人物符號、其他可見文字或該直線。
4. 選擇移動距離最短的安全位置；同分時使用固定方向，避免每次 render 左右跳動。
5. 文字移位只存在於衍生幾何，不修改 Person JSON 或人物座標。
6. 極端密集、所有候選均不安全時，保留使用者指定直線並選擇碰撞最少的候選，同時在編輯器顯示不進匯出的警示；不縮字、不無界搜尋、不自動移動其他人物。

### 9.4 共用消費者

下列功能必須讀取相同的 route／label geometry：

- 螢幕正式線條與人物文字。
- 關係線選取高亮與 hit-test。
- 鉛筆、走法按鈕與關係日期／說明的錨點。
- 家庭走線障礙。
- PNG、JPEG、SVG、PDF 匯出。
- `getContentBounds()` 與符合全圖。

既有文字 halo 保留為一般背景可讀性輔助，但不得作為已知碰撞的唯一處理。

### 9.5 截圖回歸 fixture

新增固定案例：

- 中心人物為男性、`age: 62`、姓名空白。
- 備註為兩行「雙相情緒障礙症／（精神中度障礙）」。
- 左側一位伴侶，右側兩位伴侶，至少一條同側多重關係與一條下繞／強制直線案例。
- 覆蓋自動、over、under、straight 四種 route mode。

驗證所有安全模式的線段不與人物 label bounds 相交；straight 模式的文字 placement 不與直線相交；畫面、匯出、hit-test 與高亮點集一致。

## 10. 階段六：空狀態與對比微調

### 10.1 空狀態

- `persons.length === 0` 且沒有 placement session 時，在編輯器畫布上方顯示 DOM 空狀態，不畫進任何匯出。
- 主操作為「新增第一位成員」，次要提示簡述可從工具列或快捷鍵開始。
- 空狀態不攔截畫布平移以外的必要操作；建立第一位人物後立即移除。
- 顯示／隱藏空狀態不寫入資料、LocalStorage 圖面狀態或 Undo history。

### 10.2 對比與焦點

- 只調整非臨床 UI token：次要文字、placeholder、disabled、邊框、空狀態與 `:focus-visible`。
- 一般文字與背景至少 4.5:1，大型文字與非文字控制狀態至少 3:1。
- 不更動 Canvas 臨床線色、性別淡底、案主灰底或圖例語意。
- 在 Windows 繁中常用字型與 100%、125% 顯示比例下檢查，不以只在單一螢幕成立的細灰字通過。

## 11. 測試與發布閘門

### 11.1 新增專項測試

- Modal pointer：關閉每個 modal 後實際點擊 Canvas，並在 transition 中重複操作。
- DOM XSS：多欄位匯入 payload、DOM 元素檢查、全域執行旗標與保存往返。
- Zero round-trip：constructor、JSON、LocalStorage、檔案、history、clone 與表單。
- Modal keyboard：focus trap、Escape 優先序、焦點還原、文字原生 Undo 與一筆 app history。
- Label routing：notes-only、長姓名、兩行備註、多重伴侶、forced straight、under dogleg、內容邊界與三次確定性重算。

### 11.2 完整回歸

每一階段完成後執行與風險相稱的既有測試；第五、六階段完成後執行完整發布閘門：

- 所有 `refactor/verify_*.js`。
- 視覺 smoke 與零 console／page error。
- 16 張既有 golden；只有新幾何確實修正碰撞的 fixture 可以有經人工審核的預期差異，禁止批次覆寫掩蓋回歸。
- 新增截圖案例的螢幕／匯出比對。
- 200 人與既有 240 人壓力案例；不得引入無界搜尋，單次 render 仍低於既有發布門檻。
- 根目錄、`geno/`、`refactor/app/` 對應 HTML、CSS、JS 與新增測試資源同步檢查。

若本機缺少 `pngjs` 或 `pixelmatch`，不得把 golden 標示為通過；應先補齊既定測試執行環境或明確列為未完成發布閘門。

## 12. 完成條件

1. 六個階段依序完成，且各自有先失敗後通過的永久測試。
2. 隱藏 modal 零點擊攔截，動態個案資料零 HTML sink。
3. 所有合法 `0` 值在完整資料生命週期保持不變。
4. Modal、文字輸入與 App Undo 的鍵盤責任清楚且可測。
5. 截圖中的 notes-only 多伴侶案例不再發生文字遮線；強制直線時文字自動避讓。
6. 螢幕、命中、高亮與所有匯出共用幾何，沒有左右裁字。
7. 空狀態、對比與 focus ring 通過可及性檢查，臨床視覺語意完全不變。
8. 完整回歸、效能、三副本同步與離線檢查全部通過後，才可宣告完成。
