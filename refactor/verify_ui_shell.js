/**
 * 新版臨床工作區 UI 契約（預期在介面實作前維持 RED）
 * 用法：NODE_PATH=<playwright node_modules> node refactor/verify_ui_shell.js
 */
const { chromium } = require('playwright');
const path = require('path');

const fails = [];
const oks = [];

function check(name, condition, detail = '') {
    if (condition) {
        oks.push(name);
    } else {
        fails.push(name + (detail ? ` — ${detail}` : ''));
    }
}

async function checkIconOnlyAccessibility(page) {
    const missing = await page.locator('button:has(svg)').evaluateAll(buttons => buttons
        .filter(button => button.getClientRects().length > 0)
        .filter(button => !button.textContent.trim())
        .filter(button => !button.getAttribute('title') || !button.getAttribute('aria-label'))
        .map(button => button.id ? `#${button.id}` : button.outerHTML.slice(0, 80)));
    check('icon-only commands have title and aria-label', missing.length === 0,
        `missing accessibility labels: ${missing.join(', ')}`);
}

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);

    const required = [
        '#globalBar', '#canvasToolDock', '#inspectorPanel', '#inspectorToggle',
        '[data-inspector-tab="properties"]',
        '[data-inspector-tab="legend"]',
        '[data-inspector-tab="view"]'
    ];
    for (const selector of required) {
        check(`${selector} exists`, await page.locator(selector).count() > 0, `${selector} missing`);
    }

    for (const id of ['addPerson', 'selectTool', 'boxSelectTool', 'connectTool', 'householdTool', 'lifeCircleTool']) {
        check(`existing command #${id} remains available`, await page.locator(`#${id}`).count() > 0,
            `existing command #${id} missing`);
    }

    const inspector = page.locator('#inspectorPanel');
    if (await inspector.count()) {
        const width = await inspector.evaluate(element => element.getBoundingClientRect().width);
        check('inspector width at 1366px is 296–336px', width >= 296 && width <= 336,
            `width=${width.toFixed(1)}px`);
    }
    await page.setViewportSize({ width: 1024, height: 768 });
    const toggle = page.locator('#inspectorToggle');
    const canvasContainer = page.locator('#canvasContainer');
    if (await toggle.count() && await canvasContainer.count()) {
        const widthBefore = await canvasContainer.evaluate(element => element.getBoundingClientRect().width);
        await toggle.click();
        check('inspector toggle applies body.inspector-collapsed',
            await page.locator('body.inspector-collapsed').count() === 1,
            'body.inspector-collapsed missing after toggle');
        const widthAfter = await canvasContainer.evaluate(element => element.getBoundingClientRect().width);
        check('collapsed inspector gives canvas usable width', widthAfter > widthBefore,
            `canvas width ${widthBefore.toFixed(1)}px → ${widthAfter.toFixed(1)}px`);
    }
    await checkIconOnlyAccessibility(page);

    check('zero console/page errors', errors.length === 0, errors.join('; '));
    await browser.close();

    console.log('PASS:');
    oks.forEach(name => console.log(`  OK ${name}`));
    if (fails.length) {
        console.log('FAIL:');
        fails.forEach(failure => console.log(`  X ${failure}`));
        process.exit(1);
    }
    console.log('ALL UI SHELL CHECKS PASSED');
})().catch(error => {
    console.error(`FAIL: ${error.stack || error.message}`);
    process.exit(1);
});
