const { chromium } = require('playwright');
const { strict: assert } = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const TARGET_URL = process.env.PANEL_TEST_URL || pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const OUTPUT = path.resolve(__dirname, '..', 'work', 'person-panel-collapse');
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const isOpen = (page, id) => page.locator('#' + id).evaluate(el => el.open);

(async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(TARGET_URL);
        await page.waitForFunction(() => window.app?.canvas);
        const personId = await page.evaluate(() => {
            const app = window.app;
            app.persons = []; app._syncPersonMap();
            app.relationships = []; app.households = []; app.lifeCircles = [];
            app.addPerson(400, 300, 'female');
            app.history.clear();
            return app.selectedPersonId;
        });
        assert.equal(await isOpen(page, 'personLossSection'), false);
        assert.equal(await isOpen(page, 'personMedicalSection'), false);
        assert.equal(await page.locator('.twin-settings').isVisible(), false);
        assert.equal(await page.locator('#personForm').textContent().then(t => t.includes('尚無同父母')), false);
        await page.locator('#personName').focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'personIP');
        await page.keyboard.press('Space');
        assert.equal(await page.locator('#personIP').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => app.history.getUndoCount()), 1);
        await page.evaluate(() => app.undo());
        assert.equal(await page.locator('#personIP').getAttribute('aria-pressed'), 'false');
        await page.evaluate(() => app.redo());
        assert.equal(await page.locator('#personIP').getAttribute('aria-pressed'), 'true');
        console.log('PASS | 案主鍵盤切換與復原/重做');

        await page.locator('#personLossSection > summary').focus();
        await page.keyboard.press('Space');
        await settle(page);
        assert.equal(await isOpen(page, 'personLossSection'), true);
        await page.selectOption('#personLossType', 'miscarriage');
        await page.locator('#personLossSection > summary').click();
        await settle(page);
        const beforeToggle = await page.evaluate(() => JSON.stringify(app.getState()));
        await page.locator('#personMedicalSection > summary').click();
        await settle(page);
        assert.equal(await page.evaluate(() => JSON.stringify(app.getState())), beforeToggle);
        await page.evaluate(id => {
            app.persons.push(new Person({ id: 'panel-other' }));
            app._syncPersonMap();
            app.selectPerson('panel-other');
        }, personId);
        assert.equal(await isOpen(page, 'personLossSection'), false);
        assert.equal(await isOpen(page, 'personMedicalSection'), false);
        await page.evaluate(id => app.selectPerson(id), personId);
        assert.equal(await isOpen(page, 'personLossSection'), false);
        assert.equal(await isOpen(page, 'personMedicalSection'), true);
        console.log('PASS | 手動收合優先、各人物獨立、不進 history 資料');

        // 未手動選擇時：五個醫學欄位各自足以展開，正常值則收合。
        for (const [key, value] of [['leftHalf', 'filled'], ['bottomHalf', 'striped'], ['isSmoker', true],
            ['isObese', true], ['hasLanguageProblem', true]]) {
            await page.evaluate(({ key, value }) => {
                const person = app.personMap.get('panel-other');
                person.medical = new Person().medical;
                person.medical[key] = value;
                app.selectPerson(person.id);
            }, { key, value });
            await settle(page);
            assert.equal(await isOpen(page, 'personMedicalSection'), true, key);
        }
        await page.evaluate(() => {
            const person = app.personMap.get('panel-other');
            person.medical = new Person().medical;
            person.lossType = 'abortion';
            app.updatePropertyPanel();
        });
        await settle(page);
        assert.equal(await isOpen(page, 'personMedicalSection'), false);
        assert.equal(await isOpen(page, 'personLossSection'), true);
        console.log('PASS | 非預設生育/醫學值自動展開且初始 toggle 不污染偏好');

        // 同一個事件週期內展開、改值、Undo、切人；不等原生非同步 toggle。
        const rapidStates = await page.evaluate(() => {
            app.persons.push(new Person({ id: 'panel-fast' }));
            app._syncPersonMap();
            app.history.clear();
            app.selectPerson('panel-fast');
            const states = [];
            for (const [sectionId, fieldId, value, key, original] of [
                ['personMedicalSection', 'medLeftHalf', 'filled', 'medical', 'none'],
                ['personLossSection', 'personLossType', 'miscarriage', 'lossType', null]
            ]) {
                document.querySelector('#' + sectionId + ' > summary').click();
                const field = document.getElementById(fieldId);
                field.value = value;
                field.dispatchEvent(new Event('change', { bubbles: true }));
                app.undo();
                const person = app.personMap.get('panel-fast');
                states.push(document.getElementById(sectionId).open
                    && (key === 'medical' ? person.medical.leftHalf : person[key]) === original);
                document.querySelector('#' + sectionId + ' > summary').click();
                app.selectPerson('panel-other');
                app.selectPerson('panel-fast');
                states.push(!document.getElementById(sectionId).open);
            }
            return states;
        });
        assert.deepEqual(rapidStates, [true, true, true, true]);
        console.log('PASS | 快速展開/改值/復原與收合/切人不遺失手動選擇');

        // 同父母手足的辨識不依賴座標。
        await page.evaluate(id => {
            const parent = new Person({ id: 'panel-parent', y: 900 });
            app.persons.push(parent); app._syncPersonMap();
            app.relationships = [id, 'panel-other'].map(child => new Relationship({
                fromPersonId: parent.id, toPersonId: child, type: 'parent-child'
            }));
            app._dataVersion++;
            app.selectPerson(id);
        }, personId);
        assert.equal(await page.locator('.twin-settings').isVisible(), true);
        assert.equal(await page.locator('.twin-checkbox').count(), 1);
        console.log('PASS | 同父母手足存在時顯示多胞胎設定');

        await page.evaluate(id => {
            app.persons = [app.personMap.get(id)]; app._syncPersonMap();
            app.relationships = []; app._dataVersion++;
            app.selectPerson(id);
        }, personId);
        const expectedPerson = await page.evaluate(id => new Person({
            id, x: app.personMap.get(id).x, y: app.personMap.get(id).y,
            gender: 'female', isIdentifiedPatient: true, lossType: 'miscarriage'
        }).toJSON(), personId);
        // 使用實際 JSON 下載路徑；停用系統對話框以取得瀏覽器下載檔。
        await page.evaluate(() => { window.showSaveFilePicker = undefined; });
        const downloaded = page.waitForEvent('download');
        await page.evaluate(() => app.downloadFile('panel-person.json'));
        const download = await downloaded;
        fs.mkdirSync(OUTPUT, { recursive: true });
        await download.saveAs(path.join(OUTPUT, 'panel-person.json'));
        const saved = JSON.parse(fs.readFileSync(path.join(OUTPUT, 'panel-person.json'), 'utf8'));
        assert.deepEqual(saved.persons, [expectedPerson]);
        assert.equal(saved.version, '1.1'); // [R4] schema 1.1
        assert.deepEqual(Object.keys(saved).sort(), ['version', 'createdAt', 'persons', 'relationships', 'households', 'lifeCircles'].sort());
        assert.equal(JSON.stringify(saved).includes('personPanelSectionState'), false);
        console.log('PASS | 案主＋流產 JSON 全部人物欄位與原 Person 格式一致');

        await page.locator('#personLossSection > summary').click();
        await settle(page);
        await page.screenshot({ path: path.resolve(__dirname, 'panel_after.png') });
        await page.click('#personDeceased');
        for (const width of [1440, 1180, 1179, 1100, 1024]) {
            await page.setViewportSize({ width, height: 900 });
            await settle(page);
            const metrics = await page.evaluate(() => {
                const form = document.getElementById('personForm');
                const content = document.getElementById('propertyContent');
                const row = id => document.getElementById(id).closest('.form-group-row');
                return {
                    form: [form.scrollWidth, form.clientWidth],
                    content: [content.scrollWidth, content.clientWidth],
                    sameRow: row('personAge') === row('personBirthDate'),
                    chipRight: document.getElementById('personIP').getBoundingClientRect().left
                        >= document.getElementById('personName').getBoundingClientRect().right
                };
            });
            assert.ok(metrics.form[0] <= metrics.form[1] + 1, JSON.stringify({ width, metrics }));
            assert.ok(metrics.content[0] <= metrics.content[1] + 1, JSON.stringify({ width, metrics }));
            assert.ok(metrics.sameRow && metrics.chipRight);
        }
        assert.deepEqual(errors, []);
        console.log('PASS | 1440/1180/1179/1100/1024 面板無水平溢出');
        console.log('RESULT OK (人物面板)');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
