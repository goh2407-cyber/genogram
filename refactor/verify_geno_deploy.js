/**
 * geno 部署資料夾「離線可用」驗證：封鎖所有 http(s) 請求，載入 geno/index.html，
 * 確認字體/vendored 函式庫皆本地載入、可建家庭、0 console error、無外部請求。
 * 用法：NODE_PATH=$HOME/.cache/pw-smoke/node_modules node refactor/verify_geno_deploy.js
 */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const errors = [];
    const externalReqs = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    // 封鎖一切外部網路（http/https）→ 證明完全不依賴外部
    await page.route('**/*', route => {
        const u = route.request().url();
        if (u.startsWith('http://') || u.startsWith('https://')) {
            externalReqs.push(u);
            return route.abort();
        }
        return route.continue();
    });

    const folder = process.argv[2] || 'geno'; // 可指定部署資料夾名（預設 geno）
    const url = 'file:///' + path.resolve(__dirname, '..', folder, 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas, { timeout: 15000 });

    const r = await page.evaluate(async () => {
        const app = window.app;
        // 本地函式庫
        const hasLayout = typeof GenogramLayout !== 'undefined' && typeof window.dagre === 'undefined'; // layout engine is in-house since 2026-09-03
        const hasJspdf = (typeof window.jspdf !== 'undefined') || (typeof window.jsPDF !== 'undefined');
        // 字體（嘗試載入 Noto Sans TC）
        let fontOk = false;
        try { await document.fonts.load('16px "Noto Sans TC"'); fontOk = document.fonts.check('16px "Noto Sans TC"'); } catch (e) { }
        // 建小家庭並 render
        const H = new Person({ id: 'H', x: 380, y: 300, gender: 'male', name: '父' });
        const W = new Person({ id: 'W', x: 600, y: 300, gender: 'female', name: '母' });
        const C = new Person({ id: 'C', x: 490, y: 480, gender: 'female', name: '女' });
        app.persons = [H, W, C]; app._syncPersonMap();
        app.relationships = [
            new Relationship({ id: 'm', fromPersonId: 'H', toPersonId: 'W', type: 'married' }),
            new Relationship({ id: 'p1', fromPersonId: 'H', toPersonId: 'C', type: 'parent-child' }),
            new Relationship({ id: 'p2', fromPersonId: 'W', toPersonId: 'C', type: 'parent-child' }),
        ];
        app._syncPersonMap(); app.render();
        return { hasLayout, hasJspdf, fontOk, persons: app.persons.length };
    });

    await page.screenshot({ path: path.join(__dirname, 'golden', 'current', '_geno_smoke.png') });
    await browser.close();

    const out = [];
    const ck = (n, c, d) => out.push(`${c ? 'PASS' : 'FAIL'} | ${n}${c ? '' : ' — ' + d}`);
    ck('geno 載入後 window.app 就緒', r.persons === 3, 'persons=' + r.persons);
    ck('layout engine in-house (GenogramLayout loaded, no dagre)', r.hasLayout, 'hasLayout=' + r.hasLayout);
    ck('jspdf 本地載入（window.jspdf）', r.hasJspdf, 'hasJspdf=' + r.hasJspdf);
    ck('Noto Sans TC 本地字體可用', r.fontOk, 'fontOk=' + r.fontOk);
    ck('封鎖外部後仍 0 console/page error', errors.length === 0, errors.join(' | '));
    ck('完全沒有外部網路請求（http/https）', externalReqs.length === 0, '外連=' + JSON.stringify(externalReqs));

    out.forEach(l => console.log(l));
    console.log(out.some(l => l.startsWith('FAIL')) ? 'RESULT FAIL' : 'RESULT OK (geno 離線可部署)');
    process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
})();
