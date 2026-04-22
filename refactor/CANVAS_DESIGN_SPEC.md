# 家系圖 Canvas 設計規範

> Sprint 2 設計源頭。所有 Canvas 繪製與 DOM UI 樣式均須引用本文件定義的常數，**禁止魔術值**。

## 0. 調性（Aesthetic）

**Clinical minimalism（臨床極簡）**

- 精準 / 低干擾 / 狀態清晰
- 臨床資料是視覺主角，UI 本身不搶戲
- 色彩中性化；強調來自位置、大小、明暗，而非飽和度
- 明文**不採用**：gradient mesh、grain overlay、戲劇化陰影、雙字型、maximalism

設計決策衝突時，以「家系圖是否更易於社工/心理師正確解讀」為裁斷依據。

---

## 1. 色票系統（PALETTE）

### 1.1 設計依據
- **Tailwind gray 階** 作為中性骨架（社群廣泛接受、跨瀏覽器渲染一致）
- **狀態色** 採低飽和藍 / 綠，與舊版 `#4a90d9` / `#28a745` 語意一致但飽和度降 15-20%
- **語意色** 僅在死亡、警示等臨床必要時使用；日常繪圖不觸碰紅色

### 1.2 常數定義
```js
const PALETTE = {
    // 基底（中性）
    bg:            '#ffffff',   // canvas background
    bgMuted:       '#fafafa',   // optional subtle panel bg
    gridFine:      '#f3f4f6',   // Tailwind gray-100 — 細格
    gridCoarse:    '#e5e7eb',   // Tailwind gray-200 — 粗格

    // 節點描邊與填色
    outline:       '#1f2937',   // gray-800 — 主要描邊（取代舊 #333）
    outlineMuted:  '#6b7280',   // gray-500 — 次要/裝飾
    fill:          '#ffffff',   // 預設節點填色
    fillPatient:   '#4b5563',   // gray-600 — 案主底色（夠深以承載白字，取代舊 #808080）

    // 文字
    textPrimary:   '#111827',   // gray-900 — 姓名
    textSecondary: '#6b7280',   // gray-500 — 備註
    textInverse:   '#ffffff',   // 黑底上的文字（案主內字、徽章）

    // 狀態
    stateSelected:    '#5b8fc9',  // 去飽和藍（選取 / 連接中）
    stateHighlighted: '#3aab58',  // 去飽和綠（圈選中）
    stateHover:       '#d1d5db',  // gray-300 — hover 提示環（極淡）

    // 語意（稀用）
    alert:         '#dc2626',   // 警示（僅限死亡符號、嚴重狀態，透明度 0.35）
    halo:          '#ffffff',   // 文字 halo 白邊
};
```

### 1.3 適用規則
| 用途 | 色 |
|------|-----|
| 人物描邊 | `outline` |
| 人物填色（一般） | `fill` |
| 人物填色（案主） | `fillPatient`，字 `textInverse` |
| 關係線 | `outline` 或 `outlineMuted`（次要關係）|
| 姓名 | `textPrimary` + `halo` strokeText |
| 備註 | `textSecondary` + `halo` strokeText |
| 死亡斜線 | `alert` + globalAlpha 0.35 |

---

## 2. 字型系統（TYPOGRAPHY）

### 2.1 設計依據
- 單一中文字型 `Noto Sans TC`（已載入），**不引入第二字型**以免干擾臨床閱讀
- 三層級透過**字重**與**字級**區分；不靠字體差異
- 英文數字 fallback 使用 system-ui（跨平台穩定）

### 2.2 常數定義
```js
const TYPOGRAPHY = {
    family: "'Noto Sans TC', system-ui, -apple-system, sans-serif",
    name:    { size: 14, weight: 500, lineHeight: 1.3 },  // 姓名：中等字重、清晰
    age:     { size: 14, weight: 600, lineHeight: 1.0 },  // 年齡（節點內）：稍粗以突出
    badge:   { size: 11, weight: 700 },                    // 徽章數字：小而粗、白字
    notes:   { size: 12, weight: 400, lineHeight: 1.4 },  // 備註：輕、行距舒展
};
```

### 2.3 Helper 用法
```js
function fontString(tier) {
    const t = TYPOGRAPHY[tier];
    return `${t.weight} ${t.size}px ${TYPOGRAPHY.family}`;
}
// usage: ctx.font = fontString('name');
```
Agent S 必須建立此 helper 並統一替換現有 `this.ctx.font = \`bold 12px Arial\`` 等散落 string。

---

## 3. 線條系統（LINE_WEIGHTS + DASH_PATTERNS）

### 3.1 設計依據
- 三層粗細讓視覺有節奏：外框 > 主線 > 裝飾
- `lineCap: 'round'` / `lineJoin: 'round'` 讓連接點自然、避免尖銳直角
- DASH_PATTERNS 已於 Sprint 1 建立（`canvas.js` 頂部 9 鍵），本規範不重複定義

### 3.2 常數定義
```js
const LINE_WEIGHTS = {
    frame:   1.5,   // 節點外框、同住圈、生活圈邊框
    primary: 1.25,  // 關係主線（婚姻、親子、情感）
    accent:  0.75,  // 裝飾線（離婚斜線、輔助線）
    grid:    1.0,   // 背景網格
    ring:    3.0,   // 狀態 ring（保留 Sprint 1 DRAW_PERSON_STYLES.ringWidth 一致）
    halo:    4.0,   // 文字 halo（保留 Sprint 1 DRAW_PERSON_STYLES.nameHalo.lineWidth）
};

const LINE_CAPS = {
    cap:  'round',
    join: 'round',
};
```

### 3.3 轉角規則
- 家庭線直角轉折處加 **2px arcTo 小圓角**（Sprint 3 B1 處理，Sprint 2 不做）
- 其他轉角沿用既有繪製邏輯

---

## 4. 間距系統（SPACING）

### 4.1 設計依據
- 20px 為基準格（與 Sprint 1 `GRID_STYLE.fineSize` 一致）
- 節點 50px = 2.5 格，姓名離節點 8px 讓文字不黏在符號
- halo / ring 的 gap 共用 5px，視覺節奏一致

### 4.2 常數定義
```js
const SPACING = {
    nodeSize:        50,     // 既有 personSize，保留
    nameOffset:      8,      // 節點底緣到姓名首行
    notesLineHeight: 1.4,    // 備註多行行距倍率
    haloGap:         5,      // ring / halo 離節點外緣的 offset
    badgeSize:       20,     // 徽章直徑
    badgeOffset: { x: 18, y: -18 },  // 徽章相對節點中心
    baseGrid:        20,     // 基準格（與 GRID_STYLE.fineSize 同步）
};
```

---

## 5. 狀態系統（STATES）

### 5.1 設計依據
- Sprint 1 已建立 `DRAW_PERSON_STYLES`，本規範**擴充**而非取代
- 新增 `hover`、`disabled`、`focus` 三狀態
- 狀態之間**互斥**：同一節點只畫單一狀態環（selected > connecting > highlighted > focus > hover > 無）

### 5.2 常數定義（取代 DRAW_PERSON_STYLES，擴充版）
```js
const STATES = {
    selected:    { ring: PALETTE.stateSelected,    ringWidth: LINE_WEIGHTS.ring, haloGap: SPACING.haloGap, priority: 5 },
    connecting:  { ring: PALETTE.stateSelected,    ringWidth: LINE_WEIGHTS.ring, haloGap: SPACING.haloGap, priority: 4 },
    highlighted: { ring: PALETTE.stateHighlighted, ringWidth: LINE_WEIGHTS.ring, haloGap: SPACING.haloGap, priority: 3 },
    focus:       { ring: PALETTE.stateSelected,    ringWidth: 2, haloGap: 7, ringDash: [3, 2], priority: 2 },  // 鍵盤焦點
    hover:       { ring: PALETTE.stateHover,       ringWidth: 2, haloGap: 3, opacity: 0.6, priority: 1 },
    disabled:    { opacity: 0.4, priority: 0 },

    // 文字 halo（延續 Sprint 1）
    nameHalo:    { color: PALETTE.halo, lineWidth: LINE_WEIGHTS.halo },
    notesHalo:   { color: PALETTE.halo, lineWidth: LINE_WEIGHTS.halo },
};
```

### 5.3 切換規則
```js
function resolveState(flags) {
    // flags: { isSelected, isConnecting, isHighlighted, hasFocus, isHovered, isDisabled }
    if (flags.isDisabled)    return STATES.disabled;
    if (flags.isSelected)    return STATES.selected;
    if (flags.isConnecting)  return STATES.connecting;
    if (flags.isHighlighted) return STATES.highlighted;
    if (flags.hasFocus)      return STATES.focus;
    if (flags.isHovered)     return STATES.hover;
    return null;
}
```

---

## 6. 節點尺寸（NODE_SIZES）

### 6.1 設計依據
- 絕大多數家系圖符號統一 50px；放大縮小透過 scale 控制
- **不**靠節點尺寸表示案主或死亡（易誤讀為「重要程度」）；案主用填色、死亡用疊加符號
- 圖例預覽 30px 是慣例（圖例不與主畫面等權）

### 6.2 常數定義
```js
const NODE_SIZES = {
    standard:  50,   // 一般
    patient:   50,   // 案主（尺寸同；`fillPatient` 區分）
    deceased:  50,   // 已故（尺寸同；alert 斜線疊加）
    preview:   30,   // 圖例面板 / 小預覽
    lodMedium: 35,   // 縮放 < 0.5 時的簡化顯示（Sprint 3 G3 LOD 處理）
    lodSmall:  20,   // 縮放 < 0.35 時（同上）
};
```

---

## 7. 整合說明（Sprint 1 既有 → Sprint 2 擴充）

Sprint 1 在 `canvas.js` 頂部已建立：
- ✅ `DASH_PATTERNS`（9 鍵）— 本規範不改，沿用
- ✅ `GRID_STYLE` — 沿用，但 `fineSize` 的 20px 要與 `SPACING.baseGrid` 交叉引用
- ✅ `DRAW_PERSON_STYLES`（static getter）— 由 Sprint 2 Agent S **替換為 STATES**（向上相容：保留 `selected`、`connecting`、`highlighted`、`nameHalo`、`notesHalo` 五鍵意義）

Sprint 2 Agent S 須新增：
- 🆕 `PALETTE`
- 🆕 `TYPOGRAPHY` + `fontString(tier)` helper
- 🆕 `LINE_WEIGHTS` + `LINE_CAPS`
- 🆕 `SPACING`
- 🆕 `STATES`（擴充 DRAW_PERSON_STYLES）+ `resolveState(flags)` helper
- 🆕 `NODE_SIZES`

所有新 const 放在 `canvas.js` 頂部，`DASH_PATTERNS` 之前（第一層引用依賴順序：PALETTE → TYPOGRAPHY → LINE_WEIGHTS → SPACING → STATES → NODE_SIZES → DASH_PATTERNS → GRID_STYLE）。

---

## 8. Sprint 2 問題清單對應到本規範

| 清單項 | 動作 | 引用規範章節 |
|--------|------|-------------|
| **A1** 線寬分層 | 替換全檔 `lineWidth = 2` 等魔術值 | §3.2 `LINE_WEIGHTS` |
| **A2** 色票系統 | 替換 `#fff`, `#333`, `#808080`, `#4a90d9`, `#28a745` 等 | §1.2 `PALETTE` |
| **A5** 字級 helper | 替換散落 `ctx.font = '…'` | §2.2 `TYPOGRAPHY` + `fontString()` |
| **C1** 死亡 X 淡斜線 | `alert` + globalAlpha 0.35，不擠文字 | §1.2 `PALETTE.alert` |
| **C2** 案主灰底白字 | `fillPatient` + `textInverse` | §1.2 + §1.3 |

**P2 #7–#9**（personMap 索引，架構性）**不屬於本規範範疇**，由 Agent P 單獨處理。

---

## 9. 禁令（不可觸犯）

- ❌ 任何新增的繪製程式碼出現 hex / rgb / rgba 色碼字串（須引用 `PALETTE`）
- ❌ `ctx.font = "…"` 直寫（須透過 `fontString()`）
- ❌ `lineWidth = <number>` 直寫（須引用 `LINE_WEIGHTS`）
- ❌ `setLineDash([...])` 直寫（沿用 Sprint 1 `DASH_PATTERNS`）
- ❌ 新增狀態變體時不經規範擴充就自訂樣式
- ❌ 為了炫技引入漸層 / 模糊 / 紋理（與 Clinical minimalism 衝突）

---

## 10. 驗收標準

Sprint 2 Agent S 交付時必須：
1. 所有新增 const 放在 `canvas.js` 指定位置且命名與本規範一致
2. 舊魔術值替換至少 **95%**；剩餘 5% 必須逐一說明為何不替換
3. 視覺結果（截圖比對）與 Sprint 1 完成狀態相比，除 A1/A2/A5/C1/C2 五項外**完全一致**
4. `node --check` 通過
5. 手動回歸：新增角色、建立關係、選取、案主切換、死亡切換，視覺正常且無 console error

---

## 版本

- 日期：2026-04-22
- 作者：主 Opus（Sprint 2 第零步）
- 基於：Sprint 1 `bb8f122`（已 push 至 origin/main）
- 審核者：goh2407（待確認）
