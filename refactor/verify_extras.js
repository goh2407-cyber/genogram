/**
 * 線上版延伸功能（DEMO）回歸：清單分頁、重大事件、畫面去識別化、隱藏暴力線、檢視模式。
 * 不連網（Word 匯出需下載程式庫，另以手動驗證）。
 */
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();

    const r = await page.evaluate(() => {
        const app = window.app;
        const ex = window.genogramExtras;
        const out = { hasExtras: !!ex };
        app.loadData({
            version: '1.1',
            persons: [
                { id: 'f', name: '王大明', gender: 'male', x: 300, y: 180, age: 45, notes: '敏感備註' },
                { id: 'm', name: '林小芳', gender: 'female', x: 420, y: 180, age: 42 },
                { id: 'c', name: '王小美', gender: 'female', x: 360, y: 300, age: 12, isIdentifiedPatient: true }
            ],
            relationships: [
                { id: 'r1', fromPersonId: 'f', toPersonId: 'm', type: 'married', date: '2010 結婚' },
                { id: 'r2', fromPersonId: 'f', toPersonId: 'c', type: 'parent-child' },
                { id: 'r3', fromPersonId: 'm', toPersonId: 'c', type: 'parent-child' },
                { id: 'r4', fromPersonId: 'f', toPersonId: 'c', type: 'physical-abuse' },
                { id: 'r5', fromPersonId: 'm', toPersonId: 'c', type: 'close' }
            ],
            events: [{ id: 'e1', year: '2019', text: '父母分居' }]
        });
        out.eventsLoaded = app.events.length === 1 && app.events[0].text === '父母分居';

        // 清單分頁
        document.getElementById('listTab').click();
        out.listVisible = !document.getElementById('listPanel').hidden;
        const counts = () => [...document.querySelectorAll('.list-seg-btn .list-count')].map(n => n.textContent).join(',');
        out.counts = counts(); // 3 人, 4 關係列（婚姻 + 親子一組 + 2 情感/暴力）
        const rows = () => [...document.querySelectorAll('#listPanel .list-row')].map(n => n.textContent);
        out.personRows = rows();
        ex.search.value = '小美'; ex.search.dispatchEvent(new Event('input'));
        out.searchRows = rows().length;
        ex.search.value = ''; ex.search.dispatchEvent(new Event('input'));
        document.querySelectorAll('#listPanel .list-row')[0].click();
        out.locateSelects = app.selectedPersonId === 'f';

        // 事件（獨立分頁）：新增 → 一次 undo 撤回；修改；刪除
        document.getElementById('eventsTab').click();
        out.formShown = !document.getElementById('eventsPanel').hidden && !ex.eventForm.hidden;
        const undoBefore = app.history.undoStack.length;
        // 年份＋內容兩欄 → 加入事件
        ex.evYear.value = '2021';
        ex.evText.value = '搬到台中';
        ex.evSubmit.click();
        const added = app.events[app.events.length - 1];
        out.eventAdded = app.events.length === 2 && app.history.undoStack.length === undoBefore + 1
            && added.year === '2021' && added.text === '搬到台中' && ex.evYear.value === '' && ex.evText.value === '';
        // 沒有內容不加入；年份可空白
        ex.evYear.value = '2030'; ex.evText.value = '  '; ex.submitEvent();
        out.emptyRejected = app.events.length === 2;
        ex.evYear.value = '';
        out.eventSorted = [...document.querySelectorAll('#eventsPanel .ev-row .list-year')].map(n => n.textContent).join(',') === '2019,2021';
        app.undo();
        out.eventUndo = app.events.length === 1;
        app.redo();
        out.eventRedo = app.events.length === 2;
        out.extraSaved = JSON.stringify(app.getDocumentExtra().events?.map(e => e.text)) === JSON.stringify(['父母分居', '搬到台中']);
        // 「改」：帶回上方表單 → 按鈕變「儲存修改」→ 儲存
        document.querySelectorAll('#eventsPanel .ev-edit')[1].click();
        out.editLoaded = ex.evYear.value === '2021' && ex.evText.value === '搬到台中'
            && ex.evSubmit.textContent === '儲存修改' && !ex.evCancel.hidden;
        ex.evYear.value = '2022'; ex.evText.value = '搬到高雄';
        ex.evSubmit.click();
        out.editSaved = app.events[1].year === '2022' && app.events[1].text === '搬到高雄' && app.events.length === 2
            && ex.evSubmit.textContent === '加入事件' && ex.evCancel.hidden;
        // 「刪」：可 undo
        document.querySelectorAll('#eventsPanel .ev-del')[1].click();
        out.deleted = app.events.length === 1;
        app.undo(); app.undo();
        out.deleteUndo = app.events.length === 2 && app.events[1].text === '搬到台中';

        // 事件卡：命中框、拉桿移動、存檔、重設、符合視窗邊界含卡片
        app.render();
        const evBox = app.canvas.textLabelBoxes.get('events:events');
        out.evBox = !!evBox && evBox.bounds.top > Math.max(...app.persons.map(p => p.y));
        app.clearAllSelections();
        app.labelEditingTarget = { kind: 'events', id: 'events' };
        const hEv = app.history.undoStack.length;
        app.adjustSelectedPersonLabel('right');
        out.evMoved = app.eventsLayout && app.eventsLayout.x > 0 && app.history.undoStack.length === hEv + 1;
        out.evSaved = JSON.stringify(app.getDocumentExtra().eventsLayout) === JSON.stringify(app.eventsLayout);
        const boundsMoved = app.canvas.getContentBounds(app.persons, app.relationships, [], [], app.viewOptions);
        app.eventsLayout = { x: 400, y: 0 }; app.render();
        const boundsFar = app.canvas.getContentBounds(app.persons, app.relationships, [], [], app.viewOptions);
        out.evBoundsFollow = boundsFar.maxX > boundsMoved.maxX + 300;
        document.getElementById('eventsTab').click();
        out.evResetBtn = !ex.resetEventsPosBtn.hidden;
        ex.resetEventsPosBtn.click();
        out.evReset = app.eventsLayout === null;
        app.undo(); out.evResetUndo = app.eventsLayout && app.eventsLayout.x === 400;
        app.eventsLayout = null; app.labelEditingTarget = null;

        // 畫面去識別化：只換畫面文字，資料與線條都不動
        const lineGeometry = () => JSON.stringify({
            rel: app.relationships.map(rel => app.canvas.getRelationshipPath(app.personMap.get(rel.fromPersonId),
                app.personMap.get(rel.toPersonId), rel, app.relationships)),
            fam: [...(app.canvas._familyRelationshipPaths || new Map()).entries()]
        });
        app.render();
        const linesBefore = lineGeometry();
        app.setViewOption('deidentifyScreen', true);
        out.deidLinesSame = lineGeometry() === linesBefore;
        out.deidCanvasNames = app.canvas._displayPerson(app.personMap.get('f')).name;
        out.deidDataKept = app.personMap.get('f').name === '王大明' && app.personMap.get('f').notes === '敏感備註';
        out.deidNoNotes = app.canvas._displayPerson(app.personMap.get('f')).notes === '' && app.canvas.eventsToDraw.length === 0;
        out.deidBanner = !document.querySelector('.deid-banner').hidden && document.body.classList.contains('screen-deidentified');
        document.querySelector('.list-seg-btn[data-list="persons"]').click();
        out.deidList = !rows().some(t => t.includes('王大明'));
        document.getElementById('quickDeidBtn').click();
        out.deidOffByButton = app.viewOptions.deidentifyScreen === false && app.canvas.displayOverride === null
            && app.canvas._displayPerson(app.personMap.get('f')).name === '王大明';

        // 隱藏暴力線：只影響顯示與匯出可見集合
        const visibleTypes = () => app.canvas.getVisibleExportData(app.persons, app.relationships, [], [], app.viewOptions).relationships.map(x => x.type).sort().join(',');
        out.typesAll = visibleTypes();
        app.setViewOption('showAbuseRelationships', false);
        out.typesNoAbuse = visibleTypes();
        out.legendNoAbuse = !app.canvas.getLegendRenderSections(app.viewOptions, null).some(s => s.id === 'special');
        out.abuseDataKept = app.relationships.some(x => x.type === 'physical-abuse');
        app.setViewOption('showAbuseRelationships', true);

        // 匯出含事件會變高；關掉事件或備註則不畫
        const size = url => new Promise(res => { const im = new Image(); im.onload = () => res(im.naturalHeight); im.src = url; });
        return Promise.all([
            size(app.canvas.exportToPNG(app.persons, app.relationships, [], [], true, false, 1, app.viewOptions, null)),
            size(app.canvas.exportToPNG(app.persons, app.relationships, [], [], false, false, 1, app.viewOptions, null))
        ]).then(([withEv, noNotes]) => { out.exportTaller = withEv > noNotes; return out; });
    });

    // 檢視模式：點人物不會選取、Esc 離開
    await page.evaluate(() => { window.app.clearAllSelections(); window.app.render(); document.getElementById('presentModeBtn').click(); });
    await page.waitForTimeout(150);
    const pres = await page.evaluate(() => {
        const app = window.app;
        const p = app.personMap.get('c');
        const rect = app.canvas.canvas.getBoundingClientRect();
        return {
            on: document.body.classList.contains('presentation-mode'),
            dockHidden: getComputedStyle(document.getElementById('canvasToolDock')).display === 'none',
            inspectorHidden: getComputedStyle(document.getElementById('inspectorPanel')).display === 'none',
            x: rect.left + p.x * app.canvas.scale + app.canvas.offsetX,
            y: rect.top + p.y * app.canvas.scale + app.canvas.offsetY
        };
    });
    await page.mouse.click(pres.x, pres.y);
    await page.keyboard.press('Delete');
    const afterClick = await page.evaluate(() => ({ sel: window.app.selectedPersonId, n: window.app.persons.length }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const exited = await page.evaluate(() => !document.body.classList.contains('presentation-mode')
        && getComputedStyle(document.getElementById('inspectorPanel')).display !== 'none');

    check('extras 已掛載', r.hasExtras);
    check('載入時帶入重大事件', r.eventsLoaded);
    check('清單分頁可開啟', r.listVisible);
    check('清單計數 人物3／關係4', r.counts === '3,4', r.counts);
    check('人物列依畫面順序、含案主標記', r.personRows.length === 3 && r.personRows[2].includes('案主'), JSON.stringify(r.personRows));
    check('搜尋只留符合者', r.searchRows === 1, String(r.searchRows));
    check('點清單列 = 選取該人物', r.locateSelects);
    check('事件獨立分頁顯示新增表單', r.formShown);
    check('新增事件進 Undo（一步）', r.eventAdded);
    check('事件依年份排序', r.eventSorted);
    check('事件 Undo／Redo', r.eventUndo && r.eventRedo);
    check('事件跟著存檔欄位', r.extraSaved);
    check('事件：沒有內容不加入', r.emptyRejected);
    check('事件：「改」帶回表單、儲存修改', r.editLoaded && r.editSaved);
    check('事件：「刪」、可 undo', r.deleted && r.deleteUndo);
    check('事件卡：繪製時記錄命中框、位於成員下方', r.evBox);
    check('事件卡：拉桿移動、一步 undo', r.evMoved);
    check('事件卡：位移跟著存檔', r.evSaved);
    check('事件卡：符合視窗／匯出邊界跟著卡片', r.evBoundsFollow);
    check('事件卡：面板重設位置鈕（有位移才顯示）、可 undo', r.evResetBtn && r.evReset && r.evResetUndo);
    check('畫面去識別化：畫布用代號', r.deidCanvasNames === '男1', r.deidCanvasNames);
    check('畫面去識別化：資料本身不動', r.deidDataKept);
    check('畫面去識別化：線條位置完全不變', r.deidLinesSame);
    check('畫面去識別化：不畫備註與事件', r.deidNoNotes);
    check('畫面去識別化：提示條與檔名隱藏', r.deidBanner);
    check('畫面去識別化：清單也不顯示真名', r.deidList);
    check('快捷鈕可關閉去識別化', r.deidOffByButton);
    check('隱藏暴力線：可見集合移除 physical-abuse、保留情感線', r.typesAll.includes('physical-abuse') && !r.typesNoAbuse.includes('physical-abuse') && r.typesNoAbuse.includes('close'), r.typesNoAbuse);
    check('隱藏暴力線：圖例不列暴力區', r.legendNoAbuse);
    check('隱藏暴力線：資料不刪', r.abuseDataKept);
    check('匯出含事件時圖較高', r.exportTaller);
    check('檢視模式：收起工具列與面板', pres.on && pres.dockHidden && pres.inspectorHidden);
    check('檢視模式：點人物不選取、Delete 不刪', afterClick.sel === null && afterClick.n === 3, JSON.stringify(afterClick));
    check('檢視模式：Esc 離開並恢復面板', exited);
    check('零 console error', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'RESULT OK (extras: list / events / de-identify / hide abuse / presentation)');
})().catch(err => { console.error(err); process.exit(1); });
