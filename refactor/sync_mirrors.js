#!/usr/bin/env node
/**
 * 三副本同步：root → geno/、refactor/app/
 *
 *   - js/**（含 domain/、ui/、extras/；不動 geno/js/vendor/）與 css/styles.css、css/extras.css 複製到兩個副本（raw byte 一致）
 *   - index.html 原樣複製到 refactor/app/；geno/index.html 由 root 產生，只把兩個線上資產換成本地版：
 *     Google Fonts → fonts/noto-sans-tc.css、cdnjs jsPDF → js/vendor/jspdf.umd.min.js（2026-10-13 起自動產生，不再手改）
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
    path.join(root, 'css', 'styles.css'),
    path.join(root, 'css', 'extras.css')
];

/** geno/index.html = root index.html 換掉兩個線上資產（離線可用；其餘內容完全相同） */
const GENO_ASSET_SWAPS = [
    [/<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Noto\+Sans\+TC[^"]*" rel="stylesheet">/, '<link href="fonts/noto-sans-tc.css" rel="stylesheet">'],
    [/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/[^"]*\/jspdf\.umd\.min\.js"><\/script>/, '<script src="js/vendor/jspdf.umd.min.js"></script>']
];
function genoIndexFrom(html) {
    let out = html;
    for (const [re, local] of GENO_ASSET_SWAPS) {
        if (!re.test(out)) throw new Error('root index.html 找不到要換成本地版的資產：' + re);
        out = out.replace(re, local);
    }
    return out;
}

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
    } else {
        // geno/index.html：由 root 產生（只換本地字型與 jsPDF）
        const want = genoIndexFrom(fs.readFileSync(srcIndex, 'utf8'));
        const have = fs.existsSync(dstIndex) ? fs.readFileSync(dstIndex, 'utf8') : null;
        if (have !== want) {
            console.log(`${dry ? 'WOULD WRITE' : 'WRITE'} | index.html → ${rel(dstIndex)}（本地字型＋本地 jsPDF）`);
            if (!dry) fs.writeFileSync(dstIndex, want, 'utf8');
            copied++;
        } else skipped++;
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
