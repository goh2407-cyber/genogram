# Genogram Release Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the audited branch into a reproducible release candidate by enforcing mirror byte identity, approving only the seven known Golden route changes, documenting online/offline packaging, and publishing evidence in the audit report.

**Architecture:** A new Node verifier computes raw MD5 for root, `geno/`, and `refactor/app/` JS/CSS files and treats EOL differences as failures. Root remains the online/CDN shell, `geno` remains the fully local clinical package, and `refactor/app` remains a validation mirror. Golden baselines are updated by explicit filename allowlist, never by global `--update`.

**Tech Stack:** Node.js `fs/path/crypto`, Playwright visual tests, pixelmatch/pngjs, PowerShell orchestration, and the existing Python benchmark scripts.

## Global Constraints

- Root, `geno/`, and `refactor/app/` JS/CSS must be byte-identical after synchronization.
- Root and `refactor/app/index.html` must be byte-identical; `geno/index.html` must retain local fonts/vendor paths.
- `geno/` and `refactor/app/` are gitignored local mirrors; do not force-add their application copies.
- Only Golden files 03, 08, 10, 12, 13, 15, and 16 are approved for replacement.
- Never run `visual_golden.js --update` for this baseline migration.
- The clinical package must make zero HTTP/HTTPS requests under `verify_geno_deploy.js`.
- The audit report and plan/spec Markdown are ignored by the project pattern and require `git add -f` only when intentionally committing those documents.
- Do not claim completion unless every command in Task 4 has fresh exit-0 evidence.

---

### Task 1: Add a byte-level three-mirror release gate

**Files:**
- Create: `refactor/verify_mirror_sync.js`

**Interfaces:**
- Produces: exit 0 only when source JS/CSS and required index shells satisfy the approved mirror policy.

- [ ] **Step 1: Create the complete verifier before synchronizing copies**

Create `refactor/verify_mirror_sync.js`:

```js
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
check('geno keeps local dagre', genoIndex.includes('js/vendor/dagre.min.js'));
check('geno has no remote asset URL', !/https?:\/\//i.test(genoIndex));
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
```

- [ ] **Step 2: Run the verifier and confirm RED on raw EOL/feature drift**

```powershell
node refactor/verify_mirror_sync.js
```

Expected before synchronization: exit 1 with raw MD5 failures or missing newly added feature markup.

- [ ] **Step 3: Synchronize JS/CSS and the online validation shell mechanically**

Run from the repository root after feature/UX implementation is committed:

```powershell
Get-ChildItem -LiteralPath 'js' -Recurse -File -Filter '*.js' | ForEach-Object {
    $relative = $_.FullName.Substring((Resolve-Path 'js').Path.Length).TrimStart('\')
    foreach ($targetRoot in @('geno/js', 'refactor/app/js')) {
        $target = Join-Path $targetRoot $relative
        $parent = Split-Path -Parent $target
        if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
        Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    }
}
Copy-Item -LiteralPath 'css/styles.css' -Destination 'geno/css/styles.css' -Force
Copy-Item -LiteralPath 'css/styles.css' -Destination 'refactor/app/css/styles.css' -Force
Copy-Item -LiteralPath 'index.html' -Destination 'refactor/app/index.html' -Force
Copy-Item -LiteralPath 'index.html' -Destination 'geno/index.html' -Force
```

Immediately restore the three intentional local-resource lines in `geno/index.html` with `apply_patch` before running or distributing the file:

```diff
*** Begin Patch
*** Update File: geno/index.html
@@
-    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet">
+    <link href="fonts/noto-sans-tc.css" rel="stylesheet">
@@
-    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
+    <script src="js/vendor/jspdf.umd.min.js"></script>
@@
-    <script src="https://unpkg.com/dagre@0.8.5/dist/dagre.min.js"></script>
+    <script src="js/vendor/dagre.min.js"></script>
*** End Patch
```

This copy-then-restore sequence makes all functional markup identical while preserving the offline package policy. Do not leave the copied CDN lines in `geno/index.html` between these two operations.

- [ ] **Step 4: Run the mirror and offline gates GREEN**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/verify_mirror_sync.js
node refactor/verify_geno_deploy.js
```

Expected: `RESULT OK (mirror sync)` and `RESULT OK (geno 離線可部署)`.

- [ ] **Step 5: Commit only the tracked verifier**

```powershell
git add refactor/verify_mirror_sync.js
git commit -m "test: enforce byte-identical app mirrors"
```

Do not force-add `geno/` or `refactor/app/`; they remain local deployment/validation copies.

---

### Task 2: Document the online root and offline clinical package

**Files:**
- Modify: `README.md:5-15,54-59,71-79,110-113`
- Modify: `refactor/TEST_GATES.md:22-45`

**Interfaces:**
- Produces: an explicit deployment decision rather than an ambiguous single formal version.

- [ ] **Step 1: Replace the README version-status bullets**

Use this exact content:

```markdown
## 📌 目前版本與使用情境

- **線上／開發版**：根目錄 (`index.html`, `js/`, `css/`)；會向 Google Fonts、cdnjs 與 unpkg 載入字型或程式資產。
- **離線臨床包**：`geno/`；字型、jsPDF 與 dagre 均為本地檔案，適合敏感個案及無網路環境。
- **驗證副本**：`refactor/app/`；與根目錄功能碼同步，不作為獨立部署政策來源。
- **個案資料**：三個版本都只在瀏覽器與使用者指定檔案中處理，不會主動上傳至後端。
```

Add a launch method for `geno/index.html`, add View/Fit to advanced features, and replace the privacy section with:

```markdown
## 🔒 隱私與安全

- 個案資料不會由本工具主動上傳；儲存位置是瀏覽器 LocalStorage 或使用者指定的本地 JSON。
- 根目錄版本會連線取得第三方字型／程式資產，因此網路服務可看見一般資產請求，但請求不包含家系圖個案內容。
- 敏感個案、內網或斷網作業請優先使用 `geno/index.html`；離線驗證要求零 HTTP/HTTPS 請求。
- Service Worker 已停用；離線能力來自 `geno/` 內完整的本地資產，不依賴瀏覽器快取。
```

- [ ] **Step 2: Extend production gates**

Add to `refactor/TEST_GATES.md`:

```markdown
- `node refactor/verify_view_controls.js`、`verify_view_rendering.js`、`verify_view_export.js`、`verify_fit_view.js`、`verify_status_ux.js` 全數通過。
- `node refactor/verify_mirror_sync.js`：三副本 JS/CSS raw MD5 一致；root 與 `refactor/app` index 一致；`geno` 保留本地依賴。
- View 顯示層不寫入 JSON/history；JSON 匯出完整，視覺匯出遵循目前檢視。
- 大型 JSON 載入後自動符合全圖；自動儲存恢復保留原縮放與位移。
- `geno` 用於敏感／離線臨床情境，並通過零外部請求驗證。
```

Update the validation-record date/branch only after Task 4 supplies final evidence.

- [ ] **Step 3: Review the documentation for contradictory claims**

```powershell
rg -n "正式版|部署副本|離線版功能.*移除|100% 本機|外部|Google Fonts|geno" README.md refactor/TEST_GATES.md
```

Expected: no statement claims that root is fully offline; `geno` is consistently identified as the offline clinical package.

- [ ] **Step 4: Commit deployment documentation**

```powershell
git add README.md refactor/TEST_GATES.md
git commit -m "docs: distinguish online and clinical packages"
```

---

### Task 3: Approve exactly seven current Golden route images

**Files:**
- Modify: `refactor/golden/baseline/03-family-trunk.png`
- Modify: `refactor/golden/baseline/08-child-links.png`
- Modify: `refactor/golden/baseline/10-loss.png`
- Modify: `refactor/golden/baseline/12-child-links-single.png`
- Modify: `refactor/golden/baseline/13-multimarriage-overlap.png`
- Modify: `refactor/golden/baseline/15-maximal.png`
- Modify: `refactor/golden/baseline/16-multifamily.png`

**Interfaces:**
- Consumes current images generated by `refactor/visual_golden.js`.
- Produces a strict 16/16 zero-difference baseline.

- [ ] **Step 1: Generate current/diff images without updating baselines**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/visual_golden.js
```

Expected before copying: 9 pass and exactly these 7 fail: 03, 08, 10, 12, 13, 15, 16. Any additional failure stops this task and must be diagnosed.

- [ ] **Step 2: Reconfirm the allowlist from generated output**

```powershell
$approved = @(
  '03-family-trunk','08-child-links','10-loss','12-child-links-single',
  '13-multimarriage-overlap','15-maximal','16-multifamily'
)
$output = node refactor/visual_golden.js 2>&1
$output | ForEach-Object { Write-Host $_ }
$failed = $output | ForEach-Object {
    if ($_ -match '^FAIL \| ([^ ]+)') { $Matches[1] }
}
Compare-Object ($approved | Sort-Object) ($failed | Sort-Object)
```

Expected: `Compare-Object` prints nothing. If names differ, do not copy any baseline.

- [ ] **Step 3: Copy only approved current files**

```powershell
$approved = @(
  '03-family-trunk','08-child-links','10-loss','12-child-links-single',
  '13-multimarriage-overlap','15-maximal','16-multifamily'
)
foreach ($name in $approved) {
    Copy-Item -LiteralPath (Join-Path 'refactor/golden/current' ($name + '.png')) `
        -Destination (Join-Path 'refactor/golden/baseline' ($name + '.png')) -Force
}
```

- [ ] **Step 4: Rerun the strict Golden gate**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/visual_golden.js
```

Expected: all 16 fixtures pass with zero diff pixels.

- [ ] **Step 5: Commit only the seven baseline images**

```powershell
git add refactor/golden/baseline/03-family-trunk.png `
  refactor/golden/baseline/08-child-links.png `
  refactor/golden/baseline/10-loss.png `
  refactor/golden/baseline/12-child-links-single.png `
  refactor/golden/baseline/13-multimarriage-overlap.png `
  refactor/golden/baseline/15-maximal.png `
  refactor/golden/baseline/16-multifamily.png
git diff --cached --name-only
git commit -m "test: approve safe family route baselines"
```

Expected staged list: exactly seven PNG paths.

---

### Task 4: Run the complete release matrix and update the audit report

**Files:**
- Modify: `docs/audits/2026-07-15-genogram-review-report.md`
- Modify: `refactor/TEST_GATES.md`
- Generated/ignored: `refactor/benchmarks/results/baseline-*.json`

**Interfaces:**
- Consumes all previous plan results.
- Produces final evidence and the updated original-vs-current report.

- [ ] **Step 1: Run every verify script in deterministic order**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
$tests = Get-ChildItem -LiteralPath 'refactor' -File -Filter 'verify_*.js' | Sort-Object Name
foreach ($test in $tests) {
    Write-Host ('RUN ' + $test.Name)
    node $test.FullName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

Expected: every `verify_*.js`, including the five new feature/UX tests and mirror sync, exits 0.

- [ ] **Step 2: Run visual smoke and Golden gates**

```powershell
$env:NODE_PATH='C:\Users\goh2407\.cache\pw-smoke\node_modules'
node refactor/smoke_visual.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node refactor/visual_golden.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

Expected: smoke has zero console/page errors and Golden is 16/16.

- [ ] **Step 3: Run the 200-person performance benchmark**

```powershell
$env:PYTHONIOENCODING='utf-8'
python refactor/benchmarks/fps_bench.py
```

Expected: warm render below 50ms and pan/zoom near 60 FPS. Record warm average, p95, pan/zoom FPS, and cold first-render maximum from the emitted JSON.

- [ ] **Step 4: Update the audit report with actual evidence**

Append a section titled `## 8. 2026-07-15 修正完成紀錄` containing four tables:

1. Resolved items: View controls, Fit, generic add wording, status lifecycle, favicon, Golden baseline, raw MD5, deployment definition.
2. Test evidence: actual counts/results from Steps 1–3.
3. Original-vs-current addendum: View display layers, automatic large-file fit, consistent visual exports, and release gates now added to the comparison.
4. Remaining limits: focus mode, semantic zoom, minimap, root CDN dependency, and the 25% minimum for extremely large diagrams.

Use actual measured numbers and exact commit IDs. Do not write expected values as if they were observed.

- [ ] **Step 5: Update TEST_GATES validation record from evidence**

Set date to `2026-07-15`, branch to the actual current branch from `git branch --show-current`, result to `PASS`, and note the actual total verify-script count, Golden 16/16, MD5 pass, offline pass, and benchmark metrics.

- [ ] **Step 6: Commit the evidence documents**

```powershell
git add refactor/TEST_GATES.md
git add -f docs/audits/2026-07-15-genogram-review-report.md docs/audits/assets
git commit -m "docs: record genogram release verification"
```

- [ ] **Step 7: Perform the final clean-state and scope check**

```powershell
git status --short --branch
git diff 03c64a4 --stat
git log -10 --oneline
```

Expected: no unintended tracked changes; generated current/diff/benchmark artifacts remain ignored; committed scope consists of feature code/tests, UX fixes, seven Golden images, verifier, README/test gates, spec/plans, and audit report/assets.
