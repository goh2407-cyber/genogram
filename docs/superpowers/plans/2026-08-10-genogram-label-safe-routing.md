# Genogram Label-Safe Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓自動與下繞婚姻線在有安全候選時不穿過人物文字，並在使用者強制「一直線」時保留線型、改由整塊文字避讓。

**Architecture:** `getPersonLabelGeometry()` 成為文字繪製、避障與匯出邊界的唯一幾何來源；`prepareDerivedGeometry()` 以確定性順序先決定強制直線的文字 placement，再建立婚姻 route cache。`getMarriageRoute()` 回傳同一份 points、decoration 與親子線 attachment segment，所有螢幕、高亮、hit-test、日期、家庭起點及匯出都只讀這份幾何。

**Tech Stack:** 原生 JavaScript、Canvas 2D、Playwright、Node.js contract scripts、`pngjs`、`pixelmatch`、Windows PowerShell 5.1。

## Global Constraints

- 先完成 `2026-08-10-genogram-release-hardening.md`，再執行本計畫。
- 不修改 Person 座標、JSON schema、history state、臨床符號、關係線型、顏色或虛線間距。
- `routeMode="straight"` 保留現有直線／跨列正交幾何；只移動衍生 label placement。
- 自動候選是有界集合；排序鍵為文字碰撞、線交叉、轉折數、長度、候選名稱，不得使用隨機或無界搜尋。
- 路由障礙預設使用完整姓名／備註，避免切換 view options 就讓線路跳動；真正繪製與裁切邊界使用當前 view options。
- 文字安全邊距為 `7` 世界座標 px，不隨 zoom 變化。
- 根目錄、`geno/`、`refactor/app/` 三份 JS／CSS raw MD5 必須一致；HTML 只允許已知的 `geno` 本地 vendor 差異。
- `geno/` 與 `refactor/app/` 繼續作為 gitignored 本機副本；要複製與驗證，不強制 stage。只有新 golden baseline 依既有規則使用 `git add -f`。
- 實作前使用 superpowers:test-driven-development；觸及 UI 警示時使用 frontend-design；完成前使用 superpowers:verification-before-completion。

---

## File Map

- Create: `refactor/verify_label_routing.js` — notes-only、四種 route mode、直線 label placement、bounds、確定性、screen/export/hit 契約。
- Modify: `js/canvas.js:268-390,722-770,1049-1125,1286-1490,1564-1670,2835-2920,2939-3225,3460-3525,3575-3635,4090-4185,5034-5305` — 共用 label geometry、derived cache、canonical marriage route 與消費者。
- Modify: `js/app.js:4574-4587` — Canvas 字型實際載入後使 derived geometry 失效再繪。
- Modify: `js/domain/family-route-planner.js:32-45,424-511` — 公開磨過的線段／矩形相交與 polyline 交叉計數。
- Modify: `js/app.js` — render 後同步「密集排列無完全解」警示。
- Modify: `index.html` — Canvas container 內新增不進匯出的 `routingWarning` DOM。
- Modify: `css/styles.css` — routing warning 的非臨床 UI 樣式。
- Modify: `refactor/verify_marriage_geom.js` — 從固定 4 點與中心垂直腿，改驗 cardinal port、dogleg、文字不相交。
- Modify: `refactor/verify_view_rendering.js` — hidden name 但 notes 可見的 layout 契約。
- Modify: `refactor/verify_family_routing.js` — 家庭起點使用 canonical attachment segment。
- Modify: `refactor/visual_golden.js` — 新增 `17-label-routing` fixture。
- Create after visual review: `refactor/golden/baseline/17-label-routing.png`.
- Modify: `refactor/TEST_GATES.md` — 新增 label routing 與 golden 更新準則。
- Mirror: `geno/` 與 `refactor/app/` 對應 HTML、CSS、JS。

## Shared Test Environment

```powershell
$env:NODE_PATH = 'C:\Users\goh2407\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules;C:\Users\goh2407\.agents\skills\playwright-skill\node_modules'
node -e "require('playwright'); require('pngjs'); require('pixelmatch'); console.log('routing test dependencies ok')"
```

Expected: `routing test dependencies ok`. If a module is missing, record the gate as blocked; do not update golden baselines.

---

### Task 1: Establish One Person Label Geometry

**Files:**
- Create: `refactor/verify_label_routing.js`
- Modify: `js/canvas.js:722-770,1286-1296,2835-2875,3480-3525`
- Modify: `refactor/verify_view_rendering.js`
- Mirror: `geno/js/canvas.js`, `refactor/app/js/canvas.js`

**Interfaces:**
- Produces: `getPersonLabelGeometry(person, viewOptions = {}, placement = undefined)`.
- Produces: `{ rows, bounds, placement }`; each row is `{ kind, text, font, fontSize, x, y, width, height, bounds }`.
- Produces: `invalidateDerivedGeometry()` for font-metric changes.
- Preserves: `getPersonTextLayout()` as a compatibility adapter during this task; delete only after `rg` confirms no consumer needs its old shape.

- [ ] **Step 1: Add RED assertions for notes-only and horizontal export bounds**

Create `refactor/verify_label_routing.js` with this first contract:

```js
const { openApp, createChecks, finish } = require('./contract_harness');

(async () => {
    const { browser, page, errors } = await openApp({ width: 1280, height: 820 });
    const { failures, passes, check } = createChecks();

    const result = await page.evaluate(() => {
        const app = window.app;
        const canvas = app.canvas;
        const notesOnly = new Person({
            id: 'notes-only', x: 180, y: 220, gender: 'male', name: '',
            age: 62, notes: '雙相情緒障礙症\n（精神中度障礙）'
        });
        const longLeft = new Person({
            id: 'long-left', x: 42, y: 450, gender: 'female', name: '',
            notes: '這是一段必須被納入左右匯出邊界的長備註'
        });
        app.persons = [notesOnly, longLeft];
        app.relationships = [];
        app._syncPersonMap();
        app.render();

        const full = canvas.getPersonLabelGeometry(notesOnly,
            { showNames: true, showNotes: true }, { side: 'below' });
        const hiddenName = canvas.getPersonLabelGeometry(notesOnly,
            { showNames: false, showNotes: true }, { side: 'below' });
        const bounds = canvas.getContentBounds(app.persons, [], [], [],
            { showNames: true, showNotes: true });
        const longLabel = canvas.getPersonLabelGeometry(longLeft,
            { showNames: true, showNotes: true }, { side: 'below' });
        const obstacles = canvas.getPersonRouteObstacles(app.persons)
            .filter(rect => rect.ownerId === notesOnly.id && rect.kind === 'text');

        return {
            full, hiddenName, bounds, longLabel, obstacleCount: obstacles.length,
            symbolBottom: notesOnly.y + canvas.personSize / 2
        };
    });

    check('notes-only creates two rows', result.full.rows.length === 2,
        JSON.stringify(result.full.rows));
    check('notes-only first row starts at the normal label top',
        result.full.rows[0].y === result.symbolBottom + 8,
        `rowY=${result.full.rows[0].y} symbolBottom=${result.symbolBottom}`);
    check('hiding an absent name keeps both note rows at the first row',
        result.hiddenName.rows.length === 2
            && result.hiddenName.rows[0].y === result.symbolBottom + 8,
        JSON.stringify(result.hiddenName.rows));
    check('route obstacles include every visible notes-only row',
        result.obstacleCount === 2, `count=${result.obstacleCount}`);
    check('content bounds include label minX',
        result.bounds.minX <= result.longLabel.bounds.left,
        `minX=${result.bounds.minX} labelLeft=${result.longLabel.bounds.left}`);
    check('content bounds include label maxX',
        result.bounds.maxX >= result.longLabel.bounds.right,
        `maxX=${result.bounds.maxX} labelRight=${result.longLabel.bounds.right}`);
    check('zero page/console errors', errors.length === 0, errors.join(' | '));
    await finish(browser, passes, failures, 'ALL LABEL ROUTING CHECKS PASSED');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
```

- [ ] **Step 2: Run the new contract and verify RED**

```powershell
node refactor/verify_label_routing.js
```

Expected: FAIL because `getPersonLabelGeometry` does not exist, notes-only route obstacles are omitted, and content bounds ignore label width.

- [ ] **Step 3: Implement measured rows and aggregate bounds**

Add constants near the existing person drawing constants:

```js
static LABEL_SAFE_MARGIN = 7;
static LABEL_SIDE_GAP = 12;

getPersonLabelGeometry(person, options = {}, placement = undefined) {
    const view = this.normalizeViewOptions(options);
    const resolved = placement === undefined
        ? (this.personLabelPlacements?.get(String(person.id)) || { side: 'below' })
        : placement;
    const name = view.showNames ? String(person.name || '') : '';
    const noteLines = view.showNotes && person.notes
        ? String(person.notes).split('\n').filter(Boolean).slice(0, 2)
        : [];
    const specs = [];
    if (name) {
        specs.push({ kind: 'name', text: name, fontSize: this.fontSize,
            font: `${this.fontSize}px ${this.fontFamily}`, lineHeight: this.fontSize + 4 });
    }
    noteLines.forEach(text => {
        const fontSize = this.fontSize * 0.8;
        specs.push({ kind: 'note', text, fontSize,
            font: `${fontSize}px ${this.fontFamily}`, lineHeight: fontSize + 2 });
    });

    this.ctx.save();
    const measured = specs.map(spec => {
        this.ctx.font = spec.font;
        return { ...spec, width: this.ctx.measureText(spec.text).width };
    });
    this.ctx.restore();

    const blockWidth = measured.reduce((max, row) => Math.max(max, row.width), 0);
    const half = this.personSize / 2;
    const side = ['below', 'left', 'right'].includes(resolved?.side)
        ? resolved.side : 'below';
    let centerX = person.x;
    if (side === 'left') {
        centerX = person.x - half - GenogramCanvas.LABEL_SIDE_GAP - blockWidth / 2;
    } else if (side === 'right') {
        centerX = person.x + half + GenogramCanvas.LABEL_SIDE_GAP + blockWidth / 2;
    }
    centerX += Number.isFinite(resolved?.offsetX) ? resolved.offsetX : 0;
    let cursorY = person.y + half + 8
        + (Number.isFinite(resolved?.offsetY) ? resolved.offsetY : 0);
    const rows = measured.map(row => {
        const y = cursorY;
        const bounds = {
            left: centerX - row.width / 2,
            right: centerX + row.width / 2,
            top: y,
            bottom: y + row.fontSize
        };
        cursorY += row.lineHeight;
        return { ...row, x: centerX, y, height: row.fontSize,
            baseline: 'top', bounds };
    });
    const bounds = rows.length ? {
        left: Math.min(...rows.map(row => row.bounds.left)),
        right: Math.max(...rows.map(row => row.bounds.right)),
        top: Math.min(...rows.map(row => row.bounds.top)),
        bottom: Math.max(...rows.map(row => row.bounds.bottom))
    } : null;
    return {
        rows,
        bounds,
        anchor: { x: person.x, y: person.y + half + 8 },
        placement: { side, x: centerX,
            offsetX: resolved?.offsetX || 0, offsetY: resolved?.offsetY || 0 }
    };
}
```

Refactor `drawPersonText()` to iterate `geometry.rows`, select the existing name/note fill and halo by `row.kind`, and draw each row at `row.x, row.y`. Keep `textAlign='center'` and `textBaseline='top'`.

Replace `_labelBottomY()` with:

```js
_labelBottomY(person) {
    const geometry = this.getPersonLabelGeometry(person,
        { showNames: true, showNotes: true });
    return geometry.bounds?.bottom ?? (person.y + this.personSize / 2);
}
```

Replace the duplicated name/note measurement in `getPersonRouteObstacles()` with one obstacle per row:

```js
const label = this.getPersonLabelGeometry(person,
    { showNames: true, showNotes: true });
label.rows.forEach(row => obstacles.push({
    ownerId: String(person.id),
    kind: 'text',
    left: row.bounds.left - GenogramCanvas.LABEL_SAFE_MARGIN,
    right: row.bounds.right + GenogramCanvas.LABEL_SAFE_MARGIN,
    top: row.bounds.top - GenogramCanvas.LABEL_SAFE_MARGIN,
    bottom: row.bounds.bottom + GenogramCanvas.LABEL_SAFE_MARGIN
}));
```

In `_calculateContentBounds()`, replace `getPersonTextLayout()` height math with:

```js
const label = this.getPersonLabelGeometry(p, view);
if (label.bounds) {
    minX = Math.min(minX, label.bounds.left);
    minY = Math.min(minY, label.bounds.top);
    maxX = Math.max(maxX, label.bounds.right);
    maxY = Math.max(maxY, label.bounds.bottom);
}
```

Keep `getPersonTextLayout()` only as this adapter until every existing caller is migrated:

```js
getPersonTextLayout(person, options = {}) {
    const geometry = this.getPersonLabelGeometry(person, options);
    const nameRow = geometry.rows.find(row => row.kind === 'name');
    const noteRows = geometry.rows.filter(row => row.kind === 'note');
    return {
        name: nameRow?.text || '',
        noteLines: noteRows.map(row => row.text),
        nameY: geometry.rows[0]?.y ?? (person.y + this.personSize / 2 + 8),
        noteStartY: noteRows[0]?.y ?? (geometry.rows[0]?.y ?? person.y)
    };
}
```

Add a cache invalidator:

```js
invalidateDerivedGeometry() {
    this._derivedGeometrySignature = null;
    this.personLabelPlacements = new Map();
    this.marriageRouteCache = new Map();
    this.labelRoutingWarnings = [];
}
```

In `waitForCurrentCanvasFonts()` immediately before its repaint render, invalidate measured geometry:

```js
if (repaint && signature === this._canvasFontSignature) {
    this.canvas?.invalidateDerivedGeometry?.();
    this.render();
}
```

- [ ] **Step 4: Extend the view contract and verify GREEN**

In `refactor/verify_view_rendering.js`, add a notes-only person and assert `showNames:false, showNotes:true` returns note rows whose first `y` is `person.y + personSize/2 + 8`.

```powershell
node refactor/verify_label_routing.js
node refactor/verify_view_rendering.js
node refactor/verify_family_routing.js
node refactor/verify_view_export.js
node refactor/verify_canvas_font.js
```

Expected: all four scripts exit 0 and the new script prints `ALL LABEL ROUTING CHECKS PASSED`.

- [ ] **Step 5: Synchronize and commit Task 1**

```powershell
Copy-Item -LiteralPath 'js\canvas.js' -Destination 'geno\js\canvas.js' -Force
Copy-Item -LiteralPath 'js\canvas.js' -Destination 'refactor\app\js\canvas.js' -Force
Copy-Item -LiteralPath 'js\app.js' -Destination 'geno\js\app.js' -Force
Copy-Item -LiteralPath 'js\app.js' -Destination 'refactor\app\js\app.js' -Force
node refactor/verify_mirror_sync.js
git add js/canvas.js js/app.js refactor/verify_label_routing.js refactor/verify_view_rendering.js
git commit -m "refactor: unify person label geometry"
```

---

### Task 2: Move Labels for Forced Straight Routes

**Files:**
- Modify: `js/canvas.js:268-390,722-770,3460-3525`
- Modify: `js/domain/family-route-planner.js:424-511`
- Extend: `refactor/verify_label_routing.js`
- Mirror: both `canvas.js` and `family-route-planner.js` copies

**Interfaces:**
- Produces: `prepareDerivedGeometry(persons, relationships, { force = false } = {})`.
- Produces: `personLabelPlacements: Map<string, { side, offsetX, offsetY }>`.
- Produces: `labelRoutingWarnings: Array<{ personId, reason, collisions }>`.
- Produces: `FamilyRoutePlanner.segmentIntersectsRect(a, b, rect)` and `pathIntersectionCount(points, obstacles, allowedSymbolOwnerIds)`.

- [ ] **Step 1: Add RED forced-straight assertions**

Extend the browser-side fixture in `verify_label_routing.js` with three people and one forced cross-row route:

```js
const lineA = new Person({ id: 'line-a', x: 300, y: 500, gender: 'male', name: 'A' });
const lineB = new Person({ id: 'line-b', x: 820, y: 680, gender: 'female', name: 'B' });
const crossed = new Person({ id: 'crossed', x: 560, y: 525, gender: 'male', name: '',
    notes: '強制直線時整塊文字必須移位\n不能改變使用者指定的線' });
const straight = new Relationship({ id: 'straight', fromPersonId: lineA.id,
    toPersonId: lineB.id, type: 'married', routeMode: 'straight' });
app.persons.push(lineA, lineB, crossed);
app.relationships.push(straight);
app._syncPersonMap();
canvas.prepareDerivedGeometry(app.persons, app.relationships, { force: true });
const straightConfig = canvas.getMarriageConfiguration(lineA, lineB, straight, app.relationships);
const straightPath = canvas.getMarriageGeometry(lineA, lineB, straightConfig).points;
const moved = canvas.getPersonLabelGeometry(crossed,
    { showNames: true, showNotes: true });
const movedHitCount = straightPath.slice(1).reduce((count, point, index) => count
    + (FamilyRoutePlanner.segmentIntersectsRect(straightPath[index], point, moved.bounds) ? 1 : 0), 0);
```

Return and assert:

```js
check('forced straight keeps its existing path shape', result.straightPath.length === 4,
    JSON.stringify(result.straightPath));
check('colliding notes move as one block', ['left', 'right'].includes(result.moved.placement.side),
    JSON.stringify(result.moved.placement));
check('moved label no longer intersects forced straight route', result.movedHitCount === 0,
    `hits=${result.movedHitCount}`);
check('derived placement never mutates Person JSON',
    result.crossedJSON.x === 560 && result.crossedJSON.y === 525
        && !Object.hasOwn(result.crossedJSON, 'labelPlacement'),
    JSON.stringify(result.crossedJSON));
```

Expected RED: no derived-geometry API exists and the default label intersects the cross-row segment.

- [ ] **Step 2: Expose tested geometry primitives**

Add to `FamilyRoutePlanner` without changing the existing private implementations:

```js
static segmentIntersectsRect(a, b, rect) {
    const normalized = this._normalizeObstacles([rect]);
    return normalized.length === 1 && this._segmentIntersectsRect(a, b, normalized[0]);
}

static pathIntersectionCount(points, obstacles = [], allowedSymbolOwnerIds = new Set()) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    const allowed = allowedSymbolOwnerIds instanceof Set
        ? allowedSymbolOwnerIds : new Set(allowedSymbolOwnerIds || []);
    const rects = this._normalizeObstacles(obstacles);
    let count = 0;
    for (let index = 1; index < points.length; index++) {
        for (const rect of rects) {
            if (rect.kind === 'symbol' && allowed.has(rect.ownerId)) continue;
            if (this._segmentIntersectsRect(points[index - 1], points[index], rect)) count++;
        }
    }
    return count;
}
```

- [ ] **Step 3: Precompute deterministic label placements**

Add initialization in the canvas constructor:

```js
this.personLabelPlacements = new Map();
this.marriageRouteCache = new Map();
this.labelRoutingWarnings = [];
this._derivedGeometrySignature = null;
```

Add these helpers to `GenogramCanvas`:

```js
_pathHitsRect(points, rect) {
    return points.slice(1).some((point, index) =>
        FamilyRoutePlanner.segmentIntersectsRect(points[index], point, rect));
}

_labelPlacementCandidates(person) {
    return [{ side: 'left' }, { side: 'right' }].map(placement => ({
        placement,
        geometry: this.getPersonLabelGeometry(person,
            { showNames: true, showNotes: true }, placement)
    }));
}

_placeLabelsForForcedStraight(persons, relationships) {
    const sortedPeople = [...persons]
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const defaultBounds = new Map(sortedPeople.map(person => [String(person.id),
        this.getPersonLabelGeometry(person,
            { showNames: true, showNotes: true }, { side: 'below' }).bounds]));
    const straightRoutes = relationships
        .filter(rel => Relationship.getCategory(rel.type) === 'marriage'
            && (rel.routeMode || 'auto') === 'straight')
        .map(rel => {
            const from = this.personMap.get(rel.fromPersonId);
            const to = this.personMap.get(rel.toPersonId);
            if (!from || !to) return null;
            const config = this.getMarriageConfiguration(from, to, rel, relationships);
            return { rel, points: this.getMarriageGeometry(from, to, config).points };
        }).filter(Boolean);
    const placedBounds = new Map();
    sortedPeople.forEach(person => {
        const below = this.getPersonLabelGeometry(person,
            { showNames: true, showNotes: true }, { side: 'below' });
        if (!below.bounds || !straightRoutes.some(route => this._pathHitsRect(route.points, below.bounds))) {
            if (below.bounds) placedBounds.set(String(person.id), below.bounds);
            return;
        }
        const symbolObstacles = this.getSymbolRouteObstacles(persons);
        const otherLabelObstacles = sortedPeople
            .filter(other => String(other.id) !== String(person.id))
            .map(other => {
                const bounds = placedBounds.get(String(other.id))
                    || defaultBounds.get(String(other.id));
                return bounds ? { ownerId: String(other.id), ...bounds } : null;
            })
            .filter(Boolean);
        const candidates = this._labelPlacementCandidates(person).map((candidate, order) => {
            const rect = candidate.geometry.bounds;
            const routeHits = straightRoutes.reduce((sum, route) =>
                sum + (this._pathHitsRect(route.points, rect) ? 1 : 0), 0);
            const obstacleHits = [...symbolObstacles, ...otherLabelObstacles].reduce((sum, obstacle) =>
                sum + (String(obstacle.ownerId) !== String(person.id)
                    && this._rectsOverlap(rect, obstacle) ? 1 : 0), 0);
            return { ...candidate, order, collisions: routeHits + obstacleHits };
        }).sort((a, b) => a.collisions - b.collisions || a.order - b.order);
        const winner = candidates[0];
        this.personLabelPlacements.set(String(person.id), winner.placement);
        placedBounds.set(String(person.id), winner.geometry.bounds);
        if (winner.collisions > 0) {
            this.labelRoutingWarnings.push({ personId: String(person.id),
                reason: 'forced-straight-label-collision', collisions: winner.collisions });
        }
    });
}
```

Use this rectangle helper for candidate overlap:

```js
_rectsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
```

Split the existing symbol part of `getPersonRouteObstacles()` into `getSymbolRouteObstacles(persons)`, then make `getPersonRouteObstacles()` concatenate symbol obstacles with measured label-row obstacles. This prevents placement scoring from recursively rebuilding labels.

Implement `prepareDerivedGeometry()` as the only cache reset entry:

```js
prepareDerivedGeometry(persons, relationships, { force = false } = {}) {
    const signature = this._getFamilyRouteSignature(persons, relationships);
    if (!force && signature === this._derivedGeometrySignature) return;
    this._derivedGeometrySignature = signature;
    this.personLabelPlacements = new Map();
    this.marriageRouteCache = new Map();
    this.labelRoutingWarnings = [];
    this._placeLabelsForForcedStraight(persons, relationships);
}
```

Call it in `render()` after `personMap` is ready and before relationship drawing. Also call it at the beginning of `_calculateContentBounds()` so direct export and bounds consumers cannot observe stale geometry.

- [ ] **Step 4: Verify persistence isolation and determinism**

Extend the contract to call `prepareDerivedGeometry(app.persons, app.relationships, { force:true })` three times, serialize sorted placements each time, and assert all strings are equal. Capture `app.getState()` before and after the three calls and assert byte-for-byte equality.

```powershell
node refactor/verify_label_routing.js
node refactor/verify_label_routing.js
node refactor/verify_family_routing.js
```

Expected: all exit 0; forced straight points remain unchanged and the crossed text moves deterministically.

- [ ] **Step 5: Synchronize and commit Task 2**

```powershell
Copy-Item -LiteralPath 'js\canvas.js' -Destination 'geno\js\canvas.js' -Force
Copy-Item -LiteralPath 'js\canvas.js' -Destination 'refactor\app\js\canvas.js' -Force
Copy-Item -LiteralPath 'js\domain\family-route-planner.js' -Destination 'geno\js\domain\family-route-planner.js' -Force
Copy-Item -LiteralPath 'js\domain\family-route-planner.js' -Destination 'refactor\app\js\domain\family-route-planner.js' -Force
node refactor/verify_mirror_sync.js
git add js/canvas.js js/domain/family-route-planner.js refactor/verify_label_routing.js
git commit -m "fix: move labels around forced straight routes"
```

---

### Task 3: Route Under-Marriage Legs Around Labels

**Files:**
- Modify: `js/canvas.js:1049-1125,1299-1490,1564-1670,3575-3635,4090-4185,5034-5305`
- Modify: `js/domain/family-route-planner.js`
- Modify: `refactor/verify_marriage_geom.js`
- Modify: `refactor/verify_family_routing.js`
- Extend: `refactor/verify_label_routing.js`
- Mirror: corresponding JS copies

**Interfaces:**
- Produces: `getMarriageRoute(fromPerson, toPerson, relationship, allRelationships)`.
- Returns: `{ config, points, decoration, attachmentSegment, candidateName }`.
- `attachmentSegment` is `{ start, end }` and is the only source range for a two-parent family trunk.

- [ ] **Step 1: Add RED multi-partner and under-dogleg assertions**

Extend the fixture with the approved 62-year-old notes-only hub and explicit IDs:

```js
const hub = new Person({ id: 'hub-62', x: 600, y: 240, gender: 'male', name: '', age: 62,
    notes: '雙相情緒障礙症\n（精神中度障礙）' });
const left = new Person({ id: 'spouse-left', x: 350, y: 240, gender: 'female', name: '左側伴侶' });
const rightNear = new Person({ id: 'spouse-right-near', x: 820, y: 240,
    gender: 'female', name: '右側伴侶一' });
const rightFar = new Person({ id: 'spouse-right-far', x: 1040, y: 240,
    gender: 'female', name: '右側伴侶二' });
const relAuto = new Relationship({ id: 'route-auto', fromPersonId: left.id,
    toPersonId: hub.id, type: 'married', routeMode: 'auto' });
const relOver = new Relationship({ id: 'route-over', fromPersonId: hub.id,
    toPersonId: rightFar.id, type: 'divorced', routeMode: 'over' });
const relUnder = new Relationship({ id: 'route-under', fromPersonId: hub.id,
    toPersonId: rightNear.id, type: 'cohabiting', routeMode: 'under' });
const autoA = new Person({ id: 'auto-a', x: 300, y: 780, gender: 'male', name: 'AUTO A' });
const autoB = new Person({ id: 'auto-b', x: 820, y: 960, gender: 'female', name: 'AUTO B' });
const autoCrossed = new Person({ id: 'auto-crossed', x: 560, y: 805, gender: 'male', name: '',
    notes: '自動模式必須選擇安全候選\n不得穿過這兩行文字' });
const autoCrossingRel = new Relationship({ id: 'route-auto-crossing',
    fromPersonId: autoA.id, toPersonId: autoB.id, type: 'married', routeMode: 'auto' });
app.persons.push(hub, left, rightNear, rightFar, autoA, autoB, autoCrossed);
app.relationships.push(relAuto, relOver, relUnder, autoCrossingRel);
app._syncPersonMap();
canvas.prepareDerivedGeometry(app.persons, app.relationships, { force: true });
const underRoute = canvas.getMarriageRoute(hub, rightNear, relUnder, app.relationships);
const autoSafeRoute = canvas.getMarriageRoute(autoA, autoB, autoCrossingRel, app.relationships);
const allTextObstacles = canvas.getPersonRouteObstacles(app.persons)
    .filter(rect => rect.kind === 'text');
const underTextHits = FamilyRoutePlanner.pathIntersectionCount(
    underRoute.points, allTextObstacles);
const autoTextHits = FamilyRoutePlanner.pathIntersectionCount(
    autoSafeRoute.points, allTextObstacles);
const relationshipPath = canvas.getRelationshipPath(hub, rightNear, relUnder, app.relationships);
const attachmentMid = {
    x: (underRoute.attachmentSegment.start.x + underRoute.attachmentSegment.end.x) / 2,
    y: underRoute.attachmentSegment.start.y
};
const attachmentHit = canvas.isPointOnRelationship(attachmentMid.x, attachmentMid.y,
    hub, rightNear, relUnder, 10, app.relationships);
const drawnPaths = [];
const originalDrawMarriagePath = canvas.drawMarriagePath;
canvas.drawMarriagePath = function(points, decoration, style) {
    drawnPaths.push(points.map(point => ({ ...point })));
    return originalDrawMarriagePath.call(this, points, decoration, style);
};
canvas.drawRelationship(hub, rightNear, relUnder, true, app.persons, app.relationships);
canvas.drawMarriagePath = originalDrawMarriagePath;
const routeBeforeExport = JSON.stringify(underRoute.points);
const exportDataUrl = canvas.exportToPNG(app.persons, app.relationships,
    [], [], true, false, 1, app.viewOptions);
const routeAfterExport = JSON.stringify(
    canvas.getMarriageRoute(hub, rightNear, relUnder, app.relationships).points);
const fullViewRoute = routeAfterExport;
app.viewOptions = { ...app.viewOptions, showNames: false, showNotes: false };
app.render();
const hiddenViewRoute = JSON.stringify(
    canvas.getMarriageRoute(hub, rightNear, relUnder, app.relationships).points);
```

Add these exact fields to the existing browser-evaluate return object:

```js
underRoute,
autoSafeRoute,
underTextHits,
autoTextHits,
hub: { x: hub.x, y: hub.y },
rightNear: { x: rightNear.x, y: rightNear.y },
half: canvas.personSize / 2,
hubLabelBottom: canvas.getPersonLabelGeometry(hub,
    { showNames: true, showNotes: true }).bounds.bottom,
relationshipPath,
attachmentHit,
drawnPaths,
routeBeforeExport,
routeAfterExport,
exportPrefix: exportDataUrl.slice(0, 22),
fullViewRoute,
hiddenViewRoute
```

Assert all of the following:

```js
check('under route starts and ends at cardinal bottom ports',
    result.underRoute.points[0].x === result.hub.x
        && result.underRoute.points[0].y === result.hub.y + result.half
        && result.underRoute.points.at(-1).x === result.rightNear.x
        && result.underRoute.points.at(-1).y === result.rightNear.y + result.half,
    JSON.stringify(result.underRoute.points));
check('under route adds side doglegs instead of label-crossing center legs',
    result.underRoute.points.length >= 8,
    JSON.stringify(result.underRoute.points));
check('safe under route has zero text intersections', result.underTextHits === 0,
    `hits=${result.underTextHits}`);
check('attachment segment is the actual under-route bar',
    result.underRoute.attachmentSegment.start.y === result.underRoute.attachmentSegment.end.y
        && result.underRoute.attachmentSegment.start.y > result.hubLabelBottom,
    JSON.stringify(result.underRoute.attachmentSegment));
check('auto route replaces a colliding direct candidate with a safe candidate',
    result.autoTextHits === 0 && result.autoSafeRoute.candidateName !== 'direct',
    JSON.stringify(result.autoSafeRoute));
check('draw, selected highlight and hit path share canonical points',
    JSON.stringify(result.relationshipPath) === JSON.stringify(result.underRoute.points)
        && result.drawnPaths.length >= 2
        && result.drawnPaths.every(points => JSON.stringify(points)
            === JSON.stringify(result.underRoute.points))
        && result.attachmentHit,
    JSON.stringify(result.drawnPaths));
check('export reuses the same canonical route',
    result.exportPrefix === 'data:image/png;base64,'
        && result.routeBeforeExport === result.routeAfterExport,
    `${result.routeBeforeExport} != ${result.routeAfterExport}`);
check('view-option toggles do not make routes jump',
    result.fullViewRoute === result.hiddenViewRoute,
    `${result.fullViewRoute} != ${result.hiddenViewRoute}`);
```

Expected RED: current under route has four points and its hub-centered vertical leg crosses the notes-only label.

- [ ] **Step 2: Add finite under-route candidates and scoring**

Add public helpers in `FamilyRoutePlanner`:

```js
static pathLength(points) {
    return (points || []).slice(1).reduce((total, point, index) =>
        total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}

static pathBendCount(points) {
    let bends = 0;
    for (let index = 2; index < (points || []).length; index++) {
        const a = points[index - 2], b = points[index - 1], c = points[index];
        const firstHorizontal = Math.abs(a.y - b.y) <= 1e-9;
        const secondHorizontal = Math.abs(b.y - c.y) <= 1e-9;
        if (firstHorizontal !== secondHorizontal) bends++;
    }
    return bends;
}

static polylineCrossingCount(points, occupiedSegments = []) {
    let count = 0;
    const samePoint = (a, b) => Math.abs(a.x - b.x) <= 1e-9
        && Math.abs(a.y - b.y) <= 1e-9;
    for (let index = 1; index < (points || []).length; index++) {
        const a = points[index - 1], b = points[index];
        occupiedSegments.forEach(segment => {
            if (samePoint(a, segment.start) || samePoint(a, segment.end)
                || samePoint(b, segment.start) || samePoint(b, segment.end)) return;
            if (this._segmentsIntersect(a, b, segment.start, segment.end)) count++;
        });
    }
    return count;
}
```

Add candidate creation to `GenogramCanvas`:

```js
_underMarriageCandidates(fromPerson, toPerson, barY, textObstacles) {
    const fromBottom = fromPerson.getConnectionPoint('bottom');
    const toBottom = toPerson.getConnectionPoint('bottom');
    const fromLabel = this.getPersonLabelGeometry(fromPerson,
        { showNames: true, showNotes: true }).bounds;
    const toLabel = this.getPersonLabelGeometry(toPerson,
        { showNames: true, showNotes: true }).bounds;
    const margin = GenogramCanvas.LABEL_SAFE_MARGIN;
    const allLeft = Math.min(...textObstacles.map(rect => rect.left), fromPerson.x, toPerson.x) - margin;
    const allRight = Math.max(...textObstacles.map(rect => rect.right), fromPerson.x, toPerson.x) + margin;
    const fromToward = fromPerson.x <= toPerson.x
        ? (fromLabel?.right ?? fromPerson.x) + margin
        : (fromLabel?.left ?? fromPerson.x) - margin;
    const toToward = fromPerson.x <= toPerson.x
        ? (toLabel?.left ?? toPerson.x) - margin
        : (toLabel?.right ?? toPerson.x) + margin;
    const pairs = [
        ['inner', fromToward, toToward],
        ['outer-left', allLeft, toToward],
        ['outer-right', fromToward, allRight]
    ];
    return pairs.map(([name, fromLaneX, toLaneX]) => {
        const fromEscapeY = fromBottom.y + 1;
        const toEscapeY = toBottom.y + 1;
        const points = FamilyRoutePlanner.cleanPath([
            fromBottom,
            { x: fromBottom.x, y: fromEscapeY },
            { x: fromLaneX, y: fromEscapeY },
            { x: fromLaneX, y: barY },
            { x: toLaneX, y: barY },
            { x: toLaneX, y: toEscapeY },
            { x: toBottom.x, y: toEscapeY },
            toBottom
        ]);
        return { name, points, decoration: { x: (fromLaneX + toLaneX) / 2, y: barY },
            attachmentSegment: {
                start: { x: fromLaneX, y: barY },
                end: { x: toLaneX, y: barY }
            } };
    });
}
```

When no text obstacle exists, calculate `allLeft/allRight` from the two endpoint X values rather than calling `Math.min(...[])` or `Math.max(...[])`.

Score each candidate exactly as follows and sort by tuple; do not collapse it into a floating-point weighted score:

```js
const score = candidate => [
    FamilyRoutePlanner.pathIntersectionCount(candidate.points, obstacles,
        new Set([String(fromPerson.id), String(toPerson.id)])),
    FamilyRoutePlanner.polylineCrossingCount(candidate.points, occupiedSegments),
    FamilyRoutePlanner.pathBendCount(candidate.points),
    FamilyRoutePlanner.pathLength(candidate.points),
    candidate.name
];
const compareRouteScoreTuples = (a, b) => {
    for (let index = 0; index < a.length; index++) {
        if (a[index] < b[index]) return -1;
        if (a[index] > b[index]) return 1;
    }
    return 0;
};
```

Add the matching canvas method:

```js
_marriageCandidateScore(candidate, obstacles, occupiedSegments, fromPerson, toPerson) {
    return [
        FamilyRoutePlanner.pathIntersectionCount(candidate.points, obstacles,
            new Set([String(fromPerson.id), String(toPerson.id)])),
        FamilyRoutePlanner.polylineCrossingCount(candidate.points, occupiedSegments),
        FamilyRoutePlanner.pathBendCount(candidate.points),
        FamilyRoutePlanner.pathLength(candidate.points),
        candidate.name
    ];
}
```

The `allowedOwnerIds` exception applies only to endpoint `kind:'symbol'` rectangles because `pathIntersectionCount()` already distinguishes kind. Endpoint text remains a collision.

- [ ] **Step 3: Introduce and populate the canonical route cache**

Add:

```js
getMarriageRoute(fromPerson, toPerson, relationship, allRelationships = []) {
    let cached = this.marriageRouteCache?.get(String(relationship.id));
    if (cached) return cached;
    const persons = this.lastPersons?.length
        ? this.lastPersons : Array.from(this.personMap?.values?.() || []);
    if (persons.length && allRelationships.length) {
        this.prepareDerivedGeometry(persons, allRelationships);
        cached = this.marriageRouteCache?.get(String(relationship.id));
        if (cached) return cached;
    }
    const config = this.getMarriageConfiguration(fromPerson, toPerson,
        relationship, allRelationships);
    const geometry = this.getMarriageGeometry(fromPerson, toPerson, config);
    return { config, ...geometry, candidateName: 'uncached' };
}

_prepareMarriageRoutes(persons, relationships) {
    const occupiedSegments = [];
    const obstacles = this.getPersonRouteObstacles(persons);
    relationships
        .filter(rel => Relationship.getCategory(rel.type) === 'marriage')
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .forEach(rel => {
            const from = this.personMap.get(rel.fromPersonId);
            const to = this.personMap.get(rel.toPersonId);
            if (!from || !to) return;
            const config = this.getMarriageConfiguration(from, to, rel, relationships);
            let geometry;
            let candidateName = 'direct';
            const routeMode = rel.routeMode || 'auto';
            const directGeometry = config.isArch ? null : this.getMarriageGeometry(from, to, config);
            const directHits = directGeometry
                ? FamilyRoutePlanner.pathIntersectionCount(directGeometry.points,
                    obstacles, new Set([String(from.id), String(to.id)]))
                : Number.POSITIVE_INFINITY;
            if (config.isArch || (routeMode === 'auto' && directHits > 0)) {
                const endpointIds = new Set([String(from.id), String(to.id)]);
                const directCollisionRects = directGeometry
                    ? obstacles.filter(rect => rect.kind === 'text'
                        && (endpointIds.has(String(rect.ownerId))
                            || this._pathHitsRect(directGeometry.points, rect)))
                    : [];
                const fallbackBottom = Math.max(from.y, to.y) + this.personSize / 2;
                const underBarY = Number.isFinite(config.archBarY)
                    ? config.archBarY
                    : Math.max(fallbackBottom,
                        ...directCollisionRects.map(rect => rect.bottom)) + 14;
                const candidates = this._underMarriageCandidates(from, to,
                    underBarY, obstacles);
                if (!config.isArch && routeMode === 'auto') {
                    const topY = Math.min(from.y, to.y) - this.personSize / 2
                        - 20 - 30 * Math.max(config.level || 0, 1);
                    const overConfig = { ...config, isArch: false, isBridge: true,
                        bridgeY: topY, archBarY: null };
                    const overGeometry = this.getMarriageGeometry(from, to, overConfig);
                    candidates.push({ name: 'auto-over', ...overGeometry });
                }
                candidates.sort((a, b) => compareRouteScoreTuples(
                    this._marriageCandidateScore(a, obstacles, occupiedSegments, from, to),
                    this._marriageCandidateScore(b, obstacles, occupiedSegments, from, to)));
                geometry = candidates[0];
                candidateName = geometry.name;
            } else {
                geometry = directGeometry;
            }
            const route = { config, points: geometry.points,
                decoration: geometry.decoration,
                attachmentSegment: geometry.attachmentSegment,
                candidateName };
            this.marriageRouteCache.set(String(rel.id), route);
            route.points.slice(1).forEach((point, index) => occupiedSegments.push({
                relationshipId: String(rel.id), start: route.points[index], end: point
            }));
        });
}
```

At the end of the existing `prepareDerivedGeometry()` implementation, add `this._prepareMarriageRoutes(persons, relationships);`. This call is introduced in Task 3 together with the method, so Task 2 remains independently green.

Place `compareRouteScoreTuples` at file scope so `_prepareMarriageRoutes()` calls the exact helper shown above.

Extend every non-arch result from `getMarriageGeometry()` with the correct `attachmentSegment`:

- bridge: points 1→2;
- same-row direct: points 0→1;
- cross-row orthogonal: choose the longer of points 0→1 and points 2→3; on equal length choose the first;
- under: supplied by the selected candidate.

- [ ] **Step 4: Migrate every geometry consumer**

Use `rg -n "getMarriageConfiguration|getMarriageGeometry" js/canvas.js` as a finite checklist. After this step, calls may remain only inside `_placeLabelsForForcedStraight()`, `getMarriageRoute()`, `_prepareMarriageRoutes()`, unit-level compatibility code, and the two method definitions.

Perform these exact migrations:

- `drawRelationshipDate()` reads `route.points` and `route.decoration`.
- `drawRelationship()` uses the route once for selected highlight and main stroke.
- `_getFamilySource()` uses `const minX = Math.min(route.attachmentSegment.start.x, route.attachmentSegment.end.x)` and matching `maxX`, clamps desired child X to that range, and uses `route.attachmentSegment.start.y`.
- legacy/fallback family drawing and `getRelationshipPath()` use the same attachment segment and route points.
- `isPointOnRelationship()`, edit-pencil position, route-mode buttons, date anchor and selection highlight all consume `getRelationshipPath()`, whose marriage branch returns `getMarriageRoute(fromPerson, toPerson, relationship, allRelationships).points`.
- `_calculateContentBounds()` includes every canonical route point.
- PNG/JPEG/SVG/PDF code calls `prepareDerivedGeometry()` before bounds and preserves/restores derived caches when it temporarily replaces `ctx`.

Run this source audit after migration:

```powershell
rg -n "getMarriageConfiguration|getMarriageGeometry" js/canvas.js
```

Expected: no match appears in `drawRelationshipDate`, `drawRelationship`, `_getFamilySource`, family fallback drawing, `getRelationshipPath`, hit-testing, edit controls, bounds, or export methods.

- [ ] **Step 5: Update geometry and family contracts**

In `verify_marriage_geom.js`, replace the old arch assertions:

- remove `points.length === 4`;
- remove `archFromX === dHx` for the vertical leg;
- retain the first point at `dH.getConnectionPoint('bottom')` and final point at `dW.getConnectionPoint('bottom')`;
- require at least eight raw route points before `cleanPath`, at least six cleaned points, a horizontal attachment bar below all endpoint/intervening label bounds, zero text intersections, hit on attachment midpoint, no hit on the intervening symbol, and identical route JSON across three forced recomputations.

In `verify_family_routing.js`, call `getMarriageRoute(p1, p2, marriageRel, otherRels)` and assert the two-parent source lies on its `attachmentSegment`, not on `config.archBarY` reconstructed separately.

```powershell
node refactor/verify_label_routing.js
node refactor/verify_marriage_geom.js
node refactor/verify_family_routing.js
node refactor/verify_pencil.js
node refactor/verify_relationship_edges.js
node refactor/verify_view_export.js
```

Expected: every script exits 0; notes-only under route reports zero text intersections.

- [ ] **Step 6: Synchronize and commit Task 3**

```powershell
Copy-Item -LiteralPath 'js\canvas.js' -Destination 'geno\js\canvas.js' -Force
Copy-Item -LiteralPath 'js\canvas.js' -Destination 'refactor\app\js\canvas.js' -Force
Copy-Item -LiteralPath 'js\domain\family-route-planner.js' -Destination 'geno\js\domain\family-route-planner.js' -Force
Copy-Item -LiteralPath 'js\domain\family-route-planner.js' -Destination 'refactor\app\js\domain\family-route-planner.js' -Force
node refactor/verify_mirror_sync.js
git add js/canvas.js js/domain/family-route-planner.js refactor/verify_label_routing.js refactor/verify_marriage_geom.js refactor/verify_family_routing.js
git commit -m "fix: route marriage legs around person labels"
```

---

### Task 4: Surface Unsatisfied Forced-Route Warnings Without Exporting Them

**Files:**
- Modify: `index.html:210-225`
- Modify: `css/styles.css` near canvas overlays
- Modify: `js/app.js` in `cacheElements()` and `render()`
- Extend: `refactor/verify_label_routing.js`
- Mirror: root/geno/refactor app HTML, CSS and JS

**Interfaces:**
- Produces: `#routingWarning[role="status"]`.
- Produces: `GenogramApp.updateRoutingWarning()`.

- [ ] **Step 1: Add RED warning-state assertions**

In `verify_label_routing.js`, replace the data with this deliberately unsatisfiable forced-straight fixture, render, and inspect the warning:

```js
const app = window.app;
const routeA = new Person({ id: 'warn-route-a', x: 260, y: 460,
    gender: 'male', name: 'A' });
const routeB = new Person({ id: 'warn-route-b', x: 860, y: 640,
    gender: 'female', name: 'B' });
const leftBlock = new Person({ id: 'a-warn-left', x: 395, y: 485,
    gender: 'female', name: '', notes: '左側固定長文字阻擋候選位置' });
const rightBlock = new Person({ id: 'b-warn-right', x: 725, y: 485,
    gender: 'female', name: '', notes: '右側固定長文字阻擋候選位置' });
const target = new Person({ id: 'z-warn-target', x: 560, y: 485,
    gender: 'male', name: '', notes: '這個範例刻意沒有完全安全的左右位置' });
const forced = new Relationship({ id: 'warn-straight', fromPersonId: routeA.id,
    toPersonId: routeB.id, type: 'married', routeMode: 'straight' });
app.persons = [routeA, routeB, leftBlock, rightBlock, target];
app.relationships = [forced];
app.households = [];
app.lifeCircles = [];
app._syncPersonMap();
app.render();
const warning = document.getElementById('routingWarning');
const warningResult = { visible: !warning.hidden, text: warning.textContent,
    count: app.canvas.labelRoutingWarnings.length };
const exportDataUrl = app.canvas.exportToPNG(app.persons, app.relationships,
    [], [], true, false, 1, app.viewOptions);
```

Return `warning: warningResult` and `exportDataUrl`, then assert:

```js
check('unsatisfied forced route exposes a non-export warning',
    result.warning.visible && result.warning.text.includes('文字與關係線'),
    JSON.stringify(result.warning));
check('warning is absent from exported canvas data',
    result.exportDataUrl.startsWith('data:image/png;base64,'), result.exportDataUrl.slice(0, 30));
```

Set `forced.routeMode = 'auto'`, call `app.canvas.invalidateDerivedGeometry()`, render again, and assert `routingWarning.hidden === true`.

- [ ] **Step 2: Add the editor-only warning node and styles**

Place inside `.canvas-container`, after the canvas:

```html
<div id="routingWarning" class="routing-warning" role="status" aria-live="polite" hidden></div>
```

Add:

```css
.routing-warning {
    position: absolute;
    right: 16px;
    bottom: 16px;
    z-index: 6;
    max-width: 320px;
    padding: 9px 12px;
    border: 1px solid #a16207;
    border-radius: 8px;
    color: #713f12;
    background: #fffbeb;
    box-shadow: 0 4px 16px rgb(15 23 42 / 12%);
    font-size: 13px;
    line-height: 1.45;
    pointer-events: none;
}
```

- [ ] **Step 3: Synchronize warning state after each App render**

Cache `routingWarning` and add:

```js
updateRoutingWarning() {
    const node = this.elements.routingWarning;
    if (!node) return;
    const count = this.canvas.labelRoutingWarnings?.length || 0;
    node.hidden = count === 0;
    node.textContent = count === 0
        ? ''
        : `${count} 位成員的文字與關係線空間不足，請移動人物或改用自動繞線。`;
}
```

Call `updateRoutingWarning()` immediately after the existing `this.canvas.render` call returns in `GenogramApp.render()`. Do not call it from export methods and do not add it to `getState()`.

- [ ] **Step 4: Verify, synchronize and commit Task 4**

```powershell
node refactor/verify_label_routing.js
node refactor/verify_ui_shell.js
node refactor/verify_label_routing.js
Copy-Item -LiteralPath 'js\app.js' -Destination 'geno\js\app.js' -Force
Copy-Item -LiteralPath 'js\app.js' -Destination 'refactor\app\js\app.js' -Force
Copy-Item -LiteralPath 'css\styles.css' -Destination 'geno\css\styles.css' -Force
Copy-Item -LiteralPath 'css\styles.css' -Destination 'refactor\app\css\styles.css' -Force
node refactor/verify_mirror_sync.js
node refactor/verify_geno_deploy.js
git add index.html css/styles.css js/app.js refactor/verify_label_routing.js
git commit -m "feat: surface unresolved label routing collisions"
```

---

### Task 5: Add the Approved Visual Fixture and Run Release Gates

**Files:**
- Modify: `refactor/visual_golden.js`
- Create: `refactor/golden/baseline/17-label-routing.png`
- Modify: `refactor/TEST_GATES.md`

- [ ] **Step 1: Add fixture 17 with auto/over/under/straight sections**

Add this deterministic fixture to `FIXTURES`:

```js
{
    name: '17-label-routing',
    build: () => {
        const app = window.app;
        const hub = new Person({ id: 'gold-hub', x: 430, y: 190, gender: 'male',
            name: '', age: 62,
            notes: '雙相情緒障礙症\n（精神中度障礙）' });
        const left = new Person({ id: 'gold-left', x: 210, y: 190,
            gender: 'female', name: '左側伴侶' });
        const rightNear = new Person({ id: 'gold-right-near', x: 650, y: 190,
            gender: 'female', name: '右側伴侶一' });
        const rightFar = new Person({ id: 'gold-right-far', x: 870, y: 190,
            gender: 'female', name: '右側伴侶二' });
        const auto = new Relationship({ id: 'gold-auto', fromPersonId: left.id,
            toPersonId: hub.id, type: 'married', routeMode: 'auto' });
        const under = new Relationship({ id: 'gold-under', fromPersonId: hub.id,
            toPersonId: rightNear.id, type: 'cohabiting', routeMode: 'under' });
        const over = new Relationship({ id: 'gold-over', fromPersonId: hub.id,
            toPersonId: rightFar.id, type: 'divorced', routeMode: 'over' });

        const straightA = new Person({ id: 'gold-straight-a', x: 250, y: 450,
            gender: 'male', name: 'STRAIGHT A' });
        const straightB = new Person({ id: 'gold-straight-b', x: 820, y: 620,
            gender: 'female', name: 'STRAIGHT B' });
        const crossed = new Person({ id: 'gold-crossed', x: 560, y: 475,
            gender: 'male', name: '',
            notes: '強制直線保留線型\n整塊文字改為側向避讓' });
        const straight = new Relationship({ id: 'gold-straight',
            fromPersonId: straightA.id, toPersonId: straightB.id,
            type: 'married', routeMode: 'straight' });

        app.persons.push(hub, left, rightNear, rightFar, straightA, straightB, crossed);
        app.relationships.push(auto, under, over, straight);
        app._syncPersonMap();
        app.render();
    }
}
```

The fixture uses no dates, generated IDs or current time.

- [ ] **Step 2: Prove the baseline set is RED before approval**

```powershell
node refactor/visual_golden.js
```

Expected: non-zero exit with `baseline-set` mismatch or `NO-BASELINE` only for `17-label-routing`; existing fixtures must not show unexpected `DIFF`.

- [ ] **Step 3: Render, inspect, then add only fixture 17 baseline**

```powershell
node refactor/visual_golden.js --update
```

Visually inspect `refactor/golden/current/17-label-routing.png` and confirm:

- under legs leave the cardinal bottom port, side-step above the first label row, and descend outside the whole label block;
- no safe route relies on the white text halo to erase a line;
- forced straight geometry is unchanged and the complete label block moves left or right;
- existing 01–16 images were not accepted solely because update mode rewrote them.

Restore any changed 01–16 baseline file from the pre-update commit if its SHA-256 changed. Stage only `17-label-routing.png`.

- [ ] **Step 4: Run golden in comparison mode and full geometry gates**

```powershell
node refactor/visual_golden.js
$verifyScripts = Get-ChildItem -LiteralPath 'refactor' -Filter 'verify_*.js' |
    Sort-Object Name
foreach ($script in $verifyScripts) {
    Write-Host "RUN $($script.Name)"
    node $script.FullName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
node refactor/smoke_visual.js
node refactor/verify_mirror_sync.js
node refactor/verify_geno_deploy.js
```

Expected: golden reports 17 fixtures, every `diffPixels=0`; all verify scripts and smoke exit 0 with zero page/console errors.

- [ ] **Step 5: Run bounded performance gates**

```powershell
$env:PYTHONIOENCODING = 'utf-8'
python refactor/benchmarks/fps_bench.py
```

Expected: 200-person and existing 240-person scenarios remain inside the thresholds recorded by the benchmark; no render performs an unbounded candidate search.

- [ ] **Step 6: Document and commit Task 5**

Add the following gate row to `refactor/TEST_GATES.md` with the exact commands above: label geometry, notes-only routing, forced straight placement, 17-image golden comparison, performance, mirror sync, and offline deploy.

```powershell
git add refactor/visual_golden.js refactor/TEST_GATES.md
git add -f refactor/golden/baseline/17-label-routing.png
git diff --cached --check
git commit -m "test: cover label-safe relationship routing"
git status --short
```

Expected: commit succeeds and `git status --short` is empty.

---

## Completion Evidence

Record in the implementation handoff:

- `verify_label_routing.js`, `verify_marriage_geom.js`, `verify_family_routing.js`, relationship hit and export bounds results;
- 17-fixture golden result with `diffPixels=0`;
- exact benchmark output and thresholds;
- mirror/deploy verification output;
- screenshot path for fixture 17;
- any `labelRoutingWarnings` fixture and why it is intentionally unsatisfiable.
