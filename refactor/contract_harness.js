const { chromium } = require('playwright');
const path = require('path');

async function openApp(viewport = { width: 1366, height: 768 }) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);
    return { browser, page, errors };
}

function createChecks() {
    const failures = [];
    const passes = [];
    const check = (name, condition, detail = '') =>
        (condition ? passes : failures).push(condition ? name : name + (detail ? ' — ' + detail : ''));
    return { failures, passes, check };
}

async function finish(browser, passes, failures, successMessage) {
    await browser.close();
    console.log('PASS:');
    passes.forEach(name => console.log('  OK ' + name));
    if (failures.length) {
        console.log('FAIL:');
        failures.forEach(name => console.log('  X ' + name));
        process.exit(1);
    }
    console.log(successMessage);
}

module.exports = { openApp, createChecks, finish };
