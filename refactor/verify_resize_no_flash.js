/**
 * 2026-10-13 回歸：切換右側面板時畫面不能閃黑。
 * 畫布是不透明的（alpha:false），改 canvas.width/height 會清成黑色；
 * resize() 必須在同一格立刻重畫，尺寸沒變則不重設畫布。
 * 取樣點：在畫布自己的 ResizeObserver 之後再掛一個 observer，量到的就是瀏覽器即將上畫面的那一格。
 */
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();
    await page.setViewportSize({ width: 1500, height: 900 });
    await page.waitForTimeout(300);

    const r = await page.evaluate(async () => {
        const app = window.app, c = app.canvas;
        app.loadData({ version: '1.1', persons: [{ id: 'a', name: 'A', gender: 'male', x: 200, y: 200 }], relationships: [] });
        c.scale = 1; c.offsetX = 0; c.offsetY = 0; app.render();
        const px = (x, y) => [...c.ctx.getImageData(Math.round(x * c.dpr), Math.round(y * c.dpr), 1, 1).data].slice(0, 3).join(',');
        const samples = [];
        const ro = new ResizeObserver(() => samples.push({ w: c.canvas.width, corner: px(5, 5), person: px(200, 200) }));
        ro.observe(c.container);
        const w0 = c.canvas.width;
        app.setInspectorCollapsed(true);
        await new Promise(res => setTimeout(res, 600));
        const wCollapsed = c.canvas.width;
        app.setInspectorCollapsed(false);
        await new Promise(res => setTimeout(res, 600));
        ro.disconnect();

        // 尺寸沒變時 resize() 不能重設畫布（重設＝清成黑）
        let resets = 0;
        const desc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
        Object.defineProperty(c.canvas, 'width', { configurable: true, get() { return desc.get.call(this); }, set(v) { resets++; desc.set.call(this, v); } });
        c.resize();
        delete c.canvas.width;

        return {
            w0, wCollapsed, wBack: c.canvas.width, frames: samples.length,
            black: samples.filter(s => s.corner === '0,0,0' || s.person === '0,0,0').length,
            personDrawn: samples.every(s => s.person !== s.corner),
            resets
        };
    });
    check('收合面板時畫布真的變寬', r.wCollapsed > r.w0 && r.wBack === r.w0, JSON.stringify(r));
    check('面板動畫每一格都沒有黑畫面', r.frames >= 2 && r.black === 0, JSON.stringify(r));
    check('面板動畫每一格人物都在（同一格重畫）', r.personDrawn, JSON.stringify(r));
    check('尺寸沒變時不重設畫布', r.resets === 0, JSON.stringify(r));

    check('零 console error', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'RESULT OK (resize no black flash)');
})().catch(err => { console.error(err); process.exit(1); });
