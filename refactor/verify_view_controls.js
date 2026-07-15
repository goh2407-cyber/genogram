const { chromium } = require('playwright');
const path = require('path');

const failures = [];
const passes = [];
function check(name, condition, detail = '') {
    (condition ? passes : failures).push(condition ? name : name + (detail ? ' — ' + detail : ''));
}

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);
    await page.click('#viewTab');

    const result = await page.evaluate(() => {
        const expected = [
            'showNames', 'showAges', 'showNotes', 'showMedical',
            'showEmotionalRelationships', 'showHouseholds', 'showLifeCircles'
        ];
        const controls = [...document.querySelectorAll('[data-view-option]')];
        return {
            keys: controls.map(control => control.dataset.viewOption),
            checked: controls.map(control => control.checked),
            state: { ...window.app.viewOptions },
            emotionalConflict: Relationship.isEmotionalDisplayType('conflict'),
            emotionalAbuse: Relationship.isEmotionalDisplayType('emotional-abuse'),
            expected
        };
    });
    check('seven View controls exist in the approved order',
        JSON.stringify(result.keys) === JSON.stringify(result.expected), JSON.stringify(result.keys));
    check('all View controls default on', result.checked.every(Boolean), JSON.stringify(result.checked));
    check('App state defaults match the controls',
        result.expected.every(key => result.state[key] === true), JSON.stringify(result.state));
    check('ordinary emotional lines are hideable', result.emotionalConflict === true);
    check('abuse lines are not classified as hideable emotional lines', result.emotionalAbuse === false);

    const names = page.locator('[data-view-option="showNames"]');
    await names.focus();
    await names.press('Space');
    check('keyboard toggling updates App state',
        await page.evaluate(() => window.app.viewOptions.showNames === false));
    check('view state is not added to persisted data',
        await page.evaluate(() => !Object.prototype.hasOwnProperty.call(window.app.getState(), 'viewOptions')));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));

    await browser.close();
    console.log('PASS:');
    passes.forEach(name => console.log('  OK ' + name));
    if (failures.length) {
        console.log('FAIL:');
        failures.forEach(name => console.log('  X ' + name));
        process.exit(1);
    }
    console.log('ALL VIEW CONTROL STATE CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
