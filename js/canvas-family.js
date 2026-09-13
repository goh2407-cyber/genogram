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
        const allObstacleSignature = this._getRouteObstacleSignature(obstacles);

        const plans = groups.map(group => {
            const parentObjs = group.parentIds.map(id => this.personMap.get(id)).filter(Boolean);
            const childObjs = group.childIds.map(id => this.personMap.get(id)).filter(Boolean);
            if (parentObjs.length === 0 || childObjs.length === 0) return null;
            const sourceInfo = this._getFamilySource(parentObjs, childObjs, otherRels || [], obstacles);
            const relevantObstacles = this._getRelevantFamilyRouteObstacles(
                obstacles, parentObjs, childObjs, sourceInfo
            );
            const localSignature = this._getFamilyPlanCacheSignature(
                group, parentObjs, childObjs, sourceInfo, relevantObstacles
            );
            const planInput = {
                parents: parentObjs,
                children: childObjs,
                source: sourceInfo.source,
                sourceRange: sourceInfo.sourceRange,
                sourcePrefix: sourceInfo.sourcePrefix,
                obstacles: relevantObstacles,
                personSize: this.personSize,
                margin: 10
            };
            const cached = this._familyPlanCache.get(group.key);
            let plan = null;
            let cacheSignature = localSignature;
            if (cached && cached.plan) {
                const expectedSignature = cached.plan.safe
                    ? localSignature
                    : `${localSignature}|${allObstacleSignature}`;
                if (cached.signature === expectedSignature) {
                    plan = cached.plan;
                    cacheSignature = expectedSignature;
                }
            }
            if (!plan) {
                plan = FamilyRoutePlanner.planFamily(planInput);
                if (!plan.safe && relevantObstacles.length !== obstacles.length) {
                    plan = FamilyRoutePlanner.planFamily({ ...planInput, obstacles });
                }
                if (!plan.safe) {
                    cacheSignature = `${localSignature}|${allObstacleSignature}`;
                }
            }
            nextFamilyPlanCache.set(group.key, { signature: cacheSignature, plan });
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

    findSafeFamilyRouteAdjustment(personId, offsets, persons, relationships) {
        const allPersons = Array.isArray(persons) ? persons : [];
        const allRelationships = Array.isArray(relationships) ? relationships : [];
        const person = this.personMap instanceof Map ? this.personMap.get(personId) : null;
        if (!person || typeof FamilyRoutePlanner === 'undefined') {
            return { dx: 0, beforeUnsafe: 0, afterUnsafe: 0 };
        }

        const familyRels = [];
        const otherRels = [];
        allRelationships.forEach(rel => {
            const category = typeof rel.getCategory === 'function'
                ? rel.getCategory()
                : Relationship.getCategory(rel.type);
            (category === 'family' ? familyRels : otherRels).push(rel);
        });
        const engine = new KinshipEngine(allPersons, allRelationships);
        const unsafeCount = () => this.getFamilyRoutePlans(familyRels, allPersons, otherRels, engine)
            .filter(plan =>
                (plan.family.parentIds.includes(personId) || plan.family.childIds.includes(personId)) && !plan.safe
            ).length;

        const originalX = person.x;
        const beforeUnsafe = unsafeCount();
        let best = { dx: 0, beforeUnsafe, afterUnsafe: beforeUnsafe };
        if (beforeUnsafe > 0) {
            for (const dx of Array.isArray(offsets) ? offsets : []) {
                if (!Number.isFinite(dx) || dx === 0) continue;
                const candidateX = originalX + dx;
                const occupied = allPersons.some(other =>
                    other.id !== personId &&
                    Math.abs(other.x - candidateX) < this.personSize + 10 &&
                    Math.abs(other.y - person.y) < this.personSize + 10
                );
                if (occupied) continue;
                person.x = candidateX;
                const candidateUnsafe = unsafeCount();
                if (candidateUnsafe < best.afterUnsafe) {
                    best = { dx, beforeUnsafe, afterUnsafe: candidateUnsafe };
                    if (candidateUnsafe === 0) break;
                }
            }
        }

        person.x = originalX;
        unsafeCount(); // 還原目前座標對應的繪製／命中快取
        return best;
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
