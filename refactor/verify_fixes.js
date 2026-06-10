/**
 * 對抗審查修正項的回歸測試
 * 用法：NODE_PATH=<playwright node_modules> node refactor/verify_fixes.js
 * 涵蓋：
 *  F1 圖例標題文字左緣與「屬性編輯」對齊
 *  F2 兩名子女情境的等距吸附（單鄰居標準格寬 + 手足鏡像）
 *  F3 拖曳中 blur → 輔助線不殘留
 *  F4 1px 手震不觸發吸附、不寫 history
 *  F5 drawFamilies round cap 不洩漏到 drawPerson
 *  F6 Y 對齊不再對自由 Y（off-row）人物提供假輔助線
 *  F7 zoom 2x 下等距標尺繪製無錯誤
 */
const { chromium } = require('playwright');
const path = require('path');

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

    // ===== F1 標題對齊 =====
    const titleX = await page.evaluate(() => {
        const textLeft = (el) => {
            // 取第一個文字節點的左緣
            for (const node of el.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    const r = document.createRange();
                    r.selectNodeContents(node);
                    const rect = r.getBoundingClientRect();
                    if (rect.width > 0) return rect.left;
                }
            }
            return el.getBoundingClientRect().left;
        };
        const prop = document.querySelector('#propertyPanel .panel-title');
        const legend = document.querySelector('#legendPanel .panel-title');
        return { prop: textLeft(prop), legend: textLeft(legend) };
    });
    check('F1 標題文字左緣對齊', Math.abs(titleX.prop - titleX.legend) < 1.5,
        `屬性編輯=${titleX.prop.toFixed(1)} 圖例=${titleX.legend.toFixed(1)}`);

    // ===== 建立 2 子女家庭 =====
    await page.evaluate(() => {
        const app = window.app;
        const A = new Person({ x: 400, y: 180, gender: 'male', name: '父' });
        const B = new Person({ x: 560, y: 180, gender: 'female', name: '母' });
        const C = new Person({ x: 400, y: 420, gender: 'male', name: '子C' });
        const D = new Person({ x: 520, y: 420, gender: 'female', name: '女D' });
        app.persons.push(A, B, C, D);
        app._syncPersonMap();
        app.relationships.push(new Relationship({ fromPersonId: A.id, toPersonId: B.id, type: 'married' }));
        for (const kid of [C, D]) {
            app.relationships.push(new Relationship({ fromPersonId: A.id, toPersonId: kid.id, type: 'parent-child' }));
            app.relationships.push(new Relationship({ fromPersonId: B.id, toPersonId: kid.id, type: 'parent-child' }));
        }
        window._ids = { A: A.id, B: B.id, C: C.id, D: D.id };
        app.render();
    });

    // 螢幕座標換算（scale=1, offset=0；canvas 起點 = boundingRect）
    const canvasBox = await page.evaluate(() => {
        const r = document.querySelector('#genogramCanvas').getBoundingClientRect();
        return { left: r.left, top: r.top };
    });
    const toScreen = (x, y) => ({ x: canvasBox.left + x, y: canvasBox.top + y });

    async function dragPerson(fromX, fromY, toX, toY, release = true) {
        const s = toScreen(fromX, fromY);
        const e = toScreen(toX, toY);
        await page.mouse.move(s.x, s.y);
        await page.mouse.down();
        // 多步移動模擬真實拖曳
        const steps = 12;
        for (let i = 1; i <= steps; i++) {
            await page.mouse.move(s.x + (e.x - s.x) * i / steps, s.y + (e.y - s.y) * i / steps);
        }
        if (release) await page.mouse.up();
    }

    // ===== F2a 單鄰居標準格寬等距：拖 D 至 C.x+120=520 附近（先拉遠再拉回）=====
    await dragPerson(520, 420, 700, 420); // 先把 D 拉遠（釋放，會 grid snap 到 710）
    let dPos = await page.evaluate(() => {
        const p = window.app.personMap.get(window._ids.D); return { x: p.x, y: p.y };
    });
    await dragPerson(dPos.x, dPos.y, 523, 421, false); // 拉回 C+120=520 附近，不放開
    let mid = await page.evaluate(() => ({
        guides: window.app.dragGuides,
        d: { x: window.app.personMap.get(window._ids.D).x }
    }));
    check('F2a 單鄰居標準格寬吸附（拖曳中 D.x=520）',
        mid.d.x === 520 && mid.guides && mid.guides.x && mid.guides.x.kind === 'spacing',
        `D.x=${mid.d.x} guides=${JSON.stringify(mid.guides && mid.guides.x)}`);
    await page.screenshot({ path: path.join(__dirname, 'fix_f2a_spacing.png') });
    await page.mouse.up();
    dPos = await page.evaluate(() => {
        const p = window.app.personMap.get(window._ids.D); return { x: p.x, y: p.y };
    });
    check('F2a 放開後保留精準 X=520', Math.abs(dPos.x - 520) < 0.01, `D.x=${dPos.x}`);

    // ===== F2b 手足鏡像：父母中點 480，C=400 → 鏡像 560 =====
    await dragPerson(dPos.x, dPos.y, 563, 421, false);
    mid = await page.evaluate(() => ({
        guides: window.app.dragGuides,
        d: { x: window.app.personMap.get(window._ids.D).x }
    }));
    check('F2b 手足鏡像吸附（拖曳中 D.x=560、標尺 80|80）',
        mid.d.x === 560 && mid.guides && mid.guides.spacing && mid.guides.spacing.gap === 80,
        `D.x=${mid.d.x} spacing=${JSON.stringify(mid.guides && mid.guides.spacing)}`);
    await page.screenshot({ path: path.join(__dirname, 'fix_f2b_mirror.png') });
    await page.mouse.up();
    dPos = await page.evaluate(() => {
        const p = window.app.personMap.get(window._ids.D); return { x: p.x, y: p.y };
    });
    check('F2b 放開後保留精準 X=560', Math.abs(dPos.x - 560) < 0.01, `D.x=${dPos.x}`);

    // ===== F3 拖曳中 blur → 輔助線清除 =====
    await dragPerson(dPos.x, dPos.y, 403, 421, false); // 拖到 C 上方對齊（有輔助線）
    let hasGuides = await page.evaluate(() => !!window.app.dragGuides);
    check('F3 前置：拖曳中有輔助線', hasGuides);
    await page.evaluate(() => window.app.cancelInteraction()); // 模擬 blur 路徑
    const afterCancel = await page.evaluate(() => ({
        guides: window.app.dragGuides,
        canvasGuides: window.app.canvas.dragGuides,
        virtual: window.app.dragVirtual
    }));
    check('F3 cancelInteraction 清除輔助線/虛擬狀態',
        afterCancel.guides === null && afterCancel.canvasGuides === null && afterCancel.virtual === null,
        JSON.stringify(afterCancel));
    await page.mouse.up(); // 收尾

    // 把 D 拖回 560（重建狀態）
    dPos = await page.evaluate(() => {
        const p = window.app.personMap.get(window._ids.D); return { x: p.x, y: p.y };
    });
    if (Math.abs(dPos.x - 560) > 1) {
        await dragPerson(dPos.x, dPos.y, 563, 421);
    }

    // ===== F4 1px 手震不吸附、不寫 history =====
    const before = await page.evaluate(() => {
        const app = window.app;
        // 製造一個跨列 off-grid 鄰近 X：E 在 (566, 540)（與 D=560 差 6px < 閾值 8）
        const E = new Person({ x: 566, y: 540, gender: 'male', name: 'E' });
        app.persons.push(E);
        app._syncPersonMap();
        app.render();
        return {
            dx: app.personMap.get(window._ids.D).x,
            undoLen: app.history ? app.history.undoStack.length : -1
        };
    });
    // 對 D 做 1px 拖曳
    const s = toScreen(560, 420);
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.mouse.move(s.x + 1, s.y);
    await page.mouse.up();
    const after = await page.evaluate(() => ({
        dx: window.app.personMap.get(window._ids.D).x,
        undoLen: window.app.history ? window.app.history.undoStack.length : -1
    }));
    check('F4 1px 手震：位置不被吸走（回到 560）', Math.abs(after.dx - before.dx) < 0.01,
        `before=${before.dx} after=${after.dx}`);
    check('F4 1px 手震：不寫 history', after.undoLen === before.undoLen,
        `undo ${before.undoLen} → ${after.undoLen}`);

    // ===== F5 round cap 不洩漏到 drawPerson =====
    const capInfo = await page.evaluate(() => {
        const app = window.app;
        let captured = null;
        const orig = app.canvas.drawPerson.bind(app.canvas);
        app.canvas.drawPerson = function (...args) {
            if (captured === null) {
                captured = { cap: this.ctx.lineCap, join: this.ctx.lineJoin };
            }
            return orig(...args);
        };
        app.render();
        app.canvas.drawPerson = orig;
        return captured;
    });
    check('F5 drawPerson 進場時非 round（無洩漏）',
        capInfo && capInfo.cap !== 'round' && capInfo.join !== 'round',
        JSON.stringify(capInfo));

    // ===== F6 Y 假對齊：off-row 人物不提供 Y 對齊 =====
    const f6 = await page.evaluate(() => {
        const app = window.app;
        const F = new Person({ x: 900, y: 437, gender: 'female', name: 'OffRow' }); // 437 非輩分列
        app.persons.push(F);
        app._syncPersonMap();
        const D = app.personMap.get(window._ids.D);
        // 模擬 D 拖到 (700, 438)：Y 距 off-row F 僅 1px、距輩分列 420 有 18px
        const snap = app.computeDragSnap(700, 438, new Set([D.id]), D);
        // 清掉 F
        app.persons = app.persons.filter(p => p.id !== F.id);
        app._syncPersonMap();
        return snap;
    });
    check('F6 off-row 人物不產生 Y 對齊（y 維持 438 或僅列吸附）',
        !f6.guides || !f6.guides.y || f6.guides.y.kind === 'row',
        JSON.stringify(f6.guides));

    // ===== F7 zoom 2x 等距標尺無錯誤 =====
    await page.evaluate(() => { window.app.canvas.setScale(2); window.app.render(); });
    dPos = await page.evaluate(() => {
        const p = window.app.personMap.get(window._ids.D); return { x: p.x, y: p.y };
    });
    const s2 = await page.evaluate((ids) => {
        const app = window.app;
        const D = app.personMap.get(ids.D);
        const snap = app.computeDragSnap(523, 420, new Set([D.id]), D);
        if (snap.guides) {
            app.canvas.dragGuides = snap.guides;
            app.render();
            app.canvas.dragGuides = null;
        }
        return snap.guides;
    }, await page.evaluate(() => window._ids));
    check('F7 zoom 2x 標尺繪製無例外', errors.length === 0, errors.join('; '));
    await page.screenshot({ path: path.join(__dirname, 'fix_f7_zoom2.png') });

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
    console.log('ALL FIX CHECKS PASSED');
})();
