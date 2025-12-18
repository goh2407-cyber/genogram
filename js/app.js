/**
 * GenogramApp - 主應用程式
 */
class GenogramApp {
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

        // 根據使用者要求，啟動時不再自動載入 JSON，改為引導使用者手動連結
        // this.loadAutoSave(); 

        this.updateStatus('就緒');
        this.updateToolbar();
    }

    /**
     * 快取 DOM 元素
     */
    cacheElements() {
        this.elements = {
            // 工具按鈕
            addMaleBtn: document.getElementById('addMale'),
            addFemaleBtn: document.getElementById('addFemale'),
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
            relationshipModal: document.getElementById('relationshipModal'),
            cancelRelationship: document.getElementById('cancelRelationship'),
            helpModal: document.getElementById('helpModal'),
            helpBtn: document.getElementById('helpBtn'),
            closeHelpBtn: document.getElementById('closeHelp'),
            fileInput: document.getElementById('fileInput'),

            // 圖例面板
            legendPanel: document.getElementById('legendPanel')
        };
    }

    /**
     * 設定事件監聽器
     */
    setupEventListeners() {
        // 工具列按鈕
        this.elements.addMaleBtn.addEventListener('click', () => this.setTool('addMale'));
        this.elements.addFemaleBtn.addEventListener('click', () => this.setTool('addFemale'));
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
            case 'addMale':
                statusText = '新增男性：點擊畫布放置';
                break;
            case 'addFemale':
                statusText = '新增女性：點擊畫布放置';
                break;
            case 'connect':
                statusText = '連接工具：依序點擊兩個人物建立關係';
                this.connectingFrom = null;
                break;
            case 'household':
                if (this.selectedPersonIds.length > 0) {
                    // 如果已經有多選人物，直接建立
                    this.householdSelection = [...this.selectedPersonIds];
                    this.createHousehold();
                    statusText = '已建立同住圈選';
                } else {
                    statusText = '同住圈選：請先使用「範圍圈選」選取多個人物，或切換至選取工具按 Shift 多選，再點擊此按鈕';
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
            case 'addMale':
                this.elements.addMaleBtn.classList.add('active');
                break;
            case 'addFemale':
                this.elements.addFemaleBtn.classList.add('active');
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
            case 'addMale':
            case 'addFemale':
                canvas.style.cursor = 'copy';
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

        if (this.currentTool === 'addMale') {
            this.addPerson(point.x, point.y, 'male');
            return;
        }

        if (this.currentTool === 'addFemale') {
            this.addPerson(point.x, point.y, 'female');
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
                // 普通點擊空白處 -> 拖曳畫布 (Pan)
                this.selectedPersonId = null;
                this.selectedPersonIds = [];
                this.selectedRelationshipId = null;
                this.selectedHouseholdId = null;
                this.updatePropertyPanel();
                this.canvas.isPanning = true;
                this.canvas.panStart = { x: e.clientX, y: e.clientY };
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
            this.render();
            return;
        }

        if (this.canvas.isDragging) {
            const dx = point.x - this.canvas.dragStart.x;
            const dy = point.y - this.canvas.dragStart.y;

            if (this.canvas.draggedPerson) {
                // 拖曳單人或多選群組
                if (this.selectedPersonIds.includes(this.canvas.draggedPerson.id)) {
                    // 如果拖曳的人物在多選列表中，則移動所有選中的人
                    this.selectedPersonIds.forEach(id => {
                        const person = this.persons.find(p => p.id === id);
                        if (person) {
                            person.x += dx;
                            person.y += dy;
                        }
                    });
                } else {
                    // 只移動當前拖曳的人 (原本邏輯)
                    this.canvas.draggedPerson.x += dx;
                    this.canvas.draggedPerson.y += dy;
                }
            } else if (this.canvas.draggedHousehold) {
                // 拖曳整戶 (新增功能)
                const household = this.canvas.draggedHousehold;
                // 移動家庭內的所有成員
                household.ids.forEach(pid => {
                    const person = this.persons.find(p => p.id === pid);
                    if (person) {
                        person.x += dx;
                        person.y += dy;
                    }
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
            this.render();
        }

        if (this.canvas.isDragging) {
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

        // 如果選了人，自動切換回選取工具
        this.setTool('select');
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
        switch (e.key.toLowerCase()) {
            case 'v':
                this.setTool('select');
                break;
            case 'm':
                this.setTool('addMale');
                break;
            case 'f':
                this.setTool('addFemale');
                break;
            case 'c':
                this.setTool('connect');
                break;
            case 'b':
                this.setTool('boxSelect');
                break;
            case 'h':
                this.setTool('household');
                break;
            case 'delete':
            case 'backspace':
                e.preventDefault();
                this.deleteSelected();
                break;
            case 'escape':
                this.connectingFrom = null;
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
            if (this.canvas.isPointOnHouseholdBoundary(x, y, household, this.persons, 15)) {
                return household;
            }
        }
        return null;
    }

    /**
     * 新增人物
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

        const newHousehold = {
            id: 'house_' + Date.now(),
            ids: [...this.householdSelection],
            notes: ''
        };

        this.households.push(newHousehold);
        // 清空選取並切回選取工具
        this.householdSelection = [];
        this.setTool('select');
        this.updateStatus('同住圈選已建立', 'success');
        this.saveState();
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

        this.closeRelationshipModal();
        this.autoSave();
        this.render();
    }

    /**
     * 刪除選取的項目
     */
    deleteSelected() {
        if (this.selectedHouseholdId) {
            this.saveState();
            this.households = this.households.filter(h => h.id !== this.selectedHouseholdId);
            this.selectedHouseholdId = null;
            this.updatePropertyPanel();
            this.autoSave();
            this.render();
        } else if (this.selectedRelationshipId) {
            this.saveState();
            this.relationships = this.relationships.filter(r => r.id !== this.selectedRelationshipId);
            this.selectedRelationshipId = null;
            this.updatePropertyPanel();
            this.autoSave();
            this.render();
        } else if (this.selectedPersonIds.length > 0) {
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
            this.isBoxSelecting ? this.boxSelectEnd : null // 選擇框結束點
        );

        if (this.canvas.drawHouseholds && this.households) {
            this.canvas.drawHouseholds(this.households, this.persons, true, this.selectedHouseholdId);
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

            this.render();

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
        const familyRels = this.relationships.filter(rel => {
            const category = typeof rel.getCategory === 'function' ? rel.getCategory() :
                Relationship.getCategory(rel.type);
            return category === 'family';
        });

        if (familyRels.length === 0 && this.relationships.length > 0) {
            this.updateStatus('警告：未偵測到「親子關係」，無法自動分代。請先建立親子連結。', 'error');
        }

        // 2. 找出所有婚姻關係（配偶會被放在同一代）
        const marriageRels = this.relationships.filter(rel => {
            const category = typeof rel.getCategory === 'function' ? rel.getCategory() :
                Relationship.getCategory(rel.type);
            return category === 'marriage';
        });

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

        // 初始化：所有人預設為第 0 代
        this.persons.forEach(p => generation[p.id] = 0);

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
        const byGeneration = {}; // generation -> [personId, ...]
        this.persons.forEach(p => {
            const gen = generation[p.id] || 0;
            if (!byGeneration[gen]) byGeneration[gen] = [];
            byGeneration[gen].push(p.id);
        });

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

            // ===== 4. 統一單位排序 (加入 Family Side 作為最高優先) =====
            units.sort((a, b) => {
                // ===== 優先序 0: 家族側別 (Family Side) =====
                // spouse 側在左 (-1), neutral 在中 (0), ip 側在右 (1)
                const getSideOrder = (unit) => {
                    // 對於多人單位，取多數決
                    const sideCounts = { 'spouse': 0, 'neutral': 0, 'ip': 0 };
                    unit.members.forEach(m => {
                        sideCounts[familySide[m]]++;
                    });

                    if (sideCounts['spouse'] > sideCounts['ip']) return -1;
                    if (sideCounts['ip'] > sideCounts['spouse']) return 1;
                    return 0;
                };

                const sideA = getSideOrder(a);
                const sideB = getSideOrder(b);
                if (sideA !== sideB) return sideA - sideB;

                // 優先序 1: Component ID
                if (a.componentId !== b.componentId) return a.componentId - b.componentId;

                // 優先序 2: 親子分數 (Parent Score)
                const scoreDiff = a.score - b.score;
                if (Math.abs(scoreDiff) > 0.5) return scoreDiff;

                // 優先序 3: 家庭引力 (Household Gravity)
                if (a.householdBias !== b.householdBias) return a.householdBias - b.householdBias;

                // 優先序 4: 家庭 ID 分組
                const hIdA = a.householdId ? a.householdId.toString() : '';
                const hIdB = b.householdId ? b.householdId.toString() : '';
                if (hIdA !== hIdB) {
                    if (hIdA && hIdB) return hIdA.localeCompare(hIdB);
                    if (hIdA) return -1;
                    if (hIdB) return 1;
                }

                // 優先序 5: 外部連結 (Edge Bias)
                return a.edgeBias - b.edgeBias;
            });

            // 5. 展開單位並處理內部排序
            units.forEach(unit => {
                if (unit.type === 'household') {
                    const members = [...unit.members];

                    members.sort((a, b) => {
                        // 家庭內部：先按 familySide，再按 edgeBias
                        const sideA = familySide[a];
                        const sideB = familySide[b];
                        const sideOrder = { 'spouse': -1, 'neutral': 0, 'ip': 1 };

                        if (sideOrder[sideA] !== sideOrder[sideB]) {
                            return sideOrder[sideA] - sideOrder[sideB];
                        }

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

                    // 配偶對內部排序：spouse 側在左，ip 側在右
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
                        // 同側則用 Edge Bias
                        const bias1 = getEdgeBias(p1);
                        const bias2 = getEdgeBias(p2);
                        if (bias1 > bias2) {
                            sortedIds.push(p2, p1);
                        } else {
                            sortedIds.push(p1, p2);
                        }
                    }
                } else {
                    sortedIds.push(...unit.members);
                }
            });

            byGeneration[genStr] = sortedIds;
        });

        // 7. 計算佈局參數
        const baseY = 150;
        const generationSpacing = 200;
        const personSpacing = 180;
        const householdMargin = 100;
        const personSize = 50;
        const nameHeight = 20;
        const householdPadding = 40;

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

                    // Component 分離
                    if (componentMap[pid] !== componentMap[prevPid]) {
                        gap += 200;
                    }

                    // ===== 新增：Family Side 分離 =====
                    if (familySide[pid] !== familySide[prevPid]) {
                        gap += 150; // 不同家族側之間增加間距
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
                    x = idealX !== null ? idealX : 0;
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

            // 8.2 該代置中校正 (Gen 0)
            if (genIndex === 0 && currentGenPositions.length > 0) {
                const minP = currentGenPositions[0].x;
                const maxP = currentGenPositions[currentGenPositions.length - 1].x;
                const currentCenter = (minP + maxP) / 2;
                const offset = centerX - currentCenter;

                personIds.forEach(pid => {
                    nodePositions[pid].x += offset;
                    if (personMap[pid]) {
                        personMap[pid].x = nodePositions[pid].x;
                        personMap[pid].y = y;
                    }
                });
            } else {
                personIds.forEach(pid => {
                    if (personMap[pid]) {
                        personMap[pid].x = nodePositions[pid].x;
                        personMap[pid].y = y;
                    }
                });
            }
        });

        // ===== 8.3 以案主為中心重新置中 =====
        if (identifiedPatient && nodePositions[identifiedPatient.id]) {
            const ipX = nodePositions[identifiedPatient.id].x;
            const offset = centerX - ipX;

            // 將所有人物整體平移，使案主位於畫布中央
            this.persons.forEach(p => {
                if (nodePositions[p.id]) {
                    nodePositions[p.id].x += offset;
                    p.x = nodePositions[p.id].x;
                }
            });

            console.log(`[AutoLayout] Centered on IP: offset = ${offset}`);
        }

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
        this.updateStatus(`佈局完成：${personCount} 人，${genCount} 個輩份 (最大代數: ${maxGen})。親子連結: ${familyRels.length}，婚姻連結: ${marriageRels.length}`, 'success');
    }

}

// 啟動應用程式
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GenogramApp();
});
