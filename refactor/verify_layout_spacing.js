/**
 * 排列間距（標準／寬鬆／更寬）：整張圖等比縮放＋格線倍率同步；輩分列索引不變；undo／存檔／載入／清空。
 */
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();

    const r = await page.evaluate(() => {
        const app = window.app, G = GenogramApp.GRID;
        app.loadData({ version: '1.1',
            persons: [
                { id: 'f', name: 'F', gender: 'male', x: 290, y: 180 }, { id: 'm', name: 'M', gender: 'female', x: 410, y: 180 },
                { id: 'c', name: 'C', gender: 'female', x: 350, y: 300, isIdentifiedPatient: true }
            ],
            relationships: [
                { id: 'r', fromPersonId: 'f', toPersonId: 'm', type: 'married' },
                { id: 'p1', fromPersonId: 'f', toPersonId: 'c', type: 'parent-child' }, { id: 'p2', fromPersonId: 'm', toPersonId: 'c', type: 'parent-child' }
            ],
            lifeCircles: [{ id: 'l', label: '圈', color: 'rgba(74,144,226,.15)', points: [{ x: 230, y: 120 }, { x: 470, y: 120 }, { x: 470, y: 360 }, { x: 230, y: 360 }] }],
            events: [{ id: 'e', year: '2020', text: 'x' }]
        });
        app.eventsLayout = { x: 100, y: 40 };
        const out = { base: [G.CELL_WIDTH, G.CELL_HEIGHT, G.MAX_DISTANCE], defaultSpacing: app.layoutSpacing };
        const gen0 = app.persons.map(p => app.getGenerationIndexByY(p.y));
        const h0 = app.history.undoStack.length;
        out.changed = app.setLayoutSpacing(1.25);
        out.grid125 = [G.CELL_WIDTH, G.CELL_HEIGHT, G.MAX_DISTANCE];
        out.pos125 = app.persons.map(p => [p.x, p.y]);
        out.genSame = JSON.stringify(app.persons.map(p => app.getGenerationIndexByY(p.y))) === JSON.stringify(gen0);
        out.rowY1 = app.getGenerationYByIndex(1);
        out.lc125 = app.lifeCircles[0].points[0];
        out.evLayout125 = app.eventsLayout;
        out.history = app.history.undoStack.length === h0 + 1;
        out.extra = app.getDocumentExtra().layoutSpacing;
        out.selectVal = document.getElementById('layoutSpacingSelect').value;
        out.sameNoop = app.setLayoutSpacing(1.25) === false;
        app.undo();
        out.undoGrid = [G.CELL_WIDTH, G.CELL_HEIGHT];
        out.undoPos = app.persons.map(p => [p.x, p.y]);
        out.undoExtra = app.getDocumentExtra().layoutSpacing;
        app.redo();
        out.redoGrid = G.CELL_WIDTH;
        // 存檔→載入：座標與倍率一起回來
        const data = JSON.parse(JSON.stringify({ version: '1.1', ...app.getState(), ...app.getDocumentExtra() }));
        app.loadData({ version: '1.1', persons: data.persons, relationships: data.relationships, lifeCircles: data.lifeCircles, events: data.events, layoutSpacing: 1.5 });
        out.loadGrid = G.CELL_WIDTH;
        app.loadData({ version: '1.1', persons: data.persons, relationships: data.relationships });
        out.loadDefault = G.CELL_WIDTH;
        app.setLayoutSpacing(1.5);
        app.persons = []; app.relationships = []; app.lifeCircles = []; app._syncPersonMap();
        app.applyGridSpacing(1);
        out.resetGrid = G.CELL_WIDTH;
        // 不合法倍率 → 標準
        out.normalize = [GenogramApp.normalizeLayoutSpacing(2), GenogramApp.normalizeLayoutSpacing('1.25'), GenogramApp.normalizeLayoutSpacing(null)];
        return out;
    });

    check('預設格線 120／120／120、倍率 1', JSON.stringify(r.base) === '[120,120,120]' && r.defaultSpacing === 1);
    check('切到寬鬆：格線 150／150／150', JSON.stringify(r.grid125) === '[150,150,150]', JSON.stringify(r.grid125));
    check('成員以格線原點等比放大 1.25（290→350, 180→210）', JSON.stringify(r.pos125) === JSON.stringify([[350, 210], [500, 210], [425, 360]]), JSON.stringify(r.pos125));
    check('輩分列索引不變、第 1 列 Y = 60+150', r.genSame && r.rowY1 === 210);
    check('生活圈頂點與記事卡位移一起縮放', r.lc125.x === 275 && r.lc125.y === 135 && r.evLayout125.x === 125 && r.evLayout125.y === 50, JSON.stringify([r.lc125, r.evLayout125]));
    check('一步 history；存檔欄位 layoutSpacing=1.25；下拉同步；同值不動', r.history && r.extra === 1.25 && r.selectVal === '1.25' && r.sameNoop);
    check('undo：格線與座標一起還原、存檔欄位消失；redo 回 150', JSON.stringify(r.undoGrid) === '[120,120]' && JSON.stringify(r.undoPos) === JSON.stringify([[290, 180], [410, 180], [350, 300]]) && r.undoExtra === undefined && r.redoGrid === 150);
    check('載入含 layoutSpacing 的檔 → 格線 180；無欄位的舊檔 → 120', r.loadGrid === 180 && r.loadDefault === 120);
    check('清空重設格線；不合法倍率一律標準', r.resetGrid === 120 && JSON.stringify(r.normalize) === '[1,1.25,1]');
    check('零 console error', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'RESULT OK (layout spacing)');
})().catch(err => { console.error(err); process.exit(1); });
