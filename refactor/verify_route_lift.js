/**
 * [R-1] 婚姻線橫桿距離可調（routeLift）：ㄇ 上折越高、ㄩ 下折越低；面板 ＋／－／重設；畫布直接拖橫桿
 * 用法：node refactor/run_all.js route_lift
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

    // 資料模型
    const model = await page.evaluate(() => {
        const a = new Relationship({ fromPersonId: 'a', toPersonId: 'b', type: 'married' });
        const b = Relationship.fromJSON({ ...a.toJSON(), routeLift: 45 });
        const c = Relationship.fromJSON({ ...a.toJSON(), routeLift: 'x' });
        return { defaultLift: a.routeLift, keyWhenZero: 'routeLift' in a.toJSON(), rt: b.routeLift, keyWhenSet: b.toJSON().routeLift, bad: c.routeLift };
    });
    check('routeLift 預設 0、為 0 時不寫入 JSON、有值時存載保留、非數字視為 0', model.defaultLift === 0 && !model.keyWhenZero && model.rt === 45 && model.keyWhenSet === 45 && model.bad === 0, JSON.stringify(model));

    // 版面：本人 hub + 兩位同側前妻（ㄇ）+ 一位 ㄩ；祖母在上方會被天橋卡到
    await page.evaluate(() => {
        const app = window.app;
        const mk = (id, x, y, g, name) => new Person({ id, x, y, gender: g, name });
        app.persons = [mk('hub', 500, 400, 'male', '本人'), mk('w1', 620, 400, 'female', '前妻1'), mk('w2', 740, 400, 'female', '前妻2'), mk('sib', 380, 400, 'male', '弟'), mk('cur', 260, 400, 'female', '現任')];
        app._syncPersonMap();
        app.relationships = [
            new Relationship({ id: 'r1', fromPersonId: 'hub', toPersonId: 'w1', type: 'divorced', date: '2000' }),
            new Relationship({ id: 'r2', fromPersonId: 'hub', toPersonId: 'w2', type: 'divorced', date: '2008', routeMode: 'over' }),
            new Relationship({ id: 'r3', fromPersonId: 'hub', toPersonId: 'cur', type: 'married', date: '2015', routeMode: 'under' })
        ];
        app.households = []; app.lifeCircles = []; app.history.undoStack = []; app.history.redoStack = [];
        app.canvas.scale = 1; app.canvas.offsetX = 0; app.canvas.offsetY = 0; app.render();
    });
    const geo = await page.evaluate(() => {
        const app = window.app, c = app.canvas;
        const P = id => app.personMap.get(id);
        const route = id => c.getMarriageRoute(P('hub'), P(app.relationships.find(r => r.id === id).toPersonId), app.relationships.find(r => r.id === id), app.relationships);
        const barY = (pts, dir) => { const ys = pts.map(p => p.y); return dir < 0 ? Math.min(...ys) : Math.max(...ys); }; // ㄇ 最高點 / ㄩ 最低點
        const before = { over: barY(route('r2').points, -1), under: barY(route('r3').points, 1), auto: JSON.stringify(route('r1').points) };
        app.setRouteLiftById('r2', 40); app.setRouteLiftById('r3', 25); app.setRouteLiftById('r1', 30);
        const after = { over: barY(route('r2').points, -1), under: barY(route('r3').points, 1), auto: JSON.stringify(route('r1').points), r1lift: app.relationships[0].routeLift, hist: app.history.undoStack.length };
        return { before, after };
    });
    check('ㄇ：橫桿距離 +40 → 橫桿 Y 上移 40', geo.after.over === geo.before.over - 40, JSON.stringify({ b: geo.before.over, a: geo.after.over }));
    check('ㄩ：橫桿距離 +25 → 橫桿 Y 下移 25', geo.after.under === geo.before.under + 25, JSON.stringify({ b: geo.before.under, a: geo.after.under }));
    check('auto 直線不受影響（幾何不變、值仍寫入）；三次設定各寫一筆 history', geo.after.auto === geo.before.auto && geo.after.r1lift === 30 && geo.after.hist === 3, JSON.stringify({ r1lift: geo.after.r1lift, hist: geo.after.hist }));

    // 面板：auto 時控制項停用；ㄇ 時可用；＋/－/重設
    await page.evaluate(() => { const app = window.app; app.setRouteLiftById('r1', 0); app.setRouteLiftById('r2', 0); app.selectedPersonIds = []; app.selectedPersonId = null; app.selectedRelationshipId = 'r1'; app.updatePropertyPanel(); app.render(); });
    let ui = await page.evaluate(() => ({ row: !!document.getElementById('relationshipLiftRow'), disabled: document.querySelector('#relationshipLiftRow [data-lift="15"]')?.disabled, value: document.getElementById('relationshipLiftValue')?.textContent }));
    check('面板有「橫桿距離」列；auto 直線時停用', ui.row && ui.disabled === true, JSON.stringify(ui));
    await page.evaluate(() => { window.app.selectedRelationshipId = 'r2'; window.app.updatePropertyPanel(); window.app.render(); });
    const hBefore = await page.evaluate(() => window.app.history.undoStack.length);
    ui = await page.evaluate(() => ({ disabled: document.querySelector('#relationshipLiftRow [data-lift="15"]')?.disabled }));
    check('ㄇ 走法時控制項可用', ui.disabled === false, JSON.stringify(ui));
    await page.click('#relationshipLiftRow [data-lift="15"]'); await page.waitForTimeout(40);
    await page.click('#relationshipLiftRow [data-lift="15"]'); await page.waitForTimeout(40);
    ui = await page.evaluate(() => ({ lift: window.app.relationships.find(r => r.id === 'r2').routeLift, value: document.getElementById('relationshipLiftValue').textContent, hist: window.app.history.undoStack.length }));
    check('按兩次 ＋ → routeLift 30、面板顯示 30、history +2', ui.lift === 30 && ui.value === '30' && ui.hist === hBefore + 2, JSON.stringify(ui));
    await page.click('#relationshipLiftRow [data-lift="-15"]'); await page.waitForTimeout(40);
    ui = await page.evaluate(() => window.app.relationships.find(r => r.id === 'r2').routeLift);
    check('按 － → 15', ui === 15, String(ui));
    await page.click('#relationshipLiftRow [data-lift="reset"]'); await page.waitForTimeout(40);
    ui = await page.evaluate(() => window.app.relationships.find(r => r.id === 'r2').routeLift);
    check('重設 → 0', ui === 0, String(ui));
    await page.click('#relationshipLiftRow [data-lift="-15"]'); await page.waitForTimeout(40);
    ui = await page.evaluate(() => window.app.relationships.find(r => r.id === 'r2').routeLift);
    check('不會低於 0', ui === 0, String(ui));

    // 畫布拖橫桿：選取 r2（ㄇ），在橫桿上按住往上拖 40px
    const drag = await page.evaluate(() => {
        const app = window.app, c = app.canvas;
        const P = id => app.personMap.get(id);
        const rel = app.relationships.find(r => r.id === 'r2');
        const pts = c.getMarriageRoute(P('hub'), P('w2'), rel, app.relationships).points;
        const bar = { y: Math.min(...pts.map(p => p.y)) };
        const rect = c.canvas.getBoundingClientRect();
        // 橫桿上、w1 與 w2 之間（不壓到任何人物符號）
        const midX = (P('w1').x + P('w2').x) / 2;
        return { sx: rect.left + midX, sy: rect.top + bar.y, barY: bar.y, hist: app.history.undoStack.length };
    });
    await page.mouse.move(drag.sx, drag.sy);
    const cursorOnBar = await page.evaluate(() => document.getElementById('genogramCanvas').style.cursor);
    await page.mouse.down();
    await page.mouse.move(drag.sx, drag.sy - 20, { steps: 4 });
    await page.mouse.move(drag.sx, drag.sy - 40, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    const afterDrag = await page.evaluate(() => {
        const app = window.app, c = app.canvas; const P = id => app.personMap.get(id);
        const rel = app.relationships.find(r => r.id === 'r2');
        const pts = c.getMarriageRoute(P('hub'), P('w2'), rel, app.relationships).points;
        return { lift: rel.routeLift, barY: Math.min(...pts.map(p => p.y)), hist: app.history.undoStack.length, dragging: c.isDragging, liftDrag: app.liftDrag, hubX: P('hub').x, value: document.getElementById('relationshipLiftValue')?.textContent };
    });
    check('滑鼠移到橫桿上顯示 ns-resize 游標', cursorOnBar === 'ns-resize', cursorOnBar);
    check('拖橫桿上移 40 → routeLift ≈ 40、橫桿跟著上移、history +1、人物未移動、面板同步', Math.abs(afterDrag.lift - 40) <= 2 && Math.abs(afterDrag.barY - (drag.barY - afterDrag.lift)) < 1 && afterDrag.hist === drag.hist + 1 && !afterDrag.dragging && afterDrag.liftDrag === null && afterDrag.hubX === 500 && afterDrag.value === String(afterDrag.lift), JSON.stringify(afterDrag));
    await page.evaluate(() => window.app.undo());
    const afterUndo = await page.evaluate(() => window.app.relationships.find(r => r.id === 'r2').routeLift);
    check('Undo → 回到 0', afterUndo === 0, String(afterUndo));

    // 日期文字跟著橫桿；匯出共用同一幾何
    const follow = await page.evaluate(async () => {
        const app = window.app, c = app.canvas;
        const spyY = () => { const ys = []; const orig = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...r) { if (String(t) === '2008') ys.push(this.getTransform().transformPoint(new DOMPoint(x, y)).y); return orig.call(this, t, x, y, ...r); }; return () => { CanvasRenderingContext2D.prototype.fillText = orig; return ys[0]; }; };
        let done = spyY(); app.render(); const y0 = done();
        app.setRouteLiftById('r2', 60);
        done = spyY(); app.render(); const y1 = done();
        const P = id => app.personMap.get(id);
        const bar = c.getMarriageRoute(P('hub'), P('w2'), app.relationships.find(r => r.id === 'r2'), app.relationships).points.reduce((m, p) => Math.min(m, p.y), Infinity);
        return { y0, y1, bar };
    });
    check('日期文字隨橫桿一起上移 60', follow.y0 !== undefined && follow.y1 !== undefined && Math.abs((follow.y0 - follow.y1) - 60) < 1, JSON.stringify(follow));

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== route-lift ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
