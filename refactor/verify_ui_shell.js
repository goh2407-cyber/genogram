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
        .filter(button => {
            if (!button.getClientRects().length) return false;
            let element = button;
            while (element) {
                const style = getComputedStyle(element);
                if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
                    return false;
                }
                element = element.parentElement;
            }
            return true;
        })
        .filter(button => {
            const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                if (!node.textContent.trim()) continue;
                let element = node.parentElement;
                let visuallyHidden = false;
                while (element && element !== button) {
                    const style = getComputedStyle(element);
                    const clipped = style.clip === 'rect(0px, 0px, 0px, 0px)'
                        || style.clipPath === 'inset(50%)';
                    if (style.display === 'none' || style.visibility === 'hidden'
                        || Number(style.opacity) === 0 || clipped) {
                        visuallyHidden = true;
                        break;
                    }
                    element = element.parentElement;
                }
                if (visuallyHidden) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                if ([...range.getClientRects()].some(rect => rect.width > 0 && rect.height > 0)) return false;
            }
            return true;
        })
        .filter(button => !button.getAttribute('title')?.trim() || !button.getAttribute('aria-label')?.trim())
        .map(button => button.id ? `#${button.id}` : button.outerHTML.slice(0, 80)));
    check('icon-only commands have title and aria-label', missing.length === 0,
        `missing title or aria-label: ${missing.join(', ')}`);
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

    const tabContract = await page.locator('[data-inspector-tab]').evaluateAll(tabs => tabs.map(tab => {
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        return {
            hasId: Boolean(tab.id),
            controlsPanel: Boolean(panel && panel.getAttribute('aria-labelledby') === tab.id),
            tabIndex: tab.tabIndex
        };
    }));
    check('inspector tabs and panels have complete ARIA relationships',
        tabContract.every(item => item.hasId && item.controlsPanel), JSON.stringify(tabContract));
    check('inspector tabs use roving tabindex',
        tabContract.filter(item => item.tabIndex === 0).length === 1
            && tabContract.filter(item => item.tabIndex === -1).length === 2,
        JSON.stringify(tabContract));

    const propertiesTab = page.locator('[data-inspector-tab="properties"]');
    await propertiesTab.focus();
    await propertiesTab.press('ArrowRight');
    check('ArrowRight activates and focuses the next inspector tab',
        await page.evaluate(() => document.activeElement?.dataset.inspectorTab === 'legend'
            && window.app.currentInspectorTab === 'legend'));
    await page.keyboard.press('End');
    check('End activates and focuses the last inspector tab',
        await page.evaluate(() => document.activeElement?.dataset.inspectorTab === 'view'
            && window.app.currentInspectorTab === 'view'));
    await page.keyboard.press('Home');
    check('Home activates and focuses the first inspector tab',
        await page.evaluate(() => document.activeElement?.dataset.inspectorTab === 'properties'
            && window.app.currentInspectorTab === 'properties'));
    await page.keyboard.press('ArrowLeft');
    check('ArrowLeft wraps to and focuses the previous inspector tab',
        await page.evaluate(() => document.activeElement?.dataset.inspectorTab === 'view'
            && window.app.currentInspectorTab === 'view'));

    const existingCommandIds = [
        'addPerson', 'selectTool', 'boxSelectTool', 'connectTool', 'householdTool', 'lifeCircleTool',
        'undoBtn', 'redoBtn', 'saveBtn', 'exportBtn'
    ];
    for (const id of existingCommandIds) {
        check(`existing command #${id} remains available`, await page.locator(`#${id}`).count() > 0,
            `existing command #${id} missing`);
    }

    const inspector = page.locator('#inspectorPanel');
    if (await inspector.count()) {
        const width = await inspector.evaluate(element => element.getBoundingClientRect().width);
        check('inspector width at 1366px is 296–336px', width >= 296 && width <= 336,
            `width=${width.toFixed(1)}px`);
    } else {
        check('inspector width at 1366px is 296–336px', false,
            'cannot measure: #inspectorPanel missing');
    }
    await page.setViewportSize({ width: 900, height: 768 });
    const toggle = page.locator('#inspectorToggle');
    const canvasContainer = page.locator('#canvasContainer');
    if (await toggle.count() && await canvasContainer.count()) {
        await page.waitForFunction(() => document.body.classList.contains('inspector-collapsed'));
        check('inspector auto-collapses after crossing into narrow viewport',
            await page.locator('body.inspector-collapsed').count() === 1);
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.waitForFunction(() => !document.body.classList.contains('inspector-collapsed'));
        check('auto-collapsed inspector restores on return to wide viewport',
            await page.locator('body.inspector-collapsed').count() === 0);
        const widthBefore = await canvasContainer.evaluate(element => element.getBoundingClientRect().width);
        await toggle.click();
        check('inspector toggle applies body.inspector-collapsed',
            await page.locator('body.inspector-collapsed').count() === 1,
            'body.inspector-collapsed missing after toggle');
        await page.waitForFunction(width => document.getElementById('canvasContainer').getBoundingClientRect().width > width,
            widthBefore);
        const widthAfter = await canvasContainer.evaluate(element => element.getBoundingClientRect().width);
        check('collapsed inspector gives canvas usable width', widthAfter > widthBefore,
            `canvas width ${widthBefore.toFixed(1)}px → ${widthAfter.toFixed(1)}px`);
        check('collapsed toggle exposes expand action text',
            await toggle.getAttribute('title') === '展開檢視面板'
                && await toggle.getAttribute('aria-label') === '展開檢視面板');
        await page.setViewportSize({ width: 900, height: 768 });
        await page.setViewportSize({ width: 1024, height: 768 });
        check('responsive changes preserve a manual inspector choice',
            await page.locator('body.inspector-collapsed').count() === 1);
        await toggle.click();
        check('expanded toggle exposes collapse action text',
            await toggle.getAttribute('title') === '收合檢視面板'
                && await toggle.getAttribute('aria-label') === '收合檢視面板');
    } else {
        const missing = [
            await toggle.count() ? null : '#inspectorToggle',
            await canvasContainer.count() ? null : '#canvasContainer'
        ].filter(Boolean).join(', ');
        check('inspector toggle applies body.inspector-collapsed', false,
            `cannot toggle: ${missing} missing`);
        check('collapsed inspector gives canvas usable width', false,
            `cannot compare canvas width: ${missing} missing`);
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
