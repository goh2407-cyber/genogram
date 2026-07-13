/**
 * Smart-placement pure logic verification.
 * Usage: node refactor/verify_placement.js --logic|--overlay|--interaction
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
    const suppressGhostMode = process.argv.includes('--suppress-ghost');
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

    if (process.argv.includes('--interaction')) {
        const interaction = await page.evaluate(() => {
            const app = window.app;
            const grid = GenogramApp.GRID;
            const canvas = app.canvas.canvas;
            app.persons = [];
            app.relationships = [];
            app._syncPersonMap();
            app.history.clear();
            app.cancelPlacement();
            app.selectedPersonId = null;
            app.selectedPersonIds = [];

            document.getElementById('addPerson').click();
            document.querySelector('.gender-btn[data-gender="male"]:not([data-transgender]):not([data-orientation])').click();
            const begun = {
                count: app.persons.length,
                history: app.history.getUndoCount(),
                active: Boolean(app.placementSession),
                gender: app.placementSession && app.placementSession.request.gender
            };

            const exactX = grid.ORIGIN_X + grid.CELL_WIDTH * 2.37;
            const exactY = grid.ORIGIN_Y + grid.CELL_HEIGHT * 1.61;
            const rect = canvas.getBoundingClientRect();
            const toClient = (x, y) => ({
                clientX: rect.left + app.canvas.offsetX + x * app.canvas.scale,
                clientY: rect.top + app.canvas.offsetY + y * app.canvas.scale
            });
            app.handlePointerMove({ ...toClient(exactX, exactY), altKey: true });
            const bypassed = app.placementSession && {
                x: app.placementSession.candidate.x,
                y: app.placementSession.candidate.y
            };
            app.handleKeyDown({ key: 'Escape', target: document.body, preventDefault() {} });
            const cancelled = {
                count: app.persons.length,
                history: app.history.getUndoCount(),
                active: Boolean(app.placementSession)
            };

            const base = new Person({ id: 'interaction-base', gender: 'male',
                x: grid.ORIGIN_X, y: grid.ORIGIN_Y + grid.CELL_HEIGHT });
            app.persons.push(base);
            app.personMap.set(base.id, base);
            app.selectedPersonId = base.id;
            document.getElementById('addPerson').click();
            document.querySelector('.gender-btn[data-gender="female"]:not([data-transgender]):not([data-orientation])').click();
            const pointerX = grid.ORIGIN_X + grid.CELL_WIDTH * 3.4;
            const pointerY = grid.ORIGIN_Y + grid.CELL_HEIGHT * 2.4;
            app.handlePointerMove({ ...toClient(pointerX, pointerY), altKey: false });
            const preview = app.placementSession ? { ...app.placementSession.candidate } : {};
            const realSetPointerCapture = canvas.setPointerCapture;
            canvas.setPointerCapture = () => {};
            app.handlePointerDown({
                button: 0, pointerId: 91, target: canvas,
                ...toClient(pointerX, pointerY)
            });
            canvas.setPointerCapture = realSetPointerCapture;
            const person = app.persons[1];
            const committed = {
                count: app.persons.length,
                relationships: app.relationships.length,
                relationshipDirection: app.relationships[0] &&
                    app.relationships[0].fromPersonId === person.id &&
                    app.relationships[0].toPersonId === base.id,
                history: app.history.getUndoCount(),
                active: Boolean(app.placementSession),
                currentTool: app.currentTool,
                gender: person && person.gender,
                x: person && person.x,
                y: person && person.y,
                mapIdentity: Boolean(person && app.personMap.get(person.id) === person)
            };

            app.persons = [];
            app.relationships = [];
            app._syncPersonMap();
            app.history.clear();
            const clickX = grid.ORIGIN_X + grid.CELL_WIDTH * 5.4;
            const clickY = grid.ORIGIN_Y + grid.CELL_HEIGHT * 4.4;
            const clickCandidate = app.getPlacementCandidate({ kind: 'person', x: clickX, y: clickY });
            app.beginPlacement({ kind: 'person', x: grid.ORIGIN_X, y: grid.ORIGIN_Y, gender: 'male' });
            canvas.setPointerCapture = () => {};
            app.handlePointerDown({ button: 0, pointerId: 92, target: canvas,
                ...toClient(clickX, clickY) });
            canvas.setPointerCapture = realSetPointerCapture;
            const clickOnlyCommit = app.persons[0] && {
                x: app.persons[0].x, y: app.persons[0].y,
                expectedX: clickCandidate.x, expectedY: clickCandidate.y
            };

            app.persons = [];
            app.relationships = [];
            app._syncPersonMap();
            app.history.clear();
            app.beginPlacement({ kind: 'person', x: grid.ORIGIN_X, y: grid.ORIGIN_Y, gender: 'female' });
            app.handlePointerMove({ ...toClient(pointerX, pointerY), altKey: false });
            const altClickX = grid.ORIGIN_X + grid.CELL_WIDTH * 6.23;
            const altClickY = grid.ORIGIN_Y + grid.CELL_HEIGHT * 3.67;
            canvas.setPointerCapture = () => {};
            app.handlePointerDown({ button: 0, pointerId: 93, target: canvas, altKey: true,
                ...toClient(altClickX, altClickY) });
            canvas.setPointerCapture = realSetPointerCapture;
            const altClickCommit = app.persons[0] && {
                x: app.persons[0].x, y: app.persons[0].y,
                expectedX: altClickX, expectedY: altClickY
            };
            return {
                begun, bypassed, cancelled, preview, clickOnlyCommit, altClickCommit, committed
            };
        });
        assert('general-add gender choice begins placement without data/history writes',
            interaction.begun.active && interaction.begun.gender === 'male' &&
            interaction.begun.count === 0 && interaction.begun.history === 0);
        assert('placement pointer move with Alt bypasses snap in world coordinates',
            interaction.bypassed &&
            Math.abs(interaction.bypassed.x - (data.grid.ORIGIN_X + data.grid.CELL_WIDTH * 2.37)) < 0.001 &&
            Math.abs(interaction.bypassed.y - (data.grid.ORIGIN_Y + data.grid.CELL_HEIGHT * 1.61)) < 0.001);
        assert('Escape cancels placement before other Escape behavior with no data/history writes',
            !interaction.cancelled.active && interaction.cancelled.count === 0 && interaction.cancelled.history === 0);
        assert('canvas click commits preview position and returns to select',
            interaction.committed.count === 2 && !interaction.committed.active &&
            interaction.committed.currentTool === 'select' && interaction.committed.gender === 'female' &&
            interaction.committed.x === interaction.preview.x && interaction.committed.y === interaction.preview.y &&
            interaction.committed.relationships === 1 && interaction.committed.relationshipDirection);
        assert('placement commit is one atomic history entry with immediate personMap identity',
            interaction.committed.history === 1 && interaction.committed.mapIdentity);
        assert('pointerdown without prior pointermove commits the clicked snapped candidate',
            interaction.clickOnlyCommit &&
            interaction.clickOnlyCommit.x === interaction.clickOnlyCommit.expectedX &&
            interaction.clickOnlyCommit.y === interaction.clickOnlyCommit.expectedY);
        assert('Alt pointerdown overrides stale snapped preview and commits exact click coordinates',
            interaction.altClickCommit &&
            Math.abs(interaction.altClickCommit.x - interaction.altClickCommit.expectedX) < 0.001 &&
            Math.abs(interaction.altClickCommit.y - interaction.altClickCommit.expectedY) < 0.001);

        const quick = await page.evaluate(() => {
            const app = window.app;
            const g = GenogramApp.GRID;
            const reset = () => {
                const base = new Person({ id: 'quick-base', gender: 'male', generation: 'parent', x: g.ORIGIN_X, y: g.ORIGIN_Y + g.CELL_HEIGHT });
                app.persons = [base]; app.relationships = []; app._syncPersonMap(); app.history.clear();
                app.selectedPersonId = base.id; app.selectedRelationshipId = null; app.cancelPlacement(); app.quickAddContext = null;
                return base;
            };
            const snapshot = type => {
                const base = reset(); app.handleQuickAddClick(base, type);
                return { active: !!app.placementSession, count: app.persons.length, rels: app.relationships.length,
                    history: app.history.getUndoCount(), request: app.placementSession && app.placementSession.request };
            };
            const parent = snapshot('parent');
            parent.ghostCount = app.placementSession.ghostPeople && app.placementSession.ghostPeople.length;
            const base = reset();
            const p1 = new Person({ id: 'p1', gender: 'female', x: base.x - g.CELL_WIDTH, y: base.y });
            const p2 = new Person({ id: 'p2', gender: 'female', x: base.x + 3 * g.CELL_WIDTH, y: base.y });
            app.persons.push(p1, p2); app.personMap.set(p1.id,p1); app.personMap.set(p2.id,p2);
            const r1 = new Relationship({ id:'r1', type:'married', fromPersonId:base.id, toPersonId:p1.id });
            const r2 = new Relationship({ id:'r2', type:'married', fromPersonId:base.id, toPersonId:p2.id });
            app.relationships.push(r1,r2); app.selectedRelationshipId='r2';
            app.handleQuickAddClick(base,'son');
            const child = { active:!!app.placementSession, previews:app.placementSession.candidate.relationshipPreview,
                x:app.placementSession.candidate.x, midpoint:(base.x+p2.x)/2 };
            app.cancelPlacement();
            const cancel = { history:app.history.getUndoCount(), count:app.persons.length, selected:app.selectedPersonId, relationship:app.selectedRelationshipId };
            reset(); app.handleQuickAddClick(app.personMap.get('quick-base'),'sibling');
            const modalBefore = { history:app.history.getUndoCount(), count:app.persons.length };
            app.createQuickPersonWithGender('female', false, null);
            const sibling = { active:!!app.placementSession, count:app.persons.length, history:app.history.getUndoCount(), previews:app.placementSession.candidate.relationshipPreview };
            app.cancelPlacement();
            reset(); app.handleQuickAddClick(app.personMap.get('quick-base'),'partner'); app.createQuickPersonWithGender('female',false,null);
            const partner = { active:!!app.placementSession, type:app.placementSession.candidate.relationshipPreview[0].type };
            reset(); app.handleQuickAddClick(app.personMap.get('quick-base'),'daughter'); const daughter=!!app.placementSession;
            reset(); app.handleQuickAddClick(app.personMap.get('quick-base'),'pregnancy'); const pregnancy=app.placementSession.request.gender;
            reset(); app.handleQuickAddClick(app.personMap.get('quick-base'),'parent'); app.commitPlacement();
            const committedParents = { people:app.persons.length, rels:app.relationships.length, history:app.history.getUndoCount(),
                directions:app.relationships.filter(r=>r.type==='parent-child').every(r=>r.toPersonId==='quick-base') };
            return { parent, child, cancel, modalBefore, sibling, partner, daughter, pregnancy, committedParents };
        });

        const metadata = await page.evaluate(() => {
            const app = window.app; const g = GenogramApp.GRID;
            const parent = new Person({ id:'metadata-parent', x:g.ORIGIN_X, y:g.ORIGIN_Y });
            app.persons=[parent]; app.relationships=[]; app._syncPersonMap(); app.history.clear();
            app.beginPlacement({ kind:'child', basePersonId:parent.id, personId:'metadata-ghost', gender:'pregnancy',
                lossType:'miscarriage', twinGroup:'twins-a', zygosity:'mono',
                relationshipPreview:[{ type:'parent-child', fromPersonId:parent.id, toPersonId:'metadata-ghost',
                    linkType:'adopted', notes:'preserve-me', date:'2026', routeMode:'straight' }] });
            app.commitPlacement();
            const person=app.persons[1], rel=app.relationships[0];
            return { lossType:person.lossType, twinGroup:person.twinGroup, zygosity:person.zygosity,
                linkType:rel.linkType, notes:rel.notes, date:rel.date, routeMode:rel.routeMode, instance:rel instanceof Relationship };
        });
        assert('single placement preserves Person loss/twin metadata and full Relationship metadata',
            metadata.lossType==='miscarriage' && metadata.twinGroup==='twins-a' && metadata.zygosity==='mono' &&
            metadata.linkType==='adopted' && metadata.notes==='preserve-me' && metadata.date==='2026' &&
            metadata.routeMode==='straight' && metadata.instance);

        const quickE2E = await page.evaluate(() => {
            const app=window.app, g=GenogramApp.GRID;
            const reset=(withParents=false) => {
                const base=new Person({id:'e2e-base',gender:'male',generation:'parent',x:g.ORIGIN_X,y:g.ORIGIN_Y+g.CELL_HEIGHT});
                app.persons=[base]; app.relationships=[]; app._syncPersonMap(); app.history.clear();
                app.selectedPersonId=base.id; app.selectedPersonIds=[]; app.selectedRelationshipId=null; app.cancelPlacement(); app.quickAddContext=null;
                if(withParents){
                    ['left','right'].forEach((side,i)=>{ const p=new Person({id:'e2e-parent-'+side,x:base.x+(i?60:-60),y:g.ORIGIN_Y}); app.persons.push(p); app.personMap.set(p.id,p); app.relationships.push(new Relationship({type:'parent-child',fromPersonId:p.id,toPersonId:base.id,linkType:i?'foster':'adopted'})); });
                }
                return base;
            };
            const result={};
            for(const type of ['son','daughter','pregnancy']){
                const base=reset(); app.handleQuickAddClick(base,type); const choosing=app.elements.statusBar.textContent; app.commitPlacement();
                const child=app.persons[1], edges=app.relationships.filter(r=>r.type==='parent-child');
                result[type]={gender:child.gender,edges:edges.length,direction:edges.every(r=>r.fromPersonId===base.id&&r.toPersonId===child.id),history:app.history.getUndoCount(),selected:app.selectedPersonId===child.id,status:app.elements.statusBar.textContent,choosing};
            }
            let base=reset(true); app.handleQuickAddClick(base,'sibling'); app.createQuickPersonWithGender('female'); const siblingChoosing=app.elements.statusBar.textContent; app.commitPlacement();
            let created=app.persons[3], edges=app.relationships.filter(r=>r.toPersonId===created.id);
            result.sibling={people:app.persons.length,edges:edges.length,direction:edges.every(r=>r.fromPersonId.startsWith('e2e-parent-')),linkTypes:edges.map(r=>r.linkType).sort(),history:app.history.getUndoCount(),selected:app.selectedPersonId===created.id,status:app.elements.statusBar.textContent,choosing:siblingChoosing};
            base=reset(); app.handleQuickAddClick(base,'partner'); app.createQuickPersonWithGender('female'); const partnerChoosing=app.elements.statusBar.textContent; app.commitPlacement(); created=app.persons[1];
            result.partner={people:app.persons.length,rels:app.relationships.length,type:app.relationships[0].type,history:app.history.getUndoCount(),selected:app.selectedPersonId===created.id,status:app.elements.statusBar.textContent,choosing:partnerChoosing};
            base=reset(); const spouseA=new Person({id:'sp-a',x:base.x-g.CELL_WIDTH,y:base.y}),spouseB=new Person({id:'sp-b',x:base.x+3*g.CELL_WIDTH,y:base.y}); app.persons.push(spouseA,spouseB); app.personMap.set(spouseA.id,spouseA); app.personMap.set(spouseB.id,spouseB); const ra=new Relationship({id:'sp-rel-a',type:'married',fromPersonId:base.id,toPersonId:spouseA.id}),rb=new Relationship({id:'sp-rel-b',type:'married',fromPersonId:base.id,toPersonId:spouseB.id}); app.relationships.push(ra,rb); app.selectedRelationshipId=rb.id; app.handleQuickAddClick(base,'son'); app.commitPlacement(); created=app.persons[3]; edges=app.relationships.filter(r=>r.type==='parent-child');
            result.selectedSpouse={edges:edges.length,parents:edges.map(r=>r.fromPersonId).sort(),child:edges.every(r=>r.toPersonId===created.id),history:app.history.getUndoCount()};
            base=reset(); const blocker=new Person({id:'occupied',x:base.x+g.CELL_WIDTH,y:base.y}); app.persons.push(blocker);app.personMap.set(blocker.id,blocker);const before=app.persons.map(p=>[p.id,p.x,p.y]);app.handleQuickAddClick(base,'partner');app.createQuickPersonWithGender('female');const candidate=app.placementSession.candidate;app.commitPlacement();
            result.occupied={fallback:candidate.x!==blocker.x,unchanged:before.every(([id,x,y])=>{const p=app.personMap.get(id);return p.x===x&&p.y===y;})};
            base=reset(); app.handleQuickAddClick(base,'parent'); app.commitPlacement();
            result.parent={people:app.persons.length,rels:app.relationships.length,edges:app.relationships.filter(r=>r.type==='parent-child').every(r=>r.toPersonId===base.id),history:app.history.getUndoCount(),selected:app.selectedPersonId!=='e2e-base',status:app.elements.statusBar.textContent};
            base=reset();
            const occupiedLeft=new Person({id:'pair-left',x:base.x-g.CELL_WIDTH/2,y:g.ORIGIN_Y});
            const occupiedRight=new Person({id:'pair-right',x:base.x+g.CELL_WIDTH/2,y:g.ORIGIN_Y});
            app.persons.push(occupiedLeft,occupiedRight); app.personMap.set(occupiedLeft.id,occupiedLeft); app.personMap.set(occupiedRight.id,occupiedRight);
            const pairBefore=app.persons.map(p=>[p.id,p.x,p.y]);
            app.handleQuickAddClick(base,'parent');
            const pairGhosts=app.placementSession.ghostPeople.map(p=>({id:p.id,x:p.x,y:p.y}));
            const pairFallback=pairGhosts.every(p=>p.x!==occupiedLeft.x&&p.x!==occupiedRight.x);
            const pairSpacing=Math.abs(pairGhosts[1].x-pairGhosts[0].x);
            app.commitPlacement();
            const pairNewIds=new Set(app.persons.slice(3).map(p=>p.id));
            const pairMarriage=app.relationships.find(r=>r.type==='married');
            const pairChildEdges=app.relationships.filter(r=>r.type==='parent-child');
            result.parentOccupied={fallback:pairFallback,spacing:pairSpacing,history:app.history.getUndoCount(),
                existingUnchanged:pairBefore.every(([id,x,y])=>{const p=app.personMap.get(id);return p.x===x&&p.y===y;}),
                people:app.persons.length,rels:app.relationships.length,
                marriageEndpoints:pairMarriage&&pairNewIds.has(pairMarriage.fromPersonId)&&pairNewIds.has(pairMarriage.toPersonId),
                childDirections:pairChildEdges.length===2&&pairChildEdges.every(r=>pairNewIds.has(r.fromPersonId)&&r.toPersonId===base.id)};
            base=reset(); for(const type of ['sibling','partner']){ app.handleQuickAddClick(base,type); const choosing=app.elements.statusBar.textContent; app.closeGenderModal(); result[type+'Cancel']={people:app.persons.length,rels:app.relationships.length,history:app.history.getUndoCount(),selected:app.selectedPersonId,choosing}; }
            return result;
        });
        ['son','daughter','pregnancy'].forEach(type => assert(`quick ${type} commit creates directed child in one history with selection/status`, quickE2E[type].edges===1 && quickE2E[type].direction && quickE2E[type].history===1 && quickE2E[type].selected && /已建立/.test(quickE2E[type].status) && /位置/.test(quickE2E[type].choosing)));
        assert('quick sibling commits both real parent edges with metadata in one history', quickE2E.sibling.people===4 && quickE2E.sibling.edges===2 && quickE2E.sibling.direction && quickE2E.sibling.linkTypes.join(',')==='adopted,foster' && quickE2E.sibling.history===1 && quickE2E.sibling.selected && /已建立/.test(quickE2E.sibling.status));
        assert('quick sibling gender selection enters choosing-position placement before commit', /位置/.test(quickE2E.sibling.choosing));
        assert('quick partner gender selection enters choosing-position placement before commit', /位置/.test(quickE2E.partner.choosing));
        assert('quick partner commits relationship in one history with selection/status', quickE2E.partner.people===2 && quickE2E.partner.rels===1 && quickE2E.partner.type==='married' && quickE2E.partner.history===1 && quickE2E.partner.selected && /已建立/.test(quickE2E.partner.status));
        assert('selected spouse child commit writes both parent-to-child edges', quickE2E.selectedSpouse.edges===2 && quickE2E.selectedSpouse.parents.join(',')==='e2e-base,sp-b' && quickE2E.selectedSpouse.child && quickE2E.selectedSpouse.history===1);
        assert('occupied quick-add falls back without moving existing people', quickE2E.occupied.fallback && quickE2E.occupied.unchanged);
        assert('quick parent pair commit creates two people/three relationships in one history with selection/status', quickE2E.parent.people===3 && quickE2E.parent.rels===3 && quickE2E.parent.edges && quickE2E.parent.history===1 && quickE2E.parent.selected && /已建立父母/.test(quickE2E.parent.status));
        assert('occupied parent pair falls back as fixed-gap unit and commits correct atomic endpoints without moving existing people', quickE2E.parentOccupied.fallback && quickE2E.parentOccupied.spacing===data.grid.CELL_WIDTH && quickE2E.parentOccupied.history===1 && quickE2E.parentOccupied.existingUnchanged && quickE2E.parentOccupied.people===5 && quickE2E.parentOccupied.rels===3 && quickE2E.parentOccupied.marriageEndpoints && quickE2E.parentOccupied.childDirections);
        assert('sibling gender-modal cancel writes nothing and retains selection', quickE2E.siblingCancel.people===1 && quickE2E.siblingCancel.rels===0 && quickE2E.siblingCancel.history===0 && quickE2E.siblingCancel.selected==='e2e-base');
        assert('partner gender-modal cancel writes nothing and retains selection', quickE2E.partnerCancel.people===1 && quickE2E.partnerCancel.rels===0 && quickE2E.partnerCancel.history===0 && quickE2E.partnerCancel.selected==='e2e-base');
        assert('quick parent previews two people and three relationships without writes', quick.parent.active && quick.parent.count===1 && quick.parent.rels===0 && quick.parent.history===0 && quick.parent.request.people.length===2 && quick.parent.ghostCount===2 && quick.parent.request.relationshipPreview.length===3);
        assert('quick child honors selected spouse midpoint and previews both parent edges', quick.child.active && quick.child.previews.length===2 && quick.child.x===quick.child.midpoint);
        assert('quick placement cancel writes no history and restores selection', quick.cancel.history===0 && quick.cancel.count===3 && quick.cancel.selected==='quick-base' && quick.cancel.relationship==='r2');
        assert('quick gender modal path has no pre-modal history write', quick.modalBefore.history===0 && quick.modalBefore.count===1);
        assert('quick sibling gender selection begins placement without writes', quick.sibling.active && quick.sibling.count===1 && quick.sibling.history===0);
        assert('quick partner gender selection begins married placement', quick.partner.active && quick.partner.type==='married');
        assert('quick daughter and pregnancy enter typed placement', quick.daughter && quick.pregnancy==='pregnancy');
        assert('quick parent commit is one atomic history entry with parent-to-child directions', quick.committedParents.people===3 && quick.committedParents.rels===3 && quick.committedParents.history===1 && quick.committedParents.directions);
    }

    if (overlayMode) {
        const overlay = await page.evaluate(async suppressGhost => {
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
            const realDrawPerson = app.canvas.drawPerson;
            if (suppressGhost) {
                app.canvas.drawPerson = function(person, ...args) {
                    if (person.id !== session.ghostPerson.id) return realDrawPerson.call(this, person, ...args);
                };
            }
            app.render();
            const after = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            app.canvas.drawPerson = realDrawPerson;
            const exportDuring = app.canvas.exportToPNG(app.persons, app.relationships, [], [], false, false, 1);

            // Isolate exactly cell + relationship by suppressing only drawPerson in the overlay call.
            app.cancelPlacement();
            app.render();
            const overlayDrawPerson = app.canvas.drawPerson;
            app.canvas.drawPerson = () => {};
            app.canvas.drawPlacementPreview({ ...session.candidate, ghostPerson: session.ghostPerson });
            app.canvas.drawPerson = overlayDrawPerson;
            const noGhost = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let ghostOnlyPixels = 0;
            for (let i = 0; i < after.length; i += 4) {
                if (after[i] !== noGhost[i] || after[i + 1] !== noGhost[i + 1] || after[i + 2] !== noGhost[i + 2]) ghostOnlyPixels++;
            }

            // The partner preview must create neutral dashed pixels around the endpoint midpoint.
            const sx = p => Math.round(p.x * app.canvas.scale + app.canvas.offsetX);
            const sy = p => Math.round(p.y * app.canvas.scale + app.canvas.offsetY);
            const midX = sx({ x: (base.x + session.candidate.x) / 2 });
            const midY = sy({ y: (base.y + session.candidate.y) / 2 });
            let relationshipPixels = 0;
            for (let y = midY - 5; y <= midY + 5; y++) for (let x = midX - 8; x <= midX + 8; x++) {
                const i = (y * canvas.width + x) * 4;
                if (after[i] !== before[i] || after[i + 1] !== before[i + 1] || after[i + 2] !== before[i + 2]) relationshipPixels++;
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

            app.selectedPersonId = base.id;
            app.handleQuickAddClick(base, 'parent');
            const pairSession = app.placementSession;
            const drawnGhostIds = [];
            const pairSegments = [];
            const realDrawPairPerson = app.canvas.drawPerson;
            const realMoveTo = stateCtx.moveTo;
            const realPairLineTo = stateCtx.lineTo;
            let movePoint = null;
            app.canvas.drawPerson = person => { drawnGhostIds.push(person.id); };
            stateCtx.moveTo = function(x, y) { movePoint = [x, y]; return realMoveTo.call(this, x, y); };
            stateCtx.lineTo = function(x, y) { if (movePoint) pairSegments.push([movePoint, [x, y]]); return realPairLineTo.call(this, x, y); };
            app.canvas.drawPlacementPreview({ ...pairSession.candidate, ghostPerson: pairSession.ghostPerson, ghostPeople: pairSession.ghostPeople });
            app.canvas.drawPerson = realDrawPairPerson;
            stateCtx.moveTo = realMoveTo;
            stateCtx.lineTo = realPairLineTo;
            const pairGhostsDrawn = pairSession.ghostPeople.every(person => drawnGhostIds.includes(person.id));
            const relationshipPoints = [...pairSession.ghostPeople, base];
            const pairRelationshipSegments = pairSegments.filter(([a, b]) => relationshipPoints.some(p => p.x === a[0] && p.y === a[1]) && relationshipPoints.some(p => p.x === b[0] && p.y === b[1])).length;

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
                pairGhostsDrawn, pairRelationshipSegments,
                exportsNonNull: Boolean(exportBefore && exportDuring && exportAfterCancel),
                exportEqual: exportBefore === exportDuring && exportBefore === exportAfterCancel };
        }, suppressGhostMode);
        assert('placement render adds brand candidate-cell pixels', overlay.brandPixels > 0, `pixels=${overlay.brandPixels}`);
        assert('placement render adds translucent ghost pixels beyond cell-only layer', overlay.ghostOnlyPixels > 0, `pixels=${overlay.ghostOnlyPixels}`);
        assert('partner placement draws relationship preview pixels at midpoint', overlay.relationshipPixels > 0, `pixels=${overlay.relationshipPixels}`);
        assert('child placement draws relationship preview pixels at endpoint path', overlay.childRelationshipPixels > 0, `pixels=${overlay.childRelationshipPixels}`);
        assert('occupied placement draws unavailable-marker-only pixels', overlay.unavailableMarkerPixels > 0, `pixels=${overlay.unavailableMarkerPixels}`);
        assert('placement overlay restores complete canvas drawing state', overlay.restored);
        assert('stale relationship endpoint is not treated as the ghost', overlay.staleEndpointSkipped);
        assert('parent-pair overlay draws both ghosts and all three preview relationships', overlay.pairGhostsDrawn && overlay.pairRelationshipSegments >= 3, `segments=${overlay.pairRelationshipSegments}`);
        assert('JPEG/SVG/PDF export paths never call placement overlay', overlay.exportOverlayCalls === 0, `calls=${overlay.exportOverlayCalls}`);
        assert('JPEG export is a valid non-null data URL', /^data:image\/jpeg/.test(overlay.jpegDuring || ''));
        assert('SVG export produces valid non-null SVG', /^<\?xml[\s\S]*<svg/.test(overlay.svgResult || ''));
        assert('PDF storage handoff receives a valid non-null PNG input', /^data:image\/png/.test(overlay.pdfResult || ''));
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
