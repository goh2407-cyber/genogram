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
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL MODAL KEYBOARD AND HISTORY CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
