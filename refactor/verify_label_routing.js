const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp({ width: 1280, height: 820 });
    const { failures, passes, check } = createChecks();

    const result = await page.evaluate(() => {
        const app = window.app;
        const canvas = app.canvas;
        const notesOnly = new Person({
            id: 'notes-only', x: 180, y: 220, gender: 'male', name: '',
            age: 62, notes: '雙相情緒障礙症\n（精神中度障礙）'
        });
        const longLeft = new Person({
            id: 'long-left', x: 42, y: 450, gender: 'female', name: '',
            notes: '這是一段必須被納入左右匯出邊界的長備註'
        });
        app.persons = [notesOnly, longLeft];
        app.relationships = [];
        app._syncPersonMap();
        app.render();

        const full = canvas.getPersonLabelGeometry(notesOnly,
            { showNames: true, showNotes: true }, { side: 'below' });
        const hiddenName = canvas.getPersonLabelGeometry(notesOnly,
            { showNames: false, showNotes: true }, { side: 'below' });
        const bounds = canvas.getContentBounds(app.persons, [], [], [],
            { showNames: true, showNotes: true });
        const longLabel = canvas.getPersonLabelGeometry(longLeft,
            { showNames: true, showNotes: true }, { side: 'below' });
        const obstacles = canvas.getPersonRouteObstacles(app.persons)
            .filter(rect => rect.ownerId === notesOnly.id && rect.kind === 'text');

        const numericParent = new Person({
            id: 101, x: 220, y: 220, gender: 'male', name: 'numeric parent wide label'
        });
        const numericChild = new Person({
            id: 102, x: 560, y: 520, gender: 'female', name: 'numeric child'
        });
        const numericEdge = new Relationship({
            id: 'numeric-edge', type: 'parent-child',
            fromPersonId: numericParent.id, toPersonId: numericChild.id
        });
        app.persons = [numericParent, numericChild];
        app.relationships = [numericEdge];
        app._syncPersonMap();
        app.render();
        const numericObstacles = canvas.getPersonRouteObstacles(app.persons);
        const numericParentText = numericObstacles.find(rect =>
            rect.ownerId === numericParent.id && rect.kind === 'text');
        const numericSource = canvas._getFamilySource(
            [numericParent], [numericChild], [], numericObstacles);
        const numericPlan = canvas._familyRoutePlans[0];

        const movingChild = new Person({
            id: 201, x: 400, y: 400, gender: 'male',
            name: 'moving child label is deliberately very wide across every candidate'
        });
        const spouse = new Person({ id: 202, x: 520, y: 400, gender: 'female' });
        const spouseParentA = new Person({
            id: 203, x: 460, y: 130, gender: 'male', name: 'label blocker'
        });
        const spouseParentB = new Person({
            id: 204, x: 800, y: 130, gender: 'female', name: 'far parent'
        });
        app.persons = [movingChild, spouse, spouseParentA, spouseParentB];
        app.relationships = [
            new Relationship({ id: 'numeric-couple', type: 'married',
                fromPersonId: movingChild.id, toPersonId: spouse.id }),
            new Relationship({ id: 'numeric-parent-a', type: 'parent-child',
                fromPersonId: spouseParentA.id, toPersonId: spouse.id }),
            new Relationship({ id: 'numeric-parent-b', type: 'parent-child',
                fromPersonId: spouseParentB.id, toPersonId: spouse.id })
        ];
        app._syncPersonMap();
        const adjustmentObstacles = canvas.getPersonRouteObstacles(app.persons);
        const spouseParentIds = new Set([spouseParentA.id, spouseParentB.id]);
        const numericAdjustment = app.findQuickParentPairChildAdjustment(movingChild, 200, 120);
        const appIdComparisons = {
            spouseParentTextMatched: adjustmentObstacles.some(rect =>
                rect.kind === 'text' && spouseParentIds.has(rect.ownerId)),
            movingChildTextMatched: adjustmentObstacles.some(rect =>
                rect.kind === 'text' && rect.ownerId === movingChild.id),
            adjustment: numericAdjustment
        };

        const adapterPerson = new Person({
            id: 'adapter-person', x: 300, y: 620, gender: 'male',
            name: 'Adapter Name', notes: 'first note\nsecond note'
        });
        const emptyPerson = new Person({
            id: 'adapter-empty', x: 500, y: 620, gender: 'female', name: '', notes: ''
        });
        const adapterTop = adapterPerson.y + canvas.personSize / 2 + 8;
        const emptyTop = emptyPerson.y + canvas.personSize / 2 + 8;
        const adapterLayouts = {
            nameOnly: canvas.getPersonTextLayout(adapterPerson,
                { showNames: true, showNotes: false }),
            empty: canvas.getPersonTextLayout(emptyPerson,
                { showNames: true, showNotes: true }),
            notesOnly: canvas.getPersonTextLayout(adapterPerson,
                { showNames: false, showNotes: true })
        };
        canvas.personLabelPlacements.set(String(adapterPerson.id),
            { side: 'left', offsetX: 17, offsetY: 29 });
        adapterLayouts.explicitPlacement = canvas.getPersonTextLayout(adapterPerson,
            { showNames: true, showNotes: true },
            { side: 'right', offsetX: 31, offsetY: 47 });
        adapterLayouts.expected = {
            adapterTop,
            emptyTop,
            namedNoteTop: adapterTop + canvas.fontSize + 4
        };

        canvas._derivedGeometrySignature = 'stale';
        canvas.personLabelPlacements = new Map([['stale', { side: 'left' }]]);
        canvas.marriageRouteCache = new Map([['stale', {}]]);
        canvas.labelRoutingWarnings = ['stale'];
        canvas._familyRouteSignature = 'stale';
        canvas._familyPlanCache = new Map([['stale', {}]]);
        canvas._familyRoutePlans = [{}];
        canvas._familyRelationshipPaths = new Map([['stale', []]]);
        canvas.invalidateDerivedGeometry();
        const invalidated = {
            signature: canvas._derivedGeometrySignature,
            placements: canvas.personLabelPlacements.size,
            marriageRoutes: canvas.marriageRouteCache.size,
            warnings: canvas.labelRoutingWarnings.length,
            familySignature: canvas._familyRouteSignature,
            familyPlans: canvas._familyPlanCache.size,
            familyRoutePlans: canvas._familyRoutePlans.length,
            familyPaths: canvas._familyRelationshipPaths.size
        };

        return {
            full, hiddenName, bounds, longLabel, obstacleCount: obstacles.length,
            symbolBottom: notesOnly.y + canvas.personSize / 2, invalidated,
            numericRouting: {
                parentTextFound: Boolean(numericParentText),
                sourcePrefix: numericSource.sourcePrefix,
                sourceX: numericSource.source.x,
                textRight: numericParentText?.right ?? null,
                planSourcePath: numericPlan?.sourcePath || []
            },
            appIdComparisons,
            adapterLayouts
        };
    });

    check('notes-only creates two rows', result.full.rows.length === 2,
        JSON.stringify(result.full.rows));
    check('notes-only first row starts at the normal label top',
        result.full.rows[0].y === result.symbolBottom + 8,
        `rowY=${result.full.rows[0].y} symbolBottom=${result.symbolBottom}`);
    check('hiding an absent name keeps both note rows at the first row',
        result.hiddenName.rows.length === 2
            && result.hiddenName.rows[0].y === result.symbolBottom + 8,
        JSON.stringify(result.hiddenName.rows));
    check('route obstacles include every visible notes-only row',
        result.obstacleCount === 2, `count=${result.obstacleCount}`);
    check('numeric person ids retain their type on text obstacles',
        result.numericRouting.parentTextFound,
        JSON.stringify(result.numericRouting));
    check('numeric single-parent routing starts beside the measured label',
        result.numericRouting.sourcePrefix.length === 2
            && result.numericRouting.sourceX >= result.numericRouting.textRight + 10
            && result.numericRouting.planSourcePath.length >= 3,
        JSON.stringify(result.numericRouting));
    check('numeric app obstacle comparisons recognize parent labels and skip the moving child label',
        result.appIdComparisons.spouseParentTextMatched
            && result.appIdComparisons.movingChildTextMatched
            && result.appIdComparisons.adjustment !== null,
        JSON.stringify(result.appIdComparisons));
    check('compatibility adapter keeps legacy name-only coordinates',
        result.adapterLayouts.nameOnly.nameY === result.adapterLayouts.expected.adapterTop
            && result.adapterLayouts.nameOnly.noteStartY === result.adapterLayouts.expected.namedNoteTop,
        JSON.stringify(result.adapterLayouts.nameOnly));
    check('compatibility adapter keeps legacy empty-label coordinates',
        result.adapterLayouts.empty.nameY === result.adapterLayouts.expected.emptyTop
            && result.adapterLayouts.empty.noteStartY === result.adapterLayouts.expected.emptyTop,
        JSON.stringify(result.adapterLayouts.empty));
    check('compatibility adapter keeps notes at the first row when names are hidden',
        result.adapterLayouts.notesOnly.nameY === result.adapterLayouts.expected.adapterTop
            && result.adapterLayouts.notesOnly.noteStartY === result.adapterLayouts.expected.adapterTop,
        JSON.stringify(result.adapterLayouts.notesOnly));
    check('compatibility adapter coordinates ignore mapped and explicit placement offsets',
        result.adapterLayouts.explicitPlacement.nameY === result.adapterLayouts.expected.adapterTop
            && result.adapterLayouts.explicitPlacement.noteStartY === result.adapterLayouts.expected.namedNoteTop,
        JSON.stringify(result.adapterLayouts.explicitPlacement));
    check('content bounds include label minX',
        result.bounds.minX <= result.longLabel.bounds.left,
        `minX=${result.bounds.minX} labelLeft=${result.longLabel.bounds.left}`);
    check('content bounds include label maxX',
        result.bounds.maxX >= result.longLabel.bounds.right,
        `maxX=${result.bounds.maxX} labelRight=${result.longLabel.bounds.right}`);
    check('derived geometry invalidation clears every label and family route cache',
        result.invalidated.signature === null
            && result.invalidated.placements === 0
            && result.invalidated.marriageRoutes === 0
            && result.invalidated.warnings === 0
            && result.invalidated.familySignature === null
            && result.invalidated.familyPlans === 0
            && result.invalidated.familyRoutePlans === 0
            && result.invalidated.familyPaths === 0,
        JSON.stringify(result.invalidated));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL LABEL ROUTING CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
