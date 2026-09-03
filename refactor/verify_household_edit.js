/**
 * [第四批 HH-1～HH-4] 同住框：邊界含姓名、框上名稱 + 圖例、成員增減、已選好人直接按 H
 * 用法：node refactor/run_all.js household_edit
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

    await page.evaluate(() => {
        const app = window.app;
        const gm = new Person({ id: 'gm', x: 440, y: 160, gender: 'female', name: '外婆', age: 70 });
        const m = new Person({ id: 'm', x: 440, y: 320, gender: 'female', name: '母親很長的名字', age: 43, notes: '備註第一行\n備註第二行' });
        const d = new Person({ id: 'd', x: 560, y: 320, gender: 'male', name: '父', age: 45 });
        const k1 = new Person({ id: 'k1', x: 440, y: 480, gender: 'female', name: '案主', age: 12, isIdentifiedPatient: true });
        const k2 = new Person({ id: 'k2', x: 560, y: 480, gender: 'male', name: '弟', age: 8 });
        const bf = new Person({ id: 'bf', x: 760, y: 320, gender: 'male', name: '同居人', age: 40 });
        app.persons.push(gm, m, d, k1, k2, bf); app._syncPersonMap();
        const R = (a, c, t) => app.relationships.push(new Relationship({ fromPersonId: a, toPersonId: c, type: t }));
        R('gm', 'm', 'parent-child'); R('d', 'm', 'divorced'); R('d', 'k1', 'parent-child'); R('m', 'k1', 'parent-child'); R('d', 'k2', 'parent-child'); R('m', 'k2', 'parent-child');
        app.households.push({ id: 'hh1', ids: ['gm', 'm', 'k1', 'k2'], notes: '' });
        app.render();
    });

    // ---- HH-1 邊界含姓名/備註 ----
    const hh1 = await page.evaluate(() => {
        const app = window.app, c = app.canvas;
        const hh = app.households[0];
        const b = c.getHouseholdBounds(hh, app.persons, app.relationships);
        // 多邊形包含測試（ray casting）
        const inside = (pt, poly) => {
            let ok = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
                if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) ok = !ok;
            }
            return ok;
        };
        const out = { ok: true, misses: [] };
        for (const id of hh.ids) {
            const p = app.personMap.get(id);
            const g = c.getPersonLabelGeometry(p, app.viewOptions);
            if (!g.bounds) continue;
            // 規格：框幾何不得讀文字位置/寬度 → 只驗「符號寬度內」的姓名/備註底邊在框內
            const half = c.personSize / 2;
            const corners = [
                { x: p.x - half, y: g.bounds.bottom }, { x: p.x + half, y: g.bounds.bottom },
                { x: p.x, y: g.bounds.bottom + 4 }
            ];
            for (const pt of corners) {
                if (!inside(pt, b.hullPoints)) { out.ok = false; out.misses.push({ id, pt }); }
            }
        }
        // 非成員（父、同居人）的符號中心不在框內
        out.outsiderInside = ['d', 'bf'].filter(id => { const p = app.personMap.get(id); return inside({ x: p.x, y: p.y }, b.hullPoints); });
        return out;
    });
    check('HH-1 成員姓名與備註（預設位置、符號寬度內）底邊全在凹包內', hh1.ok, JSON.stringify(hh1.misses));
    check('HH-1 非成員符號中心不被包進框', hh1.outsiderInside.length === 0, JSON.stringify(hh1.outsiderInside));

    // ---- HH-2 名稱顯示 + 圖例 ----
    await page.evaluate(() => { const app = window.app; app.selectedHouseholdId = 'hh1'; app.updatePropertyPanel(); app.render(); });
    let ui = await page.evaluate(() => ({ hasLabelInput: !!document.getElementById('householdLabel'), hasNotes: !!document.getElementById('householdNotes') }));
    check('HH-2 面板有「名稱」與「備註」欄', ui.hasLabelInput && ui.hasNotes, JSON.stringify(ui));
    await page.fill('#householdLabel', '外婆家');
    await page.locator('#householdLabel').press('Tab');
    await page.waitForTimeout(60);
    const drawn = await page.evaluate(async () => {
        const app = window.app;
        const spy = () => { const texts = []; const orig = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, ...r) { texts.push(String(t)); return orig.call(this, t, ...r); }; return () => { CanvasRenderingContext2D.prototype.fillText = orig; return texts; }; };
        let done = spy(); app.render(); const screen = done();
        await app.waitForCurrentCanvasFonts();
        done = spy(); app.canvas.exportToPNG(app.persons, app.relationships, app.households, app.lifeCircles, true, true, 1, app.viewOptions); const exported = done();
        const hh = app.households[0];
        const rt = JSON.parse(JSON.stringify(app.getState())).households[0];
        return { label: hh.label, screenHas: screen.includes('外婆家'), exportHas: exported.includes('外婆家'), legendHas: exported.some(t => /同住/.test(t)), stateLabel: rt.label,
            sidebar: !!document.querySelector('#legendContent .legend-swatch-household'), sidebarText: document.querySelector('#legendContent [data-legend-extra="symbols"]')?.textContent || '' };
    });
    check('HH-2 名稱寫入 household.label、畫在畫布、匯出也有', drawn.label === '外婆家' && drawn.screenHas && drawn.exportHas, JSON.stringify(drawn));
    check('HH-2 匯出圖例含「同住」條目；側欄圖例有虛線框樣本', drawn.legendHas && drawn.sidebar && /同住/.test(drawn.sidebarText), JSON.stringify({ legendHas: drawn.legendHas, sidebar: drawn.sidebar, t: drawn.sidebarText }));
    check('HH-2 label 進 history/存檔快照', drawn.stateLabel === '外婆家', drawn.stateLabel);

    // ---- HH-3 成員增減 ----
    ui = await page.evaluate(() => ({
        chips: [...document.querySelectorAll('#householdMembers .household-member-chip')].map(c => c.dataset.personId),
        memberText: document.getElementById('householdMembers').textContent,
        options: [...document.querySelectorAll('#householdAddSelect option')].map(o => o.value).filter(Boolean),
    }));
    check('HH-3 面板列出 4 個成員標籤；文字不含 ✕；加入下拉只列非成員（父、同居人）', ui.chips.length === 4 && !/✕|×/.test(ui.memberText) && JSON.stringify(ui.options.sort()) === JSON.stringify(['bf', 'd']), JSON.stringify(ui));
    const hBefore = await page.evaluate(() => window.app.history.undoStack.length);
    await page.click('#householdMembers .household-member-chip[data-person-id="k2"] .chip-remove');
    await page.waitForTimeout(60);
    ui = await page.evaluate(() => ({ ids: window.app.households[0].ids, hist: window.app.history.undoStack.length, chips: document.querySelectorAll('#householdMembers .household-member-chip').length, selected: window.app.selectedHouseholdId }));
    check('HH-3 ✕ 移除弟 → ids 少 1、history +1、面板刷新、框仍選取', JSON.stringify(ui.ids) === JSON.stringify(['gm', 'm', 'k1']) && ui.hist === hBefore + 1 && ui.chips === 3 && ui.selected === 'hh1', JSON.stringify(ui));
    await page.selectOption('#householdAddSelect', 'bf');
    await page.click('#householdAddBtn');
    await page.waitForTimeout(60);
    ui = await page.evaluate(() => ({ ids: window.app.households[0].ids, hist: window.app.history.undoStack.length, chips: document.querySelectorAll('#householdMembers .household-member-chip').length }));
    check('HH-3 下拉加入同居人 → ids +1、history +1、面板刷新', ui.ids.includes('bf') && ui.ids.length === 4 && ui.hist === hBefore + 2 && ui.chips === 4, JSON.stringify(ui));
    await page.evaluate(() => window.app.undo());
    await page.evaluate(() => window.app.undo());
    ui = await page.evaluate(() => window.app.households[0].ids);
    check('HH-3 兩次 Undo 回到原 4 人', JSON.stringify(ui) === JSON.stringify(['gm', 'm', 'k1', 'k2']), JSON.stringify(ui));
    // 移到只剩 1 人再移除 → 框刪除
    await page.evaluate(() => { const app = window.app; app.selectedHouseholdId = 'hh1'; app.updatePropertyPanel(); });
    for (const id of ['gm', 'm', 'k1']) { await page.click(`#householdMembers .household-member-chip[data-person-id="${id}"] .chip-remove`); await page.waitForTimeout(40); }
    ui = await page.evaluate(() => ({ ids: window.app.households[0]?.ids, count: window.app.households.length }));
    check('HH-3 移到剩 1 人仍保留（單人同住合法）', ui.count === 1 && JSON.stringify(ui.ids) === JSON.stringify(['k2']), JSON.stringify(ui));
    await page.click('#householdMembers .household-member-chip[data-person-id="k2"] .chip-remove');
    await page.waitForTimeout(60);
    ui = await page.evaluate(() => ({ count: window.app.households.length, selected: window.app.selectedHouseholdId, panel: document.getElementById('propertyContent').textContent.trim().slice(0, 20) }));
    check('HH-3 移除最後一人 → 框刪除、取消選取', ui.count === 0 && ui.selected === null, JSON.stringify(ui));

    // ---- HH-4 已選好人按 H ----
    await page.evaluate(() => { const app = window.app; app.clearAllSelections(); app.selectedPersonIds = ['d', 'k2']; app.render(); });
    await page.keyboard.press('h');
    await page.waitForTimeout(80);
    ui = await page.evaluate(() => ({ count: window.app.households.length, ids: window.app.households[0]?.ids, tool: window.app.currentTool, selected: window.app.selectedHouseholdId }));
    check('HH-4 多選 2 人後按 H → 直接建框、回選取工具、選中新框', ui.count === 1 && JSON.stringify([...ui.ids].sort()) === JSON.stringify(['d', 'k2']) && ui.tool === 'select' && ui.selected, JSON.stringify(ui));
    await page.evaluate(() => { const app = window.app; app.clearAllSelections(); app.selectPerson('bf'); app.render(); });
    await page.keyboard.press('h');
    await page.waitForTimeout(80);
    ui = await page.evaluate(() => ({ count: window.app.households.length, tool: window.app.currentTool, pre: window.app.selectedPersonIds, status: document.getElementById('statusBar').textContent }));
    check('HH-4 只選 1 人按 H → 進入同住工具並預選該人，不自動建框', ui.count === 1 && ui.tool === 'household' && JSON.stringify(ui.pre) === JSON.stringify(['bf']) && /1 位成員/.test(ui.status), JSON.stringify(ui));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
    ui = await page.evaluate(() => ({ count: window.app.households.length, tool: window.app.currentTool }));
    check('HH-4 接著按 Enter → 建 1 人框', ui.count === 2 && ui.tool === 'select', JSON.stringify(ui));
    await page.evaluate(() => { const app = window.app; app.clearAllSelections(); app.setTool('select'); });
    await page.keyboard.press('h');
    await page.waitForTimeout(60);
    ui = await page.evaluate(() => ({ count: window.app.households.length, tool: window.app.currentTool }));
    check('HH-4 無選取按 H → 只切工具、不建框', ui.count === 2 && ui.tool === 'household', JSON.stringify(ui));

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== household-edit ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
