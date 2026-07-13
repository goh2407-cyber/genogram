/**
 * Smart-placement pure logic verification.
 * Usage: node refactor/verify_placement.js --logic
 */
const { chromium } = require('playwright');
const path = require('path');

const results = [];
function assert(name, condition, detail = '') {
    results.push({ name, pass: Boolean(condition), detail });
    console.log(`${condition ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.KinshipEngine);
    await page.waitForTimeout(100);

    const data = await page.evaluate(() => {
        const app = window.app;
        app.persons = [];
        app.relationships = [];
        app._syncPersonMap();

        const grid = GenogramApp.GRID;
        const base = new Person({ id: 'base', x: grid.ORIGIN_X + grid.CELL_WIDTH * 3, y: app.getGenerationYByIndex(1) });
        const spouse = new Person({ id: 'spouse', x: base.x - grid.CELL_WIDTH, y: base.y });
        const parentA = new Person({ id: 'parent-a', x: base.x - grid.CELL_WIDTH, y: app.getGenerationYByIndex(0) });
        const parentB = new Person({ id: 'parent-b', x: base.x + grid.CELL_WIDTH, y: app.getGenerationYByIndex(0) });
        const blocker = new Person({ id: 'blocker', x: base.x + grid.CELL_WIDTH, y: base.y });
        app.persons.push(base, spouse, parentA, parentB, blocker);
        app.relationships.push(
            new Relationship({ type: 'married', fromPersonId: base.id, toPersonId: spouse.id }),
            new Relationship({ type: 'parent-child', fromPersonId: parentA.id, toPersonId: base.id }),
            new Relationship({ type: 'parent-child', fromPersonId: parentB.id, toPersonId: base.id })
        );
        app._syncPersonMap();

        const partner = app.getPlacementCandidate({ kind: 'partner', basePersonId: base.id });
        const child = app.getPlacementCandidate({ kind: 'child', basePersonId: base.id });
        const parent = app.getPlacementCandidate({ kind: 'parent', basePersonId: base.id });
        const sibling = app.getPlacementCandidate({ kind: 'sibling', basePersonId: base.id });
        const positionsBefore = app.persons.map(p => `${p.id}:${p.x},${p.y}`).sort();

        app.persons.reverse();
        const reorderedChild = app.getPlacementCandidate({ kind: 'child', basePersonId: base.id });
        const positionsAfter = app.persons.map(p => `${p.id}:${p.x},${p.y}`).sort();
        const free = app.findNearestOpenCell(base.x + grid.CELL_WIDTH, base.y);
        const person = app.getPlacementCandidate({ kind: 'person', x: grid.ORIGIN_X + grid.CELL_WIDTH * 1.6, y: grid.ORIGIN_Y + grid.CELL_HEIGHT * 2.4 });

        return { grid, base, spouse, partner, child, parent, sibling, reorderedChild,
            positionsBefore, positionsAfter, free, person };
    });

    const { grid, base, spouse } = data;
    assert('partner shares base row', data.partner.y === base.y);
    assert('occupied partner choice falls back to nearest free same-row cell', data.partner.x === base.x + grid.CELL_WIDTH * 2,
        `x=${data.partner.x}`);
    assert('occupied first choice is reported', data.partner.occupied === true);
    assert('child uses next generation row', data.child.y === grid.ORIGIN_Y + 2 * grid.CELL_HEIGHT);
    assert('child uses base/spouse midpoint', data.child.x === (base.x + spouse.x) / 2);
    assert('parent uses previous generation row', data.parent.y === grid.ORIGIN_Y);
    assert('sibling shares base row', data.sibling.y === base.y);
    assert('placement never moves existing people', JSON.stringify(data.positionsBefore) === JSON.stringify(data.positionsAfter));
    assert('reordered persons still resolve through personMap', data.reorderedChild.x === data.child.x && data.reorderedChild.y === data.child.y);
    assert('open-cell search follows deterministic offsets until free', data.free.x === base.x + grid.CELL_WIDTH * 2 && data.free.y === base.y);
    assert('child preview is parent to child', data.child.relationshipPreview.length === 2 &&
        data.child.relationshipPreview.every(r => r.type === 'parent-child' && r.toPersonId !== base.id) &&
        data.child.relationshipPreview.some(r => r.fromPersonId === base.id) &&
        data.child.relationshipPreview.some(r => r.fromPersonId === spouse.id));
    assert('parent preview is parent to child', data.parent.relationshipPreview.length === 1 &&
        data.parent.relationshipPreview[0].fromPersonId !== base.id && data.parent.relationshipPreview[0].toPersonId === base.id);
    assert('sibling preview reuses shared parents in parent-to-child direction', data.sibling.relationshipPreview.length === 2 &&
        data.sibling.relationshipPreview.every(r => r.fromPersonId === 'parent-a' || r.fromPersonId === 'parent-b') &&
        data.sibling.relationshipPreview.every(r => r.toPersonId !== base.id));
    assert('general person snaps pointer to nearest grid cell', data.person.x === grid.ORIGIN_X + grid.CELL_WIDTH * 2 &&
        data.person.y === grid.ORIGIN_Y + grid.CELL_HEIGHT * 2);
    assert('general person has no relationship preview', data.person.relationshipPreview.length === 0);
    assert('candidate guides match alignment-guide shape', data.child.guides && 'x' in data.child.guides && 'y' in data.child.guides && 'spacing' in data.child.guides);
    assert('no page errors', errors.length === 0, errors.join('; '));

    await browser.close();
    const failed = results.filter(result => !result.pass);
    console.log(`\n${results.length - failed.length}/${results.length} placement checks passed`);
    process.exit(failed.length ? 1 : 0);
})().catch(error => {
    console.error('FAIL | placement verification crashed | ' + error.stack);
    process.exit(1);
});
