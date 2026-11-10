/**
 * 2026-11-10 子女線穿過別人的提示圈（螢幕專用）：
 *  1. 子女線穿過別人的符號 → 那個人被標出來
 *  2. 把人拖開 → 提示消失
 *  3. 只壓到文字不提示（文字壓線是允許的）
 *  4. 匯出不畫提示圈；showRouteHints=false 可關掉
 */
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();

    const r = await page.evaluate(() => {
        const app = window.app;
        const out = {};
        app.loadData({
            version: '1.1',
            persons: [
                { id: 'F', name: '父', gender: 'male', x: 300, y: 200 },
                { id: 'M', name: '母', gender: 'female', x: 420, y: 200 },
                { id: 'C', name: '子', gender: 'male', x: 360, y: 440 },
                { id: 'X', name: '', gender: 'female', x: 360, y: 320 }
            ],
            relationships: [
                { id: 'm', type: 'marriage', fromPersonId: 'F', toPersonId: 'M' },
                { id: 'fc', type: 'parent-child', fromPersonId: 'F', toPersonId: 'C' },
                { id: 'mc', type: 'parent-child', fromPersonId: 'M', toPersonId: 'C' }
            ]
        });
        app.canvas.scale = 1; app.canvas.offsetX = 0; app.canvas.offsetY = 0;

        // 數「桃紅虛線圓」被畫了幾次
        const countRings = fn => {
            let rings = 0;
            const proto = CanvasRenderingContext2D.prototype;
            const origStroke = proto.stroke;
            proto.stroke = function (...args) {
                if (String(this.strokeStyle).toLowerCase() === '#ed1261' && this.getLineDash().length === 2) rings++;
                return origStroke.apply(this, args);
            };
            try { fn(); } finally { proto.stroke = origStroke; }
            return rings;
        };

        out.ringsBlocked = countRings(() => app.render());
        out.idsBlocked = app.canvas.getFamilyCollisionPersonIds();

        app.canvas.showRouteHints = false;
        out.ringsOff = countRings(() => app.render());
        app.canvas.showRouteHints = true;

        out.ringsExport = countRings(() => {
            app.canvas.exportToPNG(app.persons, app.relationships, [], [], true);
        });

        app.personMap.get('X').x = 600;
        out.ringsMoved = countRings(() => app.render());
        out.idsMoved = app.canvas.getFamilyCollisionPersonIds();

        // 只有文字被壓到（符號沒被穿過）→ 不提示
        const fake = [{ safe: false, collisions: ['X:text'] }];
        const saved = app.canvas._familyRoutePlans;
        app.canvas._familyRoutePlans = fake;
        out.idsTextOnly = app.canvas.getFamilyCollisionPersonIds();
        app.canvas._familyRoutePlans = saved;
        return out;
    });

    check('子女線穿過別人的符號：標出那個人、畫一個提示圈',
        JSON.stringify(r.idsBlocked) === '["X"]' && r.ringsBlocked === 1, JSON.stringify(r));
    check('showRouteHints=false 不畫', r.ringsOff === 0, String(r.ringsOff));
    check('匯出不畫提示圈', r.ringsExport === 0, String(r.ringsExport));
    check('把人拖開後提示消失', r.idsMoved.length === 0 && r.ringsMoved === 0, JSON.stringify(r));
    check('只壓到文字不提示', r.idsTextOnly.length === 0, JSON.stringify(r.idsTextOnly));

    check('零 console error', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'RESULT OK (family route collision hint)');
})().catch(err => { console.error(err); process.exit(1); });
