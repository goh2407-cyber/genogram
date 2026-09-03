/**
 * [3-2] 平板雙指縮放／平移：兩指同時按下 → 取消單指拖曳、以兩指中點縮放平移；放開後單指不誤拖
 * 用法：node refactor/run_all.js pinch
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

    const css = await page.evaluate(() => getComputedStyle(document.getElementById('genogramCanvas')).touchAction);
    check('畫布 touch-action: none（瀏覽器不搶手勢）', css === 'none', css);

    const r = await page.evaluate(() => {
        const app = window.app, c = app.canvas;
        const canvas = c.canvas;
        const rect = canvas.getBoundingClientRect();
        c.scale = 1; c.offsetX = 0; c.offsetY = 0; app.render();
        const p = new Person({ id: 'p', x: 400, y: 300, gender: 'male', name: '甲' });
        app.persons.push(p); app._syncPersonMap(); app.render();
        const fire = (type, id, x, y, target = canvas) => target.dispatchEvent(new PointerEvent(type, {
            pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true, cancelable: true,
            clientX: rect.left + x, clientY: rect.top + y, button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1
        }));
        const out = {};
        // 第一指按在人物上（會進入單指拖曳）
        fire('pointerdown', 1, 400, 300);
        out.afterFirst = { dragging: c.isDragging, dragged: !!c.draggedPerson };
        // 第二指按下 → 進入雙指
        fire('pointerdown', 2, 600, 300);
        out.afterSecond = { dragging: c.isDragging, dragged: !!c.draggedPerson, pinch: !!app.pinch, px: p.x, py: p.y };
        // 兩指拉開：1 往左 50、2 往右 50 → 距離 200→300 = 1.5x；中點不變 (500,300)
        fire('pointermove', 1, 350, 300, window);
        fire('pointermove', 2, 650, 300, window);
        out.afterSpread = { scale: c.scale, offsetX: c.offsetX, offsetY: c.offsetY, px: p.x, py: p.y };
        // 世界點 (500,300) 應仍在螢幕 (500,300)
        out.midWorldScreen = { x: 500 * c.scale + c.offsetX, y: 300 * c.scale + c.offsetY };
        // 兩指整體右移 100 → 平移
        fire('pointermove', 1, 450, 300, window);
        fire('pointermove', 2, 750, 300, window);
        out.afterPan = { scale: c.scale, midScreen: { x: 500 * c.scale + c.offsetX, y: 300 * c.scale + c.offsetY } };
        // 放開第 2 指，第 1 指再移動：不得拖曳人物
        fire('pointerup', 2, 750, 300, window);
        fire('pointermove', 1, 300, 500, window);
        out.afterOneLift = { pinch: !!app.pinch, dragging: c.isDragging, px: p.x, py: p.y, scale: c.scale };
        fire('pointerup', 1, 300, 500, window);
        out.afterAllUp = { pinch: !!app.pinch, pointers: app.touchPointers ? app.touchPointers.size : null, hist: app.history.undoStack.length };
        // 之後單指再拖人物 → 正常拖曳（drag 有效）
        c.scale = 1; c.offsetX = 0; c.offsetY = 0; app.render();
        fire('pointerdown', 3, 400, 300);
        fire('pointermove', 3, 460, 340, window);
        fire('pointerup', 3, 460, 340, window);
        out.singleDragAfter = { px: p.x, py: p.y };
        return out;
    });
    check('第一指按在人物上進入拖曳', r.afterFirst.dragging && r.afterFirst.dragged, JSON.stringify(r.afterFirst));
    check('第二指按下 → 取消單指拖曳、進入雙指、人物未移動', !r.afterSecond.dragging && !r.afterSecond.dragged && r.afterSecond.pinch && r.afterSecond.px === 400 && r.afterSecond.py === 300, JSON.stringify(r.afterSecond));
    check('兩指拉開 1.5 倍 → scale ≈ 1.5，人物座標不變', Math.abs(r.afterSpread.scale - 1.5) < 0.01 && r.afterSpread.px === 400 && r.afterSpread.py === 300, JSON.stringify(r.afterSpread));
    check('縮放以兩指中點為錨（世界 (500,300) 留在螢幕 (500,300)）', Math.abs(r.midWorldScreen.x - 500) < 1 && Math.abs(r.midWorldScreen.y - 300) < 1, JSON.stringify(r.midWorldScreen));
    check('兩指整體右移 100 → 平移 100、縮放不變', Math.abs(r.afterPan.scale - 1.5) < 0.01 && Math.abs(r.afterPan.midScreen.x - 600) < 1 && Math.abs(r.afterPan.midScreen.y - 300) < 1, JSON.stringify(r.afterPan));
    check('放開一指後另一指移動不會拖曳人物、縮放維持', !r.afterOneLift.pinch && !r.afterOneLift.dragging && r.afterOneLift.px === 400 && r.afterOneLift.py === 300 && Math.abs(r.afterOneLift.scale - 1.5) < 0.01, JSON.stringify(r.afterOneLift));
    check('全部放開 → 狀態清空、雙指過程不寫 history', !r.afterAllUp.pinch && r.afterAllUp.pointers === 0 && r.afterAllUp.hist === 0, JSON.stringify(r.afterAllUp));
    check('之後單指拖曳人物仍正常', r.singleDragAfter.px !== 400 || r.singleDragAfter.py !== 300, JSON.stringify(r.singleDragAfter));

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== pinch ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
