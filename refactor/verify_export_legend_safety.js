/** 匯出圖例與尺寸／非同步錯誤契約；不配置大型真實畫布。 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const sandbox = { console, setTimeout, clearTimeout,
    document: { addEventListener() {} }, window: { jspdf: {} } };
vm.createContext(sandbox);
for (const file of ['relationship.js', 'canvas.js', 'canvas-export.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), sandbox, { filename: file });
}
const { Canvas, App } = vm.runInContext('({ Canvas: GenogramCanvas, App: GenogramApp })', sandbox);
const canvas = Object.create(Canvas.prototype);
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS | ' + name); }
const types = data => canvas.getUsedExportLegendTypes(canvas.getVisibleExportData([], data.relationships || [], data.households || [], [], data.view || {}));
const labels = used => plain(canvas.getLegendRenderSections({}, used).flatMap(section => section.items.map(item => item.label)));
check('empty and unknown-only diagrams reserve no legend space', () => {
    for (const used of [new Set(), new Set(['unknown'])]) {
        assert.deepEqual(plain(canvas.measureExportLegend({}, used)), { width: 0, height: 0 });
    }
});
check('child link kinds are selected independently with biological default', () => {
    for (const [linkType, label] of [[undefined, '親生子女'], ['adopted', '收養子女'], ['foster', '寄養子女']]) {
        assert.deepEqual(labels(types({ relationships: [{ type: 'parent-child', linkType }] })), [label]);
    }
});
check('all mode retains 36 relationship samples and household symbol', () => {
    assert.equal(labels(null).length, 37);
    assert.equal(labels(null).at(-1), '同住圈');
});
check('hidden layers do not contribute legend samples', () => {
    const used = types({ relationships: [{ type: 'admiration' }, { type: 'abuse' }], households: [{}],
        view: { showHouseholds: false, showEmotionalRelationships: false } });
    assert.deepEqual(labels(used), ['虐待']);
    assert.deepEqual(labels(types({ households: [{}] })), ['同住圈']);
});
check('measurement encloses every row and symbol in its assigned column', () => {
    for (const used of [null, new Set(['married']), new Set(['household']), new Set(['admiration', 'married', 'household'])]) {
        const sections = canvas.getLegendRenderSections({}, used);
        const measured = canvas.measureExportLegend({}, used);
        const heights = ['left', 'right'].map(column => sections.filter(section => section.column === column)
            .reduce((height, section) => height + (section.items.length + 1.5) * 26, 32));
        assert.equal(measured.height, Math.max(...heights));
        const rects = [];
        const original = canvas.roundRect;
        canvas.roundRect = (ctx, x, y, width, height) => rects.push({ width, height });
        const context = new Proxy({}, { get: (target, key) => target[key] || (() => {}), set: (target, key, value) => (target[key] = value, true) });
        const oldSection = canvas.drawLegendSection;
        canvas.drawLegendSection = () => {};
        canvas.drawExportLegend(context, 0, 0, {}, used);
        canvas.drawLegendSection = oldSection;
        canvas.roundRect = original;
        assert.deepEqual(rects[0], plain(measured));
    }
});
check('scale guard bounds both edges and rounded pixel area', () => {
    for (const [width, height, scale] of [[400, 300, 2], [20000, 200, 2], [18000.3, 18000.7, 3], [16370, 16380, 2], [1000000, 1, 3], [694574.6752269566, 694950.122788921, 3], [826476.6481541097, 826436.6923201829, 3]]) {
        const actual = canvas._getExportScale(scale, width, height);
        assert.ok(actual > 0 && actual <= Math.min(scale, 16384 / Math.max(width, height), Math.sqrt(268000000 / (width * height))));
        assert.ok(Math.ceil(width * actual) <= 16384 && Math.ceil(height * actual) <= 16384);
        assert.ok(Math.ceil(width * actual) * Math.ceil(height * actual) <= 268000000);
        assert.equal(canvas.lastExportEffectiveScale, actual);
    }
    assert.equal(canvas._getExportScale(2, 400, 300), 2);
    for (const bad of [0, -1, NaN, Infinity]) assert.throws(() => canvas._getExportScale(bad, 400, 300));
});
check('PNG and JPEG use measured legend, ceil dimensions, and reject failed encoding', () => {
    const c = Object.create(Canvas.prototype);
    const context = new Proxy({}, { get: () => () => {}, set: () => true });
    let image;
    sandbox.document.createElement = () => (image = { getContext: () => context, toDataURL: () => 'data:image/png;base64,AA==' });
    Object.assign(c, { _captureExportDerivedState: () => ({}), _restoreExportDerivedState() {},
        _calculateContentBounds: () => ({ minX: 0, minY: 0, width: 400.2, height: 300.2 }),
        drawFamilies() {}, drawPersonForExport() {}, drawExportLegend() {} });
    for (const format of ['PNG', 'JPEG']) {
        const args = format === 'PNG' ? [[], [], [], [], false, true, 2] : [[], [], [], [], 0.92, false, true, 2];
        c['exportTo' + format](...args);
        assert.equal(image.width, 801);
        assert.equal(image.height, 601);
        sandbox.document.createElement = () => ({ getContext: () => context, toDataURL: () => 'data:,' });
        assert.throws(() => c['exportTo' + format](...args), /無法產生匯出圖片/);
        sandbox.document.createElement = () => (image = { getContext: () => context, toDataURL: () => 'data:image/png;base64,AA==' });
    }
});
(async () => {
    const app = Object.create(App.prototype);
    const controls = { exportLegendAll: { checked: true }, exportShowLegend: { checked: true } };
    sandbox.document.getElementById = id => controls[id];
    sandbox.document.getElementsByName = () => [{ checked: true, value: '2' }];
    const prefs = new Map();
    sandbox.localStorage = { getItem: key => prefs.get(key), setItem: (key, value) => prefs.set(key, value) };
    const statuses = [];
    const downloads = [];
    Object.assign(app, { persons: [{}], relationships: [], personMap: new Map(), viewOptions: {},
        canvas: { exportToPNG: () => 'data:image/png;base64,AA==', exportToJPEG: () => 'data:image/jpeg;base64,AA==' },
        storage: Object.fromEntries(['PNG','JPEG','SVG','PDF'].map(format => ['export' + format, () => downloads.push(format)])),
        updateStatus: (text, kind) => statuses.push({ text, kind }), waitForCurrentCanvasFonts: async () => {},
        getExportDataset: () => ({ persons: [{}], personMap: app.personMap }), readExportHeaderSettings: () => ({ header: null, pdfOptions: {} }) });
    sandbox.Image = class { set src(value) { this.onerror(); } };
    for (const format of ['svg', 'pdf']) {
        statuses.length = 0;
        await app.handleExportFormat(format);
        check(format + ' image decoding failure reaches common failure path without success', () => {
            assert.deepEqual(statuses, [{ text: '匯出失敗：無法讀取匯出圖片', kind: 'error' }]);
            assert.equal(downloads.length, 0);
        });
    }
    sandbox.Image = class { constructor() { this.width = 100; this.height = 60; } set src(value) { setTimeout(() => this.onload(), 5); } };
    for (const format of ['svg', 'pdf']) {
        statuses.length = 0;
        const pending = app.handleExportFormat(format);
        assert.equal(statuses.length, 0);
        await pending;
        check(format + ' success waits for image load and storage completion', () => {
            assert.equal(downloads.at(-1), format.toUpperCase());
            assert.equal(statuses.at(-1).kind, 'success');
        });
    }
    app.storage.exportPDF = () => { throw new Error('save failed'); };
    statuses.length = 0;
    await app.handleExportFormat('pdf');
    check('storage exceptions after asynchronous decoding reach common error path', () => {
        assert.deepEqual(statuses, [{ text: '匯出失敗：save failed', kind: 'error' }]);
    });
    app.canvas.exportToPNG = (...args) => { assert.equal(args.at(-1), true); app.canvas.lastExportEffectiveScale = 0.75; return 'data:image/png;base64,AA=='; };
    statuses.length = 0;
    await app.handleExportFormat('png');
    check('full legend preference is persisted, threaded, and downscale is reported', () => {
        assert.equal(app._readExportPrefs().legendAll, true);
        assert.equal(statuses.at(-1).text, '圖太大，已自動降為 0.75 倍解析度');
        app._syncExportHeaderFields();
        assert.equal(controls.exportLegendAll.checked, true);
        controls.exportLegendAll.checked = false;
        controls.exportLegendAll.onchange();
        app._syncExportHeaderFields();
        assert.equal(controls.exportLegendAll.checked, false);
    });
    for (const format of ['png', 'jpeg', 'svg', 'pdf']) {
        app.canvas.exportToPNG = app.canvas.exportToJPEG = () => null;
        statuses.length = 0;
        await app.handleExportFormat(format);
        check(format + ' missing image reports failure without success', () => {
            assert.deepEqual(statuses, [{ text: '匯出失敗：沒有內容可匯出', kind: 'error' }]);
        });
    }
    delete sandbox.window.jspdf;
    statuses.length = 0;
    await app.handleExportFormat('pdf');
    check('missing PDF module cannot report success', () => {
        assert.deepEqual(statuses, [{ text: '匯出失敗：PDF 匯出模組尚未載入，請稍後再試', kind: 'error' }]);
    });
    console.log(`RESULT OK (${passed} export safety checks)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
