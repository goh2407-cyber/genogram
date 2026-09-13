/**
 * [B3] Dash pattern 集中表
 * 所有 setLineDash 調用均查表；禁止在函式內直接出現魔術陣列。
 *
 * 設計依據：
 *   engaged    [12, 6] — 訂婚：長虛線，視覺上「幾乎相連」，呼應半正式承諾
 *   cohabit    [2, 6]  — 同居：短點配長間隔，疏鬆點線，與訂婚明顯區分
 *   fosterLink [2, 6]  — 無婚姻線的隱形親子起源連接，沿用 cohabit 極淡色
 *   household  [10, 5] — 同住家庭圈選框：較密虛線，在不同縮放下易讀
 *   selection  [5, 5]  — UI 選取框、框選拖曳、正在連接預覽線：等長段，標準互動虛線
 *   liveCircle [5, 3]  — 生活圈未選中邊框：比 selection 略密，區分靜態物件
 *   legendDash [5, 5]  — 圖例面板虛線預覽預設值（同 selection 尺寸，語意獨立）
 *   legendDot  [2, 2]  — 圖例面板點線預覽預設值：等距短點，緊湊適合小尺寸圖例列
 *   solid      []      — 實線重置（所有 clear/reset 呼叫共用此空陣列）
 */
const DASH_PATTERNS = {
    solid:      [],        // 實線 / 重置用
    engaged:    [12, 6],   // 訂婚：長虛線 ▬ ▬ ▬
    cohabit:    [2, 6],    // 同居：短點線 · · · · (點短間隔長)
    fosterLink: [2, 6],    // 無婚姻線的隱性親子連接（同 cohabit，語意獨立）
    household:  [10, 5],   // 同住家庭圈選框
    selection:  [5, 5],    // 框選 / 正在連接預覽 / UI 選取框
    liveCircle: [5, 3],    // 生活圈未選中邊框（略密於 selection）
    legendDash: [5, 5],    // 圖例面板虛線預覽預設值
    legendDot:  [2, 2],    // 圖例面板點線預覽預設值（等距短點，緊湊適合小尺寸）
};

/**
 * [D1] 背景網格樣式常數
 * 設計依據（臨床極簡調性）：
 *   細格色 #f3f4f6 — Tailwind gray-100，幾乎不可見，僅在近距離提供空間參考
 *   粗格色 #e5e7eb — Tailwind gray-200，比細格深一階，形成層次感但不搶焦點
 *   細格距 20px    — 符合 20px 基準格，方便對齊臨床符號（人物 50px = 2.5 格）
 *   粗格距 100px   — 20px × 5，與細格整倍數關係，不產生視覺干擾
 *   細格縮放閾值 0.6 — 縮放小於 0.6 時細格過密（< 12px/格），自動隱藏
 */
const GRID_STYLE = {
    fineColor:    '#f3f4f6',  // Tailwind gray-100：細格線
    coarseColor:  '#e5e7eb',  // Tailwind gray-200：粗格線
    fineSize:     20,          // 細格間距 (px，畫布座標)
    coarseSize:   100,         // 粗格間距 (px，畫布座標)
    fineMinScale: 0.6,         // 低於此縮放比例時不畫細格
};

const compareRouteScoreTuples = (a, b) => {
    for (let index = 0; index < a.length; index++) {
        if (a[index] < b[index]) return -1;
        if (a[index] > b[index]) return 1;
    }
    return 0;
};

/**
 * GenogramCanvas 類別 - 管理畫布繪製
 */
class GenogramCanvas {
    static DEFAULT_VIEW_OPTIONS = Object.freeze({
        showNames: true,
        showAges: true,
        showNotes: true,
        showMedical: true,
        showEmotionalRelationships: true,
        showHouseholds: true,
        showLifeCircles: true
    });

    constructor(canvasId, containerId, onResize = null) {
        this.canvas = document.getElementById(canvasId);
        this.container = document.getElementById(containerId);
        this.ctx = this.canvas.getContext('2d');
        this.dpr = window.devicePixelRatio || 1;

        // Resize callback (用於通知 App 重新 render)
        this.onResize = onResize;

        // 縮放與平移
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.minScale = 0.25;
        this.maxScale = 3;

        // 繪製設定
        this.personSize = 50;
        this.fontSize = 14;
        this.fontFamily = 'Noto Sans TC, sans-serif';
        this.suppressQuickAddButtons = false;
        this.ageReferenceDate = null; // [2-1] 年齡基準日（null = 今天），由 App.render 注入；匯出同用
        // [3-3] 螢幕 LOD：目前檢視縮放（App.render 注入；匯出期間固定 1）。低縮放時姓名放大、備註隱藏，只影響螢幕。
        this.lodScale = 1;
        this._householdBoundsCache = new Map(); // [HH-5c] householdId → { sig, bounds }

        // 家庭走線規劃快取：繪製、命中、高亮與匯出共用相同點序列。
        this._familyRoutePlans = [];
        this._familyRelationshipPaths = new Map();
        this._familyRouteSignature = null;
        this._familyPlanCache = new Map();
        this.invalidateDerivedGeometry();

        // 初始化
        this.resize();
        this.setupResizeObserver();
    }

    /**
     * 設定畫布尺寸
     */
    resize() {
        const rect = this.container.getBoundingClientRect();
        this.dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * this.dpr;
        this.canvas.height = rect.height * this.dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        this.width = rect.width;
        this.height = rect.height;
    }

    /**
     * 監聽容器尺寸變化
     */
    setupResizeObserver() {
        let resizeRafId = null;
        let lastWidth = this.container.clientWidth;
        let lastHeight = this.container.clientHeight;

        const resizeObserver = new ResizeObserver((entries) => {
            // [Bug Fix #1] 檢查尺寸是否真的有變化
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (Math.abs(width - lastWidth) < 1 && Math.abs(height - lastHeight) < 1) {
                    continue;
                }

                lastWidth = width;
                lastHeight = height;

                this.resize();

                // 使用 requestAnimationFrame 節流
                if (this.onResize) {
                    if (resizeRafId) {
                        cancelAnimationFrame(resizeRafId);
                    }
                    resizeRafId = requestAnimationFrame(() => {
                        this.onResize();
                        resizeRafId = null;
                    });
                }
            }
        });
        resizeObserver.observe(this.container);
    }


    /**
     * 清除畫布
     */
    clear() {
        // 完全重置變換並清除整個畫布
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * [D1] 繪製背景網格
     * 在螢幕座標系下繪製（clear 後、applyTransform 前），避免受縮放變換影響。
     * 網格線在 canvas 世界座標中固定間距，隨 offsetX/offsetY 捲動。
     * 縮放低於 GRID_STYLE.fineMinScale 時，細格隱藏以避免過密。
     */
    drawGrid() {
        const ctx = this.ctx;
        const { fineColor, coarseColor, fineSize, coarseSize, fineMinScale } = GRID_STYLE;

        // 螢幕尺寸（含 DPR）
        const W = this.canvas.width;
        const H = this.canvas.height;

        // 世界座標中的網格間距轉為螢幕像素
        const fineStep   = fineSize   * this.scale * this.dpr;
        const coarseStep = coarseSize * this.scale * this.dpr;

        // 起始偏移（讓網格隨 pan 滾動）
        const offX = (this.offsetX * this.dpr) % fineStep;
        const offY = (this.offsetY * this.dpr) % fineStep;
        const coarseOffX = (this.offsetX * this.dpr) % coarseStep;
        const coarseOffY = (this.offsetY * this.dpr) % coarseStep;

        ctx.save();
        // 重置為恆等變換，在螢幕像素座標下繪製
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.lineWidth = 1;

        // --- 細格（縮放夠大時才顯示）---
        if (this.scale >= fineMinScale) {
            ctx.strokeStyle = fineColor;
            ctx.beginPath();
            for (let x = offX; x <= W; x += fineStep) {
                ctx.moveTo(Math.round(x) + 0.5, 0);
                ctx.lineTo(Math.round(x) + 0.5, H);
            }
            for (let y = offY; y <= H; y += fineStep) {
                ctx.moveTo(0, Math.round(y) + 0.5);
                ctx.lineTo(W, Math.round(y) + 0.5);
            }
            ctx.stroke();
        }

        // --- 粗格（任何縮放下都顯示）---
        ctx.strokeStyle = coarseColor;
        ctx.beginPath();
        for (let x = coarseOffX; x <= W; x += coarseStep) {
            ctx.moveTo(Math.round(x) + 0.5, 0);
            ctx.lineTo(Math.round(x) + 0.5, H);
        }
        for (let y = coarseOffY; y <= H; y += coarseStep) {
            ctx.moveTo(0, Math.round(y) + 0.5);
            ctx.lineTo(W, Math.round(y) + 0.5);
        }
        ctx.stroke();

        ctx.restore();
    }

    /**
     * 套用變換（縮放與平移）
     */
    applyTransform() {
        // 先套用 DPR 縮放，再套用使用者的縮放和平移
        this.ctx.setTransform(
            this.dpr * this.scale,
            0,
            0,
            this.dpr * this.scale,
            this.offsetX * this.dpr,
            this.offsetY * this.dpr
        );
    }

    /**
     * 取得滑鼠在畫布上的座標
     * @param {MouseEvent} e
     * @returns {{x: number, y: number}}
     */
    getMousePos(e) {
        return this.screenToCanvas(e.clientX, e.clientY);
    }

    /**
     * 螢幕座標轉換為畫布座標
     */
    screenToCanvas(screenX, screenY) {
        const rect = this.canvas.getBoundingClientRect();
        // [Bug Fix #5] 確保座標轉換精確考慮 DPR 與實體尺寸
        const x = (screenX - rect.left - this.offsetX) / this.scale;
        const y = (screenY - rect.top - this.offsetY) / this.scale;
        return { x, y };
    }

    /**
     * 設定縮放
     */
    setScale(newScale, centerX = null, centerY = null) {
        newScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));

        if (centerX !== null && centerY !== null) {
            // 以特定點為中心縮放
            const worldX = (centerX - this.offsetX) / this.scale;
            const worldY = (centerY - this.offsetY) / this.scale;
            this.offsetX = centerX - worldX * newScale;
            this.offsetY = centerY - worldY * newScale;
        }

        this.scale = newScale;
    }

    /**
     * 繪製整個家系圖
     */
    render(persons, relationships, highlightedIds = [], selectedId = null, selectedRelationshipId = null, connectingFrom = null, selectedPersonIds = [], boxSelectStart = null, boxSelectEnd = null, households = [], selectedHouseholdId = null, hoveredPersonId = null) {
        // [HitTest] 保留最近一次資料，供關係線點擊路徑計算使用
        this.lastPersons = Array.isArray(persons) ? persons : [];
        this.lastRelationships = Array.isArray(relationships) ? relationships : [];

        // [Sprint 2 Phase A] personMap fallback：正常路徑由 App.render() 注入；
        // 若 canvas 被外部直接呼叫（無注入），就地重建避免 ReferenceError
        if (!this.personMap) {
            this.personMap = new Map(this.lastPersons.map(p => [p.id, p]));
        }
        // [B1-DPR] 跨螢幕拖視窗時 devicePixelRatio 會變，ResizeObserver 不會觸發 → 這裡補檢查
        if (typeof window !== 'undefined' && (window.devicePixelRatio || 1) !== this.dpr) this.resize();
        this.prepareDerivedGeometry(this.lastPersons, this.lastRelationships);
        // [B1-perf] 文字壓線警告改為 lazy：畫面上永遠隱藏，只有測試/診斷讀取 labelRoutingWarnings 時才計算
        this._labelWarningsDirty = true;
        const view = this.normalizeViewOptions(this.viewOptions);

        this.clear();
        this.drawGrid(); // [D1] 背景網格（在 clear 後、applyTransform 前繪製於螢幕座標）

        this.ctx.save();
        this.applyTransform();

        // 0.5 繪製生活圈（最底層背景脈絡；由 App.render 注入）
        // [Fix] 原本以 overlay 蓋在最上層，會罩染人物符號且與匯出 z-order 相反
        if (view.showLifeCircles && this.lifeCirclesToDraw && this.lifeCirclesToDraw.length > 0) {
            this.lifeCirclesToDraw.forEach(lc => {
                this._drawSingleLifeCircle(lc, this.selectedLifeCircleId === lc.id);
            });
        }

        // 1. 繪製同住家庭 (底層)
        if (view.showHouseholds && households && households.length > 0) {
            this.drawHouseholds(households, persons, relationships, false, selectedHouseholdId);
        }

        // 分類關係 + 親屬引擎
        // [Phase 0a] 優先用 App.render 一次性注入的快取（讀取後即清，避免外部直接呼叫時取到舊值）；
        // 無注入（測試/外部直接呼叫）時 fallback 自行計算，確保不依賴 App 也能正確繪製。
        const _inj = this._renderInputs;
        this._renderInputs = null;
        let familyRels, otherRels, kinship;
        if (_inj && _inj.split && _inj.kinship) {
            familyRels = _inj.split.familyRels;
            otherRels = _inj.split.otherRels;
            kinship = _inj.kinship;
        } else {
            familyRels = [];
            otherRels = [];
            relationships.forEach(rel => {
                const category = typeof rel.getCategory === 'function' ? rel.getCategory() : Relationship.getCategory(rel.type);
                if (category === 'family') {
                    familyRels.push(rel);
                } else {
                    otherRels.push(rel);
                }
            });
            // 以 KinshipEngine 提供方向判斷，避免 Y 座標誤判
            kinship = new KinshipEngine(persons, relationships);
        }
        const visibleOtherRels = otherRels.filter(rel => view.showEmotionalRelationships
            || !Relationship.isEmotionalDisplayType(rel.type));
        this.drawFamilies(familyRels, persons, visibleOtherRels, selectedRelationshipId, kinship);

        // 3. 繪製非親子關係
        visibleOtherRels.forEach(rel => {
            const fromPerson = this.personMap.get(rel.fromPersonId);
            const toPerson = this.personMap.get(rel.toPersonId);
            if (fromPerson && toPerson) {
                const isSelected = selectedRelationshipId === rel.id;
                // 傳入所有關係以便計算並行位移
                this.drawRelationship(fromPerson, toPerson, rel, isSelected, persons, relationships);
            }
        });

        // 3.5 繪製關係線說明日期 (最上層，確保不被遮擋)
        if (view.showNotes) {
            visibleOtherRels.forEach(rel => {
                const fromPerson = this.personMap.get(rel.fromPersonId);
                const toPerson = this.personMap.get(rel.toPersonId);
                if (fromPerson && toPerson && rel.date) { // 只有當有日期/說明時才畫
                    this.drawRelationshipDate(fromPerson, toPerson, rel, persons, relationships);
                }
            });
        }

        // 4. 繪製正在連接的線
        if (connectingFrom && connectingFrom.targetX !== undefined) {
            this.ctx.save();
            this.ctx.strokeStyle = '#4a90d9';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash(DASH_PATTERNS.selection);
            this.ctx.beginPath();
            this.ctx.moveTo(connectingFrom.person.x, connectingFrom.person.y);
            this.ctx.lineTo(connectingFrom.targetX, connectingFrom.targetY);
            this.ctx.stroke();
            this.ctx.restore();
        }

        // 5. 繪製人物
        persons.forEach(person => {
            const isSelected = selectedId === person.id;
            const isMultiSelected = (selectedPersonIds || []).includes(person.id);
            const isHighlighted = (highlightedIds || []).includes(person.id);
            const isConnecting = connectingFrom && connectingFrom.person.id === person.id;
            this.drawPerson(person, isSelected || isMultiSelected, isConnecting, isHighlighted, view);
        });

        // 5.5 智慧格位預覽只屬於編輯器畫面；匯出路徑不呼叫此方法。
        if (this.placementPreview) {
            this.drawPlacementPreview(this.placementPreview);
        }

        // 6. 繪製多選邊框 (視覺提示可移動區域)
        if (selectedPersonIds && selectedPersonIds.length > 1) {
            this.drawMultiSelectionBounds(selectedPersonIds, persons);
        }

        // 7. 繪製範圍圈選框
        if (boxSelectStart && boxSelectEnd) {
            this.drawSelectionBox(boxSelectStart, boxSelectEnd);
        }

        // 8. 繪製快速新增按鈕（拖曳或格位預覽中隱藏，避免遮住人物與預覽線）
        if (selectedId && !this.suppressQuickAddButtons
            && !this.isDragging && !this.placementPreview) {
            const selPerson = this.personMap.get(selectedId);
            if (selPerson) {
                this.drawQuickAddButtons(selPerson);
            }
        }

        // 9. 繪製關係線編輯按鈕 (選中關係線時顯示)
        if (selectedRelationshipId) {
            const selectedRel = relationships.find(r => r.id === selectedRelationshipId);
            const isVisible = selectedRel && (view.showEmotionalRelationships
                || !Relationship.isEmotionalDisplayType(selectedRel.type));
            if (isVisible) {
                const fromPerson = this.personMap.get(selectedRel.fromPersonId);
                const toPerson = this.personMap.get(selectedRel.toPersonId);
                if (fromPerson && toPerson) {
                    this.drawRelationshipEditButton(selectedRel, fromPerson, toPerson, relationships);
                    this.drawRelationshipRouteButtons(selectedRel, fromPerson, toPerson, relationships);
                }
            }
        }

        // 9.5 繪製選取順序 Badge (最後繪製，確保在最上層)
        // 只有在有選取且工具支援時才顯示 (這裡我們假設 selectedPersonIds 存在就是要顯示，或者可以判斷傳入參數)
        // 由於同住工具會傳入 selectedPersonIds，這符合需求
        if (selectedPersonIds && selectedPersonIds.length > 0) {
            selectedPersonIds.forEach((id, index) => {
                const person = this.personMap.get(id);
                if (person) {
                    this.drawSelectionBadge(person, index + 1);
                }
            });
        }

        // 10. [Snap] 拖曳對齊輔助線（最上層；由 App 在拖曳時注入 dragGuides）
        if (this.dragGuides) {
            this.drawAlignmentGuides(this.dragGuides);
        }

        this.ctx.restore();
    }

    /** Draw the editor-only smart-placement overlay without retaining canvas state. */
    drawPlacementPreview(preview) {
        if (!preview || !Number.isFinite(preview.x) || !Number.isFinite(preview.y)) return;
        this.ctx.save();
        try {
            const suppliedGhost = preview.ghostPerson || {};
            const ghostDefaults = { gender: 'unknown', name: '', age: '' };
            const ghost = { ...ghostDefaults, ...suppliedGhost, x: preview.x, y: preview.y };
            const ghosts = (preview.ghostPeople && preview.ghostPeople.length > 0)
                ? preview.ghostPeople.map(person => ({ ...ghostDefaults, ...person }))
                : [ghost];
            const ghostMap = new Map(ghosts.map(person => [person.id, person]));

            // Relationship previews deliberately use a neutral selection dash rather than
            // any clinical relationship style.
            (preview.relationshipPreview || []).forEach(rel => {
                const resolveEndpoint = id => ghostMap.get(id) || (this.personMap && this.personMap.get(id));
                const fromPoint = resolveEndpoint(rel.fromPersonId);
                const toPoint = resolveEndpoint(rel.toPersonId);
                if (!fromPoint || !toPoint || fromPoint === toPoint) return;
                this.ctx.save();
                this.ctx.globalAlpha = 0.55;
                this.ctx.strokeStyle = '#6b7280';
                this.ctx.lineWidth = 2;
                this.ctx.lineCap = 'round';
                this.ctx.setLineDash(DASH_PATTERNS.selection);
                this.ctx.beginPath();
                this.ctx.moveTo(fromPoint.x, fromPoint.y);
                this.ctx.lineTo(toPoint.x, toPoint.y);
                this.ctx.stroke();
                this.ctx.restore();
            });

            this.drawPlacementCell(preview);
            this.ctx.globalAlpha = 0.38;
            ghosts.forEach(person => this.drawPerson(person, false, false, false));
        } finally {
            this.ctx.restore();
        }
    }

    /** Draw the candidate cell, placement alignment guides, and unavailable marker. */
    drawPlacementCell(candidate) {
        if (!candidate || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return;
        this.ctx.save();
        try {
            const halfCell = 54;
            this.ctx.globalAlpha = 0.9;
            this.ctx.strokeStyle = '#ed1261';
            this.ctx.fillStyle = '#ed1261';
            this.ctx.lineWidth = 2;
            this.ctx.lineCap = 'round';
            this.ctx.setLineDash(DASH_PATTERNS.selection);
            this.ctx.strokeRect(candidate.x - halfCell, candidate.y - halfCell, halfCell * 2, halfCell * 2);

            this.ctx.setLineDash(DASH_PATTERNS.solid);
            this.ctx.globalAlpha = 0.45;
            this.ctx.beginPath();
            this.ctx.moveTo(candidate.x - halfCell, candidate.y);
            this.ctx.lineTo(candidate.x + halfCell, candidate.y);
            this.ctx.moveTo(candidate.x, candidate.y - halfCell);
            this.ctx.lineTo(candidate.x, candidate.y + halfCell);
            this.ctx.stroke();

            const blocked = candidate.occupied
                ? { x: candidate.x, y: candidate.y }
                : candidate.blockedAt;
            if (blocked) {
                this.ctx.globalAlpha = 0.95;
                this.ctx.lineWidth = 3;
                const markerHalf = 10;
                this.ctx.beginPath();
                this.ctx.moveTo(blocked.x - markerHalf, blocked.y - markerHalf);
                this.ctx.lineTo(blocked.x + markerHalf, blocked.y + markerHalf);
                this.ctx.moveTo(blocked.x + markerHalf, blocked.y - markerHalf);
                this.ctx.lineTo(blocked.x - markerHalf, blocked.y + markerHalf);
                this.ctx.stroke();
            }
        } finally {
            this.ctx.restore();
        }
    }

    /**
     * [Snap] 繪製拖曳對齊輔助線
     * guides.x / guides.y：對齊線（品牌桃紅細線，貫穿可視範圍）
     * guides.spacing：同列等距標尺（|—gap—| 刻度 + 間距數字）
     */
    drawAlignmentGuides(guides) {
        const ctx = this.ctx;
        // 可視範圍的世界座標
        const x0 = (0 - this.offsetX) / this.scale;
        const y0 = (0 - this.offsetY) / this.scale;
        const x1 = (this.width - this.offsetX) / this.scale;
        const y1 = (this.height - this.offsetY) / this.scale;
        const lw = 1.2 / this.scale; // 螢幕上固定約 1.2px（除以 scale 抵銷縮放）

        ctx.save();
        ctx.strokeStyle = '#ed1261';
        ctx.fillStyle = '#ed1261';
        ctx.lineWidth = lw;
        ctx.setLineDash(DASH_PATTERNS.solid);
        ctx.lineCap = 'butt';

        if (guides.x) {
            ctx.beginPath();
            ctx.moveTo(guides.x.pos, y0);
            ctx.lineTo(guides.x.pos, y1);
            ctx.stroke();
        }
        if (guides.y) {
            ctx.beginPath();
            ctx.moveTo(x0, guides.y.pos);
            ctx.lineTo(x1, guides.y.pos);
            ctx.stroke();
        }

        if (guides.spacing && Array.isArray(guides.spacing.xs) && guides.spacing.xs.length >= 2) {
            const { xs, y, gap } = guides.spacing;
            const ry = y - this.personSize / 2 - 22; // 標尺畫在符號上方
            const tick = 5;

            for (let i = 0; i < xs.length - 1; i++) {
                ctx.beginPath();
                ctx.moveTo(xs[i], ry - tick);
                ctx.lineTo(xs[i], ry + tick);
                ctx.moveTo(xs[i + 1], ry - tick);
                ctx.lineTo(xs[i + 1], ry + tick);
                ctx.moveTo(xs[i], ry);
                ctx.lineTo(xs[i + 1], ry);
                ctx.stroke();
            }

            const fontPx = 11 / this.scale; // 螢幕上固定 11px（除以 scale 抵銷縮放）
            ctx.font = `${fontPx}px "Noto Sans TC", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            for (let i = 0; i < xs.length - 1; i++) {
                ctx.fillText(String(gap), (xs[i] + xs[i + 1]) / 2, ry - 3);
            }
        }

        ctx.restore();
    }

    /**
     * 繪製範圍圈選框
     */
    drawSelectionBox(start, end) {
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);

        this.ctx.save();
        this.ctx.strokeStyle = '#4a90d9';
        this.ctx.fillStyle = 'rgba(74, 144, 217, 0.1)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash(DASH_PATTERNS.selection);

        // 繪製填充矩形
        this.ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

        // 繪製邊框
        this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);

        this.ctx.restore();
    }

    /**
     * 繪製多選邊界矩形 (視覺提示)
     */
    drawMultiSelectionBounds(selectedPersonIds, persons) {
        if (!selectedPersonIds || selectedPersonIds.length < 2) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const radius = 25;

        selectedPersonIds.forEach(id => {
            const p = persons.find(per => per.id === id);
            if (p) {
                minX = Math.min(minX, p.x - radius);
                maxX = Math.max(maxX, p.x + radius);
                minY = Math.min(minY, p.y - radius);
                maxY = Math.max(maxY, p.y + radius);
            }
        });

        const padding = 10;
        const x1 = minX - padding;
        const y1 = minY - padding;
        const x2 = maxX + padding;
        const y2 = maxY + padding;

        this.ctx.save();
        this.ctx.strokeStyle = '#4a90d9';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash(DASH_PATTERNS.selection);
        this.ctx.globalAlpha = 0.4;

        // 繪製一個淡淡的虛線框
        this.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // 在角落畫一點裝飾線，讓它看起來更像「選取範圍」
        const s = 10; // corner size
        this.ctx.globalAlpha = 0.8;
        this.ctx.setLineDash(DASH_PATTERNS.solid);

        // Top-left
        this.ctx.beginPath(); this.ctx.moveTo(x1, y1 + s); this.ctx.lineTo(x1, y1); this.ctx.lineTo(x1 + s, y1); this.ctx.stroke();
        // Top-right
        this.ctx.beginPath(); this.ctx.moveTo(x2 - s, y1); this.ctx.lineTo(x2, y1); this.ctx.lineTo(x2, y1 + s); this.ctx.stroke();
        // Bottom-right
        this.ctx.beginPath(); this.ctx.moveTo(x2, y2 - s); this.ctx.lineTo(x2, y2); this.ctx.lineTo(x2 - s, y2); this.ctx.stroke();
        // Bottom-left
        this.ctx.beginPath(); this.ctx.moveTo(x1 + s, y2); this.ctx.lineTo(x1, y2); this.ctx.lineTo(x1, y2 - s); this.ctx.stroke();

        this.ctx.restore();
    }

    /**
     * 繪製選取順序編號 Badge
     */
    drawSelectionBadge(person, number) {
        const { x, y } = person;
        const size = this.personSize;
        const badgeSize = 20;
        // 位置：右上角，稍微超出人物框一點
        const badgeX = x + size / 2 + 5;
        const badgeY = y - size / 2 - 5;

        this.ctx.save();
        this.ctx.shadowBlur = 5;
        this.ctx.shadowColor = 'rgba(0,0,0,0.3)';

        // 圓底
        this.ctx.beginPath();
        this.ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ed1261'; // 品牌桃紅（與 UI 主色一致）
        this.ctx.fill();
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // 數字
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(String(number), badgeX, badgeY + 1); // +1 微調垂直居中

        this.ctx.restore();
    }


    /**
     * 繪製人物
     */

    // [A3] Clinical minimalism state styles — replaces shadowBlur with double-stroke rings.
    // selected/connecting: muted steel-blue (#5b8fc9) — lower saturation than the old #4a90d9,
    //   reduces visual noise while preserving clear focus affordance (Color & Theme: dominant
    //   accent over timid, evenly-distributed palettes; kept restrained for clinical context).
    // highlighted: soft sage-green (#3aab58) — desaturated from pure #28a745, signals
    //   lasso-selection without competing with blue focus ring (clinical differentiation).
    // [C5] Name halo styles — white stroke behind fillText prevents family lines from bleeding
    //   into label text (readability over decoration; spatial clarity principle).
    static get DRAW_PERSON_STYLES() {
        return {
            selected:    { ring: '#5b8fc9', ringWidth: 3, haloGap: 5 },
            connecting:  { ring: '#5b8fc9', ringWidth: 3, haloGap: 5 },
            highlighted: { ring: '#3aab58', ringWidth: 3, haloGap: 5 },
            nameHalo:    { color: '#ffffff', lineWidth: 4 },
            notesHalo:   { color: '#ffffff', lineWidth: 4 },
        };
    }

    // [2026-06 視覺更新] 性別淡底色 — 大量人物時提升辨識度，
    // 飽和度刻意壓低，不干擾醫學符號（斜線/填滿）與死亡 X 標記的判讀。
    // 案主灰底 (#808080) 與臨床形狀語意不變。
    static GENDER_FILLS = {
        male:      '#edf4fc',  // 淡藍
        female:    '#fdeff4',  // 淡粉
        pregnancy: '#fdf6e7',  // 淡杏（懷孕/性別未定三角形）
        same:      '#f4effb',  // 淡紫（同性別圓頂方底）
    };

    static LABEL_SAFE_MARGIN = 7;
    static LABEL_SIDE_GAP = 12;
    /** [B2] 線上小裝飾（斜線／X／小屋）的線寬；與匯出圖例 lineWidth 2、側欄 SVG stroke-width 2 一致 */
    static DECORATION_LINE_WIDTH = 2;

    normalizeViewOptions(options = {}) {
        return Object.fromEntries(Object.keys(GenogramCanvas.DEFAULT_VIEW_OPTIONS)
            .map(key => [key, options[key] !== false]));
    }

    invalidateDerivedGeometry() {
        this._derivedGeometrySignature = null;
        this.personLabelPlacements = new Map();
        this.marriageRouteCache = new Map();
        this.labelRoutingWarnings = [];
        this._familyRouteSignature = null;
        this._familyPlanCache = new Map();
        this._familyRoutePlans = [];
        this._familyRelationshipPaths = new Map();
        this._householdBoundsCache = new Map(); // [HH-5c]
    }

    /**
     * [B1-perf] measureText 快取：key = font + text。字型載入完成時由 App 呼叫 clearTextWidthCache()。
     */
    measureTextWidth(text, font) {
        if (!this._textWidthCache) this._textWidthCache = new Map();
        const key = font + '\u0000' + text;
        const cached = this._textWidthCache.get(key);
        if (cached !== undefined) return cached;
        if (this._textWidthCache.size > 4000) this._textWidthCache.clear();
        this.ctx.save();
        this.ctx.font = font;
        const width = this.ctx.measureText(text).width;
        this.ctx.restore();
        const safe = Number.isFinite(width) ? width : 0;
        this._textWidthCache.set(key, safe);
        return safe;
    }

    clearTextWidthCache() {
        if (this._textWidthCache) this._textWidthCache.clear();
    }

    getPersonLabelGeometry(person, options = {}, placement = undefined) {
        const view = this.normalizeViewOptions(options);
        const manualPlacement = person?.labelPlacement
            && (Number.isFinite(person.labelPlacement.offsetX)
                || Number.isFinite(person.labelPlacement.offsetY))
            ? { side: 'below', ...person.labelPlacement }
            : null;
        const resolved = placement === undefined
            ? (manualPlacement || this.personLabelPlacements?.get(String(person.id)) || { side: 'below' })
            : placement;
        const name = view.showNames ? String(person.name || '') : '';
        const noteLines = view.showNotes && person.notes
            ? String(person.notes).split('\n').filter(Boolean).slice(0, 2)
            : [];
        const specs = [];
        if (name) {
            specs.push({ kind: 'name', text: name, fontSize: this.fontSize,
                font: `${this.fontSize}px ${this.fontFamily}`, lineHeight: this.fontSize + 4 });
        }
        noteLines.forEach(text => {
            const fontSize = this.fontSize * 0.8;
            specs.push({ kind: 'note', text, fontSize,
                font: `${fontSize}px ${this.fontFamily}`, lineHeight: fontSize + 2 });
        });

        const measured = specs.map(spec => ({ ...spec, width: this.measureTextWidth(spec.text, spec.font) }));

        const blockWidth = measured.reduce((max, row) => Math.max(max, row.width), 0);
        const half = this.personSize / 2;
        const side = ['below', 'above', 'left', 'right'].includes(resolved?.side)
            ? resolved.side : 'below';
        let centerX = person.x;
        if (side === 'left') {
            centerX = person.x - half - GenogramCanvas.LABEL_SIDE_GAP - blockWidth / 2;
        } else if (side === 'right') {
            centerX = person.x + half + GenogramCanvas.LABEL_SIDE_GAP + blockWidth / 2;
        }
        const offsetX = Number.isFinite(resolved?.offsetX) ? resolved.offsetX : 0;
        const offsetY = Number.isFinite(resolved?.offsetY) ? resolved.offsetY : 0;
        centerX += offsetX;
        const totalHeight = measured.reduce((sum, row) => sum + row.lineHeight, 0);
        let cursorY = side === 'above'
            ? person.y - half - 8 - totalHeight + offsetY
            : person.y + half + 8 + offsetY;
        const rows = measured.map(row => {
            const y = cursorY;
            const bounds = {
                left: centerX - row.width / 2,
                right: centerX + row.width / 2,
                top: y,
                bottom: y + row.fontSize
            };
            cursorY += row.lineHeight;
            return { ...row, x: centerX, y, height: row.fontSize,
                baseline: 'top', bounds };
        });
        const bounds = rows.length ? {
            left: Math.min(...rows.map(row => row.bounds.left)),
            right: Math.max(...rows.map(row => row.bounds.right)),
            top: Math.min(...rows.map(row => row.bounds.top)),
            bottom: Math.max(...rows.map(row => row.bounds.bottom))
        } : null;
        return {
            rows,
            bounds,
            anchor: { x: person.x, y: person.y + half + 8 },
            placement: { side, x: centerX, offsetX, offsetY }
        };
    }

    getPersonTextLayout(person, options = {}, placement = undefined) {
        const geometry = this.getPersonLabelGeometry(person, options, placement);
        const nameRow = geometry.rows.find(row => row.kind === 'name');
        const noteRows = geometry.rows.filter(row => row.kind === 'note');
        const fallbackY = geometry.rows[0]?.y ?? geometry.anchor.y;
        const nameY = nameRow?.y ?? fallbackY;
        return {
            name: nameRow?.text || '',
            noteLines: noteRows.map(row => row.text),
            nameY,
            noteStartY: noteRows[0]?.y ?? (nameRow
                ? nameRow.y + nameRow.lineHeight
                : fallbackY)
        };
    }

    /** [3-3] 低縮放時姓名放大倍率（螢幕 LOD）：<75% 才放大，最多 1.6 倍；匯出期間 lodScale=1 → 1 */
    static LOD = Object.freeze({ nameScaleBelow: 0.75, nameMaxFactor: 1.6, hideNotesBelow: 0.5 });

    lodNameFactor() {
        const s = Number.isFinite(this.lodScale) && this.lodScale > 0 ? this.lodScale : 1;
        const L = GenogramCanvas.LOD;
        return s < L.nameScaleBelow ? Math.min(L.nameMaxFactor, L.nameScaleBelow / s) : 1;
    }

    drawPersonText(person, options = {}) {
        const geometry = this.getPersonLabelGeometry(person, options);
        const S = GenogramCanvas.DRAW_PERSON_STYLES;
        const nameFactor = this.lodNameFactor();
        const hideNotes = (this.lodScale || 1) < GenogramCanvas.LOD.hideNotesBelow;
        this.ctx.shadowBlur = 0;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.lineJoin = 'round'; // [B2] 白暈在筆畫轉角不出尖刺
        geometry.rows.forEach(row => {
            if (row.kind === 'note' && hideNotes) return; // [3-3] 縮太小時備註只剩雜訊，螢幕上不畫（匯出不受影響）
            const halo = row.kind === 'name' ? S.nameHalo : S.notesHalo;
            // [3-3] 姓名字級依 LOD 放大（幾何/命中仍用基準字級；只有螢幕繪製變大）
            this.ctx.font = row.kind === 'name' && nameFactor !== 1
                ? `${row.fontSize * nameFactor}px ${this.fontFamily}` : row.font;
            this.ctx.fillStyle = row.kind === 'name' ? '#333' : '#666';
            this.ctx.lineWidth = halo.lineWidth;
            this.ctx.strokeStyle = halo.color;
            this.ctx.strokeText(row.text, row.x, row.y);
            this.ctx.fillText(row.text, row.x, row.y);
        });
    }

    /**
     * [Phase 1] 繪製生育結果小符號（流產/人工流產/死產）。
     * McGoldrick：流產=小型實心三角；人工流產=小 X；死產=縮小性別符號 + 死亡 X。
     * 與正常人物共用姓名標籤位置（以 personSize 為基準），符號本身縮小。
     */
    _drawLossSymbol(person, isActive, viewOptions = this.viewOptions) {
        const view = this.normalizeViewOptions(viewOptions);
        const { x, y, lossType } = person;
        const h = this.personSize * 0.42 / 2; // 縮小符號半徑
        this.ctx.save();
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2;

        if (isActive) {
            const S = GenogramCanvas.DRAW_PERSON_STYLES;
            this.ctx.save();
            this.ctx.strokeStyle = S.selected.ring;
            this.ctx.lineWidth = S.selected.ringWidth;
            this.ctx.beginPath();
            this.ctx.arc(x, y, h + 6, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
        }

        if (lossType === 'miscarriage') {
            // 流產：小型實心圓點（基本符號表 / genogramai 慣例）
            this.ctx.fillStyle = '#333';
            this.ctx.beginPath();
            this.ctx.arc(x, y, h * 0.6, 0, Math.PI * 2);
            this.ctx.fill();
        } else if (lossType === 'abortion') {
            // 人工流產：X
            this.ctx.lineWidth = 2.5;
            this.ctx.beginPath();
            this.ctx.moveTo(x - h, y - h);
            this.ctx.lineTo(x + h, y + h);
            this.ctx.moveTo(x + h, y - h);
            this.ctx.lineTo(x - h, y + h);
            this.ctx.stroke();
        }

        this.drawPersonText(person, view);
        this.ctx.restore();
    }

    drawPerson(person, isSelected = false, isConnecting = false, isHighlighted = false,
        viewOptions = this.viewOptions) {
        const view = this.normalizeViewOptions(viewOptions);
        const { x, y, gender, isDeceased, isIdentifiedPatient, medical, transgender } = person;
        // [2-1] 有出生年月者依基準日自動算年齡；ghost 預覽等純物件沿用 age 欄位
        const age = typeof person.getDisplayAge === 'function'
            ? person.getDisplayAge(this.ageReferenceDate) : person.age;
        const size = this.personSize;
        const halfSize = size / 2;
        const S = GenogramCanvas.DRAW_PERSON_STYLES; // shorthand

        this.ctx.save();

        // [Phase 1] 生育結果（流產/人工流產）：畫專屬小符號 + 標籤後結束，不走正常性別/醫療/死亡路徑
        // 僅認 miscarriage/abortion；其餘值（含已移除的 stillbirth、舊資料）走正常人物渲染
        if (person.lossType === 'miscarriage' || person.lossType === 'abortion') {
            this._drawLossSymbol(person, isSelected || isConnecting || isHighlighted, view);
            this.ctx.restore();
            return;
        }

        // [A3] State ring: draw outer halo before the shape so it sits beneath the shape stroke.
        // No shadowBlur — instead we stroke a slightly-expanded path in the state colour.
        // This is crisp at any zoom level and costs a single extra path per frame.
        if (isSelected || isConnecting || isHighlighted) {
            const stateStyle = (isHighlighted && !isSelected && !isConnecting)
                ? S.highlighted : S.selected;
            const gap = stateStyle.haloGap;
            this.ctx.save();
            this.ctx.strokeStyle = stateStyle.ring;
            this.ctx.lineWidth = stateStyle.ringWidth;
            this.ctx.beginPath();
            if (transgender === 'ftm') {
                this.ctx.strokeRect(x - halfSize - gap, y - halfSize - gap, size + gap * 2, size + gap * 2);
            } else if (transgender === 'mtf' || gender === 'female') {
                this.ctx.arc(x, y, halfSize + gap, 0, Math.PI * 2);
            } else if (gender === 'pregnancy') {
                this.ctx.moveTo(x, y - halfSize - gap);
                this.ctx.lineTo(x + halfSize + gap, y + halfSize + gap);
                this.ctx.lineTo(x - halfSize - gap, y + halfSize + gap);
                this.ctx.closePath();
            } else if (gender === 'same') {
                this.ctx.arc(x, y, halfSize + gap, Math.PI, 0);
                this.ctx.lineTo(x + halfSize + gap, y + halfSize + gap);
                this.ctx.lineTo(x - halfSize - gap, y + halfSize + gap);
                this.ctx.closePath();
            } else {
                // male (default square) and ftm fallback
                this.ctx.rect(x - halfSize - gap, y - halfSize - gap, size + gap * 2, size + gap * 2);
            }
            this.ctx.stroke();
            this.ctx.restore();
        }

        // 繪製主要形狀背景（[B1-visual] 低縮放時維持至少 1.25 螢幕像素，符號不發灰；匯出 lodScale=1 → 2 不變）
        this.ctx.lineWidth = Math.max(2, 1.25 / (this.lodScale || 1));
        this.ctx.strokeStyle = '#333';

        // 根據用戶要求修改：
        // 案主：黑底，去除虛線
        // 死亡：白底，黑 X

        // 決定填充顏色
        let fillColor;
        if (isIdentifiedPatient) {
            fillColor = '#808080'; // 案主：灰底（方便看清醫學狀態）
        } else if (isDeceased) {
            fillColor = '#fafafa'; // 已過世：中性近白，X 標記主導視覺
        } else {
            fillColor = GenogramCanvas.GENDER_FILLS[gender] || '#ffffff';
        }

        // 如果是死亡但不是案主，背景是白的；如果是案主，背景是黑的
        // 注意：原本邏輯死亡是黑底，現在改成白底

        this.ctx.fillStyle = fillColor;

        // [NEW] 根據 transgender 屬性決定是否繪製特殊跨性別形狀
        if (transgender === 'ftm') {
            // 女跨男 (FTM): 外方 inner 圓 (圓貼齊方形邊緣)
            this.ctx.fillRect(x - halfSize, y - halfSize, size, size);
            // 內圓僅由 stroke 繪製，不填充，避免覆蓋背景色
        } else if (transgender === 'mtf') {
            // 男跨女 (MTF): 外圓 inner 方 (方形四角貼齊圓周)
            this.ctx.beginPath();
            this.ctx.arc(x, y, halfSize, 0, Math.PI * 2);
            this.ctx.fill();
            // 內方僅由 stroke 繪製，不填充
        } else if (gender === 'female') {
            this.ctx.beginPath();
            this.ctx.arc(x, y, halfSize, 0, Math.PI * 2);
            this.ctx.fill();
        } else if (gender === 'pregnancy') {
            // 三角形：某某人（未指定性別）
            this.ctx.beginPath();
            this.ctx.moveTo(x, y - halfSize);
            this.ctx.lineTo(x + halfSize, y + halfSize);
            this.ctx.lineTo(x - halfSize, y + halfSize);
            this.ctx.closePath();
            this.ctx.fill();
        } else if (gender === 'same') {
            // 同性別：圓頂方底 (Tombstone shape)
            this.ctx.beginPath();
            // 上半部半圓，圓心在 (x, y)，半徑 halfSize
            this.ctx.arc(x, y, halfSize, Math.PI, 0);
            // 右下角
            this.ctx.lineTo(x + halfSize, y + halfSize);
            // 左下角
            this.ctx.lineTo(x - halfSize, y + halfSize);
            this.ctx.closePath();
            this.ctx.fill();
        } else {
            // Default: male (square)
            this.ctx.fillRect(x - halfSize, y - halfSize, size, size);
        }

        // 繪製醫學符號 (若未過世)
        if (!isDeceased && medical && view.showMedical) {
            this.drawMedicalSymbols(x, y, size, gender, medical, transgender);
        }

        // 重新繪製邊框 (確保清晰)
        // [A3] isHighlighted inline rings removed — state ring is drawn once above via DRAW_PERSON_STYLES.
        if (transgender === 'ftm') {
            // FTM: 方框 + 內圓
            this.ctx.strokeRect(x - halfSize, y - halfSize, size, size);
            this.ctx.beginPath();
            this.ctx.arc(x, y, halfSize, 0, Math.PI * 2);
            this.ctx.stroke();
        } else if (transgender === 'mtf') {
            // MTF: 圓框 + 內方
            this.ctx.beginPath();
            this.ctx.arc(x, y, halfSize, 0, Math.PI * 2);
            this.ctx.stroke();
            const innerSize = Math.round(size * 0.7071); // [B2] 取整避免 2px 線落在半像素
            this.ctx.strokeRect(x - innerSize / 2, y - innerSize / 2, innerSize, innerSize);
        } else if (gender === 'female') {
            this.ctx.beginPath();
            this.ctx.arc(x, y, halfSize, 0, Math.PI * 2);
            this.ctx.stroke();
        } else if (gender === 'pregnancy') {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y - halfSize);
            this.ctx.lineTo(x + halfSize, y + halfSize);
            this.ctx.lineTo(x - halfSize, y + halfSize);
            this.ctx.closePath();
            this.ctx.stroke();
        } else if (gender === 'same') {
            // 同性別：圓頂方底
            this.ctx.beginPath();
            this.ctx.arc(x, y, halfSize, Math.PI, 0);
            this.ctx.lineTo(x + halfSize, y + halfSize);
            this.ctx.lineTo(x - halfSize, y + halfSize);
            this.ctx.closePath();
            this.ctx.stroke();
        } else {
            this.ctx.strokeRect(x - halfSize, y - halfSize, size, size);
        }


        // 過世標記 X
        if (isDeceased) {
            // 如果是案主（黑底），X 要用白色
            // 如果是普通死亡（白底），X 要用黑色
            this.ctx.strokeStyle = isIdentifiedPatient ? '#fff' : '#333';
            this.ctx.lineWidth = 3;
            this.ctx.lineCap = 'round';
            // [B2] 依形狀內縮：三角形（懷孕）上窄下寬，X 要下移並縮小才不會凸出邊線
            const isTriangle = gender === 'pregnancy';
            const offset = halfSize * (isTriangle ? 0.38 : 0.6);
            const cy = isTriangle ? y + halfSize * 0.2 : y;
            this.ctx.beginPath();
            this.ctx.moveTo(x - offset, cy - offset);
            this.ctx.lineTo(x + offset, cy + offset);
            this.ctx.moveTo(x + offset, cy - offset);
            this.ctx.lineTo(x - offset, cy + offset);
            this.ctx.stroke();
            this.ctx.lineCap = 'butt';
        }

        // 年齡 (如果有醫學標記，可能需要調整位置，這裡先保持)
        if (view.showAges && age !== null && age !== '') {
            this.ctx.shadowBlur = 0;
            this.ctx.font = `bold ${this.fontSize}px ${this.fontFamily}`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            // 案主是黑底，所以文字要白；其他（含死亡）是白底，文字要黑
            this.ctx.fillStyle = isIdentifiedPatient ? '#fff' : '#333';

            // [New] 增加描邊以提高可讀性（特別是當 X 標記重疊時）
            this.ctx.lineWidth = 3;
            this.ctx.lineJoin = 'round'; // [B2] 數字轉角不出尖刺
            // 如果是案主(白字)，用深色描邊；如果是普通(黑字)，用白色描邊
            this.ctx.strokeStyle = isIdentifiedPatient ? '#333' : '#fff';
            this.ctx.strokeText(String(age), x, y);

            this.ctx.fillText(String(age), x, y);
        }

        if (person.sexualOrientation) {
            this.drawSexualOrientationMarker(x, y, halfSize);
        }

        this.drawPersonText(person, view);

        this.ctx.restore();
    }

    /**
     * 繪製性別取向標記 (倒三角)
     */
    drawSexualOrientationMarker(x, y, halfSize) {
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2; // 線條寬度
        this.ctx.lineJoin = 'round'; // [B2] 尖角不外突
        this.ctx.beginPath();
        // 倒三角大小：約 halfSize 的 0.7 倍 (稍微大一點清楚)
        const s = halfSize * 0.7;
        const cy = y; // 中心點 Y

        // 倒三角頂點向下
        // 計算三角形高度 h = s * sqrt(3) / 2 ??? No, let's just use simple coordinates.
        // Assuming s is "radius" or half-width? 
        // Let's keep existing logic but adjust coordinates for a centered equilateral-ish triangle.

        // 頂點 A (左上)
        this.ctx.moveTo(x - s, cy - s * 0.6);
        // 頂點 B (右上)
        this.ctx.lineTo(x + s, cy - s * 0.6);
        // 頂點 C (下中)
        this.ctx.lineTo(x, cy + s * 0.8);

        this.ctx.closePath();
        this.ctx.stroke(); // 改為空心描邊
    }

    /**
     * 繪製關係線上的日期/說明 (顯示於線上)
     */
    drawRelationshipDate(fromPerson, toPerson, relationship, persons, relationships) {
        if (!relationship.date) return;

        // 計算 Offset (需與 drawRelationship 邏輯保持一致)
        const sharedRelationships = relationships.filter(r =>
            (r.fromPersonId === fromPerson.id && r.toPersonId === toPerson.id) ||
            (r.fromPersonId === toPerson.id && r.toPersonId === fromPerson.id)
        );
        // 過濾掉 parent-child，只保留 marriage/emotional 類型的關係參與計算 offset
        const compareRels = sharedRelationships.filter(r => {
            const cat = typeof r.getCategory === 'function' ? r.getCategory() : Relationship.getCategory(r.type);
            return cat !== 'family';
        });

        compareRels.sort((a, b) => String(a.id).localeCompare(String(b.id)));

        const index = compareRels.findIndex(r => r.id === relationship.id);
        const total = compareRels.length;
        const gap = 30; // 假設 gap 為 30，需確認 drawRelationship 實際值

        let offset = 0;
        if (index !== -1) {
            offset = (index - (total - 1) / 2) * gap;
        }

        // 計算中心點與偏移
        // 計算中心點與偏移
        const dx = toPerson.x - fromPerson.x;
        const dy = toPerson.y - fromPerson.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;

        // 計算線條角度
        let angle = Math.atan2(dy, dx);

        let finalX, finalY;
        const category = typeof relationship.getCategory === 'function'
            ? relationship.getCategory() : Relationship.getCategory(relationship.type);
        let marriageRoute = null;
        let horizontalSegment = null; // [2-4] 裝飾所在的水平線段（供文字避開被夾者）
        if (category === 'marriage') {
            marriageRoute = this.getMarriageRoute(
                fromPerson, toPerson, relationship, relationships);
            finalX = marriageRoute.decoration.x;
            finalY = marriageRoute.decoration.y;
            const decorationSegment = marriageRoute.points.slice(1)
                .map((point, index) => [marriageRoute.points[index], point])
                .find(([start, end]) => this.distanceToLineSegment(
                    finalX, finalY, start.x, start.y, end.x, end.y) <= 1e-7);
            angle = decorationSegment
                ? Math.atan2(decorationSegment[1].y - decorationSegment[0].y,
                    decorationSegment[1].x - decorationSegment[0].x)
                : 0;
            if (decorationSegment && Math.abs(decorationSegment[1].y - decorationSegment[0].y) < 0.5) {
                horizontalSegment = decorationSegment;
            }
        } else {
            // 一般模式
            // 單位法向量 (normal vector)
            const nx = -dy / dist;
            const ny = dx / dist;

            // 線條中心點
            const cx = (fromPerson.x + toPerson.x) / 2;
            const cy = (fromPerson.y + toPerson.y) / 2;

            // 應用偏移 (Offset)
            finalX = cx + nx * offset;
            finalY = cy + ny * offset;
        }

        // 繪製文字 (支援換行，沿線條方向)
        this.ctx.save();
        this.ctx.font = '12px ' + this.fontFamily;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';

        // 處理換行
        const lines = relationship.date.split('\n');
        const lineHeight = 16;

        let maxWidth = 0;
        lines.forEach(line => {
            const w = this.ctx.measureText(line).width;
            if (w > maxWidth) maxWidth = w;
        });

        const totalHeight = lines.length * lineHeight;
        const padding = 4;

        // [2-4] 同列直線婚姻線穿過中間人物時，日期文字沿線左右滑到「不壓住任何人物符號」的最近位置。
        // 只動文字、不動線（使用者 2026-09-02 決定線的走法維持字面直線）。ㄩ 下折（文字在橫桿下方）不套用。
        const textBelowBar = marriageRoute && marriageRoute.attachmentSegment
            && marriageRoute.attachmentSegment.start.y > Math.max(fromPerson.y, toPerson.y) + this.personSize / 2;
        let raiseAboveSymbols = false; // [2-4] 左右都塞不下時的退路：文字抬到被夾者符號頂端之上
        if (horizontalSegment && !textBelowBar && Array.isArray(persons) && lines.length) {
            const half = this.personSize / 2 + 3;
            const boxHalfW = maxWidth / 2 + padding;
            const boxTop = finalY - 8 - totalHeight - padding;
            const boxBottom = finalY - 8;
            const blockers = persons.filter(p => p && p.id !== fromPerson.id && p.id !== toPerson.id
                && typeof p.x === 'number' && typeof p.y === 'number'
                && p.y + half > boxTop && p.y - half < boxBottom);
            if (blockers.length) {
                const segMinX = Math.min(horizontalSegment[0].x, horizontalSegment[1].x) + boxHalfW + 4;
                const segMaxX = Math.max(horizontalSegment[0].x, horizontalSegment[1].x) - boxHalfW - 4;
                const isFree = cx => !blockers.some(p => Math.abs(p.x - cx) < half + boxHalfW);
                if (!isFree(finalX) && segMaxX >= segMinX) {
                    let best = null;
                    for (let shift = 10; shift <= 4000 && best === null; shift += 10) {
                        const left = finalX - shift, right = finalX + shift;
                        if (left >= segMinX && isFree(left)) { best = left; break; }
                        if (right <= segMaxX && isFree(right)) { best = right; break; }
                        if (left < segMinX && right > segMaxX) break;
                    }
                    if (best !== null) finalX = best;
                    else raiseAboveSymbols = true;
                } else if (!isFree(finalX)) {
                    raiseAboveSymbols = true;
                }
            }
        }

        // 移動到文字位置並旋轉
        this.ctx.translate(finalX, finalY);

        // 如果角度使文字顛倒（超過 90° 或小於 -90°），翻轉 180°
        if (angle > Math.PI / 2) {
            angle -= Math.PI;
        } else if (angle < -Math.PI / 2) {
            angle += Math.PI;
        }

        this.ctx.rotate(angle);

        // 文字在線條上方的偏移
        let textOffsetY = -8;

        // 判斷是否為垂直線（或接近垂直）
        // 如果是垂直線，增加偏移量以避免遮擋人物下方的備註
        if (Math.abs(dy) > Math.abs(dx) * 2) {
            textOffsetY = -25; // 增加偏移量，讓文字水平移動更多
        }

        // [Fix] ㄩ 下折：文字改放橫桿「下方」（正向 offset），不放線上方以免卡進姓名區
        if (marriageRoute && marriageRoute.attachmentSegment.start.y
            > Math.max(fromPerson.y, toPerson.y) + this.personSize / 2) {
            textOffsetY = totalHeight + 8;
        }
        // [2-4] 退路：抬到被夾者符號頂端之上（符號半徑 + 6）
        if (raiseAboveSymbols) textOffsetY = -(this.personSize / 2 + 6);

        // 畫半透明背景
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        this.ctx.fillRect(
            -maxWidth / 2 - padding,
            textOffsetY - totalHeight - padding,
            maxWidth + padding * 2,
            totalHeight + padding
        );

        // 畫文字
        this.ctx.fillStyle = '#333';
        lines.forEach((line, i) => {
            const y = textOffsetY - (lines.length - 1 - i) * lineHeight - 2;
            this.ctx.fillText(line, 0, y);
        });

        this.ctx.restore();
    }

    /**
     * 繪製醫學符號
     */
    drawMedicalSymbols(x, y, size, gender, medical, transgender = null) {
        const halfSize = size / 2;

        this.ctx.save();
        this.ctx.beginPath();

        // 根據性別和跨性別狀態決定 clip 路徑
        if (transgender === 'ftm') {
            // 女跨男: 外方形，clip 用方形
            this.ctx.rect(x - halfSize, y - halfSize, size, size);
        } else if (transgender === 'mtf') {
            // 男跨女: 外圓形，clip 用圓形
            this.ctx.arc(x, y, halfSize, 0, Math.PI * 2);
        } else if (gender === 'female') {
            this.ctx.arc(x, y, halfSize, 0, Math.PI * 2);
        } else if (gender === 'pregnancy') {
            this.ctx.moveTo(x, y - halfSize);
            this.ctx.lineTo(x + halfSize, y + halfSize);
            this.ctx.lineTo(x - halfSize, y + halfSize);
            this.ctx.closePath();
        } else if (gender === 'same') {
            // 圓頂方底 (Tombstone shape)
            this.ctx.arc(x, y, halfSize, Math.PI, 0);
            this.ctx.lineTo(x + halfSize, y + halfSize);
            this.ctx.lineTo(x - halfSize, y + halfSize);
            this.ctx.closePath();
        } else {
            // 預設男性方形
            this.ctx.rect(x - halfSize, y - halfSize, size, size);
        }
        this.ctx.clip(); // 限制繪製範圍在形狀內

        // 左半部 (生理/心理)
        if (medical.leftHalf === 'filled') {
            this.ctx.fillStyle = '#333';
            this.ctx.fillRect(x - halfSize, y - halfSize, halfSize, size);
        } else if (medical.leftHalf === 'striped') {
            this.drawStripes(x - halfSize, y - halfSize, halfSize, size);
        }

        // 下半部 (物質)
        if (medical.bottomHalf === 'filled') {
            this.ctx.fillStyle = '#333';
            this.ctx.fillRect(x - halfSize, y, size, halfSize);
        } else if (medical.bottomHalf === 'striped') {
            this.drawStripes(x - halfSize, y, size, halfSize);
        }

        this.ctx.restore();

        // 已移除中心符號 (dot, cross, question)

        // 文字標記 (S, O, L) - 右下角
        const tags = [];
        if (medical.isSmoker) tags.push('S');
        if (medical.isObese) tags.push('O');
        if (medical.hasLanguageProblem) tags.push('L');

        if (tags.length > 0) {
            this.ctx.font = '10px sans-serif';
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'bottom';
            this.ctx.fillStyle = (medical.bottomHalf === 'filled') ? '#fff' : '#333';
            // 畫在形狀內的右下角
            let tx = x + halfSize - 2;
            let ty = y + halfSize - 2;
            if (gender === 'female' || transgender === 'mtf') {
                // 圓形內縮一點
                tx -= 4;
                ty -= 4;
            } else if (gender === 'same') {
                // 圓頂方底，下半部是方形，稍微內縮
                ty -= 2;
            }
            this.ctx.fillText(tags.join(''), tx, ty);
        }
    }

    /**
     * 繪製斜線 (Stripes)
     */
    drawStripes(x, y, w, h) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(x, y, w, h);
        this.ctx.clip();

        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;

        const step = 4;
        const max = w + h;
        for (let i = -h; i < max; i += step) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + i, y);
            this.ctx.lineTo(x + i - h, y + h); // 斜線方向 /
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    /**
     * [Fix] 人物「符號 + 姓名(+ 最多 2 行備註)」文字區的底緣 Y。
     * 用於 ㄩ 下折橫桿避開被夾成員的姓名文字（與 drawPerson 的 y+half+8 起繪、字高 fontSize 一致）。
     */
    _labelBottomY(p) {
        const geometry = this.getPersonLabelGeometry(p,
            { showNames: true, showNotes: true });
        return geometry.bounds?.bottom ?? (p.y + this.personSize / 2);
    }


    /**
     * 繪製關係線
     */
    drawRelationship(fromPerson, toPerson, relationship, isSelected = false, persons = [], allRelationships = []) {
        const style = relationship.getLineStyle();
        const category = relationship.getCategory();
        const marriageRoute = category === 'marriage'
            ? this.getMarriageRoute(fromPerson, toPerson, relationship, allRelationships)
            : null;

        // [New] 計算多重關係位移 (Parallel Lines) - 僅用於非天橋模式的情感關係
        let offset = 0;
        if (category === 'emotional' && allRelationships.length > 0) {
            const samePairRels = allRelationships.filter(r =>
                (r.fromPersonId === fromPerson.id && r.toPersonId === toPerson.id) ||
                (r.fromPersonId === toPerson.id && r.toPersonId === fromPerson.id)
            );

            if (samePairRels.length > 1) {
                const emotionalRels = samePairRels.filter(r => r.getCategory() === 'emotional');
                if (category === 'emotional') {
                    const myIdx = emotionalRels.findIndex(r => r.id === relationship.id);
                    const gap = 18;
                    const total = emotionalRels.length;
                    offset = (myIdx - (total - 1) / 2) * gap;
                }
            }
        }

        this.ctx.save();

        // [精緻化] 關係線一律圓角端點/轉角（波浪、鋸齒、虛線點均更柔和；匯出共用）
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // 如果被選中，繪製高亮外框
        if (isSelected) {
            this.ctx.save();
            this.ctx.strokeStyle = '#4a90d9';

            if (category === 'marriage') {
                // 婚姻高亮與主線共用完全相同的 canonical route。
                this.ctx.lineWidth = style.width + 8;
                this.ctx.globalAlpha = 0.6;
                this.drawMarriagePath(marriageRoute.points, marriageRoute.decoration,
                    { ...style, pattern: 'solid', decoration: null });

            } else if (category === 'family') {
                // 親子關係高亮：from=parent → to=child 方向由資料決定（不看 Y 座標）
                this.ctx.lineWidth = style.width + 10;
                this.ctx.globalAlpha = 0.8;
                const fromPoint = fromPerson.getConnectionPoint('bottom');
                const toPoint = toPerson.getConnectionPoint('top');
                const midY = (fromPoint.y + toPoint.y) / 2;
                this.ctx.beginPath();
                this.ctx.moveTo(fromPoint.x, fromPoint.y);
                this.ctx.lineTo(fromPoint.x, midY);
                this.ctx.lineTo(toPoint.x, midY);
                this.ctx.lineTo(toPoint.x, toPoint.y);
                this.ctx.stroke();
            } else {
                // 情感/其他高亮
                this.ctx.lineWidth = style.width + 8;
                this.ctx.globalAlpha = 0.6;
                let path = this.getSmartPath(fromPerson, toPerson, persons);
                if (offset !== 0 && path.length >= 2) {
                    // 跟主線繪製一致：perp 用 canonical direction（min(fromId,toId) 當起點）
                    const swap = relationship.fromPersonId > relationship.toPersonId;
                    const cFrom = swap ? toPerson : fromPerson;
                    const cTo = swap ? fromPerson : toPerson;
                    const dx = cTo.x - cFrom.x;
                    const dy = cTo.y - cFrom.y;
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;
                    const ux = dx / len;
                    const uy = dy / len;
                    path = path.map(pt => ({
                        x: pt.x + (-uy * offset),
                        y: pt.y + (ux * offset)
                    }));
                }
                this.ctx.beginPath();
                if (path.length > 0) {
                    this.ctx.moveTo(path[0].x, path[0].y);
                    for (let i = 1; i < path.length; i++) this.ctx.lineTo(path[i].x, path[i].y);
                }
                this.ctx.stroke();
            }
            this.ctx.restore();
        }

        this.ctx.strokeStyle = style.color;
        this.ctx.lineWidth = style.width;

        if (category === 'marriage') {
            this.drawMarriagePath(
                marriageRoute.points, marriageRoute.decoration, style);

        } else if (category === 'family') {
            // 親子關係：from=parent → to=child 方向由資料決定（不看 Y 座標）。
            // 注意：主流程 render 走 drawFamilies，此分支為 fallback/死代碼，保留語意一致
            const fromPoint = fromPerson.getConnectionPoint('bottom');
            const toPoint = toPerson.getConnectionPoint('top');
            this.drawStandardLine(fromPoint, toPoint, style);

        } else {
            // 情感
            let path = this.getSmartPath(fromPerson, toPerson, persons);
            if (offset !== 0 && path.length >= 2) {
                // perp 用 canonical direction 計算（較小 id 當起點），不依 path local 方向。
                // 否則 B→A 的 path 反向會讓 perp 也反向，使 A→B 和 B→A 的位移落在同一側、重疊。
                const swap = relationship.fromPersonId > relationship.toPersonId;
                const cFrom = swap ? toPerson : fromPerson;
                const cTo = swap ? fromPerson : toPerson;
                const dx = cTo.x - cFrom.x;
                const dy = cTo.y - cFrom.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                path = path.map(pt => ({
                    x: pt.x + (-uy * offset),
                    y: pt.y + (ux * offset)
                }));
            }
            this.ctx.setLineDash(this.getLineDash(style.pattern));
            this.drawPatternOnPath(path, style);
            this.ctx.setLineDash(DASH_PATTERNS.solid);
            this.drawEmotionalDecorations(path, style);
        }

        this.ctx.restore();
    }















    getVisibleExportData(persons, relationships, households = [], lifeCircles = [], viewOptions = {}) {
        const view = this.normalizeViewOptions(viewOptions);
        return {
            persons,
            relationships: relationships.filter(rel => view.showEmotionalRelationships
                || !Relationship.isEmotionalDisplayType(rel.type)),
            households: view.showHouseholds ? households : [],
            lifeCircles: view.showLifeCircles ? lifeCircles : [],
            viewOptions: view
        };
    }

    getContentBounds(persons, relationships, households = [], lifeCircles = [], viewOptions = {}) {
        const visible = this.getVisibleExportData(
            persons, relationships, households, lifeCircles, viewOptions);
        return this._calculateContentBounds(
            visible.persons, visible.relationships, visible.households, visible.lifeCircles,
            visible.viewOptions, relationships);
    }

    /**
     * 計算內容邊界 (包含所有人物、關係、同住框、生活圈)
     */
    _calculateContentBounds(persons, relationships, households, lifeCircles,
        viewOptions = {}, allRelationships = relationships) {
        this.prepareDerivedGeometry(persons, allRelationships);
        const view = this.normalizeViewOptions(viewOptions);
        // [Fix] 不再因 persons 為空提前 return：
        // 純生活圈/同住框的畫布也要能匯出（最後以 Infinity 檢查是否真的全空）
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        // 1. 人物
        persons.forEach(p => {
            const halfSize = this.personSize / 2 + 10;
            minX = Math.min(minX, p.x - halfSize);
            minY = Math.min(minY, p.y - halfSize);
            maxX = Math.max(maxX, p.x + halfSize);
            maxY = Math.max(maxY, p.y + halfSize);
            const label = this.getPersonLabelGeometry(p, view);
            if (label.bounds) {
                minX = Math.min(minX, label.bounds.left);
                minY = Math.min(minY, label.bounds.top);
                maxX = Math.max(maxX, label.bounds.right);
                maxY = Math.max(maxY, label.bounds.bottom);
            }
        });

        // 2. 同住家庭
        if (households && households.length > 0) {
            households.forEach(household => {
                const bounds = this.getHouseholdBounds(household, persons, relationships);
                if (bounds && bounds.hullPoints) {
                    bounds.hullPoints.forEach(pt => {
                        minX = Math.min(minX, pt.x);
                        minY = Math.min(minY, pt.y);
                        maxX = Math.max(maxX, pt.x);
                        maxY = Math.max(maxY, pt.y);
                    });
                }
            });
        }

        // 3. 生活圈
        if (lifeCircles && lifeCircles.length > 0) {
            lifeCircles.forEach(lc => {
                if (lc.points) {
                    lc.points.forEach(pt => {
                        minX = Math.min(minX, pt.x);
                        minY = Math.min(minY, pt.y);
                        maxX = Math.max(maxX, pt.x);
                        maxY = Math.max(maxY, pt.y);
                    });
                }
            });
        }

        // 4. [New] 關係線 (包含天橋)
        if (relationships && relationships.length > 0) {
            relationships.forEach(rel => {
                const fromPerson = this.personMap.get(rel.fromPersonId);
                const toPerson = this.personMap.get(rel.toPersonId);
                if (fromPerson && toPerson) {
                    // 使用相同的 getRelationshipPath 邏輯來取得所有路徑點
                    // 注意：這裡傳入 relationships 是為了正確計算 offset和天橋配置
                    const points = this.getRelationshipPath(fromPerson, toPerson, rel, allRelationships);
                    points.forEach(pt => {
                        minX = Math.min(minX, pt.x);
                        minY = Math.min(minY, pt.y);
                        maxX = Math.max(maxX, pt.x);
                        maxY = Math.max(maxY, pt.y);
                    });
                }
            });
        }

        // [Fix] 全空（無人物、無框、無圈、無關係）才回 null
        if (minX === Infinity) {
            return null;
        }

        // 加上安全邊距
        const margin = 50;
        minX -= margin;
        minY -= margin;
        maxX += margin;
        maxY += margin;

        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    getLegendRenderItem(entry) {
        if (!entry || !Object.values(Relationship.TYPES).includes(entry.type)) return null;
        const relationship = new Relationship({ type: entry.type, linkType: entry.linkType });
        const line = relationship.getLineStyle();
        let style = line.pattern;
        if (entry.type === 'parent-child' && entry.linkType === 'adopted') style = 'dashed';
        if (entry.type === 'parent-child' && entry.linkType === 'foster') style = 'dotted';
        const pattern = style === 'dashed' ? DASH_PATTERNS.engaged
            : style === 'dotted' ? DASH_PATTERNS.cohabit
                : DASH_PATTERNS.solid;
        return {
            label: entry.label,
            style,
            color: line.color,
            width: line.width,
            pattern,
            decoration: line.decoration
        };
    }

    getLegendRenderSections(viewOptions = {}, usedTypes = null) {
        const view = this.normalizeViewOptions(viewOptions);
        const sections = Relationship.getLegendSections({
            showEmotional: view.showEmotionalRelationships
        }).map(section => ({
            ...section,
            title: section.exportTitle,
            items: section.entries.filter(entry => usedTypes === null || usedTypes.has(
                entry.type === 'parent-child' ? `parent-child:${entry.linkType}` : entry.type))
                .map(entry => this.getLegendRenderItem(entry)).filter(Boolean)
        })).filter(section => section.items.length > 0);
        if (usedTypes === null || usedTypes.has('household')) {
            const rows = column => sections.filter(section => section.column === column)
                .reduce((total, section) => total + section.items.length + 1.5, 0);
            sections.push({ id: 'symbols', title: '圖形符號',
                column: rows('left') <= rows('right') ? 'left' : 'right',
                items: [{ type: 'household', label: '同住圈' }] });
        }
        return sections;
    }

    /**
     * 繪製箭頭
     */




    _getFamilyRouteSignature(persons, relationships) {
        const personData = (Array.isArray(persons) ? persons : [])
            .map(person => [
                String(person.id), person.x, person.y, person.name || '', person.notes || '',
                person.twinGroup || '', person.zygosity || ''
            ])
            .sort((a, b) => a[0].localeCompare(b[0]));
        const relationshipData = (Array.isArray(relationships) ? relationships : [])
            .map(rel => [
                String(rel.id), rel.type, rel.fromPersonId, rel.toPersonId,
                rel.linkType || '', rel.routeMode || '', rel.routeLift || 0
            ])
            .sort((a, b) => a[0].localeCompare(b[0]));
        return JSON.stringify([this.personSize, this.fontSize, this.fontFamily, personData, relationshipData]);
    }

    _getDerivedGeometrySignature(persons, relationships) {
        const personData = (Array.isArray(persons) ? persons : [])
            .map(person => [
                String(person.id), person.x, person.y,
                person.name || '', person.notes || ''
            ])
            .sort((a, b) => a[0].localeCompare(b[0]));
        const marriageData = (Array.isArray(relationships) ? relationships : [])
            .filter(rel => Relationship.getCategory(rel.type) === 'marriage')
            .map(rel => [
                String(rel.id), rel.type, rel.fromPersonId, rel.toPersonId,
                rel.routeMode || '', rel.routeLift || 0
            ])
            .sort((a, b) => a[0].localeCompare(b[0]));
        return JSON.stringify([
            this.personSize, this.fontSize, this.fontFamily,
            personData, marriageData
        ]);
    }

    prepareDerivedGeometry(persons, relationships, { force = false } = {}) {
        const allPersons = Array.isArray(persons) ? persons : [];
        const allRelationships = Array.isArray(relationships) ? relationships : [];
        const signature = this._getDerivedGeometrySignature(allPersons, allRelationships);
        if (!(this.personMap instanceof Map)
            || allPersons.some(person => this.personMap.get(person.id) !== person)) {
            this.personMap = new Map(allPersons.map(person => [person.id, person]));
        }
        if (!force && signature === this._derivedGeometrySignature) return;
        this._derivedGeometrySignature = signature;
        this.personLabelPlacements = new Map();
        this.marriageRouteCache = new Map();
        this._labelRoutingWarnings = [];
        this._placeLabelsForRelationshipRoutes(allPersons, allRelationships);
        this._prepareMarriageRoutes(allPersons, allRelationships);
    }

    _pathHitsRect(points, rect) {
        if (!rect || typeof FamilyRoutePlanner === 'undefined') return false;
        return (Array.isArray(points) ? points : []).slice(1).some((point, index) =>
            FamilyRoutePlanner.segmentIntersectsRect(points[index], point, rect));
    }

    _rectsOverlap(a, b) {
        return Boolean(a && b
            && a.left < b.right && a.right > b.left
            && a.top < b.bottom && a.bottom > b.top);
    }

    _labelPlacementCandidates(person) {
        return [{ side: 'above' }, { side: 'left' }, { side: 'right' }].map(placement => ({
            placement,
            geometry: this.getPersonLabelGeometry(person,
                { showNames: true, showNotes: true }, placement)
        }));
    }

    _placeLabelsForRelationshipRoutes(persons, relationships) {
        // Labels deliberately stay in their original below position unless the user moves them.
        // Manual offsets are read directly from Person, so this derived cache remains empty.
        this.personLabelPlacements = new Map();
    }

    /**
     * [B1-perf] 文字壓線警告（lazy accessor）。
     * render() 只標記 dirty；第一次讀取時才計算，之後沿用到下一次 render。
     * 直接指派（含 invalidateDerivedGeometry）會清掉 dirty，讓「剛重設 = 空陣列」語意不變。
     */
    get labelRoutingWarnings() {
        if (this._labelWarningsDirty) {
            this._labelWarningsDirty = false;
            this._refreshLabelRouteWarnings(this.lastPersons, this.lastRelationships);
        }
        return this._labelRoutingWarnings || [];
    }

    set labelRoutingWarnings(value) {
        this._labelRoutingWarnings = Array.isArray(value) ? value : [];
        this._labelWarningsDirty = false;
    }

    _refreshLabelRouteWarnings(persons, relationships) {
        const allPersons = Array.isArray(persons) ? persons : [];
        const allRelationships = Array.isArray(relationships) ? relationships : [];
        this._labelRoutingWarnings = (this._labelRoutingWarnings || [])
            .filter(warning => warning.reason !== 'label-route-overlap');
        if (typeof FamilyRoutePlanner === 'undefined') return;
        const view = this.normalizeViewOptions(this.viewOptions);
        if (!view.showNames && !view.showNotes) return;

        const routes = allRelationships
            .filter(relationship => view.showEmotionalRelationships
                || !Relationship.isEmotionalDisplayType(relationship.type))
            .slice()
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
            .map(relationship => {
                const from = this.personMap.get(relationship.fromPersonId);
                const to = this.personMap.get(relationship.toPersonId);
                if (!from || !to) return null;
                return {
                    relationship,
                    points: this.getRelationshipPath(from, to, relationship, allRelationships)
                };
            })
            .filter(route => route && Array.isArray(route.points) && route.points.length >= 2);

        allPersons.forEach(person => {
            const label = this.getPersonLabelGeometry(person,
                view);
            if (!label.bounds) return;
            routes.forEach(route => {
                if (!this._pathHitsRect(route.points, label.bounds)) return;
                this._labelRoutingWarnings.push({
                    personId: person.id,
                    relationshipId: route.relationship.id,
                    reason: 'label-route-overlap'
                });
            });
        });
    }

    _placeLabelsForForcedStraight(persons, relationships) {
        this._placeLabelsForRelationshipRoutes(persons, relationships);
    }

    getSymbolRouteObstacles(persons) {
        const obstacles = [];
        const half = this.personSize / 2;
        const symbolMargin = 10;
        (Array.isArray(persons) ? persons : []).forEach(person => {
            if (!person || !Number.isFinite(person.x) || !Number.isFinite(person.y)) return;
            obstacles.push({
                ownerId: person.id,
                kind: 'symbol',
                left: person.x - half - symbolMargin,
                right: person.x + half + symbolMargin,
                top: person.y - half - symbolMargin,
                bottom: person.y + half + symbolMargin
            });
        });
        return obstacles;
    }

    getPersonRouteObstacles(persons) {
        const obstacles = this.getSymbolRouteObstacles(persons);

        (Array.isArray(persons) ? persons : []).forEach(person => {
            if (!person || !Number.isFinite(person.x) || !Number.isFinite(person.y)) return;
            const label = this.getPersonLabelGeometry(person,
                { showNames: true, showNotes: true });
            label.rows.forEach(row => {
                obstacles.push({
                    ownerId: person.id,
                    kind: 'text',
                    left: row.bounds.left - GenogramCanvas.LABEL_SAFE_MARGIN,
                    right: row.bounds.right + GenogramCanvas.LABEL_SAFE_MARGIN,
                    top: row.bounds.top - GenogramCanvas.LABEL_SAFE_MARGIN,
                    bottom: row.bounds.bottom + GenogramCanvas.LABEL_SAFE_MARGIN
                });
            });
        });

        return obstacles;
    }

    _buildFamilyGroups(familyRels, kinship) {
        const childParents = new Map();
        const pairRelIds = new Map();
        familyRels.forEach(rel => {
            const normalized = kinship.normalizeParentChild(rel);
            if (!normalized) return;
            const { parentId, childId } = normalized;
            if (!childParents.has(childId)) childParents.set(childId, new Set());
            childParents.get(childId).add(parentId);
            const pairKey = `${parentId}\u0000${childId}`;
            if (!pairRelIds.has(pairKey)) pairRelIds.set(pairKey, []);
            pairRelIds.get(pairKey).push(rel.id);
        });

        const familyMap = new Map();
        Array.from(childParents.keys()).sort().forEach(childId => {
            const parentIds = Array.from(childParents.get(childId)).sort();
            const familyKey = parentIds.join('\u0001');
            if (!familyMap.has(familyKey)) {
                familyMap.set(familyKey, {
                    key: familyKey,
                    parentIds,
                    childIds: [],
                    relIds: [],
                    childToRelIds: {},
                    pairToRelIds: {}
                });
            }
            const family = familyMap.get(familyKey);
            family.childIds.push(childId);
            family.childToRelIds[childId] = [];
            parentIds.forEach(parentId => {
                const pairKey = `${parentId}\u0000${childId}`;
                const ids = [...(pairRelIds.get(pairKey) || [])].sort();
                family.pairToRelIds[pairKey] = ids;
                ids.forEach(relId => {
                    family.childToRelIds[childId].push(relId);
                    if (!family.relIds.includes(relId)) family.relIds.push(relId);
                });
            });
            family.childToRelIds[childId].sort();
            family.relIds.sort();
        });
        return Array.from(familyMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    }

    _getFamilySource(parentObjs, childObjs, otherRels, obstacles) {
        const half = this.personSize / 2;
        const childCenterX = childObjs.reduce((sum, child) => sum + child.x, 0) / childObjs.length;
        if (parentObjs.length >= 2) {
            const p1 = parentObjs[0];
            const p2 = parentObjs[1];
            const marriageRel = otherRels.find(rel => {
                const category = typeof rel.getCategory === 'function'
                    ? rel.getCategory()
                    : Relationship.getCategory(rel.type);
                const connects = typeof rel.involvesPerson === 'function'
                    ? rel.involvesPerson(p1.id) && rel.involvesPerson(p2.id)
                    : ((rel.fromPersonId === p1.id && rel.toPersonId === p2.id) ||
                       (rel.fromPersonId === p2.id && rel.toPersonId === p1.id));
                return category === 'marriage' && connects;
            });

            if (marriageRel) {
                const route = this.getMarriageRoute(p1, p2, marriageRel, otherRels);
                const minX = Math.min(route.attachmentSegment.start.x,
                    route.attachmentSegment.end.x);
                const maxX = Math.max(route.attachmentSegment.start.x,
                    route.attachmentSegment.end.x);
                const y = route.attachmentSegment.start.y;
                const desiredX = childObjs.length === 1 ? childObjs[0].x : childCenterX;
                return {
                    source: { x: Math.max(minX, Math.min(maxX, desiredX)), y },
                    sourceRange: { minX, maxX },
                    sourcePrefix: [],
                    marriageRel,
                    virtualPair: false
                };
            }

            const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            return {
                source: midpoint,
                sourceRange: { minX: midpoint.x, maxX: midpoint.x },
                sourcePrefix: [],
                marriageRel: null,
                virtualPair: true
            };
        }

        const parent = parentObjs[0];
        const textBoxes = obstacles.filter(rect => rect.ownerId === parent.id && rect.kind === 'text');
        if (textBoxes.length === 0) {
            const source = { x: parent.x, y: parent.y + half };
            return {
                source,
                sourceRange: { minX: source.x, maxX: source.x },
                sourcePrefix: [],
                marriageRel: null,
                virtualPair: false
            };
        }

        const direction = childCenterX >= parent.x ? 1 : -1;
        const textEdge = direction > 0
            ? Math.max(...textBoxes.map(rect => rect.right))
            : Math.min(...textBoxes.map(rect => rect.left));
        const outerX = direction > 0
            ? Math.max(parent.x + half + 10, textEdge + 10)
            : Math.min(parent.x - half - 10, textEdge - 10);
        const port = { x: parent.x + direction * half, y: parent.y };
        const source = { x: outerX, y: parent.y };
        return {
            source,
            sourceRange: { minX: source.x, maxX: source.x },
            sourcePrefix: [port, source],
            marriageRel: null,
            virtualPair: false
        };
    }

    _getRelevantFamilyRouteObstacles(obstacles, parentObjs, childObjs, sourceInfo) {
        const parentY = parentObjs.reduce((sum, person) => sum + person.y, 0) / parentObjs.length;
        const childY = childObjs.reduce((sum, person) => sum + person.y, 0) / childObjs.length;
        if (childY < parentY || Math.abs(childY - parentY) < this.personSize) return obstacles;

        const xs = childObjs.map(child => child.x);
        const ys = childObjs.map(child => child.y - this.personSize / 2);
        if (sourceInfo.source) {
            xs.push(sourceInfo.source.x);
            ys.push(sourceInfo.source.y);
        }
        if (sourceInfo.sourceRange) {
            xs.push(sourceInfo.sourceRange.minX, sourceInfo.sourceRange.maxX);
        }
        (sourceInfo.sourcePrefix || []).forEach(point => {
            xs.push(point.x);
            ys.push(point.y);
        });
        if (!xs.every(Number.isFinite) || !ys.every(Number.isFinite)) return obstacles;

        const left = Math.min(...xs);
        const right = Math.max(...xs);
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);
        return obstacles.filter(obstacle =>
            obstacle.right > left && obstacle.left < right &&
            obstacle.bottom > top && obstacle.top < bottom
        );
    }

    _getRouteObstacleSignature(obstacles) {
        return JSON.stringify(obstacles
            .map(obstacle => [
                String(obstacle.ownerId || ''), obstacle.kind || '',
                obstacle.left, obstacle.right, obstacle.top, obstacle.bottom
            ])
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    }

    _getFamilyPlanCacheSignature(group, parentObjs, childObjs, sourceInfo, obstacles) {
        const people = [...parentObjs, ...childObjs]
            .map(person => [
                String(person.id), person.x, person.y,
                person.twinGroup || '', person.zygosity || ''
            ])
            .sort((a, b) => a[0].localeCompare(b[0]));
        return JSON.stringify([
            this.personSize,
            group.key,
            group.childIds,
            group.relIds,
            people,
            sourceInfo.source || null,
            sourceInfo.sourceRange || null,
            sourceInfo.sourcePrefix || [],
            Boolean(sourceInfo.virtualPair),
            this._getRouteObstacleSignature(obstacles)
        ]);
    }


    /**
     * 繪製多胞胎連接線
     * @param {Array} twins - 多胞胎成員列表
     * @param {number} parentBarY - 父母橫槓的 Y 座標
     * @param {string} selectedChildId - 當前選中的子女 ID (用於高亮)
     * @param {number} parentX - 可選，父母連接點的 X 座標（當所有子女都是多胞胎時使用）
     */
    drawTwinConnector(twins, parentBarY, selectedChildId = null, parentX = null) {
        if (twins.length < 2) return;

        // 按 X 座標排序多胞胎
        const sortedTwins = [...twins].sort((a, b) => a.x - b.x);

        // 計算連接點位置（中心）
        const leftmost = sortedTwins[0].x;
        const rightmost = sortedTwins[sortedTwins.length - 1].x;

        // 如果有指定父母 X 座標，使用它；否則用多胞胎中心
        const centerX = parentX !== null ? parentX : (leftmost + rightmost) / 2;

        // V 形連接：從連接點往下斜線到各子女頂部
        // [防超出] 若連接點低於子女符號下緣（拖曳途中倒置），改接下緣避免線穿過符號
        sortedTwins.forEach(twin => {
            const twinTop = twin.y - this.personSize / 2;
            const twinBottom = twin.y + this.personSize / 2;
            const endY = parentBarY >= twinBottom ? twinBottom : twinTop;

            this.ctx.beginPath();
            this.ctx.moveTo(centerX, parentBarY);
            this.ctx.lineTo(twin.x, endY);
            this.ctx.stroke();
        });

        // [Phase 1] 同卵雙胞胎：在 V 形中段加一條水平連接橫桿（McGoldrick: monozygotic）
        // 異卵（di / null）不畫；橫桿落在兩條斜線 50% 高度處、連接最外側兩條
        if (twins.length >= 2 && twins.every(t => t && t.zygosity === 'mono')) {
            const left = sortedTwins[0];
            const right = sortedTwins[sortedTwins.length - 1];
            const leftEndY = parentBarY >= (left.y + this.personSize / 2) ? (left.y + this.personSize / 2) : (left.y - this.personSize / 2);
            const rightEndY = parentBarY >= (right.y + this.personSize / 2) ? (right.y + this.personSize / 2) : (right.y - this.personSize / 2);
            const frac = 0.5;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX + (left.x - centerX) * frac, parentBarY + (leftEndY - parentBarY) * frac);
            this.ctx.lineTo(centerX + (right.x - centerX) * frac, parentBarY + (rightEndY - parentBarY) * frac);
            this.ctx.stroke();
        }
    }

    /**
     * 二值 marching squares（邊中點為頂點；鞍點 5/10 固定切法），回傳多個封閉輪廓（世界座標）
     */
    static marchingSquares(grid, nx, ny, toWorld) {
        const segs = [];
        const mid = {
            t: (i, j) => [i + 0.5, j], r: (i, j) => [i + 1, j + 0.5],
            b: (i, j) => [i + 0.5, j + 1], l: (i, j) => [i, j + 0.5]
        };
        const table = {
            1: [['l', 'b']], 2: [['b', 'r']], 3: [['l', 'r']], 4: [['t', 'r']],
            5: [['l', 't'], ['b', 'r']], 6: [['t', 'b']], 7: [['l', 't']], 8: [['t', 'l']],
            9: [['t', 'b']], 10: [['t', 'r'], ['l', 'b']], 11: [['t', 'r']], 12: [['l', 'r']],
            13: [['b', 'r']], 14: [['l', 'b']]
        };
        for (let j = 0; j < ny - 1; j++) {
            for (let i = 0; i < nx - 1; i++) {
                const tl = grid[j * nx + i], tr = grid[j * nx + i + 1];
                const br = grid[(j + 1) * nx + i + 1], bl = grid[(j + 1) * nx + i];
                const idx = (tl << 3) | (tr << 2) | (br << 1) | bl;
                if (idx === 0 || idx === 15) continue;
                (table[idx] || []).forEach(([a, b]) => segs.push([mid[a](i, j), mid[b](i, j)]));
            }
        }
        const key = p => p[0].toFixed(1) + ',' + p[1].toFixed(1);
        const adj = new Map();
        segs.forEach((s, si) => {
            [key(s[0]), key(s[1])].forEach(k => {
                if (!adj.has(k)) adj.set(k, []);
                adj.get(k).push(si);
            });
        });
        const used = new Uint8Array(segs.length);
        const loops = [];
        for (let s = 0; s < segs.length; s++) {
            if (used[s]) continue;
            used[s] = 1;
            const start = segs[s][0];
            const loop = [start];
            let cur = segs[s][1];
            let guard = 0;
            while (guard++ < segs.length + 2) {
                if (key(cur) === key(start)) break;
                loop.push(cur);
                const k = key(cur);
                const next = (adj.get(k) || []).find(si => !used[si]);
                if (next === undefined) break;
                used[next] = 1;
                const seg = segs[next];
                cur = key(seg[0]) === k ? seg[1] : seg[0];
            }
            if (loop.length >= 3) loops.push(loop.map(([gx, gy]) => toWorld(gx, gy)));
        }
        return loops;
    }

    /** Chaikin 角切平滑（封閉多邊形） */
    static chaikin(points, iterations = 1) {
        let pts = points;
        for (let it = 0; it < iterations; it++) {
            const out = [];
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i], q = pts[(i + 1) % pts.length];
                out.push({ x: 0.75 * p.x + 0.25 * q.x, y: 0.75 * p.y + 0.25 * q.y });
                out.push({ x: 0.25 * p.x + 0.75 * q.x, y: 0.25 * p.y + 0.75 * q.y });
            }
            pts = out;
        }
        return pts;
    }

    /**
     * 封閉多邊形依弧長等距重取樣（step 世界像素）。取代逐點共線刪除：
     * 逐點刪除在 Chaikin 後的密集點上會連鎖崩塌成八邊形（每個點都貼近鄰點的弦），重取樣則穩定且保形。
     */
    static simplifyClosed(points, step = 6) {
        if (!Array.isArray(points) || points.length < 3) return points;
        const n = points.length;
        const out = [points[0]];
        let acc = 0;
        for (let i = 0; i < n; i++) {
            const a = points[i], b = points[(i + 1) % n];
            const segLen = Math.hypot(b.x - a.x, b.y - a.y);
            if (segLen === 0) continue;
            let pos = step - acc; // 下一個取樣點距 a 的距離
            while (pos <= segLen) {
                const t = pos / segLen;
                out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
                pos += step;
            }
            acc = segLen - (pos - step);
        }
        // 最後一點若貼近起點就去掉（封閉）
        if (out.length > 3) {
            const f = out[0], l = out[out.length - 1];
            if (Math.hypot(f.x - l.x, f.y - l.y) < step * 0.5) out.pop();
        }
        return out.length >= 3 ? out : points;
    }

    /** 連續重複（距離 < 0.5）的點只留一個；封閉多邊形時也比對頭尾 */
    static dedupePath(points, closed = false) {
        const out = [];
        for (const p of points) {
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
            const last = out[out.length - 1];
            if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.5) continue;
            out.push(p);
        }
        if (closed && out.length > 1) {
            const f = out[0], l = out[out.length - 1];
            if (Math.hypot(f.x - l.x, f.y - l.y) < 0.5) out.pop();
        }
        return out;
    }

    /** 射線法：點是否在多邊形內 */
    static pointInPolygon(x, y, poly) {
        if (!Array.isArray(poly) || poly.length < 3) return false;
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
    }

    /**
     * 獲取關係線的路徑點（用於點擊檢測）
     * @param {Person} fromPerson
     * @param {Person} toPerson
     * @param {Relationship} relationship
     * @returns {Array} 路徑點陣列 [{x, y}, ...]
     */
    getRelationshipPath(fromPerson, toPerson, relationship, allRelationships = []) {
        const style = relationship.getLineStyle();
        const category = relationship.getCategory();
        const points = [];

        // Calculate offset for multi-relationships (same logic as drawRelationship)
        let offset = 0;
        if (allRelationships.length > 0) {
            const samePairRels = allRelationships.filter(r =>
                (r.fromPersonId === fromPerson.id && r.toPersonId === toPerson.id) ||
                (r.fromPersonId === toPerson.id && r.toPersonId === fromPerson.id)
            );

            if (samePairRels.length > 1 && category === 'emotional') {
                // 與 drawRelationship 保持一致的 offset 計算，避免 hit-test 跟實線錯位。
                // 均分公式：N 條情感線以中心為基準對稱分佈 (gap=18)。
                const emotionalRels = samePairRels.filter(r => r.getCategory() === 'emotional');
                const myIdx = emotionalRels.findIndex(r => r.id === relationship.id);
                const gap = 18;
                const total = emotionalRels.length;
                offset = (myIdx - (total - 1) / 2) * gap;
            }
        }

        if (category === 'family') {
            const plannedPath = this._getPlannedFamilyRelationshipPath(relationship, allRelationships);
            if (plannedPath) return plannedPath;

            // 親子關係：使用與 drawFamilies 對齊的路徑，避免「只有小段能點」問題
            // 方向 (parent/child) 由資料決定 (from=parent, to=child)，不看 Y 座標
            const fallbackFamilyPath = () => {
                if (fromPerson.y === toPerson.y) {
                    points.push({ x: fromPerson.x, y: fromPerson.y });
                    points.push({ x: toPerson.x, y: toPerson.y });
                    return;
                }

                const parentPerson = fromPerson;
                const childPerson = toPerson;
                // 反轉輩分時改走對稱 L 形 (parent.top → child.bottom)，跟 drawFamilies 一致
                const reversed = childPerson.y < parentPerson.y;
                const parentConnectY = reversed
                    ? parentPerson.y - this.personSize / 2
                    : parentPerson.y + this.personSize / 2;
                const childConnectY = reversed
                    ? childPerson.y + this.personSize / 2
                    : childPerson.y - this.personSize / 2;

                if (reversed) {
                    // L 形反轉
                    const midY = (parentConnectY + childConnectY) / 2;
                    points.push({ x: parentPerson.x, y: parentConnectY });
                    points.push({ x: parentPerson.x, y: midY });
                    points.push({ x: childPerson.x, y: midY });
                    points.push({ x: childPerson.x, y: childConnectY });
                    return;
                }

                const sourceY = parentConnectY;
                const childTop = childConnectY;
                let barY = (sourceY + childTop) / 2;
                if (barY < sourceY + 20) barY = sourceY + 20;
                if (barY > childTop - 20) barY = childTop - 20;
                if (sourceY >= childTop - 10) barY = sourceY + 30;

                points.push({ x: parentPerson.x, y: sourceY });
                points.push({ x: parentPerson.x, y: barY });
                points.push({ x: childPerson.x, y: barY });
                points.push({ x: childPerson.x, y: childTop });
            };

            // 反轉輩分：直接走 fallback L 形，不進主 trunk 計算（跟 drawFamilies 同步）
            if (toPerson.y < fromPerson.y) {
                fallbackFamilyPath();
                return points;
            }

            const allPersons = Array.isArray(this.lastPersons) ? this.lastPersons : [];
            const personById = new Map(allPersons.map(p => [p.id, p]));
            // 確保目前這兩位至少可用
            personById.set(fromPerson.id, fromPerson);
            personById.set(toPerson.id, toPerson);

            const categoryOf = (rel) =>
                (typeof rel.getCategory === 'function' ? rel.getCategory() : Relationship.getCategory(rel.type));

            const orientFamilyRel = (rel) => {
                // from=parent, to=child（資料語意，不看 Y 座標）
                const parent = personById.get(rel.fromPersonId);
                const child = personById.get(rel.toPersonId);
                if (!parent || !child) return null;
                return { parent, child };
            };

            const current = { parent: fromPerson, child: toPerson };

            // 同 Y 座標時走 fallback（避免後續 barY 計算異常）
            if (current.parent.y === current.child.y) {
                fallbackFamilyPath();
                return points;
            }

            const familyRels = allRelationships.filter(r => categoryOf(r) === 'family');
            const childToParentIds = new Map(); // childId -> Set(parentId)

            familyRels.forEach(rel => {
                const info = orientFamilyRel(rel);
                if (!info) return;
                if (!childToParentIds.has(info.child.id)) {
                    childToParentIds.set(info.child.id, new Set());
                }
                childToParentIds.get(info.child.id).add(info.parent.id);
            });

            const selectedChildId = current.child.id;
            const parentIdSet = childToParentIds.get(selectedChildId);
            if (!parentIdSet || parentIdSet.size === 0) {
                fallbackFamilyPath();
                return points;
            }

            const parentIds = Array.from(parentIdSet).sort();
            const sameIds = (a, b) => a.length === b.length && a.every((id, idx) => id === b[idx]);

            // 找同一組父母的全部子女（與 drawFamilies 的 family group 對齊）
            const childIds = [];
            childToParentIds.forEach((set, childId) => {
                const ids = Array.from(set).sort();
                if (sameIds(ids, parentIds)) {
                    childIds.push(childId);
                }
            });

            const parentObjs = parentIds.map(id => personById.get(id)).filter(p => p);
            const childObjs = childIds
                .map(id => personById.get(id))
                .filter(p => p);

            if (parentObjs.length === 0 || childObjs.length === 0) {
                fallbackFamilyPath();
                return points;
            }

            // 計算 sourceX/sourceY（與 drawFamilies 同步）
            let sourceX, sourceY;
            let hasMarriageSource = false;
            if (parentObjs.length >= 2) {
                const p1 = parentObjs[0];
                const p2 = parentObjs[1];

                const marriageRel = allRelationships.find(r => {
                    if (categoryOf(r) !== 'marriage') return false;
                    if (typeof r.involvesPerson === 'function') {
                        return r.involvesPerson(p1.id) && r.involvesPerson(p2.id);
                    }
                    return (
                        (r.fromPersonId === p1.id && r.toPersonId === p2.id) ||
                        (r.fromPersonId === p2.id && r.toPersonId === p1.id)
                    );
                });

                if (marriageRel) {
                    const route = this.getMarriageRoute(
                        p1, p2, marriageRel, allRelationships);
                    const childrenCenterX = childObjs.reduce((sum, c) => sum + c.x, 0) / childObjs.length;
                    const desiredSourceX = childObjs.length === 1 ? childObjs[0].x : childrenCenterX;
                    const minMarriageX = Math.min(route.attachmentSegment.start.x,
                        route.attachmentSegment.end.x);
                    const maxMarriageX = Math.max(route.attachmentSegment.start.x,
                        route.attachmentSegment.end.x);
                    sourceX = Math.max(minMarriageX, Math.min(maxMarriageX, desiredSourceX));
                    sourceY = route.attachmentSegment.start.y;
                    hasMarriageSource = true;
                } else {
                    sourceX = (p1.x + p2.x) / 2;
                    sourceY = (p1.y + p2.y) / 2;
                }
            } else {
                const p = parentObjs[0];
                sourceX = p.x;
                sourceY = this._labelBottomY(p);
            }

            // 與 drawFamilies 一樣，避免線條穿過父母文字備註
            if (!hasMarriageSource) {
                parentObjs.forEach(p => {
                    const parentBottom = this._labelBottomY(p);
                    if (sourceY < parentBottom) sourceY = parentBottom;
                });
            }

            const childrenMinY = Math.min(...childObjs.map(c => c.y));
            let barY = (sourceY + (childrenMinY - this.personSize / 2)) / 2;
            if (barY < sourceY + 20) barY = sourceY + 20;
            if (barY > childrenMinY - 20) barY = childrenMinY - 20;
            if (sourceY >= childrenMinY - 10) {
                barY = sourceY + 30;
            }

            const selectedChild = personById.get(selectedChildId) || current.child;
            const childTop = selectedChild.y - this.personSize / 2;

            // 命中路徑：單一子女時整條垂直可點；多子女時用分支路徑
            if (childObjs.length === 1 && Math.abs(sourceX - selectedChild.x) < 0.5) {
                points.push({ x: selectedChild.x, y: sourceY });
                points.push({ x: selectedChild.x, y: childTop });
            } else {
                points.push({ x: sourceX, y: sourceY });
                points.push({ x: sourceX, y: barY });
                points.push({ x: selectedChild.x, y: barY });
                points.push({ x: selectedChild.x, y: childTop });
            }
        } else if (category === 'marriage') {
            return this.getMarriageRoute(
                fromPerson, toPerson, relationship, allRelationships).points;
        } else {
            // 情感關係：直線路徑
            const angle = Math.atan2(toPerson.y - fromPerson.y, toPerson.x - fromPerson.x);
            const radius = this.personSize / 2 + 5;
            let startX = fromPerson.x + Math.cos(angle) * radius;
            let startY = fromPerson.y + Math.sin(angle) * radius;
            let endX = toPerson.x - Math.cos(angle) * radius;
            let endY = toPerson.y - Math.sin(angle) * radius;

            // Apply offset for multi-relationships
            // perp 用 canonical direction（較小 id 當起點），跟 drawRelationship 同步，
            // 避免反向 path 的 perp 反向造成 hit-test 錯位
            if (offset !== 0) {
                const swap = relationship.fromPersonId > relationship.toPersonId;
                const cFrom = swap ? toPerson : fromPerson;
                const cTo = swap ? fromPerson : toPerson;
                const dx = cTo.x - cFrom.x;
                const dy = cTo.y - cFrom.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                // Perpendicular offset
                startX += -uy * offset;
                startY += ux * offset;
                endX += -uy * offset;
                endY += ux * offset;
            }

            points.push({ x: startX, y: startY });
            points.push({ x: endX, y: endY });
        }

        return points;
    }

    /**
     * 檢查點是否在關係線上
     * @param {number} px - 點 X 座標
     * @param {number} py - 點 Y 座標
     * @param {Person} fromPerson
     * @param {Person} toPerson
     * @param {Relationship} relationship
     * @param {number} tolerance - 容差距離（預設 10）
     * @returns {boolean}
     */
    isPointOnRelationship(px, py, fromPerson, toPerson, relationship, tolerance = 10, allRelationships = []) {
        const path = this.getRelationshipPath(fromPerson, toPerson, relationship, allRelationships);
        const category = relationship.getCategory();

        // 針對不同類型關係調整點擊容差
        // - 親子關係 (family): 使用樹狀結構，線較細且彎折多，容差設為 20
        // - 婚姻關係 (marriage): 容差設為 15
        // - 其他 (emotional): 使用預設 tolerance
        let effectiveTolerance = tolerance;
        if (category === 'family') {
            effectiveTolerance = 30; // 進一步放大命中區，避免只剩短段可點
        } else if (category === 'marriage') {
            effectiveTolerance = 15;
        }

        // 檢查每一段線段
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];
            const distance = this.distanceToLineSegment(px, py, p1.x, p1.y, p2.x, p2.y);
            if (distance <= effectiveTolerance) {
                return true;
            }
        }

        return false;
    }

    /**
     * 繪製關係線編輯按鈕
     * @param {Object} relationship - 選中的關係
     * @param {Person} fromPerson - 起點人物
     * @param {Person} toPerson - 終點人物
     * @param {Array} allRelationships - 所有關係（用於計算路徑）
     */
    /**
     * [Fix C] 關係編輯鉛筆的錨點。
     * family（家系樹 L 形）：放「子女下行段（路徑最後一段）」中點——一定落在可見線上、
     * 且明確對應該子女；避免弧長中點落在主幹/橫桿而讓鉛筆浮在線外（兩親家庭主幹 X 用夫妻中點，
     * 與單親 x 不一致時尤其明顯）。其餘關係：維持弧長中點。
     * @returns {{point:{x:number,y:number}, tangent:{x:number,y:number}}}
     */
    _editButtonAnchor(path, category) {
        if (category === 'family' && path.length >= 2) {
            const a = path[path.length - 2];
            const b = path[path.length - 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            return { point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, tangent: { x: dx / len, y: dy / len } };
        }
        const totalLen = this.getPathLength(path);
        const info = this.getPointInfoAtDistance(path, totalLen / 2);
        return { point: info.point, tangent: info.tangent };
    }

    /**
     * [Fix] 編輯鈕群（鉛筆/⇄/走法）的「錨點 + 最終法向」，draw 與 hit-test 共用以保證一致。
     * 預設偏螢幕上方（ny<0）；婚姻線 ㄩ 下折時（橫桿落在節點連接點「下方」）改朝下方清空區。
     * 位置固定可預測（不依節點跳動）；疊到角色時靠「點擊判定優先於節點」(z-index) 保證可點。
     * @returns {{point:{x:number,y:number}, nx:number, ny:number, baseOffset:number}}
     */
    _editButtonGeom(path, category) {
        const info = this._editButtonAnchor(path, category);
        let nx = -info.tangent.y;
        let ny = info.tangent.x;
        if (ny > 0) { nx = -nx; ny = -ny; }
        else if (Math.abs(ny) < 0.001) { if (nx < 0) { nx = -nx; ny = -ny; } }
        // 婚姻 ㄩ 下折：錨點(橫桿)在節點連接點下方 → 鈕改放下方（橫桿下緣的空白區）
        if (category === 'marriage' && path.length >= 2 && info.point.y > path[0].y + 2) {
            nx = -nx; ny = -ny;
        }
        // [HUD] baseOffset 乘 hud → 鈕與線的距離固定 24 螢幕像素；hud 供呼叫端縮放半徑/間距
        const hud = this.hudUnit();
        return { point: info.point, nx, ny, baseOffset: 24 * hud, hud };
    }

    drawRelationshipEditButton(relationship, fromPerson, toPerson, allRelationships = []) {
        const path = this.getRelationshipPath(fromPerson, toPerson, relationship, allRelationships);
        if (path.length < 2) return null;

        // [Fix] 錨點 + 法向：draw/hit-test/swap 共用 _editButtonGeom（婚姻 ㄩ 下折改朝下方清空區）
        const geom = this._editButtonGeom(path, relationship.getCategory());
        const info = { point: geom.point };
        const nx = geom.nx, ny = geom.ny;

        const hud = geom.hud;
        const buttonRadius = 14 * hud; // 螢幕固定 14px
        const offsetDist = geom.baseOffset; // 螢幕固定 24px（已乘 hud）

        const x = info.point.x + nx * offsetDist;
        const y = info.point.y + ny * offsetDist;

        // [Fix B10] 移除死碼：lastEditButtonPosition 全專案只被寫、從未被讀
        // （isPointOnEditButton 是用同一套 getRelationshipPath 自行重算，不依賴此快取）

        // 繪製按鈕背景（白色圓形 + 陰影）
        this.ctx.save();
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;

        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(x, y, buttonRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // 繪製邊框
        this.ctx.strokeStyle = '#4a90d9';
        this.ctx.lineWidth = 2 * hud;
        this.ctx.stroke();

        // 關閉陰影
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;

        // 繪製鉛筆圖示（向量繪製，避免 emoji 在不同平台渲染不一）
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.scale(hud, hud); // 鉛筆字形螢幕固定大小
        this.ctx.rotate(Math.PI / 4);
        this.ctx.strokeStyle = '#4a90d9';
        this.ctx.lineWidth = 1.6;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        // 筆身
        this.ctx.strokeRect(-2.5, -7, 5, 9);
        // 筆尖三角
        this.ctx.beginPath();
        this.ctx.moveTo(-2.5, 2);
        this.ctx.lineTo(0, 6.5);
        this.ctx.lineTo(2.5, 2);
        this.ctx.stroke();
        this.ctx.restore();

        this.ctx.restore();

        // [Fix D] 鉛筆外側再加一顆「對調方向 ⇄」鈕（方向性關係才顯示；婚姻非方向性不顯示）
        if (relationship.getCategory() !== 'marriage') {
            const sx = info.point.x + nx * (geom.baseOffset + 30 * hud);
            const sy = info.point.y + ny * (geom.baseOffset + 30 * hud);
            this.ctx.save();
            this.ctx.shadowColor = 'rgba(0,0,0,0.3)';
            this.ctx.shadowBlur = 4; this.ctx.shadowOffsetX = 1; this.ctx.shadowOffsetY = 1;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(sx, sy, buttonRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = '#4a90d9'; this.ctx.lineWidth = 2 * hud; this.ctx.stroke();
            this.ctx.shadowColor = 'transparent'; this.ctx.shadowBlur = 0;
            // ⇄ 向量字形：上橫線右箭頭、下橫線左箭頭（以鈕心為原點、依 hud 縮放 → 螢幕固定大小）
            this.ctx.translate(sx, sy);
            this.ctx.scale(hud, hud);
            this.ctx.lineWidth = 1.6; this.ctx.lineJoin = 'round'; this.ctx.lineCap = 'round';
            this.ctx.beginPath();
            this.ctx.moveTo(-5, -3); this.ctx.lineTo(5, -3);
            this.ctx.moveTo(2, -6); this.ctx.lineTo(5, -3); this.ctx.lineTo(2, 0);
            this.ctx.moveTo(5, 3); this.ctx.lineTo(-5, 3);
            this.ctx.moveTo(-2, 6); this.ctx.lineTo(-5, 3); this.ctx.lineTo(-2, 0);
            this.ctx.stroke();
            this.ctx.restore();
        }

        return { x, y, radius: buttonRadius };
    }

    /**
     * [Phase 2A.2] 婚姻線「走法」按鈕（自動/ㄇ/一/ㄩ）的圓心座標。
     * 沿橫桿方向排成一列，落在鉛筆外側（offset 56）的清空區；draw 與 hit-test 共用。
     */
    _routeButtonCenters(path) {
        const geom = this._editButtonGeom(path, 'marriage');
        const hud = geom.hud;
        // 垂直偏移到鉛筆外側清空區（baseOffset 已含 hud）；水平固定螢幕左→右（自 ㄇ 一 ㄩ）。
        // [HUD] 間距與半徑皆乘 hud → 螢幕固定像素，不隨縮放放大縮小。
        const baseX = geom.point.x + geom.nx * (geom.baseOffset + 32 * hud);
        const baseY = geom.point.y + geom.ny * (geom.baseOffset + 32 * hud);
        const spacing = 30 * hud;
        const r = 13 * hud;
        const modes = ['auto', 'over', 'straight', 'under'];
        return modes.map((mode, i) => {
            const k = i - 1.5; // -1.5,-0.5,0.5,1.5 → 置中
            return { mode, x: baseX + k * spacing, y: baseY, r };
        });
    }

    /**
     * [Phase 2A.2] 繪製婚姻線走法按鈕（僅 marriage，選取時顯示在鉛筆旁）。
     */
    drawRelationshipRouteButtons(relationship, fromPerson, toPerson, allRelationships = []) {
        if (relationship.getCategory() !== 'marriage') return;
        const path = this.getRelationshipPath(fromPerson, toPerson, relationship, allRelationships);
        if (path.length < 2) return;
        const centers = this._routeButtonCenters(path);
        const labels = { auto: '自', over: 'ㄇ', straight: '一', under: 'ㄩ' };
        const cur = relationship.routeMode || 'auto';
        const hud = this.hudUnit();
        for (const c of centers) {
            const active = c.mode === cur;
            this.ctx.save();
            this.ctx.shadowColor = 'rgba(0,0,0,0.3)';
            this.ctx.shadowBlur = 4; this.ctx.shadowOffsetX = 1; this.ctx.shadowOffsetY = 1;
            this.ctx.fillStyle = active ? '#ed1261' : '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = active ? '#ed1261' : '#4a90d9';
            this.ctx.lineWidth = 2 * hud; this.ctx.stroke();
            this.ctx.shadowColor = 'transparent'; this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = active ? '#ffffff' : '#4a90d9';
            this.ctx.font = `${13 * hud}px "Microsoft JhengHei", sans-serif`;
            this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
            this.ctx.fillText(labels[c.mode], c.x, c.y + 0.5 * hud);
            this.ctx.restore();
        }
    }

    /**
     * [Phase 2A.2] 點是否落在某個走法按鈕上；回傳該 mode，否則 null。
     */
    getRouteButtonModeAt(px, py, relationship, fromPerson, toPerson, allRelationships = []) {
        if (relationship.getCategory() !== 'marriage') return null;
        const path = this.getRelationshipPath(fromPerson, toPerson, relationship, allRelationships);
        if (path.length < 2) return null;
        const centers = this._routeButtonCenters(path);
        for (const c of centers) {
            if (Math.hypot(px - c.x, py - c.y) <= c.r + 4 * this.hudUnit()) return c.mode;
        }
        return null;
    }

    /**
     * [Fix D] 點是否在「對調方向」鈕上（與 drawRelationshipEditButton 同錨點 + 同法線、offset 54）。
     * 婚姻（非方向性）不顯示此鈕，故一律回 false。
     */
    isPointOnSwapButton(px, py, relationship, fromPerson, toPerson, allRelationships = []) {
        if (relationship.getCategory() === 'marriage') return false;
        const path = this.getRelationshipPath(fromPerson, toPerson, relationship, allRelationships);
        if (path.length < 2) return false;
        const geom = this._editButtonGeom(path, relationship.getCategory());
        const off = geom.baseOffset + 30 * geom.hud;
        const bx = geom.point.x + geom.nx * off, by = geom.point.y + geom.ny * off;
        return Math.hypot(px - bx, py - by) <= (14 + 5) * geom.hud;
    }

    /**
     * 檢查點是否在關係線編輯按鈕上
     * @param {number} px - 點 X 座標
     * @param {number} py - 點 Y 座標
     * @param {Object} relationship - 選中的關係
     * @param {Person} fromPerson - 起點人物
     * @param {Person} toPerson - 終點人物
     * @param {Array} allRelationships - 所有關係
     * @returns {boolean}
     */
    isPointOnEditButton(px, py, relationship, fromPerson, toPerson, allRelationships = []) {
        const path = this.getRelationshipPath(fromPerson, toPerson, relationship, allRelationships);
        if (path.length < 2) return false;

        // [Fix] 與 drawRelationshipEditButton 共用 _editButtonGeom（錨點 + 法向一致）
        const geom = this._editButtonGeom(path, relationship.getCategory());

        const buttonRadius = 14 * geom.hud;
        const offsetDist = geom.baseOffset;

        const buttonX = geom.point.x + geom.nx * offsetDist;
        const buttonY = geom.point.y + geom.ny * offsetDist;

        const dx = px - buttonX;
        const dy = py - buttonY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance <= buttonRadius + 5 * geom.hud; // 增加一些容差（螢幕 5px）
    }

    /**
     * [HUD] 畫布上的互動鈕（快速新增 / 鉛筆 / ⇄ / 走法）以「螢幕固定像素」呈現。
     * 回傳 1 螢幕像素對應的世界單位（= 1/scale）；scale=1 時為 1，既有幾何與 golden 完全不變。
     * 縮到 40% 時鈕不再只剩 7px、放大到 200% 時也不會變成巨大圓盤。
     * @returns {number}
     */
    hudUnit() {
        const s = Number.isFinite(this.scale) && this.scale > 0 ? this.scale : 1;
        return 1 / s;
    }

    /**
     * 快速新增按鈕配置
     */
    static QUICK_BUTTONS = {
        parent: { label: '父母', offsetX: 0, offsetY: -75, color: '#4a90d9' },
        sibling: { label: '手足', offsetX: 55, offsetY: -25, color: '#5dae8b' },
        partner: { label: '伴侶', offsetX: 55, offsetY: 25, color: '#e8537a' },
        son: { label: '兒子', offsetX: -40, offsetY: 75, color: '#e8a849' },
        daughter: { label: '女兒', offsetX: 0, offsetY: 75, color: '#e8a849' },
        pregnancy: { label: '懷孕', offsetX: 40, offsetY: 75, color: '#e8a849' }
    };

    /**
     * 繪製快速新增按鈕
     * @param {Person} person - hover 的角色
     */
    drawQuickAddButtons(person) {
        if (!person) return;
        const hud = this.hudUnit();

        for (const btn of this.getQuickButtonLayout(person)) {
            const { x: bx, y: by, radius: btnRadius } = btn;

            // 按鈕背景（白底 + 色環 + 柔和陰影 — emoji 在各平台渲染不一，改用向量 glyph）
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.arc(bx, by, btnRadius, 0, Math.PI * 2);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.shadowColor = 'rgba(15, 23, 42, 0.22)';
            this.ctx.shadowBlur = 6;
            this.ctx.shadowOffsetY = 2;
            this.ctx.fill();
            this.ctx.shadowColor = 'transparent';
            this.ctx.shadowBlur = 0;
            this.ctx.shadowOffsetY = 0;
            this.ctx.strokeStyle = btn.color;
            this.ctx.lineWidth = 2 * hud;
            this.ctx.stroke();
            this.ctx.restore();

            // 按鈕圖示（家系圖符號語意的小 glyph；以鈕心為原點依 hud 縮放 → 螢幕固定大小）
            this.ctx.save();
            this.ctx.translate(bx, by);
            this.ctx.scale(hud, hud);
            this.drawQuickButtonGlyph(btn.type, 0, 0, btn.color);
            this.ctx.restore();

            // 按鈕標籤（小字說明）
            this.ctx.save();
            this.ctx.font = `${10 * hud}px "Noto Sans TC", sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';
            this.ctx.fillStyle = '#6b7280';
            this.ctx.fillText(btn.label, bx, by + btnRadius + 3 * hud);
            this.ctx.restore();
        }
    }

    /**
     * 快速新增按鈕的向量 glyph — 沿用家系圖符號語意（方=男、圓=女、三角=懷孕）
     */
    drawQuickButtonGlyph(type, cx, cy, color) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        switch (type) {
            case 'parent': // 小方 + 小圓 並排（父母）
                ctx.strokeRect(cx - 8.5, cy - 3.5, 7, 7);
                ctx.beginPath();
                ctx.arc(cx + 5, cy, 3.5, 0, Math.PI * 2);
                ctx.stroke();
                break;
            case 'sibling': // 兩個小方並排（手足）
                ctx.strokeRect(cx - 8.5, cy - 3.5, 7, 7);
                ctx.strokeRect(cx + 1.5, cy - 3.5, 7, 7);
                break;
            case 'partner': // 實心愛心（伴侶）
                ctx.beginPath();
                ctx.moveTo(cx, cy + 5.5);
                ctx.bezierCurveTo(cx - 7.5, cy - 1, cx - 4.5, cy - 6.5, cx, cy - 2);
                ctx.bezierCurveTo(cx + 4.5, cy - 6.5, cx + 7.5, cy - 1, cx, cy + 5.5);
                ctx.fill();
                break;
            case 'son': // 小方（兒子）
                ctx.strokeRect(cx - 4, cy - 4, 8, 8);
                break;
            case 'daughter': // 小圓（女兒）
                ctx.beginPath();
                ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
                ctx.stroke();
                break;
            case 'pregnancy': // 小三角（懷孕）
                ctx.beginPath();
                ctx.moveTo(cx, cy - 5);
                ctx.lineTo(cx + 5, cy + 4);
                ctx.lineTo(cx - 5, cy + 4);
                ctx.closePath();
                ctx.stroke();
                break;
        }
        ctx.restore();
    }

    /**
     * 取得點擊位置對應的快速按鈕類型
     * @param {number} px - 滑鼠 X
     * @param {number} py - 滑鼠 Y
     * @param {Person} person - hover 的角色
     * @returns {string|null} - 按鈕類型或 null
     */
    getQuickButtonAt(px, py, person) {
        if (!person) return null;
        for (const btn of this.getQuickButtonLayout(person)) {
            if (Math.hypot(px - btn.x, py - btn.y) <= btn.radius) return btn.type;
        }
        return null;
    }

    /**
     * [HUD] 快速新增鈕的版面（draw 與 hit-test 共用同一份，保證「畫在哪就點得到哪」）。
     * 半徑固定 18 螢幕像素。位置：縮小（hud>1）時整圈依 hud 放大，維持螢幕間距；
     * 放大（hud<1）時以符號邊緣為錨、邊緣外的距離固定螢幕像素，鈕不會離符號越來越遠。
     * scale=1 時與原版座標完全相同。
     * @param {Person} person
     * @returns {Array<{type:string,x:number,y:number,radius:number,label:string,color:string}>}
     */
    getQuickButtonLayout(person) {
        if (!person) return [];
        const hud = this.hudUnit();
        const half = (typeof person.getSize === 'function' ? person.getSize() : 50) / 2;
        const place = off => {
            if (hud >= 1) return off * hud;
            const anchor = Math.max(-half, Math.min(half, off));
            return anchor + (off - anchor) * hud;
        };
        const layout = [];
        for (const [type, btn] of Object.entries(GenogramCanvas.QUICK_BUTTONS)) {
            // 跳過懷孕按鈕：男性、懷孕、死亡者、男跨女 (MTF)
            if (type === 'pregnancy'
                && (person.gender === 'male' || person.gender === 'pregnancy' || person.isDeceased || person.transgender === 'mtf')) {
                continue;
            }
            // 懷孕符號不顯示：伴侶、兒子、女兒
            if (person.gender === 'pregnancy' && (type === 'partner' || type === 'son' || type === 'daughter')) {
                continue;
            }
            layout.push({
                type,
                x: person.x + place(btn.offsetX),
                y: person.y + place(btn.offsetY),
                radius: 18 * hud,
                label: btn.label,
                color: btn.color
            });
        }
        return layout;
    }

    /**
     * 檢查點是否在快速按鈕區域內（包含角色和所有按鈕的擴展區域）
     * @param {number} px - 滑鼠 X
     * @param {number} py - 滑鼠 Y
     * @param {Person} person - 角色
     * @returns {boolean}
     */
    isPointInQuickAddZone(px, py, person) {
        if (!person) return false;
        const padding = 30 * this.hudUnit(); // 額外的容差
        let minX = person.x, maxX = person.x, minY = person.y, maxY = person.y;
        for (const btn of this.getQuickButtonLayout(person)) {
            minX = Math.min(minX, btn.x - btn.radius); maxX = Math.max(maxX, btn.x + btn.radius);
            minY = Math.min(minY, btn.y - btn.radius); maxY = Math.max(maxY, btn.y + btn.radius);
        }
        return px >= minX - padding && px <= maxX + padding && py >= minY - padding && py <= maxY + padding;
    }

    /**
     * 繪製生活圈（半透明填充多邊形）
     * @param {Array} lifeCircles - 生活圈列表
     * @param {string} selectedId - 選中的生活圈 ID
     */
    drawLifeCircles(lifeCircles, selectedId = null) {
        if (!lifeCircles || lifeCircles.length === 0) return;

        this.ctx.save();
        this.applyTransform();

        lifeCircles.forEach(lc => {
            this._drawSingleLifeCircle(lc, selectedId === lc.id);
        });

        this.ctx.restore();
    }

    /**
     * [共用] 繪製單一生活圈（螢幕與匯出共用，確保兩邊長相一致）
     * @param {Object} lc - 生活圈
     * @param {boolean} isSelected - 是否選中（匯出時固定 false）
     */
    _drawSingleLifeCircle(lc, isSelected = false) {
        if (!lc.points || lc.points.length < 3) return;

        const path = this.buildSmoothClosedPath(lc.points);
        const fillColor = lc.color || 'rgba(74, 144, 226, 0.15)';

        // 填充
        this.ctx.fillStyle = fillColor;
        this.ctx.fill(path);

        // 邊框（[Fix] 顏色跟隨填色 — 原本固定藍色，綠圈/橘圈邊框對不上）
        this.ctx.strokeStyle = isSelected ? '#4a90d9' : this.lifeCircleStrokeColor(fillColor);
        this.ctx.lineWidth = isSelected ? 3 : 2;
        this.ctx.setLineDash(isSelected ? DASH_PATTERNS.solid : DASH_PATTERNS.liveCircle);
        this.ctx.stroke(path);
        this.ctx.setLineDash(DASH_PATTERNS.solid);

        // [New] 標籤（白色 halo 確保可讀）。[LC-3] 位置可選：top（預設，最上緣頂點上方）/ center（質心）/ bottom（最下緣頂點下方）
        if (lc.label) {
            const anchor = GenogramCanvas.lifeCircleLabelAnchor(lc);
            this.ctx.save();
            this.ctx.setLineDash(DASH_PATTERNS.solid);
            this.ctx.font = `600 13px ${this.fontFamily}`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = anchor.baseline;
            this.ctx.lineWidth = 4;
            this.ctx.lineJoin = 'round';
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.strokeText(lc.label, anchor.x, anchor.y);
            this.ctx.fillStyle = this.lifeCircleStrokeColor(fillColor, 1);
            this.ctx.fillText(lc.label, anchor.x, anchor.y);
            this.ctx.restore();
        }

        // 繪製頂點（選中時）
        if (isSelected) {
            lc.points.forEach(p => {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                this.ctx.fillStyle = '#4a90d9';
                this.ctx.fill();
            });
        }
    }

    /**
     * 由生活圈半透明填色推導邊框/標籤色（同 RGB、較高 alpha）
     */
    /**
     * [LC-3] 生活圈名稱錨點（螢幕與匯出共用）
     * @returns {{x:number,y:number,baseline:CanvasTextBaseline}}
     */
    static lifeCircleLabelAnchor(lc) {
        const pts = lc.points || [];
        const mode = lc.labelPosition === 'center' || lc.labelPosition === 'bottom' ? lc.labelPosition : 'top';
        if (mode === 'center') {
            const n = pts.length || 1;
            return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n, baseline: 'middle' };
        }
        if (mode === 'bottom') {
            let bottom = pts[0];
            pts.forEach(p => { if (p.y > bottom.y) bottom = p; });
            return { x: bottom.x, y: bottom.y + 6, baseline: 'top' };
        }
        let top = pts[0];
        pts.forEach(p => { if (p.y < top.y) top = p; });
        return { x: top.x, y: top.y - 6, baseline: 'bottom' };
    }

    /**
     * [LC-2] 拖拉橢圓預覽（生活圈工具按住拖曳時）
     */
    drawEllipsePreview(start, current) {
        if (!start || !current) return;
        this.ctx.save();
        this.applyTransform();
        const cx = (start.x + current.x) / 2, cy = (start.y + current.y) / 2;
        const rx = Math.max(20, Math.abs(current.x - start.x) / 2), ry = Math.max(20, Math.abs(current.y - start.y) / 2);
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(74, 144, 226, 0.08)';
        this.ctx.fill();
        this.ctx.strokeStyle = '#4a90d9';
        this.ctx.lineWidth = 2 * this.hudUnit();
        this.ctx.setLineDash(DASH_PATTERNS.selection);
        this.ctx.stroke();
        this.ctx.setLineDash(DASH_PATTERNS.solid);
        this.ctx.restore();
    }

    lifeCircleStrokeColor(fillColor, alpha = 0.65) {
        const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(fillColor || '');
        if (m) {
            return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
        }
        return 'rgba(74, 144, 226, 0.5)';
    }

    /**
     * [共用] 建立封閉平滑曲線的 Path2D（Catmull-Rom / Cardinal Spline）
     * 螢幕繪製、匯出、點擊判定三處共用同一條路徑 — 所見即所點、所存即所見。
     * [Fix] 控制點長度夾制在鄰邊長的 45%，避免尖角多邊形（鋸齒/星形）嚴重過衝，
     * 畫出來的形狀更貼近使用者實際點的頂點。
     */
    buildSmoothClosedPath(points, tension = 0.5) {
        const path = new Path2D();
        if (!points || points.length === 0) return path;

        path.moveTo(points[0].x, points[0].y);
        const size = points.length;
        const f = tension / 3;

        for (let i = 0; i < size; i++) {
            const p0 = points[(i - 1 + size) % size];
            const p1 = points[i];
            const p2 = points[(i + 1) % size];
            const p3 = points[(i + 2) % size];

            const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const maxHandle = segLen * 0.45;

            let v1x = (p2.x - p0.x) * f;
            let v1y = (p2.y - p0.y) * f;
            const l1 = Math.hypot(v1x, v1y);
            if (l1 > maxHandle && l1 > 0) {
                v1x *= maxHandle / l1;
                v1y *= maxHandle / l1;
            }

            let v2x = (p3.x - p1.x) * f;
            let v2y = (p3.y - p1.y) * f;
            const l2 = Math.hypot(v2x, v2y);
            if (l2 > maxHandle && l2 > 0) {
                v2x *= maxHandle / l2;
                v2y *= maxHandle / l2;
            }

            path.bezierCurveTo(p1.x + v1x, p1.y + v1y, p2.x - v2x, p2.y - v2y, p2.x, p2.y);
        }
        path.closePath();
        return path;
    }

    /**
     * [相容保留] 直接在 ctx 上畫封閉平滑曲線（內部已改用 buildSmoothClosedPath 同邏輯）
     */
    drawSmoothClosedPath(ctx, points, tension = 0.5) {
        const path = this.buildSmoothClosedPath(points, tension);
        // 呼叫端負責 fill/stroke；這裡把 Path2D 內容附加到目前路徑無法直接做，
        // 因此提供 Path2D 給呼叫端使用為主，此函式僅向後相容地直接描邊
        ctx.stroke(path);
    }

    /**
     * [Snap/HitTest] 點是否落在生活圈「平滑邊界帶」或頂點上
     * 與畫面實際形狀一致（同一條 Path2D），消除「看得到點不到」
     */
    isPointOnLifeCircleEdge(lc, x, y, tolerance = 12) {
        if (!lc || !lc.points || lc.points.length < 3) return false;

        // 頂點優先（半徑略放寬，方便抓取）
        for (const p of lc.points) {
            if (Math.hypot(p.x - x, p.y - y) <= tolerance + 4) return true;
        }

        const path = this.buildSmoothClosedPath(lc.points);
        const ctx = this.ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // 以世界座標檢測（路徑即世界座標）
        ctx.lineWidth = tolerance * 2;
        const hit = ctx.isPointInStroke(path, x, y);
        ctx.restore();
        return hit;
    }

    /**
     * 繪製生活圈預覽（正在繪製中）
     * @param {Array} points - 目前的頂點列表
     * @param {Object} mousePos - 滑鼠目前位置（可選）
     */
    drawLifeCirclePreview(points, mousePos = null) {
        if (!points || points.length === 0) return;

        this.ctx.save();
        this.applyTransform();

        // 繪製已確定的線段
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }

        // 如果有滑鼠位置，繪製到滑鼠的預覽線（橡皮筋）
        if (mousePos) {
            this.ctx.lineTo(mousePos.x, mousePos.y);
        }

        this.ctx.strokeStyle = '#4a90d9';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash(DASH_PATTERNS.selection);
        this.ctx.stroke();

        // [New] 閉合提示：已有 2 點以上時，畫一條更淡的虛線回到起點，
        // 讓使用者預見封閉後的形狀
        if (points.length >= 2) {
            const tail = mousePos || points[points.length - 1];
            this.ctx.save();
            this.ctx.globalAlpha = 0.35;
            this.ctx.beginPath();
            this.ctx.moveTo(tail.x, tail.y);
            this.ctx.lineTo(points[0].x, points[0].y);
            this.ctx.stroke();
            this.ctx.restore();
        }

        // 繪製頂點
        points.forEach((p, i) => {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
            this.ctx.fillStyle = i === 0 ? '#ff6b6b' : '#4a90d9'; // 第一個點用紅色標記
            this.ctx.fill();
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash(DASH_PATTERNS.solid);
            this.ctx.stroke();
        });

        // 提示文字已移除

        this.ctx.restore();
    }
}


