/**
 * [2-4] 同列直線婚姻線穿過中間人物時，日期文字避開人物符號（只動文字、不動線）：
 *   線段夠長 → 沿線左右滑到最近的空位；塞不下 → 抬到被夾者符號頂端之上。
 * 用法：node refactor/run_all.js date_label
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

    const r = await page.evaluate(async () => {
        const app = window.app, c = app.canvas;
        // 情境 A（窄）：本人(500) — 手足(620) — 現任(740)，線段只有 190px，文字塞不下 → 抬高
        // 情境 B（寬）：本人(500) — 手足(700) — 現任(900)，線段 350px → 左右滑動
        // 對照 C：不夾人 A2(500) — B2(740)
        const mk = (id, x, y, g, name, extra = {}) => new Person({ id, x, y, gender: g, name, ...extra });
        app.persons.push(
            mk('me', 500, 300, 'male', '本人'), mk('sib', 620, 300, 'female', '手足'), mk('cur', 740, 300, 'female', '現任'),
            mk('me2', 500, 520, 'male', '本人二'), mk('sib2', 700, 520, 'female', '手足二'), mk('cur2', 900, 520, 'female', '現任二'),
            mk('a', 500, 740, 'male', 'A'), mk('b', 740, 740, 'female', 'B'));
        app._syncPersonMap();
        app.relationships.push(new Relationship({ id: 'm1', fromPersonId: 'me', toPersonId: 'cur', type: 'married', date: '2015-01-01' }));
        app.relationships.push(new Relationship({ id: 'm2', fromPersonId: 'me2', toPersonId: 'cur2', type: 'married', date: '2016-02-02' }));
        app.relationships.push(new Relationship({ id: 'm3', fromPersonId: 'a', toPersonId: 'b', type: 'married', date: '2010-05' }));
        await app.waitForCurrentCanvasFonts();
        const spy = () => { const calls = []; const orig = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...rest) { const p = this.getTransform().transformPoint(new DOMPoint(x, y)); calls.push({ t: String(t), x: p.x, y: p.y }); return orig.call(this, t, x, y, ...rest); }; return () => { CanvasRenderingContext2D.prototype.fillText = orig; return calls; }; };
        c.scale = 1; c.offsetX = 0; c.offsetY = 0;
        let done = spy(); app.render(); const screen = done();
        const rel = id => app.relationships.find(x => x.id === id);
        const routeA = c.getMarriageRoute(app.personMap.get('me'), app.personMap.get('cur'), rel('m1'), app.relationships);
        const routeB = c.getMarriageRoute(app.personMap.get('me2'), app.personMap.get('cur2'), rel('m2'), app.relationships);
        const straight = rt => rt.points.length === 2 && Math.abs(rt.points[0].y - rt.points[1].y) < 0.5;
        c.ctx.font = '12px ' + c.fontFamily;
        const w = t => c.ctx.measureText(t).width;
        const find = t => screen.find(k => k.t === t) || null;
        done = spy(); c.exportToPNG(app.persons, app.relationships, app.households, app.lifeCircles, true, false, 1, app.viewOptions); const exported = done();
        const rel2 = (list, t, ref) => { const a = list.find(k => k.t === t), b = list.find(k => k.t === ref); return a && b ? { dx: a.x - b.x, dy: a.y - b.y } : null; };
        return {
            straightA: straight(routeA), straightB: straight(routeB), half: c.personSize / 2,
            A: { lbl: find('2015-01-01'), w: w('2015-01-01'), sib: { x: 620, y: 300 }, decoX: routeA.decoration.x, meRight: 525, curLeft: 715 },
            B: { lbl: find('2016-02-02'), w: w('2016-02-02'), sib: { x: 700, y: 520 }, decoX: routeB.decoration.x, meRight: 525, curLeft: 875 },
            C: { lbl: find('2010-05') },
            exA: rel2(exported, '2015-01-01', '本人'), scA: rel2(screen, '2015-01-01', '本人'),
            exB: rel2(exported, '2016-02-02', '本人二'), scB: rel2(screen, '2016-02-02', '本人二'),
        };
    });
    const clearH = (s) => s.lbl && Math.abs(s.lbl.x - s.sib.x) >= (r.half + 3) + s.w / 2 + 4 - 0.5;
    const clearV = (s) => s.lbl && s.lbl.y <= s.sib.y - r.half; // 文字底線（baseline bottom）在符號頂端之上
    check('前提：兩條婚姻線都是同列直線（auto 不繞線）', r.straightA && r.straightB, JSON.stringify({ a: r.straightA, b: r.straightB }));
    check('窄線段（塞不下）：文字抬到手足符號頂端之上、水平仍在中點', clearV(r.A) && Math.abs(r.A.lbl.x - r.A.decoX) < 1, JSON.stringify(r.A));
    check('寬線段：文字沿線滑開、與手足符號水平不重疊', clearH(r.B) && Math.abs(r.B.lbl.x - r.B.decoX) > 20, JSON.stringify(r.B));
    check('寬線段：文字仍在線段範圍內（本人右緣～現任左緣）', r.B.lbl && r.B.lbl.x - r.B.w / 2 >= r.B.meRight && r.B.lbl.x + r.B.w / 2 <= r.B.curLeft, JSON.stringify(r.B));
    check('寬線段：文字高度維持在線上方（沒有多餘抬高）', r.B.lbl && r.B.lbl.y > r.B.sib.y - r.half && r.B.lbl.y < r.B.sib.y, JSON.stringify(r.B.lbl));
    check('對照：不夾人的婚姻線日期仍在中點', r.C.lbl && Math.abs(r.C.lbl.x - 620) < 1, JSON.stringify(r.C));
    check('匯出與螢幕用同一位置（相對本人姓名的位移一致）', r.exA && r.scA && Math.abs(r.exA.dx - r.scA.dx) < 0.5 && Math.abs(r.exA.dy - r.scA.dy) < 0.5 && r.exB && r.scB && Math.abs(r.exB.dx - r.scB.dx) < 0.5, JSON.stringify({ exA: r.exA, scA: r.scA, exB: r.exB, scB: r.scB }));

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== date-label-avoid ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
