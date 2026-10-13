/**
 * [FX] 成員提起／落子動畫：點選 → lift（放大到 1.08、持續）；取消 → settle 回 1；新建立 → drop 由 1.35 縮到 1。
 * 匯出不受影響；反白（FOCUS_DIM）已關閉。
 */
const { openApp, createChecks, finish } = require('./contract_harness');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();

    await page.evaluate(() => {
        const app = window.app;
        app.loadData({ version: '1.1', persons: [
            { id: 'a', name: 'A', gender: 'male', x: 300, y: 180 }, { id: 'b', name: 'B', gender: 'female', x: 420, y: 180 }
        ], relationships: [{ id: 'r', fromPersonId: 'a', toPersonId: 'b', type: 'married' }] });
        app.canvas.scale = 1; app.canvas.offsetX = 0; app.canvas.offsetY = 0; app.render();
    });
    check('淡化跟著提起漸進（FOCUS_DIM 0.6）', await page.evaluate(() => GenogramCanvas.FOCUS_DIM === 0.6));

    // 點選 → lift
    await page.evaluate(() => { window.app.selectPerson('a'); window.app.render(); });
    const t0 = await page.evaluate(() => { const c = window.app.canvas; const e = c.personFx.get('a'); return { kind: e?.kind, scale: c._fxState(e, performance.now()).scale }; });
    await wait(350);
    const t1 = await page.evaluate(() => { window.app.render(); const c = window.app.canvas; const e = c.personFx.get('a'); return { kind: e?.kind, ...c._fxState(e, performance.now()) }; });
    const GenogramCanvasLift = await page.evaluate(() => GenogramCanvas.FX.liftScale);
    check('點選後進入 lift，160ms 後維持放大（FX.liftScale）與影子', t0.kind === 'lift' && t0.scale < GenogramCanvasLift && t1.kind === 'lift' && Math.abs(t1.scale - GenogramCanvasLift) < 1e-6 && t1.shadow > 0.2 && !t1.active, JSON.stringify([t0, t1]));

    // 取消選取 → settle → 消失
    await page.evaluate(() => { window.app.clearAllSelections(); window.app.render(); });
    const s0 = await page.evaluate(() => window.app.canvas.personFx.get('a')?.kind);
    await wait(350);
    const s1 = await page.evaluate(() => { window.app.render(); return window.app.canvas.personFx.has('a'); });
    check('取消選取 → settle，動畫結束後狀態清除', s0 === 'settle' && s1 === false, JSON.stringify([s0, s1]));

    // 快速新增（放置流程）→ drop
    const d0 = await page.evaluate(() => {
        const app = window.app;
        app.beginPlacement({ kind: 'child', basePersonId: 'a', gender: 'female', generation: 'child' });
        app.commitPlacement();
        const created = app.persons.find(p => p.id !== 'a' && p.id !== 'b');
        const e = app.canvas.personFx.get(String(created.id));
        return { id: created.id, kind: e?.kind, scale: app.canvas._fxState(e, performance.now()).scale };
    });
    await wait(450);
    const d1 = await page.evaluate(id => { window.app.render(); return window.app.canvas.personFx.get(String(id))?.kind || null; }, d0.id);
    // 落子結束後，新成員仍被選取 → 接著是「提起」狀態（順序：落子 → 提起）
    check('新建立成員 → drop（起始 > 1.2），結束後接 lift', d0.kind === 'drop' && d0.scale > 1.2 && d1 === 'lift', JSON.stringify([d0, d1]));

    // 匯出：不套用動畫（選取中匯出，圖上沒有放大）
    const exp = await page.evaluate(async () => {
        const app = window.app;
        app.selectPerson('a'); app.render();
        await app.waitForCurrentCanvasFonts();
        const url = app.canvas.exportToPNG(app.persons, app.relationships, [], [], true, false, 1, app.viewOptions, null);
        return typeof url === 'string' && url.startsWith('data:image/png');
    });
    check('匯出可用', exp);

    // 多選時不提起
    const multi = await page.evaluate(() => {
        const app = window.app; app.clearAllSelections(); app.render();
        app.selectedPersonIds = ['a', 'b']; app.selectedPersonId = 'a'; app.render();
        return [...app.canvas.personFx.values()].some(e => e.kind === 'lift');
    });
    check('多選時不套用提起', multi === false);

    check('零 console error', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'RESULT OK (person lift / drop fx)');
})().catch(err => { console.error(err); process.exit(1); });
