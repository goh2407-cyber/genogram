/**
 * [L4] 自動排列：同住框聚攏、情感線變短（GenogramLayout._optimizeCohesion）
 * 檢查：
 *   - 語意不變式：配偶同列（單婚之間無他人、多婚至少一位配偶相鄰）、父母在子女之上、
 *     手足長幼左→右（年齡已知）、雙胞胎相鄰、同列無重疊（同一格不會有兩人）、確定性
 *   - 指標相對「舊版 layout.js（L4 之前）」不退步、主要指標改善：
 *       同住框同列插入外人數、情感線水平總長、親子線交叉數
 * 用法：NODE_PATH=<playwright node_modules> node refactor/verify_layout_cohesion.js
 *   選項 --baseline=<舊版 layout.js 路徑>：在頁面內注入舊版類別，印出舊版指標（用來重新產生下面的 BASELINE）
 *   選項 --shots=<資料夾>：輸出 after.png（以及有 --baseline 時的 before.png）
 */
const path = require('path');
const fs = require('fs');
const { openApp, createChecks, finish } = require('./contract_harness');

// 舊版 layout.js（L4 之前，2026-10-12 版）以同一套量測得到的數值；用 --baseline 可重新產生。
const BASELINE = {
    fixture24: { hhIntruders: 1, emoLen: 3060, pcCross: 3 },
    userFamily: { hhIntruders: 4, emoLen: 2880, emoEuclid: 3199, pcCross: 0 },
    nuclear: { hhIntruders: 0, emoLen: 0, pcCross: 0 },
    oneHousehold: { hhIntruders: 1, emoLen: 780, pcCross: 0 }
};

const argv = process.argv.slice(2);
const argOf = name => { const a = argv.find(s => s.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : null; };
const baselinePath = argOf('baseline');
const shotsDir = argOf('shots');

const fixture24 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'complex_family_24.json'), 'utf8'));
// 使用者實際檔案的家族（25 人、4 個同住框、12 條情感線、6 人多婚鏈：35–50–38–47–49–45）
const userFamily = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'user_ai_family_2026-10-12.json'), 'utf8'));

const P = (id, gender, age, x, y, extra = {}) => ({ id, name: id, gender, age, x, y, ...extra });
const R = (id, a, b, type, extra = {}) => ({ id, fromPersonId: a, toPersonId: b, type, ...extra });
// 小案例 1：核心家庭（無同住框、無情感線 → 最佳化不啟動，結果應與舊版相同）
const nuclear = {
    version: '1.1',
    persons: [P('dad', 'male', 45, 300, 180), P('mom', 'female', 43, 420, 180),
        P('k1', 'female', 15, 240, 300), P('k2', 'male', 12, 360, 300), P('k3', 'female', 8, 480, 300)],
    relationships: [R('m', 'dad', 'mom', 'married'),
        ...['k1', 'k2', 'k3'].flatMap(k => [R('pd' + k, 'dad', k, 'parent-child'), R('pm' + k, 'mom', k, 'parent-child')])],
    households: [], lifeCircles: []
};
// 小案例 2：三代，奶奶與兒子、女兒兩家同住（年齡未填的叔叔另住）、奶奶與外孫女親密、兒子與女婿衝突
const oneHousehold = {
    version: '1.1',
    persons: [P('gpa', 'male', 78, 600, 180), P('gma', 'female', 75, 300, 180),
        P('son', 'male', 50, 200, 300), P('sw', 'female', 49, 320, 300),
        P('uncle', 'male', null, 440, 300),
        P('dau', 'female', 48, 560, 300), P('dh', 'male', 50, 680, 300),
        P('s1', 'male', 20, 200, 420), P('s2', 'female', 18, 320, 420), P('d1', 'female', 16, 620, 420)],
    relationships: [R('m0', 'gpa', 'gma', 'married'), R('m1', 'son', 'sw', 'married'), R('m2', 'dau', 'dh', 'married'),
        R('p1', 'gpa', 'son', 'parent-child'), R('p2', 'gma', 'son', 'parent-child'),
        R('p3', 'gpa', 'dau', 'parent-child'), R('p4', 'gma', 'dau', 'parent-child'),
        R('p3u', 'gpa', 'uncle', 'parent-child'), R('p4u', 'gma', 'uncle', 'parent-child'),
        R('p5', 'son', 's1', 'parent-child'), R('p6', 'sw', 's1', 'parent-child'),
        R('p7', 'son', 's2', 'parent-child'), R('p8', 'sw', 's2', 'parent-child'),
        R('p9', 'dau', 'd1', 'parent-child'), R('p10', 'dh', 'd1', 'parent-child'),
        R('e1', 'gma', 'd1', 'close'), R('e2', 'son', 'dh', 'conflict')],
    households: [{ id: 'hh1', ids: ['gma', 'son', 'sw', 'dau', 'dh', 'd1'], label: '同住' }], lifeCircles: []
};

(async () => {
    const { browser, page, errors } = await openApp({ width: 1440, height: 900 });
    const { failures, passes, check } = createChecks();
    await page.waitForFunction(() => window.app && window.app.isLoading === false);

    if (baselinePath) {
        // 注入舊版類別（改名，不覆蓋現行 GenogramLayout）
        let src = fs.readFileSync(baselinePath, 'utf8');
        src = src.replace(/window\.GenogramLayout\s*=\s*GenogramLayout;?/, '');
        await page.addScriptTag({ content: `(function(){\n${src}\nwindow.__OriginalLayout = GenogramLayout;\n})();` });
    }

    await page.evaluate(() => {
        const app = window.app;
        const CELL = GenogramApp.GRID.CELL_WIDTH;
        const cat = t => Relationship.getCategory(t);
        window.__applyOriginal = () => {
            const res = new window.__OriginalLayout(app.persons, app.relationships, {
                grid: GenogramApp.GRID, households: app.households, lifeCircles: app.lifeCircles
            }).calculate();
            res.positions.forEach((pos, id) => {
                const p = app.personMap.get(id);
                if (p && !pos.keep) { p.x = app.snapToGrid(pos.x, 'x'); p.y = app.snapToGrid(pos.y, 'y'); }
            });
            app.render();
        };
        window.__measure = () => {
            const byId = id => app.personMap.get(id);
            const K = app.getKinshipEngine();
            const out = { bad: [] };
            const bad = (what, detail) => out.bad.push(what + ' ' + JSON.stringify(detail));
            const marriages = app.relationships.filter(r => cat(r.type) === 'marriage');
            const spousesOf = id => marriages.filter(r => r.fromPersonId === id || r.toPersonId === id).map(r => r.fromPersonId === id ? r.toPersonId : r.fromPersonId);
            marriages.forEach(r => {
                const a = byId(r.fromPersonId), b = byId(r.toPersonId);
                if (a.y !== b.y) bad('spouse-row', [a.id, b.id]);
                // 夫妻之間不得有外人；多婚時只允許兩人各自的其他配偶（多婚鏈）夾在中間
                {
                    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
                    const allowed = new Set([...spousesOf(a.id), ...spousesOf(b.id)]);
                    if (app.persons.some(q => q.y === a.y && q.x > lo + 1 && q.x < hi - 1 && !allowed.has(q.id))) bad('spouse-between', [a.id, b.id]);
                }
            });
            [...new Set(marriages.flatMap(r => [r.fromPersonId, r.toPersonId]))].filter(id => spousesOf(id).length > 1).forEach(h => {
                const p = byId(h);
                if (!spousesOf(h).some(s => byId(s).y === p.y && Math.abs(Math.abs(byId(s).x - p.x) - CELL) <= 1)) bad('hub-no-adjacent-spouse', h);
            });
            // 父母在上、手足長幼、雙胞胎相鄰
            const unions = new Map();
            app.persons.forEach(c => {
                const ps = K.getParentIds(c.id).map(byId).filter(Boolean);
                ps.forEach(p => { if (!(c.y > p.y)) bad('parent-not-above', [p.id, c.id]); });
                if (!ps.length) return;
                const key = ps.map(p => p.id).sort().join('|');
                if (!unions.has(key)) unions.set(key, []);
                unions.get(key).push(c);
            });
            const ageOf = p => { const a = p.getDisplayAge ? p.getDisplayAge() : p.age; return (a === null || a === undefined || a === '' || !Number.isFinite(Number(a))) ? null : Number(a); };
            unions.forEach(kids => {
                // [L3] 多婚鏈端點（同列以婚姻相連 ≥3 人的一端）依設計排到手足塊外側，不受長幼約束
                const chainSize = id => {
                    const seen = new Set([id]); const q = [id];
                    while (q.length) { const c = q.shift(); spousesOf(c).forEach(s => { if (!seen.has(s) && byId(s).y === byId(id).y) { seen.add(s); q.push(s); } }); }
                    return seen.size;
                };
                const isChainEnd = k => chainSize(k.id) >= 3 && spousesOf(k.id).length === 1;
                const known = kids.filter(k => ageOf(k) !== null && !isChainEnd(k)).sort((a, b) => a.x - b.x);
                for (let i = 1; i < known.length; i++) if (ageOf(known[i]) > ageOf(known[i - 1])) bad('sibling-order', [known[i - 1].id, known[i].id]);
                const groups = new Map();
                kids.filter(k => k.twinGroup).forEach(k => { if (!groups.has(k.twinGroup)) groups.set(k.twinGroup, []); groups.get(k.twinGroup).push(k); });
                // 雙胞胎相鄰：兩人之間只允許同一婚姻鏈的成員（配偶、多婚鏈），不得有外人
                groups.forEach(tw => {
                    const lo = Math.min(...tw.map(t => t.x)), hi = Math.max(...tw.map(t => t.x));
                    const chain = new Set(tw.map(t => t.id));
                    for (let grow = true; grow;) { grow = false; [...chain].forEach(id => spousesOf(id).forEach(s => { if (!chain.has(s) && byId(s).y === tw[0].y) { chain.add(s); grow = true; } })); }
                    if (app.persons.some(q => !chain.has(q.id) && q.y === tw[0].y && q.x > lo && q.x < hi)) bad('twins-split', tw.map(t => t.id));
                });
            });
            // 同列無重疊
            const rows = {};
            app.persons.forEach(p => (rows[p.y] = rows[p.y] || []).push(p));
            Object.values(rows).forEach(list => {
                list.sort((a, b) => a.x - b.x);
                for (let i = 1; i < list.length; i++) if (list[i].x - list[i - 1].x < CELL - 1) bad('overlap', [list[i - 1].id, list[i].id]);
            });
            // 指標
            let emoLen = 0, emoEuclid = 0;
            app.relationships.filter(r => cat(r.type) === 'emotional').forEach(r => {
                const a = byId(r.fromPersonId), b = byId(r.toPersonId);
                if (a && b) { emoLen += Math.abs(a.x - b.x); emoEuclid += Math.hypot(a.x - b.x, a.y - b.y); }
            });
            let hhIntruders = 0;
            app.households.forEach(h => {
                const mem = new Set(h.ids);
                const span = {};
                h.ids.map(byId).filter(Boolean).forEach(p => { const s = span[p.y]; span[p.y] = s ? [Math.min(s[0], p.x), Math.max(s[1], p.x)] : [p.x, p.x]; });
                Object.entries(span).forEach(([y, [lo, hi]]) => {
                    hhIntruders += app.persons.filter(q => !mem.has(q.id) && q.y === Number(y) && q.x > lo && q.x < hi).length;
                });
            });
            // 親子線交叉：父母中點 → 子女，同一對列之間、不同父母組合的線段兩兩比較
            const segs = [];
            unions.forEach((kids, key) => {
                const ps = key.split('|').map(byId);
                const mid = ps.reduce((s, p) => s + p.x, 0) / ps.length;
                kids.forEach(k => segs.push({ y0: ps[0].y, y1: k.y, x0: mid, x1: k.x, key }));
            });
            let pcCross = 0;
            for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
                const a = segs[i], b = segs[j];
                if (a.key === b.key || a.y0 !== b.y0 || a.y1 !== b.y1) continue;
                if ((a.x0 - b.x0) * (a.x1 - b.x1) < 0) pcCross++;
            }
            out.metrics = { hhIntruders, emoLen, emoEuclid: Math.round(emoEuclid), pcCross };
            out.adjacent = (a, b) => byId(a).y === byId(b).y && Math.abs(Math.abs(byId(a).x - byId(b).x) - CELL) <= 1;
            out.pos = Object.fromEntries(app.persons.map(p => [p.id, { x: p.x, y: p.y }]));
            out.snapshot = JSON.stringify(app.persons.map(p => [p.id, p.x, p.y]));
            return out;
        };
        window.__run = (data, useOriginal = false) => {
            app.loadData(JSON.parse(JSON.stringify(data)));
            if (useOriginal) window.__applyOriginal(); else app.autoLayoutByGeneration(false);
            return window.__measure();
        };
    });

    const shot = async (file) => {
        if (!shotsDir) return;
        fs.mkdirSync(shotsDir, { recursive: true });
        await page.evaluate(() => window.app.fitToView());
        await page.waitForTimeout(250);
        const box = await page.locator('#canvasContainer').boundingBox();
        await page.screenshot({ path: path.join(shotsDir, file), clip: box });
    };

    const shotPrefix = { fixture24: '', userFamily: 'user_' };
    const cases = [['fixture24', fixture24], ['userFamily', userFamily], ['nuclear', nuclear], ['oneHousehold', oneHousehold]];
    for (const [name, data] of cases) {
        if (baselinePath) {
            const orig = await page.evaluate(d => window.__run(d, true), data);
            console.log(`BASELINE ${name}: ${JSON.stringify(orig.metrics)}${orig.bad.length ? '  invariant issues in old layout: ' + orig.bad.join('; ') : ''}`);
            if (name in shotPrefix) await shot(shotPrefix[name] + 'before.png');
        }
        const m = await page.evaluate(d => window.__run(d), data);
        if (name in shotPrefix) await shot(shotPrefix[name] + 'after.png');
        const again = await page.evaluate(d => window.__run(d), data);
        const base = BASELINE[name];
        console.log(`${name}: ${JSON.stringify(m.metrics)}  (baseline ${JSON.stringify(base)})`);
        check(`${name} 語意不變式（配偶同列相鄰、父母在上、手足長幼、雙胞胎相鄰、無重疊）`, m.bad.length === 0, m.bad.slice(0, 5).join('; '));
        check(`${name} 確定性：重跑結果相同`, m.snapshot === again.snapshot);
        check(`${name} 同住框插入外人數不增加（${base.hhIntruders} → ${m.metrics.hhIntruders}）`, m.metrics.hhIntruders <= base.hhIntruders);
        // userFamily：奶奶家對正（80 正對 50b）會把 80→50 控制線與 52→X 斷絕線各拉長約一格，允許 +10%
        const emoAllow = name === 'userFamily' ? 1.1 : 1;
        check(`${name} 情感線總長不增加（${base.emoLen} → ${m.metrics.emoLen}${emoAllow > 1 ? '，允許 +10%' : ''}）`, m.metrics.emoLen <= base.emoLen * emoAllow);
        const crossAllow = name === 'userFamily' ? 1 : 0; // 見下方 userFamily 註解
        check(`${name} 親子線交叉不增加（${base.pcCross} → ${m.metrics.pcCross}${crossAllow ? '，允許 +' + crossAllow : ''}）`, m.metrics.pcCross <= base.pcCross + crossAllow);
        if (name === 'fixture24') {
            check('fixture24 同住框插入外人數歸零', m.metrics.hhIntruders === 0, JSON.stringify(m.metrics));
            check('fixture24 情感線總長至少縮短 40%', m.metrics.emoLen <= base.emoLen * 0.6, JSON.stringify(m.metrics));
        }
        if (name === 'userFamily') {
            // 多婚鏈 35–50–38–47–49–45 應整條鏡像成 45–49–47–38–50–35，媽媽家（47,49 / 18,7,15）與
            // 爸爸家（50,38 / 12,12）才會各自連成一片。代價：P13(47) 夾在手足 P8(52) 與 P10(50) 之間、
            // 而 P13 的父母在 P10 父母右側 → 一條親子線交叉無法避免（基準 0 → 允許 1）。
            const id = n => Object.keys(m.pos).find(k => k.includes('_' + n + '_'));
            const adj = await page.evaluate(([a, b]) => window.__measure().adjacent(a, b), [id(13), id(17)]);
            const adj2 = await page.evaluate(([a, b]) => window.__measure().adjacent(a, b), [id(10), id(15)]);
            check('userFamily 同住框插入外人數歸零', m.metrics.hhIntruders === 0, JSON.stringify(m.metrics));
            check('userFamily 47 與 49 相鄰、50 與 38 相鄰（各一格）', adj && adj2, JSON.stringify({ adj47_49: adj, adj50_38: adj2 }));
            check('userFamily 情感線直線總長不超過基準 +10%', m.metrics.emoEuclid <= base.emoEuclid * 1.1, JSON.stringify(m.metrics));
            // [L6] 奶奶家 = {80, 50b}：80 要在 50b 正上方（一格內），同住框才不會變成斜長帶
            const dx80 = Math.abs(m.pos[id(1)].x - m.pos[id(11)].x);
            check('userFamily 80（奶奶）與同住的 50b 水平相差 ≤ 1 格', dx80 <= 120 + 1, JSON.stringify({ dx: dx80 }));
        }
        if (name === 'oneHousehold') {
            check('oneHousehold 同住框插入外人數歸零', m.metrics.hhIntruders === 0, JSON.stringify(m.metrics));
            check('oneHousehold 情感線總長縮短', m.metrics.emoLen < base.emoLen, JSON.stringify(m.metrics));
        }
    }
    // 2026-10-12：訂婚並分居／訂婚並同居也算伴侶（同列、相鄰），子女在下一列
    const engaged = await page.evaluate(() => {
        const app = window.app;
        const out = {};
        for (const type of ['engaged-separated', 'engaged-cohabiting']) {
            app.loadData({ version: '1.1',
                persons: [
                    { id: 'a', name: 'A', gender: 'male', x: 200, y: 300 },
                    { id: 'b', name: 'B', gender: 'female', x: 700, y: 180 },
                    { id: 'k', name: 'K', gender: 'female', x: 400, y: 420 }
                ],
                relationships: [
                    { id: 'e', fromPersonId: 'a', toPersonId: 'b', type },
                    { id: 'p1', fromPersonId: 'a', toPersonId: 'k', type: 'parent-child' },
                    { id: 'p2', fromPersonId: 'b', toPersonId: 'k', type: 'parent-child' }
                ] });
            app.autoLayoutByGeneration(false);
            const [a, b, k] = ['a', 'b', 'k'].map(id => app.personMap.get(id));
            out[type] = a.y === b.y && Math.abs(a.x - b.x) <= 120 && k.y === a.y + 120;
        }
        return out;
    });
    check('訂婚並分居：伴侶同列相鄰、子女在下一列', engaged['engaged-separated'] === true);
    check('訂婚並同居：伴侶同列相鄰、子女在下一列', engaged['engaged-cohabiting'] === true);
    check('無 console error', errors.length === 0, errors.slice(0, 3).join(' | '));
    await finish(browser, passes, failures, `\n===== layout-cohesion ===== ${passes.length}/${passes.length + failures.length} pass`);
})().catch(e => { console.error(e); process.exit(1); });
