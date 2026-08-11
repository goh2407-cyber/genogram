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
    check('manual label controls cause no browser errors', errors.length === 0, errors.join('\n'));

    await finish(browser, passes, failures, 'Manual label controls contract passed.');
})();
