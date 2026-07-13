/**
 * Smart-placement pure logic verification.
 * Usage: node refactor/verify_placement.js --logic|--overlay
 */
const { chromium } = require('playwright');
const path = require('path');

const results = [];
function assert(name, condition, detail = '') {
    results.push({ name, pass: Boolean(condition), detail });
    console.log(`${condition ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}

(async () => {
    const overlayMode = process.argv.includes('--overlay');
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
        const selectedSpouse = new Person({ id: 'selected-spouse', x: base.x + grid.CELL_WIDTH * 2, y: base.y });
        const parentA = new Person({ id: 'parent-a', x: base.x - grid.CELL_WIDTH, y: app.getGenerationYByIndex(0) });
        const parentB = new Person({ id: 'parent-b', x: base.x + grid.CELL_WIDTH, y: app.getGenerationYByIndex(0) });
        const blocker = new Person({ id: 'blocker', x: base.x + grid.CELL_WIDTH, y: base.y });
        app.persons.push(base, spouse, selectedSpouse, parentA, parentB, blocker);
        const firstMarriage = new Relationship({ type: 'married', fromPersonId: base.id, toPersonId: spouse.id });
        const selectedMarriage = new Relationship({ type: 'married', fromPersonId: base.id, toPersonId: selectedSpouse.id });
        app.relationships.push(
            firstMarriage,
            selectedMarriage,
            new Relationship({ type: 'parent-child', fromPersonId: parentA.id, toPersonId: base.id }),
            new Relationship({ type: 'parent-child', fromPersonId: parentB.id, toPersonId: base.id })
        );
        app.selectedRelationshipId = selectedMarriage.id;
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

        const tieY = grid.ORIGIN_Y + grid.CELL_HEIGHT * 8;
        const tieX = grid.ORIGIN_X + grid.CELL_WIDTH * 20;
        const tieCenter = new Person({ id: 'tie-center', x: tieX, y: tieY });
        app.persons.push(tieCenter);
        app.personMap.set(tieCenter.id, tieCenter);
        const leftTie = app.findNearestOpenCell(tieX, tieY);
        const extraBlockers = [
            new Person({ id: 'tie-left-1', x: tieX - grid.CELL_WIDTH, y: tieY }),
            new Person({ id: 'tie-right-1', x: tieX + grid.CELL_WIDTH, y: tieY }),
            new Person({ id: 'tie-left-2', x: tieX - grid.CELL_WIDTH * 2, y: tieY })
        ];
        app.persons.push(...extraBlockers);
        extraBlockers.forEach(p => app.personMap.set(p.id, p));
        const consecutive = app.findNearestOpenCell(tieX, tieY);

        const begun = app.beginPlacement({ kind: 'partner', basePersonId: base.id, personId: 'ghost-id' });
        const begunSnapshot = JSON.parse(JSON.stringify(begun));
        const updated = app.updatePlacement(grid.ORIGIN_X + 1.7 * grid.CELL_WIDTH, grid.ORIGIN_Y + 2.2 * grid.CELL_HEIGHT);
        const updatedSnapshot = JSON.parse(JSON.stringify({ updated, session: app.placementSession }));
        const bypassed = app.updatePlacement(123.25, 456.75, true);
        const bypassedSnapshot = JSON.parse(JSON.stringify({ bypassed, session: app.placementSession }));
        app.cancelPlacement();
        const afterCancel = app.placementSession;
        app.beginPlacement({ kind: 'parent', basePersonId: base.id, personId: 'commit-ghost' });
        const committed = app.commitPlacement();
        const afterCommit = app.placementSession;

        return { grid, base, spouse, selectedSpouse, partner, child, parent, sibling, reorderedChild,
            positionsBefore, positionsAfter, free, person, leftTie, consecutive,
            begunSnapshot, updatedSnapshot, bypassedSnapshot, afterCancel, committed, afterCommit };
    });

    const { grid, base, spouse } = data;
    assert('partner shares base row', data.partner.y === base.y);
    assert('occupied partner choice falls back to nearest free same-row cell', data.partner.x === base.x + grid.CELL_WIDTH * 3,
        `x=${data.partner.x}`);
    assert('occupied first choice is reported', data.partner.occupied === true);
    assert('child uses next generation row', data.child.y === grid.ORIGIN_Y + 2 * grid.CELL_HEIGHT);
    assert('child uses selected marriage spouse midpoint', data.child.x === (base.x + data.selectedSpouse.x) / 2,
        `x=${data.child.x}`);
    assert('parent uses previous generation row', data.parent.y === grid.ORIGIN_Y);
    assert('sibling shares base row', data.sibling.y === base.y);
    assert('placement never moves existing people', JSON.stringify(data.positionsBefore) === JSON.stringify(data.positionsAfter));
    assert('reordered persons still resolve through personMap', data.reorderedChild.x === data.child.x && data.reorderedChild.y === data.child.y);
    assert('open-cell search follows deterministic offsets until free', data.free.x === base.x + grid.CELL_WIDTH * 3 && data.free.y === base.y);
    assert('child preview is parent to child', data.child.relationshipPreview.length === 2 &&
        data.child.relationshipPreview.every(r => r.type === 'parent-child' && r.toPersonId !== base.id) &&
        data.child.relationshipPreview.some(r => r.fromPersonId === base.id) &&
        data.child.relationshipPreview.some(r => r.fromPersonId === data.selectedSpouse.id) &&
        !data.child.relationshipPreview.some(r => r.fromPersonId === spouse.id));
    assert('parent preview is parent to child', data.parent.relationshipPreview.length === 1 &&
        data.parent.relationshipPreview[0].fromPersonId !== base.id && data.parent.relationshipPreview[0].toPersonId === base.id);
    assert('sibling preview reuses shared parents in parent-to-child direction', data.sibling.relationshipPreview.length === 2 &&
        data.sibling.relationshipPreview.every(r => r.fromPersonId === 'parent-a' || r.fromPersonId === 'parent-b') &&
        data.sibling.relationshipPreview.every(r => r.toPersonId !== base.id));
    assert('general person snaps pointer to nearest grid cell', data.person.x === grid.ORIGIN_X + grid.CELL_WIDTH * 2 &&
        data.person.y === grid.ORIGIN_Y + grid.CELL_HEIGHT * 2);
    assert('general person has no relationship preview', data.person.relationshipPreview.length === 0);
    assert('candidate guides expose x/y objects at candidate position', data.child.guides &&
        data.child.guides.x && data.child.guides.x.pos === data.child.x &&
        data.child.guides.y && data.child.guides.y.pos === data.child.y &&
        data.child.guides.spacing === null);
    assert('open-cell tie chooses left before right', data.leftTie.x === data.grid.ORIGIN_X + data.grid.CELL_WIDTH * 19);
    assert('open-cell skips consecutive blockers in 0,-1,+1,-2,+2 order',
        data.consecutive.x === data.grid.ORIGIN_X + data.grid.CELL_WIDTH * 22);
    assert('beginPlacement stores request, candidate, and matching ghost', data.begunSnapshot.request.personId === 'ghost-id' &&
        data.begunSnapshot.ghostPerson.id === 'ghost-id' &&
        data.begunSnapshot.ghostPerson.x === data.begunSnapshot.candidate.x &&
        data.begunSnapshot.ghostPerson.y === data.begunSnapshot.candidate.y);
    assert('updatePlacement snaps and synchronizes candidate/ghost',
        data.updatedSnapshot.updated.x === data.updatedSnapshot.session.candidate.x &&
        data.updatedSnapshot.updated.y === data.updatedSnapshot.session.candidate.y &&
        data.updatedSnapshot.session.ghostPerson.x === data.updatedSnapshot.updated.x &&
        data.updatedSnapshot.session.ghostPerson.y === data.updatedSnapshot.updated.y);
    assert('updatePlacement bypassSnap preserves exact coordinates', data.bypassedSnapshot.bypassed.x === 123.25 &&
        data.bypassedSnapshot.bypassed.y === 456.75 && data.bypassedSnapshot.bypassed.guides === null &&
        data.bypassedSnapshot.session.ghostPerson.x === 123.25 && data.bypassedSnapshot.session.ghostPerson.y === 456.75);
    assert('cancelPlacement clears session', data.afterCancel === null);
    assert('commitPlacement returns session and clears state', data.committed &&
        data.committed.ghostPerson.id === 'commit-ghost' && data.afterCommit === null);

    if (overlayMode) {
        const overlay = await page.evaluate(async () => {
            const app = window.app;
            const grid = GenogramApp.GRID;
            const base = new Person({ id: 'overlay-base', gender: 'male', name: 'Base',
                x: grid.ORIGIN_X + grid.CELL_WIDTH * 2, y: grid.ORIGIN_Y + grid.CELL_HEIGHT * 2 });
            app.persons = [base];
            app.relationships = [];
            app.households = [];
            app.lifeCircles = [];
            app.selectedPersonId = null;
            app.selectedRelationshipId = null;
            app.selectedPersonIds = [];
            app._syncPersonMap();
            app.cancelPlacement();
            app.render();

            const canvas = app.canvas.canvas;
            const ctx = canvas.getContext('2d');
            const before = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const exportBefore = app.canvas.exportToPNG(app.persons, app.relationships, [], [], false, false, 1);

            const session = app.beginPlacement({
                kind: 'partner', basePersonId: base.id, personId: 'overlay-ghost'
            });
            app.render();
            const after = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const exportDuring = app.canvas.exportToPNG(app.persons, app.relationships, [], [], false, false, 1);

            // Isolate the cell layer so ghost pixels are proven independently.
            app.cancelPlacement();
            app.render();
            app.canvas.drawPlacementCell(session.candidate);
            const cellOnly = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let ghostOnlyPixels = 0;
            for (let i = 0; i < after.length; i += 4) {
                if (after[i] !== cellOnly[i] || after[i + 1] !== cellOnly[i + 1] || after[i + 2] !== cellOnly[i + 2]) ghostOnlyPixels++;
            }

            // The partner preview must create neutral dashed pixels around the endpoint midpoint.
            const sx = p => Math.round(p.x * app.canvas.scale + app.canvas.offsetX);
            const sy = p => Math.round(p.y * app.canvas.scale + app.canvas.offsetY);
            const midX = sx({ x: (base.x + session.candidate.x) / 2 });
            const midY = sy({ y: (base.y + session.candidate.y) / 2 });
            let relationshipPixels = 0;
            for (let y = midY - 5; y <= midY + 5; y++) for (let x = midX - 8; x <= midX + 8; x++) {
                const i = (y * canvas.width + x) * 4;
                if (after[i] !== cellOnly[i] || after[i + 1] !== cellOnly[i + 1] || after[i + 2] !== cellOnly[i + 2]) relationshipPixels++;
            }

            // Occupied marker has pixels beyond the ordinary cell/cross layer.
            app.cancelPlacement();
            app.render();
            app.canvas.drawPlacementCell({ ...session.candidate, occupied: false });
            const availableCell = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            app.render();
            app.canvas.drawPlacementCell({ ...session.candidate, occupied: true });
            const occupiedCell = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let unavailableMarkerPixels = 0;
            for (let i = 0; i < occupiedCell.length; i += 4) {
                if (occupiedCell[i] !== availableCell[i] || occupiedCell[i + 1] !== availableCell[i + 1] || occupiedCell[i + 2] !== availableCell[i + 2]) unavailableMarkerPixels++;
            }

            const childCandidate = app.getPlacementCandidate({ kind: 'child', basePersonId: base.id, personId: 'child-ghost' });
            const childGhost = { id: 'child-ghost', x: childCandidate.x, y: childCandidate.y };
            app.render();
            app.canvas.drawPlacementCell(childCandidate);
            const childCellOnly = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            app.render();
            app.canvas.drawPlacementPreview({ ...childCandidate, ghostPerson: childGhost });
            const childFull = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const childMidX = sx({ x: (base.x + childCandidate.x) / 2 });
            const childMidY = sy({ y: (base.y + childCandidate.y) / 2 });
            let childRelationshipPixels = 0;
            for (let y = childMidY - 8; y <= childMidY + 8; y++) for (let x = childMidX - 8; x <= childMidX + 8; x++) {
                const i = (y * canvas.width + x) * 4;
                if (childFull[i] !== childCellOnly[i] || childFull[i + 1] !== childCellOnly[i + 1] || childFull[i + 2] !== childCellOnly[i + 2]) childRelationshipPixels++;
            }

            let brandPixels = 0;
            for (let i = 0; i < after.length; i += 4) {
                if (after[i] > 200 && after[i + 1] < 90 && after[i + 2] > 60 && after[i + 2] < 150 && after[i + 3] > 0) brandPixels++;
            }

            const stateCtx = app.canvas.ctx;
            stateCtx.globalAlpha = 0.73;
            stateCtx.lineCap = 'square';
            stateCtx.lineWidth = 7;
            stateCtx.strokeStyle = '#123456';
            stateCtx.fillStyle = '#654321';
            stateCtx.setLineDash([9, 4]);
            app.canvas.drawPlacementPreview({ ...session.candidate, ghostPerson: session.ghostPerson });
            const restored = stateCtx.globalAlpha === 0.73 && stateCtx.lineCap === 'square' &&
                stateCtx.lineWidth === 7 && stateCtx.strokeStyle === '#123456' &&
                stateCtx.fillStyle === '#654321' && JSON.stringify(stateCtx.getLineDash()) === JSON.stringify([9, 4]);

            // Only the explicitly supplied ghost id may stand in for a missing endpoint.
            const lineEndpoints = [];
            const originalLineTo = stateCtx.lineTo;
            stateCtx.lineTo = function(x, y) { lineEndpoints.push([x, y]); return originalLineTo.call(this, x, y); };
            app.canvas.drawPlacementPreview({ ...session.candidate, ghostPerson: session.ghostPerson,
                relationshipPreview: [{ type: 'parent-child', fromPersonId: 'stale-id', toPersonId: base.id }] });
            stateCtx.lineTo = originalLineTo;
            const staleEndpointSkipped = !lineEndpoints.some(([x, y]) => x === base.x && y === base.y);

            // All raster-backed export entry points must bypass the editor overlay.
            let exportOverlayCalls = 0;
            const originalDrawPreview = app.canvas.drawPlacementPreview;
            app.canvas.drawPlacementPreview = () => { exportOverlayCalls++; };
            app.beginPlacement({ kind: 'partner', basePersonId: base.id, personId: 'export-ghost' });
            const jpegDuring = app.canvas.exportToJPEG(app.persons, app.relationships, [], [], 0.92, false, false, 1);
            let svgResult = null;
            let pdfResult = null;
            const originalExportSVG = app.storage.exportSVG;
            const originalExportPDF = app.storage.exportPDF;
            app.storage.exportSVG = content => { svgResult = content; };
            app.storage.exportPDF = dataUrl => { pdfResult = dataUrl; };
            app.exportSVG(false, false, 1);
            app.exportPDF(false, false, 1);
            await new Promise(resolve => setTimeout(resolve, 100));
            app.storage.exportSVG = originalExportSVG;
            app.storage.exportPDF = originalExportPDF;
            app.canvas.drawPlacementPreview = originalDrawPreview;

            app.cancelPlacement();
            app.render();
            const exportAfterCancel = app.canvas.exportToPNG(app.persons, app.relationships, [], [], false, false, 1);
            return { brandPixels, ghostOnlyPixels, relationshipPixels, childRelationshipPixels, unavailableMarkerPixels,
                restored, staleEndpointSkipped, exportOverlayCalls, jpegDuring, svgResult, pdfResult,
                exportsNonNull: Boolean(exportBefore && exportDuring && exportAfterCancel),
                exportEqual: exportBefore === exportDuring && exportBefore === exportAfterCancel };
        });
        assert('placement render adds brand candidate-cell pixels', overlay.brandPixels > 0, `pixels=${overlay.brandPixels}`);
        assert('placement render adds translucent ghost pixels beyond cell-only layer', overlay.ghostOnlyPixels > 0, `pixels=${overlay.ghostOnlyPixels}`);
        assert('partner placement draws relationship preview pixels at midpoint', overlay.relationshipPixels > 0, `pixels=${overlay.relationshipPixels}`);
        assert('child placement draws relationship preview pixels at endpoint path', overlay.childRelationshipPixels > 0, `pixels=${overlay.childRelationshipPixels}`);
        assert('occupied placement draws unavailable-marker-only pixels', overlay.unavailableMarkerPixels > 0, `pixels=${overlay.unavailableMarkerPixels}`);
        assert('placement overlay restores complete canvas drawing state', overlay.restored);
        assert('stale relationship endpoint is not treated as the ghost', overlay.staleEndpointSkipped);
        assert('JPEG/SVG/PDF export paths never call placement overlay', overlay.exportOverlayCalls === 0, `calls=${overlay.exportOverlayCalls}`);
        assert('JPEG export is a valid non-null data URL', /^data:image\/jpeg/.test(overlay.jpegDuring || ''));
        assert('SVG export produces valid non-null SVG', /^<\?xml[\s\S]*<svg/.test(overlay.svgResult || ''));
        assert('PDF export receives a valid non-null PNG data URL', /^data:image\/png/.test(overlay.pdfResult || ''));
        assert('PNG exports before/during/after placement are non-null', overlay.exportsNonNull);
        assert('placement is pixel-identical in export during placement and after cancel', overlay.exportEqual);
    }
    assert('no page errors', errors.length === 0, errors.join('; '));

    await browser.close();
    const failed = results.filter(result => !result.pass);
    console.log(`\n${results.length - failed.length}/${results.length} placement checks passed`);
    process.exit(failed.length ? 1 : 0);
})().catch(error => {
    console.error('FAIL | placement verification crashed | ' + error.stack);
    process.exit(1);
});
