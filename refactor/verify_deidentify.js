/**
 * [3-1] 去識別化匯出：姓名→代號、年齡→年齡帶、隱藏備註與關係說明、頁首標題改為中性；只動輸出、磁碟與畫面不變
 * 用法：node refactor/run_all.js deidentify
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
        const d = new Person({ id: 'd', x: 400, y: 200, gender: 'male', name: '王大明', age: 45, notes: '酗酒' });
        const m = new Person({ id: 'm', x: 560, y: 200, gender: 'female', name: '李小華', birthDate: '1983-04', notes: '憂鬱症' });
        const k = new Person({ id: 'k', x: 480, y: 360, gender: 'female', name: '王小美', age: 12, isIdentifiedPatient: true, notes: '國中一年級' });
        const g = new Person({ id: 'g', x: 700, y: 200, gender: 'female', name: '外婆', age: 70, isDeceased: true, birthDate: '1950', deathDate: '2020' });
        const baby = new Person({ id: 'b', x: 560, y: 360, gender: 'male', name: '嬰', age: 0 });
        app.persons.push(d, m, k, g, baby); app._syncPersonMap();
        app.relationships.push(new Relationship({ id: 'r1', fromPersonId: 'd', toPersonId: 'm', type: 'married', date: '結婚 2005' }));
        app.relationships.push(new Relationship({ id: 'r2', fromPersonId: 'd', toPersonId: 'k', type: 'parent-child' }));
        app.relationships.push(new Relationship({ id: 'r3', fromPersonId: 'm', toPersonId: 'k', type: 'parent-child' }));
        app.setDocumentMeta({ title: '王小美 家系圖', caseId: 'C-2026-01', author: '社工甲' });
        await app.waitForCurrentCanvasFonts();

        const before = JSON.stringify(app.persons.map(p => p.toJSON()));
        const ds = app.getExportDataset(true);
        const codes = ds.persons.map(p => ({ id: p.id, name: p.name, age: p.getDisplayAge(), notes: p.notes, birth: p.birthDate }));
        const plain = app.getExportDataset(false);

        // 全流程：exportPNG(deidentify) → 攔截 storage.exportPNG 與 fillText
        const texts = [];
        const orig = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) { texts.push(String(t)); return orig.call(this, t, ...rest); };
        let captured = null;
        const origStore = app.storage.exportPNG;
        app.storage.exportPNG = url => { captured = url; };
        try {
            await app.exportPNG(true, true, 1, { title: '王小美 家系圖', caseId: 'C-2026-01', author: '社工甲', date: '2026-09-03' }, true);
        } finally {
            CanvasRenderingContext2D.prototype.fillText = orig;
            app.storage.exportPNG = origStore;
        }
        const after = JSON.stringify(app.persons.map(p => p.toJSON()));
        // 對照：不去識別化的輸出含真名
        const texts2 = [];
        CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) { texts2.push(String(t)); return orig.call(this, t, ...rest); };
        try { app.storage.exportPNG = () => {}; await app.exportPNG(true, false, 1, null, false); } finally { CanvasRenderingContext2D.prototype.fillText = orig; app.storage.exportPNG = origStore; }

        return {
            codes, plainNames: plain.persons.map(p => p.name), plainSame: plain.persons === app.persons,
            unchanged: before === after, captured: typeof captured === 'string' && captured.startsWith('data:image/png'),
            texts, texts2, mapRestored: c.personMap === app.personMap,
            headerLine: c._exportHeaderMetaLine(app.deidentifyHeader({ title: 'x', caseId: 'C-2026-01', author: '社工甲', date: '2026-09-03' })),
            headerTitle: app.deidentifyHeader({ title: '王小美 家系圖', caseId: 'C', author: '', date: '' }).title,
            headerNoTitle: app.deidentifyHeader({ title: '', caseId: 'C', author: '', date: '' }).title,
            bands: [GenogramApp.ageBand(0), GenogramApp.ageBand(7), GenogramApp.ageBand(12), GenogramApp.ageBand(45), GenogramApp.ageBand(70), GenogramApp.ageBand(null), GenogramApp.ageBand('x')],
        };
    });
    const byId = Object.fromEntries(r.codes.map(c => [c.id, c]));
    check('案主 → 「案主」；其餘依性別編號（男1、女1…），無真名', byId.k.name === '案主' && byId.d.name === '男1' && byId.b.name === '男2' && byId.m.name === '女1' && byId.g.name === '女2', JSON.stringify(r.codes));
    check('年齡 → 年齡帶（含由出生年月算出者、享年）', byId.d.age === '40-49' && byId.k.age === '10-19' && byId.m.age === '40-49' && byId.g.age === '70-79' && byId.b.age === '0-9', JSON.stringify(r.codes.map(c => c.age)));
    check('備註清空、出生年月移除', r.codes.every(c => c.notes === '' && c.birth === null), JSON.stringify(r.codes));
    check('年齡帶函式：0→0-9、7→0-9、12→10-19、null/非數字→null', JSON.stringify(r.bands) === JSON.stringify(['0-9', '0-9', '10-19', '40-49', '70-79', null, null]), JSON.stringify(r.bands));
    check('不去識別化時回傳原物件、原名', r.plainSame && r.plainNames.includes('王大明'), JSON.stringify(r.plainNames));
    check('去識別化匯出後：原資料逐 byte 不變、canvas.personMap 還原、有產出 PNG', r.unchanged && r.mapRestored && r.captured);
    const realNames = ['王大明', '李小華', '王小美', '外婆', '嬰', '酗酒', '憂鬱症', '國中一年級', '結婚 2005'];
    check('去識別化輸出不含任何真名／備註／關係說明', realNames.every(n => !r.texts.includes(n)), JSON.stringify(r.texts.filter(t => realNames.includes(t))));
    check('去識別化輸出含代號與年齡帶', r.texts.includes('案主') && r.texts.includes('男1') && r.texts.includes('40-49'), JSON.stringify(r.texts.slice(0, 20)));
    check('去識別化頁首：標題改為「家系圖（去識別化）」、meta 行標示去識別化版本、案號保留', r.headerTitle === '家系圖（去識別化）' && r.headerNoTitle === '' && /去識別化版本/.test(r.headerLine) && /C-2026-01/.test(r.headerLine), JSON.stringify({ t: r.headerTitle, l: r.headerLine }));
    check('對照：一般匯出仍含真名', r.texts2.includes('王大明') && r.texts2.includes('王小美'), JSON.stringify(r.texts2.slice(0, 10)));

    // 匯出對話框有選項
    await page.evaluate(() => window.app.showExportModal());
    await page.waitForTimeout(300);
    const ui = await page.evaluate(() => ({ has: !!document.getElementById('exportDeidentify'), checked: document.getElementById('exportDeidentify')?.checked }));
    check('匯出對話框有「去識別化」選項，預設不勾', ui.has && ui.checked === false, JSON.stringify(ui));
    await page.evaluate(() => window.app.closeExportModal());

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== deidentify ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
