// 來源：js/app.js；此檔以 mixin 掛回原型，載入順序：app.js → app-snap-placement.js（DOMContentLoaded 前同步載入）。
'use strict';
Object.assign(GenogramApp.prototype, {
    /**
     * [Snap] 拖曳即時吸附計算
     * 候選來源（X 軸）：其他人物的 X 對齊、父母兩人中點、同列鄰居等距位置
     * 候選來源（Y 軸）：輩分列（GRID）、其他人物的 Y 對齊
     * @param {number} vx - 虛擬（未吸附）X
     * @param {number} vy - 虛擬（未吸附）Y
     * @param {Set} movingIdSet - 正在移動中的人物 id（不可作為吸附參考）
     * @param {Person} anchor - 拖曳錨點人物
     * @returns {{x:number, y:number, guides:Object}} 吸附後座標與輔助線描述
     */
    computeDragSnap(vx, vy, movingIdSet, anchor) {
        const grid = GenogramApp.GRID;
        const scale = (this.canvas && this.canvas.scale) || 1;
        // 閾值以螢幕 8px 為基準換算到世界座標，限制在 4~14px 之間
        const threshold = Math.max(4, Math.min(14, 8 / scale));

        // [防手震] 拖曳總位移未達啟動閾值（螢幕 5px）前不吸附：
        // 避免 1px 抖動的點擊被吸到鄰近 X 並寫進 history
        if (this.dragVirtual && this.dragVirtual.anchorId === anchor.id) {
            const moved = Math.hypot(vx - this.dragVirtual.startX, vy - this.dragVirtual.startY);
            if (moved < 5 / scale) {
                return { x: vx, y: vy, guides: null };
            }
        }

        const others = this.persons.filter(p => !movingIdSet.has(p.id));

        let bestX = null; // { pos, dist, kind, xs? }
        let bestY = null;

        // 判斷某 Y 是否剛好位於輩分列上（pointerup 的列吸附不會把它移走）
        const isOnRow = (y) => {
            const nearest = grid.ORIGIN_Y + Math.round((y - grid.ORIGIN_Y) / grid.CELL_HEIGHT) * grid.CELL_HEIGHT;
            return Math.abs(y - nearest) < 0.5;
        };

        // --- Y：輩分列吸附 ---
        const genIndex = Math.round((vy - grid.ORIGIN_Y) / grid.CELL_HEIGHT);
        const rowY = grid.ORIGIN_Y + genIndex * grid.CELL_HEIGHT;
        if (Math.abs(rowY - vy) <= threshold) {
            bestY = { pos: rowY, dist: Math.abs(rowY - vy), kind: 'row' };
        }
        // --- Y：其他人物對齊 ---
        // 僅限位於輩分列上的人：放開時 Y 一律吸附輩分列，
        // 對齊到自由 Y 的人會在放開瞬間被覆寫，形成「假對齊」誤導
        for (const o of others) {
            if (!isOnRow(o.y)) continue;
            const d = Math.abs(o.y - vy);
            if (d <= threshold && (!bestY || d < bestY.dist)) {
                bestY = { pos: o.y, dist: d, kind: 'align' };
            }
        }

        // --- X：其他人物對齊 ---
        for (const o of others) {
            const d = Math.abs(o.x - vx);
            if (d <= threshold && (!bestX || d < bestX.dist)) {
                bestX = { pos: o.x, dist: d, kind: 'align' };
            }
        }

        // --- X：父母兩人中點（讓子女線可精準回正、垂直） ---
        let parentsMid = null;
        let parentIds = [];
        try {
            parentIds = this.getKinshipEngine().getParentIds(anchor.id) || [];
            if (parentIds.length === 2) {
                const pa = this.personMap.get(parentIds[0]);
                const pb = this.personMap.get(parentIds[1]);
                if (pa && pb && !movingIdSet.has(pa.id) && !movingIdSet.has(pb.id)) {
                    parentsMid = (pa.x + pb.x) / 2;
                    const d = Math.abs(parentsMid - vx);
                    if (d <= threshold && (!bestX || d < bestX.dist)) {
                        bestX = { pos: parentsMid, dist: d, kind: 'parent-mid' };
                    }
                }
            }
        } catch (e) { /* kinship 不可用時略過此候選 */ }

        // --- X：等距吸附（讓子女線/同輩間距平均） ---
        // 候選一律帶 xs（標尺刻度，由左至右等距），由 considerSpacing 統一比較。
        // 全部候選另存一份：即使 align/parent-mid 勝出，若位置與某等距候選重合，
        // 仍附上等距標尺（例如吸到母親 X 時恰為手足鏡像位置）
        const spacingCandidates = [];
        const considerSpacing = (pos, xs) => {
            const d = Math.abs(pos - vx);
            if (d > threshold) return;
            spacingCandidates.push({ pos, xs });
            // 同距離時讓 align/parent-mid 優先（-0.01）
            if (!bestX || d < bestX.dist - 0.01) {
                bestX = { pos, dist: d, kind: 'spacing', xs };
            }
        };

        const effY = bestY ? bestY.pos : vy;
        const rowMates = others
            .filter(o => Math.abs(o.y - effY) < grid.CELL_HEIGHT / 2)
            .sort((a, b) => a.x - b.x);

        // (1) 同列每對相鄰者：右延伸 R+(R-L)、左延伸 L-(R-L)、正中 (L+R)/2
        if (rowMates.length >= 2) {
            for (let i = 0; i < rowMates.length - 1; i++) {
                const L = rowMates[i];
                const R = rowMates[i + 1];
                const gap = R.x - L.x;
                if (gap < 10) continue;
                considerSpacing(R.x + gap, [L.x, R.x, R.x + gap]);
                considerSpacing(L.x - gap, [L.x - gap, L.x, R.x]);
                considerSpacing((L.x + R.x) / 2, [L.x, (L.x + R.x) / 2, R.x]);
            }
        }

        // (2) 單一鄰居也能等距：以標準格寬 CELL_WIDTH 為間距
        //（兩名子女互拖時同列只剩一人，(1) 無法成對 — 此候選補上）
        for (const M of rowMates) {
            considerSpacing(M.x + grid.CELL_WIDTH, [M.x, M.x + grid.CELL_WIDTH]);
            considerSpacing(M.x - grid.CELL_WIDTH, [M.x - grid.CELL_WIDTH, M.x]);
        }

        // (3) 手足鏡像：以父母中點為軸，吸附到非移動手足的對稱位置
        //（兩名子女時可一步把子女排成在父母正下方左右平均）
        if (parentsMid !== null) {
            try {
                const kinship = this.getKinshipEngine();
                const sibIds = kinship.getChildrenIds(parentIds[0])
                    .filter(id => kinship.getParentIds(id).includes(parentIds[1]));
                for (const sid of sibIds) {
                    if (sid === anchor.id || movingIdSet.has(sid)) continue;
                    const sib = this.personMap.get(sid);
                    if (!sib || Math.abs(sib.y - effY) >= grid.CELL_HEIGHT / 2) continue;
                    const pos = 2 * parentsMid - sib.x;
                    if (Math.abs(pos - sib.x) < 10) continue;
                    considerSpacing(pos, [
                        Math.min(sib.x, pos), parentsMid, Math.max(sib.x, pos)
                    ]);
                }
            } catch (e) { /* kinship 不可用時略過此候選 */ }
        }

        const outX = bestX ? bestX.pos : vx;
        const outY = bestY ? bestY.pos : vy;

        // 組裝輔助線描述（canvas.drawAlignmentGuides 使用）
        const guides = { x: null, y: null, spacing: null };
        if (bestX) {
            guides.x = { pos: outX, kind: bestX.kind };
            // 勝出位置若與任一等距候選重合（不限 kind），附上等距標尺
            const coincident = spacingCandidates.find(c => Math.abs(c.pos - outX) < 0.01);
            if (coincident) {
                guides.spacing = {
                    y: outY,
                    xs: coincident.xs,
                    gap: Math.round(coincident.xs[1] - coincident.xs[0])
                };
            }
        }
        if (bestY) {
            guides.y = { pos: outY, kind: bestY.kind };
        }
        const hasGuide = guides.x || guides.y;
        return { x: outX, y: outY, guides: hasGuide ? guides : null };
    },

    /**
     * 將座標對齊至最近的格子點
     * @param {number} value - 座標值
     * @param {string} axis - 'x' 或 'y'
     * @returns {number} - 對齊後的座標
     */
    snapToGrid(value, axis) {
        const grid = GenogramApp.GRID;
        // X 軸允許半格吸附，讓使用者可把親子線精準拉回父母中點
        // Y 軸維持整格吸附，確保輩分層級穩定
        const cellSize = axis === 'x' ? (grid.CELL_WIDTH / 2) : grid.CELL_HEIGHT;
        const origin = axis === 'x' ? grid.ORIGIN_X : grid.ORIGIN_Y;

        // 計算最近格子位置
        const gridIndex = Math.round((value - origin) / cellSize);
        return origin + gridIndex * cellSize;
    },

    getCurrentCanvasFontText() {
        const legend = document.getElementById('legendContent')?.textContent || '';
        // Canvas text fields: person name/age/notes, relationship notes/date, and life-circle labels.
        // Medical markers are vector/ASCII symbols and do not contribute arbitrary font glyphs.
        const personText = this.persons.flatMap(person => [person.name,
            typeof person.getDisplayAge === 'function' ? person.getDisplayAge(this.ageReferenceDate) : person.age,
            person.notes]).filter(Boolean);
        const relationshipText = this.relationships.flatMap(rel => [rel.notes, rel.date]).filter(Boolean);
        const lifeCircleText = (this.lifeCircles || []).map(lc => lc.label).filter(Boolean);
        return [legend, ...personText, ...relationshipText, ...lifeCircleText].join('\n');
    },

    waitForCurrentCanvasFonts(repaint = false) {
        if (!document.fonts || typeof document.fonts.load !== 'function') return Promise.resolve();
        const text = this.getCurrentCanvasFontText();
        if (text === this._canvasFontSignature
            && this._canvasFontAppliedGeneration === this._canvasFontGeneration) {
            return this.canvasFontReady;
        }
        if (repaint) this._canvasFontRepaintRequested = true;
        if (text === this._canvasFontSignature) return this.canvasFontReady;
        this._canvasFontSignature = text;
        const signature = text;
        const generation = ++this._canvasFontGeneration;
        this.canvasFontReady = Promise.all([
            document.fonts.load('14px "Noto Sans TC"', text),
            document.fonts.load('bold 14px "Noto Sans TC"', text)
        ]).then(() => {
            if (generation !== this._canvasFontGeneration) {
                return this.waitForCurrentCanvasFonts(repaint);
            }
            this._canvasFontAppliedGeneration = generation;
            this.canvas?.clearTextWidthCache?.(); // [B1-perf] 字型換了，量測寬度要重算
            this.canvas?.invalidateDerivedGeometry?.();
            const shouldRepaint = this._canvasFontRepaintRequested;
            this._canvasFontRepaintRequested = false;
            if (shouldRepaint && signature === this._canvasFontSignature) this.render();
        }, () => {
            if (generation !== this._canvasFontGeneration) {
                return this.waitForCurrentCanvasFonts(repaint);
            }
            this._canvasFontAppliedGeneration = generation;
            this._canvasFontRepaintRequested = false;
            return undefined;
        });
        return this.canvasFontReady;
    },

    /**
     * 尋找同列最近的空格。搜尋順序固定為 0, -1, +1, -2, +2 ...。
     */
    findNearestOpenCell(x, y, excludedIds = new Set()) {
        const grid = GenogramApp.GRID;
        const occupiedAt = (candidateX) => this.persons.some(person =>
            !excludedIds.has(person.id) &&
            Math.abs(person.x - candidateX) < grid.CELL_WIDTH * 0.35 &&
            Math.abs(person.y - y) < grid.CELL_HEIGHT * 0.35
        );
        const initiallyOccupied = occupiedAt(x);
        const limit = this.persons.length + 4;

        for (let distance = 0; distance <= limit; distance++) {
            const offsets = distance === 0 ? [0] : [-distance, distance];
            for (const offset of offsets) {
                const candidateX = x + offset * grid.CELL_WIDTH;
                if (!occupiedAt(candidateX)) {
                    return { x: candidateX, y, occupied: false,
                        preferredOccupied: initiallyOccupied,
                        blockedAt: initiallyOccupied ? { x, y } : null };
                }
            }
        }

        // limit 大於現有人數，理論上必有空格；保留確定性 fallback。
        return { x: x - (limit + 1) * grid.CELL_WIDTH, y, occupied: false,
            preferredOccupied: initiallyOccupied,
            blockedAt: initiallyOccupied ? { x, y } : null };
    },

    /**
     * 計算新增人物候選格與尚未提交的關係預覽；不改動任何既有資料。
     */
    getPlacementCandidate(request = {}) {
        const grid = GenogramApp.GRID;
        const pointerGridX = Number.isFinite(request.pointerX)
            ? grid.ORIGIN_X + Math.round((request.pointerX - grid.ORIGIN_X) / grid.CELL_WIDTH) * grid.CELL_WIDTH
            : null;
        const previewPersonId = request.personId || '__placement__';
        let preferredX;
        let preferredY;
        let relationshipPreview = request.relationshipPreview || [];

        if (request.kind === 'parent-pair') {
            const first = request.people[0];
            preferredX = pointerGridX ?? first.x;
            preferredY = first.y;
        } else if (request.kind === 'person' && !request.basePersonId) {
            preferredX = grid.ORIGIN_X + Math.round(((request.x || 0) - grid.ORIGIN_X) / grid.CELL_WIDTH) * grid.CELL_WIDTH;
            preferredY = grid.ORIGIN_Y + Math.round(((request.y || 0) - grid.ORIGIN_Y) / grid.CELL_HEIGHT) * grid.CELL_HEIGHT;
        } else {
            const base = this.personMap.get(request.basePersonId);
            if (!base) throw new Error(`Placement base person not found: ${request.basePersonId}`);

            const baseGeneration = this.getGenerationIndexByY(base.y);
            const kinship = this.getKinshipEngine();
            preferredX = base.x;
            preferredY = base.y;

            if (request.kind === 'partner' || request.kind === 'sibling') {
                preferredX += grid.CELL_WIDTH;
            } else if (request.kind === 'child') {
                preferredY = this.getGenerationYByIndex(baseGeneration + 1);
                const spouses = this.getSpouses(base.id);
                const spouse = this.pickSpouseForChildCreation(base, spouses);
                if (spouse) preferredX = (base.x + spouse.x) / 2;
                const parentIds = spouse ? [base.id, spouse.id] : [base.id];
                if (!request.relationshipPreview || request.relationshipPreview.length === 0) {
                    relationshipPreview = parentIds.map(parentId => ({
                        type: 'parent-child', fromPersonId: parentId, toPersonId: previewPersonId
                    }));
                }
            } else if (request.kind === 'parent') {
                preferredY = this.getGenerationYByIndex(baseGeneration - 1);
                relationshipPreview = [{
                    type: 'parent-child', fromPersonId: previewPersonId, toPersonId: base.id
                }];
            }

            if (request.kind === 'partner') {
                relationshipPreview = [{
                    type: request.relationshipType || 'married',
                    fromPersonId: base.id,
                    toPersonId: previewPersonId
                }];
            } else if (request.kind === 'sibling') {
                relationshipPreview = kinship.getParentIds(base.id).map(parentId => {
                    const source = this.relationships.find(rel => {
                        const normalized = kinship.normalizeParentChild(rel);
                        return normalized && normalized.parentId === parentId && normalized.childId === base.id;
                    });
                    return {
                        ...(source && typeof source.toJSON === 'function' ? source.toJSON() : source),
                        id: undefined,
                        type: 'parent-child', fromPersonId: parentId, toPersonId: previewPersonId
                    };
                });
            }
            if (pointerGridX !== null) preferredX = pointerGridX;
        }

        let open;
        if (request.kind === 'parent-pair') {
            const gap = request.people[1].x - request.people[0].x;
            const excludedIds = request.excludedIds || new Set();
            const occupiedPairCell = px => this.persons.some(person =>
                !excludedIds.has(person.id) && Math.abs(person.x - px) < grid.CELL_WIDTH * 0.35 &&
                Math.abs(person.y - preferredY) < grid.CELL_HEIGHT * 0.35);
            const pairFree = x => [x, x + gap].every(px => !occupiedPairCell(px));
            const initiallyOccupied = !pairFree(preferredX);
            const blockedX = [preferredX, preferredX + gap].find(occupiedPairCell);
            let x = preferredX;
            for (let distance = 0; distance <= this.persons.length + 4; distance++) {
                const offsets = distance === 0 ? [0] : [-distance, distance];
                const found = offsets.map(offset => preferredX + offset * grid.CELL_WIDTH).find(pairFree);
                if (found !== undefined) { x = found; break; }
            }
            open = { x, y: preferredY, occupied: false,
                preferredOccupied: initiallyOccupied,
                blockedAt: initiallyOccupied ? { x: blockedX, y: preferredY } : null };
        } else {
            open = this.findNearestOpenCell(preferredX, preferredY, request.excludedIds || new Set());
        }
        return {
            ...open,
            guides: {
                x: { pos: open.x, kind: 'placement' },
                y: { pos: open.y, kind: 'row' },
                spacing: null
            },
            relationshipPreview
        };
    },

    beginPlacement(request) {
        const candidate = this.getPlacementCandidate(request);
        const selectionBefore = {
            selectedPersonId: this.selectedPersonId,
            selectedPersonIds: [...this.selectedPersonIds],
            selectedRelationshipId: this.selectedRelationshipId
        };
        this.placementSession = {
            request: { ...request },
            candidate,
            ghostPerson: { ...request, id: request.personId || (request.people && request.people[0].personId) || '__placement__', x: candidate.x, y: candidate.y },
            selectionBefore
        };
        if (request.people) {
            this.placementSession.ghostPeople = request.people.map(person => ({
                ...person, id: person.personId, x: person.x, y: person.y
            }));
        }
        const adjustment = request.existingPersonAdjustment;
        if (adjustment && this.placementSession.ghostPeople) {
            const existingPerson = this.personMap.get(adjustment.personId);
            if (existingPerson) {
                this.placementSession.ghostPeople.push({
                    ...existingPerson,
                    x: adjustment.to.x,
                    y: adjustment.to.y
                });
            }
        }
        this.updateStatus('請選擇新增成員的位置', 'info');
        return this.placementSession;
    },

    updatePlacement(x, y, bypassSnap = false) {
        if (!this.placementSession) return null;
        const originalRequest = this.placementSession.request;
        if (originalRequest.kind === 'parent-pair') {
            return this.placementSession.candidate;
        }
        const request = originalRequest.kind === 'person' && !originalRequest.basePersonId
            ? { ...originalRequest, x, y }
            : { ...originalRequest, pointerX: x };
        const candidate = bypassSnap
            ? { x, y, occupied: false, guides: null, relationshipPreview: this.placementSession.candidate.relationshipPreview }
            : this.getPlacementCandidate(request);
        candidate.relationshipPreview = this.placementSession.candidate.relationshipPreview;
        this.placementSession.candidate = candidate;
        this.placementSession.ghostPerson.x = candidate.x;
        this.placementSession.ghostPerson.y = candidate.y;
        if (this.placementSession.ghostPeople) {
            const first = this.placementSession.request.people[0];
            const dx = candidate.x - first.x;
            const dy = candidate.y - first.y;
            this.placementSession.ghostPeople = this.placementSession.request.people.map(person => ({
                ...person, id: person.personId, x: person.x + dx, y: person.y + dy
            }));
        }
        return candidate;
    },

    cancelPlacement() {
        if (this.placementSession && this.placementSession.selectionBefore) {
            const before = this.placementSession.selectionBefore;
            this.selectedPersonId = before.selectedPersonId;
            this.selectedPersonIds = [...before.selectedPersonIds];
            this.selectedRelationshipId = before.selectedRelationshipId;
        }
        this.placementSession = null;
    },

    commitPlacement() {
        const session = this.placementSession;
        if (!session) return null;
        const previews = session.candidate.relationshipPreview || session.request.relationshipPreview || [];
        const existingIds = new Set(this.persons.map(person => person.id));
        const ghostIds = new Set(session.request.people
            ? session.request.people.map(person => person.personId)
            : [session.request.personId || '__placement__']);
        const validEndpoint = id => existingIds.has(id) || ghostIds.has(id);
        if (previews.some(preview => !validEndpoint(preview.fromPersonId) || !validEndpoint(preview.toPersonId))) {
            this.cancelPlacement();
            this.updateStatus('新增已取消：關係端點不存在或已失效', 'error');
            this.render();
            return null;
        }
        if (session.request.people) {
            const adjustment = session.request.existingPersonAdjustment;
            this.saveState();
            if (adjustment) {
                const adjustedPerson = this.personMap.get(adjustment.personId);
                adjustedPerson.x = adjustment.to.x;
                adjustedPerson.y = adjustment.to.y;
            }
            const idMap = new Map();
            session.request.people.forEach(spec => {
                const dx = session.candidate.x - session.request.people[0].x;
                const dy = session.candidate.y - session.request.people[0].y;
                const person = new Person({ ...spec, x: spec.x + dx, y: spec.y + dy });
                this.persons.push(person); this.personMap.set(person.id, person);
                idMap.set(spec.personId, person.id);
            });
            previews.forEach(preview => this.relationships.push(new Relationship({
                ...preview,
                fromPersonId: idMap.get(preview.fromPersonId) || preview.fromPersonId,
                toPersonId: idMap.get(preview.toPersonId) || preview.toPersonId
            })));
            this.placementSession = null;
            this.selectedPersonId = null;
            this.selectedPersonIds = [];
            this.selectedRelationshipId = null;
            this.setTool('select'); this.autoSave(); this.render();
            this.updateStatus('已建立父母（父親 + 母親 + 婚姻線 + 親子線）', 'success');
            return session;
        }
        if (session.request.gender) {
            this.saveState();
            const person = new Person({
                ...session.request,
                x: session.candidate.x,
                y: session.candidate.y,
                id: undefined
            });
            this.persons.push(person);
            this.personMap.set(person.id, person);
            const previewId = session.request.personId || '__placement__';
            previews.forEach(preview => {
                this.relationships.push(new Relationship({
                    ...preview,
                    fromPersonId: preview.fromPersonId === previewId ? person.id : preview.fromPersonId,
                    toPersonId: preview.toPersonId === previewId ? person.id : preview.toPersonId
                }));
            });
            this.placementSession = null;
            this.selectedPersonIds = [];
            this.selectPerson(person.id);
            this.setTool('select');
            this.autoSave();
            this.render();
            this.updateStatus('已建立成員', 'success');
            return session;
        }
        this.placementSession = null;
        return session;
    },

    /**
     * 依照與手動拖曳相同規則，將 Y 轉為輩分索引
     * @param {number} y
     * @returns {number}
     */
    getGenerationIndexByY(y) {
        const grid = GenogramApp.GRID;
        return Math.round((y - grid.ORIGIN_Y) / grid.CELL_HEIGHT);
    },

    /**
     * 由輩分索引取得 generation 字串（支援無限層級與負數祖先層）
     * @param {number} genIndex
     * @returns {string}
     */
    getGenerationStringByIndex(genIndex) {
        const baseNames = ['grandparent', 'parent', 'child', 'grandchild'];
        if (genIndex >= 0 && genIndex < baseNames.length) return baseNames[genIndex];
        if (genIndex < 0) return `ancestor-${Math.abs(genIndex)}`;
        return `descendant-${genIndex - baseNames.length + 1}`;
    },

    /**
     * 由輩分索引反算對齊後的 Y（與手動拖曳落點一致）
     * @param {number} generationIndex
     * @returns {number}
     */
    getGenerationYByIndex(generationIndex) {
        const grid = GenogramApp.GRID;
        return grid.ORIGIN_Y + generationIndex * grid.CELL_HEIGHT;
    },

    /**
     * 強制執行局部佈局規則 (拖曳後自動修正)
     * 1. 夫妻：男左女右
     * 2. 手足：長幼有序 (左->右: 大->小)
     * @param {Person} person - 被移動的人物
     */
    enforceLocalRules(person) {
        if (!person) return;

        const grid = GenogramApp.GRID;
        const sameGenErrorMargin = grid.CELL_HEIGHT * 0.5;

        // 使用類別常數
        const marriageTypes = GenogramApp.MARRIAGE_TYPES;
        const marriageRels = this.relationships.filter(r =>
            marriageTypes.includes(r.type) &&
            (r.fromPersonId === person.id || r.toPersonId === person.id)
        );

        marriageRels.forEach(rel => {
            const spouseId = rel.fromPersonId === person.id ? rel.toPersonId : rel.fromPersonId;
            const spouse = this.personMap.get(spouseId);

            // 只處理同一輩 (Y 座標相近) 的配偶
            if (spouse && Math.abs(person.y - spouse.y) < sameGenErrorMargin) {
                const isPersonMale = person.gender === 'male';
                const isSpouseMale = spouse.gender === 'male';
                const isPersonFemale = person.gender === 'female';
                const isSpouseFemale = spouse.gender === 'female';

                // 規則：男左女右
                if (isPersonMale && isSpouseFemale) {
                    // Person (男) 應該在 Spouse (女) 左邊
                    if (person.x > spouse.x) {
                        // 交換位置
                        const tempX = person.x;
                        person.x = spouse.x;
                        spouse.x = tempX;
                        this.updateStatus('已自動修正：依規則調整為男左女右', 'info');
                    }
                } else if (isPersonFemale && isSpouseMale) {
                    // Person (女) 應該在 Spouse (男) 右邊
                    if (person.x < spouse.x) {
                        // 交換位置 (其實跟上面邏輯一樣，只是觸發點不同)
                        const tempX = person.x;
                        person.x = spouse.x;
                        spouse.x = tempX;
                        this.updateStatus('已自動修正：依規則調整為男左女右', 'info');
                    }
                }
                // 同性配偶比較年齡
                else if ((isPersonMale && isSpouseMale) || (isPersonFemale && isSpouseFemale)) {
                    const age1 = typeof person.age === 'number' ? person.age : -1;
                    const age2 = typeof spouse.age === 'number' ? spouse.age : -1;

                    if (age1 !== -1 && age2 !== -1 && age1 !== age2) {
                        // 年紀大在左
                        if (age1 > age2 && person.x > spouse.x) {
                            const tempX = person.x;
                            person.x = spouse.x;
                            spouse.x = tempX;
                            this.updateStatus('已自動修正：依規則長輩在左', 'info');
                        } else if (age1 < age2 && person.x < spouse.x) {
                            const tempX = person.x;
                            person.x = spouse.x;
                            spouse.x = tempX;
                            this.updateStatus('已自動修正：依規則長輩在左', 'info');
                        }
                    }
                }
            }
        });

        // 2. 檢查手足 (Siblings)
        // 定義：擁有相同父母 (至少一位) 且在同一輩分
        // 找出父母
        const parentRels = this.relationships.filter(r => r.type === 'parent-child' && r.toPersonId === person.id);
        const parentIds = parentRels.map(r => r.fromPersonId);

        if (parentIds.length > 0) {
            // 找出所有手足 (包括自己)
            const siblingIds = new Set();
            siblingIds.add(person.id);

            this.relationships.forEach(r => {
                if (r.type === 'parent-child' && parentIds.includes(r.fromPersonId)) {
                    // 檢查此 Child 是否在同一輩
                    const child = this.personMap.get(r.toPersonId);
                    if (child && Math.abs(child.y - person.y) < sameGenErrorMargin) {
                        siblingIds.add(child.id);
                    }
                }
            });

            if (siblingIds.size > 1) {
                const siblings = Array.from(siblingIds).map(id => this.personMap.get(id)).filter(p => p);

                // 依目前 X 座標排序 (這是使用者拖曳後的"意圖"位置)
                const currentPositions = siblings.map(p => p.x).sort((a, b) => a - b);

                // 依規則排序手足 (理想順序)
                siblings.sort((a, b) => {
                    // 年紀大在左
                    const ageA = typeof a.age === 'number' ? a.age : -1;
                    const ageB = typeof b.age === 'number' ? b.age : -1;
                    if (ageA !== -1 && ageB !== -1 && ageA !== ageB) return ageB - ageA;

                    // 性別 (男左)
                    const genA = a.gender === 'female' ? 1 : -1;
                    const genB = b.gender === 'female' ? 1 : -1;
                    return genA - genB;
                });

                // 檢查是否需要重排
                // 將理想順序的人，分配到由左至右的座標位置
                let adjusted = false;
                siblings.forEach((sib, index) => {
                    if (sib.x !== currentPositions[index]) {
                        sib.x = currentPositions[index];
                        adjusted = true;
                    }
                });

                if (adjusted) {
                    this.updateStatus('已自動修正：手足順序依長幼/性別排列', 'info');
                }
            }
        }
    }
});
