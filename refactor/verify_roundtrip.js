/**
 * 存檔 round-trip：新 schema 欄位（Relationship.linkType / Person.zygosity）
 * 經 toJSON → fromJSON（= 存檔/載入底層）後須完整保留。
 * 用法：NODE_PATH=$HOME/.cache/pw-smoke/node_modules node refactor/verify_roundtrip.js
 */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas && typeof Person !== 'undefined' && typeof Relationship !== 'undefined');

    const r = await page.evaluate(() => {
        // Relationship.linkType（親生/收養/寄養）
        const adopted = Relationship.fromJSON(Object.assign(
            new Relationship({ fromPersonId: 'a', toPersonId: 'b', type: 'parent-child' }), { linkType: 'adopted' }).toJSON());
        const foster = (() => { const x = new Relationship({ fromPersonId: 'a', toPersonId: 'b', type: 'parent-child' }); x.linkType = 'foster'; return Relationship.fromJSON(x.toJSON()); })();
        const bio = Relationship.fromJSON(new Relationship({ fromPersonId: 'a', toPersonId: 'b', type: 'parent-child' }).toJSON());
        // Person.zygosity（同卵/異卵）
        const mono = (() => { const p = new Person({ name: 'x', twinGroup: 'g' }); p.zygosity = 'mono'; return Person.fromJSON(p.toJSON()); })();
        const di = Person.fromJSON(new Person({ name: 'y' }).toJSON());
        // Person.lossType（流產/人工流產）
        const sb = (() => { const p = new Person({ name: 'z' }); p.lossType = 'miscarriage'; return Person.fromJSON(p.toJSON()); })();
        return {
            adopted: adopted.linkType, foster: foster.linkType, bioDefault: bio.linkType,
            mono: mono.zygosity, diDefault: di.zygosity, monoTwin: mono.twinGroup,
            loss: sb.lossType, lossDefault: di.lossType
        };
    });

    const results = [];
    const check = (name, cond, detail) => results.push({ name, ok: !!cond, detail });
    check('linkType=adopted 存載保留', r.adopted === 'adopted', 'got ' + r.adopted);
    check('linkType=foster 存載保留', r.foster === 'foster', 'got ' + r.foster);
    check('舊資料無 linkType → 預設 biological', r.bioDefault === 'biological', 'got ' + r.bioDefault);
    check('zygosity=mono 存載保留', r.mono === 'mono', 'got ' + r.mono);
    check('twinGroup 一併保留', r.monoTwin === 'g', 'got ' + r.monoTwin);
    check('舊資料無 zygosity → 預設 null', r.diDefault === null, 'got ' + r.diDefault);
    check('lossType=miscarriage 存載保留', r.loss === 'miscarriage', 'got ' + r.loss);
    check('舊資料無 lossType → 預設 null', r.lossDefault === null, 'got ' + r.lossDefault);

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== roundtrip ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
