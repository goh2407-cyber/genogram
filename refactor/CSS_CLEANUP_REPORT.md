# CSS 清理驗證紀錄

- 起點：`a1a856f0db28516958bfa141494d8fc814faa86c`
- 分支：`codex/css-cleanup`
- 日期：2026-09-13
- 變更範圍：`css/styles.css`、`index.html`；此文件記錄驗證結果。
- 未修改任何既有 JavaScript、臨床圖例 SVG 資料或 golden 基準圖片。

## 清理統計

| 項目 | 數量 |
| --- | ---: |
| 移除失效規則區塊 | 8（合併選擇器算一個區塊，共 10 個選擇器） |
| 移除未使用 keyframes | 2 |
| 移除未使用變數 | 7 |
| 合併重複區塊 | 4 組 |
| 抽成 class 的 inline style | 36 處 |
| 保留的動態 inline style | 1 處 |
| styles.css 清理前 | 2057 行 |
| styles.css 清理後 | 1995 行 |

行數以移除檔尾空白後的實際文字行計算。

移除的規則：`.toolbar`、`.toolbar-left/.toolbar-center/.toolbar-right` 共用區塊、
`.status-bar.connecting`、`.gender-btn.small`、`.gender-btn.small span:not(.icon)`、
`.fade-in`、`.slide-in`、`.tool-btn.primary:hover`。
移除 `fadeIn`、`slideIn` keyframes。全 repository 搜尋包含忽略檔案、JavaScript 與 refactor 測試，
未找到這些舊 class 的使用者；文件中的 toolbar 英文描述不屬於 class 引用。

移除變數：`--bg-dark`、`--bg-medium`、`--primary-hover`、`--primary-light`、
`--secondary-color`、`--success-color`、`--control-md`。`--control-md` 在舊設計文件仍有文字範例，
但 HTML、CSS 使用處與 JavaScript 沒有引用。

合併 `.main-content`、表單 input/select/textarea、1023px media query、reduced-motion media query。
1023px 中移動的關係按鈕欄數規則，在中間區段沒有同選擇器覆寫；兩段 reduced-motion 的共同屬性值相同，
保留後段的全部屬性。表單合併僅移動寬度與 box-sizing，不改動 hover/focus 的優先順序。

白色使用既有 `--surface-panel`；危險色使用 `--danger-color`；加入 `--line-strong`、
`--warning`、設定區色彩與常用間距變數。警告背景使用相對 rgba 色彩，保留原 RGB 與 0.94 alpha。

## 保留行為

- `.tool-btn.primary` 的背景與文字已被工作區工具列規則覆蓋，但陰影仍生效，因此只刪除失效宣告，保留陰影。
- `swapRelationshipDirection` 保留原 `style="display:none;"`。現有 JavaScript 在編輯模式以
  `style.display = ''` 顯示按鈕；直接換成隱藏 class 會使它無法顯示。本次不修改 JavaScript。
- `.status-bar.warning`、停用工具按鈕、1180px 的 document-context 與人物面板收合區均保留原行為與數值。
- 其餘抽出的 inline style 包含多元性別、全部匯出設定（含列出全部線型）、子女提示、品牌標題與使用說明。

## 驗證

`node refactor/run_all.js` 最終結果：**46/46 通過**。
其中 `visual_golden.js`：**16 張、0 失敗、零差異**。沒有更新任何 baseline。

初次執行為 44/46：新 worktree 缺少 Git 忽略的個案測試資料及 geno 離線資產。
從主資料夾唯讀複製 `genogram_2026-01-21.json`、`geno/fonts/`、`geno/js/vendor/` 與圖示後，
重新完整執行全部 46 支，結果全綠。沒有操作主資料夾 checkout，也沒有合併其他分支。

Playwright 使用 `NODE_PATH=~/.cache/pw-smoke/node_modules`，直接載入此 worktree 的 `index.html`。
固定時間、等待字型載入，停用截圖期間動畫並隱藏文字游標。
pixelmatch 設定 `threshold: 0, includeAA: true`，包含抗鋸齒像素，不容忍色差。

| 畫面 | 1440×900 差異像素 | 1024×768 差異像素 |
| --- | ---: | ---: |
| 空白畫布 | 0 | 0 |
| 選取人物與屬性面板 | 0 | 0 |
| 匯出對話框 | 0 | 0 |
| 多元性別選項展開 | 0 | 0 |

八組的所有 DOM 元素計算樣式（排除 CSS 變數本身）也完全一致，包含未展開的區塊。
截圖保存在 `refactor/css_before_*.png`、`refactor/css_after_*.png`；統計在
`refactor/css_pixel_report.json`。這些檔案沿用既有 Git 忽略規則。

額外以起點的 HTML/CSS 和修改後版本驗證 1023px、860px、reduced-motion 模式：
關係對話框全畫面及警告背景均零差異，儲存按鈕 hover 的背景、文字與陰影一致。
額外計算樣式比對僅有警告背景的序列化字串不同：原本為 `rgba(217, 119, 6, 0.94)`，
相對色彩回傳 `color(srgb 0.85098 0.466667 0.0235294 / 0.94)`；實際繪製像素相同。

## 三份副本

執行 `node refactor/sync_mirrors.js`，root、geno、refactor/app 的 JavaScript 與 CSS raw MD5 一致；
root 與 refactor/app 的 HTML raw MD5 一致。新 worktree 的 ignored 副本原先不存在，已初始化。
`geno/index.html` 已套用相同 class 替換，使用 `fonts/noto-sans-tc.css` 與
`js/vendor/jspdf.umd.min.js` 本地路徑；排除資產引用後與 root HTML 一致。

`git diff --check` 通過；CSS 與 HTML 均為有效 UTF-8，沒有 replacement character。
沒有未解決的視覺差異。唯一刻意保留的 inline style 如上所述。
