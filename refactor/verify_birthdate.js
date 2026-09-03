/**
 * [2-1] 出生年月 → 自動年齡
 * 驗證：日期正規化、年齡計算、toJSON 只在有值時寫入（舊檔不變）、getDisplayAge 規則、
 * 屬性面板（唯讀計算值 / 死亡年月欄 / 格式錯誤不寫入）、檢視分頁基準日、畫布實際繪出的年齡、history 一筆。
 * 用法：node refactor/run_all.js birthdate  或  NODE_PATH=$HOME/.cache/pw-smoke/node_modules node refactor/verify_birthdate.js
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
    await page.waitForFunction(() => window.app && window.app.canvas && window.app.isLoading === false && typeof Person !== 'undefined');

    // ---- 純函數 ----
    const fn = await page.evaluate(() => ({
        n1: Person.normalizeDateString('1985'), n2: Person.normalizeDateString('1985/6'), n3: Person.normalizeDateString('1985.06.15'),
        n4: Person.normalizeDateString('1985年6月'), n5: Person.normalizeDateString('abc'), n6: Person.normalizeDateString(''),
        n7: Person.normalizeDateString('1985-13'), n8: Person.normalizeDateString(null), n9: Person.normalizeDateString(' 1990-01-05 '),
        a1: Person.computeAge('1985', '2026-09-03'), a2: Person.computeAge('1985-06', '2026-09-03'), a3: Person.computeAge('1985-12', '2026-09-03'),
        a4: Person.computeAge('1985-09-03', '2026-09-03'), a5: Person.computeAge('1985-09-04', '2026-09-03'), a6: Person.computeAge('abc', '2026-09-03'),
        a7: Person.computeAge('2030', '2026-09-03'), a8: Person.computeAge('2000-05', new Date(2026, 8, 3)),
    }));
    check('normalize: 1985 → 1985', fn.n1 === '1985', fn.n1);
    check('normalize: 1985/6 → 1985-06', fn.n2 === '1985-06', fn.n2);
    check('normalize: 1985.06.15 → 1985-06-15', fn.n3 === '1985-06-15', fn.n3);
    check('normalize: 1985年6月 → 1985-06', fn.n4 === '1985-06', fn.n4);
    check('normalize: 非法/空/月份 13/null → null', fn.n5 === null && fn.n6 === null && fn.n7 === null && fn.n8 === null, JSON.stringify([fn.n5, fn.n6, fn.n7, fn.n8]));
    check('normalize: 前後空白 → 1990-01-05', fn.n9 === '1990-01-05', fn.n9);
    check('computeAge: 只有年份 = 年差 41', fn.a1 === 41, fn.a1);
    check('computeAge: 1985-06 於 2026-09 = 41（已過生日月）', fn.a2 === 41, fn.a2);
    check('computeAge: 1985-12 於 2026-09 = 40（未到）', fn.a3 === 40, fn.a3);
    check('computeAge: 生日當天 = 41、前一天 = 40', fn.a4 === 41 && fn.a5 === 40, `${fn.a4}/${fn.a5}`);
    check('computeAge: 非法出生 → null、未來出生 → null', fn.a6 === null && fn.a7 === null, `${fn.a6}/${fn.a7}`);
    check('computeAge: 接受 Date 物件基準', fn.a8 === 26, fn.a8);

    // ---- 資料模型 / 存檔 ----
    const model = await page.evaluate(() => {
        const legacy = { id: 'p1', name: '舊', gender: 'male', age: 50, x: 1, y: 2 };
        const legacyJson = new Person(legacy).toJSON();
        const withBirth = new Person({ name: '生', gender: 'female', age: 99, birthDate: '1990/3' });
        const rt = Person.fromJSON(withBirth.toJSON());
        const alive = new Person({ birthDate: '1990-03', age: 99 });
        const deadBoth = new Person({ birthDate: '1950-01', deathDate: '2020-06', isDeceased: true, age: 99 });
        const deadNoDeath = new Person({ birthDate: '1950-01', isDeceased: true, age: 68 });
        const manual = new Person({ age: 33 });
        return {
            legacyHasBirthKey: 'birthDate' in legacyJson, legacyHasDeathKey: 'deathDate' in legacyJson,
            rtBirth: rt.birthDate, rtAgeField: rt.age, jsonBirth: withBirth.toJSON().birthDate,
            alive: alive.getDisplayAge('2026-09-03'), aliveComputed: alive.isAgeComputed('2026-09-03'),
            deadBoth: deadBoth.getDisplayAge('2026-09-03'), deadBothComputed: deadBoth.isAgeComputed(),
            deadNoDeath: deadNoDeath.getDisplayAge('2026-09-03'), deadNoDeathComputed: deadNoDeath.isAgeComputed(),
            manual: manual.getDisplayAge(), manualComputed: manual.isAgeComputed(),
        };
    });
    check('舊檔無出生/死亡欄位 → toJSON 不新增 key（逐 byte 相容）', !model.legacyHasBirthKey && !model.legacyHasDeathKey);
    check('birthDate 建構時正規化並存載保留（1990/3 → 1990-03）', model.rtBirth === '1990-03' && model.jsonBirth === '1990-03', model.rtBirth);
    check('手填 age 欄位仍保留（不被覆寫）', model.rtAgeField === 99, model.rtAgeField);
    check('在世 + 出生年月 → 依基準日計算 36，且視為計算值', model.alive === 36 && model.aliveComputed, model.alive);
    check('過世 + 出生/死亡 → 享年 70', model.deadBoth === 70 && model.deadBothComputed, model.deadBoth);
    check('過世但無死亡年月 → 沿用手填 68、非計算值', model.deadNoDeath === 68 && !model.deadNoDeathComputed, model.deadNoDeath);
    check('無出生年月 → 手填 33', model.manual === 33 && !model.manualComputed, model.manual);

    // ---- UI：屬性面板 ----
    await page.evaluate(() => {
        const app = window.app;
        const p = new Person({ x: 500, y: 300, gender: 'female', name: '案主', age: 20 });
        app.persons.push(p); app._syncPersonMap();
        window.__pid = p.id;
        app.selectPerson(p.id); app.updatePropertyPanel(); app.render();
    });
    let ui = await page.evaluate(() => ({
        birthVisible: !!document.getElementById('personBirthDate'),
        deathHidden: document.getElementById('personDeathDateGroup').hidden,
        deathDisplay: getComputedStyle(document.getElementById('personDeathDateGroup')).display,
        ageReadonly: document.getElementById('personAge').readOnly,
        ageValue: document.getElementById('personAge').value,
        hintHidden: document.getElementById('personAgeHint').hidden,
    }));
    check('面板有出生年月欄；在世者死亡年月欄隱藏；年齡可手填 20；無提示', ui.birthVisible && ui.deathHidden && ui.deathDisplay === 'none' && !ui.ageReadonly && ui.ageValue === '20' && ui.hintHidden, JSON.stringify(ui));

    const histBefore = await page.evaluate(() => window.app.history.undoStack.length);
    await page.fill('#personBirthDate', '1990/1');
    await page.locator('#personBirthDate').press('Tab');
    await page.waitForTimeout(80);
    ui = await page.evaluate(() => {
        const app = window.app; const p = app.personMap.get(window.__pid);
        const today = new Date();
        return {
            birth: p.birthDate, ageField: p.age,
            expected: Person.computeAge('1990-01', today),
            ageReadonly: document.getElementById('personAge').readOnly,
            ageValue: document.getElementById('personAge').value,
            fieldValue: document.getElementById('personBirthDate').value,
            hint: document.getElementById('personAgeHint').textContent,
            hintHidden: document.getElementById('personAgeHint').hidden,
            hist: app.history.undoStack.length,
            dirty: !document.getElementById('documentDirty').hidden,
        };
    });
    check('輸入 1990/1 + Tab → birthDate=1990-01、欄位顯示正規化值', ui.birth === '1990-01' && ui.fieldValue === '1990-01', JSON.stringify(ui));
    check('年齡欄變唯讀並顯示計算值；手填 age 仍是 20', ui.ageReadonly && ui.ageValue === String(ui.expected) && ui.ageField === 20, JSON.stringify(ui));
    check('顯示「依出生年月自動計算」提示', !ui.hintHidden && /自動計算/.test(ui.hint), ui.hint);
    check('出生年月變更 = 一筆 history + 標記未儲存', ui.hist === histBefore + 1 && ui.dirty, `${ui.hist} vs ${histBefore + 1}`);

    // 畫布真的畫出計算值（攔 fillText）
    const drawn = await page.evaluate(() => {
        const texts = [];
        const orig = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) { texts.push(String(t)); return orig.call(this, t, ...rest); };
        try { window.app.render(); } finally { CanvasRenderingContext2D.prototype.fillText = orig; }
        const p = window.app.personMap.get(window.__pid);
        return { texts, expected: String(Person.computeAge('1990-01', new Date())) };
    });
    check('畫布繪出計算年齡而非手填 20', drawn.texts.includes(drawn.expected) && !drawn.texts.includes('20'), JSON.stringify(drawn.texts.slice(0, 12)));

    // 格式錯誤：不寫入、標紅、不推 history
    const histBeforeBad = await page.evaluate(() => window.app.history.undoStack.length);
    await page.fill('#personBirthDate', 'abc');
    await page.locator('#personBirthDate').press('Tab');
    await page.waitForTimeout(80);
    ui = await page.evaluate(() => ({
        birth: window.app.personMap.get(window.__pid).birthDate,
        invalid: document.getElementById('personBirthDate').classList.contains('is-invalid'),
        hist: window.app.history.undoStack.length,
    }));
    check('非法輸入 abc → 不寫入（仍 1990-01）、欄位標紅、history 不變', ui.birth === '1990-01' && ui.invalid && ui.hist === histBeforeBad, JSON.stringify(ui));

    // 過世 → 死亡年月欄出現；填死亡年月 → 享年
    await page.check('#personDeceased');
    await page.waitForTimeout(60);
    ui = await page.evaluate(() => ({
        deathDisplay: getComputedStyle(document.getElementById('personDeathDateGroup')).display,
        ageValue: document.getElementById('personAge').value,
        ageReadonly: document.getElementById('personAge').readOnly,
        hint: document.getElementById('personAgeHint').textContent,
    }));
    check('勾過世 → 死亡年月欄顯示；無死亡年月時年齡回手填 20（可編輯）並提示', ui.deathDisplay !== 'none' && ui.ageValue === '20' && !ui.ageReadonly && /享年/.test(ui.hint), JSON.stringify(ui));
    await page.fill('#personDeathDate', '2020-01');
    await page.locator('#personDeathDate').press('Tab');
    await page.waitForTimeout(80);
    ui = await page.evaluate(() => ({ death: window.app.personMap.get(window.__pid).deathDate, ageValue: document.getElementById('personAge').value, ro: document.getElementById('personAge').readOnly }));
    check('填死亡年月 2020-01 → 享年 30、唯讀', ui.death === '2020-01' && ui.ageValue === '30' && ui.ro, JSON.stringify(ui));
    await page.uncheck('#personDeceased');
    await page.waitForTimeout(60);

    // ---- 檢視分頁：基準日 ----
    await page.evaluate(() => window.app.setInspectorTab('view'));
    await page.fill('#ageReferenceDate', '2000-06-15');
    await page.locator('#ageReferenceDate').dispatchEvent('change');
    await page.waitForTimeout(80);
    let ref = await page.evaluate(() => ({ ref: window.app.ageReferenceDate, canvasRef: window.app.canvas.ageReferenceDate, age: window.app.personMap.get(window.__pid).getDisplayAge(window.app.ageReferenceDate) }));
    check('基準日 2000-06-15 → app/canvas 同步、年齡 10', ref.ref === '2000-06-15' && ref.canvasRef === '2000-06-15' && ref.age === 10, JSON.stringify(ref));
    await page.evaluate(() => window.app.setInspectorTab('properties'));
    await page.evaluate(() => { const app = window.app; app.selectPerson(window.__pid); app.updatePropertyPanel(); });
    ui = await page.evaluate(() => ({ ageValue: document.getElementById('personAge').value, hint: document.getElementById('personAgeHint').textContent }));
    check('屬性面板年齡隨基準日 = 10，提示含基準日', ui.ageValue === '10' && /2000-06-15/.test(ui.hint), JSON.stringify(ui));
    await page.evaluate(() => window.app.setInspectorTab('view'));
    await page.click('#ageReferenceToday');
    await page.waitForTimeout(60);
    ref = await page.evaluate(() => ({ ref: window.app.ageReferenceDate, input: document.getElementById('ageReferenceDate').value }));
    check('「今天」→ 基準日清空', ref.ref === null && ref.input === '', JSON.stringify(ref));

    // 基準日不進 JSON / autosave 資料
    const persisted = await page.evaluate(() => {
        const app = window.app;
        const p = app.personMap.get(window.__pid);
        const json = p.toJSON();
        const state = app.getState();
        return { json, stateKeys: Object.keys(state), personKeys: Object.keys(json) };
    });
    check('Person JSON 含 birthDate，不含基準日', persisted.json.birthDate === '1990-01' && !('ageReferenceDate' in persisted.json), JSON.stringify(persisted.personKeys));

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== birthdate ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
