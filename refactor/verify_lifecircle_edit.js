/**
 * [第四批 LC-1～LC-3] 生活圈：頂點拖曳/新增/刪除、拖拉橢圓建立、Backspace 退頂點、標籤位置與說明
 * 用法：node refactor/run_all.js lifecircle_edit
 */
const { chromium } = require('playwright');
const path = require('path');

const results = [];
const check = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas && window.app.isLoading === false);

    // 八邊形（貝茲平滑後與直線邊差距很小，方便在邊線上雙擊）
    await page.evaluate(() => {
        const app = window.app;
        app.canvas.scale = 1; app.canvas.offsetX = 0; app.canvas.offsetY = 0; app.updateZoomDisplay();
        const cx = 500, cy = 450, r = 150;
        const pts = [];
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pts.push({ x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) }); }
        app.lifeCircles.push({ id: 'lc', label: '學校', color: GenogramApp.LIFE_CIRCLE_COLORS[1], points: pts });
        app.render();
        window.__toScreen = (x, y) => { const rect = app.canvas.canvas.getBoundingClientRect(); return { x: rect.left + x * app.canvas.scale + app.canvas.offsetX, y: rect.top + y * app.canvas.scale + app.canvas.offsetY }; };
    });
    const S = async (x, y) => page.evaluate(([x, y]) => window.__toScreen(x, y), [x, y]);
    const pts = await page.evaluate(() => window.app.lifeCircles[0].points.map(p => ({ ...p })));

    // 選取：點第 0 個頂點（未選取時 → 選圈；微拖不寫 history）
    let s = await S(pts[0].x, pts[0].y);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(60);
    let st = await page.evaluate(() => ({ sel: window.app.selectedLifeCircleId, hist: window.app.history.undoStack.length, p0: window.app.lifeCircles[0].points[0] }));
    check('點頂點選取生活圈；未移動不寫 history、頂點不動', st.sel === 'lc' && st.hist === 0 && st.p0.x === pts[0].x && st.p0.y === pts[0].y, JSON.stringify(st));

    // ---- LC-1 拖單一頂點 ----
    s = await S(pts[0].x, pts[0].y);
    await page.mouse.move(s.x, s.y); await page.mouse.down();
    await page.mouse.move(s.x + 20, s.y + 15, { steps: 4 }); await page.mouse.move(s.x + 40, s.y + 30, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    st = await page.evaluate(() => { const lc = window.app.lifeCircles[0]; return { p0: lc.points[0], p1: lc.points[1], n: lc.points.length, hist: window.app.history.undoStack.length, dragging: window.app.canvas.isDragging, vd: window.app.lcVertexDrag }; });
    check('拖第 0 個頂點 (+40,+30) → 只有該點移動、其餘不動、history +1、狀態清空',
        Math.abs(st.p0.x - (pts[0].x + 40)) < 1 && Math.abs(st.p0.y - (pts[0].y + 30)) < 1 && st.p1.x === pts[1].x && st.p1.y === pts[1].y && st.n === 8 && st.hist === 1 && !st.dragging && st.vd === null, JSON.stringify(st));
    await page.evaluate(() => window.app.undo());
    st = await page.evaluate(() => window.app.lifeCircles[0].points[0]);
    check('Undo 還原頂點', st.x === pts[0].x && st.y === pts[0].y, JSON.stringify(st));

    // ---- LC-1 Alt+點頂點刪除 ----
    await page.evaluate(() => { window.app.selectedLifeCircleId = 'lc'; window.app.render(); });
    s = await S(pts[3].x, pts[3].y);
    await page.keyboard.down('Alt'); await page.mouse.click(s.x, s.y); await page.keyboard.up('Alt');
    await page.waitForTimeout(60);
    st = await page.evaluate(() => ({ n: window.app.lifeCircles[0].points.length, hist: window.app.history.undoStack.length, has3: window.app.lifeCircles[0].points.some(p => p.x === 394 && p.y === 556) }));
    check('Alt+點第 3 個頂點 → 8→7、history +1', st.n === 7 && st.hist === 1, JSON.stringify(st));
    // 減到 3 後拒絕再刪
    await page.evaluate(() => { const lc = window.app.lifeCircles[0]; lc.points = lc.points.slice(0, 3); window.app.render(); });
    const p3 = await page.evaluate(() => window.app.lifeCircles[0].points[0]);
    s = await S(p3.x, p3.y);
    await page.keyboard.down('Alt'); await page.mouse.click(s.x, s.y); await page.keyboard.up('Alt');
    await page.waitForTimeout(60);
    st = await page.evaluate(() => ({ n: window.app.lifeCircles[0].points.length, status: document.getElementById('statusBar').textContent }));
    check('只剩 3 點時 Alt+點 → 拒絕並提示', st.n === 3 && /3 個頂點/.test(st.status), JSON.stringify(st));

    // ---- LC-1 雙擊邊線插入頂點 ----
    await page.evaluate(() => { const app = window.app; app.lifeCircles[0].points = [{ x: 350, y: 300 }, { x: 650, y: 300 }, { x: 650, y: 600 }, { x: 350, y: 600 }]; app.selectedLifeCircleId = 'lc'; app.render(); });
    // 找到平滑曲線上、介於 p0-p1 之間的實際點（沿法線掃描）
    const edgePt = await page.evaluate(() => {
        const app = window.app, c = app.canvas, lc = app.lifeCircles[0];
        const path = c.buildSmoothClosedPath(lc.points);
        const ctx = c.ctx; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineWidth = 2;
        let found = null;
        for (let dy = -60; dy <= 60 && !found; dy += 1) { if (ctx.isPointInStroke(path, 500, 300 + dy)) found = { x: 500, y: 300 + dy }; }
        ctx.restore(); return found;
    });
    check('找到 p0–p1 間平滑邊線上的點', !!edgePt, JSON.stringify(edgePt));
    if (edgePt) {
        s = await S(edgePt.x, edgePt.y);
        const hBefore = await page.evaluate(() => window.app.history.undoStack.length);
        await page.mouse.dblclick(s.x, s.y);
        await page.waitForTimeout(80);
        st = await page.evaluate(() => ({ pts: window.app.lifeCircles[0].points, hist: window.app.history.undoStack.length }));
        check('雙擊邊線 → 插入頂點於 p0 之後、history +1', st.pts.length === 5 && Math.abs(st.pts[1].x - 500) < 2 && st.hist === hBefore + 1, JSON.stringify(st));
    }

    // ---- LC-2 拖拉橢圓 ----
    await page.evaluate(() => { window.app.clearAllSelections(); window.app.setTool('lifeCircle'); });
    const hEll = await page.evaluate(() => window.app.history.undoStack.length);
    s = await S(800, 200);
    await page.mouse.move(s.x, s.y); await page.mouse.down();
    await page.mouse.move(s.x + 60, s.y + 40, { steps: 5 }); await page.mouse.move(s.x + 200, s.y + 120, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    st = await page.evaluate(() => { const app = window.app; const lc = app.lifeCircles[app.lifeCircles.length - 1]; const xs = lc.points.map(p => p.x), ys = lc.points.map(p => p.y); return { count: app.lifeCircles.length, n: lc.points.length, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), hist: app.history.undoStack.length, drawing: app.isDrawingLifeCircle, press: app.lcPress, preview: app.ellipsePreview, selected: app.selectedLifeCircleId === lc.id }; });
    check('生活圈工具按住拖 200×120 → 新圈 16 點、外接框 ≈ 拖曳矩形、history +1、狀態清空、選取新圈',
        st.count === 2 && st.n === 16 && Math.abs(st.minX - 800) < 2 && Math.abs(st.maxX - 1000) < 2 && Math.abs(st.minY - 200) < 2 && Math.abs(st.maxY - 320) < 2 && st.hist === hEll + 1 && !st.drawing && st.press === null && st.preview === null && st.selected, JSON.stringify(st));

    // ---- LC-2 點一下 = 第 1 個頂點；Backspace 退回 ----
    await page.evaluate(() => { window.app.setTool('lifeCircle'); });
    s = await S(300, 700); await page.mouse.click(s.x, s.y); await page.waitForTimeout(40);
    s = await S(400, 700); await page.mouse.click(s.x, s.y); await page.waitForTimeout(40);
    s = await S(400, 800); await page.mouse.click(s.x, s.y); await page.waitForTimeout(40);
    st = await page.evaluate(() => ({ drawing: window.app.isDrawingLifeCircle, n: window.app.currentLifeCirclePoints.length }));
    check('點三下 → 繪製中 3 個頂點', st.drawing && st.n === 3, JSON.stringify(st));
    await page.keyboard.press('Backspace'); await page.waitForTimeout(40);
    st = await page.evaluate(() => ({ drawing: window.app.isDrawingLifeCircle, n: window.app.currentLifeCirclePoints.length, count: window.app.lifeCircles.length }));
    check('Backspace → 退回 1 個頂點（剩 2），不刪任何生活圈', st.drawing && st.n === 2 && st.count === 2, JSON.stringify(st));
    s = await S(300, 800); await page.mouse.click(s.x, s.y); await page.waitForTimeout(40);
    await page.keyboard.press('Enter'); await page.waitForTimeout(60);
    st = await page.evaluate(() => ({ count: window.app.lifeCircles.length, n: window.app.lifeCircles[2]?.points.length, drawing: window.app.isDrawingLifeCircle }));
    check('再點一下 + Enter → 第 3 個生活圈（3 點）', st.count === 3 && st.n === 3 && !st.drawing, JSON.stringify(st));
    await page.evaluate(() => { window.app.setTool('lifeCircle'); });
    s = await S(900, 600); await page.mouse.click(s.x, s.y); await page.waitForTimeout(40);
    await page.keyboard.press('Backspace'); await page.waitForTimeout(40);
    st = await page.evaluate(() => ({ drawing: window.app.isDrawingLifeCircle, n: window.app.currentLifeCirclePoints.length, count: window.app.lifeCircles.length }));
    check('只有 1 個頂點時 Backspace → 取消繪製，不刪生活圈', !st.drawing && st.n === 0 && st.count === 3, JSON.stringify(st));

    // ---- LC-3 標籤位置 + 說明 ----
    await page.evaluate(() => { const app = window.app; app.setTool('select'); app.selectedLifeCircleId = 'lc'; app.updatePropertyPanel(); app.render(); });
    st = await page.evaluate(() => ({ hasPos: !!document.getElementById('lifeCircleLabelPosition'), hasNotes: !!document.getElementById('lifeCircleNotes'), posVal: document.getElementById('lifeCircleLabelPosition')?.value }));
    check('面板有「標籤位置」與「說明」欄，預設頂部', st.hasPos && st.hasNotes && st.posVal === 'top', JSON.stringify(st));
    await page.selectOption('#lifeCircleLabelPosition', 'center');
    await page.fill('#lifeCircleNotes', '每週三下午');
    await page.locator('#lifeCircleNotes').press('Tab');
    await page.waitForTimeout(60);
    st = await page.evaluate(() => {
        const app = window.app; const lc = app.lifeCircles[0];
        const calls = []; const orig = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...r) { calls.push({ t: String(t), x, y }); return orig.call(this, t, x, y, ...r); };
        try { app.render(); } finally { CanvasRenderingContext2D.prototype.fillText = orig; }
        const label = calls.find(c => c.t === '學校');
        const cx = lc.points.reduce((s, p) => s + p.x, 0) / lc.points.length, cy = lc.points.reduce((s, p) => s + p.y, 0) / lc.points.length;
        const state = app.getState().lifeCircles[0];
        return { pos: lc.labelPosition, notes: lc.notes, label, cx, cy, statePos: state.labelPosition, stateNotes: state.notes, notesDrawn: calls.some(c => c.t === '每週三下午') };
    });
    check('標籤位置=center → 文字畫在質心；說明存入且不畫在畫布；皆進存檔快照',
        st.pos === 'center' && st.notes === '每週三下午' && st.label && Math.abs(st.label.x - st.cx) < 1 && Math.abs(st.label.y - st.cy) < 1 && st.statePos === 'center' && st.stateNotes === '每週三下午' && !st.notesDrawn, JSON.stringify(st));
    await page.selectOption('#lifeCircleLabelPosition', 'bottom');
    await page.waitForTimeout(60);
    st = await page.evaluate(() => {
        const app = window.app; const lc = app.lifeCircles[0];
        const calls = []; const orig = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...r) { calls.push({ t: String(t), x, y }); return orig.call(this, t, x, y, ...r); };
        try { app.render(); } finally { CanvasRenderingContext2D.prototype.fillText = orig; }
        const label = calls.find(c => c.t === '學校'); const maxY = Math.max(...lc.points.map(p => p.y));
        return { label, maxY };
    });
    check('標籤位置=bottom → 文字畫在最低頂點下方', st.label && st.label.y > st.maxY, JSON.stringify(st));

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== lifecircle-edit ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
