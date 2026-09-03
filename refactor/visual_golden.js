/**
 * Golden-image 視覺回歸閘門（Phase 0c）
 *
 * 用途：在動任何「會改 pixel」的程式碼（Phase 1 新符號/線型、Phase 2A 繞線）前後，
 *       渲染一組固定 fixture 截 canvas，與基準圖逐 pixel 比對。任何非預期差異即 FAIL。
 *
 * 用法（需 NODE_PATH 指向含 playwright/pixelmatch/pngjs 的 node_modules）：
 *   建立/更新基準：  NODE_PATH=$HOME/.cache/pw-smoke/node_modules node refactor/visual_golden.js --update
 *   比對（預設）：    NODE_PATH=$HOME/.cache/pw-smoke/node_modules node refactor/visual_golden.js
 *
 * 產出：
 *   refactor/golden/baseline/<name>.png  ← 基準（應 commit）
 *   refactor/golden/current/<name>.png   ← 本次（gitignored）
 *   refactor/golden/diff/<name>.png      ← 差異圖（gitignored，僅在 FAIL 時產生）
 *
 * 注意：文字（中文姓名）渲染依賴本機字型，基準與比對應在同一台機器進行；
 *       跨機器搬基準可能因字型差異產生假差異。
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { PNG } = require('pngjs');
const _pm = require('pixelmatch');
const pixelmatch = _pm.default || _pm;

const UPDATE = process.argv.includes('--update');
const ROOT = path.join(__dirname, 'golden');
const BASE_DIR = path.join(ROOT, 'baseline');
const OUT_DIR = path.join(ROOT, 'current');
const DIFF_DIR = path.join(ROOT, 'diff');
const URL = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const VIEWPORT = { width: 1280, height: 780 };
const THRESHOLD = 0.1;       // pixelmatch 每 pixel 容忍（忽略次像素抗鋸齒雜訊）
const MAX_DIFF_PIXELS = 0;   // 嚴格：任何差異即 FAIL（如出現抗鋸齒雜訊再調高）

// 每個 fixture 的 build 在「瀏覽器內」執行；window.app / Person / Relationship 皆為全域。
const FIXTURES = [
    {
        name: '01-symbols',
        build: () => {
            const app = window.app;
            const mk = (o) => { const p = new Person(o); app.persons.push(p); return p; };
            mk({ x: 200, y: 200, gender: 'male', name: '男', age: 40 });
            mk({ x: 340, y: 200, gender: 'female', name: '女', age: 38 });
            mk({ x: 480, y: 200, gender: 'male', name: '歿', age: 70, isDeceased: true });
            mk({ x: 620, y: 200, gender: 'female', name: '案主', age: 24, isIdentifiedPatient: true });
            mk({ x: 760, y: 200, gender: 'other', name: '其他' });
            mk({ x: 200, y: 380, gender: 'male', name: 'FTM', transgender: 'ftm' });
            mk({ x: 340, y: 380, gender: 'female', name: 'MTF', transgender: 'mtf' });
            mk({ x: 480, y: 380, gender: 'female', name: '取向', sexualOrientation: true });
            mk({
                x: 620, y: 380, gender: 'male', name: '醫療', medical: {
                    topLeft: 'none', topRight: 'none', bottomLeft: 'none', bottomRight: 'none',
                    leftHalf: 'filled', bottomHalf: 'striped', centerSymbol: 'none',
                    isSmoker: false, isObese: false, hasLanguageProblem: false
                }
            });
            app._syncPersonMap();
            app.render();
        }
    },
    {
        name: '02-marriage',
        build: () => {
            const app = window.app;
            const types = ['married', 'engaged', 'cohabiting', 'separated', 'divorced', 'widowed', 'affair'];
            let y = 120;
            types.forEach(t => {
                const a = new Person({ x: 380, y, gender: 'male' });
                const b = new Person({ x: 580, y, gender: 'female' });
                app.persons.push(a, b);
                app.relationships.push(new Relationship({ fromPersonId: a.id, toPersonId: b.id, type: t }));
                y += 88;
            });
            app._syncPersonMap();
            app.render();
        }
    },
    {
        name: '03-family-trunk',
        build: () => {
            const app = window.app;
            const dad = new Person({ x: 430, y: 160, gender: 'male', name: '父' });
            const mom = new Person({ x: 610, y: 160, gender: 'female', name: '母' });
            const c1 = new Person({ x: 360, y: 380, gender: 'male', name: '長子' });
            const c2 = new Person({ x: 500, y: 380, gender: 'female', name: '次女' });
            const t1 = new Person({ x: 630, y: 380, gender: 'male', name: '雙生A', twinGroup: 'tw1' });
            const t2 = new Person({ x: 710, y: 380, gender: 'female', name: '雙生B', twinGroup: 'tw1' });
            app.persons.push(dad, mom, c1, c2, t1, t2);
            app._syncPersonMap();
            app.relationships.push(new Relationship({ fromPersonId: dad.id, toPersonId: mom.id, type: 'married' }));
            [c1, c2, t1, t2].forEach(c => {
                app.relationships.push(new Relationship({ fromPersonId: dad.id, toPersonId: c.id, type: 'parent-child' }));
                app.relationships.push(new Relationship({ fromPersonId: mom.id, toPersonId: c.id, type: 'parent-child' }));
            });
            app._syncPersonMap();
            app.render();
        }
    },
    {
        name: '04-multi-marriage',
        build: () => {
            const app = window.app;
            const man = new Person({ x: 560, y: 220, gender: 'male', name: '本人' });
            const w1 = new Person({ x: 360, y: 220, gender: 'female', name: '前妻' });
            const w2 = new Person({ x: 760, y: 220, gender: 'female', name: '現任' });
            app.persons.push(man, w1, w2);
            app._syncPersonMap();
            // 明確日期：固定天橋排序（舊→架高、新→直線），否則無日期時排序會 fallback 到隨機 id → fixture 不穩定
            const r1 = new Relationship({ fromPersonId: w1.id, toPersonId: man.id, type: 'divorced' });
            r1.date = '2000-01-01';
            const r2 = new Relationship({ fromPersonId: man.id, toPersonId: w2.id, type: 'married' });
            r2.date = '2015-06-01';
            app.relationships.push(r1, r2);
            app._syncPersonMap();
            app.render();
        }
    },
    {
        name: '05-emotional',
        build: () => {
            const app = window.app;
            const types = ['close', 'very-close', 'harmony', 'love', 'conflict', 'hate', 'cutoff', 'hostile'];
            let y = 110;
            types.forEach(t => {
                const a = new Person({ x: 380, y, gender: 'male' });
                const b = new Person({ x: 580, y, gender: 'female' });
                app.persons.push(a, b);
                app.relationships.push(new Relationship({ fromPersonId: a.id, toPersonId: b.id, type: t }));
                y += 80;
            });
            app._syncPersonMap();
            app.render();
        }
    },
    {
        name: '06-abuse',
        build: () => {
            const app = window.app;
            const types = ['physical-abuse', 'emotional-abuse', 'sexual-abuse', 'violence', 'neglect'];
            let y = 140;
            types.forEach(t => {
                const a = new Person({ x: 360, y, gender: 'male' });
                const b = new Person({ x: 620, y, gender: 'female' });
                app.persons.push(a, b);
                app.relationships.push(new Relationship({ fromPersonId: a.id, toPersonId: b.id, type: t }));
                y += 110;
            });
            app._syncPersonMap();
            app.render();
        }
    },
    {
        name: '07-compound',
        build: () => {
            const app = window.app;
            const types = ['close-hostile', 'fused-hostile', 'conflict-close'];
            let y = 180;
            types.forEach(t => {
                const a = new Person({ x: 360, y, gender: 'male' });
                const b = new Person({ x: 640, y, gender: 'female' });
                app.persons.push(a, b);
                app.relationships.push(new Relationship({ fromPersonId: a.id, toPersonId: b.id, type: t }));
                y += 170;
            });
            app._syncPersonMap();
            app.render();
        }
    },
    {
        name: '08-child-links',
        build: () => {
            const app = window.app;
            const dad = new Person({ x: 430, y: 160, gender: 'male', name: '父' });
            const mom = new Person({ x: 610, y: 160, gender: 'female', name: '母' });
            const bio = new Person({ x: 360, y: 400, gender: 'male', name: '親生' });
            const ado = new Person({ x: 520, y: 400, gender: 'female', name: '收養' });
            const fos = new Person({ x: 680, y: 400, gender: 'male', name: '寄養' });
            app.persons.push(dad, mom, bio, ado, fos);
            app._syncPersonMap();
            app.relationships.push(new Relationship({ fromPersonId: dad.id, toPersonId: mom.id, type: 'married' }));
            const mk = (parent, child, linkType) => {
                const r = new Relationship({ fromPersonId: parent.id, toPersonId: child.id, type: 'parent-child' });
                r.linkType = linkType;
                app.relationships.push(r);
            };
            mk(dad, bio, 'biological'); mk(mom, bio, 'biological');
            mk(dad, ado, 'adopted'); mk(mom, ado, 'adopted');
            mk(dad, fos, 'foster'); mk(mom, fos, 'foster');
            app._syncPersonMap();
            app.render();
        }
    },
    {
        name: '09-twins',
        build: () => {
            const app = window.app;
            // 左：異卵雙胞胎（無連接橫桿）
            const d1 = new Person({ x: 240, y: 170, gender: 'male', name: '父' });
            const m1 = new Person({ x: 400, y: 170, gender: 'female', name: '母' });
            const za = new Person({ x: 260, y: 410, gender: 'male', name: '異卵A', twinGroup: 'dz' });
            const zb = new Person({ x: 380, y: 410, gender: 'female', name: '異卵B', twinGroup: 'dz' });
            // 右：同卵雙胞胎（有連接橫桿）
            const d2 = new Person({ x: 720, y: 170, gender: 'male', name: '父' });
            const m2 = new Person({ x: 880, y: 170, gender: 'female', name: '母' });
            const ma = new Person({ x: 740, y: 410, gender: 'male', name: '同卵A', twinGroup: 'mz', zygosity: 'mono' });
            const mb = new Person({ x: 860, y: 410, gender: 'male', name: '同卵B', twinGroup: 'mz', zygosity: 'mono' });
            app.persons.push(d1, m1, za, zb, d2, m2, ma, mb);
            app._syncPersonMap();
            const pc = (p, ch) => app.relationships.push(new Relationship({ fromPersonId: p.id, toPersonId: ch.id, type: 'parent-child' }));
            app.relationships.push(new Relationship({ fromPersonId: d1.id, toPersonId: m1.id, type: 'married' }));
            app.relationships.push(new Relationship({ fromPersonId: d2.id, toPersonId: m2.id, type: 'married' }));
            [za, zb].forEach(ch => { pc(d1, ch); pc(m1, ch); });
            [ma, mb].forEach(ch => { pc(d2, ch); pc(m2, ch); });
            app._syncPersonMap();
            app.render();
        }
    },
    {
        name: '10-loss',
        build: () => {
            const app = window.app;
            const dad = new Person({ x: 380, y: 160, gender: 'male', name: '父' });
            const mom = new Person({ x: 560, y: 160, gender: 'female', name: '母' });
            const preg = new Person({ x: 300, y: 410, gender: 'pregnancy', name: '懷孕' });
            const mis = new Person({ x: 460, y: 410, gender: 'female', name: '流產', lossType: 'miscarriage' });
            const abo = new Person({ x: 620, y: 410, gender: 'male', name: '人工流產', lossType: 'abortion' });
            app.persons.push(dad, mom, preg, mis, abo);
            app._syncPersonMap();
            app.relationships.push(new Relationship({ fromPersonId: dad.id, toPersonId: mom.id, type: 'married' }));
            [preg, mis, abo].forEach(c => {
                app.relationships.push(new Relationship({ fromPersonId: dad.id, toPersonId: c.id, type: 'parent-child' }));
                app.relationships.push(new Relationship({ fromPersonId: mom.id, toPersonId: c.id, type: 'parent-child' }));
            });
            app._syncPersonMap();
            app.render();
        }
    },
    {
        name: '11-marriage-offset',
        build: () => {
            const app = window.app;
            // 配偶不同列（一高一低）→ 正交繞線取代斜線
            const a = new Person({ x: 340, y: 200, gender: 'male', name: '夫' });
            const b = new Person({ x: 640, y: 340, gender: 'female', name: '妻' });
            // 第二對：非並排 + 離婚（驗裝飾落在正交路徑垂直段中點）
            const c = new Person({ x: 340, y: 500, gender: 'male', name: '前夫' });
            const d = new Person({ x: 660, y: 600, gender: 'female', name: '前妻' });
            app.persons.push(a, b, c, d);
            app._syncPersonMap();
            app.relationships.push(new Relationship({ fromPersonId: a.id, toPersonId: b.id, type: 'married' }));
            app.relationships.push(new Relationship({ fromPersonId: c.id, toPersonId: d.id, type: 'divorced' }));
            app._syncPersonMap();
            app.render();
        }
    },
    {
        name: '12-child-links-single',
        build: () => {
            const app = window.app;
            // 單親 → 單一子女：整條下行線都應套用線型（寄養點線 / 收養虛線）
            const p1 = new Person({ x: 280, y: 200, gender: 'male', name: '父' });
            const c1 = new Person({ x: 280, y: 430, gender: 'female', name: '寄養' });
            const p2 = new Person({ x: 560, y: 200, gender: 'male', name: '父' });
            const c2 = new Person({ x: 560, y: 430, gender: 'female', name: '收養' });
            app.persons.push(p1, c1, p2, c2);
            app._syncPersonMap();
            const mk = (p, c, lk) => { const r = new Relationship({ fromPersonId: p.id, toPersonId: c.id, type: 'parent-child' }); r.linkType = lk; app.relationships.push(r); };
            mk(p1, c1, 'foster');
            mk(p2, c2, 'adopted');
            app._syncPersonMap();
            app.render();
        }
    },
    {
        // [F-1 / Phase 2A.2 重現] 本人＝上代夫妻的小孩 + 本人有兩段婚姻（離婚+現任）
        // → 父母下行線 與 本人離婚天橋 共用同一垂直走廊 = 疊線（待修）
        name: '13-multimarriage-overlap',
        build: () => {
            const app = window.app;
            const gf = new Person({ x: 380, y: 140, gender: 'male', name: '祖父' });
            const gm = new Person({ x: 560, y: 140, gender: 'female', name: '祖母' });
            const man = new Person({ x: 560, y: 420, gender: 'male', name: '本人' });
            const ex = new Person({ x: 380, y: 420, gender: 'female', name: '前妻' });
            const cur = new Person({ x: 760, y: 420, gender: 'female', name: '現任' });
            app.persons.push(gf, gm, man, ex, cur);
            app._syncPersonMap();
            app.relationships.push(new Relationship({ fromPersonId: gf.id, toPersonId: gm.id, type: 'married' }));
            app.relationships.push(new Relationship({ fromPersonId: gf.id, toPersonId: man.id, type: 'parent-child' }));
            app.relationships.push(new Relationship({ fromPersonId: gm.id, toPersonId: man.id, type: 'parent-child' }));
            const r1 = new Relationship({ fromPersonId: ex.id, toPersonId: man.id, type: 'divorced' }); r1.date = '2000-01-01';
            const r2 = new Relationship({ fromPersonId: man.id, toPersonId: cur.id, type: 'married' }); r2.date = '2015-01-01';
            app.relationships.push(r1, r2);
            app._syncPersonMap();
            app.render();
        }
    },
    {
        // [F-1 完整複雜] 本人＝上代夫妻的小孩 + 兩段婚姻、每段各有子女 → 父母下行 + 兩婚天橋 + 兩組子女下行全擠
        name: '14-multimarriage-full',
        build: () => {
            const app = window.app;
            const gf = new Person({ x: 520, y: 110, gender: 'male', name: '祖父' });
            const gm = new Person({ x: 700, y: 110, gender: 'female', name: '祖母' });
            const man = new Person({ x: 610, y: 380, gender: 'male', name: '本人' });
            const ex = new Person({ x: 380, y: 380, gender: 'female', name: '前妻' });
            const cur = new Person({ x: 840, y: 380, gender: 'female', name: '現任' });
            const k1 = new Person({ x: 430, y: 630, gender: 'male', name: '長子' });
            const k2 = new Person({ x: 780, y: 630, gender: 'female', name: '幼女' });
            app.persons.push(gf, gm, man, ex, cur, k1, k2);
            app._syncPersonMap();
            const m = (a, b, t, d) => { const r = new Relationship({ fromPersonId: a.id, toPersonId: b.id, type: t }); if (d) r.date = d; app.relationships.push(r); };
            const pc = (p, c) => app.relationships.push(new Relationship({ fromPersonId: p.id, toPersonId: c.id, type: 'parent-child' }));
            m(gf, gm, 'married');
            pc(gf, man); pc(gm, man);
            m(ex, man, 'divorced', '2000-01-01');
            m(man, cur, 'married', '2015-01-01');
            pc(ex, k1); pc(man, k1);
            pc(man, k2); pc(cur, k2);
            app._syncPersonMap();
            app.render();
        }
    },
    {
        // [F-1 最大複雜度] 父母 + 本人 + 手足(同胞) + 兩段婚姻 + 各段子女 —— 同列同時有「手足」與「配偶」競爭空間
        name: '15-maximal',
        build: () => {
            const app = window.app;
            const gf = new Person({ x: 560, y: 110, gender: 'male', name: '祖父' });
            const gm = new Person({ x: 740, y: 110, gender: 'female', name: '祖母' });
            const man = new Person({ x: 560, y: 380, gender: 'male', name: '本人' });
            const sib = new Person({ x: 740, y: 380, gender: 'female', name: '手足' });
            const ex = new Person({ x: 360, y: 380, gender: 'female', name: '前妻' });
            const cur = new Person({ x: 920, y: 380, gender: 'female', name: '現任' });
            const k1 = new Person({ x: 430, y: 620, gender: 'male', name: '長子' });
            const k2 = new Person({ x: 660, y: 620, gender: 'female', name: '幼女' });
            app.persons.push(gf, gm, man, sib, ex, cur, k1, k2);
            app._syncPersonMap();
            const m = (a, b, t, d) => { const r = new Relationship({ fromPersonId: a.id, toPersonId: b.id, type: t }); if (d) r.date = d; app.relationships.push(r); };
            const pc = (p, c) => app.relationships.push(new Relationship({ fromPersonId: p.id, toPersonId: c.id, type: 'parent-child' }));
            m(gf, gm, 'married');
            pc(gf, man); pc(gm, man); pc(gf, sib); pc(gm, sib);
            m(ex, man, 'divorced', '2000-01-01');
            m(man, cur, 'married', '2015-01-01');
            pc(ex, k1); pc(man, k1);
            pc(man, k2); pc(cur, k2);
            app._syncPersonMap();
            app.render();
        }
    },
    {
        // [F-1 完整多家族] 本人原生家庭 + 兩段婚姻；每位配偶各自帶「自己的父母 + 自己的手足」+ 各段子女
        name: '16-multifamily',
        build: () => {
            const app = window.app;
            // 本人原生家庭
            const gf = new Person({ x: 540, y: 110, gender: 'male', name: '祖父' });
            const gm = new Person({ x: 660, y: 110, gender: 'female', name: '祖母' });
            const man = new Person({ x: 540, y: 380, gender: 'male', name: '本人' });
            const sib = new Person({ x: 660, y: 380, gender: 'female', name: '本人手足' });
            // 前妻 + 她的原生家庭（左側）
            const ex = new Person({ x: 240, y: 380, gender: 'female', name: '前妻' });
            const exF = new Person({ x: 180, y: 110, gender: 'male', name: '前妻父' });
            const exM = new Person({ x: 300, y: 110, gender: 'female', name: '前妻母' });
            const exSib = new Person({ x: 360, y: 380, gender: 'male', name: '前妻手足' });
            // 現任 + 她的原生家庭（右側）
            const cur = new Person({ x: 900, y: 380, gender: 'female', name: '現任' });
            const curF = new Person({ x: 840, y: 110, gender: 'male', name: '現任父' });
            const curM = new Person({ x: 960, y: 110, gender: 'female', name: '現任母' });
            const curSib = new Person({ x: 780, y: 380, gender: 'male', name: '現任手足' });
            // 各段子女
            const k1 = new Person({ x: 360, y: 620, gender: 'male', name: '長子' });
            const k2 = new Person({ x: 720, y: 620, gender: 'female', name: '幼女' });
            app.persons.push(gf, gm, man, sib, ex, exF, exM, exSib, cur, curF, curM, curSib, k1, k2);
            app._syncPersonMap();
            const m = (a, b, t, d) => { const r = new Relationship({ fromPersonId: a.id, toPersonId: b.id, type: t }); if (d) r.date = d; app.relationships.push(r); };
            const pc = (p, c) => app.relationships.push(new Relationship({ fromPersonId: p.id, toPersonId: c.id, type: 'parent-child' }));
            m(gf, gm, 'married'); pc(gf, man); pc(gm, man); pc(gf, sib); pc(gm, sib);
            m(exF, exM, 'married'); pc(exF, ex); pc(exM, ex); pc(exF, exSib); pc(exM, exSib);
            m(curF, curM, 'married'); pc(curF, cur); pc(curM, cur); pc(curF, curSib); pc(curM, curSib);
            m(ex, man, 'divorced', '2000-01-01');
            m(man, cur, 'married', '2015-01-01');
            pc(ex, k1); pc(man, k1);
            pc(man, k2); pc(cur, k2);
            app._syncPersonMap();
            app.render();
        }
    }
];

(async () => {
    for (const d of [BASE_DIR, OUT_DIR, DIFF_DIR]) fs.mkdirSync(d, { recursive: true });

    const browser = await chromium.launch();
    const results = [];
    if (!UPDATE) {
        const expectedBaselines = FIXTURES.map(fx => `${fx.name}.png`).sort();
        const actualBaselines = fs.readdirSync(BASE_DIR).filter(name => name.endsWith('.png')).sort();
        if (JSON.stringify(actualBaselines) !== JSON.stringify(expectedBaselines)) {
            results.push({ name: 'baseline-set', status: 'BASELINE-SET-MISMATCH', errors: [],
                note: `expected=${expectedBaselines.join(',')} actual=${actualBaselines.join(',')}` });
        }
    }

    for (const fx of FIXTURES) {
        const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', e => errors.push('pageerror: ' + e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

        await page.goto(URL);
        await page.waitForFunction(() => window.app && window.app.canvas);
        await page.waitForTimeout(50);
        await page.waitForFunction(() => window.app.isLoading === false);
        await page.evaluate(fx.build);
        await page.evaluate(() => {
            const fitView = document.getElementById('fitView');
            if (fitView) fitView.style.display = 'none';
            // 狀態膠囊屬 UI chrome（由 verify_status_ux 獨立驗證），與 Fit 鈕同樣排除，
            // 否則任何提示文字/位置改動都會讓 16 張 golden 全部假陽性。
            const statusBar = document.getElementById('statusBar');
            if (statusBar) statusBar.style.display = 'none';
        });
        await page.waitForTimeout(150);
        const buf = await page.locator('#genogramCanvas').screenshot();
        await page.close();

        fs.writeFileSync(path.join(OUT_DIR, fx.name + '.png'), buf);
        const basePath = path.join(BASE_DIR, fx.name + '.png');

        if (UPDATE) {
            fs.writeFileSync(basePath, buf);
            results.push({ name: fx.name, status: 'updated', errors });
            continue;
        }
        if (!fs.existsSync(basePath)) {
            results.push({ name: fx.name, status: 'MISSING-BASELINE', errors });
            continue;
        }

        const cur = PNG.sync.read(buf);
        const base = PNG.sync.read(fs.readFileSync(basePath));
        if (cur.width !== base.width || cur.height !== base.height) {
            results.push({ name: fx.name, status: 'SIZE-MISMATCH', errors, note: `${base.width}x${base.height} -> ${cur.width}x${cur.height}` });
            continue;
        }
        const diff = new PNG({ width: base.width, height: base.height });
        const n = pixelmatch(base.data, cur.data, diff.data, base.width, base.height, { threshold: THRESHOLD });
        if (n > MAX_DIFF_PIXELS) {
            fs.writeFileSync(path.join(DIFF_DIR, fx.name + '.png'), PNG.sync.write(diff));
            results.push({ name: fx.name, status: 'DIFF', diffPixels: n, errors });
        } else {
            results.push({ name: fx.name, status: 'ok', diffPixels: n, errors });
        }
    }

    await browser.close();

    let fail = 0;
    for (const r of results) {
        const errNote = r.errors && r.errors.length ? ` [console-errors:${r.errors.length}]` : '';
        const dpx = r.diffPixels !== undefined ? ` diffPixels=${r.diffPixels}` : '';
        const note = r.note ? ` (${r.note})` : '';
        const bad = r.status === 'DIFF' || r.status === 'SIZE-MISMATCH' || r.status === 'MISSING-BASELINE'
            || r.status === 'BASELINE-SET-MISMATCH' || (r.errors && r.errors.length);
        if (bad) fail++;
        console.log(`${bad ? 'FAIL' : r.status.toUpperCase()} | ${r.name}${dpx}${note}${errNote}`);
    }
    console.log(`\n===== GOLDEN ${UPDATE ? '(UPDATE MODE)' : ''} ===== fixtures=${results.length} failed=${fail}`);
    process.exit(fail ? 1 : 0);
})();
