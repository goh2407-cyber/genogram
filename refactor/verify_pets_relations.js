/**
 * 2026-10-13 新功能回歸：
 *  1. 前任關係（ex-partner）：虛線＋單斜線、屬伴侶類、圖例與按鈕
 *  2. 寵物（gender 'pet'＋petType 菱形／貓／狗／鳥／魚）：存檔、彈窗建立、屬性面板、不顯示快速鈕
 *  3. 家人不能結婚：手足、三親等、四親等、寵物擋下並跳提示；無血緣可建立
 *  4. 關係線提起／放下動畫：選取 lift、取消 settle 後清除、新建 drop、匯出不套用
 */
const { openApp, createChecks, finish } = require('./contract_harness');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();

    // ── 1. 前任關係 ──
    const ex = await page.evaluate(() => {
        const style = Relationship.prototype.getLineStyle.call({ type: 'ex-partner' });
        const legend = Relationship.LEGEND_SECTIONS.find(s => s.id === 'family').entries.map(e => e.type);
        return {
            style, category: Relationship.getCategory('ex-partner'), name: Relationship.getTypeName('ex-partner'),
            legend: legend.includes('ex-partner'), button: !!document.querySelector('.rel-btn[data-type="ex-partner"] .legend-line.ex-partner'),
            css: getComputedStyle(document.querySelector('.rel-btn[data-type="ex-partner"] .legend-line')).backgroundImage.includes('svg')
        };
    });
    check('前任關係：虛線＋單斜線、黑色', ex.style.pattern === 'dashed' && ex.style.decoration === 'single-slash' && ex.style.color === '#333333', JSON.stringify(ex.style));
    check('前任關係：伴侶類、名稱、圖例、選擇按鈕', ex.category === 'marriage' && ex.name === '前任關係' && ex.legend && ex.button && ex.css, JSON.stringify(ex));

    // ── 2. 寵物 ──
    const pet = await page.evaluate(() => {
        const out = {};
        const cat = new Person({ gender: 'pet', petType: 'cat' });
        const weird = new Person({ gender: 'pet', petType: 'dragon' });
        const human = new Person({ gender: 'male', petType: 'cat' });
        out.normalize = cat.petType === 'cat' && weird.petType === 'diamond' && human.petType === null;
        out.json = cat.toJSON().petType === 'cat' && !('petType' in human.toJSON());
        out.roundtrip = new Person(cat.toJSON()).petType === 'cat';
        const app = window.app;
        app.loadData({ version: '1.1', persons: Person.PET_TYPES.map((t, i) => ({ id: 'pet' + i, name: t, gender: 'pet', petType: t, x: 160 + i * 120, y: 200 })), relationships: [] });
        app.canvas.scale = 1; app.canvas.offsetX = 0; app.canvas.offsetY = 0;
        app.render();
        out.drawn = true;
        // 寵物不顯示年齡：畫布不畫、屬性面板隱藏年齡列
        app.personMap.get('pet1').age = 7;
        const texts = []; const orig = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) { texts.push(String(t)); return orig.call(this, t, ...rest); };
        app.render();
        CanvasRenderingContext2D.prototype.fillText = orig;
        out.noAgeDrawn = !texts.includes('7');
        app.selectPerson('pet1'); app.render();
        out.noAgeField = getComputedStyle(document.getElementById('personAge').closest('.form-group-row')).display === 'none';
        app.clearAllSelections(); app.render();
        out.noQuick = app.canvas.getQuickButtonLayout(app.personMap.get('pet1')).length === 0;
        app.selectPerson('pet2'); app.render();
        out.panel = !document.getElementById('petTypeGroup').hidden && document.getElementById('personPetType').value === 'dog' // PET_TYPES[2] = dog
            && document.getElementById('personGender').value === 'pet';
        const sel = document.getElementById('personPetType');
        sel.value = 'fish'; sel.dispatchEvent(new Event('change', { bubbles: true }));
        out.panelChange = app.personMap.get('pet2').petType === 'fish';
        const g = document.getElementById('personGender');
        g.value = 'female'; g.dispatchEvent(new Event('change', { bubbles: true }));
        out.genderOff = app.personMap.get('pet2').petType === null && document.getElementById('petTypeGroup').hidden;
        app.clearAllSelections(); app.render();
        return out;
    });
    check('寵物：種類正規化（未知→菱形、人類沒有種類）', pet.normalize);
    check('寵物：只有寵物存 petType、可讀回', pet.json && pet.roundtrip);
    check('寵物：五種外形都畫得出來', pet.drawn);
    check('寵物：沒有快速新增鈕', pet.noQuick);
    check('寵物：不顯示年齡（畫布、屬性面板）', pet.noAgeDrawn && pet.noAgeField, JSON.stringify(pet));
    check('寵物：屬性面板顯示種類並可修改；改回人類時清掉', pet.panel && pet.panelChange && pet.genderOff, JSON.stringify(pet));

    await page.evaluate(() => { const app = window.app; app.loadData({ version: '1.1', persons: [], relationships: [] }); app.showGenderModal('parent'); });
    await page.locator('.gender-btn--pet[data-pet="dog"]').click();
    await wait(200);
    const viaModal = await page.evaluate(() => { const app = window.app; if (app.placementSession) app.commitPlacement(); return app.persons.map(p => p.gender + ':' + p.petType).join(','); });
    check('寵物：彈窗選「狗」建立寵物', viaModal === 'pet:dog', viaModal);
    const modalIcons = await page.evaluate(() => [...document.querySelectorAll('.gender-btn--pet')].map(b => b.dataset.pet).join(','));
    check('寵物：彈窗有貓／狗／鳥／魚／其他', modalIcons === 'cat,dog,bird,fish,diamond', modalIcons);

    // ── 3. 家人不能結婚 ──
    const kin = await page.evaluate(() => {
        const app = window.app;
        // 祖父母 → A、B（手足）；A → a1；B → b1（a1、b1 堂表）；U 無血緣；P 寵物。全部放同一列以排除「不同輩分」規則
        app.loadData({ version: '1.1', persons: [
            { id: 'gf', gender: 'male', x: 100, y: 0 }, { id: 'gm', gender: 'female', x: 220, y: 0 },
            { id: 'A', gender: 'male', x: 100, y: 300 }, { id: 'B', gender: 'female', x: 220, y: 300 },
            { id: 'a1', gender: 'male', x: 340, y: 300 }, { id: 'b1', gender: 'female', x: 460, y: 300 },
            { id: 'U', gender: 'female', x: 580, y: 300 }, { id: 'P', gender: 'pet', petType: 'cat', x: 700, y: 300 }
        ], relationships: [
            { id: 'r1', fromPersonId: 'gf', toPersonId: 'A', type: 'parent-child' }, { id: 'r2', fromPersonId: 'gm', toPersonId: 'A', type: 'parent-child' },
            { id: 'r3', fromPersonId: 'gf', toPersonId: 'B', type: 'parent-child' }, { id: 'r4', fromPersonId: 'gm', toPersonId: 'B', type: 'parent-child' },
            { id: 'r5', fromPersonId: 'A', toPersonId: 'a1', type: 'parent-child' }, { id: 'r6', fromPersonId: 'B', toPersonId: 'b1', type: 'parent-child' }
        ] });
        const v = (x, y) => app.validateMarriageRelationship(app.personMap.get(x), app.personMap.get(y));
        return {
            siblings: v('A', 'B'), uncle: v('A', 'b1'), cousins: v('a1', 'b1'), pet: v('U', 'P'), ok: v('a1', 'U'),
            deg: [app.collateralKinshipDegree('A', 'B'), app.collateralKinshipDegree('A', 'b1'), app.collateralKinshipDegree('a1', 'b1'), app.collateralKinshipDegree('a1', 'U')]
        };
    });
    check('親等計算：手足 2、叔姪 3、堂表 4、無血緣 null', JSON.stringify(kin.deg) === '[2,3,4,null]', JSON.stringify(kin.deg));
    check('不能結婚：手足', !kin.siblings.valid);
    check('不能結婚：叔伯姑舅姨與姪甥（3 親等）', !kin.uncle.valid && /3 親等/.test(kin.uncle.message), kin.uncle.message);
    check('不能結婚：堂表兄弟姊妹（4 親等）', !kin.cousins.valid && /4 親等/.test(kin.cousins.message), kin.cousins.message);
    check('不能結婚：寵物', !kin.pet.valid && /寵物/.test(kin.pet.message), kin.pet.message);
    check('無血緣可以建立伴侶關係', kin.ok.valid, kin.ok.message);

    const blocked = await page.evaluate(() => {
        const app = window.app;
        const before = app.relationships.length;
        app.connectingFrom = { person: app.personMap.get('a1') }; app.connectingTo = app.personMap.get('b1');
        app.createRelationship('married');
        const m = app.elements.confirmModal;
        const shown = m && getComputedStyle(m).display !== 'none' && !m.hidden && /不能建立伴侶關係/.test(m.textContent);
        return { added: app.relationships.length - before, shown };
    });
    check('建立被擋：沒有新增關係、跳出提示', blocked.added === 0 && blocked.shown, JSON.stringify(blocked));
    await page.getByRole('button', { name: '知道了' }).click();

    // ── 3b. 寵物的親子規則 ──
    const petKin = await page.evaluate(() => {
        const app = window.app;
        app.loadData({ version: '1.1', persons: [
            { id: 'cat1', gender: 'pet', petType: 'cat', x: 100, y: 100 }, { id: 'cat2', gender: 'pet', petType: 'cat', x: 100, y: 300 },
            { id: 'mom', gender: 'female', x: 300, y: 300 }, { id: 'kid', gender: 'male', x: 300, y: 500 }
        ], relationships: [] });
        const make = (a, b) => { app.connectingFrom = { person: app.personMap.get(a) }; app.connectingTo = app.personMap.get(b); app.createRelationship('parent-child', 'adopted'); };
        const n0 = app.relationships.length;
        make('cat1', 'cat2');
        const petPetBlocked = app.relationships.length === n0;
        const m = app.elements.confirmModal;
        const dialog = m && getComputedStyle(m).display !== 'none' && /寵物之間不能有親子或收養關係/.test(m.textContent);
        app._resolveConfirm?.(true); app.modalManager?.close?.(m);
        // 寵物畫在人的上方也一樣：建立後寵物在子女端
        make('cat1', 'kid');
        const r = app.relationships[app.relationships.length - 1];
        const petIsChild = r && r.type === 'parent-child' && r.fromPersonId === 'kid' && r.toPersonId === 'cat1';
        // 新增成員自動連線：選了寵物再加「子女」→ 不會把寵物當父母
        const allowed = app.isPreviewRelationshipAllowed({ type: 'parent-child', fromPersonId: 'cat2', toPersonId: 'kid' });
        const allowedHuman = app.isPreviewRelationshipAllowed({ type: 'parent-child', fromPersonId: 'mom', toPersonId: 'cat2' });
        const petCouple = app.isPreviewRelationshipAllowed({ type: 'married', fromPersonId: 'mom', toPersonId: 'cat2' });
        return { petPetBlocked, dialog, petIsChild, previewPetParent: allowed, previewHumanParent: allowedHuman, previewPetCouple: petCouple };
    });
    check('寵物之間不能收養（連線被擋、跳提示）', petKin.petPetBlocked && petKin.dialog, JSON.stringify(petKin));
    check('人與寵物的親子線：寵物一定在子女端', petKin.petIsChild, JSON.stringify(petKin));
    check('新增成員自動連線：寵物不當父母、不配伴侶；人可以養寵物', !petKin.previewPetParent && petKin.previewHumanParent && !petKin.previewPetCouple, JSON.stringify(petKin));
    if (await page.getByRole('button', { name: '知道了' }).isVisible().catch(() => false)) await page.getByRole('button', { name: '知道了' }).click();

    // ── 4. 關係線提起／放下 ──
    const fx = await page.evaluate(async () => {
        const app = window.app;
        const out = {};
        app.loadData({ version: '1.1', persons: [{ id: 'a1', gender: 'male', x: 200, y: 300 }, { id: 'U', gender: 'female', x: 400, y: 300 }], relationships: [] });
        app.connectingFrom = { person: app.personMap.get('a1') }; app.connectingTo = app.personMap.get('U');
        app.createRelationship('ex-partner');
        const rel = app.relationships[app.relationships.length - 1];
        out.created = rel.type === 'ex-partner';
        out.drop = app.canvas.relFx.get(String(rel.id))?.kind === 'drop';
        await new Promise(r => setTimeout(r, 450)); app.render();
        out.dropCleared = !app.canvas.relFx.has(String(rel.id));
        app.selectedRelationshipId = rel.id; app.render();
        await new Promise(r => setTimeout(r, 250)); app.render();
        const e = app.canvas.relFx.get(String(rel.id));
        const st = e && app.canvas._relFxState(e, performance.now());
        out.lift = e?.kind === 'lift' && Math.abs(st.boost - GenogramCanvas.REL_FX.liftBoost) < 1e-6 && st.lift === 1;
        // 匯出不套用加粗
        let boostDuringExport = null;
        const orig = app.canvas.drawRelationship;
        app.canvas.drawRelationship = function (...args) { if (boostDuringExport === null) boostDuringExport = this._relWidthBoost || 1; return orig.apply(this, args); };
        app.canvas.exportToPNG(app.persons, app.relationships, [], [], true, false, 1, app.viewOptions, null);
        app.canvas.drawRelationship = orig;
        out.exportNoBoost = boostDuringExport === 1;
        app.selectedRelationshipId = null; app.render();
        out.settle = app.canvas.relFx.get(String(rel.id))?.kind === 'settle';
        await new Promise(r => setTimeout(r, 300)); app.render();
        out.settleCleared = !app.canvas.relFx.has(String(rel.id));
        return out;
    });
    check('新畫好的關係線 → 放下動畫，結束後清除', fx.created && fx.drop && fx.dropCleared, JSON.stringify(fx));
    check('點選關係線 → 提起（加粗＋影子、其他淡化）', fx.lift, JSON.stringify(fx));
    check('匯出不套用提起加粗', fx.exportNoBoost);
    check('取消選取 → 放回、動畫狀態清除', fx.settle && fx.settleCleared, JSON.stringify(fx));

    // ── 4b. 快速新增「寵物」鈕 ──
    const quick = await page.evaluate(() => {
        const app = window.app;
        app.loadData({ version: '1.1', persons: [
            { id: 'dad', gender: 'male', x: 300, y: 260 }, { id: 'mom', gender: 'female', x: 460, y: 260 },
            { id: 'fetus', gender: 'pregnancy', x: 700, y: 260 }, { id: 'loss', gender: 'female', lossType: 'miscarriage', x: 820, y: 260 },
            { id: 'cat', gender: 'pet', petType: 'cat', x: 940, y: 260 }
        ], relationships: [{ id: 'm', fromPersonId: 'dad', toPersonId: 'mom', type: 'married' }] });
        const has = id => app.canvas.getQuickButtonLayout(app.personMap.get(id)).some(b => b.type === 'pet');
        const out = { dad: has('dad'), mom: has('mom'), fetus: has('fetus'), loss: has('loss'), cat: has('cat') };
        app.handleQuickAddClick(app.personMap.get('mom'), 'pet');
        const m = document.getElementById('genderModal');
        out.petOnly = m.classList.contains('pet-only') && m.querySelector('#genderModalTitle').textContent === '選擇寵物種類';
        return out;
    });
    await page.locator('.gender-btn--pet[data-pet="dog"]').click();
    await wait(200);
    const quickMade = await page.evaluate(() => {
        const app = window.app; if (app.placementSession) app.commitPlacement();
        const pet = app.persons.find(x => x.gender === 'pet' && x.id !== 'cat');
        const parents = app.relationships.filter(r => r.type === 'parent-child' && r.toPersonId === pet?.id).map(r => r.fromPersonId).sort().join(',');
        app.showGenderModal('parent');
        const m = document.getElementById('genderModal');
        const reset = !m.classList.contains('pet-only');
        app.closeGenderModal();
        return { petType: pet?.petType, parents, reset };
    });
    check('寵物鈕：一般人有；懷孕、流產、寵物本身沒有', quick.dad && quick.mom && !quick.fetus && !quick.loss && !quick.cat, JSON.stringify(quick));
    check('寵物鈕：彈窗只顯示寵物種類', quick.petOnly, JSON.stringify(quick));
    check('寵物鈕：建立的寵物掛在主人與伴侶下面（寵物在子女端）', quickMade.petType === 'dog' && quickMade.parents === 'dad,mom', JSON.stringify(quickMade));
    check('寵物鈕：一般新增成員時彈窗恢復完整', quickMade.reset);
    const petParent = await page.evaluate(() => window.app.parentChildPetProblem('fetus', 'cat', true));
    check('懷孕／流產不能有寵物（親子線）', /懷孕、流產不能有寵物/.test(petParent || ''), String(petParent));

    // ── 4c. 自動排列：寵物排在同組手足最右邊 ──
    const lay = await page.evaluate(() => {
        const app = window.app;
        const pc = (p, c) => ({ id: p + c, fromPersonId: p, toPersonId: c, type: 'parent-child' });
        app.loadData({ version: '1.1', persons: [
            { id: 'dad', gender: 'male', x: 300, y: 100 }, { id: 'mom', gender: 'female', x: 460, y: 100 },
            { id: 'cat', gender: 'pet', petType: 'cat', x: 100, y: 260 }, { id: 'k10', gender: 'male', age: 10, x: 300, y: 260 },
            { id: 'dog', gender: 'pet', petType: 'dog', x: 380, y: 260 }, { id: 'k8', gender: 'female', age: 8, x: 460, y: 260 },
            { id: 'fetus', gender: 'pregnancy', x: 540, y: 260 }
        ], relationships: [{ id: 'm', fromPersonId: 'dad', toPersonId: 'mom', type: 'married' },
            ...['cat', 'k10', 'dog', 'k8', 'fetus'].flatMap(k => [pc('dad', k), pc('mom', k)])] });
        const res = new GenogramLayout(app.persons, app.relationships, { grid: GenogramApp.GRID, households: [], lifeCircles: [] }).calculate();
        return [...res.positions.entries()].filter(([id]) => !['dad', 'mom'].includes(id)).sort((a, b) => a[1].x - b[1].x).map(([id]) => id).join(',');
    });
    check('自動排列：孩子長→幼、胎兒最幼，寵物排在最右邊（依原本左右順序）', lay === 'k10,k8,fetus,cat,dog', lay);

    // ── 5. 上下對齊的情感線：預設走正中；上方有字或兩人之間有親子線才走右側 ──
    const route = await page.evaluate(() => {
        const app = window.app;
        app.loadData({ version: '1.1', persons: [
            { id: 'me', gender: 'male', x: 400, y: 300 }, { id: 'cat', gender: 'pet', petType: 'cat', x: 400, y: 100 },
            { id: 'mom', name: '王媽媽', gender: 'female', x: 750, y: 100 }, { id: 'son', name: '王小明', gender: 'male', x: 750, y: 300 },
            { id: 'p', gender: 'female', x: 600, y: 100 }, { id: 'c', gender: 'male', x: 600, y: 300 }
        ], relationships: [
            { id: 'e1', fromPersonId: 'me', toPersonId: 'cat', type: 'very-close' }, { id: 'e2', fromPersonId: 'mom', toPersonId: 'son', type: 'close' },
            { id: 'pc', fromPersonId: 'p', toPersonId: 'c', type: 'parent-child' }, { id: 'e3', fromPersonId: 'p', toPersonId: 'c', type: 'conflict' }
        ] });
        app.render();
        const c = app.canvas, P = id => app.personMap.get(id);
        const xs = (a, b) => c.getSmartPath(P(a), P(b), app.persons).map(pt => Math.round(pt.x));
        return { center: xs('me', 'cat'), label: xs('mom', 'son'), parentChild: xs('p', 'c') };
    });
    check('上下對齊情感線：沒有字也沒有親子線 → 走正中', route.center.every(x => x === 400), JSON.stringify(route));
    check('上下對齊情感線：上方有名字 → 走右側', route.label.every(x => x > 750), JSON.stringify(route));
    check('上下對齊情感線：兩人之間有親子線 → 走右側', route.parentChild.every(x => x > 600), JSON.stringify(route));

    // ── 6. 主人與寵物之間同時有親子線與情感線 ──
    const both = await page.evaluate(() => {
        const app = window.app;
        app.loadData({ version: '1.1', persons: [
            { id: 'o1', name: '主人', gender: 'female', x: 200, y: 200 }, { id: 'p1', gender: 'pet', petType: 'dog', x: 360, y: 200 },
            { id: 'o2', name: '主人', gender: 'male', x: 600, y: 200 }, { id: 'p2', gender: 'pet', petType: 'cat', x: 600, y: 400 }
        ], relationships: [
            { id: 'a1', fromPersonId: 'o1', toPersonId: 'p1', type: 'parent-child' }, { id: 'e1', fromPersonId: 'o1', toPersonId: 'p1', type: 'very-close' },
            { id: 'a2', fromPersonId: 'o2', toPersonId: 'p2', type: 'parent-child' }, { id: 'e2', fromPersonId: 'o2', toPersonId: 'p2', type: 'very-close' }
        ] });
        app.canvas.scale = 1; app.canvas.offsetX = 0; app.canvas.offsetY = 0; app.render();
        const P = id => app.personMap.get(id);
        const famPath = app.canvas.getRelationshipPath(P('o1'), P('p1'), app.relationships[0], app.relationships);
        const overTops = famPath.length >= 4 && famPath.every(pt => pt.y <= 200 - 25 + 0.5);
        // 畫的順序：情感線先、親子線後
        const order = [];
        const origRel = app.canvas.drawRelationship, origFam = app.canvas.drawFamilies;
        app.canvas.drawRelationship = function (...args) { order.push('rel:' + args[2].type); return origRel.apply(this, args); };
        app.canvas.drawFamilies = function (...args) { order.push('families'); return origFam.apply(this, args); };
        app.render();
        app.canvas.drawRelationship = origRel; app.canvas.drawFamilies = origFam;
        const fi = order.indexOf('families');
        const emoBeforeFamilies = fi > 0 && order.slice(0, fi).every(x => x === 'rel:very-close') && !order.slice(fi + 1).includes('rel:very-close');
        // 上下對齊：綠線繞到右側後點得到，正中仍是親子線
        const green = app.getRelationshipAt(600 + 37, 300), black = app.getRelationshipAt(600, 300);
        return { overTops, emoBeforeFamilies, green: green && green.id, black: black && black.id, order: order.join(',') };
    });
    check('同一列的主人與寵物：親子線從頭頂往上繞，不跟情感線疊在一起', both.overTops, JSON.stringify(both));
    check('畫的順序：情感線 → 親子線（親子線不被蓋住）', both.emoBeforeFamilies, both.order);
    check('上下對齊：繞到右側的情感線點得到；正中是親子線', both.green === 'e2' && both.black === 'a2', JSON.stringify(both));

    check('零 console error', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'RESULT OK (ex-partner / pets / no family marriage / relationship fx)');
})().catch(err => { console.error(err); process.exit(1); });
