# Test Gates Before Production

以下條件全部通過，才可上線。

## A. 核心功能
- 可新增人物（男女、懷孕、跨性別）且顯示正確。
- 可建立伴侶、親子、情感關係，線型與裝飾正確。
- 多段伴侶下可正確建立子女，不會誤掛到錯配偶。
- 單一子女線維持垂直，不出現非預期 L 角。
- 多子女時不會因父母線長度不足而強制錯位。

## B. 親屬規則
- 親子方向固定遵守 `from=parent`, `to=child`。
- 伴侶驗證（同輩、非直系、非手足）規則正確。
- 拖曳人物座標後，血緣語意不被改寫。

## C. 存檔與回復
- Ctrl+S / 另存 / 載入可正常往返，不丟資料。
- Undo/Redo 在關係建立、刪除、移動後都可回復。
- 視圖縮放與位移（zoom/pan）可正確保存與恢復。

## D. 部署
- 根目錄是線上／開發版；`geno/` 是離線臨床包；`refactor/app/` 是驗證副本。
- `geno/index.html` 的字型、jsPDF 與 dagre 皆使用本地資產，且載入時零 HTTP/HTTPS 請求。
- Service Worker 維持停用；離線能力不依賴瀏覽器快取。

## E. 效能
- 100 人/200 關係內操作順暢。
- 200 人以上仍可完成新增、拖曳、匯出（可容許略慢）。

## F. 匯出與相容性
- PNG/JPEG/SVG/PDF/JSON 匯出成功。
- JSON 匯入後內容一致（人物、關係、同住、生活圈）。
- Chrome / Edge 最新版可正常使用。

## G. 安全走線與微調
- `node refactor/verify_family_route_planner.js`：純規劃器所有 fixture 通過，無 `NaN`／`Infinity`；路徑會移除連續重複點與順向共線中繼點，但保留折返點。
- `node refactor/verify_family_routing.js`：畫面、命中、鉛筆與匯出共用相同且已清理的家庭路徑；未變更的 render 不重算，遠方人物不進入局部障礙集合，移動一個家庭只重算受影響家庭。
- `node refactor/verify_drag.js`：無安全路徑時水平校正不超過 60px；`Alt` 保留精確落點；一次 Undo 完整復原。
- `node refactor/verify_placement.js`：快速父母固定使用 120px 系統格距；近距離伴侶的既有父母擋住第二組置中位置時，只將目前子女向外移動最小安全距離（最多 120px），預覽不寫資料、取消零變更、提交與移動共用一次 Undo；其他受阻情境維持父母剛性平移。
- `Relationship.getLineStyle()`、`DASH_PATTERNS` 與臨床符號顏色／幾何不得因走線功能修改。
- 根目錄、`geno/`、`refactor/app/` 的所有 `js/` 檔案 MD5 必須一致。
- 三份 `index.html` 都必須在 `kinship-engine.js` 後、`canvas.js` 前載入 `family-route-planner.js`；`geno/index.html` 保留本地字型與 vendor 路徑，並通過完全離線驗證。
- 效能基準的 200 人 warm render 必須低於 50ms，平移／縮放維持接近 60 FPS；首次建立全圖路徑另行記錄，不與互動重繪混算。
- Golden 差異只可出現在家庭／親子走線 fixture，必須逐張人工檢視，禁止整批覆寫 baseline。

## H. 檢視、Fit 與發行守門
- `node refactor/verify_view_controls.js`、`verify_view_rendering.js`、`verify_view_export.js`、`verify_fit_view.js`、`verify_status_ux.js` 全數通過。
- `node refactor/verify_legend_consistency.js`：側欄與匯出共用 `Relationship.LEGEND_SECTIONS`；36 種關係順序、名稱與既有線型一致，`getLineStyle()`、虛線表及 CSS 圖例線型雜湊不變。
- `node refactor/verify_mirror_sync.js`：三副本 JS/CSS raw MD5 一致；root 與 `refactor/app` index 一致；`geno` 保留本地依賴。
- 1920、1366、1180、1024px 寬度下工具列維持單列且不碰撞；1180px 以下使用 52px 收合軌道與 296px 浮層，開合浮層不得改變 Canvas 寬度。
- 1024px 是支援下限；更窄視窗保留 1024px 版面並允許水平捲動，不宣稱手機版支援。
- View 顯示層不寫入 JSON/history；JSON 匯出完整，視覺匯出遵循目前檢視。
- 大型 JSON 載入後自動符合全圖；自動儲存恢復保留原縮放與位移。
- `geno` 用於敏感／離線臨床情境，並通過零外部請求驗證。

## I. Release-Hardening Gate

下列四項為發行前永久守門。每一項都必須在具備可用 Playwright runtime
與瀏覽器的環境中重新執行；缺少 runtime、瀏覽器或相依套件時，結果是
**blocked gate**，不是 PASS，必須補齊環境後重跑。

```powershell
node refactor/verify_modal_flow.js
# ALL MODAL FLOW CHECKS PASSED

node refactor/verify_dom_security.js
# ALL DOM SECURITY CHECKS PASSED

node refactor/verify_zero_roundtrip.js
# ALL ZERO ROUNDTRIP CHECKS PASSED

node refactor/verify_modal_keyboard_history.js
# ALL MODAL KEYBOARD AND HISTORY CHECKS PASSED
```

- Modal flow：隱藏 modal 關閉時立即 `pointer-events: none`，轉場結束後為
  `hidden`；五種 modal 都有 ARIA、焦點圈限、Escape 與焦點還原。
- DOM security：執行期個案資料僅可經安全的文字／value property 進入 DOM。
- Zero roundtrip：`age: 0`、`x: 0`、`y: 0` 必須通過所有持久化路徑。
- Modal keyboard/history：文字欄位聚焦時 Ctrl/Cmd+Z 維持原生操作；一次完成
  的欄位編輯只建立一筆 App Undo。

## 驗收記錄
- 測試日期：2026-08-10
- 測試版本：`codex/genogram-hardening`
- 測試人員：Codex
- 結果：`PASS`
- 備註：26 支 `verify_*.js` 全數通過；Golden 16/16 皆 `diffPixels=0`，三副本 raw MD5、`geno` 零外部請求與視覺 smoke 全數通過；1920／1366／1180／1024px 實際瀏覽器檢查皆無碰撞、換行、圖例溢出或執行期錯誤。
