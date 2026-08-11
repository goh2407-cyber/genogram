const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp({ width: 1200, height: 800 });
    const { failures, passes, check } = createChecks();
    const ids = ['genderModal', 'relationshipModal', 'childrenModal', 'helpModal', 'exportModal'];

    const initial = await page.evaluate(ids => ids.map(id => {
        const overlay = document.getElementById(id);
        const dialog = overlay?.querySelector('.modal');
        return {
            id,
            hidden: overlay?.hidden,
            inert: overlay?.inert,
            ariaHidden: overlay?.getAttribute('aria-hidden'),
            pointer: overlay ? getComputedStyle(overlay).pointerEvents : null,
            role: dialog?.getAttribute('role'),
            ariaModal: dialog?.getAttribute('aria-modal'),
            labelled: Boolean(dialog?.getAttribute('aria-labelledby')
                && document.getElementById(dialog.getAttribute('aria-labelledby')))
        };
    }), ids);
    check('all modal overlays start hidden, inert, aria-hidden and pointer transparent',
        initial.every(item => item.hidden && item.inert && item.ariaHidden === 'true'
            && item.pointer === 'none'), JSON.stringify(initial));
    check('all dialog surfaces expose role, aria-modal and labelledby',
        initial.every(item => item.role === 'dialog' && item.ariaModal === 'true' && item.labelled),
        JSON.stringify(initial));

    await page.focus('#addPerson');
    await page.click('#addPerson');
    const opened = await page.evaluate(() => {
        const overlay = document.getElementById('genderModal');
        return {
            active: overlay.classList.contains('active'), hidden: overlay.hidden,
            inert: overlay.inert, ariaHidden: overlay.getAttribute('aria-hidden'),
            pointer: getComputedStyle(overlay).pointerEvents,
            focusInside: overlay.contains(document.activeElement)
        };
    });
    check('open modal is active, exposed, interactive and owns focus',
        opened.active && !opened.hidden && !opened.inert && opened.ariaHidden === 'false'
            && opened.pointer === 'auto' && opened.focusInside, JSON.stringify(opened));

    const outsideTab = await page.evaluate(() => {
        const app = window.app;
        const overlay = document.getElementById('genderModal');
        const focusables = app.modalManager._focusables(overlay);
        document.getElementById('addPerson').focus();
        let forwardPrevented = false;
        app.modalManager.handleKeyDown({
            key: 'Tab', shiftKey: false,
            preventDefault() { forwardPrevented = true; }
        });
        const forward = document.activeElement === focusables[0];
        document.getElementById('addPerson').focus();
        let backwardPrevented = false;
        app.modalManager.handleKeyDown({
            key: 'Tab', shiftKey: true,
            preventDefault() { backwardPrevented = true; }
        });
        return {
            forward, backward: document.activeElement === focusables[focusables.length - 1],
            forwardPrevented, backwardPrevented
        };
    });
    check('Tab from outside top modal moves to first control and prevents default',
        outsideTab.forward && outsideTab.forwardPrevented, JSON.stringify(outsideTab));
    check('Shift+Tab from outside top modal moves to last control and prevents default',
        outsideTab.backward && outsideTab.backwardPrevented, JSON.stringify(outsideTab));

    await page.click('#cancelGender');
    await page.waitForTimeout(340);
    const closed = await page.evaluate(() => {
        const overlay = document.getElementById('genderModal');
        return {
            active: overlay.classList.contains('active'), hidden: overlay.hidden,
            inert: overlay.inert, pointer: getComputedStyle(overlay).pointerEvents,
            focusId: document.activeElement?.id
        };
    });
    check('close immediately disables pointer and eventually applies hidden',
        !closed.active && closed.hidden && closed.inert && closed.pointer === 'none',
        JSON.stringify(closed));
    check('close restores focus to the trigger', closed.focusId === 'addPerson', closed.focusId);

    await page.evaluate(() => {
        window.__modalCanvasDowns = 0;
        document.getElementById('genogramCanvas')
            .addEventListener('pointerdown', () => window.__modalCanvasDowns++);
    });
    const rect = await page.locator('#genogramCanvas').boundingBox();
    await page.mouse.click(rect.x + 24, rect.y + 80);
    check('closed overlay no longer blocks a real canvas click',
        await page.evaluate(() => window.__modalCanvasDowns === 1));

    await page.click('#helpBtn');
    await page.locator('#helpModal .modal').click({ position: { x: 20, y: 20 } });
    check('click inside dialog does not backdrop-close it',
        await page.locator('#helpModal').evaluate(node => node.classList.contains('active')));
    await page.locator('#helpModal').click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(340);
    check('click on the backdrop requests close',
        await page.locator('#helpModal').evaluate(node => node.hidden));

    const rapid = await page.evaluate(async () => {
        const app = window.app;
        app.showGenderModal('parent');
        app.closeGenderModal();
        app.showGenderModal('parent');
        await new Promise(resolve => setTimeout(resolve, 340));
        const overlay = document.getElementById('genderModal');
        const result = { active: overlay.classList.contains('active'), hidden: overlay.hidden,
            inert: overlay.inert, pointer: getComputedStyle(overlay).pointerEvents };
        app.closeGenderModal();
        return result;
    });
    check('stale close timer cannot hide a rapidly reopened modal',
        rapid.active && !rapid.hidden && !rapid.inert && rapid.pointer === 'auto', JSON.stringify(rapid));
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL MODAL FLOW CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
