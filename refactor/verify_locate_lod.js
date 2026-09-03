/**
 * [3-3] 定位案主 + 低縮放姓名可讀性（螢幕 LOD，匯出不受影響）
 * 用法：node refactor/run_all.js locate_lod
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

    // ---- 定位案主 ----
    let r = await page.evaluate(() => ({ btn: !!document.getElementById('locateIP'), title: document.getElementById('locateIP')?.title }));
    check('縮放列有「定位案主」按鈕', r.btn && /案主/.test(r.title || ''), JSON.stringify(r));
    await page.click('#locateIP');
    await page.waitForTimeout(80);
    r = await page.evaluate(() => document.getElementById('statusBar').textContent);
    check('沒有案主 → 提示尚未標記', /案主/.test(r), r);

    await page.evaluate(() => {
        const app = window.app;
        const far = new Person({ id: 'far', x: 2400, y: 1500, gender: 'female', name: '案主甲', isIdentifiedPatient: true });
        const other = new Person({ id: 'o', x: 100, y: 100, gender: 'male', name: '路人' });
        const ip2 = new Person({ id: 'ip2', x: -800, y: 300, gender: 'male', name: '案主乙', isIdentifiedPatient: true });
        app.persons.push(other, far, ip2); app._syncPersonMap();
        app.canvas.scale = 0.4; app.canvas.offsetX = 0; app.canvas.offsetY = 0; app.render();
    });
    await page.click('#locateIP');
    await page.waitForTimeout(80);
    r = await page.evaluate(() => {
        const app = window.app, c = app.canvas;
        const p = app.personMap.get(app.selectedPersonId);
        return { scale: c.scale, sel: app.selectedPersonId, screenX: p ? p.x * c.scale + c.offsetX : null, screenY: p ? p.y * c.scale + c.offsetY : null, w: c.width, h: c.height };
    });
    check('有案主 → 縮放回 100%、案主置中、案主被選取', r.scale === 1 && r.sel && Math.abs(r.screenX - r.w / 2) < 1 && Math.abs(r.screenY - r.h / 2) < 1, JSON.stringify(r));
    const first = r.sel;
    await page.click('#locateIP');
    await page.waitForTimeout(80);
    r = await page.evaluate(() => window.app.selectedPersonId);
    check('多位案主 → 再按一次切到下一位', r && r !== first, `${first} → ${r}`);
    await page.click('#locateIP');
    await page.waitForTimeout(80);
    r = await page.evaluate(() => window.app.selectedPersonId);
    check('再按一次 → 輪回第一位', r === first, `${r}`);

    // ---- LOD：低縮放姓名放大（螢幕）、匯出不變 ----
    r = await page.evaluate(async () => {
        const app = window.app, c = app.canvas;
        app.clearAllSelections();
        await app.waitForCurrentCanvasFonts();
        const spyFont = () => { const fonts = []; const orig = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) { fonts.push({ t: String(t), font: this.font }); return orig.call(this, t, ...rest); }; return () => { CanvasRenderingContext2D.prototype.fillText = orig; return fonts; }; };
        const nameFontPx = list => { const e = list.find(k => k.t === '路人'); return e ? parseFloat(e.font) : null; };
        c.scale = 1; c.offsetX = 300; c.offsetY = 300; let done = spyFont(); app.render(); const at100 = nameFontPx(done());
        c.scale = 0.4; done = spyFont(); app.render(); const at40 = nameFontPx(done());
        const lod40 = c.lodScale;
        // 匯出（不論目前縮放）
        done = spyFont(); c.exportToPNG(app.persons, app.relationships, app.households, app.lifeCircles, true, false, 1, app.viewOptions); const exportAt40 = nameFontPx(done());
        const lodAfterExport = c.lodScale;
        c.scale = 1; app.render();
        return { at100, at40, exportAt40, lod40, lodAfterExport, base: c.fontSize };
    });
    check('100% 時姓名字級 = 基準 14px', r.at100 === r.base, JSON.stringify(r));
    check('40% 時姓名字級放大（世界座標 > 基準，且 ≤ 1.6 倍）', r.at40 > r.base && r.at40 <= r.base * 1.6 + 0.01, JSON.stringify(r));
    check('匯出不受螢幕縮放影響（字級 = 基準）、匯出後 lodScale 還原', r.exportAt40 === r.base && Math.abs(r.lodAfterExport - 0.4) < 1e-9, JSON.stringify(r));

    r = await page.evaluate(() => {
        const app = window.app, c = app.canvas;
        app.persons[0].notes = '備註一\n備註二';
        const spy = () => { const t = []; const orig = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (s, ...rest) { t.push(String(s)); return orig.call(this, s, ...rest); }; return () => { CanvasRenderingContext2D.prototype.fillText = orig; return t; }; };
        c.scale = 1; let done = spy(); app.render(); const notes100 = done().includes('備註一');
        c.scale = 0.4; done = spy(); app.render(); const notes40 = done().includes('備註一');
        done = spy(); c.exportToPNG(app.persons, app.relationships, app.households, app.lifeCircles, true, false, 1, app.viewOptions); const notesExport = done().includes('備註一');
        c.scale = 1; app.render();
        return { notes100, notes40, notesExport };
    });
    check('備註：100% 顯示、40% 時螢幕隱藏（太小無法辨讀）、匯出仍顯示', r.notes100 && !r.notes40 && r.notesExport, JSON.stringify(r));

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== locate-lod ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
