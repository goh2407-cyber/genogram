/**
 * 2026-10-14 回歸：匯出 Word 全程不連外（docx 程式庫在 js/vendor/docx.iife.js，以 file:// 開頁也能載入）。
 * 真的產生 .docx → 解壓 word/document.xml 檢查內容；去識別化版不含姓名與事件；過程沒有任何非 file:// 請求。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { openApp, createChecks, finish } = require('./contract_harness');

const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'unzip';
const readDocXml = file => process.platform === 'win32'
    ? execFileSync(tar, ['-xOf', file, 'word/document.xml']).toString('utf8')
    : execFileSync('unzip', ['-p', file, 'word/document.xml']).toString('utf8');

(async () => {
    const { browser, page, errors } = await openApp();
    const { failures, passes, check } = createChecks();
    const external = [];
    page.on('request', req => { if (!req.url().startsWith('file:') && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) external.push(req.url()); });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'geno-word-'));

    await page.evaluate(() => {
        const app = window.app;
        app.loadData({ version: '1.1', persons: [
            { id: 'a', name: '王大明', gender: 'male', x: 300, y: 250, birthDate: '1970-01' },
            { id: 'b', name: '李小華', gender: 'female', x: 500, y: 250 },
            { id: 'c', name: '王小美', gender: 'female', x: 400, y: 370, isClient: true, notes: '國中二年級' },
            { id: 'd', name: '小白', gender: 'pet', petType: 'dog', x: 560, y: 370 }
        ], relationships: [
            { id: 'r1', fromPersonId: 'a', toPersonId: 'b', type: 'married' },
            { id: 'r2', fromPersonId: 'a', toPersonId: 'c', type: 'parent-child' }, { id: 'r3', fromPersonId: 'b', toPersonId: 'c', type: 'parent-child' },
            { id: 'r4', fromPersonId: 'b', toPersonId: 'd', type: 'parent-child' }
        ] });
        app.events = [{ id: 'e1', year: '2018', text: '父母結婚十週年' }];
        app.render();
    });
    check('Word 元件一開始沒有載入（用到才載）', await page.evaluate(() => !window.docx));

    const exportOnce = async (deidentify, name) => {
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 30000 }),
            page.evaluate(d => window.app.exportDOCX(true, true, null, d, false), deidentify)
        ]);
        const file = path.join(tmp, name);
        await download.saveAs(file);
        return { file, suggested: download.suggestedFilename(), size: fs.statSync(file).size, head: fs.readFileSync(file).subarray(0, 2).toString('latin1') };
    };

    const full = await exportOnce(false, 'full.docx');
    const xml = readDocXml(full.file);
    check('產生 .docx（zip 檔頭 PK）', full.head === 'PK' && full.size > 10000 && /^genogram_.*\.docx$/.test(full.suggested), JSON.stringify(full));
    check('內容含成員姓名、備註與重大事件', ['王大明', '李小華', '王小美', '國中二年級', '父母結婚十週年'].every(t => xml.includes(t)));
    check('內容含家系圖圖片', /<pic:pic|<w:drawing/.test(xml));

    const deid = await exportOnce(true, 'deid.docx');
    const xml2 = readDocXml(deid.file);
    check('去識別化：檔名標示、不含真實姓名、備註與事件', /_去識別化\.docx$/.test(deid.suggested)
        && !['王大明', '李小華', '王小美', '國中二年級', '父母結婚十週年'].some(t => xml2.includes(t)), deid.suggested);

    check('全程沒有連外（只讀本機檔案）', external.length === 0, external.join(' | '));
    check('零 console error', errors.length === 0, errors.join(' | '));
    fs.rmSync(tmp, { recursive: true, force: true });
    await finish(browser, passes, failures, 'RESULT OK (Word export offline)');
})().catch(err => { console.error(err); process.exit(1); });
