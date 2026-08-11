const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();
    const result = await page.evaluate(() => {
        const app = window.app;
        app.persons = [
            new Person({ id: 'a', x: 300, y: 260, gender: 'male', name: '甲', age: 40,
                sexualOrientation: true,
                notes: '第一行', medical: { leftHalf: 'filled', bottomHalf: 'none', centerSymbol: 'none',
                    isSmoker: false, isObese: false, hasLanguageProblem: false } }),
            new Person({ id: 'b', x: 540, y: 260, gender: 'female', name: '乙', isDeceased: true }),
            new Person({ id: 'loss', x: 700, y: 420, gender: 'pregnancy', name: '流產', lossType: 'miscarriage' }),
            new Person({ id: 'notes-only', x: 880, y: 420, gender: 'female', name: '',
                notes: '第一行\n第二行' })
        ];
        app._syncPersonMap();
        app.relationships = [
            new Relationship({ id: 'emotion', fromPersonId: 'a', toPersonId: 'b', type: 'conflict' }),
            new Relationship({ id: 'abuse', fromPersonId: 'a', toPersonId: 'b', type: 'emotional-abuse' })
        ];
        app.households = [{ id: 'hh', ids: ['a', 'b'], notes: '' }];
        app.lifeCircles = [{ id: 'lc', label: '學校', color: 'rgba(74,144,226,.15)', points: [
            { x: 220, y: 170 }, { x: 620, y: 170 }, { x: 620, y: 360 }, { x: 220, y: 360 }
        ] }];
        const calls = { relationships: [], households: 0, lifeCircles: 0, medical: 0, orientation: 0, loss: 0 };
        const canvas = app.canvas;
        const originalRelationship = canvas.drawRelationship;
        const originalHouseholds = canvas.drawHouseholds;
        const originalCircle = canvas._drawSingleLifeCircle;
        const originalMedical = canvas.drawMedicalSymbols;
        const originalOrientation = canvas.drawSexualOrientationMarker;
        const originalLoss = canvas._drawLossSymbol;
        canvas.drawRelationship = function(from, to, rel, ...rest) {
            calls.relationships.push(rel.type);
            return originalRelationship.call(this, from, to, rel, ...rest);
        };
        canvas.drawHouseholds = function(...args) { calls.households++; return originalHouseholds.apply(this, args); };
        canvas._drawSingleLifeCircle = function(...args) { calls.lifeCircles++; return originalCircle.apply(this, args); };
        canvas.drawMedicalSymbols = function(...args) { calls.medical++; return originalMedical.apply(this, args); };
        canvas.drawSexualOrientationMarker = function(...args) { calls.orientation++; return originalOrientation.apply(this, args); };
        canvas._drawLossSymbol = function(...args) { calls.loss++; return originalLoss.apply(this, args); };
        app.setViewOption('showEmotionalRelationships', false, { render: false });
        app.setViewOption('showHouseholds', false, { render: false });
        app.setViewOption('showLifeCircles', false, { render: false });
        app.setViewOption('showMedical', false, { render: false });
        app.render();
        canvas.drawRelationship = originalRelationship;
        canvas.drawHouseholds = originalHouseholds;
        canvas._drawSingleLifeCircle = originalCircle;
        canvas.drawMedicalSymbols = originalMedical;
        canvas.drawSexualOrientationMarker = originalOrientation;
        canvas._drawLossSymbol = originalLoss;
        const textLayout = canvas.getPersonTextLayout(app.persons[0], {
            ...app.viewOptions, showNames: false, showNotes: true
        });
        const notesOnly = app.persons.find(person => person.id === 'notes-only');
        const notesOnlyGeometry = canvas.getPersonLabelGeometry(notesOnly, {
            ...app.viewOptions, showNames: false, showNotes: true
        });
        const originalRelationshipHit = canvas.isPointOnRelationship;
        canvas.isPointOnRelationship = () => true;
        const relationshipHit = app.getRelationshipAt(420, 260);
        canvas.isPointOnRelationship = originalRelationshipHit;
        const hiddenHits = {
            household: app.getHouseholdAt(420, 185),
            lifeCircle: app.getLifeCircleAt(420, 170),
            relationship: relationshipHit
        };
        app.setTool('household');
        const householdReopened = app.viewOptions.showHouseholds;
        app.setTool('lifeCircle');
        const circleReopened = app.viewOptions.showLifeCircles;
        return { calls, textLayout, notesOnlyGeometry, notesOnlyFirstY:
            notesOnly.y + canvas.personSize / 2 + 8, hiddenHits: {
            household: hiddenHits.household && hiddenHits.household.id,
            lifeCircle: hiddenHits.lifeCircle && hiddenHits.lifeCircle.id,
            relationship: hiddenHits.relationship && hiddenHits.relationship.type
        }, householdReopened, circleReopened };
    });
    check('hidden ordinary emotion is not drawn but abuse remains',
        !result.calls.relationships.includes('conflict') && result.calls.relationships.includes('emotional-abuse'),
        JSON.stringify(result.calls.relationships));
    check('hidden households are neither drawn nor hit', result.calls.households === 0 && result.hiddenHits.household === null);
    check('hidden life circles are neither drawn nor hit', result.calls.lifeCircles === 0 && result.hiddenHits.lifeCircle === null);
    check('hidden medical symbols are not drawn', result.calls.medical === 0);
    check('medical toggle preserves orientation and reproductive-loss symbols',
        result.calls.orientation === 1 && result.calls.loss === 1, JSON.stringify(result.calls));
    check('hidden emotion is not hit while abuse remains hit-testable', result.hiddenHits.relationship === 'emotional-abuse');
    check('notes move to first label row when name is hidden',
        result.textLayout.name === '' && result.textLayout.noteLines[0] === '第一行'
            && result.textLayout.noteStartY === result.textLayout.nameY, JSON.stringify(result.textLayout));
    check('notes-only geometry starts notes at the first label row',
        result.notesOnlyGeometry.rows.length === 2
            && result.notesOnlyGeometry.rows[0].kind === 'note'
            && result.notesOnlyGeometry.rows[0].y === result.notesOnlyFirstY,
        JSON.stringify(result.notesOnlyGeometry));
    check('starting hidden creation tools reopens their layers', result.householdReopened && result.circleReopened);
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL VIEW RENDERING CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
