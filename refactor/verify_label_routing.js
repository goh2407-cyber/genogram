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
            symbolBottom: notesOnly.y + canvas.personSize / 2, invalidated
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
