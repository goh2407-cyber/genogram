/**
 * [LC-4] 生活圈畫法：填色／邊框分道、名稱定位（頂部置中、中央避開成員）、名稱可移動、整圓、貼合成員、預覽、匯出。
 */
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();

    const r = await page.evaluate(async () => {
        const app = window.app, c = app.canvas;
        const ell = (cx, cy, rx, ry) => GenogramApp.ellipsePoints({ x: cx - rx, y: cy - ry }, { x: cx + rx, y: cy + ry }, 16);
        app.loadData({ version: '1.1',
            persons: [
                { id: 'ip', name: '案主', gender: 'female', x: 400, y: 300, isIdentifiedPatient: true },
                { id: 'm', name: '媽媽', gender: 'female', x: 400, y: 180 },
                { id: 'sw', name: '社工', gender: 'female', x: 900, y: 200 },
                { id: 'far', name: '路人', gender: 'male', x: 1300, y: 600 }
            ],
            relationships: [{ id: 'p1', fromPersonId: 'm', toPersonId: 'ip', type: 'parent-child' }],
            lifeCircles: [
                { id: 'l1', label: '家', color: 'rgba(74, 144, 226, 0.15)', points: ell(400, 240, 200, 150) },
                { id: 'l2', label: '學校', color: 'rgba(80, 200, 120, 0.15)', points: [{ x: 500, y: 240 }, { x: 760, y: 230 }, { x: 790, y: 360 }, { x: 650, y: 480 }, { x: 480, y: 460 }, { x: 470, y: 340 }] },
                { id: 'l3', label: '社福資源', color: 'rgba(255, 165, 0, 0.15)', labelPosition: 'center', points: ell(900, 200, 110, 90) }
            ]
        });
        app.clearAllSelections();
        const out = {};

        // 1) 填色全部畫完才描邊（Path2D 呼叫順序）
        const seq = [];
        const P = CanvasRenderingContext2D.prototype;
        const of = P.fill, os = P.stroke;
        P.fill = function (...a) { if (a[0] instanceof Path2D) seq.push('F'); return of.apply(this, a); };
        P.stroke = function (...a) { if (a[0] instanceof Path2D) seq.push('S'); return os.apply(this, a); };
        try { app.render(); } finally { P.fill = of; P.stroke = os; }
        out.seq = seq.join('');

        // 2) 名稱定位
        const l2 = app.lifeCircles[1];
        const xs = l2.points.map(q => q.x);
        const top = c.getLifeCircleLabelAnchor(l2, app.persons, 40);
        const smp = c.sampleSmoothClosedPath(l2.points, 8);
        const cx2 = (Math.min(...smp.map(q => q.x)) + Math.max(...smp.map(q => q.x))) / 2;
        const bandW = Math.max(20, (Math.max(...smp.map(q => q.x)) - Math.min(...smp.map(q => q.x))) * 0.25);
        const curveTopAtCenter = Math.min(...smp.filter(q => Math.abs(q.x - cx2) <= bandW).map(q => q.y));
        out.topCentered = Math.abs(top.x - cx2) < 1 && Math.abs(top.y - (curveTopAtCenter - 6)) < 0.01 && top.baseline === 'bottom';
        const bot = c.getLifeCircleLabelAnchor({ ...l2, labelPosition: 'bottom' }, app.persons, 40);
        out.bottomCentered = Math.abs(bot.x - top.x) < 1 && bot.y > Math.max(...l2.points.map(q => q.y)) - 1 && bot.baseline === 'top';
        const l3 = app.lifeCircles[2];
        const centerFree = c.getLifeCircleLabelAnchor(l3, [], 60);
        const centerAvoid = c.getLifeCircleLabelAnchor(l3, app.persons, 60);
        out.centerAtCentroid = Math.abs(centerFree.x - 900) < 1 && Math.abs(centerFree.y - 200) < 1;
        const half = c.personSize / 2 + 4;
        out.centerAvoidsPerson = (Math.abs(centerAvoid.y - 200) > half || Math.abs(centerAvoid.x - 900) > half)
            && GenogramCanvas.pointInPolygon(centerAvoid.x, centerAvoid.y, l3.points);
        out.labelBoxes = ['lc:l1', 'lc:l2', 'lc:l3'].every(k => c.textLabelBoxes.has(k));

        // 3) 名稱可移動（與關係文字同一套拉桿）
        app.clearAllSelections();
        app.selectedLifeCircleId = 'l2';
        app.labelEditingTarget = { kind: 'lc', id: 'l2' };
        const h0 = app.history.undoStack.length;
        app.adjustSelectedPersonLabel('up');
        out.labelMoved = l2.labelOffset && l2.labelOffset.y < 0 && app.history.undoStack.length === h0 + 1;
        app.render();
        const movedBox = c.textLabelBoxes.get('lc:l2');
        out.labelBoxFollows = Math.round(movedBox.baseBounds.top - movedBox.bounds.top) === -l2.labelOffset.y;
        app.undo();
        out.labelUndo = !app.lifeCircles[1].labelOffset;

        // 4) 整圓：點數 12–24、外接框不超出原本 ±2、history +1
        const before = app.lifeCircles[1].points.map(q => ({ ...q }));
        const bb = pts => ({ minX: Math.min(...pts.map(q => q.x)), maxX: Math.max(...pts.map(q => q.x)), minY: Math.min(...pts.map(q => q.y)), maxY: Math.max(...pts.map(q => q.y)) });
        const b0 = bb(c.sampleSmoothClosedPath(before, 12)); // 以畫出來的曲線外接框為準（曲線本就略凸於頂點框）
        app.selectedLifeCircleId = 'l2';
        const h1 = app.history.undoStack.length;
        app.smoothSelectedLifeCircle();
        const after = app.lifeCircles[1].points;
        const b1 = bb(after);
        out.smoothCount = after.length;
        out.smoothWithin = b1.minX >= b0.minX - 2 && b1.maxX <= b0.maxX + 2 && b1.minY >= b0.minY - 2 && b1.maxY <= b0.maxY + 2 && app.history.undoStack.length === h1 + 1;
        // 等距：相鄰點距離差異 < 30%
        const d = after.map((q, i) => { const n = after[(i + 1) % after.length]; return Math.hypot(n.x - q.x, n.y - q.y); });
        out.smoothEven = Math.max(...d) / Math.min(...d) < 1.3;
        app.undo();

        // 5) 貼合圈內成員：所有圈內成員仍在圈內、圈外的人不被圈進、history +1；沒成員 → 不動
        app.selectedLifeCircleId = 'l1';
        const h2 = app.history.undoStack.length;
        app.fitSelectedLifeCircleToMembers();
        const l1 = app.lifeCircles[0];
        out.fitContains = ['ip', 'm'].every(id => GenogramCanvas.pointInPolygon(app.personMap.get(id).x, app.personMap.get(id).y, l1.points));
        out.fitExcludes = !GenogramCanvas.pointInPolygon(900, 200, l1.points) && !GenogramCanvas.pointInPolygon(1300, 600, l1.points);
        out.fitHistory = app.history.undoStack.length === h2 + 1 && l1.points.length === 20;
        app.undo();
        app.selectedLifeCircleId = 'l2';
        app.lifeCircles[1].points = [{ x: 1500, y: 100 }, { x: 1600, y: 100 }, { x: 1550, y: 180 }]; // 空圈
        const h3 = app.history.undoStack.length;
        app.fitSelectedLifeCircleToMembers();
        out.fitEmptyNoop = app.history.undoStack.length === h3 && app.lifeCircles[1].points.length === 3;
        app.undo(); app.redo();

        // 6) 幾何一致：取樣點落在 Path2D 邊線上（名稱定位用的取樣 = 畫出來的線）
        const pts = app.lifeCircles[2].points;
        const samples = c.sampleSmoothClosedPath(pts, 6);
        const path = c.buildSmoothClosedPath(pts);
        const ctx = c.ctx; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineWidth = 3;
        out.samplesOnPath = samples.every(q => ctx.isPointInStroke(path, q.x, q.y));
        ctx.restore();
        out.edgeHit = c.isPointOnLifeCircleEdge(app.lifeCircles[2], samples[5].x, samples[5].y);

        // 7) 匯出可用
        await app.waitForCurrentCanvasFonts();
        const url = c.exportToPNG(app.persons, app.relationships, [], app.lifeCircles, true, false, 1, app.viewOptions, null);
        out.exportOk = typeof url === 'string' && url.startsWith('data:image/png');
        return out;
    });

    check('重疊時：所有圈先填色、再描邊（FFF…SSS）', /^F+S+$/.test(r.seq) && r.seq.length === 6, r.seq);
    check('名稱「頂部」置中於圈正上方', r.topCentered);
    check('名稱「底部」置中於圈正下方', r.bottomCentered);
    check('名稱「中央」無成員時在質心', r.centerAtCentroid);
    check('名稱「中央」會避開成員符號且留在圈內', r.centerAvoidsPerson);
    check('名稱命中框已記錄（可用文字拉桿）', r.labelBoxes);
    check('名稱可用拉桿移動、一步 undo', r.labelMoved && r.labelBoxFollows && r.labelUndo);
    check('整圓：點數 12–24、不超出原外接框、一步 undo', r.smoothCount >= 12 && r.smoothCount <= 24 && r.smoothWithin, String(r.smoothCount));
    check('整圓：頂點等距', r.smoothEven);
    check('貼合成員：圈內成員仍在圈內', r.fitContains);
    check('貼合成員：圈外的人不被圈進', r.fitExcludes);
    check('貼合成員：20 點、一步 undo', r.fitHistory);
    check('貼合成員：空圈不動、不寫 history', r.fitEmptyNoop);
    check('取樣點與畫出的曲線一致', r.samplesOnPath && r.edgeHit);
    check('匯出 PNG 正常', r.exportOk);

    // 8) 逐點畫圈預覽：3 點以上出現淡色填色（Path2D fill）
    await page.evaluate(() => { const app = window.app; app.clearAllSelections(); app.canvas.scale = 1; app.canvas.offsetX = 0; app.canvas.offsetY = 0; app.render(); app.setTool('lifeCircle'); });
    const S = (x, y) => page.evaluate(([x, y]) => { const c = window.app.canvas; const r = c.canvas.getBoundingClientRect(); return { x: r.left + x * c.scale + c.offsetX, y: r.top + y * c.scale + c.offsetY }; }, [x, y]);
    // 避開左下角縮放列（y > 640 會點到按鈕）
    for (const [x, y] of [[150, 530], [260, 530], [260, 610]]) { const s = await S(x, y); await page.mouse.click(s.x, s.y); await page.waitForTimeout(40); }
    const s4 = await S(150, 610); await page.mouse.move(s4.x, s4.y); await page.waitForTimeout(60);
    const ghost = await page.evaluate(() => {
        const P = CanvasRenderingContext2D.prototype; const of = P.fill; let n = 0;
        P.fill = function (...a) { if (a[0] instanceof Path2D) n++; return of.apply(this, a); };
        try { window.app.render(); } finally { P.fill = of; }
        return { fills: n, drawing: window.app.isDrawingLifeCircle, n: window.app.currentLifeCirclePoints.length };
    });
    check('逐點畫圈 ≥3 點時預覽圓滑形狀（多一次 Path2D 填色）', ghost.drawing && ghost.n === 3 && ghost.fills === 4, JSON.stringify(ghost));
    await page.keyboard.press('Escape');

    check('零 console error', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'RESULT OK (life circle style: two-pass, labels, smooth, fit, preview)');
})().catch(err => { console.error(err); process.exit(1); });
