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
        app.selectPerson(target.id, { labelEditing: true });
        app.render();
        const geometry = app.canvas.getPersonLabelGeometry(target,
            { showNames: true, showNotes: true });
        const route = app.canvas.getMarriageRoute(left, right, marriage, app.relationships);
        return {
            geometry,
            coordinates: { x: target.x, y: target.y },
            routePoints: route.points,
            arrowButtons: document.querySelectorAll('[data-label-nudge]').length,
            hasKnob: Boolean(document.querySelector('#labelJoystickKnob')),
            knobLabel: document.querySelector('#labelJoystickKnob')?.getAttribute('aria-label'),
            knobTitle: document.querySelector('#labelJoystickKnob')?.getAttribute('title'),
            knobIsButton: document.querySelector('#labelJoystickKnob')?.tagName === 'BUTTON'
        };
    });
    check('default label remains at its original below zero-offset placement despite a crossing route',
        initial.geometry.placement.side === 'below'
            && initial.geometry.placement.offsetX === 0
            && initial.geometry.placement.offsetY === 0,
        JSON.stringify(initial.geometry.placement));
    check('label text selection exposes only a labelled joystick knob, no arrow buttons',
        initial.arrowButtons === 0
            && initial.hasKnob
            && initial.knobIsButton
            && Boolean(initial.knobLabel)
            && Boolean(initial.knobTitle),
        JSON.stringify(initial));

    const controlsAvailable = await page.locator('#labelJoystickKnob').count() > 0;
    // 方向鍵已移除，離散微調改由搖桿聚焦後按方向鍵完成
    const knobPress = key => page.locator('#labelJoystickKnob').press(key);
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
    if (controlsAvailable) await knobPress('ArrowUp');
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

    // 斜向移動改由中央搖桿拖曳達成：文字 1:1 跟著指標，放開後搖桿彈回中心
    const knobBox = controlsAvailable
        ? await page.locator('#labelJoystickKnob').boundingBox() : null;
    const dragBy = { x: 36, y: 48 };
    if (knobBox) {
        const originX = knobBox.x + knobBox.width / 2;
        const originY = knobBox.y + knobBox.height / 2;
        await page.mouse.move(originX, originY);
        await page.mouse.down();
        await page.mouse.move(originX + dragBy.x, originY + dragBy.y, { steps: 6 });
        const midDrag = await page.evaluate(() => ({
            transform: document.querySelector('#labelJoystickKnob').style.transform,
            dragging: window.app.labelJoystickDragging
        }));
        await page.mouse.up();
        const afterDrag = await page.evaluate(() => {
            const person = window.app.personMap.get('label-target');
            return {
                placement: person.labelPlacement,
                scale: window.app.canvas.scale,
                geometry: window.app.canvas.getPersonLabelGeometry(person),
                transform: document.querySelector('#labelJoystickKnob').style.transform,
                dragging: window.app.labelJoystickDragging
            };
        });
        check('dragging the joystick moves text diagonally and springs the knob back to centre',
            afterDrag.placement?.offsetX === Math.round(dragBy.x / afterDrag.scale)
                && afterDrag.placement?.offsetY === Math.round(-12 + dragBy.y / afterDrag.scale)
                && afterDrag.geometry.rows.every(row => row.x === afterDrag.geometry.rows[0].x)
                && midDrag.dragging === true
                && midDrag.transform !== ''
                && afterDrag.dragging === false
                && afterDrag.transform === '',
            JSON.stringify({ midDrag, afterDrag }));
    } else {
        check('dragging the joystick moves text diagonally and springs the knob back to centre',
            false, 'joystick knob not found');
    }

    // 拖外環可以把整個面板搬走，之後不再自動跟著文字錨點
    const popoverBox = await page.locator('.label-position-popover').boundingBox();
    if (popoverBox) {
        // 抓外環（避開中央搖桿）：面板上緣往下 8px 處
        const grabX = popoverBox.x + popoverBox.width / 2;
        const grabY = popoverBox.y + 8;
        await page.mouse.move(grabX, grabY);
        await page.mouse.down();
        await page.mouse.move(grabX + 120, grabY + 90, { steps: 6 });
        await page.mouse.up();
        const movedPanel = await page.evaluate(() => {
            const app = window.app;
            const popover = document.querySelector('.label-position-popover');
            const before = popover.getBoundingClientRect();
            const placement = app.personMap.get('label-target').labelPlacement;
            // 面板搬走後，文字微調不得把面板拉回自動位置
            app.adjustSelectedPersonLabel('right');
            const after = popover.getBoundingClientRect();
            return {
                manual: app.labelPopoverPlacement,
                textMoved: app.personMap.get('label-target').labelPlacement?.offsetX
                    !== (placement?.offsetX ?? 0),
                stayedPut: Math.round(before.left) === Math.round(after.left)
                    && Math.round(before.top) === Math.round(after.top),
                left: Math.round(before.left),
                top: Math.round(before.top)
            };
        });
        check('dragging the pad ring relocates the whole panel and it stays where it was dropped',
            movedPanel.manual?.personId === 'label-target'
                && Math.round(popoverBox.x) !== movedPanel.left
                && Math.round(popoverBox.y) !== movedPanel.top
                && movedPanel.textMoved === true
                && movedPanel.stayedPut === true,
            JSON.stringify({ popoverBox, movedPanel }));
    } else {
        check('dragging the pad ring relocates the whole panel and it stays where it was dropped',
            false, 'popover not found');
    }
    // 換人編輯時回到自動定位
    const autoAgain = await page.evaluate(() => {
        const app = window.app;
        app.selectPerson('label-left', { labelEditing: true });
        app.render();
        return {
            manualPersonId: app.labelPopoverPlacement?.personId,
            editing: app.labelEditingPersonId,
            usesManual: app.labelPopoverPlacement?.personId === app.labelEditingPersonId
        };
    });
    check('a different label falls back to automatic panel placement',
        autoAgain.editing === 'label-left' && autoAgain.usesManual === false,
        JSON.stringify(autoAgain));
    await page.evaluate(() => {
        window.app.labelPopoverPlacement = null;
        window.app.selectPerson('label-target', { labelEditing: true });
        window.app.render();
    });

    // 文字壓到面板底下時面板淡出讓路，移開後恢復（opacity 有 140ms 轉場，需等它收斂）
    const readFadeState = () => page.evaluate(() => {
        const app = window.app;
        const popover = document.querySelector('.label-position-popover');
        const canvasRect = document.querySelector('#genogramCanvas').getBoundingClientRect();
        const label = app.canvas.getPersonLabelGeometry(
            app.personMap.get('label-target'), app.viewOptions).bounds;
        return {
            behind: popover.classList.contains('is-behind-text'),
            opacity: Number(getComputedStyle(popover).opacity),
            labelRight: canvasRect.left + label.right * app.canvas.scale + app.canvas.offsetX,
            popoverLeft: popover.getBoundingClientRect().left
        };
    });
    const settleFade = () => page.waitForTimeout(260);
    await page.evaluate(() => window.app.setSelectedPersonLabelOffset(0, 0));
    await settleFade();
    const fadeClear = await readFadeState();
    // 把文字推到面板正下方
    await page.evaluate(gap => window.app.setSelectedPersonLabelOffset(
        gap / window.app.canvas.scale + 40, 0),
    fadeClear.popoverLeft - fadeClear.labelRight);
    await settleFade();
    const fadeCovered = await readFadeState();
    await page.evaluate(() => window.app.setSelectedPersonLabelOffset(0, 0));
    await settleFade();
    const fadeRestored = await readFadeState();
    check('the panel fades out only while the text sits underneath it',
        fadeClear.behind === false && fadeClear.opacity === 1
            && fadeCovered.behind === true && fadeCovered.opacity < 0.5
            && fadeRestored.behind === false && fadeRestored.opacity === 1,
        JSON.stringify({ fadeClear, fadeCovered, fadeRestored }));

    if (controlsAvailable) await page.locator('#labelJoystickKnob').click();
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

    if (controlsAvailable) await knobPress('ArrowUp');
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
        arrowButtons: document.querySelectorAll('[data-label-nudge]').length,
        controlsVisible: Boolean(document.querySelector('.label-position-popover')?.getClientRects().length),
        personFormVisible: Boolean(document.querySelector('#personForm')?.getClientRects().length),
        status: window.app.elements.statusBar.textContent
    }));
    check('clicking visible name text selects label editing without the quick-add ring',
        afterLabelClick.selectedPersonId === 'label-click-target'
            && afterLabelClick.labelEditingPersonId === 'label-click-target'
            && afterLabelClick.quickDrawCount === 0
            && afterLabelClick.arrowButtons === 0
            && afterLabelClick.controlsVisible
            && !afterLabelClick.personFormVisible
            && /文字旁/.test(afterLabelClick.status)
            && !/右側/.test(afterLabelClick.status),
        JSON.stringify(afterLabelClick));

    await page.mouse.move(labelClickFixture.quickParentScreen.x,
        labelClickFixture.quickParentScreen.y);
    const hiddenQuickCursor = await page.locator('#genogramCanvas').evaluate(canvas =>
        canvas.style.cursor);
    check('hidden quick-add positions do not expose a pointer cursor during label editing',
        hiddenQuickCursor !== 'pointer', hiddenQuickCursor);

    await page.evaluate(() => { window.__quickLabelDrawCount = 0; });
    await knobPress('ArrowRight');
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

    // 微調時面板必須留在原地（錨在未微調位置），只有文字與外框跟著移動
    const popoverAnchorDrift = await page.evaluate(() => {
        const readRects = () => {
            const popover = document.querySelector('.label-position-popover')
                .getBoundingClientRect();
            const outline = document.querySelector('.label-selection-outline')
                .getBoundingClientRect();
            return {
                popover: { left: Math.round(popover.left), top: Math.round(popover.top) },
                outline: { left: Math.round(outline.left), top: Math.round(outline.top) }
            };
        };
        const nudge = dir => window.app.adjustSelectedPersonLabel(dir);
        const before = readRects();
        nudge('down');
        nudge('right');
        const moved = readRects();
        nudge('up');
        nudge('left'); // 位移歸零回到 { offsetX: 12, offsetY: 0 }，不影響後續案例
        const restored = readRects();
        return {
            before,
            moved,
            restored,
            placement: window.app.personMap.get('label-click-target').labelPlacement
        };
    });
    check('nudging text keeps the position panel anchored while the text moves',
        popoverAnchorDrift.moved.popover.left === popoverAnchorDrift.before.popover.left
            && popoverAnchorDrift.moved.popover.top === popoverAnchorDrift.before.popover.top
            && popoverAnchorDrift.restored.popover.left === popoverAnchorDrift.before.popover.left
            && popoverAnchorDrift.restored.popover.top === popoverAnchorDrift.before.popover.top
            && (popoverAnchorDrift.moved.outline.left !== popoverAnchorDrift.before.outline.left
                || popoverAnchorDrift.moved.outline.top !== popoverAnchorDrift.before.outline.top)
            && popoverAnchorDrift.restored.outline.left === popoverAnchorDrift.before.outline.left
            && popoverAnchorDrift.restored.outline.top === popoverAnchorDrift.before.outline.top
            && popoverAnchorDrift.placement?.offsetX === 12
            && popoverAnchorDrift.placement?.offsetY === 0,
        JSON.stringify(popoverAnchorDrift));

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
        quickDrawCount: window.__quickLabelDrawCount,
        controlsVisible: Boolean(document.querySelector('.label-position-popover')?.getClientRects().length),
        personFormVisible: Boolean(document.querySelector('#personForm')?.getClientRects().length)
    }));
    check('clicking visible notes also enters label editing without the quick-add ring',
        afterNoteClick.selectedPersonId === 'label-click-target'
            && afterNoteClick.labelEditingPersonId === 'label-click-target'
            && afterNoteClick.quickDrawCount === 0
            && afterNoteClick.controlsVisible
            && !afterNoteClick.personFormVisible,
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
        quickDrawCount: window.__quickLabelDrawCount,
        controlsVisible: Boolean(document.querySelector('.label-position-popover')?.getClientRects().length),
        personFormVisible: Boolean(document.querySelector('#personForm')?.getClientRects().length)
    }));
    check('clicking the person symbol exits label editing and restores the quick-add ring',
        afterSymbolClick.selectedPersonId === 'label-click-target'
            && afterSymbolClick.labelEditingPersonId === null
            && afterSymbolClick.quickDrawCount > 0
            && !afterSymbolClick.controlsVisible
            && afterSymbolClick.personFormVisible,
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
