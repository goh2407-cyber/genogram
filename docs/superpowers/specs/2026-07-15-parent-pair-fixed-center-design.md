# 快速建立父母固定置中設計

日期：2026-07-15
分支：`codex/parent-pair-fixed-center`

## 問題與根因

快速建立兩位父母時，初始預覽會正確把父母放在子女正上方，父母中點等於
子女 X。然而進入放置模式後，任何 `pointermove` 或第二次確認點擊都會呼叫
`updatePlacement()`；目前 `parent-pair` 把游標 X 解讀成左側父親的 X，而不是
整組父母的中點。

因此使用者只要在子女正上方點擊確認，父親就會移到子女 X，母親位於右側
一個格距，父母中點偏移半個格距。V 字預覽會變成子女位於父親下方，提交後
正式親子線只能產生階梯形折線。

可見 Chromium 重現結果：初始父母為 `360 / 480`、中點 `420`；在子女
`x=420` 正上方確認後，格線吸附得到父母 `410 / 530`、中點 `470`，相對
子女偏移 `+50px`。父母間距 120px 並未損壞，損壞的是整組錨點語意。

## 已確認方案 A

快速建立父母採用完全自動放置：

1. `beginQuickParentPlacement()` 只計算一次父母配對位置。
2. 父母配對進入預覽後，座標鎖定為系統計算結果。
3. 滑鼠移動只維持預覽，不再改變父母位置。
4. 第二次畫布點擊只負責確認，不再重新吸附或平移父母。
5. 建立完成後若要調整，使用者可用既有拖曳功能移動人物。

標準父母位置可用時，父母維持 120px 系統格距，父母中點等於子女 X，
子女位於下一個輩分列。若標準位置被既有人物或安全走線占用，仍由既有
`findQuickParentPairPlacement()` 在預覽開始前選擇確定性的安全替代格位；
預覽開始後不再跟隨滑鼠改變。

## 程式設計

### 放置狀態

不新增資料欄位或 JSON schema。`placementSession.request.kind ===
'parent-pair'` 本身即代表固定自動放置模式。

`updatePlacement(x, y, bypassSnap)` 遇到 `parent-pair` 時，直接回傳目前
`placementSession.candidate`，不得呼叫 `getPlacementCandidate()` 重新計算，
也不得改寫 `ghostPerson` 或 `ghostPeople`。即使按住 Alt，也不解除父母配對
的自動鎖定；Alt 的自由放置語意只保留給單一人物。

`handlePointerMove()` 可維持既有呼叫流程，因 `updatePlacement()` 會對父母
配對成為冪等操作。`handlePointerDown()` 仍在 placement session 中先呼叫
`updatePlacement()` 再 `commitPlacement()`，但前者不會改變父母候選位置，
所以點擊位置僅具有「確認」語意。

### 預覽與正式走線

- V 字預覽維持現有三段中性虛線與顏色。
- 父母 120px 格距、ghost 樣式、桃紅候選格與狀態提示不變。
- 提交後繼續由 `FamilyRoutePlanner` 產生水平伴侶線與中央親子主幹。
- 不修改 `Relationship.getLineStyle()`、`DASH_PATTERNS` 或任何臨床線色。
- 不新增自動移動既有人物或子女的行為。

## 測試設計

在 `refactor/verify_placement.js` 新增真實互動回歸：

1. 建立父母後，記錄初始兩位 ghost 的 X、中點與 120px 間距。
2. 模擬 pointer move 到子女正上方，驗證 candidate 與 ghost 坐標完全不變。
3. 模擬 pointer down／commit 在另一個格位，驗證新父母仍等於初始 ghost
   坐標，中點仍等於子女 X。
4. 按住 Alt 移動與確認也不得解除父母自動鎖定。
5. V 字預覽仍精確包含三段關係，提交後選取清除。
6. 單一人物、伴侶、子女與手足 placement 仍可跟隨滑鼠，避免把鎖定行為
   誤套到其他快速新增功能。

完成後執行 placement、家庭路由、拖曳、關係線與視覺煙霧測試，並確認根
`js/`、`geno/js/`、`refactor/app/js/` 三份 JavaScript MD5 一致。

## Git 與交付

- 所有修改只提交到 `codex/parent-pair-fixed-center`。
- 未經使用者再次確認，不合併 `main`、不推送遠端。
