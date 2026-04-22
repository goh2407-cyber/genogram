# personMap 索引架構設計（Sprint 2 / Agent P）

> 狀態：**設計草案**（尚未實作）
> 分支：`fix/sprint2-p-design`
> 依據：`REFACTOR_PLAN.md` Phase 2、問題清單 P2 #7 / #8 / #9
> 前置：Sprint 1 已合併（`98e4891`），KinshipEngine 集中親屬推論
> 範圍：**純效能優化**，不改 Canvas/UI 行為、不改資料格式

---

## §1. 現況分析（量化）

### 1.1 搜尋計數（ripgrep 結果）

| 位置 | 模式 | 次數 |
| --- | --- | --- |
| `js/app.js` | `this.persons.find(...)` | **32** |
| `js/canvas.js` | `persons.find(...)` | **22** |
| `js/app.js` | `this.relationships.find / filter / some` | **14** |
| `js/canvas.js` | `relationships.find / filter` | **5** |
| 合計 person O(n) 線性掃描呼叫點 | | **54** |
| 合計 relationship O(n) 線性掃描呼叫點 | | **19** |

### 1.2 Hot paths（render 主路徑與事件熱區）

以下 5 條熱路徑是本次優化最大受益者：

1. **`canvas.js:283` → `drawFamilies()`（主 render 迴圈）**
   - 內部 `persons.find` 至少兩處（`canvas.js:3051`、`3052`），用於 `parentIds.map(id => persons.find(...))` 與 `childIds.map(id => persons.find(...))`。
   - 每個 family 執行 `(|parents| + |children|) × O(n)`。對一個 5 人家庭、n=200 而言，每 family 單幀約 1000 次字串比對。
   - 頻率：每次 render（pan / zoom / drag 都會觸發）。

2. **`canvas.js:287-301` → 非親子關係繪製迴圈**
   - 每條 `otherRels` 做兩次 `persons.find`。若有 50 條婚姻/同住/情感關係，單幀 100 次 find，每次 O(n)。
   - 頻率：每次 render。

3. **`canvas.js:362` → 選取 badge 繪製**
   - `selectedPersonIds.forEach(id => persons.find(...))`。選 20 人同住時，單幀 20 × O(n)。

4. **`app.js:2213-2214`（`getConnectedPersons` / `computeFamilyGroup` 類流程）**
   - 為了從 relationship 還原 from/to 的 Person 物件，每條 relationship 連 2 次 find；在 `handle*` 事件中頻繁觸發。

5. **`app.js:2941 / 2963 / 3456`（快速新增/配偶邏輯）**
   - 新增子女按鈕按下時，要追配偶、父母、手足名單，單次操作內多次 O(n) 掃描。

### 1.3 複雜度估算

令 `n = |persons|`、`m = |relationships|`、`f = find 呼叫點數（每幀）`：

| 規模 | 現況 render 單幀掃描量 | personMap 後 | 倍率（n=? 時的加速上限） |
| --- | --- | --- | --- |
| n=50, m=80 | ~50 × 150 ≈ 7.5k 比對 | ~150 次 Map.get | ≈ 50× |
| n=100, m=160 | ~100 × 300 ≈ 30k 比對 | ~300 次 Map.get | ≈ 100× |
| n=200, m=320 | ~200 × 600 ≈ 120k 比對 | ~600 次 Map.get | ≈ 200× |

> 注意：這是 find 層的理論上限，實際幀時間還包含 Canvas drawing（見 §6）。
> Map.get 也不是零成本（hash + 指標解參照），但 V8 對 Map<string,*> 做得很好，實務上可視為 O(1)。

---

## §2. 資料結構設計

### 2.1 必須新增（Phase A）

```
this.personMap: Map<string /* personId */, Person>
```

- **唯一性**：每次 `persons` 變動時同步維護（見 §3）。
- **取值**：`this.personMap.get(id) || null`。
- **不取代**：`this.persons` 陣列仍保留（見 2.4）。

### 2.2 建議新增（Phase B，視量測而定）

```
this.parentChildByChild:  Map<string /* childId */,  Relationship[]>
this.parentChildByParent: Map<string /* parentId */, Relationship[]>
```

- 理由：KinshipEngine 的 `getParentIds` / `getChildrenIds` 目前每次呼叫都做一次 `relationships.forEach + normalizeParentChild`；在大圖或頻繁呼叫的 UI 路徑（例如「新增子女」面板）會累加。
- 索引值為 `Relationship` 陣列（同一對 parent/child 理論上只會有一條，但採陣列可容忍髒資料）。
- **只對 `type === 'parent-child'` 建索引**，其他類型不走這裡。

### 2.3 可選新增（Phase C）

```
this.relationshipsByType: Map<string /* type */, Relationship[]>
```

- 理由：`app.js:3449`（`relationships.filter(r => /* 婚姻類 */)`）、`canvas.js:2499-2500` 等「依類型過濾」呼叫，資料量大時會重複掃。
- 成本：維護點與 parent-child 索引相同，但使用頻率較低，可晚做或跳過。

### 2.4 為何保留 `this.persons` 陣列

- **順序語意**：Canvas 繪製順序、匯出 JSON 的 key 順序、UI 列表（如果未來有）都依賴陣列順序。
- **序列化**：`toJSON` / `fromJSON` 以陣列為天然格式，不需額外改動存檔格式。
- **iteration 語意**：`persons.forEach(...)` 在 render 中每幀都用，Map iteration 也行但沒有必要替換。
- **結論**：`persons` 陣列 **不動**；`personMap` 是附加索引，兩者同步維護。

### 2.5 不採用

- ❌ **不**引入 immer / immutable.js：成本遠大於收益，且違反「不新增依賴」規範。
- ❌ **不**將 `persons` 直接改為 Map：破壞序列化與順序語意。
- ❌ **不**為每個 Person 加反向指標（`person._relationships`）：污染資料模型，undo/redo 深拷貝會變複雜。

---

## §3. 維護策略（寫入點）

### 3.1 所有會改動 `persons` 的路徑（已掃描）

| 行號 | 位置 | 動作 | 索引同步 |
| --- | --- | --- | --- |
| `app.js:35` | 建構子 | `this.persons = []` | `this.personMap = new Map()` |
| `app.js:1506` | `addPerson` | push | `personMap.set(person.id, person)` |
| `app.js:1646 / 1655` | 快速新增父母 | push | 同上 |
| `app.js:1745` | 快速新增子女 | push | 同上 |
| `app.js:1815` | 快速新增手足 | push | 同上 |
| `app.js:1843` | 快速新增配偶 | push | 同上 |
| `app.js:2063` | 其他 addPerson 路徑 | push | 同上 |
| `app.js:3267 / 3298` | `deleteSelected` | filter | 同步 `delete` 被過濾掉的 id |
| `app.js:3618 / 3649` | `saveState / restoreState`（undo/redo） | 整批覆寫 | **整體重建** personMap |
| `app.js:3750` | `loadData` | 整批覆寫 | 整體重建 |
| `app.js:4013` | `clearAll` | `= []` | `personMap.clear()` |
| `app.js:4119` | restore cache load | 整批覆寫 | 整體重建 |

### 3.2 所有會改動 `relationships` 的路徑

維護 parent-child 索引的寫入點（Phase B 需要）：

| 行號 | 動作 | 索引同步 |
| --- | --- | --- |
| `app.js` 內所有 `this.relationships.push(...)` | 新增 rel | 若為 `parent-child` 則 push 到 `parentChildByChild[childId]` 與 `parentChildByParent[parentId]` |
| `app.js:3229 / 3269 / 3287` | `filter` 刪除 | 整批 diff 出被移除者，從索引移除 |
| `app.js migrateRelationships` | 一次性 normalize | 跑完後整體重建 |
| `loadData / restoreState` | 整批覆寫 | 整體重建 |

### 3.3 兩種策略比較

#### 選項 A：即時維護（eager）

每個寫入點呼叫專屬 helper（例如 `_addPersonIndex(p)` / `_removePersonIndex(id)` / `_rebuildIndexes()`）。

- ✅ 讀取永遠 O(1)，沒有延遲
- ✅ 測試容易：每個 helper 單元測試
- ✅ 與 React 以外的純 JS 生態一致做法
- ❌ 寫入點分散，漏掉一處就會不同步

#### 選項 B：懶惰重建（lazy / dirty flag）

資料變動時設 `this._indexDirty = true`，getter 內 lazy rebuild。

- ✅ 寫入點不需改（降低風險）
- ❌ 第一次讀取時要整體重建 O(n)，render 首幀可能變慢
- ❌ 多個 getter 呼叫之間若有寫入，需小心管理 dirty flag
- ❌ 與「即時」混用容易誤判狀態

### 3.4 **推薦：選項 A（即時維護）**，理由：

1. 寫入點總共約 **13 處 person、~8 處 relationship**，可枚舉、可審查。
2. render 是熱路徑，讀取頻率遠高於寫入（pan/zoom 時每幀讀，但資料不變），即時維護讓讀取零 overhead。
3. 三個高風險點（`loadData` / `saveState restore` / `clearAll`）已經是整批替換，本來就適合用 `_rebuildIndexes()` 呼叫一次。
4. 搭配 §7 的 invariant assert，可在 dev 模式快速暴露不同步。

輔助做法：提供一個 **`_rebuildIndexes()` 萬能備援**，任何懷疑狀態不一致的地方呼叫即可強制重建；成本 O(n+m)，遠小於一幀 render。

---

## §4. API 與呼叫點替換計畫

### 4.1 Person 查找替換表（代表性樣本）

| 位置 | 原寫法 | 新寫法 |
| --- | --- | --- |
| `app.js:548` | `this.persons.find(p => p.id === this.hoveredPersonId)` | `this.personMap.get(this.hoveredPersonId)` |
| `app.js:709-710` | `this.persons.find(p => p.id === selectedRel.fromPersonId)` (x2) | `this.personMap.get(selectedRel.fromPersonId)` |
| `app.js:887` | `movingPersonIds.map(id => this.persons.find(p => p.id === id)).filter(p => p)` | `movingPersonIds.map(id => this.personMap.get(id)).filter(Boolean)` |
| `app.js:1786` | `this.persons.find(p => p.id === personId)` | `this.personMap.get(personId)` |
| `app.js:2213-2214` | 雙 find（relationship endpoints） | 雙 `personMap.get` |
| `app.js:2941` | `this.persons.find(p => p.id === parentId)` | `this.personMap.get(parentId)` |
| `app.js:3110 / 3456` | map + find 模式 | map + `personMap.get` |
| `canvas.js:287-288` | render 主路徑雙 find | **改為接受 `personMap` 參數**，呼叫 `personMap.get(...)` |
| `canvas.js:3051-3052` | `drawFamilies` 內 parent/child find | 同上 |

### 4.2 Canvas 層的 API 調整

`canvas.js` 目前從 `app.js` 收到 `persons` 陣列作為參數。建議：

```
// 原: render(persons, relationships, ...)
// 新: render(persons, relationships, ..., { personMap })
```

或更徹底的做法：canvas 內部自建 personMap（`persons.forEach(p => map.set(p.id, p))`），代價是每幀 O(n) 建立 Map。

**推薦**：由 app 傳入 `personMap`（單一事實來源），canvas 層僅讀，不自建。這也呼應 CANVAS_DESIGN_SPEC 的「canvas 只做繪圖」原則。

### 4.3 Relationship 查找替換（Phase B/C）

| 位置 | 原寫法 | 新寫法 |
| --- | --- | --- |
| `app.js:707 / 2207 / 2663 / 3128 / 3223` | `this.relationships.find(r => r.id === X)` | **保留**（按 relId 查找，若 m 很大才需要 `relationshipById` 索引；本次不做） |
| `app.js:1818` | `this.relationships.filter(r => /* parent-child, child=... */)` | `this.parentChildByChild.get(childId) ?? []` |
| `app.js:3511` | `this.relationships.filter(r => r.type === 'parent-child' && r.toPersonId === person.id)` | 同上 |
| `app.js:3449` | `this.relationships.filter(r => /* 婚姻類 */)` | Phase C：`this.relationshipsByType.get('marriage') ?? []` |
| `canvas.js:2499-2500 / 2596-2597` | 依 category 分組 | 可保留，除非量測顯示需要 |

> **不需列全部**：上表覆蓋所有不同 pattern，實作時逐一套用即可。

---

## §5. KinshipEngine 的整合

### 5.1 現狀

- Sprint 1 的 KinshipEngine（`domain/kinship-engine.js`）建構子接 `(persons, relationships)`，內部自建 `personMap`（L14-16）。
- `App.getKinshipEngine()`（`app.js:3068`）**每次呼叫都 `new`** 一個新實例；Sprint 1 明確標記為「暫定」。
- 熱點：`canvas.js:282` 每次 render 建 KinshipEngine → 每幀做 `persons.forEach(p => map.set(...))`，這本身是 O(n)。

### 5.2 選項

| 方案 | 說明 | 評估 |
| --- | --- | --- |
| **A. 獨立**（現狀）| KinshipEngine 自建 personMap | 簡單、無耦合，但每次 `new` 有 O(n) 成本 |
| **B. 共用 personMap**（建構時注入） | `new KinshipEngine({ personMap, relationships })` | 避免重複建 Map；KinshipEngine 不持有 persons 陣列 |
| **C. App 快取 engine 實例**（Sprint 2 順手做） | `getKinshipEngine()` 回傳快取；資料變動時 invalidate | 一幀內多次呼叫也只建一次 |

### 5.3 **建議：B + C 合併**

1. **KinshipEngine 建構子改為接受 personMap（可選）**：
   - 若傳入 `personMap`，直接使用（零複製）。
   - 若未傳入，fallback 維持目前行為（自建）。
   - 保證向後相容。

2. **App 新增 `_kinshipEngine` 私有欄位 + invalidate 機制**：
   - `getKinshipEngine()` 若 `_kinshipEngine` 存在且未失效，直接回傳。
   - 任何寫入點（§3.1 / §3.2）呼叫 `_invalidateKinship()` 清空快取。
   - 讀取時若為 null 才 `new KinshipEngine(this.personMap, this.relationships)` 並快取。

3. **效益**：
   - 單幀內多次呼叫 `getKinshipEngine()`（例如 render → drawFamilies 內部還想查 parents）→ 只建一次。
   - `new` 的 O(n) 成本也省掉（因為 personMap 是直接引用）。

### 5.4 風險

- 快取失效漏呼叫 → 可能讀到舊的 engine；**對策**：invalidate 與索引維護綁同一個 helper，兩者一起失效。
- 若未來 KinshipEngine 被其他模組使用，需注意「共用 personMap」的 Person 物件是活物件（修改後 engine 看得到最新值）。

---

## §6. 效能預估

### 6.1 理論加速

| 規模 | 改善幅度（find 層） | 改善幅度（整幀） |
| --- | --- | --- |
| n=50, m=80 | ~50× | 1.2–1.5×（find 本來就小） |
| n=100, m=160 | ~100× | 2–4× |
| n=200, m=320 | ~200× | 3–8× |
| n=500（未支援，壓測參考） | ~500× | 視 Canvas 繪圖成本而定 |

### 6.2 預期**不會快**的情境

- Canvas drawing（`ctx.fillText` / `stroke` / `arc`）占 render 時間 > 70% 時，find 優化對 FPS 影響有限 → 這屬於 CANVAS_DESIGN_SPEC 範疇，本 sprint 不處理。
- 單次使用者操作（例如點一下 person）→ find 次數少，感知差異微乎其微。
- 小圖（n < 30）→ O(n) 線性掃描的絕對時間極低，優化增益可能被 Map.get 的常數成本吃掉。

### 6.3 驗證

- **依賴 Agent B 的基準測試腳本**做 before/after 量測。
- 至少提供 n ∈ {50, 100, 200} 三檔資料集的 FPS 或 render ms 對照表。
- 若 n=100 時整幀改善 < 1.5×，需回頭檢查是否 find 不是瓶頸（可能是 Canvas 或 layout）。

---

## §7. 風險與相容性

### 7.1 風險清單

| 風險 | 嚴重度 | 對策 |
| --- | --- | --- |
| 索引與陣列不同步（漏掉寫入點） | 高 | 集中透過 helper `_addPersonIndex` / `_removePersonIndex`；dev 模式加 invariant |
| undo/redo 的 deep clone 後索引失效 | 高 | `restoreState` 結尾強制 `_rebuildIndexes()` |
| `loadData` / `clearAll` 忘記重建 | 中 | 同上 |
| Canvas 層自建 personMap 導致兩份索引 | 中 | 統一由 app 注入，canvas 不自建 |
| KinshipEngine 快取失效時序 | 中 | invalidate 與索引維護綁同一 helper |
| Person 物件身份變了（例如 `Person.fromJSON` 重建後）但 personMap 還指向舊物件 | 中 | 整批載入路徑一律 `_rebuildIndexes()`，不走增量 |

### 7.2 Defensive 防護建議

```
// dev-only invariant
_assertIndexConsistent() {
    if (this.personMap.size !== this.persons.length) {
        console.warn('[personMap] size mismatch, rebuilding');
        this._rebuildIndexes();
    }
}
```

- 於 render 入口、saveState 前呼叫；release build 可關掉。

### 7.3 單元測試建議

新增 `tests/person-map-index.test.js`（若專案尚無測試框架，可先以 `refactor/` 下的手動 smoke 流程取代）：

1. addPerson → personMap 有對應條目
2. deleteSelected → personMap 無殘留
3. loadData → personMap 完整重建
4. undo/redo → personMap 指向最新物件
5. clearAll → personMap.size === 0
6. `_rebuildIndexes()` 冪等性

---

## §8. CLAUDE.md 影響評估

### 8.1 判斷：**算「重要架構改動」**

理由：
- 改變 app 層「如何存取 person/relationship」的標準姿勢。
- 新的貢獻者若不知道有 personMap，會繼續寫 `persons.find(...)` → 效能倒退。
- 涉及多個寫入點與 invalidate 語意，屬於「必須在架構文件提醒」的等級。

### 8.2 建議 CLAUDE.md 新增的 bullet（3-5 條）

> 本設計文件**不修改 CLAUDE.md**（符合禁令）；以下為供後續主 Opus 採納的提案：

1. 查找 Person **一律**使用 `this.personMap.get(id)`，**禁止**新增 `this.persons.find(p => p.id === ...)`。
2. 任何對 `this.persons` 的增刪改，**必須**透過 `_addPersonIndex / _removePersonIndex / _rebuildIndexes` helper 維護 personMap。
3. 查找親子關係使用 `this.parentChildByChild` / `parentChildByParent`（Phase B 後）；**禁止**每次 render 內 `relationships.filter(r => r.type === 'parent-child' && ...)`。
4. `KinshipEngine` 由 `getKinshipEngine()` 取得（已快取）；**禁止**在業務程式碼內直接 `new KinshipEngine(...)`。
5. undo/redo / loadData / clearAll 路徑結尾必須呼叫 `_rebuildIndexes()`。

### 8.3 若不算（反方論點）

- 可反駁：索引只是「實作細節」，外部 API（`getPersonById` 之類）可以包住。
- 若走這路線：只需在 app.js 檔頭註解標記即可，不動 CLAUDE.md。
- **本文件傾向前者**（算重要），因為 hot path 替換需要所有後續改動者配合。

---

## §9. 實作順序建議（Phase 拆分）

### Phase A：**建立 personMap 主索引 + 替換 render 主路徑**

- **範圍**：
  - 建構子、addPerson、deleteSelected、loadData、saveState/restoreState、clearAll、cache restore 全部接上維護 helper。
  - `canvas.js:283 drawFamilies`、`canvas.js:287-303 非親子迴圈`、`canvas.js:362 selection badges`、`canvas.js:339 hover` 的 `persons.find` 改為 `personMap.get`。
  - API：canvas 接受 `personMap` 參數。
- **風險**：中（寫入點多但可枚舉）。
- **驗收**：
  1. Agent B 基準測試 n=100 整幀 render 改善 ≥ 2×。
  2. 手動回歸：新增/刪除/載入/匯出/undo/redo 全部正常。
  3. Dev invariant 在正常操作下無 warning。
- **獨立合併**：✅

### Phase B：**parent-child 雙向索引 + KinshipEngine 快取**

- **範圍**：
  - 新增 `parentChildByChild` / `parentChildByParent`。
  - 替換 §4.3 表中的 parent-child filter 呼叫。
  - `getKinshipEngine()` 改為快取，資料變動 invalidate。
  - KinshipEngine 建構子支援注入 personMap。
- **風險**：中（KinshipEngine 內部 API 微調可能影響 Sprint 1 callers，需逐一檢查）。
- **驗收**：
  1. `getParentIds` / `getChildrenIds` 在 n=200 時呼叫延遲 < 1ms。
  2. 所有 Sprint 1 KinshipEngine 的 caller 回歸通過。
- **獨立合併**：✅

### Phase C（可選）：**relationshipsByType 索引**

- **範圍**：
  - 新增 `relationshipsByType`。
  - 替換依類型過濾的 filter 呼叫。
- **風險**：低。
- **驗收**：量測顯示至少一條 hot path 改善 ≥ 20%。若沒有，**跳過**。
- **獨立合併**：✅

### Phase D（可選）：**relationshipById 索引**

- **範圍**：所有 `relationships.find(r => r.id === X)` 改索引查詢。
- **觸發條件**：Agent B 量測顯示這類查找在大圖上成為新瓶頸（目前評估不是）。
- **預設**：**不做**。

### 合併策略

- 每個 Phase 獨立 PR，獨立 commit。
- Phase A 是基礎，B/C 依賴 A。
- 若時間/配額有限，**僅交付 Phase A 即可達成 REFACTOR_PLAN 風險 #4 的核心目標**。

---

## 附錄：量測用呼叫點清單（給 Agent B 參考）

- `app.js` find 呼叫點行號：548, 709, 710, 727, 728, 815, 887, 958, 972, 1016, 1356, 1392, 1393, 1786, 1936, 2156, 2213, 2214, 2272, 2464, 2559, 2676, 2677, 2715, 2716, 2941, 2963, 3110, 3456, 3522, 3530, 4296
- `canvas.js` find 呼叫點行號：287, 288, 298, 299, 339, 349, 350, 362, 406, 2415, 2416, 2506, 2507, 2516, 2517, 2602, 2603, 2612, 2613, 3051, 3052, 3538
- 請以 `drawFamilies` 熱迴圈為基準場景（pan / zoom 持續觸發 render）。
