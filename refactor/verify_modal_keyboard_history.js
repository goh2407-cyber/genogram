const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();
    await page.focus('#addPerson');
    await page.click('#addPerson');
    const modal = page.locator('#genderModal');
    const first = modal.locator('button:not([disabled])').first();
    const last = modal.locator('button:not([disabled])').last();
    await last.focus();
    await page.keyboard.press('Tab');
    check('Tab wraps within the top modal', await first.evaluate(node => node === document.activeElement));
    await first.focus();
    await page.keyboard.press('Shift+Tab');
    check('Shift+Tab wraps backward within the top modal', await last.evaluate(node => node === document.activeElement));
    await page.keyboard.press('Escape');
    check('Escape closes only the top modal', await modal.evaluate(node => !node.classList.contains('active')));
    check('Escape restores the modal trigger focus', await page.evaluate(() => document.activeElement?.id === 'addPerson'));

    const editableCoverage = await page.evaluate(() => {
        const editor = document.createElement('div');
        editor.setAttribute('contenteditable', '');
        const child = document.createElement('span');
        editor.appendChild(child);
        document.body.appendChild(editor);
        const result = window.app.isEditableTarget(child);
        editor.remove();
        return result;
    });
    check('contenteditable descendants are treated as editable targets', editableCoverage);

    const setup = await page.evaluate(() => {
        const app = window.app;
        app.history.clear();
        app.persons = [new Person({ id: 'edit', x: 300, y: 260, name: '原名', age: 0 })];
        app._syncPersonMap();
        app.relationships = []; app.households = []; app.lifeCircles = [];
        app.selectPerson('edit');
        return app.history.getUndoCount();
    });
    check('fixture starts with empty history', setup === 0, String(setup));

    const name = page.locator('#personName');
    await name.focus();
    await page.locator('#personAge').focus();
    check('focus-only property sessions do not create history',
        await page.evaluate(() => window.app.history.getUndoCount() === 0));
    await name.focus();
    await name.press('End');
    await page.keyboard.type('甲乙');
    const historyWhileTyping = await page.evaluate(() => window.app.history.getUndoCount());
    check('typing does not push one history entry per keystroke', historyWhileTyping === 0,
        String(historyWhileTyping));
    await page.keyboard.press('Delete');
    check('Delete in a text field does not delete graph items',
        await page.evaluate(() => window.app.persons.length === 1));
    await page.keyboard.press('Control+z');
    // Playwright dispatches the two CJK characters as separate native edit units in Chromium.
    await page.keyboard.press('Control+z');
    check('Ctrl+Z in a text field stays native', await name.inputValue() === '原名');
    check('native text undo does not consume App history',
        await page.evaluate(() => window.app.history.getUndoCount() === 0));

    await page.keyboard.type('新名稱');
    await page.locator('#canvasContainer').click({ position: { x: 30, y: 80 } });
    const committed = await page.evaluate(() => ({
        name: window.app.personMap.get('edit').name,
        undo: window.app.history.getUndoCount()
    }));
    check('blur commits one property history transaction',
        committed.name === '原名新名稱' && committed.undo === 1, JSON.stringify(committed));
    await page.evaluate(() => {
        window.app.undo();
        window.app.selectPerson('edit');
    });
    check('one App Undo restores the full field edit',
        await page.evaluate(() => window.app.personMap.get('edit').name === '原名'));

    await page.click('#personDeceased');
    check('a discrete checkbox change commits one App history entry',
        await page.evaluate(() => window.app.personMap.get('edit').isDeceased
            && window.app.history.getUndoCount() === 1));
    await page.evaluate(() => window.app.undo());
    check('one App Undo restores a discrete checkbox change',
        await page.evaluate(() => !window.app.personMap.get('edit').isDeceased));

    await page.click('#personDeceased');
    await page.click('#personDeceased');
    check('repeated changes while a checkbox stays focused each commit once',
        await page.evaluate(() => !window.app.personMap.get('edit').isDeceased
            && window.app.history.getUndoCount() === 2));
    await page.evaluate(() => {
        window.app.undo();
        window.app.undo();
    });

    await page.evaluate(() => {
        const app = window.app;
        const person = app.personMap.get('edit');
        person.medical.leftHalf = 'none';
        app.history.clear();
        app.selectPerson('edit');
    });
    await page.selectOption('#medLeftHalf', 'filled');
    const medicalSelectChange = await page.evaluate(() => ({
        value: window.app.personMap.get('edit').medical.leftHalf,
        undo: window.app.history.getUndoCount()
    }));
    check('a medical select change commits exactly one App history entry',
        medicalSelectChange.value === 'filled' && medicalSelectChange.undo === 1,
        JSON.stringify(medicalSelectChange));
    await page.evaluate(() => window.app.undo());
    check('one App Undo restores the original medical select value',
        await page.evaluate(() => window.app.personMap.get('edit').medical.leftHalf === 'none'));

    await page.evaluate(() => {
        const app = window.app;
        const person = app.personMap.get('edit');
        person.medical.isSmoker = false;
        app.history.clear();
        app.selectPerson('edit');
    });
    await page.click('#medSmoker');
    const medicalCheckboxChange = await page.evaluate(() => ({
        checked: window.app.personMap.get('edit').medical.isSmoker,
        undo: window.app.history.getUndoCount()
    }));
    check('a medical checkbox change commits exactly one App history entry',
        medicalCheckboxChange.checked && medicalCheckboxChange.undo === 1,
        JSON.stringify(medicalCheckboxChange));
    await page.evaluate(() => window.app.undo());
    check('one App Undo restores the original medical checkbox value',
        await page.evaluate(() => window.app.personMap.get('edit').medical.isSmoker === false));

    const medicalSnapshotDetached = await page.evaluate(() => {
        const medical = { leftHalf: 'none', isSmoker: false };
        const person = new Person({ id: 'detached-medical', medical });
        const serialized = person.toJSON();
        const restored = Person.fromJSON(serialized);
        const clone = restored.clone();
        clone.medical.isSmoker = true;
        restored.medical.leftHalf = 'striped';
        medical.leftHalf = 'filled';
        return {
            detached: serialized.medical !== medical && serialized.medical.leftHalf === 'none',
            flat: Object.values(person.medical).every(value => value === null || typeof value !== 'object'),
            roundTrip: restored.medical.leftHalf === 'striped',
            sourceDetached: restored.medical !== serialized.medical
                && serialized.medical.leftHalf === 'none',
            cloneDetached: clone.medical !== restored.medical
                && clone.medical.isSmoker === true && restored.medical.isSmoker === false
        };
    });
    check('Person serialization detaches the flat medical object',
        medicalSnapshotDetached.detached && medicalSnapshotDetached.flat,
        JSON.stringify(medicalSnapshotDetached));
    check('medical round-trip stays value-correct and clone stays detached',
        medicalSnapshotDetached.roundTrip && medicalSnapshotDetached.cloneDetached,
        JSON.stringify(medicalSnapshotDetached));
    check('mutating a restored Person cannot mutate its serialized source',
        medicalSnapshotDetached.sourceDetached, JSON.stringify(medicalSnapshotDetached));

    await page.click('#helpBtn');
    await page.keyboard.press('Delete');
    check('background delete shortcut is blocked while modal is open',
        await page.evaluate(() => window.app.persons.length === 1));
    const transientCleanup = await page.evaluate(() => {
        const app = window.app;
        app.dragGuides = { x: { pos: 300 } };
        app.canvas.dragGuides = app.dragGuides;
        app.undo();
        return {
            modalActive: document.getElementById('helpModal').classList.contains('active'),
            appGuides: app.dragGuides,
            canvasGuides: app.canvas.dragGuides
        };
    });
    check('programmatic Undo clears modal and stale drawing guides',
        !transientCleanup.modalActive && transientCleanup.appGuides === null
            && transientCleanup.canvasGuides === null,
        JSON.stringify(transientCleanup));
    const relationshipCleanup = await page.evaluate(() => {
        const app = window.app;
        app.closeHelpModal();
        const title = app.elements.relationshipModal.querySelector('.modal-title');
        const swap = document.getElementById('swapRelationshipDirection');
        title.textContent = '修改關係類型';
        swap.style.display = '';
        app.editingRelationshipId = 'stale-editor';
        app.modalManager.open(app.elements.relationshipModal);
        app.undo();
        app.showRelationshipModal();
        const result = {
            title: title.textContent,
            swapDisplay: swap.style.display,
            editingRelationshipId: app.editingRelationshipId
        };
        app.closeRelationshipModal();
        return result;
    });
    check('history reset clears relationship-editor presentation state',
        relationshipCleanup.title === '選擇關係類型'
            && relationshipCleanup.swapDisplay === 'none'
            && relationshipCleanup.editingRelationshipId === null,
        JSON.stringify(relationshipCleanup));
    await page.evaluate(() => {
        const app = window.app;
        const person = app.personMap.get('edit');
        app.history.clear();
        person.name = '原名';
        person.x = 700;
        app.originalBeforePreview = { edit: { x: 300, y: person.y } };
        app.originalLifeCirclesBeforePreview = {};
        app.isPreviewingLayout = true;
        app.selectPerson('edit');
    });
    const previewName = page.locator('#personName');
    await previewName.focus();
    const previewOnFocus = await page.evaluate(() => ({
        previewing: window.app.isPreviewingLayout,
        x: window.app.personMap.get('edit').x
    }));
    check('starting a property edit cancels temporary layout preview coordinates',
        !previewOnFocus.previewing && previewOnFocus.x === 300, JSON.stringify(previewOnFocus));
    await previewName.press('End');
    await page.keyboard.type('預覽');
    await page.evaluate(() => window.app.undo());
    const previewUndo = await page.evaluate(() => ({
        name: window.app.personMap.get('edit').name,
        x: window.app.personMap.get('edit').x
    }));
    check('property Undo cannot reapply cancelled preview coordinates',
        previewUndo.name === '原名' && previewUndo.x === 300, JSON.stringify(previewUndo));

    const previewLoad = await page.evaluate(() => {
        const app = window.app;
        app.history.clear();
        app.persons = [new Person({ id: 'preview-load', x: 700, y: 260, name: 'Before load' })];
        app._syncPersonMap();
        app.relationships = []; app.households = []; app.lifeCircles = [];
        app.originalBeforePreview = { 'preview-load': { x: 300, y: 260 } };
        app.originalLifeCirclesBeforePreview = {};
        app.isPreviewingLayout = true;
        app.loadData({ persons: [{ id: 'loaded-only', x: 500, y: 260, name: 'Loaded' }] });
        const afterLoad = {
            previewing: app.isPreviewingLayout,
            ids: app.persons.map(person => person.id),
            undo: app.history.getUndoCount()
        };
        app.undo();
        return {
            afterLoad,
            afterUndo: app.persons.map(person => ({ id: person.id, x: person.x }))
        };
    });
    check('load cancels preview before snapshot and one Undo restores committed coordinates',
        !previewLoad.afterLoad.previewing && previewLoad.afterLoad.undo === 1
            && previewLoad.afterUndo.length === 1
            && previewLoad.afterUndo[0].id === 'preview-load'
            && previewLoad.afterUndo[0].x === 300,
        JSON.stringify(previewLoad));

    const previewRelationshipModal = await page.evaluate(() => {
        const app = window.app;
        app.history.clear();
        app.persons = [
            new Person({ id: 'pra', x: 700, y: 260, name: 'A' }),
            new Person({ id: 'prb', x: 900, y: 260, name: 'B' })
        ];
        app._syncPersonMap();
        app.relationships = [new Relationship({
            id: 'preview-rel', fromPersonId: 'pra', toPersonId: 'prb', type: 'married'
        })];
        app.originalBeforePreview = {
            pra: { x: 300, y: 260 }, prb: { x: 500, y: 260 }
        };
        app.originalLifeCirclesBeforePreview = {};
        app.isPreviewingLayout = true;
        app.editingRelationshipId = 'preview-rel';
        app.showRelationshipEditModal();
        const result = {
            previewing: app.isPreviewingLayout,
            xs: app.persons.map(person => person.x),
            modalActive: app.elements.relationshipModal.classList.contains('active')
        };
        app.closeRelationshipModal();
        return result;
    });
    check('relationship edit modal cancels preview before mutation is possible',
        !previewRelationshipModal.previewing
            && previewRelationshipModal.xs.join(',') === '300,500'
            && previewRelationshipModal.modalActive,
        JSON.stringify(previewRelationshipModal));

    const previewRoute = await page.evaluate(() => {
        const app = window.app;
        app.history.clear();
        const rel = app.relationships.find(item => item.id === 'preview-rel');
        app.personMap.get('pra').x = 700;
        app.personMap.get('prb').x = 900;
        app.originalBeforePreview = {
            pra: { x: 300, y: 260 }, prb: { x: 500, y: 260 }
        };
        app.originalLifeCirclesBeforePreview = {};
        app.isPreviewingLayout = true;
        app.setRouteModeById('preview-rel', 'over');
        const afterRoute = {
            previewing: app.isPreviewingLayout,
            xs: app.persons.map(person => person.x),
            route: rel.routeMode,
            undo: app.history.getUndoCount()
        };
        app.undo();
        const restored = app.relationships.find(item => item.id === 'preview-rel');
        return {
            afterRoute,
            afterUndo: {
                xs: app.persons.map(person => person.x),
                route: restored.routeMode || 'auto'
            }
        };
    });
    check('route mutation snapshots committed coordinates, not preview coordinates',
        !previewRoute.afterRoute.previewing
            && previewRoute.afterRoute.xs.join(',') === '300,500'
            && previewRoute.afterRoute.route === 'over'
            && previewRoute.afterRoute.undo === 1
            && previewRoute.afterUndo.xs.join(',') === '300,500'
            && previewRoute.afterUndo.route === 'auto',
        JSON.stringify(previewRoute));

    await page.evaluate(() => {
        const app = window.app;
        app.history.clear();
        app.persons = [
            new Person({ id: 'ra', x: 280, y: 260, name: 'A' }),
            new Person({ id: 'rb', x: 520, y: 260, name: 'B' })
        ];
        app._syncPersonMap();
        app.relationships = [new Relationship({
            id: 'route-edit', fromPersonId: 'ra', toPersonId: 'rb',
            type: 'married', date: '舊日期', routeMode: 'auto'
        })];
        app.households = []; app.lifeCircles = [];
        app.selectRelationship('route-edit');
    });
    await page.locator('#relationshipDate').fill('新日期');
    await page.evaluate(() => window.app.setRouteModeById('route-edit', 'over'));
    const routeCommitted = await page.evaluate(() => {
        const app = window.app;
        const rel = app.relationships.find(item => item.id === 'route-edit');
        return { date: rel.date, route: rel.routeMode, undo: app.history.getUndoCount() };
    });
    check('focused relationship edit commits before route history',
        routeCommitted.date === '新日期' && routeCommitted.route === 'over' && routeCommitted.undo === 2,
        JSON.stringify(routeCommitted));
    await page.evaluate(() => window.app.undo());
    const routeUndo = await page.evaluate(() => {
        const rel = window.app.relationships.find(item => item.id === 'route-edit');
        return { date: rel.date, route: rel.routeMode };
    });
    check('first Undo reverts route only',
        routeUndo.date === '新日期' && (routeUndo.routeMode || routeUndo.route || 'auto') === 'auto',
        JSON.stringify(routeUndo));
    await page.evaluate(() => window.app.undo());
    const propertyUndo = await page.evaluate(() => {
        const rel = window.app.relationships.find(item => item.id === 'route-edit');
        return { date: rel.date, route: rel.routeMode || 'auto' };
    });
    check('second Undo reverts property edit without resurrection',
        propertyUndo.date === '舊日期' && propertyUndo.route === 'auto', JSON.stringify(propertyUndo));

    await page.evaluate(() => {
        const app = window.app;
        app.history.clear();
        const rel = app.relationships.find(item => item.id === 'route-edit');
        rel.date = '舊日期'; rel.routeMode = 'auto';
        rel.fromPersonId = 'ra'; rel.toPersonId = 'rb';
        app.selectRelationship('route-edit');
    });
    await page.locator('#relationshipDate').fill('交換日期');
    await page.evaluate(() => window.app.swapRelationshipDirectionById('route-edit'));
    await page.evaluate(() => window.app.undo());
    const swapUndo = await page.evaluate(() => {
        const rel = window.app.relationships.find(item => item.id === 'route-edit');
        return { date: rel.date, from: rel.fromPersonId, to: rel.toPersonId };
    });
    check('first Undo reverts swap but preserves the focused property edit',
        swapUndo.date === '交換日期' && swapUndo.from === 'ra' && swapUndo.to === 'rb',
        JSON.stringify(swapUndo));
    await page.evaluate(() => window.app.undo());
    const swapPropertyUndo = await page.evaluate(() => {
        const rel = window.app.relationships.find(item => item.id === 'route-edit');
        return { date: rel.date, from: rel.fromPersonId, to: rel.toPersonId };
    });
    check('second Undo reverts property after swap without endpoint resurrection',
        swapPropertyUndo.date === '舊日期' && swapPropertyUndo.from === 'ra' && swapPropertyUndo.to === 'rb',
        JSON.stringify(swapPropertyUndo));

    const multiSelectionHistory = await page.evaluate(() => {
        const app = window.app;
        app.history.clear();
        app.persons = [new Person({ id: 'current-only', x: 500, y: 260, name: 'Current' })];
        app._syncPersonMap();
        app.relationships = []; app.households = []; app.lifeCircles = [];
        app.selectedPersonId = null;
        app.selectedRelationshipId = null;
        app.selectedHouseholdId = null;
        app.selectedLifeCircleId = null;
        app.selectedPersonIds = ['prior-only', 'current-only'];
        app.history.pushState({
            persons: [new Person({ id: 'prior-only', x: 300, y: 260, name: 'Prior' }).toJSON()],
            relationships: [], households: [], lifeCircles: []
        });
        app.undo();
        const afterUndo = {
            persons: app.persons.map(person => person.id),
            selected: [...app.selectedPersonIds],
            valid: app.selectedPersonIds.every(id => app.personMap.has(id))
        };
        app.redo();
        const afterRedo = {
            persons: app.persons.map(person => person.id),
            selected: [...app.selectedPersonIds],
            valid: app.selectedPersonIds.every(id => app.personMap.has(id)),
            bounds: app.getMultiSelectionBounds()
        };
        app.deleteSelected();
        return {
            afterUndo,
            afterRedo,
            afterDelete: app.persons.map(person => person.id)
        };
    });
    check('Undo filters multi-selection IDs against the restored personMap',
        multiSelectionHistory.afterUndo.valid
            && JSON.stringify(multiSelectionHistory.afterUndo.selected) === JSON.stringify(['prior-only']),
        JSON.stringify(multiSelectionHistory));
    check('Redo removes stale multi-selection IDs and ghost follow-up actions are inert',
        multiSelectionHistory.afterRedo.valid
            && multiSelectionHistory.afterRedo.selected.length === 0
            && multiSelectionHistory.afterRedo.bounds === null
            && JSON.stringify(multiSelectionHistory.afterDelete) === JSON.stringify(['current-only']),
        JSON.stringify(multiSelectionHistory));

    const setupEmptySpaceGroupDrag = async historyPositions => page.evaluate(positions => {
        const app = window.app;
        app.history.clear();
        app.setTool('select');
        app.persons = [
            new Person({ id: 'group-a', x: 300, y: 260, name: 'Group A' }),
            new Person({ id: 'group-b', x: 420, y: 260, name: 'Group B' })
        ];
        app._syncPersonMap();
        app.relationships = []; app.households = []; app.lifeCircles = [];
        app.selectedPersonId = null;
        app.selectedRelationshipId = null;
        app.selectedHouseholdId = null;
        app.selectedLifeCircleId = null;
        app.selectedPersonIds = ['group-a', 'group-b'];
        if (positions) {
            app.history.pushState({
                persons: positions.map((x, index) => new Person({
                    id: index === 0 ? 'group-a' : 'group-b',
                    x, y: 260, name: index === 0 ? 'Group A' : 'Group B'
                }).toJSON()),
                relationships: [], households: [], lifeCircles: []
            });
        }
        app.updatePropertyPanel();
        app.render();
        const bounds = app.getMultiSelectionBounds();
        const point = { x: (bounds.x1 + bounds.x2) / 2, y: (bounds.y1 + bounds.y2) / 2 };
        const rect = app.canvas.canvas.getBoundingClientRect();
        return {
            x: point.x * app.canvas.scale + app.canvas.offsetX + rect.left,
            y: point.y * app.canvas.scale + app.canvas.offsetY + rect.top,
            emptySpace: app.getPersonAt(point.x, point.y) === null
                && app.isPointInsideMultiSelection(point.x, point.y)
        };
    }, historyPositions);
    const getGroupPositions = () => page.evaluate(() => ['group-a', 'group-b'].map(id => {
        const person = window.app.personMap.get(id);
        return person ? { id, x: person.x, y: person.y } : null;
    }));

    const historyGroupStart = await setupEmptySpaceGroupDrag([180, 300]);
    check('group-drag fixture targets empty space inside the multi-selection bounds',
        historyGroupStart.emptySpace, JSON.stringify(historyGroupStart));
    await page.mouse.move(historyGroupStart.x, historyGroupStart.y);
    await page.mouse.down();
    await page.mouse.move(historyGroupStart.x + 80, historyGroupStart.y + 20, { steps: 5 });
    const historyGroupPartial = await getGroupPositions();
    const historyGroupUndo = await page.evaluate(() => {
        const app = window.app;
        app.undo();
        return {
            positions: ['group-a', 'group-b'].map(id => {
                const person = app.personMap.get(id);
                return person ? { id, x: person.x, y: person.y } : null;
            }),
            dragging: app.canvas.isDragging,
            pointerId: app.activePointerId,
            snapshot: app.dragStartSnapshot,
            undo: app.history.getUndoCount(),
            redo: app.history.getRedoCount()
        };
    });
    await page.mouse.up();
    const historyGroupRedo = await page.evaluate(() => {
        const app = window.app;
        app.redo();
        return {
            positions: ['group-a', 'group-b'].map(id => {
                const person = app.personMap.get(id);
                return person ? { id, x: person.x, y: person.y } : null;
            }),
            dragging: app.canvas.isDragging,
            pointerId: app.activePointerId,
            undo: app.history.getUndoCount(),
            redo: app.history.getRedoCount()
        };
    });
    check('mid-group-drag Undo and Redo restore committed states, never partial positions',
        historyGroupPartial.some((person, index) => person.x !== [300, 420][index])
            && JSON.stringify(historyGroupUndo.positions.map(person => person.x)) === JSON.stringify([180, 300])
            && !historyGroupUndo.dragging && historyGroupUndo.pointerId === null
            && historyGroupUndo.snapshot === null
            && JSON.stringify(historyGroupRedo.positions.map(person => person.x)) === JSON.stringify([300, 420])
            && !historyGroupRedo.dragging && historyGroupRedo.pointerId === null,
        JSON.stringify({ historyGroupPartial, historyGroupUndo, historyGroupRedo }));

    const emptyGroupStart = await setupEmptySpaceGroupDrag(null);
    await page.mouse.move(emptyGroupStart.x, emptyGroupStart.y);
    await page.mouse.down();
    await page.mouse.move(emptyGroupStart.x + 80, emptyGroupStart.y + 20, { steps: 5 });
    const emptyGroupPartial = await getGroupPositions();
    const emptyGroupUndo = await page.evaluate(() => {
        const app = window.app;
        app.undo();
        return {
            positions: ['group-a', 'group-b'].map(id => {
                const person = app.personMap.get(id);
                return person ? { id, x: person.x, y: person.y } : null;
            }),
            dragging: app.canvas.isDragging,
            pointerId: app.activePointerId,
            snapshot: app.dragStartSnapshot,
            undo: app.history.getUndoCount(),
            redo: app.history.getRedoCount()
        };
    });
    await page.mouse.up();
    const emptyGroupAfterPointerUp = await page.evaluate(() => ({
        positions: ['group-a', 'group-b'].map(id => window.app.personMap.get(id).x),
        undo: window.app.history.getUndoCount(),
        redo: window.app.history.getRedoCount()
    }));
    check('empty-history mid-group-drag Undo restores every member without creating history',
        emptyGroupPartial.some((person, index) => person.x !== [300, 420][index])
            && JSON.stringify(emptyGroupUndo.positions.map(person => person.x)) === JSON.stringify([300, 420])
            && !emptyGroupUndo.dragging && emptyGroupUndo.pointerId === null
            && emptyGroupUndo.snapshot === null
            && emptyGroupUndo.undo === 0 && emptyGroupUndo.redo === 0
            && JSON.stringify(emptyGroupAfterPointerUp.positions) === JSON.stringify([300, 420])
            && emptyGroupAfterPointerUp.undo === 0 && emptyGroupAfterPointerUp.redo === 0,
        JSON.stringify({ emptyGroupPartial, emptyGroupUndo, emptyGroupAfterPointerUp }));

    const completedGroupStart = await setupEmptySpaceGroupDrag(null);
    await page.mouse.move(completedGroupStart.x, completedGroupStart.y);
    await page.mouse.down();
    await page.mouse.move(completedGroupStart.x + 80, completedGroupStart.y + 20, { steps: 5 });
    await page.mouse.up();
    const completedGroup = await page.evaluate(() => ({
        positions: ['group-a', 'group-b'].map(id => window.app.personMap.get(id).x),
        undo: window.app.history.getUndoCount(),
        redo: window.app.history.getRedoCount(),
        snapshot: window.app.dragStartSnapshot
    }));
    await page.evaluate(() => window.app.undo());
    const completedGroupUndo = await page.evaluate(() => ({
        positions: ['group-a', 'group-b'].map(id => window.app.personMap.get(id).x),
        undo: window.app.history.getUndoCount(),
        redo: window.app.history.getRedoCount()
    }));
    check('a completed empty-space group drag creates one transaction and one Undo restores every member',
        completedGroup.positions.some((x, index) => x !== [300, 420][index])
            && completedGroup.undo === 1 && completedGroup.redo === 0
            && completedGroup.snapshot === null
            && JSON.stringify(completedGroupUndo.positions) === JSON.stringify([300, 420])
            && completedGroupUndo.undo === 0 && completedGroupUndo.redo === 1,
        JSON.stringify({ completedGroup, completedGroupUndo }));

    const dragStart = await page.evaluate(() => {
        const app = window.app;
        app.history.clear();
        app.persons = [new Person({ id: 'drag-edit', x: 300, y: 260, name: 'Drag' })];
        app._syncPersonMap();
        app.relationships = []; app.households = []; app.lifeCircles = [];
        app.selectedRelationshipId = null;
        app.setTool('select');
        app.saveState();
        const person = app.personMap.get('drag-edit');
        person.x = 400;
        app.selectPerson('drag-edit');
        app.render();
        const rect = app.canvas.canvas.getBoundingClientRect();
        return {
            x: person.x * app.canvas.scale + app.canvas.offsetX + rect.left,
            y: person.y * app.canvas.scale + app.canvas.offsetY + rect.top
        };
    });
    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + 80, dragStart.y + 20, { steps: 5 });
    const midDrag = await page.evaluate(() => ({
        dragging: window.app.canvas.isDragging,
        pointerId: window.app.activePointerId,
        hasSnapshot: Boolean(window.app.dragStartSnapshot)
    }));
    check('mid-drag fixture owns an active pointer and snapshot',
        midDrag.dragging && midDrag.pointerId !== null && midDrag.hasSnapshot, JSON.stringify(midDrag));
    const afterMidDragUndo = await page.evaluate(() => {
        const app = window.app;
        app.undo();
        const pointerId = app.activePointerId;
        return {
            x: app.personMap.get('drag-edit').x,
            dragging: app.canvas.isDragging,
            panning: app.canvas.isPanning,
            pointerId,
            captured: pointerId !== null && app.canvas.canvas.hasPointerCapture(pointerId),
            dragStartSnapshot: app.dragStartSnapshot,
            dragVirtual: app.dragVirtual,
            undo: app.history.getUndoCount(),
            redo: app.history.getRedoCount()
        };
    });
    check('Undo terminates every active drag and pointer-capture state',
        afterMidDragUndo.x === 300 && !afterMidDragUndo.dragging && !afterMidDragUndo.panning
            && afterMidDragUndo.pointerId === null && !afterMidDragUndo.captured
            && afterMidDragUndo.dragStartSnapshot === null && afterMidDragUndo.dragVirtual === null,
        JSON.stringify(afterMidDragUndo));
    await page.mouse.up();
    const afterStalePointerUp = await page.evaluate(() => ({
        undo: window.app.history.getUndoCount(),
        redo: window.app.history.getRedoCount(),
        x: window.app.personMap.get('drag-edit').x
    }));
    check('pointerup after mid-drag Undo cannot push stale history or destroy redo',
        afterStalePointerUp.undo === 0 && afterStalePointerUp.redo === 1
            && afterStalePointerUp.x === 300,
        JSON.stringify(afterStalePointerUp));

    const afterMidDragRedo = await page.evaluate(() => {
        const app = window.app;
        app.redo();
        return {
            x: app.personMap.get('drag-edit').x,
            undo: app.history.getUndoCount(),
            redo: app.history.getRedoCount()
        };
    });
    check('Redo after a cancelled mid-drag restores the committed pre-drag state, never partial coordinates',
        afterMidDragRedo.x === 400 && afterMidDragRedo.undo === 1 && afterMidDragRedo.redo === 0,
        JSON.stringify(afterMidDragRedo));

    const emptyHistoryDragStart = await page.evaluate(() => {
        const app = window.app;
        app.history.clear();
        const person = app.personMap.get('drag-edit');
        person.x = 400;
        person.y = 260;
        app.selectPerson('drag-edit');
        app.render();
        const rect = app.canvas.canvas.getBoundingClientRect();
        return {
            x: person.x * app.canvas.scale + app.canvas.offsetX + rect.left,
            y: person.y * app.canvas.scale + app.canvas.offsetY + rect.top
        };
    });
    await page.mouse.move(emptyHistoryDragStart.x, emptyHistoryDragStart.y);
    await page.mouse.down();
    await page.mouse.move(emptyHistoryDragStart.x + 80, emptyHistoryDragStart.y + 20, { steps: 5 });
    const emptyHistoryMidDragUndo = await page.evaluate(() => {
        const app = window.app;
        const partialX = app.personMap.get('drag-edit').x;
        app.undo();
        return {
            partialX,
            x: app.personMap.get('drag-edit').x,
            dragging: app.canvas.isDragging,
            pointerId: app.activePointerId,
            dragStartSnapshot: app.dragStartSnapshot,
            undo: app.history.getUndoCount(),
            redo: app.history.getRedoCount()
        };
    });
    await page.mouse.up();
    const emptyHistoryAfterPointerUp = await page.evaluate(() => ({
        x: window.app.personMap.get('drag-edit').x,
        undo: window.app.history.getUndoCount(),
        redo: window.app.history.getRedoCount()
    }));
    check('empty-history Undo cancels a real drag back to its committed coordinates without history',
        emptyHistoryMidDragUndo.partialX !== 400
            && emptyHistoryMidDragUndo.x === 400
            && !emptyHistoryMidDragUndo.dragging
            && emptyHistoryMidDragUndo.pointerId === null
            && emptyHistoryMidDragUndo.dragStartSnapshot === null
            && emptyHistoryMidDragUndo.undo === 0 && emptyHistoryMidDragUndo.redo === 0
            && emptyHistoryAfterPointerUp.x === 400
            && emptyHistoryAfterPointerUp.undo === 0 && emptyHistoryAfterPointerUp.redo === 0,
        JSON.stringify({ emptyHistoryMidDragUndo, emptyHistoryAfterPointerUp }));

    const emptyUndoCleanup = await page.evaluate(() => {
        const app = window.app;
        app.history.clear();
        app.dragGuides = { x: { pos: 300 } };
        app.canvas.dragGuides = app.dragGuides;
        let renders = 0;
        const originalRender = app.render.bind(app);
        app.render = (...args) => {
            renders++;
            return originalRender(...args);
        };
        app.undo();
        app.render = originalRender;
        return { renders, appGuides: app.dragGuides, canvasGuides: app.canvas.dragGuides };
    });
    check('empty-history Undo repaints after transient guide cleanup',
        emptyUndoCleanup.renders > 0 && emptyUndoCleanup.appGuides === null
            && emptyUndoCleanup.canvasGuides === null,
        JSON.stringify(emptyUndoCleanup));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL MODAL KEYBOARD AND HISTORY CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
