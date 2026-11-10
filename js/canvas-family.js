// 來源：js/canvas.js；此檔以 mixin 掛回原型，載入順序：canvas.js → canvas-family.js → app.js。
'use strict';
Object.assign(GenogramCanvas.prototype, {
    getFamilyRoutePlans(familyRels, persons, otherRels, kinship = null) {
        const allPersons = Array.isArray(persons) ? persons : [];
        const allRelationships = [...(familyRels || []), ...(otherRels || [])];
        if (typeof FamilyRoutePlanner === 'undefined') return [];
        this.prepareDerivedGeometry(allPersons, allRelationships);
        const signature = this._getFamilyRouteSignature(allPersons, allRelationships);
        if (signature === this._familyRouteSignature && Array.isArray(this._familyRoutePlans)) {
            return this._familyRoutePlans;
        }
        if (!(this.personMap instanceof Map) || allPersons.some(person => !this.personMap.has(person.id))) {
            this.personMap = new Map(allPersons.map(person => [person.id, person]));
        }
        const engine = kinship || new KinshipEngine(allPersons, allRelationships);
        const obstacles = this.getPersonRouteObstacles(allPersons);
        const groups = this._buildFamilyGroups(familyRels || [], engine);
        const relationshipPaths = new Map();
        const nextFamilyPlanCache = new Map();

        const plans = groups.map(group => {
            const parentObjs = group.parentIds.map(id => this.personMap.get(id)).filter(Boolean);
            const childObjs = group.childIds.map(id => this.personMap.get(id)).filter(Boolean);
            if (parentObjs.length === 0 || childObjs.length === 0) return null;
            const sourceInfo = this._getFamilySource(parentObjs, childObjs, otherRels || [], obstacles);
            const relevantObstacles = this._getRelevantFamilyRouteObstacles(
                obstacles, parentObjs, childObjs, sourceInfo
            );
            // 同一對（父母→子女）之間另有伴侶／情感線：同一列時親子線不走直線（會跟那條線疊在一起）
            const avoidStraightPairs = [];
            parentObjs.forEach(parent => childObjs.forEach(child => {
                const shared = (otherRels || []).some(r => (r.fromPersonId === parent.id && r.toPersonId === child.id)
                    || (r.fromPersonId === child.id && r.toPersonId === parent.id));
                // [PET] 跟主人同一列的寵物：親子線一律從頭頂繞（直線看起來像婚姻線）
                if (shared || child.gender === 'pet') avoidStraightPairs.push(`${parent.id}->${child.id}`);
            }));
            const localSignature = this._getFamilyPlanCacheSignature(
                group, parentObjs, childObjs, sourceInfo, relevantObstacles
            ) + '|avoid:' + avoidStraightPairs.join(',');
            const planInput = {
                parents: parentObjs,
                children: childObjs,
                source: sourceInfo.source,
                sourceRange: sourceInfo.sourceRange,
                sourcePrefix: sourceInfo.sourcePrefix,
                avoidStraightPairs,
                obstacles: relevantObstacles,
                personSize: this.personSize,
                generationGap: this.generationGap,
                margin: 10
            };
            // 固定走法：路徑只由父母／子女位置決定，局部障礙物只用來回報 safe／collisions，不必再用全部障礙物重算
            const cached = this._familyPlanCache.get(group.key);
            const plan = cached && cached.plan && cached.signature === localSignature
                ? cached.plan
                : FamilyRoutePlanner.planFamily(planInput);
            nextFamilyPlanCache.set(group.key, { signature: localSignature, plan });
            plan.family = {
                key: group.key,
                parentIds: [...group.parentIds],
                childIds: [...group.childIds],
                relIds: [...group.relIds],
                childToRelIds: group.childToRelIds,
                pairToRelIds: group.pairToRelIds,
                virtualPair: sourceInfo.virtualPair
            };
            group.parentIds.forEach(parentId => {
                group.childIds.forEach(childId => {
                    const path = plan.relationshipPaths[`${parentId}->${childId}`];
                    const relIds = group.pairToRelIds[`${parentId}\u0000${childId}`] || [];
                    if (!path) return;
                    relIds.forEach(relId => relationshipPaths.set(relId, path.map(point => ({ ...point }))));
                });
            });
            return plan;
        }).filter(Boolean);

        this._familyPlanCache = nextFamilyPlanCache;
        this._familyRoutePlans = plans;
        this._familyRelationshipPaths = relationshipPaths;
        this._familyRouteSignature = signature;
        return plans;
    },

    _getPlannedFamilyRelationshipPath(relationship, allRelationships) {
        if (typeof FamilyRoutePlanner === 'undefined') return null;
        const persons = Array.isArray(this.lastPersons) ? this.lastPersons : [];
        const relationships = Array.isArray(allRelationships) && allRelationships.length > 0
            ? allRelationships
            : (Array.isArray(this.lastRelationships) ? this.lastRelationships : []);
        const signature = this._getFamilyRouteSignature(persons, relationships);
        if (signature !== this._familyRouteSignature || !this._familyRelationshipPaths.has(relationship.id)) {
            const familyRels = [];
            const otherRels = [];
            relationships.forEach(rel => {
                const category = typeof rel.getCategory === 'function'
                    ? rel.getCategory()
                    : Relationship.getCategory(rel.type);
                (category === 'family' ? familyRels : otherRels).push(rel);
            });
            this.getFamilyRoutePlans(familyRels, persons, otherRels, new KinshipEngine(persons, relationships));
        }
        const path = this._familyRelationshipPaths.get(relationship.id);
        return path ? path.map(point => ({ ...point })) : null;
    },

    _getFamilyLinkDash(relIds, relById) {
        let linkType = 'biological';
        for (const relId of relIds || []) {
            const rel = relById.get(relId);
            if (!rel) continue;
            if (rel.linkType === 'foster') return DASH_PATTERNS.cohabit;
            if (rel.linkType === 'adopted') linkType = 'adopted';
        }
        return linkType === 'adopted' ? DASH_PATTERNS.engaged : DASH_PATTERNS.solid;
    },

    _strokeFamilyPolyline(points, dash = DASH_PATTERNS.solid) {
        if (!Array.isArray(points) || points.length < 2) return;
        this.ctx.setLineDash(dash);
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let index = 1; index < points.length; index++) {
            this.ctx.lineTo(points[index].x, points[index].y);
        }
        this.ctx.stroke();
    },

    _drawFamilyPlan(plan, relById, selectedRelationshipId) {
        const family = plan.family;
        if (family.virtualPair && family.parentIds.length >= 2) {
            const p1 = this.personMap.get(family.parentIds[0]);
            const p2 = this.personMap.get(family.parentIds[1]);
            if (p1 && p2) {
                this.ctx.save();
                this.ctx.strokeStyle = '#f0f0f0';
                this._strokeFamilyPolyline([{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }], DASH_PATTERNS.fosterLink);
                this.ctx.restore();
            }
        }

        const selectedPath = selectedRelationshipId
            ? this._familyRelationshipPaths.get(selectedRelationshipId)
            : null;
        if (selectedPath && family.relIds.includes(selectedRelationshipId)) {
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(74, 144, 217, 0.3)';
            this.ctx.lineWidth = 10;
            this._strokeFamilyPolyline(selectedPath, DASH_PATTERNS.solid);
            this.ctx.restore();
        }

        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = Math.max(2, 1.25 / (this.lodScale || 1)); // [B1-visual]
        const pairwise = plan.mode === 'reversed' || plan.mode === 'same-row';
        if (pairwise) {
            family.parentIds.forEach(parentId => {
                family.childIds.forEach(childId => {
                    const relIds = family.pairToRelIds[`${parentId}\u0000${childId}`] || [];
                    const path = plan.relationshipPaths[`${parentId}->${childId}`];
                    if (relIds.length > 0) this._strokeFamilyPolyline(path, this._getFamilyLinkDash(relIds, relById));
                });
            });
        } else {
            const singleChildDash = family.childIds.length === 1
                ? this._getFamilyLinkDash(family.childToRelIds[family.childIds[0]], relById)
                : DASH_PATTERNS.solid;
            this._strokeFamilyPolyline(plan.sourcePath, singleChildDash);
            this._strokeFamilyPolyline(plan.barPath, DASH_PATTERNS.solid);
            family.childIds.forEach(childId => {
                this._strokeFamilyPolyline(
                    plan.childPaths[childId],
                    this._getFamilyLinkDash(family.childToRelIds[childId], relById)
                );
            });
            plan.twinGroups.forEach(group => {
                if (group.monoBar) this._strokeFamilyPolyline(group.monoBar, DASH_PATTERNS.solid);
            });
        }

        if (selectedPath && family.relIds.includes(selectedRelationshipId)) {
            this.ctx.save();
            this.ctx.strokeStyle = '#4a90d9';
            this.ctx.lineWidth = 4;
            this._strokeFamilyPolyline(selectedPath, DASH_PATTERNS.solid);
            this.ctx.restore();
        }
        this.ctx.setLineDash(DASH_PATTERNS.solid);
    },

    /**
     * 「符號」被子女線穿過（或貼太近）的成員 id；固定走法不避讓，只回報。
     * 只看符號：文字壓線是允許的（使用者可自行移動文字），不提示。
     */
    getFamilyCollisionPersonIds() {
        const ids = new Set();
        (this._familyRoutePlans || []).forEach(plan => {
            if (plan.safe) return;
            (plan.collisions || []).forEach(entry => {
                const text = String(entry);
                const cut = text.lastIndexOf(':');
                if (text.slice(cut + 1) !== 'symbol') return;
                const id = text.slice(0, cut);
                if (id && id !== 'unknown') ids.add(id);
            });
        });
        return [...ids];
    },

    /** 螢幕專用提示：被子女線穿過的成員外圍畫桃紅虛線圈，提醒使用者手動拖開。只由 render() 呼叫，不進匯出。 */
    drawFamilyCollisionHints() {
        if (this.showRouteHints === false) return;
        const ids = this.getFamilyCollisionPersonIds();
        if (!ids.length) return;
        const ctx = this.ctx;
        const scale = this.scale || 1;
        ctx.save();
        ctx.strokeStyle = '#ed1261';
        ctx.lineWidth = 1.5 / scale;
        ctx.lineCap = 'butt';
        ctx.setLineDash([5 / scale, 4 / scale]);
        ids.forEach(id => {
            const person = this.personMap.get(id);
            if (!person) return;
            ctx.beginPath();
            ctx.arc(person.x, person.y, this.personSize / 2 + 10, 0, Math.PI * 2);
            ctx.stroke();
        });
        ctx.restore();
    },

    /**
     * 繪製家庭樹狀結構；正式路徑由 FamilyRoutePlanner 統一計算。
     */
    drawFamilies(familyRels, persons, otherRels, selectedRelationshipId = null, kinship = null) {
        if (typeof FamilyRoutePlanner === 'undefined') {
            if (!this._familyRoutePlannerMissingLogged) {
                console.error('家庭線規劃器未載入，已略過家庭線繪製。');
                this._familyRoutePlannerMissingLogged = true;
            }
            return;
        }
        const engine = kinship || new KinshipEngine(persons, [...familyRels, ...otherRels]);
        const relById = new Map(familyRels.map(rel => [rel.id, rel]));
        const plans = this.getFamilyRoutePlans(familyRels, persons, otherRels, engine);
        this.ctx.save();
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        plans.forEach(plan => this._drawFamilyPlan(plan, relById, selectedRelationshipId));
        this.ctx.restore();
    }
});
