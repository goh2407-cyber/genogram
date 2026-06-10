/**
 * 2026-06 視覺更新煙霧測試（一次性，可重複執行）
 * 用法：node refactor/smoke_visual.js
 * 驗證：頁面載入無 console error、新增人物/關係/快速按鈕渲染正常、截圖輸出。
 */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);

    // 建立一個小家庭：父、母、女兒（含案主與過世標記）
    await page.evaluate(() => {
        const app = window.app;
        const dad = new Person({ x: 400, y: 200, gender: 'male', name: '父親', age: 52 });
        const mom = new Person({ x: 560, y: 200, gender: 'female', name: '母親', age: 50, isDeceased: true });
        const girl = new Person({ x: 480, y: 360, gender: 'female', name: '案主', age: 24, isIdentifiedPatient: true });
        app.persons.push(dad, mom, girl);
        app._syncPersonMap();
        app.relationships.push(new Relationship({ fromPersonId: dad.id, toPersonId: mom.id, type: 'married' }));
        app.relationships.push(new Relationship({ fromPersonId: dad.id, toPersonId: girl.id, type: 'parent-child' }));
        app.relationships.push(new Relationship({ fromPersonId: mom.id, toPersonId: girl.id, type: 'parent-child' }));
        app.render();
        // 模擬 hover 顯示快速新增按鈕
        app.hoveredPersonId = girl.id;
        app.render();
        // 選取一人顯示 ring 與屬性面板
        app.selectedPersonId = dad.id;
        app.updatePropertyPanel();
        app.render();
    });

    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(__dirname, 'smoke_visual.png') });

    // 打開關係對話框截圖
    await page.evaluate(() => document.getElementById('relationshipModal').classList.add('active'));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(__dirname, 'smoke_modal.png') });
    await page.evaluate(() => document.getElementById('relationshipModal').classList.remove('active'));

    await browser.close();

    if (errors.length) {
        console.log('ERRORS:\n' + errors.join('\n'));
        process.exit(1);
    }
    console.log('SMOKE OK — screenshots: refactor/smoke_visual.png, refactor/smoke_modal.png');
})();
