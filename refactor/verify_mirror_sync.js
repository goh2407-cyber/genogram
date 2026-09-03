const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];
const md5 = file => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
});
const relative = (base, file) => path.relative(base, file).replace(/\\/g, '/');
const check = (name, condition, detail = '') =>
    (condition ? passes : failures).push(condition ? name : name + (detail ? ' — ' + detail : ''));

const sourceJs = path.join(root, 'js');
const sourceCss = path.join(root, 'css', 'styles.css');
const mirrors = [
    { name: 'geno', root: path.join(root, 'geno') },
    { name: 'refactor/app', root: path.join(root, 'refactor', 'app') }
];

const sourceFiles = walk(sourceJs).filter(file => file.endsWith('.js'));
for (const mirror of mirrors) {
    for (const source of sourceFiles) {
        const rel = relative(sourceJs, source);
        const target = path.join(mirror.root, 'js', ...rel.split('/'));
        const exists = fs.existsSync(target);
        check(mirror.name + ' has js/' + rel, exists);
        if (exists) check(mirror.name + ' js/' + rel + ' raw MD5 matches', md5(source) === md5(target),
            md5(source) + ' != ' + md5(target));
    }
    const targetCss = path.join(mirror.root, 'css', 'styles.css');
    check(mirror.name + ' has css/styles.css', fs.existsSync(targetCss));
    if (fs.existsSync(targetCss)) check(mirror.name + ' CSS raw MD5 matches', md5(sourceCss) === md5(targetCss),
        md5(sourceCss) + ' != ' + md5(targetCss));
}

const rootIndex = path.join(root, 'index.html');
const refactorIndex = path.join(root, 'refactor', 'app', 'index.html');
check('root and refactor/app index raw MD5 match', md5(rootIndex) === md5(refactorIndex),
    md5(rootIndex) + ' != ' + md5(refactorIndex));

const genoIndexPath = path.join(root, 'geno', 'index.html');
const genoIndex = fs.readFileSync(genoIndexPath, 'utf8');
const rootIndexText = fs.readFileSync(rootIndex, 'utf8');
const requiredIds = ['viewContent', 'fitView', 'zoomReset'];
check('geno keeps local jsPDF', genoIndex.includes('js/vendor/jspdf.umd.min.js'));
check('geno has no dagre (layout engine is in-house since 2026-09-03) and no CDN script', !genoIndex.includes('dagre') && !genoIndex.includes('unpkg.com'));
check('geno has no remote asset URL', !/(?:src|href)=["']https?:\/\//i.test(genoIndex));
for (const id of requiredIds) {
    check('root contains #' + id, rootIndexText.includes('id="' + id + '"'));
    check('geno contains #' + id, genoIndex.includes('id="' + id + '"'));
}
check('root has bundled favicon', rootIndexText.includes('rel="icon" href="icon-512.png"'));
check('geno has bundled favicon', genoIndex.includes('rel="icon" href="icon-512.png"'));

passes.forEach(name => console.log('PASS | ' + name));
failures.forEach(name => console.log('FAIL | ' + name));
console.log(failures.length ? 'RESULT FAIL' : 'RESULT OK (mirror sync)');
process.exit(failures.length ? 1 : 0);
