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
    const page = await browser.newPage({ viewport: { width: 1280, height: 780 }, deviceScaleFactor: 1 });
    let releaseFonts;
    const fontsReleased = new Promise(resolve => { releaseFonts = resolve; });
    await page.route(/fonts\.gstatic\.com\/.*\.woff2/, async route => {
        await fontsReleased;
        await route.continue();
    });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.app && window.app.canvas);
    await page.evaluate(() => {
        const p = new Person({ x: 500, y: 350, gender: 'male', name: '卵' });
        window.app.persons.push(p);
        window.app._syncPersonMap();
        window.app.render();
    });
    const fallback = await canvasPng(page);
    releaseFonts();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(50);
    const automatic = await canvasPng(page);
    await page.evaluate(() => window.app.render());
    const expected = await canvasPng(page);
    await browser.close();

    if (equalPixels(fallback, expected)) throw new Error('setup failed: glyph did not transition from fallback to Noto Sans TC');
    if (!equalPixels(automatic, expected)) throw new Error('Canvas did not repaint after webfont loading completed');
    console.log('PASS | Canvas repaints after unicode-range webfont loading');
})().catch(error => { console.error('FAIL | ' + error.message); process.exit(1); });
