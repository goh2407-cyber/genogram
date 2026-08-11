/**
 * Regression: relationship routes stay literal and the editor does not show
 * overlap warnings. Auto is the standard direct route; only an explicit
 * over/under choice changes the shape.
 */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const errors = [];
    page.on('pageerror', error => errors.push('pageerror: ' + error.message));
    page.on('console', message => {
        if (message.type() === 'error') errors.push('console: ' + message.text());
    });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app?.canvas);

    const result = await page.evaluate(() => {
        const app = window.app;
        const canvas = app.canvas;
        const from = new Person({ id: 'from', x: 220, y: 360, gender: 'male', name: '甲' });
        const blocker = new Person({ id: 'blocker', x: 520, y: 360, gender: 'male', name: '中間人物' });
        const to = new Person({ id: 'to', x: 820, y: 360, gender: 'female', name: '乙' });
        const auto = new Relationship({ id: 'auto', fromPersonId: from.id,
            toPersonId: to.id, type: 'married', routeMode: 'auto' });
        const under = new Relationship({ id: 'under', fromPersonId: from.id,
            toPersonId: to.id, type: 'separated', routeMode: 'under' });

        app.persons = [from, blocker, to];
        app.relationships = [auto, under];
        app._syncPersonMap();
        app.render();

        const autoRoute = canvas.getMarriageRoute(from, to, auto, app.relationships);
        const underRoute = canvas.getMarriageRoute(from, to, under, app.relationships);
        const warning = document.getElementById('routingWarning');

        canvas.labelRoutingWarnings = [{ relationshipId: auto.id,
            reason: 'label-route-overlap' }];
        canvas.marriageRoutingWarnings = [{ relationshipId: auto.id,
            reason: 'marriage-route-collision' }];
        app.updateRoutingWarning();

        return {
            autoRoute,
            underRoute,
            autoExpected: [from.getConnectionPoint('right'), to.getConnectionPoint('left')],
            underExpected: [
                from.getConnectionPoint('bottom'),
                { x: from.x, y: underRoute.config.archBarY },
                { x: to.x, y: underRoute.config.archBarY },
                to.getConnectionPoint('bottom')
            ],
            warning: { hidden: warning.hidden, text: warning.textContent }
        };
    });

    const checks = [];
    const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
    check('auto with an intervening person remains the two-point standard side line',
        result.autoRoute.candidateName === 'direct'
            && JSON.stringify(result.autoRoute.points) === JSON.stringify(result.autoExpected),
        JSON.stringify(result.autoRoute));
    check('explicit under remains the compact four-point U selected by the user',
        JSON.stringify(result.underRoute.points) === JSON.stringify(result.underExpected),
        JSON.stringify(result.underRoute));
    check('overlap diagnostics never display a text warning in the editor',
        result.warning.hidden && result.warning.text === '',
        JSON.stringify(result.warning));
    check('browser run has no console or page errors',
        errors.length === 0, errors.join(' | '));

    const failed = checks.filter(item => !item.ok);
    checks.forEach(item => console.log(`${item.ok ? 'PASS' : 'FAIL'} | ${item.name}`
        + (item.ok ? '' : ` — ${item.detail}`)));
    console.log(`\n===== standard-default-routes ===== ${checks.length - failed.length}/${checks.length} pass`);
    await browser.close();
    if (failed.length) process.exit(1);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
