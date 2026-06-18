/**
 * Phase 1 同卵/異卵雙胞胎 zygosity UI + 持久化 回歸測試
 * 用法：NODE_PATH=$HOME/.cache/pw-smoke/node_modules node refactor/verify_twins.js
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

    // 父母 + 兩個同父母子女、已標記同一 twinGroup；選取其一並渲染屬性面板
    await page.evaluate(() => {
        const app = window.app;
        const dad = new Person({ id: 'd', x: 300, y: 150, gender: 'male', name: '父' });
        const mom = new Person({ id: 'm', x: 450, y: 150, gender: 'female', name: '母' });
        const k1 = new Person({ id: 'k1', x: 320, y: 360, gender: 'male', name: '子1', twinGroup: 'tg' });
        const k2 = new Person({ id: 'k2', x: 430, y: 360, gender: 'female', name: '子2', twinGroup: 'tg' });
        app.persons = [dad, mom, k1, k2];
        app._syncPersonMap();
        app.relationships = [];
        [k1, k2].forEach(k => {
            app.relationships.push(new Relationship({ fromPersonId: 'd', toPersonId: k.id, type: 'parent-child' }));
            app.relationships.push(new Relationship({ fromPersonId: 'm', toPersonId: k.id, type: 'parent-child' }));
        });
        app.selectedPersonId = 'k1';
        app.updatePropertyPanel();
        app.render();
    });

    const zygOf = (id) => page.evaluate((pid) => window.app.personMap.get(pid).zygosity, id);

    check('預設 zygosity=null（異卵）', await zygOf('k1') === null, 'got ' + await zygOf('k1'));

    // 同卵切換框存在（因 k1 已在 twinGroup）
    const hasBox = await page.evaluate(() => !!document.querySelector('.twin-zygosity-checkbox'));
    check('屬性面板顯示同卵切換框', hasBox, 'got ' + hasBox);

    // 勾選 → 整組 mono
    await page.evaluate(() => document.querySelector('.twin-zygosity-checkbox').click());
    check('勾選 → k1=mono', await zygOf('k1') === 'mono', 'got ' + await zygOf('k1'));
    check('勾選 → 整組（k2 也 mono）', await zygOf('k2') === 'mono', 'got ' + await zygOf('k2'));

    // toJSON 保存
    const persisted = await page.evaluate(() => window.app.personMap.get('k1').toJSON().zygosity);
    check('zygosity 進 toJSON', persisted === 'mono', 'got ' + persisted);

    // 取消勾選 → 整組回 di（須重新取得切換框，因面板可能重繪）
    await page.evaluate(() => {
        window.app.selectedPersonId = 'k1';
        window.app.updatePropertyPanel();
        const box = document.querySelector('.twin-zygosity-checkbox');
        if (box && box.checked) box.click();
    });
    check('取消勾選 → k1=di', await zygOf('k1') === 'di', 'got ' + await zygOf('k1'));

    // [Fix F-2] 半同胞（共享單一父母）不該被列為雙胞胎候選
    const fhalf = await page.evaluate(() => {
        const app = window.app;
        const dad2 = new Person({ id: 'd2', x: 600, y: 150, gender: 'male', name: '繼父' });
        const k3 = new Person({ id: 'k3', x: 550, y: 360, gender: 'female', name: '半同胞' });
        app.persons.push(dad2, k3);
        app._syncPersonMap();
        // k3 = mom + dad2 的孩子（與 k1 共享 mom、但父不同 → 半同胞）
        app.relationships.push(new Relationship({ fromPersonId: 'm', toPersonId: 'k3', type: 'parent-child' }));
        app.relationships.push(new Relationship({ fromPersonId: 'd2', toPersonId: 'k3', type: 'parent-child' }));
        app._syncPersonMap();
        const full = app.getFullSiblings(app.personMap.get('k1')).map(p => p.id).sort().join(',');
        const all = app.getSiblings(app.personMap.get('k1')).map(p => p.id).sort().join(',');
        return { full, all };
    });
    check('全同胞只含 k2（排除半同胞 k3）', fhalf.full === 'k2', 'got [' + fhalf.full + ']');
    check('對照：getSiblings 仍含半同胞 k3', fhalf.all.indexOf('k3') >= 0, 'got [' + fhalf.all + ']');

    await browser.close();
    const failed = results.filter(r => !r.ok);
    results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.name}${r.ok ? '' : ' — ' + r.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== twins ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
