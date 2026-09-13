// 來源：js/app.js；此檔以 mixin 掛回原型，載入順序：app.js → app-pointer.js（DOMContentLoaded 前同步載入）。
'use strict';
Object.assign(GenogramApp.prototype, {
    /**
     * 處理指標按下 (Pointer Events 統一滑鼠與觸控)
     */
    handlePointerDown(e) {
        // [Fix] 只處理主鍵（左鍵/觸控/筆）：右鍵、中鍵不該加生活圈頂點或觸發拖曳
        if (typeof e.button === 'number' && e.button > 0) return;

        // [3-2] 觸控：追蹤手指；第二指落下 → 取消單指操作、進入雙指縮放/平移；
        // 雙指結束後剩餘的手指一律忽略，直到全部放開（避免放開一指瞬間把人物拖走）
        if (e.pointerType === 'touch') {
            this.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this.touchPointers.size >= 2) {
                this.beginPinch();
                return;
            }
            if (this.touchIgnoreUntilEmpty) return;
        }

        // Pointer capture for robust drag handling
        if (e.target === this.canvas.canvas) {
            this.activePointerId = e.pointerId;
            try { this.canvas.canvas.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件或已失效的 pointer */ }
        }

        // [Snap] 每次 pointerdown 都重置拖曳吸附狀態，
        // 避免前一次拖曳被中斷（Esc/pointercancel 漏網）時殘留過期的虛擬座標
        this.dragVirtual = null;
        this.dragGuides = null;
        this.canvas.dragGuides = null;

        const point = this.canvas.getMousePos(e);

        if (this.placementSession) {
            this.updatePlacement(point.x, point.y, Boolean(e.altKey));
            this.commitPlacement();
            return;
        }

        // [NEW] 快速按鈕點擊偵測（角色選取後才顯示鈕，故用 selectedPersonId）
        if (this.selectedPersonId && this.currentTool === 'select'
            && this.labelEditingPersonId !== this.selectedPersonId) {
            const selPerson = this.personMap.get(this.selectedPersonId);
            if (selPerson) {
                const buttonType = this.canvas.getQuickButtonAt(point.x, point.y, selPerson);
                if (buttonType) {
                    this.handleQuickAddClick(selPerson, buttonType);
                    return;
                }
            }
        }

        // 生活圈繪製模式
        if (this.currentTool === 'lifeCircle') {
            if (!this.isDrawingLifeCircle) {
                // [LC-2] 先記下按下點：放開時未移動 → 第 1 個頂點；按住拖曳 → 直接拉出橢圓
                this.lcPress = { start: point, moved: false };
                this.updateStatus('點一下放第 1 個頂點；或按住拖曳直接拉出橢圓');
                this.render();
                return;
            } else {
                // 增加頂點
                this.currentLifeCirclePoints.push(point);
                const count = this.currentLifeCirclePoints.length;
                this.updateStatus(`已新增第 ${count} 個頂點，繼續點擊增加頂點，雙擊或按 Enter 完成`);
            }
            this.render();
            return;
        }

        if (this.currentTool === 'boxSelect') {
            this.isBoxSelecting = true;
            this.boxSelectStart = point;
            this.boxSelectEnd = point;
            this.selectedPersonIds = []; // 清空之前的選取
            this.selectedPersonId = null;
            this.selectedRelationshipId = null;
            this.selectedHouseholdId = null;
            this.updatePropertyPanel();
            this.render();
            return;
        }

        // [UX Fix] 同住工具改用點選模式，更直覺好用
        if (this.currentTool === 'household') {
            const clickedPerson = this.getPersonAt(point.x, point.y);
            if (clickedPerson) {
                // [HH-4] 進入工具前若只單選了一人，第一次點人時把他一起納入清單
                if (this.selectedPersonIds.length === 0 && this.selectedPersonId && this.selectedPersonId !== clickedPerson.id) {
                    this.selectedPersonIds = [this.selectedPersonId];
                    this.selectedPersonId = null;
                }
                // Toggle 選取狀態
                const index = this.selectedPersonIds.indexOf(clickedPerson.id);
                if (index > -1) {
                    this.selectedPersonIds.splice(index, 1);
                } else {
                    this.selectedPersonIds.push(clickedPerson.id);
                }

                if (this.selectedPersonIds.length > 0) {
                    this.updateStatus(`已選取 ${this.selectedPersonIds.length} 位成員，按 Enter 建立同住圈`, 'info');
                } else {
                    this.updateStatus('同住圈：點選成員加入選取，按 Enter 建立');
                }
                this.render();
                return;
            }
            // 點擊空白處不做任何事 (不清空選取)
            return;
        }

        // 檢查是否點擊到人物
        const clickedPerson = this.getPersonAt(point.x, point.y);

        if (this.currentTool === 'connect') {
            if (clickedPerson) {
                if (!this.connectingFrom) {
                    this.connectingFrom = { person: clickedPerson, point: point };
                    this.updateStatus('已選取第一位成員，請點選第二位');
                } else if (this.connectingFrom.person.id !== clickedPerson.id) {
                    this.connectingTo = clickedPerson;
                    this.showRelationshipModal();
                } else {
                    // [Fix B9] 點到同一人：明確提示，不要靜默無反應
                    this.updateStatus('不能連接到自己，請點選另一位成員', 'warning');
                }
            } else {
                // 如果點擊空白處，取消連接
                this.connectingFrom = null;
                this.updateStatus('連接工具：依序點擊兩個成員建立關係');
            }
            this.render();
            return;
        }

        if (this.currentTool === 'select') {
            // 0. [Z-index] 關係已選取時，編輯鈕群（鉛筆/⇄/走法）的點擊「優先於節點」。
            //    鈕群繪製在最上層，即使疊在角色上，也應點到鈕、而非選到底下的人。
            if (this.selectedRelationshipId) {
                const selectedRel = this.relationships.find(r => r.id === this.selectedRelationshipId);
                if (selectedRel) {
                    const fromPerson = this.personMap.get(selectedRel.fromPersonId);
                    const toPerson = this.personMap.get(selectedRel.toPersonId);
                    if (fromPerson && toPerson) {
                        // 婚姻線「走法」鈕（自動/ㄇ/一/ㄩ）
                        const rmode = this.canvas.getRouteButtonModeAt(point.x, point.y, selectedRel, fromPerson, toPerson, this.relationships);
                        if (rmode) {
                            this.setRouteModeById(selectedRel.id, rmode);
                            return;
                        }
                        // 「對調方向 ⇄」鈕（在鉛筆外側；婚姻不顯示）
                        if (this.canvas.isPointOnSwapButton(point.x, point.y, selectedRel, fromPerson, toPerson, this.relationships)) {
                            this.swapRelationshipDirectionById(selectedRel.id);
                            return;
                        }
                        // 鉛筆（編輯關係類型）
                        if (this.canvas.isPointOnEditButton(point.x, point.y, selectedRel, fromPerson, toPerson, this.relationships)) {
                            this.editingRelationshipId = selectedRel.id;
                            this.showRelationshipEditModal();
                            return;
                        }
                        // [R-1] 橫桿（ㄇ 天橋頂 / ㄩ 下折底）：按住可上下拖動，調整橫桿距離；人物不動
                        const bar = this.canvas.getMarriageBarAt(point.x, point.y, selectedRel, fromPerson, toPerson, this.relationships);
                        if (bar) {
                            this.dragStartSnapshot = this.getState();
                            this.liftDrag = { rel: selectedRel, startLift: selectedRel.routeLift || 0, startY: point.y, dir: bar.dir };
                            this.canvas.isDragging = true;
                            this.canvas.dragStart = { x: point.x, y: point.y };
                            this.canvas.canvas.style.cursor = 'ns-resize';
                            return;
                        }
                    }
                }
            }

            // 姓名／備註是獨立的文字編輯命中區。點文字只選人物與開啟文字控制，
            // 不啟動人物拖曳，也不顯示人物周圍的快速新增功能圈。
            const clickedLabelPerson = this.getPersonLabelAt(point.x, point.y);
            if (clickedLabelPerson) {
                this.selectedPersonIds = [];
                this.selectPerson(clickedLabelPerson.id, { labelEditing: true });
                this.updateStatus('已選取成員文字，可在文字旁調整位置', 'info');
                return;
            }

            // 優先檢查滑鼠下的「家庭」（這現在包含了家庭成員）
            // 如果點擊了某人，我們需要判斷意圖：
            // A. 如果該人在家庭內 -> 拖曳家庭 (User Request: "就算拉到人員或關係線也應該整體一起移動")
            // B. 如果該人不在家庭內 -> 拖曳/選取個人

            // 1. 檢查點擊到的人物
            if (clickedPerson) {
                // 檢查此人是否屬於某個家庭
                const belongHousehold = this.households ? this.households.find(h => h.ids.includes(clickedPerson.id)) : null;

                // SPECIAL LOGIC: 處理家庭成員的點擊行為
                // 1. Shift + 點擊 -> 多選切換 (Toggle Selection)
                if (e.shiftKey) {
                    // 初始化多選列表 (如果之前是單選)
                    if (this.selectedPersonId && this.selectedPersonIds.length === 0) {
                        this.selectedPersonIds.push(this.selectedPersonId);
                        this.selectedPersonId = null;
                    }

                    const index = this.selectedPersonIds.indexOf(clickedPerson.id);
                    if (index > -1) {
                        this.selectedPersonIds.splice(index, 1); // 取消選取
                    } else {
                        this.selectedPersonIds.push(clickedPerson.id); // 加入選取
                    }

                    if (this.selectedPersonIds.length > 0) {
                        this.updateStatus(`已選取 ${this.selectedPersonIds.length} 位成員`, 'info');
                    } else {
                        this.updatePropertyPanel();
                    }
                    this.render();
                    return;
                }

                // 2. 如果此人已經在「多選名單」中，則優先保留多選狀態，不進入家庭拖曳模式
                // 這是為了讓使用者可以移動「家庭內的子集」
                if (this.selectedPersonIds.includes(clickedPerson.id)) {
                    // 讓他進入普通的拖曳邏輯 (Pointer Events 版)
                    // [UX Fix] 拖曳 History 合併：記錄起始狀態，不立即 push
                    this.dragStartSnapshot = this.getState();
                    this.canvas.isDragging = true;
                    this.canvas.dragStart = point;
                    this.canvas.draggedPerson = clickedPerson;
                    this.updateStatus('正在移動成員...', 'info');
                    return;
                }

                // 3. 一般點擊人物 (即使在家庭內，也優先讓使用者可以拖曳單人)
                // User Request: "圈選同住後並無法個人編輯拖曳了"
                // 修正：點擊「人」就單純拖曳「人」，不再強迫拖曳整個家庭。
                // 若要拖曳家庭，請點擊框內的空白處。

                // 單選並準備拖曳該人物
                // 為了視覺提示，如果他在家庭內，我們還是可以選中那個家庭 id (但不進入 household drag mode)
                this.selectedHouseholdId = belongHousehold ? belongHousehold.id : null;
                this.selectedPersonIds = []; // 清空多選
                this.selectPerson(clickedPerson.id);

                // [Bug Fix] 使用 dragStartSnapshot 機制，避免雙重記錄
                this.dragStartSnapshot = this.getState();
                this.canvas.isDragging = true;
                this.canvas.dragStart = point;
                this.canvas.draggedPerson = clickedPerson;
                this.updateStatus('正在移動成員 (若要移動整個家庭，請按住Shift或拖曳家庭框空白處)');

                this.render();
                return;

            }

            // 3. 檢查是否點擊到關係線
            const clickedRel = this.getRelationshipAt(point.x, point.y);
            if (clickedRel) {
                // 檢查這條線是否完全在某個家庭內 (Selected by default?)
                // 為求簡單與符合直覺，若該線連接的兩人都在同一家庭，則視為拖曳該家庭
                const p1 = this.personMap.get(clickedRel.fromPersonId);
                const p2 = this.personMap.get(clickedRel.toPersonId);

                let relHousehold = null;
                if (p1 && p2 && this.households) {
                    const h1 = this.households.find(h => h.ids.includes(p1.id));
                    const h2 = this.households.find(h => h.ids.includes(p2.id));
                    if (h1 && h2 && h1.id === h2.id) {
                        relHousehold = h1;
                    }
                }

                if (relHousehold) {
                    this.selectedHouseholdId = relHousehold.id;
                    this.selectRelationship(clickedRel.id); // 仍選取線
                    this.updatePropertyPanel();

                    this.dragStartSnapshot = this.getState(); // [Fix] 家庭拖曳也要能 undo
                    this.canvas.isDragging = true;
                    this.canvas.dragStart = point;
                    this.canvas.draggedHousehold = relHousehold;
                    this.updateStatus('正在拖曳同住圈 (放開滑鼠以完成)', 'info');
                    this.render();
                    return;
                } else {
                    this.selectRelationship(clickedRel.id);
                    this.selectedPersonIds = [];
                    return;
                }
            }

            // 3. 檢查是否點擊到生活圈「邊界帶」
            // [LC-1] 已選取的生活圈：點頂點 → 拖曳該頂點；Alt+點頂點 → 刪除（至少保留 3 點）
            if (this.selectedLifeCircleId && this.viewOptions.showLifeCircles) {
                const selLc = this.lifeCircles.find(l => l.id === this.selectedLifeCircleId);
                const vi = selLc ? this.getLifeCircleVertexAt(selLc, point.x, point.y) : -1;
                if (selLc && vi >= 0) {
                    if (e.altKey) {
                        if (selLc.points.length <= 3) {
                            this.updateStatus('生活圈至少需要 3 個頂點，無法再刪除', 'warning');
                            return;
                        }
                        this.saveState();
                        selLc.points.splice(vi, 1);
                        this.updateStatus('已刪除頂點', 'info');
                        this.autoSave();
                        this.render();
                        return;
                    }
                    this.dragStartSnapshot = this.getState();
                    this.canvas.isDragging = true;
                    this.canvas.dragStart = point;
                    this.lcVertexDrag = { lc: selLc, index: vi };
                    this.updateStatus('拖曳調整頂點；Alt+點頂點可刪除、雙擊邊線可新增頂點', 'info');
                    return;
                }
            }

            // [Fix] 生活圈改邊界帶命中且優先於同住框：圈邊框壓在框內部時仍點得到圈，
            // 圈內空白則讓給同住框 / 畫布平移
            const clickedLifeCircle = this.getLifeCircleAt(point.x, point.y);
            if (clickedLifeCircle && !e.shiftKey) {
                this.selectedLifeCircleId = clickedLifeCircle.id;
                this.selectedPersonId = null;
                this.labelEditingPersonId = null;
                this.selectedPersonIds = [];
                this.selectedRelationshipId = null;
                this.selectedHouseholdId = null;
                this.updatePropertyPanel();
                this.render();

                // 開始拖曳生活圈
                this.dragStartSnapshot = this.getState(); // [Fix] 生活圈拖曳也要能 undo
                this.canvas.isDragging = true;
                this.canvas.dragStart = point;
                this.canvas.draggedLifeCircle = clickedLifeCircle;
                this.updateStatus(`已選取「${clickedLifeCircle.label}」，拖曳邊框移動，右側面板可改名稱/顏色`, 'info');
                return;
            }

            // 3.5 檢查是否點擊到圈選框 (空白處)
            const clickedHousehold = this.getHouseholdAt(point.x, point.y);
            if (clickedHousehold) {
                // 如果按住 Shift 鍵，我們假設使用者想要進行「範圍圈選」（Box Selection）
                // 而不是拖曳家庭。所以這裡不攔截，讓它往下執行到「空白處」邏輯
                if (e.shiftKey) {
                    // Pass through to empty space logic
                } else {
                    this.selectedHouseholdId = clickedHousehold.id;
                    this.selectedPersonId = null;
                    this.labelEditingPersonId = null;
                    this.selectedPersonIds = [];
                    this.selectedRelationshipId = null;
                    this.selectedLifeCircleId = null;
                    this.updatePropertyPanel();
                    this.render();

                    this.dragStartSnapshot = this.getState(); // [Fix] 家庭拖曳也要能 undo
                    this.canvas.isDragging = true;
                    this.canvas.dragStart = point;
                    this.canvas.draggedHousehold = clickedHousehold;
                    this.updateStatus('正在拖曳同住圈 (放開滑鼠以完成)', 'info');
                    return;
                }
            }

            // 4. 點擊空白處 (或 Shift+點擊家庭內部)，開始拖曳畫布或範圍圈選
            if (e.shiftKey) {
                // Shift + 點擊空白處 -> 準備開始範圍圈選 (在 move 中判斷位移)
                this.isBoxSelecting = true;
                this.boxSelectInitialPoint = point; // 記錄原始點
                this.boxSelectStart = point;
                this.boxSelectEnd = point;
                this.selectedPersonIds = []; // 清空舊選取
                this.updatePropertyPanel();
                this.updateStatus('正在進行範圍圈選...', 'info');
            } else {
                // 檢查是否在多選範圍內，如果是，則開始拖曳整組
                if (this.selectedPersonIds.length > 1 && this.isPointInsideMultiSelection(point.x, point.y)) {
                    this.dragStartSnapshot = this.getState();
                    this.canvas.isDragging = true;
                    this.canvas.dragStart = point;
                    this.canvas.draggedPerson = this.personMap.get(this.selectedPersonIds[0]);
                    this.updateStatus('正在移動成員...', 'info');
                } else {
                    // 普通點擊空白處 -> 拖曳畫布 (Pan)
                    this.selectedPersonId = null;
                    this.labelEditingPersonId = null;
                    this.selectedPersonIds = [];
                    this.selectedRelationshipId = null;
                    this.selectedHouseholdId = null;
                    this.updatePropertyPanel();
                    this.canvas.isPanning = true;
                    this.canvas.panStart = { x: e.clientX, y: e.clientY };
                }
            }
            this.render();
        }
    },

    /**
     * 處理指標移動 (Pointer Events 統一滑鼠與觸控)
     */
    handlePointerMove(e) {
        // [3-2] 觸控：更新手指位置；雙指中 → 只做縮放/平移；雙指結束後的殘留手指忽略
        if (e.pointerType === 'touch' && this.touchPointers.has(e.pointerId)) {
            this.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this.pinch) { this.updatePinch(); return; }
            if (this.touchIgnoreUntilEmpty) return;
        }
        if (!this.canvas) return; // 確保 canvas 已初始化

        const point = this.canvas.getMousePos(e);

        if (this.placementSession) {
            this.updatePlacement(point.x, point.y, e.altKey);
            this.requestRender();
            return;
        }

        // [LC-2] 生活圈工具按住拖曳 → 橢圓預覽（超過 8 螢幕像素才算拖）
        if (this.currentTool === 'lifeCircle' && this.lcPress) {
            const dist = Math.hypot(point.x - this.lcPress.start.x, point.y - this.lcPress.start.y);
            if (this.lcPress.moved || dist > 8 / ((this.canvas && this.canvas.scale) || 1)) {
                this.lcPress.moved = true;
                this.ellipsePreview = { start: this.lcPress.start, current: point };
                this.requestRender();
            }
            return;
        }

        // [Fix] 生活圈繪製中：跟隨滑鼠的橡皮筋預覽線（原 lifeCircleMousePos 從未被更新）
        if (this.currentTool === 'lifeCircle' && this.isDrawingLifeCircle) {
            this.lifeCircleMousePos = point;
            this.requestRender();
            return;
        }

        // [Fix B2] 連接工具：已選第一位後，預覽線跟隨滑鼠
        // （canvas 端只在 connectingFrom.targetX 有值時才畫，原本此值從未被更新 → 看不到橡皮筋線）
        if (this.currentTool === 'connect' && this.connectingFrom) {
            this.connectingFrom.targetX = point.x;
            this.connectingFrom.targetY = point.y;
            this.requestRender();
            return;
        }

        if (this.isBoxSelecting) {
            this.boxSelectEnd = point;

            // [UX Fix] 選取衝突：位移超過閾值才視為有效的圈選範圍
            const threshold = 5;
            // [Bug Fix] 加入 fallback 防止 boxSelectInitialPoint 未定義
            const startPoint = this.boxSelectInitialPoint || this.boxSelectStart;
            const dx = Math.abs(this.boxSelectEnd.x - startPoint.x);
            const dy = Math.abs(this.boxSelectEnd.y - startPoint.y);

            if (dx > threshold || dy > threshold) {
                // 即時更新選取結果，這會讓人物在拖曳過程中就顯示綠色高亮 (Highlighted)
                if (typeof this.updateBoxSelection === 'function') {
                    this.updateBoxSelection();
                }
            }

            this.requestRender();
            return;
        }

        if (this.canvas.isDragging) {
            let dx = point.x - this.canvas.dragStart.x;
            let dy = point.y - this.canvas.dragStart.y;

            // [R-1] 婚姻線橫桿拖曳：只改 routeLift（dir=-1 橫桿在上 → 往上拖變大；dir=+1 在下 → 往下拖變大）
            if (this.liftDrag) {
                const d = this.liftDrag;
                const next = Math.max(0, Math.min(600, Math.round(d.startLift + d.dir * (point.y - d.startY))));
                if (next !== (d.rel.routeLift || 0)) {
                    d.rel.routeLift = next;
                    this._dataVersion++;
                    this.requestRender();
                }
                return;
            }

            // [LC-1] 生活圈單一頂點拖曳
            if (this.lcVertexDrag) {
                const { lc, index } = this.lcVertexDrag;
                if (lc.points[index]) {
                    lc.points[index].x = point.x;
                    lc.points[index].y = point.y;
                }
                this.requestRender();
                return;
            }

            // 生活圈拖曳
            if (this.canvas.draggedLifeCircle) {
                this.canvas.draggedLifeCircle.points.forEach(p => {
                    p.x += dx;
                    p.y += dy;
                });
                this.canvas.dragStart = point;
                this.requestRender();
                return;
            }

            if (this.canvas.draggedPerson || this.canvas.draggedHousehold) {
                // 取得正在拖曳的人員列表
                let movingPersonIds = [];
                if (this.canvas.draggedPerson) {
                    movingPersonIds = this.selectedPersonIds.includes(this.canvas.draggedPerson.id)
                        ? this.selectedPersonIds
                        : [this.canvas.draggedPerson.id];
                } else if (this.canvas.draggedHousehold) {
                    movingPersonIds = this.canvas.draggedHousehold.ids;
                }

                const movingPersons = movingPersonIds.map(id => this.personMap.get(id)).filter(p => p);

                // [Disabled] 移除碰撞偵測，讓使用者可以完全自由拖曳
                // 放開後的 snapToGrid + isOccupied 會確保最終不重疊
                let finalDx = dx;
                let finalDy = dy;

                // [Snap] 即時對齊吸附：以「虛擬位置」追蹤滑鼠的未吸附座標，
                // 吸附只作用在顯示位置，避免吸附點附近來回抖動
                const anchor = this.canvas.draggedPerson || movingPersons[0];
                if (anchor) {
                    if (!this.dragVirtual || this.dragVirtual.anchorId !== anchor.id) {
                        this.dragVirtual = {
                            anchorId: anchor.id,
                            x: anchor.x,
                            y: anchor.y,
                            startX: anchor.x, // 拖曳起點（吸附啟動閾值用）
                            startY: anchor.y,
                            offsets: movingPersons.map(p => ({
                                id: p.id, dx: p.x - anchor.x, dy: p.y - anchor.y
                            }))
                        };
                    }
                    this.dragVirtual.x += finalDx;
                    this.dragVirtual.y += finalDy;

                    const movingIdSet = new Set(movingPersonIds);
                    const snap = this.computeDragSnap(
                        this.dragVirtual.x, this.dragVirtual.y, movingIdSet, anchor
                    );
                    this.dragGuides = snap.guides;
                    this.canvas.dragGuides = snap.guides;

                    this.dragVirtual.offsets.forEach(off => {
                        const p = this.personMap.get(off.id);
                        if (p) {
                            p.x = snap.x + off.dx;
                            p.y = snap.y + off.dy;
                        }
                    });
                } else {
                    // 理論上不會發生（movingPersons 為空），保留原始自由移動
                    movingPersons.forEach(person => {
                        person.x = person.x + finalDx;
                        person.y = person.y + finalDy;
                    });
                }
            }

            this.canvas.dragStart = point;
            this.requestRender();
            return;
        }

        if (this.canvas.isPanning) {
            const dx = e.clientX - this.canvas.panStart.x;
            const dy = e.clientY - this.canvas.panStart.y;

            this.canvas.offsetX += dx;
            this.canvas.offsetY += dy;
            this.canvas.panStart = { x: e.clientX, y: e.clientY };

            this.requestRender();
            return;
        }

        // 更新游標樣式（hover 效果）
        // 我們把原來的邏輯改寫一下以支援 household
        if (this.currentTool === 'select' || this.currentTool === 'household') {
            const person = this.getPersonAt(point.x, point.y);
            const labelPerson = this.currentTool === 'select'
                ? this.getPersonLabelAt(point.x, point.y) : null;
            const rel = this.getRelationshipAt(point.x, point.y);
            const household = this.getHouseholdAt(point.x, point.y);

            if (this.currentTool === 'household') {
                if (person) {
                    this.canvas.canvas.style.cursor = 'pointer';
                } else {
                    this.canvas.canvas.style.cursor = 'default';
                }
            } else {
                // Select tool logic
                if (labelPerson) {
                    this.canvas.canvas.style.cursor = 'pointer';
                } else if (person) {
                    this.canvas.canvas.style.cursor = 'move';
                } else if (rel) {
                    this.canvas.canvas.style.cursor = 'pointer';
                } else if (household) {
                    this.canvas.canvas.style.cursor = 'move'; // 顯示可移動游標
                } else if (this.selectedPersonIds.length > 1 && this.isPointInsideMultiSelection(point.x, point.y)) {
                    this.canvas.canvas.style.cursor = 'move'; // 多選區域移動
                } else {
                    this.canvas.canvas.style.cursor = 'default';
                }
            }


            // 快速新增鈕「選取角色後」才顯示（不再 hover 顯示）；
            // 滑鼠移到「選取角色的」快速鈕上時，游標變 pointer 以提示可點。
            if (this.hoveredPersonId !== null) {
                this.hoveredPersonId = null; // 不再以 hover 觸發快速鈕
            }
            if (this.currentTool === 'select' && this.selectedPersonId
                && this.labelEditingPersonId !== this.selectedPersonId) {
                const selPerson = this.personMap.get(this.selectedPersonId);
                if (selPerson && this.canvas.getQuickButtonAt(point.x, point.y, selPerson)) {
                    this.canvas.canvas.style.cursor = 'pointer';
                }
            }

            // [Fix] 選取關係線時，滑鼠移到 鉛筆 / ⇄ / 走法鈕(自ㄇ一ㄩ) 上 → 游標變 pointer（手）
            if (this.selectedRelationshipId) {
                const selRel = this.relationships.find(r => r.id === this.selectedRelationshipId);
                if (selRel) {
                    const fp = this.personMap.get(selRel.fromPersonId);
                    const tp = this.personMap.get(selRel.toPersonId);
                    if (fp && tp && (
                        this.canvas.getRouteButtonModeAt(point.x, point.y, selRel, fp, tp, this.relationships) ||
                        this.canvas.isPointOnEditButton(point.x, point.y, selRel, fp, tp, this.relationships) ||
                        this.canvas.isPointOnSwapButton(point.x, point.y, selRel, fp, tp, this.relationships)
                    )) {
                        this.canvas.canvas.style.cursor = 'pointer';
                    } else if (fp && tp && this.canvas.getMarriageBarAt(point.x, point.y, selRel, fp, tp, this.relationships)) {
                        this.canvas.canvas.style.cursor = 'ns-resize'; // [R-1] 橫桿可上下拖
                    }
                }
            }
        }
    },

    /**
     * 處理指標放開 (Pointer Events 統一滑鼠與觸控)
     */
    handlePointerUp(e) {
        // [3-2] 觸控：手指放開
        if (e.pointerType === 'touch') {
            this.touchPointers.delete(e.pointerId);
            if (this.pinch) {
                if (this.touchPointers.size < 2) {
                    this.pinch = null;
                    this.touchIgnoreUntilEmpty = this.touchPointers.size > 0;
                    this.autoSave(); // 視角（scale/offset）寫入暫存
                }
                return;
            }
            if (this.touchIgnoreUntilEmpty) {
                if (this.touchPointers.size === 0) this.touchIgnoreUntilEmpty = false;
                return;
            }
        }

        // 釋放 pointer capture
        try {
            if (this.activePointerId !== null && this.canvas.canvas.hasPointerCapture(this.activePointerId)) {
                this.canvas.canvas.releasePointerCapture(this.activePointerId);
            }
        } catch (_) { /* 合成事件或已失效的 pointer */ }
        this.activePointerId = null;

        // [LC-2] 生活圈工具放開：拖過 → 依拖曳矩形建橢圓（16 點）；沒拖 → 放第 1 個頂點
        if (this.currentTool === 'lifeCircle' && this.lcPress) {
            const press = this.lcPress;
            const preview = this.ellipsePreview;
            this.lcPress = null;
            this.ellipsePreview = null;
            if (press.moved && preview) {
                this.finishLifeCircle(GenogramApp.ellipsePoints(press.start, preview.current, 16));
            } else {
                this.isDrawingLifeCircle = true;
                this.currentLifeCirclePoints = [press.start];
                this.updateStatus('已新增第 1 個頂點，繼續點擊增加頂點，雙擊或按 Enter 完成；Backspace 退回上一點');
                this.render();
            }
            return;
        }
        // [R-1] 橫桿拖曳結束：有變動才寫一筆 history（以拖曳前的值存 snapshot，語意同 saveState-before-mutation）
        if (this.liftDrag) {
            const d = this.liftDrag;
            this.liftDrag = null;
            this.canvas.isDragging = false;
            this.dragStartSnapshot = null;
            const finalLift = d.rel.routeLift || 0;
            if (finalLift !== d.startLift) {
                d.rel.routeLift = d.startLift;
                this.saveState();
                d.rel.routeLift = finalLift;
                this._dataVersion++;
                this.updateStatus(`橫桿距離：${finalLift}px`, 'info', { autoHideMs: GenogramApp.STATUS_TIMEOUTS.passive });
                this.autoSave();
            }
            this.updatePropertyPanel();
            this.render();
            return;
        }
        // [LC-1] 頂點拖曳結束：清除頂點狀態，後面走一般拖曳 commit（dragStartSnapshot → history）
        if (this.lcVertexDrag) this.lcVertexDrag = null;

        if (this.isBoxSelecting) {
            this.isBoxSelecting = false;
            this.updateBoxSelection(); // 計算選取了哪些人

            // 如果是「範圍圈選」工具，完成後自動切換回選取工具，方便立即移動
            if (this.currentTool === 'boxSelect') {
                this.setTool('select');
            }

            this.render();
        }

        if (this.canvas.isDragging) {
            // [Snap] 點擊容差：拖曳總位移小於螢幕 3px 視為「點擊」而非拖曳，
            // 完全不重排（不 grid 吸附、不換輩分、不寫 history）。
            // 否則誤觸會把已精準對齊的 off-grid 位置硬拉到半格點。
            const clickTolerance = 3 / ((this.canvas && this.canvas.scale) || 1);
            const dragMovedDist = this.dragVirtual
                ? Math.hypot(this.dragVirtual.x - this.dragVirtual.startX,
                             this.dragVirtual.y - this.dragVirtual.startY)
                : 0;
            const isMicroDrag = (this.canvas.draggedPerson || this.canvas.draggedHousehold) &&
                dragMovedDist < clickTolerance;

            if (isMicroDrag) {
                // 還原到拖曳起點（位移途中可能已被移動 1~2px）
                if (this.dragVirtual) {
                    this.dragVirtual.offsets.forEach(off => {
                        const p = this.personMap.get(off.id);
                        if (p) {
                            p.x = this.dragVirtual.startX + off.dx;
                            p.y = this.dragVirtual.startY + off.dy;
                        }
                    });
                }
                this.render();
            }

            // [Fix] 拖曳結束後執行對齊格子 (Snap to Grid) - 並確保不重疊
            if (!isMicroDrag && (this.canvas.draggedPerson || this.canvas.draggedHousehold)) {
                let movingPersonIds = [];
                if (this.canvas.draggedPerson) {
                    movingPersonIds = this.selectedPersonIds.includes(this.canvas.draggedPerson.id)
                        ? this.selectedPersonIds
                        : [this.canvas.draggedPerson.id];
                } else if (this.canvas.draggedHousehold) {
                    movingPersonIds = this.canvas.draggedHousehold.ids;
                }

                // [Snap] 拖曳中若已吸附到對齊輔助線，放開時保留精準 X
                // （不再被半格 grid 吸附拉離對齊位置）；Y 仍走輩分列吸附
                const keepAlignedX = !!(this.dragGuides && this.dragGuides.x);

                // [Fix] 拖曳「整個同住框」改剛體平移：只對錨點做吸附，
                // 其餘成員維持原相對偏移 — 不再逐人 grid 吸附導致家內精調間距變形
                if (this.canvas.draggedHousehold && this.dragVirtual) {
                    const anchor = this.personMap.get(this.dragVirtual.anchorId);
                    if (anchor) {
                        const grid = GenogramApp.GRID;
                        const targetX = keepAlignedX ? anchor.x : this.snapToGrid(anchor.x, 'x');
                        const genIndex = this.getGenerationIndexByY(anchor.y);
                        const targetY = grid.ORIGIN_Y + genIndex * grid.CELL_HEIGHT;
                        const ddx = targetX - anchor.x;
                        const ddy = targetY - anchor.y;

                        movingPersonIds.forEach(id => {
                            const p = this.personMap.get(id);
                            if (!p) return;
                            p.x += ddx;
                            p.y += ddy;
                            p.generation = this.getGenerationStringByIndex(this.getGenerationIndexByY(p.y));
                        });
                    }
                    this.render();
                } else {

                movingPersonIds.forEach(id => {
                    const p = this.personMap.get(id);
                    if (p) {
                        let targetX = keepAlignedX ? p.x : this.snapToGrid(p.x, 'x');
                        let targetY = this.snapToGrid(p.y, 'y');

                        // [Disabled] 停用父母中點吸附，避免子女被拉到非預期位置
                        // 特別是天橋婚姻（多段婚姻）時，父母距離遠，中點吸附會造成問題

                        // [UPDATED] 根據拖曳位置自動切換輩分
                        // 如果拖曳超過上下輩分的中點，自動調整到該輩分
                        const grid = GenogramApp.GRID;

                        // 根據當前 Y 座標計算應該屬於哪個輩分
                        const relativeY = p.y - grid.ORIGIN_Y;
                        const newGeneration = Math.round(relativeY / grid.CELL_HEIGHT);

                        // [Bug Fix] 不再限制輩分範圍，允許負數索引代表祖先層級
                        // 負數索引：-1 = ancestor-1 (曾祖父母), -2 = ancestor-2, ...

                        // [Bug Fix] 根據輩分索引計算 generation 字串
                        // 支援無限層級：0=grandparent, 1=parent, 2=child, 3=grandchild
                        // 負數索引：-1=ancestor-1, -2=ancestor-2, ...
                        const getGenerationString = (genIndex) => {
                            const baseNames = ['grandparent', 'parent', 'child', 'grandchild'];
                            if (genIndex >= 0 && genIndex < baseNames.length) {
                                return baseNames[genIndex];
                            } else if (genIndex < 0) {
                                // 祖先層級 (ancestor-1, ancestor-2, ...)
                                return `ancestor-${Math.abs(genIndex)}`;
                            } else {
                                // 後代層級 (descendant-1, descendant-2, ...)
                                return `descendant-${genIndex - baseNames.length + 1}`;
                            }
                        };

                        const newGenerationStr = getGenerationString(newGeneration);
                        if (p.generation !== newGenerationStr) {
                            p.generation = newGenerationStr;
                            const label = GenogramApp.GENERATION_LEVELS[newGenerationStr]?.label ||
                                (newGeneration < 0 ? `曾祖輩 ${Math.abs(newGeneration)}` : `第 ${newGeneration + 1} 層`);
                            this.updateStatus(`已移動到${label}`, 'info');
                        }

                        // 對齊到該輩分的 Y 座標 (支援無限層級，包含負數索引)
                        targetY = grid.ORIGIN_Y + newGeneration * grid.CELL_HEIGHT;


                        // 檢查目標格子是否被佔用 (不含自己這組人)
                        // 若被佔用，尋找最近的空位
                        // 這裡使用簡單的螺旋或擴散搜尋
                        const isOccupied = (tx, ty) => {
                            return this.persons.some(other =>
                                !movingPersonIds.includes(other.id) &&
                                Math.abs(other.x - tx) < 5 && // 允許微小誤差
                                Math.abs(other.y - ty) < 5
                            );
                        };

                        if (isOccupied(targetX, targetY)) {
                            const grid = GenogramApp.GRID;
                            const searchStepX = grid.CELL_WIDTH / 2;
                            // 搜尋周圍的格子
                            // 簡單實作：搜尋左右幾格
                            let found = false;
                            for (let dist = 1; dist <= 5; dist++) {
                                // Right
                                if (!isOccupied(targetX + dist * searchStepX, targetY)) {
                                    targetX += dist * searchStepX;
                                    found = true;
                                    break;
                                }
                                // Left
                                if (!isOccupied(targetX - dist * searchStepX, targetY)) {
                                    targetX -= dist * searchStepX;
                                    found = true;
                                    break;
                                }
                                // 下策：上下移動? 通常家系圖盡量保持輩分 Y 不變，但如果真的很擠...
                                // 暫時只允許水平尋找空位，以維持輩分
                            }
                        }


                        p.x = targetX;
                        p.y = targetY;

                        // [Disabled] 拖曳後不再強制執行局部規則，讓使用者可以自由手動微調間距
                        // this.enforceLocalRules(p);
                    }
                });

                // [Safe routing] 僅單一人物拖曳、且使用者未按 Alt 時，才允許半格內的水平微調。
                // 校正仍在同一個 dragStartSnapshot 交易內，不新增 history，也不改 Y／generation。
                if (this.canvas.draggedPerson && movingPersonIds.length === 1 && !e.altKey &&
                    typeof this.canvas.findSafeFamilyRouteAdjustment === 'function') {
                    const dragged = this.personMap.get(movingPersonIds[0]);
                    if (dragged) {
                        const halfCell = GenogramApp.GRID.CELL_WIDTH / 2;
                        const correction = this.canvas.findSafeFamilyRouteAdjustment(
                            dragged.id,
                            [-halfCell, halfCell],
                            this.persons,
                            this.relationships
                        );
                        if (correction && correction.dx) dragged.x += correction.dx;
                    }
                }
                this.render(); // Snap 後重繪
                } // end else（個別人物拖曳的逐人吸附路徑）
            }

            this.canvas.isDragging = false;
            this.canvas.draggedPerson = null;
            this.canvas.draggedHousehold = null; // 清除家庭拖曳狀態
            this.canvas.draggedLifeCircle = null; // 清除生活圈拖曳狀態

            // [Snap] 清除拖曳吸附狀態與輔助線
            this.dragVirtual = null;
            this.dragGuides = null;
            this.canvas.dragGuides = null;
            this.render();

            // [Bug Fix #3] 拖曳 History 合併：拖曳結束時才 push 一筆
            // 加入位移閾值檢查，避免記錄意外點擊或極小位移
            if (this.dragStartSnapshot) {
                const currentState = this.getState();
                const hasSignificantChange = this.hasSignificantPositionChange(
                    this.dragStartSnapshot,
                    currentState,
                    2  // 閾值: 至少 2px 位移才記錄
                );

                if (hasSignificantChange) {
                    this.markDirty(); // [1-2]
                    this.history.pushState(this.dragStartSnapshot);
                }
                this.dragStartSnapshot = null;
            }

            this.autoSave(); // 移動結束儲存

        }

        if (this.canvas.isPanning) {
            this.canvas.isPanning = false;
        }
    },

    /**
     * 更新範圍圈選的選中人物
     */
    updateBoxSelection() {
        // 正規化選取框座標
        const x1 = Math.min(this.boxSelectStart.x, this.boxSelectEnd.x);
        const y1 = Math.min(this.boxSelectStart.y, this.boxSelectEnd.y);
        const x2 = Math.max(this.boxSelectStart.x, this.boxSelectEnd.x);
        const y2 = Math.max(this.boxSelectStart.y, this.boxSelectEnd.y);

        this.selectedPersonIds = [];

        // 寬容度每邊 25px (半徑)
        const radius = 25;

        this.persons.forEach(p => {
            // 檢查兩個矩形是否有重疊 (AABB Collision)
            // Person Box: [p.x - r, p.y - r, p.x + r, p.y + r]
            // Select Box: [x1, y1, x2, y2]

            const pLeft = p.x - radius;
            const pRight = p.x + radius;
            const pTop = p.y - radius;
            const pBottom = p.y + radius;

            // 如果沒有不重疊的情況，就是有重疊
            const isOverlapping = !(pRight < x1 || pLeft > x2 || pBottom < y1 || pTop > y2);

            if (isOverlapping) {
                this.selectedPersonIds.push(p.id);
            }
        });

        if (this.selectedPersonIds.length > 0) {
            const content = document.getElementById('propertyContent');
            const panel = document.createElement('div');
            panel.className = 'panel-content';
            const message = document.createElement('p');
            message.textContent = `已選取 ${this.selectedPersonIds.length} 位成員`;
            panel.appendChild(message);
            content.replaceChildren(panel);
            this.updateStatus(`已選取 ${this.selectedPersonIds.length} 位成員`, 'info');
        }
    },

    /**
     * 處理滾輪縮放
     */
    /**
     * [3-2] 進入雙指縮放：取消任何單指操作（拖曳座標還原到起點、不寫 history），
     * 記下起始兩指距離、起始縮放、兩指中點對應的世界座標。
     */
    beginPinch() {
        if (this.dragStartSnapshot && this.canvas.isDragging) {
            const snap = this.dragStartSnapshot;
            (snap.persons || []).forEach(sp => {
                const live = this.personMap.get(sp.id);
                if (live) { live.x = sp.x; live.y = sp.y; }
            });
            (snap.lifeCircles || []).forEach(slc => {
                const live = this.lifeCircles.find(l => l.id === slc.id);
                if (live && Array.isArray(slc.points)) live.points = slc.points.map(p => ({ x: p.x, y: p.y }));
            });
        }
        this.dragStartSnapshot = null;
        this.canvas.isDragging = false;
        this.canvas.isPanning = false;
        this.canvas.draggedPerson = null;
        this.canvas.draggedHousehold = null;
        this.canvas.draggedLifeCircle = null;
        this.lcVertexDrag = null;
        this.lcPress = null;
        this.ellipsePreview = null;
        this.isBoxSelecting = false;
        this.dragVirtual = null;
        this.dragGuides = null;
        this.canvas.dragGuides = null;
        if (this.placementSession) this.cancelPlacement();

        const [a, b] = [...this.touchPointers.values()];
        const rect = this.canvas.canvas.getBoundingClientRect();
        const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        this.pinch = {
            startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
            startScale: this.canvas.scale,
            worldMid: {
                x: (mid.x - this.canvas.offsetX) / this.canvas.scale,
                y: (mid.y - this.canvas.offsetY) / this.canvas.scale
            }
        };
        this.touchIgnoreUntilEmpty = true;
        this.updateStatus('雙指縮放／平移', 'info');
        this.render();
    },

    /**
     * [3-2] 雙指移動：依兩指距離比例縮放（夾在 minScale～maxScale），並讓起始中點對應的世界點跟著目前中點
     */
    updatePinch() {
        if (!this.pinch || this.touchPointers.size < 2) return;
        const [a, b] = [...this.touchPointers.values()];
        const rect = this.canvas.canvas.getBoundingClientRect();
        const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const scale = Math.max(this.canvas.minScale,
            Math.min(this.canvas.maxScale, this.pinch.startScale * dist / this.pinch.startDist));
        this.canvas.scale = scale;
        this.canvas.offsetX = mid.x - this.pinch.worldMid.x * scale;
        this.canvas.offsetY = mid.y - this.pinch.worldMid.y * scale;
        this.updateZoomDisplay();
        this.render();
    },

    handleWheel(e) {
        if (e.ctrlKey) {
            e.preventDefault();
            // 滾輪走同一組級距，才不會滾出 97%、103% 這種停不回來的值
            this.zoomStep(e.deltaY > 0 ? -1 : 1);
        } else {
            // 平移
            e.preventDefault(); // 防止瀏覽器頁面滾動
            this.canvas.offsetX -= e.deltaX;
            this.canvas.offsetY -= e.deltaY;
            this.requestRender();
        }
    },

    /**
     * 處理雙擊（編輯人物）
     */
    handleDoubleClick(e) {
        // 生活圈繪製模式：雙擊完成
        if (this.currentTool === 'lifeCircle' && this.isDrawingLifeCircle) {
            this.finishLifeCircle();
            return;
        }

        const point = this.canvas.getMousePos(e);

        // [LC-1] 雙擊已選取生活圈的邊線（非頂點）→ 在最近的邊插入一個頂點
        if (this.currentTool === 'select' && this.selectedLifeCircleId && this.viewOptions.showLifeCircles) {
            const selLc = this.lifeCircles.find(l => l.id === this.selectedLifeCircleId);
            const tol = 12 / ((this.canvas && this.canvas.scale) || 1);
            if (selLc && this.getLifeCircleVertexAt(selLc, point.x, point.y) < 0
                && this.canvas.isPointOnLifeCircleEdge(selLc, point.x, point.y, tol)) {
                const seg = GenogramApp.nearestSegmentIndex(selLc.points, point);
                this.saveState();
                selLc.points.splice(seg + 1, 0, { x: point.x, y: point.y });
                this.updateStatus('已新增頂點，可直接拖曳調整', 'info');
                this.autoSave();
                this.render();
                return;
            }
        }

        const person = this.getPersonAt(point.x, point.y);
        if (person) {
            this.selectPerson(person.id);
            // 聚焦到姓名輸入框
            this.focusPropertyInput();
        }
    },

    isEditableTarget(target) {
        if (!(target instanceof Element)) return false;
        if (target.isContentEditable || target.matches('textarea, select, [role="textbox"], [role="combobox"]')) {
            return true;
        }
        if (target.matches('input')) {
            return !new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image',
                'radio', 'range', 'reset', 'submit']).has(target.type);
        }
        return Boolean(target.closest('[role="textbox"], [role="combobox"]'));
    },

    beginPropertyEditSession(field) {
        if (!field || this.propertyEditSession?.field === field) return;
        this.commitPropertyEditSession();
        if (this.isPreviewingLayout) this.cancelPreviewedLayout();
        const before = this.getState();
        this.propertyEditSession = {
            field,
            before,
            beforeSignature: JSON.stringify(before)
        };
    },

    commitPropertyEditSession() {
        const session = this.propertyEditSession;
        this.propertyEditSession = null;
        if (!session) return false;
        const afterSignature = JSON.stringify(this.getState());
        if (afterSignature === session.beforeSignature) return false;
        this.markDirty(); // [1-2]
        this.history.pushState(session.before);
        this.updateToolbar();
        return true;
    },

    cancelPropertyEditSession() {
        this.propertyEditSession = null;
    },

    bindPropertyEdit(field, apply,
        { eventName = 'input', render = true, commitOnChange = false } = {}) {
        if (!field) return;
        field.addEventListener('focus', () => this.beginPropertyEditSession(field));
        field.addEventListener(eventName, event => {
            if (this.propertyEditSession?.field !== field) this.beginPropertyEditSession(field);
            apply(event);
            if (render) this.render();
            this.autoSave();
            if (commitOnChange) this.commitPropertyEditSession();
        });
        field.addEventListener('blur', () => this.commitPropertyEditSession());
    },

    /**
     * 處理鍵盤快捷鍵
     */
    handleKeyDown(e) {
        if (this.modalManager?.handleKeyDown(e)) return;
        if (this.isEditableTarget(e.target) || this.isEditableTarget(document.activeElement)) return;

        // Ctrl 組合鍵
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'z':
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                    break;
                case 'y':
                    e.preventDefault();
                    this.redo();
                    break;
                case 'o':
                case 'O':
                    e.preventDefault();
                    this.handleLoadClick(); // [R4] Ctrl+O 載入
                    break;
                case 's':
                    e.preventDefault();
                    this.saveToFile();
                    break;
            }
            return;
        }

        // 單鍵快捷鍵
        switch (e.key) {
            case 'v':
            case 'V':
                this.setTool('select');
                break;
            case 'n':
            case 'N':
                this.showGenderModal('parent');
                break;
            case 'c':
            case 'C':
                this.setTool('connect');
                break;
            case 'b':
            case 'B':
                this.setTool('boxSelect');
                break;
            case 'h':
            case 'H':
                this.setTool('household');
                break;
            case 'l':
            case 'L':
                this.setTool('lifeCircle');
                break;
            case 'Delete':
            case 'Backspace':
                e.preventDefault();
                // [LC-2] 生活圈繪製中：退回上一個頂點（沒有頂點了就取消繪製），不刪任何物件
                if (this.currentTool === 'lifeCircle' && this.isDrawingLifeCircle) {
                    this.currentLifeCirclePoints.pop();
                    if (this.currentLifeCirclePoints.length === 0) {
                        this.cancelLifeCircle();
                    } else {
                        this.updateStatus(`已退回一個頂點，剩 ${this.currentLifeCirclePoints.length} 個`, 'info');
                        this.render();
                    }
                    break;
                }
                // [R4] Backspace 不再等同 Delete（筆電誤刪率高）；只保留生活圈退回頂點
                if (e.key === 'Backspace') break;
                this.deleteSelected();
                break;
            case 'Escape':
                // [UX Fix] 改進 Esc 處理，顯示明確的狀態訊息
                if (this.placementSession) {
                    this.cancelPlacement();
                    this.updateStatus('新增成員已取消', 'info');
                } else if (this.isDrawingLifeCircle) {
                    this.cancelLifeCircle();
                } else if (this.connectingFrom) {
                    this.connectingFrom = null;
                    this.updateStatus('連接已取消', 'info');
                } else if (this.closeCompactInspectorOverlay()) {
                    this.updateStatus('檢視面板已收合', 'info');
                } else this.setTool('select');
                this.render();
                break;
            case 'Enter':
                // 生活圈繪製：按 Enter 完成
                if (this.currentTool === 'lifeCircle' && this.isDrawingLifeCircle) {
                    this.finishLifeCircle();
                    break;
                }
                // [UX Fix] Enter 鍵建立同住框 (避免自動建立)
                if (this.currentTool === 'household') {
                    if (this.selectedPersonIds.length > 0) {
                        this.householdSelection = [...this.selectedPersonIds];
                        this.createHousehold();
                    } else if (this.selectedPersonId) {
                        this.householdSelection = [this.selectedPersonId];
                        this.createHousehold();
                    } else {
                        this.updateStatus('請先選取成員再按 Enter', 'warning');
                    }
                }
                break;
        }
    }
});
