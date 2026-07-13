/** Regression: Canvas must repaint when a unicode-range webfont finishes loading. */
const { chromium } = require('playwright');
const path = require('path');
const { PNG } = require('pngjs');

const URL = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

function equalPixels(a, b) {
    const x = PNG.sync.read(a).data;
    const y = PNG.sync.read(b).data;
    return x.length === y.length && x.every((value, i) => value === y[i]);
}

async function canvasPng(page) {
    const dataUrl = await page.locator('#genogramCanvas').evaluate(canvas => canvas.toDataURL('image/png'));
    return Buffer.from(dataUrl.split(',')[1], 'base64');
}

(async () => {
    const browser = await chromium.launch();
    const rejectionPage = await browser.newPage();
    const rejectionErrors = [];
    rejectionPage.on('pageerror', error => rejectionErrors.push(error.message));
    await rejectionPage.addInitScript(() => {
        Object.defineProperty(document.fonts, 'load', {
            configurable: true,
            value: () => Promise.reject(new Error('simulated font load failure'))
        });
    });
    await rejectionPage.goto(URL);
    await rejectionPage.waitForFunction(() => window.app && window.app.canvasFontReady);
    await rejectionPage.evaluate(() => window.app.canvasFontReady);
    if (rejectionErrors.length) throw new Error(`font load rejection was unhandled: ${rejectionErrors.join('; ')}`);
    await rejectionPage.close();

    const page = await browser.newPage({ viewport: { width: 1280, height: 780 }, deviceScaleFactor: 1 });
    await page.goto(URL);
    await page.waitForFunction(() => window.app && window.app.canvas);
    await page.evaluate(() => window.app.canvasFontReady);
    let releaseFonts;
    const fontsReleased = new Promise(resolve => { releaseFonts = resolve; });
    await page.route(/fonts\.gstatic\.com\/.*\.woff2/, async route => {
        await fontsReleased;
        await route.continue();
    });
    await page.evaluate(() => {
        const p = new Person({ x: 500, y: 350, gender: 'male', name: '龘齉', notes: '龘齉備註' });
        window.app.persons.push(p);
        window.app._syncPersonMap();
        window.app.render();
    });
    const fallback = await canvasPng(page);
    const exportState = await page.evaluate(() => {
        window.__fontExports = { png: false, jpeg: false, svg: false, pdf: false };
        window.app.storage.exportPNG = () => { window.__fontExports.png = true; };
        window.app.storage.exportJPEG = () => { window.__fontExports.jpeg = true; };
        window.app.storage.exportSVG = () => { window.__fontExports.svg = true; };
        window.app.storage.exportPDF = () => { window.__fontExports.pdf = true; };
        const promises = [
            window.app.exportPNG(false, false, 1), window.app.exportJPEG(false, false, 1),
            window.app.exportSVG(false, false, 1), window.app.exportPDF(false, false, 1)
        ];
        return { allPromises: promises.every(promise => promise && typeof promise.then === 'function') };
    });
    await page.waitForTimeout(100);
    const exportedEarly = await page.evaluate(() => Object.values(window.__fontExports).some(Boolean));
    releaseFonts();
    await page.evaluate(() => window.app.waitForCurrentCanvasFonts());
    await page.waitForFunction(() => Object.values(window.__fontExports).every(Boolean));
    const automatic = await canvasPng(page);
    await page.evaluate(() => window.app.render());
    const expected = await canvasPng(page);
    await browser.close();

    if (equalPixels(fallback, expected)) throw new Error('setup failed: glyph did not transition from fallback to Noto Sans TC');
    if (!equalPixels(automatic, expected)) throw new Error('Canvas did not repaint after webfont loading completed');
    if (!exportState.allPromises || exportedEarly) throw new Error('PNG/JPEG/SVG/PDF exports did not await current glyph font readiness');
    console.log('PASS | Canvas repaints and all image exports wait for arbitrary unicode-range glyph loading');
})().catch(error => { console.error('FAIL | ' + error.message); process.exit(1); });
