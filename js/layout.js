/**
 * GenogramLayout - 家系圖佈局引擎
 *
 * v3（2026-09-03）：不再使用 dagre。改為家系圖語意的分層佈局（Sugiyama-lite）：
 *   1. 輩分（rank）：婚姻邊 union-find 成「配偶群」→ 以親子邊建群 DAG → 最長路徑給 rank（配偶必同列）
 *   2. 每列的「單位」= 同列以婚姻相連的一串人（單身、夫妻、多婚 hub + 配偶們），單位內配偶相鄰；
 *      多婚時依婚期：最近的配偶最靠近本人、較早的往外；左右哪一側沿用使用者目前擺法
 *   3. 同一對父母的子女連成一塊、長幼左→右（年齡未知沿用目前左右順序）
 *   4. 反覆「下推（子女置中於父母中點）／上拉（父母置中於子女之上）」數輪，同列最小間距 CELL_WIDTH，
 *      同列單位順序以重心排序、起始順序沿用使用者目前左右順序（manual-first：只整理，不重排語意）
 *   5. 不相連的獨立人物完全不動；多個家族（連通分量）左右並排
 * 對外 API 不變：new GenogramLayout(persons, relationships, {grid, households, lifeCircles}).calculate()
 *   → { positions: Map<personId,{x,y}>, lifeCircleShapes }
 */
class GenogramLayout {
    /**
     * @param {Array} persons - 人物陣列
     * @param {Array} relationships - 關係陣列
     * @param {Object} options - 選項
     * @param {Object} options.grid - 格線設定 (CELL_WIDTH, CELL_HEIGHT, ORIGIN_X, ORIGIN_Y)
     * @param {Array} options.households - 同住框陣列
     * @param {Array} options.lifeCircles - 生活圈陣列
     */
    constructor(persons, relationships, options = {}) {
        this.persons = persons || [];
        this.relationships = relationships || [];
        this.options = options;

        // 預設格線設定 (應與 GenogramApp.GRID 保持一致)
        this.grid = options.grid || {
            CELL_WIDTH: 120,
            CELL_HEIGHT: 120,
            ORIGIN_X: 50,
            ORIGIN_Y: 60
        };

        this.households = options.households || [];
        this.lifeCircles = options.lifeCircles || [];

        // 建立快速查詢映射
        this.personMap = {};
        this.persons.forEach(p => this.personMap[p.id] = p);

        // 婚姻關係類型
        this.MARRIAGE_TYPES = [
            'married', 'engaged', 'cohabiting', 'legal-cohabiting',
            'separated', 'legal-separated', 'divorced', 'widowed', 'affair'
        ];

        // 原始位置 (用於計算生活圈位移)
        this.originalPositions = {};
        this.persons.forEach(p => {
            this.originalPositions[p.id] = { x: p.x, y: p.y };
        });
    }


    /**
     * 執行佈局計算
     * @returns {Object} { positions: Map<personId, {x, y}>, lifeCircleShapes: Object }
     */
    calculate() {
        const positions = new Map();
        if (this.persons.length === 0) return { positions, lifeCircleShapes: {} };

        const model = this._buildModel();
        const ROW_H = this.grid.CELL_HEIGHT; // 輩分列距 = 格高（與快速新增、Y 吸附共用同一套格線）
        const COMPONENT_GAP = 200;       // 家族之間的間距
        const CELL = this.grid.CELL_WIDTH;

        // 獨立人物（沒有任何關係）完全不動
        model.isolated.forEach(id => positions.set(id, { x: this.personMap[id].x, y: this.personMap[id].y, keep: true }));

        // 每個家族（連通分量）各自排，依目前平均 x 由左到右排列
        const comps = model.components.slice().sort((a, b) => this._meanX(a) - this._meanX(b));
        let cursorX = this.grid.ORIGIN_X + CELL / 2;
        comps.forEach(comp => {
            const ranks = this._assignRanks(comp, model);
            const layout = this._layoutComponent(comp, model, ranks, CELL);
            // 列的 Y：以家族目前最上面一列為基準，貼齊 ORIGIN_Y + k*CELL_HEIGHT 的輩分列
            const topY = Math.min(...comp.map(id => this.personMap[id].y));
            const oy = this.grid.ORIGIN_Y;
            const baseY = oy + Math.round((topY - oy) / ROW_H) * ROW_H;
            let minX = Infinity, maxX = -Infinity;
            layout.forEach(pt => { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); });
            const shift = cursorX - minX;
            layout.forEach((pt, id) => positions.set(id, { x: pt.x + shift, y: baseY + pt.rank * ROW_H }));
            cursorX += (maxX - minX) + COMPONENT_GAP;
        });

        const lifeCircleShapes = this._recalculateLifeCircleShapes(positions);
        return { positions, lifeCircleShapes };
    }

    _meanX(ids) {
        return ids.reduce((s, id) => s + this.personMap[id].x, 0) / ids.length;
    }

    /**
     * 關係模型：父母／子女／配偶（含婚期）、連通分量、獨立人物
     */
    _buildModel() {
        const ids = this.persons.map(p => p.id);
        const idSet = new Set(ids);
        const parentsOf = new Map(ids.map(id => [id, []]));
        const childrenOf = new Map(ids.map(id => [id, []]));
        const spousesOf = new Map(ids.map(id => [id, []]));
        const marriageDate = new Map(); // key a|b → 可比較的日期字串
        this.relationships.forEach(r => {
            if (!idSet.has(r.fromPersonId) || !idSet.has(r.toPersonId) || r.fromPersonId === r.toPersonId) return;
            if (r.type === 'parent-child') {
                if (!parentsOf.get(r.toPersonId).includes(r.fromPersonId)) parentsOf.get(r.toPersonId).push(r.fromPersonId);
                if (!childrenOf.get(r.fromPersonId).includes(r.toPersonId)) childrenOf.get(r.fromPersonId).push(r.toPersonId);
            } else if (this.MARRIAGE_TYPES.includes(r.type)) {
                if (!spousesOf.get(r.fromPersonId).includes(r.toPersonId)) spousesOf.get(r.fromPersonId).push(r.toPersonId);
                if (!spousesOf.get(r.toPersonId).includes(r.fromPersonId)) spousesOf.get(r.toPersonId).push(r.fromPersonId);
                const key = [r.fromPersonId, r.toPersonId].sort().join('|');
                const d = String(r.date || '').match(/\d{4}(?:[-/.]\d{1,2})?/);
                if (d && !marriageDate.has(key)) marriageDate.set(key, d[0].replace(/[/.]/g, '-'));
            }
        });
        // 連通分量（親子 + 婚姻）；只有這兩類算「同一家族」，情感線不算
        const adj = new Map(ids.map(id => [id, new Set()]));
        parentsOf.forEach((ps, c) => ps.forEach(pr => { adj.get(c).add(pr); adj.get(pr).add(c); }));
        spousesOf.forEach((ss, a) => ss.forEach(b => { adj.get(a).add(b); adj.get(b).add(a); }));
        const seen = new Set();
        const components = [];
        const isolated = [];
        ids.forEach(id => {
            if (seen.has(id)) return;
            if (adj.get(id).size === 0) { isolated.push(id); seen.add(id); return; }
            const comp = [];
            const queue = [id];
            seen.add(id);
            while (queue.length) {
                const cur = queue.shift();
                comp.push(cur);
                adj.get(cur).forEach(n => { if (!seen.has(n)) { seen.add(n); queue.push(n); } });
            }
            components.push(comp);
        });
        return { parentsOf, childrenOf, spousesOf, marriageDate, components, isolated };
    }

    /**
     * 輩分：配偶群 union-find → 群 DAG 最長路徑。配偶必同列；子女列 ≥ 父母列 + 1；循環資料以迭代上限防護。
     * @returns {Map<personId, rank>}（自 0 起）
     */
    _assignRanks(comp, model) {
        const parent = new Map(comp.map(id => [id, id]));
        const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
        const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
        comp.forEach(id => model.spousesOf.get(id).forEach(s => union(id, s)));
        // 同一父母組合的子女必同列（手足不可分列）；否則其中一位的配偶家系較深時，手足會被拆到不同列。
        const sibKey = new Map();
        comp.forEach(id => {
            const ps = model.parentsOf.get(id).filter(pr => comp.includes(pr));
            if (!ps.length) return;
            const key = ps.slice().sort().join('|');
            if (sibKey.has(key)) union(id, sibKey.get(key)); else sibKey.set(key, id);
        });
        const groupRank = new Map(comp.map(id => [find(id), 0]));
        const edges = [];
        comp.forEach(c => model.parentsOf.get(c).forEach(pr => {
            const gp = find(pr), gc = find(c);
            if (gp !== gc) edges.push([gp, gc]);
        }));
        for (let iter = 0; iter < comp.length + 2; iter++) {
            let changed = false;
            edges.forEach(([gp, gc]) => {
                const want = groupRank.get(gp) + 1;
                if (groupRank.get(gc) < want) { groupRank.set(gc, want); changed = true; }
            });
            if (!changed) break;
        }
        // 壓實：有子女的群往下貼到「最上面的子女列 - 1」。配偶一方的父母不該因另一側家系較深
        // 而被留在高處、與子女之間空一列。只會往下移，不會違反「子女列 ≥ 父母列 + 1」。
        const childGroups = new Map();
        edges.forEach(([gp, gc]) => { if (!childGroups.has(gp)) childGroups.set(gp, new Set()); childGroups.get(gp).add(gc); });
        for (let iter = 0; iter < comp.length + 2; iter++) {
            let changed = false;
            childGroups.forEach((kids, gp) => {
                const want = Math.min(...[...kids].map(gc => groupRank.get(gc))) - 1;
                if (want > groupRank.get(gp)) { groupRank.set(gp, want); changed = true; }
            });
            if (!changed) break;
        }
        const ranks = new Map(comp.map(id => [id, groupRank.get(find(id))]));
        const min = Math.min(...ranks.values());
        ranks.forEach((r, id) => ranks.set(id, r - min));
        return ranks;
    }

    /**
     * 單一家族的水平佈局（相對座標）。回傳 Map<id, {x, rank}>
     */
    _layoutComponent(comp, model, ranks, CELL) {
        const P = id => this.personMap[id];
        const maxRank = Math.max(...ranks.values());
        const byRank = [];
        for (let r = 0; r <= maxRank; r++) byRank.push(comp.filter(id => ranks.get(id) === r));

        // ---- 單位：同列以婚姻相連的一串人 ----
        const unitOf = new Map();
        const units = []; // { id, members:[ids 左→右], rank, unions:[{parents:[ids], mid: 相對單位左端的偏移}] }
        byRank.forEach((rowIds, r) => {
            const rowSet = new Set(rowIds);
            const seen = new Set();
            rowIds.slice().sort((a, b) => P(a).x - P(b).x).forEach(id => {
                if (seen.has(id)) return;
                // 收集同列婚姻連通的人
                const group = [];
                const q = [id]; seen.add(id);
                while (q.length) { const c = q.shift(); group.push(c); model.spousesOf.get(c).forEach(s => { if (rowSet.has(s) && !seen.has(s)) { seen.add(s); q.push(s); } }); }
                const members = this._orderUnit(group, model);
                const unit = { id: 'u' + units.length, members, rank: r, unions: [] };
                members.forEach(m => unitOf.set(m, unit));
                units.push(unit);
            });
        });

        // ---- 子女依「父母組合」分塊 ----
        const unionKey = ids => ids.slice().sort().join('|');
        const childrenOfUnion = new Map(); // key → [childIds]
        comp.forEach(id => {
            const ps = model.parentsOf.get(id).filter(pr => comp.includes(pr));
            if (!ps.length) return;
            const key = unionKey(ps);
            if (!childrenOfUnion.has(key)) childrenOfUnion.set(key, []);
            childrenOfUnion.get(key).push(id);
        });
        // 手足順序：年齡大→小（左→右）；年齡未知沿用目前 x
        const age = id => { const p = P(id); const a = p.getDisplayAge ? p.getDisplayAge() : p.age; if (a === null || a === undefined || a === '') return null; const n = Number(a); return Number.isFinite(n) ? n : null; };
        childrenOfUnion.forEach(list => list.sort((a, b) => {
            const aa = age(a), ab = age(b);
            if (aa !== null && ab !== null && aa !== ab) return ab - aa;
            return P(a).x - P(b).x;
        }));

        // ---- 初始 x：每列依「重心」排序後左→右鋪開 ----
        const x = new Map(); // id → x
        const unitWidth = u => (u.members.length - 1) * CELL;
        const unitCenterFromLeft = u => unitWidth(u) / 2;
        const placeRow = (rowUnits, desiredCenter) => {
            // rowUnits 依 desiredCenter 排序後掃描，保證相鄰人物 ≥ CELL
            // 手足順序：年齡已知者長→幼；年齡未知者依本輪期望位置（重心法）。每輪重排，
            // 讓「配偶家系在另一側」的手足自然換位、減少跨代交叉；同時更新 childrenOfUnion 供下行偏移使用。
            const rowUnitSet = new Set(rowUnits);
            const memberWant = id => {
                const u = unitOf.get(id);
                const base = (u && desiredCenter.has(u.id)) ? desiredCenter.get(u.id) - unitCenterFromLeft(u) : (x.has(id) ? x.get(id) : P(id).x);
                return u && desiredCenter.has(u.id) ? base + u.members.indexOf(id) * CELL : base;
            };
            const siblingOrderPairs = [];
            childrenOfUnion.forEach(list => {
                if (!list.some(id => rowUnitSet.has(unitOf.get(id)))) return;
                list.sort((a, b) => {
                    const aa = age(a), ab = age(b);
                    if (aa !== null && ab !== null && aa !== ab) return ab - aa;
                    return memberWant(a) - memberWant(b);
                });
                for (let k = 1; k < list.length; k++) {
                    const ua = unitOf.get(list[k - 1]), ub = unitOf.get(list[k]);
                    if (ua && ub && ua !== ub && rowUnitSet.has(ua) && rowUnitSet.has(ub)) siblingOrderPairs.push([ua, ub]);
                }
            });
            // 手足叢集：同一父母的子女所屬單位視為一個叢集（含其配偶）；叢集整體依平均期望排序、
            // 叢集內再依各自期望排序 → 手足塊不會被別家的單位插隊隔開。
            const cparent = new Map(rowUnits.map(u => [u, u]));
            const cfind = u => { while (cparent.get(u) !== u) u = cparent.get(u); return u; };
            siblingOrderPairs.forEach(([ua, ub]) => {
                if (!cparent.has(ua) || !cparent.has(ub)) return;
                const ra = cfind(ua), rb = cfind(ub);
                if (ra !== rb) cparent.set(ra, rb);
            });
            const csum = new Map(), ccount = new Map();
            rowUnits.forEach(u => { const r = cfind(u); csum.set(r, (csum.get(r) || 0) + desiredCenter.get(u.id)); ccount.set(r, (ccount.get(r) || 0) + 1); });
            const cdesired = u => csum.get(cfind(u)) / ccount.get(cfind(u));
            rowUnits.sort((a, b) => cdesired(a) - cdesired(b) || cfind(a).id.localeCompare(cfind(b).id)
                || desiredCenter.get(a.id) - desiredCenter.get(b.id) || a.id.localeCompare(b.id));
            // 修回被翻轉的手足順序（把右者搬到左者之後）；有循環約束時以上限收斂
            for (let guard = 0; guard <= rowUnits.length * rowUnits.length; guard++) {
                let moved = false;
                for (const [ua, ub] of siblingOrderPairs) {
                    const ia = rowUnits.indexOf(ua), ib = rowUnits.indexOf(ub);
                    if (ia < 0 || ib < 0 || ia < ib) continue;
                    rowUnits.splice(ib, 1);
                    rowUnits.splice(rowUnits.indexOf(ua) + 1, 0, ub);
                    moved = true;
                }
                if (!moved) break;
            }
            let right = -Infinity;
            rowUnits.forEach(u => {
                let left = desiredCenter.get(u.id) - unitCenterFromLeft(u);
                if (left < right + CELL) left = right + CELL;
                u.members.forEach((m, i) => x.set(m, left + i * CELL));
                right = left + unitWidth(u);
            });
            // 第二趟：由右往左把「想往左」的單位盡量拉回（貼近期望）
            let leftLimit = Infinity;
            for (let i = rowUnits.length - 1; i >= 0; i--) {
                const u = rowUnits[i];
                const curLeft = x.get(u.members[0]);
                const wantLeft = desiredCenter.get(u.id) - unitCenterFromLeft(u);
                let left = Math.max(wantLeft, curLeft);
                left = Math.min(left, leftLimit - unitWidth(u) - CELL);
                if (left < curLeft) left = curLeft; // 不往左推（已被左鄰擋住）
                u.members.forEach((m, k) => x.set(m, left + k * CELL));
                leftLimit = left;
            }
        };
        const unionMid = (parents) => parents.reduce((s, pr) => s + x.get(pr), 0) / parents.length;
        // 子女塊中心 = 最左與最右子女的中點（父母置中於手足橫線之上，而非平均值）
        const childrenCenter = (list) => {
            let lo = Infinity, hi = -Infinity;
            list.forEach(c => { const v = x.get(c); lo = Math.min(lo, v); hi = Math.max(hi, v); });
            return (lo + hi) / 2;
        };

        // 第 0 列：沿用使用者目前左右順序
        const rowUnits = byRank.map(rowIds => [...new Set(rowIds.map(id => unitOf.get(id)))]);
        {
            const desired = new Map(rowUnits[0].map(u => [u.id, u.members.reduce((s, m) => s + P(m).x, 0) / u.members.length]));
            placeRow(rowUnits[0], desired);
        }
        // 往下：子女塊置中於父母中點；同一父母的子女相鄰（以「父母中點 + 塊內偏移」當期望）
        const downPass = (r) => {
            const desired = new Map();
            rowUnits[r].forEach(u => {
                // 單位內每個有父母的成員：期望 = 父母中點 + 在手足塊中的偏移；取平均
                const wants = [];
                u.members.forEach((m, i) => {
                    const ps = model.parentsOf.get(m).filter(pr => comp.includes(pr) && x.has(pr));
                    if (!ps.length) return;
                    const sibs = childrenOfUnion.get(unionKey(ps)) || [m];
                    // 手足塊：每個手足連同配偶佔其單位寬度，左→右緊鄰排開；
                    // 置中基準 = 最左手足與最右手足的中點（配偶掛在外側不算），對齊父母中點。
                    const kidPos = [];
                    let acc = 0;
                    sibs.forEach(sib => {
                        const su = unitOf.get(sib);
                        kidPos.push(acc + su.members.indexOf(sib) * CELL);
                        acc += unitWidth(su) + CELL;
                    });
                    const spanMid = (kidPos[0] + kidPos[kidPos.length - 1]) / 2;
                    const idx = sibs.indexOf(m);
                    const offset = idx >= 0 ? kidPos[idx] - spanMid : 0;
                    // m 在自己單位內的位置 i → 單位中心的期望
                    const unitCenterWant = unionMid(ps) + offset - (i * CELL - unitCenterFromLeft(u));
                    wants.push(unitCenterWant);
                });
                const fallback = u.members.reduce((s, m) => s + (x.has(m) ? x.get(m) : P(m).x), 0) / u.members.length;
                desired.set(u.id, wants.length ? wants.reduce((a, b) => a + b, 0) / wants.length : fallback);
            });
            placeRow(rowUnits[r], desired);
        };
        // 往上：父母置中於其子女塊之上（沒有子女的單位維持現位）
        const upPass = (r) => {
            const desired = new Map();
            rowUnits[r].forEach(u => {
                const wants = [];
                // 每個 union（此單位內的父母組合）→ 子女中心 - 該 union 中點相對單位中心的偏移
                const seenKeys = new Set();
                u.members.forEach(m => {
                    model.childrenOf.get(m).filter(c => comp.includes(c) && x.has(c)).forEach(c => {
                        const ps = model.parentsOf.get(c).filter(pr => comp.includes(pr));
                        const key = unionKey(ps);
                        if (seenKeys.has(key)) return;
                        seenKeys.add(key);
                        const kids = childrenOfUnion.get(key) || [c];
                        const midOffset = unionMid(ps) - (x.get(u.members[0]) + unitCenterFromLeft(u));
                        wants.push(childrenCenter(kids) - midOffset);
                    });
                });
                const cur = x.get(u.members[0]) + unitCenterFromLeft(u);
                desired.set(u.id, wants.length ? wants.reduce((a, b) => a + b, 0) / wants.length : cur);
            });
            placeRow(rowUnits[r], desired);
        };
        for (let r = 1; r <= maxRank; r++) downPass(r);
        for (let round = 0; round < 3; round++) {
            for (let r = maxRank - 1; r >= 0; r--) upPass(r);
            for (let r = 1; r <= maxRank; r++) downPass(r);
        }
        // 整體平移使最左為 0；貼半格
        let minX = Infinity;
        x.forEach(v => { minX = Math.min(minX, v); });
        const out = new Map();
        comp.forEach(id => out.set(id, { x: Math.round((x.get(id) - minX) / (CELL / 2)) * (CELL / 2), rank: ranks.get(id) }));
        return out;
    }

    /**
     * 單位內排序：hub = 婚姻最多者；配偶依婚期由近到遠貼近 hub，左右側沿用目前擺法；其餘鏈結成員依目前 x
     */
    _orderUnit(group, model) {
        const P = id => this.personMap[id];
        if (group.length <= 1) return group.slice();
        if (group.length === 2) return group.slice().sort((a, b) => P(a).x - P(b).x);
        const inGroup = new Set(group);
        const degree = id => model.spousesOf.get(id).filter(s => inGroup.has(s)).length;
        const hub = group.slice().sort((a, b) => degree(b) - degree(a) || P(a).x - P(b).x)[0];
        const dateOf = (a, b) => model.marriageDate.get([a, b].sort().join('|')) || '';
        const spouses = model.spousesOf.get(hub).filter(s => inGroup.has(s));
        const left = spouses.filter(s => P(s).x < P(hub).x);
        const right = spouses.filter(s => P(s).x >= P(hub).x);
        // 兩側都沒有時（同 x）→ 依婚期：最近的放右邊
        const byDateDesc = (a, b) => (dateOf(hub, b) > dateOf(hub, a) ? 1 : dateOf(hub, b) < dateOf(hub, a) ? -1 : P(a).x - P(b).x);
        left.sort(byDateDesc);   // 最近婚期者最靠近 hub（左側 = 陣列末端貼 hub）
        right.sort(byDateDesc);  // 右側 = 陣列開頭貼 hub
        const ordered = [...left.slice().reverse(), hub, ...right];
        // 鏈結延伸（配偶的配偶等）：接到最近的一端
        const rest = group.filter(id => !ordered.includes(id)).sort((a, b) => P(a).x - P(b).x);
        rest.forEach(id => { if (P(id).x < P(hub).x) ordered.unshift(id); else ordered.push(id); });
        return ordered;
    }

    /**
     * 重新計算生活圈形狀 (Smart Binding)
     * 根據成員的新位置，重新產生包圍框
     * @param {Map} positions - 新座標
     * @returns {Object} lifeCircleId -> [{x, y}, ...] (新頂點)
     */
    _recalculateLifeCircleShapes(positions) {
        const newShapes = {};

        if (!this.lifeCircles || this.lifeCircles.length === 0) {
            return newShapes;
        }

        // 射線法：點是否在多邊形內（成員判定不再用 bounding box，
        // 避免「在 bbox 內但在多邊形外」的人被誤算進圈裡）
        const pointInPolygon = (x, y, pts) => {
            let inside = false;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                const xi = pts[i].x, yi = pts[i].y;
                const xj = pts[j].x, yj = pts[j].y;
                const intersect = ((yi > y) !== (yj > y)) &&
                    (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        };

        this.lifeCircles.forEach(lc => {
            if (!lc.points || lc.points.length === 0) return;

            // 原始生活圈的外接矩形（仿射變換的基準）
            const minX = Math.min(...lc.points.map(pt => pt.x));
            const maxX = Math.max(...lc.points.map(pt => pt.x));
            const minY = Math.min(...lc.points.map(pt => pt.y));
            const maxY = Math.max(...lc.points.map(pt => pt.y));

            // 1. 找出原本在生活圈「多邊形內」的成員
            const membersInCircle = this.persons.filter(p => {
                const orig = this.originalPositions[p.id];
                if (!orig) return false;
                return pointInPolygon(orig.x, orig.y, lc.points);
            });

            if (membersInCircle.length === 0) {
                // 沒圈到任何人：保持原狀（通常是裝飾用），不回傳新 points
                return;
            }

            // 2. 獲取這些成員的新位置
            let newMinX = Infinity, newMaxX = -Infinity;
            let newMinY = Infinity, newMaxY = -Infinity;

            membersInCircle.forEach(p => {
                const newPos = positions.get(p.id);
                if (newPos) {
                    newMinX = Math.min(newMinX, newPos.x);
                    newMaxX = Math.max(newMaxX, newPos.x);
                    newMinY = Math.min(newMinY, newPos.y);
                    newMaxY = Math.max(newMaxY, newPos.y);
                }
            });

            if (newMinX === Infinity) return; // 成員都沒有新位置

            // 3. 加上 Padding
            const PADDING = 60; // 留出足夠空間
            newMinX -= PADDING;
            newMaxX += PADDING;
            newMinY -= PADDING;
            newMaxY += PADDING;

            // 4. [Fix] 保留使用者手繪輪廓：以仿射變換把原多邊形
            // 從舊外接矩形映射到新外接矩形（原本是硬換成矩形，形狀全失）
            const oldW = Math.max(1, maxX - minX);
            const oldH = Math.max(1, maxY - minY);
            const scaleX = (newMaxX - newMinX) / oldW;
            const scaleY = (newMaxY - newMinY) / oldH;

            newShapes[lc.id] = lc.points.map(pt => ({
                x: newMinX + (pt.x - minX) * scaleX,
                y: newMinY + (pt.y - minY) * scaleY
            }));
        });

        return newShapes;
    }
    /**
     * 計算生活圈的位移量
     * @param {Map} positions - 新座標
     * @returns {Object} lifeCircleId -> { dx, dy }
     */
    _calculateLifeCircleShifts(positions) {
        const shifts = {};

        if (!this.lifeCircles || this.lifeCircles.length === 0) {
            return shifts;
        }

        this.lifeCircles.forEach(lc => {
            if (!lc.points || lc.points.length === 0) {
                shifts[lc.id] = { dx: 0, dy: 0 };
                return;
            }

            // 計算生活圈的中心點
            const centerX = lc.points.reduce((sum, pt) => sum + pt.x, 0) / lc.points.length;
            const centerY = lc.points.reduce((sum, pt) => sum + pt.y, 0) / lc.points.length;

            // 計算生活圈的範圍
            const minX = Math.min(...lc.points.map(pt => pt.x));
            const maxX = Math.max(...lc.points.map(pt => pt.x));
            const minY = Math.min(...lc.points.map(pt => pt.y));
            const maxY = Math.max(...lc.points.map(pt => pt.y));

            // 找出原本在生活圈範圍內的成員
            const membersInCircle = this.persons.filter(p => {
                const orig = this.originalPositions[p.id];
                if (!orig) return false;

                // 擴大範圍 50px
                return orig.x >= minX - 50 && orig.x <= maxX + 50 &&
                    orig.y >= minY - 50 && orig.y <= maxY + 50;
            });

            if (membersInCircle.length === 0) {
                shifts[lc.id] = { dx: 0, dy: 0 };
                return;
            }

            // 計算這些成員的平均位移
            let totalDx = 0, totalDy = 0;
            membersInCircle.forEach(p => {
                const orig = this.originalPositions[p.id];
                const newPos = positions.get(p.id);
                if (orig && newPos) {
                    totalDx += newPos.x - orig.x;
                    totalDy += newPos.y - orig.y;
                }
            });

            shifts[lc.id] = {
                dx: totalDx / membersInCircle.length,
                dy: totalDy / membersInCircle.length
            };
        });

        return shifts;
    }

    /**
     * 將座標對齊到格線
     * @param {number} value
     * @param {string} axis - 'x' or 'y'
     * @returns {number}
     */
    snapToGrid(value, axis) {
        const cellSize = axis === 'x' ? this.grid.CELL_WIDTH : this.grid.CELL_HEIGHT;
        const origin = axis === 'x' ? this.grid.ORIGIN_X : this.grid.ORIGIN_Y;
        return Math.round((value - origin) / cellSize) * cellSize + origin;
    }
}

// 匯出給全域使用
if (typeof window !== 'undefined') {
    window.GenogramLayout = GenogramLayout;
}
