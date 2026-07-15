/**
 * [Fix C] 關係編輯鉛筆錨點：family 線應落在「子女下行段」上（對應該子女），不浮在主幹/橫桿外。
 * 用法：NODE_PATH=$HOME/.cache/pw-smoke/node_modules node refactor/verify_pencil.js
 */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);

    // 兩親家庭 + 一個「偏離夫妻中點」的子女（故意讓 child.x ≠ 夫妻中點，放大原本浮空問題）
    const r = await page.evaluate(() => {
        const app = window.app, c = app.canvas;
        const dad = new Person({ id: 'd', x: 320, y: 170, gender: 'male', name: '父' });
        const mom = new Person({ id: 'm', x: 520, y: 170, gender: 'female', name: '母' }); // 夫妻中點≈420
        const kid = new Person({ id: 'k', x: 300, y: 420, gender: 'male', name: '子' });   // 偏左，≠420
        app.persons = [dad, mom, kid];
        app._syncPersonMap();
        app.relationships = [
            new Relationship({ id: 'mar', fromPersonId: 'd', toPersonId: 'm', type: 'married' }),
            new Relationship({ id: 'pc', fromPersonId: 'd', toPersonId: 'k', type: 'parent-child' })
        ];
        app.selectedRelationshipId = 'pc'; // 選取親子線 → 顯示鉛筆
        app.render();
        const pcRel = app.relationships.find(x => x.id === 'pc');
        const pth = c.getRelationshipPath(dad, kid, pcRel, app.relationships);
        const anchor = c._editButtonAnchor(pth, 'family');
        const cachedPath = c._familyRelationshipPaths.get(pcRel.id);
        // [Fix D] swap 鈕位置（point + n*54）是否命中；婚姻線是否不顯示 swap 鈕
        let nx = -anchor.tangent.y, ny = anchor.tangent.x;
        if (ny > 0) { nx = -nx; ny = -ny; } else if (Math.abs(ny) < 0.001) { if (nx < 0) { nx = -nx; ny = -ny; } }
        const swapX = anchor.point.x + nx * 54, swapY = anchor.point.y + ny * 54;
        const swapHit = c.isPointOnSwapButton(swapX, swapY, pcRel, dad, kid, app.relationships);
        const marRel = app.relationships.find(x => x.id === 'mar');
        const marSwap = c.isPointOnSwapButton(swapX, swapY, marRel, dad, mom, app.relationships);
        return {
            anchorX: anchor.point.x,
            childX: kid.x,
            cachedMatch: JSON.stringify(pth) === JSON.stringify(cachedPath),
            lastSeg: pth.slice(-2),
            swapHit,
            marSwap
        };
    });

    const results = [];
    const check = (name, cond, detail) => results.push({ name, ok: !!cond, detail });
    check('鉛筆錨點 X = 子女 X（落在子女下行段上）', Math.abs(r.anchorX - r.childX) < 0.5, `anchor=${r.anchorX} child=${r.childX}`);
    check('鉛筆命中路徑與畫面快取點序列完全一致', r.cachedMatch === true, `cachedMatch=${r.cachedMatch}`);
    check('最後一段為垂直子女下行（x 相同）', Math.abs(r.lastSeg[0].x - r.lastSeg[1].x) < 0.5, JSON.stringify(r.lastSeg));
    check('[D] 親子線顯示 ⇄ 鈕且命中', r.swapHit === true, 'swapHit=' + r.swapHit);
    check('[D] 婚姻線不顯示 ⇄ 鈕', r.marSwap === false, 'marSwap=' + r.marSwap);

    await page.screenshot({ path: path.join(__dirname, 'golden', 'current', '_pencil_check.png') });

    // [Fix D] 點 ⇄ 鈕（用 id 直接對調）→ from/to 互換
    const swapped = await page.evaluate(() => {
        window.app.swapRelationshipDirectionById('pc');
        const r = window.app.relationships.find(x => x.id === 'pc');
        return r.fromPersonId + '->' + r.toPersonId;
    });
    check('[D] 對調方向後 from/to 互換（d->k → k->d）', swapped === 'k->d', 'got ' + swapped);

    await browser.close();

    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== pencil ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
