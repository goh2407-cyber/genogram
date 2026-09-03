/**
 * [L-1] 自動排列（家系圖分層佈局）
 * 檢查：配偶同列且相鄰、子女列 = 父母列 + 1、子女塊置中於父母中點、同列不重疊（≥ CELL）、
 *       手足長幼左→右、多婚配偶貼近本人、獨立人物不動、保留使用者左右順序、確定性、
 *       預覽／套用／取消／Undo 流程。
 * 用法：node refactor/run_all.js auto_layout
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const results = [];
const check = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas && window.app.isLoading === false);

    // 在頁面內定義量測工具與資料集（用 app API 建立，避免載入正規化改變語意）
    await page.evaluate(() => {
        const app = window.app;
        window.__mk = (id, x, y, gender, name, extra = {}) => new Person({ id, x, y, gender, name, ...extra });
        window.__rel = (id, a, b, type, extra = {}) => new Relationship({ id, fromPersonId: a, toPersonId: b, type, ...extra });
        window.__load = (persons, rels, households = []) => {
            app.persons = persons; app._syncPersonMap(); app.relationships = rels; app.households = households; app.lifeCircles = [];
            app.history.undoStack = []; app.history.redoStack = []; app.render();
        };
        window.__measure = () => {
            const K = app.getKinshipEngine();
            const byId = id => app.personMap.get(id);
            const CELL = GenogramApp.GRID.CELL_WIDTH;
            const out = { spouseBad: [], childRowBad: [], childRowLoose: [], childCenterOff: [], overlaps: [], siblingOrderBad: [] };
            const marriages = app.relationships.filter(r => Relationship.getCategory(r.type) === 'marriage');
            const spousesOf = id => marriages.filter(r => r.fromPersonId === id || r.toPersonId === id).map(r => r.fromPersonId === id ? r.toPersonId : r.fromPersonId);
            marriages.forEach(r => {
                const a = byId(r.fromPersonId), b = byId(r.toPersonId);
                if (a.y !== b.y) out.spouseBad.push({ pair: a.name + '-' + b.name, why: 'row', dy: b.y - a.y });
                // 相鄰：對單婚 |dx| == CELL；多婚（hub）至少有一位配偶相鄰、其餘在同列且同側排開
                const hubA = spousesOf(a.id).length > 1, hubB = spousesOf(b.id).length > 1;
                if (!hubA && !hubB && Math.abs(Math.abs(b.x - a.x) - CELL) > 1) out.spouseBad.push({ pair: a.name + '-' + b.name, why: 'gap', dx: b.x - a.x });
            });
            // 多婚：每位 hub 至少一位配偶相鄰
            const hubs = [...new Set(marriages.flatMap(r => [r.fromPersonId, r.toPersonId]))].filter(id => spousesOf(id).length > 1);
            hubs.forEach(h => { const p = byId(h); if (!spousesOf(h).some(s => Math.abs(Math.abs(byId(s).x - p.x) - CELL) <= 1 && byId(s).y === p.y)) out.spouseBad.push({ hub: p.name, why: 'no adjacent spouse' }); });
            // 子女：列 = 父母列 + 1；同父母子女塊中心 vs 父母中點
            const unions = new Map();
            app.persons.forEach(p => {
                const ps = K.getParentIds(p.id).map(byId).filter(Boolean);
                if (!ps.length) return;
                ps.forEach(q => { const rows = (p.y - q.y) / GenogramApp.GRID.CELL_HEIGHT; if (rows !== 1) out.childRowBad.push({ child: p.name, parent: q.name, dy: p.y - q.y }); if (!(Number.isInteger(rows) && rows >= 1 && rows <= 2)) out.childRowLoose.push({ child: p.name, parent: q.name, dy: p.y - q.y }); });
                const key = ps.map(q => q.id).sort().join('|');
                if (!unions.has(key)) unions.set(key, { parents: ps, kids: [] });
                unions.get(key).kids.push(p);
            });
            unions.forEach(u => {
                const mid = u.parents.reduce((s, q) => s + q.x, 0) / u.parents.length;
                const xs = u.kids.map(k => k.x);
                const kc = (Math.min(...xs) + Math.max(...xs)) / 2; // 手足橫線中點
                out.childCenterOff.push({ union: u.parents.map(q => q.name).join('+'), off: Math.round(kc - mid), n: u.kids.length });
                // 長幼左→右（年齡皆已知者）
                const known = u.kids.filter(k => Number.isFinite(Number(k.age))).sort((a, b) => a.x - b.x);
                for (let i = 1; i < known.length; i++) if (Number(known[i].age) > Number(known[i - 1].age)) out.siblingOrderBad.push({ union: u.parents.map(q => q.name).join('+'), left: known[i - 1].name, right: known[i].name });
            });
            // 同列重疊
            const rows = {}; app.persons.forEach(p => { (rows[p.y] = rows[p.y] || []).push(p); });
            Object.values(rows).forEach(list => { list.sort((a, b) => a.x - b.x); for (let i = 1; i < list.length; i++) if (list[i].x - list[i - 1].x < CELL - 1) out.overlaps.push({ a: list[i - 1].name, b: list[i].name, gap: list[i].x - list[i - 1].x }); });
            out.snapshot = app.persons.map(p => [p.id, p.x, p.y]);
            return out;
        };
    });

    // ---- 資料集 A：案主為中心三代、雙邊祖父母、父的前妻與同父異母兄、手足三人（亂放）----
    const A = await page.evaluate(() => {
        const mk = window.__mk, rel = window.__rel;
        const persons = [
            mk('ggf', 900, 100, 'male', '外公', { age: 78 }), mk('ggm', 300, 100, 'female', '外婆', { age: 75 }),
            mk('pgf', 100, 100, 'male', '爺爺', { age: 80 }), mk('pgm', 1300, 100, 'female', '奶奶', { age: 79, isDeceased: true }),
            mk('dad', 200, 300, 'male', '父', { age: 50 }), mk('mom', 700, 300, 'female', '母', { age: 48 }),
            mk('ex', 1100, 300, 'female', '前妻', { age: 49 }), mk('half', 1200, 500, 'male', '同父異母兄', { age: 22 }),
            mk('k1', 500, 500, 'female', '案主', { age: 15, isIdentifiedPatient: true }), mk('k2', 450, 500, 'male', '弟', { age: 12 }), mk('k3', 1000, 500, 'female', '妹', { age: 9 }),
            mk('aunt', 150, 300, 'female', '阿姨', { age: 45 }), mk('stranger', 1500, 700, 'male', '無關人士')];
        const rels = [rel('m0', 'ggf', 'ggm', 'married'), rel('p1', 'ggf', 'mom', 'parent-child'), rel('p2', 'ggm', 'mom', 'parent-child'), rel('p3', 'ggf', 'aunt', 'parent-child'), rel('p4', 'ggm', 'aunt', 'parent-child'),
            rel('m9', 'pgf', 'pgm', 'married'), rel('p13', 'pgf', 'dad', 'parent-child'), rel('p14', 'pgm', 'dad', 'parent-child'),
            rel('m1', 'dad', 'mom', 'married', { date: '2009' }), rel('m2', 'dad', 'ex', 'divorced', { date: '2000-2006' }), rel('p5', 'dad', 'half', 'parent-child'), rel('p6', 'ex', 'half', 'parent-child'),
            rel('p7', 'dad', 'k1', 'parent-child'), rel('p8', 'mom', 'k1', 'parent-child'), rel('p9', 'dad', 'k2', 'parent-child'), rel('p10', 'mom', 'k2', 'parent-child'), rel('p11', 'dad', 'k3', 'parent-child'), rel('p12', 'mom', 'k3', 'parent-child'),
            rel('e1', 'k1', 'aunt', 'close')];
        window.__load(persons, rels, [{ id: 'hh', ids: ['dad', 'mom', 'k1', 'k2', 'k3'], notes: '' }]);
        const before = { stranger: { x: 1500, y: 700 } };
        window.app.previewAutoLayout();
        const m = window.__measure();
        const byId = id => window.app.personMap.get(id);
        m.stranger = { x: byId('stranger').x, y: byId('stranger').y, before: before.stranger };
        m.exSide = Math.sign(byId('ex').x - byId('dad').x); m.momSide = Math.sign(byId('mom').x - byId('dad').x);
        m.exAdj = Math.abs(Math.abs(byId('ex').x - byId('dad').x) - GenogramApp.GRID.CELL_WIDTH) <= 1;
        m.momAdj = Math.abs(Math.abs(byId('mom').x - byId('dad').x) - GenogramApp.GRID.CELL_WIDTH) <= 1;
        // 第二次計算相同（確定性）
        const snap1 = JSON.stringify(m.snapshot);
        window.app.cancelPreviewedLayout(); window.app.previewAutoLayout();
        m.deterministic = JSON.stringify(window.__measure().snapshot) === snap1;
        window.app.cancelPreviewedLayout();
        return m;
    });
    check('A 配偶皆同列且相鄰（單婚）；多婚者至少一位配偶相鄰', A.spouseBad.length === 0, JSON.stringify(A.spouseBad));
    check('A 所有子女都在父母下一列（一格 CELL_HEIGHT）', A.childRowBad.length === 0, JSON.stringify(A.childRowBad));
    check('A 每組子女塊中心與父母中點偏差 ≤ 半格（60）；單一子女且與他 union 子女塊衝突時 ≤ 2 格', A.childCenterOff.every(c => Math.abs(c.off) <= (c.n >= 2 ? 60 : 240)), JSON.stringify(A.childCenterOff));
    check('A 同列無重疊（間距 ≥ CELL）', A.overlaps.length === 0, JSON.stringify(A.overlaps));
    check('A 手足長幼左→右（案主15、弟12、妹9）', A.siblingOrderBad.length === 0, JSON.stringify(A.siblingOrderBad));
    check('A 現任（較近婚期）與父相鄰；前妻在另一側相鄰、或在現任外側', A.momAdj && A.exSide !== 0 && (A.exAdj || A.exSide === A.momSide), JSON.stringify({ exSide: A.exSide, momSide: A.momSide, exAdj: A.exAdj, momAdj: A.momAdj }));
    check('A 無關的獨立人物完全不動', A.stranger.x === 1500 && A.stranger.y === 700, JSON.stringify(A.stranger));
    check('A 確定性：兩次結果相同', A.deterministic);

    // ---- 資料集 B：使用者截圖版面（多婚三前妻）----
    const B = await page.evaluate(() => {
        const mk = window.__mk, rel = window.__rel;
        const persons = [mk('gf', 555, 200, 'male', '失智症'), mk('gm', 830, 200, 'female', '祖母', { isDeceased: true }),
            mk('r2', 310, 380, 'female', '相對人2', { age: 65 }), mk('r1', 490, 380, 'male', '相對人1', { age: 64 }), mk('ct', 660, 380, 'male', '居草屯'), mk('ip', 830, 380, 'male', '案主', { age: 61, isIdentifiedPatient: true }),
            mk('law', 400, 565, 'male', '律師', { age: 37 }), mk('ctk', 660, 565, 'female', '居草屯女'),
            mk('w1', 1285, 380, 'female', '中配1'), mk('w2', 1530, 380, 'female', '中配2'), mk('w3', 1755, 380, 'female', '中配3')];
        const rels = [rel('m1', 'gf', 'gm', 'married'), rel('pc1', 'gf', 'r1', 'parent-child'), rel('pc2', 'gm', 'r1', 'parent-child'), rel('pc3', 'gf', 'ct', 'parent-child'), rel('pc4', 'gm', 'ct', 'parent-child'),
            rel('pc5', 'gf', 'ip', 'parent-child'), rel('pc6', 'gm', 'ip', 'parent-child'), rel('m2', 'r2', 'r1', 'married'), rel('pc7', 'r2', 'law', 'parent-child'), rel('pc8', 'r1', 'law', 'parent-child'),
            rel('pc9', 'ct', 'ctk', 'parent-child'), rel('d1', 'ip', 'w1', 'divorced', { date: '2000' }), rel('d2', 'ip', 'w2', 'divorced', { date: '2008' }), rel('d3', 'ip', 'w3', 'divorced', { date: '2015' })];
        window.__load(persons, rels, [{ id: 'hh', ids: ['r2', 'r1', 'law', 'gf', 'ip'], notes: '' }]);
        window.app.previewAutoLayout();
        const m = window.__measure();
        const byId = id => window.app.personMap.get(id);
        m.wivesRow = ['w1', 'w2', 'w3'].every(id => byId(id).y === byId('ip').y);
        m.wivesOrder = ['w1', 'w2', 'w3'].map(id => byId(id).x - byId('ip').x); // 皆在右側、最近婚期(w3)最靠近
        m.siblingsRow = ['r1', 'ct', 'ip'].every(id => byId(id).y === byId('gf').y + GenogramApp.GRID.CELL_HEIGHT);
        window.app.cancelPreviewedLayout();
        return m;
    });
    check('B 三位前妻與案主同列', B.wivesRow, JSON.stringify(B.wivesOrder));
    check('B 前妻皆在案主同側、最近婚期（2015）最靠近、依序往外', B.wivesOrder.every(d => d > 0) && B.wivesOrder[2] < B.wivesOrder[1] && B.wivesOrder[1] < B.wivesOrder[0], JSON.stringify(B.wivesOrder));
    check('B 子女列正確、無重疊、配偶相鄰', B.childRowBad.length === 0 && B.overlaps.length === 0 && B.spouseBad.length === 0, JSON.stringify({ c: B.childRowBad, o: B.overlaps, s: B.spouseBad }));
    check('B 每組子女置中（偏差 ≤ 60）', B.childCenterOff.every(c => Math.abs(c.off) <= 60), JSON.stringify(B.childCenterOff));

    // ---- 資料集 C：26 人範例檔（loadData）----
    const sample = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'genogram_2026-01-21.json'), 'utf8'));
    const C = await page.evaluate((d) => {
        window.app.loadData(d);
        window.app.previewAutoLayout();
        const m = window.__measure();
        window.app.cancelPreviewedLayout();
        return m;
    }, sample);
    check('C 26 人範例：配偶同列相鄰、子女列正確、無重疊', C.spouseBad.length === 0 && C.childRowLoose.length === 0 && C.overlaps.length === 0, JSON.stringify({ s: C.spouseBad.slice(0, 3), c: C.childRowLoose.slice(0, 3), o: C.overlaps.slice(0, 3) }));
    check('C 26 人範例：子女塊中心偏差全部 ≤ 1 格（120）', C.childCenterOff.every(c => Math.abs(c.off) <= 120), JSON.stringify(C.childCenterOff.filter(c => Math.abs(c.off) > 120)));

    // ---- 預覽／套用／取消／Undo ----
    const flow = await page.evaluate(() => {
        const app = window.app;
        const before = app.persons.map(p => [p.id, p.x, p.y]);
        const histBefore = app.history.undoStack.length; // loadData 已寫過一筆
        app.previewAutoLayout();
        const previewBarVisible = app.elements.layoutPreviewBar.style.display !== 'none';
        const histDuringPreview = app.history.undoStack.length - histBefore;
        app.cancelPreviewedLayout();
        const afterCancel = JSON.stringify(app.persons.map(p => [p.id, p.x, p.y])) === JSON.stringify(before);
        app.previewAutoLayout();
        app.applyPreviewedLayout();
        const histAfterApply = app.history.undoStack.length - histBefore;
        const changed = JSON.stringify(app.persons.map(p => [p.id, p.x, p.y])) !== JSON.stringify(before);
        app.undo();
        const afterUndo = JSON.stringify(app.persons.map(p => [p.id, p.x, p.y])) === JSON.stringify(before);
        return { previewBarVisible, histDuringPreview, afterCancel, histAfterApply, changed, afterUndo };
    });
    check('流程：預覽不寫 history、取消完全還原、套用寫一筆、Undo 回到排列前', flow.previewBarVisible && flow.histDuringPreview === 0 && flow.afterCancel && flow.histAfterApply === 1 && flow.changed && flow.afterUndo, JSON.stringify(flow));

    // 截圖供肉眼確認（資料集 A 套用後）
    await page.evaluate(() => { window.app.previewAutoLayout(); window.app.fitToView(); });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(__dirname, 'auto_layout_demo.png') });
    await page.evaluate(() => window.app.cancelPreviewedLayout());

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== auto-layout ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
