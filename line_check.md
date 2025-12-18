# 線條繪製檢查清單

## 親子關係
- ✅ `parent-child`: 實線 (#333333) - 使用 `drawStandardLine`

## 結構關係（婚姻關係）
- ✅ `married`: 實線 (#333333) - 使用 `drawMarriageLine` (ㄇ字型)
- ✅ `engaged`: 虛線 (#333333) - 使用 `drawMarriageLine` (ㄇ字型 + dashed)
- ✅ `cohabiting`: 虛線 (#333333) - 使用 `drawMarriageLine` (ㄇ字型 + dashed)
- ✅ `separated`: 虛線 + 兩條斜線 (#333333) - 使用 `drawMarriageLine` (dashed + double-slash)
- ✅ `divorced`: 實線 + 兩條斜線 (#333333) - 使用 `drawMarriageLine` (solid + double-slash)
- ✅ `widowed`: 實線 + X (#333333) - 使用 `drawMarriageLine` (solid + x)
- ✅ `affair`: 虛線 (#dc3545 紅色) - 使用 `drawMarriageLine` (dashed)

## 情感關係
- ✅ `harmony`: 實線 (#28a745 綠色) - 使用 `drawEmotionalLine` (default case)
- ✅ `indifferent`: 虛線 (#adb5bd 灰色) - 使用 `drawEmotionalLine` (default case + dashed)
- ✅ `close`: 雙線 (#28a745 綠色) - 使用 `drawEmotionalLine` (double pattern)
- ✅ `very-close`: 三線 (#28a745 綠色) - 使用 `drawEmotionalLine` (triple pattern)
- ✅ `distant`: 點線 (#adb5bd 灰色) - 使用 `drawEmotionalLine` (default case + dotted)
- ✅ `conflict`: 波浪線 (#dc3545 紅色) - 使用 `drawEmotionalLine` (wave pattern)
- ✅ `conflict-close`: 波浪線 + 上方實線 (#dc3545 紅色) - 使用 `drawEmotionalLine` (wave pattern + solid-above decoration)
- ✅ `hostile`: 鋸齒線 + 豎線 (#dc3545 紅色) - 使用 `drawEmotionalLine` (zigzag pattern + bars decoration)
- ✅ `violence`: 波浪線 (#dc3545 紅色, width=3) - 使用 `drawEmotionalLine` (wave pattern)
- ✅ `cutoff`: 實線中間向下延伸，右端向上延伸 (#333333) - 使用 `drawEmotionalLine` (cutoff-line pattern)
- ✅ `abuse`: 波浪線 (#4a90d9 藍色) - 使用 `drawEmotionalLine` (wave pattern)
- ✅ `manipulative`: 波浪線 + 箭頭 (#fd7e14 橙色) - 使用 `drawEmotionalLine` (wave pattern + arrow decoration)
- ✅ `controlling`: 實線 + 箭頭 (#dc3545 紅色) - 使用 `drawEmotionalLine` (default case + box-arrow decoration)
- ✅ `focused`: 實線 + 箭頭 (#4a90d9 藍色) - 使用 `drawEmotionalLine` (default case + arrow decoration)
- ✅ `admiration`: 實線 + 箭頭 (#28a745 綠色) - 使用 `drawEmotionalLine` (default case + circle-arrow decoration)

## 潛在問題檢查

### 1. `hostile` 關係
- 定義：`pattern: 'zigzag', decoration: 'bars'`
- 問題：根據文檔，關係惡化應該是"實線上有幾條短斜線"，但現在是鋸齒線加豎線
- 建議：應該改為 `pattern: 'solid', decoration: 'diagonal-bars'`

### 2. `cutoff` 關係
- 定義：`pattern: 'cutoff-line'`
- ✅ 已修復：移除了重複的 decoration

### 3. `conflict-close` 關係
- 定義：`pattern: 'wave', decoration: 'solid-above'`
- ✅ 正確：波浪線上方有平行實線

### 4. 所有 pattern 都有對應的繪製方法
- ✅ `solid`: default case
- ✅ `dashed`: getLineDash('dashed')
- ✅ `dotted`: getLineDash('dotted')
- ✅ `double`: drawDoubleLine
- ✅ `triple`: drawTripleLine
- ✅ `zigzag`: drawZigzagLine
- ✅ `wave`: drawWaveLine
- ✅ `gap-bar`: drawGapBarLine
- ✅ `cutoff-line`: drawCutoffLine

### 5. 所有 decoration 都有對應的繪製方法
- ✅ `bars`: drawBars
- ✅ `arrow`: drawArrow
- ✅ `box-arrow`: drawArrow (簡化)
- ✅ `circle-arrow`: drawArrow (簡化)
- ✅ `solid-above`: drawSolidLineAbove
- ✅ `diagonal-bars`: drawDiagonalBars
- ✅ `double-slash`: 在 drawMarriageLine 中處理
- ✅ `x`: drawX
- ✅ `slash`: drawSlash

