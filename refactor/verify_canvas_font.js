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

    const racePage = await browser.newPage();
    await racePage.addInitScript(() => {
        window.__deferredFontLoads = [];
        window.__releaseFontLoads = marker => {
            window.__deferredFontLoads.forEach(load => {
                if (load.released || (marker && !load.text.includes(marker))) return;
                load.released = true;
                load.resolve();
            });
        };
        Object.defineProperty(document.fonts, 'load', {
            configurable: true,
            value: (font, text) => new Promise(resolve => {
                window.__deferredFontLoads.push({ font, text, resolve, released: false });
            })
        });
    });
    await racePage.goto(URL);
    await racePage.waitForFunction(() => window.app && window.__deferredFontLoads.length >= 2);
    await racePage.evaluate(() => window.__releaseFontLoads(''));
    await racePage.evaluate(() => window.app.canvasFontReady);
    await racePage.evaluate(() => {
        const app = window.app;
        const originalInvalidate = app.canvas.invalidateDerivedGeometry.bind(app.canvas);
        window.__fontRace = {
            invalidations: 0,
            exportCalls: 0,
            exportASettled: false,
            waitBSettled: false
        };
        app.canvas.invalidateDerivedGeometry = () => {
            window.__fontRace.invalidations++;
            return originalInvalidate();
        };
        app.storage.exportPNG = () => { window.__fontRace.exportCalls++; };
        app.persons = [new Person({
            id: 'font-race-person', x: 320, y: 280, gender: 'male', name: 'font-race-A'
        })];
        app._syncPersonMap();
        window.__fontRace.exportA = app.exportPNG(false, false, 1)
            .then(() => { window.__fontRace.exportASettled = true; });
        app.persons[0].name = 'font-race-B';
        window.__fontRace.waitB = app.waitForCurrentCanvasFonts(false)
            .then(() => { window.__fontRace.waitBSettled = true; });
    });
    await racePage.waitForFunction(() => {
        const loads = window.__deferredFontLoads;
        return loads.filter(load => load.text.includes('font-race-A')).length === 2
            && loads.filter(load => load.text.includes('font-race-B')).length === 2;
    });
    await racePage.evaluate(() => window.__releaseFontLoads('font-race-A'));
    await racePage.evaluate(() => Promise.resolve().then(() => Promise.resolve()));
    const raceAfterA = await racePage.evaluate(() => ({
        exportASettled: window.__fontRace.exportASettled,
        waitBSettled: window.__fontRace.waitBSettled,
        exportCalls: window.__fontRace.exportCalls,
        invalidations: window.__fontRace.invalidations
    }));
    await racePage.evaluate(() => window.__releaseFontLoads('font-race-B'));
    await racePage.evaluate(() => Promise.all([
        window.__fontRace.exportA, window.__fontRace.waitB
    ]));
    const raceAfterB = await racePage.evaluate(() => ({
        exportASettled: window.__fontRace.exportASettled,
        waitBSettled: window.__fontRace.waitBSettled,
        exportCalls: window.__fontRace.exportCalls,
        invalidations: window.__fontRace.invalidations
    }));
    await racePage.close();

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
    await page.unroute(/fonts\.gstatic\.com\/.*\.woff2/);
    let releaseLifeCircleFonts;
    const lifeCircleFontsReleased = new Promise(resolve => { releaseLifeCircleFonts = resolve; });
    await page.route(/fonts\.gstatic\.com\/.*\.woff2/, async route => {
        await lifeCircleFontsReleased;
        await route.continue();
    });
    await page.evaluate(() => {
        window.app.persons=[]; window.app.relationships=[]; window.app._syncPersonMap();
        window.app.lifeCircles=[{id:'slow-label',label:'麤靐生活圈',color:'rgba(74,144,226,.15)',
            points:[{x:300,y:220},{x:520,y:220},{x:520,y:440},{x:300,y:440}]}];
        window.__lifeCircleExported=false;
        window.app.storage.exportPNG=()=>{ window.__lifeCircleExported=true; };
        window.app.render();
    });
    const lifeCircleFallback = await canvasPng(page);
    const lifeCirclePromise = await page.evaluate(() => {
        const promise=window.app.exportPNG(false,false,1);
        return Boolean(promise&&typeof promise.then==='function');
    });
    await page.waitForTimeout(100);
    const lifeCircleExportedEarly=await page.evaluate(()=>window.__lifeCircleExported);
    releaseLifeCircleFonts();
    await page.evaluate(()=>window.app.waitForCurrentCanvasFonts());
    await page.waitForFunction(()=>window.__lifeCircleExported);
    const lifeCircleAutomatic=await canvasPng(page);
    await page.evaluate(()=>window.app.render());
    const lifeCircleExpected=await canvasPng(page);
    await browser.close();

    if (equalPixels(fallback, expected)) throw new Error('setup failed: glyph did not transition from fallback to Noto Sans TC');
    if (!equalPixels(automatic, expected)) throw new Error('Canvas did not repaint after webfont loading completed');
    if (!exportState.allPromises || exportedEarly) throw new Error('PNG/JPEG/SVG/PDF exports did not await current glyph font readiness');
    if (equalPixels(lifeCircleFallback,lifeCircleExpected)) throw new Error('setup failed: life-circle label glyph did not transition');
    if (!equalPixels(lifeCircleAutomatic,lifeCircleExpected)) throw new Error('life-circle label did not repaint after font readiness');
    if (!lifeCirclePromise||lifeCircleExportedEarly) throw new Error('life-circle export did not await label glyph readiness');
    if (raceAfterA.exportASettled || raceAfterA.waitBSettled || raceAfterA.exportCalls !== 0 || raceAfterA.invalidations !== 0) {
        throw new Error(`stale A generation released export before B: ${JSON.stringify(raceAfterA)}`);
    }
    if (!raceAfterB.exportASettled || !raceAfterB.waitBSettled || raceAfterB.exportCalls !== 1 || raceAfterB.invalidations !== 1) {
        throw new Error(`latest B generation did not release export exactly once: ${JSON.stringify(raceAfterB)}`);
    }
    console.log('PASS | Canvas and life-circle labels repaint; all image exports await arbitrary unicode-range glyphs');
})().catch(error => { console.error('FAIL | ' + error.message); process.exit(1); });
