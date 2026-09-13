/**
 * GenogramApp - 主應用程式
 */
// [3-4 拆檔] PROPERTY_PANEL_TEMPLATES 已移至 js/ui/property-panel-templates.js（需先於本檔載入）


class GenogramApp {
    static STATUS_TIMEOUTS = Object.freeze({
        passive: 3500,
        passiveAlert: 6000
    });

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
        CELL_WIDTH: 120,      // 水平格子寬度 (人物間距) - 調回較緊湊的 120
        CELL_HEIGHT: 120,     // 垂直格子高度 (輩分間距) - 調回較緊湊的 120
        MIN_DISTANCE: 50,     // 人物最小間距
        MAX_DISTANCE: 120,    // 人物最大間距 (1 格寬度)
        ORIGIN_X: 50,         // 格子起點 X (半格偏移，讓人物置中)
        ORIGIN_Y: 60          // 格子起點 Y (半格偏移)
    };

    // 生活圈色票（半透明填色；屬性面板色票與 getNextLifeCircleColor 共用）
    static LIFE_CIRCLE_COLORS = [
        'rgba(74, 144, 226, 0.15)',   // 藍色
        'rgba(80, 200, 120, 0.15)',   // 綠色
        'rgba(255, 165, 0, 0.15)',    // 橙色
        'rgba(148, 103, 189, 0.15)',  // 紫色
        'rgba(255, 99, 132, 0.15)',   // 粉紅
        'rgba(75, 192, 192, 0.15)'    // 青色
    ];

    // [Bug Fix] 統一婚姻類型清單，避免多處重複定義
    static MARRIAGE_TYPES = [
        'married', 'engaged', 'cohabiting', 'legal-cohabiting',
        'separated', 'legal-separated', 'divorced', 'widowed', 'affair',
        'engaged-separated', 'engaged-cohabiting'
    ];
    // 縮放級距：瀏覽器式固定階梯，涵蓋 canvas.minScale(0.25) ~ maxScale(3)，必含 1
    static ZOOM_STEPS = Object.freeze([0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]);
    static LABEL_NUDGE_DISTANCE = 12;
    static LABEL_NUDGE_DIRECTIONS = Object.freeze({
        upLeft: [-1, -1], up: [0, -1], upRight: [1, -1],
        left: [-1, 0], right: [1, 0],
        downLeft: [-1, 1], down: [0, 1], downRight: [1, 1]
    });
    // 搖桿：視覺偏移上限（超出後文字仍 1:1 跟著指標），與點擊/拖曳判定門檻
    static LABEL_JOYSTICK_MAX_DEFLECTION = 22;
    static LABEL_JOYSTICK_DRAG_SLOP = 3;
    static LABEL_JOYSTICK_KEYS = Object.freeze({
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right'
    });
    // 面板與文字之間的距離：需大於單步 12px，文字往面板方向移動時才不會立刻被壓住
    static LABEL_POPOVER_GAP = 32;
    constructor() {
        // 資料
        this.persons = [];
        this.relationships = [];
        this.households = []; // [{ids: ['id1', 'id2'], notes: ''}]

        // [Sprint 2 Phase A] personMap 主索引：所有 O(n) 的 persons.find 改查表
        // 維護規則見 refactor/PERSONMAP_INDEX_DESIGN.md §3
        this.personMap = new Map();
        // [Phase 0a] 結構版本號：persons/relationships 的「結構」變動（增刪/改型別/改端點）時 +1，
        // 位置變動不算。供 getKinshipEngine / getRelationshipSplit 以 O(1) 判斷快取是否仍有效。
        this._dataVersion = 0;

        // 狀態
        this.currentTool = 'select'; // select, addMale, addFemale, connect, boxSelect, household
        this.selectedPersonId = null;
        this.labelEditingPersonId = null; // 純 UI 暫態：直接點姓名／備註時隱藏人物快速功能圈
        this.labelJoystickDragging = false; // 純 UI 暫態：文字拉桿拖曳中，期間不隱藏面板
        this.labelPopoverPlacement = null; // 純 UI 暫態：使用者手動拖走的拉桿面板位置
        this.selectedRelationshipId = null;
        this.editingRelationshipId = null; // 正在編輯的關係線 ID (用於修改關係類型)
        this.selectedHouseholdId = null; // 選中的圈選框 ID
        this.connectingFrom = null; // 用於建立關係的第一個人物
        this.connectingTo = null;
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.currentInspectorTab = 'properties';
        this.inspectorUserOverride = false;
        this.inspectorDesktopCollapsed = false;
        this.inspectorCompact = false;
        this.inspectorOverlayOpen = false;
        this.pendingFitFrame = null;
        this._renderRaf = null; // [B1-perf] requestRender 合併用
        this.viewOptions = {
            showNames: true,
            showAges: true,
            showNotes: true,
            showMedical: true,
            showEmotionalRelationships: true,
            showHouseholds: true,
            showLifeCircles: true
        };

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
        this.lcVertexDrag = null;           // [LC-1] 拖曳中的生活圈頂點 {lc, index}
        this.liftDrag = null;               // [R-1] 拖曳中的婚姻線橫桿 {rel, startLift, startY, dir}
        this.lcPress = null;                // [LC-2] 生活圈工具按下未放開 {start, moved}
        this.ellipsePreview = null;         // [LC-2] 拖拉橢圓預覽 {start, current}
        // [3-2] 觸控：手指追蹤（pointerId → client 座標）、雙指縮放狀態、放開一指後忽略剩餘手指直到全部放開
        this.touchPointers = new Map();
        this.pinch = null;
        this.touchIgnoreUntilEmpty = false;

        this.pendingGeneration = null; // 等待選擇性別的輩分
        this.hoveredPersonId = null; // 滑鼠 hover 的角色 ID
        this.quickAddContext = null; // 快速新增的上下文 {personId, type}
        this.placementSession = null; // 智慧格位純狀態；後續任務才接畫面與互動
        // [1-2] 文件狀態：isDirty = 有變更尚未寫入檔案（另存 / Ctrl+S 寫回檔案後清除）
        this.isDirty = false;
        // [2-1] 年齡基準日（'YYYY-MM-DD' 或 null = 今天）。session-only，不進 JSON / history。
        this.ageReferenceDate = null;
        // [2-2] 文件 meta（標題 / 案號 / 繪製者）：屬於這份個案，存進 JSON（只在有值時）；匯出頁首用
        this.documentMeta = GenogramApp.normalizeDocumentMeta(null);

        // [Bug Fix] 初始化缺失的屬性，避免 undefined 錯誤
        this.boxSelectInitialPoint = null; // 圈選初始點（用於位移閾值判斷）
        this.pendingParents = null; // 子女選擇對話框的父母 ID 列表
        this.selectedChildrenIds = []; // 子女選擇對話框的選中子女 ID 列表

        // 拖曳 History 合併：記錄拖曳開始時的狀態快照
        this.dragStartSnapshot = null;

        // 屬性編輯 History 合併：一個 focus→blur 生命週期只保留一份變更前快照
        this.propertyEditSession = null;
        this.isSavingState = false;

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
        this.statusHideTimer = null;
        this.lastAutoSaveTime = 0;

        // [NEW - G 方案] 自動排列預覽狀態
        this.isPreviewingLayout = false;
        this.previewedPositions = null; // { personId: {x, y}, ... }
        this.previewedLifeCircles = null; // 生活圈預覽座標
        this.originalBeforePreview = null; // 預覽前的原始位置（用於取消）

        // 初始化
        this.init();
    }

    /**
     * 初始化應用程式
     */
    init() {
        this.cacheElements();
        this.modalManager = new ModalManager({ transitionMs: 300 });
        this.setupModalManager();
        // 傳入 onResize callback，讓 ResizeObserver 觸發後會重繪
        this.canvas = new GenogramCanvas('genogramCanvas', 'canvasContainer', () => this.render());
        this.setupLabelPositionPopover();
        this.renderRelationshipLegend();
        // 圖例移入 hidden tab 後，瀏覽器不再自動載入其 Noto unicode-range subsets。
        // 明確 warm-up 原本可見的圖例文字；完成後重畫一次 Canvas，避免 fallback glyph 留存。
        this._canvasFontSignature = null;
        this._canvasFontGeneration = 0;
        this._canvasFontAppliedGeneration = -1;
        this._canvasFontRepaintRequested = false;
        this.canvasFontReady = Promise.resolve();
        this.waitForCurrentCanvasFonts(true);
        this.setupEventListeners();

        // 延遲載入自動儲存，確保 canvas 和 ResizeObserver 都已完成初始化
        // 使用 setTimeout 0 讓瀏覽器先完成所有同步任務和 ResizeObserver 回調
        setTimeout(() => {
            this.loadAutoSave();
            // 如果沒有恢復工作階段，才顯示「就緒」
            if (this.persons.length === 0) {
                this.updateStatus('就緒', null, {
                    autoHideMs: GenogramApp.STATUS_TIMEOUTS.passive
                });
            }
            this.updateToolbar();
            this.updateDocumentTitle(); // [1-2]
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
            copyImageBtn: document.getElementById('copyImageBtn'),
            clearAllBtn: document.getElementById('clearAllBtn'),
            autoLayoutBtn: document.getElementById('autoLayoutBtn'),

            // 面板
            propertyContent: document.getElementById('propertyContent'),
            inspectorToggle: document.getElementById('inspectorToggle'),
            statusBar: document.getElementById('statusBar'),
            routingWarning: document.getElementById('routingWarning'),
            zoomLevel: document.getElementById('zoomLevel'),
            zoomIn: document.getElementById('zoomIn'),
            zoomOut: document.getElementById('zoomOut'),
            fitView: document.getElementById('fitView'),
            locateIP: document.getElementById('locateIP'), // [3-3] 定位案主
            zoomReset: document.getElementById('zoomReset'),
            canvasContainer: document.getElementById('canvasContainer'),
            labelPositionPopover: document.getElementById('labelPositionPopover'),
            labelSelectionOutline: document.getElementById('labelSelectionOutline'),

            // [NEW - G 方案] 預覽確認浮動欄
            layoutPreviewBar: document.getElementById('layoutPreviewBar'),
            applyLayoutBtn: document.getElementById('applyLayoutBtn'),
            cancelLayoutBtn: document.getElementById('cancelLayoutBtn'),

            // 對話框
            genderModal: document.getElementById('genderModal'),
            cancelGender: document.getElementById('cancelGender'),
            relationshipModal: document.getElementById('relationshipModal'),
            cancelRelationship: document.getElementById('cancelRelationship'),
            exportModal: document.getElementById('exportModal'),
            cancelExport: document.getElementById('cancelExport'),
            exportConfirmBtn: document.getElementById('exportConfirmBtn'), // [R4]
            confirmModal: document.getElementById('confirmModal'), // [R4] 品牌確認框
            confirmTitle: document.getElementById('confirmTitle'),
            confirmMessage: document.getElementById('confirmMessage'),
            confirmOk: document.getElementById('confirmOk'),
            confirmCancel: document.getElementById('confirmCancel'),
            emptyState: document.getElementById('emptyState'), // [R4] 空白畫布引導
            emptyStateAddBtn: document.getElementById('emptyStateAddBtn'),
            helpModal: document.getElementById('helpModal'),
            helpBtn: document.getElementById('helpBtn'),
            closeHelpBtn: document.getElementById('closeHelp'),
            fileInput: document.getElementById('fileInput'),

            // [2-3] 開啟檔案對話框（最近檔案 / 瀏覽 / 清除本機暫存）
            openFileModal: document.getElementById('openFileModal'),
            recentFileList: document.getElementById('recentFileList'),
            browseFileBtn: document.getElementById('browseFileBtn'),
            cancelOpenFile: document.getElementById('cancelOpenFile'),
            clearLocalDataBtn: document.getElementById('clearLocalDataBtn'),

            // 圖例面板
            legendPanel: document.getElementById('legendPanel'),

            // 子女選擇對話框
            childrenModal: document.getElementById('childrenModal'),
            childrenList: document.getElementById('childrenList'),
            skipChildren: document.getElementById('skipChildren'),
            confirmChildren: document.getElementById('confirmChildren'),

            // 多元性別 UI
            toggleDiversityBtn: document.getElementById('toggleDiversityBtn'),
            backToBasicBtn: document.getElementById('backToBasicBtn'),
            diversitySection: document.getElementById('diversitySection'),
            basicGenderSection: document.querySelector('.gender-selection') // 捕捉原本的性別按鈕區
        };
    }

    setupModalManager() {
        const registrations = [
            [this.elements.genderModal, () => this.closeGenderModal(), '.gender-btn'],
            [this.elements.relationshipModal, () => this.closeRelationshipModal(), '.rel-btn'],
            [this.elements.openFileModal, () => this.closeOpenFileModal(), '#browseFileBtn'],
            [this.elements.childrenModal, () => this.closeChildrenModal(), '#skipChildren'],
            [this.elements.helpModal, () => this.closeHelpModal(), '#closeHelp'],
            [this.elements.exportModal, () => this.closeExportModal(), '.export-option-btn'],
            [this.elements.confirmModal, () => this._resolveConfirm(false), '#confirmCancel'] // [R4]
        ];
        registrations.forEach(([overlay, requestClose, initialFocus]) =>
            this.modalManager.register(overlay, { requestClose, initialFocus }));
    }

    /**
     * [R4] 空白畫布引導卡：沒有任何成員、也不在放置流程中時顯示
     */
    updateEmptyState() {
        const el = this.elements.emptyState;
        if (!el) return;
        // 只在「真的什麼都沒有」且處於選取工具時顯示，才不會擋住生活圈／同住圈工具的點擊
        const nothing = this.persons.length === 0 && (this.lifeCircles || []).length === 0
            && (this.households || []).length === 0;
        const show = nothing && !this.placementSession && !this.isLoading && this.currentTool === 'select';
        el.hidden = !show;
    }

    /**
     * [R4] 品牌確認框，取代原生 confirm()。回傳 Promise<boolean>。
     * cancelText 傳 null 就只剩一顆按鈕（等同 alert）。
     */
    confirmDialog({ title = '請確認', message = '', okText = '確定', cancelText = '取消', danger = false } = {}) {
        const el = this.elements;
        if (!el.confirmModal || !this.modalManager) {
            return Promise.resolve(window.confirm(message));
        }
        el.confirmTitle.textContent = title;
        el.confirmMessage.textContent = message;
        el.confirmOk.textContent = okText;
        el.confirmOk.classList.toggle('btn-danger', danger === true);
        el.confirmCancel.textContent = cancelText || '取消';
        el.confirmCancel.style.display = cancelText === null ? 'none' : '';
        if (this._confirmResolve) this._confirmResolve(false); // 前一個尚未回應的先當取消
        return new Promise(resolve => {
            this._confirmResolve = resolve;
            this.modalManager.open(el.confirmModal);
        });
    }

    alertDialog(message, title = '提示') {
        return this.confirmDialog({ title, message, okText: '知道了', cancelText: null });
    }

    _resolveConfirm(value) {
        const resolve = this._confirmResolve;
        this._confirmResolve = null;
        const overlay = this.elements.confirmModal;
        if (overlay && overlay.classList.contains('active')) this.modalManager.close(overlay);
        if (resolve) resolve(value === true);
    }

    openHelpModal() {
        this.commitPropertyEditSession();
        this.modalManager.open(this.elements.helpModal);
    }

    closeHelpModal() {
        this.modalManager.close(this.elements.helpModal);
    }

    setInspectorTab(tabName) {
        const allowed = new Set(['properties', 'legend', 'view']);
        const next = allowed.has(tabName) ? tabName : 'properties';
        this.currentInspectorTab = next;
        document.querySelectorAll('[data-inspector-tab]').forEach(button => {
            const active = button.dataset.inspectorTab === next;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
        });
        document.querySelectorAll('[data-inspector-panel]').forEach(panel => {
            panel.hidden = panel.dataset.inspectorPanel !== next;
        });
    }

    renderRelationshipLegend() {
        const container = document.getElementById('legendContent');
        if (!container || typeof Relationship.getLegendSections !== 'function') return;
        const knownTypes = new Set(Object.values(Relationship.TYPES));
        const sections = Relationship.getLegendSections();
        const sectionCounts = sections.reduce((counts, section) => {
            counts.set(section.groupId, (counts.get(section.groupId) || 0) + 1);
            return counts;
        }, new Map());
        const groups = new Map();
        container.replaceChildren();

        sections.forEach(section => {
            let group = groups.get(section.groupId);
            if (!group) {
                group = document.createElement('section');
                group.className = 'legend-group';
                group.dataset.legendGroup = section.groupId;
                const heading = document.createElement('h4');
                heading.className = 'legend-group-title';
                heading.textContent = section.groupTitle;
                group.appendChild(heading);
                groups.set(section.groupId, group);
                container.appendChild(group);
            }

            const sectionElement = document.createElement('div');
            sectionElement.className = 'legend-subcategory';
            sectionElement.dataset.legendSection = section.id;
            if ((sectionCounts.get(section.groupId) || 0) > 1) {
                const subheading = document.createElement('h5');
                subheading.className = 'legend-subcategory-title';
                subheading.textContent = section.title;
                sectionElement.appendChild(subheading);
            }

            section.entries.forEach(entry => {
                if (!knownTypes.has(entry.type)) return;
                const item = document.createElement('div');
                item.className = 'legend-item';
                item.dataset.legendType = entry.type;
                if (entry.linkType) item.dataset.legendLinkType = entry.linkType;
                const sample = document.createElement('span');
                sample.classList.add('legend-line', entry.legendClass);
                sample.setAttribute('aria-hidden', 'true');
                const label = document.createElement('span');
                label.className = 'legend-label';
                label.textContent = entry.label;
                item.append(sample, label);
                sectionElement.appendChild(item);
            });
            group.appendChild(sectionElement);
        });

        // [HH-2] 圖形符號（非關係線）：同住框。刻意不用 .legend-group / data-legend-group，
        // 側欄「三大關係群組」契約（verify_legend_consistency）不受影響。
        const symbols = document.createElement('section');
        symbols.className = 'legend-extra';
        symbols.dataset.legendExtra = 'symbols';
        const symbolsTitle = document.createElement('h4');
        symbolsTitle.className = 'legend-group-title';
        symbolsTitle.textContent = '圖形符號';
        const householdItem = document.createElement('div');
        householdItem.className = 'legend-item legend-symbol-item';
        const swatch = document.createElement('span');
        swatch.className = 'legend-swatch-household';
        swatch.setAttribute('aria-hidden', 'true');
        const swatchLabel = document.createElement('span');
        swatchLabel.className = 'legend-label';
        swatchLabel.textContent = '同住圈（虛線框內為同住成員）';
        householdItem.append(swatch, swatchLabel);
        symbols.append(symbolsTitle, householdItem);
        container.appendChild(symbols);
    }

    setViewOption(key, value, { render = true } = {}) {
        if (!Object.prototype.hasOwnProperty.call(this.viewOptions, key)) return false;
        const next = value === true;
        this.viewOptions[key] = next;
        const control = document.querySelector('[data-view-option="' + key + '"]');
        if (control) control.checked = next;
        if (!next) {
            if (key === 'showEmotionalRelationships' && this.selectedRelationshipId) {
                const selected = this.relationships.find(rel => rel.id === this.selectedRelationshipId);
                if (selected && Relationship.isEmotionalDisplayType(selected.type)) this.selectedRelationshipId = null;
            }
            if (key === 'showHouseholds') this.selectedHouseholdId = null;
            if (key === 'showLifeCircles') this.selectedLifeCircleId = null;
            this.updatePropertyPanel();
        }
        if (render) this.render();
        return true;
    }

    ensureViewOption(key, { render = true } = {}) {
        if (this.viewOptions[key] === true) return false;
        this.setViewOption(key, true, { render });
        return true;
    }

    isCompactInspector() {
        return this.inspectorCompact === true;
    }

    updateInspectorToggle() {
        const expanded = this.isCompactInspector()
            ? this.inspectorOverlayOpen
            : !this.inspectorDesktopCollapsed;
        const action = expanded ? '收合檢視面板' : '展開檢視面板';
        this.elements.inspectorToggle.setAttribute('aria-expanded', String(expanded));
        this.elements.inspectorToggle.setAttribute('title', action);
        this.elements.inspectorToggle.setAttribute('aria-label', action);
    }

    setInspectorCollapsed(collapsed) {
        this.inspectorDesktopCollapsed = Boolean(collapsed);
        document.body.classList.toggle('inspector-collapsed',
            !this.isCompactInspector() && this.inspectorDesktopCollapsed);
        this.updateInspectorToggle();
        if (!this.isCompactInspector()) requestAnimationFrame(() => this.canvas.resize());
    }

    setCompactInspectorOpen(open) {
        if (!this.isCompactInspector()) return false;
        this.inspectorOverlayOpen = Boolean(open);
        document.body.classList.toggle('inspector-overlay-open', this.inspectorOverlayOpen);
        this.updateInspectorToggle();
        return true;
    }

    closeCompactInspectorOverlay() {
        if (!this.isCompactInspector() || !this.inspectorOverlayOpen) return false;
        this.setCompactInspectorOpen(false);
        return true;
    }

    applyResponsiveInspector(matches) {
        this.inspectorCompact = matches === true;
        document.body.classList.toggle('inspector-compact', this.inspectorCompact);
        document.body.classList.remove('inspector-overlay-open');
        this.inspectorOverlayOpen = false;
        document.body.classList.toggle('inspector-collapsed',
            !this.inspectorCompact && this.inspectorDesktopCollapsed);
        this.updateInspectorToggle();
        requestAnimationFrame(() => this.canvas.resize());
    }

    /**
     * 設定事件監聽器
     */
    setupEventListeners() {
        const inspectorTabs = [...document.querySelectorAll('[data-inspector-tab]')];
        inspectorTabs.forEach((button, index) => {
            button.addEventListener('click', () => this.setInspectorTab(button.dataset.inspectorTab));
            button.addEventListener('keydown', event => {
                let nextIndex;
                if (event.key === 'ArrowRight') nextIndex = (index + 1) % inspectorTabs.length;
                else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + inspectorTabs.length) % inspectorTabs.length;
                else if (event.key === 'Home') nextIndex = 0;
                else if (event.key === 'End') nextIndex = inspectorTabs.length - 1;
                else return;
                event.preventDefault();
                const nextTab = inspectorTabs[nextIndex];
                this.setInspectorTab(nextTab.dataset.inspectorTab);
                nextTab.focus();
            });
        });
        // [2-2] 匯出頁首欄位 → 文件 meta；勾選/紙張 → localStorage 偏好
        const includeHeader = document.getElementById('exportIncludeHeader');
        if (includeHeader) includeHeader.addEventListener('change', e => {
            const fields = document.getElementById('exportHeaderFields');
            if (fields) fields.hidden = !e.target.checked;
            this._writeExportPrefs({ includeHeader: e.target.checked });
            if (e.target.checked) document.getElementById('exportMetaTitle')?.focus();
        });
        const bindMeta = (id, key) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', e => {
                this.setDocumentMeta({ [key]: e.target.value });
                if (key === 'author') this._writeExportPrefs({ author: e.target.value.trim() });
            });
        };
        bindMeta('exportMetaTitle', 'title');
        bindMeta('exportMetaCaseId', 'caseId');
        bindMeta('exportMetaAuthor', 'author');
        document.getElementById('exportPdfFormat')?.addEventListener('change', e => this._writeExportPrefs({ pdfFormat: e.target.value }));
        document.getElementById('exportPdfOrientation')?.addEventListener('change', e => this._writeExportPrefs({ pdfOrientation: e.target.value }));

        // [2-1] 年齡基準日（檢視分頁；session-only，不進 JSON）
        const ageRefInput = document.getElementById('ageReferenceDate');
        if (ageRefInput) ageRefInput.addEventListener('change', e => this.setAgeReferenceDate(e.target.value || null));
        const ageRefToday = document.getElementById('ageReferenceToday');
        if (ageRefToday) ageRefToday.addEventListener('click', () => this.setAgeReferenceDate(null));

        document.querySelectorAll('[data-view-option]').forEach(control => {
            control.addEventListener('change', event => {
                this.setViewOption(event.currentTarget.dataset.viewOption, event.currentTarget.checked);
            });
        });
        this.elements.inspectorToggle.addEventListener('click', () => {
            if (this.isCompactInspector()) {
                this.setCompactInspectorOpen(!this.inspectorOverlayOpen);
                return;
            }
            this.inspectorUserOverride = true;
            this.setInspectorCollapsed(!this.inspectorDesktopCollapsed);
        });
        this.setInspectorTab(this.currentInspectorTab);
        this.inspectorMediaQuery = typeof window.matchMedia === 'function'
            ? window.matchMedia('(max-width: 1180px)')
            : null;
        if (this.inspectorMediaQuery) {
            const applyResponsiveInspector = event => this.applyResponsiveInspector(Boolean(event.matches));
            if (typeof this.inspectorMediaQuery.addEventListener === 'function') {
                this.inspectorMediaQuery.addEventListener('change', applyResponsiveInspector);
            } else if (typeof this.inspectorMediaQuery.addListener === 'function') {
                this.inspectorMediaQuery.addListener(applyResponsiveInspector);
            }
            applyResponsiveInspector(this.inspectorMediaQuery);
        } else {
            this.applyResponsiveInspector(false);
        }

        // 新增角色按鈕 - 點擊後顯示性別選擇對話框
        this.elements.addPersonBtn.addEventListener('click', () =>
            this.showGenderModal('parent', '新增成員'));

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
        // [2-3] 開啟檔案對話框
        this.elements.browseFileBtn?.addEventListener('click', () => { this.closeOpenFileModal(); this.openWithPicker(); });
        this.elements.cancelOpenFile?.addEventListener('click', () => this.closeOpenFileModal());
        this.elements.clearLocalDataBtn?.addEventListener('click', () => this.clearLocalData());
        this.elements.fileInput.addEventListener('change', (e) => this.loadFromFile(e));
        if (this.elements.exportBtn) {
            this.elements.exportBtn.addEventListener('click', () => this.showExportModal());
        }
        if (this.elements.copyImageBtn) {
            this.elements.copyImageBtn.addEventListener('click', () => this.copyImageToClipboard());
        }
        if (this.elements.clearAllBtn) {
            this.elements.clearAllBtn.addEventListener('click', () => this.clearAll());
        }

        this.elements.helpBtn?.addEventListener('click', () => this.openHelpModal());
        this.elements.closeHelpBtn?.addEventListener('click', () => this.closeHelpModal());
        this.elements.cancelExport?.addEventListener('click', () => this.closeExportModal());
        // [R4] 格式鈕只切換選擇；真正匯出由「匯出」主按鈕觸發
        document.querySelectorAll('.export-option-btn').forEach(button => {
            button.addEventListener('click', () => this.selectExportFormat(button.dataset.format));
        });
        this.elements.exportConfirmBtn?.addEventListener('click', () => {
            const format = this.exportFormat || 'png';
            this.closeExportModal();
            this.handleExportFormat(format);
        });
        // [R4] 品牌確認框
        this.elements.confirmOk?.addEventListener('click', () => this._resolveConfirm(true));
        this.elements.confirmCancel?.addEventListener('click', () => this._resolveConfirm(false));
        // [R4] 空白畫布引導卡
        this.elements.emptyStateAddBtn?.addEventListener('click', () => this.showGenderModal('parent'));

        if (this.elements.autoLayoutBtn) {
            this.elements.autoLayoutBtn.addEventListener('click', () => this.previewAutoLayout());
        }

        // [NEW - G 方案] 預覽確認/取消按鈕
        if (this.elements.applyLayoutBtn) {
            this.elements.applyLayoutBtn.addEventListener('click', () => this.applyPreviewedLayout());
        }
        if (this.elements.cancelLayoutBtn) {
            this.elements.cancelLayoutBtn.addEventListener('click', () => this.cancelPreviewedLayout());
        }

        // 畫布事件 (使用 Pointer Events 統一滑鼠與觸控)
        const canvas = this.canvas.canvas;
        canvas.addEventListener('pointerdown', (e) => {
            this.closeCompactInspectorOverlay();
            this.handlePointerDown(e);
        });
        window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        window.addEventListener('pointercancel', (e) => this.handlePointerUp(e)); // 觸控中斷時也要清理狀態
        canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));

        // 鍵盤事件
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // 縮放控制
        this.elements.zoomIn.addEventListener('click', () => this.zoomStep(1));
        this.elements.zoomOut.addEventListener('click', () => this.zoomStep(-1));
        this.elements.fitView.addEventListener('click', () => this.fitToView());
        this.elements.locateIP?.addEventListener('click', () => this.locateIdentifiedPatient()); // [3-3]
        this.elements.zoomReset.addEventListener('click', () => this.resetZoom());

        // 性別選擇對話框
        this.elements.cancelGender.addEventListener('click', () => this.closeGenderModal());
        document.querySelectorAll('.gender-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const button = e.currentTarget;
                const gender = button.dataset.gender;
                const orientation = button.dataset.orientation; // 'true' or undefined
                const transgender = button.dataset.transgender || null; // 'ftm', 'mtf', or null

                if (this.quickAddContext) {
                    this.createQuickPersonWithGender(gender, orientation === 'true', transgender);
                } else {
                    this.createPersonWithGeneration(gender, orientation === 'true', transgender);
                }
            });
        });

        // 多元性別切換與返回事件
        if (this.elements.toggleDiversityBtn) {
            this.elements.toggleDiversityBtn.addEventListener('click', () => {
                this.elements.basicGenderSection.style.display = 'none';
                this.elements.toggleDiversityBtn.style.display = 'none';
                this.elements.diversitySection.style.display = 'block';
            });
        }

        if (this.elements.backToBasicBtn) {
            this.elements.backToBasicBtn.addEventListener('click', () => {
                this.elements.diversitySection.style.display = 'none';
                this.elements.basicGenderSection.style.display = 'flex';
                this.elements.toggleDiversityBtn.style.display = 'flex';
            });
        }

        // 關係對話框取消
        this.elements.cancelRelationship.addEventListener('click', () => this.closeRelationshipModal());

        // [Phase 1] 對調關係方向（編輯模式；修正畫反的虐待箭頭/親子上下等）
        const swapBtn = document.getElementById('swapRelationshipDirection');
        if (swapBtn) swapBtn.addEventListener('click', () => this.swapRelationshipDirection());

        // 關係類型按鈕（靜態清單；「最近使用」的複製鈕在開啟 modal 時動態綁同一個 handler）
        document.querySelectorAll('.rel-btn').forEach(btn => {
            btn.addEventListener('click', e => this.handleRelationshipTypeButton(e));
        });

        // [Phase 2A.2] 婚姻線走法改為畫布上「走法鈕」（鉛筆旁，見 canvas.drawRelationshipRouteButtons）

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
            }, this.getDocumentExtra());
        });
    }

    /**
     * 設定當前工具
     */
    setTool(tool) {
        // Placement is an ephemeral transaction. Any explicit tool change aborts it
        // without touching history. commitPlacement clears it before selecting a tool.
        this.cancelPlacement();
        this.labelEditingPersonId = null;
        // [UX Fix] 如果正在預覽自動排列，切換工具時自動取消預覽
        if (this.isPreviewingLayout) {
            this.cancelPreviewedLayout();
        }

        // [New Fix] 如果正在繪製生活圈，切換工具時自動取消
        if (this.isDrawingLifeCircle) {
            this.cancelLifeCircle();
        }
        if (tool === 'household') this.ensureViewOption('showHouseholds', { render: false });
        if (tool === 'lifeCircle') this.ensureViewOption('showLifeCircles', { render: false });

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
                statusText = '範圍圈選：拖曳滑鼠圈選多個成員';
                break;
            case 'connect':
                statusText = '連接工具：依序點擊兩個成員建立關係';
                this.connectingFrom = null;
                break;
            case 'household': {
                // [UX Fix] 改用點選模式，更直覺好用
                // [HH-4] 已經多選 ≥2 人 → 直接建框（createHousehold 內會切回選取工具並提示）
                if (this.selectedPersonIds.length >= 2) {
                    this.householdSelection = [...this.selectedPersonIds];
                    this.createHousehold();
                    return;
                }
                // 只選 1 人 → 不動選取狀態（切工具不得改變選取，見 verify_manual_label_controls），
                // Enter 會直接用該人建框；再點其他人時由 pointerdown 把他一起納入
                const preselected = this.selectedPersonIds.length || (this.selectedPersonId ? 1 : 0);
                statusText = preselected > 0
                    ? `已選取 ${preselected} 位成員，按 Enter 建立同住圈（再點人可增減）`
                    : '同住圈：點選成員加入選取，按 Enter 建立';
                break;
            }
            case 'lifeCircle':
                statusText = '生活圈繪製：點擊增加頂點，雙擊或 Enter 完成，Esc 取消';
                break;
        }
        this.updateStatus(statusText);
        // 工具與文字編輯狀態會共同決定快速功能圈是否可見／可命中。
        // 工具切換必須立即重畫，避免留下看不見但仍可點擊的舊熱區。
        if (this.canvas) this.render();
    }

    /**
     * 清除所有選取狀態 (選取互斥規則)
     */
    clearAllSelections() {
        this.selectedPersonId = null;
        this.labelEditingPersonId = null;
        this.selectedPersonIds = [];
        this.selectedRelationshipId = null;
        this.selectedHouseholdId = null;
        this.selectedLifeCircleId = null; // [Fix] 漏清會導致 Del 刪錯對象
    }

    /**
     * [Bug Fix #2] 取消所有進行中的互動操作
     * 用於視窗失焦、tab 切換、觸控中斷等情況
     */
    cancelInteraction() {
        this.cancelPlacement();

        // 新建關係視窗依賴 connectingFrom/connectingTo。失焦時既然要清除端點，
        // 也必須同步關閉該視窗，避免回到頁面後只剩一個無法送出的 modal。
        // 編輯既有關係不依賴暫存端點，因此允許視窗保持開啟。
        this.cancelRelationshipWorkflow({ preserveEditor: true });

        // 清理拖曳狀態
        if (this.canvas) {
            this.canvas.isDragging = false;
            this.canvas.isPanning = false;
            this.canvas.draggedPerson = null;
            this.canvas.draggedHousehold = null;
            this.canvas.draggedLifeCircle = null; // [Fix] 漏清會劫持下一次拖曳
        }
        this.lcVertexDrag = null;   // [LC-1]
        this.liftDrag = null;       // [R-1]
        this.lcPress = null;        // [LC-2]
        this.ellipsePreview = null; // [LC-2]

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

        // [Snap] 清理拖曳吸附狀態與輔助線（否則失焦後桃紅輔助線會殘留在畫布上）
        this.dragVirtual = null;
        this.dragGuides = null;
        if (this.canvas) {
            this.canvas.dragGuides = null;
        }

        this.render();
    }

    /**
     * 更新工具列狀態
     */
    /**
     * [2-1] 設定年齡基準日（'YYYY-MM-DD' 或 null=今天），重繪並更新屬性面板年齡欄。
     * 只影響「有出生年月」的人物；不寫入檔案。
     */
    setAgeReferenceDate(value, { render = true } = {}) {
        const normalized = value ? Person.normalizeDateString(value) : null;
        this.ageReferenceDate = normalized && normalized.length === 10 ? normalized : null;
        const input = document.getElementById('ageReferenceDate');
        if (input) input.value = this.ageReferenceDate || '';
        if (render) this.render();
        const person = this.personMap.get(this.selectedPersonId);
        if (person) this.refreshPersonAgeFields(this.elements.propertyContent, person);
    }

    /**
     * [2-1] 依人物的出生/死亡年月狀態更新屬性面板：
     *   有計算值 → 年齡欄唯讀顯示計算值 + 提示；否則可手填。過世才顯示死亡年月欄。
     */
    refreshPersonAgeFields(root, person) {
        if (!root || !person) return;
        const ageInput = root.querySelector('#personAge');
        const hint = root.querySelector('#personAgeHint');
        const deathGroup = root.querySelector('#personDeathDateGroup');
        if (deathGroup) deathGroup.hidden = !person.isDeceased;
        const computed = typeof person.isAgeComputed === 'function' && person.isAgeComputed(this.ageReferenceDate);
        if (ageInput) {
            if (computed) {
                ageInput.value = person.getDisplayAge(this.ageReferenceDate);
                ageInput.readOnly = true;
                ageInput.classList.add('is-computed');
                ageInput.title = '依出生年月自動計算；清空出生年月可改回手動輸入';
            } else {
                ageInput.readOnly = false;
                ageInput.classList.remove('is-computed');
                ageInput.title = '';
                if (document.activeElement !== ageInput) ageInput.value = person.age ?? '';
            }
        }
        if (!hint) return;
        if (computed) {
            hint.hidden = false;
            hint.textContent = person.isDeceased
                ? '年齡依出生／死亡年月自動計算（享年）'
                : `年齡依出生年月自動計算，基準日：${this.ageReferenceDate || '今天'}（可在「檢視」分頁調整）`;
        } else if (person.birthDate && person.isDeceased && !person.deathDate) {
            hint.hidden = false;
            hint.textContent = '已過世但未填死亡年月：年齡沿用手動輸入的享年';
        } else {
            hint.hidden = true;
            hint.textContent = '';
        }
    }

    /**
     * [1-2] 標記「有變更尚未寫入檔案」並更新標題列。載入中不標記。
     */
    markDirty() {
        if (this.isLoading) return;
        this.isDirty = true;
        this.updateDocumentTitle();
    }

    /**
     * [1-2] 標題列：檔名 + 未儲存標記（●）。
     * 未連結檔案 → 「未命名家系圖」；有內容但尚未存成檔案、或存檔後又有變更 → 顯示 ●。
     * 同步更新瀏覽器分頁標題，方便多分頁時辨識。
     */
    updateDocumentTitle() {
        const nameNode = document.getElementById('documentName');
        const dirtyNode = document.getElementById('documentDirty');
        const fileName = this.storage?.getOpenFileName?.() || null;
        const linked = this.storage?.hasOpenFile?.() === true;
        const hasContent = ((this.persons?.length || 0) + (this.relationships?.length || 0)
            + (this.households?.length || 0) + (this.lifeCircles?.length || 0)) > 0;
        const showDirty = this.isDirty && hasContent;
        const title = fileName || '未命名家系圖';
        if (nameNode) {
            nameNode.textContent = title;
            nameNode.title = !fileName
                ? '尚未連結檔案：「另存」或「載入」後，Ctrl+S 會直接寫回該檔案'
                : (linked ? `目前檔案：${fileName}（Ctrl+S 直接寫回）` : `目前檔案：${fileName}（唯讀載入，儲存請用「另存」）`);
        }
        if (dirtyNode) {
            dirtyNode.hidden = !showDirty;
            dirtyNode.title = linked
                ? '有變更尚未儲存至檔案（Ctrl+S 儲存）'
                : '內容尚未儲存為檔案（請點「另存」建立檔案）';
        }
        document.title = `${showDirty ? '● ' : ''}${title} | 勵馨家系圖生成器`;
    }

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
    updateStatus(message = null, type = null, { autoHideMs = undefined } = {}) {
        if (this.statusHideTimer !== null) {
            clearTimeout(this.statusHideTimer);
            this.statusHideTimer = null;
        }
        if (!message) {
            this.elements.statusBar.classList.add('hidden');
            return;
        }
        const bar = this.elements.statusBar;
        bar.textContent = message;
        bar.className = 'status-bar';
        if (type) bar.classList.add(type);
        // [B1-ux] 預設逾時：success/info 3.5 秒、warning/error 6 秒；無 type 的模式指引訊息維持常駐
        const defaultTimeout = (type === 'success' || type === 'info')
            ? GenogramApp.STATUS_TIMEOUTS.passive
            : (type === 'warning' || type === 'error') ? GenogramApp.STATUS_TIMEOUTS.passiveAlert : null;
        const duration = autoHideMs !== undefined ? autoHideMs : defaultTimeout;
        if (Number.isFinite(duration) && duration >= 0) {
            const expectedMessage = message;
            this.statusHideTimer = setTimeout(() => {
                this.statusHideTimer = null;
                if (bar.textContent === expectedMessage) bar.classList.add('hidden');
            }, duration);
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
     * 新增人物 (舊方法,保留兼容性)
     */
    addPerson(x, y, gender) {
        const person = new Person({
            x: x,
            y: y,
            gender: gender
        });
        this.persons.push(person);
        this.personMap.set(person.id, person);
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
    showGenderModal(generation, statusLabel = null) {
        this.commitPropertyEditSession();
        // [UX Fix] 如果正在預覽自動排列，開啟對話框時自動取消預覽
        if (this.isPreviewingLayout) {
            this.cancelPreviewedLayout();
        }

        this.pendingGeneration = generation;
        const level = GenogramApp.GENERATION_LEVELS[generation];
        const label = statusLabel || (level ? level.label : (generation || '外部'));
        const message = statusLabel
            ? '選擇' + label + '的性別'
            : '選擇 ' + label + ' 的性別';
        this.updateStatus(message, 'info');
        this.modalManager.open(this.elements.genderModal);
    }

    /**
     * 關閉性別選擇對話框
     */
    closeGenderModal() {
        this.pendingGeneration = null;
        this.quickAddContext = null;
        this.modalManager.close(this.elements.genderModal);
        this.updateStatus('就緒', null, {
            autoHideMs: GenogramApp.STATUS_TIMEOUTS.passive
        });
    }

    /**
     * 選取人物
     */
    selectPerson(id, { labelEditing = false } = {}) {
        this.commitPropertyEditSession();
        // [UX Fix] 選取互斥規則：清除其他選取
        this.selectedRelationshipId = null;
        this.selectedHouseholdId = null;
        this.selectedLifeCircleId = null;
        // 保留 selectedPersonIds 多選狀態（如果是 Shift+點擊）
        this.selectedPersonId = id;
        this.labelEditingPersonId = labelEditing ? id : null;
        this.updatePropertyPanel();
        this.render();
    }

    /**
     * 選取關係線
     */
    selectRelationship(id) {
        this.commitPropertyEditSession();
        // [UX Fix] 選取互斥規則：清除其他選取
        this.selectedPersonId = null;
        this.labelEditingPersonId = null;
        this.selectedPersonIds = [];
        this.selectedHouseholdId = null;
        this.selectedLifeCircleId = null;
        this.selectedRelationshipId = id;
        this.updatePropertyPanel();
        this.render();
    }

    /**
     * 更新屬性面板
     */
    /**
     * 找出與指定人物有相同父母的兄弟姊妹
     * @param {Person} person 
     * @returns {Array} 兄弟姊妹列表
     */
    getSiblings(person) {
        const kinship = this.getKinshipEngine();
        const parentIds = kinship.getParentIds(person.id);
        if (parentIds.length === 0) return [];

        const siblingIds = new Set();
        parentIds.forEach(parentId => {
            kinship.getChildrenIds(parentId).forEach(childId => {
                if (childId !== person.id) siblingIds.add(childId);
            });
        });

        return Array.from(siblingIds)
            .map(id => this.personMap.get(id))
            .filter(p => p);
    }

    /**
     * [Fix F-2] 取得「全同胞」：父母集合與此人完全相同者。
     * 雙胞胎候選只能是全同胞——半同胞（再婚的同父異母/同母異父）與他人的孩子都不可成為雙胞胎。
     * @param {Person} person
     * @returns {Person[]}
     */
    getFullSiblings(person) {
        const kinship = this.getKinshipEngine();
        const mine = kinship.getParentIds(person.id).slice().sort();
        if (mine.length === 0) return [];
        const key = mine.join(',');
        return this.persons.filter(p => {
            if (p.id === person.id) return false;
            const pp = kinship.getParentIds(p.id).slice().sort();
            return pp.length > 0 && pp.join(',') === key;
        });
    }

    createTwinSettingsElement(person) {
        const section = document.createElement('div');
        section.className = 'form-group twin-settings';
        const heading = document.createElement('h4');
        heading.textContent = '多胞胎設定';
        section.appendChild(heading);
        const siblings = this.getFullSiblings(person);
        if (!siblings.length) {
            section.hidden = true;
            return section;
        }
        const help = document.createElement('div');
        help.className = 'property-help';
        help.textContent = '勾選與此人是多胞胎的兄弟姊妹：';
        section.appendChild(help);
        siblings.forEach(sibling => {
            const row = document.createElement('div');
            row.className = 'checkbox-group';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = `twin_${sibling.id}`;
            input.dataset.siblingId = sibling.id;
            input.className = 'twin-checkbox';
            input.checked = Boolean(person.twinGroup && sibling.twinGroup === person.twinGroup);
            const label = document.createElement('label');
            label.htmlFor = input.id;
            const symbol = sibling.gender === 'male' ? '□' : sibling.gender === 'female' ? '○' : '◇';
            label.textContent = `${symbol} ${sibling.name || '(未命名)'}`;
            row.append(input, label);
            section.appendChild(row);
        });
        if (person.twinGroup) {
            const row = document.createElement('div');
            row.className = 'checkbox-group twin-zygosity-row';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = 'twin_zygosity_mono';
            input.className = 'twin-zygosity-checkbox';
            input.checked = person.zygosity === 'mono';
            const label = document.createElement('label');
            label.htmlFor = input.id;
            label.textContent = '同卵雙胞胎（加畫連接橫桿）';
            row.append(input, label);
            section.appendChild(row);
        }
        return section;
    }

    setPropertyPanelTemplate(templateKey) {
        if (!Object.prototype.hasOwnProperty.call(PROPERTY_PANEL_TEMPLATES, templateKey)) {
            throw new Error(`Unknown property template: ${templateKey}`);
        }
        const html = PROPERTY_PANEL_TEMPLATES[templateKey];
        // Trusted static template: no case data.
        this.elements.propertyContent.innerHTML = html;
        return this.elements.propertyContent;
    }

    /**
     * 獲取下一個生活圈的顏色
     */
    /**
     * [LC-2] 以拖曳矩形（對角兩點）產生 n 點橢圓多邊形；最小半徑 20，避免退化
     */
    static ellipsePoints(a, b, n = 16) {
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        const rx = Math.max(20, Math.abs(b.x - a.x) / 2), ry = Math.max(20, Math.abs(b.y - a.y) / 2);
        const pts = [];
        for (let i = 0; i < n; i++) {
            const t = (i / n) * Math.PI * 2;
            pts.push({ x: Math.round((cx + rx * Math.cos(t)) * 100) / 100, y: Math.round((cy + ry * Math.sin(t)) * 100) / 100 });
        }
        return pts;
    }

    /**
     * [LC-1] 點到多邊形哪一條邊最近（回傳起點索引 i，邊為 points[i]→points[(i+1)%n]）
     */
    static nearestSegmentIndex(points, pt) {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < points.length; i++) {
            const p = points[i], q = points[(i + 1) % points.length];
            const dx = q.x - p.x, dy = q.y - p.y;
            const len2 = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, ((pt.x - p.x) * dx + (pt.y - p.y) * dy) / len2));
            const d = Math.hypot(pt.x - (p.x + t * dx), pt.y - (p.y + t * dy));
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
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
     * 關係類型按鈕點擊（靜態清單與「最近使用」共用）。
     * 使用 currentTarget 確保抓到的是按鈕本身而不是內部的圖示 (span)。
     */
    handleRelationshipTypeButton(e) {
        const type = e.currentTarget.dataset.type;
        // [Phase 1] 親子按鈕帶 data-link-type（biological/adopted/foster）；其餘關係無此屬性
        const linkType = e.currentTarget.dataset.linkType || null;
        if (!type) return;
        this.recordRecentRelationshipType(type, linkType);

        // 判斷是編輯模式還是新建模式
        if (this.editingRelationshipId) {
            this.updateRelationshipType(type, linkType);
        } else {
            this.createRelationship(type, linkType);
        }
    }

    /**
     * [1-5] 最近使用的關係類型（最多 6 筆，只存 localStorage，不進 JSON / history）。
     * key = `${type}` 或 `${type}:${linkType}`（親子線分親生/收養/寄養）。
     */
    static RECENT_REL_KEY = 'genogram_recent_rel_types';
    static RECENT_REL_MAX = 6;

    getRecentRelationshipTypes() {
        try {
            const raw = localStorage.getItem(GenogramApp.RECENT_REL_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list.filter(k => typeof k === 'string') : [];
        } catch (_) {
            return [];
        }
    }

    recordRecentRelationshipType(type, linkType = null) {
        const key = linkType ? `${type}:${linkType}` : type;
        const next = [key, ...this.getRecentRelationshipTypes().filter(k => k !== key)]
            .slice(0, GenogramApp.RECENT_REL_MAX);
        try { localStorage.setItem(GenogramApp.RECENT_REL_KEY, JSON.stringify(next)); } catch (_) { /* 私密模式等 */ }
    }

    /**
     * [1-5] 開 modal 時把「最近使用」渲染到最上方（複製靜態按鈕，含圖例線）；關閉時清掉。
     * 只在 modal 開啟期間存在，不影響任何依靜態 DOM 的檢查。
     */
    renderRecentRelationshipTypes() {
        const group = document.getElementById('recentRelationshipGroup');
        const grid = document.getElementById('recentRelationshipGrid');
        if (!group || !grid) return;
        grid.innerHTML = '';
        const keys = this.getRecentRelationshipTypes();
        const clones = [];
        for (const key of keys) {
            const [type, linkType] = key.split(':');
            const selector = linkType
                ? `.rel-btn[data-type="${type}"][data-link-type="${linkType}"]:not([data-recent])`
                : `.rel-btn[data-type="${type}"]:not([data-link-type]):not([data-recent])`;
            const source = this.elements.relationshipModal.querySelector(selector);
            if (!source) continue;
            const clone = source.cloneNode(true);
            clone.dataset.recent = '1';
            clone.addEventListener('click', e => this.handleRelationshipTypeButton(e));
            clones.push(clone);
        }
        clones.forEach(c => grid.appendChild(c));
        group.hidden = clones.length === 0;
    }

    clearRecentRelationshipTypesUI() {
        const group = document.getElementById('recentRelationshipGroup');
        const grid = document.getElementById('recentRelationshipGrid');
        if (grid) grid.innerHTML = '';
        if (group) group.hidden = true;
    }

    /**
     * 建立親屬推論引擎（每次以最新資料建立）
     * @returns {KinshipEngine}
     */
    getKinshipEngine() {
        if (typeof window === 'undefined' || !window.KinshipEngine) {
            throw new Error('KinshipEngine 未載入；請確認 index.html 中 js/domain/kinship-engine.js 在 js/app.js 之前載入');
        }
        // [Phase 0a] 依 dataVersion + 人數/關係數 快取（長度當 backstop，接住漏 bump 的增刪）。
        // 親屬只依關係結構、與座標無關，故拖曳（純位置變動）期間沿用同一引擎、不重建。
        const sig = this._dataVersion + '|' + this.persons.length + '|' + this.relationships.length;
        if (this._kinshipCache && this._kinshipCacheSig === sig) {
            return this._kinshipCache;
        }
        this._kinshipCache = new window.KinshipEngine(this.persons, this.relationships);
        this._kinshipCacheSig = sig;
        return this._kinshipCache;
    }

    /**
     * [Phase 0a] 取得 family / 其他關係的分類（與 canvas.render 內原分類同邏輯），
     * 同樣依 dataVersion 快取，避免每幀重新分類。回傳物件為共用快取，呼叫端勿改動。
     * @returns {{familyRels: Relationship[], otherRels: Relationship[]}}
     */
    getRelationshipSplit() {
        const sig = this._dataVersion + '|' + this.relationships.length;
        if (this._relSplitCache && this._relSplitCacheSig === sig) {
            return this._relSplitCache;
        }
        const familyRels = [];
        const otherRels = [];
        for (const rel of this.relationships) {
            const category = typeof rel.getCategory === 'function' ? rel.getCategory() : Relationship.getCategory(rel.type);
            (category === 'family' ? familyRels : otherRels).push(rel);
        }
        this._relSplitCache = { familyRels, otherRels };
        this._relSplitCacheSig = sig;
        return this._relSplitCache;
    }

    /**
     * [Sprint 2 Phase A] 從 this.persons 重建 personMap 索引。
     * 用於批次覆寫路徑：loadData / saveState 復原 / clearAll / cache restore / filter 刪除。
     * 單筆增刪請直接 this.personMap.set/delete，避免 O(n) 重建。
     */
    _syncPersonMap() {
        this.personMap = new Map();
        for (const p of this.persons) {
            this.personMap.set(p.id, p);
        }
        // [Phase 0a] 批次覆寫（load/undo/redo/clear/migrate/filter 重建）必然是結構變動 → 快取失效
        this._dataVersion++;
    }

    /**
     * 尋找某人的配偶（透過婚姻類型關係）
     * @param {string} personId 
     * @returns {Person|null}
     */
    findSpouse(personId) {
        const spouses = this.getSpouses(personId);
        return spouses.length > 0 ? spouses[0] : null;
    }

    /**
     * 取得某人的所有配偶 ID（婚姻類關係）
     * @param {string} personId
     * @returns {string[]}
     */
    getSpouseIds(personId) {
        const marriageTypes = GenogramApp.MARRIAGE_TYPES;
        const spouseIds = new Set();

        this.relationships.forEach(rel => {
            if (!marriageTypes.includes(rel.type)) return;
            if (rel.fromPersonId === personId) spouseIds.add(rel.toPersonId);
            else if (rel.toPersonId === personId) spouseIds.add(rel.fromPersonId);
        });

        return Array.from(spouseIds);
    }

    /**
     * 取得某人的所有配偶物件
     * @param {string} personId
     * @returns {Person[]}
     */
    getSpouses(personId) {
        return this.getSpouseIds(personId)
            .map(id => this.personMap.get(id))
            .filter(p => p);
    }

    /**
     * 建立子女時挑選配偶：
     * 1) 優先使用目前選中的婚姻線
     * 2) 否則使用最近的同輩配偶
     * @param {Person} parent
     * @param {Person[]} spouses
     * @returns {Person|null}
     */
    pickSpouseForChildCreation(parent, spouses) {
        if (!parent || !spouses || spouses.length === 0) return null;
        if (spouses.length === 1) return spouses[0];

        // 優先：當前選中的婚姻關係
        if (this.selectedRelationshipId) {
            const selectedRel = this.relationships.find(r => r.id === this.selectedRelationshipId);
            const selectedCat = selectedRel
                ? (typeof selectedRel.getCategory === 'function' ? selectedRel.getCategory() : Relationship.getCategory(selectedRel.type))
                : null;

            const selectedInvolvesParent = selectedRel &&
                ((typeof selectedRel.involvesPerson === 'function' && selectedRel.involvesPerson(parent.id)) ||
                    selectedRel.fromPersonId === parent.id || selectedRel.toPersonId === parent.id);

            if (selectedRel && selectedCat === 'marriage' && selectedInvolvesParent) {
                const spouseId = selectedRel.fromPersonId === parent.id ? selectedRel.toPersonId : selectedRel.fromPersonId;
                const selectedSpouse = spouses.find(p => p.id === spouseId);
                if (selectedSpouse) return selectedSpouse;
            }
        }

        // 退而求其次：最近的同輩配偶（Y 近似）
        const grid = GenogramApp.GRID;
        const sameLevelSpouses = spouses.filter(s => Math.abs(s.y - parent.y) <= grid.CELL_HEIGHT * 0.5);
        const candidates = sameLevelSpouses.length > 0 ? sameLevelSpouses : spouses;

        candidates.sort((a, b) => {
            const da = Math.abs(a.x - parent.x);
            const db = Math.abs(b.x - parent.x);
            if (da !== db) return da - db;
            return (a.id || '').localeCompare(b.id || '');
        });

        return candidates[0] || null;
    }

    /**
     * 取得某位子女的父母 ID 列表（依 Y 判斷上下）
     * @param {string} childId
     * @returns {string[]}
     */
    getParentIdsForChild(childId) {
        return this.getKinshipEngine().getParentIds(childId);
    }

    /**
     * 檢查是否存在 parent-child 關係（不受 from/to 方向影響）
     * @param {string} parentId
     * @param {string} childId
     * @returns {boolean}
     */
    hasParentChildLink(parentId, childId) {
        return this.getKinshipEngine().hasParentChildLink(parentId, childId);
    }

    /**
     * 依據目前選到的親子線，找出同一條「可視子女線」要一起刪除的關係 ID
     * @param {Relationship} baseRel
     * @returns {string[]}
     */
    getFamilyRelationshipIdsForDeletion(baseRel) {
        if (!baseRel) return [];
        const category = typeof baseRel.getCategory === 'function'
            ? baseRel.getCategory()
            : Relationship.getCategory(baseRel.type);
        if (category !== 'family') return [baseRel.id];

        const kinship = this.getKinshipEngine();
        const basePc = kinship.normalizeParentChild(baseRel);
        if (!basePc) return [baseRel.id];

        const targetChildId = basePc.childId;

        const ids = this.relationships
            .filter(rel => {
                const relCategory = typeof rel.getCategory === 'function'
                    ? rel.getCategory()
                    : Relationship.getCategory(rel.type);
                if (relCategory !== 'family') return false;
                const pc = kinship.normalizeParentChild(rel);
                return pc && pc.childId === targetChildId;
            })
            .map(rel => rel.id);

        return ids.length > 0 ? ids : [baseRel.id];
    }

    /**
     * 刪除選取的項目
     */
    deleteSelected() {
        this.commitPropertyEditSession();
        this.cancelRelationshipWorkflow();

        // [UX Fix] 如果正在預覽自動排列，刪除時自動取消預覽
        if (this.isPreviewingLayout) {
            this.cancelPreviewedLayout();
            return; // 僅取消預覽，不執行刪除 (避免誤刪)
        }

        // 優先權 1: 優先刪除「關係線」 (User Request: 避免被同住框攔截)
        if (this.selectedRelationshipId) {
            this.saveState();
            const selectedRel = this.relationships.find(r => r.id === this.selectedRelationshipId);
            const deleteIds = selectedRel
                ? this.getFamilyRelationshipIdsForDeletion(selectedRel)
                : [this.selectedRelationshipId];

            const deleteSet = new Set(deleteIds);
            this.relationships = this.relationships.filter(r => !deleteSet.has(r.id));
            this.selectedRelationshipId = null;
            if (selectedRel) {
                const relCategory = typeof selectedRel.getCategory === 'function'
                    ? selectedRel.getCategory()
                    : Relationship.getCategory(selectedRel.type);
                if (relCategory === 'family' && deleteIds.length > 1) {
                    this.updateStatus(`已刪除 ${deleteIds.length} 條子女關係連結`, 'success');
                }
            }
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
            this._syncPersonMap();
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
            this._syncPersonMap();
            this.selectedPersonId = null;
            this.updatePropertyPanel();
            this.autoSave();
            this.render();
        }
    }

    /**
     * 繪製
     */
    /**
     * [B1-perf] rAF 合併：高頻 pointermove / wheel 一幀只畫一次。
     */
    requestRender() {
        if (this._renderRaf) return;
        this._renderRaf = requestAnimationFrame(() => {
            this._renderRaf = null;
            this.render();
        });
    }

    render() {
        if (this._renderRaf) {
            cancelAnimationFrame(this._renderRaf);
            this._renderRaf = null;
        }
        if (this.pendingFitFrame !== null) {
            cancelAnimationFrame(this.pendingFitFrame);
            this.pendingFitFrame = null;
        }
        this.waitForCurrentCanvasFonts(true);
        // [Sprint 2 Phase A] 注入 personMap 供 canvas 以 O(1) 查表取代 persons.find
        this.canvas.personMap = this.personMap;
        this.canvas.viewOptions = this.viewOptions;
        this.canvas.ageReferenceDate = this.ageReferenceDate; // [2-1]
        this.canvas.lodScale = this.canvas.scale; // [3-3] 螢幕 LOD（匯出期間 canvas 自行固定為 1）
        if (this.labelEditingPersonId !== this.selectedPersonId
            || !this.personMap.has(this.labelEditingPersonId)) {
            this.labelEditingPersonId = null;
        }
        this.canvas.suppressQuickAddButtons = this.currentTool !== 'select'
            || Boolean(this.labelEditingPersonId);
        // [Phase 0a] 一次性注入「快取的」KinshipEngine 與關係分類；canvas.render 讀取後即清，
        // 直接呼叫 canvas.render（測試/外部）時取不到 → 自行 fallback 重建，避免取到舊值。
        this.canvas._renderInputs = {
            kinship: this.getKinshipEngine(),
            split: this.getRelationshipSplit()
        };
        // [Fix] 生活圈改由 canvas.render 在「最底層」繪製（與匯出 z-order 一致，
        // 不再以 overlay 蓋在人物符號上罩染臨床底色）
        this.canvas.lifeCirclesToDraw = this.lifeCircles || [];
        this.canvas.selectedLifeCircleId = this.selectedLifeCircleId || null;
        this.canvas.placementPreview = this.placementSession
            ? { ...this.placementSession.candidate, ghostPerson: this.placementSession.ghostPerson,
                ghostPeople: this.placementSession.ghostPeople }
            : null;
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
        this.updateLabelPositionPopover();
        this.updateRoutingWarning();
        this.updateEmptyState(); // [R4]

        // 繪製生活圈預覽（正在繪製中，維持最上層）
        if (this.isDrawingLifeCircle && this.currentLifeCirclePoints.length > 0) {
            this.canvas.drawLifeCirclePreview(this.currentLifeCirclePoints, this.lifeCircleMousePos);
        }
        // [LC-2] 拖拉橢圓預覽
        if (this.ellipsePreview) {
            this.canvas.drawEllipsePreview(this.ellipsePreview.start, this.ellipsePreview.current);
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
     * 按鈕縮放走固定級距（瀏覽器式），確保 100% 一定回得去。
     * 乘除法級距（如 ×1.1 / ×0.9）互不相反，來回幾次就再也停不到 100%。
     */
    zoomStep(direction) {
        const steps = GenogramApp.ZOOM_STEPS;
        const current = this.canvas.scale;
        const epsilon = 0.001;
        const next = direction > 0
            ? steps.find(step => step > current + epsilon) ?? steps[steps.length - 1]
            : [...steps].reverse().find(step => step < current - epsilon) ?? steps[0];
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        this.canvas.setScale(next, centerX, centerY);
        this.updateZoomDisplay();
        this.render();
    }

    /**
     * 重置縮放並將視圖置中於圖形中央
     */
    resetZoom() {
        // 重置縮放為 100%
        this.canvas.scale = 1;

        // 如果有人物，計算邊界框並置中
        if (this.persons.length > 0) {
            // 計算所有人物的邊界框
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;

            this.persons.forEach(p => {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            });

            // 計算內容中心點
            const contentCenterX = (minX + maxX) / 2;
            const contentCenterY = (minY + maxY) / 2;

            // 計算畫布可視區域中心點
            const canvasWidth = this.canvas.canvas.width / (window.devicePixelRatio || 1);
            const canvasHeight = this.canvas.canvas.height / (window.devicePixelRatio || 1);
            const viewCenterX = canvasWidth / 2;
            const viewCenterY = canvasHeight / 2;

            // 設定偏移量，使內容中心對齊畫布中心
            this.canvas.offsetX = viewCenterX - contentCenterX;
            this.canvas.offsetY = viewCenterY - contentCenterY;
        } else {
            // 沒有人物時，重置偏移
            this.canvas.offsetX = 0;
            this.canvas.offsetY = 0;
        }

        this.updateZoomDisplay();
        this.render();
    }

    /**
     * [3-3] 定位案主：縮放回 100%、把案主置中並選取；多位案主時每按一次輪到下一位。
     */
    locateIdentifiedPatient() {
        const ips = this.persons.filter(p => p.isIdentifiedPatient);
        if (!ips.length) {
            this.updateStatus('尚未標記案主：選取成員後在屬性面板勾選「案主 / 關注成員」', 'warning',
                { autoHideMs: GenogramApp.STATUS_TIMEOUTS.passiveAlert });
            return;
        }
        let index = 0;
        if (ips.length > 1) {
            const currentIdx = ips.findIndex(p => p.id === this._lastLocatedIpId);
            index = (currentIdx + 1) % ips.length;
        }
        const target = ips[index];
        this._lastLocatedIpId = target.id;
        this.canvas.scale = 1;
        this.canvas.offsetX = this.canvas.width / 2 - target.x;
        this.canvas.offsetY = this.canvas.height / 2 - target.y;
        this.clearAllSelections();
        this.selectPerson(target.id);
        this.updateZoomDisplay();
        this.render();
        this.updateStatus(ips.length > 1
            ? `已定位案主 ${index + 1}/${ips.length}：${target.name || '未命名'}（再按一次切到下一位）`
            : `已定位案主：${target.name || '未命名'}`, 'info', { autoHideMs: GenogramApp.STATUS_TIMEOUTS.passive });
    }

    fitToView({ onlyIfNeeded = false } = {}) {
        const bounds = this.canvas.getContentBounds(this.persons, this.relationships,
            this.households || [], this.lifeCircles || [], this.viewOptions);
        if (!bounds) {
            this.canvas.scale = 1;
            this.canvas.offsetX = 0;
            this.canvas.offsetY = 0;
            this.updateZoomDisplay();
            this.render();
            return { fitted: false, limited: false, scale: 1 };
        }
        const availableWidth = Math.max(1, this.canvas.width - 48);
        const availableHeight = Math.max(1, this.canvas.height - 48);
        const requested = Math.min(1, availableWidth / bounds.width, availableHeight / bounds.height);
        const limited = requested < this.canvas.minScale;
        const scale = Math.max(this.canvas.minScale, requested);
        if (onlyIfNeeded && requested >= 1) this.canvas.scale = 1;
        else this.canvas.scale = scale;
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        this.canvas.offsetX = this.canvas.width / 2 - centerX * this.canvas.scale;
        this.canvas.offsetY = this.canvas.height / 2 - centerY * this.canvas.scale;
        this.updateZoomDisplay();
        this.render();
        if (limited) {
            this.updateStatus('內容範圍很大，已縮至最低 25%；可拖曳畫布查看其餘內容',
                'info', { autoHideMs: 3500 });
        }
        return { fitted: requested < 1, limited, scale: this.canvas.scale };
    }

    /**
     * 更新縮放顯示
     */
    updateZoomDisplay() {
        this.elements.zoomLevel.textContent = Math.round(this.canvas.scale * 100) + '%';
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
        if (this.isSavingState) return false;
        this.isSavingState = true;
        try {
            if (this.isPreviewingLayout) this.cancelPreviewedLayout();
            this.commitPropertyEditSession();
            this.markDirty(); // [1-2]
            this.history.pushState(this.getState());
            this.updateToolbar();
            return true;
        } finally {
            this.isSavingState = false;
        }
    }

    updateRoutingWarning() {
        const node = this.elements.routingWarning;
        if (!node) return;
        // 重疊資訊只保留為內部幾何診斷，不在編輯器顯示文字警告。
        // 預設允許文字壓線，使用者可透過人物屬性的八方向按鈕自行微調。
        node.hidden = true;
        node.textContent = '';
    }

    resetTransientStateForHistory() {
        const dragStartSnapshot = this.dragStartSnapshot;
        if (dragStartSnapshot) {
            this.persons = dragStartSnapshot.persons.map(p => Person.fromJSON(p));
            this._syncPersonMap();
            this.relationships = dragStartSnapshot.relationships.map(r => Relationship.fromJSON(r));
            this.households = (dragStartSnapshot.households || []).map(h => ({
                ...h, ids: [...(h.ids || [])]
            }));
            this.lifeCircles = (dragStartSnapshot.lifeCircles || []).map(lc => ({
                ...lc,
                points: (lc.points || []).map(p => ({ x: p.x, y: p.y }))
            }));
        }
        if (this.canvas && this.activePointerId !== null &&
            this.canvas.canvas.hasPointerCapture(this.activePointerId)) {
            this.canvas.canvas.releasePointerCapture(this.activePointerId);
        }
        this.activePointerId = null;
        this.modalManager?.closeAll({ restoreFocus: false });
        this.pendingGeneration = null;
        this.quickAddContext = null;
        this.pendingParents = null;
        this.selectedChildrenIds = [];
        this.cancelPlacement();
        this.cancelRelationshipWorkflow();
        this.editingRelationshipId = null;
        const swapButton = document.getElementById('swapRelationshipDirection');
        if (swapButton) swapButton.style.display = 'none';
        const relationshipTitle = this.elements.relationshipModal?.querySelector('.modal-title');
        if (relationshipTitle) relationshipTitle.textContent = '選擇關係類型';
        this.isBoxSelecting = false;
        this.isDrawingLifeCircle = false;
        this.currentLifeCirclePoints = [];
        this.lifeCircleMousePos = null;
        this.dragStartSnapshot = null;
        this.dragVirtual = null;
        this.dragGuides = null;
        if (this.canvas) {
            this.canvas.isDragging = false;
            this.canvas.isPanning = false;
            this.canvas.dragStart = null;
            this.canvas.panStart = null;
            this.canvas.dragGuides = null;
            this.canvas.placementPreview = null;
            this.canvas.draggedPerson = null;
            this.canvas.draggedHousehold = null;
            this.canvas.draggedLifeCircle = null;
        }
        this.cancelPropertyEditSession();
    }

    /**
     * 撤銷
     */
    undo() {
        this.commitPropertyEditSession();
        this.resetTransientStateForHistory();
        // [UX Fix] 如果正在預覽自動排列，撤銷時僅取消預覽，不執行歷史回溯
        if (this.isPreviewingLayout) {
            this.cancelPreviewedLayout();
            return;
        }

        const currentState = this.getState();
        const selectedPersonId = this.selectedPersonId;
        const selectedRelationshipId = this.selectedRelationshipId;
        const selectedHouseholdId = this.selectedHouseholdId;
        const selectedLifeCircleId = this.selectedLifeCircleId;

        const prevState = this.history.undo(currentState);
        if (prevState) {
            this.persons = prevState.persons.map(p => Person.fromJSON(p));
            this._syncPersonMap();
            this.selectedPersonIds = this.selectedPersonIds.filter(id => this.personMap.has(id));
            this.relationships = prevState.relationships.map(r => Relationship.fromJSON(r));
            this.households = prevState.households || [];
            this.lifeCircles = prevState.lifeCircles || [];
            this.selectedPersonId = this.personMap.has(selectedPersonId) ? selectedPersonId : null;
            this.selectedRelationshipId = this.relationships.some(r => r.id === selectedRelationshipId)
                ? selectedRelationshipId : null;
            this.selectedHouseholdId = this.households.some(h => h.id === selectedHouseholdId)
                ? selectedHouseholdId : null;
            this.selectedLifeCircleId = this.lifeCircles.some(lc => lc.id === selectedLifeCircleId)
                ? selectedLifeCircleId : null;
            this.updatePropertyPanel();
            this.markDirty(); // [1-2] 復原/重做後內容與檔案不同步
            this.autoSave();
            this.render();
        } else this.render();
        this.updateToolbar();
    }

    /**
     * 重做
     */
    redo() {
        this.commitPropertyEditSession();
        this.resetTransientStateForHistory();
        // [UX Fix] 如果正在預覽自動排列，重做時僅取消預覽 (視為退出預覽模式)
        if (this.isPreviewingLayout) {
            this.cancelPreviewedLayout();
            return;
        }

        const currentState = this.getState();
        const selectedPersonId = this.selectedPersonId;
        const selectedRelationshipId = this.selectedRelationshipId;
        const selectedHouseholdId = this.selectedHouseholdId;
        const selectedLifeCircleId = this.selectedLifeCircleId;

        const nextState = this.history.redo(currentState);
        if (nextState) {
            this.persons = nextState.persons.map(p => Person.fromJSON(p));
            this._syncPersonMap();
            this.selectedPersonIds = this.selectedPersonIds.filter(id => this.personMap.has(id));
            this.relationships = nextState.relationships.map(r => Relationship.fromJSON(r));
            this.households = nextState.households || [];
            this.lifeCircles = nextState.lifeCircles || [];
            this.selectedPersonId = this.personMap.has(selectedPersonId) ? selectedPersonId : null;
            this.selectedRelationshipId = this.relationships.some(r => r.id === selectedRelationshipId)
                ? selectedRelationshipId : null;
            this.selectedHouseholdId = this.households.some(h => h.id === selectedHouseholdId)
                ? selectedHouseholdId : null;
            this.selectedLifeCircleId = this.lifeCircles.some(lc => lc.id === selectedLifeCircleId)
                ? selectedLifeCircleId : null;
            this.updatePropertyPanel();
            this.markDirty(); // [1-2] 復原/重做後內容與檔案不同步
            this.autoSave();
            this.render();
        } else this.render();
        this.updateToolbar();
    }

    /**
     * [Bug Fix #3] 取得當前狀態快照 (用於拖曳 History 比對)
     */
    getState() {
        // [Fix] households / lifeCircles 也要深拷貝：
        // 原本回傳活引用，拖曳期間 points/ids 被原地修改會污染快照
        // （dragStartSnapshot 比對自己 vs 自己 → 永遠「無變化」→ 拖曳進不了 history）
        return {
            persons: this.persons.map(p => p.toJSON()),
            relationships: this.relationships.map(r => r.toJSON()),
            households: (this.households || []).map(h => ({ ...h, ids: [...(h.ids || [])] })),
            lifeCircles: (this.lifeCircles || []).map(lc => ({
                ...lc,
                points: (lc.points || []).map(p => ({ x: p.x, y: p.y }))
            }))
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

        // [Fix] 生活圈拖曳也算顯著變化（否則拖圈的 snapshot 永遠不會進 history）
        const oldCircles = {};
        (oldState.lifeCircles || []).forEach(lc => { oldCircles[lc.id] = lc.points || []; });
        for (const lc of (newState.lifeCircles || [])) {
            const oldPts = oldCircles[lc.id];
            if (!oldPts || !lc.points) continue;
            for (let i = 0; i < Math.min(oldPts.length, lc.points.length); i++) {
                if (Math.abs(lc.points[i].x - oldPts[i].x) >= threshold ||
                    Math.abs(lc.points[i].y - oldPts[i].y) >= threshold) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 載入數據到應用程式
     */
    loadData(data) {
        // [R4] 較新版本檔案的提醒（由 storage.migrate 設定）；延後顯示，才不會被「已載入」蓋掉
        const loadNotice = this.storage && this.storage.lastLoadNotice;
        if (loadNotice) {
            this.storage.lastLoadNotice = null;
            setTimeout(() => this.updateStatus(loadNotice, 'warning', { autoHideMs: 9000 }), 80);
        }
        if (this.isPreviewingLayout) this.cancelPreviewedLayout();
        this.commitPropertyEditSession();
        this.cancelPlacement();
        this.cancelRelationshipWorkflow();
        this.saveState();
        this.persons = (data.persons || []).map(p => Person.fromJSON(p));
        this._syncPersonMap();
        this.relationships = (data.relationships || []).map(r => Relationship.fromJSON(r));
        // [Fix] 清洗外部資料：移除指向不存在人物的 household 成員與空框（ghost household
        // 看不見、點不到、刪不掉，卻會永久跟著存檔）；生活圈頂點也驗證合法性
        this.households = (data.households || []).map(h => ({
            ...h,
            ids: (h.ids || []).filter(id => this.personMap.has(id))
        })).filter(h => h.ids.length > 0);
        this.lifeCircles = (data.lifeCircles || []).filter(lc =>
            Array.isArray(lc.points) && lc.points.length >= 3 &&
            lc.points.every(p => typeof p.x === 'number' && typeof p.y === 'number' &&
                !isNaN(p.x) && !isNaN(p.y))
        );
        this.documentMeta = GenogramApp.normalizeDocumentMeta(data.meta); // [2-2]
        const norm = this.normalizeLoadedFamilyRelationships();
        this.selectedPersonId = null;
        this.updatePropertyPanel();
        this.autoSave();
        if (this.pendingFitFrame !== null) cancelAnimationFrame(this.pendingFitFrame);
        this.pendingFitFrame = requestAnimationFrame(() => {
            this.pendingFitFrame = null;
            this.fitToView({ onlyIfNeeded: true });
        });

        this.isDirty = false; // [1-2] 剛載入 = 與檔案一致
        this.updateDocumentTitle();

        // [1-3] 只有真的改了東西才提示，且用使用者看得懂的說法（原「調整/去重/移除」是工程用語）
        if ((norm.normalized + norm.deduped + norm.dropped) > 0) {
            const parts = [];
            if (norm.normalized) parts.push(`修正親子方向 ${norm.normalized} 筆`);
            if (norm.deduped) parts.push(`合併重複關係 ${norm.deduped} 筆`);
            if (norm.dropped) parts.push(`移除無效關係 ${norm.dropped} 筆`);
            this.updateStatus(
                `已自動整理舊版檔案的關係資料：${parts.join('、')}`,
                'info', { autoHideMs: GenogramApp.STATUS_TIMEOUTS.passiveAlert }
            );
        }
    }

    static formatRecentTime(ts) {
        if (!Number.isFinite(ts)) return '';
        const d = new Date(ts);
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    /**
     * 顯示匯出格式選擇對話框
     */
    /**
     * [2-2] 文件 meta 正規化（只保留三個字串欄位）
     */
    static normalizeDocumentMeta(meta) {
        const src = meta && typeof meta === 'object' ? meta : {};
        const pick = key => (typeof src[key] === 'string' ? src[key].trim() : '');
        return { title: pick('title'), caseId: pick('caseId'), author: pick('author') };
    }

    static EXPORT_PREFS_KEY = 'genogram_export_prefs';

    /**
     * [3-1] 年齡 → 年齡帶（十年一段：0-9、10-19…）；無法解析回 null
     */
    static ageBand(age) {
        const n = typeof age === 'number' ? age
            : (typeof age === 'string' && age.trim() !== '' ? Number(age) : NaN);
        if (!Number.isFinite(n) || n < 0) return null;
        const lo = Math.floor(n / 10) * 10;
        return `${lo}-${lo + 9}`;
    }

    static formatLocalDate(d = new Date()) {
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }




}

// 啟動應用程式
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GenogramApp();
});
