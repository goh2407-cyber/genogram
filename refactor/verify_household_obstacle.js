/**
 * [HH-5] 同住框自動繞開非成員（障礙物）
 *   情境 A：使用者截圖（相對人2、相對人1、律師、失智症、案主 61 同住；居草屯夾在中間不在框內）
 *   情境 B：同列 A — X — B，X 非成員：走廊繞道、不用膠囊、X 不在框內
 *   情境 C：無障礙物時與原本一樣可用膠囊（單列）
 * 用法：node refactor/run_all.js household_obstacle
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
        const inside = (x, y, poly) => GenogramCanvas.pointInPolygon(x, y, poly);
        const mk = (id, x, y, g, name, extra = {}) => new Person({ id, x, y, gender: g, name, ...extra });

        // ---- 情境 A（依截圖座標，約略等比）----
        app.persons.push(
            mk('gf', 555, 200, 'male', '失智症'), mk('gm', 830, 200, 'female', '', { isDeceased: true }),
            mk('r2', 310, 380, 'female', '相對人2', { age: 65 }), mk('r1', 490, 380, 'male', '相對人1', { age: 64 }),
            mk('ct', 660, 380, 'male', '居草屯'), mk('ip', 830, 380, 'male', '', { age: 61, isIdentifiedPatient: true }),
            mk('law', 400, 565, 'male', '律師', { age: 37 }), mk('ctk', 660, 565, 'female', ''),
            mk('w1', 1285, 380, 'female', '中配'), mk('w2', 1530, 380, 'female', '中配'), mk('w3', 1755, 380, 'female', '中配'));
        app._syncPersonMap();
        const R = (a, b, t) => app.relationships.push(new Relationship({ fromPersonId: a, toPersonId: b, type: t }));
        R('gf', 'gm', 'married'); R('gf', 'r1', 'parent-child'); R('gm', 'r1', 'parent-child'); R('gf', 'ct', 'parent-child'); R('gm', 'ct', 'parent-child');
        R('gf', 'ip', 'parent-child'); R('gm', 'ip', 'parent-child'); R('r2', 'r1', 'married'); R('r2', 'law', 'parent-child'); R('r1', 'law', 'parent-child');
        R('ct', 'ctk', 'parent-child'); R('ip', 'w1', 'divorced'); R('ip', 'w2', 'divorced'); R('ip', 'w3', 'divorced');
        const hhA = { id: 'hhA', ids: ['r2', 'r1', 'law', 'gf', 'ip'], notes: '' };
        app.households.push(hhA);
        app.render();
        const bA = c.getHouseholdBounds(hhA, app.persons, app.relationships);
        const A = {
            membersInside: hhA.ids.every(id => { const p = app.personMap.get(id); return inside(p.x, p.y, bA.hullPoints); }),
            ctInside: inside(660, 380, bA.hullPoints),
            ctkInside: inside(660, 565, bA.hullPoints),
            gmInside: inside(830, 200, bA.hullPoints),
            enclosed: bA.enclosedObstacles,
            hullN: bA.hullPoints.length,
            // 命中：居草屯符號中心不應命中同住框邊界（它在框外且不是邊界）
            hitAtCt: c.isPointOnHouseholdBoundary(660, 380, hhA, app.persons, app.relationships),
            // 匯出不報錯
            exportOk: c.exportToPNG(app.persons, app.relationships, app.households, app.lifeCircles, true, false, 1, app.viewOptions).startsWith('data:image/png')
        };
        // 確定性：同輸入連算三次相同
        const again = [1, 2, 3].map(() => JSON.stringify(c.getHouseholdBounds(hhA, app.persons, app.relationships).hullPoints));
        A.deterministic = again.every(s => s === again[0]);

        // ---- 情境 B：同列 A — X — B ----
        app.households.length = 0;
        app.persons.push(mk('ba', 300, 800, 'male', 'A'), mk('bx', 420, 800, 'female', 'X'), mk('bb', 540, 800, 'male', 'B'));
        app._syncPersonMap();
        const hhB = { id: 'hhB', ids: ['ba', 'bb'], notes: '' };
        app.households.push(hhB);
        app.render(); // canvas.personMap 由 render 注入
        const bB = c.getHouseholdBounds(hhB, app.persons, app.relationships);
        const B = {
            aInside: inside(300, 800, bB.hullPoints), bInside: inside(540, 800, bB.hullPoints), xInside: inside(420, 800, bB.hullPoints),
            dogBoneAllowed: bB.dogBoneAllowed, enclosed: bB.enclosedObstacles,
            // 走廊繞道方向：取樣點應有一側越過 X 的符號範圍（y 偏離 800 超過 clearance 的一半）
            detour: bB.points.some(p => p.x > 380 && p.x < 460 && Math.abs(p.y - 800) > 40)
        };

        // ---- 情境 C：無障礙物的單列兩人 → 膠囊仍允許 ----
        app.households.length = 0;
        const hhC = { id: 'hhC', ids: ['w1', 'w2'], notes: '' };
        app.households.push(hhC);
        app.render();
        const bC = c.getHouseholdBounds(hhC, app.persons, app.relationships);
        const C = { dogBoneAllowed: bC.dogBoneAllowed, enclosed: bC.enclosedObstacles, w3Inside: inside(1755, 380, bC.hullPoints) };
        return { A, B, C };
    });
    check('A 成員全在框內', r.A.membersInside, JSON.stringify(r.A));
    check('A 居草屯（夾在中間的非成員）與其女兒、已故母親都不在框內', !r.A.ctInside && !r.A.ctkInside && !r.A.gmInside && r.A.enclosed.length === 0, JSON.stringify(r.A));
    check('A 居草屯中心不命中同住框邊界', r.A.hitAtCt === false, String(r.A.hitAtCt));
    check('A 幾何確定性 + 匯出正常', r.A.deterministic && r.A.exportOk, JSON.stringify({ d: r.A.deterministic, e: r.A.exportOk }));
    check('B 同列夾人：A、B 在框內、X 不在、不用膠囊、走廊有繞道', r.B.aInside && r.B.bInside && !r.B.xInside && r.B.dogBoneAllowed === false && r.B.enclosed.length === 0 && r.B.detour, JSON.stringify(r.B));
    check('C 無障礙物：膠囊仍允許、無被包障礙物、遠處非成員不在框內', r.C.dogBoneAllowed === true && r.C.enclosed.length === 0 && !r.C.w3Inside, JSON.stringify(r.C));

    // 截圖供肉眼確認
    await page.evaluate(() => { const app = window.app; app.households.length = 0; app.households.push({ id: 'hhA', ids: ['r2', 'r1', 'law', 'gf', 'ip'], notes: '' }); app.persons = app.persons.filter(p => !['ba', 'bx', 'bb'].includes(p.id)); app._syncPersonMap(); app.canvas.scale = 0.75; app.canvas.offsetX = 40; app.canvas.offsetY = 40; app.render(); });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(__dirname, 'hh_obstacle_demo.png') });

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== household-obstacle ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
