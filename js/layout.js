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
 *   6. [L4] 有同住框或情感線時，再做一次同列順序的成本最佳化（_optimizeCohesion）：同住框成員聚攏、
 *      情感／虐待線變短、親子線不交叉；只換同列順序與配偶站哪一側，語意規則全數保留；無改善則結果不變
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
            'separated', 'legal-separated', 'divorced', 'widowed', 'affair',
            'engaged-separated', 'engaged-cohabiting' // 與 GenogramApp.MARRIAGE_TYPES 一致（2026-10-12 補上）
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
        const unionParents = new Map();    // key → [parentIds]
        comp.forEach(id => {
            const ps = model.parentsOf.get(id).filter(pr => comp.includes(pr));
            if (!ps.length) return;
            const key = unionKey(ps);
            if (!childrenOfUnion.has(key)) { childrenOfUnion.set(key, []); unionParents.set(key, ps.slice()); }
            childrenOfUnion.get(key).push(id);
        });
        // 手足順序：年齡大→小（左→右）；年齡未知沿用目前 x
        const age = id => {
            const p = P(id);
            const a = p.getDisplayAge ? p.getDisplayAge() : p.age;
            if (a === null || a === undefined || a === '') return p.gender === 'pregnancy' ? -1 : null; // [L4] 懷孕中 = 最幼
            const n = Number(a);
            return Number.isFinite(n) ? n : null;
        };
        // [L3] 多婚鏈側邊規則用：人物位在「≥3 人單位」的哪一端
        const chainSide = id => {
            const u = unitOf.get(id);
            if (!u || u.members.length < 3) return null;
            const i = u.members.indexOf(id);
            if (i === 0) return 'left';
            if (i === u.members.length - 1) return 'right';
            return null;
        };
        // [L4] 手足排序（純函式，回傳新陣列）：
        //   年齡已知者長→幼（同齡依 want），年齡未知者依 want，兩串以 want「合併」——
        //   舊版用「有一方未知就比位置」的比較子不具遞移性，混合時會把 7 歲排到 12 歲左邊。
        //   雙胞胎（twinGroup）收攏相鄰；最後套多婚鏈側邊規則（見 placeRow 註解）。
        const orderSiblings = (list, want) => {
            const known = list.filter(id => age(id) !== null).sort((a, b) => age(b) - age(a) || want(a) - want(b));
            const unknown = list.filter(id => age(id) === null).sort((a, b) => want(a) - want(b));
            let out = [];
            for (let i = 0, j = 0; i < known.length || j < unknown.length;) {
                if (j >= unknown.length || (i < known.length && want(known[i]) <= want(unknown[j]))) out.push(known[i++]);
                else out.push(unknown[j++]);
            }
            const twin = id => P(id).twinGroup || null;
            if (out.some(twin)) {
                const grouped = [];
                out.forEach(id => {
                    if (grouped.includes(id)) return;
                    grouped.push(id);
                    if (twin(id)) out.forEach(o => { if (o !== id && twin(o) === twin(id) && !grouped.includes(o)) grouped.push(o); });
                });
                out = grouped;
            }
            if (out.length > 1 && out.some(id => chainSide(id))) {
                const toLeft = out.filter(id => chainSide(id) === 'right');
                const toRight = out.filter(id => chainSide(id) === 'left');
                const middle = out.filter(id => !chainSide(id));
                out = [...toLeft, ...middle, ...toRight];
            }
            return out;
        };
        childrenOfUnion.forEach(list => {
            const ordered = orderSiblings(list, id => P(id).x);
            list.splice(0, list.length, ...ordered);
        });
        // [L4] 列 rank ≤ lockedUpTo 時 placeRow 不重排（順序由 cohesion 最佳化決定），只做最小間距壓實；
        // 平常為 -1（全部依重心排序，與舊版相同）
        let lockedUpTo = -1;

        // ---- 初始 x：每列依「重心」排序後左→右鋪開 ----
        const x = new Map(); // id → x
        // [L2] 單位內成員間距：預設每段 CELL；「姻親對正」會把夫妻的一段拉寬（見 spreadInLawCouples）
        const gapAt = (u, k) => (u.gaps && Number.isFinite(u.gaps[k])) ? u.gaps[k] : CELL;
        const memberOffset = (u, i) => { let acc = 0; for (let k = 0; k < i; k++) acc += gapAt(u, k); return acc; };
        const unitWidth = u => memberOffset(u, u.members.length - 1);
        const unitCenterFromLeft = u => unitWidth(u) / 2;
        const placeRow = (rowUnits, desiredCenter) => {
            // rowUnits 依 desiredCenter 排序後掃描，保證相鄰人物 ≥ CELL
            // 手足順序：年齡已知者長→幼；年齡未知者依本輪期望位置（重心法）。每輪重排，
            // 讓「配偶家系在另一側」的手足自然換位、減少跨代交叉；同時更新 childrenOfUnion 供下行偏移使用。
            const rowUnitSet = new Set(rowUnits);
            const locked = rowUnits.length > 0 && rowUnits[0].rank <= lockedUpTo;
            const memberWant = id => {
                const u = unitOf.get(id);
                const base = (u && desiredCenter.has(u.id)) ? desiredCenter.get(u.id) - unitCenterFromLeft(u) : (x.has(id) ? x.get(id) : P(id).x);
                return u && desiredCenter.has(u.id) ? base + memberOffset(u, u.members.indexOf(id)) : base;
            };
            const siblingOrderPairs = [];
            if (!locked) childrenOfUnion.forEach(list => {
                if (!list.some(id => rowUnitSet.has(unitOf.get(id)))) return;
                // 手足排序見 orderSiblings。
                // [L3] 多婚鏈側邊規則：手足若位在「多婚鏈」的一端、另一側有 ≥2 個外人（配偶＋再婚對象），
                // 就把他排到手足塊的外側（左端者排最右、右端者排最左），父母的手足橫線才不會跨過整條鏈。
                // 只有一位配偶的手足（另一側 1 人）維持長幼左→右，配偶緊鄰是家系圖的正常畫法。
                const ordered = orderSiblings(list, memberWant);
                list.splice(0, list.length, ...ordered);
                for (let k = 1; k < list.length; k++) {
                    const ua = unitOf.get(list[k - 1]), ub = unitOf.get(list[k]);
                    if (ua && ub && ua !== ub && rowUnitSet.has(ua) && rowUnitSet.has(ub)) siblingOrderPairs.push([ua, ub]);
                }
            });
            // 手足叢集：同一父母的子女所屬單位視為一個叢集（含其配偶）；叢集整體依平均期望排序、
            // 叢集內再依各自期望排序 → 手足塊不會被別家的單位插隊隔開。
            if (!locked) {
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
            }
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
                u.members.forEach((m, i) => x.set(m, left + memberOffset(u, i)));
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
                u.members.forEach((m, k) => x.set(m, left + memberOffset(u, k)));
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
                        kidPos.push(acc + memberOffset(su, su.members.indexOf(sib)));
                        acc += unitWidth(su) + CELL;
                    });
                    const spanMid = (kidPos[0] + kidPos[kidPos.length - 1]) / 2;
                    const idx = sibs.indexOf(m);
                    const offset = idx >= 0 ? kidPos[idx] - spanMid : 0;
                    // m 在自己單位內的位置 i → 單位中心的期望
                    const unitCenterWant = unionMid(ps) + offset - (memberOffset(u, i) - unitCenterFromLeft(u));
                    wants.push(unitCenterWant);
                });
                const fallback = u.members.reduce((s, m) => s + (x.has(m) ? x.get(m) : P(m).x), 0) / u.members.length;
                desired.set(u.id, wants.length ? wants.reduce((a, b) => a + b, 0) / wants.length : fallback);
            });
            placeRow(rowUnits[r], desired);
        };
        // 往上：父母置中於其子女塊之上（沒有子女的單位維持現位）
        // [L6] 同住偏移：cohesion 最佳化可為上層單位設定 unitBias（{anchors, targets}），把父母往下一列的同住成員拉；
        // 限制在自己子女塊的範圍內（父母中點不超出最左／最右子女），親子線才不會跨過別家的線
        const unitBias = new Map();
        const upPass = (r) => {
            const desired = new Map();
            rowUnits[r].forEach(u => {
                const wants = [];
                let kidLo = Infinity, kidHi = -Infinity;
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
                        kids.forEach(k => { const v = x.get(k) - midOffset; kidLo = Math.min(kidLo, v); kidHi = Math.max(kidHi, v); });
                    });
                });
                const cur = x.get(u.members[0]) + unitCenterFromLeft(u);
                let want = wants.length ? wants.reduce((a, b) => a + b, 0) / wants.length : cur;
                // 同住偏移：讓單位內的同住者（anchors）正對下一列的同住者（targets）；每輪依目前 x 重算，自我修正
                const bias = unitBias.get(u.id);
                if (wants.length && bias) {
                    const targets = bias.targets.filter(id => x.has(id));
                    if (targets.length) {
                        const targetX = targets.reduce((s, id) => s + x.get(id), 0) / targets.length;
                        const anchorOff = bias.anchors.reduce((s, id) => s + memberOffset(u, u.members.indexOf(id)), 0) / bias.anchors.length - unitCenterFromLeft(u);
                        want = Math.max(kidLo, Math.min(kidHi, targetX - anchorOff));
                    }
                }
                desired.set(u.id, want);
            });
            placeRow(rowUnits[r], desired);
        };
        // [L2] 姻親對正：兩人夫妻、各自的父母都在上一列時，把夫妻拉開到「各自正對自己父母中點」的距離，
        // 親子線才會是直的（使用者手排時就是這樣擺）。上限 4 格；父母左右順序與夫妻相反時不拉（避免交叉）。
        const MAX_SPREAD = CELL * 4;
        const spreadInLawCouples = () => {
            units.forEach(u => {
                if (u.members.length !== 2 || u.rank === 0) return;
                const [a, b] = u.members;
                const pa = model.parentsOf.get(a).filter(pr => comp.includes(pr) && x.has(pr));
                const pb = model.parentsOf.get(b).filter(pr => comp.includes(pr) && x.has(pr));
                if (!pa.length || !pb.length) { u.gaps = null; return; }
                if (unionKey(pa) === unionKey(pb)) { u.gaps = null; return; } // 同父母（資料異常）不處理
                // 只有「兩人都是各自父母唯一（或最左/最右）子女塊」才對正；有手足時手足塊置中規則優先
                const sa = childrenOfUnion.get(unionKey(pa)) || [a];
                const sb = childrenOfUnion.get(unionKey(pb)) || [b];
                if (sa.length !== 1 || sb.length !== 1) { u.gaps = null; return; }
                const want = unionMid(pb) - unionMid(pa);
                if (want <= CELL) { u.gaps = null; return; } // 父母順序相反或太近 → 維持一格
                u.gaps = [Math.min(MAX_SPREAD, Math.round(want / (CELL / 2)) * (CELL / 2))];
            });
        };
        const sweeps = () => {
            for (let r = 1; r <= maxRank; r++) downPass(r);
            for (let round = 0; round < 3; round++) {
                for (let r = maxRank - 1; r >= 0; r--) upPass(r);
                spreadInLawCouples();
                for (let r = 1; r <= maxRank; r++) downPass(r);
            }
        };
        sweeps();
        this._optimizeCohesion({
            model, comp, ranks, maxRank, byRank, units, unitOf, rowUnits, childrenOfUnion, unionParents, x, CELL,
            orderSiblings, unitBias,
            setLockedUpTo: r => { lockedUpTo = r; },
            placeTopRow: () => {
                const desired = new Map(rowUnits[0].map(u => [u.id, u.members.reduce((s, m) => s + P(m).x, 0) / u.members.length]));
                placeRow(rowUnits[0], desired);
            },
            sweeps
        });
        // 整體平移使最左為 0；貼半格
        let minX = Infinity;
        x.forEach(v => { minX = Math.min(minX, v); });
        const out = new Map();
        comp.forEach(id => out.set(id, { x: Math.round((x.get(id) - minX) / (CELL / 2)) * (CELL / 2), rank: ranks.get(id) }));
        return out;
    }

    /**
     * [L4] 同列順序的成本最佳化（同住框聚攏、情感線變短）。只改「同列左右順序」與「配偶站哪一側」，
     * 不改輩分列、不改間距規則。
     * 做法：在既有上下掃描完成後，以目前各列順序為起點，逐列嘗試候選變動——
     *   單位搬移到同列其他位置、單位的配偶側變體（＋搬移）、手足叢集整塊搬移——
     * 不合法的候選（手足長幼／雙胞胎相鄰／多婚鏈側邊規則被破壞、手足叢集被外人插隊）直接丟棄；
     * 合法者重跑掃描：此列與其上各列鎖定順序（placeRow 只壓實不重排），其下各列照舊依重心重排，再計算成本：
     *   候選另含「同住偏移」：上層單位往下一列同住成員拉（unitBias，限於自己子女塊範圍內）
     *   成本 = 6×親子線交叉 + 1×子女塊偏離父母中點(格，寬塊 > 4 格時塊內有寬容)×子女數 + 0.35×情感線水平長(格)
     *        + 3×同住框同列插入的外人數 + 1×同住框跨列水平斷開(格) + 0.1×總寬(格)
     *        + 4×(子女塊偏離超出硬限制的部分)(格)
     * 每列取最佳且嚴格降低成本者，以全列鎖定重算確認後採用；反覆至收斂或達評估上限。
     * 最終只採用「符合子女置中硬限制」且成本低於原結果的狀態；否則完整還原（位元不變）。確定性。
     * 只有家族內有同住框（≥2 人）或情感線時才啟動。
     */
    _optimizeCohesion(ctx) {
        const { model, comp, ranks, maxRank, byRank, units, unitOf, rowUnits, childrenOfUnion, unionParents, x, CELL, orderSiblings, unitBias } = ctx;
        const compSet = new Set(comp);
        const isEmotional = (type) => {
            if (typeof Relationship !== 'undefined' && Relationship.getCategory) return Relationship.getCategory(type) === 'emotional';
            return type !== 'parent-child' && type !== 'family' && !this.MARRIAGE_TYPES.includes(type);
        };
        const emoPairs = this.relationships
            .filter(r => r.fromPersonId !== r.toPersonId && compSet.has(r.fromPersonId) && compSet.has(r.toPersonId) && isEmotional(r.type))
            .map(r => [r.fromPersonId, r.toPersonId]);
        const hhSets = (this.households || [])
            .map(h => (h && Array.isArray(h.ids)) ? new Set(h.ids.filter(id => compSet.has(id))) : new Set())
            .filter(s => s.size >= 2);
        if (!emoPairs.length && !hhSets.length) return;

        const W = { CROSS: 6, CENTER: 1, EMO: 0.35, INTRUDER: 3, HH_GAP: 1, WIDTH: 0.1, PENALTY: 4 };
        // 成本以「貼半格後」的座標計算（與最終輸出一致）
        const HALF = CELL / 2;
        let xr = new Map();
        const snapX = () => {
            let minX = Infinity;
            x.forEach(v => { minX = Math.min(minX, v); });
            xr = new Map();
            x.forEach((v, id) => xr.set(id, Math.round((v - minX) / HALF) * HALF));
        };
        // 子女塊中心偏離父母中點。硬限制：①各組超過半格的部分加總不得多於原結果；
        // ②任一組不得超過 max(半格〔單一子女 2 格〕, 原結果中「父母同屬一條婚姻鏈」各組的最大偏離)——
        //   本來就擠的多婚鏈（如 6 人鏈下 8 個子女）只能在鏈內各組之間重新分配讓位，不能變得更歪，
        //   也不能把別處的寬鬆借來用
        // 寬子女塊（> 4 格）給予寬容：父母中點在塊內偏離「中央 ±(寬-4格)/2」的範圍內不算偏離，
        // 同住偏移（unitBias）才有空間把父母拉到同住的那個子女正上方
        const WIDE = CELL * 4;
        const centerOffsets = () => {
            const out = new Map();
            childrenOfUnion.forEach((kids, key) => {
                const ps = unionParents.get(key);
                const mid = ps.reduce((s, p) => s + xr.get(p), 0) / ps.length;
                let lo = Infinity, hi = -Infinity;
                kids.forEach(k => { const v = xr.get(k); lo = Math.min(lo, v); hi = Math.max(hi, v); });
                const slack = Math.max(0, (hi - lo - WIDE) / 2);
                out.set(key, Math.max(0, Math.abs((lo + hi) / 2 - mid) - slack));
            });
            return out;
        };
        let centerLimit = null;
        let lastValid = true;
        const cost = () => {
            snapX();
            let c = 0;
            const offs = centerOffsets();
            lastValid = true;
            if (centerLimit) {
                // 搜尋中以重罰處理（允許「先動上一列、再整理下一列」的兩步改善），最終只採用合法狀態
                let excess = 0;
                for (const [key, off] of offs) {
                    const over = off - centerLimit.cap.get(key);
                    if (over > 1e-6) { lastValid = false; c += W.PENALTY * over / CELL; }
                    excess += Math.max(0, off - HALF);
                }
                if (excess > centerLimit.excess + 1e-6) { lastValid = false; c += W.PENALTY * (excess - centerLimit.excess) / CELL; }
            }
            // 子女越多的塊偏離越貴：單一子女讓位比整塊手足偏掉便宜
            offs.forEach((off, k) => { c += W.CENTER * childrenOfUnion.get(k).length * off / CELL; });
            // 親子線交叉（父母中點→子女，同列對之間）
            const segs = [];
            childrenOfUnion.forEach((kids, key) => {
                const ps = unionParents.get(key);
                const mid = ps.reduce((s, p) => s + xr.get(p), 0) / ps.length;
                kids.forEach(k => segs.push([ranks.get(k), mid, xr.get(k), key]));
            });
            for (let i = 0; i < segs.length; i++) {
                for (let j = i + 1; j < segs.length; j++) {
                    const a = segs[i], b = segs[j];
                    if (a[0] !== b[0] || a[3] === b[3]) continue;
                    if ((a[1] - b[1]) * (a[2] - b[2]) < 0) c += W.CROSS;
                }
            }
            emoPairs.forEach(([a, b]) => { c += W.EMO * Math.abs(xr.get(a) - xr.get(b)) / CELL; });
            hhSets.forEach(set => {
                const span = new Map(); // rank → [lo, hi]
                set.forEach(id => {
                    const r = ranks.get(id), v = xr.get(id);
                    const s = span.get(r);
                    if (!s) span.set(r, [v, v]); else { s[0] = Math.min(s[0], v); s[1] = Math.max(s[1], v); }
                });
                span.forEach((s, r) => {
                    byRank[r].forEach(id => { if (!set.has(id)) { const v = xr.get(id); if (v > s[0] && v < s[1]) c += W.INTRUDER; } });
                });
                const rs = [...span.keys()].sort((a, b) => a - b);
                for (let i = 1; i < rs.length; i++) {
                    const a = span.get(rs[i - 1]), b = span.get(rs[i]);
                    c += W.HH_GAP * Math.max(0, b[0] - a[1], a[0] - b[1]) / CELL;
                }
            });
            let hi = -Infinity;
            xr.forEach(v => { hi = Math.max(hi, v); });
            c += W.WIDTH * hi / CELL;
            return c;
        };

        // 合法性：手足順序須等於 orderSiblings（以候選順序為 want），手足叢集在列中連續
        const rowViolations = (r) => {
            const order = rowUnits[r];
            const uIdx = new Map(order.map((u, i) => [u, i]));
            const want = id => { const u = unitOf.get(id); return uIdx.get(u) * 1000 + u.members.indexOf(id); };
            let v = 0;
            const cparent = new Map(order.map(u => [u, u]));
            const cfind = u => { while (cparent.get(u) !== u) u = cparent.get(u); return u; };
            childrenOfUnion.forEach(list => {
                const inRow = list.filter(id => uIdx.has(unitOf.get(id)));
                if (inRow.length < 2) return;
                const req = orderSiblings(inRow, want);
                const cur = inRow.slice().sort((a, b) => want(a) - want(b));
                if (req.some((id, i) => id !== cur[i])) v++;
                for (let k = 1; k < inRow.length; k++) {
                    const ra = cfind(unitOf.get(inRow[0])), rb = cfind(unitOf.get(inRow[k]));
                    if (ra !== rb) cparent.set(ra, rb);
                }
            });
            // 叢集連續：同一叢集的單位之間不得夾著其他單位
            const first = new Map(), last = new Map(), count = new Map();
            order.forEach((u, i) => {
                const root = cfind(u);
                if (!first.has(root)) first.set(root, i);
                last.set(root, i);
                count.set(root, (count.get(root) || 0) + 1);
            });
            count.forEach((n, root) => { if (last.get(root) - first.get(root) + 1 !== n) v++; });
            return v;
        };

        const snapshot = () => ({ rows: rowUnits.map(r => r.slice()), members: units.map(u => u.members.slice()), bias: new Map(unitBias) });
        const restore = s => {
            s.rows.forEach((r, i) => { rowUnits[i] = r.slice(); });
            units.forEach((u, i) => { u.members = s.members[i].slice(); });
            unitBias.clear();
            s.bias.forEach((v, k) => unitBias.set(k, v));
        };
        // 以目前順序重跑掃描：rank ≤ upTo 的列鎖定順序，其下各列仍依既有重心規則重排（讓下一代跟著調整）
        const runLocked = (upTo = maxRank) => {
            x.clear();
            units.forEach(u => { u.gaps = null; });
            const ord = new Map();
            rowUnits.forEach(row => row.forEach((u, i) => u.members.forEach((m, k) => ord.set(m, i * 1000 + k))));
            childrenOfUnion.forEach(list => list.sort((a, b) => ord.get(a) - ord.get(b)));
            ctx.setLockedUpTo(upTo);
            try { ctx.placeTopRow(); ctx.sweeps(); } finally { ctx.setLockedUpTo(-1); }
        };
        const violationsOk = () => {
            for (let r = 0; r <= maxRank; r++) if (rowViolations(r) > baseViol[r]) return false;
            return true;
        };

        // 原結果（未鎖定掃描）留底：最佳化沒有實質改善時完整還原
        const original = {
            x: new Map(x), gaps: units.map(u => u.gaps), snap: snapshot(),
            kids: [...childrenOfUnion.entries()].map(([k, l]) => [k, l.slice()])
        };
        snapX();
        {
            const offs = centerOffsets();
            let excess = 0;
            offs.forEach(off => { excess += Math.max(0, off - HALF); });
            const cap = new Map();
            const unitsOf = k => new Set(unionParents.get(k).map(p => unitOf.get(p)));
            offs.forEach((off, k) => {
                const mine = unitsOf(k);
                let worst = 0;
                offs.forEach((off2, k2) => { if ([...unitsOf(k2)].some(u => mine.has(u))) worst = Math.max(worst, off2); });
                cap.set(k, Math.max(childrenOfUnion.get(k).length < 2 ? CELL * 2 : HALF, worst));
            });
            centerLimit = { excess, cap };
        }
        const originalCost = cost();

        const baseViol = [];
        for (let r = 0; r <= maxRank; r++) baseViol.push(rowViolations(r));
        runLocked();
        let best = cost();
        let bestSnap = snapshot();
        let bestValid = lastValid ? best : Infinity;
        let bestValidSnap = bestSnap;
        // 評估次數上限隨人數縮小（每次評估 ≈ 一次完整掃描），百人家族約 0.5 秒內
        const MAX_EVALS = Math.max(200, Math.min(1500, Math.round(60000 / comp.length)));
        let evals = 0;
        // 單位的其他合法排法：兩人 = 左右對調；多婚鏈 = 每位配偶可在左或右（_buildChain 依規則修正）
        // 加上整條鏈左右鏡像（manual-first 的方向只是起點，成本相同時才保留）
        const unitVariants = u => {
            const ms = u.members;
            if (ms.length === 2) return [[ms[1], ms[0]]];
            if (ms.length < 3) return [];
            const out = [];
            const key0 = ms.join('|');
            const add = ordered => { const k = ordered.join('|'); if (k !== key0 && !out.some(o => o.join('|') === k)) out.push(ordered); };
            add(ms.slice().reverse());
            const hub = this._chainHub(ms, model);
            const spouses = model.spousesOf.get(hub).filter(s => ms.includes(s));
            if (spouses.length <= 5) {
                for (let mask = 0; mask < (1 << spouses.length); mask++) {
                    const sideOf = s => ((mask >> spouses.indexOf(s)) & 1) ? 'left' : 'right';
                    add(this._buildChain(ms, model, hub, sideOf));
                }
            }
            return out;
        };
        const move = (r, i, j) => { const row = rowUnits[r]; const [u] = row.splice(i, 1); row.splice(j, 0, u); };
        for (let pass = 0; pass < 8 && evals < MAX_EVALS; pass++) {
            let improved = false;
            for (let r = 0; r <= maxRank && evals < MAX_EVALS; r++) {
                restore(bestSnap);
                const n = rowUnits[r].length;
                const maxD = n <= 12 ? n : 4;
                const cands = [];
                const variants = rowUnits[r].map(unitVariants);
                for (let i = 0; i < n; i++) {
                    for (let j = 0; j < n; j++) {
                        if (Math.abs(i - j) > maxD) continue;
                        if (j !== i) cands.push(() => move(r, i, j));
                        variants[i].forEach(vm => cands.push(() => { rowUnits[r][i].members = vm.slice(); if (j !== i) move(r, i, j); }));
                    }
                }
                // 手足叢集整塊搬移：以目前順序中「連續且同叢集」的區段為塊
                {
                    const order = rowUnits[r];
                    const uIdx = new Map(order.map((u, i) => [u, i]));
                    const cparent = new Map(order.map(u => [u, u]));
                    const cfind = u => { while (cparent.get(u) !== u) u = cparent.get(u); return u; };
                    childrenOfUnion.forEach(list => {
                        const us = list.map(id => unitOf.get(id)).filter(u => uIdx.has(u));
                        for (let k = 1; k < us.length; k++) { const a = cfind(us[0]), b = cfind(us[k]); if (a !== b) cparent.set(a, b); }
                    });
                    let s = 0;
                    while (s < n) {
                        let e = s;
                        while (e + 1 < n && cfind(order[e + 1]) === cfind(order[s])) e++;
                        const len = e - s + 1;
                        if (len >= 2) {
                            const bs = s;
                            for (let t = 0; t <= n - len; t++) {
                                if (t === bs || Math.abs(t - bs) > maxD) continue;
                                cands.push(() => { const row = rowUnits[r]; const block = row.splice(bs, len); row.splice(t, 0, ...block); });
                            }
                        }
                        s = e + 1;
                    }
                }
                // [L6] 同住偏移候選：此列單位與下一列同住成員 → 把單位中心拉到同住成員平均 x（或清除偏移）
                if (r < maxRank && hhSets.length) {
                    const rowBelow = new Set(byRank[r + 1]);
                    rowUnits[r].forEach((u, i) => {
                        const mem = new Set(u.members);
                        hhSets.forEach(set => {
                            if (!u.members.some(m => set.has(m))) return;
                            const below = [...set].filter(id => rowBelow.has(id) && !mem.has(id));
                            if (!below.length) return;
                            // 以「同住的那位成員」（anchors）正對下一列同住者（targets）
                            const anchors = u.members.filter(m => set.has(m));
                            const bias = { anchors, targets: below };
                            const cur = unitBias.get(u.id);
                            if (!cur || cur.anchors.join('|') !== anchors.join('|') || cur.targets.join('|') !== below.join('|')) cands.push(() => unitBias.set(u.id, bias));
                            // 同時換配偶側（同住者站另一邊時，整個單位的落點不同）
                            variants[i].forEach(vm => cands.push(() => { u.members = vm.slice(); unitBias.set(u.id, bias); }));
                        });
                        if (unitBias.has(u.id)) cands.push(() => unitBias.delete(u.id));
                    });
                }
                let rowBest = null;
                for (const cand of cands) {
                    if (evals >= MAX_EVALS) break;
                    // 兩種評估：①下層列照舊重排（讓下一代跟著調整）②全部鎖定（只動這一列）；取較好者
                    for (const upTo of (r < maxRank ? [r, maxRank] : [maxRank])) {
                        restore(bestSnap);
                        cand();
                        if (rowViolations(r) > baseViol[r]) break;
                        runLocked(upTo);
                        evals++;
                        if (upTo < maxRank && !violationsOk()) continue;
                        const c = cost();
                        if (c < best - 1e-6 && (!rowBest || c < rowBest.c - 1e-6)) rowBest = { c, snap: snapshot() };
                    }
                }
                if (rowBest) {
                    // 下層列是自由重排得到的；以「全部鎖定」重算一次，確認最終版面同樣更好
                    restore(rowBest.snap);
                    runLocked();
                    evals++;
                    const c = cost();
                    if (c < best - 1e-6) {
                        best = c; bestSnap = snapshot(); improved = true;
                        if (lastValid && c < bestValid - 1e-6) { bestValid = c; bestValidSnap = bestSnap; }
                    }
                }
            }
            if (!improved) break;
        }
        restore(bestValidSnap);
        runLocked();
        if (!(bestValid < originalCost - 1e-6)) {
            restore(original.snap);
            unitBias.clear();
            x.clear();
            original.x.forEach((v, k) => x.set(k, v));
            units.forEach((u, i) => { u.gaps = original.gaps[i]; });
            original.kids.forEach(([k, l]) => { const list = childrenOfUnion.get(k); list.splice(0, list.length, ...l); });
        }
    }

    /**
     * 單位內排序：hub = 婚姻最多者；配偶依婚期由近到遠貼近 hub，左右側沿用目前擺法（見 _buildChain）
     */
    _orderUnit(group, model) {
        const P = id => this.personMap[id];
        if (group.length <= 1) return group.slice();
        if (group.length === 2) return group.slice().sort((a, b) => P(a).x - P(b).x);
        const hub = this._chainHub(group, model);
        return this._buildChain(group, model, hub, s => (P(s).x < P(hub).x ? 'left' : 'right'));
    }

    /** 鏈的本人：同列婚姻最多者；同數取目前最左 */
    _chainHub(group, model) {
        const P = id => this.personMap[id];
        const inGroup = new Set(group);
        const degree = id => model.spousesOf.get(id).filter(s => inGroup.has(s)).length;
        return group.slice().sort((a, b) => degree(b) - degree(a) || P(a).x - P(b).x)[0];
    }

    /**
     * [L5] 多婚鏈排序（_orderUnit 與 _optimizeCohesion 共用）。
     * 規則：
     *   1. hub 的配偶依婚期：最近者最貼近 hub、較早者往外，未填婚期者最外
     *   2. 「鏈配偶」（本身還有別的配偶在同列，如前妻的現任同居人）必須在該側最外端，鏈才能繼續往外延伸：
     *      該側比鏈配偶更早（或未填婚期）的其他配偶改放另一側最外；每側最多一位鏈配偶，多出者放另一側
     *   3. 鏈延伸：鏈配偶的其他伴侶再依同樣規則往外接（最近者貼近、再有鏈者最外）
     * @param {Array} group 同列婚姻連通的人
     * @param {string} hub 本人
     * @param {Function} sideOf (spouseId) => 'left'|'right' 期望側（規則 2 可能修正）
     * @returns {Array} members 左→右
     */
    _buildChain(group, model, hub, sideOf) {
        const inGroup = new Set(group);
        const dateOf = (a, b) => model.marriageDate.get([a, b].sort().join('|')) || '';
        const recentFirst = (of, list) => list.slice().sort((a, b) => {
            const da = dateOf(of, a), db = dateOf(of, b);
            if (da !== db) return da > db ? -1 : 1;
            return group.indexOf(a) - group.indexOf(b);
        });
        const placed = new Set([hub]);
        const furtherSpouses = id => model.spousesOf.get(id).filter(s => inGroup.has(s) && !placed.has(s));
        // 鏈延伸（由內往外）：plain 伴侶先、再有鏈者最外並遞迴
        const extend = (c) => {
            const out = [];
            const next = recentFirst(c, furtherSpouses(c));
            next.forEach(n => placed.add(n));
            const plain = next.filter(n => !furtherSpouses(n).length);
            const chain = next.filter(n => furtherSpouses(n).length);
            plain.forEach(n => out.push(n));
            chain.forEach(n => { out.push(n); out.push(...extend(n)); });
            return out;
        };
        const spouses = recentFirst(hub, model.spousesOf.get(hub).filter(s => inGroup.has(s)));
        spouses.forEach(s => placed.add(s));
        const isChain = s => model.spousesOf.get(s).some(t => inGroup.has(t) && t !== hub);
        const other = side => (side === 'left' ? 'right' : 'left');
        const sides = { left: { inner: [], chain: null }, right: { inner: [], chain: null } };
        const leftovers = [];
        // 先放鏈配偶（每側一位，較近者優先取得期望側）
        spouses.filter(isChain).forEach(s => {
            const want = sideOf(s) === 'left' ? 'left' : 'right';
            if (!sides[want].chain) sides[want].chain = s;
            else if (!sides[other(want)].chain) sides[other(want)].chain = s;
            else leftovers.push(s);
        });
        // 再放一般配偶：只能排在該側鏈配偶的內側（婚期較近者）
        const fits = (side, s) => !sides[side].chain || dateOf(hub, s) > dateOf(hub, sides[side].chain);
        spouses.filter(s => !isChain(s)).forEach(s => {
            const want = sideOf(s) === 'left' ? 'left' : 'right';
            if (fits(want, s)) sides[want].inner.push(s);
            else if (fits(other(want), s)) sides[other(want)].inner.push(s);
            else leftovers.push(s);
        });
        const build = side => {
            const list = sides[side].inner.slice(); // 已是 recentFirst 順序（貼 hub → 往外）
            if (sides[side].chain) { list.push(sides[side].chain); list.push(...extend(sides[side].chain)); }
            return list;
        };
        const left = build('left'), right = build('right');
        // 放不下的（罕見：≥3 位鏈配偶等）接在較短一側的最外
        leftovers.forEach(s => { const side = left.length <= right.length ? left : right; side.push(s); side.push(...extend(s)); });
        const ordered = [...left.slice().reverse(), hub, ...right];
        // 保險：仍未放入者（資料異常）依目前 x 接到最近一端
        const P = id => this.personMap[id];
        group.filter(id => !ordered.includes(id)).sort((a, b) => P(a).x - P(b).x)
            .forEach(id => { if (P(id).x < P(hub).x) ordered.unshift(id); else ordered.push(id); });
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
