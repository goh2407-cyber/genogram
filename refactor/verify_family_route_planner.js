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

function assertCleanPath(path) {
    assertFinitePath(path);
    const degenerateFallback = path.length === 2
        && path[0].x === path[1].x && path[0].y === path[1].y;
    for (let index = 1; index < path.length; index++) {
        const previous = path[index - 1];
        const point = path[index];
        if (!degenerateFallback) {
            assert.ok(previous.x !== point.x || previous.y !== point.y,
                `consecutive duplicate at ${index}: ${JSON.stringify(point)}`);
        }
    }
    for (let index = 1; index < path.length - 1; index++) {
        const a = path[index - 1];
        const b = path[index];
        const c = path[index + 1];
        const horizontal = a.y === b.y && b.y === c.y
            && b.x >= Math.min(a.x, c.x) && b.x <= Math.max(a.x, c.x);
        const vertical = a.x === b.x && b.x === c.x
            && b.y >= Math.min(a.y, c.y) && b.y <= Math.max(a.y, c.y);
        assert.ok(!horizontal && !vertical,
            `redundant collinear point at ${index}: ${JSON.stringify(path)}`);
    }
}

function assertCleanPlan(plan) {
    const paths = [
        plan.sourcePath,
        plan.barPath,
        ...Object.values(plan.childPaths || {}),
        ...Object.values(plan.relationshipPaths || {}),
        ...(plan.twinGroups || []).flatMap(group => [
            ...(group.paths || []).map(item => item.points),
            group.monoBar
        ])
    ].filter(path => Array.isArray(path) && path.length > 0);
    paths.forEach(assertCleanPath);
}

function planFamily(input) {
    const plan = FamilyRoutePlanner.planFamily(input);
    assertCleanPlan(plan);
    return plan;
}

check('cleanPath drops non-finite and consecutive duplicate points', () => {
    assert.deepEqual(FamilyRoutePlanner.cleanPath([
        { x: 0, y: 0 }, { x: NaN, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 0 }
    ]), [{ x: 0, y: 0 }, { x: 20, y: 0 }]);
});

check('cleanPath removes horizontal and vertical middle points', () => {
    assert.deepEqual(FamilyRoutePlanner.cleanPath([
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 },
        { x: 20, y: 10 }, { x: 20, y: 20 }
    ]), [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }]);
});

check('cleanPath preserves a collinear reversal waypoint', () => {
    assert.deepEqual(FamilyRoutePlanner.cleanPath([
        { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 0 }
    ]), [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 0 }]);
});

check('cleanPath duplicates a single valid point fallback', () => {
    assert.deepEqual(FamilyRoutePlanner.cleanPath([{ x: 4, y: 7 }]),
        [{ x: 4, y: 7 }, { x: 4, y: 7 }]);
});

check('normal family uses one shared deterministic trunk path', () => {
    const plan = planFamily(baseInput());
    assert.equal(plan.mode, 'normal-trunk');
    assert.equal(plan.safe, true);
    assert.deepEqual(plan.relationshipPaths['dad->kid'], plan.relationshipPaths['mom->kid']);
    assertFinitePath(plan.relationshipPaths['dad->kid']);
});

check('normal path is vertically monotonic and ends at the child top port', () => {
    const plan = planFamily(baseInput());
    const path = plan.relationshipPaths['dad->kid'];
    for (let i = 1; i < path.length; i++) {
        assert.ok(path[i].y >= path[i - 1].y, `${path[i - 1].y} -> ${path[i].y} backtracks`);
    }
    assert.deepEqual(path.at(-1), { x: 500, y: 475 });
});

check('sibling bar stays below the parents symbol safety boundary', () => {
    const input = baseInput();
    input.children = [
        { id: 'left', x: 400, y: 500 },
        { id: 'right', x: 600, y: 500 }
    ];
    input.obstacles = [
        { ownerId: 'dad', kind: 'symbol', left: 405, right: 475, top: 265, bottom: 335 },
        { ownerId: 'mom', kind: 'symbol', left: 525, right: 595, top: 265, bottom: 335 }
    ];
    const plan = planFamily(input);
    assert.equal(plan.safe, true);
    assert.ok(plan.barY >= 335, `barY ${plan.barY} enters the parent safety band`);
});

check('a central obstacle selects a safe offset inside the marriage segment', () => {
    const input = baseInput();
    input.obstacles.push({
        ownerId: 'other', kind: 'symbol',
        left: 488, right: 512, top: 330, bottom: 430
    });
    const plan = planFamily(input);
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

check('touching a safety-margin boundary is allowed but entering its interior is blocked', () => {
    const obstacle = [{ ownerId: 'other', kind: 'symbol', left: 465, right: 535, top: 325, bottom: 395 }];
    assert.equal(
        FamilyRoutePlanner.pathIntersectsObstacles(
            [{ x: 465, y: 300 }, { x: 465, y: 450 }], obstacle
        ),
        false
    );
    assert.equal(
        FamilyRoutePlanner.pathIntersectsObstacles(
            [{ x: 466, y: 300 }, { x: 466, y: 450 }], obstacle
        ),
        true
    );
});

check('an unrelated parent label does not push a clear central trunk downward', () => {
    const input = baseInput();
    input.obstacles.push({
        ownerId: 'dad', kind: 'text',
        left: 400, right: 460, top: 333, bottom: 385
    });
    const plan = planFamily(input);
    assert.equal(plan.safe, true);
    assert.equal(plan.trunkX, 500);
    assert.equal(plan.sourcePath[0].y, 300);
});

check('single-parent side prefix stays connected while routing outside the name box', () => {
    const input = {
        parents: [{ id: 'parent', x: 300, y: 300 }],
        children: [{ id: 'kid', x: 300, y: 500 }],
        source: { x: 350, y: 300 },
        sourceRange: { minX: 350, maxX: 350 },
        sourcePrefix: [{ x: 325, y: 300 }, { x: 350, y: 300 }],
        obstacles: [{ ownerId: 'parent', kind: 'text', left: 260, right: 340, top: 330, bottom: 385 }],
        personSize: 50,
        margin: 10
    };
    const plan = planFamily(input);
    assert.equal(plan.safe, true);
    assert.deepEqual(plan.relationshipPaths['parent->kid'][0], { x: 325, y: 300 });
    assert.equal(
        FamilyRoutePlanner.pathIntersectsObstacles(
            plan.relationshipPaths['parent->kid'], input.obstacles, new Set(['kid'])
        ),
        false
    );
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
    const plan = planFamily(input);
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
    const plan = planFamily(input);
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
    const plan = planFamily(input);
    assert.equal(plan.mode, 'normal-trunk');
    assert.equal(plan.twinGroups.length, 1);
    assert.equal(plan.twinGroups[0].paths.length, 2);
    assert.ok(plan.twinGroups[0].monoBar);
    assertFinitePath(plan.relationshipPaths['dad->t1']);
    assertFinitePath(plan.relationshipPaths['mom->t2']);
});

check('vertically staggered children receive separate safe branches before any person moves', () => {
    const input = baseInput();
    input.parents = [
        { id: 'dad', x: 400, y: 180 },
        { id: 'mom', x: 560, y: 180 }
    ];
    input.children = [
        { id: 'near', x: 400, y: 300 },
        { id: 'far', x: 400, y: 420 }
    ];
    input.source = { x: 425, y: 180 };
    input.sourceRange = { minX: 425, maxX: 535 };
    input.obstacles = [
        { ownerId: 'near', kind: 'symbol', left: 365, right: 435, top: 265, bottom: 335 },
        { ownerId: 'far', kind: 'symbol', left: 365, right: 435, top: 385, bottom: 455 }
    ];
    const plan = planFamily(input);
    assert.equal(plan.mode, 'staggered');
    assert.equal(plan.safe, true);
    assertFinitePath(plan.relationshipPaths['dad->near']);
    assertFinitePath(plan.relationshipPaths['dad->far']);
    assert.equal(
        FamilyRoutePlanner.pathIntersectsObstacles(
            plan.relationshipPaths['dad->far'],
            input.obstacles,
            new Set(['far'])
        ),
        false
    );
});

check('degenerate and fully blocked input returns a finite bounded fallback', () => {
    const input = baseInput();
    input.children = [{ id: 'kid', x: 500, y: 326 }];
    input.obstacles = [{ ownerId: 'wall', kind: 'symbol', left: 0, right: 1000, top: 250, bottom: 400 }];
    const plan = planFamily(input);
    assert.equal(plan.safe, false);
    assert.ok(plan.collisions.length > 0);
    assertFinitePath(plan.relationshipPaths['dad->kid']);
});

check('same input produces byte-identical point sequences', () => {
    const input = baseInput();
    input.obstacles.push({ ownerId: 'other', kind: 'text', left: 488, right: 512, top: 330, bottom: 430 });
    const first = JSON.stringify(planFamily(input));
    const second = JSON.stringify(planFamily(input));
    const third = JSON.stringify(planFamily(input));
    assert.equal(first, second);
    assert.equal(second, third);
});

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} planner checks passed`);
if (failed.length) process.exit(1);
