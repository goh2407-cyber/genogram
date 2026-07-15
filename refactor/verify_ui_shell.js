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

async function shellMetrics(page) {
    return page.evaluate(() => {
        const rect = selector => {
            const value = document.querySelector(selector)?.getBoundingClientRect();
            return value ? {
                left: value.left,
                right: value.right,
                top: value.top,
                bottom: value.bottom,
                width: value.width,
                height: value.height
            } : null;
        };
        return {
            app: rect('.app-container'),
            bar: rect('#globalBar'),
            dock: rect('#canvasToolDock'),
            actions: rect('.global-actions'),
            canvas: rect('#canvasContainer'),
            inspector: rect('#inspectorPanel'),
            spacer: rect('#inspectorRailSpacer'),
            compact: document.body.classList.contains('inspector-compact'),
            overlay: document.body.classList.contains('inspector-overlay-open'),
            collapsed: document.body.classList.contains('inspector-collapsed'),
            documentNameVisible: Boolean(document.querySelector('.document-name')?.getClientRects().length),
            scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
        };
    });
}

function overlaps(a, b) {
    return Boolean(a && b && a.left < b.right && a.right > b.left
        && a.top < b.bottom && a.bottom > b.top);
}

async function settleResponsiveLayout(page) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(180);
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
        '#globalBar', '#canvasToolDock', '#inspectorPanel', '#inspectorToggle', '#inspectorRailSpacer',
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

    const toggle = page.locator('#inspectorToggle');
    const canvasContainer = page.locator('#canvasContainer');

    await page.setViewportSize({ width: 1920, height: 1080 });
    await settleResponsiveLayout(page);
    const wide = await shellMetrics(page);
    check('1920px uses fixed desktop inspector', !wide.compact && !wide.overlay
        && wide.inspector?.width >= 315 && wide.inspector?.width <= 317, JSON.stringify(wide));
    check('1920px canvas dock does not collide with global actions',
        !overlaps(wide.dock, wide.actions), JSON.stringify({ dock: wide.dock, actions: wide.actions }));

    await page.setViewportSize({ width: 1366, height: 768 });
    await settleResponsiveLayout(page);
    const standard = await shellMetrics(page);
    check('1366px stays desktop with a 296–336px inspector',
        !standard.compact && standard.inspector?.width >= 296 && standard.inspector?.width <= 336,
        JSON.stringify(standard));
    check('1366px global bar remains one row', standard.bar?.height <= 66,
        JSON.stringify(standard.bar));

    if (await toggle.count() && await canvasContainer.count()) {
        await toggle.click();
        await settleResponsiveLayout(page);
        check('desktop toggle stores a collapsed inspector choice',
            (await shellMetrics(page)).collapsed === true);

        await page.setViewportSize({ width: 1181, height: 820 });
        await settleResponsiveLayout(page);
        const boundaryDesktop = await shellMetrics(page);
        check('1181px remains desktop rather than compact overlay mode',
            !boundaryDesktop.compact && boundaryDesktop.collapsed, JSON.stringify(boundaryDesktop));

        await page.setViewportSize({ width: 1180, height: 820 });
        await settleResponsiveLayout(page);
        const rail = await shellMetrics(page);
        check('1180px defaults to compact rail mode', rail.compact && !rail.overlay && !rail.collapsed,
            JSON.stringify(rail));
        check('compact rail and layout spacer are both 52px',
            Math.abs((rail.inspector?.width || 0) - 52) < 0.5
                && Math.abs((rail.spacer?.width || 0) - 52) < 0.5,
            JSON.stringify({ inspector: rail.inspector, spacer: rail.spacer }));
        check('compact mode hides the document name', rail.documentNameVisible === false);

        const compactCanvasWidth = rail.canvas?.width;
        await toggle.click();
        await settleResponsiveLayout(page);
        const opened = await shellMetrics(page);
        check('compact toggle opens a 296px overlay', opened.compact && opened.overlay
            && Math.abs((opened.inspector?.width || 0) - 296) < 0.5, JSON.stringify(opened));
        check('compact overlay does not change canvas layout width',
            Math.abs((opened.canvas?.width || 0) - compactCanvasWidth) < 0.5,
            `${compactCanvasWidth} → ${opened.canvas?.width}`);
        check('opened compact toggle exposes collapse action text',
            await toggle.getAttribute('title') === '收合檢視面板'
                && await toggle.getAttribute('aria-label') === '收合檢視面板');

        await toggle.click();
        await settleResponsiveLayout(page);
        check('compact toggle closes the overlay', (await shellMetrics(page)).overlay === false);

        await toggle.click();
        await settleResponsiveLayout(page);
        await canvasContainer.click({ position: { x: 12, y: 12 } });
        await settleResponsiveLayout(page);
        check('clicking the canvas closes the compact overlay', (await shellMetrics(page)).overlay === false);

        await toggle.click();
        await settleResponsiveLayout(page);
        await page.evaluate(() => { window.app.connectingFrom = 'responsive-priority-check'; });
        await page.keyboard.press('Escape');
        await settleResponsiveLayout(page);
        const priority = await page.evaluate(() => ({
            connectingFrom: window.app.connectingFrom,
            overlay: document.body.classList.contains('inspector-overlay-open')
        }));
        check('Escape cancels a higher-priority connection before the compact overlay',
            priority.connectingFrom === null && priority.overlay === true, JSON.stringify(priority));
        await page.keyboard.press('Escape');
        await settleResponsiveLayout(page);
        check('a second Escape closes the compact overlay', (await shellMetrics(page)).overlay === false);

        await page.setViewportSize({ width: 1024, height: 768 });
        await settleResponsiveLayout(page);
        const compact1024 = await shellMetrics(page);
        check('1024px remains compact with a one-row global bar',
            compact1024.compact && compact1024.bar?.height <= 66, JSON.stringify(compact1024));
        check('1024px canvas dock does not collide with global actions',
            !overlaps(compact1024.dock, compact1024.actions),
            JSON.stringify({ dock: compact1024.dock, actions: compact1024.actions }));
        const toolbarTargets = await page.locator('#globalBar button').evaluateAll(buttons => buttons
            .filter(button => button.getClientRects().length > 0)
            .map(button => {
                const rect = button.getBoundingClientRect();
                return { id: button.id, width: rect.width, height: rect.height };
            }));
        check('1024px toolbar buttons keep at least 36px pointer targets',
            toolbarTargets.every(target => target.width >= 36 && target.height >= 36),
            JSON.stringify(toolbarTargets));

        await page.setViewportSize({ width: 1023, height: 768 });
        await settleResponsiveLayout(page);
        const belowMinimum = await shellMetrics(page);
        check('1023px keeps a 1024px minimum layout with horizontal scrolling',
            belowMinimum.app?.width >= 1024 && belowMinimum.scrollWidth >= 1024 && belowMinimum.compact,
            JSON.stringify(belowMinimum));

        await page.setViewportSize({ width: 1181, height: 820 });
        await settleResponsiveLayout(page);
        const restoredDesktop = await shellMetrics(page);
        check('leaving compact restores the prior manual desktop collapse choice',
            !restoredDesktop.compact && restoredDesktop.collapsed, JSON.stringify(restoredDesktop));
        await toggle.click();
        await settleResponsiveLayout(page);
        check('expanded desktop toggle exposes collapse action text',
            await toggle.getAttribute('title') === '收合檢視面板'
                && await toggle.getAttribute('aria-label') === '收合檢視面板');
    } else {
        check('responsive inspector interactions are available', false,
            'missing #inspectorToggle or #canvasContainer');
    }
    await checkIconOnlyAccessibility(page);

    const zoomTargetSizes = await page.locator('.zoom-btn').evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const ownsPoint = (x, y) => document.elementFromPoint(x, y) === button;
        let hitLeft = rect.left;
        let hitRight = rect.right;
        let hitTop = rect.top;
        let hitBottom = rect.bottom;
        while (hitLeft > rect.left - 12 && ownsPoint(hitLeft - 0.5, centerY)) hitLeft -= 1;
        while (hitRight < rect.right + 12 && ownsPoint(hitRight + 0.5, centerY)) hitRight += 1;
        while (hitTop > rect.top - 12 && ownsPoint(centerX, hitTop - 0.5)) hitTop -= 1;
        while (hitBottom < rect.bottom + 12 && ownsPoint(centerX, hitBottom + 0.5)) hitBottom += 1;
        return { id: button.id, width: rect.width, height: rect.height,
            hitWidth: hitRight - hitLeft, hitHeight: hitBottom - hitTop };
    }));
    check('zoom controls provide at least 36px pointer targets',
        zoomTargetSizes.every(size => size.hitWidth >= 36 && size.hitHeight >= 36),
        JSON.stringify(zoomTargetSizes));

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
