/**
 * 文字大小（標準／大／更大／特大）：畫布字級、undo、存檔欄位、載入、暫存還原、新畫布沿用偏好、下拉同步。
 */
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();

    const r = await page.evaluate(() => {
        const app = window.app, cv = app.canvas;
        try { localStorage.removeItem(GenogramApp.TEXT_SCALE_PREF_KEY); } catch (_) { /* ignore */ }
        app.loadData({ version: '1.1',
            persons: [
                { id: 'f', name: '王大明', gender: 'male', x: 290, y: 180, notes: '工程師' },
                { id: 'm', name: '李小美', gender: 'female', x: 410, y: 180 },
                { id: 'c', name: '王小華', gender: 'female', x: 350, y: 300, isIdentifiedPatient: true }
            ],
            relationships: [
                { id: 'r', fromPersonId: 'f', toPersonId: 'm', type: 'married', date: '2010 結婚' },
                { id: 'p1', fromPersonId: 'f', toPersonId: 'c', type: 'parent-child' }, { id: 'p2', fromPersonId: 'm', toPersonId: 'c', type: 'parent-child' }
            ],
            households: [{ id: 'h', ids: ['f', 'm', 'c'], label: '同住' }],
            lifeCircles: [{ id: 'l', label: '學校', color: 'rgba(74,144,226,.15)', points: [{ x: 230, y: 120 }, { x: 470, y: 120 }, { x: 470, y: 360 }, { x: 230, y: 360 }] }]
        });
        const out = { base: [app.textScale, cv.fontSize, cv.textStyle.relSize, cv.labelFontSize] };
        const person = app.personMap.get('f');
        const geo = () => cv.getPersonLabelGeometry(person, { showNames: true, showNotes: true });
        const g0 = geo();
        out.nameH0 = g0.rows[0].height;
        out.nameW0 = g0.rows[0].width;
        app.render();
        const relBox0 = cv.textLabelBoxes.get('rel:r').bounds;
        const lcBox0 = cv.textLabelBoxes.get('lc:l').bounds;
        const hhBox0 = cv.textLabelBoxes.get('house:h').bounds;
        const hhBottom = () => Math.max(...cv.getHouseholdBounds(app.households[0], app.persons, app.relationships).hullPoints.map(pt => pt.y));
        out.hhBottom0 = hhBottom();
        const h0 = app.history.undoStack.length;

        out.changed = app.setTextScale(1.6);
        out.big = [app.textScale, cv.fontSize, cv.textStyle.relSize, cv.labelFontSize];
        const g1 = geo();
        out.nameH1 = g1.rows[0].height;
        out.nameW1 = g1.rows[0].width;
        out.noteH1 = g1.rows[1].height;
        app.render();
        const relBox1 = cv.textLabelBoxes.get('rel:r').bounds;
        const lcBox1 = cv.textLabelBoxes.get('lc:l').bounds;
        const hhBox1 = cv.textLabelBoxes.get('house:h').bounds;
        out.relGrew = (relBox1.bottom - relBox1.top) > (relBox0.bottom - relBox0.top) && (relBox1.right - relBox1.left) > (relBox0.right - relBox0.left);
        out.lcGrew = (lcBox1.bottom - lcBox1.top) > (lcBox0.bottom - lcBox0.top);
        out.hhGrew = (hhBox1.bottom - hhBox1.top) > (hhBox0.bottom - hhBox0.top);
        out.hhBottom1 = hhBottom();
        cv.lodScale = 0.5; out.lod16 = cv.lodNameFactor(); cv.lodScale = 1;
        out.nameBottom1 = Math.max(...app.persons.map(p => cv.getPersonLabelGeometry(p, { showNames: true, showNotes: false }).bounds.bottom));
        out.posSame = JSON.stringify(app.persons.map(p => [p.x, p.y])) === JSON.stringify([[290, 180], [410, 180], [350, 300]]);
        out.history = app.history.undoStack.length === h0 + 1;
        out.dirty = app.isDirty === true;
        out.extra = app.getDocumentExtra().textScale;
        out.selectVal = document.getElementById('textScaleSelect').value;
        out.pref = localStorage.getItem(GenogramApp.TEXT_SCALE_PREF_KEY);
        out.sameNoop = app.setTextScale(1.6) === false;

        app.undo();
        out.undo = [app.textScale, cv.fontSize, document.getElementById('textScaleSelect').value];
        out.undoExtra = app.getDocumentExtra().textScale;
        app.redo();
        out.redo = cv.fontSize;

        // 存檔 → 載入：欄位帶回來；storage.migrate 保留欄位
        const data = JSON.parse(JSON.stringify({ version: '1.1', ...app.getState(), ...app.getDocumentExtra() }));
        out.migrated = app.storage.migrate(data).textScale;
        app.loadData({ version: '1.1', persons: data.persons, relationships: data.relationships, textScale: 1.2 });
        out.load12 = [app.textScale, cv.fontSize];
        // 沒有欄位的舊檔 → 標準（檔案優先，不套偏好）
        app.loadData({ version: '1.1', persons: data.persons, relationships: data.relationships });
        out.loadOld = [app.textScale, cv.fontSize];
        // 不合法值 → 標準
        app.loadData({ version: '1.1', persons: data.persons, relationships: data.relationships, textScale: 9 });
        out.loadBad = app.textScale;

        // 暫存還原：文字大小、重大事件、排列間距一起回來
        app.setTextScale(1.4);
        app.events = [{ id: 'e1', year: '2020', text: '搬家' }];
        clearTimeout(app.autoSaveTimer); app.autoSaveTimer = null;
        app.storage.autoSave(app.persons, app.relationships, app.households, app.lifeCircles, {}, app.getDocumentExtra());
        app.persons = []; app._syncPersonMap(); app.relationships = []; app.events = [];
        app.applyTextScale(1);
        app.loadAutoSave();
        out.restore = [app.textScale, cv.fontSize, app.events.length, app.persons.length];

        out.normalize = [GenogramApp.normalizeTextScale('1.2'), GenogramApp.normalizeTextScale(2), GenogramApp.normalizeTextScale(null)];
        return out;
    });

    check('預設：標準 1、姓名 15px、關係線 13px、圈名 13px', JSON.stringify(r.base) === '[1,15,13,13]', JSON.stringify(r.base));
    check('切到特大：姓名 24px、關係線 21px、圈名 21px', r.changed && JSON.stringify(r.big) === '[1.6,24,21,21]', JSON.stringify(r.big));
    check('姓名框高度與寬度放大、備註跟著放大', r.nameH1 === 24 && r.nameH0 === 15 && r.nameW1 > r.nameW0 * 1.4 && r.noteH1 > 15, JSON.stringify([r.nameH0, r.nameH1, r.nameW0, r.nameW1, r.noteH1]));
    check('關係線文字、生活圈名稱、同住圈名稱的命中框一起變大', r.relGrew && r.lcGrew && r.hhGrew, JSON.stringify([r.relGrew, r.lcGrew, r.hhGrew]));
    check('成員座標不動', r.posSame);
    check('縮小檢視時 LOD 姓名放大不與特大疊加', r.lod16 === 1, String(r.lod16));
    check('同住圈外框往下多包放大的字高，姓名不壓框線', r.hhBottom1 > r.hhBottom0 && r.hhBottom1 >= r.nameBottom1, JSON.stringify([r.hhBottom0, r.hhBottom1, r.nameBottom1]));
    check('一步 history、標記未儲存、存檔欄位 textScale=1.6、下拉同步、記成偏好、同值不動',
        r.history && r.dirty && r.extra === 1.6 && r.selectVal === '1.6' && r.pref === '1.6' && r.sameNoop,
        JSON.stringify([r.history, r.dirty, r.extra, r.selectVal, r.pref, r.sameNoop]));
    check('undo 回標準（下拉、字級、存檔欄位消失）；redo 回 24px',
        JSON.stringify(r.undo) === '[1,15,"1"]' && r.undoExtra === undefined && r.redo === 24, JSON.stringify([r.undo, r.undoExtra, r.redo]));
    check('storage.migrate 保留 textScale；載入 1.2 → 18px', r.migrated === 1.6 && JSON.stringify(r.load12) === '[1.2,18]', JSON.stringify([r.migrated, r.load12]));
    check('沒有欄位的舊檔 → 標準；不合法值 → 標準', JSON.stringify(r.loadOld) === '[1,15]' && r.loadBad === 1, JSON.stringify([r.loadOld, r.loadBad]));
    check('重新整理後從暫存還原：文字大小與重大事件都在', JSON.stringify(r.restore) === '[1.4,21,1,3]', JSON.stringify(r.restore));
    check('normalizeTextScale', JSON.stringify(r.normalize) === '[1.2,1,1]', JSON.stringify(r.normalize));

    // 新畫布沿用偏好：重開頁面、沒有暫存時套用上次選的大小
    await page.evaluate(() => { const app = window.app; app.isLoading = true; clearTimeout(app.autoSaveTimer); app.storage.autoSave = () => {}; localStorage.removeItem(window.app.storage.localStorageKey); localStorage.setItem(GenogramApp.TEXT_SCALE_PREF_KEY, '1.2'); });
    await page.reload();
    await page.waitForFunction(() => window.app && window.app.canvas);
    await page.waitForTimeout(100);
    const fresh = await page.evaluate(() => [window.app.textScale, window.app.canvas.fontSize, document.getElementById('textScaleSelect').value]);
    check('新畫布（無暫存）沿用上次選的「大」', JSON.stringify(fresh) === '[1.2,18,"1.2"]', JSON.stringify(fresh));

    // 匯出 PNG 也用放大的字（同一個 canvas 物件）
    const exp = await page.evaluate(async () => {
        const app = window.app;
        app.loadData({ version: '1.1', persons: [{ id: 'a', name: '測試', gender: 'male', x: 200, y: 200 }], relationships: [], textScale: 1.6 });
        await app.canvasFontReady;
        const url = app.canvas.exportToPNG ? app.canvas.exportToPNG(app.persons, app.relationships, [], [], true) : null;
        return { ok: typeof url === 'string' && url.startsWith('data:image/png'), fontAfter: app.canvas.fontSize };
    }).catch(e => ({ ok: false, err: String(e) }));
    check('匯出成功、匯出後畫布字級維持 24px', exp.ok && exp.fontAfter === 24, JSON.stringify(exp));

    check('零 console error', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'RESULT OK (text scale)');
})().catch(err => { console.error(err); process.exit(1); });
