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

            const route = app.canvas.getRelationshipPath(dad, kid, dadEdge, app.relationships);
            const cached = app.canvas._familyRelationshipPaths &&
                app.canvas._familyRelationshipPaths.get(dadEdge.id);
            const obstacles = app.canvas.getPersonRouteObstacles(app.persons)
                .filter(rect => rect.ownerId === blocker.id);
            const plan = app.canvas._familyRoutePlans && app.canvas._familyRoutePlans[0];
            const beforeColors = {
                familyStroke: '#333',
                married: marriage.getLineStyle().color,
                parentChild: dadEdge.getLineStyle().color
            };
            let exportOk = false;
            try {
                exportOk = /^data:image\/png;base64,/.test(
                    app.canvas.exportToPNG(app.persons, app.relationships, [], [], true, false, 1)
                );
            } catch (error) {
                exportOk = false;
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
                maxPlannerObstacleCount,
                colors: beforeColors,
                exportOk
            };
        });

        check('draw and hit-test reuse the exact cached relationship path',
            JSON.stringify(data.route) === JSON.stringify(data.cached),
            JSON.stringify({ route: data.route, cached: data.cached }));
        check('blocked central corridor selects a safe non-crossing route',
            data.safe === true && data.mode === 'normal-trunk' && !data.obstacleCrossing,
            JSON.stringify({ mode: data.mode, safe: data.safe, crossing: data.obstacleCrossing }));
        check('unchanged consecutive renders reuse the family route cache',
            data.repeatedRenderPlanCalls === 0,
            `planFamily calls=${data.repeatedRenderPlanCalls}`);
        check('far-away people are pruned from a normal family obstacle set',
            data.maxPlannerObstacleCount < 20,
            `planner obstacles=${data.maxPlannerObstacleCount}`);
        check('family route contains only finite points',
            data.route.length >= 2 && data.route.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
        check('routing does not change clinical line colors',
            data.colors.familyStroke === '#333' && data.colors.parentChild === '#333333',
            JSON.stringify(data.colors));
        check('PNG export uses the same planner without throwing', data.exportOk);

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
            edgeModes.sameRow.length >= 2 && edgeModes.sameRow.every((point, index, points) =>
                index === 0 || point.x === points[index - 1].x || point.y === points[index - 1].y));
        check('reversed route exits parent top and reaches child bottom without downward backtracking',
            edgeModes.reversed.length >= 2 && edgeModes.reversed.every((point, index, points) =>
                index === 0 || point.y <= points[index - 1].y));
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
