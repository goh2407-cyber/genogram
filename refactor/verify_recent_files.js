/**
 * [2-3] 最近檔案（IndexedDB）+ 開啟檔案對話框 + 清除本機暫存並關閉個案
 * 驗證：IDB 存/列/刪/上限、「載入」開對話框並列出最近檔案、點擊最近檔案載入並連結、
 * 權限拒絕/檔案不存在的處理、清除本機暫存（autosave + 最近檔案 + 畫布 + 歷史）、不支援 FS API 時退回 input。
 * 用法：node refactor/run_all.js recent_files
 */
const { chromium } = require('playwright');
const path = require('path');

const results = [];
const check = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas && window.app.isLoading === false);
    await page.evaluate(async () => { await window.app.storage.clearRecentFiles(); });

    // ---- IDB 層 ----
    const idb = await page.evaluate(async () => {
        const st = window.app.storage;
        const out = {};
        out.emptyList = await st.listRecentFiles();
        // 純物件可結構化複製；順序依 openedAt
        await st.rememberRecentFile({ name: 'a.json', kind: 'file' });
        await new Promise(r => setTimeout(r, 5));
        await st.rememberRecentFile({ name: 'b.json', kind: 'file' });
        await new Promise(r => setTimeout(r, 5));
        await st.rememberRecentFile({ name: 'a.json', kind: 'file' }); // 再開 a → 移到最前
        out.order = (await st.listRecentFiles()).map(e => e.name);
        for (let i = 0; i < 10; i++) { await st.rememberRecentFile({ name: `f${i}.json`, kind: 'file' }); await new Promise(r => setTimeout(r, 2)); }
        out.count = (await st.listRecentFiles()).length;
        await st.forgetRecentFile('f9.json');
        out.afterForget = (await st.listRecentFiles()).map(e => e.name);
        await st.clearRecentFiles();
        out.afterClear = (await st.listRecentFiles()).length;
        out.badIgnored = (await (async () => { await st.rememberRecentFile(null); await st.rememberRecentFile({}); return st.listRecentFiles(); })()).length;
        return out;
    });
    check('IDB：初始為空', Array.isArray(idb.emptyList) && idb.emptyList.length === 0);
    check('IDB：重開同名檔移到最前（a, b）', JSON.stringify(idb.order) === JSON.stringify(['a.json', 'b.json']), JSON.stringify(idb.order));
    check('IDB：上限 8 筆', idb.count === 8, String(idb.count));
    check('IDB：forget 移除單筆', !idb.afterForget.includes('f9.json') && idb.afterForget.length === 7, JSON.stringify(idb.afterForget));
    check('IDB：clear 清空；無效 handle 被忽略', idb.afterClear === 0 && idb.badIgnored === 0, `${idb.afterClear}/${idb.badIgnored}`);

    // ---- 對話框：載入 → 開啟檔案對話框，列出最近檔案 ----
    const hasPicker = await page.evaluate(() => typeof window.showOpenFilePicker === 'function');
    check('Chromium 具備 showOpenFilePicker（走對話框路徑）', hasPicker);
    // 假 handle（含方法，不能進 IDB）：以 listRecentFiles stub 提供
    await page.evaluate(() => {
        const app = window.app;
        const d = new Person({ id: 'p_d', x: 500, y: 300, gender: 'male', name: '父' });
        const json = JSON.stringify({ version: '1.0', persons: [d.toJSON()], relationships: [], households: [], lifeCircles: [], meta: { title: '個案甲', caseId: 'K-1', author: '' } });
        window.__fakeHandle = {
            name: '個案甲_家系圖.json', kind: 'file',
            queryPermission: async () => 'prompt',
            requestPermission: async () => 'granted',
            getFile: async () => ({ name: '個案甲_家系圖.json', text: async () => json }),
            createWritable: async () => ({ write: async s => { window.__written = s; }, close: async () => {} })
        };
        window.__deniedHandle = { name: 'denied.json', kind: 'file', queryPermission: async () => 'denied', requestPermission: async () => 'denied', getFile: async () => { throw new Error('should not read'); } };
        window.__missingHandle = { name: 'missing.json', kind: 'file', queryPermission: async () => 'granted', getFile: async () => { const e = new Error('nf'); e.name = 'NotFoundError'; throw e; } };
        window.__forgot = [];
        app.storage.listRecentFiles = async () => [
            { name: window.__fakeHandle.name, handle: window.__fakeHandle, openedAt: Date.now() },
            { name: 'denied.json', handle: window.__deniedHandle, openedAt: Date.now() - 60000 },
            { name: 'missing.json', handle: window.__missingHandle, openedAt: Date.now() - 120000 },
        ].filter(e => !window.__forgot.includes(e.name));
        app.storage.forgetRecentFile = async name => { window.__forgot.push(name); };
    });
    await page.click('#loadBtn');
    await page.waitForTimeout(400);
    let ui = await page.evaluate(() => ({
        active: document.getElementById('openFileModal').classList.contains('active'),
        items: [...document.querySelectorAll('#recentFileList .recent-file-item')].map(b => b.dataset.name),
        focusInModal: !!document.activeElement?.closest('#openFileModal'),
    }));
    check('點「載入」→ 開啟檔案對話框、列出 3 筆最近檔案、焦點在對話框內', ui.active && ui.items.length === 3 && ui.items[0] === '個案甲_家系圖.json' && ui.focusInModal, JSON.stringify(ui));

    // 權限拒絕 → 留在對話框 + 警示
    await page.click('#recentFileList .recent-file-item[data-name="denied.json"]');
    await page.waitForTimeout(150);
    ui = await page.evaluate(() => ({ active: document.getElementById('openFileModal').classList.contains('active'), status: document.getElementById('statusBar').textContent, persons: window.app.persons.length }));
    check('權限被拒 → 對話框保持開啟、提示改用瀏覽、內容不變', ui.active && /權限/.test(ui.status) && ui.persons === 0, JSON.stringify(ui));

    // 檔案不存在 → 從清單移除
    await page.click('#recentFileList .recent-file-item[data-name="missing.json"]');
    await page.waitForTimeout(200);
    ui = await page.evaluate(() => ({ forgot: window.__forgot, items: [...document.querySelectorAll('#recentFileList .recent-file-item')].map(b => b.dataset.name), status: document.getElementById('statusBar').textContent }));
    check('檔案不存在 → forget + 重繪清單（剩 2 筆）+ 錯誤提示', ui.forgot.includes('missing.json') && ui.items.length === 2 && /移除/.test(ui.status), JSON.stringify(ui));

    // 點有效檔案 → 載入、連結、標題列檔名、meta 帶入、可 Ctrl+S 寫回
    await page.click('#recentFileList .recent-file-item[data-name="個案甲_家系圖.json"]');
    await page.waitForTimeout(400);
    ui = await page.evaluate(async () => {
        const app = window.app;
        const out = {
            active: document.getElementById('openFileModal').classList.contains('active'),
            persons: app.persons.length,
            fileName: app.storage.getOpenFileName(),
            linked: app.storage.hasOpenFile(),
            title: document.getElementById('documentName').textContent,
            dirty: !document.getElementById('documentDirty').hidden,
            meta: { ...app.documentMeta },
        };
        await app.saveToFile();
        out.written = typeof window.__written === 'string' && JSON.parse(window.__written).persons.length === 1;
        return out;
    });
    check('點最近檔案 → 關閉對話框、載入 1 人、連結檔案、標題列顯示檔名、乾淨', !ui.active && ui.persons === 1 && ui.linked && ui.fileName === '個案甲_家系圖.json' && ui.title === '個案甲_家系圖.json' && !ui.dirty, JSON.stringify(ui));
    check('meta 一併載入；Ctrl+S 直接寫回該 handle', ui.meta.title === '個案甲' && ui.written, JSON.stringify(ui.meta));

    // ---- 清除本機暫存並關閉個案 ----
    await page.evaluate(async () => {
        const app = window.app;
        // 還原真實 IDB 方法後放一筆，確認會被清掉
        delete app.storage.listRecentFiles; delete app.storage.forgetRecentFile;
        await app.storage.rememberRecentFile({ name: 'x.json', kind: 'file' });
        app.saveState(); // 有歷史
        app.autoSave();
        await new Promise(r => setTimeout(r, 1200));
        window.confirm = () => true;
    });
    const before = await page.evaluate(async () => ({ ls: !!localStorage.getItem('genogram_autosave'), recent: (await window.app.storage.listRecentFiles()).length, hist: window.app.history.undoStack.length }));
    check('清除前：有 autosave、有最近檔案、有歷史', before.ls && before.recent === 1 && before.hist >= 1, JSON.stringify(before));
    await page.click('#loadBtn');
    await page.waitForTimeout(300);
    await page.click('#clearLocalDataBtn');
    await page.waitForTimeout(500);
    const after = await page.evaluate(async () => ({
        ls: !!localStorage.getItem('genogram_autosave'),
        recent: (await window.app.storage.listRecentFiles()).length,
        hist: window.app.history.undoStack.length,
        persons: window.app.persons.length,
        linked: window.app.storage.hasOpenFile(),
        title: document.getElementById('documentName').textContent,
        dirty: !document.getElementById('documentDirty').hidden,
        modalActive: document.getElementById('openFileModal').classList.contains('active'),
        status: document.getElementById('statusBar').textContent,
        meta: window.app.documentMeta.title,
    }));
    check('清除後：autosave 無、最近檔案空、歷史空、畫布空、未連結、標題「未命名家系圖」、無 ●、對話框關閉',
        !after.ls && after.recent === 0 && after.hist === 0 && after.persons === 0 && !after.linked && after.title === '未命名家系圖' && !after.dirty && !after.modalActive && after.meta === '', JSON.stringify(after));
    check('清除後提示訊息', /已清除本機暫存/.test(after.status), after.status);
    // 取消 confirm → 不清
    await page.evaluate(() => { window.confirm = () => false; const app = window.app; app.persons.push(new Person({ x: 1, y: 1 })); app._syncPersonMap(); app.autoSave(); });
    await page.waitForTimeout(1200);
    await page.click('#loadBtn'); await page.waitForTimeout(300);
    await page.click('#clearLocalDataBtn'); await page.waitForTimeout(200);
    const cancelled = await page.evaluate(() => ({ persons: window.app.persons.length, ls: !!localStorage.getItem('genogram_autosave') }));
    check('confirm 取消 → 不清除', cancelled.persons === 1 && cancelled.ls, JSON.stringify(cancelled));
    await page.evaluate(() => window.app.closeOpenFileModal());
    await page.waitForTimeout(350);

    // ---- 不支援 FS API → 退回 input ----
    const fallback = await page.evaluate(async () => {
        const saved = window.showOpenFilePicker;
        let clicked = false;
        const input = document.getElementById('fileInput');
        const orig = input.click.bind(input);
        input.click = () => { clicked = true; };
        try { delete window.showOpenFilePicker; await window.app.handleLoadClick(); }
        finally { window.showOpenFilePicker = saved; input.click = orig; }
        return { clicked, modal: document.getElementById('openFileModal').classList.contains('active') };
    });
    check('無 showOpenFilePicker → 直接觸發 file input，不開對話框', fallback.clicked && !fallback.modal, JSON.stringify(fallback));

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== recent-files ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
