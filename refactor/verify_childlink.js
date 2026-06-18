/**
 * Phase 1 子女線（親生/收養/寄養）UI + 持久化 + 匯出 回歸測試
 * 用法：NODE_PATH=$HOME/.cache/pw-smoke/node_modules node refactor/verify_childlink.js
 */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);

    const results = [];
    const check = (name, cond, detail) => results.push({ name, ok: !!cond, detail });

    // 準備：父 + 子 + 一條親子關係（預設 biological）
    await page.evaluate(() => {
        const app = window.app;
        const dad = new Person({ id: 'dad', x: 400, y: 200, gender: 'male', name: '父' });
        const kid = new Person({ id: 'kid', x: 400, y: 380, gender: 'male', name: '子' });
        app.persons = [dad, kid];
        app._syncPersonMap();
        app.relationships = [new Relationship({ id: 'pc1', fromPersonId: 'dad', toPersonId: 'kid', type: 'parent-child' })];
        app.render();
    });

    const linkOf = () => page.evaluate(() => window.app.relationships.find(r => r.id === 'pc1').linkType);

    check('預設 linkType=biological', await linkOf() === 'biological', 'got ' + await linkOf());

    // 1. 編輯模式點「收養」→ adopted（型別不變、只改 linkType，須不被 early-return 擋）
    await page.evaluate(() => {
        window.app.editingRelationshipId = 'pc1';
        window.app.showRelationshipEditModal();
        document.querySelector('.rel-btn[data-link-type="adopted"]').click();
    });
    check('點收養 → linkType=adopted', await linkOf() === 'adopted', 'got ' + await linkOf());

    // 2. 再點「寄養」→ foster
    await page.evaluate(() => {
        window.app.editingRelationshipId = 'pc1';
        window.app.showRelationshipEditModal();
        document.querySelector('.rel-btn[data-link-type="foster"]').click();
    });
    check('再點寄養 → linkType=foster', await linkOf() === 'foster', 'got ' + await linkOf());

    // 3. 點回「親生」→ biological
    await page.evaluate(() => {
        window.app.editingRelationshipId = 'pc1';
        window.app.showRelationshipEditModal();
        document.querySelector('.rel-btn[data-link-type="biological"]').click();
    });
    check('點回親生 → linkType=biological', await linkOf() === 'biological', 'got ' + await linkOf());

    // 4. toJSON 保存 linkType（存檔保留）
    const persisted = await page.evaluate(() => {
        const app = window.app;
        const r = app.relationships.find(x => x.id === 'pc1');
        r.linkType = 'foster';
        return r.toJSON().linkType;
    });
    check('linkType 進 toJSON', persisted === 'foster', 'got ' + persisted);

    // 5. 匯出 PNG（含新增的子女線圖例）不丟例外
    const exportOk = await page.evaluate(() => {
        const app = window.app;
        try {
            const u = app.canvas.exportToPNG(app.persons, app.relationships, app.households || [], app.lifeCircles || [], true, true, 1);
            return typeof u === 'string' && u.indexOf('data:image/png') === 0;
        } catch (e) { return 'THREW: ' + e.message; }
    });
    check('匯出 PNG（含新子女線圖例）不丟例外', exportOk === true, 'got ' + exportOk);

    // 7. 對調方向：from/to 互換（修正畫反的方向性關係）
    await page.evaluate(() => {
        window.app.editingRelationshipId = 'pc1';
        window.app.showRelationshipEditModal();
        document.getElementById('swapRelationshipDirection').click();
    });
    const swapped = await page.evaluate(() => {
        const r = window.app.relationships.find(x => x.id === 'pc1');
        return r.fromPersonId + '->' + r.toPersonId;
    });
    check('對調方向：from/to 互換', swapped === 'kid->dad', 'got ' + swapped);

    await browser.close();

    const failed = results.filter(r => !r.ok);
    results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.name}${r.ok ? '' : ' — ' + r.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== childlink ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
