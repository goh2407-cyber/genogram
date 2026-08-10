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

        const primitiveChecks = {
            exposed: typeof FamilyRoutePlanner.segmentIntersectsRect === 'function'
                && typeof FamilyRoutePlanner.pathIntersectionCount === 'function',
            boundaryClear: false,
            interiorHit: false,
            invalidRectClear: false,
            numericAllowedCount: null,
            stringAllowedCount: null
        };
        if (primitiveChecks.exposed) {
            const rect = { ownerId: 77, kind: 'symbol',
                left: 10, right: 20, top: 10, bottom: 20 };
            primitiveChecks.boundaryClear = !FamilyRoutePlanner.segmentIntersectsRect(
                { x: 10, y: 0 }, { x: 10, y: 30 }, rect);
            primitiveChecks.interiorHit = FamilyRoutePlanner.segmentIntersectsRect(
                { x: 15, y: 0 }, { x: 15, y: 30 }, rect);
            primitiveChecks.invalidRectClear = !FamilyRoutePlanner.segmentIntersectsRect(
                { x: 15, y: 0 }, { x: 15, y: 30 }, { ...rect, right: Infinity });
            const obstaclesForCount = [
                rect,
                { ownerId: 77, kind: 'text', left: 10, right: 20, top: 10, bottom: 20 }
            ];
            primitiveChecks.numericAllowedCount = FamilyRoutePlanner.pathIntersectionCount(
                [{ x: 15, y: 0 }, { x: 15, y: 30 }], obstaclesForCount, new Set([77]));
            primitiveChecks.stringAllowedCount = FamilyRoutePlanner.pathIntersectionCount(
                [{ x: 15, y: 0 }, { x: 15, y: 30 }], obstaclesForCount, new Set(['77']));
        }

        const lineA = new Person({ id: 'line-a', x: 300, y: 500, gender: 'male', name: 'A' });
        const lineB = new Person({ id: 'line-b', x: 820, y: 680, gender: 'female', name: 'B' });
        const crossed = new Person({ id: 'crossed', x: 560, y: 525, gender: 'male', name: '',
            notes: '強制直線時整塊文字必須移位\n不能改變使用者指定的線' });
        const straight = new Relationship({ id: 'straight', fromPersonId: lineA.id,
            toPersonId: lineB.id, type: 'married', routeMode: 'straight' });
        app.persons = [lineA, lineB, crossed];
        app.relationships = [straight];
        app._syncPersonMap();
        const straightConfigBefore = canvas.getMarriageConfiguration(
            lineA, lineB, straight, app.relationships);
        const straightPathBefore = canvas.getMarriageGeometry(
            lineA, lineB, straightConfigBefore).points;
        const stateBefore = JSON.stringify(app.getState());
        const placementSnapshots = [];
        const hasDerivedPreparation = typeof canvas.prepareDerivedGeometry === 'function';
        if (hasDerivedPreparation) {
            for (let index = 0; index < 3; index++) {
                canvas.prepareDerivedGeometry(app.persons, app.relationships, { force: true });
                placementSnapshots.push(JSON.stringify(
                    [...canvas.personLabelPlacements.entries()]
                        .sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
            }
        }
        const stateAfter = JSON.stringify(app.getState());
        const straightConfig = canvas.getMarriageConfiguration(
            lineA, lineB, straight, app.relationships);
        const straightPath = canvas.getMarriageGeometry(lineA, lineB, straightConfig).points;
        const moved = canvas.getPersonLabelGeometry(crossed,
            { showNames: true, showNotes: true });
        const movedHitCount = primitiveChecks.exposed && moved.bounds
            ? straightPath.slice(1).reduce((count, point, index) => count
                + (FamilyRoutePlanner.segmentIntersectsRect(
                    straightPath[index], point, moved.bounds) ? 1 : 0), 0)
            : -1;

        canvas.personMap = app.personMap;
        canvas.invalidateDerivedGeometry();
        canvas.render(app.persons, app.relationships);
        const renderPreparedPlacement = canvas.getPersonLabelGeometry(crossed,
            { showNames: true, showNotes: true }).placement;
        canvas.invalidateDerivedGeometry();
        const directBounds = canvas.getContentBounds(app.persons, app.relationships, [], [],
            { showNames: true, showNotes: true });
        const boundsPreparedGeometry = canvas.getPersonLabelGeometry(crossed,
            { showNames: true, showNotes: true });
        const directBoundsPrepared = ['left', 'right'].includes(
            boundsPreparedGeometry.placement.side)
            && directBounds.minX <= boundsPreparedGeometry.bounds.left
            && directBounds.maxX >= boundsPreparedGeometry.bounds.right;

        const warningPerson = new Person({ id: 700, x: 560, y: 525, gender: 'male', name: '',
            notes: 'numeric warning block must retain its original id type\nsecond line widens the block' });
        const leftBlocker = new Person({ id: 'left-blocker', x: 480, y: 580,
            gender: 'male', name: 'L' });
        const rightBlocker = new Person({ id: 'right-blocker', x: 640, y: 580,
            gender: 'female', name: 'R' });
        app.persons = [lineA, lineB, warningPerson, leftBlocker, rightBlocker];
        app.relationships = [straight];
        app._syncPersonMap();
        if (hasDerivedPreparation) {
            canvas.prepareDerivedGeometry(app.persons, app.relationships, { force: true });
        }
        const numericWarning = canvas.labelRoutingWarnings.find(warning => warning.personId === 700);

        return {
            full, hiddenName, bounds, longLabel, obstacleCount: obstacles.length,
            symbolBottom: notesOnly.y + canvas.personSize / 2, invalidated, primitiveChecks,
            numericRouting: {
                parentTextFound: Boolean(numericParentText),
                sourcePrefix: numericSource.sourcePrefix,
                sourceX: numericSource.source.x,
                textRight: numericParentText?.right ?? null,
                planSourcePath: numericPlan?.sourcePath || []
            },
            appIdComparisons,
            adapterLayouts,
            forcedStraight: {
                hasDerivedPreparation,
                straightPathBefore,
                straightPath,
                moved,
                movedHitCount,
                crossedJSON: crossed.toJSON(),
                placementSnapshots,
                stateBefore,
                stateAfter,
                renderPreparedPlacement,
                directBoundsPrepared,
                numericPlacementKey: canvas.personLabelPlacements.has('700'),
                numericWarning: numericWarning || null
            }
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
    check('public route geometry primitives are exposed',
        result.primitiveChecks.exposed, JSON.stringify(result.primitiveChecks));
    check('public segment rectangle collision keeps boundary clear and detects interior',
        result.primitiveChecks.boundaryClear && result.primitiveChecks.interiorHit
            && result.primitiveChecks.invalidRectClear,
        JSON.stringify(result.primitiveChecks));
    check('path collision owner allowlist treats numeric and string ids consistently',
        result.primitiveChecks.numericAllowedCount === 1
            && result.primitiveChecks.stringAllowedCount === 1,
        JSON.stringify(result.primitiveChecks));
    check('forced straight keeps its existing path shape',
        result.forcedStraight.straightPath.length === 4
            && JSON.stringify(result.forcedStraight.straightPath)
                === JSON.stringify(result.forcedStraight.straightPathBefore),
        JSON.stringify(result.forcedStraight.straightPath));
    check('colliding notes move as one block',
        ['left', 'right'].includes(result.forcedStraight.moved.placement.side)
            && result.forcedStraight.moved.rows.length === 2
            && result.forcedStraight.moved.rows.every(row =>
                row.x === result.forcedStraight.moved.rows[0].x),
        JSON.stringify(result.forcedStraight.moved));
    check('moved label no longer intersects forced straight route',
        result.forcedStraight.movedHitCount === 0,
        `hits=${result.forcedStraight.movedHitCount}`);
    check('derived placement never mutates Person JSON',
        result.forcedStraight.crossedJSON.x === 560
            && result.forcedStraight.crossedJSON.y === 525
            && !Object.hasOwn(result.forcedStraight.crossedJSON, 'labelPlacement'),
        JSON.stringify(result.forcedStraight.crossedJSON));
    check('forced label placement is deterministic across forced recomputation',
        result.forcedStraight.placementSnapshots.length === 3
            && new Set(result.forcedStraight.placementSnapshots).size === 1,
        JSON.stringify(result.forcedStraight.placementSnapshots));
    check('derived preparation leaves persisted app state byte-for-byte unchanged',
        result.forcedStraight.stateBefore === result.forcedStraight.stateAfter,
        `${result.forcedStraight.stateBefore} !== ${result.forcedStraight.stateAfter}`);
    check('screen render prepares forced-straight label placement',
        ['left', 'right'].includes(result.forcedStraight.renderPreparedPlacement.side),
        JSON.stringify(result.forcedStraight.renderPreparedPlacement));
    check('direct content bounds prepares and includes moved label geometry',
        result.forcedStraight.directBoundsPrepared,
        JSON.stringify(result.forcedStraight));
    check('numeric label placement uses string map keys but warnings retain person id type',
        result.forcedStraight.numericPlacementKey
            && result.forcedStraight.numericWarning?.personId === 700
            && result.forcedStraight.numericWarning.collisions > 0,
        JSON.stringify(result.forcedStraight.numericWarning));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL LABEL ROUTING CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
