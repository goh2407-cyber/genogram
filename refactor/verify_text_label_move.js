/**
 * 關係線文字（時間／說明）與同住圈名稱：沿用成員文字的位置拉桿（點文字 → 拉桿 → 拖曳／方向鍵／點中心重置）。
 * 只動文字，不動線條與框；位移跟著存檔與 Undo。
 */
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp({ width: 1366, height: 768 });
    const { failures, passes, check } = createChecks();

    await page.evaluate(() => {
        const app = window.app;
        app.loadData({ version: '1.1',
            persons: [
                { id: 'a', name: '王大明', gender: 'male', x: 360, y: 240 },
                { id: 'b', name: '林小芳', gender: 'female', x: 600, y: 240 },
                { id: 'c', name: '王小美', gender: 'female', x: 480, y: 360 }
            ],
            relationships: [
                { id: 'r1', fromPersonId: 'a', toPersonId: 'b', type: 'married', date: '2018 結婚' },
                { id: 'r2', fromPersonId: 'a', toPersonId: 'c', type: 'parent-child' },
                { id: 'r3', fromPersonId: 'b', toPersonId: 'c', type: 'parent-child' }
            ],
            households: [{ id: 'h1', ids: ['b', 'c'], label: '媽媽家' }]
        });
        app.canvas.scale = 1; app.canvas.offsetX = 0; app.canvas.offsetY = 0;
        app.render();
    });
    await page.waitForTimeout(150);

    const toScreen = (bounds) => page.evaluate(b => {
        const c = window.app.canvas; const r = c.canvas.getBoundingClientRect();
        return { x: r.left + ((b.left + b.right) / 2) * c.scale + c.offsetX, y: r.top + ((b.top + b.bottom) / 2) * c.scale + c.offsetY };
    }, bounds);
    const lineGeometry = () => page.evaluate(() => JSON.stringify(window.app.relationships.map(rel =>
        window.app.canvas.getRelationshipPath(window.app.personMap.get(rel.fromPersonId), window.app.personMap.get(rel.toPersonId), rel, window.app.relationships))));

    const boxes = await page.evaluate(() => Object.fromEntries([...window.app.canvas.textLabelBoxes.entries()]));
    check('繪製時記錄關係文字與同住圈名稱命中框', !!boxes['rel:r1'] && !!boxes['house:h1'], Object.keys(boxes).join(','));

    // ── 關係文字 ──
    const linesBefore = await lineGeometry();
    let pt = await toScreen(boxes['rel:r1'].bounds);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(80);
    let st = await page.evaluate(() => ({ rel: window.app.selectedRelationshipId, target: window.app.labelEditingTarget,
        popover: !document.getElementById('labelPositionPopover').hidden, outline: !document.getElementById('labelSelectionOutline').hidden }));
    check('點關係文字 → 選取該關係並開啟拉桿', st.rel === 'r1' && st.target?.kind === 'rel' && st.popover && st.outline, JSON.stringify(st));

    const undoBefore = await page.evaluate(() => window.app.history.undoStack.length);
    const knob = await page.locator('#labelJoystickKnob').boundingBox();
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
    await page.mouse.down();
    await page.mouse.move(knob.x + knob.width / 2 + 20, knob.y + knob.height / 2 + 30, { steps: 6 });
    await page.mouse.up();
    st = await page.evaluate(() => ({ off: window.app.relationships.find(r => r.id === 'r1').labelOffset,
        undo: window.app.history.undoStack.length }));
    check('拖曳拉桿 → 關係文字位移、一次 undo', st.off && st.off.x === 20 && st.off.y === 30 && st.undo === undoBefore + 1, JSON.stringify(st));
    const boxMoved = await page.evaluate(() => window.app.canvas.textLabelBoxes.get('rel:r1'));
    check('命中框跟著移動、保留自動位置', Math.round(boxMoved.bounds.left - boxMoved.baseBounds.left) === 20
        && Math.round(boxMoved.bounds.top - boxMoved.baseBounds.top) === 30, JSON.stringify(boxMoved));
    check('移動文字不改任何線條', (await lineGeometry()) === linesBefore);
    check('關係文字位移寫進存檔（toJSON）', await page.evaluate(() => JSON.stringify(window.app.getState().relationships.find(r => r.id === 'r1').labelOffset) === '{"x":20,"y":30}'));

    await page.locator('#labelJoystickKnob').focus();
    await page.keyboard.press('ArrowRight');
    st = await page.evaluate(() => window.app.relationships.find(r => r.id === 'r1').labelOffset);
    check('方向鍵微調關係文字', st && st.x > 20 && st.y === 30, JSON.stringify(st));

    await page.evaluate(() => { window.app.undo(); window.app.undo(); });
    st = await page.evaluate(() => window.app.relationships.find(r => r.id === 'r1').labelOffset);
    check('Undo 回到自動位置', st === null, JSON.stringify(st));

    // ── 同住圈名稱 ──
    await page.evaluate(() => { window.app.clearAllSelections(); window.app.render(); });
    const hb = await page.evaluate(() => window.app.canvas.textLabelBoxes.get('house:h1'));
    pt = await toScreen(hb.bounds);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(80);
    st = await page.evaluate(() => ({ h: window.app.selectedHouseholdId, target: window.app.labelEditingTarget,
        popover: !document.getElementById('labelPositionPopover').hidden }));
    check('點同住圈名稱 → 選取同住圈並開啟拉桿', st.h === 'h1' && st.target?.kind === 'house' && st.popover, JSON.stringify(st));
    await page.evaluate(() => window.app.adjustSelectedPersonLabel('up'));
    const snapshotBefore = await page.evaluate(() => JSON.stringify(window.app.history.undoStack.at(-1).households));
    await page.evaluate(() => window.app.adjustSelectedPersonLabel('left'));
    st = await page.evaluate(() => ({ off: window.app.households[0].labelOffset,
        snap: JSON.stringify(window.app.history.undoStack.at(-2).households) }));
    check('同住圈名稱可微調', st.off && st.off.x < 0 && st.off.y < 0, JSON.stringify(st.off));
    check('history 快照不被後續微調改寫', st.snap === snapshotBefore, st.snap + ' vs ' + snapshotBefore);
    // 點拉桿中心 = 重置
    const k2 = await page.locator('#labelJoystickKnob').boundingBox();
    await page.mouse.click(k2.x + k2.width / 2, k2.y + k2.height / 2);
    st = await page.evaluate(() => window.app.households[0].labelOffset);
    check('點拉桿中心 → 同住圈名稱回到自動位置', st === null, JSON.stringify(st));

    // 點別處 → 拉桿消失
    await page.mouse.click(1000, 600);
    await page.waitForTimeout(60);
    st = await page.evaluate(() => ({ target: window.app.labelEditingTarget, popover: !document.getElementById('labelPositionPopover').hidden }));
    check('點空白處 → 結束文字編輯', st.target === null && !st.popover, JSON.stringify(st));

    // 存檔 → 載入保留位移
    st = await page.evaluate(() => {
        const app = window.app;
        app.relationships[0].labelOffset = { x: 7, y: -9 };
        app.households[0].labelOffset = { x: -12, y: 4 };
        const data = { version: '1.1', ...app.getState() };
        app.loadData(JSON.parse(JSON.stringify(data)));
        return { r: app.relationships[0].labelOffset, h: app.households[0].labelOffset };
    });
    check('存檔／載入保留兩種文字位移', JSON.stringify(st) === '{"r":{"x":7,"y":-9},"h":{"x":-12,"y":4}}', JSON.stringify(st));

    check('零 console error', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'RESULT OK (relationship / household text labels movable)');
})().catch(err => { console.error(err); process.exit(1); });
