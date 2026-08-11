/**
 * 同住框/生活圈體檢修復的回歸測試
 * 用法：NODE_PATH=<playwright node_modules> node refactor/verify_hh_lc.js
 * 涵蓋審計發現的修復：
 *  H1 createHousehold 一次 Ctrl+Z 可復原
 *  H2 重疊建框只移出重疊成員（舊框保留）
 *  H3 拖曳同住框可 undo + 剛體平移（相對位置保留）
 *  H4 斜對角成員不再用狗骨頭（框內遠處空白點不到）
 *  H5 巢狀框：內層小框選得到
 *  H6 ghost household 載入時清洗
 *  L1 finishLifeCircle 一次 Ctrl+Z 可復原
 *  L2 雙擊完成不產生重複頂點
 *  L3 選過生活圈再選人 → Del 刪的是人
 *  L4 生活圈邊界帶命中（平滑外凸區點得到、內部點不到→可平移）
 *  L5 拖曳生活圈（邊界啟動）可 undo
 *  L6 z-order：生活圈不再罩染人物符號
 *  L7 純生活圈畫布可匯出
 *  L8 cancelInteraction 清 draggedLifeCircle
 *  P1 屬性面板：同住框/生活圈分支存在且可編輯
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const fails = [];
const oks = [];
function check(name, cond, detail = '') {
    if (cond) { oks.push(name); } else { fails.push(name + (detail ? ` — ${detail}` : '')); }
}

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);

    const canvasBox = await page.evaluate(() => {
        const r = document.querySelector('#genogramCanvas').getBoundingClientRect();
        return { left: r.left, top: r.top };
    });
    const toScreen = (x, y) => ({ x: canvasBox.left + x, y: canvasBox.top + y });
    async function drag(fromX, fromY, toX, toY) {
        const s = toScreen(fromX, fromY);
        const e = toScreen(toX, toY);
        await page.mouse.move(s.x, s.y);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) {
            await page.mouse.move(s.x + (e.x - s.x) * i / 10, s.y + (e.y - s.y) * i / 10);
        }
        await page.mouse.up();
    }

    // ====== 建基本人物 ======
    await page.evaluate(() => {
        const app = window.app;
        const mk = (x, y, g, n) => { const p = new Person({ x, y, gender: g, name: n }); app.persons.push(p); return p; };
        window._P = {
            p1: mk(300, 300, 'male', 'P1'),
            p2: mk(420, 300, 'female', 'P2'),
            p3: mk(540, 300, 'male', 'P3'),
            p4: mk(660, 300, 'female', 'P4'),
            far: mk(650, 540, 'female', '孫女'),
            outsider: mk(480, 420, 'male', '鄰居')
        };
        app._syncPersonMap();
        app.render();
    });

    // ====== H1: createHousehold undo ======
    let r = await page.evaluate(() => {
        const app = window.app;
        const undoBefore = app.history.undoStack.length;
        app.householdSelection = [window._P.p1.id, window._P.p2.id];
        app.createHousehold();
        const created = app.households.length;
        app.undo();
        return { created, afterUndo: app.households.length, undoDelta: app.history.undoStack.length - undoBefore };
    });
    check('H1 建同住框後一次 undo 即移除', r.created === 1 && r.afterUndo === 0, JSON.stringify(r));

    // ====== H2: 重疊建框只移出重疊成員 ======
    r = await page.evaluate(() => {
        const app = window.app;
        app.householdSelection = [window._P.p1.id, window._P.p2.id, window._P.p3.id];
        app.createHousehold(); // A = {P1,P2,P3}
        app.householdSelection = [window._P.p3.id, window._P.p4.id];
        app.createHousehold(); // B = {P3,P4} → A 應剩 {P1,P2}
        const sizes = app.households.map(h => h.ids.length).sort().join(',');
        const count = app.households.length;
        // 還原
        app.households = [];
        app.selectedHouseholdId = null;
        return { count, sizes };
    });
    check('H2 重疊建框：舊框保留剩餘成員（2 框、各 2 人）', r.count === 2 && r.sizes === '2,2', JSON.stringify(r));

    // ====== H3: 拖曳同住框 → 剛體平移 + undo ======
    r = await page.evaluate(() => {
        const app = window.app;
        // 刻意 off-grid 的內部間距
        window._P.p1.x = 313; window._P.p1.y = 300;
        window._P.p2.x = 420; window._P.p2.y = 312;
        app.householdSelection = [window._P.p1.id, window._P.p2.id];
        app.createHousehold();
        app.selectedHouseholdId = null;
        app.render();
        return { hid: app.households[0].id, relDx: window._P.p2.x - window._P.p1.x, relDy: window._P.p2.y - window._P.p1.y };
    });
    const relBefore = { dx: r.relDx, dy: r.relDy };
    const undoLenBefore = await page.evaluate(() => window.app.history.undoStack.length);
    // 拖框內空白（p1/p2 中間上方一點）
    await drag(366, 270, 460, 282);
    let after = await page.evaluate(() => ({
        p1: { x: window._P.p1.x, y: window._P.p1.y },
        relDx: window._P.p2.x - window._P.p1.x,
        relDy: window._P.p2.y - window._P.p1.y,
        undoLen: window.app.history.undoStack.length
    }));
    check('H3 拖框剛體平移：成員相對位置不變', after.relDx === relBefore.dx && after.relDy === relBefore.dy,
        `before=(${relBefore.dx},${relBefore.dy}) after=(${after.relDx},${after.relDy})`);
    check('H3 拖框寫入一筆 history', after.undoLen === undoLenBefore + 1, `undo ${undoLenBefore}→${after.undoLen}`);
    r = await page.evaluate(() => {
        window.app.undo();
        return { x: window._P.p1.x, y: window._P.p1.y };
    });
    check('H3 undo 還原拖框位置', Math.abs(r.x - 313) < 0.01 && Math.abs(r.y - 300) < 0.01, JSON.stringify(r));

    // ====== H4: 斜對角成員 → 不用狗骨頭、框內遠處空白點不到 ======
    r = await page.evaluate(() => {
        const app = window.app;
        app.households = [];
        app.householdSelection = [window._P.p1.id, window._P.far.id]; // (313,300) 與 (650,540) 斜對角
        app.createHousehold();
        app.selectedHouseholdId = null;
        app.render();
        // bbox 中間上方的空白（凹包應已縮腰避開）：取右上角區域
        const hitEmpty = app.getHouseholdAt(620, 320);
        const hitOnOutsider = app.getHouseholdAt(window._P.outsider.x, window._P.outsider.y);
        app.households = [];
        return { hitEmpty: !!hitEmpty, hitOnOutsider: !!hitOnOutsider };
    });
    check('H4 斜對角成員：bbox 角落空白與非成員位置不再命中', !r.hitEmpty && !r.hitOnOutsider, JSON.stringify(r));

    // ====== H5: 巢狀框 — 內層小框選得到 ======
    r = await page.evaluate(() => {
        const app = window.app;
        window._P.p1.x = 360; window._P.p1.y = 300;
        window._P.p2.x = 480; window._P.p2.y = 300;
        app.householdSelection = [window._P.p1.id, window._P.p2.id];
        app.createHousehold(); // 小框
        const small = app.households[app.households.length - 1].id;
        app.householdSelection = [window._P.p3.id, window._P.p4.id, window._P.p1.id, window._P.p2.id];
        // 直接塞一個大框（繞過 createHousehold 的移出邏輯來製造巢狀場景）
        app.households.push({ id: 'house_big_test', ids: [window._P.p1.id, window._P.p2.id, window._P.p3.id, window._P.p4.id], notes: '' });
        app.householdSelection = [];
        app.render();
        // 點小框成員中間（兩框都命中 → 應回傳面積較小者）
        const hit = app.getHouseholdAt(420, 300);
        const result = { hitsSmall: hit && hit.id === small };
        app.households = [];
        app.render();
        return result;
    });
    check('H5 巢狀框：命中時回傳面積最小的內層框', r.hitsSmall, JSON.stringify(r));

    // ====== H6: ghost household 載入清洗 ======
    r = await page.evaluate(() => {
        const app = window.app;
        const data = {
            persons: app.persons.map(p => p.toJSON()),
            relationships: [],
            households: [
                { id: 'ghost', ids: ['nonexistent_1', 'nonexistent_2'], notes: '' },
                { id: 'partial', ids: ['nonexistent_3', window._P.p1.id], notes: '' }
            ],
            lifeCircles: [
                { id: 'badlc', points: [{ x: 1, y: NaN }, { x: 2, y: 3 }], color: '', label: '' }
            ]
        };
        app.loadData(data);
        return {
            households: app.households.map(h => ({ id: h.id, n: h.ids.length })),
            lifeCircles: app.lifeCircles.length
        };
    });
    check('H6 ghost household/壞生活圈在載入時清洗',
        r.households.length === 1 && r.households[0].id === 'partial' && r.households[0].n === 1 && r.lifeCircles === 0,
        JSON.stringify(r));

    // ====== 重建人物（loadData 重置了引用；resetZoom 動過視圖，歸零讓螢幕=世界座標） ======
    await page.evaluate(() => {
        const app = window.app;
        app.clearAllSelections();
        app.persons = [];
        app.relationships = [];
        app.households = [];
        app.lifeCircles = [];
        app._syncPersonMap();
        const mk = (x, y, g, n) => { const p = new Person({ x, y, gender: g, name: n }); app.persons.push(p); return p; };
        window._P = { a: mk(700, 300, 'male', 'A'), b: mk(860, 300, 'female', 'B') };
        app._syncPersonMap();
        app.canvas.scale = 1;
        app.canvas.offsetX = 0;
        app.canvas.offsetY = 0;
        app.render();
    });

    // ====== L1: finishLifeCircle undo ======
    r = await page.evaluate(() => {
        const app = window.app;
        app.currentLifeCirclePoints = [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 300, y: 380 }];
        app.isDrawingLifeCircle = true;
        app.finishLifeCircle();
        const created = app.lifeCircles.length;
        app.undo();
        return { created, afterUndo: app.lifeCircles.length };
    });
    check('L1 建生活圈後一次 undo 即移除', r.created === 1 && r.afterUndo === 0, JSON.stringify(r));

    // ====== L2: 雙擊重複頂點去除 ======
    r = await page.evaluate(() => {
        const app = window.app;
        app.currentLifeCirclePoints = [
            { x: 200, y: 200 }, { x: 400, y: 200 }, { x: 300, y: 380 }, { x: 300, y: 380 } // 模擬 dblclick 重複
        ];
        app.isDrawingLifeCircle = true;
        app.finishLifeCircle();
        const lc = app.lifeCircles[app.lifeCircles.length - 1];
        return { pts: lc ? lc.points.length : 0 };
    });
    check('L2 雙擊完成：重複末端頂點被去除（4→3）', r.pts === 3, JSON.stringify(r));

    // ====== L4: 邊界帶命中 ======
    r = await page.evaluate(() => {
        const app = window.app;
        // 三角形 (200,200)(400,200)(300,380)：上緣平滑曲線外凸至 y≈177.5
        // — 在「視覺上的曲線」位置應命中（所見即所點）
        const onEdge = !!app.getLifeCircleAt(300, 178);
        // 形狀中心：內部 — 不應命中（讓給 pan）
        const inside = !!app.getLifeCircleAt(300, 270);
        // 頂點
        const onVertex = !!app.getLifeCircleAt(200, 200);
        return { onEdge, inside, onVertex };
    });
    check('L4 生活圈邊界帶命中（邊/頂點命中、內部不命中）', r.onEdge && !r.inside && r.onVertex, JSON.stringify(r));

    // ====== L3: 選圈→選人→Del 刪人 ======
    r = await page.evaluate(() => {
        const app = window.app;
        app.selectedLifeCircleId = app.lifeCircles[0].id; // 模擬先選過圈
        app.selectPerson(window._P.b.id); // 再選人（應清掉圈選取）
        const before = { persons: app.persons.length, lcs: app.lifeCircles.length };
        app.deleteSelected();
        return {
            before,
            after: { persons: app.persons.length, lcs: app.lifeCircles.length }
        };
    });
    check('L3 選過圈再選人 → Del 刪的是人不是圈',
        r.after.persons === r.before.persons - 1 && r.after.lcs === r.before.lcs, JSON.stringify(r));

    // ====== L5: 拖曳生活圈（邊界啟動）→ undo ======
    r = await page.evaluate(() => ({
        undoLen: window.app.history.undoStack.length,
        x0: window.app.lifeCircles[0].points[0].x
    }));
    await drag(300, 178, 380, 228); // 從上緣平滑曲線的邊界帶拖曳
    after = await page.evaluate(() => ({
        undoLen: window.app.history.undoStack.length,
        x0: window.app.lifeCircles[0].points[0].x
    }));
    check('L5 拖曳生活圈會移動且寫一筆 history',
        Math.abs(after.x0 - (r.x0 + 80)) < 2 && after.undoLen === r.undoLen + 1,
        `x0 ${r.x0}→${after.x0}, undo ${r.undoLen}→${after.undoLen}`);
    const undoRestores = await page.evaluate(() => {
        const before = window.app.lifeCircles[0].points[0].x;
        window.app.undo();
        return { before, after: window.app.lifeCircles[0].points[0].x };
    });
    check('L5 undo 還原生活圈位置', Math.abs(undoRestores.after - r.x0) < 0.01, JSON.stringify(undoRestores));

    // ====== L6: z-order — 人物不被圈罩染 ======
    r = await page.evaluate(() => {
        const app = window.app;
        // 大圈罩住人物 A (700,300)
        app.lifeCircles = [{
            id: 'lc_big', label: '測試圈',
            points: [{ x: 600, y: 200 }, { x: 980, y: 200 }, { x: 980, y: 420 }, { x: 600, y: 420 }],
            color: 'rgba(255, 99, 132, 0.15)'
        }];
        app.selectedLifeCircleId = null;
        app.render();
        // 取人物 A 中心像素（淡藍男性底色 #edf4fc = 237,244,252；若被粉圈罩染會偏紅）
        const ctx = app.canvas.ctx;
        const dpr = app.canvas.dpr;
        const px = ctx.getImageData(Math.round(700 * dpr), Math.round(300 * dpr), 1, 1).data;
        return { rgb: [px[0], px[1], px[2]] };
    });
    check('L6 人物符號底色不被生活圈罩染（淡藍 237,244,252）',
        Math.abs(r.rgb[0] - 237) <= 3 && Math.abs(r.rgb[1] - 244) <= 3 && Math.abs(r.rgb[2] - 252) <= 3,
        `rgb=${r.rgb}`);

    // ====== L7: 純生活圈匯出 ======
    r = await page.evaluate(() => {
        const app = window.app;
        const dataUrl = app.canvas.exportToPNG([], [], [], app.lifeCircles, true, false, 1);
        return { ok: typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png') };
    });
    check('L7 純生活圈畫布可匯出 PNG', r.ok, JSON.stringify(r));

    // ====== L8: cancelInteraction 清 draggedLifeCircle ======
    r = await page.evaluate(() => {
        const app = window.app;
        app.canvas.isDragging = true;
        app.canvas.draggedLifeCircle = app.lifeCircles[0];
        app.cancelInteraction();
        return { cleared: app.canvas.draggedLifeCircle === null };
    });
    check('L8 cancelInteraction 清除 draggedLifeCircle', r.cleared, JSON.stringify(r));

    // ====== P1: 屬性面板分支 ======
    r = await page.evaluate(() => {
        const app = window.app;
        // 生活圈面板
        app.selectedLifeCircleId = app.lifeCircles[0].id;
        app.selectedHouseholdId = null;
        app.updatePropertyPanel();
        const lcPanel = document.getElementById('propertyContent').innerHTML;
        const hasLcUI = lcPanel.includes('lifeCircleLabel') && lcPanel.includes('lc-color-swatch');
        // 編輯 label
        const input = document.getElementById('lifeCircleLabel');
        input.value = '社區資源圈';
        input.dispatchEvent(new Event('input'));
        const labelApplied = app.lifeCircles[0].label === '社區資源圈';
        // 同住框面板
        app.householdSelection = [app.persons[0].id];
        app.createHousehold();
        app.updatePropertyPanel();
        const hhPanel = document.getElementById('propertyContent').innerHTML;
        const hasHhUI = hhPanel.includes('householdNotes') && hhPanel.includes('同住家庭');
        const notesEl = document.getElementById('householdNotes');
        notesEl.value = '與外婆同住';
        notesEl.dispatchEvent(new Event('input'));
        const notesApplied = app.households[0].notes === '與外婆同住';
        return { hasLcUI, labelApplied, hasHhUI, notesApplied };
    });
    check('P1 生活圈面板：名稱/色票可編輯', r.hasLcUI && r.labelApplied, JSON.stringify(r));
    check('P1 同住框面板：成員清單/備註可編輯', r.hasHhUI && r.notesApplied, JSON.stringify(r));

    // ====== H7: 人物文字微調不得改變同住框或生活圈 ======
    r = await page.evaluate(() => {
        const app = window.app;
        const memberA = new Person({ id: 'label-stable-a', x: 360, y: 360,
            gender: 'male', name: '很長的同住成員姓名', notes: '備註第一行\n備註第二行' });
        const memberB = new Person({ id: 'label-stable-b', x: 600, y: 360,
            gender: 'female', name: '同住成員乙' });
        app.persons = [memberA, memberB];
        app.relationships = [];
        app.households = [{ id: 'label-stable-household',
            ids: [memberA.id, memberB.id], notes: '固定資料' }];
        app.lifeCircles = [{ id: 'label-stable-circle', color: '#90caf9',
            label: '固定生活圈', points: [
                { x: 260, y: 240 }, { x: 700, y: 240 },
                { x: 700, y: 500 }, { x: 260, y: 500 }
            ] }];
        app._syncPersonMap();
        app.selectPerson(memberA.id);
        const before = {
            householdGeometry: app.canvas.getHouseholdBounds(
                app.households[0], app.persons, app.relationships),
            households: JSON.stringify(app.households),
            lifeCircles: JSON.stringify(app.lifeCircles),
            person: { x: memberA.x, y: memberA.y },
            label: app.canvas.getPersonLabelGeometry(memberA,
                { showNames: true, showNotes: true }).bounds
        };
        app.adjustSelectedPersonLabel('right');
        const after = {
            householdGeometry: app.canvas.getHouseholdBounds(
                app.households[0], app.persons, app.relationships),
            households: JSON.stringify(app.households),
            lifeCircles: JSON.stringify(app.lifeCircles),
            person: { x: memberA.x, y: memberA.y },
            label: app.canvas.getPersonLabelGeometry(memberA,
                { showNames: true, showNotes: true }).bounds,
            exportOk: app.canvas.exportToPNG(app.persons, app.relationships,
                app.households, app.lifeCircles, true, false, 1, app.viewOptions)
                .startsWith('data:image/png;base64,')
        };
        return { before, after };
    });
    check('H7 文字微調不改變同住框、生活圈或人物座標',
        JSON.stringify(r.before.householdGeometry)
            === JSON.stringify(r.after.householdGeometry)
            && r.before.households === r.after.households
            && r.before.lifeCircles === r.after.lifeCircles
            && JSON.stringify(r.before.person) === JSON.stringify(r.after.person)
            && Math.abs(r.after.label.left - r.before.label.left - 12) < 0.000001
            && r.after.exportOk,
        JSON.stringify(r));

    // ====== 截圖總覽 ======
    await page.evaluate(() => window.app.render());
    await page.screenshot({ path: path.join(__dirname, 'hhlc_final.png') });

    // 匯出對照
    const dataUrl = await page.evaluate(() =>
        window.app.canvas.exportToPNG(window.app.persons, window.app.relationships,
            window.app.households, window.app.lifeCircles, true, false, 1));
    if (dataUrl) {
        fs.writeFileSync(path.join(__dirname, 'hhlc_export.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
    }

    await browser.close();

    console.log('PASS:');
    oks.forEach(o => console.log('  ✓ ' + o));
    if (errors.length) {
        console.log('JS ERRORS:');
        errors.forEach(e => console.log('  ' + e));
    }
    if (fails.length) {
        console.log('FAIL:');
        fails.forEach(f => console.log('  ✗ ' + f));
        process.exit(1);
    }
    if (errors.length) process.exit(1);
    console.log('ALL HH/LC CHECKS PASSED');
})();
