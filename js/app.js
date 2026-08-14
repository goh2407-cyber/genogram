/**
 * GenogramApp - 主應用程式
 */
const PROPERTY_PANEL_TEMPLATES = Object.freeze({
    empty: '<p class="empty-hint">點選成員、關係線或圈選框以編輯屬性</p>',
    relationship: `
        <div class="property-form">
            <div class="form-group">
                <label>關係類型</label>
                <div style="padding: 8px; background: var(--bg-light); border-radius: 4px;">
                    <strong id="relationshipTypeName"></strong>
                </div>
                <small id="relationshipEndpoints" style="color: var(--text-secondary); margin-top: 4px; display: block;"></small>
            </div>
            <div class="form-group">
                <label for="relationshipDate">時間/說明 (顯示於線上)</label>
                <textarea id="relationshipDate" rows="2" placeholder="例如：結婚 2010 (換行) 離婚 2020"></textarea>
            </div>
            <div style="margin-top: 12px;">
                <button class="btn-cancel" id="deleteRelationshipBtn" style="width: 100%;">刪除此關係</button>
            </div>
        </div>`,
    household: `
        <div class="property-form">
            <div class="form-group">
                <label id="householdMemberCount"></label>
                <div id="householdMembers" style="padding: 8px 12px; background: var(--bg-light); border-radius: 4px; font-size: 13px; line-height: 1.6;"></div>
            </div>
            <div class="form-group">
                <label for="householdNotes">備註</label>
                <textarea id="householdNotes" rows="2" placeholder="同住情形補充說明"></textarea>
            </div>
            <div style="margin-top: 12px;">
                <button class="btn-cancel" id="deleteHouseholdBtn" style="width: 100%;">刪除此同住框</button>
            </div>
        </div>`,
    lifeCircle: `
        <div class="property-form">
            <div class="form-group">
                <label for="lifeCircleLabel">生活圈名稱（顯示於圈上）</label>
                <input type="text" id="lifeCircleLabel" placeholder="例如：學校、教會、社區據點">
            </div>
            <div class="form-group">
                <label>顏色</label>
                <div id="lifeCircleSwatches" style="display: flex; gap: 8px; flex-wrap: wrap;"></div>
            </div>
            <div style="margin-top: 12px;">
                <button class="btn-cancel" id="deleteLifeCircleBtn" style="width: 100%;">刪除此生活圈</button>
            </div>
        </div>`,
    person: `
        <form class="property-form" id="personForm">
            <div class="form-group">
                <label for="personName">姓名/稱謂</label>
                <input type="text" id="personName" placeholder="輸入姓名">
            </div>
            <div class="form-group-row">
                <div class="form-group">
                    <label for="personAge">年齡</label>
                    <input type="number" id="personAge" min="0" max="150" placeholder="年齡">
                </div>
                <div class="form-group">
                    <label for="personGender">性別</label>
                    <select id="personGender">
                        <option value="male">男性</option>
                        <option value="female">女性</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="personDeceased">
                    <label for="personDeceased">已過世</label>
                </div>
            </div>
            <div class="form-group">
                <label for="personLossType">生育結果</label>
                <select id="personLossType">
                    <option value="">正常</option>
                    <option value="miscarriage">流產（自然）</option>
                    <option value="abortion">人工流產</option>
                </select>
            </div>
            <div class="form-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="personIP">
                    <label for="personIP">案主 / 關注對象</label>
                </div>
            </div>
            <div class="form-group">
                <label for="personNotes">備註</label>
                <textarea id="personNotes" rows="2" placeholder="備註 (顯示於姓名下方)"></textarea>
            </div>
            <div id="twinSettingsHost"></div>
            <hr style="margin: 15px 0; border: 0; border-top: 1px solid var(--border-color);">
            <h4 style="margin-bottom: 10px; font-size: 14px; color: var(--text-color);">醫學與狀態</h4>
            <div class="form-group">
                <label for="medLeftHalf">生理/心理疾病 (左半部)</label>
                <select id="medLeftHalf">
                    <option value="none">無</option>
                    <option value="striped">疑似 (斜線)</option>
                    <option value="filled">嚴重/確診 (填滿)</option>
                </select>
            </div>
            <div class="form-group">
                <label for="medBottomHalf">酒精/藥物濫用 (下半部)</label>
                <select id="medBottomHalf">
                    <option value="none">無</option>
                    <option value="striped">疑似 (斜線)</option>
                    <option value="filled">確診 (填滿)</option>
                </select>
            </div>
            <div class="form-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="medSmoker">
                    <label for="medSmoker">吸菸 (S)</label>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="medObese">
                    <label for="medObese">肥胖 (O)</label>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="medLang">
                    <label for="medLang">語言障礙 (L)</label>
                </div>
            </div>
            <hr style="margin: 15px 0; border: 0; border-top: 1px solid var(--border-color);">
            <div style="margin-top: 12px;">
                <button type="button" class="btn-cancel" id="deletePersonBtn" style="width: 100%;">刪除此成員</button>
            </div>
        </form>`
});

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

        this.pendingGeneration = null; // 等待選擇性別的輩分
        this.hoveredPersonId = null; // 滑鼠 hover 的角色 ID
        this.quickAddContext = null; // 快速新增的上下文 {personId, type}
        this.placementSession = null; // 智慧格位純狀態；後續任務才接畫面與互動

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
            [this.elements.childrenModal, () => this.closeChildrenModal(), '#skipChildren'],
            [this.elements.helpModal, () => this.closeHelpModal(), '#closeHelp'],
            [this.elements.exportModal, () => this.closeExportModal(), '.export-option-btn']
        ];
        registrations.forEach(([overlay, requestClose, initialFocus]) =>
            this.modalManager.register(overlay, { requestClose, initialFocus }));
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
            this.showGenderModal('parent', '新增人物'));

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
        if (this.elements.copyImageBtn) {
            this.elements.copyImageBtn.addEventListener('click', () => this.copyImageToClipboard());
        }
        if (this.elements.clearAllBtn) {
            this.elements.clearAllBtn.addEventListener('click', () => this.clearAll());
        }

        this.elements.helpBtn?.addEventListener('click', () => this.openHelpModal());
        this.elements.closeHelpBtn?.addEventListener('click', () => this.closeHelpModal());
        this.elements.cancelExport?.addEventListener('click', () => this.closeExportModal());
        document.querySelectorAll('.export-option-btn').forEach(button => {
            button.addEventListener('click', () => {
                const format = button.dataset.format;
                this.closeExportModal();
                this.handleExportFormat(format);
            });
        });

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

        // 關係類型按鈕
        document.querySelectorAll('.rel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // 使用 currentTarget 確保抓到的是按鈕本身而不是內部的圖示 (span)
                const type = e.currentTarget.dataset.type;
                // [Phase 1] 親子按鈕帶 data-link-type（biological/adopted/foster）；其餘關係無此屬性
                const linkType = e.currentTarget.dataset.linkType || null;

                // 判斷是編輯模式還是新建模式
                if (this.editingRelationshipId) {
                    // 編輯模式：更新現有關係的類型
                    this.updateRelationshipType(type, linkType);
                } else {
                    // 新建模式：建立新關係
                    this.createRelationship(type, linkType);
                }
            });
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
            });
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
                statusText = '範圍圈選：拖曳滑鼠圈選多個人物';
                break;
            case 'connect':
                statusText = '連接工具：依序點擊兩個人物建立關係';
                this.connectingFrom = null;
                break;
            case 'household':
                // [UX Fix] 改用點選模式，更直覺好用
                if (this.selectedPersonIds.length > 0) {
                    statusText = `已選取 ${this.selectedPersonIds.length} 位成員，按 Enter 建立同住框`;
                } else {
                    statusText = '同住圈選：點選角色加入選取，按 Enter 建立';
                }
                break;
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
        const duration = autoHideMs !== undefined
            ? autoHideMs
            : (type === 'success' ? GenogramApp.STATUS_TIMEOUTS.passive : null);
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
     * 處理指標按下 (Pointer Events 統一滑鼠與觸控)
     */
    handlePointerDown(e) {
        // [Fix] 只處理主鍵（左鍵/觸控/筆）：右鍵、中鍵不該加生活圈頂點或觸發拖曳
        if (typeof e.button === 'number' && e.button > 0) return;

        // Pointer capture for robust drag handling
        if (e.target === this.canvas.canvas) {
            this.activePointerId = e.pointerId;
            this.canvas.canvas.setPointerCapture(e.pointerId);
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
                // Toggle 選取狀態
                const index = this.selectedPersonIds.indexOf(clickedPerson.id);
                if (index > -1) {
                    this.selectedPersonIds.splice(index, 1);
                } else {
                    this.selectedPersonIds.push(clickedPerson.id);
                }

                if (this.selectedPersonIds.length > 0) {
                    this.updateStatus(`已選取 ${this.selectedPersonIds.length} 位成員，按 Enter 建立同住框`, 'info');
                } else {
                    this.updateStatus('同住圈選：點選角色加入選取，按 Enter 建立');
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
                this.updateStatus('連接工具：依序點擊兩個人物建立關係');
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
                    }
                }
            }

            // 姓名／備註是獨立的文字編輯命中區。點文字只選人物與開啟文字控制，
            // 不啟動人物拖曳，也不顯示人物周圍的快速新增功能圈。
            const clickedLabelPerson = this.getPersonLabelAt(point.x, point.y);
            if (clickedLabelPerson) {
                this.selectedPersonIds = [];
                this.selectPerson(clickedLabelPerson.id, { labelEditing: true });
                this.updateStatus('已選取人物文字，可在文字旁調整位置', 'info');
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
                    this.updateStatus('正在拖曳同住家庭 (放開滑鼠以完成)', 'info');
                    this.render();
                    return;
                } else {
                    this.selectRelationship(clickedRel.id);
                    this.selectedPersonIds = [];
                    return;
                }
            }

            // 3. 檢查是否點擊到生活圈「邊界帶」
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
                    this.updateStatus('正在拖曳同住家庭 (放開滑鼠以完成)', 'info');
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
                    this.updateStatus('正在移動選取對象...', 'info');
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
    }

    /**
     * 處理指標移動 (Pointer Events 統一滑鼠與觸控)
     */
    handlePointerMove(e) {
        if (!this.canvas) return; // 確保 canvas 已初始化

        const point = this.canvas.getMousePos(e);

        if (this.placementSession) {
            this.updatePlacement(point.x, point.y, e.altKey);
            this.render();
            return;
        }

        // [Fix] 生活圈繪製中：跟隨滑鼠的橡皮筋預覽線（原 lifeCircleMousePos 從未被更新）
        if (this.currentTool === 'lifeCircle' && this.isDrawingLifeCircle) {
            this.lifeCircleMousePos = point;
            this.render();
            return;
        }

        // [Fix B2] 連接工具：已選第一位後，預覽線跟隨滑鼠
        // （canvas 端只在 connectingFrom.targetX 有值時才畫，原本此值從未被更新 → 看不到橡皮筋線）
        if (this.currentTool === 'connect' && this.connectingFrom) {
            this.connectingFrom.targetX = point.x;
            this.connectingFrom.targetY = point.y;
            this.render();
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
                    }
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
            const panel = document.createElement('div');
            panel.className = 'panel-content';
            const message = document.createElement('p');
            message.textContent = `已選取 ${this.selectedPersonIds.length} 位成員`;
            panel.appendChild(message);
            content.replaceChildren(panel);
            this.updateStatus(`已選取 ${this.selectedPersonIds.length} 位成員`, 'info');
        }
    }

    /**
     * 處理滾輪縮放
     */
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
    }

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
    }

    commitPropertyEditSession() {
        const session = this.propertyEditSession;
        this.propertyEditSession = null;
        if (!session) return false;
        const afterSignature = JSON.stringify(this.getState());
        if (afterSignature === session.beforeSignature) return false;
        this.history.pushState(session.before);
        this.updateToolbar();
        return true;
    }

    cancelPropertyEditSession() {
        this.propertyEditSession = null;
    }

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
    }

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
                if (this.placementSession) {
                    this.cancelPlacement();
                    this.updateStatus('新增人物已取消', 'info');
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
     * 取得指定座標下可見的姓名／備註擁有者。
     * 年齡位於人物符號內，維持人物本身的命中與快速功能圈語意。
     */
    getPersonLabelAt(x, y) {
        const view = this.canvas.normalizeViewOptions(this.viewOptions);
        if (!view.showNames && !view.showNotes) return null;
        for (let i = this.persons.length - 1; i >= 0; i--) {
            const person = this.persons[i];
            const geometry = this.canvas.getPersonLabelGeometry(person, view);
            const hit = geometry.rows.some(row => x >= row.bounds.left - 3
                && x <= row.bounds.right + 3 && y >= row.bounds.top - 3
                && y <= row.bounds.bottom + 3);
            if (hit) return person;
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
        const candidates = [];

        // 從後往前檢查（後建立的在上層）
        for (let i = this.relationships.length - 1; i >= 0; i--) {
            const rel = this.relationships[i];
            if (!this.viewOptions.showEmotionalRelationships
                && Relationship.isEmotionalDisplayType(rel.type)) continue;
            const fromPerson = this.personMap.get(rel.fromPersonId);
            const toPerson = this.personMap.get(rel.toPersonId);
            if (fromPerson && toPerson) {
                if (!this.canvas.isPointOnRelationship(x, y, fromPerson, toPerson, rel, 14, this.relationships)) {
                    continue;
                }

                const category = typeof rel.getCategory === 'function'
                    ? rel.getCategory()
                    : Relationship.getCategory(rel.type);
                const path = this.canvas.getRelationshipPath(fromPerson, toPerson, rel, this.relationships);
                const pathLen = (typeof this.canvas.getPathLength === 'function')
                    ? this.canvas.getPathLength(path)
                    : path.length;

                // 計算點到此關係路徑的最短距離
                let minDist = Number.POSITIVE_INFINITY;
                for (let j = 0; j < path.length - 1; j++) {
                    const p1 = path[j];
                    const p2 = path[j + 1];
                    const d = this.canvas.distanceToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y);
                    if (d < minDist) minDist = d;
                }
                if (!Number.isFinite(minDist)) minDist = 9999;

                const ys = path.map(p => p.y);
                const verticalSpan = ys.length > 0 ? (Math.max(...ys) - Math.min(...ys)) : 0;

                candidates.push({
                    rel,
                    category,
                    minDist,
                    pathLen,
                    verticalSpan,
                    zIndex: i
                });
            }
        }

        if (candidates.length === 0) return null;

        // 以「距離最近」為主；family 線重疊時優先選擇跨度較大/路徑較長者
        candidates.sort((a, b) => {
            if (a.minDist !== b.minDist) return a.minDist - b.minDist;

            const aFamily = a.category === 'family';
            const bFamily = b.category === 'family';
            if (aFamily && bFamily) {
                if (a.verticalSpan !== b.verticalSpan) return b.verticalSpan - a.verticalSpan;
                if (a.pathLen !== b.pathLen) return b.pathLen - a.pathLen;
            }

            // 後建立者優先（維持原本由上而下點選習慣）
            return b.zIndex - a.zIndex;
        });

        return candidates[0].rel;
    }

    /**
     * 取得指定座標的圈選框
     */
    getHouseholdAt(x, y) {
        if (!this.viewOptions.showHouseholds) return null;
        // [Fix] 容差隨縮放換算（螢幕上 ~15px 恆定，限 8~25 世界 px）
        const tolerance = Math.min(25, Math.max(8, 15 / ((this.canvas && this.canvas.scale) || 1)));

        // [Fix] 巢狀/重疊框：收集所有命中者，回傳「面積最小」的框，
        // 內層小框才選得到（原本依陣列順序先中先贏，小框永遠輸給大框）
        let best = null;
        let bestArea = Infinity;
        for (let i = this.households.length - 1; i >= 0; i--) {
            const household = this.households[i];
            if (this.canvas.isPointOnHouseholdBoundary(x, y, household, this.persons, this.relationships, tolerance)) {
                const b = this.canvas.getHouseholdBounds(household, this.persons, this.relationships);
                const area = b ? (b.maxX - b.minX) * (b.maxY - b.minY) : Infinity;
                if (area < bestArea) {
                    bestArea = area;
                    best = household;
                }
            }
        }
        return best;
    }

    /**
     * 偵測點擊位置是否在生活圈「邊界帶或頂點」上
     * [Fix] 改為平滑曲線邊界帶判定：
     * 1. 命中區域與畫面上實際看到的平滑形狀一致（原本用平滑前多邊形，外凸區點不到）
     * 2. 圈內空白不再攔截點擊 — 大生活圈罩住全圖時仍可平移畫布、選取人物
     */
    getLifeCircleAt(x, y) {
        if (!this.viewOptions.showLifeCircles) return null;
        const tol = Math.min(20, Math.max(8, 12 / ((this.canvas && this.canvas.scale) || 1)));
        // 從後往前檢查（後建立的在上層）
        for (let i = this.lifeCircles.length - 1; i >= 0; i--) {
            const lc = this.lifeCircles[i];
            if (this.canvas.isPointOnLifeCircleEdge(lc, x, y, tol)) {
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
    }

    beginQuickRelativePlacement(basePerson, kind, gender, extras = {}) {
        const session = this.beginPlacement({ kind, basePersonId: basePerson.id, gender,
            generation: kind === 'child' ? this.getGenerationBelow(basePerson.generation) : basePerson.generation,
            ...extras });
        this.updateStatus('請選擇新增人物的位置', 'info');
        this.render();
        return session;
    }

    beginQuickParentPlacement(child) {
        const parentIds = this.getKinshipEngine().getParentIds(child.id);
        if (parentIds.length >= 2) {
            this.cancelPlacement();
            this.updateStatus('此人物已有 2 位父母，無法再新增父母', 'error');
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
            this.updateStatus('父母位置受阻，確認後會將此人物向外微調', 'info');
        }
        this.render();
        return session;
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
            const empty = document.createElement('div');
            empty.className = 'property-help';
            empty.textContent = '（尚無同父母的兄弟姊妹）';
            section.appendChild(empty);
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
                const memberNames = household.ids
                    .map(id => this.personMap.get(id))
                    .filter(p => p)
                    .map(p => p.name || '未命名')
                    .join('、');
                root.querySelector('#householdMemberCount').textContent = `同住家庭（${household.ids.length} 位成員）`;
                root.querySelector('#householdMembers').textContent = memberNames || '（無成員）';
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
            personIP: Boolean(person.isIdentifiedPatient),
            medSmoker: Boolean(person.medical?.isSmoker),
            medObese: Boolean(person.medical?.isObese),
            medLang: Boolean(person.medical?.hasLanguageProblem)
        };
        Object.entries(checkedById).forEach(([id, checked]) => {
            const field = root.querySelector(`#${id}`);
            if (field) field.checked = checked;
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
    }

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
    }

    /**
     * 直接寫入文字位移並重畫（不碰 history，由呼叫端決定何時記錄）。
     */
    setSelectedPersonLabelOffset(offsetX, offsetY) {
        const person = this.personMap.get(this.selectedPersonId);
        if (!person) return;
        const next = { offsetX: Math.round(offsetX), offsetY: Math.round(offsetY) };
        person.labelPlacement = next.offsetX || next.offsetY ? next : null;
        this.render();
    }

    resetSelectedPersonLabel() {
        const person = this.personMap.get(this.selectedPersonId);
        if (!person || !person.labelPlacement) return;
        this.saveState();
        person.labelPlacement = null;
        this.autoSave();
        this.render();
    }

    setupLabelPositionPopover() {
        const popover = this.elements.labelPositionPopover;
        if (!popover) return;
        this.bindLabelJoystickKnob(popover.querySelector('#labelJoystickKnob'));
        this.bindLabelPopoverDrag(popover);
    }

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
    }

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
    }

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
    }

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
    }

    /**
     * 建立同住家庭
     */
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
            id: 'house_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
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
            ? `同住圈選已建立（${movedOut} 位成員已從原同住框移出）`
            : '同住圈選已建立', 'success');
        this.autoSave();
        this.render();
    }

    /**
     * 完成生活圈繪製
     */
    finishLifeCircle() {
        // [Fix] 去除相鄰重複頂點（雙擊完成前的兩次 pointerdown 會塞入同一點，
        // Catmull-Rom 遇重複點會在收尾處畫出打結小圈）；頭尾也比對一次
        let pts = this.currentLifeCirclePoints.filter((p, i, a) =>
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
            id: 'lc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
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
        // [Fix] 改取「第一個未被使用」的顏色：原本以 length 取模，刪除後再建會與既有圈撞色
        const colors = GenogramApp.LIFE_CIRCLE_COLORS;
        const used = new Set(this.lifeCircles.map(lc => lc.color));
        const unused = colors.find(c => !used.has(c));
        return unused || colors[this.lifeCircles.length % colors.length];
    }

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

        // 年齡
        this.bindPropertyEdit(document.getElementById('personAge'), e => {
            const raw = e.target.value;
            person.age = raw === '' ? null : Number(raw);
        });

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
        }, { eventName: 'change', commitOnChange: true });

        // 案主
        this.bindPropertyEdit(document.getElementById('personIP'), e => {
            person.isIdentifiedPatient = e.target.checked;
        }, { eventName: 'change', commitOnChange: true });

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
                        twinGroupId = 'twin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
        if (this.isPreviewingLayout) this.cancelPreviewedLayout();
        this.commitPropertyEditSession();
        const sb = document.getElementById('swapRelationshipDirection');
        if (sb) sb.style.display = 'none'; // 新建模式不顯示對調
        this.modalManager.open(this.elements.relationshipModal);
    }

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
    }

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
        this.modalManager.open(this.elements.relationshipModal);
    }

    /**
     * 關閉關係選擇對話框
     */
    closeRelationshipModal() {
        this.modalManager.close(this.elements.relationshipModal);
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
    }

    /**
     * [Phase 1] 對調關係方向（fromPersonId ⇄ toPersonId）。
     * 用途：修正畫反的方向性關係——如虐待箭頭指錯人、親子上下顛倒。
     */
    swapRelationshipDirection() {
        // modal 版：對調目前編輯中的關係，然後關閉
        const id = this.editingRelationshipId;
        this.closeRelationshipModal();
        if (id) this.swapRelationshipDirectionById(id);
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

    /**
     * 關閉選擇子女對話框
     */
    closeChildrenModal() {
        if (this.elements.childrenModal) {
            this.modalManager.close(this.elements.childrenModal);
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
    }

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
    }

    /**
     * 載入舊資料時正規化親子關係，避免錯向/重複資料影響點擊與顯示
     * @returns {{normalized: number, deduped: number, dropped: number}}
     */
    normalizeLoadedFamilyRelationships() {
        const personById = new Map(this.persons.map(p => [p.id, p]));
        const seenParentChild = new Set();
        const stats = { normalized: 0, deduped: 0, dropped: 0 };
        const nextRels = [];

        this.relationships.forEach(rel => {
            let category = typeof rel.getCategory === 'function'
                ? rel.getCategory()
                : Relationship.getCategory(rel.type);

            // 舊版相容：family 視為 parent-child
            if (rel.type === 'family') {
                rel.type = 'parent-child';
                category = 'family';
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

            // 以 Y 軸位置統一 parent -> child 方向
            let parentId = rel.fromPersonId;
            let childId = rel.toPersonId;
            if (p1.y < p2.y) {
                parentId = p1.id;
                childId = p2.id;
            } else if (p2.y < p1.y) {
                parentId = p2.id;
                childId = p1.id;
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
    render() {
        if (this.pendingFitFrame !== null) {
            cancelAnimationFrame(this.pendingFitFrame);
            this.pendingFitFrame = null;
        }
        this.waitForCurrentCanvasFonts(true);
        // [Sprint 2 Phase A] 注入 personMap 供 canvas 以 O(1) 查表取代 persons.find
        this.canvas.personMap = this.personMap;
        this.canvas.viewOptions = this.viewOptions;
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

        // 繪製生活圈預覽（正在繪製中，維持最上層）
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
    }

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
    }

    getCurrentCanvasFontText() {
        const legend = document.getElementById('legendContent')?.textContent || '';
        // Canvas text fields: person name/age/notes, relationship notes/date, and life-circle labels.
        // Medical markers are vector/ASCII symbols and do not contribute arbitrary font glyphs.
        const personText = this.persons.flatMap(person => [person.name, person.age, person.notes]).filter(Boolean);
        const relationshipText = this.relationships.flatMap(rel => [rel.notes, rel.date]).filter(Boolean);
        const lifeCircleText = (this.lifeCircles || []).map(lc => lc.label).filter(Boolean);
        return [legend, ...personText, ...relationshipText, ...lifeCircleText].join('\n');
    }

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
    }

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
    }

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
    }

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
        this.updateStatus('請選擇新增人物的位置', 'info');
        return this.placementSession;
    }

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
    }

    cancelPlacement() {
        if (this.placementSession && this.placementSession.selectionBefore) {
            const before = this.placementSession.selectionBefore;
            this.selectedPersonId = before.selectedPersonId;
            this.selectedPersonIds = [...before.selectedPersonIds];
            this.selectedRelationshipId = before.selectedRelationshipId;
        }
        this.placementSession = null;
    }

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
            this.updateStatus('已建立人物', 'success');
            return session;
        }
        this.placementSession = null;
        return session;
    }

    /**
     * 依照與手動拖曳相同規則，將 Y 轉為輩分索引
     * @param {number} y
     * @returns {number}
     */
    getGenerationIndexByY(y) {
        const grid = GenogramApp.GRID;
        return Math.round((y - grid.ORIGIN_Y) / grid.CELL_HEIGHT);
    }

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
    }

    /**
     * 由輩分索引反算對齊後的 Y（與手動拖曳落點一致）
     * @param {number} generationIndex
     * @returns {number}
     */
    getGenerationYByIndex(generationIndex) {
        const grid = GenogramApp.GRID;
        return grid.ORIGIN_Y + generationIndex * grid.CELL_HEIGHT;
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
        const norm = this.normalizeLoadedFamilyRelationships();
        this.selectedPersonId = null;
        this.updatePropertyPanel();
        this.autoSave();
        if (this.pendingFitFrame !== null) cancelAnimationFrame(this.pendingFitFrame);
        this.pendingFitFrame = requestAnimationFrame(() => {
            this.pendingFitFrame = null;
            this.fitToView({ onlyIfNeeded: true });
        });

        if ((norm.normalized + norm.deduped + norm.dropped) > 0) {
            this.updateStatus(
                `已套用舊檔相容修正：調整 ${norm.normalized}、去重 ${norm.deduped}、移除 ${norm.dropped}`,
                'info'
            );
        }
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
    async exportPNG(showNotes = true, showLegend = true, scale = 3) {
        await this.waitForCurrentCanvasFonts();
        const dataUrl = this.canvas.exportToPNG(this.persons, this.relationships,
            this.households || [], this.lifeCircles || [], showNotes, showLegend, scale,
            this.viewOptions);
        if (dataUrl) {
            const timestamp = new Date().toISOString().slice(0, 10);
            this.storage.exportPNG(dataUrl, `genogram_${timestamp}.png`);
        }
    }

    /**
     * 顯示匯出格式選擇對話框
     */
    showExportModal() {
        this.commitPropertyEditSession();
        this.modalManager.open(this.elements.exportModal);
    }

    /**
     * 關閉匯出格式選擇對話框
     */
    closeExportModal() {
        this.modalManager.close(this.elements.exportModal);
    }

    /**
     * 處理不同格式的匯出
     * @param {string} format - 匯出格式 (png, jpeg, svg, pdf, json)
     */
    async handleExportFormat(format) {
        if (this.persons.length === 0) {
            this.updateStatus('沒有內容可匯出', 'error');
            return;
        }

        // 讀取是否顯示備註的設定
        const showNotesCheckbox = document.getElementById('exportShowNotes');
        const showNotes = showNotesCheckbox ? showNotesCheckbox.checked : true;

        // 讀取是否顯示圖例的設定
        const showLegendCheckbox = document.getElementById('exportShowLegend');
        const showLegend = showLegendCheckbox ? showLegendCheckbox.checked : true;

        // 讀取解析度設定
        const resolutionRadios = document.getElementsByName('exportResolution');
        let scale = 2; // 預設 2x
        for (const radio of resolutionRadios) {
            if (radio.checked) {
                scale = parseFloat(radio.value);
                break;
            }
        }

        const timestamp = new Date().toISOString().slice(0, 10);

        switch (format) {
            case 'png':
                await this.exportPNG(showNotes, showLegend, scale);
                this.updateStatus('已匯出 PNG 圖片', 'success');
                break;

            case 'jpeg':
                await this.exportJPEG(showNotes, showLegend, scale);
                this.updateStatus('已匯出 JPEG 圖片', 'success');
                break;

            case 'svg':
                await this.exportSVG(showNotes, showLegend, scale);
                this.updateStatus('已匯出 SVG 向量圖', 'success');
                break;

            case 'pdf':
                await this.exportPDF(showNotes, showLegend, scale);
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
    async exportJPEG(showNotes = true, showLegend = true, scale = 3) {
        await this.waitForCurrentCanvasFonts();
        const dataUrl = this.canvas.exportToJPEG(this.persons, this.relationships,
            this.households || [], this.lifeCircles || [], 0.92, showNotes, showLegend, scale,
            this.viewOptions);
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
    async exportSVG(showNotes = true, showLegend = true, scale = 3) {
        await this.waitForCurrentCanvasFonts();
        // 使用 PNG dataUrl 嵌入到 SVG 中
        // 這是一個簡化的實作，保持視覺一致性
        const dataUrl = this.canvas.exportToPNG(this.persons, this.relationships,
            this.households || [], this.lifeCircles || [], showNotes, showLegend, scale,
            this.viewOptions);
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
    async exportPDF(showNotes = true, showLegend = true, scale = 3) {
        await this.waitForCurrentCanvasFonts();
        const dataUrl = this.canvas.exportToPNG(this.persons, this.relationships,
            this.households || [], this.lifeCircles || [], showNotes, showLegend, scale,
            this.viewOptions);
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
     * 清空畫布 (清除所有人物、關係、圈選)
     */
    clearAll() {
        this.commitPropertyEditSession();
        this.cancelPlacement();
        this.cancelRelationshipWorkflow();
        // [UX Fix] 如果正在預覽自動排列，清空時自動取消預覽
        if (this.isPreviewingLayout) {
            this.cancelPreviewedLayout();
        }

        // [Fix] 只有同住框/生活圈的畫布也要能清空
        if (this.persons.length === 0 && this.relationships.length === 0 &&
            (this.households || []).length === 0 && (this.lifeCircles || []).length === 0) {
            this.updateStatus('畫布已經是空的', 'info');
            return;
        }

        const confirmed = confirm('確定要清空畫布嗎？\n\n此操作將刪除所有人物、關係線、同住框和生活圈。\n您可以使用「復原」功能復原。');
        if (!confirmed) return;

        this.saveState();
        this.persons = [];
        this._syncPersonMap();
        this.relationships = [];
        this.households = [];
        this.lifeCircles = [];
        this.selectedPersonId = null;
        this.selectedRelationshipId = null;
        this.selectedHouseholdId = null;
        this.selectedLifeCircleId = null;
        this.isDrawingLifeCircle = false;
        this.currentLifeCirclePoints = [];
        this.lifeCircleMousePos = null;
        this.updatePropertyPanel();
        this.autoSave();
        this.render();
        this.updateStatus('畫布已清空', 'success');
    }

    /**
     * 複製圖片到剪貼簿
     */
    async copyImageToClipboard() {
        if (this.persons.length === 0) {
            this.updateStatus('沒有內容可複製', 'error');
            return;
        }

        await this.waitForCurrentCanvasFonts();

        try {
            // 讀取是否顯示備註的設定 (預設顯示)
            const showNotesCheckbox = document.getElementById('exportShowNotes');
            const showNotes = showNotesCheckbox ? showNotesCheckbox.checked : true;

            // 讀取是否顯示圖例的設定
            const showLegendCheckbox = document.getElementById('exportShowLegend');
            const showLegend = showLegendCheckbox ? showLegendCheckbox.checked : true;

            // 讀取解析度設定 (預設 1x 用於剪貼簿，避免過大)
            const resolutionRadios = document.getElementsByName('exportResolution');
            let scale = 1;
            for (const radio of resolutionRadios) {
                if (radio.checked) {
                    scale = parseFloat(radio.value);
                    break;
                }
            }

            const dataUrl = this.canvas.exportToPNG(this.persons, this.relationships,
                this.households || [], this.lifeCircles || [], showNotes, showLegend, scale,
                this.viewOptions);
            if (!dataUrl) {
                this.updateStatus('產生圖片失敗', 'error');
                return;
            }

            // 將 dataUrl 轉換為 Blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();

            // 使用 Clipboard API 複製圖片
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);

            this.updateStatus('圖片已複製到剪貼簿，可直接貼上', 'success');
        } catch (err) {
            console.error('複製圖片失敗:', err);
            // 如果 Clipboard API 不支援，提供替代方案
            if (err.name === 'NotAllowedError') {
                this.updateStatus('無法複製：請允許剪貼簿存取權限', 'error');
            } else {
                this.updateStatus('複製失敗，請使用匯出功能', 'error');
            }
        }
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

            // 視圖狀態以 canvas 為單一真實來源
            const currentScale = this.canvas ? this.canvas.scale : this.scale;
            const currentOffsetX = this.canvas ? this.canvas.offsetX : this.offsetX;
            const currentOffsetY = this.canvas ? this.canvas.offsetY : this.offsetY;

            this.storage.autoSave(this.persons, this.relationships, this.households || [], this.lifeCircles || [], {
                scale: currentScale,
                offsetX: currentOffsetX,
                offsetY: currentOffsetY
            });
            this.lastAutoSaveTime = now;
            this.autoSaveTimer = null;
        }, 1000); // 1秒防抖
    }

    /**
     * 載入自動儲存
     */
    loadAutoSave() {
        this.cancelPlacement();
        this.isLoading = true; // 暫停 autosave
        const saved = this.storage.loadAutoSave();
        if (saved) {
            this.persons = saved.persons;
            this._syncPersonMap();
            this.relationships = saved.relationships;
            this.households = saved.households || [];
            this.lifeCircles = saved.lifeCircles || [];
            this.normalizeLoadedFamilyRelationships();

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
                this.updateStatus(`已恢復上次工作階段: ${fileName}`, 'info', {
                    autoHideMs: GenogramApp.STATUS_TIMEOUTS.passive
                });
            } else {
                this.updateStatus('已恢復上次工作階段', 'info', {
                    autoHideMs: GenogramApp.STATUS_TIMEOUTS.passive
                });
            }
        } else {
            // [Bug Fix] 即使沒有儲存資料，也要重置 isLoading 狀態
            this.isLoading = false;
        }
    }


    // [NEW - G 方案] 預覽自動排列
    previewAutoLayout() {
        if (this.isPreviewingLayout) return;

        // 1. 記錄當前狀態
        this.isPreviewingLayout = true;
        this.originalBeforePreview = {};
        this.persons.forEach(p => {
            this.originalBeforePreview[p.id] = { x: p.x, y: p.y };
        });

        // [Bug Fix] 也要備份生活圈狀態
        this.originalLifeCirclesBeforePreview = {};
        this.lifeCircles.forEach(lc => {
            this.originalLifeCirclesBeforePreview[lc.id] = lc.points.map(p => ({ x: p.x, y: p.y }));
        });

        // 2. 顯示預覽 UI
        if (this.elements.layoutPreviewBar) {
            this.elements.layoutPreviewBar.style.display = 'flex';
        }

        // 3. 執行排列（不儲存 History，不寫入 localStorage）
        // 讓 autoLayoutByGeneration 執行，但最後會更新座標
        this.autoLayoutByGeneration(true); // 傳入 isPreview = true

        this.updateStatus('預覽自動排列結果。滿意請按「套用」，否則「取消」。', 'info');
    }

    // [NEW - G 方案] 套用預覽結果
    applyPreviewedLayout() {
        if (!this.isPreviewingLayout) return;

        // 1. 儲存狀態到 History
        // 必須手動建構「排列前」的狀態並推入 undoStack
        // 因為 saveState() 只會儲存當前狀態，而我們希望 Undo 能回到排列前
        const beforeState = {
            persons: this.persons.map(p => {
                const json = p.toJSON();
                if (this.originalBeforePreview && this.originalBeforePreview[p.id]) {
                    json.x = this.originalBeforePreview[p.id].x;
                    json.y = this.originalBeforePreview[p.id].y;
                }
                return json;
            }),
            relationships: this.relationships.map(r => r.toJSON()),
            households: this.households || [],
            lifeCircles: (this.lifeCircles || []).map(lc => {
                const clone = JSON.parse(JSON.stringify(lc));
                if (this.originalLifeCirclesBeforePreview && this.originalLifeCirclesBeforePreview[lc.id]) {
                    clone.points = this.originalLifeCirclesBeforePreview[lc.id];
                }
                return clone;
            })
        };

        this.history.pushState(beforeState);

        // 2. 隱藏預覽 UI
        if (this.elements.layoutPreviewBar) {
            this.elements.layoutPreviewBar.style.display = 'none';
        }

        // 3. 清除預覽狀態並儲存
        this.isPreviewingLayout = false;
        this.originalBeforePreview = null;
        this.originalLifeCirclesBeforePreview = null;

        this.autoSave();
        this.updateStatus('已套用自動排列', 'success');
    }

    // [NEW - G 方案] 取消預覽
    cancelPreviewedLayout() {
        if (!this.isPreviewingLayout || !this.originalBeforePreview) return;

        // 1. 還原人物座標
        this.persons.forEach(p => {
            const original = this.originalBeforePreview[p.id];
            if (original) {
                p.x = original.x;
                p.y = original.y;
            }
        });

        // 2. [Bug Fix] 還原生活圈座標
        if (this.originalLifeCirclesBeforePreview) {
            this.lifeCircles.forEach(lc => {
                const originalPoints = this.originalLifeCirclesBeforePreview[lc.id];
                if (originalPoints) {
                    lc.points = originalPoints.map(p => ({ x: p.x, y: p.y }));
                }
            });
        }

        // 3. 隱藏預覽 UI
        if (this.elements.layoutPreviewBar) {
            this.elements.layoutPreviewBar.style.display = 'none';
        }

        // 4. 重繪
        this.render();

        this.isPreviewingLayout = false;
        this.originalBeforePreview = null;
        this.originalLifeCirclesBeforePreview = null;
        this.updateStatus('已取消自動排列', 'info');
    }

    /**
     * 自動排列同輩份的人物 (Dagre.js 版本)
     * @param {boolean} isPreview 是否為預覽模式（不寫入 History）
     */
    autoLayoutByGeneration(isPreview = false) {
        if (!isPreview) {
            this.saveState();
        }

        if (this.persons.length === 0) {
            this.updateStatus('畫布上沒有人物可排列', 'warning');
            return;
        }

        // 檢查 Dagre 是否載入
        if (typeof dagre === 'undefined') {
            console.error('Dagre.js not loaded');
            this.updateStatus('佈局引擎載入失敗，請檢查網路連線', 'error');
            return;
        }

        // 使用新的佈局引擎
        const layout = new GenogramLayout(this.persons, this.relationships, {
            grid: GenogramApp.GRID,
            households: this.households,
            lifeCircles: this.lifeCircles
        });

        const result = layout.calculate();

        // 套用新座標
        result.positions.forEach((pos, personId) => {
            const person = this.personMap.get(personId);
            if (person) {
                person.x = this.snapToGrid(pos.x, 'x');
                person.y = this.snapToGrid(pos.y, 'y');
            }
        });

        // 更新生活圈形狀 (智慧跟隨 - 直接替換頂點)
        if (this.lifeCircles && result.lifeCircleShapes) {
            this.lifeCircles.forEach(lc => {
                const newPoints = result.lifeCircleShapes[lc.id];
                if (newPoints && newPoints.length > 0) {
                    lc.points = newPoints;
                }
            });
        }

        if (!isPreview) {
            this.autoSave();
        }
        this.render();

        const personCount = this.persons.length;
        const relCount = this.relationships.length;

        if (!isPreview) {
            this.updateStatus(`佈局完成：${personCount} 人，${relCount} 條關係`, 'success');
        }

    }


}

// 啟動應用程式
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GenogramApp();
});
