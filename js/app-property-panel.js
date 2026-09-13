// 來源：js/app.js；此檔以 mixin 掛回原型，載入順序：app.js → app-property-panel.js（DOMContentLoaded 前同步載入）。
'use strict';
Object.assign(GenogramApp.prototype, {
    updatePropertyPanel() {
        this.commitPropertyEditSession();
        if (this.labelEditingPersonId && this.labelEditingPersonId === this.selectedPersonId) {
            this.setPropertyPanelTemplate('empty');
            return;
        }
        if (this.selectedRelationshipId) {
            const relationship = this.relationships.find(r => r.id === this.selectedRelationshipId);
            if (!relationship) {
                this.setPropertyPanelTemplate('empty');
                return;
            }

            const root = this.setPropertyPanelTemplate('relationship');
            const fromPerson = this.personMap.get(relationship.fromPersonId);
            const toPerson = this.personMap.get(relationship.toPersonId);
            root.querySelector('#relationshipTypeName').textContent = Relationship.getTypeName(relationship.type);
            root.querySelector('#relationshipEndpoints').textContent =
                `${fromPerson ? fromPerson.name || '未命名' : '未知'} ↔ ${toPerson ? toPerson.name || '未命名' : '未知'}`;
            root.querySelector('#relationshipDate').value = relationship.date || '';

            // [1-4] 面板直接變更類型 / 子女線型 / 婚姻線走法（與畫布鉛筆、走法鈕共用同一組函式）
            root.querySelector('#changeRelationshipTypeBtn').addEventListener('click', () => {
                this.editingRelationshipId = relationship.id;
                this.showRelationshipEditModal();
            });
            const linkGroup = root.querySelector('#relationshipLinkTypeGroup');
            linkGroup.hidden = relationship.type !== 'parent-child'; // 明確設定，避免沿用前一次選取的顯示狀態
            if (relationship.type === 'parent-child') {
                const currentLink = relationship.linkType || 'biological';
                linkGroup.querySelectorAll('[data-link-type]').forEach(btn => {
                    const active = btn.dataset.linkType === currentLink;
                    btn.classList.toggle('is-active', active);
                    btn.setAttribute('aria-pressed', String(active));
                    btn.addEventListener('click', () => this.setLinkTypeById(relationship.id, btn.dataset.linkType));
                });
            }
            const routeGroup = root.querySelector('#relationshipRouteGroup');
            const isMarriage = Relationship.getCategory(relationship.type) === 'marriage';
            routeGroup.hidden = !isMarriage; // 明確設定
            if (isMarriage) {
                const currentRoute = relationship.routeMode || 'auto';
                routeGroup.querySelectorAll('[data-route-mode]').forEach(btn => {
                    const active = btn.dataset.routeMode === currentRoute;
                    btn.classList.toggle('is-active', active);
                    btn.setAttribute('aria-pressed', String(active));
                    btn.addEventListener('click', () => {
                        this.setRouteModeById(relationship.id, btn.dataset.routeMode);
                        this.updatePropertyPanel();
                    });
                });
                // [R-1] 橫桿距離：只有 ㄇ / ㄩ 有橫桿可調；auto / 一 停用
                const liftRow = routeGroup.querySelector('#relationshipLiftRow');
                if (liftRow) {
                    const hasBar = currentRoute === 'over' || currentRoute === 'under';
                    const lift = relationship.routeLift || 0;
                    liftRow.querySelector('#relationshipLiftValue').textContent = String(lift);
                    liftRow.querySelectorAll('[data-lift]').forEach(btn => {
                        btn.disabled = !hasBar;
                        if (!hasBar) btn.title = '先選 ㄇ 或 ㄩ 走法，才有橫桿可調';
                        btn.addEventListener('click', () => {
                            const v = btn.dataset.lift === 'reset' ? 0 : lift + Number(btn.dataset.lift);
                            this.setRouteLiftById(relationship.id, v);
                            this.updatePropertyPanel();
                        });
                    });
                }
            }

            this.bindPropertyEdit(root.querySelector('#relationshipDate'), e => {
                relationship.date = e.target.value;
            });
            root.querySelector('#deleteRelationshipBtn').addEventListener('click', () => this.deleteSelected());
            return;
        }

        if (this.selectedHouseholdId) {
            const household = this.households.find(h => h.id === this.selectedHouseholdId);
            if (household) {
                const root = this.setPropertyPanelTemplate('household');
                root.querySelector('#householdMemberCount').textContent = `同住圈（${household.ids.length} 位成員）`;
                // [HH-2] 名稱（畫在框上）
                root.querySelector('#householdLabel').value = household.label || '';
                this.bindPropertyEdit(root.querySelector('#householdLabel'), e => {
                    household.label = e.target.value.trim();
                });
                // [HH-3] 成員標籤（✕ 移出）+ 加入下拉；✕ 用 CSS 畫，不進 textContent
                const membersHost = root.querySelector('#householdMembers');
                membersHost.replaceChildren();
                household.ids.forEach(id => {
                    const p = this.personMap.get(id);
                    if (!p) return;
                    const chip = document.createElement('span');
                    chip.className = 'household-member-chip';
                    chip.dataset.personId = id;
                    const nameEl = document.createElement('span');
                    nameEl.className = 'chip-name';
                    nameEl.textContent = p.name || '未命名';
                    const removeBtn = document.createElement('button');
                    removeBtn.type = 'button';
                    removeBtn.className = 'chip-remove';
                    removeBtn.setAttribute('aria-label', `將 ${p.name || '未命名'} 移出同住圈`);
                    removeBtn.title = '移出同住圈';
                    removeBtn.addEventListener('click', () => this.removeHouseholdMember(household.id, id));
                    chip.append(nameEl, removeBtn);
                    membersHost.appendChild(chip);
                });
                if (!household.ids.length) membersHost.textContent = '（無成員）';
                const select = root.querySelector('#householdAddSelect');
                this.persons.filter(p => !household.ids.includes(p.id)).forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    const age = typeof p.getDisplayAge === 'function' ? p.getDisplayAge(this.ageReferenceDate) : p.age;
                    opt.textContent = (p.name || '未命名') + (age !== null && age !== undefined && age !== '' ? `（${age}）` : '');
                    select.appendChild(opt);
                });
                root.querySelector('#householdAddBtn').addEventListener('click', () => {
                    const pid = select.value;
                    if (!pid) { this.updateStatus('請先從下拉選單選擇要加入的成員', 'warning'); return; }
                    this.addHouseholdMember(household.id, pid);
                });
                root.querySelector('#householdNotes').value = household.notes || '';
                this.bindPropertyEdit(root.querySelector('#householdNotes'), e => {
                    household.notes = e.target.value;
                }, { render: false });
                root.querySelector('#deleteHouseholdBtn').addEventListener('click', () => this.deleteSelected());
                return;
            }
        }

        if (this.selectedLifeCircleId) {
            const lc = this.lifeCircles.find(l => l.id === this.selectedLifeCircleId);
            if (lc) {
                const root = this.setPropertyPanelTemplate('lifeCircle');
                root.querySelector('#lifeCircleLabel').value = lc.label || '';
                // [LC-3] 名稱位置 / 說明
                const posSel = root.querySelector('#lifeCircleLabelPosition');
                posSel.value = ['top', 'center', 'bottom'].includes(lc.labelPosition) ? lc.labelPosition : 'top';
                this.bindPropertyEdit(posSel, e => {
                    lc.labelPosition = e.target.value === 'top' ? undefined : e.target.value;
                    if (lc.labelPosition === undefined) delete lc.labelPosition; // 預設值不寫入 JSON
                }, { eventName: 'change', commitOnChange: true });
                const notesEl = root.querySelector('#lifeCircleNotes');
                notesEl.value = lc.notes || '';
                this.bindPropertyEdit(notesEl, e => {
                    if (e.target.value) lc.notes = e.target.value; else delete lc.notes;
                }, { render: false });
                const swatchHost = root.querySelector('#lifeCircleSwatches');
                GenogramApp.LIFE_CIRCLE_COLORS.forEach(color => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'lc-color-swatch';
                    button.dataset.color = color;
                    button.setAttribute('aria-label', `選擇生活圈顏色 ${color}`);
                    button.style.width = '26px';
                    button.style.height = '26px';
                    button.style.borderRadius = '50%';
                    button.style.cursor = 'pointer';
                    button.style.background = color.replace(/,\s*[\d.]+\)/, ', 0.85)');
                    button.style.border = `2px solid ${lc.color === color ? 'var(--text-primary)' : 'var(--border-color)'}`;
                    button.classList.toggle('active', lc.color === color);
                    swatchHost.appendChild(button);
                });
                this.bindPropertyEdit(root.querySelector('#lifeCircleLabel'), e => {
                    lc.label = e.target.value;
                });
                root.querySelectorAll('.lc-color-swatch').forEach(btn => {
                    this.bindPropertyEdit(btn, () => {
                        lc.color = btn.dataset.color;
                        root.querySelectorAll('.lc-color-swatch').forEach(swatch => {
                            const active = swatch === btn;
                            swatch.classList.toggle('active', active);
                            swatch.style.border = `2px solid ${active ? 'var(--text-primary)' : 'var(--border-color)'}`;
                        });
                    }, { eventName: 'click', commitOnChange: true });
                });
                root.querySelector('#deleteLifeCircleBtn').addEventListener('click', () => this.deleteSelected());
                return;
            }
        }

        if (!this.selectedPersonId) {
            this.setPropertyPanelTemplate('empty');
            return;
        }

        const person = this.personMap.get(this.selectedPersonId);
        if (!person) {
            this.setPropertyPanelTemplate('empty');
            return;
        }

        const root = this.setPropertyPanelTemplate('person');
        const valueById = {
            personName: person.name || '',
            personAge: person.age ?? '',
            personBirthDate: person.birthDate || '',
            personDeathDate: person.deathDate || '',
            personNotes: person.notes || '',
            personGender: person.gender,
            personLossType: person.lossType || '',
            medLeftHalf: person.medical?.leftHalf || 'none',
            medBottomHalf: person.medical?.bottomHalf || 'none'
        };
        Object.entries(valueById).forEach(([id, value]) => {
            const field = root.querySelector(`#${id}`);
            if (field) field.value = value;
        });
        const checkedById = {
            personDeceased: Boolean(person.isDeceased),
            medSmoker: Boolean(person.medical?.isSmoker),
            medObese: Boolean(person.medical?.isObese),
            medLang: Boolean(person.medical?.hasLanguageProblem)
        };
        Object.entries(checkedById).forEach(([id, checked]) => {
            const field = root.querySelector(`#${id}`);
            if (field) field.checked = checked;
        });
        root.querySelector('#personIP').setAttribute('aria-pressed', String(Boolean(person.isIdentifiedPatient)));
        // 僅記住本次工作階段的手動收合選擇，不寫入人物資料、history 或存檔。
        if (!this.personPanelSectionState) this.personPanelSectionState = new Map();
        const sectionDefaults = {
            personLossSection: Boolean(person.lossType),
            personMedicalSection: valueById.medLeftHalf !== 'none' || valueById.medBottomHalf !== 'none'
                || checkedById.medSmoker || checkedById.medObese || checkedById.medLang
        };
        Object.entries(sectionDefaults).forEach(([id, defaultOpen]) => {
            const section = root.querySelector(`#${id}`);
            const saved = this.personPanelSectionState.get(person.id);
            section.open = saved?.[id] ?? defaultOpen;
            section.querySelector('summary').addEventListener('click', () => {
                // 滑鼠與鍵盤都走原生 click；在預設切換前同步記錄，避免重建面板丟失延後的 toggle。
                const state = this.personPanelSectionState.get(person.id) || {};
                state[id] = !section.open;
                this.personPanelSectionState.set(person.id, state);
            });
        });
        if (person.transgender !== 'mtf') {
            const option = document.createElement('option');
            option.value = 'pregnancy';
            option.textContent = '懷孕 / 性別未定 (三角形)';
            root.querySelector('#personGender').appendChild(option);
            root.querySelector('#personGender').value = person.gender;
        }
        root.querySelector('#twinSettingsHost').appendChild(this.createTwinSettingsElement(person));
        this.setupPropertyFormEvents();
        this.refreshPersonAgeFields(root, person); // [2-1]
    },

    adjustSelectedPersonLabel(direction, options = {}) {
        const delta = GenogramApp.LABEL_NUDGE_DIRECTIONS[direction];
        const person = this.personMap.get(this.selectedPersonId);
        if (!person || !delta) return;
        const current = person.labelPlacement || { offsetX: 0, offsetY: 0 };
        // 按住連續移動時只在第一步記 history，整段按住合併成一次 undo
        if (options.recordHistory !== false) this.saveState();
        this.setSelectedPersonLabelOffset(
            current.offsetX + delta[0] * GenogramApp.LABEL_NUDGE_DISTANCE,
            current.offsetY + delta[1] * GenogramApp.LABEL_NUDGE_DISTANCE);
        this.autoSave();
    },

    /**
     * 直接寫入文字位移並重畫（不碰 history，由呼叫端決定何時記錄）。
     */
    setSelectedPersonLabelOffset(offsetX, offsetY) {
        const person = this.personMap.get(this.selectedPersonId);
        if (!person) return;
        const next = { offsetX: Math.round(offsetX), offsetY: Math.round(offsetY) };
        person.labelPlacement = next.offsetX || next.offsetY ? next : null;
        this.render();
    },

    resetSelectedPersonLabel() {
        const person = this.personMap.get(this.selectedPersonId);
        if (!person || !person.labelPlacement) return;
        this.saveState();
        person.labelPlacement = null;
        this.autoSave();
        this.render();
    },

    setupLabelPositionPopover() {
        const popover = this.elements.labelPositionPopover;
        if (!popover) return;
        this.bindLabelJoystickKnob(popover.querySelector('#labelJoystickKnob'));
        this.bindLabelPopoverDrag(popover);
    },

    /**
     * 外環拖曳：把整個面板搬到使用者要的位置，之後就不再自動跟著文字錨點跑。
     * 換人編輯時回到自動定位。
     */
    bindLabelPopoverDrag(popover) {
        let drag = null;
        popover.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('#labelJoystickKnob')) return;
            const container = this.elements.canvasContainer.getBoundingClientRect();
            drag = {
                pointerId: event.pointerId,
                grabX: event.clientX - container.left - popover.offsetLeft,
                grabY: event.clientY - container.top - popover.offsetTop
            };
            popover.classList.add('is-moving');
            popover.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });
        popover.addEventListener('pointermove', event => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            const container = this.elements.canvasContainer.getBoundingClientRect();
            this.labelPopoverPlacement = {
                personId: this.labelEditingPersonId,
                left: event.clientX - container.left - drag.grabX,
                top: event.clientY - container.top - drag.grabY
            };
            this.updateLabelPositionPopover();
        });
        const endDrag = event => {
            if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
            drag = null;
            popover.classList.remove('is-moving');
        };
        popover.addEventListener('pointerup', endDrag);
        popover.addEventListener('pointercancel', endDrag);
    },

    /**
     * 中央搖桿：拖曳讓文字 1:1 跟著跑（含斜向），放開彈回中心；點一下則重置。
     */
    bindLabelJoystickKnob(knob) {
        if (!knob) return;
        let drag = null;
        const deflect = (dx, dy) => {
            const max = GenogramApp.LABEL_JOYSTICK_MAX_DEFLECTION;
            const distance = Math.hypot(dx, dy);
            const ratio = distance > max ? max / distance : 1;
            knob.style.transform = distance
                ? `translate(${(dx * ratio).toFixed(1)}px, ${(dy * ratio).toFixed(1)}px)`
                : '';
        };
        knob.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            const person = this.personMap.get(this.selectedPersonId);
            if (!person) return;
            const current = person.labelPlacement || { offsetX: 0, offsetY: 0 };
            drag = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                baseX: Number.isFinite(current.offsetX) ? current.offsetX : 0,
                baseY: Number.isFinite(current.offsetY) ? current.offsetY : 0,
                moved: false
            };
            this.labelJoystickDragging = true;
            knob.classList.add('is-dragging');
            knob.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });
        knob.addEventListener('pointermove', event => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;
            if (!drag.moved) {
                if (Math.hypot(dx, dy) < GenogramApp.LABEL_JOYSTICK_DRAG_SLOP) return;
                drag.moved = true;
                this.saveState(); // 整段拖曳合併成一次 undo
            }
            const scale = this.canvas.scale || 1;
            this.setSelectedPersonLabelOffset(drag.baseX + dx / scale, drag.baseY + dy / scale);
            deflect(dx, dy);
        });
        const endDrag = event => {
            if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
            const moved = drag.moved;
            drag = null;
            this.labelJoystickDragging = false;
            knob.classList.remove('is-dragging');
            deflect(0, 0); // 搖桿彈回中心
            if (moved) {
                this.autoSave();
                this.render(); // 清掉拖曳中的淡出狀態並更新重置提示
            } else {
                this.resetSelectedPersonLabel();
            }
        };
        knob.addEventListener('pointerup', endDrag);
        knob.addEventListener('pointercancel', endDrag);
        // detail === 0 才是鍵盤 Enter / Space；指標的點一下重置已在 pointerup 處理過
        knob.addEventListener('click', event => {
            if (event.detail !== 0) return;
            this.resetSelectedPersonLabel();
        });
        knob.addEventListener('keydown', event => {
            const direction = GenogramApp.LABEL_JOYSTICK_KEYS[event.key];
            if (!direction) return;
            event.preventDefault();
            this.adjustSelectedPersonLabel(direction);
        });
    },

    /**
     * 文字位置面板的錨點：手動微調時回傳「重置後」的文字框，讓面板不隨微調位移。
     * 沒有手動位移時回傳 null，由呼叫端沿用文字本身的位置。
     */
    getLabelPopoverAnchorBounds(person) {
        const manual = person?.labelPlacement;
        const hasManual = manual
            && (Number.isFinite(manual.offsetX) || Number.isFinite(manual.offsetY));
        if (!hasManual) return null;
        const side = ['below', 'above', 'left', 'right'].includes(manual.side)
            ? manual.side : 'below';
        return this.canvas.getPersonLabelGeometry(person, this.viewOptions,
            { side, offsetX: 0, offsetY: 0 }).bounds;
    },

    updateLabelPositionPopover() {
        const popover = this.elements.labelPositionPopover;
        const outline = this.elements.labelSelectionOutline;
        const person = this.personMap.get(this.labelEditingPersonId);
        const isActive = this.currentTool === 'select'
            && person
            && this.labelEditingPersonId === this.selectedPersonId;
        if (!popover || !outline || !isActive) {
            if (popover) popover.hidden = true;
            if (outline) outline.hidden = true;
            return;
        }

        const geometry = this.canvas.getPersonLabelGeometry(person, this.viewOptions);
        if (!geometry.bounds) {
            popover.hidden = true;
            outline.hidden = true;
            return;
        }

        const scale = this.canvas.scale;
        const toScreen = bounds => ({
            left: bounds.left * scale + this.canvas.offsetX,
            right: bounds.right * scale + this.canvas.offsetX,
            top: bounds.top * scale + this.canvas.offsetY,
            bottom: bounds.bottom * scale + this.canvas.offsetY
        });
        const target = toScreen(geometry.bounds);
        // 面板錨在「未微調」的文字位置：按方向鍵時文字會動，面板留在原地不追著跑
        const anchorBounds = this.getLabelPopoverAnchorBounds(person) || geometry.bounds;
        const anchor = toScreen(anchorBounds);
        const containerWidth = this.elements.canvasContainer.clientWidth;
        const containerHeight = this.elements.canvasContainer.clientHeight;
        // 拖曳搖桿時不因文字移出畫面而隱藏，否則會失去 pointer capture 讓拖曳中斷
        if (!this.labelJoystickDragging
            && (target.right < 0 || target.left > containerWidth
                || target.bottom < 0 || target.top > containerHeight)) {
            popover.hidden = true;
            outline.hidden = true;
            return;
        }

        const outlinePadding = 5;
        outline.hidden = false;
        outline.style.left = `${Math.round(target.left - outlinePadding)}px`;
        outline.style.top = `${Math.round(target.top - outlinePadding)}px`;
        outline.style.width = `${Math.round(target.right - target.left + outlinePadding * 2)}px`;
        outline.style.height = `${Math.round(target.bottom - target.top + outlinePadding * 2)}px`;

        popover.hidden = false;
        popover.style.visibility = 'hidden';
        const gap = GenogramApp.LABEL_POPOVER_GAP;
        const edge = 12;
        // 使用者拖過面板就尊重手動位置，只做邊界夾制；換人編輯才回到自動定位
        const manual = this.labelPopoverPlacement?.personId === this.labelEditingPersonId
            ? this.labelPopoverPlacement : null;
        let left = manual ? manual.left : anchor.right + gap;
        if (!manual && left + popover.offsetWidth > containerWidth - edge) {
            left = anchor.left - popover.offsetWidth - gap;
        }
        left = Math.max(edge, Math.min(left, containerWidth - popover.offsetWidth - edge));
        // 圓形拉桿垂直置中對齊文字，比切齊上緣看起來穩
        let top = manual ? manual.top
            : (anchor.top + anchor.bottom) / 2 - popover.offsetHeight / 2;
        top = Math.max(edge, Math.min(top, containerHeight - popover.offsetHeight - edge));
        popover.style.left = `${Math.round(left)}px`;
        popover.style.top = `${Math.round(top)}px`;
        popover.style.visibility = '';
        // 文字真的移到面板底下時淡出讓路：滑鼠移上去可暫時恢復，
        // 但拖曳中維持淡出，否則手正壓在搖桿上就永遠看不到底下的文字
        const overlapsText = target.right > left
            && target.left < left + popover.offsetWidth
            && target.bottom > top
            && target.top < top + popover.offsetHeight;
        popover.classList.toggle('is-behind-text', overlapsText);
        popover.classList.toggle('is-dragging', Boolean(this.labelJoystickDragging));
    },

    /**
     * 建立同住家庭
     */
    /**
     * [HH-3] 從同住框移出一位成員；歸零則刪框。一筆 history。
     */
    removeHouseholdMember(householdId, personId) {
        const idx = this.households.findIndex(h => h.id === householdId);
        if (idx < 0) return;
        const household = this.households[idx];
        if (!household.ids.includes(personId)) return;
        this.saveState();
        const remain = household.ids.filter(id => id !== personId);
        if (remain.length === 0) {
            this.households = this.households.filter(h => h.id !== householdId);
            if (this.selectedHouseholdId === householdId) this.selectedHouseholdId = null;
            this.updateStatus('同住圈已無成員，已移除', 'info');
        } else {
            this.households[idx] = { ...household, ids: remain };
            this.updateStatus('已將成員移出同住圈', 'info');
        }
        this._dataVersion++;
        this.updatePropertyPanel();
        this.autoSave();
        this.render();
    },

    /**
     * [HH-3] 把一位成員加入同住框；若已在其他框則先移出（舊框歸零即刪）。一筆 history。
     */
    addHouseholdMember(householdId, personId) {
        const target = this.households.find(h => h.id === householdId);
        if (!target || !this.personMap.has(personId) || target.ids.includes(personId)) return;
        this.saveState();
        this.households = this.households
            .map(h => h.id === householdId
                ? { ...h, ids: [...h.ids, personId] }
                : { ...h, ids: h.ids.filter(id => id !== personId) })
            .filter(h => h.ids.length > 0);
        this._dataVersion++;
        const p = this.personMap.get(personId);
        this.updateStatus(`已將 ${p.name || '未命名'} 加入同住圈`, 'info');
        this.updatePropertyPanel();
        this.autoSave();
        this.render();
    },

    createHousehold() {
        if (this.householdSelection.length < 1) {
            this.updateStatus('請至少選取一位成員', 'error');
            return;
        }

        // [Fix] undo 語意：必須在資料變更「之前」存快照，否則第一次 Ctrl+Z 無效
        this.saveState();

        // [Fix] 成員原本就屬於其他同住框時，只把重疊成員移出舊框，
        // 不再整框無聲刪除（舊框剩餘成員仍保留；剩 0 人才移除）
        const selectedSet = new Set(this.householdSelection);
        let movedOut = 0;
        this.households = this.households.map(h => {
            const remain = h.ids.filter(id => !selectedSet.has(id));
            movedOut += h.ids.length - remain.length;
            return { ...h, ids: remain };
        }).filter(h => h.ids.length > 0);

        const newHousehold = {
            id: 'house_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            ids: [...this.householdSelection],
            notes: ''
        };

        this.households.push(newHousehold);

        // 選取剛建立的家庭，以便使用者立即看到屬性面板並確認建立成功
        this.selectedHouseholdId = newHousehold.id;
        this.selectedPersonId = null;
        this.selectedPersonIds = [];
        this.selectedRelationshipId = null;
        this.selectedLifeCircleId = null;
        this.householdSelection = [];

        this.setTool('select');
        this.updateStatus(movedOut > 0
            ? `同住圈已建立（${movedOut} 位成員已從原同住圈移出）`
            : '同住圈已建立', 'success');
        this.autoSave();
        this.render();
    },

    /**
     * 完成生活圈繪製
     */
    finishLifeCircle(presetPoints = null) {
        // [Fix] 去除相鄰重複頂點（雙擊完成前的兩次 pointerdown 會塞入同一點，
        // Catmull-Rom 遇重複點會在收尾處畫出打結小圈）；頭尾也比對一次
        // [LC-2] presetPoints（拖拉橢圓）直接採用
        let pts = (presetPoints || this.currentLifeCirclePoints).filter((p, i, a) =>
            i === 0 || Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) > 8
        );
        if (pts.length >= 2) {
            const first = pts[0];
            const last = pts[pts.length - 1];
            if (Math.hypot(first.x - last.x, first.y - last.y) <= 8) {
                pts = pts.slice(0, -1);
            }
        }

        if (pts.length < 3) {
            this.updateStatus('生活圈至少需要3個頂點', 'warning');
            return;
        }

        // [Fix] undo 語意：資料變更前先存快照
        this.saveState();

        const newLifeCircle = {
            id: 'lc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            points: pts,
            color: this.getNextLifeCircleColor(),
            label: `生活圈 ${this.lifeCircles.length + 1}`
        };

        this.lifeCircles.push(newLifeCircle);

        // 重置繪製狀態
        this.isDrawingLifeCircle = false;
        this.currentLifeCirclePoints = [];
        this.lifeCircleMousePos = null;

        // 選取剛建立的生活圈
        this.selectedLifeCircleId = newLifeCircle.id;

        this.updateStatus(`已建立「${newLifeCircle.label}」，點選邊框可編輯名稱與顏色`, 'success');
        this.autoSave();
        this.render();
    },

    /**
     * 取消生活圈繪製
     */
    cancelLifeCircle() {
        this.isDrawingLifeCircle = false;
        this.currentLifeCirclePoints = [];
        this.lifeCircleMousePos = null;
        this.lcPress = null;
        this.ellipsePreview = null;
        this.updateStatus('生活圈繪製已取消', 'info');
        this.render();
    },

    /**
     * [LC-1] 點是否落在生活圈某頂點上（螢幕 12px 容差）；回傳索引或 -1
     */
    getLifeCircleVertexAt(lc, x, y) {
        if (!lc || !Array.isArray(lc.points)) return -1;
        const tol = 12 / ((this.canvas && this.canvas.scale) || 1);
        let best = -1, bestD = Infinity;
        lc.points.forEach((p, i) => {
            const d = Math.hypot(p.x - x, p.y - y);
            if (d <= tol && d < bestD) { bestD = d; best = i; }
        });
        return best;
    },

    getNextLifeCircleColor() {
        // [Fix] 改取「第一個未被使用」的顏色：原本以 length 取模，刪除後再建會與既有圈撞色
        const colors = GenogramApp.LIFE_CIRCLE_COLORS;
        const used = new Set(this.lifeCircles.map(lc => lc.color));
        const unused = colors.find(c => !used.has(c));
        return unused || colors[this.lifeCircles.length % colors.length];
    },

    /**
     * 設定屬性表單事件
     */
    setupPropertyFormEvents() {
        const form = document.getElementById('personForm');
        if (!form) return;

        const person = this.personMap.get(this.selectedPersonId);
        if (!person) return;

        // 姓名
        this.bindPropertyEdit(document.getElementById('personName'), e => {
            person.name = e.target.value;
        });

        // 年齡（有出生年月時欄位唯讀、顯示計算值，不會觸發此 handler）
        this.bindPropertyEdit(document.getElementById('personAge'), e => {
            const raw = e.target.value;
            person.age = raw === '' ? null : Number(raw);
        });

        // [2-1] 出生年月 / 死亡年月：change 時才套用（避免輸入中途年齡欄閃動）；格式錯誤不寫入並標紅
        const bindDateField = (id, key) => {
            const field = document.getElementById(id);
            if (!field) return;
            this.bindPropertyEdit(field, e => {
                const raw = e.target.value.trim();
                const normalized = raw ? Person.normalizeDateString(raw) : null;
                const invalid = raw !== '' && normalized === null;
                field.classList.toggle('is-invalid', invalid);
                field.setAttribute('aria-invalid', String(invalid));
                if (invalid) {
                    this.updateStatus('日期格式請用 YYYY、YYYY-MM 或 YYYY-MM-DD（例：1985-06）', 'error',
                        { autoHideMs: GenogramApp.STATUS_TIMEOUTS.passiveAlert });
                    return;
                }
                person[key] = normalized;
                if (normalized) e.target.value = normalized;
                this.refreshPersonAgeFields(form, person);
            }, { eventName: 'change', commitOnChange: true });
        };
        bindDateField('personBirthDate', 'birthDate');
        bindDateField('personDeathDate', 'deathDate');

        // 備註（最多 2 行）
        this.bindPropertyEdit(document.getElementById('personNotes'), e => {
            const lines = e.target.value.split('\n');
            const value = lines.length > 2 ? lines.slice(0, 2).join('\n') : e.target.value;
            if (e.target.value !== value) e.target.value = value;
            person.notes = value;
        });

        // 性別
        this.bindPropertyEdit(document.getElementById('personGender'), e => {
            person.gender = e.target.value;
        }, { eventName: 'change', commitOnChange: true });

        // 過世
        this.bindPropertyEdit(document.getElementById('personDeceased'), e => {
            person.isDeceased = e.target.checked;
            this.refreshPersonAgeFields(form, person); // [2-1] 顯示/隱藏死亡年月、重算享年
        }, { eventName: 'change', commitOnChange: true });

        // 案主
        this.bindPropertyEdit(document.getElementById('personIP'), e => {
            person.isIdentifiedPatient = !person.isIdentifiedPatient;
            e.currentTarget.setAttribute('aria-pressed', String(person.isIdentifiedPatient));
        }, { eventName: 'click', commitOnChange: true });

        // [Phase 1] 生育結果（流產/人工流產/死產）
        const lossSel = document.getElementById('personLossType');
        if (lossSel) {
            this.bindPropertyEdit(lossSel, e => {
                person.lossType = e.target.value || null;
            }, { eventName: 'change', commitOnChange: true });
        }

        // 醫學屬性處理 helper
        const updateMedical = (key, value) => {
            if (!person.medical) person.medical = {};
            person.medical[key] = value;
        };

        // 醫學下拉選單
        const medLeft = document.getElementById('medLeftHalf');
        this.bindPropertyEdit(medLeft, e => updateMedical('leftHalf', e.target.value),
            { eventName: 'change', commitOnChange: true });

        const medBottom = document.getElementById('medBottomHalf');
        this.bindPropertyEdit(medBottom, e => updateMedical('bottomHalf', e.target.value),
            { eventName: 'change', commitOnChange: true });

        // 醫學核取方塊
        const medSmoker = document.getElementById('medSmoker');
        this.bindPropertyEdit(medSmoker, e => updateMedical('isSmoker', e.target.checked),
            { eventName: 'change', commitOnChange: true });

        const medObese = document.getElementById('medObese');
        this.bindPropertyEdit(medObese, e => updateMedical('isObese', e.target.checked),
            { eventName: 'change', commitOnChange: true });

        const medLang = document.getElementById('medLang');
        this.bindPropertyEdit(medLang, e => updateMedical('hasLanguageProblem', e.target.checked),
            { eventName: 'change', commitOnChange: true });

        // 多胞胎勾選框
        const twinCheckboxes = document.querySelectorAll('.twin-checkbox');
        twinCheckboxes.forEach(checkbox => {
            this.bindPropertyEdit(checkbox, e => {
                const siblingId = e.target.dataset.siblingId;
                const sibling = this.personMap.get(siblingId);

                if (!sibling) return;

                if (e.target.checked) {
                    // 勾選：將此人與兄弟姊妹標記為同一多胞胎群組
                    let twinGroupId = person.twinGroup;

                    // 如果當前人物還沒有 twinGroup，建立新的
                    if (!twinGroupId) {
                        twinGroupId = 'twin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
                        person.twinGroup = twinGroupId;
                    }

                    sibling.twinGroup = twinGroupId;
                    this.updateStatus(`已標記 ${person.name || '此人'} 與 ${sibling.name || '兄弟姊妹'} 為多胞胎`, 'success');
                } else {
                    // 取消勾選：移除兄弟姊妹的 twinGroup
                    sibling.twinGroup = null;

                    // 檢查是否還有其他人在同一群組
                    const remainingTwins = this.persons.filter(p =>
                        p.twinGroup === person.twinGroup && p.id !== person.id && p.id !== siblingId
                    );

                    // 如果只剩下當前人物，也移除其 twinGroup
                    if (remainingTwins.length === 0) {
                        person.twinGroup = null;
                    }

                    this.updateStatus(`已取消 ${sibling.name || '兄弟姊妹'} 的多胞胎標記`, 'info');
                }

            }, { eventName: 'change', commitOnChange: true });
        });

        // [Phase 1] 同卵/異卵切換：套用到整個多胞胎群組（合子性為群組屬性，成員須一致）
        const zygCheckbox = document.querySelector('.twin-zygosity-checkbox');
        if (zygCheckbox) {
            this.bindPropertyEdit(zygCheckbox, e => {
                if (!person.twinGroup) return;
                const z = e.target.checked ? 'mono' : 'di';
                this.persons.forEach(p => {
                    if (p.twinGroup === person.twinGroup) p.zygosity = z;
                });
                this.updateStatus(e.target.checked ? '已標記為同卵雙胞胎' : '已標記為異卵雙胞胎', 'info');
            }, { eventName: 'change', commitOnChange: true });
        }

        const deletePersonBtn = document.getElementById('deletePersonBtn');
        if (deletePersonBtn) deletePersonBtn.addEventListener('click', () => this.deleteSelected());
    }
});
