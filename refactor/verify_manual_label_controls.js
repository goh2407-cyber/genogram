const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();

    const initial = await page.evaluate(() => {
        const app = window.app;
        const left = new Person({ id: 'label-left', x: 280, y: 430, gender: 'male', name: '左' });
        const right = new Person({ id: 'label-right', x: 820, y: 610, gender: 'female', name: '右' });
        const target = new Person({
            id: 'label-target', x: 560, y: 520, gender: 'male', name: '文字姓名',
            notes: '第一行備註\n第二行備註'
        });
        const marriage = new Relationship({
            id: 'label-marriage', fromPersonId: left.id, toPersonId: right.id,
            type: 'married', routeMode: 'straight'
        });
        app.persons = [left, right, target];
        app.relationships = [marriage];
        app._syncPersonMap();
        app.selectPerson(target.id);
        app.render();
        const geometry = app.canvas.getPersonLabelGeometry(target,
            { showNames: true, showNotes: true });
        const route = app.canvas.getMarriageRoute(left, right, marriage, app.relationships);
        return {
            geometry,
            coordinates: { x: target.x, y: target.y },
            routePoints: route.points,
            controls: Array.from(document.querySelectorAll('[data-label-nudge]')).map(button => ({
                direction: button.dataset.labelNudge,
                ariaLabel: button.getAttribute('aria-label')
            })),
            hasReset: Boolean(document.querySelector('#resetPersonLabelPosition'))
        };
    });
    check('default label remains at its original below zero-offset placement despite a crossing route',
        initial.geometry.placement.side === 'below'
            && initial.geometry.placement.offsetX === 0
            && initial.geometry.placement.offsetY === 0,
        JSON.stringify(initial.geometry.placement));
    check('person panel exposes eight accessible text-position nudge buttons plus reset',
        initial.controls.length === 8
            && initial.controls.every(control => control.direction && control.ariaLabel)
            && initial.hasReset,
        JSON.stringify(initial.controls));

    const controlsAvailable = await page.locator('#labelNudgeUp').count() > 0
        && await page.locator('#labelNudgeDownRight').count() > 0
        && await page.locator('#resetPersonLabelPosition').count() > 0;
    const beforeUp = await page.evaluate(() => {
        const app = window.app;
        const person = app.personMap.get('label-target');
        const relationship = app.relationships[0];
        return {
            geometry: app.canvas.getPersonLabelGeometry(person, { showNames: true, showNotes: true }),
            coordinates: { x: person.x, y: person.y },
            routePoints: app.canvas.getMarriageRoute(
                app.personMap.get(relationship.fromPersonId), app.personMap.get(relationship.toPersonId),
                relationship, app.relationships).points
        };
    });
    if (controlsAvailable) await page.locator('#labelNudgeUp').click();
    const afterUp = controlsAvailable ? await page.evaluate(() => {
        const app = window.app;
        const canvas = app.canvas;
        const person = app.personMap.get('label-target');
        const relationship = app.relationships[0];
        const exportGeometries = [];
        const originalDrawPersonText = canvas.drawPersonText;
        canvas.drawPersonText = function(candidate, options) {
            if (candidate.id === person.id) {
                exportGeometries.push(this.getPersonLabelGeometry(candidate, options));
            }
            return originalDrawPersonText.call(this, candidate, options);
        };
        const exportDataUrl = canvas.exportToPNG(app.persons, app.relationships,
            [], [], true, false, 1, app.viewOptions);
        canvas.drawPersonText = originalDrawPersonText;
        return {
            placement: person.labelPlacement,
            geometry: app.canvas.getPersonLabelGeometry(person, { showNames: true, showNotes: true }),
            coordinates: { x: person.x, y: person.y },
            routePoints: app.canvas.getMarriageRoute(
                app.personMap.get(relationship.fromPersonId), app.personMap.get(relationship.toPersonId),
                relationship, app.relationships).points,
            saved: person.toJSON().labelPlacement,
            exportGeometry: exportGeometries[0],
            exportDataUrl
        };
    }) : null;
    check('up nudge changes only the persisted label geometry',
        afterUp?.placement?.offsetX === 0 && afterUp?.placement?.offsetY === -12
            && JSON.stringify(afterUp.coordinates) === JSON.stringify(beforeUp.coordinates)
            && JSON.stringify(afterUp.routePoints) === JSON.stringify(beforeUp.routePoints)
            && JSON.stringify(afterUp.saved) === JSON.stringify(afterUp.placement)
            && afterUp.exportDataUrl.startsWith('data:image/png;base64,')
            && JSON.stringify(afterUp.exportGeometry.rows) === JSON.stringify(afterUp.geometry.rows),
        JSON.stringify(afterUp));
    check('a multi-row text block moves together and stays horizontal',
        afterUp?.geometry.rows.length === 3
            && afterUp.geometry.rows.every((row, index, rows) => row.x === rows[0].x
                && (index === 0 || Math.abs(row.y - rows[index - 1].y
                    - rows[index - 1].lineHeight) < 0.000001)),
        JSON.stringify(afterUp?.geometry.rows));

    if (controlsAvailable) await page.locator('#labelNudgeDownRight').click();
    const afterDownRight = controlsAvailable ? await page.evaluate(() => {
        const person = window.app.personMap.get('label-target');
        return { placement: person.labelPlacement, geometry: window.app.canvas.getPersonLabelGeometry(person) };
    }) : null;
    check('diagonal nudge adjusts both label offsets without rotating text',
        afterDownRight?.placement?.offsetX === 12 && afterDownRight?.placement?.offsetY === 0
            && afterDownRight.geometry.rows.every(row => row.x === afterDownRight.geometry.rows[0].x),
        JSON.stringify(afterDownRight));

    if (controlsAvailable) await page.locator('#resetPersonLabelPosition').click();
    const afterReset = controlsAvailable ? await page.evaluate(() => {
        const person = window.app.personMap.get('label-target');
        const screen = window.app.canvas.getPersonLabelGeometry(person,
            { showNames: true, showNotes: true });
        const exportBounds = window.app.canvas.getContentBounds(window.app.persons,
            window.app.relationships, [], [], { showNames: true, showNotes: true });
        return { placement: person.labelPlacement, screen, exportBounds };
    }) : null;
    check('reset returns the exact default placement and export includes the same label block',
        afterReset?.placement === null
            && afterReset.screen.placement.offsetX === 0 && afterReset.screen.placement.offsetY === 0
            && afterReset.exportBounds.minX <= afterReset.screen.bounds.left
            && afterReset.exportBounds.maxX >= afterReset.screen.bounds.right
            && afterReset.exportBounds.minY <= afterReset.screen.bounds.top
            && afterReset.exportBounds.maxY >= afterReset.screen.bounds.bottom,
        JSON.stringify(afterReset));

    if (controlsAvailable) await page.locator('#labelNudgeUp').click();
    const undoRedo = controlsAvailable ? await page.evaluate(() => {
        const app = window.app;
        const placement = () => app.personMap.get('label-target').labelPlacement
            || { offsetX: 0, offsetY: 0 };
        const beforeUndo = placement();
        app.undo();
        const afterUndo = placement();
        app.redo();
        const afterRedo = placement();
        const loaded = new Person({ id: 'legacy', x: 10, y: 10 });
        return {
            beforeUndo, afterUndo, afterRedo,
            legacy: app.canvas.getPersonLabelGeometry(loaded).placement
        };
    }) : { beforeUndo: null, afterUndo: null, afterRedo: null, legacy: null };
    check('Undo and Redo restore each manual text placement operation',
        undoRedo.beforeUndo?.offsetY === -12 && undoRedo.afterUndo?.offsetY === 0
            && undoRedo.afterRedo?.offsetY === -12,
        JSON.stringify(undoRedo));
    check('legacy Person data without text placement remains backward compatible at zero offset',
        undoRedo.legacy?.offsetX === 0 && undoRedo.legacy?.offsetY === 0,
        JSON.stringify(undoRedo.legacy));

    const labelClickFixture = await page.evaluate(() => {
        const app = window.app;
        const target = new Person({
            id: 'label-click-target', x: 560, y: 390, gender: 'female',
            name: '直接點這段姓名', notes: '也可以點備註'
        });
        app.persons = [target];
        app.relationships = [];
        app.households = [];
        app.lifeCircles = [];
        app._syncPersonMap();
        app.currentTool = 'select';
        app.selectedPersonId = null;
        app.selectedPersonIds = [];
        app.viewOptions = { ...app.viewOptions, showNames: true, showNotes: true };
        app.canvas.scale = 1;
        app.canvas.offsetX = 0;
        app.canvas.offsetY = 0;
        window.__quickLabelDrawCount = 0;
        const original = app.canvas.drawQuickAddButtons.bind(app.canvas);
        app.canvas.drawQuickAddButtons = person => {
            window.__quickLabelDrawCount++;
            return original(person);
        };
        app.render();
        const geometry = app.canvas.getPersonLabelGeometry(target, app.viewOptions);
        const nameRow = geometry.rows.find(row => row.kind === 'name');
        const noteRow = geometry.rows.find(row => row.kind === 'note');
        const rect = document.querySelector('#genogramCanvas').getBoundingClientRect();
        return {
            labelScreen: {
                x: rect.left + (nameRow.bounds.left + nameRow.bounds.right) / 2,
                y: rect.top + (nameRow.bounds.top + nameRow.bounds.bottom) / 2
            },
            hiddenLabelScreen: {
                x: rect.left + (noteRow.bounds.left + noteRow.bounds.right) / 2,
                y: rect.top + (noteRow.bounds.top + noteRow.bounds.bottom) / 2
            },
            hiddenLabelWorld: {
                x: (noteRow.bounds.left + noteRow.bounds.right) / 2,
                y: (noteRow.bounds.top + noteRow.bounds.bottom) / 2
            },
            quickParentScreen: {
                x: rect.left + target.x,
                y: rect.top + target.y + GenogramCanvas.QUICK_BUTTONS.parent.offsetY
            },
            symbolScreen: { x: rect.left + target.x, y: rect.top + target.y },
            blankScreen: { x: rect.right - 80, y: rect.bottom - 80 }
        };
    });
    await page.mouse.click(labelClickFixture.labelScreen.x, labelClickFixture.labelScreen.y);
    const afterLabelClick = await page.evaluate(() => ({
        selectedPersonId: window.app.selectedPersonId,
        labelEditingPersonId: window.app.labelEditingPersonId,
        quickDrawCount: window.__quickLabelDrawCount,
        controls: document.querySelectorAll('[data-label-nudge]').length
    }));
    check('clicking visible name text selects label editing without the quick-add ring',
        afterLabelClick.selectedPersonId === 'label-click-target'
            && afterLabelClick.labelEditingPersonId === 'label-click-target'
            && afterLabelClick.quickDrawCount === 0
            && afterLabelClick.controls === 8,
        JSON.stringify(afterLabelClick));

    await page.mouse.move(labelClickFixture.quickParentScreen.x,
        labelClickFixture.quickParentScreen.y);
    const hiddenQuickCursor = await page.locator('#genogramCanvas').evaluate(canvas =>
        canvas.style.cursor);
    check('hidden quick-add positions do not expose a pointer cursor during label editing',
        hiddenQuickCursor !== 'pointer', hiddenQuickCursor);

    await page.evaluate(() => { window.__quickLabelDrawCount = 0; });
    await page.locator('#labelNudgeRight').click();
    const afterLabelNudge = await page.evaluate(() => ({
        labelEditingPersonId: window.app.labelEditingPersonId,
        placement: window.app.personMap.get('label-click-target').labelPlacement,
        quickDrawCount: window.__quickLabelDrawCount
    }));
    check('label nudge preserves label editing context and keeps the quick-add ring hidden',
        afterLabelNudge.labelEditingPersonId === 'label-click-target'
            && afterLabelNudge.placement?.offsetX === 12
            && afterLabelNudge.placement?.offsetY === 0
            && afterLabelNudge.quickDrawCount === 0,
        JSON.stringify(afterLabelNudge));

    await page.mouse.click(labelClickFixture.blankScreen.x, labelClickFixture.blankScreen.y);
    const afterBlankClick = await page.evaluate(() => ({
        selectedPersonId: window.app.selectedPersonId,
        labelEditingPersonId: window.app.labelEditingPersonId
    }));
    check('clicking blank canvas exits label editing context',
        afterBlankClick.selectedPersonId === null
            && afterBlankClick.labelEditingPersonId === null,
        JSON.stringify(afterBlankClick));

    await page.evaluate(() => { window.__quickLabelDrawCount = 0; });
    await page.mouse.click(labelClickFixture.hiddenLabelScreen.x,
        labelClickFixture.hiddenLabelScreen.y);
    const afterNoteClick = await page.evaluate(() => ({
        selectedPersonId: window.app.selectedPersonId,
        labelEditingPersonId: window.app.labelEditingPersonId,
        quickDrawCount: window.__quickLabelDrawCount
    }));
    check('clicking visible notes also enters label editing without the quick-add ring',
        afterNoteClick.selectedPersonId === 'label-click-target'
            && afterNoteClick.labelEditingPersonId === 'label-click-target'
            && afterNoteClick.quickDrawCount === 0,
        JSON.stringify(afterNoteClick));

    await page.evaluate(() => { window.__quickLabelDrawCount = 0; });
    await page.locator('#connectTool').click();
    const afterConnectTool = await page.evaluate(() => ({
        tool: window.app.currentTool,
        labelEditingPersonId: window.app.labelEditingPersonId,
        suppressQuickAddButtons: window.app.canvas.suppressQuickAddButtons,
        quickDrawCount: window.__quickLabelDrawCount
    }));
    await page.locator('#householdTool').click();
    await page.mouse.move(labelClickFixture.quickParentScreen.x,
        labelClickFixture.quickParentScreen.y);
    const householdQuickCursor = await page.locator('#genogramCanvas').evaluate(canvas =>
        canvas.style.cursor);
    await page.locator('#selectTool').click();
    const afterSelectTool = await page.evaluate(() => ({
        tool: window.app.currentTool,
        labelEditingPersonId: window.app.labelEditingPersonId,
        suppressQuickAddButtons: window.app.canvas.suppressQuickAddButtons,
        quickDrawCount: window.__quickLabelDrawCount
    }));
    check('tool switching exits label editing and repaints the correct quick-add visibility',
        afterConnectTool.tool === 'connect'
            && afterConnectTool.labelEditingPersonId === null
            && afterConnectTool.suppressQuickAddButtons === true
            && afterConnectTool.quickDrawCount === 0
            && householdQuickCursor !== 'pointer'
            && afterSelectTool.tool === 'select'
            && afterSelectTool.labelEditingPersonId === null
            && afterSelectTool.suppressQuickAddButtons === false
            && afterSelectTool.quickDrawCount > 0,
        JSON.stringify({ afterConnectTool, householdQuickCursor, afterSelectTool }));

    await page.mouse.click(labelClickFixture.hiddenLabelScreen.x,
        labelClickFixture.hiddenLabelScreen.y);

    await page.evaluate(() => { window.__quickLabelDrawCount = 0; });
    await page.mouse.click(labelClickFixture.symbolScreen.x, labelClickFixture.symbolScreen.y);
    const afterSymbolClick = await page.evaluate(() => ({
        selectedPersonId: window.app.selectedPersonId,
        labelEditingPersonId: window.app.labelEditingPersonId,
        quickDrawCount: window.__quickLabelDrawCount
    }));
    check('clicking the person symbol exits label editing and restores the quick-add ring',
        afterSymbolClick.selectedPersonId === 'label-click-target'
            && afterSymbolClick.labelEditingPersonId === null
            && afterSymbolClick.quickDrawCount > 0,
        JSON.stringify(afterSymbolClick));

    await page.evaluate(({ x, y }) => {
        const app = window.app;
        app.viewOptions.showNames = false;
        app.viewOptions.showNotes = false;
        app.selectedPersonId = null;
        app.labelEditingPersonId = null;
        app.render();
        window.__hiddenLabelHit = app.getPersonLabelAt?.(x, y) || null;
    }, labelClickFixture.hiddenLabelWorld);
    await page.mouse.click(labelClickFixture.hiddenLabelScreen.x,
        labelClickFixture.hiddenLabelScreen.y);
    const afterHiddenClick = await page.evaluate(() => ({
        selectedPersonId: window.app.selectedPersonId,
        labelEditingPersonId: window.app.labelEditingPersonId,
        hiddenLabelHit: window.__hiddenLabelHit
    }));
    check('hidden name and notes have no label hit target and blank click clears editing',
        afterHiddenClick.hiddenLabelHit === null
            && afterHiddenClick.selectedPersonId === null
            && afterHiddenClick.labelEditingPersonId === null,
        JSON.stringify(afterHiddenClick));
    check('manual label controls cause no browser errors', errors.length === 0, errors.join('\n'));

    await finish(browser, passes, failures, 'Manual label controls contract passed.');
})();
