#!/usr/bin/env node
/**
 * 一鍵回歸：依序跑 refactor/ 下所有 verify_*.js + smoke_visual.js + visual_golden.js，
 * 彙整每支的通過/失敗與耗時，exit code 反映整體結果。
 *
 * 用法：
 *   node refactor/run_all.js                 # 全部
 *   node refactor/run_all.js --quick         # 跳過 golden（最慢的一支）
 *   node refactor/run_all.js drag pencil     # 只跑名稱含這些字的腳本
 *   node refactor/run_all.js --list          # 列出會跑哪些
 *
 * NODE_PATH：未設定時自動帶 ~/.cache/pw-smoke/node_modules（本機 playwright 安裝處，
 * 見 refactor/README.md）。子行程失敗不會中斷後續腳本。
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const here = __dirname;
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const listOnly = args.includes('--list');
const filters = args.filter(a => !a.startsWith('--'));

const defaultNodePath = path.join(os.homedir(), '.cache', 'pw-smoke', 'node_modules');
const env = { ...process.env };
if (!env.NODE_PATH && fs.existsSync(defaultNodePath)) env.NODE_PATH = defaultNodePath;

// 需要參數或不是「測試」的腳本排除：contract_harness（工具）、benchmarks（python）
const EXCLUDE = new Set(['contract_harness.js', 'run_all.js', 'sync_mirrors.js']);
let scripts = fs.readdirSync(here)
    .filter(f => /^verify_.*\.js$/.test(f) && !EXCLUDE.has(f))
    .sort();
scripts.push('smoke_visual.js');
if (!quick) scripts.push('visual_golden.js');
if (filters.length) scripts = scripts.filter(s => filters.some(f => s.includes(f)));

if (listOnly) { scripts.forEach(s => console.log(s)); process.exit(0); }
if (!scripts.length) { console.error('沒有符合的腳本'); process.exit(2); }

console.log(`NODE_PATH=${env.NODE_PATH || '(unset)'}`);
console.log(`共 ${scripts.length} 支腳本${quick ? '（--quick，略過 golden）' : ''}\n`);

const results = [];
for (const script of scripts) {
    const started = Date.now();
    const res = spawnSync(process.execPath, [path.join(here, script)], {
        cwd: path.resolve(here, '..'),
        env,
        encoding: 'utf8',
        timeout: 10 * 60 * 1000,
        maxBuffer: 64 * 1024 * 1024
    });
    const ms = Date.now() - started;
    const out = (res.stdout || '') + (res.stderr || '');
    // 有些腳本沒 process.exit：補以輸出判定（出現 FAIL 行、或 'RESULT FAIL'、或例外）
    const outputSaysFail = /(^|\n)\s*(FAIL|✗|❌)\s*[|:]/m.test(out) || /RESULT FAIL/.test(out) || /Error:/.test(out) && !/0 error|errors=0|error(s)?\s*:\s*0/.test(out) && res.status !== 0;
    const ok = res.status === 0 && !res.error && !outputSaysFail && !res.signal;
    const summaryLine = out.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
    results.push({ script, ok, ms, status: res.status, summaryLine, out });
    console.log(`${ok ? 'PASS' : 'FAIL'} | ${script.padEnd(38)} ${String(ms).padStart(6)}ms | ${summaryLine.slice(0, 90)}`);
}

const failed = results.filter(r => !r.ok);
console.log('\n' + '='.repeat(72));
console.log(`RESULT ${failed.length ? 'FAIL' : 'OK'} — ${results.length - failed.length}/${results.length} 支通過`);
if (failed.length) {
    console.log('\n失敗腳本輸出（最後 25 行）：');
    for (const r of failed) {
        console.log(`\n--- ${r.script} (exit ${r.status}) ---`);
        console.log(r.out.trim().split(/\r?\n/).slice(-25).join('\n'));
    }
}
process.exit(failed.length ? 1 : 0);
