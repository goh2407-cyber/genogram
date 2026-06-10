/**
 * 拖曳即時吸附驗證（Playwright headless，真實 page.mouse pointer 事件）
 * 用法（bash）：NODE_PATH=/c/Users/admin/.cache/pw-smoke/node_modules node refactor/verify_drag.js
 * 截圖輸出：refactor/drag_*.png
 *
 * 驗證項目：
 *  1. 建 4 人（A/B 夫妻 + 子 C/D）資料正確
 *  2a. [literal spec] 拖 D 至 x≈640（C 與 D 原始間距右延伸點）→ 觀察是否出現等距吸附
 *  2b. [extended] 同列有 2 位固定鄰居（C=400, E=520）時拖 D 至 x≈640 → 等距吸附 + 標尺
 *  3. 拖 D 至 C.x±5 內 → 拖曳中 D.x === C.x（即時 X 對齊）
 *  4. 拖 D 至父母中點 (A.x+B.x)/2=480 ±5 → 吸附中點
 *  5. 拖 D 大幅向上越過父母列 → 無 JS error、家系線仍可渲染
 *  6. 每次 pointerup 後 app.dragGuides / canvas.dragGuides === null
 *  7. Ctrl+Z 一次回到拖曳前位置（history 合併未被吸附改壞）
 */
const { chromium } = require('playwright');
const path = require('path');

const results = [];
function record(name, pass, detail) {
    results.push({ name, pass, detail: detail || '' });
    console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}
const shot = (n) => path.join(__dirname, n);

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);
    await page.waitForTimeout(250); // 等 loadAutoSave 的 setTimeout(0)

    // ---------- helpers ----------
    async function toScreen(wx, wy) {
        return page.evaluate(({ wx, wy }) => {
            const c = window.app.canvas;
            const r = c.canvas.getBoundingClientRect();
            return { x: wx * c.scale + c.offsetX + r.left, y: wy * c.scale + c.offsetY + r.top };
        }, { wx, wy });
    }
    async function getP(id) {
        return page.evaluate((id) => {
            const p = window.app.personMap.get(id);
            return p ? { x: p.x, y: p.y, generation: p.generation } : null;
        }, id);
    }
    async function setPos(id, x, y) {
        await page.evaluate(({ id, x, y }) => {
            const p = window.app.personMap.get(id);
            p.x = x; p.y = y;
            window.app.render();
        }, { id, x, y });
    }
    async function getGuides() {
        return page.evaluate(() => {
            const ser = (g) => g ? JSON.parse(JSON.stringify(g)) : null;
            return {
                app: ser(window.app.dragGuides),
                canvas: ser(window.app.canvas.dragGuides),
                sameRef: window.app.dragGuides === window.app.canvas.dragGuides
            };
        });
    }
    // 在世界座標 (wx,wy) 附近 (±win px) 掃描畫布像素，是否有桃紅 #ed1261 系顏色
    async function pinkAt(wx, wy, win = 4) {
        return page.evaluate(({ wx, wy, win }) => {
            const c = window.app.canvas;
            const dpr = window.devicePixelRatio || 1;
            const sx = Math.round((wx * c.scale + c.offsetX) * dpr);
            const sy = Math.round((wy * c.scale + c.offsetY) * dpr);
            const size = 2 * win + 1;
            let d;
            try { d = c.ctx.getImageData(sx - win, sy - win, size, size).data; }
            catch (e) { return { ok: false, err: e.message }; }
            for (let i = 0; i < d.length; i += 4) {
                const r = d[i], g = d[i + 1], b = d[i + 2];
                // #ed1261 = (237,18,97)；容忍與白底的反鋸齒混色：紅明顯高於綠、藍介於其間
                if (r >= 200 && g <= 180 && (r - g) >= 60 && b >= g && b <= 230) {
                    return { ok: true, rgb: [r, g, b] };
                }
            }
            return { ok: false };
        }, { wx, wy, win });
    }
    /**
     * 真實滑鼠拖曳：down 在 id 人物目前中心（螢幕座標），分步 move 到世界座標 toWorld，
     * 放開前回傳 during 狀態（位置/輔助線/截圖），放開後回傳 after 狀態。
     */
    async function drag(id, toWorld, opts = {}) {
        const before = await getP(id);
        const from = await toScreen(before.x, before.y);
        const to = await toScreen(toWorld.x, toWorld.y);
        await page.mouse.move(from.x, from.y, { steps: 4 });
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 16 });
        await page.waitForTimeout(60);
        const during = { pos: await getP(id), guides: await getGuides() };
        if (opts.pinkSamples) {
            during.pink = {};
            for (const [key, [px, py]] of Object.entries(opts.pinkSamples)) {
                during.pink[key] = await pinkAt(px, py);
            }
        }
        if (opts.midShot) await page.screenshot({ path: shot(opts.midShot) });
        await page.mouse.up();
        await page.waitForTimeout(60);
        const after = { pos: await getP(id), guides: await getGuides() };
        if (opts.afterShot) await page.screenshot({ path: shot(opts.afterShot) });
        return { before, during, after };
    }

    const guidesClearedChecks = []; // 測試 6 累積
    const close = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

    // ---------- 1. 建 4 人 ----------
    const ids = await page.evaluate(() => {
        const app = window.app;
        if (app.currentTool !== 'select') app.setTool('select');
        const A = new Person({ x: 400, y: 180, gender: 'male', name: 'A父' });
        const B = new Person({ x: 560, y: 180, gender: 'female', name: 'B母' });
        const C = new Person({ x: 400, y: 420, gender: 'male', name: 'C子' });
        const D = new Person({ x: 520, y: 420, gender: 'male', name: 'D子' });
        app.persons.push(A, B, C, D);
        app._syncPersonMap();
        app.relationships.push(
            new Relationship({ fromPersonId: A.id, toPersonId: B.id, type: 'married' }),
            new Relationship({ fromPersonId: A.id, toPersonId: C.id, type: 'parent-child' }),
            new Relationship({ fromPersonId: B.id, toPersonId: C.id, type: 'parent-child' }),
            new Relationship({ fromPersonId: A.id, toPersonId: D.id, type: 'parent-child' }),
            new Relationship({ fromPersonId: B.id, toPersonId: D.id, type: 'parent-child' })
        );
        app.render();
        return { A: A.id, B: B.id, C: C.id, D: D.id };
    });
    {
        const n = await page.evaluate(() => ({
            persons: window.app.persons.length,
            rels: window.app.relationships.length,
            parentsOfD: window.app.getKinshipEngine().getParentIds(window.app.persons[3].id).length
        }));
        await page.screenshot({ path: shot('drag_00_setup.png') });
        record('1. 建 4 人 + 5 條關係（A/B夫妻，C/D 為子）', n.persons === 4 && n.rels === 5 && n.parentsOfD === 2,
            `persons=${n.persons} rels=${n.rels} D的父母數=${n.parentsOfD}（截圖 drag_00_setup.png）`);
    }

    // ---------- 2a. 兩名子女情境的等距吸附 ----------
    // 語意（2026-06-10 定案）：同列僅剩一位鄰居時，候選為
    //   (1) 鄰居 ± CELL_WIDTH(120) 標準格寬   (2) 手足以父母中點為軸的鏡像位置
    // 故拖 D 至 523 應吸 520（C+120）、拖至 563 應吸 560（鏡像：2*480-400）
    {
        await setPos(ids.D, 700, 420); // 先移開，再拖回吸附點
        const r = await drag(ids.D, { x: 523, y: 421 }, {
            midShot: 'drag_02a_literal_during.png',
            afterShot: 'drag_02a_literal_after.png',
            pinkSamples: { rowY420: [250, 420], colX520: [520, 250] }
        });
        guidesClearedChecks.push(['2a', r.after.guides]);

        const g = r.during.guides.app;
        record('2a. [單鄰居標準格寬] 拖曳中吸附 D.x=520 且有等距標尺', !!(g && g.x && g.spacing) && r.during.pos.x === 520,
            `D.x=${r.during.pos.x} guides=${JSON.stringify(g)}`);
        record('2a. [單鄰居標準格寬] 放開後 D.x 精確 520', close(r.after.pos.x, 520),
            `實際 D=(${r.after.pos.x}, ${r.after.pos.y})`);

        // 手足鏡像：560（父母中點 480 對 C=400 的鏡像；560 同時是母親 X，align 與標尺並存）
        const probe = await page.evaluate(({ D }) => {
            const app = window.app;
            const s = app.computeDragSnap(563, 421, new Set([D]), app.personMap.get(D));
            return JSON.parse(JSON.stringify(s));
        }, { D: ids.D });
        record('2a. [手足鏡像] computeDragSnap(563) 吸附 560 並附 80|80 標尺',
            close(probe.x, 560) && !!(probe.guides && probe.guides.spacing) && probe.guides.spacing.gap === 80,
            `probe=${JSON.stringify(probe)}`);
        await setPos(ids.D, 520, 420); // 還原
    }

    // ---------- 2b. extended：同列 2 位固定鄰居（C=400, E=520），拖 D 至右延伸點 640 ----------
    {
        await setPos(ids.D, 700, 420);
        const Eid = await page.evaluate(() => {
            const app = window.app;
            const E = new Person({ x: 520, y: 420, gender: 'female', name: 'E鄰' });
            app.persons.push(E);
            app.personMap.set(E.id, E);
            app.render();
            return E.id;
        });

        const r = await drag(ids.D, { x: 643, y: 422 }, {
            midShot: 'drag_02b_spacing_during.png',
            afterShot: 'drag_02b_spacing_after.png',
            pinkSamples: { colX640: [640, 250], ruler: [460, 373] }
        });
        guidesClearedChecks.push(['2b', r.after.guides]);

        const g = r.during.guides.app;
        const spacingOK = !!(g && g.x && g.x.kind === 'spacing' && close(g.x.pos, 640, 1e-9)
            && g.spacing && g.spacing.gap === 120
            && JSON.stringify(g.spacing.xs) === JSON.stringify([400, 520, 640]));
        record('2b. [extended] 拖曳中出現等距吸附（kind=spacing, xs=[400,520,640], gap=120）', spacingOK,
            `dragGuides=${JSON.stringify(g)}`);
        record('2b. [extended] 拖曳中 D.x 已即時吸附到 640', r.during.pos.x === 640,
            `拖曳中 D=(${r.during.pos.x}, ${r.during.pos.y})`);
        record('2b. [extended] 桃紅垂直輔助線 + 等距標尺像素存在', !!(r.during.pink.colX640.ok && r.during.pink.ruler.ok),
            `x=640 直線=${JSON.stringify(r.during.pink.colX640)} 標尺(460,373)=${JSON.stringify(r.during.pink.ruler)}（截圖 drag_02b_spacing_during.png）`);
        record('2b. [extended] 放開後 D.x 精確 = 640（誤差<0.01，不被半格 60px grid 拉走）', close(r.after.pos.x, 640) && close(r.after.pos.y, 420),
            `放開後 D=(${r.after.pos.x}, ${r.after.pos.y})；x 若被半格吸附會變 650`);

        // 移除 E、還原 D
        await page.evaluate((Eid) => {
            const app = window.app;
            app.persons = app.persons.filter(p => p.id !== Eid);
            app._syncPersonMap();
            app.render();
        }, Eid);
        await setPos(ids.D, 520, 420);
    }

    // ---------- 3. 拖 D 至 C 正上方（x 對齊 C.x ± 5 內） ----------
    {
        const r = await drag(ids.D, { x: 403, y: 310 }, {
            midShot: 'drag_03_xalign_during.png',
            pinkSamples: { colX400: [400, 540] }
        });
        guidesClearedChecks.push(['3', r.after.guides]);
        const g = r.during.guides.app;
        record('3. 拖曳中 D.x === C.x（400，即時 X 對齊）', r.during.pos.x === 400,
            `拖曳中 D=(${r.during.pos.x}, ${r.during.pos.y})；guides.x=${JSON.stringify(g && g.x)}；` +
            `x=400 桃紅像素=${JSON.stringify(r.during.pink.colX400)}（截圖 drag_03_xalign_during.png）`);
        record('3. 放開後保留精準 X=400（keepAlignedX）', close(r.after.pos.x, 400),
            `放開後 D=(${r.after.pos.x}, ${r.after.pos.y})`);
        await setPos(ids.D, 520, 420);
    }

    // ---------- 4. 拖 D 至父母中點 (400+560)/2 = 480 ± 5 ----------
    {
        const r = await drag(ids.D, { x: 483, y: 416 }, {
            midShot: 'drag_04_parentmid_during.png',
            pinkSamples: { colX480: [480, 250] }
        });
        guidesClearedChecks.push(['4', r.after.guides]);
        const g = r.during.guides.app;
        const kindOK = !!(g && g.x && g.x.kind === 'parent-mid');
        record('4. 拖曳中吸附到父母中點 480（kind=parent-mid）', r.during.pos.x === 480 && kindOK,
            `拖曳中 D=(${r.during.pos.x}, ${r.during.pos.y})；guides.x=${JSON.stringify(g && g.x)}；` +
            `x=480 桃紅像素=${JSON.stringify(r.during.pink.colX480)}（截圖 drag_04_parentmid_during.png）`);
        record('4. 放開後 D.x 精確 = 480', close(r.after.pos.x, 480) && close(r.after.pos.y, 420),
            `放開後 D=(${r.after.pos.x}, ${r.after.pos.y})`);
        await setPos(ids.D, 520, 420);
    }

    // ---------- 5. 大幅向上拖越過父母列，無 JS error、家系線仍渲染 ----------
    {
        const errBefore = errors.length;
        const r = await drag(ids.D, { x: 530, y: 75 }, {
            midShot: 'drag_05_crossgen_during.png',
            afterShot: 'drag_05_crossgen_after.png'
        });
        guidesClearedChecks.push(['5', r.after.guides]);
        const renderOK = await page.evaluate(() => {
            try { window.app.render(); return { ok: true }; }
            catch (e) { return { ok: false, err: e.message }; }
        });
        const errDelta = errors.length - errBefore;
        record('5. 跨輩向上拖曳無 JS error 且家系線可渲染', errDelta === 0 && renderOK.ok,
            `console/page error 新增=${errDelta}${errDelta ? '：' + errors.slice(errBefore).join('; ') : ''}；` +
            `render=${JSON.stringify(renderOK)}；放開後 D=(${r.after.pos.x}, ${r.after.pos.y}) gen=${r.after.pos.generation}` +
            `（截圖 drag_05_crossgen_after.png）`);
        await setPos(ids.D, 520, 420);
    }

    // ---------- 6. 每次 pointerup 後 dragGuides 清為 null ----------
    {
        const bad = guidesClearedChecks.filter(([, g]) => g.app !== null || g.canvas !== null);
        record('6. 所有 pointerup 後 app.dragGuides / canvas.dragGuides === null', bad.length === 0,
            bad.length === 0
                ? `共檢查 ${guidesClearedChecks.length} 次拖曳`
                : '殘留: ' + bad.map(([t, g]) => `${t}:${JSON.stringify(g)}`).join(' / '));
    }

    // ---------- 7. Ctrl+Z 一次回到拖曳前位置 ----------
    {
        const before = await getP(ids.D); // 應為 (520,420)
        const histLenBefore = await page.evaluate(() => window.app.history.undoStack.length);
        const r = await drag(ids.D, { x: 483, y: 416 }); // 有吸附的拖曳（中點 480）
        const histLenAfter = await page.evaluate(() => window.app.history.undoStack.length);
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(100);
        const after = await getP(ids.D);
        await page.screenshot({ path: shot('drag_07_undo_after.png') });
        record('7. 拖曳只 push 一筆 history（合併）', histLenAfter - histLenBefore === 1,
            `undoStack ${histLenBefore} -> ${histLenAfter}`);
        record('7. Ctrl+Z 一次回到拖曳前位置', close(after.x, before.x) && close(after.y, before.y),
            `拖曳前=(${before.x},${before.y}) 放開後=(${r.after.pos.x},${r.after.pos.y}) undo後=(${after.x},${after.y})（截圖 drag_07_undo_after.png）`);
    }

    // ---------- 總結 ----------
    if (errors.length) console.log('\n[console/page errors 全程累計]\n' + errors.join('\n'));
    const failed = results.filter(r => !r.pass);
    console.log('\n===== SUMMARY =====');
    console.log(JSON.stringify({ total: results.length, failed: failed.length, errors }, null, 2));

    await browser.close();
    process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR: ' + (e.stack || e.message)); process.exit(2); });
