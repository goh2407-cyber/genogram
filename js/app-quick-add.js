// 來源：js/app.js；此檔以 mixin 掛回原型，載入順序：app.js → app-quick-add.js（DOMContentLoaded 前同步載入）。
'use strict';
Object.assign(GenogramApp.prototype, {
    /**
     * 處理快速新增按鈕點擊
     * @param {Person} basePerson - 基準角色
     * @param {string} buttonType - 按鈕類型 ('parent', 'sibling', 'partner', 'son', 'daughter', 'pregnancy')
     */
    handleQuickAddClick(basePerson, buttonType) {
        this.commitPropertyEditSession();
        switch (buttonType) {
            case 'parent':
                this.beginQuickParentPlacement(basePerson);
                break;

            case 'sibling':
                // 需要選擇性別
                this.quickAddContext = { personId: basePerson.id, type: 'sibling' };
                this.updateStatus('選擇手足的性別', 'info');
                this.modalManager.open(this.elements.genderModal);
                break;

            case 'partner':
                // 需要選擇性別，預設同居關係
                this.quickAddContext = { personId: basePerson.id, type: 'partner' };
                this.updateStatus('選擇伴侶的性別', 'info');
                this.modalManager.open(this.elements.genderModal);
                break;

            case 'son':
                this.beginQuickRelativePlacement(basePerson, 'child', 'male');
                break;

            case 'daughter':
                this.beginQuickRelativePlacement(basePerson, 'child', 'female');
                break;

            case 'pregnancy':
                this.beginQuickRelativePlacement(basePerson, 'child', 'pregnancy');
                break;
        }
    },

    beginQuickRelativePlacement(basePerson, kind, gender, extras = {}) {
        const session = this.beginPlacement({ kind, basePersonId: basePerson.id, gender,
            generation: kind === 'child' ? this.getGenerationBelow(basePerson.generation) : basePerson.generation,
            ...extras });
        this.updateStatus('請選擇新增成員的位置', 'info');
        this.render();
        return session;
    },

    beginQuickParentPlacement(child) {
        const parentIds = this.getKinshipEngine().getParentIds(child.id);
        if (parentIds.length >= 2) {
            this.cancelPlacement();
            this.updateStatus('此成員已有 2 位父母，無法再新增父母', 'error');
            this.render();
            return null;
        }
        if (parentIds.length === 1) {
            const existingParent = this.personMap.get(parentIds[0]);
            const gender = existingParent?.gender === 'female' ? 'male' : 'female';
            const session = this.beginPlacement({ kind: 'parent', basePersonId: child.id, gender,
                generation: this.getGenerationAbove(child.generation) });
            this.render();
            return session;
        }
        const grid = GenogramApp.GRID;
        const placement = this.findQuickParentPairPlacement(child);
        const centerX = placement.centerX;
        const parentY = placement.parentY;
        const halfGap = placement.gap / 2;
        const fatherId = '__placement_father__';
        const motherId = '__placement_mother__';
        const request = { kind: 'parent-pair', basePersonId: child.id,
            people: [
                { personId: fatherId, gender: 'male', generation: this.getGenerationAbove(child.generation), x: centerX - halfGap, y: parentY },
                { personId: motherId, gender: 'female', generation: this.getGenerationAbove(child.generation), x: centerX + halfGap, y: parentY }
            ],
            relationshipPreview: [
                { type: 'married', fromPersonId: fatherId, toPersonId: motherId },
                { type: 'parent-child', fromPersonId: fatherId, toPersonId: child.id },
                { type: 'parent-child', fromPersonId: motherId, toPersonId: child.id }
            ]
        };
        if (placement.existingPersonAdjustment) {
            request.existingPersonAdjustment = placement.existingPersonAdjustment;
        }
        const session = this.beginPlacement(request);
        if (placement.existingPersonAdjustment) {
            this.updateStatus('父母位置受阻，確認後會將此成員向外微調', 'info');
        }
        this.render();
        return session;
    },

    isQuickParentPairSafe(centerX, parentY, gap, child, obstaclePersons = this.persons) {
        if (!Number.isFinite(centerX) || !Number.isFinite(parentY) || !Number.isFinite(gap) || !child) return false;
        const personSize = this.canvas?.personSize || 50;
        const half = personSize / 2;
        const safety = 10;
        const candidateHalf = half + safety;
        const parentXs = [centerX - gap / 2, centerX + gap / 2];
        const routePersons = Array.isArray(obstaclePersons) ? obstaclePersons : this.persons;
        const obstacles = typeof this.canvas?.getPersonRouteObstacles === 'function'
            ? this.canvas.getPersonRouteObstacles(routePersons)
            : [];
        const overlaps = (a, b) =>
            a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const hasCollision = parentXs.some(x => {
            const candidate = {
                left: x - candidateHalf,
                right: x + candidateHalf,
                top: parentY - candidateHalf,
                bottom: parentY + candidateHalf
            };
            return obstacles.some(obstacle => overlaps(candidate, obstacle));
        });
        if (hasCollision) return false;

        if (typeof FamilyRoutePlanner === 'undefined') return true;
        const sourceRange = {
            minX: parentXs[0] + half,
            maxX: parentXs[1] - half
        };
        const routePlan = FamilyRoutePlanner.planFamily({
            parents: [
                { id: '__quick_parent_left__', x: parentXs[0], y: parentY },
                { id: '__quick_parent_right__', x: parentXs[1], y: parentY }
            ],
            children: [child],
            source: { x: centerX, y: parentY },
            sourceRange,
            obstacles,
            personSize,
            margin: safety
        });
        return routePlan.safe;
    },

    findQuickParentPairChildAdjustment(child, parentY, gap) {
        const grid = GenogramApp.GRID;
        const spouses = this.getSpouses(child.id).filter(spouse =>
            Math.abs(spouse.y - child.y) < grid.CELL_HEIGHT * 0.5);
        const spouse = this.pickSpouseForChildCreation(child, spouses);
        if (!spouse || spouse.x === child.x) return null;

        const spouseParentIds = new Set(this.getKinshipEngine().getParentIds(spouse.id));
        if (spouseParentIds.size < 2) return null;

        const personSize = this.canvas?.personSize || 50;
        const candidateHalf = personSize / 2 + 10;
        const obstacles = typeof this.canvas?.getPersonRouteObstacles === 'function'
            ? this.canvas.getPersonRouteObstacles(this.persons)
            : [];
        const overlaps = (a, b) =>
            a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const rectAt = (x, y) => ({
            left: x - candidateHalf,
            right: x + candidateHalf,
            top: y - candidateHalf,
            bottom: y + candidateHalf
        });
        const centeredParentXs = [child.x - gap / 2, child.x + gap / 2];
        const blockedBySpouseParent = centeredParentXs.some(x =>
            obstacles.some(obstacle => spouseParentIds.has(obstacle.ownerId) &&
                overlaps(rectAt(x, parentY), obstacle)));
        if (!blockedBySpouseParent) return null;

        const direction = child.x < spouse.x ? -1 : 1;
        const distances = [];
        for (let distance = grid.CELL_WIDTH / 2; distance < grid.CELL_WIDTH; distance += 10) {
            distances.push(distance);
        }
        distances.push(grid.CELL_WIDTH);

        for (const distance of distances) {
            const targetX = child.x + direction * distance;
            const childRect = rectAt(targetX, child.y);
            const destinationFree = obstacles.every(obstacle =>
                obstacle.ownerId === child.id || !overlaps(childRect, obstacle));
            if (!destinationFree) continue;

            const virtualChild = { ...child, x: targetX, y: child.y };
            const obstaclePeople = this.persons.map(person =>
                person.id === child.id ? virtualChild : person);
            if (!this.isQuickParentPairSafe(targetX, parentY, gap, virtualChild, obstaclePeople)) continue;

            return {
                personId: child.id,
                from: { x: child.x, y: child.y },
                to: { x: targetX, y: child.y }
            };
        }
        return null;
    },

    findQuickParentPairPlacement(child) {
        const grid = GenogramApp.GRID;
        const parentY = this.getGenerationYByIndex(this.getGenerationIndexByY(child.y) - 1);
        const standardGap = grid.CELL_WIDTH;
        if (this.isQuickParentPairSafe(child.x, parentY, standardGap, child)) {
            return { centerX: child.x, parentY, gap: standardGap };
        }

        const existingPersonAdjustment = this.findQuickParentPairChildAdjustment(
            child, parentY, standardGap);
        if (existingPersonAdjustment) {
            return {
                centerX: existingPersonAdjustment.to.x,
                parentY,
                gap: standardGap,
                existingPersonAdjustment
            };
        }

        const offsets = [];
        for (let distance = 1; distance <= this.persons.length + 4; distance++) {
            offsets.push(-distance * grid.CELL_WIDTH, distance * grid.CELL_WIDTH);
        }
        for (const offset of offsets) {
            const centerX = child.x + offset;
            if (this.isQuickParentPairSafe(centerX, parentY, standardGap, child)) {
                return { centerX, parentY, gap: standardGap };
            }
        }
        return { centerX: child.x, parentY, gap: standardGap };
    },

    /**
     * 為角色建立父母（父親 + 母親 + 婚姻線）
     */
    createParentsForPerson(child) {
        const grid = GenogramApp.GRID;
        // 與手動拖曳一致：以格線輩分索引計算上一層 Y
        const childGenIndex = this.getGenerationIndexByY(child.y);
        const parentY = this.getGenerationYByIndex(childGenIndex - 1);

        // 使用「固定間距 + 雙向搜尋」避免快速新增時出現超長父母線/打結
        // 並優先往「配偶反方向」尋找空位，讓兩邊原生家庭自然外展
        const pairGap = grid.CELL_WIDTH;
        const halfGap = pairGap / 2;
        const searchStep = grid.CELL_WIDTH / 2; // 與手動半格吸附一致
        const maxSearchSteps = 24;
        const minDistance = (this.canvas?.personSize || 50) + 10;

        const existingAtY = this.persons.filter(p =>
            Math.abs(p.y - parentY) < grid.CELL_HEIGHT / 2
        );

        const spouses = this.getSpouses(child.id).filter(s =>
            Math.abs(s.y - child.y) < grid.CELL_HEIGHT * 0.5
        );
        const spouse = spouses.length > 0
            ? spouses.sort((a, b) => Math.abs(a.x - child.x) - Math.abs(b.x - child.x))[0]
            : null;
        const preferredDirection = spouse ? (spouse.x >= child.x ? -1 : 1) : 1;

        const isXFree = (x) => !existingAtY.some(p => Math.abs(p.x - x) < minDistance);
        const isCenterFree = (centerX) => {
            const fatherCandidateX = centerX - halfGap;
            const motherCandidateX = centerX + halfGap;
            return isXFree(fatherCandidateX) && isXFree(motherCandidateX);
        };

        const candidateOffsets = [0];
        for (let step = 1; step <= maxSearchSteps; step++) {
            const delta = step * searchStep;
            candidateOffsets.push(preferredDirection * delta);
            candidateOffsets.push(-preferredDirection * delta);
        }

        let chosenCenterX = child.x;
        for (const offset of candidateOffsets) {
            const candidateCenter = child.x + offset;
            if (isCenterFree(candidateCenter)) {
                chosenCenterX = candidateCenter;
                break;
            }
        }

        let fatherX = chosenCenterX - halfGap;
        let motherX = chosenCenterX + halfGap;

        // 建立父親
        const father = new Person({
            x: fatherX,
            y: parentY,
            gender: 'male',
            generation: this.getGenerationAbove(child.generation)
        });
        this.persons.push(father);
        this.personMap.set(father.id, father);

        // 建立母親
        const mother = new Person({
            x: motherX,
            y: parentY,
            gender: 'female',
            generation: this.getGenerationAbove(child.generation)
        });
        this.persons.push(mother);
        this.personMap.set(mother.id, mother);

        // 建立婚姻關係
        const marriage = new Relationship({
            fromPersonId: father.id,
            toPersonId: mother.id,
            type: 'married'
        });
        this.relationships.push(marriage);

        // 建立親子關係（父親→子女）
        const fatherChild = new Relationship({
            fromPersonId: father.id,
            toPersonId: child.id,
            type: 'parent-child'
        });
        this.relationships.push(fatherChild);

        // 建立親子關係（母親→子女）
        const motherChild = new Relationship({
            fromPersonId: mother.id,
            toPersonId: child.id,
            type: 'parent-child'
        });
        this.relationships.push(motherChild);

        this.autoSave();
        this.render();
        this.updateStatus('已建立父母（父親 + 母親 + 婚姻線 + 親子線）', 'success');
    },

    /**
     * 為角色建立子女
     */
    createChildForPerson(parent, gender) {
        const grid = GenogramApp.GRID;
        // 與手動拖曳一致：以格線輩分索引計算下一層 Y
        const parentGenIndex = this.getGenerationIndexByY(parent.y);
        const childY = this.getGenerationYByIndex(parentGenIndex + 1);

        // 找配偶（優先選中的婚姻線，其次選最近的同輩配偶）
        const spouses = this.getSpouses(parent.id);
        const spouse = this.pickSpouseForChildCreation(parent, spouses);

        // 找出現有子女（雙親時只看「這一對父母」的共同子女；多伴侶未指定時僅看單親子女）
        const existingChildren = this.persons.filter(p => {
            if (spouse) {
                return this.hasParentChildLink(parent.id, p.id) && this.hasParentChildLink(spouse.id, p.id);
            }

            // 一般單親情境
            return this.hasParentChildLink(parent.id, p.id);
        });

        // 計算新子女的 X 座標
        let childX;
        if (existingChildren.length === 0) {
            // 第一個子女：放在父母中間
            if (spouse) {
                childX = (parent.x + spouse.x) / 2;
            } else {
                childX = parent.x;
            }
        } else {
            // 有現有子女：放在最右邊子女的右側
            const rightmost = Math.max(...existingChildren.map(p => p.x));
            childX = rightmost + grid.CELL_WIDTH;
        }

        // 額外檢查：確保不會與同層其他人重疊
        // 但「雙親第一個子女」要維持置中，不要被硬推到父母關係線外
        const isFirstCoupleChild = !!spouse && existingChildren.length === 0;
        if (!isFirstCoupleChild) {
            const sameLevelPersons = this.persons.filter(p =>
                Math.abs(p.y - childY) < grid.CELL_HEIGHT * 0.3
            );
            if (sameLevelPersons.length > 0) {
                const occupied = sameLevelPersons.map(p => p.x);
                while (occupied.some(x => Math.abs(x - childX) < grid.CELL_WIDTH * 0.8)) {
                    childX += grid.CELL_WIDTH;
                }
            }
        }

        const child = new Person({
            x: childX,
            y: childY,
            gender: gender,
            generation: this.getGenerationBelow(parent.generation)
        });
        this.persons.push(child);
        this.personMap.set(child.id, child);

        // 建立親子關係（主要父/母）
        const parentChildRel = new Relationship({
            fromPersonId: parent.id,
            toPersonId: child.id,
            type: 'parent-child'
        });
        this.relationships.push(parentChildRel);

        // 為配偶也建立親子關係
        if (spouse) {
            const spouseChildRel = new Relationship({
                fromPersonId: spouse.id,
                toPersonId: child.id,
                type: 'parent-child'
            });
            this.relationships.push(spouseChildRel);
        }

        this.autoSave();
        this.render();
        let genderName = '成員';
        if (gender === 'male') genderName = '兒子';
        else if (gender === 'female') genderName = '女兒';
        else if (gender === 'pregnancy') genderName = '懷孕';
        else if (gender === 'female-to-male') genderName = '跨性別兒子';
        else if (gender === 'male-to-female') genderName = '跨性別女兒';
        else genderName = '子女';
        const spouseNote = spouse ? '（雙親）' : '';
        this.updateStatus(`已建立${genderName}並建立親子關係${spouseNote}`, 'success');
    },

    /**
     * 快速建立人物（伴侶或手足）
     */

    createQuickPersonWithGender(gender, sexualOrientation = false, transgender = null) {
        if (!this.quickAddContext) return;

        const { personId, type } = this.quickAddContext;
        const basePerson = this.personMap.get(personId);

        if (!basePerson) {
            this.closeGenderModal();
            return;
        }

        this.modalManager.close(this.elements.genderModal);
        this.quickAddContext = null;
        this.beginQuickRelativePlacement(basePerson, type, gender, { sexualOrientation, transgender,
            relationshipType: type === 'partner' ? 'married' : undefined });
    },

    /**
     * 取得上一輩分
     */
    getGenerationAbove(generation) {
        const genOrder = ['grandchild', 'child', 'parent', 'grandparent'];
        const idx = genOrder.indexOf(generation);
        if (idx >= 0 && idx < genOrder.length - 1) {
            return genOrder[idx + 1];
        }
        // [Bug Fix] 支援無限層級：當超出預定義範圍時，使用動態標識符
        // grandparent 的上一層是 ancestor-1，ancestor-1 的上一層是 ancestor-2，以此類推
        if (generation === 'grandparent') {
            return 'ancestor-1';
        }
        if (typeof generation === 'string' && generation.startsWith('ancestor-')) {
            const level = parseInt(generation.replace('ancestor-', ''), 10);
            return `ancestor-${level + 1}`;
        }
        // 處理 null 或未定義的情況，預設返回 'parent'
        return 'parent';
    },

    /**
     * 取得下一輩分
     */
    getGenerationBelow(generation) {
        const genOrder = ['grandparent', 'parent', 'child', 'grandchild'];
        const idx = genOrder.indexOf(generation);
        if (idx >= 0 && idx < genOrder.length - 1) {
            return genOrder[idx + 1];
        }
        // [Bug Fix] 支援無限層級
        // ancestor-N 的下一層：ancestor-1 -> grandparent, ancestor-N -> ancestor-(N-1)
        if (typeof generation === 'string' && generation.startsWith('ancestor-')) {
            const level = parseInt(generation.replace('ancestor-', ''), 10);
            if (level === 1) {
                return 'grandparent';
            }
            return `ancestor-${level - 1}`;
        }
        // grandchild 的下一層是 descendant-1，以此類推
        if (generation === 'grandchild') {
            return 'descendant-1';
        }
        if (typeof generation === 'string' && generation.startsWith('descendant-')) {
            const level = parseInt(generation.replace('descendant-', ''), 10);
            return `descendant-${level + 1}`;
        }
        // 預設返回 'child'
        return 'child';
    },

    /**
     * 使用輩分和性別建立人物 (自動計算座標 並支援自動連線與防交織排列)
     * @param {string} gender - 性別 ('male', 'female')
     */
    createPersonWithGeneration(gender, sexualOrientation = false, transgender = null) {
        if (!this.pendingGeneration) return;

        const genMap = {
            'grandparent': 0,
            'parent': 1,
            'child': 2,
            'grandchild': 3
        };
        const genIndex = (genMap[this.pendingGeneration] !== undefined) ? genMap[this.pendingGeneration] : 0;
        const grid = GenogramApp.GRID;

        // 計算 Y 座標並對齊格子
        const y = grid.ORIGIN_Y + genIndex * grid.CELL_HEIGHT;
        const generation = genIndex;

        // 偵測選取的物件作為連線對象
        const selectedIds = this.selectedPersonIds.length > 0 ? this.selectedPersonIds : (this.selectedPersonId ? [this.selectedPersonId] : []);
        const selectedPersons = selectedIds.map(id => this.personMap.get(id)).filter(p => p);

        // [Smart Positioning] 計算理想 X 座標
        let idealX = null;
        if (selectedPersons.length > 0) {
            if (['child', 'grandchild'].includes(this.pendingGeneration)) {
                // 新增子女：優先尋找現有手足
                const parentIds = selectedPersons.map(p => p.id);
                const siblings = this.persons.filter(p => {
                    if (Math.abs(p.y - y) > grid.CELL_HEIGHT * 0.5) return false;
                    const myParents = this.relationships
                        .filter(r => r.type === 'parent-child' && r.toPersonId === p.id)
                        .map(r => r.fromPersonId);
                    return myParents.some(pid => parentIds.includes(pid));
                });

                if (siblings.length > 0) {
                    // 強制放在最右邊手足的右側
                    const rightmostX = Math.max(...siblings.map(s => s.x));
                    idealX = rightmostX + grid.CELL_WIDTH;
                } else {
                    // 無手足：對齊父母中點
                    idealX = selectedPersons.reduce((acc, p) => acc + p.x, 0) / selectedPersons.length;
                    // 如果有兩位以上選取者 (夫妻)，稍微往右排開，避開可能的婚姻線中點
                    if (selectedPersons.length >= 2) idealX += grid.CELL_WIDTH * 0.5;
                }
            } else {
                // 新增父母：檢查是否已有父母
                const childrenIds = selectedPersons.map(p => p.id);

                // [New Feature] 限制每人最多兩位父母
                for (const childId of childrenIds) {
                    const currentParents = this.relationships
                        .filter(r => r.type === 'parent-child' && r.toPersonId === childId)
                        .map(r => r.fromPersonId);

                    if (currentParents.length >= 2) {
                        this.updateStatus('已選取的成員已有兩位父母，無法再新增', 'error');
                        return; // 中斷建立
                    }
                }

                const existingParents = this.persons.filter(p => {
                    if (Math.abs(p.y - y) > grid.CELL_HEIGHT * 0.5) return false;
                    const myChildren = this.relationships
                        .filter(r => r.type === 'parent-child' && r.fromPersonId === p.id)
                        .map(r => r.toPersonId);
                    return myChildren.some(cid => childrenIds.includes(cid));
                });

                if (existingParents.length > 0) {
                    // 排在最右邊父母的右側
                    const rightmostX = Math.max(...existingParents.map(p => p.x));
                    idealX = rightmostX + grid.CELL_WIDTH;
                } else {
                    // 對齊子女中點
                    idealX = selectedPersons.reduce((acc, p) => acc + p.x, 0) / selectedPersons.length;
                }
            }
        } else if (this.persons.length > 0) {
            // [UX Fix] 根據使用者需求：避免「階梯式」偏移。
            // 邏輯：找到「已有關係連線」的核心家族最右側 X，作為列隊起點。
            // 所有未連線的角色都從這個基準點開始往右找第一個空位，這樣不同輩分會自然對齊成垂直列。
            const linkedPersons = this.persons.filter(p =>
                this.relationships.some(r => r.fromPersonId === p.id || r.toPersonId === p.id)
            );
            if (linkedPersons.length > 0) {
                const familyMaxX = Math.max(...linkedPersons.map(p => p.x));
                idealX = familyMaxX + grid.CELL_WIDTH;
            } else {
                // 若全圖均無關係，則從左側起始座標開始推
                idealX = grid.ORIGIN_X;
            }
        } else {
            // [NEW] 從可視區域中心開始建立角色
            // 計算畫布可視區域中心點（考慮當前偏移量）
            const canvasWidth = this.canvas.canvas.width / (window.devicePixelRatio || 1);
            const canvasHeight = this.canvas.canvas.height / (window.devicePixelRatio || 1);
            const viewCenterX = (canvasWidth / 2 - this.canvas.offsetX) / this.canvas.scale;
            // 將 viewCenterX 對齊到格線
            idealX = this.snapToGrid(viewCenterX, 'x');
        }

        // 計算空位
        let gridIndex = 0;
        let foundSpot = false;
        let finalX = 0;
        let startXCenter = idealX !== null ? idealX : grid.ORIGIN_X;

        while (!foundSpot) {
            // 嚴格【優先往右】搜尋
            let offsetMultiplier;
            if (gridIndex <= 50) {
                offsetMultiplier = gridIndex;
            } else {
                offsetMultiplier = (gridIndex - 50) * -1;
            }

            const testX = this.snapToGrid(startXCenter + offsetMultiplier * grid.CELL_WIDTH, 'x');

            // 加大碰撞偵測半徑，保護名字標籤
            const isOccupied = this.persons.some(p =>
                Math.abs(p.y - y) < grid.CELL_HEIGHT * 0.5 &&
                Math.abs(p.x - testX) < grid.CELL_WIDTH * 0.9
            );

            if (!isOccupied) {
                finalX = testX;
                foundSpot = true;
            } else {
                gridIndex++;
                if (gridIndex > 100) break;
            }
        }

        const x = this.snapToGrid(finalX, 'x');
        // [Bug Fix] 將數字 generation 轉換為字串格式，與系統其他部分保持一致
        const genNames = ['grandparent', 'parent', 'child', 'grandchild'];
        const generationStr = genNames[genIndex] || 'parent';
        const previewId = '__placement__';
        const relationshipPreview = selectedPersons.map(selected => ({
            type: 'parent-child',
            fromPersonId: ['child', 'grandchild'].includes(this.pendingGeneration) ? selected.id : previewId,
            toPersonId: ['child', 'grandchild'].includes(this.pendingGeneration) ? previewId : selected.id
        }));
        this.beginPlacement({ kind: 'person', x, y, personId: previewId, gender,
            sexualOrientation, transgender, generation: generationStr, relationshipPreview });
        this.closeGenderModal();
        this.render();
        this.updateStatus('移動游標選擇位置，點擊畫布完成；按 Esc 取消', 'info');
    }
});
