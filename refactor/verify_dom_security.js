const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();
    const payload = '<img src=x onerror="window.__domXss=(window.__domXss||0)+1">';
    const result = await page.evaluate(payload => {
        window.__domXss = 0;
        const app = window.app;
        app.loadData({
            persons: [
                { id: 'x-a', x: 300, y: 240, name: payload, notes: payload, gender: 'male' },
                { id: 'x-b', x: 520, y: 240, name: payload, gender: payload },
                { id: 'x-parent-a', x: 300, y: 120, name: 'parent A', gender: 'male' },
                { id: 'x-parent-b', x: 520, y: 120, name: 'parent B', gender: 'female' }
            ],
            relationships: [
                { id: 'x-rel', fromPersonId: 'x-a', toPersonId: 'x-b', type: 'married', date: payload },
                { id: 'x-parent-a-child-a', fromPersonId: 'x-parent-a', toPersonId: 'x-a', type: 'parent-child' },
                { id: 'x-parent-b-child-a', fromPersonId: 'x-parent-b', toPersonId: 'x-a', type: 'parent-child' },
                { id: 'x-parent-a-child-b', fromPersonId: 'x-parent-a', toPersonId: 'x-b', type: 'parent-child' },
                { id: 'x-parent-b-child-b', fromPersonId: 'x-parent-b', toPersonId: 'x-b', type: 'parent-child' }
            ],
            households: [{ id: 'x-house', ids: ['x-a', 'x-b'], notes: payload }],
            lifeCircles: [{ id: 'x-circle', label: payload,
                color: payload,
                points: [{ x: 200, y: 160 }, { x: 620, y: 160 }, { x: 620, y: 360 }] }]
        });
        const a = app.personMap.get('x-a');
        const b = app.personMap.get('x-b');

        const inspect = () => ({
            injected: app.elements.propertyContent.querySelectorAll('img,script,iframe,svg[onload]').length,
            text: app.elements.propertyContent.textContent,
            values: [...app.elements.propertyContent.querySelectorAll('input,textarea')].map(node => node.value)
        });
        app.selectPerson(a.id); const person = inspect();
        app.selectRelationship('x-rel'); const relationship = inspect();
        app.selectedRelationshipId = null; app.selectedHouseholdId = 'x-house';
        app.updatePropertyPanel(); const household = inspect();
        app.selectedHouseholdId = null; app.selectedLifeCircleId = 'x-circle';
        app.updatePropertyPanel(); const circle = inspect();
        const circleSwatches = [...app.elements.propertyContent.querySelectorAll('.lc-color-swatch')]
            .map(node => node.dataset.color);
        app.selectPerson(a.id); const twin = inspect();
        app.pendingParents = [a.id, b.id];
        app.showChildrenModal([a, b]);
        const children = {
            injected: app.elements.childrenList.querySelectorAll('img,script,iframe').length,
            text: app.elements.childrenList.textContent,
            classes: [...app.elements.childrenList.querySelectorAll('.child-icon')].map(node => node.className)
        };
        app.closeChildrenModal();
        const state = app.getState();
        const persisted = [
            state.persons[0].name, state.persons[0].notes,
            state.relationships[0].date, state.households[0].notes,
            state.lifeCircles[0].label
        ];
        return { person, relationship, household, circle, twin, children,
            circleSwatches, allowedColors: GenogramApp.LIFE_CIRCLE_COLORS,
            persisted, executed: window.__domXss };
    }, payload);

    for (const [name, view] of Object.entries(result)) {
        if (name === 'executed' || name === 'persisted' || name === 'circleSwatches' || name === 'allowedColors') continue;
        check(`${name} renders payload as literal text/value`,
            view.injected === 0 && (view.text.includes(payload) || view.values?.includes(payload)),
            JSON.stringify(view));
    }
    check('raw payload survives state serialization as plain text',
        result.persisted.every(value => value === payload), JSON.stringify(result.persisted));
    check('untrusted life-circle color cannot add a dynamic style source',
        result.circleSwatches.every(color => result.allowedColors.includes(color)),
        JSON.stringify(result.circleSwatches));
    check('untrusted child gender falls back to the allowlisted same class',
        result.children.classes.includes('child-icon same'), JSON.stringify(result.children.classes));
    check('no injected event handler executes', result.executed === 0, String(result.executed));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL DOM SECURITY CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
