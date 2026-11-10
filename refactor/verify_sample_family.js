/**
 * 2026-11-10 空白畫布引導卡「先看一張範例」：
 *  1. 空白時引導卡與範例鈕可見；按下後載入虛構家庭、引導卡消失
 *  2. 範例沒有子女線穿過別人、親子方向正確、有案主與同住圈
 *  3. Ctrl+Z 回到空白；畫布已有成員時 loadSampleFamily() 不動作（不蓋掉資料）
 */
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();

    await page.evaluate(() => {
        const a = window.app;
        a.persons = []; a._syncPersonMap(); a.relationships = []; a.households = []; a.lifeCircles = [];
        a.setTool && a.setTool('select');
        a.render();
    });
    const before = await page.evaluate(() => ({
        card: !document.getElementById('emptyState').hidden,
        btn: !!document.getElementById('emptyStateSampleBtn')
    }));
    check('空白畫布顯示引導卡與「先看一張範例」', before.card && before.btn, JSON.stringify(before));

    await page.click('#emptyStateSampleBtn');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
        const a = window.app;
        const k = a.getKinshipEngine();
        return {
            persons: a.persons.length,
            cardHidden: document.getElementById('emptyState').hidden,
            hints: a.canvas.getFamilyCollisionPersonIds().length,
            unsafe: a.canvas._familyRoutePlans.filter(p => !p.safe).length,
            parents: k.getParentIds('s_c1').slice().sort().join('+'),
            ip: a.persons.filter(p => p.isIdentifiedPatient).length,
            households: a.households.length,
            mapOk: a.persons.every(p => a.personMap.get(p.id) === p)
        };
    });
    check('載入 8 人範例、引導卡消失、personMap 同步',
        after.persons === 8 && after.cardHidden && after.mapOk, JSON.stringify(after));
    check('範例的子女線沒有穿過別人', after.hints === 0 && after.unsafe === 0, JSON.stringify(after));
    check('親子方向、案主、同住圈正確',
        after.parents === 's_dad+s_mom' && after.ip === 1 && after.households === 1, JSON.stringify(after));

    const guard = await page.evaluate(() => {
        const a = window.app;
        a.personMap.get('s_c1').name = '改過';
        a.loadSampleFamily();
        const kept = a.personMap.get('s_c1').name === '改過';
        a.undo();
        return { kept, afterUndo: a.persons.length };
    });
    check('已有成員時不會被範例蓋掉', guard.kept, JSON.stringify(guard));
    check('復原一次回到空白', guard.afterUndo === 0, JSON.stringify(guard));

    check('零 console error', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'RESULT OK (sample family)');
})().catch(err => { console.error(err); process.exit(1); });
