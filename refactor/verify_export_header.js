/**
 * [2-2] 匯出頁首（標題/案號/日期/繪製者）+ 文件 meta 持久化 + PDF 紙張
 * 驗證：無頁首時輸出逐 byte 不變；有頁首時只多出頁首高度且文字被繪出；meta 只在有值時進 JSON、
 * 存載保留；匯出對話框欄位 ↔ meta 同步並標記未儲存；exportPDF 依選項建立 jsPDF。
 * 用法：node refactor/run_all.js export_header
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
    await page.evaluate(() => { localStorage.removeItem('genogram_export_prefs'); });

    await page.evaluate(() => {
        const app = window.app;
        const d = new Person({ x: 500, y: 300, gender: 'male', name: '父', age: 50 });
        const m = new Person({ x: 660, y: 300, gender: 'female', name: '母', age: 48 });
        const k = new Person({ x: 580, y: 460, gender: 'female', name: '女', age: 12 });
        app.persons.push(d, m, k); app._syncPersonMap();
        app.relationships.push(new Relationship({ fromPersonId: d.id, toPersonId: m.id, type: 'married' }));
        app.relationships.push(new Relationship({ fromPersonId: d.id, toPersonId: k.id, type: 'parent-child' }));
        app.relationships.push(new Relationship({ fromPersonId: m.id, toPersonId: k.id, type: 'parent-child' }));
        app.render();
    });
    await page.evaluate(() => window.app.waitForCurrentCanvasFonts());

    // ---- 無頁首：與預設呼叫逐 byte 相同；空 header 也不佔高度 ----
    const base = await page.evaluate(async () => {
        const app = window.app, c = app.canvas;
        const args = [app.persons, app.relationships, app.households, app.lifeCircles, true, true, 1, app.viewOptions];
        const a = c.exportToPNG(...args);
        const b = c.exportToPNG(...args, null);
        const e = c.exportToPNG(...args, { title: '', caseId: '', author: '', date: '' });
        const size = src => new Promise(res => { const img = new Image(); img.onload = () => res({ w: img.width, h: img.height }); img.src = src; });
        return { same: a === b, sameEmpty: a === e, dims: await size(a), h0: c._exportHeaderHeight(null), hEmpty: c._exportHeaderHeight({ title: ' ' }) };
    });
    check('header=null 與預設呼叫輸出逐 byte 相同', base.same);
    check('全空 header 不佔高度、輸出相同', base.sameEmpty && base.h0 === 0 && base.hEmpty === 0, JSON.stringify(base));

    // ---- 有頁首：高度多出 _exportHeaderHeight、寬度不變、文字被畫出 ----
    const withHeader = await page.evaluate(async () => {
        const app = window.app, c = app.canvas;
        const header = { title: '王○○ 家系圖', caseId: 'A-2026-0123', author: '社工甲', date: '2026-09-03' };
        const args = [app.persons, app.relationships, app.households, app.lifeCircles, true, true, 1, app.viewOptions];
        const texts = [];
        const orig = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) { texts.push(String(t)); return orig.call(this, t, ...rest); };
        let png, jpg;
        try { png = c.exportToPNG(...args, header); jpg = c.exportToJPEG(app.persons, app.relationships, app.households, app.lifeCircles, 0.92, true, true, 1, app.viewOptions, header); }
        finally { CanvasRenderingContext2D.prototype.fillText = orig; }
        const size = src => new Promise(res => { const img = new Image(); img.onload = () => res({ w: img.width, h: img.height }); img.src = src; });
        const titleOnly = c._exportHeaderHeight({ title: 'x' });
        const metaOnly = c._exportHeaderHeight({ caseId: 'x' });
        return { dims: await size(png), jdims: await size(jpg), hh: c._exportHeaderHeight(header), texts, titleOnly, metaOnly, metaLine: c._exportHeaderMetaLine(header) };
    });
    check('有頁首：PNG 高度 = 原高 + 頁首高、寬度不變', withHeader.dims.h === base.dims.h + withHeader.hh && withHeader.dims.w === base.dims.w, JSON.stringify({ base: base.dims, hdr: withHeader.dims, hh: withHeader.hh }));
    check('有頁首：JPEG 尺寸同 PNG', withHeader.jdims.h === withHeader.dims.h && withHeader.jdims.w === withHeader.dims.w, JSON.stringify(withHeader.jdims));
    check('頁首文字：標題與「案號／日期／繪製者」一行都被繪出（PNG+JPEG 各一次）',
        withHeader.texts.filter(t => t === '王○○ 家系圖').length === 2 && withHeader.texts.filter(t => t === withHeader.metaLine).length === 2, JSON.stringify(withHeader.texts.filter(t => /家系圖|案號/.test(t))));
    check('meta 行格式：案號／日期／繪製者', withHeader.metaLine === '案號：A-2026-0123　　日期：2026-09-03　　繪製者：社工甲', withHeader.metaLine);
    check('只有標題 / 只有 meta 各自有合理高度且小於兩者皆有', withHeader.titleOnly > 0 && withHeader.metaOnly > 0 && withHeader.titleOnly < withHeader.hh && withHeader.metaOnly < withHeader.hh, JSON.stringify(withHeader));

    // ---- meta 持久化 ----
    const persist = await page.evaluate(async () => {
        const app = window.app;
        const out = {};
        out.extraEmpty = app.getDocumentExtra();
        // 假檔案 handle 捕捉寫出的 JSON
        let written = null;
        app.storage.currentFileHandle = { createWritable: async () => ({ write: async s => { written = s; }, close: async () => {} }) };
        app.storage.currentFileName = 'meta_test.json';
        await app.saveToFile();
        out.noMetaKey = !('meta' in JSON.parse(written));
        app.setDocumentMeta({ title: '王○○ 家系圖', caseId: 'A-1', author: '社工甲' });
        out.dirtyAfterMeta = !document.getElementById('documentDirty').hidden;
        out.extra = app.getDocumentExtra();
        await app.saveToFile();
        const saved = JSON.parse(written);
        out.savedMeta = saved.meta;
        out.autosaveMeta = JSON.parse(localStorage.getItem('genogram_autosave')).meta;
        // loadData 帶 meta / 不帶 meta
        app.loadData({ ...saved, meta: { title: 'T2', caseId: 'C2', author: 'A2', junk: 1 } });
        out.loadedMeta = { ...app.documentMeta };
        app.loadData({ persons: saved.persons, relationships: saved.relationships });
        out.loadedNoMeta = { ...app.documentMeta };
        // loadAutoSave 還原 meta
        app.setDocumentMeta({ title: 'AS', caseId: '', author: '' });
        app.autoSave();
        await new Promise(r => setTimeout(r, 1200));
        const restored = app.storage.loadAutoSave();
        out.autosaveRestoredMeta = restored && restored.meta;
        return out;
    });
    check('無 meta 時 getDocumentExtra = {} 且寫出的 JSON 沒有 meta key（舊檔相容）', JSON.stringify(persist.extraEmpty) === '{}' && persist.noMetaKey);
    check('setDocumentMeta → 標記未儲存、extra 帶 meta、寫檔含 meta', persist.dirtyAfterMeta && persist.extra.meta && persist.savedMeta && persist.savedMeta.title === '王○○ 家系圖' && persist.savedMeta.caseId === 'A-1', JSON.stringify(persist.savedMeta));
    check('autosave 也含 meta', persist.autosaveMeta && persist.autosaveMeta.author === '社工甲', JSON.stringify(persist.autosaveMeta));
    check('loadData 讀入 meta 並只保留三欄', JSON.stringify(persist.loadedMeta) === JSON.stringify({ title: 'T2', caseId: 'C2', author: 'A2' }), JSON.stringify(persist.loadedMeta));
    check('loadData 無 meta → 清成空值', JSON.stringify(persist.loadedNoMeta) === JSON.stringify({ title: '', caseId: '', author: '' }), JSON.stringify(persist.loadedNoMeta));
    check('storage.loadAutoSave 回傳 meta', persist.autosaveRestoredMeta && persist.autosaveRestoredMeta.title === 'AS', JSON.stringify(persist.autosaveRestoredMeta));

    // ---- 匯出對話框 UI ----
    await page.evaluate(() => { window.app.setDocumentMeta({ title: '案A', caseId: '2026-001', author: '' }); window.app.showExportModal(); });
    await page.waitForTimeout(350);
    let ui = await page.evaluate(() => ({
        title: document.getElementById('exportMetaTitle').value,
        caseId: document.getElementById('exportMetaCaseId').value,
        date: document.getElementById('exportMetaDate').value,
        include: document.getElementById('exportIncludeHeader').checked,
        fieldsHidden: document.getElementById('exportHeaderFields').hidden,
        fieldsDisplay: getComputedStyle(document.getElementById('exportHeaderFields')).display,
        settings: window.app.readExportHeaderSettings(),
    }));
    check('開啟匯出對話框：欄位帶入 meta、日期預設今天、預設不加頁首（欄位收合）', ui.title === '案A' && ui.caseId === '2026-001' && /^\d{4}-\d{2}-\d{2}$/.test(ui.date) && !ui.include && ui.fieldsHidden && ui.fieldsDisplay === 'none', JSON.stringify(ui));
    check('未勾頁首 → header=null、PDF 預設 a4/auto', ui.settings.header === null && ui.settings.pdfOptions.format === 'a4' && ui.settings.pdfOptions.orientation === 'auto', JSON.stringify(ui.settings));
    await page.check('#exportIncludeHeader');
    await page.fill('#exportMetaAuthor', '社工乙');
    await page.locator('#exportMetaAuthor').dispatchEvent('change');
    await page.selectOption('#exportPdfFormat', 'a3');
    await page.selectOption('#exportPdfOrientation', 'p');
    await page.waitForTimeout(60);
    ui = await page.evaluate(() => ({
        fieldsDisplay: getComputedStyle(document.getElementById('exportHeaderFields')).display,
        metaAuthor: window.app.documentMeta.author,
        settings: window.app.readExportHeaderSettings(),
        prefs: JSON.parse(localStorage.getItem('genogram_export_prefs')),
    }));
    check('勾頁首 → 欄位展開；繪製者寫入 meta；header 含四欄；PDF a3/p；偏好記到 localStorage',
        ui.fieldsDisplay !== 'none' && ui.metaAuthor === '社工乙' && ui.settings.header && ui.settings.header.title === '案A' && ui.settings.header.author === '社工乙'
        && ui.settings.pdfOptions.format === 'a3' && ui.settings.pdfOptions.orientation === 'p' && ui.prefs.includeHeader === true && ui.prefs.author === '社工乙' && ui.prefs.pdfFormat === 'a3', JSON.stringify(ui));
    await page.evaluate(() => window.app.closeExportModal());
    await page.waitForTimeout(350);
    await page.evaluate(() => window.app.showExportModal());
    await page.waitForTimeout(350);
    ui = await page.evaluate(() => ({ include: document.getElementById('exportIncludeHeader').checked, format: document.getElementById('exportPdfFormat').value }));
    check('重開對話框記住「加上頁首」與紙張偏好', ui.include === true && ui.format === 'a3', JSON.stringify(ui));
    await page.evaluate(() => window.app.closeExportModal());

    // ---- storage.exportPDF 依選項建立 jsPDF ----
    const pdf = await page.evaluate(() => {
        const calls = [];
        const real = window.jspdf;
        window.jspdf = { jsPDF: class { constructor(o) { calls.push(o); this.internal = { pageSize: { getWidth: () => 297, getHeight: () => 210 } }; } addImage() {} save(n) { calls.push({ saved: n }); } } };
        try {
            window.app.storage.exportPDF('data:image/png;base64,AAAA', 200, 100, 'x.pdf', { format: 'a3', orientation: 'p' });
            window.app.storage.exportPDF('data:image/png;base64,AAAA', 200, 100, 'y.pdf', { format: 'a4', orientation: 'auto' });
            window.app.storage.exportPDF('data:image/png;base64,AAAA', 100, 200, 'z.pdf');
        } finally { window.jspdf = real; }
        return calls;
    });
    check('exportPDF：a3 + 直向 依選項', pdf[0].format === 'a3' && pdf[0].orientation === 'p' && pdf[1].saved === 'x.pdf', JSON.stringify(pdf[0]));
    check('exportPDF：auto → 寬圖橫向；未給選項 → a4 + 依比例（高圖直向）', pdf[2].orientation === 'l' && pdf[2].format === 'a4' && pdf[4].orientation === 'p' && pdf[4].format === 'a4', JSON.stringify([pdf[2], pdf[4]]));

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== export-header ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
