/**
 * [HH-5b] 同住框幾何穩健性模糊測試：
 *   隨機版面（成員 2–6 人、非成員 1–4 人、間距 90–220、含同列夾人與斜對角）× 60 組 + 使用者截圖版面 × 3 種間距
 *   每組檢查：頂點皆有限值、多邊形不自交、無零長度邊、成員中心在框內、非成員中心不在框內、
 *   實際繪出的像素外接框不超出取樣點外接框 40px（抓 arcTo 尖刺）
 * 用法：node refactor/run_all.js household_fuzz
 */
const { chromium } = require('playwright');
const path = require('path');

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

    const r = await page.evaluate(() => {
        const app = window.app, c = app.canvas;
        let seed = 20260903;
        const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
        const segInter = (a, b, c2, d) => {
            const cr = (o, p1, p2) => (p1.x - o.x) * (p2.y - o.y) - (p1.y - o.y) * (p2.x - o.x);
            const d1 = cr(c2, d, a), d2 = cr(c2, d, b), d3 = cr(a, b, c2), d4 = cr(a, b, d);
            return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
        };
        const analyze = (hull) => {
            let inter = 0, zero = 0, nonFinite = 0;
            for (let i = 0; i < hull.length; i++) {
                const a = hull[i], b = hull[(i + 1) % hull.length];
                if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) nonFinite++;
                if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) zero++;
                for (let j = i + 2; j < hull.length; j++) {
                    if (i === 0 && j === hull.length - 1) continue;
                    if (segInter(a, b, hull[j], hull[(j + 1) % hull.length])) inter++;
                }
            }
            return { inter, zero, nonFinite, n: hull.length };
        };
        const drawnBBox = (hh) => {
            const off = document.createElement('canvas'); off.width = 3000; off.height = 2200;
            const octx = off.getContext('2d');
            const saved = c.ctx; c.ctx = octx;
            try { octx.translate(500, 500); c.drawHouseholds([hh], app.persons, app.relationships, false, null); }
            finally { c.ctx = saved; }
            const img = octx.getImageData(0, 0, off.width, off.height).data;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (let y = 0; y < off.height; y += 2) {
                for (let x = 0; x < off.width; x += 2) {
                    if (img[(y * off.width + x) * 4 + 3] > 0) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
                }
            }
            return minX === Infinity ? null : { minX: minX - 500, minY: minY - 500, maxX: maxX - 500, maxY: maxY - 500 };
        };
        const runCase = (label, persons, memberIds, rels) => {
            app.persons = persons; app._syncPersonMap(); app.relationships = rels; app.households = [];
            const hh = { id: 'hh', ids: memberIds, notes: '' };
            app.households.push(hh); app.render();
            const b = c.getHouseholdBounds(hh, app.persons, app.relationships);
            if (!b) return { label, fail: 'no bounds' };
            const a = analyze(b.hullPoints);
            const membersInside = memberIds.every(id => { const p = app.personMap.get(id); return GenogramCanvas.pointInPolygon(p.x, p.y, b.hullPoints); });
            const enclosed = persons.filter(p => !memberIds.includes(p.id) && GenogramCanvas.pointInPolygon(p.x, p.y, b.hullPoints)).map(p => p.id);
            const box = drawnBBox(hh);
            const spike = box && (box.minX < b.minX - 40 || box.minY < b.minY - 40 || box.maxX > b.maxX + 40 || box.maxY > b.maxY + 40);
            const problems = [];
            if (a.nonFinite) problems.push('nonFinite');
            if (a.inter) problems.push('selfIntersect=' + a.inter);
            if (a.zero) problems.push('zeroEdge=' + a.zero);
            if (!membersInside) problems.push('memberOutside');
            if (enclosed.length) problems.push('enclosed=' + enclosed.join(','));
            if (spike) problems.push('drawSpike ' + JSON.stringify(box) + ' vs ' + JSON.stringify([b.minX, b.minY, b.maxX, b.maxY].map(Math.round)));
            return { label, problems, n: a.n };
        };
        const cases = [];
        // 使用者截圖版面 × 3 種間距倍率
        for (const k of [1, 1.3, 1.6]) {
            const P = (id, x, y, g, extra = {}) => new Person({ id, x: 200 + (x - 200) * k, y: 200 + (y - 200) * k, gender: g, name: id, ...extra });
            const persons = [P('gf', 508, 196, 'male'), P('gm', 818, 196, 'female', { isDeceased: true }), P('r2', 228, 404, 'female'), P('r1', 430, 404, 'male'),
                P('ct', 663, 404, 'male'), P('ip', 815, 404, 'male', { isIdentifiedPatient: true }), P('law', 330, 610, 'male'), P('ctk', 623, 608, 'female'),
                P('w1', 1285, 404, 'female'), P('w2', 1530, 404, 'female'), P('w3', 1755, 404, 'female')];
            const R = (a, b, t) => new Relationship({ fromPersonId: a, toPersonId: b, type: t });
            const rels = [R('gf', 'gm', 'married'), R('gf', 'r1', 'parent-child'), R('gm', 'r1', 'parent-child'), R('gf', 'ct', 'parent-child'), R('gm', 'ct', 'parent-child'),
                R('gf', 'ip', 'parent-child'), R('gm', 'ip', 'parent-child'), R('r2', 'r1', 'married'), R('r2', 'law', 'parent-child'), R('r1', 'law', 'parent-child'),
                R('ct', 'ctk', 'parent-child'), R('ip', 'w1', 'divorced'), R('ip', 'w2', 'divorced'), R('ip', 'w3', 'divorced')];
            cases.push(runCase('user-layout x' + k, persons, ['r2', 'r1', 'law', 'gf', 'ip'], rels));
        }
        // 隨機版面
        for (let i = 0; i < 60; i++) {
            const spacing = 90 + Math.floor(rnd() * 130);
            const cols = 3 + Math.floor(rnd() * 3), rows = 2 + Math.floor(rnd() * 2);
            const grid = [];
            for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) grid.push({ x: 300 + cc * spacing + (rnd() - 0.5) * 20, y: 300 + rr * spacing * 1.2 + (rnd() - 0.5) * 20 });
            const shuffled = grid.sort(() => rnd() - 0.5);
            const nMembers = 2 + Math.floor(rnd() * 5), nObs = 1 + Math.floor(rnd() * 4);
            const persons = [];
            const memberIds = [];
            shuffled.slice(0, nMembers + nObs).forEach((g, idx) => {
                const id = 'p' + idx;
                persons.push(new Person({ id, x: Math.round(g.x), y: Math.round(g.y), gender: idx % 2 ? 'female' : 'male', name: id }));
                if (idx < nMembers) memberIds.push(id);
            });
            const rels = [];
            for (let k = 1; k < memberIds.length; k++) if (rnd() < 0.5) rels.push(new Relationship({ fromPersonId: memberIds[k - 1], toPersonId: memberIds[k], type: rnd() < 0.5 ? 'married' : 'parent-child' }));
            cases.push(runCase(`random#${i} spacing=${spacing} m=${nMembers} o=${nObs}`, persons, memberIds, rels));
        }
        return cases;
    });
    const bad = r.filter(x => x.fail || (x.problems && x.problems.length));
    check(`版面 ${r.length} 組：無自交、無非有限值、無零長度邊、成員在內、非成員在外、無繪圖尖刺`, bad.length === 0, JSON.stringify(bad.slice(0, 8)));
    // 「非成員在外」是盡力而為：只把它單獨列出當警告，不算硬性失敗（但自交/尖刺/成員在外必須為零）
    const hard = r.filter(x => x.fail || (x.problems && x.problems.some(p => !p.startsWith('enclosed='))));
    check('硬性條件（自交／尖刺／非有限值／零長度／成員在外）零違規', hard.length === 0, JSON.stringify(hard.slice(0, 8)));
    const softOnly = r.filter(x => x.problems && x.problems.length && x.problems.every(p => p.startsWith('enclosed=')));
    console.log(`INFO | 非成員仍被包住的版面：${softOnly.length}/${r.length}` + (softOnly.length ? ' ' + JSON.stringify(softOnly.slice(0, 5)) : ''));

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== household-fuzz ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
