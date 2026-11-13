/**
 * Obstacle-aware family routing integration regression.
 * Usage: NODE_PATH=<playwright node_modules> node refactor/verify_family_routing.js
 */
const { chromium } = require('playwright');
const path = require('path');

const results = [];
function check(name, pass, detail = '') {
    results.push({ name, pass: Boolean(pass), detail });
    console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`);
}

function isCleanOrthogonalPath(path) {
    if (!Array.isArray(path) || path.length < 2) return false;
    for (let index = 0; index < path.length; index++) {
        const point = path[index];
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
        if (index > 0) {
            const previous = path[index - 1];
            if (previous.x !== point.x && previous.y !== point.y) return false;
            if (path.length > 2 && previous.x === point.x && previous.y === point.y) return false;
        }
        if (index > 0 && index < path.length - 1) {
            const a = path[index - 1];
            const b = point;
            const c = path[index + 1];
            const horizontal = a.y === b.y && b.y === c.y
                && b.x >= Math.min(a.x, c.x) && b.x <= Math.max(a.x, c.x);
            const vertical = a.x === b.x && b.x === c.x
                && b.y >= Math.min(a.y, c.y) && b.y <= Math.max(a.y, c.y);
            if (horizontal || vertical) return false;
        }
    }
    return true;
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);

    const plannerLoaded = await page.evaluate(() => typeof window.FamilyRoutePlanner === 'function');
    check('FamilyRoutePlanner loads before Canvas', plannerLoaded);

    if (plannerLoaded) {
        const data = await page.evaluate(() => {
            const app = window.app;
            // 本組案例的走廊寬度是照 14px 姓名設計的（測的是規劃邏輯，不是字級）；2026-10-13 預設改 15px 後固定回 14
            app.canvas.fontSize = 14;
            const dad = new Person({ id: 'route-dad', x: 440, y: 240, gender: 'male', name: '父親長姓名' });
            const mom = new Person({ id: 'route-mom', x: 560, y: 240, gender: 'female', name: '母親' });
            const kid = new Person({ id: 'route-kid', x: 500, y: 520, gender: 'male', name: '子女' });
            const blocker = new Person({ id: 'route-blocker', x: 500, y: 360, gender: 'same', name: '障礙人物' });
            const marriage = new Relationship({
                id: 'route-marriage', type: 'married',
                fromPersonId: dad.id, toPersonId: mom.id
            });
            const dadEdge = new Relationship({
                id: 'route-dad-edge', type: 'parent-child',
                fromPersonId: dad.id, toPersonId: kid.id
            });
            const momEdge = new Relationship({
                id: 'route-mom-edge', type: 'parent-child',
                fromPersonId: mom.id, toPersonId: kid.id
            });
            const farPeople = Array.from({ length: 40 }, (_, index) => new Person({
                id: `route-far-${index}`,
                x: 1800 + index * 80,
                y: 240 + (index % 3) * 120,
                gender: index % 2 === 0 ? 'male' : 'female',
                name: `遠方${index}`
            }));
            app.persons = [dad, mom, kid, blocker, ...farPeople];
            app._syncPersonMap();
            app.relationships = [marriage, dadEdge, momEdge];

            const initialPlanFamily = FamilyRoutePlanner.planFamily;
            let maxPlannerObstacleCount = 0;
            FamilyRoutePlanner.planFamily = function(input) {
                maxPlannerObstacleCount = Math.max(maxPlannerObstacleCount, input.obstacles.length);
                return initialPlanFamily.call(this, input);
            };
            app.render();
            FamilyRoutePlanner.planFamily = initialPlanFamily;

            const originalPlanFamily = FamilyRoutePlanner.planFamily;
            let repeatedRenderPlanCalls = 0;
            FamilyRoutePlanner.planFamily = function(...args) {
                repeatedRenderPlanCalls++;
                return originalPlanFamily.apply(this, args);
            };
            app.render();
            app.render();
            FamilyRoutePlanner.planFamily = originalPlanFamily;

            const emotional = new Relationship({
                id: 'route-emotional', type: 'conflict',
                fromPersonId: dad.id, toPersonId: blocker.id
            });
            app.relationships.push(emotional);
            app.render();
            const originalPrepareMarriageRoutes = app.canvas._prepareMarriageRoutes;
            let hiddenMarriagePrepareCalls = 0;
            app.canvas._prepareMarriageRoutes = function(...args) {
                hiddenMarriagePrepareCalls++;
                return originalPrepareMarriageRoutes.apply(this, args);
            };
            const originalViewOptions = app.viewOptions;
            app.viewOptions = { ...app.viewOptions, showEmotionalRelationships: false };
            app.render();
            app.render();
            app.viewOptions = originalViewOptions;
            app.canvas._prepareMarriageRoutes = originalPrepareMarriageRoutes;
            app.relationships.pop();
            app.render();

            const route = app.canvas.getRelationshipPath(dad, kid, dadEdge, app.relationships);
            const cached = app.canvas._familyRelationshipPaths &&
                app.canvas._familyRelationshipPaths.get(dadEdge.id);
            const obstacles = app.canvas.getPersonRouteObstacles(app.persons)
                .filter(rect => rect.ownerId === blocker.id);
            const plan = app.canvas._familyRoutePlans && app.canvas._familyRoutePlans[0];
            const allObstacles = app.canvas.getPersonRouteObstacles(app.persons);
            const otherRels = app.relationships.filter(rel => rel.getCategory() !== 'family');
            const marriageRoute = app.canvas.getMarriageRoute(
                dad, mom, marriage, otherRels);
            const familySource = app.canvas._getFamilySource(
                [dad, mom], [kid], otherRels, allObstacles).source;
            const attachmentMinX = Math.min(marriageRoute.attachmentSegment.start.x,
                marriageRoute.attachmentSegment.end.x);
            const attachmentMaxX = Math.max(marriageRoute.attachmentSegment.start.x,
                marriageRoute.attachmentSegment.end.x);

            // A middle symbol does not change the standard auto route. The family
            // source must still come from that direct route's canonical attachment.
            const bridgeDad = new Person({ id: 'bridge-route-dad', x: 240, y: 720,
                gender: 'male', name: '橋接父親' });
            const bridgeBlocker = new Person({ id: 'bridge-route-blocker', x: 500, y: 720,
                gender: 'same', name: '中間人物' });
            const bridgeMom = new Person({ id: 'bridge-route-mom', x: 760, y: 720,
                gender: 'female', name: '橋接母親' });
            const bridgeKid = new Person({ id: 'bridge-route-kid', x: 500, y: 900,
                gender: 'male', name: '橋接子女' });
            const bridgeMarriage = new Relationship({ id: 'bridge-route-marriage',
                type: 'married', fromPersonId: bridgeDad.id, toPersonId: bridgeMom.id,
                routeMode: 'auto' });
            const bridgeDadEdge = new Relationship({ id: 'bridge-route-dad-edge',
                type: 'parent-child', fromPersonId: bridgeDad.id, toPersonId: bridgeKid.id });
            const bridgeMomEdge = new Relationship({ id: 'bridge-route-mom-edge',
                type: 'parent-child', fromPersonId: bridgeMom.id, toPersonId: bridgeKid.id });
            const bridgePeople = [bridgeDad, bridgeBlocker, bridgeMom, bridgeKid];
            const bridgeRelationships = [bridgeMarriage, bridgeDadEdge, bridgeMomEdge];
            app.persons = bridgePeople;
            app.relationships = bridgeRelationships;
            app._syncPersonMap();
            app.render();
            const bridgeOtherRelationships = bridgeRelationships
                .filter(rel => rel.getCategory() !== 'family');
            const bridgeMarriageRoute = app.canvas.getMarriageRoute(
                bridgeDad, bridgeMom, bridgeMarriage, bridgeOtherRelationships);
            const bridgeConfig = app.canvas.getMarriageConfiguration(
                bridgeDad, bridgeMom, bridgeMarriage, bridgeOtherRelationships);
            const bridgePlan = app.canvas._familyRoutePlans && app.canvas._familyRoutePlans[0];
            const bridgeSource = bridgePlan?.sourcePath?.[0] || null;
            const bridgeAttachment = bridgeMarriageRoute.attachmentSegment;
            const bridgeAttachmentMinX = Math.min(bridgeAttachment.start.x, bridgeAttachment.end.x);
            const bridgeAttachmentMaxX = Math.max(bridgeAttachment.start.x, bridgeAttachment.end.x);
            app.persons = [dad, mom, kid, blocker, ...farPeople];
            app.relationships = [marriage, dadEdge, momEdge];
            app._syncPersonMap();
            app.render();
            const beforeColors = {
                familyStroke: '#333',
                married: marriage.getLineStyle().color,
                parentChild: dadEdge.getLineStyle().color
            };
            let exportOk = false;
            const exportPaths = [];
            const originalGetRelationshipPath = app.canvas.getRelationshipPath;
            app.canvas.getRelationshipPath = function(from, to, relationship, ...rest) {
                const path = originalGetRelationshipPath.call(this, from, to, relationship, ...rest);
                if (relationship?.id === dadEdge.id) {
                    exportPaths.push(path.map(point => ({ x: point.x, y: point.y })));
                }
                return path;
            };
            try {
                exportOk = /^data:image\/png;base64,/.test(
                    app.canvas.exportToPNG(app.persons, app.relationships, [], [], true, false, 1)
                );
            } catch (error) {
                exportOk = false;
            } finally {
                app.canvas.getRelationshipPath = originalGetRelationshipPath;
            }
            return {
                route,
                cached,
                obstacleCrossing: FamilyRoutePlanner.pathIntersectsObstacles(
                    route, obstacles, new Set([kid.id])
                ),
                mode: plan && plan.mode,
                safe: plan && plan.safe,
                repeatedRenderPlanCalls,
                hiddenMarriagePrepareCalls,
                maxPlannerObstacleCount,
                marriageRoute,
                familySource,
                sourceOnMarriageAttachment:
                    marriageRoute.attachmentSegment.start.y
                        === marriageRoute.attachmentSegment.end.y
                    && familySource.y === marriageRoute.attachmentSegment.start.y
                    && familySource.x >= attachmentMinX
                    && familySource.x <= attachmentMaxX,
                bridge: {
                    config: bridgeConfig,
                    route: bridgeMarriageRoute,
                    source: bridgeSource,
                    dadTop: bridgeDad.getConnectionPoint('top'),
                    momTop: bridgeMom.getConnectionPoint('top'),
                    sourceOnCanonicalAttachment: Boolean(bridgeSource)
                        && bridgeAttachment.start.y === bridgeAttachment.end.y
                        && bridgeSource.y === bridgeAttachment.start.y
                        && bridgeSource.x >= bridgeAttachmentMinX
                        && bridgeSource.x <= bridgeAttachmentMaxX
                },
                colors: beforeColors,
                exportOk,
                exportPathMatches: exportPaths.length > 0
                    && exportPaths.every(path => JSON.stringify(path) === JSON.stringify(route))
            };
        });

        check('draw and hit-test reuse the exact cached relationship path',
            JSON.stringify(data.route) === JSON.stringify(data.cached),
            JSON.stringify({ route: data.route, cached: data.cached }));
        // 固定走法（2026-10-27）：中間有人擋路也不繞，下垂點留在婚姻線中點，只回報 safe=false
        check('blocked central corridor keeps the fixed trunk and reports the crossing',
            data.safe === false && data.mode === 'normal-trunk' && data.obstacleCrossing
                && data.route.every(point => point.x === 500),
            JSON.stringify({ mode: data.mode, safe: data.safe, crossing: data.obstacleCrossing, route: data.route }));
        check('unchanged consecutive renders reuse the family route cache',
            data.repeatedRenderPlanCalls === 0,
            `planFamily calls=${data.repeatedRenderPlanCalls}`);
        check('hidden emotional relationships do not reprepare marriage routes per render',
            data.hiddenMarriagePrepareCalls === 0,
            `prepareMarriageRoutes calls=${data.hiddenMarriagePrepareCalls}`);
        check('far-away people are pruned from a normal family obstacle set',
            data.maxPlannerObstacleCount < 20,
            `planner obstacles=${data.maxPlannerObstacleCount}`);
        check('two-parent source lies on the canonical marriage attachment segment',
            data.sourceOnMarriageAttachment,
            JSON.stringify({ source: data.familySource,
                attachment: data.marriageRoute.attachmentSegment }));
        check('blocked auto-family source uses the canonical direct attachment',
            data.bridge.config.isArch !== true
                && data.bridge.config.isBridge !== true
                && data.bridge.config.needsBridge !== true
                && data.bridge.route.candidateName === 'direct'
                && data.bridge.route.points.length === 2
                && data.bridge.sourceOnCanonicalAttachment,
            JSON.stringify(data.bridge));
        check('family route contains only finite points',
            data.route.length >= 2 && data.route.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
        check('family route removes redundant points and remains orthogonal',
            isCleanOrthogonalPath(data.route), JSON.stringify(data.route));
        check('routing does not change clinical line colors',
            data.colors.familyStroke === '#333' && data.colors.parentChild === '#333333',
            JSON.stringify(data.colors));
        check('PNG export uses the same planner without throwing', data.exportOk);
        check('PNG export reuses the exact clean screen path', data.exportPathMatches);

        const incremental = await page.evaluate(() => {
            const app = window.app;
            const originalPersons = app.persons;
            const originalRelationships = app.relationships;
            const people = [
                new Person({ id: 'inc-a1', x: 280, y: 180, gender: 'male' }),
                new Person({ id: 'inc-a2', x: 400, y: 180, gender: 'female' }),
                new Person({ id: 'inc-c1', x: 340, y: 420, gender: 'male' }),
                new Person({ id: 'inc-b1', x: 880, y: 180, gender: 'male' }),
                new Person({ id: 'inc-b2', x: 1000, y: 180, gender: 'female' }),
                new Person({ id: 'inc-c2', x: 940, y: 420, gender: 'female' })
            ];
            const rel = (id, from, to, type) => new Relationship({
                id, fromPersonId: from, toPersonId: to, type
            });
            app.persons = people;
            app._syncPersonMap();
            app.relationships = [
                rel('inc-m1', 'inc-a1', 'inc-a2', 'married'),
                rel('inc-p1', 'inc-a1', 'inc-c1', 'parent-child'),
                rel('inc-p2', 'inc-a2', 'inc-c1', 'parent-child'),
                rel('inc-m2', 'inc-b1', 'inc-b2', 'married'),
                rel('inc-p3', 'inc-b1', 'inc-c2', 'parent-child'),
                rel('inc-p4', 'inc-b2', 'inc-c2', 'parent-child')
            ];
            app.render();

            const original = FamilyRoutePlanner.planFamily;
            let calls = 0;
            FamilyRoutePlanner.planFamily = function(...args) {
                calls++;
                return original.apply(this, args);
            };
            app.personMap.get('inc-c1').x += 20;
            app.render();
            FamilyRoutePlanner.planFamily = original;
            app.persons = originalPersons;
            app.relationships = originalRelationships;
            app._syncPersonMap();
            app.render();
            return calls;
        });
        check('moving one distant family only replans the affected family',
            incremental === 1,
            `planFamily calls=${incremental}`);

        const edgeModes = await page.evaluate(() => {
            const app = window.app;
            const parent = app.personMap.get('route-dad');
            const child = app.personMap.get('route-kid');
            const edge = app.relationships.find(rel => rel.id === 'route-dad-edge');
            const original = { parentY: parent.y, childX: child.x, childY: child.y };

            child.x = 440;
            child.y = 240;
            app.render();
            const sameRow = app.canvas.getRelationshipPath(parent, child, edge, app.relationships);

            child.x = 500;
            child.y = 60;
            app.render();
            const reversed = app.canvas.getRelationshipPath(parent, child, edge, app.relationships);

            parent.y = original.parentY;
            child.x = original.childX;
            child.y = original.childY;
            app.render();
            return { sameRow, reversed };
        });
        check('same-row route uses side ports and remains orthogonal',
            isCleanOrthogonalPath(edgeModes.sameRow));
        check('reversed route exits parent top and reaches child bottom without downward backtracking',
            isCleanOrthogonalPath(edgeModes.reversed)
                && edgeModes.reversed.every((point, index, points) =>
                    index === 0 || point.y <= points[index - 1].y));

        // 固定走法（2026-10-27）：下垂點固定在婚姻線中點、橫桿高度不隨子女移動；
        // 只有符號壓在婚姻線上的其他人才讓下垂點改到最近空位
        const fixed = await page.evaluate(() => {
            const app = window.app;
            const P = (id, x, y, gender) => new Person({ id, x, y, gender, name: id });
            const R = (id, type, from, to) => new Relationship({ id, type, fromPersonId: from, toPersonId: to });
            const dad = P('fx-dad', 400, 240, 'male');
            const mom = P('fx-mom', 600, 240, 'female');
            const kids = [P('fx-k1', 380, 360, 'male'), P('fx-k2', 620, 360, 'female')];
            const rels = [R('fx-mar', 'married', dad.id, mom.id)];
            kids.forEach(kid => {
                rels.push(R(`fx-d-${kid.id}`, 'parent-child', dad.id, kid.id));
                rels.push(R(`fx-m-${kid.id}`, 'parent-child', mom.id, kid.id));
            });
            const plan = () => {
                app.render();
                const p = app.canvas._familyRoutePlans.find(item => item.family.childIds.includes('fx-k1'));
                return { trunkX: p.trunkX, barY: p.barY, mode: p.mode };
            };
            app.persons = [dad, mom, ...kids];
            app.relationships = rels;
            app._syncPersonMap();
            const base = plan();
            kids[1].x = 900;
            kids[1].y = 600;
            const childMoved = plan();
            kids[0].y = 300;
            const childRaised = plan();
            kids[0].y = 360;
            kids[1].x = 620;
            kids[1].y = 360;
            const below = P('fx-below', 500, 330, 'same');
            app.persons.push(below);
            app._syncPersonMap();
            const blockerBelow = plan();
            below.y = 240;
            const blockerOnLine = plan();
            return { base, childMoved, childRaised, blockerBelow, blockerOnLine };
        });
        check('fixed trunk stays at the marriage midpoint and bar height ignores child moves',
            fixed.base.trunkX === 500 && fixed.childMoved.trunkX === 500
                && fixed.childMoved.barY === fixed.base.barY && fixed.childMoved.mode === 'normal-trunk',
            JSON.stringify(fixed));
        check('a child dragged above the bar raises it without switching route style',
            fixed.childRaised.mode === 'normal-trunk' && fixed.childRaised.trunkX === 500
                && fixed.childRaised.barY < fixed.base.barY,
            JSON.stringify(fixed.childRaised));
        check('only a person standing on the marriage line moves the drop point',
            fixed.blockerBelow.trunkX === 500 && fixed.blockerOnLine.trunkX !== 500,
            JSON.stringify({ below: fixed.blockerBelow, onLine: fixed.blockerOnLine }));

        // 2026-11-13（使用者選 B）：離婚斜線留在中點，下垂點不讓，正下方單一子女的子女線是一條直線
        const decorated = await page.evaluate(() => {
            const app = window.app;
            const dad = new Person({ id: 'dv-dad', x: 400, y: 240, gender: 'male' });
            const mom = new Person({ id: 'dv-mom', x: 600, y: 240, gender: 'female' });
            const kid = new Person({ id: 'dv-kid', x: 500, y: 360, gender: 'female' });
            const marriage = new Relationship({ id: 'dv-mar', type: 'divorced', fromPersonId: dad.id, toPersonId: mom.id });
            const edges = [dad, mom].map(p => new Relationship({
                id: `dv-${p.id}`, type: 'parent-child', fromPersonId: p.id, toPersonId: kid.id }));
            app.persons = [dad, mom, kid];
            app.relationships = [marriage, ...edges];
            app._syncPersonMap();
            app.render();
            const plan = app.canvas._familyRoutePlans.find(item => item.family.childIds.includes(kid.id));
            return {
                decoration: { ...app.canvas.marriageRouteCache.get('dv-mar').decoration },
                path: plan.relationshipPaths[`${dad.id}->${kid.id}`]
            };
        });
        check('a divorce slash stays at the midpoint and a single child line runs straight through it',
            decorated.decoration.x === 500
                && decorated.path.length === 2 && decorated.path.every(point => point.x === 500),
            JSON.stringify(decorated));
    }

    check('routing integration has no console or page errors', errors.length === 0, errors.join('; '));
    await browser.close();

    const failed = results.filter(result => !result.pass);
    console.log(`\n${results.length - failed.length}/${results.length} family routing checks passed`);
    if (failed.length) process.exit(1);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
