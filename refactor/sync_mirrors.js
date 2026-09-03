#!/usr/bin/env node
/**
 * 三副本同步：root → geno/、refactor/app/
 *
 *   - js/**（含 domain/、ui/；不動 geno/js/vendor/）與 css/styles.css 複製到兩個副本（raw byte 一致）
 *   - index.html 只複製到 refactor/app/；geno/index.html 保留本地字型與 vendor 路徑，**不覆蓋**
 *     （若 root 的 index.html 有改動，會比對「去掉 3 行資產引用後」是否一致並提示）
 *   - 完成後印 md5 表，並跑 verify_mirror_sync.js 守門
 *
 * 用法：
 *   node refactor/sync_mirrors.js            # 同步 + 驗證
 *   node refactor/sync_mirrors.js --dry-run  # 只列出會複製什麼
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dry = process.argv.includes('--dry-run');
const md5 = file => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex').slice(0, 8);
const rel = p => path.relative(root, p).replace(/\\/g, '/');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
});

const mirrors = [
    { name: 'geno', dir: path.join(root, 'geno'), copyIndex: false },
    { name: 'refactor/app', dir: path.join(root, 'refactor', 'app'), copyIndex: true }
];

const sources = [
    ...walk(path.join(root, 'js')).filter(f => f.endsWith('.js')),
    path.join(root, 'css', 'styles.css')
];

let copied = 0, skipped = 0;
for (const m of mirrors) {
    if (!fs.existsSync(m.dir)) { console.log(`SKIP | ${m.name} 不存在（gitignored 本機副本）`); continue; }
    for (const src of sources) {
        const target = path.join(m.dir, path.relative(root, src));
        const same = fs.existsSync(target) && md5(src) === md5(target);
        if (same) { skipped++; continue; }
        console.log(`${dry ? 'WOULD COPY' : 'COPY'} | ${rel(src)} → ${rel(target)}`);
        if (!dry) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(src, target); }
        copied++;
    }
    const srcIndex = path.join(root, 'index.html');
    const dstIndex = path.join(m.dir, 'index.html');
    if (m.copyIndex) {
        if (!fs.existsSync(dstIndex) || md5(srcIndex) !== md5(dstIndex)) {
            console.log(`${dry ? 'WOULD COPY' : 'COPY'} | index.html → ${rel(dstIndex)}`);
            if (!dry) fs.copyFileSync(srcIndex, dstIndex);
            copied++;
        } else skipped++;
    } else if (fs.existsSync(dstIndex)) {
        // geno/index.html：只比對「非資產引用」的內容是否一致，不覆蓋
        const strip = s => s.replace(/\r\n/g, '\n').split('\n')
            .filter(l => !/fonts\.googleapis|fonts\/noto-sans-tc\.css|jspdf\.umd\.min\.js|dagre\.min\.js/.test(l)).join('\n');
        const a = strip(fs.readFileSync(srcIndex, 'utf8'));
        const b = strip(fs.readFileSync(dstIndex, 'utf8'));
        if (a !== b) {
            console.log(`WARN | geno/index.html 與 root index.html 內容（排除本地資產 3 行）不一致 → 請手動套用同一份 HTML 變更到 geno/index.html`);
        } else {
            console.log(`OK   | geno/index.html 內容一致（僅資產路徑不同，保留本地版）`);
        }
    }
}

console.log(`\n${dry ? '預計' : '已'}複製 ${copied} 個檔案，${skipped} 個已一致。`);

console.log('\nmd5（前 8 碼）：');
const table = [...sources.map(rel), 'index.html'];
for (const r of table) {
    const cells = [rel => fs.existsSync(path.join(root, rel)) ? md5(path.join(root, rel)) : '--------']
        .concat(mirrors.map(m => rel => fs.existsSync(path.join(m.dir, rel)) ? md5(path.join(m.dir, rel)) : '--------'))
        .map(fn => fn(r));
    const same = cells.every(c => c === cells[0]);
    console.log(`${same ? ' ' : '!'} ${r.padEnd(36)} root=${cells[0]} geno=${cells[1]} refactor=${cells[2]}`);
}

if (!dry) {
    console.log('\n→ verify_mirror_sync.js');
    const res = spawnSync(process.execPath, [path.join(__dirname, 'verify_mirror_sync.js')], { encoding: 'utf8' });
    const lines = (res.stdout || '').trim().split(/\r?\n/);
    console.log(lines.filter(l => /FAIL|RESULT/.test(l)).join('\n') || lines.slice(-1)[0]);
    process.exit(res.status || 0);
}
