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
    static HORIZONTAL_SPACING = 100;
    static HORIZONTAL_START = 150;

    // 格子系統設定 (Grid System)
    static GRID = {
        CELL_WIDTH: 100,      // 水平格子寬度 (人物間距)
        CELL_HEIGHT: 120,     // 垂直格子高度 (輩分間距)
        MIN_DISTANCE: 50,     // 人物最小間距
        MAX_DISTANCE: 200,    // 人物最大間距 (2 格寬度)
        ORIGIN_X: 50,         // 格子起點 X (半格偏移，讓人物置中)
        ORIGIN_Y: 60          // 格子起點 Y (半格偏移)
    };
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
        this.pendingGeneration = null; // 等待選擇性別的輩分

        // 初始化模組
        this.history = new HistoryManager();
        this.storage = new StorageManager();
        this.canvas = null;

        // UI 元素
        this.elements = {};

        // 初始化
        this.init();
    }

    /**
     * 初始化應用程式
     */
    init() {
        this.cacheElements();
        this.canvas = new GenogramCanvas('genogramCanvas', 'canvasContainer');
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
            // 輩分按鈕
            addGrandparentBtn: document.getElementById('addGrandparent'),
            addParentBtn: document.getElementById('addParent'),
            addChildBtn: document.getElementById('addChild'),
            addGrandchildBtn: document.getElementById('addGrandchild'),

            // 工具按鈕
            selectToolBtn: document.getElementById('selectTool'),
            boxSelectToolBtn: document.getElementById('boxSelectTool'),
            connectToolBtn: document.getElementById('connectTool'),
            householdToolBtn: document.getElementById('householdTool'),
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
        // 輩分按鈕 - 點擊後顯示性別選擇對話框
        this.elements.addGrandparentBtn.addEventListener('click', () => this.showGenderModal('grandparent'));
        this.elements.addParentBtn.addEventListener('click', () => this.showGenderModal('parent'));
        this.elements.addChildBtn.addEventListener('click', () => this.showGenderModal('child'));
        this.elements.addGrandchildBtn.addEventListener('click', () => this.showGenderModal('grandchild'));

        // 工具列按鈕
        this.elements.selectToolBtn.addEventListener('click', () => this.setTool('select'));
        this.elements.boxSelectToolBtn.addEventListener('click', () => this.setTool('boxSelect'));
        this.elements.connectToolBtn.addEventListener('click', () => this.setTool('connect'));
        this.elements.householdToolBtn.addEventListener('click', () => this.setTool('household'));
        this.elements.deleteToolBtn.addEventListener('click', () => this.deleteSelected());
        this.elements.undoBtn.addEventListener('click', () => this.undo());
        this.elements.redoBtn.addEventListener('click', () => this.redo());
        this.elements.saveBtn.addEventListener('click', () => this.saveToFile());
        this.elements.downloadBtn.addEventListener('click', () => this.downloadFile());
        this.elements.loadBtn.addEventListener('click', () => this.handleLoadClick());
        this.elements.fileInput.addEventListener('change', (e) => this.loadFromFile(e));
        if (this.elements.exportBtn) {
            this.elements.exportBtn.addEventListener('click', () => this.exportPNG());
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

        // 畫布事件
        const canvas = this.canvas.canvas;
        canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
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
                this.createPersonWithGeneration(gender);
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
                if (this.selectedPersonIds.length > 0) {
                    // 如果已經有選定多個人物，直接建立
                    this.householdSelection = [...this.selectedPersonIds];
                    this.createHousehold();
                } else if (this.selectedPersonId) {
                    // 如果只選了一個人，也視為要建立同住框
                    this.householdSelection = [this.selectedPersonId];
                    this.createHousehold();
                } else {
                    statusText = '同住圈選：請直接在畫布上「拖曳滑鼠」圈選成員，放開後將自動建立';
                }
                break;
        }
        this.updateStatus(statusText);
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
            default:
                canvas.style.cursor = 'default';
        }
    }

    /**
     * 處理滑鼠按下
     */
    handleMouseDown(e) {
        const point = this.canvas.getMousePos(e);

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
                    // 讓他進入普通的拖曳邏輯 (會由 handleMouseMove 處理多選移動)
                    this.saveState(); // 拖曳開始前保存狀態
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

                this.saveState(); // 拖曳開始前保存狀態
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
                    this.updatePropertyPanel();
                    this.render();

                    this.canvas.isDragging = true;
                    this.canvas.dragStart = point;
                    this.canvas.draggedHousehold = clickedHousehold;
                    this.updateStatus('正在拖曳同住家庭 (放開滑鼠以完成)', 'info');
                    return;
                }
            }

            // 4. 點擊空白處 (或 Shift+點擊家庭內部)，開始拖曳畫布或範圍圈選
            if (e.shiftKey) {
                // Shift + 點擊空白處 -> 開始範圍圈選
                this.isBoxSelecting = true;
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
     * 處理滑鼠移動
     */
    handleMouseMove(e) {
        if (!this.canvas) return; // 確保 canvas 已初始化

        const point = this.canvas.getMousePos(e);

        if (this.isBoxSelecting) {
            this.boxSelectEnd = point;

            // 即時更新選取結果，這會讓人物在拖曳過程中就顯示綠色高亮 (Highlighted)
            if (typeof this.updateBoxSelection === 'function') {
                this.updateBoxSelection();
            }

            this.render();
            return;
        }

        if (this.canvas.isDragging) {
            let dx = point.x - this.canvas.dragStart.x;
            let dy = point.y - this.canvas.dragStart.y;

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
                const personalSpace = 60; // Increased from 40 to 60 for better spacing
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

                // [NEW] 鎖定輩份移動 (Lock Generation Movement)
                // 如果人物有設定 generation，禁止垂直移動，只能水平移動
                movingPersons.forEach(person => {
                    if (person.generation) {
                        // 對於此人物，強制 dy 為 0
                        // 注意：這裡是簡化處理，因為我們目前的架構是整體移動
                        // 如果 movingPersons 裡混雜了有輩份和沒輩份的 (不太可能)，
                        // 統一鎖定會比較安全
                        finalDy = 0;
                    }
                });

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
        }
    }

    /**
     * 處理滑鼠放開
     */
    handleMouseUp(e) {
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

                        // [NEW] 嚴格限制輩份 Y 座標
                        if (typeof p.generation === 'number') {
                            const grid = GenogramApp.GRID;
                            // 直接公式計算該輩分的 Y，確保絕對穩定
                            targetY = grid.ORIGIN_Y + p.generation * grid.CELL_HEIGHT;
                        }

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

                        // [NEW] 拖曳後強制執行局部規則
                        this.enforceLocalRules(p);
                    }
                });
                this.render(); // Snap 後重繪
            }

            this.canvas.isDragging = false;
            this.canvas.draggedPerson = null;
            this.canvas.draggedHousehold = null; // 清除家庭拖曳狀態
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
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
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
            case 'Delete':
            case 'Backspace':
                e.preventDefault();
                this.deleteSelected();
                break;
            case 'Escape':
                this.connectingFrom = null;
                this.closeGenderModal();
                this.setTool('select');
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
                if (this.canvas.isPointOnRelationship(x, y, fromPerson, toPerson, rel, 12)) {
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
        this.updateStatus(`選擇 ${level.label} 的性別`, 'info');
        this.elements.genderModal.classList.add('active');
    }

    /**
     * 關閉性別選擇對話框
     */
    closeGenderModal() {
        this.pendingGeneration = null;
        this.elements.genderModal.classList.remove('active');
        this.updateStatus('就緒');
    }

    /**
     * 使用輩分和性別建立人物 (自動計算座標)
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

        // 計算 Y 座標並對齊格子 (直接公式計算，不依賴舊的 GENERATION_LEVELS)
        const y = grid.ORIGIN_Y + genIndex * grid.CELL_HEIGHT;
        const generation = genIndex; // 儲存為數值

        // 計算該層現有人物数量，用於決定 X 座標
        // [Modified] 搜尋第一個可用的空位，而不是直接往後加
        let gridIndex = 0;
        let foundSpot = false;
        let finalX = 0;

        while (!foundSpot) {
            const testX = grid.ORIGIN_X + gridIndex * grid.CELL_WIDTH;
            // 檢查這個位置是否有人
            const isOccupied = this.persons.some(p =>
                Math.abs(p.y - y) < grid.CELL_HEIGHT * 0.5 &&
                Math.abs(p.x - testX) < grid.CELL_WIDTH * 0.5
            );

            if (!isOccupied) {
                finalX = testX;
                foundSpot = true;
            } else {
                gridIndex++;
            }
        }

        const x = this.snapToGrid(finalX, 'x');

        const person = new Person({
            x: x,
            y: y,
            gender: gender,
            generation: generation
        });

        this.persons.push(person);
        this.closeGenderModal();
        // 不自動選取新建立的人物，讓使用者可以繼續建立其他角色
        // 使用者若要編輯可以點擊該人物
        this.selectedPersonId = null;
        this.selectedPersonIds = [];
        this.autoSave();
        this.setTool('select');
        this.updatePropertyPanel();
        this.render();

        // 顯示提示訊息
        this.updateStatus(`已建立 ${GenogramApp.GENERATION_LEVELS[generation].label}，點擊人物可編輯`, 'success');
    }

    /**
     * 選取人物
     */
    selectPerson(id) {
        this.selectedPersonId = id;
        this.selectedRelationshipId = null;
        this.updatePropertyPanel();
        this.render();
    }

    /**
     * 選取關係線
     */
    selectRelationship(id) {
        this.selectedRelationshipId = id;
        this.selectedPersonId = null;
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

        // 檢查是否已存在相同的關係（防止重複）
        const existingRelationship = this.relationships.find(r =>
            (r.fromPersonId === fromId && r.toPersonId === toId) ||
            (r.fromPersonId === toId && r.toPersonId === fromId)
        );

        if (existingRelationship) {
            // 如果已存在關係，更新類型而非新增
            this.saveState();
            existingRelationship.type = type;
        } else {
            // 新增關係
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

        // 若是婚姻類關係，詢問是否要選擇共同子女
        const marriageTypes = ['married', 'engaged', 'cohabiting', 'separated', 'divorced', 'widowed'];
        if (marriageTypes.includes(type)) {
            // 暫存父母 ID
            this.pendingParents = [fromId, toId];
            // 找出可能的子女（Y 座標比父母高的人物）
            const parentsPerson = [
                this.persons.find(p => p.id === fromId),
                this.persons.find(p => p.id === toId)
            ];
            const parentsMaxY = Math.max(parentsPerson[0]?.y || 0, parentsPerson[1]?.y || 0);

            // 找出潛在子女：Y 座標比父母大（在畫布上更下方）且尚未與這對父母有親子關係
            const potentialChildren = this.persons.filter(p => {
                if (p.id === fromId || p.id === toId) return false;
                if (p.y <= parentsMaxY) return false;
                // 檢查是否已經有親子關係
                const alreadyChild = this.relationships.some(r =>
                    r.type === 'parent-child' &&
                    ((r.fromPersonId === fromId && r.toPersonId === p.id) ||
                        (r.fromPersonId === toId && r.toPersonId === p.id))
                );
                return !alreadyChild;
            });

            if (potentialChildren.length > 0) {
                this.showChildrenModal(potentialChildren);
            }
        }
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
        const marriageTypes = ['married', 'engaged', 'cohabiting', 'separated', 'divorced'];

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
            // 刪除關係後自動對齊
            if (typeof this.autoLayoutByGeneration === 'function') {
                this.autoLayoutByGeneration();
            }
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

            // 刪除相關的關係
            this.relationships = this.relationships.filter(
                r => !r.involvesPerson(this.selectedPersonId)
            );

            // 刪除人物
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
            this.selectedHouseholdId // 選中的家庭 ID
        );
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

        // 1. 檢查配偶 (Marriage)
        const marriageTypes = ['married', 'engaged', 'cohabiting', 'separated', 'divorced'];
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
     * 儲存到檔案
     */
    async saveToFile() {
        // 1. 永遠先執行一次自動儲存 (LocalStorage)，確保瀏覽器狀態最新
        this.autoSave();

        // 2. 嘗試直接寫入檔案 (如果瀏覽器支援且有連結)
        const result = await this.storage.saveToFile(this.persons, this.relationships, this.households || []);

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
        const success = await this.storage.downloadFile(this.persons, this.relationships, this.households || [], filename);
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
        const dataUrl = this.canvas.exportToPNG(this.persons, this.relationships, this.households || []);
        if (dataUrl) {
            const timestamp = new Date().toISOString().slice(0, 10);
            this.storage.exportPNG(dataUrl, `genogram_${timestamp}.png`);
        }
    }



    /**
     * 自動儲存
     */
    autoSave() {
        this.storage.autoSave(this.persons, this.relationships, this.households || [], {
            scale: this.scale,
            offsetX: this.offsetX,
            offsetY: this.offsetY
        });
    }

    /**
     * 載入自動儲存
     */
    loadAutoSave() {
        const saved = this.storage.loadAutoSave();
        if (saved) {
            this.persons = saved.persons;
            this.relationships = saved.relationships;
            this.households = saved.households || [];

            // 還原視圖狀態
            if (saved.view) {
                this.scale = saved.view.scale || 1;
                this.offsetX = saved.view.offsetX || 0;
                this.offsetY = saved.view.offsetY || 0;
                this.updateZoomDisplay();
            }

            // 延遲渲染，確保 canvas 尺寸已正確初始化
            requestAnimationFrame(() => {
                this.render();
            });

            const fileName = this.storage.getOpenFileName();
            if (fileName) {
                this.updateStatus(`已恢復上次工作階段: ${fileName}`, 'info');
            } else {
                this.updateStatus('已恢復上次工作階段', 'info');
            }
            // 讓恢復訊息停留長一點
            setTimeout(() => this.updateStatus(), 5000);
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
        const marriageTypes = ['married', 'engaged', 'cohabiting', 'separated', 'divorced', 'widowed', 'affair'];
        const marriageRels = this.relationships.filter(rel => marriageTypes.includes(rel.type));

        // 建立人物映射
        const personMap = {}; // personId -> person object
        this.persons.forEach(p => personMap[p.id] = p);

        // ===== 0.5 建立「案主側」vs「配偶側」的家族標記 =====
        const familySide = {}; // personId -> 'ip' | 'spouse' | 'neutral'
        this.persons.forEach(p => familySide[p.id] = 'neutral');

        if (identifiedPatient) {

            console.log('[DEBUG] ========== 開始家族分類 ==========');
            console.log('[DEBUG] 案主:', identifiedPatient.id, identifiedPatient.name);

            // 列出所有婚姻關係
            console.log('[DEBUG] 所有婚姻關係:');
            marriageRels.forEach(r => {
                const p1 = personMap[r.fromPersonId];
                const p2 = personMap[r.toPersonId];
                console.log(`  ${p1?.name || r.fromPersonId} <-> ${p2?.name || r.toPersonId} (type: ${r.type})`);
            });

            // 列出所有親子關係
            console.log('[DEBUG] 所有親子關係:');
            familyRels.forEach(r => {
                const p1 = personMap[r.fromPersonId];
                const p2 = personMap[r.toPersonId];
                console.log(`  ${p1?.name || r.fromPersonId} -> ${p2?.name || r.toPersonId} (type: ${r.type})`);
            });

            // ===== 輔助函數 =====

            // 找某人的所有配偶
            const getSpouses = (personId) => {
                const spouses = [];
                marriageRels.forEach(r => {
                    if (r.fromPersonId === personId) spouses.push(r.toPersonId);
                    else if (r.toPersonId === personId) spouses.push(r.fromPersonId);
                });
                return spouses;
            };

            // 找某人的父母
            const getParents = (personId) => {
                const parents = [];
                familyRels.forEach(r => {
                    if (r.toPersonId === personId) parents.push(r.fromPersonId);
                });
                return parents;
            };

            // 找某人的子女
            const getChildren = (personId) => {
                const children = [];
                familyRels.forEach(r => {
                    if (r.fromPersonId === personId) children.push(r.toPersonId);
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

        // 4. 計算每個人的輩份 (使用迭代約束求解器)
        const generation = {}; // personId -> generation number

        // 初始化：優先使用 p.generation，如果沒有則根據 Y 座標分群推算 (Smart Visual Inference)
        const initGrid = GenogramApp.GRID || { CELL_HEIGHT: 100, ORIGIN_Y: 100 };

        // 1. 收集並排序所有人的 Y 座標
        const yMap = this.persons.map(p => ({ id: p.id, y: p.y, gen: (typeof p.generation === 'number') ? p.generation : null }));

        // 如果大家都有明確 generation，直接用
        const allHaveGen = yMap.every(item => item.gen !== null);

        if (allHaveGen) {
            yMap.forEach(item => generation[item.id] = item.gen);
        } else {
            // 混合模式：對沒有 generation 的人進行 Y 軸分群
            // 簡單分群演算法：排序 Y，如果 Gap > CELL_HEIGHT * 0.5 則視為新的一行
            const sortedByY = [...yMap].sort((a, b) => a.y - b.y);
            let currentGen = 0;
            let lastY = sortedByY.length > 0 ? sortedByY[0].y : 0;
            const groups = {}; // id -> groupIndex

            sortedByY.forEach((item, index) => {
                if (index > 0) {
                    if (item.y - lastY > initGrid.CELL_HEIGHT * 0.5) {
                        currentGen++;
                    }
                }
                groups[item.id] = currentGen;
                lastY = item.y;
            });

            // 將分群結果映射回 generation
            this.persons.forEach(p => {
                if (typeof p.generation === 'number') {
                    generation[p.id] = p.generation;
                } else {
                    generation[p.id] = groups[p.id] || 0;
                }
            });
        }

        // 迭代優化 (Relaxation)
        let changed = true;
        let iterations = 0;
        const maxIterations = 100;

        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;

            // 規則 1: 子女輩份必須比父母大 (至少 +1)
            familyRels.forEach(rel => {
                const pGen = generation[rel.fromPersonId];
                const cGen = generation[rel.toPersonId];

                if (cGen <= pGen) {
                    generation[rel.toPersonId] = pGen + 1;
                    changed = true;
                }
            });

            // 規則 2: 配偶/伴侶必須在同一代
            marriageRels.forEach(rel => {
                const g1 = generation[rel.fromPersonId];
                const g2 = generation[rel.toPersonId];

                if (g1 !== g2) {
                    const maxGen = Math.max(g1, g2);
                    generation[rel.fromPersonId] = maxGen;
                    generation[rel.toPersonId] = maxGen;
                    changed = true;
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

            units.sort((a, b) => {
                // 優先序 1: 父母位置 (Alignment - 讓子女跟隨父母)
                // 這是最高優先級，確保樹狀結構垂直對齊
                if (a.parentCenter !== null && b.parentCenter !== null) {
                    if (Math.abs(a.parentCenter - b.parentCenter) > 1) {
                        return a.parentCenter - b.parentCenter;
                    }
                }

                // 優先序 2: 性別 (男左女右)
                // 提到 Component ID 之前，讓不同家族的男性也能排在一起 (滿足使用者 "男男男 女女女" 需求)
                const getUnitGenderScore = (unit) => {
                    const hasMale = unit.members.some(mid => personMap[mid]?.gender === 'male');
                    return hasMale ? -1 : 1;
                };
                const genA = getUnitGenderScore(a);
                const genB = getUnitGenderScore(b);
                if (genA !== genB) return genA - genB;

                // 優先序 3: 年齡與出生順序 (長輩在左)
                const getUnitMaxAge = (unit) => {
                    let maxAge = -1;
                    unit.members.forEach(mid => {
                        const p = personMap[mid];
                        if (p && typeof p.age === 'number') maxAge = Math.max(maxAge, p.age);
                    });
                    return maxAge;
                };
                const ageA = getUnitMaxAge(a);
                const ageB = getUnitMaxAge(b);

                if (ageA !== -1 && ageB !== -1) {
                    if (ageA !== ageB) return ageB - ageA;
                }
                if (ageA !== -1 && ageB === -1) return -1;
                if (ageA === -1 && ageB !== -1) return 1;

                // 優先序 4: Component ID (確保不同家族分開)
                // 降級：只有在以上條件都相同時，才用家族 ID 來分
                if (a.componentId !== b.componentId) return a.componentId - b.componentId;

                // 優先序 5: 家庭引力 (Household Gravity)
                if (a.householdBias !== b.householdBias) return a.householdBias - b.householdBias;

                // 優先序 6: 家庭 ID 分組
                const hIdA = a.householdId ? a.householdId.toString() : '';
                const hIdB = b.householdId ? b.householdId.toString() : '';
                if (hIdA !== hIdB) {
                    if (hIdA && hIdB) return hIdA.localeCompare(hIdB);
                    if (hIdA) return -1;
                    if (hIdB) return 1;
                }

                // 優先序 7: 外部連結 (Edge Bias)
                return a.edgeBias - b.edgeBias;
            });

            // 5. 展開單位並處理內部排序
            units.forEach(unit => {
                if (unit.type === 'household') {
                    const members = [...unit.members];

                    members.sort((a, b) => {
                        // 家庭內部：先按 familySide，再按 age (長左幼右)，最後按 gender (男左女右)
                        const sideA = familySide[a];
                        const sideB = familySide[b];
                        const sideOrder = { 'spouse': -1, 'neutral': 0, 'ip': 1 };

                        if (sideOrder[sideA] !== sideOrder[sideB]) {
                            return sideOrder[sideA] - sideOrder[sideB];
                        }

                        // [NEW] 年齡排序 (Older Left)
                        const pA = personMap[a];
                        const pB = personMap[b];
                        const ageA = (pA && typeof pA.age === 'number') ? pA.age : -1;
                        const ageB = (pB && typeof pB.age === 'number') ? pB.age : -1;

                        // 兩者都有年齡才比，年紀大在左
                        if (ageA !== -1 && ageB !== -1 && ageA !== ageB) {
                            return ageB - ageA;
                        }

                        // [NEW] 性別排序 (Male Left)
                        const genA = pA?.gender === 'female' ? 1 : -1;
                        const genB = pB?.gender === 'female' ? 1 : -1;
                        if (genA !== genB) return genA - genB;

                        const biasA = getEdgeBias(a);
                        const biasB = getEdgeBias(b);
                        if (biasA !== biasB) return biasA - biasB;

                        const scoreA = getPersonParentScore(a);
                        const scoreB = getPersonParentScore(b);
                        return scoreA - scoreB;
                    });

                    const houseSorted = [];
                    const houseUsed = new Set();

                    members.forEach(m => {
                        if (houseUsed.has(m)) return;
                        houseSorted.push(m);
                        houseUsed.add(m);

                        const spouseRel = genMarriageRels.find(r =>
                            (r.fromPersonId === m && members.includes(r.toPersonId) && !houseUsed.has(r.toPersonId)) ||
                            (r.toPersonId === m && members.includes(r.fromPersonId) && !houseUsed.has(r.fromPersonId))
                        );

                        if (spouseRel) {
                            const spouseId = spouseRel.fromPersonId === m ? spouseRel.toPersonId : spouseRel.fromPersonId;
                            const biasM = getEdgeBias(m);
                            if (biasM > 0) {
                                houseSorted.pop();
                                houseSorted.push(spouseId);
                                houseSorted.push(m);
                            } else {
                                houseSorted.push(spouseId);
                            }
                            houseUsed.add(spouseId);
                        }
                    });

                    sortedIds.push(...houseSorted);

                } else if (unit.type === 'couple') {
                    const p1 = unit.members[0];
                    const p2 = unit.members[1];
                    const person1 = personMap[p1];
                    const person2 = personMap[p2];

                    // 配偶對內部排序：
                    // 1. 家族側別 priority (Family Side)
                    const side1 = familySide[p1];
                    const side2 = familySide[p2];
                    const sideOrder = { 'spouse': -1, 'neutral': 0, 'ip': 1 };

                    if (sideOrder[side1] !== sideOrder[side2]) {
                        if (sideOrder[side1] < sideOrder[side2]) {
                            sortedIds.push(p1, p2);
                        } else {
                            sortedIds.push(p2, p1);
                        }
                    } else {
                        // 2. [NEW] 性別排序 (男左女右 - Traditional Genogram Rule)
                        // Male (left) - Female (right)
                        const isMale1 = person1 && person1.gender === 'male';
                        const isMale2 = person2 && person2.gender === 'male';
                        const isFemale1 = person1 && person1.gender === 'female';
                        const isFemale2 = person2 && person2.gender === 'female';

                        if (isMale1 && !isMale2) {
                            sortedIds.push(p1, p2);
                        } else if (!isMale1 && isMale2) {
                            sortedIds.push(p2, p1);
                        }
                        // If same gender or mixed with others, check Age
                        else {
                            // 3. [NEW] 年齡排序 (Older Left)
                            const age1 = (person1 && typeof person1.age === 'number') ? person1.age : -1;
                            const age2 = (person2 && typeof person2.age === 'number') ? person2.age : -1;

                            if (age1 !== age2 && age1 !== -1 && age2 !== -1) {
                                if (age1 > age2) sortedIds.push(p1, p2);
                                else sortedIds.push(p2, p1);
                            } else {
                                // 4. Fallback to Edge Bias
                                const bias1 = getEdgeBias(p1);
                                const bias2 = getEdgeBias(p2);
                                if (bias1 > bias2) {
                                    sortedIds.push(p2, p1);
                                } else {
                                    sortedIds.push(p1, p2);
                                }
                            }
                        }
                    }
                } else {
                    sortedIds.push(...unit.members);
                }
            });

            byGeneration[genStr] = sortedIds;
        });

        // 7. 計算佈局參數 (使用格子系統)
        const grid = GenogramApp.GRID;
        const baseY = grid.ORIGIN_Y;
        const generationSpacing = grid.CELL_HEIGHT;
        const personSpacing = grid.CELL_WIDTH;
        const householdMargin = 30; // Reduced from 100 to 30
        const personSize = 50;
        const nameHeight = 20;
        const householdPadding = 25; // 恢復較寬大的邊距，避免太擠

        const canvasContainer = this.elements.canvasContainer;
        const canvasWidth = canvasContainer ? canvasContainer.clientWidth : 1200;
        const centerX = canvasWidth / 2;

        // 7.5 預先計算家庭寬度
        const householdStats = {};
        if (this.households) {
            this.households.forEach(h => {
                householdStats[h.id] = { maxGenWidth: 0, genWidths: {} };

                sortedGens.forEach(gen => {
                    const personIds = byGeneration[gen];
                    const members = personIds.filter(pid => h.ids.some(hid => hid.toString() === pid.toString()));
                    if (members.length > 0) {
                        const width = members.length * personSpacing;
                        householdStats[h.id].genWidths[gen] = width;
                        if (width > householdStats[h.id].maxGenWidth) {
                            householdStats[h.id].maxGenWidth = width;
                        }
                    } else {
                        householdStats[h.id].genWidths[gen] = 0;
                    }
                });
            });
        }

        // 8. 垂直對齊排列
        const generationLayouts = {};
        const nodePositions = {};
        const genBounds = {};

        sortedGens.forEach((gen, genIndex) => {
            const personIds = byGeneration[gen];
            const y = baseY + genIndex * generationSpacing;

            const currentGenPositions = [];
            let prevRight = -Infinity;

            personIds.forEach((pid, idx) => {
                const person = personMap[pid];
                let idealX = null;

                // 策略 A: 根據父母位置
                const parents = [];
                familyRels.forEach(r => {
                    if (r.toPersonId === pid) {
                        if (generation[r.fromPersonId] < gen) {
                            parents.push(r.fromPersonId);
                        }
                    }
                });

                if (parents.length > 0) {
                    const parentXs = parents.map(ptid => nodePositions[ptid] ? nodePositions[ptid].x : null).filter(x => x !== null);
                    if (parentXs.length > 0) {
                        idealX = parentXs.reduce((a, b) => a + b, 0) / parentXs.length;
                    }
                }

                // 策略 B: 根據配偶位置
                if (idealX === null) {
                    const spouseRel = marriageRels.find(r =>
                        (r.fromPersonId === pid || r.toPersonId === pid) &&
                        personIds.includes(r.fromPersonId === pid ? r.toPersonId : r.fromPersonId)
                    );
                    if (spouseRel) {
                        const spouseId = spouseRel.fromPersonId === pid ? spouseRel.toPersonId : spouseRel.fromPersonId;
                        const spousePos = currentGenPositions.find(p => p.id === spouseId);
                        if (spousePos) {
                            idealX = spousePos.x + personSpacing;
                        }
                    }
                }

                // 計算間距
                let gap = personSpacing;

                let currHouseholdId = null;
                const h = this.households ? this.households.find(h => h.ids.some(hid => hid.toString() === pid.toString())) : null;
                if (h) currHouseholdId = h.id;

                let prevHouseholdId = null;
                if (idx > 0) {
                    const prevPid = personIds[idx - 1];
                    const prevH = this.households ? this.households.find(h => h.ids.some(hid => hid.toString() === prevPid.toString())) : null;
                    if (prevH) prevHouseholdId = prevH.id;

                    // Component 分離 (恢復中度間距，避免情感線過短)
                    if (componentMap[pid] !== componentMap[prevPid]) {
                        gap += 40; // Reduced from 100 to 40
                    }

                    // ===== 新增：Family Side 分離 (恢復中度間距) =====
                    if (familySide[pid] !== familySide[prevPid]) {
                        gap += 30; // Reduced from 80 to 30
                    }
                }

                if (idx > 0 && currHouseholdId !== prevHouseholdId) {
                    gap += householdMargin;

                    if (prevHouseholdId) {
                        const stats = householdStats[prevHouseholdId];
                        if (stats && stats.maxGenWidth > (stats.genWidths[gen] || 0)) {
                            gap += (stats.maxGenWidth - (stats.genWidths[gen] || 0)) / 2;
                        }
                    }
                    if (currHouseholdId) {
                        const stats = householdStats[currHouseholdId];
                        if (stats && stats.maxGenWidth > (stats.genWidths[gen] || 0)) {
                            gap += (stats.maxGenWidth - (stats.genWidths[gen] || 0)) / 2;
                        }
                    }
                }

                // 決定最終 X
                let x;

                if (idx === 0) {
                    // [Modified] 強制左對齊：每代的第一個人都從 0 開始
                    // 這是為了滿足使用者「上下陣列 [0] 對齊」的需求
                    x = 0;
                } else {
                    const minX = prevRight + gap;
                    const isSameHousehold = currHouseholdId !== null && currHouseholdId === prevHouseholdId;

                    if (isSameHousehold) {
                        x = minX;
                    } else if (idealX !== null) {
                        x = Math.max(minX, idealX);
                    } else {
                        x = minX;
                    }
                }

                nodePositions[pid] = { x, y, width: personSize };
                currentGenPositions.push({ id: pid, x, y });
                prevRight = x;
            });

            // 8.2 [Disabled] 該代置中校正 - 改為維持左對齊
            // if (genIndex === 0 && currentGenPositions.length > 0) { ... }

            personIds.forEach(pid => {
                if (personMap[pid]) {
                    // 直接套用計算出的 x (已相對 0 對齊)，並加上 Grid Origin
                    personMap[pid].x = this.snapToGrid(nodePositions[pid].x + grid.ORIGIN_X, 'x');
                    personMap[pid].y = this.snapToGrid(y, 'y');
                }
            });
        });

        // ===== 8.3 [Disabled] 以案主為中心重新置中 =====
        // (已移除以滿足左對齊需求)

        // 9. 重建 generationLayouts 結構
        sortedGens.forEach((gen, index) => {
            const personIds = byGeneration[gen];
            const y = baseY + index * generationSpacing;

            if (personIds.length === 0) return;

            const xs = personIds.map(pid => personMap[pid].x);
            const minX = Math.min(...xs) - personSize / 2 - 10;
            const maxX = Math.max(...xs) + personSize / 2 + 10;
            const minY = y - personSize / 2 - 20;
            const maxY = y + personSize / 2 + 20;

            const startX = minX;
            const personPositions = personIds.map(pid => personMap[pid].x - startX);

            generationLayouts[gen] = {
                y, startX, personPositions, personIds,
                bounds: {
                    minX, maxX, minY, maxY,
                    width: maxX - minX,
                    height: maxY - minY,
                    centerX: (minX + maxX) / 2,
                    centerY: (minY + maxY) / 2
                }
            };
        });

        // 10. 計算圈選框邊界
        const householdBounds = [];
        if (this.households && this.households.length > 0) {
            this.households.forEach(household => {
                const memberPersons = household.ids
                    .map(id => personMap[id])
                    .filter(p => p !== undefined);

                if (memberPersons.length > 0) {
                    const xs = memberPersons.map(p => p.x);
                    const ys = memberPersons.map(p => p.y);

                    const minX = Math.min(...xs) - personSize / 2 - householdPadding;
                    const maxX = Math.max(...xs) + personSize / 2 + householdPadding;
                    const minY = Math.min(...ys) - personSize / 2 - nameHeight - householdPadding;
                    const maxY = Math.max(...ys) + personSize / 2 + householdPadding;

                    householdBounds.push({
                        minX, maxX, minY, maxY,
                        width: maxX - minX,
                        height: maxY - minY,
                        centerX: (minX + maxX) / 2,
                        centerY: (minY + maxY) / 2,
                        memberIds: household.ids
                    });
                }
            });
        }

        // 11. 檢查並調整位置以避免與圈選框重疊
        sortedGens.forEach(gen => {
            const layout = generationLayouts[gen];
            if (!layout) return;

            const genBoundsLocal = layout.bounds;

            let adjustedY = layout.y;
            let adjustedStartX = layout.startX;
            let needsAdjustment = false;

            householdBounds.forEach(hb => {
                const verticalOverlap = !(genBoundsLocal.maxY < hb.minY - householdMargin ||
                    genBoundsLocal.minY > hb.maxY + householdMargin);

                const horizontalOverlap = !(genBoundsLocal.maxX < hb.minX - householdMargin ||
                    genBoundsLocal.minX > hb.maxX + householdMargin);

                if (verticalOverlap && horizontalOverlap) {
                    if (hb.memberIds && hb.memberIds.some(id => layout.personIds.includes(id))) {
                        return;
                    }

                    needsAdjustment = true;

                    const newY = hb.maxY + householdMargin + genBoundsLocal.height / 2;
                    if (newY > adjustedY) {
                        adjustedY = newY;
                    }

                    if (Math.abs(genBoundsLocal.centerX - hb.centerX) < (genBoundsLocal.width + hb.width) / 2 + householdMargin) {
                        if (genBoundsLocal.centerX < hb.centerX) {
                            adjustedStartX = hb.minX - householdMargin - genBoundsLocal.width / 2;
                        } else {
                            adjustedStartX = hb.maxX + householdMargin + genBoundsLocal.width / 2;
                        }
                    }
                }
            });

            if (needsAdjustment) {
                layout.personIds.forEach((personId, index) => {
                    const person = personMap[personId];
                    if (person) {
                        person.x = adjustedStartX + index * personSpacing;
                        person.y = adjustedY;
                    }
                });
            }
        });

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
