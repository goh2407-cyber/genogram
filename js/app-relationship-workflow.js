// 來源：js/app.js；此檔以 mixin 掛回原型，載入順序：app.js → app-relationship-workflow.js（DOMContentLoaded 前同步載入）。
'use strict';
Object.assign(GenogramApp.prototype, {
    /**
     * 顯示關係選擇對話框
     */
    showRelationshipModal() {
        if (this.isPreviewingLayout) this.cancelPreviewedLayout();
        this.commitPropertyEditSession();
        const sb = document.getElementById('swapRelationshipDirection');
        if (sb) sb.style.display = 'none'; // 新建模式不顯示對調
        this.renderRecentRelationshipTypes(); // [1-5]
        this.modalManager.open(this.elements.relationshipModal);
    },

    /**
     * 取消暫存中的連線流程，避免 Undo/Redo、刪除、載入或清空資料後，
     * connectingFrom/connectingTo 仍指向已不存在的人物。
     * @param {{preserveEditor?: boolean}} options
     */
    cancelRelationshipWorkflow({ preserveEditor = false } = {}) {
        const modalActive = this.elements.relationshipModal?.classList.contains('active');
        if (modalActive && (!preserveEditor || !this.editingRelationshipId)) {
            this.closeRelationshipModal();
            return;
        }
        this.connectingFrom = null;
        this.connectingTo = null;
    },

    /**
     * 顯示關係類型編輯對話框（修改現有關係）
     */
    showRelationshipEditModal() {
        if (this.isPreviewingLayout) this.cancelPreviewedLayout();
        this.commitPropertyEditSession();
        // 變更 Modal 標題為「修改關係類型」
        const modalTitle = this.elements.relationshipModal.querySelector('.modal-title');
        if (modalTitle) {
            modalTitle.textContent = '修改關係類型';
        }
        const sb = document.getElementById('swapRelationshipDirection');
        if (sb) sb.style.display = ''; // 編輯模式才顯示對調方向
        this.renderRecentRelationshipTypes(); // [1-5]
        this.modalManager.open(this.elements.relationshipModal);
    },

    /**
     * 關閉關係選擇對話框
     */
    closeRelationshipModal() {
        this.modalManager.close(this.elements.relationshipModal);
        this.clearRecentRelationshipTypesUI(); // [1-5]
        const sb = document.getElementById('swapRelationshipDirection');
        if (sb) sb.style.display = 'none';

        // 恢復標題為預設
        const modalTitle = this.elements.relationshipModal.querySelector('.modal-title');
        if (modalTitle) {
            modalTitle.textContent = '選擇關係類型';
        }

        // 清除新建關係狀態
        this.connectingFrom = null;
        this.connectingTo = null;

        // 清除編輯模式狀態
        this.editingRelationshipId = null;

        // 連接完成後切換回選取工具
        this.setTool('select');
    },

    /**
     * [Phase 1] 對調關係方向（fromPersonId ⇄ toPersonId）。
     * 用途：修正畫反的方向性關係——如虐待箭頭指錯人、親子上下顛倒。
     */
    swapRelationshipDirection() {
        // modal 版：對調目前編輯中的關係，然後關閉
        const id = this.editingRelationshipId;
        this.closeRelationshipModal();
        if (id) this.swapRelationshipDirectionById(id);
    },

    /**
     * [Fix D] 依 id 對調關係方向（fromPersonId ⇄ toPersonId）。畫布上的 ⇄ 鈕直接呼叫此函式（不經 modal）。
     */
    swapRelationshipDirectionById(id) {
        const rel = this.relationships.find(r => r.id === id);
        if (!rel) return;
        this.saveState();
        const tmp = rel.fromPersonId;
        rel.fromPersonId = rel.toPersonId;
        rel.toPersonId = tmp;
        this._dataVersion++; // 結構方向變動 → 快取失效
        this.updateStatus('已對調關係方向', 'info');
        this.autoSave();
        this.render();
    },

    /**
     * [Phase 2A.2] 設定婚姻線走法（auto / over / straight / under），畫布上「走法鈕」直接呼叫。
     * 不經 modal；套用後立即重繪，使用者當場看到結果。
     */
    setRouteModeById(id, mode) {
        const rel = this.relationships.find(r => r.id === id);
        if (!rel) return;
        if ((rel.routeMode || 'auto') === mode) return;
        this.saveState();
        rel.routeMode = mode;
        this._dataVersion++; // 繞線變動 → 快取失效
        const label = { auto: '自動', over: 'ㄇ 上折', straight: '一 直線', under: 'ㄩ 下折' }[mode] || mode;
        this.updateStatus('婚姻線走法：' + label, 'info');
        this.autoSave();
        this.render();
    },

    /**
     * [R-1] 設定婚姻線橫桿距離（px, 0～600，四捨五入）。ㄇ：天橋抬高；ㄩ：下折加深；
     * auto / 一：值保留但不影響幾何（面板會停用控制項）。
     * @param {string} id
     * @param {number} lift
     */
    setRouteLiftById(id, lift) {
        const rel = this.relationships.find(r => r.id === id);
        if (!rel) return;
        const next = Math.max(0, Math.min(600, Math.round(Number(lift) || 0)));
        if ((rel.routeLift || 0) === next) return;
        this.saveState();
        rel.routeLift = next;
        this._dataVersion++; // 幾何變動 → 快取失效
        this.updateStatus(`橫桿距離：${next}px`, 'info', { autoHideMs: GenogramApp.STATUS_TIMEOUTS.passive });
        this.autoSave();
        this.render();
    },

    /**
     * [1-4] 依 id 變更親子線型（親生/收養/寄養）；屬性面板直接呼叫，不經 modal。
     * @param {string} id
     * @param {'biological'|'adopted'|'foster'} linkType
     */
    setLinkTypeById(id, linkType) {
        const rel = this.relationships.find(r => r.id === id);
        if (!rel || rel.type !== 'parent-child') return;
        if (!['biological', 'adopted', 'foster'].includes(linkType)) return;
        if ((rel.linkType || 'biological') === linkType) return;
        this.saveState();
        rel.linkType = linkType;
        this._dataVersion++; // 線型變動 → 快取失效
        const label = { biological: '親生', adopted: '收養', foster: '寄養' }[linkType];
        this.updateStatus(`子女線型：${label}`, 'info', { autoHideMs: GenogramApp.STATUS_TIMEOUTS.passive });
        this.autoSave();
        this.render();
        this.updatePropertyPanel();
    },

    /**
     * 更新關係類型（編輯模式）
     * @param {string} type - 新的關係類型
     */
    updateRelationshipType(type, linkType = null) {
        if (!type || type === 'undefined') return;
        if (!this.editingRelationshipId) return;

        const relationship = this.relationships.find(r => r.id === this.editingRelationshipId);
        if (!relationship) {
            this.closeRelationshipModal();
            return;
        }

        // 如果類型相同、且（未指定 linkType 或子女線型也相同），才視為無變更
        // [Phase 1] 否則「同為 parent-child、只改親生→收養」會被誤擋
        if (relationship.type === type && (!linkType || relationship.linkType === linkType)) {
            this.closeRelationshipModal();
            return;
        }

        // 驗證婚姻類關係的限制規則
        const fromPerson = this.personMap.get(relationship.fromPersonId);
        const toPerson = this.personMap.get(relationship.toPersonId);
        const category = Relationship.getCategory(type);

        if (category === 'marriage') {
            const validationResult = this.validateMarriageRelationship(fromPerson, toPerson);
            if (!validationResult.valid) {
                this.updateStatus(validationResult.message, 'error');
                this.closeRelationshipModal();
                return;
            }
        }

        // 新建與編輯必須遵守相同的唯一性規則：伴侶類與親子類在同一對人物間
        // 各只能有一條；情感類可多條並存，但不能有同方向、同類型的完全重複線。
        const conflictingRelationship = this.relationships.find(other => {
            if (other.id === relationship.id) return false;

            const sameDirection =
                other.fromPersonId === relationship.fromPersonId &&
                other.toPersonId === relationship.toPersonId;
            const sameUndirectedPair = sameDirection || (
                other.fromPersonId === relationship.toPersonId &&
                other.toPersonId === relationship.fromPersonId
            );
            const otherCategory = typeof other.getCategory === 'function'
                ? other.getCategory()
                : Relationship.getCategory(other.type);

            if (category === 'marriage' || category === 'family') {
                return sameUndirectedPair && otherCategory === category;
            }
            return sameDirection && other.type === type;
        });

        if (conflictingRelationship) {
            const message = category === 'marriage'
                ? '兩人之間已有伴侶類關係，請直接編輯既有關係'
                : category === 'family'
                    ? '兩人之間已有親子關係，請直接編輯既有關係'
                    : '此方向的相同關係已存在';
            this.updateStatus(message, 'warning');
            this.closeRelationshipModal();
            return;
        }

        // 儲存狀態供復原使用
        this.saveState();

        // 更新關係類型
        const oldType = relationship.type;
        relationship.type = type;

        // [Fix B1] 切換到親子關係時即正規化方向（parent 在上）。
        // 情感線沒有方向語意，沿用其 from->to 會違反 KinshipEngine 的 from=parent 契約。
        if (type === 'parent-child') {
            if (linkType) relationship.linkType = linkType; // [Phase 1] 親生/收養/寄養
            this.normalizeParentChildDirection(relationship);
        }
        this._dataVersion++; // [Phase 0a] 關係型別/方向變動 → 使快取失效

        // 顯示更新成功訊息
        const newTypeName = Relationship.getTypeName(type);
        const oldTypeName = Relationship.getTypeName(oldType);
        this.updateStatus(`已將關係從「${oldTypeName}」改為「${newTypeName}」`, 'info');

        this.closeRelationshipModal();
        this.autoSave();
        if (Relationship.isEmotionalDisplayType(type)) {
            this.ensureViewOption('showEmotionalRelationships', { render: false });
        }
        this.render();
    },

    /**
     * [Fix B1/B3] 將單一親子關係的方向正規化為 parent(上) -> child(下)。
     * 規則與 normalizeLoadedFamilyRelationships 的 Y 軸判斷一致（Y 小者為 parent），
     * 供「建立 / 切換型別」時即時套用，避免反向 from->to 直到存檔重載才被修正。
     * 僅交換單一關係的端點，不重排 relationships 陣列（避免影響情感線平行偏移順序）。
     * @param {Relationship} rel
     */
    normalizeParentChildDirection(rel) {
        if (!rel || rel.type !== 'parent-child') return;
        if (!rel.fromPersonId || !rel.toPersonId || rel.fromPersonId === rel.toPersonId) return;
        const p1 = this.personMap.get(rel.fromPersonId);
        const p2 = this.personMap.get(rel.toPersonId);
        if (!p1 || !p2) return;
        // 目前 from 在下、to 在上 → 交換，使 from = 上方的 parent。Y 相等則維持原方向。
        if (p2.y < p1.y) {
            const tmp = rel.fromPersonId;
            rel.fromPersonId = rel.toPersonId;
            rel.toPersonId = tmp;
        }
    },

    /**
     * 建立關係
     */
    createRelationship(type, linkType = null) {
        if (!type || type === 'undefined') return; // 安全檢查：防止 undefined 類型
        if (!this.connectingFrom || !this.connectingTo) return;

        const fromId = this.connectingFrom.person.id;
        const toId = this.connectingTo.id;
        const fromPerson = this.personMap.get(fromId);
        const toPerson = this.personMap.get(toId);
        const category = Relationship.getCategory(type);

        // [驗證] 婚姻類關係的限制規則
        if (category === 'marriage') {
            const validationResult = this.validateMarriageRelationship(fromPerson, toPerson);
            if (!validationResult.valid) {
                this.updateStatus(validationResult.message, 'error');
                this.closeRelationshipModal();
                return;
            }
        }

        // 檢查是否已存在「完全相同」的關係（防止完全重複）
        // 情感類：方向敏感（例：母控制子 vs 子控制母 是兩條獨立關係）
        // 婚姻/親子類：方向不敏感（雙向視為同一條）
        const exactDuplicate = this.relationships.find(r => {
            if (r.type !== type) return false;
            if (category === 'emotional') {
                return r.fromPersonId === fromId && r.toPersonId === toId;
            }
            return (r.fromPersonId === fromId && r.toPersonId === toId) ||
                   (r.fromPersonId === toId && r.toPersonId === fromId);
        });

        if (exactDuplicate) {
            this.updateStatus('此關係已存在', 'info');
            this.closeRelationshipModal();
            return;
        }

        // [New Logic] 允許不同類型的關係並存 (例如：婚姻 + 衝突)
        // 只有在特定情況下才「取代」舊關係：
        // 1. 同屬婚姻類 (Marriage Category) 的關係互斥（例如結婚 vs 離婚）
        // 2. 親子關係 (Parent-Child) 是唯一的
        // 情感類 (Emotional) 則允許並列
        let relationshipToReplace = null;

        if (category === 'marriage' || category === 'family') {
            relationshipToReplace = this.relationships.find(r =>
                ((r.fromPersonId === fromId && r.toPersonId === toId) ||
                    (r.fromPersonId === toId && r.toPersonId === fromId)) &&
                r.getCategory() === category
            );
        }

        let affectedRel;
        if (relationshipToReplace) {
            // 如果已存在同類別的結構化關係，更新它
            this.saveState();
            relationshipToReplace.type = type;
            affectedRel = relationshipToReplace;
        } else {
            // 新增為獨立的關係
            this.saveState();
            affectedRel = new Relationship({
                fromPersonId: fromId,
                toPersonId: toId,
                type: type
            });
            this.relationships.push(affectedRel);
        }

        // 若是親子關係：先正規化方向（避免使用者「先點子再點父」存成反向邊 [Fix B3]），
        // 再自動置中父母於子女上方。
        if (type === 'parent-child') {
            if (linkType) affectedRel.linkType = linkType; // [Phase 1] 親生/收養/寄養
            this.normalizeParentChildDirection(affectedRel);
            this.centerParentsAboveChildren();
        }

        this._dataVersion++; // [Phase 0a] 新增/取代關係 → 結構變動，使快取失效
        this.closeRelationshipModal();
        this.autoSave();
        if (Relationship.isEmotionalDisplayType(type)) {
            this.ensureViewOption('showEmotionalRelationships', { render: false });
        }
        this.render();


    },

    /**
     * 驗證婚姻類關係是否合法
     * @param {Person} person1 - 第一個人物
     * @param {Person} person2 - 第二個人物
     * @returns {{valid: boolean, message: string}} - 驗證結果
     */
    validateMarriageRelationship(person1, person2) {
        if (!person1 || !person2) {
            return { valid: false, message: '無法找到選取的成員' };
        }

        const grid = GenogramApp.GRID;
        const kinship = this.getKinshipEngine();

        // 規則 1: 同輩分檢查（Y 座標差異不超過半個格子高度）
        const yDiff = Math.abs(person1.y - person2.y);
        if (yDiff > grid.CELL_HEIGHT * 0.5) {
            return { valid: false, message: '⚠️ 無法建立伴侶關係：兩人不在同一輩分' };
        }

        // 規則 2: 檢查是否已有直接親子關係
        const hasDirectParentChild =
            kinship.hasParentChildLink(person1.id, person2.id) ||
            kinship.hasParentChildLink(person2.id, person1.id);
        if (hasDirectParentChild) {
            return { valid: false, message: '⚠️ 無法建立伴侶關係：兩人之間已有親子關係' };
        }

        // 規則 3: 檢查是否為手足（共同父母）
        if (kinship.shareAnyParent(person1.id, person2.id)) {
            return { valid: false, message: '⚠️ 無法建立伴侶關係：兩人是手足（有共同父母）' };
        }

        // 規則 4: 檢查 person2 是否在 person1 的祖先中（不能和父母、祖父母結婚）
        const ancestors1 = kinship.getAncestorIds(person1.id);
        if (ancestors1.has(person2.id)) {
            return { valid: false, message: '⚠️ 無法建立伴侶關係：不能與父母或祖先結婚' };
        }

        // 規則 5: 檢查 person2 是否在 person1 的子孫中（不能和子女、孫子女結婚）
        const descendants1 = kinship.getDescendantIds(person1.id);
        if (descendants1.has(person2.id)) {
            return { valid: false, message: '⚠️ 無法建立伴侶關係：不能與子女或後代結婚' };
        }

        // 規則 6: 反向檢查（person1 是否在 person2 的祖先/子孫中）
        const ancestors2 = kinship.getAncestorIds(person2.id);
        if (ancestors2.has(person1.id)) {
            return { valid: false, message: '⚠️ 無法建立伴侶關係：不能與子女或後代結婚' };
        }

        const descendants2 = kinship.getDescendantIds(person2.id);
        if (descendants2.has(person1.id)) {
            return { valid: false, message: '⚠️ 無法建立伴侶關係：不能與父母或祖先結婚' };
        }

        return { valid: true, message: '' };
    },

    /**
     * 顯示選擇子女對話框
     */
    showChildrenModal(potentialChildren) {
        if (!this.elements.childrenModal || !this.elements.childrenList) return;
        this.commitPropertyEditSession();

        // 清空並填充子女列表
        this.elements.childrenList.replaceChildren();
        this.selectedChildrenIds = [];

        if (potentialChildren.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'no-children-hint';
            empty.textContent = '沒有可選的子女';
            this.elements.childrenList.replaceChildren(empty);
        } else {
            potentialChildren.forEach(child => {
                const option = document.createElement('div');
                option.className = 'child-option';
                option.dataset.id = child.id;
                const icon = document.createElement('span');
                const safeGender = ['male', 'female', 'pregnancy', 'same'].includes(child.gender)
                    ? child.gender : 'same';
                icon.className = `child-icon ${safeGender}`;
                const label = document.createElement('span');
                label.textContent = child.name || (child.gender === 'male' ? '男性' : '女性');
                option.replaceChildren(icon, label);
                option.addEventListener('click', () => {
                    option.classList.toggle('selected');
                    if (option.classList.contains('selected')) {
                        this.selectedChildrenIds.push(child.id);
                    } else {
                        this.selectedChildrenIds = this.selectedChildrenIds.filter(id => id !== child.id);
                    }
                });
                this.elements.childrenList.appendChild(option);
            });
        }

        this.modalManager.open(this.elements.childrenModal);
    },

    /**
     * 關閉選擇子女對話框
     */
    closeChildrenModal() {
        if (this.elements.childrenModal) {
            this.modalManager.close(this.elements.childrenModal);
        }
        this.pendingParents = null;
        this.selectedChildrenIds = [];
    },

    /**
     * 確認子女選擇並建立親子關係
     */
    confirmChildrenSelection() {
        if (!this.pendingParents || !this.selectedChildrenIds || this.selectedChildrenIds.length === 0) {
            this.closeChildrenModal();
            return;
        }

        this.saveState();

        // 為每個選中的子女與兩位父母建立親子關係
        this.selectedChildrenIds.forEach(childId => {
            this.pendingParents.forEach(parentId => {
                // 檢查是否已存在親子關係（單向：from=parent, to=child）
                const exists = this.hasParentChildLink(parentId, childId);
                if (!exists) {
                    const relationship = new Relationship({
                        fromPersonId: parentId,
                        toPersonId: childId,
                        type: 'parent-child'
                    });
                    this.relationships.push(relationship);
                }
            });
        });

        // 自動對齊
        this.centerParentsAboveChildren();
        this.autoSave();
        this.render();
        this.closeChildrenModal();
        this.updateStatus(`已建立 ${this.selectedChildrenIds.length} 位子女的親子關係`, 'success');
    },

    /**
     * 將所有父母置中於子女上方
     * 遍歷所有親子關係，確保每位父母的 X 座標置中於其所有子女的中心點
     */
    centerParentsAboveChildren() {
        const kinship = this.getKinshipEngine();
        // 收集所有「被判定為父母」的人
        const parentIds = new Set();
        this.relationships.forEach(rel => {
            const pc = kinship.normalizeParentChild ? kinship.normalizeParentChild(rel) : null;
            if (pc) parentIds.add(pc.parentId);
        });

        const processedPairs = new Set();

        parentIds.forEach(parentId => {
            const parent = this.personMap.get(parentId);
            if (!parent) return;

            const spouseIds = this.getSpouseIds(parentId);

            // 多段伴侶：停用自動置中，避免破壞複雜婚姻排版
            if (spouseIds.length > 1) return;

            // 單親：直接以自己的子女置中
            if (spouseIds.length === 0) {
                const childXPositions = this.persons
                    .filter(ch => this.hasParentChildLink(parentId, ch.id))
                    .map(ch => ch.x);

                if (childXPositions.length === 0) return;
                const centerX = childXPositions.reduce((sum, x) => sum + x, 0) / childXPositions.length;
                parent.x = centerX;
                return;
            }

            // 一對一伴侶：以「共同子女」置中
            const spouseId = spouseIds[0];
            const spouse = this.personMap.get(spouseId);
            if (!spouse) return;

            // 若對方有多段伴侶，也跳過自動置中
            if (this.getSpouseIds(spouseId).length > 1) return;

            const pairKey = [parentId, spouseId].sort().join('_');
            if (processedPairs.has(pairKey)) return;
            processedPairs.add(pairKey);

            const sharedChildXPositions = this.persons
                .filter(ch => this.hasParentChildLink(parentId, ch.id) && this.hasParentChildLink(spouseId, ch.id))
                .map(ch => ch.x);

            if (sharedChildXPositions.length === 0) return;

            const centerX = sharedChildXPositions.reduce((sum, x) => sum + x, 0) / sharedChildXPositions.length;
            const spacing = GenogramApp.HORIZONTAL_SPACING;

            // 根據性別決定左右位置（男左女右）
            if (parent.gender === 'male') {
                parent.x = centerX - spacing / 2;
                spouse.x = centerX + spacing / 2;
            } else {
                parent.x = centerX + spacing / 2;
                spouse.x = centerX - spacing / 2;
            }
        });
    },

    /**
     * 載入舊資料時正規化親子關係，避免錯向/重複資料影響點擊與顯示
     * @returns {{normalized: number, deduped: number, dropped: number}}
     */
    normalizeLoadedFamilyRelationships({ inferDirectionFromY = false } = {}) {
        const personById = new Map(this.persons.map(p => [p.id, p]));
        const seenParentChild = new Set();
        const stats = { normalized: 0, deduped: 0, dropped: 0 };
        const nextRels = [];

        this.relationships.forEach(rel => {
            let category = typeof rel.getCategory === 'function'
                ? rel.getCategory()
                : Relationship.getCategory(rel.type);

            // 舊版相容：family 視為 parent-child（沒有方向語意，稍後才允許用 Y 軸推斷）
            let legacyFamily = false;
            if (rel.type === 'family') {
                rel.type = 'parent-child';
                category = 'family';
                legacyFamily = true;
                stats.normalized++;
            }

            if (category !== 'family') {
                nextRels.push(rel);
                return;
            }

            if (!rel.fromPersonId || !rel.toPersonId || rel.fromPersonId === rel.toPersonId) {
                stats.dropped++;
                return;
            }

            const p1 = personById.get(rel.fromPersonId);
            const p2 = personById.get(rel.toPersonId);
            if (!p1 || !p2) {
                stats.dropped++;
                return;
            }

            // [R4] parent-child 信任 from→to（GENERATION_POLICY 第 2 條）；
            // 只有舊版 'family' 型別（無方向資料）或 schema < 1.1 的檔案（建立時尚未保證方向），
            // 才退而用 Y 軸位置推斷（上者為 parent）
            let parentId = rel.fromPersonId;
            let childId = rel.toPersonId;
            if (legacyFamily || inferDirectionFromY) {
                if (p1.y < p2.y) {
                    parentId = p1.id;
                    childId = p2.id;
                } else if (p2.y < p1.y) {
                    parentId = p2.id;
                    childId = p1.id;
                }
            }

            const pairKey = `${parentId}->${childId}`;
            if (seenParentChild.has(pairKey)) {
                stats.deduped++;
                return;
            }
            seenParentChild.add(pairKey);

            if (rel.fromPersonId !== parentId || rel.toPersonId !== childId || rel.type !== 'parent-child') {
                rel.fromPersonId = parentId;
                rel.toPersonId = childId;
                rel.type = 'parent-child';
                stats.normalized++;
            }

            nextRels.push(rel);
        });

        this.relationships = nextRels;
        this._dataVersion++; // [Phase 0a] 關係正規化改了型別/端點/數量 → 使快取失效
        return stats;
    }
});
