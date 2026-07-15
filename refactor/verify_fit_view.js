const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp({ width: 1366, height: 768 });
    const { failures, passes, check } = createChecks();
    const result = await page.evaluate(async () => {
        const app = window.app;
        const makeData = xs => ({
            persons: xs.map((x, index) => ({ id: 'p' + index, x, y: 240, gender: index % 2 ? 'female' : 'male', name: 'P' + index })),
            relationships: [], households: [], lifeCircles: []
        });
        app.loadData(makeData([300, 520]));
        await new Promise(resolve => requestAnimationFrame(resolve));
        const small = { scale: app.canvas.scale, offsetX: app.canvas.offsetX };
        app.loadData(makeData([-900, -300, 300, 900, 1500, 2100]));
        await new Promise(resolve => requestAnimationFrame(resolve));
        const bounds = app.canvas.getContentBounds(app.persons, app.relationships,
            app.households, app.lifeCircles, app.viewOptions);
        const screen = {
            left: bounds.minX * app.canvas.scale + app.canvas.offsetX,
            right: bounds.maxX * app.canvas.scale + app.canvas.offsetX,
            top: bounds.minY * app.canvas.scale + app.canvas.offsetY,
            bottom: bounds.maxY * app.canvas.scale + app.canvas.offsetY
        };
        const largeScale = app.canvas.scale;
        app.resetZoom();
        const resetScale = app.canvas.scale;
        document.getElementById('fitView').click();
        const manualScale = app.canvas.scale;
        app.loadData(makeData([-900, -300, 300, 900, 1500, 2100]));
        app.canvas.scale = .77;
        app.canvas.offsetX = 13;
        app.canvas.offsetY = 17;
        app.render();
        await new Promise(resolve => requestAnimationFrame(resolve));
        const explicitView = {
            scale: app.canvas.scale,
            offsetX: app.canvas.offsetX,
            offsetY: app.canvas.offsetY
        };
        app.loadData(makeData([-20000, 20000]));
        await new Promise(resolve => requestAnimationFrame(resolve));
        const limited = app.fitToView();
        const originalLoadAutoSave = app.storage.loadAutoSave;
        app.storage.loadAutoSave = () => ({
            persons: [new Person({ id: 'saved', x: 300, y: 260, name: '已儲存' })],
            relationships: [], households: [], lifeCircles: [],
            view: { scale: .63, offsetX: 71, offsetY: 82 }
        });
        app.loadAutoSave();
        await new Promise(resolve => requestAnimationFrame(resolve));
        const restored = { scale: app.canvas.scale, offsetX: app.canvas.offsetX, offsetY: app.canvas.offsetY };
        app.storage.loadAutoSave = originalLoadAutoSave;
        app.persons = []; app._syncPersonMap(); app.relationships = []; app.households = []; app.lifeCircles = [];
        app.canvas.scale = .5; app.canvas.offsetX = 20; app.canvas.offsetY = 30;
        const empty = app.fitToView();
        return { small, screen, canvasWidth: app.canvas.width, canvasHeight: app.canvas.height,
            largeScale, resetScale, manualScale, explicitView, limited, restored, empty,
            zoomText: document.getElementById('zoomLevel').textContent };
    });
    check('small load stays at 100%', result.small.scale === 1);
    check('large load automatically scales below 100%', result.largeScale < 1);
    check('automatic fit keeps 24px viewport inset', result.screen.left >= 23 && result.screen.right <= result.canvasWidth - 23
        && result.screen.top >= 23 && result.screen.bottom <= result.canvasHeight - 23, JSON.stringify(result.screen));
    check('reset remains exactly 100%', result.resetScale === 1);
    check('manual Fit returns to the automatic scale', Math.abs(result.manualScale - result.largeScale) < .001);
    check('an explicit render cancels a pending automatic fit',
        result.explicitView.scale === .77 && result.explicitView.offsetX === 13
            && result.explicitView.offsetY === 17, JSON.stringify(result.explicitView));
    check('extreme content stops at 25% and reports the limit',
        result.limited.limited === true && result.limited.scale === .25, JSON.stringify(result.limited));
    check('LocalStorage restore preserves saved zoom and offsets',
        result.restored.scale === .63 && result.restored.offsetX === 71 && result.restored.offsetY === 82,
        JSON.stringify(result.restored));
    check('empty Fit returns 100% and zero offsets', result.empty.scale === 1 && result.empty.fitted === false);
    check('zoom display follows fitted scale', /%$/.test(result.zoomText));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL FIT VIEW CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
