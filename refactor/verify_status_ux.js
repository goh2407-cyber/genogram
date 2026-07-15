const { chromium } = require('playwright');
const path = require('path');

const failures = [];
const passes = [];
function check(name, condition, detail = '') {
    (condition ? passes : failures).push(condition ? name : name + (detail ? ' — ' + detail : ''));
}

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
    const errors = [];
    const failedResponses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) failedResponses.push(response.url()); });
    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);

    const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
    check('favicon points to the bundled icon', favicon === 'icon-512.png', String(favicon));
    check('no favicon request fails', !failedResponses.some(url => /favicon\.ico$/.test(url)), failedResponses.join(' | '));

    await page.click('#addPerson');
    check('generic add prompt names a person rather than a parent',
        await page.locator('#statusBar').textContent() === '選擇新增人物的性別');
    await page.click('#cancelGender');

    const timerResult = await page.evaluate(async () => {
        const app = window.app;
        const constants = { ...GenogramApp.STATUS_TIMEOUTS };
        app.updateStatus('舊訊息', 'success', { autoHideMs: 20 });
        await new Promise(resolve => setTimeout(resolve, 5));
        app.updateStatus('新操作提示', 'info');
        await new Promise(resolve => setTimeout(resolve, 35));
        const newStillVisible = !app.elements.statusBar.classList.contains('hidden')
            && app.elements.statusBar.textContent === '新操作提示';
        app.updateStatus('短訊息', 'success', { autoHideMs: 20 });
        await new Promise(resolve => setTimeout(resolve, 35));
        const passiveHidden = app.elements.statusBar.classList.contains('hidden');
        app.updateStatus('進行中的操作', 'info');
        await new Promise(resolve => setTimeout(resolve, 35));
        const activeVisible = !app.elements.statusBar.classList.contains('hidden');
        app.updateStatus();
        return { constants, newStillVisible, passiveHidden, activeVisible,
            timerCleared: app.statusHideTimer === null };
    });
    check('status constants match the approved design',
        timerResult.constants.passive === 3500 && timerResult.constants.passiveAlert === 6000,
        JSON.stringify(timerResult.constants));
    check('an old timer never hides a newer message', timerResult.newStillVisible);
    check('a passive message hides after its timeout', timerResult.passiveHidden);
    check('active info remains visible', timerResult.activeVisible);
    check('explicit clear cancels and nulls the timer', timerResult.timerCleared);
    check('zero page/console errors', errors.length === 0, errors.join(' | '));

    await browser.close();
    console.log('PASS:');
    passes.forEach(name => console.log('  OK ' + name));
    if (failures.length) {
        console.log('FAIL:');
        failures.forEach(name => console.log('  X ' + name));
        process.exit(1);
    }
    console.log('ALL STATUS UX CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
