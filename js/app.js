/**
 * GenogramApp - 主應用程式
 */
class GenogramApp {
    // 輩分層級定義
    static GENERATION_LEVELS = {
        grandparent: { y: 100, label: '祖父輩' },
        parent: { y: 250, label: '父母輩' },
        child: { y: 400, label: '子女輩' },
        grandchild: { y: 550, label: '孫輩' }
    };

    // 水平間距設定
    static HORIZONTAL_SPACING = 140; // 從 100 調大到 140
    static HORIZONTAL_START = 150;

    // 格子系統設定 (Grid System)
    static GRID = {
        CELL_WIDTH: 160,      // 水平格子寬度 (人物間距) - 從 120 調大到 160
        CELL_HEIGHT: 150,     // 垂直格子高度 (輩分間距) - 從 120 調大到 150
        MIN_DISTANCE: 50,     // 人物最小間距
        MAX_DISTANCE: 200,    // 人物最大間距 (2 格寬度)
        ORIGIN_X: 50,         // 格子起點 X (半格偏移，讓人物置中)
        ORIGIN_Y: 60          // 格子起點 Y (半格偏移)
    };

    // [Bug Fix] 統一婚姻類型清單，避免多處重複定義
    static MARRIAGE_TYPES = [
        'married', 'engaged', 'cohabiting', 'legal-cohabiting',
        'separated', 'legal-separated', 'divorced', 'widowed', 'affair',
        'engaged-separated', 'engaged-cohabiting'
    ];
    constructor() {
        // 資料
        this.persons = [];
        this.relationships = [];
        this.households = []; // [{ids: ['id1', 'id2'], notes: ''}]

        // 狀態
        this.currentTool = 'select'; // select, addMale, addFemale, connect, boxSelect, household
        this.selectedPersonId = null;
        this.selectedRelationshipId = null;
        this.selectedHouseholdId = null; // 選中的圈選框 ID
        this.connectingFrom = null; // 用於建立關係的第一個人物
        this.connectingTo = null;
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        // 範圍圈選狀態
        this.isBoxSelecting = false;
        this.boxSelectStart = { x: 0, y: 0 };
        this.boxSelectEnd = { x: 0, y: 0 };
        this.selectedPersonIds = []; // 多選的人物 ID 列表
        this.householdSelection = []; // 用於建立同住家庭的暫存選取列表

        // 生活圈功能
        this.lifeCircles = [];              // 儲存所有生活圈
        this.isDrawingLifeCircle = false;   // 是否正在繪製生活圈
        this.currentLifeCirclePoints = [];  // 目前繪製中的頂點
        this.selectedLifeCircleId = null;   // 選中的生活圈 ID
        this.lifeCircleMousePos = null;     // 繪製時的滑鼠位置（用於預覽線）

        this.pendingGeneration = null; // 等待選擇性別的輩分
        this.hoveredPersonId = null; // 滑鼠 hover 的角色 ID
        this.quickAddContext = null; // 快速新增的上下文 {personId, type}

        // [Bug Fix] 初始化缺失的屬性，避免 undefined 錯誤
        this.boxSelectInitialPoint = null; // 圈選初始點（用於位移閾值判斷）
        this.pendingParents = null; // 子女選擇對話框的父母 ID 列表
        this.selectedChildrenIds = []; // 子女選擇對話框的選中子女 ID 列表

        // 拖曳 History 合併：記錄拖曳開始時的狀態快照
        this.dragStartSnapshot = null;

        // Pointer capture ID (for touch/stylus support)
        this.activePointerId = null;

        // 初始化模組
        this.history = new HistoryManager();
        this.storage = new StorageManager();
        this.canvas = null;

        // UI 元素
        this.elements = {};

        // [Bug Fix #7] 加載中狀態，避免競態
        this.isLoading = false;
        this.autoSaveTimer = null;
        this.lastAutoSaveTime = 0;

        // 初始化
        this.init();
    }

    /**
     * 初始化應用程式
     */
    init() {
        this.cacheElements();
        // 傳入 onResize callback，讓 ResizeObserver 觸發後會重繪
        this.canvas = new GenogramCanvas('genogramCanvas', 'canvasContainer', () => this.render());
        this.setupEventListeners();

        // 延遲載入自動儲存，確保 canvas 和 ResizeObserver 都已完成初始化
        // 使用 setTimeout 0 讓瀏覽器先完成所有同步任務和 ResizeObserver 回調
        setTimeout(() => {
            this.loadAutoSave();
            // 如果沒有恢復工作階段，才顯示「就緒」
            if (this.persons.length === 0) {
                this.updateStatus('就緒');
            }
            this.updateToolbar();
        }, 0);
    }


    /**
     * 快取 DOM 元素
     */
    cacheElements() {
        this.elements = {
            // 新增角色按鈕
            addPersonBtn: document.getElementById('addPerson'),

            // 工具按鈕
            selectToolBtn: document.getElementById('selectTool'),
            boxSelectToolBtn: document.getElementById('boxSelectTool'),
            connectToolBtn: document.getElementById('connectTool'),
            householdToolBtn: document.getElementById('householdTool'),
            lifeCircleToolBtn: document.getElementById('lifeCircleTool'),
            deleteToolBtn: document.getElementById('deleteTool'),
            undoBtn: document.getElementById('undoBtn'),
            redoBtn: document.getElementById('redoBtn'),
            saveBtn: document.getElementById('saveBtn'),
            downloadBtn: document.getElementById('downloadBtn'),
            loadBtn: document.getElementById('loadBtn'),
            exportBtn: document.getElementById('exportBtn'),
            autoLayoutBtn: document.getElementById('autoLayoutBtn'),

            // 面板
            propertyContent: document.getElementById('propertyContent'),
            statusBar: document.getElementById('statusBar'),
            zoomLevel: document.getElementById('zoomLevel'),
            zoomIn: document.getElementById('zoomIn'),
            zoomOut: document.getElementById('zoomOut'),
            zoomReset: document.getElementById('zoomReset'),
            canvasContainer: document.getElementById('canvasContainer'),

            // 對話框
            genderModal: document.getElementById('genderModal'),
            cancelGender: document.getElementById('cancelGender'),
            relationshipModal: document.getElementById('relationshipModal'),
            cancelRelationship: document.getElementById('cancelRelationship'),
            helpModal: document.getElementById('helpModal'),
            helpBtn: document.getElementById('helpBtn'),
            closeHelpBtn: document.getElementById('closeHelp'),
            fileInput: document.getElementById('fileInput'),

            // 圖例面板
            legendPanel: document.getElementById('legendPanel'),

            // 子女選擇對話框
            childrenModal: document.getElementById('childrenModal'),
            childrenList: document.getElementById('childrenList'),
            skipChildren: document.getElementById('skipChildren'),
            confirmChildren: document.getElementById('confirmChildren')
        };
    }

    /**
     * 設定事件監聽器
     */
    setupEventListeners() {
        // 新增角色按鈕 - 點擊後顯示性別選擇對話框
        this.elements.addPersonBtn.addEventListener('click', () => this.showGenderModal('parent'));

        // 工具列按鈕
        this.elements.selectToolBtn.addEventListener('click', () => this.setTool('select'));
        this.elements.boxSelectToolBtn.addEventListener('click', () => this.setTool('boxSelect'));
        this.elements.connectToolBtn.addEventListener('click', () => this.setTool('connect'));
        this.elements.householdToolBtn.addEventListener('click', () => this.setTool('household'));
        if (this.elements.lifeCircleToolBtn) {
            this.elements.lifeCircleToolBtn.addEventListener('click', () => this.setTool('lifeCircle'));
        }
        this.elements.deleteToolBtn.addEventListener('click', () => this.deleteSelected());
        this.elements.undoBtn.addEventListener('click', () => this.undo());
        this.elements.redoBtn.addEventListener('click', () => this.redo());
        this.elements.saveBtn.addEventListener('click', () => this.saveToFile());
        this.elements.downloadBtn.addEventListener('click', () => this.downloadFile());
        this.elements.loadBtn.addEventListener('click', () => this.handleLoadClick());
        this.elements.fileInput.addEventListener('change', (e) => this.loadFromFile(e));
        if (this.elements.exportBtn) {
            this.elements.exportBtn.addEventListener('click', () => this.showExportModal());
        }

        if (this.elements.helpBtn) {
            this.elements.helpBtn.addEventListener('click', () => {
                this.elements.helpModal.classList.add('active');
            });
        }

        if (this.elements.closeHelpBtn) {
            this.elements.closeHelpBtn.addEventListener('click', () => {
                this.elements.helpModal.classList.remove('active');
            });
        }

        if (this.elements.autoLayoutBtn) {
            this.elements.autoLayoutBtn.addEventListener('click', () => this.autoLayoutByGeneration());
        }

        // 畫布事件 (使用 Pointer Events 統一滑鼠與觸控)
        const canvas = this.canvas.canvas;
        canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        window.addEventListener('pointercancel', (e) => this.handlePointerUp(e)); // 觸控中斷時也要清理狀態
        canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));

        // 鍵盤事件
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // 縮放控制
        this.elements.zoomIn.addEventListener('click', () => this.zoom(1.1));
        this.elements.zoomOut.addEventListener('click', () => this.zoom(0.9));
        this.elements.zoomReset.addEventListener('click', () => this.resetZoom());

        // 性別選擇對話框
        this.elements.cancelGender.addEventListener('click', () => this.closeGenderModal());
        document.querySelectorAll('.gender-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const gender = e.currentTarget.dataset.gender;
                // 檢查是否為快速新增模式 (手足/伴侶)
                if (this.quickAddContext) {
                    this.createQuickPersonWithGender(gender);
                } else {
                    this.createPersonWithGeneration(gender);
                }
            });
        });

        // 關係對話框取消
        this.elements.cancelRelationship.addEventListener('click', () => this.closeRelationshipModal());

        // 關係類型按鈕
        document.querySelectorAll('.rel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // 使用 currentTarget 確保抓到的是按鈕本身而不是內部的圖示 (span)
                const type = e.currentTarget.dataset.type;
                this.createRelationship(type);
            });
        });

        // 圖例面板收合/展開
        const legendTitle = this.elements.legendPanel.querySelector('.panel-title');
        legendTitle.addEventListener('click', () => {
            this.elements.legendPanel.classList.toggle('collapsed');
            const icon = legendTitle.querySelector('.toggle-icon');
            if (this.elements.legendPanel.classList.contains('collapsed')) {
                icon.style.transform = 'rotate(-90deg)';
            } else {
                icon.style.transform = 'rotate(0deg)';
            }
        });

        // 子女選擇對話框事件
        if (this.elements.skipChildren) {
            this.elements.skipChildren.addEventListener('click', () => this.closeChildrenModal());
        }
        if (this.elements.confirmChildren) {
            this.elements.confirmChildren.addEventListener('click', () => this.confirmChildrenSelection());
        }

        // 視窗大小改變
        window.addEventListener('resize', () => {
            this.canvas.resize();
            this.render();
        });

        // [Bug Fix #2] 視窗失焦/隱藏時清理互動狀態，避免拖曳/框選/連線卡住
        window.addEventListener('blur', () => this.cancelInteraction());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.cancelInteraction();
            }
        });

        // [Bug Fix] 頁面關閉前強制儲存，避免最後變更遺失
        window.addEventListener('beforeunload', () => {
            if (this.autoSaveTimer) {
                clearTimeout(this.autoSaveTimer);
            }
            // 立即執行儲存
            this.storage.autoSave(this.persons, this.relationships, this.households || [], this.lifeCircles || [], {
                scale: this.canvas?.scale || 1,
                offsetX: this.canvas?.offsetX || 0,
                offsetY: this.canvas?.offsetY || 0
            });
        });
    }

    /**
     * 設定當前工具
     */
    setTool(tool) {
        this.currentTool = tool;

        // 切換工具時清空連線暫存，避免出現「跟隨滑鼠的線」
        if (tool !== 'connect') {
            this.connectingFrom = null;
        }

        this.updateToolbar();
        this.updateCursor();

        let statusText = '';
        switch (tool) {
            case 'select':
                statusText = '選取工具：點擊選取，拖曳移動';
                break;
            case 'boxSelect':
                statusText = '範圍圈選：拖曳滑鼠圈選多個人物';
                break;
            case 'connect':
                statusText = '連接工具：依序點擊兩個人物建立關係';
                this.connectingFrom = null;
                break;
            case 'household':
                // [UX Fix] 不自動建立，讓使用者明確操作
                if (this.selectedPersonIds.length > 0 || this.selectedPersonId) {
                    statusText = '已選取成員，按 Enter 建立同住框，或拖曳圈選更多';
                } else {
                    statusText = '同住圈選：拖曳圈選成員，放開後自動建立';
                }
                break;
            case 'lifeCircle':
                statusText = '生活圈繪製：點擊增加頂點，雙擊或 Enter 完成，Esc 取消';
                break;
        }
        this.updateStatus(statusText);
    }

    /**
     * 清除所有選取狀態 (選取互斥規則)
     */
    clearAllSelections() {
        this.selectedPersonId = null;
        this.selectedPersonIds = [];
        this.selectedRelationshipId = null;
        this.selectedHouseholdId = null;
    }

    /**
     * [Bug Fix #2] 取消所有進行中的互動操作
     * 用於視窗失焦、tab 切換、觸控中斷等情況
     */
    cancelInteraction() {
        // 清理拖曳狀態
        if (this.canvas) {
            this.canvas.isDragging = false;
            this.canvas.isPanning = false;
            this.canvas.draggedPerson = null;
            this.canvas.draggedHousehold = null;
        }

        // 清理框選狀態
        this.isBoxSelecting = false;

        // 清理連線狀態
        this.connectingFrom = null;
        this.connectingTo = null;

        // 清理 Pointer capture
        if (this.activePointerId !== null && this.canvas?.canvas) {
            try {
                this.canvas.canvas.releasePointerCapture(this.activePointerId);
            } catch (e) { /* 忽略已釋放的情況 */ }
        }
        this.activePointerId = null;

        // 清理拖曳快照 (避免遺留)
        this.dragStartSnapshot = null;

        this.render();
    }

    /**
     * 更新工具列狀態
     */
    updateToolbar() {
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));

        switch (this.currentTool) {
            case 'select':
                this.elements.selectToolBtn.classList.add('active');
                break;
            case 'boxSelect':
                this.elements.boxSelectToolBtn.classList.add('active');
                break;
            case 'connect':
                this.elements.connectToolBtn.classList.add('active');
                break;
            case 'household':
                this.elements.householdToolBtn.classList.add('active');
                break;
            case 'lifeCircle':
                if (this.elements.lifeCircleToolBtn) {
                    this.elements.lifeCircleToolBtn.classList.add('active');
                }
                break;
        }

        // 撤銷/重做按鈕狀態
        this.elements.undoBtn.disabled = !this.history.canUndo();
        this.elements.redoBtn.disabled = !this.history.canRedo();
    }

    /**
     * 更新狀態提示
     */
    updateStatus(message = null, type = null) {
        if (message) {
            this.elements.statusBar.textContent = message;
            this.elements.statusBar.className = 'status-bar'; // reset
            this.elements.statusBar.classList.remove('hidden');
            if (type) {
                this.elements.statusBar.classList.add(type);
            }
        } else {
            this.elements.statusBar.classList.add('hidden');
        }
    }

    /**
     * 更新游標樣式
     */
    updateCursor() {
        const canvas = this.canvas.canvas;
        switch (this.currentTool) {
            case 'select':
                canvas.style.cursor = 'default';
                break;
            case 'boxSelect':
                canvas.style.cursor = 'crosshair';
                break;
            case 'connect':
                canvas.style.cursor = 'cell';
                break;
            case 'household':
                canvas.style.cursor = 'crosshair';
                break;
            case 'lifeCircle':
                canvas.style.cursor = 'crosshair';
                break;
            default:
                canvas.style.cursor = 'default';
        }
    }

    /**
     * 處理指標按下 (Pointer Events 統一滑鼠與觸控)
     */
    handlePointerDown(e) {
        // Pointer capture for robust drag handling
        if (e.target === this.canvas.canvas) {
            this.activePointerId = e.pointerId;
            this.canvas.canvas.setPointerCapture(e.pointerId);
        }

        const point = this.canvas.getMousePos(e);

        // [NEW] 快速按鈕點擊偵測
        if (this.hoveredPersonId && this.currentTool === 'select') {
            const hoveredPerson = this.persons.find(p => p.id === this.hoveredPersonId);
            if (hoveredPerson) {
                const buttonType = this.canvas.getQuickButtonAt(point.x, point.y, hoveredPerson);
                if (buttonType) {
                    this.handleQuickAddClick(hoveredPerson, buttonType);
                    return;
                }
            }
        }

        // 生活圈繪製模式
        if (this.currentTool === 'lifeCircle') {
            if (!this.isDrawingLifeCircle) {
                // 開始新的生活圈繪製
                this.isDrawingLifeCircle = true;
                this.currentLifeCirclePoints = [point];
                this.updateStatus('已新增第 1 個頂點，繼續點擊增加頂點，雙擊或按 Enter 完成');
            } else {
                // 增加頂點
                this.currentLifeCirclePoints.push(point);
                const count = this.currentLifeCirclePoints.length;
                this.updateStatus(`已新增第 ${count} 個頂點，繼續點擊增加頂點，雙擊或按 Enter 完成`);
            }
            this.render();
            return;
        }

        if (this.currentTool === 'boxSelect' || this.currentTool === 'household') {
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
                }
            } else {
                // 如果點擊空白處，取消連接
                this.connectingFrom = null;
                this.updateStatus('連接工具：依序點擊兩個人物建立關係');
            }
            this.render();
            return;
        }

        if (this.currentTool === 'select') {
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
                    this.updateStatus('正在移動選取對象...', 'info');
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

            // 2. 檢查是否點擊到關係線
            const clickedRel = this.getRelationshipAt(point.x, point.y);
            if (clickedRel) {
                // 檢查這條線是否完全在某個家庭內 (Selected by default?)
                // 為求簡單與符合直覺，若該線連接的兩人都在同一家庭，則視為拖曳該家庭
                const p1 = this.persons.find(p => p.id === clickedRel.fromPersonId);
                const p2 = this.persons.find(p => p.id === clickedRel.toPersonId);

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

                    this.canvas.isDragging = true;
                    this.canvas.dragStart = point;
                    this.canvas.draggedHousehold = relHousehold;
                    this.updateStatus('正在拖曳同住家庭 (放開滑鼠以完成)', 'info');
                    this.render();
                    return;
                } else {
                    this.selectRelationship(clickedRel.id);
                    this.selectedPersonIds = [];
                    return;
                }
            }

            // 3. 檢查是否點擊到圈選框 (空白處)
            const clickedHousehold = this.getHouseholdAt(point.x, point.y);
            if (clickedHousehold) {
                // 如果按住 Shift 鍵，我們假設使用者想要進行「範圍圈選」（Box Selection）
                // 而不是拖曳家庭。所以這裡不攔截，讓它往下執行到「空白處」邏輯
                if (e.shiftKey) {
                    // Pass through to empty space logic
                } else {
                    this.selectedHouseholdId = clickedHousehold.id;
                    this.selectedPersonId = null;
                    this.selectedPersonIds = [];
                    this.selectedRelationshipId = null;
                    this.selectedLifeCircleId = null;
                    this.updatePropertyPanel();
                    this.render();

                    this.canvas.isDragging = true;
                    this.canvas.dragStart = point;
                    this.canvas.draggedHousehold = clickedHousehold;
                    this.updateStatus('正在拖曳同住家庭 (放開滑鼠以完成)', 'info');
                    return;
                }
            }

            // 3.5 檢查是否點擊到生活圈
            const clickedLifeCircle = this.getLifeCircleAt(point.x, point.y);
            if (clickedLifeCircle && !e.shiftKey) {
                this.selectedLifeCircleId = clickedLifeCircle.id;
                this.selectedPersonId = null;
                this.selectedPersonIds = [];
                this.selectedRelationshipId = null;
                this.selectedHouseholdId = null;
                this.updatePropertyPanel();
                this.render();

                // 開始拖曳生活圈
                this.canvas.isDragging = true;
                this.canvas.dragStart = point;
                this.canvas.draggedLifeCircle = clickedLifeCircle;
                this.updateStatus(`已選取「${clickedLifeCircle.label}」，拖曳移動或按 Del 刪除`, 'info');
                return;
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
                    this.canvas.isDragging = true;
                    this.canvas.dragStart = point;
                    this.canvas.draggedPerson = this.persons.find(p => p.id === this.selectedPersonIds[0]);
                    this.updateStatus('正在移動選取對象...', 'info');
                } else {
                    // 普通點擊空白處 -> 拖曳畫布 (Pan)
                    this.selectedPersonId = null;
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
    }

    /**
     * 處理指標移動 (Pointer Events 統一滑鼠與觸控)
     */
    handlePointerMove(e) {
        if (!this.canvas) return; // 確保 canvas 已初始化

        const point = this.canvas.getMousePos(e);

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

            this.render();
            return;
        }

        if (this.canvas.isDragging) {
            let dx = point.x - this.canvas.dragStart.x;
            let dy = point.y - this.canvas.dragStart.y;

            // 生活圈拖曳
            if (this.canvas.draggedLifeCircle) {
                this.canvas.draggedLifeCircle.points.forEach(p => {
                    p.x += dx;
                    p.y += dy;
                });
                this.canvas.dragStart = point;
                this.render();
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

                const movingPersons = movingPersonIds.map(id => this.persons.find(p => p.id === id)).filter(p => p);

                // 簡化移動邏輯：只進行基本的重疊防止
                // 移除垂直層級限制和水平排序限制，讓使用者可以自由移動
                const personalSpace = 80; // 從 60 調大到 80，確保人物間距更寬鬆
                let finalDx = dx;
                let finalDy = dy;

                // 檢查是否會與其他人物過於接近
                const checkOverlap = (testDx, testDy) => {
                    for (const person of movingPersons) {
                        const nx = person.x + testDx;
                        const ny = person.y + testDy;
                        const size = person.getSize ? person.getSize() : 50;

                        for (const other of this.persons) {
                            if (movingPersonIds.includes(other.id)) continue;

                            // Simple circle collision for smoother feedback
                            const dist = Math.sqrt(Math.pow(nx - other.x, 2) + Math.pow(ny - other.y, 2));
                            if (dist < personalSpace) return true;
                        }
                    }
                    return false;
                };

                // 如果完整移動會重疊，嘗試分軸移動
                if (checkOverlap(finalDx, finalDy)) {
                    const canMoveX = !checkOverlap(finalDx, 0);
                    const canMoveY = !checkOverlap(0, finalDy);

                    if (canMoveX && !canMoveY) {
                        finalDy = 0;
                    } else if (!canMoveX && canMoveY) {
                        finalDx = 0;
                    } else if (!canMoveX && !canMoveY) {
                        finalDx = 0;
                        finalDy = 0;
                    }
                }

                // [UPDATED] 允許垂直移動以支援輩分切換
                // 放開後會自動 snap 到最近的輩分

                // 執行移動
                movingPersons.forEach(person => {
                    person.x = person.x + finalDx;
                    // 如果被鎖定 (上面 finalDy=0)，這裡就不會動
                    person.y = person.y + finalDy;
                });
            }

            this.canvas.dragStart = point;
            this.render();
            return;
        }

        if (this.canvas.isPanning) {
            const dx = e.clientX - this.canvas.panStart.x;
            const dy = e.clientY - this.canvas.panStart.y;

            this.canvas.offsetX += dx;
            this.canvas.offsetY += dy;
            this.canvas.panStart = { x: e.clientX, y: e.clientY };

            this.render();
            return;
        }

        // 更新游標樣式（hover 效果）
        if (this.currentTool === 'select') {
            const person = this.getPersonAt(point.x, point.y);
            const rel = this.getRelationshipAt(point.x, point.y);
            const household = this.getHouseholdAt(point.x, point.y);

            if (person) {
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

            // [NEW] 快速按鈕 hover 追蹤
            // 修正：使用擴展區域來保持按鈕可見
            let newHoveredId = person ? person.id : null;

            // 如果目前沒有 hover 到人物，但之前有 hoveredPersonId，
            // 檢查是否在擴展的按鈕區域內
            if (!newHoveredId && this.hoveredPersonId) {
                const prevHoveredPerson = this.persons.find(p => p.id === this.hoveredPersonId);
                if (prevHoveredPerson && this.canvas.isPointInQuickAddZone(point.x, point.y, prevHoveredPerson)) {
                    // 滑鼠在擴展區域內，保持 hover 狀態
                    newHoveredId = this.hoveredPersonId;
                }
            }

            if (this.hoveredPersonId !== newHoveredId) {
                this.hoveredPersonId = newHoveredId;
                this.render();
            }

            // 檢查是否 hover 在快速按鈕上
            if (this.hoveredPersonId) {
                const hoveredPerson = this.persons.find(p => p.id === this.hoveredPersonId);
                const buttonType = this.canvas.getQuickButtonAt(point.x, point.y, hoveredPerson);
                if (buttonType) {
                    this.canvas.canvas.style.cursor = 'pointer';
                }
            }
        }
    }

    /**
     * 處理指標放開 (Pointer Events 統一滑鼠與觸控)
     */
    handlePointerUp(e) {
        // 釋放 pointer capture
        if (this.activePointerId !== null && this.canvas.canvas.hasPointerCapture(this.activePointerId)) {
            this.canvas.canvas.releasePointerCapture(this.activePointerId);
        }
        this.activePointerId = null;

        if (this.isBoxSelecting) {
            this.isBoxSelecting = false;
            this.updateBoxSelection(); // 計算選取了哪些人

            // 如果是在「同住工具」模式下，圈選完直接建立
            if (this.currentTool === 'household' && this.selectedPersonIds.length > 0) {
                this.householdSelection = [...this.selectedPersonIds];
                this.createHousehold();
                // createHousehold 內部已經呼叫了 render()，所以這裡直接 return
                return;
            }

            // 如果是「範圍圈選」工具，完成後自動切換回選取工具，方便立即移動
            if (this.currentTool === 'boxSelect') {
                this.setTool('select');
            }

            this.render();
        }

        if (this.canvas.isDragging) {
            // [Fix] 拖曳結束後執行對齊格子 (Snap to Grid) - 並確保不重疊
            if (this.canvas.draggedPerson || this.canvas.draggedHousehold) {
                let movingPersonIds = [];
                if (this.canvas.draggedPerson) {
                    movingPersonIds = this.selectedPersonIds.includes(this.canvas.draggedPerson.id)
                        ? this.selectedPersonIds
                        : [this.canvas.draggedPerson.id];
                } else if (this.canvas.draggedHousehold) {
                    movingPersonIds = this.canvas.draggedHousehold.ids;
                }

                movingPersonIds.forEach(id => {
                    const p = this.persons.find(per => per.id === id);
                    if (p) {
                        let targetX = this.snapToGrid(p.x, 'x');
                        let targetY = this.snapToGrid(p.y, 'y');

                        // [UPDATED] 根據拖曳位置自動切換輩分
                        // 如果拖曳超過上下輩分的中點，自動調整到該輩分
                        const grid = GenogramApp.GRID;

                        // 根據當前 Y 座標計算應該屬於哪個輩分
                        const relativeY = p.y - grid.ORIGIN_Y;
                        const newGeneration = Math.round(relativeY / grid.CELL_HEIGHT);

                        // 限制輩分範圍 (0 = grandparent, 1 = parent, 2 = child, 3 = grandchild)
                        const clampedGeneration = Math.max(0, Math.min(3, newGeneration));

                        // 更新輩分
                        // [Bug Fix] 修正類型檢查：p.generation 是字串，需轉換為索引比較
                        const genNames = ['grandparent', 'parent', 'child', 'grandchild'];
                        const currentGenIndex = genNames.indexOf(p.generation);
                        if (currentGenIndex !== -1 && currentGenIndex !== clampedGeneration) {
                            // 輩分發生改變，更新 generation 屬性
                            p.generation = genNames[clampedGeneration] || 'parent';
                            this.updateStatus(`已移動到${GenogramApp.GENERATION_LEVELS[p.generation]?.label || '新輩分'}`, 'info');
                        }

                        // 對齊到該輩分的 Y 座標
                        targetY = grid.ORIGIN_Y + clampedGeneration * grid.CELL_HEIGHT;

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
                            // 搜尋周圍的格子
                            // 簡單實作：搜尋左右幾格
                            let found = false;
                            for (let dist = 1; dist <= 5; dist++) {
                                // Right
                                if (!isOccupied(targetX + dist * grid.CELL_WIDTH, targetY)) {
                                    targetX += dist * grid.CELL_WIDTH;
                                    found = true;
                                    break;
                                }
                                // Left
                                if (!isOccupied(targetX - dist * grid.CELL_WIDTH, targetY)) {
                                    targetX -= dist * grid.CELL_WIDTH;
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
                this.render(); // Snap 後重繪
            }

            this.canvas.isDragging = false;
            this.canvas.draggedPerson = null;
            this.canvas.draggedHousehold = null; // 清除家庭拖曳狀態
            this.canvas.draggedLifeCircle = null; // 清除生活圈拖曳狀態

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
                    this.history.pushState(this.dragStartSnapshot);
                }
                this.dragStartSnapshot = null;
            }

            this.autoSave(); // 移動結束儲存

        }

        if (this.canvas.isPanning) {
            this.canvas.isPanning = false;
        }
    }

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
            content.innerHTML = `<div class="panel-content"><p>已選取 ${this.selectedPersonIds.length} 位成員</p></div>`;
            this.updateStatus(`已選取 ${this.selectedPersonIds.length} 位成員`, 'info');
        }
    }

    /**
     * 處理滾輪縮放
     */
    handleWheel(e) {
        if (e.ctrlKey) {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            // 以滑鼠位置為中心縮放
            // 這裡簡化處理，還是以中心縮放
            this.zoom(factor);
        } else {
            // 平移
            e.preventDefault(); // 防止瀏覽器頁面滾動
            this.canvas.offsetX -= e.deltaX;
            this.canvas.offsetY -= e.deltaY;
            this.render();
        }
    }

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
        const person = this.getPersonAt(point.x, point.y);
        if (person) {
            this.selectPerson(person.id);
            // 聚焦到姓名輸入框
            this.focusPropertyInput();
        }
    }

    /**
     * 處理鍵盤快捷鍵
     */
    handleKeyDown(e) {
        // 如果正在輸入，忽略快捷鍵
        const activeElem = document.activeElement;
        const isTyping = e.target.tagName === 'INPUT' ||
            e.target.tagName === 'TEXTAREA' ||
            (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA'));

        if (isTyping) {
            return;
        }

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
            case '1':
                this.showGenderModal('grandparent');
                break;
            case '2':
                this.showGenderModal('parent');
                break;
            case '3':
                this.showGenderModal('child');
                break;
            case '4':
                this.showGenderModal('grandchild');
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
                this.deleteSelected();
                break;
            case 'Escape':
                // [UX Fix] 改進 Esc 處理，顯示明確的狀態訊息
                if (this.isDrawingLifeCircle) {
                    this.cancelLifeCircle();
                } else if (this.connectingFrom) {
                    this.connectingFrom = null;
                    this.updateStatus('連接已取消', 'info');
                } else {
                    this.closeGenderModal();
                    this.closeRelationshipModal();
                    this.setTool('select');
                }
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

    /**
     * 取得指定座標的人物
     */
    getPersonAt(x, y) {
        // 從後往前檢查（後繪製的在上層）
        for (let i = this.persons.length - 1; i >= 0; i--) {
            if (this.persons[i].containsPoint(x, y)) {
                return this.persons[i];
            }
        }
        return null;
    }

    /**
     * 取得多選人物的邊界矩形
     */
    getMultiSelectionBounds() {
        if (this.selectedPersonIds.length < 2) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const radius = 25;

        this.selectedPersonIds.forEach(id => {
            const p = this.persons.find(per => per.id === id);
            if (p) {
                minX = Math.min(minX, p.x - radius);
                maxX = Math.max(maxX, p.x + radius);
                minY = Math.min(minY, p.y - radius);
                maxY = Math.max(maxY, p.y + radius);
            }
        });

        const padding = 10;
        return {
            x1: minX - padding,
            y1: minY - padding,
            x2: maxX + padding,
            y2: maxY + padding
        };
    }

    /**
     * 檢查點是否在多選邊界內
     */
    isPointInsideMultiSelection(x, y) {
        const bounds = this.getMultiSelectionBounds();
        if (!bounds) return false;
        return x >= bounds.x1 && x <= bounds.x2 && y >= bounds.y1 && y <= bounds.y2;
    }

    /**
     * 取得指定座標的關係線
     */
    getRelationshipAt(x, y) {
        // 從後往前檢查（後建立的在上層）
        for (let i = this.relationships.length - 1; i >= 0; i--) {
            const rel = this.relationships[i];
            const fromPerson = this.persons.find(p => p.id === rel.fromPersonId);
            const toPerson = this.persons.find(p => p.id === rel.toPersonId);
            if (fromPerson && toPerson) {
                if (this.canvas.isPointOnRelationship(x, y, fromPerson, toPerson, rel, 12, this.relationships)) {
                    return rel;
                }
            }
        }
        return null;
    }

    /**
     * 取得指定座標的圈選框
     */
    getHouseholdAt(x, y) {
        // 從後往前檢查（後建立的在上層）
        for (let i = this.households.length - 1; i >= 0; i--) {
            const household = this.households[i];
            if (this.canvas.isPointOnHouseholdBoundary(x, y, household, this.persons, this.relationships, 15)) {
                return household;
            }
        }
        return null;
    }

    /**
     * 偵測點擊位置是否在生活圈內
     */
    getLifeCircleAt(x, y) {
        // 從後往前檢查（後建立的在上層）
        for (let i = this.lifeCircles.length - 1; i >= 0; i--) {
            const lc = this.lifeCircles[i];
            if (this.isPointInPolygon(x, y, lc.points)) {
                return lc;
            }
        }
        return null;
    }

    /**
     * 點在多邊形內判斷（射線法）
     */
    isPointInPolygon(x, y, points) {
        if (!points || points.length < 3) return false;

        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x, yi = points[i].y;
            const xj = points[j].x, yj = points[j].y;

            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /**
     * 新增人物 (舊方法,保留兼容性)
     */
    addPerson(x, y, gender) {
        const person = new Person({
            x: x,
            y: y,
            gender: gender
        });
        this.persons.push(person);
        this.selectPerson(person.id);
        this.autoSave();
        // 新增後切換到選取工具，方便使用者編輯
        this.setTool('select');
        this.render();
    }

    /**
     * 顯示性別選擇對話框
     * @param {string} generation - 輩分 ('grandparent', 'parent', 'child', 'grandchild')
     */
    showGenderModal(generation) {
        this.pendingGeneration = generation;
        const level = GenogramApp.GENERATION_LEVELS[generation];
        const label = level ? level.label : (generation || '外部');
        this.updateStatus(`選擇 ${label} 的性別`, 'info');
        this.elements.genderModal.classList.add('active');
    }

    /**
     * 關閉性別選擇對話框
     */
    closeGenderModal() {
        this.pendingGeneration = null;
        this.quickAddContext = null;
        this.elements.genderModal.classList.remove('active');
        this.updateStatus('就緒');
    }

    /**
     * 處理快速新增按鈕點擊
     * @param {Person} basePerson - 基準角色
     * @param {string} buttonType - 按鈕類型 ('parent', 'sibling', 'partner', 'son', 'daughter', 'pregnancy')
     */
    handleQuickAddClick(basePerson, buttonType) {
        const grid = GenogramApp.GRID;
        this.saveState();

        switch (buttonType) {
            case 'parent':
                // 一鍵建立父母（父親 + 母親 + 婚姻線 + 2條親子線）
                this.createParentsForPerson(basePerson);
                break;

            case 'sibling':
                // 需要選擇性別
                this.quickAddContext = { personId: basePerson.id, type: 'sibling' };
                this.updateStatus('選擇手足的性別', 'info');
                this.elements.genderModal.classList.add('active');
                break;

            case 'partner':
                // 需要選擇性別，預設同居關係
                this.quickAddContext = { personId: basePerson.id, type: 'partner' };
                this.updateStatus('選擇伴侶的性別', 'info');
                this.elements.genderModal.classList.add('active');
                break;

            case 'son':
                this.createChildForPerson(basePerson, 'male');
                break;

            case 'daughter':
                this.createChildForPerson(basePerson, 'female');
                break;

            case 'pregnancy':
                this.createChildForPerson(basePerson, 'pregnancy');
                break;
        }
    }

    /**
     * 為角色建立父母（父親 + 母親 + 婚姻線）
     */
    createParentsForPerson(child) {
        const grid = GenogramApp.GRID;
        const parentY = child.y - grid.CELL_HEIGHT;

        // 建立父親（左）
        const father = new Person({
            x: child.x - grid.CELL_WIDTH / 2,
            y: parentY,
            gender: 'male',
            generation: this.getGenerationAbove(child.generation)
        });
        this.persons.push(father);

        // 建立母親（右）
        const mother = new Person({
            x: child.x + grid.CELL_WIDTH / 2,
            y: parentY,
            gender: 'female',
            generation: this.getGenerationAbove(child.generation)
        });
        this.persons.push(mother);

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
    }

    /**
     * 為角色建立子女
     */
    createChildForPerson(parent, gender) {
        const grid = GenogramApp.GRID;
        const childY = parent.y + grid.CELL_HEIGHT;

        // 計算 X 座標（避免重疊）
        let childX = parent.x;
        const existingChildren = this.persons.filter(p =>
            Math.abs(p.y - childY) < grid.CELL_HEIGHT * 0.5
        );
        if (existingChildren.length > 0) {
            const rightmost = Math.max(...existingChildren.map(p => p.x));
            if (Math.abs(childX - rightmost) < grid.CELL_WIDTH * 0.8) {
                childX = rightmost + grid.CELL_WIDTH;
            }
        }

        const child = new Person({
            x: childX,
            y: childY,
            gender: gender,
            generation: this.getGenerationBelow(parent.generation)
        });
        this.persons.push(child);

        // 建立親子關係（主要父/母）
        const parentChildRel = new Relationship({
            fromPersonId: parent.id,
            toPersonId: child.id,
            type: 'parent-child'
        });
        this.relationships.push(parentChildRel);

        // 尋找配偶（婚姻或同居關係），為配偶也建立親子關係
        const spouse = this.findSpouse(parent.id);
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
        const genderName = gender === 'male' ? '兒子' : (gender === 'female' ? '女兒' : '懷孕');
        const spouseNote = spouse ? '（雙親）' : '';
        this.updateStatus(`已建立${genderName}並建立親子關係${spouseNote}`, 'success');
    }

    /**
     * 處理快速新增的性別選擇（手足/伴侶）
     */
    createQuickPersonWithGender(gender) {
        if (!this.quickAddContext) return;

        const { personId, type } = this.quickAddContext;
        const basePerson = this.persons.find(p => p.id === personId);
        if (!basePerson) {
            this.closeGenderModal();
            return;
        }

        const grid = GenogramApp.GRID;
        this.saveState();

        if (type === 'sibling') {
            // 建立手足
            let siblingX = basePerson.x + grid.CELL_WIDTH;
            const sameLevelPersons = this.persons.filter(p =>
                Math.abs(p.y - basePerson.y) < grid.CELL_HEIGHT * 0.5
            );
            if (sameLevelPersons.length > 0) {
                const rightmost = Math.max(...sameLevelPersons.map(p => p.x));
                siblingX = rightmost + grid.CELL_WIDTH;
            }

            const sibling = new Person({
                x: siblingX,
                y: basePerson.y,
                gender: gender,
                generation: basePerson.generation
            });
            this.persons.push(sibling);

            // 找出基準角色的父母，為手足建立親子關係
            const parentRels = this.relationships.filter(r =>
                r.type === 'parent-child' && r.toPersonId === basePerson.id
            );
            parentRels.forEach(rel => {
                const siblingParentRel = new Relationship({
                    fromPersonId: rel.fromPersonId,
                    toPersonId: sibling.id,
                    type: 'parent-child'
                });
                this.relationships.push(siblingParentRel);
            });

            this.updateStatus('已建立手足', 'success');
        } else if (type === 'partner') {
            // 建立伴侶（同居關係）
            const partnerX = basePerson.x + grid.CELL_WIDTH;

            const partner = new Person({
                x: partnerX,
                y: basePerson.y,
                gender: gender,
                generation: basePerson.generation
            });
            this.persons.push(partner);

            // 建立同居關係
            const cohabitRel = new Relationship({
                fromPersonId: basePerson.id,
                toPersonId: partner.id,
                type: 'cohabiting'
            });
            this.relationships.push(cohabitRel);

            this.updateStatus('已建立伴侶並建立同居關係', 'success');
        }

        this.closeGenderModal();
        this.autoSave();
        this.render();
    }

    /**
     * 取得上一輩分
     */
    getGenerationAbove(generation) {
        const genOrder = ['grandchild', 'child', 'parent', 'grandparent'];
        const idx = genOrder.indexOf(generation);
        return idx >= 0 && idx < genOrder.length - 1 ? genOrder[idx + 1] : null;
    }

    /**
     * 取得下一輩分
     */
    getGenerationBelow(generation) {
        const genOrder = ['grandparent', 'parent', 'child', 'grandchild'];
        const idx = genOrder.indexOf(generation);
        return idx >= 0 && idx < genOrder.length - 1 ? genOrder[idx + 1] : null;
    }

    /**
     * 使用輩分和性別建立人物 (自動計算座標 並支援自動連線與防交織排列)
     * @param {string} gender - 性別 ('male', 'female')
     */
    createPersonWithGeneration(gender) {
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
        const selectedPersons = selectedIds.map(id => this.persons.find(p => p.id === id)).filter(p => p);

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
            idealX = grid.ORIGIN_X;
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
        const person = new Person({ x, y, gender, generation: generationStr });
        this.persons.push(person);

        // 自動建立關係
        let relCount = 0;
        if (selectedPersons.length > 0) {
            this.saveState();
            selectedPersons.forEach(selected => {
                let fromId, toId;
                if (['child', 'grandchild'].includes(this.pendingGeneration)) {
                    fromId = selected.id;
                    toId = person.id;
                } else {
                    fromId = person.id;
                    toId = selected.id;
                }

                const relationship = new Relationship({
                    fromPersonId: fromId,
                    toPersonId: toId,
                    type: 'parent-child'
                });
                this.relationships.push(relationship);
                relCount++;
            });
        }

        this.closeGenderModal();

        // 維持選取以便連加
        if (relCount === 0) {
            this.selectedPersonId = null;
            this.selectedPersonIds = [];
        }

        this.autoSave();
        this.setTool('select');
        this.updatePropertyPanel();
        this.render();

        let msg = `已建立人物`;
        if (relCount > 0) {
            msg += `，並自動建立 ${relCount} 條親子連線。您可以繼續點擊右側選單新增更多成員。`;
        }
        this.updateStatus(msg, (relCount > 0 ? 'success' : 'info'));
    }

    /**
     * 選取人物
     */
    selectPerson(id) {
        // [UX Fix] 選取互斥規則：清除其他選取
        this.selectedRelationshipId = null;
        this.selectedHouseholdId = null;
        // 保留 selectedPersonIds 多選狀態（如果是 Shift+點擊）
        this.selectedPersonId = id;
        this.updatePropertyPanel();
        this.render();
    }

    /**
     * 選取關係線
     */
    selectRelationship(id) {
        // [UX Fix] 選取互斥規則：清除其他選取
        this.selectedPersonId = null;
        this.selectedPersonIds = [];
        this.selectedHouseholdId = null;
        this.selectedRelationshipId = id;
        this.updatePropertyPanel();
        this.render();
    }

    /**
     * 更新屬性面板
     */
    updatePropertyPanel() {
        const content = this.elements.propertyContent;

        // 如果選中關係線，顯示關係屬性
        if (this.selectedRelationshipId) {
            const relationship = this.relationships.find(r => r.id === this.selectedRelationshipId);
            if (!relationship) {
                content.innerHTML = '<p class="empty-hint">點選成員或關係線以編輯屬性</p>';
                return;
            }

            const fromPerson = this.persons.find(p => p.id === relationship.fromPersonId);
            const toPerson = this.persons.find(p => p.id === relationship.toPersonId);
            const typeName = Relationship.getTypeName(relationship.type);

            content.innerHTML = `
                <div class="property-form">
                    <div class="form-group">
                        <label>關係類型</label>
                        <div style="padding: 8px; background: var(--bg-light); border-radius: 4px;">
                            <strong>${typeName}</strong>
                        </div>
                        <small style="color: var(--text-secondary); margin-top: 4px; display: block;">
                            ${fromPerson ? fromPerson.name || '未命名' : '未知'} ↔ ${toPerson ? toPerson.name || '未命名' : '未知'}
                        </small>
                    </div>
                    <div class="form-group">
                        <label>備註</label>
                        <textarea id="relationshipNotes" rows="3" placeholder="輸入備註">${relationship.notes || ''}</textarea>
                    </div>
                    <div style="margin-top: 12px;">
                        <button class="btn-cancel" id="deleteRelationshipBtn" style="width: 100%;">刪除此關係</button>
                    </div>
                </div>
            `;

            // 綁定事件
            const notesInput = document.getElementById('relationshipNotes');
            if (notesInput) {
                notesInput.addEventListener('input', (e) => {
                    relationship.notes = e.target.value;
                    this.autoSave();
                });
            }

            const deleteBtn = document.getElementById('deleteRelationshipBtn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    this.deleteSelected();
                });
            }

            return;
        }

        if (!this.selectedPersonId) {
            content.innerHTML = '<p class="empty-hint">點選成員、關係線或圈選框以編輯屬性</p>';
            return;
        }

        const person = this.persons.find(p => p.id === this.selectedPersonId);
        if (!person) {
            content.innerHTML = '<p class="empty-hint">點選成員、關係線或圈選框以編輯屬性</p>';
            return;
        }

        content.innerHTML = `
            <form class="property-form" id="personForm">
                <div class="form-group">
                    <label for="personName">姓名/稱謂</label>
                    <input type="text" id="personName" value="${person.name}" placeholder="輸入姓名">
                </div>
                <div class="form-group-row">
                    <div class="form-group">
                        <label for="personAge">年齡</label>
                        <input type="number" id="personAge" value="${person.age || ''}" min="0" max="150" placeholder="年齡">
                    </div>
                    <div class="form-group">
                        <label for="personGender">性別</label>
                        <select id="personGender">
                            <option value="male" ${person.gender === 'male' ? 'selected' : ''}>男性</option>
                            <option value="female" ${person.gender === 'female' ? 'selected' : ''}>女性</option>
                            <option value="pregnancy" ${person.gender === 'pregnancy' ? 'selected' : ''}>懷孕 / 性別未定 (三角形)</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <div class="checkbox-group">
                        <input type="checkbox" id="personDeceased" ${person.isDeceased ? 'checked' : ''}>
                        <label for="personDeceased">已過世</label>
                    </div>
                </div>
                <div class="form-group">
                    <div class="checkbox-group">
                        <input type="checkbox" id="personIP" ${person.isIdentifiedPatient ? 'checked' : ''}>
                        <label for="personIP">案主 / 關注對象</label>
                    </div>
                </div>
            <hr style="margin: 15px 0; border: 0; border-top: 1px solid var(--border-color);">
            <h4 style="margin-bottom: 10px; font-size: 14px; color: var(--text-color);">醫學與狀態</h4>
            
            <div class="form-group">
                <label for="medLeftHalf">生理/心理疾病 (左半部)</label>
                <select id="medLeftHalf">
                    <option value="none" ${(!person.medical || person.medical.leftHalf === 'none') ? 'selected' : ''}>無</option>
                    <option value="striped" ${(person.medical && person.medical.leftHalf === 'striped') ? 'selected' : ''}>疑似 (斜線)</option>
                    <option value="filled" ${(person.medical && person.medical.leftHalf === 'filled') ? 'selected' : ''}>嚴重/確診 (填滿)</option>
                </select>
            </div>
            <div class="form-group">
                <label for="medBottomHalf">酒精/藥物濫用 (下半部)</label>
                <select id="medBottomHalf">
                    <option value="none" ${(!person.medical || person.medical.bottomHalf === 'none') ? 'selected' : ''}>無</option>
                    <option value="striped" ${(person.medical && person.medical.bottomHalf === 'striped') ? 'selected' : ''}>疑似 (斜線)</option>
                    <option value="filled" ${(person.medical && person.medical.bottomHalf === 'filled') ? 'selected' : ''}>確診 (填滿)</option>
                </select>
            </div>
            <div class="form-group">
                <label for="medCenter">中心符號</label>
                <select id="medCenter">
                    <option value="none" ${(!person.medical || person.medical.centerSymbol === 'none') ? 'selected' : ''}>無</option>
                    <option value="dot" ${(person.medical && person.medical.centerSymbol === 'dot') ? 'selected' : ''}>帶原者 (Dot)</option>
                    <option value="cross" ${(person.medical && person.medical.centerSymbol === 'cross') ? 'selected' : ''}>受影響 (Cross)</option>
                    <option value="question" ${(person.medical && person.medical.centerSymbol === 'question') ? 'selected' : ''}>可能受影響 (?)</option>
                </select>
            </div>
            <div class="form-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="medSmoker" ${(person.medical && person.medical.isSmoker) ? 'checked' : ''}>
                    <label for="medSmoker">吸菸 (S)</label>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="medObese" ${(person.medical && person.medical.isObese) ? 'checked' : ''}>
                    <label for="medObese">肥胖 (O)</label>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="medLang" ${(person.medical && person.medical.hasLanguageProblem) ? 'checked' : ''}>
                    <label for="medLang">語言障礙 (L)</label>
                </div>
            </div>

            <hr style="margin: 15px 0; border: 0; border-top: 1px solid var(--border-color);">

            <div class="form-group">
                <label for="personNotes">備註</label>
                    <textarea id="personNotes" rows="3" placeholder="輸入備註">${person.notes}</textarea>
                </div>
            </form>
        `;

        // 綁定表單事件
        this.setupPropertyFormEvents();
    }

    /**
     * 建立同住家庭
     */
    createHousehold() {
        if (this.householdSelection.length < 1) {
            this.updateStatus('請至少選取一位成員', 'error');
            return;
        }

        // 如果成員原本就屬於其他同住框，將舊的刪除 (避免人屬於多個同住框)
        this.households = this.households.filter(h => {
            const hasOverlap = h.ids.some(id => this.householdSelection.includes(id));
            return !hasOverlap;
        });

        const newHousehold = {
            id: 'house_' + Date.now(),
            ids: [...this.householdSelection],
            notes: ''
        };

        this.households.push(newHousehold);

        // 選取剛建立的家庭，以便使用者立即看到屬性面板並確認建立成功
        this.selectedHouseholdId = newHousehold.id;
        this.selectedPersonId = null;
        this.selectedPersonIds = [];
        this.householdSelection = [];

        this.setTool('select');
        this.updateStatus('同住圈選已建立', 'success');
        this.saveState();
        this.autoSave();
        this.render();
    }

    /**
     * 完成生活圈繪製
     */
    finishLifeCircle() {
        if (this.currentLifeCirclePoints.length < 3) {
            this.updateStatus('生活圈至少需要3個頂點', 'warning');
            return;
        }

        const newLifeCircle = {
            id: 'lc_' + Date.now(),
            points: [...this.currentLifeCirclePoints],
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

        this.updateStatus(`已建立「${newLifeCircle.label}」`, 'success');
        this.saveState();
        this.autoSave();
        this.render();
    }

    /**
     * 取消生活圈繪製
     */
    cancelLifeCircle() {
        this.isDrawingLifeCircle = false;
        this.currentLifeCirclePoints = [];
        this.lifeCircleMousePos = null;
        this.updateStatus('生活圈繪製已取消', 'info');
        this.render();
    }

    /**
     * 獲取下一個生活圈的顏色
     */
    getNextLifeCircleColor() {
        const colors = [
            'rgba(74, 144, 226, 0.15)',   // 藍色
            'rgba(80, 200, 120, 0.15)',   // 綠色
            'rgba(255, 165, 0, 0.15)',    // 橙色
            'rgba(148, 103, 189, 0.15)',  // 紫色
            'rgba(255, 99, 132, 0.15)',   // 粉紅
            'rgba(75, 192, 192, 0.15)'    // 青色
        ];
        return colors[this.lifeCircles.length % colors.length];
    }

    /**
     * 設定屬性表單事件
     */
    setupPropertyFormEvents() {
        const form = document.getElementById('personForm');
        if (!form) return;

        const person = this.persons.find(p => p.id === this.selectedPersonId);
        if (!person) return;

        // 姓名
        document.getElementById('personName').addEventListener('input', (e) => {
            person.name = e.target.value;
            this.render();
            this.autoSave();
        });

        // 年齡
        document.getElementById('personAge').addEventListener('input', (e) => {
            person.age = e.target.value ? parseInt(e.target.value) : null;
            this.render();
            this.autoSave();
        });

        // 性別
        document.getElementById('personGender').addEventListener('change', (e) => {
            this.saveState();
            person.gender = e.target.value;
            this.render();
            this.autoSave();
        });

        // 過世
        document.getElementById('personDeceased').addEventListener('change', (e) => {
            this.saveState();
            person.isDeceased = e.target.checked;
            this.render();
            this.autoSave();
        });

        // 案主
        document.getElementById('personIP').addEventListener('change', (e) => {
            this.saveState();
            person.isIdentifiedPatient = e.target.checked;
            this.render();
            this.autoSave();
        });

        // 醫學屬性處理 helper
        const updateMedical = (key, value) => {
            this.saveState();
            if (!person.medical) person.medical = {};
            person.medical[key] = value;
            this.render();
            this.autoSave();
        };

        // 醫學下拉選單
        const medLeft = document.getElementById('medLeftHalf');
        if (medLeft) medLeft.addEventListener('change', (e) => updateMedical('leftHalf', e.target.value));

        const medBottom = document.getElementById('medBottomHalf');
        if (medBottom) medBottom.addEventListener('change', (e) => updateMedical('bottomHalf', e.target.value));

        const medCenter = document.getElementById('medCenter');
        if (medCenter) medCenter.addEventListener('change', (e) => updateMedical('centerSymbol', e.target.value));

        // 醫學核取方塊
        const medSmoker = document.getElementById('medSmoker');
        if (medSmoker) medSmoker.addEventListener('change', (e) => updateMedical('isSmoker', e.target.checked));

        const medObese = document.getElementById('medObese');
        if (medObese) medObese.addEventListener('change', (e) => updateMedical('isObese', e.target.checked));

        const medLang = document.getElementById('medLang');
        if (medLang) medLang.addEventListener('change', (e) => updateMedical('hasLanguageProblem', e.target.checked));

        // 備註
        document.getElementById('personNotes').addEventListener('input', (e) => {
            person.notes = e.target.value;
            this.autoSave();
        });
    }

    /**
     * 聚焦到屬性輸入框
     */
    focusPropertyInput() {
        setTimeout(() => {
            const nameInput = document.getElementById('personName');
            if (nameInput) {
                nameInput.focus();
                nameInput.select();
            }
        }, 100);
    }

    /**
     * 顯示關係選擇對話框
     */
    showRelationshipModal() {
        this.elements.relationshipModal.classList.add('active');
    }

    /**
     * 關閉關係選擇對話框
     */
    closeRelationshipModal() {
        this.elements.relationshipModal.classList.remove('active');
        this.connectingFrom = null;
        this.connectingTo = null;
        // 連接完成後切換回選取工具
        this.setTool('select');
    }

    /**
     * 建立關係
     */
    createRelationship(type) {
        if (!type || type === 'undefined') return; // 安全檢查：防止 undefined 類型
        if (!this.connectingFrom || !this.connectingTo) return;

        const fromId = this.connectingFrom.person.id;
        const toId = this.connectingTo.id;
        const fromPerson = this.persons.find(p => p.id === fromId);
        const toPerson = this.persons.find(p => p.id === toId);
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
        const exactDuplicate = this.relationships.find(r =>
            ((r.fromPersonId === fromId && r.toPersonId === toId) ||
                (r.fromPersonId === toId && r.toPersonId === fromId)) &&
            r.type === type
        );

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

        if (relationshipToReplace) {
            // 如果已存在同類別的結構化關係，更新它
            this.saveState();
            relationshipToReplace.type = type;
        } else {
            // 新增為獨立的關係
            this.saveState();
            const relationship = new Relationship({
                fromPersonId: fromId,
                toPersonId: toId,
                type: type
            });
            this.relationships.push(relationship);
        }

        // 若是親子關係，自動置中父母於子女上方
        if (type === 'parent-child') {
            this.centerParentsAboveChildren();
        }

        this.closeRelationshipModal();
        this.autoSave();
        this.render();


    }

    /**
     * 驗證婚姻類關係是否合法
     * @param {Person} person1 - 第一個人物
     * @param {Person} person2 - 第二個人物
     * @returns {{valid: boolean, message: string}} - 驗證結果
     */
    validateMarriageRelationship(person1, person2) {
        if (!person1 || !person2) {
            return { valid: false, message: '無法找到選取的人物' };
        }

        const grid = GenogramApp.GRID;

        // 規則 1: 同輩分檢查（Y 座標差異不超過半個格子高度）
        const yDiff = Math.abs(person1.y - person2.y);
        if (yDiff > grid.CELL_HEIGHT * 0.5) {
            return { valid: false, message: '⚠️ 無法建立伴侶關係：兩人不在同一輩分' };
        }

        // 規則 2: 檢查是否已有直接親子關係
        const hasDirectParentChild = this.relationships.some(r =>
            r.type === 'parent-child' &&
            ((r.fromPersonId === person1.id && r.toPersonId === person2.id) ||
                (r.fromPersonId === person2.id && r.toPersonId === person1.id))
        );
        if (hasDirectParentChild) {
            return { valid: false, message: '⚠️ 無法建立伴侶關係：兩人之間已有親子關係' };
        }

        // 輔助方法：取得某人的父母 ID
        const getParentIds = (personId) => {
            const parents = new Set();
            this.relationships.forEach(r => {
                if (r.type === 'parent-child') {
                    const from = this.persons.find(p => p.id === r.fromPersonId);
                    const to = this.persons.find(p => p.id === r.toPersonId);
                    if (!from || !to) return;

                    // 父母是 Y 座標較小的那個
                    if (from.y < to.y && to.id === personId) {
                        parents.add(from.id);
                    } else if (to.y < from.y && from.id === personId) {
                        parents.add(to.id);
                    }
                }
            });
            return parents;
        };

        // 輔助方法：取得某人的子女 ID
        const getChildrenIds = (personId) => {
            const children = new Set();
            this.relationships.forEach(r => {
                if (r.type === 'parent-child') {
                    const from = this.persons.find(p => p.id === r.fromPersonId);
                    const to = this.persons.find(p => p.id === r.toPersonId);
                    if (!from || !to) return;

                    // 子女是 Y 座標較大的那個
                    if (from.y < to.y && from.id === personId) {
                        children.add(to.id);
                    } else if (to.y < from.y && to.id === personId) {
                        children.add(from.id);
                    }
                }
            });
            return children;
        };

        // 輔助方法：取得所有祖先 ID（遞迴向上查找）
        const getAncestorIds = (personId, visited = new Set()) => {
            if (visited.has(personId)) return new Set();
            visited.add(personId);

            const ancestors = new Set();
            const parents = getParentIds(personId);
            parents.forEach(parentId => {
                ancestors.add(parentId);
                // 遞迴取得祖父母等
                getAncestorIds(parentId, visited).forEach(id => ancestors.add(id));
            });
            return ancestors;
        };

        // 輔助方法：取得所有子孫 ID（遞迴向下查找）
        const getDescendantIds = (personId, visited = new Set()) => {
            if (visited.has(personId)) return new Set();
            visited.add(personId);

            const descendants = new Set();
            const children = getChildrenIds(personId);
            children.forEach(childId => {
                descendants.add(childId);
                // 遞迴取得孫子女等
                getDescendantIds(childId, visited).forEach(id => descendants.add(id));
            });
            return descendants;
        };

        // 規則 3: 檢查是否為手足（共同父母）
        const parents1 = getParentIds(person1.id);
        const parents2 = getParentIds(person2.id);

        for (const parentId of parents1) {
            if (parents2.has(parentId)) {
                return { valid: false, message: '⚠️ 無法建立伴侶關係：兩人是手足（有共同父母）' };
            }
        }

        // 規則 4: 檢查 person2 是否在 person1 的祖先中（不能和父母、祖父母結婚）
        const ancestors1 = getAncestorIds(person1.id);
        if (ancestors1.has(person2.id)) {
            return { valid: false, message: '⚠️ 無法建立伴侶關係：不能與父母或祖先結婚' };
        }

        // 規則 5: 檢查 person2 是否在 person1 的子孫中（不能和子女、孫子女結婚）
        const descendants1 = getDescendantIds(person1.id);
        if (descendants1.has(person2.id)) {
            return { valid: false, message: '⚠️ 無法建立伴侶關係：不能與子女或後代結婚' };
        }

        // 規則 6: 反向檢查（person1 是否在 person2 的祖先/子孫中）
        const ancestors2 = getAncestorIds(person2.id);
        if (ancestors2.has(person1.id)) {
            return { valid: false, message: '⚠️ 無法建立伴侶關係：不能與子女或後代結婚' };
        }

        const descendants2 = getDescendantIds(person2.id);
        if (descendants2.has(person1.id)) {
            return { valid: false, message: '⚠️ 無法建立伴侶關係：不能與父母或祖先結婚' };
        }

        return { valid: true, message: '' };
    }

    /**
     * 顯示選擇子女對話框
     */
    showChildrenModal(potentialChildren) {
        if (!this.elements.childrenModal || !this.elements.childrenList) return;

        // 清空並填充子女列表
        this.elements.childrenList.innerHTML = '';
        this.selectedChildrenIds = [];

        if (potentialChildren.length === 0) {
            this.elements.childrenList.innerHTML = '<p class="no-children-hint">沒有可選的子女</p>';
        } else {
            potentialChildren.forEach(child => {
                const option = document.createElement('div');
                option.className = 'child-option';
                option.dataset.id = child.id;
                option.innerHTML = `
                    <span class="child-icon ${child.gender}"></span>
                    <span>${child.name || (child.gender === 'male' ? '男性' : '女性')}</span>
                `;
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

        this.elements.childrenModal.classList.add('active');
    }

    /**
     * 關閉選擇子女對話框
     */
    closeChildrenModal() {
        if (this.elements.childrenModal) {
            this.elements.childrenModal.classList.remove('active');
        }
        this.pendingParents = null;
        this.selectedChildrenIds = [];
    }

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
                // 檢查是否已存在親子關係
                const exists = this.relationships.some(r =>
                    r.type === 'parent-child' &&
                    ((r.fromPersonId === parentId && r.toPersonId === childId) ||
                        (r.fromPersonId === childId && r.toPersonId === parentId))
                );
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
    }

    /**
     * 將所有父母置中於子女上方
     * 遍歷所有親子關係，確保每位父母的 X 座標置中於其所有子女的中心點
     */
    centerParentsAboveChildren() {
        // 收集每位父母的所有子女
        const parentToChildren = {};

        this.relationships.forEach(rel => {
            if (rel.type === 'parent-child') {
                const fromPerson = this.persons.find(p => p.id === rel.fromPersonId);
                const toPerson = this.persons.find(p => p.id === rel.toPersonId);
                if (!fromPerson || !toPerson) return;

                // 判斷誰是父母（Y 座標較小的是父母）
                let parentId, childId;
                if (fromPerson.y < toPerson.y) {
                    parentId = fromPerson.id;
                    childId = toPerson.id;
                } else {
                    parentId = toPerson.id;
                    childId = fromPerson.id;
                }

                if (!parentToChildren[parentId]) {
                    parentToChildren[parentId] = [];
                }
                parentToChildren[parentId].push(childId);
            }
        });

        // 對每位父母，計算其所有子女的 X 中心點，並調整父母位置
        Object.keys(parentToChildren).forEach(parentId => {
            const childIds = parentToChildren[parentId];
            const parent = this.persons.find(p => p.id === parentId);
            if (!parent || childIds.length === 0) return;

            // 計算所有子女的 X 座標平均值（中心點）
            const childXPositions = childIds.map(cid => {
                const child = this.persons.find(p => p.id === cid);
                return child ? child.x : 0;
            }).filter(x => x !== 0);

            if (childXPositions.length === 0) return;

            const centerX = childXPositions.reduce((sum, x) => sum + x, 0) / childXPositions.length;

            // 檢查是否有配偶（透過婚姻關係）
            const spouse = this.findSpouse(parentId);

            if (spouse) {
                // 如果有配偶，將兩人中心置於子女中心上方
                const spacing = GenogramApp.HORIZONTAL_SPACING;
                const coupleCenter = centerX;

                // 根據性別決定左右位置（男左女右）
                if (parent.gender === 'male') {
                    parent.x = coupleCenter - spacing / 2;
                    spouse.x = coupleCenter + spacing / 2;
                } else {
                    parent.x = coupleCenter + spacing / 2;
                    spouse.x = coupleCenter - spacing / 2;
                }
            } else {
                // 單親：直接置中
                parent.x = centerX;
            }
        });
    }

    /**
     * 尋找某人的配偶（透過婚姻類型關係）
     * @param {string} personId 
     * @returns {Person|null}
     */
    findSpouse(personId) {
        // 使用類別常數
        const marriageTypes = GenogramApp.MARRIAGE_TYPES;

        for (const rel of this.relationships) {
            if (marriageTypes.includes(rel.type)) {
                if (rel.fromPersonId === personId) {
                    return this.persons.find(p => p.id === rel.toPersonId);
                }
                if (rel.toPersonId === personId) {
                    return this.persons.find(p => p.id === rel.fromPersonId);
                }
            }
        }
        return null;
    }

    /**
     * 刪除選取的項目
     */
    deleteSelected() {
        // 優先權 1: 優先刪除「關係線」 (User Request: 避免被同住框攔截)
        if (this.selectedRelationshipId) {
            this.saveState();
            this.relationships = this.relationships.filter(r => r.id !== this.selectedRelationshipId);
            this.selectedRelationshipId = null;
            this.updatePropertyPanel();
            this.autoSave();
            this.render();
        }
        // 優先權 2: 刪除「同住圈選框」
        else if (this.selectedHouseholdId) {
            this.saveState();
            this.households = this.households.filter(h => h.id !== this.selectedHouseholdId);
            this.selectedHouseholdId = null;
            this.updatePropertyPanel();
            this.autoSave();
            this.render();
        }
        // 優先權 2.5: 刪除「生活圈」
        else if (this.selectedLifeCircleId) {
            this.saveState();
            const lc = this.lifeCircles.find(l => l.id === this.selectedLifeCircleId);
            this.lifeCircles = this.lifeCircles.filter(l => l.id !== this.selectedLifeCircleId);
            this.selectedLifeCircleId = null;
            this.updateStatus(`已刪除「${lc?.label || '生活圈'}」`, 'success');
            this.updatePropertyPanel();
            this.autoSave();
            this.render();
        }
        // 優先權 3: 刪除多選人物
        else if (this.selectedPersonIds.length > 0) {
            // 刪除多選的人物
            this.saveState();
            this.persons = this.persons.filter(p => !this.selectedPersonIds.includes(p.id));
            // 刪除相關的關係
            this.relationships = this.relationships.filter(r =>
                !this.selectedPersonIds.includes(r.fromPersonId) &&
                !this.selectedPersonIds.includes(r.toPersonId)
            );
            // 從圈選框中移除
            this.households = this.households.map(h => ({
                ...h,
                ids: h.ids.filter(id => !this.selectedPersonIds.includes(id))
            })).filter(h => h.ids.length > 0);
            this.selectedPersonIds = [];
            this.updatePropertyPanel();
            this.autoSave();
            this.render();
        } else if (this.selectedPersonId) {
            this.saveState();

            // [Bug Fix #8] 刪除單一人物時，也要清理相關引用
            // 1. 刪除相關的關係
            this.relationships = this.relationships.filter(
                r => !r.involvesPerson(this.selectedPersonId)
            );

            // 2. 從圈選框中移除 (不論是多選還是單選都該做)
            this.households = this.households.map(h => ({
                ...h,
                ids: h.ids.filter(id => id !== this.selectedPersonId)
            })).filter(h => h.ids.length > 0);

            // 3. 刪除人物
            this.persons = this.persons.filter(p => p.id !== this.selectedPersonId);
            this.selectedPersonId = null;
            this.updatePropertyPanel();
            this.autoSave();
            this.render();
        }
    }

    /**
     * 繪製
     */
    render() {
        this.canvas.render(
            this.persons,
            this.relationships,
            this.householdSelection,
            this.selectedPersonId,
            this.selectedRelationshipId,
            this.connectingFrom,
            this.selectedPersonIds, // 多選的人物 ID 列表
            this.isBoxSelecting ? this.boxSelectStart : null, // 選擇框起始點
            this.isBoxSelecting ? this.boxSelectEnd : null, // 選擇框結束點
            this.households, // 同住家庭列表
            this.selectedHouseholdId, // 選中的家庭 ID
            this.hoveredPersonId // hover 的角色 ID
        );

        // 繪製生活圈（在最底層，但因為是 overlay 方式，需要特殊處理）
        if (this.lifeCircles && this.lifeCircles.length > 0) {
            this.canvas.drawLifeCircles(this.lifeCircles, this.selectedLifeCircleId);
        }

        // 繪製生活圈預覽（正在繪製中）
        if (this.isDrawingLifeCircle && this.currentLifeCirclePoints.length > 0) {
            this.canvas.drawLifeCirclePreview(this.currentLifeCirclePoints, this.lifeCircleMousePos);
        }
    }

    /**
     * 縮放
     */
    zoom(factor) {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        this.canvas.setScale(this.canvas.scale * factor, centerX, centerY);
        this.updateZoomDisplay();
        this.render();
    }

    /**
     * 重置縮放
     */
    resetZoom() {
        this.canvas.scale = 1;
        this.canvas.offsetX = 0;
        this.canvas.offsetY = 0;
        this.updateZoomDisplay();
        this.render();
    }

    /**
     * 更新縮放顯示
     */
    updateZoomDisplay() {
        this.elements.zoomLevel.textContent = Math.round(this.canvas.scale * 100) + '%';
    }

    /**
     * 將座標對齊至最近的格子點
     * @param {number} value - 座標值
     * @param {string} axis - 'x' 或 'y'
     * @returns {number} - 對齊後的座標
     */
    snapToGrid(value, axis) {
        const grid = GenogramApp.GRID;
        const cellSize = axis === 'x' ? grid.CELL_WIDTH : grid.CELL_HEIGHT;
        const origin = axis === 'x' ? grid.ORIGIN_X : grid.ORIGIN_Y;

        // 計算最近格子位置
        const gridIndex = Math.round((value - origin) / cellSize);
        return origin + gridIndex * cellSize;
    }

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
            const spouse = this.persons.find(p => p.id === spouseId);

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
                    const child = this.persons.find(p => p.id === r.toPersonId);
                    if (child && Math.abs(child.y - person.y) < sameGenErrorMargin) {
                        siblingIds.add(child.id);
                    }
                }
            });

            if (siblingIds.size > 1) {
                const siblings = Array.from(siblingIds).map(id => this.persons.find(p => p.id === id)).filter(p => p);

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

    /**
     * 檢查兩人之間的間距是否合理
     * @param {Object} p1 - 第一個人物
     * @param {Object} p2 - 第二個人物
     * @returns {boolean} - 間距是否合理
     */
    isValidSpacing(p1, p2) {
        const dx = Math.abs(p1.x - p2.x);
        const dy = Math.abs(p1.y - p2.y);
        const distance = Math.sqrt(dx * dx + dy * dy);

        const grid = GenogramApp.GRID;

        // 同輩分（Y軸接近）時檢查水平間距
        if (dy < grid.CELL_HEIGHT * 0.5) {
            return dx >= grid.MIN_DISTANCE && dx <= grid.MAX_DISTANCE;
        }

        return distance >= grid.MIN_DISTANCE;
    }

    /**
     * 儲存當前狀態到歷史
     */
    saveState() {
        this.history.pushState({
            persons: this.persons.map(p => p.toJSON()),
            relationships: this.relationships.map(r => r.toJSON()),
            households: this.households || []
        });
        this.updateToolbar();
    }

    /**
     * 撤銷
     */
    undo() {
        const currentState = {
            persons: this.persons.map(p => p.toJSON()),
            relationships: this.relationships.map(r => r.toJSON()),
            households: this.households || []
        };

        const prevState = this.history.undo(currentState);
        if (prevState) {
            this.persons = prevState.persons.map(p => Person.fromJSON(p));
            this.relationships = prevState.relationships.map(r => Relationship.fromJSON(r));
            this.households = prevState.households || [];
            this.selectedPersonId = null;
            this.updatePropertyPanel();
            this.autoSave();
            this.render();
        }
        this.updateToolbar();
    }

    /**
     * 重做
     */
    redo() {
        const currentState = {
            persons: this.persons.map(p => p.toJSON()),
            relationships: this.relationships.map(r => r.toJSON()),
            households: this.households || []
        };

        const nextState = this.history.redo(currentState);
        if (nextState) {
            this.persons = nextState.persons.map(p => Person.fromJSON(p));
            this.relationships = nextState.relationships.map(r => Relationship.fromJSON(r));
            this.households = nextState.households || [];
            this.selectedPersonId = null;
            this.updatePropertyPanel();
            this.autoSave();
            this.render();
        }
        this.updateToolbar();
    }

    /**
     * [Bug Fix #3] 取得當前狀態快照 (用於拖曳 History 比對)
     */
    getState() {
        return {
            persons: this.persons.map(p => p.toJSON()),
            relationships: this.relationships.map(r => r.toJSON()),
            households: this.households || [],
            lifeCircles: this.lifeCircles || []
        };
    }

    /**
     * [Bug Fix #3] 檢查兩個狀態之間是否有顯著的位置變化
     * @param {Object} oldState - 舊狀態
     * @param {Object} newState - 新狀態
     * @param {number} threshold - 位移閾值 (px)
     * @returns {boolean} - 是否有顯著變化
     */
    hasSignificantPositionChange(oldState, newState, threshold = 2) {
        if (!oldState || !oldState.persons || !newState || !newState.persons) {
            return false;
        }

        const oldPositions = {};
        oldState.persons.forEach(p => {
            oldPositions[p.id] = { x: p.x, y: p.y };
        });

        for (const p of newState.persons) {
            const oldPos = oldPositions[p.id];
            if (!oldPos) continue;

            const dx = Math.abs(p.x - oldPos.x);
            const dy = Math.abs(p.y - oldPos.y);

            if (dx >= threshold || dy >= threshold) {
                return true;
            }
        }

        return false;
    }

    /**
     * 儲存到檔案

     */
    async saveToFile() {
        // 1. 永遠先執行一次自動儲存 (LocalStorage)，確保瀏覽器狀態最新
        this.autoSave();

        // 2. 嘗試直接寫入檔案 (如果瀏覽器支援且有連結)
        const result = await this.storage.saveToFile(this.persons, this.relationships, this.households || [], this.lifeCircles || []);

        if (result === true) {
            this.updateStatus(`已成功儲存至檔案: ${this.storage.getOpenFileName()}`, 'success');
        } else {
            // 如果無法直接寫入（沒連結或不支援）
            if (this.persons.length > 0) {
                // 有內容才提示尚未儲存至本機
                this.updateStatus(`已快速儲存至瀏覽器（你的檔案尚未儲存至本機，請點選「另存」備份）。`, 'info');
            } else {
                // 空畫布則簡單提示即可
                this.updateStatus(`已快速儲存至瀏覽器。`, 'success');
            }
        }
        setTimeout(() => this.updateStatus(), 4000);
    }

    /**
     * 下載檔案
     */
    async downloadFile(suggestedName = null) {
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = suggestedName || `genogram_${timestamp}.json`;
        this.updateStatus(`正在另存檔案: ${filename}...`, 'info');
        const success = await this.storage.downloadFile(this.persons, this.relationships, this.households || [], this.lifeCircles || [], filename);
        if (success) {
            this.updateStatus(`已成功導出: ${this.storage.getOpenFileName()}`, 'success');
            this.autoSave();
        }
    }

    /**
     * 載入數據到應用程式
     */
    loadData(data) {
        this.saveState();
        this.persons = (data.persons || []).map(p => Person.fromJSON(p));
        this.relationships = (data.relationships || []).map(r => Relationship.fromJSON(r));
        this.households = data.households || [];
        this.lifeCircles = data.lifeCircles || [];
        this.selectedPersonId = null;
        this.updatePropertyPanel();
        this.autoSave();
        this.render();
        this.resetZoom();
    }

    /**
     * 處理載入按鈕點擊
     */
    async handleLoadClick() {
        // 嘗試使用新的 API 載入
        if (window.showOpenFilePicker) {
            try {
                const data = await this.storage.openFileWithPicker();
                if (data) {
                    this.loadData(data);
                    this.updateStatus(`已載入檔案: ${this.storage.getOpenFileName()}`, 'success');
                    return;
                } else {
                    // 用戶取消選擇，直接返回，不執行後續的傳統方式
                    return;
                }
            } catch (err) {
                console.warn('使用檔案選擇器載入失敗，切換回傳統方式', err);
            }
        }

        // 如果 API 不支援或失敗，使用傳統 input 方式
        this.elements.fileInput.click();
    }

    /**
     * 從檔案載入 (傳統 Input 方式)
     */
    async loadFromFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const data = await this.storage.loadFromFile(file);
            this.loadData(data);
            this.updateStatus(`已載入檔案: ${file.name} (唯讀模式)`, 'success');
        } catch (err) {
            alert(err.message);
        }

        // 清空檔案輸入
        e.target.value = '';
    }

    /**
     * 匯出 PNG
     */
    exportPNG() {
        const dataUrl = this.canvas.exportToPNG(this.persons, this.relationships, this.households || [], this.lifeCircles || []);
        if (dataUrl) {
            const timestamp = new Date().toISOString().slice(0, 10);
            this.storage.exportPNG(dataUrl, `genogram_${timestamp}.png`);
        }
    }

    /**
     * 顯示匯出格式選擇對話框
     */
    showExportModal() {
        const modal = document.getElementById('exportModal');
        if (modal) {
            modal.classList.add('active');

            // 綁定格式按鈕事件
            modal.querySelectorAll('.export-option-btn').forEach(btn => {
                btn.onclick = (e) => {
                    const format = e.currentTarget.dataset.format;
                    this.handleExportFormat(format);
                    this.closeExportModal();
                };
            });

            // 綁定取消按鈕
            const cancelBtn = document.getElementById('cancelExport');
            if (cancelBtn) {
                cancelBtn.onclick = () => this.closeExportModal();
            }
        }
    }

    /**
     * 關閉匯出格式選擇對話框
     */
    closeExportModal() {
        const modal = document.getElementById('exportModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * 處理不同格式的匯出
     * @param {string} format - 匯出格式 (png, jpeg, svg, pdf, json)
     */
    handleExportFormat(format) {
        if (this.persons.length === 0) {
            this.updateStatus('沒有內容可匯出', 'error');
            return;
        }

        const timestamp = new Date().toISOString().slice(0, 10);

        switch (format) {
            case 'png':
                this.exportPNG();
                this.updateStatus('已匯出 PNG 圖片', 'success');
                break;

            case 'jpeg':
                this.exportJPEG();
                this.updateStatus('已匯出 JPEG 圖片', 'success');
                break;

            case 'svg':
                this.exportSVG();
                this.updateStatus('已匯出 SVG 向量圖', 'success');
                break;

            case 'pdf':
                this.exportPDF();
                this.updateStatus('已匯出 PDF 文件', 'success');
                break;

            case 'json':
                this.exportJSON();
                this.updateStatus('已匯出 JSON 資料備份', 'success');
                break;

            default:
                console.warn('Unknown export format:', format);
        }
    }

    /**
     * 匯出 JPEG
     */
    exportJPEG() {
        const dataUrl = this.canvas.exportToJPEG(this.persons, this.relationships, this.households || [], this.lifeCircles || []);
        if (dataUrl) {
            const timestamp = new Date().toISOString().slice(0, 10);
            this.storage.exportJPEG(dataUrl, `genogram_${timestamp}.jpg`);
        }
    }

    /**
     * 匯出 SVG
     * 注意：由於 SVG 需要完全重新繪製，這裡使用 PNG 轉 SVG 的方式
     * 真正的向量 SVG 需要更複雜的實作
     */
    exportSVG() {
        // 使用 PNG dataUrl 嵌入到 SVG 中
        // 這是一個簡化的實作，保持視覺一致性
        const dataUrl = this.canvas.exportToPNG(this.persons, this.relationships, this.households || [], this.lifeCircles || []);
        if (dataUrl) {
            // 從 canvas 取得尺寸
            const img = new Image();
            img.onload = () => {
                const width = img.width;
                const height = img.height;

                const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${width}" height="${height}" 
     viewBox="0 0 ${width} ${height}">
    <title>Genogram Export</title>
    <image x="0" y="0" width="${width}" height="${height}" xlink:href="${dataUrl}"/>
</svg>`;

                const timestamp = new Date().toISOString().slice(0, 10);
                this.storage.exportSVG(svgContent, `genogram_${timestamp}.svg`);
            };
            img.src = dataUrl;
        }
    }

    /**
     * 匯出 PDF
     */
    exportPDF() {
        const dataUrl = this.canvas.exportToPNG(this.persons, this.relationships, this.households || [], this.lifeCircles || []);
        if (dataUrl) {
            // 從 dataUrl 取得圖片尺寸
            const img = new Image();
            img.onload = () => {
                const width = img.width;
                const height = img.height;
                const timestamp = new Date().toISOString().slice(0, 10);
                this.storage.exportPDF(dataUrl, width, height, `genogram_${timestamp}.pdf`);
            };
            img.src = dataUrl;
        }
    }

    /**
     * 匯出 JSON 資料備份
     */
    exportJSON() {
        const timestamp = new Date().toISOString().slice(0, 10);
        this.storage.exportDataJSON(
            this.persons,
            this.relationships,
            this.households || [],
            this.lifeCircles || [],
            `genogram_backup_${timestamp}.json`
        );
    }



    /**
     * 自動儲存 (含防抖與競態保護)
     */
    autoSave() {
        if (this.isLoading) return;

        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }

        this.autoSaveTimer = setTimeout(() => {
            const now = Date.now();
            // 避免頻繁重複寫入
            if (now - this.lastAutoSaveTime < 1000) return;

            this.storage.autoSave(this.persons, this.relationships, this.households || [], this.lifeCircles || [], {
                scale: this.scale,
                offsetX: this.offsetX,
                offsetY: this.offsetY
            });
            this.lastAutoSaveTime = now;
            this.autoSaveTimer = null;
        }, 1000); // 1秒防抖
    }

    /**
     * 載入自動儲存
     */
    loadAutoSave() {
        this.isLoading = true; // 暫停 autosave
        const saved = this.storage.loadAutoSave();
        if (saved) {
            this.persons = saved.persons;
            this.relationships = saved.relationships;
            this.households = saved.households || [];
            this.lifeCircles = saved.lifeCircles || [];

            // 還原視圖狀態
            // [Bug Fix] 視圖狀態應寫入 canvas 物件而非 app
            if (saved.view && this.canvas) {
                this.canvas.scale = saved.view.scale || 1;
                this.canvas.offsetX = saved.view.offsetX || 0;
                this.canvas.offsetY = saved.view.offsetY || 0;
                this.updateZoomDisplay();
            }

            // 延遲渲染，確保 canvas 尺寸已正確初始化
            requestAnimationFrame(() => {
                this.render();
                this.isLoading = false; // 恢復 autosave
            });

            const fileName = this.storage.getOpenFileName();
            if (fileName) {
                this.updateStatus(`已恢復上次工作階段: ${fileName}`, 'info');
            } else {
                this.updateStatus('已恢復上次工作階段', 'info');
            }
            // 讓恢復訊息停留長一點
            setTimeout(() => this.updateStatus(), 5000);
        } else {
            // [Bug Fix] 即使沒有儲存資料，也要重置 isLoading 狀態
            this.isLoading = false;
        }
    }


    /**
     * 自動排列同輩份的人物
     */
    autoLayoutByGeneration() {
        this.saveState();

        // ===== 0. 找出案主並建立家族分類 =====
        const identifiedPatient = this.persons.find(p => p.isIdentifiedPatient);
        if (!identifiedPatient) {
            this.updateStatus('提示：未標記案主，將使用預設排列。建議先在屬性面板勾選「案主」。', 'warning');
        }

        // 1. 找出所有親子關係
        const familyRels = this.relationships.filter(rel => rel.type === 'parent-child');

        if (familyRels.length === 0 && this.relationships.length > 0) {
            this.updateStatus('警告：未偵測到「親子關係」，無法自動分代。請先建立親子連結。', 'error');
        }

        // 2. 找出所有婚姻關係（配偶會被放在同一代）
        const marriageTypes = GenogramApp.MARRIAGE_TYPES;
        const marriageRels = this.relationships.filter(rel => marriageTypes.includes(rel.type));

        // 建立人物映射
        const personMap = {}; // personId -> person object
        this.persons.forEach(p => personMap[p.id] = p);

        // ===== 0.5 建立「案主側」vs「配偶側」的家族標記 =====
        const familySide = {}; // personId -> 'ip' | 'spouse' | 'neutral'
        this.persons.forEach(p => familySide[p.id] = 'neutral');

        // ===== 輔助函數 (不論是否有案主均可用) =====

        // 找某人的所有配偶
        const getSpouses = (personId) => {
            const spouses = [];
            marriageRels.forEach(r => {
                if (r.fromPersonId === personId) spouses.push(r.toPersonId);
                else if (r.toPersonId === personId) spouses.push(r.fromPersonId);
            });
            return spouses;
        };

        // 找某人的父母 [Bug Fix] 加入 Y 座標比較，確保方向正確
        const getParents = (personId) => {
            const parents = [];
            const person = personMap[personId];
            if (!person) return parents;

            familyRels.forEach(r => {
                // 檢查 toPersonId 指向的情況
                if (r.toPersonId === personId) {
                    const parent = personMap[r.fromPersonId];
                    if (parent && parent.y < person.y) {
                        parents.push(r.fromPersonId);
                    }
                }
                // [Bug Fix] 也檢查 fromPersonId 指向的情況（如果使用者從子女連到父母）
                if (r.fromPersonId === personId) {
                    const parent = personMap[r.toPersonId];
                    if (parent && parent.y < person.y) {
                        parents.push(r.toPersonId);
                    }
                }
            });
            return parents;
        };

        // 找某人的子女 [Bug Fix] 加入 Y 座標比較，確保方向正確
        const getChildren = (personId) => {
            const children = [];
            const person = personMap[personId];
            if (!person) return children;

            familyRels.forEach(r => {
                // 檢查 fromPersonId 指向的情況
                if (r.fromPersonId === personId) {
                    const child = personMap[r.toPersonId];
                    if (child && child.y > person.y) {
                        children.push(r.toPersonId);
                    }
                }
                // [Bug Fix] 也檢查 toPersonId 指向的情況（如果使用者從子女連到父母）
                if (r.toPersonId === personId) {
                    const child = personMap[r.fromPersonId];
                    if (child && child.y > person.y) {
                        children.push(r.fromPersonId);
                    }
                }
            });
            return children;
        };

        // 找某人的手足（同父或同母）
        const getSiblings = (personId) => {
            const parents = getParents(personId);
            const siblings = new Set();
            parents.forEach(parentId => {
                getChildren(parentId).forEach(childId => {
                    if (childId !== personId) siblings.add(childId);
                });
            });
            return Array.from(siblings);
        };

        if (identifiedPatient) {

            console.log('[DEBUG] ========== 開始家族分類 ==========');
            console.log('[DEBUG] 案主:', identifiedPatient.id, identifiedPatient.name);

            // ===== 核心函數：只透過血親追蹤 =====
            const markBloodOnly = (startId, side, blocked = new Set()) => {
                const queue = [startId];
                const visited = new Set(blocked); // 複製 blocked 作為初始 visited

                while (queue.length > 0) {
                    const currentId = queue.shift();

                    if (visited.has(currentId)) continue;
                    visited.add(currentId);

                    // 標記此人
                    familySide[currentId] = side;
                    console.log(`[DEBUG] 標記 ${personMap[currentId]?.name || currentId} 為 ${side}`);

                    // 往上：父母
                    getParents(currentId).forEach(parentId => {
                        if (!visited.has(parentId) && !blocked.has(parentId)) {
                            queue.push(parentId);
                        }
                    });

                    // 往下：子女
                    getChildren(currentId).forEach(childId => {
                        if (!visited.has(childId) && !blocked.has(childId)) {
                            queue.push(childId);
                        }
                    });

                    // 平行：手足
                    getSiblings(currentId).forEach(siblingId => {
                        if (!visited.has(siblingId) && !blocked.has(siblingId)) {
                            queue.push(siblingId);
                        }
                    });
                }
            };

            // ===== Step 1: 找案主的配偶 =====
            console.log('[DEBUG] ----- Step 1: 尋找案主配偶 -----');

            let primarySpouseId = null;

            // 方法 A: 從婚姻關係找
            const ipSpouses = getSpouses(identifiedPatient.id);
            console.log('[DEBUG] 案主的配偶 (從婚姻關係):', ipSpouses.map(id => personMap[id]?.name || id));

            if (ipSpouses.length > 0) {
                primarySpouseId = ipSpouses[0];
                console.log('[DEBUG] 使用第一個配偶:', personMap[primarySpouseId]?.name || primarySpouseId);
            }

            // 方法 B: 如果沒找到，從共同子女反推
            if (!primarySpouseId) {
                console.log('[DEBUG] 婚姻關係找不到配偶，嘗試從子女反推...');

                const ipChildren = getChildren(identifiedPatient.id);
                console.log('[DEBUG] 案主的子女:', ipChildren.map(id => personMap[id]?.name || id));

                for (const childId of ipChildren) {
                    const childParents = getParents(childId);
                    console.log(`[DEBUG] 子女 ${personMap[childId]?.name || childId} 的父母:`, childParents.map(id => personMap[id]?.name || id));

                    const otherParent = childParents.find(p => p !== identifiedPatient.id);
                    if (otherParent) {
                        primarySpouseId = otherParent;
                        console.log('[DEBUG] 從子女反推找到配偶:', personMap[primarySpouseId]?.name || primarySpouseId);
                        break;
                    }
                }
            }

            if (!primarySpouseId) {
                console.warn('[DEBUG] 警告：找不到案主的配偶，所有人將標記為 ip 側');
            }

            // ===== Step 2: 先標記配偶側 =====
            console.log('[DEBUG] ----- Step 2: 標記配偶側 -----');

            if (primarySpouseId) {
                // 建立阻擋清單：案主本人 + 案主的子女
                const blockedForSpouse = new Set();
                blockedForSpouse.add(identifiedPatient.id);

                // 案主的所有子女都不應該被配偶側追蹤
                getChildren(identifiedPatient.id).forEach(childId => {
                    blockedForSpouse.add(childId);
                });

                console.log('[DEBUG] 配偶側追蹤阻擋清單:', Array.from(blockedForSpouse).map(id => personMap[id]?.name || id));

                markBloodOnly(primarySpouseId, 'spouse', blockedForSpouse);
            }

            // ===== Step 3: 標記案主側 =====
            console.log('[DEBUG] ----- Step 3: 標記案主側 -----');

            // 建立阻擋清單：配偶 + 已標記為 spouse 的人
            const blockedForIP = new Set();
            if (primarySpouseId) {
                blockedForIP.add(primarySpouseId);
            }

            // 所有已標記為 spouse 的人都阻擋
            this.persons.forEach(p => {
                if (familySide[p.id] === 'spouse') {
                    blockedForIP.add(p.id);
                }
            });

            console.log('[DEBUG] 案主側追蹤阻擋清單:', Array.from(blockedForIP).map(id => personMap[id]?.name || id));

            markBloodOnly(identifiedPatient.id, 'ip', blockedForIP);

            // ===== Step 4: 確保案主子女歸案主側 =====
            console.log('[DEBUG] ----- Step 4: 確保案主子女歸案主側 -----');

            getChildren(identifiedPatient.id).forEach(childId => {
                familySide[childId] = 'ip';
                console.log(`[DEBUG] 強制標記子女 ${personMap[childId]?.name || childId} 為 ip`);
            });

            // ===== Step 5: 處理手足的配偶（姻親）=====
            console.log('[DEBUG] ----- Step 5: 處理姻親 -----');

            this.persons.forEach(p => {
                if (familySide[p.id] !== 'neutral') {
                    const spouses = getSpouses(p.id);
                    spouses.forEach(spouseId => {
                        if (familySide[spouseId] === 'neutral') {
                            familySide[spouseId] = familySide[p.id];
                            console.log(`[DEBUG] 姻親 ${personMap[spouseId]?.name || spouseId} 標記為 ${familySide[p.id]} (配偶: ${p.name})`);
                        }
                    });
                }
            });

            // ===== 最終結果 =====
            console.log('[DEBUG] ========== 家族分類結果 ==========');
            this.persons.forEach(p => {
                console.log(`  ${p.name || p.id}: ${familySide[p.id]}`);
            });

            // 統計
            const counts = { ip: 0, spouse: 0, neutral: 0 };
            this.persons.forEach(p => counts[familySide[p.id]]++);
            console.log('[DEBUG] 統計:', counts);
        }




        // 3. 建立親子關係映射：childId -> [parentId, parentId]
        const childParents = {};
        familyRels.forEach(rel => {
            const p1 = personMap[rel.fromPersonId];
            const p2 = personMap[rel.toPersonId];
            if (!p1 || !p2) return;

            const parentId = rel.fromPersonId;
            const childId = rel.toPersonId;

            if (!childParents[childId]) childParents[childId] = [];
            if (!childParents[childId].includes(parentId)) {
                childParents[childId].push(parentId);
            }
        });

        // 4. 計算每個人的輩份 (使用結構深度優先，視覺 Y 軸為輔)
        const generation = {}; // personId -> generation number

        // 初始化：優先使用 p.generation，如果沒有則根據結構推算
        this.persons.forEach(p => {
            if (typeof p.generation === 'number') generation[p.id] = p.generation;
        });

        // 如果有案主，以案主為中心（輩份 2，對應 child 輩）進行擴散
        if (identifiedPatient) {
            const queue = [{ id: identifiedPatient.id, gen: generation[identifiedPatient.id] ?? 2 }];
            if (generation[identifiedPatient.id] === undefined) generation[identifiedPatient.id] = 2;

            const visited = new Set([identifiedPatient.id]);

            while (queue.length > 0) {
                const { id, gen } = queue.shift();

                // 往下：子女 (gen + 1)
                getChildren(id).forEach(cid => {
                    if (!visited.has(cid)) {
                        generation[cid] = (generation[cid] !== undefined) ? generation[cid] : gen + 1;
                        visited.add(cid);
                        queue.push({ id: cid, gen: generation[cid] });
                    }
                });

                // 往上：父母 (gen - 1)
                getParents(id).forEach(pid => {
                    if (!visited.has(pid)) {
                        generation[pid] = (generation[pid] !== undefined) ? generation[pid] : gen - 1;
                        visited.add(pid);
                        queue.push({ id: pid, gen: generation[pid] });
                    }
                });

                // 平行：配偶 (gen)
                getSpouses(id).forEach(sid => {
                    if (!visited.has(sid)) {
                        generation[sid] = (generation[sid] !== undefined) ? generation[sid] : gen;
                        visited.add(sid);
                        queue.push({ id: sid, gen: generation[sid] });
                    }
                });

                // 平行：手足 (gen)
                getSiblings(id).forEach(sid => {
                    if (!visited.has(sid)) {
                        generation[sid] = (generation[sid] !== undefined) ? generation[sid] : gen;
                        visited.add(sid);
                        queue.push({ id: sid, gen: generation[sid] });
                    }
                });
            }
        }

        // 剩餘沒被結構連接到的人，使用原有的 Y 軸分群 (Visual Inference)
        const initGrid = GenogramApp.GRID || { CELL_HEIGHT: 150 };
        const unassigned = this.persons.filter(p => generation[p.id] === undefined);

        if (unassigned.length > 0) {
            const sortedByY = unassigned.sort((a, b) => a.y - b.y);
            let lastY = sortedByY[0].y;
            let currentGen = 0;

            // 嘗試從已分配的人中找基準點
            const assigned = this.persons.filter(p => generation[p.id] !== undefined);
            if (assigned.length > 0) {
                const avgY = assigned.reduce((acc, p) => acc + p.y, 0) / assigned.length;
                const avgGen = assigned.reduce((acc, p) => acc + generation[p.id], 0) / assigned.length;
                currentGen = Math.round(avgGen + (sortedByY[0].y - avgY) / initGrid.CELL_HEIGHT);
            }

            sortedByY.forEach((p, index) => {
                if (index > 0 && p.y - lastY > initGrid.CELL_HEIGHT * 0.5) {
                    currentGen++;
                }
                generation[p.id] = currentGen;
                lastY = p.y;
            });
        }

        // 整理：確保沒有負數輩份，並統一平移
        const genValues = Object.values(generation);
        if (genValues.length > 0) {
            const minGen = Math.min(...genValues);
            if (minGen < 0) {
                const shift = Math.abs(minGen);
                Object.keys(generation).forEach(id => generation[id] += shift);
            }
        }

        // 迭代優化 (Relaxation) - 確保極端情況下的約束
        let changed = true;
        let iterations = 0;
        const maxIterations = 50;

        // 預先取得手足關係，加速約束求解
        const siblingGroups = []; // [[id1, id2, ...], ...]
        const siblingProcessed = new Set();
        this.persons.forEach(p => {
            if (siblingProcessed.has(p.id)) return;
            const siblings = getSiblings(p.id);
            if (siblings.length > 0) {
                const group = [p.id, ...siblings];
                siblingGroups.push(group);
                group.forEach(id => siblingProcessed.add(id));
            }
        });

        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;

            // 規則 1: 子女輩份必須比父母大 (至少 +1)
            familyRels.forEach(rel => {
                const pGen = generation[rel.fromPersonId];
                const cGen = generation[rel.toPersonId];
                if (pGen !== undefined && cGen !== undefined && cGen <= pGen) {
                    generation[rel.toPersonId] = pGen + 1;
                    changed = true;
                }
            });

            // 規則 2: 配偶/伴侶必須在同一代
            marriageRels.forEach(rel => {
                const g1 = generation[rel.fromPersonId];
                const g2 = generation[rel.toPersonId];
                if (g1 !== undefined && g2 !== undefined && g1 !== g2) {
                    const maxGen = Math.max(g1, g2);
                    generation[rel.fromPersonId] = maxGen;
                    generation[rel.toPersonId] = maxGen;
                    changed = true;
                }
            });

            // 規則 3: 手足必須在同一代
            siblingGroups.forEach(group => {
                let maxGen = -1;
                group.forEach(id => {
                    if (generation[id] !== undefined) maxGen = Math.max(maxGen, generation[id]);
                });

                if (maxGen !== -1) {
                    group.forEach(id => {
                        if (generation[id] !== maxGen) {
                            generation[id] = maxGen;
                            changed = true;
                        }
                    });
                }
            });
        }

        if (iterations >= maxIterations) {
            console.warn('AutoLayout: Generation calculation did not converge. Possible cycle detected.');
        }

        // 5. 按輩份分組
        console.log('[DEBUG] Generation Calc Result:', generation);
        console.log('[DEBUG] Family Rels Count:', familyRels.length);
        const byGeneration = {}; // generation -> [personId, ...]
        this.persons.forEach(p => {
            const gen = generation[p.id] || 0;
            if (!byGeneration[gen]) byGeneration[gen] = [];
            byGeneration[gen].push(p.id);
        });
        console.log('[DEBUG] byGeneration groups:', Object.keys(byGeneration));

        // 5.1 結構性分組 (Component Grouping)
        const componentMap = {}; // personId -> componentId
        let componentIdCounter = 0;

        const structuralRels = this.relationships.filter(r => {
            const cat = typeof r.getCategory === 'function' ? r.getCategory() : Relationship.getCategory(r.type);

            if (cat === 'family') return true;

            if (cat === 'marriage') {
                if (['separated', 'divorced', 'affair', 'widowed'].includes(r.type)) {
                    const p1House = this.households ? this.households.find(h => h.ids.includes(r.fromPersonId)) : null;
                    const p2House = this.households ? this.households.find(h => h.ids.includes(r.toPersonId)) : null;

                    if (p1House && p2House && p1House.id === p2House.id) {
                        return true;
                    }
                    return false;
                }
                return true;
            }
            return false;
        });

        // 使用 BFS 標記 Component
        const visited = new Set();
        this.persons.forEach(p => {
            if (!visited.has(p.id)) {
                componentIdCounter++;
                const queue = [p.id];
                visited.add(p.id);
                componentMap[p.id] = componentIdCounter;

                while (queue.length > 0) {
                    const currentId = queue.shift();

                    structuralRels.forEach(r => {
                        let neighbor = null;
                        if (r.fromPersonId === currentId) neighbor = r.toPersonId;
                        else if (r.toPersonId === currentId) neighbor = r.fromPersonId;

                        if (neighbor && !visited.has(neighbor)) {
                            visited.add(neighbor);
                            componentMap[neighbor] = componentIdCounter;
                            queue.push(neighbor);
                        }
                    });

                    // 同住家庭成員視為同一群組
                    if (this.households) {
                        this.households.forEach(h => {
                            if (h.ids.includes(currentId)) {
                                h.ids.forEach(memberId => {
                                    if (memberId !== currentId && !visited.has(memberId)) {
                                        visited.add(memberId);
                                        componentMap[memberId] = componentIdCounter;
                                        queue.push(memberId);
                                    }
                                });
                            }
                        });
                    }
                }
            }
        });

        // ===== 5.2 重新分配 Component ID，讓案主側的 Component 排在右邊 =====
        // 收集所有 Component 並按 familySide 重新編號
        if (identifiedPatient) {
            const componentGroups = {}; // componentId -> { side: 'ip'|'spouse'|'neutral', members: [] }

            this.persons.forEach(p => {
                const compId = componentMap[p.id];
                if (!componentGroups[compId]) {
                    componentGroups[compId] = { members: [], sides: {} };
                }
                componentGroups[compId].members.push(p.id);
                const side = familySide[p.id];
                componentGroups[compId].sides[side] = (componentGroups[compId].sides[side] || 0) + 1;
            });

            // 決定每個 Component 的主要 side
            Object.keys(componentGroups).forEach(compId => {
                const sides = componentGroups[compId].sides;
                if ((sides['spouse'] || 0) > (sides['ip'] || 0)) {
                    componentGroups[compId].primarySide = 'spouse';
                } else if ((sides['ip'] || 0) > 0) {
                    componentGroups[compId].primarySide = 'ip';
                } else {
                    componentGroups[compId].primarySide = 'neutral';
                }
            });

            // 重新編號：spouse 側 = 1xx, neutral = 2xx, ip 側 = 3xx
            const sideOrder = { 'spouse': 100, 'neutral': 200, 'ip': 300 };
            let subCounter = { 'spouse': 0, 'neutral': 0, 'ip': 0 };

            Object.keys(componentGroups).forEach(oldCompId => {
                const group = componentGroups[oldCompId];
                const side = group.primarySide;
                const newCompId = sideOrder[side] + (++subCounter[side]);

                group.members.forEach(pid => {
                    componentMap[pid] = newCompId;
                });
            });

            console.log('[AutoLayout] Component reassignment complete:', componentMap);
        }

        // 6. 在每個輩份內進行排序
        const sortedGens = Object.keys(byGeneration).map(g => parseInt(g)).sort((a, b) => a - b);

        // [Fix] 預先初始化 nodePositions，避免在排序階段存取未定義變數
        // 這個物件會在第 8 步驟被正式填充，但在排序時也會被參照
        const nodePositions = {};

        sortedGens.forEach((genStr, genIndex) => {
            let personIds = byGeneration[genStr];
            const sortedIds = [];
            const used = new Set();
            const genMarriageRels = this.relationships.filter(r =>
                (typeof r.getCategory === 'function' ? r.getCategory() : Relationship.getCategory(r.type)) === 'marriage'
            );

            // 定義排序單位
            let units = [];
            const processedPersons = new Set();

            // 1. 建立家庭單位
            if (this.households) {
                this.households.forEach(household => {
                    const membersInGen = household.ids.filter(hid =>
                        personIds.some(pid => pid.toString() === hid.toString())
                    );

                    if (membersInGen.length > 0) {
                        const firstMember = membersInGen[0];
                        const compId = componentMap[firstMember] || 0;

                        units.push({
                            type: 'household',
                            members: membersInGen,
                            id: household.id,
                            componentId: compId,
                            householdId: household.id,
                            familySide: familySide[firstMember] // 新增：家族側別
                        });
                        membersInGen.forEach(id => processedPersons.add(id.toString()));
                    }
                });
            }

            // 2. 建立配偶單位
            const coupleUsed = new Set();
            personIds.forEach(pid => {
                const pidStr = pid.toString();
                if (processedPersons.has(pidStr) || coupleUsed.has(pidStr)) return;

                const spouseRel = genMarriageRels.find(r =>
                    (r.fromPersonId === pid && personIds.includes(r.toPersonId) && !processedPersons.has(r.toPersonId.toString()) && !coupleUsed.has(r.toPersonId.toString())) ||
                    (r.toPersonId === pid && personIds.includes(r.fromPersonId) && !processedPersons.has(r.fromPersonId.toString()) && !coupleUsed.has(r.fromPersonId.toString()))
                );

                if (spouseRel) {
                    const spouseId = spouseRel.fromPersonId === pid ? spouseRel.toPersonId : spouseRel.fromPersonId;
                    units.push({
                        type: 'couple',
                        members: [pid, spouseId],
                        id: `${pid}-${spouseId}`,
                        componentId: componentMap[pid],
                        householdId: null,
                        familySide: familySide[pid] // 新增：家族側別
                    });
                    coupleUsed.add(pidStr);
                    coupleUsed.add(spouseId.toString());
                    processedPersons.add(pidStr);
                    processedPersons.add(spouseId.toString());
                }
            });

            // 3. 建立個人單位
            personIds.forEach(pid => {
                if (!processedPersons.has(pid.toString())) {
                    units.push({
                        type: 'person',
                        members: [pid],
                        id: pid,
                        componentId: componentMap[pid],
                        householdId: null,
                        familySide: familySide[pid] // 新增：家族側別
                    });
                    processedPersons.add(pid.toString());
                }
            });

            // 3.5 計算單位的排序分數 (Parent Score)
            let prevGenIds = [];
            let parentIndices = {};

            if (genIndex > 0) {
                prevGenIds = byGeneration[sortedGens[genIndex - 1]];
                prevGenIds.forEach((id, idx) => parentIndices[id] = idx);
            }

            const getPersonParentScore = (pid) => {
                if (genIndex === 0) return 9999;
                const parents = familyRels
                    .filter(r => r.toPersonId === pid && prevGenIds.includes(r.fromPersonId))
                    .map(r => r.fromPersonId);

                if (parents.length === 0) return 9999;

                const sum = parents.reduce((acc, pid) => acc + (parentIndices[pid] !== undefined ? parentIndices[pid] : 9999), 0);
                return sum / parents.length;
            };

            units.forEach(unit => {
                if (unit.type === 'person') {
                    unit.score = getPersonParentScore(unit.members[0]);
                } else {
                    const scores = unit.members.map(m => getPersonParentScore(m)).filter(s => s !== 9999);
                    if (scores.length > 0) {
                        unit.score = scores.reduce((a, b) => a + b, 0) / scores.length;
                    } else {
                        unit.score = 9999;
                    }
                }
            });

            // 3.6 計算 Household Gravity
            const householdCenters = {};
            if (this.households) {
                this.households.forEach(h => {
                    let sumIdx = 0;
                    let count = 0;
                    h.ids.forEach(mid => {
                        if (prevGenIds && prevGenIds.includes(mid)) {
                            sumIdx += parentIndices[mid];
                            count++;
                        }
                    });
                    if (count > 0) householdCenters[h.id] = sumIdx / count;
                });
            }

            // 3.7 計算 Edge Bias
            const getEdgeBias = (pid) => {
                const myCompId = componentMap[pid];
                let bias = 0;
                const myRels = this.relationships.filter(r => r.fromPersonId === pid || r.toPersonId === pid);
                myRels.forEach(r => {
                    const otherId = r.fromPersonId === pid ? r.toPersonId : r.fromPersonId;
                    const otherCompId = componentMap[otherId];
                    if (otherCompId && otherCompId !== myCompId) {
                        if (otherCompId > myCompId) bias += 1;
                        else bias -= 1;
                    }
                });
                return bias;
            };

            // 3.8 套用 Bias 到單位
            units.forEach(unit => {
                // Household Bias
                unit.householdBias = 0;
                if (unit.householdId && householdCenters[unit.householdId] !== undefined) {
                    const centerIdx = householdCenters[unit.householdId];
                    if (unit.score !== 9999) {
                        if (centerIdx > unit.score + 0.1) unit.householdBias = 1;
                        else if (centerIdx < unit.score - 0.1) unit.householdBias = -1;
                    }
                }
                // Edge Bias
                let totalEdgeBias = 0;
                unit.members.forEach(m => totalEdgeBias += getEdgeBias(m));
                unit.edgeBias = totalEdgeBias;

                // [Fix] 標記單位是否有任何連線 (用於將未連線角色排到最右邊)
                unit.hasRelationships = unit.members.some(mid =>
                    this.relationships.some(r => r.fromPersonId === mid || r.toPersonId === mid)
                );
            });

            // [Modified] 嚴格陣列排序 (Strict Array Sort) + [Parent Alignment]
            // 計算每個 Unit 的「父母預期中心點」，用於排序以維持垂直對齊
            units.forEach(unit => {
                let parentCenters = [];
                unit.members.forEach(mid => {
                    const parents = [];
                    familyRels.forEach(r => {
                        if (r.toPersonId === mid && nodePositions[r.fromPersonId]) {
                            parents.push(nodePositions[r.fromPersonId].x);
                        }
                    });
                    if (parents.length > 0) {
                        const avg = parents.reduce((a, b) => a + b, 0) / parents.length;
                        parentCenters.push(avg);
                    }
                });

                if (parentCenters.length > 0) {
                    unit.parentCenter = parentCenters.reduce((a, b) => a + b, 0) / parentCenters.length;
                } else {
                    unit.parentCenter = null;
                }
            });

            // [REFINED] 單位排序邏輯 (Unit Sorting)
            units.sort((a, b) => {
                // 0. 未連線角色強制排在最後面 (Keep unlinked nodes on the far right)
                if (a.hasRelationships !== b.hasRelationships) {
                    return a.hasRelationships ? -1 : 1;
                }

                // 1. 家族分支 (Component) 必須保持絕對分離
                if (a.componentId !== b.componentId) return a.componentId - b.componentId;

                // 2. 垂直對齊優先 (Parental Alignment)
                // 讓子女儘可能排在父母下方的位置，這是維持樹狀結構不亂掉的核心
                if (a.parentCenter !== null && b.parentCenter !== null) {
                    if (Math.abs(a.parentCenter - b.parentCenter) > 5) {
                        return a.parentCenter - b.parentCenter;
                    }
                }

                // 3. 家族側別 (IP vs Spouse Side)
                const sideA = familySide[a.members[0]] || 'neutral';
                const sideB = familySide[b.members[0]] || 'neutral';
                const sideOrder = { 'spouse': -1, 'neutral': 0, 'ip': 1 };
                if (sideOrder[sideA] !== sideOrder[sideB]) return sideOrder[sideA] - sideOrder[sideB];

                // 4. 年齡 (長輩在左) - 僅作為低優先級參考
                const getAge = (u) => {
                    let max = -1;
                    u.members.forEach(m => {
                        const p = personMap[m];
                        if (p && typeof p.age === 'number') max = Math.max(max, p.age);
                    });
                    return max;
                };
                const ageA = getAge(a);
                const ageB = getAge(b);
                if (ageA !== -1 && ageB !== -1 && ageA !== ageB) return ageB - ageA;

                return 0;
            });

            // 5. 展開單位並處理內部排序
            // 建立一個暫存結構來追蹤需要延後處理的配偶
            const deferredSpouses = []; // { spouseId, bloodRelativeId, position: 'left'|'right' }
            const bloodRelativeIds = new Set(); // 有父母的人（血親）

            // 預先識別所有血親（在此代中有父母的人）
            if (genIndex > 0) {
                personIds.forEach(pid => {
                    const hasParentInPrevGen = familyRels.some(r =>
                        (r.toPersonId === pid && prevGenIds.includes(r.fromPersonId)) ||
                        (r.fromPersonId === pid && prevGenIds.includes(r.toPersonId))
                    );
                    if (hasParentInPrevGen) {
                        bloodRelativeIds.add(pid);
                    }
                });
            }

            units.forEach(unit => {
                if (unit.type === 'household') {
                    const members = [...unit.members];
                    members.sort((a, b) => {
                        // 家庭內部：側別 > 年齡 > 性別
                        const sA = familySide[a];
                        const sB = familySide[b];
                        const sOrder = { 'spouse': -1, 'neutral': 0, 'ip': 1 };
                        if (sOrder[sA] !== sOrder[sB]) return sOrder[sA] - sOrder[sB];

                        const pA = personMap[a], pB = personMap[b];
                        const ageA = pA?.age ?? -1, ageB = pB?.age ?? -1;
                        if (ageA !== ageB && ageA !== -1 && ageB !== -1) return ageB - ageA;

                        const genA = pA?.gender === 'female' ? 1 : -1;
                        const genB = pB?.gender === 'female' ? 1 : -1;
                        return genA - genB;
                    });
                    sortedIds.push(...members);
                } else if (unit.type === 'couple') {
                    const [p1, p2] = unit.members;
                    const per1 = personMap[p1], per2 = personMap[p2];

                    // 識別哪個是血親，哪個是姻親配偶
                    const p1IsBlood = bloodRelativeIds.has(p1);
                    const p2IsBlood = bloodRelativeIds.has(p2);

                    if (p1IsBlood && !p2IsBlood) {
                        // p1 是血親，p2 是姻親配偶
                        // 先只加入血親，配偶稍後放到邊緣
                        sortedIds.push(p1);
                        deferredSpouses.push({ spouseId: p2, bloodRelativeId: p1 });
                    } else if (p2IsBlood && !p1IsBlood) {
                        // p2 是血親，p1 是姻親配偶
                        sortedIds.push(p2);
                        deferredSpouses.push({ spouseId: p1, bloodRelativeId: p2 });
                    } else {
                        // 兩者都是血親，或都不是血親 → 維持男左女右
                        if (per1?.gender === 'female' && per2?.gender === 'male') {
                            sortedIds.push(p2, p1);
                        } else {
                            sortedIds.push(p1, p2);
                        }
                    }
                } else {
                    sortedIds.push(...unit.members);
                }
            });

            // 處理延後的配偶 - 放在血親的外側
            deferredSpouses.forEach(({ spouseId, bloodRelativeId }) => {
                const bloodIdx = sortedIds.indexOf(bloodRelativeId);
                if (bloodIdx !== -1) {
                    // 判斷血親在哪一側
                    const midPoint = sortedIds.length / 2;
                    if (bloodIdx < midPoint) {
                        // 血親在左半邊，配偶插入其左邊
                        sortedIds.splice(bloodIdx, 0, spouseId);
                    } else {
                        // 血親在右半邊，配偶插入其右邊
                        sortedIds.splice(bloodIdx + 1, 0, spouseId);
                    }
                } else {
                    // 找不到血親，直接加到最後
                    sortedIds.push(spouseId);
                }
            });

            byGeneration[genStr] = sortedIds;
        });

        // 7. 計算佈局座標
        const grid = GenogramApp.GRID;
        const baseY = grid.ORIGIN_Y;
        const generationSpacing = grid.CELL_HEIGHT;
        const personSpacing = grid.CELL_WIDTH;
        const groupGap = 80; // 從 40 調大到 80，讓不同家族分離更明顯
        const personSize = 50;
        // 8. 逐代排列 (X-座標計算)
        // 分為兩次排列：Pass 1 排列核心家族，Pass 2 將未連線角色垂直對齊於最右側。

        // 【Pass 1】核心家族成員排列
        let globalMaxFamilyX = grid.ORIGIN_X;

        sortedGens.forEach((gen, genIndex) => {
            const genLevel = parseInt(gen);
            const allIds = byGeneration[gen];
            // 只篩選出有關係的角色
            const linkedIds = allIds.filter(pid =>
                this.relationships.some(r => r.fromPersonId === pid || r.toPersonId === pid)
            );

            if (linkedIds.length === 0) return;

            const y = baseY + genLevel * generationSpacing;

            // 計算此代家族部分的錨點 (重心對齊)
            let anchorX = 0;
            const parentContext = [];
            linkedIds.forEach(pid => {
                const parents = familyRels.filter(r => r.toPersonId === pid && nodePositions[r.fromPersonId])
                    .map(r => nodePositions[r.fromPersonId].x);
                if (parents.length > 0) {
                    parentContext.push(parents.reduce((a, b) => a + b, 0) / parents.length);
                }
            });

            if (parentContext.length > 0) {
                const avgParentX = parentContext.reduce((a, b) => a + b, 0) / parentContext.length;
                const genWidth = (linkedIds.length - 1) * personSpacing;
                anchorX = avgParentX - genWidth / 2;
            } else if (genLevel > 0) {
                // 參考最近的一個上方輩分的最左邊界
                const prevLevel = genLevel - 1;
                const prevGenIds = byGeneration[prevLevel];
                const prevLinked = (prevGenIds || []).filter(pid => nodePositions[pid]);
                if (prevLinked.length > 0) {
                    anchorX = Math.min(...prevLinked.map(id => nodePositions[id].x));
                }
            }

            let currentX = anchorX;
            linkedIds.forEach((pid, idx) => {
                const person = personMap[pid];
                if (!person) return;

                if (idx > 0) {
                    const prevId = linkedIds[idx - 1];
                    let gap = personSpacing;
                    if (componentMap[pid] !== componentMap[prevId]) gap += groupGap;
                    else if (familySide[pid] !== familySide[prevId]) gap += groupGap / 2;
                    currentX += gap;
                }

                nodePositions[pid] = { x: currentX, y };
                person.x = this.snapToGrid(currentX + grid.ORIGIN_X, 'x');
                person.y = this.snapToGrid(y, 'y');

                globalMaxFamilyX = Math.max(globalMaxFamilyX, currentX);
            });
        });

        // 【Pass 2】未連線角色排列 (垂直對齊於核心家族右側)
        sortedGens.forEach((gen, genIndex) => {
            const genLevel = parseInt(gen);
            const allIds = byGeneration[gen];
            // 篩選出無任何關係的角色
            const unlinkedIds = allIds.filter(pid =>
                !this.relationships.some(r => r.fromPersonId === pid || r.toPersonId === pid)
            );

            if (unlinkedIds.length === 0) return;

            const y = baseY + genLevel * generationSpacing;
            // 起點設為全圖家族最右側 + 一個間隔
            let currentX = globalMaxFamilyX + personSpacing;

            unlinkedIds.forEach((pid, idx) => {
                const person = personMap[pid];
                if (!person) return;

                if (idx > 0) {
                    // 同一代內有多個未連線角色時，橫向排開
                    currentX += personSpacing;
                }

                nodePositions[pid] = { x: currentX, y };
                person.x = this.snapToGrid(currentX + grid.ORIGIN_X, 'x');
                person.y = this.snapToGrid(y, 'y');
            });
        });

        // 9. [Removed] 移除步驟 11 的強烈平移邏輯，改由上面的 anchorX 自動處理對齊。
        // 原本的 Step 11 會因為單個 household 的碰撞而平移整個 Generation，是造成畫面混亂的主因。

        this.autoSave();
        this.render();

        const genCount = sortedGens.length;
        const personCount = this.persons.length;
        const maxGen = Math.max(...Object.keys(byGeneration).map(g => parseInt(g)));
        this.updateStatus(`佈局完成：${personCount} 人，${genCount} 個輩份(最大代數: ${maxGen})。親子連結: ${familyRels.length}，婚姻連結: ${marriageRels.length} `, 'success');
    }

}

// 啟動應用程式
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GenogramApp();
});

