/**
 * [Phase 2A.0/2A.1/2A.2] 婚姻線幾何回歸：主線 / 高亮 / hit-test 共用 getMarriageGeometry。
 * 涵蓋：① 跨列正交三折　② 同列直線　③ 同側多婚天橋（2A.2：只同側才架）
 *       ④ 同列走廊夾人 → 有限上橋避讓（自動模式不可下繞）
 * 用法：NODE_PATH=$HOME/.cache/pw-smoke/node_modules node refactor/verify_marriage_geom.js
 */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await page.goto(url);
    await page.waitForFunction(() => window.app && window.app.canvas);

    const r = await page.evaluate(() => {
        const app = window.app, c = app.canvas;

        // A：跨列 Level-0 婚姻（|Δy|>1）→ 正交三折
        const a1 = new Person({ id: 'a1', x: 320, y: 170, gender: 'male', name: '夫' });
        const a2 = new Person({ id: 'a2', x: 520, y: 400, gender: 'female', name: '妻' });
        const relA = new Relationship({ id: 'rA', fromPersonId: 'a1', toPersonId: 'a2', type: 'married' });

        // B：同列 Level-0 婚姻、無人夾 → 直線
        const b1 = new Person({ id: 'b1', x: 300, y: 650, gender: 'male', name: '夫2' });
        const b2 = new Person({ id: 'b2', x: 480, y: 650, gender: 'female', name: '妻2' });
        const relB = new Relationship({ id: 'rB', fromPersonId: 'b1', toPersonId: 'b2', type: 'married' });

        // C：同側多婚天橋——cM 的兩位前配偶都在「左側」，較遠的 cW2 須架天橋跨過較近的 cW1
        const cM = new Person({ id: 'cM', x: 800, y: 180, gender: 'male', name: '本人' });
        const cW1 = new Person({ id: 'cW1', x: 650, y: 180, gender: 'female', name: '二婚(近)' });
        const cW2 = new Person({ id: 'cW2', x: 500, y: 180, gender: 'female', name: '前妻(遠)' });
        const relC1 = new Relationship({ id: 'rC1', fromPersonId: 'cW1', toPersonId: 'cM', type: 'married', date: '2010-01-01' });
        const relC2 = new Relationship({ id: 'rC2', fromPersonId: 'cW2', toPersonId: 'cM', type: 'divorced', date: '2000-01-01' });

        // D：同列婚姻、中間夾人。自動模式只能選擇有限的上橋候選。
        const dH = new Person({ id: 'dH', x: 300, y: 480, gender: 'male', name: '', age: 62,
            notes: '雙相情緒障礙症\n（精神中度障礙）' });
        const dMid = new Person({ id: 'dMid', x: 500, y: 480, gender: 'female', name: '',
            notes: '中間人物文字也必須避開\n第二行備註' });
        const dW = new Person({ id: 'dW', x: 700, y: 480, gender: 'female', name: '妻3' });
        const relD = new Relationship({ id: 'rD', fromPersonId: 'dH', toPersonId: 'dW', type: 'married' });
        // 上代親子主幹會穿過橋候選；無安全候選時必須留下 editor warning。
        const familyParent = new Person({ id: 'family-parent', x: 200, y: 325,
            gender: 'male', name: '' });
        const familyChild = new Person({ id: 'family-child', x: 800, y: 545,
            gender: 'female', name: '' });
        const familyRel = new Relationship({ id: 'family-trunk',
            fromPersonId: familyParent.id, toPersonId: familyChild.id,
            type: 'parent-child' });

        app.persons = [a1, a2, b1, b2, cM, cW1, cW2, dH, dMid, dW,
            familyParent, familyChild];
        app._syncPersonMap();
        app.relationships = [relA, relB, relC1, relC2, relD, familyRel];
        app.render();
        const allRels = app.relationships;

        const cfgA = c.getMarriageConfiguration(a1, a2, relA, allRels);
        const geomA = c.getMarriageGeometry(a1, a2, cfgA);
        const pathA = c.getRelationshipPath(a1, a2, relA, allRels);

        const cfgB = c.getMarriageConfiguration(b1, b2, relB, allRels);
        const geomB = c.getMarriageGeometry(b1, b2, cfgB);
        const pathB = c.getRelationshipPath(b1, b2, relB, allRels);
        const hitStraightMid = c.isPointOnRelationship(390, 650, b1, b2, relB, 10, allRels);

        // C：cW2-cM 應為天橋；cW1-cM 應為直線(level 0)
        const cfgC2 = c.getMarriageConfiguration(cW2, cM, relC2, allRels);
        const geomC2 = c.getMarriageGeometry(cW2, cM, cfgC2);
        const pathC2 = c.getRelationshipPath(cW2, cM, relC2, allRels);
        const cfgC1 = c.getMarriageConfiguration(cW1, cM, relC1, allRels);
        const bridgeBarY = geomC2.points[1].y;
        const bridgeMidX = (geomC2.points[1].x + geomC2.points[2].x) / 2;
        const hitBridge = c.isPointOnRelationship(bridgeMidX, bridgeBarY, cW2, cM, relC2, 10, allRels);

        // D：auto bridge
        const cfgD = c.getMarriageConfiguration(dH, dW, relD, allRels);
        const geomD = c.getMarriageRoute(dH, dW, relD, allRels);
        const pathD = c.getRelationshipPath(dH, dW, relD, allRels);
        const textObstacles = c.getPersonRouteObstacles(app.persons)
            .filter(rect => rect.kind === 'text');
        const bridgeCandidates = c._getBridgeMarriageCandidates(dH, dW);
        const familySegments = c._getFamilyOccupiedSegments(app.persons, allRels, relD.id);
        const naiveBridge = bridgeCandidates.find(candidate => candidate.name === 'bridge-near');
        const selectedScore = c._marriageCandidateScore(
            { name: geomD.candidateName, points: geomD.points },
            c.getPersonRouteObstacles(app.persons), [], dH, dW, familySegments);
        const naiveScore = c._marriageCandidateScore(
            naiveBridge, c.getPersonRouteObstacles(app.persons), [], dH, dW, familySegments);
        const bridgeCandidateScores = bridgeCandidates.map(candidate => ({
            name: candidate.name,
            score: c._marriageCandidateScore(candidate,
                c.getPersonRouteObstacles(app.persons), [], dH, dW, familySegments),
            familyCrossings: FamilyRoutePlanner.polylineCrossingCount(
                candidate.points, familySegments)
        }));
        const attachment = geomD.attachmentSegment;
        const dBridgeBarY = attachment.start.y;
        const dBridgeMidX = (attachment.start.x + attachment.end.x) / 2;
        const hitBridgeD = c.isPointOnRelationship(dBridgeMidX, dBridgeBarY, dH, dW, relD, 10, allRels);
        const onMidNode = c.isPointOnRelationship(500, 480, dH, dW, relD, 10, allRels); // 夾者中心不該命中
        const textHits = FamilyRoutePlanner.pathIntersectionCount(geomD.points, textObstacles);
        const dHLabelPlacement = c.getPersonLabelGeometry(dH,
            { showNames: true, showNotes: true }).placement;
        const dHTop = dH.getConnectionPoint('top');
        const dWTop = dW.getConnectionPoint('top');

        // 確定性
        const snapshots = [];
        for (let index = 0; index < 3; index++) {
            c.prepareDerivedGeometry(app.persons, allRels, { force: true });
            snapshots.push(JSON.stringify(c.getMarriageRoute(dH, dW, relD, allRels)));
        }

        return {
            geomA, pathA, geomB, pathB, geomC2, pathC2, geomD, pathD,
            cfgC2_isBridge: cfgC2.isBridge, cfgC1_isBridge: cfgC1.isBridge,
            cfgD_isArch: cfgD.isArch,
            cfgD_isBridge: cfgD.isBridge,
            hitStraightMid, hitBridge, hitBridgeD, onMidNode,
            bridgeFromX: geomC2.points[0].x, bridgeToX: geomC2.points[3].x, cW2x: cW2.x, cMx: cM.x,
            textHits,
            dHLabelPlacement,
            attachment,
            dHTop,
            dWTop,
            bridgeCandidates,
            familySegments,
            naiveScore,
            selectedScore,
            bridgeCandidateScores,
            selectedFamilyCrossings: FamilyRoutePlanner.polylineCrossingCount(
                geomD.points, familySegments),
            naiveFamilyCrossings: FamilyRoutePlanner.polylineCrossingCount(
                naiveBridge.points, familySegments),
            familyWarnings: c.labelRoutingWarnings.filter(warning =>
                warning.relationshipId === relD.id
                && warning.reason === 'marriage-route-collision'),
            detEqual: new Set(snapshots).size === 1,
        };
    });

    const results = [];
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const check = (name, cond, detail) => results.push({ name, ok: !!cond, detail });

    check('A 跨列 Level-0 主線為正交三折（4 點）', r.geomA.points.length === 4, `points=${r.geomA.points.length}`);
    check('A hit-test == 主線幾何（draw==hit）', eq(r.pathA, r.geomA.points), '');

    check('B 同列無障礙主線為直線（2 點）', r.geomB.points.length === 2, `points=${r.geomB.points.length}`);
    check('B hit-test == 主線幾何', eq(r.pathB, r.geomB.points), '');
    check('B 同列婚姻中點可命中', r.hitStraightMid === true, `hit=${r.hitStraightMid}`);

    check('C [2A.2] 同側較遠婚姻段=天橋', r.cfgC2_isBridge === true, `isBridge=${r.cfgC2_isBridge}`);
    check('C [2A.2] 同側較近婚姻段=直線(非天橋)', r.cfgC1_isBridge === false, `isBridge=${r.cfgC1_isBridge}`);
    check('C 天橋主線 4 點ㄇ形', r.geomC2.points.length === 4, `points=${r.geomC2.points.length}`);
    check('C hit-test == 主線幾何', eq(r.pathC2, r.geomC2.points), '');
    check('C 天橋垂直腿 X = 節點中心', r.bridgeFromX === r.cW2x && r.bridgeToX === r.cMx, `from=${r.bridgeFromX}(want ${r.cW2x}) to=${r.bridgeToX}(want ${r.cMx})`);
    check('C 天橋橫段中點可命中', r.hitBridge === true, `hit=${r.hitBridge}`);

    check('D 夾人 auto 設為 needsBridge 而非 isArch',
        r.cfgD_isBridge === true && r.cfgD_isArch === false,
        JSON.stringify({ isBridge: r.cfgD_isBridge, isArch: r.cfgD_isArch }));
    check('D auto bridge is a clean four-point top path',
        r.geomD.points.length === 4
            && eq(r.geomD.points[0], r.dHTop)
            && eq(r.geomD.points.at(-1), r.dWTop),
        JSON.stringify(r.geomD.points));
    check('D attachment bar is horizontal and above both endpoints',
        r.attachment.start.y === r.attachment.end.y
            && r.attachment.start.y < r.dHTop.y
            && r.attachment.start.y < r.dWTop.y,
        JSON.stringify({ attachment: r.attachment, dHTop: r.dHTop, dWTop: r.dWTop }));
    check('D bridge preserves the default label position for manual adjustment',
        r.dHLabelPlacement.side === 'below'
            && r.dHLabelPlacement.offsetX === 0 && r.dHLabelPlacement.offsetY === 0,
        JSON.stringify({ placement: r.dHLabelPlacement, hits: r.textHits }));
    check('D hit-test == 主線幾何', eq(r.pathD, r.geomD.points), '');
    check('D bridge 橫桿可命中', r.hitBridgeD === true, `hit=${r.hitBridgeD}`);
    check('D 夾者中心不再命中婚姻線（線已離開符號）', r.onMidNode === false, `onMid=${r.onMidNode}`);
    check('D 標準 auto 夾人路由使用上橋而非底部 under',
        r.cfgD_isBridge === true
            && !['under', 'inner', 'outer-left', 'outer-right'].includes(r.geomD.candidateName)
            && eq(r.geomD.points[0], r.dHTop)
            && eq(r.geomD.points.at(-1), r.dWTop),
        JSON.stringify({ config: { isArch: r.cfgD_isArch, isBridge: r.cfgD_isBridge },
            candidateName: r.geomD.candidateName, points: r.geomD.points }));
    check('D family occupancy exposes finite parent-child trunk segments',
        r.familySegments.length >= 1
            && r.familySegments.every(segment => segment.kind === 'family'
                && [segment.start.x, segment.start.y, segment.end.x, segment.end.y]
                    .every(Number.isFinite)),
        JSON.stringify(r.familySegments));
    check('D family crossing is scored separately and never remains unmarked',
        r.naiveFamilyCrossings > 0 && r.selectedFamilyCrossings > 0
            && r.selectedScore[1] > 0 && r.familyWarnings.length === 1
            && r.familyWarnings[0].collisions >= r.selectedScore[1],
        JSON.stringify({ naive: r.naiveScore, selected: r.selectedScore,
            naiveFamilyCrossings: r.naiveFamilyCrossings,
            selectedFamilyCrossings: r.selectedFamilyCrossings,
            warnings: r.familyWarnings,
            candidates: r.bridgeCandidateScores }));

    check('確定性：canonical route 強制重算 3 次相同', r.detEqual === true, `detEqual=${r.detEqual}`);

    await browser.close();
    const failed = results.filter(x => !x.ok);
    results.forEach(x => console.log(`${x.ok ? 'PASS' : 'FAIL'} | ${x.name}${x.ok ? '' : ' — ' + x.detail}`));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    console.log(`\n===== marriage-geom ===== ${results.length - failed.length}/${results.length} pass, console-errors=${errors.length}`);
    process.exit(failed.length || errors.length ? 1 : 0);
})();
