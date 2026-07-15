# 父母配對格距一致性修正設計

日期：2026-07-15
分支：`codex/genogram-ux-drawing-optimization`

## 問題

快速建立父母的 V 字預覽本身符合需求，問題在父母配對的搜尋優先序。

目前系統水平格距 `GenogramApp.GRID.CELL_WIDTH` 是 120px，但
`findQuickParentPairPlacement()` 會針對每個中心位置依序嘗試 120px 與
180px。這使原中心的 120px 配對被擋住時，系統會先採用原中心的 180px，
之後才考慮把 120px 配對整組移到相鄰空格。結果是同一功能可能產生兩種
父母間距，與棋盤式格位的視覺節奏不一致。

放置期間仍會繪製已選人物的快捷按鈕，也會與父母 ghost、V 字預覽及候選
格重疊，增加擁擠感。

## 已確認需求

1. 保留目前建立父母時的 V 字中性虛線預覽。
2. 父母水平間距固定使用系統 `CELL_WIDTH`，目前為 120px。
3. 標準位置被擋住時，父母必須保持剛性間距並整組左右移動。
4. 不再使用 180px 作為父母配對的優先或備援間距。
5. 任一人物放置工作階段啟動時，不繪製快捷新增按鈕。
6. 不修改臨床關係線顏色、線型、符號語意或 V 字預覽顏色。

## 設計

### 父母格位搜尋

`findQuickParentPairPlacement(child)` 只建立一個 `standardGap`：

```text
standardGap = GRID.CELL_WIDTH
```

搜尋中心順序維持確定性：子女正上方、左一格、右一格、左兩格、右兩格，
依此類推。每一個中心只驗證 `standardGap`。找到第一個安全位置後立即回傳；
若有限搜尋未找到，fallback 仍使用子女正上方與 `standardGap`，不得改變配對
寬度。

`beginQuickParentPlacement()`、`getPlacementCandidate()`、pointer move 與
`commitPlacement()` 繼續把兩位父母視為剛性單位，只平移共同的 `dx/dy`，
因此預覽與提交後的父母距離必須完全相同。

### 放置期間的快捷按鈕

Canvas 只在以下條件全部成立時繪製快捷新增按鈕：

- 有單一選取人物；
- 未拖曳；
- 沒有 `placementPreview`。

本次不修改快捷按鈕本身的圖示、顏色或命中位置。

### 預覽與完成狀態

V 字中性虛線只存在於父母放置預覽。確認建立後立即清除放置預覽與人物
選取，收起藍色選取框及快捷新增按鈕，讓新家庭以乾淨的正式圖面呈現。
使用者之後仍可再次點選任一人物進行編輯。

正式圖面繼續交由既有 `FamilyRoutePlanner` 繪製：父母以水平伴侶線連接，
親子線從父母中點向下連到子女。在標準位置沒有障礙物時，子女位於父母
正中央的下一個輩分列，完成結果應與確認的參考圖一致。若中央父母格位被
占用，只平移新建的父母剛性組，不移動既有子女；此時由既有路由器產生
避障的正交路徑，不以改動人物資料來強求完全對稱。

## 資料與相容性

- 不修改人物或關係 JSON schema。
- 不修改 `KinshipEngine` 的親子方向規則。
- 不修改 `Relationship.getLineStyle()` 或 `DASH_PATTERNS`。
- 根目錄、`geno/`、`refactor/app/` 的 JavaScript 副本維持 MD5 一致。
- 僅提交功能分支；未經使用者確認不得合併 `main`。

## 驗收

1. 在子女正上方 120px 配對被擋、180px 可放的 fixture 中，系統必須改選
   左／右相鄰中心，最後父母間距仍為 120px。
2. 父母預覽、pointer move 與 commit 前後的父母間距皆為 `CELL_WIDTH`。
3. 放置期間 `drawQuickAddButtons()` 呼叫次數為 0；取消放置後恢復顯示。
4. V 字預覽仍有兩條父母至子女的中性虛線及一條父母間虛線。
5. 標準空白 fixture 確認後沒有選取框或快捷按鈕，父母間距為 120px，
   子女位於父母中點下一列，正式線為水平伴侶線加中央垂直親子線。
6. `verify_placement.js`、家庭走線、拖曳與視覺煙霧測試全部通過，零
   console/page error。
7. 臨床線色與非本功能的 golden fixture 不產生差異。
