/**
 * FamilyRoutePlanner pure-logic regression.
 * Usage: node refactor/verify_family_route_planner.js
 */
const assert = require('assert');
const FamilyRoutePlanner = require('../js/domain/family-route-planner.js');

const results = [];
function check(name, fn) {
    try {
        fn();
        results.push({ name, pass: true });
        console.log(`PASS | ${name}`);
    } catch (error) {
        results.push({ name, pass: false, error: error.message });
        console.error(`FAIL | ${name} | ${error.message}`);
    }
}

const baseInput = () => ({
    parents: [
        { id: 'dad', x: 440, y: 300 },
        { id: 'mom', x: 560, y: 300 }
    ],
    children: [{ id: 'kid', x: 500, y: 500 }],
    source: { x: 500, y: 300 },
    sourceRange: { minX: 465, maxX: 535 },
    obstacles: [],
    personSize: 50,
    margin: 10
});

function assertFinitePath(path) {
    assert.ok(Array.isArray(path) && path.length >= 2, 'path must contain at least two points');
    path.forEach(point => {
        assert.ok(Number.isFinite(point.x), `non-finite x: ${point.x}`);
        assert.ok(Number.isFinite(point.y), `non-finite y: ${point.y}`);
    });
}

check('normal family uses one shared deterministic trunk path', () => {
    const plan = FamilyRoutePlanner.planFamily(baseInput());
    assert.equal(plan.mode, 'normal-trunk');
    assert.equal(plan.safe, true);
    assert.deepEqual(plan.relationshipPaths['dad->kid'], plan.relationshipPaths['mom->kid']);
    assertFinitePath(plan.relationshipPaths['dad->kid']);
});

check('normal path is vertically monotonic and ends at the child top port', () => {
    const plan = FamilyRoutePlanner.planFamily(baseInput());
    const path = plan.relationshipPaths['dad->kid'];
    for (let i = 1; i < path.length; i++) {
        assert.ok(path[i].y >= path[i - 1].y, `${path[i - 1].y} -> ${path[i].y} backtracks`);
    }
    assert.deepEqual(path.at(-1), { x: 500, y: 475 });
});

check('a central obstacle selects a safe offset inside the marriage segment', () => {
    const input = baseInput();
    input.obstacles.push({
        ownerId: 'other', kind: 'symbol',
        left: 488, right: 512, top: 330, bottom: 430
    });
    const plan = FamilyRoutePlanner.planFamily(input);
    assert.equal(plan.safe, true);
    assert.notEqual(plan.trunkX, 500);
    assert.ok(plan.trunkX >= 465 && plan.trunkX <= 535);
    assert.equal(
        FamilyRoutePlanner.pathIntersectsObstacles(
            plan.relationshipPaths['dad->kid'], input.obstacles, new Set(['kid'])
        ),
        false
    );
});

check('an unrelated parent label does not push a clear central trunk downward', () => {
    const input = baseInput();
    input.obstacles.push({
        ownerId: 'dad', kind: 'text',
        left: 400, right: 460, top: 333, bottom: 385
    });
    const plan = FamilyRoutePlanner.planFamily(input);
    assert.equal(plan.safe, true);
    assert.equal(plan.trunkX, 500);
    assert.equal(plan.sourcePath[0].y, 300);
});

check('reversed generations use a finite upward orthogonal route', () => {
    const input = baseInput();
    input.parents = [
        { id: 'dad', x: 440, y: 420 },
        { id: 'mom', x: 560, y: 420 }
    ];
    input.children = [{ id: 'kid', x: 500, y: 180 }];
    delete input.source;
    delete input.sourceRange;
    const plan = FamilyRoutePlanner.planFamily(input);
    assert.equal(plan.mode, 'reversed');
    const path = plan.relationshipPaths['dad->kid'];
    assertFinitePath(path);
    assert.deepEqual(path[0], { x: 440, y: 395 });
    assert.deepEqual(path.at(-1), { x: 500, y: 205 });
    for (let i = 1; i < path.length; i++) {
        assert.ok(path[i].y <= path[i - 1].y, `${path[i - 1].y} -> ${path[i].y} reverses upward flow`);
        assert.ok(path[i].x === path[i - 1].x || path[i].y === path[i - 1].y, 'route is not orthogonal');
    }
});

check('same-row generations connect through side ports without crossing symbol centers', () => {
    const input = baseInput();
    input.parents = [{ id: 'dad', x: 300, y: 300 }];
    input.children = [{ id: 'kid', x: 500, y: 300 }];
    delete input.source;
    delete input.sourceRange;
    const plan = FamilyRoutePlanner.planFamily(input);
    assert.equal(plan.mode, 'same-row');
    const path = plan.relationshipPaths['dad->kid'];
    assertFinitePath(path);
    assert.deepEqual(path[0], { x: 325, y: 300 });
    assert.deepEqual(path.at(-1), { x: 475, y: 300 });
});

check('mixed twins keep one clinical V origin and finite child endpoints', () => {
    const input = baseInput();
    input.children = [
        { id: 't1', x: 460, y: 500, twinGroup: 'tw-a', zygosity: 'mono' },
        { id: 't2', x: 540, y: 500, twinGroup: 'tw-a', zygosity: 'mono' }
    ];
    const plan = FamilyRoutePlanner.planFamily(input);
    assert.equal(plan.mode, 'normal-trunk');
    assert.equal(plan.twinGroups.length, 1);
    assert.equal(plan.twinGroups[0].paths.length, 2);
    assert.ok(plan.twinGroups[0].monoBar);
    assertFinitePath(plan.relationshipPaths['dad->t1']);
    assertFinitePath(plan.relationshipPaths['mom->t2']);
});

check('degenerate and fully blocked input returns a finite bounded fallback', () => {
    const input = baseInput();
    input.children = [{ id: 'kid', x: 500, y: 326 }];
    input.obstacles = [{ ownerId: 'wall', kind: 'symbol', left: 0, right: 1000, top: 250, bottom: 400 }];
    const plan = FamilyRoutePlanner.planFamily(input);
    assert.equal(plan.safe, false);
    assert.ok(plan.collisions.length > 0);
    assertFinitePath(plan.relationshipPaths['dad->kid']);
});

check('same input produces byte-identical point sequences', () => {
    const input = baseInput();
    input.obstacles.push({ ownerId: 'other', kind: 'text', left: 488, right: 512, top: 330, bottom: 430 });
    const first = JSON.stringify(FamilyRoutePlanner.planFamily(input));
    const second = JSON.stringify(FamilyRoutePlanner.planFamily(input));
    const third = JSON.stringify(FamilyRoutePlanner.planFamily(input));
    assert.equal(first, second);
    assert.equal(second, third);
});

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} planner checks passed`);
if (failed.length) process.exit(1);
