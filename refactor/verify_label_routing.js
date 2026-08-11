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
        const abovePerson = new Person({
            id: 'above-person', x: 720, y: 620, gender: 'female',
            name: 'Above Name', notes: 'first above note\nsecond above note'
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
        const aboveGeometry = canvas.getPersonLabelGeometry(abovePerson,
            { showNames: true, showNotes: true }, { side: 'above' });
        const belowGeometry = canvas.getPersonLabelGeometry(abovePerson,
            { showNames: true, showNotes: true }, { side: 'below' });
        const aboveLayout = canvas.getPersonTextLayout(abovePerson,
            { showNames: true, showNotes: true }, { side: 'above' });
        canvas.personLabelPlacements.set(String(adapterPerson.id),
            { side: 'left', offsetX: 17, offsetY: 29 });
        adapterLayouts.mappedPlacement = canvas.getPersonTextLayout(adapterPerson,
            { showNames: true, showNotes: true });
        adapterLayouts.explicitPlacement = canvas.getPersonTextLayout(adapterPerson,
            { showNames: true, showNotes: true },
            { side: 'right', offsetX: 31, offsetY: 47 });
        adapterLayouts.expected = {
            adapterTop,
            emptyTop,
            namedNoteTop: adapterTop + canvas.fontSize + 4,
            mappedTop: adapterTop + 29,
            explicitTop: adapterTop + 47
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
            metricsExposed: typeof FamilyRoutePlanner.pathLength === 'function'
                && typeof FamilyRoutePlanner.pathBendCount === 'function'
                && typeof FamilyRoutePlanner.polylineCrossingCount === 'function',
            boundaryClear: false,
            interiorHit: false,
            invalidRectClear: false,
            numericAllowedCount: null,
            stringAllowedCount: null,
            pathLength: null,
            bendCount: null,
            crossingCount: null
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
            const metricPath = [
                { x: 0, y: 0 }, { x: 10, y: 0 },
                { x: 10, y: 10 }, { x: 20, y: 10 }
            ];
            primitiveChecks.pathLength = FamilyRoutePlanner.pathLength(metricPath);
            primitiveChecks.bendCount = FamilyRoutePlanner.pathBendCount(metricPath);
            primitiveChecks.crossingCount = FamilyRoutePlanner.polylineCrossingCount(
                metricPath,
                [{ start: { x: 5, y: -5 }, end: { x: 5, y: 5 } }]);
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
        const directBoundsPrepared = boundsPreparedGeometry.placement.side === 'below'
            && directBounds.minX <= boundsPreparedGeometry.bounds.left
            && directBounds.maxX >= boundsPreparedGeometry.bounds.right;

        const warningPerson = new Person({ id: 700, x: 560, y: 525, gender: 'male', name: '',
            notes: 'numeric warning block must retain its original id type\nsecond line widens the block' });
        const leftBlocker = new Person({ id: 'left-blocker', x: 480, y: 580,
            gender: 'male', name: 'L' });
        const rightBlocker = new Person({ id: 'right-blocker', x: 640, y: 580,
            gender: 'female', name: 'R' });
        const aboveBlocker = new Person({ id: 'above-blocker', x: 560, y: 440,
            gender: 'female', name: '' });
        app.persons = [lineA, lineB, warningPerson, leftBlocker, rightBlocker, aboveBlocker];
        app.relationships = [straight];
        app._syncPersonMap();
        if (hasDerivedPreparation) {
            canvas.prepareDerivedGeometry(app.persons, app.relationships, { force: true });
        }
        const numericWarning = canvas.labelRoutingWarnings.find(warning => warning.personId === 700);

        const hub = new Person({ id: 'hub-62', x: 600, y: 240, gender: 'male', name: '', age: 62,
            notes: '雙相情緒障礙症\n（精神中度障礙）' });
        const left = new Person({ id: 'spouse-left', x: 350, y: 240,
            gender: 'female', name: '左側伴侶' });
        const rightNear = new Person({ id: 'spouse-right-near', x: 820, y: 240,
            gender: 'female', name: '右側伴侶一' });
        const rightFar = new Person({ id: 'spouse-right-far', x: 1040, y: 240,
            gender: 'female', name: '右側伴侶二' });
        const relAuto = new Relationship({ id: 'route-auto', fromPersonId: left.id,
            toPersonId: hub.id, type: 'married', routeMode: 'auto' });
        const relOver = new Relationship({ id: 'route-over', fromPersonId: hub.id,
            toPersonId: rightFar.id, type: 'divorced', routeMode: 'over' });
        const relUnder = new Relationship({ id: 'route-under', fromPersonId: hub.id,
            toPersonId: rightNear.id, type: 'cohabiting', routeMode: 'under' });
        const autoA = new Person({ id: 'auto-a', x: 300, y: 780,
            gender: 'male', name: 'AUTO A' });
        const autoB = new Person({ id: 'auto-b', x: 820, y: 960,
            gender: 'female', name: 'AUTO B' });
        const autoCrossed = new Person({ id: 'auto-crossed', x: 560, y: 805,
            gender: 'male', name: '',
            notes: '自動模式必須選擇安全候選\n不得穿過這兩行文字' });
        const autoCrossingRel = new Relationship({ id: 'route-auto-crossing',
            fromPersonId: autoA.id, toPersonId: autoB.id,
            type: 'married', routeMode: 'auto' });
        app.persons.push(hub, left, rightNear, rightFar, autoA, autoB, autoCrossed);
        app.relationships.push(relAuto, relOver, relUnder, autoCrossingRel);
        app._syncPersonMap();
        canvas.prepareDerivedGeometry(app.persons, app.relationships, { force: true });
        const underRoute = canvas.getMarriageRoute(hub, rightNear, relUnder, app.relationships);
        const autoSafeRoute = canvas.getMarriageRoute(autoA, autoB,
            autoCrossingRel, app.relationships);
        const allTextObstacles = canvas.getPersonRouteObstacles(app.persons)
            .filter(rect => rect.kind === 'text');
        const underTextHits = FamilyRoutePlanner.pathIntersectionCount(
            underRoute.points, allTextObstacles);
        const autoTextHits = FamilyRoutePlanner.pathIntersectionCount(
            autoSafeRoute.points, allTextObstacles);
        const relationshipPath = canvas.getRelationshipPath(
            hub, rightNear, relUnder, app.relationships);
        const attachmentMid = {
            x: (underRoute.attachmentSegment.start.x
                + underRoute.attachmentSegment.end.x) / 2,
            y: underRoute.attachmentSegment.start.y
        };
        const attachmentHit = canvas.isPointOnRelationship(
            attachmentMid.x, attachmentMid.y,
            hub, rightNear, relUnder, 10, app.relationships);
        const drawnPaths = [];
        const originalDrawMarriagePath = canvas.drawMarriagePath;
        canvas.drawMarriagePath = function(points, decoration, style) {
            drawnPaths.push(points.map(point => ({ ...point })));
            return originalDrawMarriagePath.call(this, points, decoration, style);
        };
        canvas.drawRelationship(hub, rightNear, relUnder, true,
            app.persons, app.relationships);
        canvas.drawMarriagePath = originalDrawMarriagePath;
        const routeBeforeExport = JSON.stringify(underRoute.points);
        const exportDataUrl = canvas.exportToPNG(app.persons, app.relationships,
            [], [], true, false, 1, app.viewOptions);
        const routeAfterExport = JSON.stringify(
            canvas.getMarriageRoute(hub, rightNear, relUnder, app.relationships).points);
        const fullViewRoute = routeAfterExport;
        app.viewOptions = { ...app.viewOptions, showNames: false, showNotes: false };
        app.render();
        const hiddenViewRoute = JSON.stringify(
            canvas.getMarriageRoute(hub, rightNear, relUnder, app.relationships).points);
        const safeMarriageWarnings = canvas.labelRoutingWarnings
            .filter(warning => warning.reason === 'marriage-route-collision');

        const unresolvedA = new Person({ id: 'unresolved-a', x: 100, y: 1200,
            gender: 'male', name: 'A' });
        const unresolvedB = new Person({ id: 'unresolved-b', x: 500, y: 1200,
            gender: 'female', name: 'B' });
        const unresolvedRel = new Relationship({ id: 900,
            fromPersonId: unresolvedA.id, toPersonId: unresolvedB.id,
            type: 'married', routeMode: 'auto' });
        const originalGetPersonRouteObstacles = canvas.getPersonRouteObstacles;
        canvas.getPersonRouteObstacles = () => [{
            ownerId: 'synthetic-wall', kind: 'text',
            left: -1000, right: 2000, top: -1000, bottom: 2000
        }];
        const unresolvedWarningSnapshots = [];
        const unresolvedRouteSnapshots = [];
        let unresolvedDirectScore = null;
        let unresolvedSelectedScore = null;
        for (let index = 0; index < 3; index++) {
            canvas.prepareDerivedGeometry(
                [unresolvedA, unresolvedB], [unresolvedRel], { force: true });
            unresolvedWarningSnapshots.push(JSON.stringify(canvas.labelRoutingWarnings));
            const unresolvedRoute = canvas.getMarriageRoute(
                unresolvedA, unresolvedB, unresolvedRel, [unresolvedRel]);
            unresolvedRouteSnapshots.push(JSON.stringify(unresolvedRoute));
            if (index === 0) {
                const unresolvedConfig = canvas.getMarriageConfiguration(
                    unresolvedA, unresolvedB, unresolvedRel, [unresolvedRel]);
                const unresolvedDirect = {
                    name: 'direct',
                    ...canvas.getMarriageGeometry(unresolvedA, unresolvedB,
                        { ...unresolvedConfig, isArch: false, isBridge: false,
                            archBarY: null })
                };
                unresolvedDirectScore = canvas._marriageCandidateScore(
                    unresolvedDirect, canvas.getPersonRouteObstacles(), [],
                    unresolvedA, unresolvedB);
                unresolvedSelectedScore = canvas._marriageCandidateScore(
                    { name: unresolvedRoute.candidateName,
                        points: unresolvedRoute.points },
                    canvas.getPersonRouteObstacles(), [], unresolvedA, unresolvedB);
            }
        }
        canvas.getPersonRouteObstacles = originalGetPersonRouteObstacles;

        const occupiedLeft = new Person({ id: 'occupied-left', x: 100, y: 600,
            gender: 'male', name: '' });
        const occupiedRight = new Person({ id: 'occupied-right', x: 900, y: 600,
            gender: 'female', name: '' });
        const crossingLeft = new Person({ id: 'crossing-left', x: 300, y: 600,
            gender: 'male', name: '' });
        const crossingRight = new Person({ id: 'crossing-right', x: 700, y: 600,
            gender: 'female', name: '' });
        const occupiedRel = new Relationship({ id: 'a-occupied',
            fromPersonId: occupiedLeft.id, toPersonId: occupiedRight.id,
            type: 'married', routeMode: 'straight' });
        const crossingAutoRel = new Relationship({ id: 'b-auto-crossing',
            fromPersonId: crossingLeft.id, toPersonId: crossingRight.id,
            type: 'married', routeMode: 'auto' });
        const occupiedFixturePersons = [
            occupiedLeft, occupiedRight, crossingLeft, crossingRight
        ];
        const occupiedFixtureRels = [occupiedRel, crossingAutoRel];
        canvas.prepareDerivedGeometry(
            occupiedFixturePersons, occupiedFixtureRels, { force: true });
        const occupiedCrossingRoute = canvas.getMarriageRoute(
            crossingLeft, crossingRight, crossingAutoRel, occupiedFixtureRels);
        const occupiedDirectConfig = canvas.getMarriageConfiguration(
            crossingLeft, crossingRight, crossingAutoRel, occupiedFixtureRels);
        const occupiedDirectGeometry = canvas.getMarriageGeometry(
            crossingLeft, crossingRight,
            { ...occupiedDirectConfig, isArch: false, isBridge: false,
                archBarY: null });
        const occupiedDirectTextHits = FamilyRoutePlanner.pathIntersectionCount(
            occupiedDirectGeometry.points,
            canvas.getPersonRouteObstacles(occupiedFixturePersons),
            new Set([String(crossingLeft.id), String(crossingRight.id)]));

        const clearLeft = new Person({ id: 'clear-left', x: 300, y: 900,
            gender: 'male', name: '' });
        const clearRight = new Person({ id: 'clear-right', x: 700, y: 900,
            gender: 'female', name: '' });
        const clearAutoRel = new Relationship({ id: 'clear-auto',
            fromPersonId: clearLeft.id, toPersonId: clearRight.id,
            type: 'married', routeMode: 'auto' });
        canvas.prepareDerivedGeometry(
            [clearLeft, clearRight], [clearAutoRel], { force: true });
        const clearAutoRoute = canvas.getMarriageRoute(
            clearLeft, clearRight, clearAutoRel, [clearAutoRel]);

        // Standard auto marriage: a clear same-row pair uses the side ports directly.
        const standardLeft = new Person({ id: 'standard-left', x: 180, y: 1260,
            gender: 'male', name: '標準左側姓名' });
        const standardRight = new Person({ id: 'standard-right', x: 820, y: 1260,
            gender: 'female', name: '標準右側姓名' });
        const standardRel = new Relationship({ id: 'standard-auto',
            fromPersonId: standardLeft.id, toPersonId: standardRight.id,
            type: 'married', routeMode: 'auto' });
        const standardPersons = [standardLeft, standardRight];
        canvas.prepareDerivedGeometry(standardPersons, [standardRel], { force: true });
        const standardRoute = canvas.getMarriageRoute(
            standardLeft, standardRight, standardRel, [standardRel]);
        const standardLabelLeft = canvas.getPersonLabelGeometry(standardLeft,
            { showNames: true, showNotes: true });
        const standardLabelRight = canvas.getPersonLabelGeometry(standardRight,
            { showNames: true, showNotes: true });
        const standardLabelHits = FamilyRoutePlanner.pathIntersectionCount(
            standardRoute.points, [standardLabelLeft.bounds, standardLabelRight.bounds]);

        // Standard auto marriage with a symbol in the middle must bridge above;
        // the current under route is deliberately retained here as a RED contract.
        const bridgeLeft = new Person({ id: 'bridge-left', x: 120, y: 1440,
            gender: 'male', name: '左側配偶' });
        const bridgeBlocker = new Person({ id: 'bridge-blocker', x: 500, y: 1440,
            gender: 'same', name: '中間人物' });
        const bridgeRight = new Person({ id: 'bridge-right', x: 880, y: 1440,
            gender: 'female', name: '右側配偶' });
        const bridgeRel = new Relationship({ id: 'bridge-auto',
            fromPersonId: bridgeLeft.id, toPersonId: bridgeRight.id,
            type: 'married', routeMode: 'auto' });
        const bridgePersons = [bridgeLeft, bridgeBlocker, bridgeRight];
        canvas.prepareDerivedGeometry(bridgePersons, [bridgeRel], { force: true });
        const bridgeConfig = canvas.getMarriageConfiguration(
            bridgeLeft, bridgeRight, bridgeRel, [bridgeRel]);
        const bridgeRoute = canvas.getMarriageRoute(
            bridgeLeft, bridgeRight, bridgeRel, [bridgeRel]);
        const bridgeTextHits = FamilyRoutePlanner.pathIntersectionCount(
            bridgeRoute.points,
            canvas.getPersonRouteObstacles(bridgePersons).filter(rect => rect.kind === 'text'));
        const bridgeBottomEndpoints = [
            bridgeLeft.getConnectionPoint('bottom'),
            bridgeRight.getConnectionPoint('bottom')
        ];

        const archAutoLeft = new Person({ id: 'arch-auto-left', x: 100, y: 1080,
            gender: 'male', name: '' });
        const archAutoBlocker = new Person({ id: 'arch-auto-blocker', x: 500, y: 1080,
            gender: 'male', name: '' });
        const archAutoRight = new Person({ id: 'arch-auto-right', x: 900, y: 1080,
            gender: 'female', name: '' });
        const archAutoRel = new Relationship({ id: 'arch-auto',
            fromPersonId: archAutoLeft.id, toPersonId: archAutoRight.id,
            type: 'married', routeMode: 'auto' });
        const archAutoPersons = [archAutoLeft, archAutoBlocker, archAutoRight];
        canvas.prepareDerivedGeometry(archAutoPersons, [archAutoRel], { force: true });
        const archAutoConfig = canvas.getMarriageConfiguration(
            archAutoLeft, archAutoRight, archAutoRel, [archAutoRel]);
        const archAutoRoute = canvas.getMarriageRoute(
            archAutoLeft, archAutoRight, archAutoRel, [archAutoRel]);

        const routingFixtureState = {
            persons: app.persons,
            relationships: app.relationships,
            households: app.households,
            lifeCircles: app.lifeCircles
        };
        const routeA = new Person({ id: 'warn-route-a', x: 260, y: 460,
            gender: 'male', name: 'A' });
        const routeB = new Person({ id: 'warn-route-b', x: 860, y: 640,
            gender: 'female', name: 'B' });
        const leftBlock = new Person({ id: 'a-warn-left', x: 395, y: 485,
            gender: 'female', name: '', notes: '左側固定長文字阻擋候選位置' });
        const rightBlock = new Person({ id: 'b-warn-right', x: 725, y: 485,
            gender: 'female', name: '', notes: '右側固定長文字阻擋候選位置' });
        const aboveBlock = new Person({ id: 'c-warn-above', x: 560, y: 425,
            gender: 'female', name: '' });
        const target = new Person({ id: 'z-warn-target', x: 560, y: 485,
            gender: 'male', name: '', notes: '這個範例刻意沒有完全安全的左右位置' });
        const forced = new Relationship({ id: 'warn-straight', fromPersonId: routeA.id,
            toPersonId: routeB.id, type: 'married', routeMode: 'straight' });
        app.persons = [routeA, routeB, leftBlock, rightBlock, aboveBlock, target];
        app.relationships = [forced];
        app.households = [];
        app.lifeCircles = [];
        app._syncPersonMap();
        app.render();
        const warning = document.getElementById('routingWarning');
        const warningResult = warning ? {
            visible: !warning.hidden,
            text: warning.textContent,
            count: app.canvas.labelRoutingWarnings.length
        } : { visible: false, text: '', count: app.canvas.labelRoutingWarnings.length };
        const warningExportDataUrl = app.canvas.exportToPNG(app.persons, app.relationships,
            [], [], true, false, 1, app.viewOptions);
        const warningWasHidden = warning?.hidden;
        if (warning) warning.hidden = true;
        const hiddenWarningExportDataUrl = app.canvas.exportToPNG(app.persons, app.relationships,
            [], [], true, false, 1, app.viewOptions);
        if (warning) warning.hidden = warningWasHidden;

        const originalLabelWarnings = canvas.labelRoutingWarnings;
        const originalMarriageWarnings = canvas.marriageRoutingWarnings;
        const hadMarriageWarnings = Object.hasOwn(canvas, 'marriageRoutingWarnings');
        const sharedRelationshipWarning = {
            relationshipId: 9,
            reason: 'marriage-route-collision'
        };
        canvas.labelRoutingWarnings = [
            { personId: 7, reason: 'forced-straight-label-collision' },
            { relationshipId: 7, reason: 'marriage-route-collision' },
            sharedRelationshipWarning
        ];
        canvas.marriageRoutingWarnings = [
            sharedRelationshipWarning,
            { relationshipId: 9, reason: 'marriage-route-collision' }
        ];
        app.updateRoutingWarning();
        const mixedWarningResult = {
            visible: !warning.hidden,
            text: warning.textContent
        };
        canvas.labelRoutingWarnings = originalLabelWarnings;
        if (hadMarriageWarnings) canvas.marriageRoutingWarnings = originalMarriageWarnings;
        else delete canvas.marriageRoutingWarnings;

        forced.routeMode = 'auto';
        app.canvas.invalidateDerivedGeometry();
        app.render();
        const warningHiddenAfterAuto = warning?.hidden === true;

        app.persons = routingFixtureState.persons;
        app.relationships = routingFixtureState.relationships;
        app.households = routingFixtureState.households;
        app.lifeCircles = routingFixtureState.lifeCircles;
        app._syncPersonMap();

        canvas.personMap = app.personMap;
        canvas.prepareDerivedGeometry(app.persons, app.relationships, { force: true });

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
            aboveGeometry,
            belowGeometry,
            aboveLayout,
            abovePerson: { y: abovePerson.y, half: canvas.personSize / 2 },
            underRoute,
            autoSafeRoute,
            underTextHits,
            autoTextHits,
            hub: { x: hub.x, y: hub.y },
            rightNear: { x: rightNear.x, y: rightNear.y },
            half: canvas.personSize / 2,
            hubLabelBottom: canvas.getPersonLabelGeometry(hub,
                { showNames: true, showNotes: true }).bounds.bottom,
            relationshipPath,
            attachmentHit,
            drawnPaths,
            routeBeforeExport,
            routeAfterExport,
            exportPrefix: exportDataUrl.slice(0, 22),
            fullViewRoute,
            hiddenViewRoute,
            safeMarriageWarnings,
            unresolvedWarningSnapshots,
            unresolvedRouteSnapshots,
            unresolvedDirectScore,
            unresolvedSelectedScore,
            occupiedCrossingRoute,
            occupiedDirectTextHits,
            clearAutoRoute,
            standardAuto: {
                route: standardRoute,
                left: standardLeft.getConnectionPoint('right'),
                right: standardRight.getConnectionPoint('left'),
                labelHits: standardLabelHits
            },
            bridgeAuto: {
                config: bridgeConfig,
                route: bridgeRoute,
                textHits: bridgeTextHits,
                bottomEndpoints: bridgeBottomEndpoints
            },
            archAuto: {
                config: archAutoConfig,
                route: archAutoRoute,
                left: { x: archAutoLeft.x, y: archAutoLeft.y },
                right: { x: archAutoRight.x, y: archAutoRight.y }
            },
            warning: warningResult,
            warningExportDataUrl,
            hiddenWarningExportDataUrl,
            mixedWarning: mixedWarningResult,
            warningHiddenAfterAuto,
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
    check('above label geometry keeps the full block above the symbol',
        result.aboveGeometry.bounds.bottom < result.abovePerson.y - result.abovePerson.half
            && result.belowGeometry.bounds.top > result.abovePerson.y + result.abovePerson.half,
        JSON.stringify({ above: result.aboveGeometry, below: result.belowGeometry }));
    check('above label geometry preserves name-to-notes row order and shared X',
        result.aboveGeometry.rows.map(row => row.kind).join(',') === 'name,note,note'
            && result.aboveGeometry.rows.every(row => row.x === result.aboveGeometry.rows[0].x),
        JSON.stringify(result.aboveGeometry.rows));
    check('text layout uses mapped placement row coordinates',
        result.adapterLayouts.mappedPlacement.nameY === result.adapterLayouts.expected.mappedTop
            && result.adapterLayouts.mappedPlacement.noteStartY
                === result.adapterLayouts.expected.mappedTop + result.adapterLayouts.expected.namedNoteTop
                    - result.adapterLayouts.expected.adapterTop,
        JSON.stringify(result.adapterLayouts.mappedPlacement));
    check('text layout uses explicit placement row coordinates',
        result.adapterLayouts.explicitPlacement.nameY === result.adapterLayouts.expected.explicitTop
            && result.adapterLayouts.explicitPlacement.noteStartY
                === result.adapterLayouts.expected.explicitTop + result.adapterLayouts.expected.namedNoteTop
                    - result.adapterLayouts.expected.adapterTop,
        JSON.stringify(result.adapterLayouts.explicitPlacement));
    check('text layout uses above geometry row coordinates',
        result.aboveLayout.nameY === result.aboveGeometry.rows[0].y
            && result.aboveLayout.noteStartY === result.aboveGeometry.rows[1].y,
        JSON.stringify({ layout: result.aboveLayout, rows: result.aboveGeometry.rows }));
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
        result.primitiveChecks.exposed && result.primitiveChecks.metricsExposed,
        JSON.stringify(result.primitiveChecks));
    check('public segment rectangle collision keeps boundary clear and detects interior',
        result.primitiveChecks.boundaryClear && result.primitiveChecks.interiorHit
            && result.primitiveChecks.invalidRectClear,
        JSON.stringify(result.primitiveChecks));
    check('path collision owner allowlist treats numeric and string ids consistently',
        result.primitiveChecks.numericAllowedCount === 1
            && result.primitiveChecks.stringAllowedCount === 1,
        JSON.stringify(result.primitiveChecks));
    check('route metric primitives return exact deterministic values',
        result.primitiveChecks.pathLength === 30
            && result.primitiveChecks.bendCount === 2
            && result.primitiveChecks.crossingCount === 1,
        JSON.stringify(result.primitiveChecks));
    check('forced straight keeps its existing path shape',
        result.forcedStraight.straightPath.length === 4
            && JSON.stringify(result.forcedStraight.straightPath)
                === JSON.stringify(result.forcedStraight.straightPathBefore),
        JSON.stringify(result.forcedStraight.straightPath));
    check('colliding notes remain as one default below block until manually moved',
        result.forcedStraight.moved.placement.side === 'below'
            && result.forcedStraight.moved.placement.offsetX === 0
            && result.forcedStraight.moved.placement.offsetY === 0
            && result.forcedStraight.moved.rows.length === 2
            && result.forcedStraight.moved.rows.every(row =>
                row.x === result.forcedStraight.moved.rows[0].x),
        JSON.stringify(result.forcedStraight.moved));
    check('default label may intentionally intersect a forced straight route',
        result.forcedStraight.movedHitCount > 0,
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
    check('screen render keeps forced-straight labels at the default below placement',
        result.forcedStraight.renderPreparedPlacement.side === 'below'
            && result.forcedStraight.renderPreparedPlacement.offsetX === 0
            && result.forcedStraight.renderPreparedPlacement.offsetY === 0,
        JSON.stringify(result.forcedStraight.renderPreparedPlacement));
    check('direct content bounds includes the default label geometry',
        result.forcedStraight.directBoundsPrepared,
        JSON.stringify(result.forcedStraight));
    check('default routing does not create cached or automatic label placements',
        !result.forcedStraight.numericPlacementKey && result.forcedStraight.numericWarning === null,
        JSON.stringify(result.forcedStraight.numericWarning));
    check('under route starts and ends at cardinal bottom ports',
        result.underRoute.points[0].x === result.hub.x
            && result.underRoute.points[0].y === result.hub.y + result.half
            && result.underRoute.points.at(-1).x === result.rightNear.x
            && result.underRoute.points.at(-1).y === result.rightNear.y + result.half,
        JSON.stringify(result.underRoute.points));
    check('under route adds side doglegs instead of label-crossing center legs',
        result.underRoute.points.length >= 8,
        JSON.stringify(result.underRoute.points));
    check('safe under route has zero text intersections', result.underTextHits === 0,
        `hits=${result.underTextHits}`);
    check('attachment segment is the actual under-route bar',
        result.underRoute.attachmentSegment.start.y
            === result.underRoute.attachmentSegment.end.y
            && result.underRoute.attachmentSegment.start.y > result.hubLabelBottom,
        JSON.stringify(result.underRoute.attachmentSegment));
    check('auto route keeps its standard direct geometry while labels stay in place',
        result.autoSafeRoute.candidateName === 'direct'
            && result.autoTextHits > 0
            && result.safeMarriageWarnings.some(warning =>
                warning.relationshipId === 'route-auto-crossing'),
        JSON.stringify({ route: result.autoSafeRoute,
            warnings: result.safeMarriageWarnings }));
    check('draw, selected highlight and hit path share canonical points',
        JSON.stringify(result.relationshipPath) === JSON.stringify(result.underRoute.points)
            && result.drawnPaths.length >= 2
            && result.drawnPaths.every(points => JSON.stringify(points)
                === JSON.stringify(result.underRoute.points))
            && result.attachmentHit,
        JSON.stringify(result.drawnPaths));
    check('export reuses the same canonical route',
        result.exportPrefix === 'data:image/png;base64,'
            && result.routeBeforeExport === result.routeAfterExport,
        `${result.routeBeforeExport} != ${result.routeAfterExport}`);
    check('view-option toggles do not make routes jump',
        result.fullViewRoute === result.hiddenViewRoute,
        `${result.fullViewRoute} != ${result.hiddenViewRoute}`);
    check('all-colliding candidates emit one deterministic unresolved warning',
        new Set(result.unresolvedWarningSnapshots).size === 1
            && JSON.parse(result.unresolvedWarningSnapshots[0]).length === 1
            && JSON.parse(result.unresolvedWarningSnapshots[0])[0].relationshipId === 900
            && JSON.parse(result.unresolvedWarningSnapshots[0])[0].reason
                === 'marriage-route-collision'
            && new Set(result.unresolvedRouteSnapshots).size === 1,
        JSON.stringify({ warnings: result.unresolvedWarningSnapshots,
            routes: result.unresolvedRouteSnapshots }));
    check('all-colliding auto routes let lower-scored direct compete',
        result.unresolvedDirectScore[0] === 1
            && JSON.parse(result.unresolvedRouteSnapshots[0]).candidateName === 'direct'
            && JSON.stringify(result.unresolvedDirectScore)
                === JSON.stringify(result.unresolvedSelectedScore),
        JSON.stringify({ direct: result.unresolvedDirectScore,
            selected: result.unresolvedSelectedScore,
            route: JSON.parse(result.unresolvedRouteSnapshots[0]) }));
    check('clear auto geometry does not silently detour around an occupied marriage path',
        result.occupiedDirectTextHits === 0
            && result.occupiedCrossingRoute.candidateName === 'direct',
        JSON.stringify({ hits: result.occupiedDirectTextHits,
            route: result.occupiedCrossingRoute }));
    check('clear direct remains the lexicographic auto winner',
        result.clearAutoRoute.candidateName === 'direct',
        JSON.stringify(result.clearAutoRoute));
    check('standard clear auto route is a two-point side-port horizontal direct line',
        result.standardAuto.route.candidateName === 'direct'
            && result.standardAuto.route.points.length === 2
            && JSON.stringify(result.standardAuto.route.points[0])
                === JSON.stringify(result.standardAuto.left)
            && JSON.stringify(result.standardAuto.route.points[1])
                === JSON.stringify(result.standardAuto.right)
            && result.standardAuto.route.points[0].y === result.standardAuto.route.points[1].y,
        JSON.stringify(result.standardAuto.route));
    check('standard clear auto side-port route does not cross either label block',
        result.standardAuto.labelHits === 0,
        `labelHits=${result.standardAuto.labelHits}`);
    check('middle-symbol auto route is never an automatic bottom under route',
        !['under', 'inner', 'outer-left', 'outer-right']
            .includes(result.bridgeAuto.route.candidateName)
            && result.bridgeAuto.config.isArch !== true
            && JSON.stringify(result.bridgeAuto.route.points[0])
                !== JSON.stringify(result.bridgeAuto.bottomEndpoints[0])
            && JSON.stringify(result.bridgeAuto.route.points.at(-1))
                !== JSON.stringify(result.bridgeAuto.bottomEndpoints[1]),
        JSON.stringify(result.bridgeAuto));
    check('middle-symbol auto route records a label-safe non-under candidate',
        result.bridgeAuto.textHits === 0,
        JSON.stringify(result.bridgeAuto));
    check('auto same-row obstacle becomes a top bridge candidate',
        result.archAuto.config.needsBridge
            && result.archAuto.config.isArch === false
            && ['bridge-near', 'bridge-middle', 'bridge-far']
                .includes(result.archAuto.route.candidateName),
        JSON.stringify(result.archAuto));
    check('auto bridge candidate uses top cardinal ports',
        result.archAuto.route.points[0].x === result.archAuto.left.x
            && result.archAuto.route.points[0].y === result.archAuto.left.y - result.half
            && result.archAuto.route.points.at(-1).x === result.archAuto.right.x
            && result.archAuto.route.points.at(-1).y === result.archAuto.right.y - result.half,
        JSON.stringify(result.archAuto.route));
    check('default label overlap does not create an automatic routing warning',
        !result.warning.visible && result.warning.count === 0,
        JSON.stringify(result.warning));
    check('warning is absent from exported canvas data',
        result.warningExportDataUrl.startsWith('data:image/png;base64,'),
        result.warningExportDataUrl.slice(0, 30));
    check('visible warning does not alter exported PNG pixels',
        result.warningExportDataUrl === result.hiddenWarningExportDataUrl,
        `${result.warningExportDataUrl.length} !== ${result.hiddenWarningExportDataUrl.length}`);
    check('routing warning dedupes typed entity warnings with neutral item wording',
        result.mixedWarning.visible
            && result.mixedWarning.text.includes('3 項文字與關係線')
            && !result.mixedWarning.text.includes('位成員'),
        JSON.stringify(result.mixedWarning));
    check('unresolved auto route keeps the editor warning visible',
        result.warningHiddenAfterAuto === false, `hidden=${result.warningHiddenAfterAuto}`);
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL LABEL ROUTING CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
