/**
 * Relationship interaction edge-case regression gate.
 *
 * Covers modal cancellation and the category/direction uniqueness rules shared
 * by relationship creation and relationship-type editing.
 */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);

    await page.evaluate(() => {
        window.__relationshipEdgeReset = ({ childRow = false, relationships = [] } = {}) => {
            const app = window.app;
            app.closeRelationshipModal();
            app.editingRelationshipId = null;
            app.connectingFrom = null;
            app.connectingTo = null;
            app.persons = [
                new Person({ id: 'a', name: 'A', gender: 'male', x: 320, y: 220, generation: 'parent' }),
                new Person({ id: 'b', name: 'B', gender: 'female', x: 600, y: childRow ? 460 : 220, generation: childRow ? 'child' : 'parent' })
            ];
            app._syncPersonMap();
            app.relationships = relationships.map(data => new Relationship(data));
            app.households = [];
            app.lifeCircles = [];
            app.clearAllSelections();
            app.history.clear();
            app.setTool('select');
            app.render();
            return app;
        };
        window.__openNewRelationshipModal = () => {
            const app = window.app;
            app.setTool('connect');
            app.connectingFrom = { person: app.persons[0], point: { x: app.persons[0].x, y: app.persons[0].y } };
            app.connectingTo = app.persons[1];
            app.showRelationshipModal();
        };
    });

    const results = [];
    const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

    await page.evaluate(() => { window.__relationshipEdgeReset(); window.__openNewRelationshipModal(); });
    await page.keyboard.press('Escape');
    const escaped = await page.evaluate(() => ({
        modalActive: app.elements.relationshipModal.classList.contains('active'),
        from: !!app.connectingFrom,
        to: !!app.connectingTo,
        tool: app.currentTool
    }));
    check('Esc 一次關閉新建關係視窗並清除兩端點',
        !escaped.modalActive && !escaped.from && !escaped.to && escaped.tool === 'select', JSON.stringify(escaped));

    const blurred = await page.evaluate(() => {
        window.__relationshipEdgeReset();
        window.__openNewRelationshipModal();
        window.dispatchEvent(new Event('blur'));
        return {
            modalActive: app.elements.relationshipModal.classList.contains('active'),
            from: !!app.connectingFrom,
            to: !!app.connectingTo
        };
    });
    check('失焦不留下已失效的新建關係視窗',
        !blurred.modalActive && !blurred.from && !blurred.to, JSON.stringify(blurred));

    const marriageDuplicate = await page.evaluate(() => {
        const app = window.__relationshipEdgeReset({ relationships: [
            { id: 'marriage', fromPersonId: 'a', toPersonId: 'b', type: 'married' },
            { id: 'emotion', fromPersonId: 'a', toPersonId: 'b', type: 'conflict' }
        ] });
        app.editingRelationshipId = 'emotion';
        app.updateRelationshipType('divorced');
        return {
            types: app.relationships.map(r => r.type),
            marriageCount: app.relationships.filter(r => Relationship.getCategory(r.type) === 'marriage').length,
            history: app.history.getUndoCount()
        };
    });
    check('編輯不會產生第二條伴侶類關係',
        marriageDuplicate.marriageCount === 1 && marriageDuplicate.types.includes('conflict') && marriageDuplicate.history === 0,
        JSON.stringify(marriageDuplicate));

    const familyDuplicate = await page.evaluate(() => {
        const app = window.__relationshipEdgeReset({ childRow: true, relationships: [
            { id: 'family', fromPersonId: 'a', toPersonId: 'b', type: 'parent-child' },
            { id: 'emotion', fromPersonId: 'a', toPersonId: 'b', type: 'conflict' }
        ] });
        app.editingRelationshipId = 'emotion';
        app.updateRelationshipType('parent-child', 'adopted');
        return {
            types: app.relationships.map(r => r.type),
            familyCount: app.relationships.filter(r => Relationship.getCategory(r.type) === 'family').length,
            history: app.history.getUndoCount()
        };
    });
    check('編輯不會產生第二條親子關係',
        familyDuplicate.familyCount === 1 && familyDuplicate.types.includes('conflict') && familyDuplicate.history === 0,
        JSON.stringify(familyDuplicate));

    const emotionalDuplicate = await page.evaluate(() => {
        const app = window.__relationshipEdgeReset({ relationships: [
            { id: 'love', fromPersonId: 'a', toPersonId: 'b', type: 'love' },
            { id: 'emotion', fromPersonId: 'a', toPersonId: 'b', type: 'conflict' }
        ] });
        app.editingRelationshipId = 'emotion';
        app.updateRelationshipType('love');
        return {
            types: app.relationships.map(r => r.type),
            duplicateCount: app.relationships.filter(r => r.type === 'love' && r.fromPersonId === 'a' && r.toPersonId === 'b').length,
            history: app.history.getUndoCount()
        };
    });
    check('編輯不會產生同方向同類型的重複情感線',
        emotionalDuplicate.duplicateCount === 1 && emotionalDuplicate.types.includes('conflict') && emotionalDuplicate.history === 0,
        JSON.stringify(emotionalDuplicate));

    const directional = await page.evaluate(() => {
        const app = window.__relationshipEdgeReset({ relationships: [
            { id: 'forward', fromPersonId: 'a', toPersonId: 'b', type: 'controlling' },
            { id: 'reverse', fromPersonId: 'b', toPersonId: 'a', type: 'conflict' }
        ] });
        app.editingRelationshipId = 'reverse';
        app.updateRelationshipType('controlling');
        return {
            count: app.relationships.filter(r => r.type === 'controlling').length,
            directions: app.relationships.filter(r => r.type === 'controlling').map(r => `${r.fromPersonId}->${r.toPersonId}`),
            history: app.history.getUndoCount()
        };
    });
    check('相反方向的方向性情感線仍可並存',
        directional.count === 2 && directional.directions.includes('a->b') && directional.directions.includes('b->a') && directional.history === 1,
        JSON.stringify(directional));

    const undoPending = await page.evaluate(() => {
        const app = window.__relationshipEdgeReset();
        app.history.pushState({
            persons: [app.persons[0].toJSON()],
            relationships: [], households: [], lifeCircles: []
        });
        window.__openNewRelationshipModal();
        app.undo();
        return {
            persons: app.persons.length,
            modalActive: app.elements.relationshipModal.classList.contains('active'),
            from: !!app.connectingFrom,
            to: !!app.connectingTo
        };
    });
    check('Undo 更換資料前會取消待完成連線',
        undoPending.persons === 1 && !undoPending.modalActive && !undoPending.from && !undoPending.to,
        JSON.stringify(undoPending));

    const redoPending = await page.evaluate(() => {
        const app = window.__relationshipEdgeReset();
        const third = new Person({ id: 'c', name: 'C', gender: 'male', x: 780, y: 220 });
        app.history.pushState({
            persons: app.persons.map(p => p.toJSON()),
            relationships: [], households: [], lifeCircles: []
        });
        app.persons.push(third);
        app._syncPersonMap();
        app.undo();
        window.__openNewRelationshipModal();
        app.redo();
        return {
            persons: app.persons.length,
            modalActive: app.elements.relationshipModal.classList.contains('active'),
            from: !!app.connectingFrom,
            to: !!app.connectingTo
        };
    });
    check('Redo 更換資料前會取消待完成連線',
        redoPending.persons === 3 && !redoPending.modalActive && !redoPending.from && !redoPending.to,
        JSON.stringify(redoPending));

    const deletePending = await page.evaluate(() => {
        const app = window.__relationshipEdgeReset();
        app.selectedPersonId = 'a';
        app.setTool('connect');
        app.connectingFrom = { person: app.personMap.get('a'), point: { x: 320, y: 220 } };
        app.deleteSelected();
        return {
            hasA: app.personMap.has('a'),
            from: !!app.connectingFrom,
            to: !!app.connectingTo
        };
    });
    check('刪除連線端點時會取消待完成連線',
        !deletePending.hasA && !deletePending.from && !deletePending.to,
        JSON.stringify(deletePending));

    const loadPending = await page.evaluate(() => {
        const app = window.__relationshipEdgeReset();
        window.__openNewRelationshipModal();
        app.loadData({
            persons: [new Person({ id: 'loaded', name: 'Loaded', x: 400, y: 240 }).toJSON()],
            relationships: [], households: [], lifeCircles: []
        });
        return {
            ids: app.persons.map(p => p.id),
            modalActive: app.elements.relationshipModal.classList.contains('active'),
            from: !!app.connectingFrom,
            to: !!app.connectingTo
        };
    });
    check('載入資料前會取消待完成連線',
        loadPending.ids.length === 1 && loadPending.ids[0] === 'loaded' && !loadPending.modalActive && !loadPending.from && !loadPending.to,
        JSON.stringify(loadPending));

    const clearPending = await page.evaluate(() => {
        const app = window.__relationshipEdgeReset();
        window.__openNewRelationshipModal();
        const oldConfirm = window.confirm;
        window.confirm = () => true;
        try { app.clearAll(); } finally { window.confirm = oldConfirm; }
        return {
            persons: app.persons.length,
            modalActive: app.elements.relationshipModal.classList.contains('active'),
            from: !!app.connectingFrom,
            to: !!app.connectingTo
        };
    });
    check('清空畫布前會取消待完成連線',
        clearPending.persons === 0 && !clearPending.modalActive && !clearPending.from && !clearPending.to,
        JSON.stringify(clearPending));

    const parallelHits = await page.evaluate(() => {
        const types = ['love', 'conflict', 'controlling', 'distant', 'physical-abuse', 'harmony', 'neglect'];
        const app = window.__relationshipEdgeReset({ relationships: types.map((type, index) => ({
            id: `parallel-${index}`,
            fromPersonId: index % 2 === 0 ? 'a' : 'b',
            toPersonId: index % 2 === 0 ? 'b' : 'a',
            type
        })) });
        const hits = app.relationships.map(rel => {
            const from = app.personMap.get(rel.fromPersonId);
            const to = app.personMap.get(rel.toPersonId);
            const path = app.canvas.getRelationshipPath(from, to, rel, app.relationships);
            const point = {
                x: (path[0].x + path[path.length - 1].x) / 2,
                y: (path[0].y + path[path.length - 1].y) / 2
            };
            return { expected: rel.id, actual: app.getRelationshipAt(point.x, point.y)?.id || null };
        });
        return hits;
    });
    check('七條平行情感線都能各自命中選取',
        parallelHits.every(hit => hit.actual === hit.expected), JSON.stringify(parallelHits));

    const zoomClickPoint = await page.evaluate(() => {
        const app = window.__relationshipEdgeReset({ relationships: [
            { id: 'zoom-line', fromPersonId: 'a', toPersonId: 'b', type: 'married' }
        ] });
        app.canvas.setScale(1.8, 500, 300);
        app.canvas.offsetX += 43;
        app.canvas.offsetY -= 27;
        app.render();
        const rel = app.relationships[0];
        const from = app.personMap.get('a');
        const to = app.personMap.get('b');
        const path = app.canvas.getRelationshipPath(from, to, rel, app.relationships);
        const world = {
            x: (path[0].x + path[path.length - 1].x) / 2,
            y: (path[0].y + path[path.length - 1].y) / 2
        };
        const rect = app.canvas.canvas.getBoundingClientRect();
        return {
            x: rect.left + app.canvas.offsetX + world.x * app.canvas.scale,
            y: rect.top + app.canvas.offsetY + world.y * app.canvas.scale
        };
    });
    await page.mouse.click(zoomClickPoint.x, zoomClickPoint.y);
    const zoomSelected = await page.evaluate(() => app.selectedRelationshipId);
    check('縮放與平移後仍可用實際滑鼠點選關係線', zoomSelected === 'zoom-line', `selected=${zoomSelected}`);

    const familyHits = await page.evaluate(() => {
        const app = window.__relationshipEdgeReset();
        app.persons = [
            new Person({ id: 'father', gender: 'male', x: 360, y: 160 }),
            new Person({ id: 'mother', gender: 'female', x: 600, y: 160 }),
            new Person({ id: 'c1', gender: 'male', x: 340, y: 430 }),
            new Person({ id: 'c2', gender: 'female', x: 480, y: 430 }),
            new Person({ id: 'c3', gender: 'male', x: 620, y: 430 })
        ];
        app._syncPersonMap();
        app.relationships = [new Relationship({ id: 'parents', fromPersonId: 'father', toPersonId: 'mother', type: 'married' })];
        for (const childId of ['c1', 'c2', 'c3']) {
            app.relationships.push(new Relationship({ id: `f-${childId}`, fromPersonId: 'father', toPersonId: childId, type: 'parent-child' }));
            app.relationships.push(new Relationship({ id: `m-${childId}`, fromPersonId: 'mother', toPersonId: childId, type: 'parent-child' }));
        }
        app.render();
        return ['c1', 'c2', 'c3'].map(childId => {
            const child = app.personMap.get(childId);
            const hit = app.getRelationshipAt(child.x, child.y - 35);
            return { childId, hitChild: hit?.toPersonId || null, type: hit?.type || null };
        });
    });
    check('多子女樹狀線的每一個子女分支都可命中',
        familyHits.every(hit => hit.type === 'parent-child' && hit.hitChild === hit.childId), JSON.stringify(familyHits));

    const routeModeEdges = await page.evaluate(() => {
        const app = window.__relationshipEdgeReset();
        const canvas = app.canvas;
        const makePair = (prefix, y, { blocker = false } = {}) => [
            new Person({ id: `${prefix}-from`, gender: 'male', x: 220, y, name: '' }),
            new Person({ id: `${prefix}-to`, gender: 'female', x: 540, y, name: '' }),
            ...(blocker ? [new Person({ id: `${prefix}-blocker`, gender: 'male', x: 380, y, name: '夾者' })] : [])
        ];
        app.persons = [
            ...makePair('straight', 140),
            ...makePair('over', 300),
            ...makePair('under', 460),
            ...makePair('auto', 620, { blocker: true })
        ];
        app.relationships = [
            new Relationship({ id: 'straight', fromPersonId: 'straight-from', toPersonId: 'straight-to',
                type: 'married', routeMode: 'straight', date: 'straight-date' }),
            new Relationship({ id: 'over', fromPersonId: 'over-from', toPersonId: 'over-to',
                type: 'married', routeMode: 'over', date: 'over-date' }),
            new Relationship({ id: 'under', fromPersonId: 'under-from', toPersonId: 'under-to',
                type: 'married', routeMode: 'under', date: 'under-date' }),
            new Relationship({ id: 'auto', fromPersonId: 'auto-from', toPersonId: 'auto-to',
                type: 'married', routeMode: 'auto', date: 'auto-date' })
        ];
        app._syncPersonMap();
        app.render();
        const eq = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;
        const pointOnPath = (point, path) => path.slice(1).some((end, index) =>
            canvas.distanceToLineSegment(point.x, point.y, path[index].x, path[index].y,
                end.x, end.y) <= 1e-7);
        const inspect = rel => {
            const from = app.personMap.get(rel.fromPersonId);
            const to = app.personMap.get(rel.toPersonId);
            const route = canvas.getMarriageRoute(from, to, rel, app.relationships);
            const path = canvas.getRelationshipPath(from, to, rel, app.relationships);
            const attachment = route.attachmentSegment;
            const anchor = {
                x: (attachment.start.x + attachment.end.x) / 2,
                y: (attachment.start.y + attachment.end.y) / 2
            };
            const originalEditButtonGeom = canvas._editButtonGeom;
            const editGeometryCalls = [];
            let editButton = null;
            let pencil = false;
            canvas._editButtonGeom = function(editPath, category) {
                const geometry = originalEditButtonGeom.call(this, editPath, category);
                editGeometryCalls.push({ path: editPath, category, point: geometry?.point });
                return geometry;
            };
            try {
                editButton = canvas.drawRelationshipEditButton(rel, from, to, app.relationships);
                pencil = !!editButton && canvas.isPointOnEditButton(editButton.x, editButton.y,
                    rel, from, to, app.relationships);
            } finally {
                canvas._editButtonGeom = originalEditButtonGeom;
            }
            const originalTranslate = canvas.ctx.translate;
            let dateAnchor = null;
            canvas.ctx.translate = function(x, y) {
                dateAnchor = { x, y };
                return originalTranslate.call(this, x, y);
            };
            try {
                canvas.drawRelationshipDate(from, to, rel, app.persons, app.relationships);
            } finally {
                canvas.ctx.translate = originalTranslate;
            }
            return {
                route,
                path,
                from,
                to,
                pathMatchesRoute: JSON.stringify(path) === JSON.stringify(route.points),
                hit: app.getRelationshipAt(anchor.x, anchor.y)?.id || null,
                pencil,
                pencilCanonicalRoute: editGeometryCalls.length === 2 && editGeometryCalls.every(call =>
                    call.category === 'marriage'
                    && JSON.stringify(call.path) === JSON.stringify(route.points)
                    && pointOnPath(call.point, route.points)),
                dateAnchor,
                dateOnCanonicalRoute: eq(dateAnchor, route.decoration)
                    && pointOnPath(dateAnchor, route.points),
                attachmentOnCanonicalRoute: pointOnPath(attachment.start, route.points)
                    && pointOnPath(attachment.end, route.points)
            };
        };
        const byId = Object.fromEntries(app.relationships.map(rel => [rel.id, inspect(rel)]));
        const straight = byId.straight;
        const over = byId.over;
        const under = byId.under;
        const auto = byId.auto;
        const straightRight = straight.from.getConnectionPoint('right');
        const straightLeft = straight.to.getConnectionPoint('left');
        const overTop = over.from.getConnectionPoint('top');
        const underBottom = under.from.getConnectionPoint('bottom');
        const underBottomEnd = under.to.getConnectionPoint('bottom');
        return {
            straight: {
                exactSideLine: straight.route.points.length === 2
                    && eq(straight.route.points[0], straightRight)
                    && eq(straight.route.points[1], straightLeft),
                pencilCanonicalRoute: straight.pencilCanonicalRoute,
                canonical: straight.pathMatchesRoute && straight.hit === 'straight'
                    && straight.pencil && straight.pencilCanonicalRoute && straight.dateOnCanonicalRoute
                    && straight.attachmentOnCanonicalRoute
            },
            over: {
                topOnly: eq(over.route.points[0], overTop)
                    && eq(over.route.points.at(-1), over.to.getConnectionPoint('top'))
                    && over.route.points.every(point => point.y <= over.from.y),
                pencilCanonicalRoute: over.pencilCanonicalRoute,
                canonical: over.pathMatchesRoute && over.hit === 'over'
                    && over.pencil && over.pencilCanonicalRoute && over.dateOnCanonicalRoute && over.attachmentOnCanonicalRoute
            },
            under: {
                bottomOnly: eq(under.route.points[0], underBottom)
                    && eq(under.route.points.at(-1), underBottomEnd)
                    && under.route.points.some(point => point.y > under.from.y + canvas.personSize / 2),
                pencilCanonicalRoute: under.pencilCanonicalRoute,
                canonical: under.pathMatchesRoute && under.hit === 'under'
                    && under.pencil && under.pencilCanonicalRoute && under.dateOnCanonicalRoute && under.attachmentOnCanonicalRoute
            },
            auto: {
                noUnderCandidate: !['under', 'inner', 'outer-left', 'outer-right'].includes(auto.route.candidateName)
                    && eq(auto.route.points[0], auto.from.getConnectionPoint('top'))
                    && eq(auto.route.points.at(-1), auto.to.getConnectionPoint('top')),
                topBridgeOnly: ['bridge-near', 'bridge-middle', 'bridge-far'].includes(auto.route.candidateName)
                    && auto.route.points.every(point => point.y <= auto.from.y),
                pencilCanonicalRoute: auto.pencilCanonicalRoute,
                canonical: auto.pathMatchesRoute && auto.hit === 'auto'
                    && auto.pencil && auto.pencilCanonicalRoute && auto.dateOnCanonicalRoute && auto.attachmentOnCanonicalRoute
            }
        };
    });
    check('straight 走法維持左右側接的原始水平點位',
        routeModeEdges.straight.exactSideLine, JSON.stringify(routeModeEdges.straight));
    check('over 走法只經由上方 bridge',
        routeModeEdges.over.topOnly, JSON.stringify(routeModeEdges.over));
    check('under 走法才使用下方 cardinal ports',
        routeModeEdges.under.bottomOnly, JSON.stringify(routeModeEdges.under));
    check('auto 遇夾者不選 bottom under candidate',
        routeModeEdges.auto.noUnderCandidate, JSON.stringify(routeModeEdges.auto));
    check('auto 遇夾者的整段路徑只走上方 bridge',
        routeModeEdges.auto.topBridgeOnly, JSON.stringify(routeModeEdges.auto));
    check('四種婚姻走法的鉛筆錨點均來自 canonical route',
        Object.values(routeModeEdges).every(mode => mode.pencilCanonicalRoute), JSON.stringify(routeModeEdges));
    check('四種婚姻走法的命中、鉛筆、日期均共用 canonical route',
        Object.values(routeModeEdges).every(mode => mode.canonical), JSON.stringify(routeModeEdges));

    check('測試期間無 console/page error', errors.length === 0, errors.join(' | '));

    results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.name}${r.detail ? ' | ' + r.detail : ''}`));
    const failed = results.filter(r => !r.ok);
    console.log(`\n===== relationship-edges ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);

    await browser.close();
    if (failed.length) process.exit(1);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
