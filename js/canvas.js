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
        this.prepareDerivedGeometry(this.lastPersons, this.lastRelationships);
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
        if (selectedId && !this.isDragging && !this.placementPreview) {
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
    }

    getPersonLabelGeometry(person, options = {}, placement = undefined) {
        const view = this.normalizeViewOptions(options);
        const resolved = placement === undefined
            ? (this.personLabelPlacements?.get(String(person.id)) || { side: 'below' })
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

        this.ctx.save();
        const measured = specs.map(spec => {
            this.ctx.font = spec.font;
            const width = this.ctx.measureText(spec.text).width;
            return { ...spec, width: Number.isFinite(width) ? width : 0 };
        });
        this.ctx.restore();

        const blockWidth = measured.reduce((max, row) => Math.max(max, row.width), 0);
        const half = this.personSize / 2;
        const side = ['below', 'left', 'right'].includes(resolved?.side)
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
        let cursorY = person.y + half + 8 + offsetY;
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
        const nameY = person.y + this.personSize / 2 + 8;
        return {
            name: nameRow?.text || '',
            noteLines: noteRows.map(row => row.text),
            nameY,
            noteStartY: nameY + (nameRow ? this.fontSize + 4 : 0)
        };
    }

    drawPersonText(person, options = {}) {
        const geometry = this.getPersonLabelGeometry(person, options);
        const S = GenogramCanvas.DRAW_PERSON_STYLES;
        this.ctx.shadowBlur = 0;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        geometry.rows.forEach(row => {
            const halo = row.kind === 'name' ? S.nameHalo : S.notesHalo;
            this.ctx.font = row.font;
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
        const { x, y, gender, age, isDeceased, isIdentifiedPatient, medical, transgender } = person;
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

        // 繪製主要形狀背景
        this.ctx.lineWidth = 2;
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
            const innerSize = size * 0.7071;
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
            const offset = halfSize * 0.6;
            this.ctx.beginPath();
            this.ctx.moveTo(x - offset, y - offset);
            this.ctx.lineTo(x + offset, y + offset);
            this.ctx.moveTo(x + offset, y - offset);
            this.ctx.lineTo(x - offset, y + offset);
            this.ctx.stroke();
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
     * 匯出專用的人物繪製
     * @param {Object} person - 人物物件
     * @param {Object} viewOptions - 顯示策略
     */
    drawPersonForExport(person, viewOptions = {}) {
        this.drawPerson(person, false, false, false, viewOptions);
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

        compareRels.sort((a, b) => a.id.localeCompare(b.id));

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

        // [Fix] 檢查是否為天橋模式
        const config = this.getMarriageConfiguration(fromPerson, toPerson, relationship, relationships);

        let finalX, finalY;

        if (config.isBridge) {
            // 天橋模式(ㄇ)：文字顯示在天橋水平段中央（橋的上方）
            finalX = (fromPerson.x + toPerson.x) / 2;
            finalY = config.bridgeY;
            angle = 0; // 強制水平
        } else if (config.isArch) {
            // [Fix] ㄩ 下折：文字跟著線到下折橫桿（放橫桿下方，避免被列上符號/姓名擋住）
            finalX = (fromPerson.x + toPerson.x) / 2;
            finalY = config.archBarY;
            angle = 0; // 強制水平
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
        if (config.isArch) {
            textOffsetY = totalHeight + 8;
        }

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
     * [New] 計算婚姻關係的天橋配置
     * @returns {Object} { level, bridgeY, isBridge }
     */
    getMarriageConfiguration(p1, p2, rel, allRels) {
        // 1. 確保只處理婚姻類
        const cat = typeof rel.getCategory === 'function' ? rel.getCategory() : Relationship.getCategory(rel.type);
        if (cat !== 'marriage') return { level: 0, bridgeY: (p1.y + p2.y) / 2, isBridge: false };

        // 2. 天橋層級 = 「同側、且比本配偶更靠近 hub 的其他配偶數」。
        //    [Phase 2A.2] 同側才需跨過 → 架天橋；對側 / 單獨配偶 = 0 = 直線側接。
        //    取代舊「純按婚期排序架橋」——舊法讓「對側配偶（前妻左、現任右）」也被架天橋，
        //    天橋腳與親子下行共用本人正上方走廊而疊線（13/14/15/16 之根因）。
        //    需其他配偶座標：用 this.personMap（render 注入），fallback this.lastPersons。
        //    確定性：只用幾何 x 比較 + 計數，與陣列順序 / 日期皆無關。
        const _pm = (this.personMap instanceof Map && this.personMap.size) ? this.personMap : null;
        const _lookup = (id) => _pm ? _pm.get(id) : (this.lastPersons || []).find(p => p.id === id);
        const getRank = (hub, spouse) => {
            const myRels = allRels.filter(r =>
                (r.fromPersonId === hub.id || r.toPersonId === hub.id) &&
                (typeof r.getCategory === 'function' ? r.getCategory() : Relationship.getCategory(r.type)) === 'marriage'
            );
            if (myRels.length <= 1) return 0;
            const spouseLeft = spouse.x < hub.x; // 本配偶在 hub 哪一側
            let count = 0;
            for (const r of myRels) {
                if (r.id === rel.id) continue;
                const otherId = r.fromPersonId === hub.id ? r.toPersonId : r.fromPersonId;
                const other = _lookup(otherId);
                if (!other) continue;
                const otherLeft = other.x < hub.x;
                if (otherLeft !== spouseLeft) continue; // 對側配偶 → 不需跨過
                // 同側：other 是否比本配偶更靠近 hub（夾在 hub 與本配偶之間）→ 需跨過它
                if (spouseLeft ? (other.x > spouse.x) : (other.x < spouse.x)) count++;
            }
            return count;
        };

        const level1 = getRank(p1, p2);
        const level2 = getRank(p2, p1);
        const level = Math.max(level1, level2);

        // 3. 計算各種 bar Y 基準
        // 基礎高度: 頭頂上方 20px，每層天橋 +30px
        const p1Top = p1.y - this.personSize / 2;
        const p2Top = p2.y - this.personSize / 2;
        const baseY = Math.min(p1Top, p2Top) - 20;
        const step = 30; // 每層高度 30px
        const bridgeY = baseY - (level * step);

        // 走廊障礙（自動越障 + 手動 under 都會用到）。橫桿須越過配偶與被夾者的
        // 「姓名(+備註)文字」下緣，否則 ㄩ 下折只 +符號底緣太淺、會壓在姓名文字上。
        let botMost = Math.max(this._labelBottomY(p1), this._labelBottomY(p2));
        let hasObstacle = false;
        if (Math.abs(p1.y - p2.y) <= 1) {
            const obstacles = this._marriageCorridorObstacles(p1, p2);
            if (obstacles.length > 0) {
                hasObstacle = true;
                for (const o of obstacles) botMost = Math.max(botMost, this._labelBottomY(o));
            }
        }
        const underBarY = botMost + 14;

        // [Phase 2A.2] 手動繞線覆寫優先（auto / over / straight / under）。
        const routeMode = rel.routeMode || 'auto';
        if (routeMode === 'straight') {
            // 一：強制直線側接（即使會穿過中間人物 — 使用者明示選擇）
            return { level: 0, bridgeY, isBridge: false, isArch: false, archBarY: null, routeMode };
        }
        if (routeMode === 'over') {
            // ㄇ：強制上折（頂端連接天橋）。無多婚層級時抬一層；有則沿用層級高度。
            const overY = baseY - step * Math.max(level, 1);
            return { level: Math.max(level, 1), bridgeY: overY, isBridge: true, isArch: false, archBarY: null, routeMode };
        }
        if (routeMode === 'under') {
            // ㄩ：強制下折（底部連接、越過被夾者）。
            return { level, bridgeY, isBridge: false, isArch: true, archBarY: underBarY, routeMode };
        }

        // routeMode === 'auto'：系統自動判斷
        if (level > 0) {
            // 同側多婚 → 上折天橋
            return { level, bridgeY, isBridge: true, isArch: false, archBarY: null, routeMode };
        }
        if (hasObstacle) {
            // 同列夾人 → 下折越障（預設往下：避開被夾者上方親子線、子女自然垂下）
            return { level, bridgeY, isBridge: false, isArch: true, archBarY: underBarY, routeMode };
        }
        // 同列淨空 / 跨列 → 直線 / 正交（由 getMarriageGeometry 決定）
        return { level, bridgeY, isBridge: false, isArch: false, archBarY: null, routeMode };
    }

    /**
     * [Phase 2A.0] 婚姻線「唯一幾何來源」(single source of truth)。
     * 主線繪製、選中高亮、點擊命中(hit-test)、匯出全部呼叫此函式，確保
     * export==screen 且「畫得到 = 點得到 = 高亮一致」。回傳純幾何（不碰 ctx）：
     *   { points: [{x,y}...], decoration: {x,y} }
     * 形狀：天橋 → 頂端上折ㄇ(up→across→down)；同列 → 直線(一)；
     *       跨列 → 正交三折(水平出→中點垂直腿→水平入)。
     * 注意：本函式刻意「純函數於幾何輸入」(只用座標 + config)，不查渲染狀態、
     *       不依賴陣列順序，以保 golden 逐 pixel 確定性。
     */
    getMarriageGeometry(fromPerson, toPerson, config) {
        // 天橋（多段婚姻層級）：頂端上折ㄇ
        if (config && config.isBridge) {
            return this._bridgeGeometry(fromPerson, toPerson, config.bridgeY);
        }
        // Level 0：左右側邊連接點（與 drawRelationship 既有邏輯一致）
        const fromPt = fromPerson.x < toPerson.x ? fromPerson.getConnectionPoint('right') : fromPerson.getConnectionPoint('left');
        const toPt = fromPerson.x < toPerson.x ? toPerson.getConnectionPoint('left') : toPerson.getConnectionPoint('right');
        const centerX = (fromPt.x + toPt.x) / 2;
        const centerY = (fromPt.y + toPt.y) / 2;
        if (config && config.isArch) {
            // [Phase 2A.1] 走廊有人夾住 → ㄩ 從下方繞過，避免婚姻線「穿過」中間人物符號，
            // 同時避開被夾者「從上方來的親子線」。連接點用「正下方中心」(cardinal bottom)：
            // 線自底部中心垂直下行 → 橫越 → 上行，不貼節點角邊（使用者要求 cardinal 接線）。
            // archBarY 由 getMarriageConfiguration 算出（在下方；與 drawFamilies 子女掛接點共用同一值）。
            const barY = config.archBarY;
            const fromB = fromPerson.getConnectionPoint('bottom');
            const toB = toPerson.getConnectionPoint('bottom');
            return {
                points: [
                    { x: fromB.x, y: fromB.y },
                    { x: fromB.x, y: barY },
                    { x: toB.x, y: barY },
                    { x: toB.x, y: toB.y }
                ],
                decoration: { x: (fromB.x + toB.x) / 2, y: barY }
            };
        }
        if (Math.abs(fromPt.y - toPt.y) <= 1) {
            // 同列淨空：直線（一）→ 保護既有 golden，pixel 完全不變
            return {
                points: [{ x: fromPt.x, y: fromPt.y }, { x: toPt.x, y: toPt.y }],
                decoration: { x: centerX, y: centerY }
            };
        }
        // 跨列：正交三折（水平出 → 垂直段在 centerX → 水平入）。
        // 裝飾落在 (centerX, centerY)，恰為垂直段中點。
        return {
            points: [
                { x: fromPt.x, y: fromPt.y },
                { x: centerX, y: fromPt.y },
                { x: centerX, y: toPt.y },
                { x: toPt.x, y: toPt.y }
            ],
            decoration: { x: centerX, y: centerY }
        };
    }

    /**
     * [Phase 2A.0] 頂端上折ㄇ 幾何（多段婚姻天橋 + 同列越障共用）。
     * 垂直腿落在兩節點「頂端中心 X」，橫段在 bridgeY，裝飾落橫段中點。
     */
    _bridgeGeometry(fromPerson, toPerson, bridgeY) {
        const fromPt = fromPerson.getConnectionPoint('top');
        const toPt = toPerson.getConnectionPoint('top');
        return {
            points: [
                { x: fromPt.x, y: fromPt.y },
                { x: fromPt.x, y: bridgeY },
                { x: toPt.x, y: bridgeY },
                { x: toPt.x, y: toPt.y }
            ],
            decoration: { x: (fromPt.x + toPt.x) / 2, y: bridgeY }
        };
    }

    /**
     * [Phase 2A.1] 找出「同列婚姻水平走廊內、夾在配偶之間」的他人節點。
     * 用於決定婚姻線是否需要 ㄇ 越過（避免穿過中間手足/他人符號）。
     * 確定性：只用座標篩選，結果以 (x, id) 字典序排序，不依賴 personMap 迭代序。
     * 障礙來源用 this.personMap（render 注入）；無則 fallback this.lastPersons。
     */
    _marriageCorridorObstacles(fromPerson, toPerson) {
        const persons = (this.personMap instanceof Map && this.personMap.size)
            ? Array.from(this.personMap.values())
            : (this.lastPersons || []);
        if (!persons.length) return [];
        const rowY = (fromPerson.y + toPerson.y) / 2;
        const loX = Math.min(fromPerson.x, toPerson.x);
        const hiX = Math.max(fromPerson.x, toPerson.x);
        const pad = 4; // 忽略貼著配偶邊緣的極近節點
        const obstacles = persons.filter(p =>
            p.id !== fromPerson.id && p.id !== toPerson.id &&
            p.x > loX + pad && p.x < hiX - pad &&   // 嚴格夾在 X 之間
            Math.abs(p.y - rowY) < 60               // 大致同列才算擋路（子女/父母在別列不算）
        );
        obstacles.sort((a, b) => (a.x - b.x) || a.id.localeCompare(b.id));
        return obstacles;
    }

    /**
     * [Phase 2A.0] 依 getMarriageGeometry 的點集繪製婚姻主線 + 裝飾。
     * 取代舊 drawBridgeLine / drawMarriageLine 的重複繪圖邏輯（兩者已停用）。
     * 呼叫前須先設好 ctx.strokeStyle / lineWidth。
     */
    drawMarriagePath(points, decoration, style) {
        // 虛線樣式（訂婚=長虛線、同居=短點線；其餘依 pattern）
        this.ctx.setLineDash(this.getLineDash(style.pattern));
        if (style.pattern === 'dashed') this.ctx.setLineDash(DASH_PATTERNS.engaged);
        else if (style.pattern === 'dotted') this.ctx.setLineDash(DASH_PATTERNS.cohabit);

        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) this.ctx.lineTo(points[i].x, points[i].y);
        this.ctx.stroke();

        this.ctx.setLineDash(DASH_PATTERNS.solid); // 重置以繪製裝飾

        const dx = decoration.x, dy = decoration.y;
        if (style.decoration === 'house') this.drawHouse(dx, dy);
        else if (style.decoration === 'single-slash') this.drawSlash(dx, dy);
        else if (style.decoration === 'double-slash') this.drawDoubleSlash(dx, dy);
        else if (style.decoration === 'divorce-slash') this.drawDivorceSlash(dx, dy);
        else if (style.decoration === 'x') this.drawX(dx, dy);
        else if (style.decoration === 'x-double') this.drawX(dx, dy);
    }

    /**
     * [New] 繪製天橋式婚姻線
     * @deprecated Phase 2A.0：幾何已收斂至 getMarriageGeometry + drawMarriagePath，此函式不再被呼叫。
     */
    drawBridgeLine(from, to, style, bridgeY) {
        // from/to 是 Person 物件
        const fromPt = from.getConnectionPoint('top');
        const toPt = to.getConnectionPoint('top');

        this.ctx.save();
        this.ctx.setLineDash(this.getLineDash(style.pattern));
        this.ctx.lineWidth = style.width;
        this.ctx.strokeStyle = style.color;

        this.ctx.beginPath();
        this.ctx.moveTo(fromPt.x, fromPt.y);
        this.ctx.lineTo(fromPt.x, bridgeY); // Up
        this.ctx.lineTo(toPt.x, bridgeY);   // Across
        this.ctx.lineTo(toPt.x, toPt.y);     // Down
        this.ctx.stroke();

        this.ctx.setLineDash(DASH_PATTERNS.solid); // Reset for decoration

        // 繪製裝飾 (在天橋水平段的中點)
        const midX = (fromPt.x + toPt.x) / 2;
        const midY = bridgeY;

        // 呼叫原本的裝飾繪製 (部分裝飾可能需要微調，如 House)
        // 注意：drawMarriageLine 裡的裝飾部分邏輯原本是寫死的
        // 這裡我們直接複製裝飾邏輯
        if (style.decoration === 'house') {
            this.drawHouse(midX, midY);
        } else if (style.decoration === 'single-slash') {
            this.drawSlash(midX, midY);
        } else if (style.decoration === 'double-slash') {
            this.drawDoubleSlash(midX, midY);
        } else if (style.decoration === 'divorce-slash') {
            this.drawDivorceSlash(midX, midY);
        } else if (style.decoration === 'x') {
            this.drawX(midX, midY);
        } else if (style.decoration === 'x-double') {
            this.drawX(midX, midY);
        }

        this.ctx.restore();
    }

    /**
     * 繪製關係線
     */
    drawRelationship(fromPerson, toPerson, relationship, isSelected = false, persons = [], allRelationships = []) {
        const style = relationship.getLineStyle();
        const category = relationship.getCategory();

        // 1. 取得天橋配置 (僅針對 Marriage)
        const config = this.getMarriageConfiguration(fromPerson, toPerson, relationship, allRelationships);

        // [New] 計算多重關係位移 (Parallel Lines) - 僅用於非天橋模式的情感關係
        let offset = 0;
        if (!config.isBridge && allRelationships.length > 0) {
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
                // [Phase 2A.0] 婚姻高亮：與主線共用 getMarriageGeometry（含天橋/同列/跨列正交），
                // 修正舊 Level-0 高亮永遠畫直線、與跨列正交主線不符的 bug。
                this.ctx.lineWidth = style.width + 8;
                this.ctx.globalAlpha = 0.6;
                const geom = this.getMarriageGeometry(fromPerson, toPerson, config);
                this.ctx.beginPath();
                this.ctx.moveTo(geom.points[0].x, geom.points[0].y);
                for (let i = 1; i < geom.points.length; i++) this.ctx.lineTo(geom.points[i].x, geom.points[i].y);
                this.ctx.stroke();

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
            // [Phase 2A.0] 婚姻主線：天橋 / 同列直線 / 跨列正交三折，全部走唯一幾何來源
            const geom = this.getMarriageGeometry(fromPerson, toPerson, config);
            this.drawMarriagePath(geom.points, geom.decoration, style);

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

    /**
     * 繪製標準直線（用於親子關係等）
     * 親子關係一律繪製為直線
     */
    drawStandardLine(from, to, style) {
        this.ctx.setLineDash(this.getLineDash(style.pattern));
        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);  // 一律直線連接
        this.ctx.stroke();
    }

    /**
     * 取得虛線樣式
     */
    getLineDash(pattern) {
        switch (pattern) {
            case 'dashed': return DASH_PATTERNS.engaged;  // 訂婚：長虛線
            case 'dotted': return DASH_PATTERNS.cohabit;  // 同居：短點線
            default:       return DASH_PATTERNS.solid;
        }
    }

    /**
     * 繪製婚姻關係線
     * @deprecated Phase 2A.0：幾何已收斂至 getMarriageGeometry + drawMarriagePath，此函式不再被呼叫。
     */
    drawMarriageLine(from, to, style) {
        // 設定虛線樣式
        this.ctx.setLineDash(this.getLineDash(style.pattern));

        // 訂婚(dashed): 較長虛線段，同居(dotted): 短點配長間隔，讓兩者視覺差異明顯
        if (style.pattern === 'dashed') {
            this.ctx.setLineDash(DASH_PATTERNS.engaged); // 訂婚：長虛線 ▬ ▬ ▬
        } else if (style.pattern === 'dotted') {
            this.ctx.setLineDash(DASH_PATTERNS.cohabit); // 同居：短點線 · · · · (點短間隔長)
        }

        // 繪製主線
        const centerX = (from.x + to.x) / 2;
        const centerY = (from.y + to.y) / 2;

        this.ctx.beginPath();
        if (Math.abs(from.y - to.y) <= 1) {
            // 同列（常見）：維持原本直線 → 既有圖 pixel 完全不變
            this.ctx.moveTo(from.x, from.y);
            this.ctx.lineTo(to.x, to.y);
        } else {
            // [Phase 2A.1] 非並排配偶：正交繞線（水平出 → 垂直 → 水平入），取代醜斜線。
            // 裝飾仍落在 (centerX, centerY) = 垂直段中點，故下方裝飾碼無需改動。
            this.ctx.moveTo(from.x, from.y);
            this.ctx.lineTo(centerX, from.y);
            this.ctx.lineTo(centerX, to.y);
            this.ctx.lineTo(to.x, to.y);
        }
        this.ctx.stroke();

        this.ctx.setLineDash(DASH_PATTERNS.solid); // 重置虛線以繪製裝飾

        // 裝飾
        if (style.decoration === 'house') {
            this.drawHouse(centerX, centerY);
        } else if (style.decoration === 'single-slash') {
            this.drawSlash(centerX, centerY);
        } else if (style.decoration === 'double-slash') {
            // 法律分居: 兩條斜線
            this.drawDoubleSlash(centerX, centerY);
        } else if (style.decoration === 'divorce-slash') {
            // 離婚: 兩條垂直短線(或斜線)加阻斷
            this.drawDivorceSlash(centerX, centerY);
        } else if (style.decoration === 'x') {
            this.drawX(centerX, centerY);
        } else if (style.decoration === 'x-double') {
            this.drawX(centerX, centerY); // 喪偶通常也是打叉，或者雙叉? 參考圖是打叉
        }
    }

    /**
     * 繪製小房子 (法律同居)
     */
    drawHouse(x, y) {
        const w = 12;
        const h = 10;
        this.ctx.save();
        this.ctx.fillStyle = '#FFFFFF'; // 填充白色蓋住線條
        this.ctx.beginPath();
        this.ctx.moveTo(x - w / 2, y); // 左下
        this.ctx.lineTo(x - w / 2, y - h / 2); // 左上壁
        this.ctx.lineTo(x, y - h); // 屋頂頂點
        this.ctx.lineTo(x + w / 2, y - h / 2); // 右上壁
        this.ctx.lineTo(x + w / 2, y); // 右下
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.restore();
    }

    /**
     * 繪製雙斜線 (法律分居)
     */
    drawDoubleSlash(x, y) {
        const size = 6;
        const gap = 4;
        this.ctx.beginPath();
        this.ctx.moveTo(x - size - gap, y + size);
        this.ctx.lineTo(x + size - gap, y - size);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(x - size + gap, y + size);
        this.ctx.lineTo(x + size + gap, y - size);
        this.ctx.stroke();
    }

    /**
     * 繪製離婚標記 (兩條斜線 //)
     */
    drawDivorceSlash(x, y) {
        const size = 6;
        const gap = 4;

        this.ctx.beginPath();
        this.ctx.moveTo(x - size - gap, y + size);
        this.ctx.lineTo(x + size - gap, y - size);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(x - size + gap, y + size);
        this.ctx.lineTo(x + size + gap, y - size);
        this.ctx.stroke();
    }

    // [REMOVED] 重複的 drawHouse 函數已移除，保留 Line 824 的版本

    /**
     * 繪製斜線裝飾
     */
    drawSlash(x, y) {
        const size = 6;
        this.ctx.beginPath();
        this.ctx.moveTo(x - size, y + size);
        this.ctx.lineTo(x + size, y - size);
        this.ctx.stroke();
    }

    /**
     * 繪製 X 裝飾
     */
    drawX(x, y) {
        const size = 6;
        this.ctx.beginPath();
        this.ctx.moveTo(x - size, y - size);
        this.ctx.lineTo(x + size, y + size);
        this.ctx.moveTo(x + size, y - size);
        this.ctx.lineTo(x - size, y + size);
        this.ctx.stroke();
    }

    /**
     * [Refined] 取得關係路徑 - 預設回傳直線以保持畫面整潔
     */
    getSmartPath(fromPerson, toPerson, persons) {
        // 設定起點和終點（考慮圓半徑，讓線條從圓周出發）
        const baseRadius = this.personSize / 2 + 5;
        const dx = toPerson.x - fromPerson.x;
        const dy = toPerson.y - fromPerson.y;
        const centerDist = Math.hypot(dx, dy);

        // 短距離時縮小內縮半徑，避免 start/end 越過彼此導致線段消失
        // 保留 path 至少 10px 長供箭頭和波浪繪製
        const maxRadius = Math.max(5, (centerDist - 10) / 2);
        const radius = Math.min(baseRadius, maxRadius);

        const angle = Math.atan2(dy, dx);

        // [New] 垂直線避讓優化：如果是垂直線，強制改為從右側連接
        // 這樣可以避開人物正下方的備註文字
        if (Math.abs(dy) > Math.abs(dx) * 3) {
            const start = {
                x: fromPerson.x + radius, // 右側 (0度)
                y: fromPerson.y
            };
            const end = {
                x: toPerson.x + radius,   // 右側
                y: toPerson.y
            };
            return [start, end];
        }

        const start = {
            x: fromPerson.x + Math.cos(angle) * radius,
            y: fromPerson.y + Math.sin(angle) * radius
        };
        const end = {
            x: toPerson.x - Math.cos(angle) * radius,
            y: toPerson.y - Math.sin(angle) * radius
        };

        // 直接返回直線路徑，不再進行複雜的避讓運算
        return [start, end];
    }

    /**
     * 計算點到線段的最短距離
     */
    distanceToSegment(p, v, w) {
        const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
        if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);

        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));

        const projection = {
            x: v.x + t * (w.x - v.x),
            y: v.y + t * (w.y - v.y)
        };

        return Math.hypot(p.x - projection.x, p.y - projection.y);
    }

    /**
     * 繪製情感關係線 (支援多段路徑)
     */
    drawEmotionalLine(fromPerson, toPerson, style, persons) {
        // 1. 取得路徑點 (已經處理好避讓和圓周連接)
        const path = this.getSmartPath(fromPerson, toPerson, persons);

        // 2. 使用通用路徑繪製器
        this.ctx.setLineDash(this.getLineDash(style.pattern));
        this.drawPatternOnPath(path, style);
        this.ctx.setLineDash(DASH_PATTERNS.solid);

        // 3. 繪製裝飾 (在路徑中點)
        this.drawEmotionalDecorations(path, style);
    }

    /**
     * 繪製情感關係的裝飾 (箭頭、叉號、平行線等)
     */
    drawEmotionalDecorations(path, style) {
        if (!style.decoration) return;

        // 計算總長度與中點
        const totalLen = this.getPathLength(path);
        if (totalLen < 5) return;
        const midDist = totalLen / 2;

        // 取得中點座標與切向量 (用於旋轉裝飾)
        const midInfo = this.getPointInfoAtDistance(path, midDist);
        const midPt = midInfo.point;
        const tangent = midInfo.tangent; // {x, y} normalized

        // 計算一個小片段的方向來畫箭頭或符號
        const decorSize = 10;

        // 一些裝飾需要在兩端

        if (style.decoration === 'arrow') {
            // 關注 / 遠距敵對: 末端箭頭（尖端 = path 終點）
            this.drawArrowAtPathEnd(path);
        } else if (style.decoration === 'circle-arrow') {
            // 崇拜: 中間圓圈 + 末端箭頭
            this.ctx.save();
            this.ctx.fillStyle = 'white';
            this.ctx.strokeStyle = style.color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(midPt.x, midPt.y, 4, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();

            this.drawArrowAtPathEnd(path);
        } else if (style.decoration === 'double-bar') {
            // 疏離/敵對/斷絕: 雙豎線 (中間)
            const barSize = 8;
            const perpX = -tangent.y * barSize;
            const perpY = tangent.x * barSize;

            // 第一條
            this.ctx.beginPath();
            this.ctx.moveTo(midPt.x - tangent.x * 3 + perpX, midPt.y - tangent.y * 3 + perpY);
            this.ctx.lineTo(midPt.x - tangent.x * 3 - perpX, midPt.y - tangent.y * 3 - perpY);
            this.ctx.stroke();

            // 第二條
            this.ctx.beginPath();
            this.ctx.moveTo(midPt.x + tangent.x * 3 + perpX, midPt.y + tangent.y * 3 + perpY);
            this.ctx.lineTo(midPt.x + tangent.x * 3 - perpX, midPt.y + tangent.y * 3 - perpY);
            this.ctx.stroke();
        } else if (style.decoration === 'double-dash') {
            // 仇恨: 雙斜線/豎線? 參考圖是 zigzag 加上兩條豎線
            // 與 double-bar 類似
            const barSize = 8;
            const perpX = -tangent.y * barSize;
            const perpY = tangent.x * barSize;

            this.ctx.beginPath();
            this.ctx.moveTo(midPt.x - tangent.x * 3 + perpX, midPt.y - tangent.y * 3 + perpY);
            this.ctx.lineTo(midPt.x - tangent.x * 3 - perpX, midPt.y - tangent.y * 3 - perpY);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(midPt.x + tangent.x * 3 + perpX, midPt.y + tangent.y * 3 + perpY);
            this.ctx.lineTo(midPt.x + tangent.x * 3 - perpX, midPt.y + tangent.y * 3 - perpY);
            this.ctx.stroke();
        } else if (style.decoration === 'circle') {
            // 愛: 中間實心圓
            this.ctx.save();
            this.ctx.fillStyle = 'white';
            this.ctx.beginPath();
            this.ctx.arc(midPt.x, midPt.y, 4, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();
        } else if (style.decoration === 'double-circle') {
            // 熱戀: 中間兩個圓圈(相交)
            this.ctx.save();
            this.ctx.fillStyle = 'white'; // hollow?

            this.ctx.beginPath();
            this.ctx.arc(midPt.x - 3, midPt.y, 4, 0, Math.PI * 2);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.arc(midPt.x + 3, midPt.y, 4, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
        } else if (style.decoration === 'box') {
            // 身體虐待: 方框 (中間)
            // 應該是填滿顏色的? 參考圖是白色填充
            this.ctx.save();
            this.ctx.fillStyle = 'white';
            this.ctx.beginPath();
            this.ctx.rect(midPt.x - 5, midPt.y - 5, 10, 10);
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();
        } else if (style.decoration === 'box-cross-arrow') {
            // 控制: 中間 Box + Cross, 末端箭頭
            this.ctx.save();
            this.ctx.fillStyle = 'white';

            // Box
            this.ctx.beginPath();
            this.ctx.rect(midPt.x - 5, midPt.y - 5, 10, 10);
            this.ctx.fill();
            this.ctx.stroke();

            // Cross
            this.ctx.beginPath();
            this.ctx.moveTo(midPt.x - 5, midPt.y - 5);
            this.ctx.lineTo(midPt.x + 5, midPt.y + 5);
            this.ctx.moveTo(midPt.x + 5, midPt.y - 5);
            this.ctx.lineTo(midPt.x - 5, midPt.y + 5);
            this.ctx.stroke();
            this.ctx.restore();

            // Arrow at end
            this.drawArrowAtPathEnd(path);
        } else if (style.decoration === 'double-arrow-red') {
            // 操控: 黑色實線 + 紅色箭頭
            this.ctx.save();
            this.ctx.strokeStyle = '#E53935'; // Force Red
            this.drawArrowAtPathEnd(path);
            this.ctx.restore();
        } else if (style.decoration === 'x-arrow') {
            // 忽視舊版: 中間豎線 + 末端箭頭 (目前 Neglect 已改用 arrow-bar，保留此分支備用)
            const barSize = 8;
            const perpX = -tangent.y * barSize;
            const perpY = tangent.x * barSize;
            this.ctx.beginPath();
            this.ctx.moveTo(midPt.x + perpX, midPt.y + perpY);
            this.ctx.lineTo(midPt.x - perpX, midPt.y - perpY);
            this.ctx.stroke();

            this.drawArrowAtPathEnd(path);
        } else if (style.decoration === 'decoration-line') {
            // Placeholder if needed
        } else if (style.decoration === 'x') {
            // 操控 (Manipulative): 紅色 X (Force Red)
            this.ctx.save();
            this.ctx.strokeStyle = '#E53935';
            this.drawX(midPt.x, midPt.y);
            this.ctx.restore();
        } else if (style.decoration === 'arrow-bar') {
            // 忽視 (Neglect): 藍色箭頭 + 黑色豎線
            // Arrow (Blue - inherited)
            this.drawArrowAtPathEnd(path);
            // Bar (Black) - 位於箭頭尾那裡（距終點 20px，跟箭頭長度一致）
            this.ctx.save();
            this.ctx.strokeStyle = '#000000';
            const barDist = Math.max(0, totalLen - 20);
            const barInfo = this.getPointInfoAtDistance(path, barDist);
            const barSize = 8;
            const px = -barInfo.tangent.y * barSize;
            const py = barInfo.tangent.x * barSize;
            this.ctx.beginPath();
            this.ctx.moveTo(barInfo.point.x + px, barInfo.point.y + py);
            this.ctx.lineTo(barInfo.point.x - px, barInfo.point.y - py);
            this.ctx.stroke();
            this.ctx.restore();
        }
    }

    roundRect(ctx, x, y, width, height, radius) {
        if (typeof radius === 'undefined') {
            radius = 5;
        }
        if (typeof radius === 'number') {
            radius = { tl: radius, tr: radius, br: radius, bl: radius };
        } else {
            var defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
            for (var side in defaultRadius) {
                radius[side] = radius[side] || defaultRadius[side];
            }
        }
        ctx.beginPath();
        ctx.moveTo(x + radius.tl, y);
        ctx.lineTo(x + width - radius.tr, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
        ctx.lineTo(x + width, y + height - radius.br);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
        ctx.lineTo(x + radius.bl, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
        ctx.lineTo(x, y + radius.tl);
        ctx.quadraticCurveTo(x, y, x + radius.tl, y);
        ctx.closePath();
    }

    getPathLength(points) {
        let len = 0;
        for (let i = 0; i < points.length - 1; i++) {
            len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
        }
        return len;
    }

    getPointAtDistance(points, distance) {
        let covered = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const dx = points[i + 1].x - points[i].x;
            const dy = points[i + 1].y - points[i].y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (covered + len >= distance) {
                const fraction = (distance - covered) / len;
                return {
                    x: points[i].x + dx * fraction,
                    y: points[i].y + dy * fraction
                };
            }
            covered += len;
        }
        return points[points.length - 1];
    }

    /**
     * 沿著路徑繪製樣式
     */
    drawPatternOnPath(path, style) {
        if (path.length < 2) return;

        // 這些樣式需要特殊處理，非單純 stroke
        const complexPatterns = ['wave', 'zigzag', 'zigzag-large', 'sawtooth', 'double', 'triple', 'cutoff-line', 'gap-bar', 'close-hostile', 'fused-hostile', 'conflict-close', 'physical-abuse', 'emotional-abuse', 'sexual-abuse'];

        if (!complexPatterns.includes(style.pattern)) {
            // 普通實線、虛線、點線
            this.ctx.beginPath();
            this.ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) {
                this.ctx.lineTo(path[i].x, path[i].y);
            }
            this.ctx.stroke();
            return;
        }

        const totalLen = this.getPathLength(path);

        if (style.pattern === 'double') {
            this.drawParallelPath(path, 4);
            this.drawParallelPath(path, -4);
        } else if (style.pattern === 'triple') {
            this.drawParallelPath(path, 0);
            this.drawParallelPath(path, 5);
            this.drawParallelPath(path, -5);
        } else if (style.pattern === 'wave') {
            const lines = style.lines || 1;
            // 有末端箭頭 decoration 時，讓波浪在箭頭前收斂成直線，避免波浪穿過箭頭
            const hasEndArrow = style.decoration && /arrow/.test(style.decoration);
            const endMargin = hasEndArrow ? 22 : 0;
            this.drawWaveOnPath(path, totalLen, lines, endMargin);
        } else if (style.pattern === 'zigzag') {
            this.drawZigzagOnPath(path, totalLen);
        } else if (style.pattern === 'zigzag-large') {
            this.drawZigzagOnPath(path, totalLen, 8, 16);
        } else if (style.pattern === 'sawtooth') {
            this.drawZigzagOnPath(path, totalLen, 3, 6);
        } else if (style.pattern === 'close-hostile') {
            // 親密敵對: 灰色雙線 + 紅色鋸齒 (Close Hostile)
            this.ctx.save();
            this.ctx.strokeStyle = '#757575';
            this.drawParallelPath(path, 3);
            this.drawParallelPath(path, -3);
            this.ctx.restore();
            // 紅色鋸齒 (原本的 strokeStyle)
            this.drawZigzagOnPath(path, totalLen);
        } else if (style.pattern === 'fused-hostile') {
            // 融合敵對: 灰色雙線(較寬) + 紅色鋸齒
            this.ctx.save();
            this.ctx.strokeStyle = '#757575';
            this.drawParallelPath(path, 4);
            this.drawParallelPath(path, -4);
            this.ctx.restore();

            this.drawZigzagOnPath(path, totalLen);
            this.drawZigzagOnPath(path, totalLen);
        } else if (style.pattern === 'conflict-close') {
            // 衝突又親密: 兩條綠線夾紅色鋸齒 (Green Lines + Red Zigzag)
            // Green Parallel
            this.ctx.save();
            this.ctx.strokeStyle = '#4caf50'; // Green
            this.drawParallelPath(path, 5);
            this.drawParallelPath(path, -5);
            this.ctx.restore();

            // Red Zigzag
            this.ctx.save();
            this.ctx.strokeStyle = '#E53935'; // Red Conflict
            this.drawZigzagOnPath(path, totalLen);
            this.ctx.restore();

        } else if (style.pattern === 'physical-abuse') {
            // 身體虐待: 藍色波浪 + 中央黑色直線
            // Blue Wave (Inherited color assumed Blue)
            this.drawWaveOnPath(path, totalLen);
            // Black Line (中央，offset 0)
            this.ctx.save();
            this.ctx.strokeStyle = '#000000';
            this.ctx.setLineDash(DASH_PATTERNS.solid);
            this.ctx.beginPath();
            this.ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) this.ctx.lineTo(path[i].x, path[i].y);
            this.ctx.stroke();
            this.ctx.restore();

        } else if (style.pattern === 'emotional-abuse') {
            // 情緒虐待: 藍色鋸齒 + 中央黑色直線
            // 使用較小振幅 (4) 和較短波長 (8) 讓鋸齒更密集，與波浪明顯區分
            this.drawZigzagOnPath(path, totalLen, 4, 8);
            // Black Line (中央，offset 0)
            this.ctx.save();
            this.ctx.strokeStyle = '#000000';
            this.ctx.setLineDash(DASH_PATTERNS.solid);
            this.ctx.beginPath();
            this.ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) this.ctx.lineTo(path[i].x, path[i].y);
            this.ctx.stroke();
            this.ctx.restore();

        } else if (style.pattern === 'sexual-abuse') {
            // 性虐待: 藍色雙鋸齒 (Double Zigzag)
            // Amplitude 4, Wavelength 10 (Less dense), Gap 3
            this.drawZigzagOnPath(path, totalLen, 4, 10, 3);
            this.drawZigzagOnPath(path, totalLen, 4, 10, -3);

        } else if (style.pattern === 'cutoff-line') {
            // 畫兩段，中間斷開，並加上豎線
            // 我們可以畫整條，但用黑色背景遮蓋中間？不行，背景不一定是白的
            // 分兩段畫
            const gap = 20;
            const mid = totalLen / 2;
            if (totalLen > gap * 2) {
                this.drawSubPath(path, 0, mid - gap / 2);
                this.drawSubPath(path, mid + gap / 2, totalLen);

                // 畫豎線 (垂直於切線)
                const info = this.getPointInfoAtDistance(path, mid);
                const nx = -info.tangent.y * 10; // normal vector scaled
                const ny = info.tangent.x * 10;

                // Cutoff 是一條還是兩條？之前的代碼是畫了兩條。
                // 這裡畫一條垂直線
                this.ctx.beginPath();
                this.ctx.moveTo(info.point.x - nx, info.point.y - ny);
                this.ctx.lineTo(info.point.x + nx, info.point.y + ny);
                this.ctx.stroke();

                // 如果需要第二條 (Estranged/Cutoff 差異? 通常 Cutoff 是一條, Estranged 是虛線)
                if (style.decoration === 'vertical-bar') {
                    // 已經畫了
                }
            }
        }
    }

    /**
     * 繪製平行路徑
     */
    drawParallelPath(path, offset) {
        this.ctx.beginPath();
        let first = true;

        // 簡單法：對每個點計算切線法向量並偏移
        // 更精確的做法是計算 offset curve，但在像素級別如果是平滑的，逐點偏移還可以
        // 為了平滑，我們需要遍歷 path 並計算每個頂點的平均法向量 (miter)
        // 這裡簡化：計算每段的法向量，然後平移線段，再連接缺口 (這會造成斷裂)

        // 採用 "Walker" 方式，每隔 2-3px 採樣並偏移，形成平滑曲線
        const step = 3;
        const len = this.getPathLength(path);

        for (let d = 0; d <= len; d += step) {
            const info = this.getPointInfoAtDistance(path, d);
            const nx = -info.tangent.y;
            const ny = info.tangent.x;

            const px = info.point.x + nx * offset;
            const py = info.point.y + ny * offset;

            if (first) {
                this.ctx.moveTo(px, py);
                first = false;
            } else {
                this.ctx.lineTo(px, py);
            }
        }
        this.ctx.stroke();
    }

    /**
     * 沿路徑繪製波浪（支援多線）
     * @param {number} endMargin - 末端振幅 ease out 的長度。>0 時讓末端波浪收斂成直線（避免穿過箭頭）
     */
    drawWaveOnPath(path, totalLen, lines = 1, endMargin = 0) {
        const amplitude = 5;
        const frequency = 0.15;
        const step = 2;
        const lineGap = 4; // 多線之間的間距

        for (let lineIndex = 0; lineIndex < lines; lineIndex++) {
            // 計算這條線的偏移量（置中排列）
            const offsetBase = (lineIndex - (lines - 1) / 2) * lineGap;

            this.ctx.beginPath();
            let first = true;

            for (let d = 0; d <= totalLen; d += step) {
                const info = this.getPointInfoAtDistance(path, d);
                const phase = d * frequency;

                // 末端 endMargin 範圍內，振幅線性 ease out 到 0
                let ampScale = 1;
                if (endMargin > 0 && d > totalLen - endMargin) {
                    ampScale = Math.max(0, (totalLen - d) / endMargin);
                }
                const waveOffset = Math.sin(phase) * amplitude * ampScale;

                const nx = -info.tangent.y;
                const ny = info.tangent.x;

                // 總偏移 = 波浪偏移 + 多線偏移
                const totalOffset = waveOffset + offsetBase;

                const px = info.point.x + nx * totalOffset;
                const py = info.point.y + ny * totalOffset;

                if (first) {
                    this.ctx.moveTo(px, py);
                    first = false;
                } else {
                    this.ctx.lineTo(px, py);
                }
            }
            this.ctx.stroke();
        }
    }


    /**
     * 沿路徑繪製鋸齒
     */
    drawZigzagOnPath(path, totalLen, amplitude = 5, wavelength = 10, offsetBase = 0) {
        const step = 2;

        this.ctx.beginPath();
        let first = true;

        for (let d = 0; d <= totalLen; d += step) {
            const info = this.getPointInfoAtDistance(path, d);

            // Triangle wave function: 
            // Normalized phase [0, 1] inside wavelength
            const phase = (d % wavelength) / wavelength;
            let offsetFactor = 0;
            if (phase < 0.25) offsetFactor = phase * 4; // 0 -> 1
            else if (phase < 0.75) offsetFactor = 1 - (phase - 0.25) * 4; // 1 -> -1
            else offsetFactor = -1 + (phase - 0.75) * 4; // -1 -> 0

            const offset = offsetFactor * amplitude + offsetBase;

            const nx = -info.tangent.y;
            const ny = info.tangent.x;

            const px = info.point.x + nx * offset;
            const py = info.point.y + ny * offset;

            if (first) {
                this.ctx.moveTo(px, py);
                first = false;
            } else {
                this.ctx.lineTo(px, py);
            }
        }
        this.ctx.stroke();
    }

    /**
     * 畫路徑的一部分
     */
    drawSubPath(path, startDist, endDist) {
        this.ctx.beginPath();
        const step = 2;
        let first = true;
        for (let d = startDist; d <= endDist; d += step) {
            const pt = this.getPointAtDistance(path, d);
            if (first) {
                this.ctx.moveTo(pt.x, pt.y);
                first = false;
            } else {
                this.ctx.lineTo(pt.x, pt.y);
            }
        }
        // Ensure exact end point
        const endPt = this.getPointAtDistance(path, endDist);
        this.ctx.lineTo(endPt.x, endPt.y);
        this.ctx.stroke();
    }

    /**
     * 繪製交叉標記 (用於 敵對)
     */
    drawCrossBar(x, y) {
        const s = 5;
        this.ctx.save();
        this.ctx.setLineDash(DASH_PATTERNS.solid);
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        // X 標記
        this.ctx.moveTo(x - s, y - s);
        this.ctx.lineTo(x + s, y + s);
        this.ctx.moveTo(x + s, y - s);
        this.ctx.lineTo(x - s, y + s);
        this.ctx.stroke();
        this.ctx.restore();
    }

    getPointInfoAtDistance(points, distance) {
        // Returns {point: {x,y}, tangent: {x,y}}
        let covered = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const dx = points[i + 1].x - points[i].x;
            const dy = points[i + 1].y - points[i].y;
            const len = Math.sqrt(dx * dx + dy * dy);

            if (covered + len >= distance) {
                // Found the segment
                const fraction = (len === 0) ? 0 : (distance - covered) / len;
                const px = points[i].x + dx * fraction;
                const py = points[i].y + dy * fraction;

                // Tangent normalized
                const invLen = (len === 0) ? 0 : 1 / len;
                return {
                    point: { x: px, y: py },
                    tangent: { x: dx * invLen, y: dy * invLen }
                };
            }
            covered += len;
        }
        // End of path
        const last = points[points.length - 1];
        const prev = points[points.length - 2] || last;
        const dx = last.x - prev.x;
        const dy = last.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const invLen = (len === 0) ? 0 : 1 / len;
        return {
            point: { x: last.x, y: last.y },
            tangent: { x: dx * invLen, y: dy * invLen }
        };
    }



    /**
     * 繪製波浪線 (Wave)
     */
    drawWaveLine(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const frequency = 10; // Tighter wave (was 20)
        const amplitude = 3;  // Smaller amplitude (was 5)
        const steps = Math.ceil(distance); // More steps for smoother curve

        const angle = Math.atan2(dy, dx);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = x1 + dx * t;
            const y = y1 + dy * t;

            // 波浪偏移
            const offset = Math.sin(t * distance / frequency * Math.PI * 2) * amplitude;

            // 垂直於線條方向的偏移
            const nx = -sin * offset;
            const ny = cos * offset;

            this.ctx.lineTo(x + nx, y + ny);
        }
        this.ctx.stroke();
    }

    /**
     * 繪製帶有斷點和雙豎線的線 (斷絕/冷戰)
     */
    drawGapBarLine(x1, y1, x2, y2) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx);
        const gapSize = 24;

        // 計算斷開點
        const gapStartX = midX - Math.cos(angle) * (gapSize / 2);
        const gapStartY = midY - Math.sin(angle) * (gapSize / 2);
        const gapEndX = midX + Math.cos(angle) * (gapSize / 2);
        const gapEndY = midY + Math.sin(angle) * (gapSize / 2);

        // 畫兩段線
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(gapStartX, gapStartY);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(gapEndX, gapEndY);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();

        // 畫中間的兩條豎線 (||)
        const barSize = 10;
        const barDist = 4; // 兩條線的距離
        const len = Math.sqrt(dx * dx + dy * dy);
        const perpX = -dy / len * barSize;
        const perpY = dx / len * barSize;

        const drawBarAt = (dist) => {
            const bx = midX + Math.cos(angle) * dist;
            const by = midY + Math.sin(angle) * dist;
            this.ctx.beginPath();
            this.ctx.moveTo(bx - perpX, by - perpY);
            this.ctx.lineTo(bx + perpX, by + perpY);
            this.ctx.stroke();
        };

        drawBarAt(-barDist);
        drawBarAt(barDist);
    }

    /**
     * 繪製實心三角形箭頭 (用於控制)
     */
    drawBoxArrow(x1, y1, x2, y2) {
        const headlen = 12;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx);

        this.ctx.save();
        this.ctx.fillStyle = this.ctx.strokeStyle;
        this.ctx.beginPath();
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
        this.ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
    }

    /**
     * 繪製箭頭
     */
    drawArrow(x1, y1, x2, y2, atEnd = true) {
        const headlen = 10;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx);

        if (atEnd) {
            this.ctx.beginPath();
            this.ctx.moveTo(x2, y2);
            this.ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
            this.ctx.moveTo(x2, y2);
            this.ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
            this.ctx.stroke();
        }
    }

    /**
     * 在 path 終點畫箭頭（尖端剛好落在 path[length-1]，用最後一段的切向量）。
     * 取代先前 `totalLen - 15` 退縮寫法：該寫法在兩人距離近時會讓箭頭落在中點，
     * 且對 wave pattern 因箭頭畫在直線軸而非波浪上，造成視覺脫軌。
     */
    drawArrowAtPathEnd(path, arrowLen = 20) {
        if (!path || path.length < 2) return;
        const endPt = path[path.length - 1];
        const prevPt = path[path.length - 2];
        const dx = endPt.x - prevPt.x;
        const dy = endPt.y - prevPt.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        this.drawArrow(
            endPt.x - ux * arrowLen, endPt.y - uy * arrowLen,
            endPt.x, endPt.y,
            true
        );
    }

    /**
     * 繪製衝突又親密：波浪線上方有平行實線
     */
    drawSolidLineAbove(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const gap = 6; // 兩條線之間的距離
        const nx = -dy / len * gap; // 垂直於線條方向的單位向量
        const ny = dx / len * gap;

        // 在上方繪製實線
        this.ctx.setLineDash(DASH_PATTERNS.solid);
        this.ctx.beginPath();
        this.ctx.moveTo(x1 + nx, y1 + ny);
        this.ctx.lineTo(x2 + nx, y2 + ny);
        this.ctx.stroke();
    }

    /**
     * 繪製關係惡化：實線上有幾條短斜線
     */
    drawDiagonalBars(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const count = Math.floor(length / 25); // 每25px一個斜線
        const barSize = 8;

        const ux = dx / length;
        const uy = dy / length;
        const nx = -uy; // 垂直單位向量
        const ny = ux;

        for (let i = 1; i < count; i++) {
            const t = i / (count + 1);
            const x = x1 + dx * t;
            const y = y1 + dy * t;

            this.ctx.beginPath();
            this.ctx.moveTo(x - nx * barSize, y - ny * barSize);
            this.ctx.lineTo(x + nx * barSize, y + ny * barSize);
            this.ctx.stroke();
        }
    }

    /**
     * 繪製溝通中斷：實線中間向下延伸，右端向上延伸
     */
    drawCutoffLine(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const extension = 15; // 延伸長度

        // 繪製主線
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();

        // 中間向下延伸
        const angle = Math.atan2(dy, dx);
        const perpAngle = angle + Math.PI / 2; // 垂直方向
        const downX = midX + Math.cos(perpAngle) * extension;
        const downY = midY + Math.sin(perpAngle) * extension;

        this.ctx.beginPath();
        this.ctx.moveTo(midX, midY);
        this.ctx.lineTo(downX, downY);
        this.ctx.stroke();

        // 右端向上延伸
        const upAngle = angle - Math.PI / 2; // 向上垂直方向
        const upX = x2 + Math.cos(upAngle) * extension;
        const upY = y2 + Math.sin(upAngle) * extension;

        this.ctx.beginPath();
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(upX, upY);
        this.ctx.stroke();
    }

    /**
     * 繪製雙線
     */
    drawDoubleLine(x1, y1, x2, y2, gap) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len * gap / 2;
        const ny = dx / len * gap / 2;

        this.ctx.beginPath();
        this.ctx.moveTo(x1 + nx, y1 + ny);
        this.ctx.lineTo(x2 + nx, y2 + ny);
        this.ctx.moveTo(x1 - nx, y1 - ny);
        this.ctx.lineTo(x2 - nx, y2 - ny);
        this.ctx.stroke();
    }

    /**
     * 繪製三線
     */
    drawTripleLine(x1, y1, x2, y2, gap) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len * gap;
        const ny = dx / len * gap;

        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.moveTo(x1 + nx, y1 + ny);
        this.ctx.lineTo(x2 + nx, y2 + ny);
        this.ctx.moveTo(x1 - nx, y1 - ny);
        this.ctx.lineTo(x2 - nx, y2 - ny);
        this.ctx.stroke();
    }

    /**
     * 繪製鋸齒線
     */
    drawZigzagLine(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const segments = Math.max(4, Math.floor(length / 5)); // Tighter zigzag (was 15)
        const segmentLength = length / segments;
        const amplitude = 4; // Smaller amplitude (was 6)

        const ux = dx / length;
        const uy = dy / length;
        const nx = -uy;
        const ny = ux;

        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);

        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const x = x1 + dx * t;
            const y = y1 + dy * t;
            const offset = (i % 2 === 1) ? amplitude : -amplitude;

            if (i < segments) {
                this.ctx.lineTo(x + nx * offset, y + ny * offset);
            } else {
                this.ctx.lineTo(x2, y2);
            }
        }

        this.ctx.stroke();
    }

    /**
     * 繪製鋸齒線上的短豎線 (Hostile)
     */
    drawBars(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const count = Math.floor(length / 20); // 每20px一個豎線

        const ux = dx / length;
        const uy = dy / length;

        // 垂直單位向量
        const nx = -uy;
        const ny = ux;

        const barSize = 6;

        this.ctx.beginPath();
        for (let i = 1; i < count; i++) {
            const t = i / count;
            const cx = x1 + dx * t;
            const cy = y1 + dy * t;

            this.ctx.moveTo(cx - nx * barSize, cy - ny * barSize);
            this.ctx.lineTo(cx + nx * barSize, cy + ny * barSize);
        }
        this.ctx.stroke();
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

    /**
     * 匯出為 PNG 圖片（含關係圖例）
     * @param {Array} persons - 人物陣列
     * @param {Array} relationships - 關係陣列
     * @param {Array} households - 同住家庭陣列
     * @param {Array} lifeCircles - 生活圈陣列
     * @param {boolean} showNotes - 是否顯示備註 (人物備註 + 關係線時間/說明)
     * @param {boolean} showLegend - 是否顯示關係類型圖例
     * @param {number} scale - 匯出縮放倍率 (解析度)
     */
    exportToPNG(persons, relationships, households = [], lifeCircles = [], showNotes = true,
        showLegend = true, scale = 3, viewOptions = {}) {
        const visible = this.getVisibleExportData(
            persons, relationships, households, lifeCircles, viewOptions);
        const effectiveView = {
            ...visible.viewOptions,
            showNotes: visible.viewOptions.showNotes && showNotes
        };
        const bounds = this._calculateContentBounds(
            visible.persons, visible.relationships, visible.households, visible.lifeCircles,
            effectiveView, relationships);
        if (!bounds) return null;

        const { minX, minY, maxX, maxY, width: contentWidth, height: contentHeight } = bounds;
        const margin = 50; // Re-define margin for legend calculation

        // ===== 圖例設定 =====
        // 如果不顯示圖例，寬度設為 0
        const legendWidth = showLegend ? 440 : 0;
        const legendPadding = showLegend ? 40 : 0;
        const legendHeight = effectiveView.showEmotionalRelationships ? 850 : 480;

        // 總畫布尺寸
        const totalWidth = contentWidth + legendWidth + legendPadding;
        const totalHeight = Math.max(contentHeight, (showLegend ? legendHeight + margin * 2 : contentHeight));

        // 建立臨時畫布
        const exportCanvas = document.createElement('canvas');
        const exportScale = scale; // 使用傳入的 scale
        exportCanvas.width = totalWidth * exportScale;
        exportCanvas.height = totalHeight * exportScale;
        const exportCtx = exportCanvas.getContext('2d');
        exportCtx.scale(exportScale, exportScale);

        // [Bug Fix #6] 強制填充純白背景，不留透明度
        exportCtx.fillStyle = '#ffffff';
        exportCtx.fillRect(0, 0, totalWidth, totalHeight);

        // 暫時切換 context
        const originalCtx = this.ctx;
        this.ctx = exportCtx;

        // 平移到內容區域
        this.ctx.save();
        this.ctx.translate(-minX, -minY);

        // 1. 先繪製生活圈 (最最底層)
        if (visible.lifeCircles.length > 0) {
            this.drawLifeCirclesExport(visible.lifeCircles);
        }

        // 1.5 繪製同住家庭
        if (visible.households.length > 0) {
            this.drawHouseholds(visible.households, persons, relationships, false, null);
        }

        // 2. 繪製親子關係
        const familyRels = visible.relationships.filter(r => (typeof r.getCategory === 'function' ? r.getCategory() : Relationship.getCategory(r.type)) === 'family');
        const otherRels = visible.relationships.filter(r => (typeof r.getCategory === 'function' ? r.getCategory() : Relationship.getCategory(r.type)) !== 'family');

        this.drawFamilies(familyRels, persons, otherRels);

        // 3. 繪製其餘關係
        otherRels.forEach(rel => {
            const fromPerson = this.personMap.get(rel.fromPersonId);
            const toPerson = this.personMap.get(rel.toPersonId);
            if (fromPerson && toPerson) {
                this.drawRelationship(fromPerson, toPerson, rel, false, persons, relationships);
            }
        });

        // 3.5 繪製關係線說明 (日期/備註) - 根據 showNotes 決定是否繪製
        if (effectiveView.showNotes) {
            visible.relationships.forEach(rel => {
                const fromPerson = this.personMap.get(rel.fromPersonId);
                const toPerson = this.personMap.get(rel.toPersonId);
                if (fromPerson && toPerson) {
                    this.drawRelationshipDate(fromPerson, toPerson, rel, persons, relationships);
                }
            });
        }

        // 4. 繪製人物 (備註根據 showNotes 決定)
        persons.forEach(person => {
            this.drawPersonForExport(person, effectiveView);
        });

        this.ctx.restore();

        // 5. 繪製圖例 (靠右對齊) - 只有當 showLegend 為 true 時才繪製
        if (showLegend) {
            const legendX = totalWidth - legendWidth - legendPadding / 2;
            const legendY = (totalHeight - legendHeight) / 2;
            this.drawExportLegend(exportCtx, legendX, legendY, effectiveView);
        }

        // 還原 context
        this.ctx = originalCtx;

        return exportCanvas.toDataURL('image/png');
    }

    /**
     * 匯出為 JPEG 圖片（含關係圖例）
     * @param {Array} persons - 人物陣列
     * @param {Array} relationships - 關係陣列
     * @param {Array} households - 同住家庭陣列
     * @param {Array} lifeCircles - 生活圈陣列
     * @param {number} quality - JPEG 品質 (0-1)
     * @param {boolean} showNotes - 是否顯示備註
     * @param {boolean} showLegend - 是否顯示關係類型圖例
     * @param {number} scale - 匯出縮放倍率
     * @returns {string|null} - Data URL 或 null
     */
    exportToJPEG(persons, relationships, households = [], lifeCircles = [], quality = 0.92,
        showNotes = true, showLegend = true, scale = 3, viewOptions = {}) {
        const visible = this.getVisibleExportData(
            persons, relationships, households, lifeCircles, viewOptions);
        const effectiveView = {
            ...visible.viewOptions,
            showNotes: visible.viewOptions.showNotes && showNotes
        };
        const bounds = this._calculateContentBounds(
            visible.persons, visible.relationships, visible.households, visible.lifeCircles,
            effectiveView, relationships);
        if (!bounds) return null;

        const { minX, minY, maxX, maxY, width: contentWidth, height: contentHeight } = bounds;
        const margin = 50; // Re-define margin for legend calculation

        const legendWidth = showLegend ? 440 : 0;
        const legendPadding = showLegend ? 40 : 0;
        const legendHeight = effectiveView.showEmotionalRelationships ? 850 : 480;

        const totalWidth = contentWidth + legendWidth + legendPadding;
        const totalHeight = Math.max(contentHeight, (showLegend ? legendHeight + margin * 2 : contentHeight));

        const exportCanvas = document.createElement('canvas');
        const exportScale = scale; // 使用傳入的 scale
        exportCanvas.width = totalWidth * exportScale;
        exportCanvas.height = totalHeight * exportScale;
        const exportCtx = exportCanvas.getContext('2d');
        exportCtx.scale(exportScale, exportScale);

        // JPEG 需要純白背景
        exportCtx.fillStyle = '#ffffff';
        exportCtx.fillRect(0, 0, totalWidth, totalHeight);

        const originalCtx = this.ctx;
        this.ctx = exportCtx;

        this.ctx.save();
        this.ctx.translate(-minX, -minY);

        // 繪製生活圈
        if (visible.lifeCircles.length > 0) {
            this.drawLifeCirclesExport(visible.lifeCircles);
        }

        if (visible.households.length > 0) {
            this.drawHouseholds(visible.households, persons, relationships, false, null);
        }

        const familyRels = visible.relationships.filter(r => (typeof r.getCategory === 'function' ? r.getCategory() : Relationship.getCategory(r.type)) === 'family');
        const otherRels = visible.relationships.filter(r => (typeof r.getCategory === 'function' ? r.getCategory() : Relationship.getCategory(r.type)) !== 'family');

        this.drawFamilies(familyRels, persons, otherRels);

        otherRels.forEach(rel => {
            const fromPerson = this.personMap.get(rel.fromPersonId);
            const toPerson = this.personMap.get(rel.toPersonId);
            if (fromPerson && toPerson) {
                this.drawRelationship(fromPerson, toPerson, rel, false, persons, relationships);
            }
        });

        // 繪製關係線說明 (日期/備註) - 根據 showNotes 決定是否繪製
        if (effectiveView.showNotes) {
            visible.relationships.forEach(rel => {
                const fromPerson = this.personMap.get(rel.fromPersonId);
                const toPerson = this.personMap.get(rel.toPersonId);
                if (fromPerson && toPerson) {
                    this.drawRelationshipDate(fromPerson, toPerson, rel, persons, relationships);
                }
            });
        }

        // 繪製人物 (備註根據 showNotes 決定)
        persons.forEach(person => {
            this.drawPersonForExport(person, effectiveView);
        });

        this.ctx.restore();

        if (showLegend) {
            const legendX = totalWidth - legendWidth - legendPadding / 2;
            const legendY = (totalHeight - legendHeight) / 2;
            this.drawExportLegend(exportCtx, legendX, legendY, effectiveView);
        }

        this.ctx = originalCtx;

        return exportCanvas.toDataURL('image/jpeg', quality);
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

    getLegendRenderSections(viewOptions = {}) {
        const view = this.normalizeViewOptions(viewOptions);
        return Relationship.getLegendSections({
            showEmotional: view.showEmotionalRelationships
        }).map(section => ({
            ...section,
            title: section.exportTitle,
            items: section.entries.map(entry => this.getLegendRenderItem(entry)).filter(Boolean)
        }));
    }

    /**
     * 繪製匯出用的關係圖例
     */
    drawExportLegend(ctx, x, y, viewOptions = {}) {
        const padding = 16;
        const lineHeight = 26;
        const lineWidth = 40;
        const fontSize = 13;
        const titleFontSize = 14;
        const sectionGap = 16;
        const columnGap = 32; // 欄位間距

        const sections = this.getLegendRenderSections(viewOptions);
        const leftSections = sections.filter(section => section.column === 'left');
        const rightSections = sections.filter(section => section.column === 'right');

        // 計算尺寸
        const leftItemsCount = leftSections.reduce((total, section) => total + section.items.length, 0);
        const rightItemsCount = rightSections.reduce((total, section) => total + section.items.length, 0);

        const maxItemsPerColumn = Math.max(leftItemsCount + 4, rightItemsCount + 4); // +4 for titles

        const columnWidth = 180;
        const totalWidth = columnWidth * 2 + columnGap + padding * 2;
        const totalHeight = maxItemsPerColumn * lineHeight + padding * 2;

        // 繪製背景
        ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
        ctx.strokeStyle = '#CCCCCC';
        ctx.lineWidth = 1;

        this.roundRect(ctx, x, y, totalWidth, totalHeight, 8);
        ctx.fill();
        ctx.stroke();

        let currentYLeft = y + padding;
        let currentYRight = y + padding;
        const rightX = x + padding + columnWidth + columnGap;

        leftSections.forEach(section => {
            this.drawLegendSection(ctx, section, x + padding, currentYLeft,
                lineWidth, lineHeight, titleFontSize, fontSize);
            currentYLeft += (section.items.length + 1.5) * lineHeight;
        });
        rightSections.forEach(section => {
            this.drawLegendSection(ctx, section, rightX, currentYRight,
                lineWidth, lineHeight, titleFontSize, fontSize);
            currentYRight += (section.items.length + 1.5) * lineHeight;
        });
    }

    /**
     * 繪製圖例區塊
     */
    drawLegendSection(ctx, sectionData, x, startY, lineWidth, lineHeight, titleFontSize, fontSize) {
        ctx.fillStyle = '#333333';
        ctx.font = `bold ${titleFontSize}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
        ctx.fillText(sectionData.title, x, startY + titleFontSize);

        let currentY = startY + lineHeight * 1.2;

        sectionData.items.forEach(item => {
            // 呼叫統一的線條繪製函數
            const startX = x;
            const endX = x + lineWidth;
            const lineY = currentY + lineHeight / 2 - 4; // 稍微調整垂直位置

            // 設置樣式（圓角線帽/轉角 — 與畫布及側欄圖例一致）
            ctx.save();
            ctx.strokeStyle = item.color;
            ctx.fillStyle = item.color;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (item.style === 'double') {
                this.drawDoubleLine(startX, lineY, endX, lineY, 4);
            } else if (item.style === 'triple') {
                this.drawTripleLine(startX, lineY, endX, lineY, 3);
            } else if (item.style === 'zigzag') {
                this.drawZigzagLine(startX, lineY, endX, lineY);
            } else if (item.style === 'wave') {
                // [一致化] 有末端箭頭時，波浪先收斂成直線再接箭頭（同 canvas endMargin），
                // 避免波浪穿過箭頭
                if (item.decoration && /arrow/.test(item.decoration)) {
                    this.drawWaveLine(startX, lineY, endX - 12, lineY);
                    ctx.beginPath();
                    ctx.moveTo(endX - 12, lineY);
                    ctx.lineTo(endX, lineY);
                    ctx.stroke();
                } else {
                    this.drawWaveLine(startX, lineY, endX, lineY);
                }
            } else if (item.style === 'double-wave') {
                this.drawWaveLine(startX, lineY - 2, endX, lineY - 2);
                this.drawWaveLine(startX, lineY + 2, endX, lineY + 2);
            } else if (item.style === 'conflict-close') {
                // 綠色實線 + 紅色鋸齒（綠色同畫布 #4caf50）
                ctx.strokeStyle = '#4caf50';
                ctx.beginPath();
                ctx.moveTo(startX, lineY - 3);
                ctx.lineTo(endX, lineY - 3);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(startX, lineY + 3);
                ctx.lineTo(endX, lineY + 3);
                ctx.stroke();

                ctx.strokeStyle = '#E53935';
                this.drawZigzagLine(startX, lineY, endX, lineY);
            } else if (item.style === 'close-hostile') {
                // 灰色雙線 + 紅色鋸齒
                ctx.strokeStyle = '#757575';
                ctx.beginPath();
                ctx.moveTo(startX, lineY - 3);
                ctx.lineTo(endX, lineY - 3);
                ctx.moveTo(startX, lineY + 3);
                ctx.lineTo(endX, lineY + 3);
                ctx.stroke();

                ctx.strokeStyle = '#E53935';
                this.drawZigzagLine(startX, lineY, endX, lineY);
            } else if (item.style === 'fused-hostile') {
                // 灰色雙線 + 紅色鋸齒 (same as close-hostile visually)
                ctx.strokeStyle = '#757575';
                ctx.beginPath();
                ctx.moveTo(startX, lineY - 4);
                ctx.lineTo(endX, lineY - 4);
                ctx.moveTo(startX, lineY + 4);
                ctx.lineTo(endX, lineY + 4);
                ctx.stroke();

                ctx.strokeStyle = '#E53935';
                this.drawZigzagLine(startX, lineY, endX, lineY);
            } else if (item.style === 'physical-abuse') {
                // 藍色波浪 + 黑色直線
                ctx.strokeStyle = '#007BFF';
                this.drawWaveLine(startX, lineY, endX, lineY);
                ctx.strokeStyle = '#000000';
                ctx.beginPath();
                ctx.moveTo(startX, lineY);
                ctx.lineTo(endX, lineY);
                ctx.stroke();
            } else if (item.style === 'emotional-abuse') {
                // 藍色鋸齒 + 黑色直線
                ctx.strokeStyle = '#007BFF';
                this.drawZigzagLine(startX, lineY, endX, lineY);
                ctx.strokeStyle = '#000000';
                ctx.beginPath();
                ctx.moveTo(startX, lineY);
                ctx.lineTo(endX, lineY);
                ctx.stroke();
            } else if (item.style === 'sexual-abuse') {
                // 藍色雙鋸齒
                ctx.strokeStyle = '#007BFF';
                this.drawZigzagLine(startX, lineY - 3, endX, lineY - 3);
                this.drawZigzagLine(startX, lineY + 3, endX, lineY + 3);
            } else {
                // 一般實線或虛線
                ctx.beginPath();
                if (item.style === 'dashed') ctx.setLineDash(item.pattern || DASH_PATTERNS.legendDash);
                if (item.style === 'dotted') ctx.setLineDash(item.pattern || DASH_PATTERNS.legendDot);
                ctx.moveTo(startX, lineY);
                ctx.lineTo(endX, lineY);
                ctx.stroke();
                ctx.setLineDash(DASH_PATTERNS.solid);
            }

            // 繪製裝飾
            const midX = (startX + endX) / 2;

            if (item.decoration === 'house') {
                this.drawHouse(midX, lineY + 4); // +4 offset adjustment for house base
            } else if (item.decoration === 'single-slash') {
                this.drawSlash(midX, lineY);
            } else if (item.decoration === 'double-slash') {
                this.drawDoubleSlash(midX, lineY);
            } else if (item.decoration === 'divorce-slash') {
                this.drawDivorceSlash(midX, lineY);
            } else if (item.decoration === 'x') {
                // Force Red for X decoration (Manipulative uses black line with red X)
                ctx.save();
                if (item.color === '#000000') {
                    ctx.strokeStyle = '#E53935';
                }
                this.drawX(midX, lineY);
                ctx.restore();
            } else if (item.decoration === 'circle') {
                ctx.beginPath();
                ctx.arc(midX, lineY, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
                ctx.stroke();
            } else if (item.decoration === 'double-circle') {
                // 兩個相交空心圓（同 canvas decoration double-circle）
                ctx.beginPath();
                ctx.arc(midX - 2.5, lineY, 3.5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(midX + 2.5, lineY, 3.5, 0, Math.PI * 2);
                ctx.stroke();
            } else if (item.decoration === 'arrow') {
                // 末端箭頭
                this.drawArrow(startX, lineY, endX, lineY, true);
            } else if (item.decoration === 'circle-arrow') {
                // 崇拜: 末端圓圈+箭頭
                ctx.beginPath();
                ctx.arc(midX, lineY, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
                ctx.stroke();
                this.drawArrow(startX, lineY, endX, lineY, true);
            } else if (item.decoration === 'double-bar') {
                // 疏離/敵對的雙豎線
                const barSize = 8;
                ctx.beginPath();
                ctx.moveTo(midX - 2, lineY - 4);
                ctx.lineTo(midX - 2, lineY + 4);
                ctx.moveTo(midX + 2, lineY - 4);
                ctx.lineTo(midX + 2, lineY + 4);
                ctx.stroke();
            } else if (item.decoration === 'box-cross-arrow') {
                // 控制: 中間Box+Cross, 末端箭頭
                ctx.beginPath();
                ctx.rect(midX - 4, lineY - 4, 8, 8);
                ctx.fillStyle = '#fff';
                ctx.fill();
                ctx.stroke();
                // Cross
                ctx.beginPath();
                ctx.moveTo(midX - 4, lineY - 4);
                ctx.lineTo(midX + 4, lineY + 4);
                ctx.moveTo(midX + 4, lineY - 4);
                ctx.lineTo(midX - 4, lineY + 4);
                ctx.stroke();
                this.drawArrow(startX, lineY, endX, lineY, true);
            } else if (item.decoration === 'x-arrow') {
                // 忽視
                const barSize = 8;
                ctx.beginPath();
                ctx.moveTo(midX, lineY - 4);
                ctx.lineTo(midX, lineY + 4);
                ctx.stroke();
                this.drawArrow(startX, lineY, endX, lineY, true);
            } else if (item.decoration === 'double-arrow-red') {
                // 操控
                this.drawArrow(startX, lineY, endX, lineY, true);
            } else if (item.decoration === 'box') {
                // 身體虐待
                ctx.beginPath();
                ctx.rect(midX - 4, lineY - 4, 8, 8);
                ctx.fillStyle = '#fff';
                ctx.fill();
                ctx.stroke();
            } else if (item.decoration === 'wave-decoration') {
                // 情緒虐待 - wave 已在 line style 處理，這裡可能是額外裝飾？
                // 暫不處理，或畫個小波浪
            } else if (item.decoration === 'arrow-bar') {
                // 忽視 (Neglect): 箭頭 + 黑色豎線（豎線位於箭頭基部，同 canvas arrow-bar）
                this.drawArrow(startX, lineY, endX, lineY, true);
                ctx.save();
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(endX - 10, lineY - 5);
                ctx.lineTo(endX - 10, lineY + 5);
                ctx.stroke();
                ctx.restore();
            }

            ctx.restore();

            // 繪製文字
            ctx.fillStyle = '#333333';
            ctx.font = `${fontSize}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
            ctx.fillText(item.label, x + lineWidth + 12, currentY + lineHeight / 2 + fontSize / 2);

            currentY += lineHeight;
        });
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
                rel.linkType || '', rel.routeMode || ''
            ])
            .sort((a, b) => a[0].localeCompare(b[0]));
        return JSON.stringify([this.personSize, this.fontSize, this.fontFamily, personData, relationshipData]);
    }

    prepareDerivedGeometry(persons, relationships, { force = false } = {}) {
        const allPersons = Array.isArray(persons) ? persons : [];
        const allRelationships = Array.isArray(relationships) ? relationships : [];
        const signature = this._getFamilyRouteSignature(allPersons, allRelationships);
        if (!(this.personMap instanceof Map)
            || allPersons.some(person => this.personMap.get(person.id) !== person)) {
            this.personMap = new Map(allPersons.map(person => [person.id, person]));
        }
        if (!force && signature === this._derivedGeometrySignature) return;
        this._derivedGeometrySignature = signature;
        this.personLabelPlacements = new Map();
        this.marriageRouteCache = new Map();
        this.labelRoutingWarnings = [];
        this._placeLabelsForForcedStraight(allPersons, allRelationships);
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
        return [{ side: 'left' }, { side: 'right' }].map(placement => ({
            placement,
            geometry: this.getPersonLabelGeometry(person,
                { showNames: true, showNotes: true }, placement)
        }));
    }

    _placeLabelsForForcedStraight(persons, relationships) {
        if (typeof FamilyRoutePlanner === 'undefined') return;
        const sortedPeople = [...persons]
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
        const defaultBounds = new Map(sortedPeople.map(person => [String(person.id),
            this.getPersonLabelGeometry(person,
                { showNames: true, showNotes: true }, { side: 'below' }).bounds]));
        const straightRoutes = relationships
            .filter(rel => Relationship.getCategory(rel.type) === 'marriage'
                && (rel.routeMode || 'auto') === 'straight')
            .map(rel => {
                const from = this.personMap.get(rel.fromPersonId);
                const to = this.personMap.get(rel.toPersonId);
                if (!from || !to) return null;
                const config = this.getMarriageConfiguration(from, to, rel, relationships);
                return { rel, points: this.getMarriageGeometry(from, to, config).points };
            }).filter(Boolean);
        if (straightRoutes.length === 0) return;

        const symbolObstacles = this.getSymbolRouteObstacles(sortedPeople);
        const placedBounds = new Map();
        sortedPeople.forEach(person => {
            const personKey = String(person.id);
            const below = this.getPersonLabelGeometry(person,
                { showNames: true, showNotes: true }, { side: 'below' });
            if (!below.bounds
                || !straightRoutes.some(route => this._pathHitsRect(route.points, below.bounds))) {
                if (below.bounds) placedBounds.set(personKey, below.bounds);
                return;
            }
            const otherLabelObstacles = sortedPeople
                .filter(other => String(other.id) !== personKey)
                .map(other => {
                    const bounds = placedBounds.get(String(other.id))
                        || defaultBounds.get(String(other.id));
                    return bounds ? { ownerId: other.id, ...bounds } : null;
                })
                .filter(Boolean);
            const candidates = this._labelPlacementCandidates(person).map((candidate, order) => {
                const rect = candidate.geometry.bounds;
                const routeHits = straightRoutes.reduce((sum, route) =>
                    sum + (this._pathHitsRect(route.points, rect) ? 1 : 0), 0);
                const obstacleHits = [...symbolObstacles, ...otherLabelObstacles]
                    .reduce((sum, obstacle) => sum
                        + (String(obstacle.ownerId) !== personKey
                            && this._rectsOverlap(rect, obstacle) ? 1 : 0), 0);
                return { ...candidate, order, collisions: routeHits + obstacleHits };
            }).sort((a, b) => a.collisions - b.collisions || a.order - b.order);
            const winner = candidates[0];
            if (!winner) return;
            this.personLabelPlacements.set(personKey, winner.placement);
            placedBounds.set(personKey, winner.geometry.bounds);
            if (winner.collisions > 0) {
                this.labelRoutingWarnings.push({
                    personId: person.id,
                    reason: 'forced-straight-label-collision',
                    collisions: winner.collisions
                });
            }
        });
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
                const config = this.getMarriageConfiguration(p1, p2, marriageRel, otherRels);
                let minX;
                let maxX;
                let y;
                if (config.isBridge) {
                    const top1 = p1.getConnectionPoint('top');
                    const top2 = p2.getConnectionPoint('top');
                    minX = Math.min(top1.x, top2.x);
                    maxX = Math.max(top1.x, top2.x);
                    y = config.bridgeY;
                } else if (config.isArch) {
                    minX = Math.min(p1.x, p2.x);
                    maxX = Math.max(p1.x, p2.x);
                    y = config.archBarY;
                } else {
                    const leftParent = p1.x <= p2.x ? p1 : p2;
                    const rightParent = p1.x <= p2.x ? p2 : p1;
                    const leftPort = leftParent.getConnectionPoint('right');
                    const rightPort = rightParent.getConnectionPoint('left');
                    minX = Math.min(leftPort.x, rightPort.x);
                    maxX = Math.max(leftPort.x, rightPort.x);
                    y = (p1.y + p2.y) / 2;
                }
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

    getFamilyRoutePlans(familyRels, persons, otherRels, kinship = null) {
        const allPersons = Array.isArray(persons) ? persons : [];
        const allRelationships = [...(familyRels || []), ...(otherRels || [])];
        if (typeof FamilyRoutePlanner === 'undefined') return [];
        const signature = this._getFamilyRouteSignature(allPersons, allRelationships);
        if (signature === this._familyRouteSignature && Array.isArray(this._familyRoutePlans)) {
            return this._familyRoutePlans;
        }
        if (!(this.personMap instanceof Map) || allPersons.some(person => !this.personMap.has(person.id))) {
            this.personMap = new Map(allPersons.map(person => [person.id, person]));
        }
        const engine = kinship || new KinshipEngine(allPersons, allRelationships);
        const obstacles = this.getPersonRouteObstacles(allPersons);
        const groups = this._buildFamilyGroups(familyRels || [], engine);
        const relationshipPaths = new Map();
        const nextFamilyPlanCache = new Map();
        const allObstacleSignature = this._getRouteObstacleSignature(obstacles);

        const plans = groups.map(group => {
            const parentObjs = group.parentIds.map(id => this.personMap.get(id)).filter(Boolean);
            const childObjs = group.childIds.map(id => this.personMap.get(id)).filter(Boolean);
            if (parentObjs.length === 0 || childObjs.length === 0) return null;
            const sourceInfo = this._getFamilySource(parentObjs, childObjs, otherRels || [], obstacles);
            const relevantObstacles = this._getRelevantFamilyRouteObstacles(
                obstacles, parentObjs, childObjs, sourceInfo
            );
            const localSignature = this._getFamilyPlanCacheSignature(
                group, parentObjs, childObjs, sourceInfo, relevantObstacles
            );
            const planInput = {
                parents: parentObjs,
                children: childObjs,
                source: sourceInfo.source,
                sourceRange: sourceInfo.sourceRange,
                sourcePrefix: sourceInfo.sourcePrefix,
                obstacles: relevantObstacles,
                personSize: this.personSize,
                margin: 10
            };
            const cached = this._familyPlanCache.get(group.key);
            let plan = null;
            let cacheSignature = localSignature;
            if (cached && cached.plan) {
                const expectedSignature = cached.plan.safe
                    ? localSignature
                    : `${localSignature}|${allObstacleSignature}`;
                if (cached.signature === expectedSignature) {
                    plan = cached.plan;
                    cacheSignature = expectedSignature;
                }
            }
            if (!plan) {
                plan = FamilyRoutePlanner.planFamily(planInput);
                if (!plan.safe && relevantObstacles.length !== obstacles.length) {
                    plan = FamilyRoutePlanner.planFamily({ ...planInput, obstacles });
                }
                if (!plan.safe) {
                    cacheSignature = `${localSignature}|${allObstacleSignature}`;
                }
            }
            nextFamilyPlanCache.set(group.key, { signature: cacheSignature, plan });
            plan.family = {
                key: group.key,
                parentIds: [...group.parentIds],
                childIds: [...group.childIds],
                relIds: [...group.relIds],
                childToRelIds: group.childToRelIds,
                pairToRelIds: group.pairToRelIds,
                virtualPair: sourceInfo.virtualPair
            };
            group.parentIds.forEach(parentId => {
                group.childIds.forEach(childId => {
                    const path = plan.relationshipPaths[`${parentId}->${childId}`];
                    const relIds = group.pairToRelIds[`${parentId}\u0000${childId}`] || [];
                    if (!path) return;
                    relIds.forEach(relId => relationshipPaths.set(relId, path.map(point => ({ ...point }))));
                });
            });
            return plan;
        }).filter(Boolean);

        this._familyPlanCache = nextFamilyPlanCache;
        this._familyRoutePlans = plans;
        this._familyRelationshipPaths = relationshipPaths;
        this._familyRouteSignature = signature;
        return plans;
    }

    findSafeFamilyRouteAdjustment(personId, offsets, persons, relationships) {
        const allPersons = Array.isArray(persons) ? persons : [];
        const allRelationships = Array.isArray(relationships) ? relationships : [];
        const person = this.personMap instanceof Map ? this.personMap.get(personId) : null;
        if (!person || typeof FamilyRoutePlanner === 'undefined') {
            return { dx: 0, beforeUnsafe: 0, afterUnsafe: 0 };
        }

        const familyRels = [];
        const otherRels = [];
        allRelationships.forEach(rel => {
            const category = typeof rel.getCategory === 'function'
                ? rel.getCategory()
                : Relationship.getCategory(rel.type);
            (category === 'family' ? familyRels : otherRels).push(rel);
        });
        const engine = new KinshipEngine(allPersons, allRelationships);
        const unsafeCount = () => this.getFamilyRoutePlans(familyRels, allPersons, otherRels, engine)
            .filter(plan =>
                (plan.family.parentIds.includes(personId) || plan.family.childIds.includes(personId)) && !plan.safe
            ).length;

        const originalX = person.x;
        const beforeUnsafe = unsafeCount();
        let best = { dx: 0, beforeUnsafe, afterUnsafe: beforeUnsafe };
        if (beforeUnsafe > 0) {
            for (const dx of Array.isArray(offsets) ? offsets : []) {
                if (!Number.isFinite(dx) || dx === 0) continue;
                const candidateX = originalX + dx;
                const occupied = allPersons.some(other =>
                    other.id !== personId &&
                    Math.abs(other.x - candidateX) < this.personSize + 10 &&
                    Math.abs(other.y - person.y) < this.personSize + 10
                );
                if (occupied) continue;
                person.x = candidateX;
                const candidateUnsafe = unsafeCount();
                if (candidateUnsafe < best.afterUnsafe) {
                    best = { dx, beforeUnsafe, afterUnsafe: candidateUnsafe };
                    if (candidateUnsafe === 0) break;
                }
            }
        }

        person.x = originalX;
        unsafeCount(); // 還原目前座標對應的繪製／命中快取
        return best;
    }

    _getPlannedFamilyRelationshipPath(relationship, allRelationships) {
        if (typeof FamilyRoutePlanner === 'undefined') return null;
        const persons = Array.isArray(this.lastPersons) ? this.lastPersons : [];
        const relationships = Array.isArray(allRelationships) && allRelationships.length > 0
            ? allRelationships
            : (Array.isArray(this.lastRelationships) ? this.lastRelationships : []);
        const signature = this._getFamilyRouteSignature(persons, relationships);
        if (signature !== this._familyRouteSignature || !this._familyRelationshipPaths.has(relationship.id)) {
            const familyRels = [];
            const otherRels = [];
            relationships.forEach(rel => {
                const category = typeof rel.getCategory === 'function'
                    ? rel.getCategory()
                    : Relationship.getCategory(rel.type);
                (category === 'family' ? familyRels : otherRels).push(rel);
            });
            this.getFamilyRoutePlans(familyRels, persons, otherRels, new KinshipEngine(persons, relationships));
        }
        const path = this._familyRelationshipPaths.get(relationship.id);
        return path ? path.map(point => ({ ...point })) : null;
    }

    _getFamilyLinkDash(relIds, relById) {
        let linkType = 'biological';
        for (const relId of relIds || []) {
            const rel = relById.get(relId);
            if (!rel) continue;
            if (rel.linkType === 'foster') return DASH_PATTERNS.cohabit;
            if (rel.linkType === 'adopted') linkType = 'adopted';
        }
        return linkType === 'adopted' ? DASH_PATTERNS.engaged : DASH_PATTERNS.solid;
    }

    _strokeFamilyPolyline(points, dash = DASH_PATTERNS.solid) {
        if (!Array.isArray(points) || points.length < 2) return;
        this.ctx.setLineDash(dash);
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let index = 1; index < points.length; index++) {
            this.ctx.lineTo(points[index].x, points[index].y);
        }
        this.ctx.stroke();
    }

    _drawFamilyPlan(plan, relById, selectedRelationshipId) {
        const family = plan.family;
        if (family.virtualPair && family.parentIds.length >= 2) {
            const p1 = this.personMap.get(family.parentIds[0]);
            const p2 = this.personMap.get(family.parentIds[1]);
            if (p1 && p2) {
                this.ctx.save();
                this.ctx.strokeStyle = '#f0f0f0';
                this._strokeFamilyPolyline([{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }], DASH_PATTERNS.fosterLink);
                this.ctx.restore();
            }
        }

        const selectedPath = selectedRelationshipId
            ? this._familyRelationshipPaths.get(selectedRelationshipId)
            : null;
        if (selectedPath && family.relIds.includes(selectedRelationshipId)) {
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(74, 144, 217, 0.3)';
            this.ctx.lineWidth = 10;
            this._strokeFamilyPolyline(selectedPath, DASH_PATTERNS.solid);
            this.ctx.restore();
        }

        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2;
        const pairwise = plan.mode === 'reversed' || plan.mode === 'same-row';
        if (pairwise) {
            family.parentIds.forEach(parentId => {
                family.childIds.forEach(childId => {
                    const relIds = family.pairToRelIds[`${parentId}\u0000${childId}`] || [];
                    const path = plan.relationshipPaths[`${parentId}->${childId}`];
                    if (relIds.length > 0) this._strokeFamilyPolyline(path, this._getFamilyLinkDash(relIds, relById));
                });
            });
        } else {
            const singleChildDash = family.childIds.length === 1
                ? this._getFamilyLinkDash(family.childToRelIds[family.childIds[0]], relById)
                : DASH_PATTERNS.solid;
            this._strokeFamilyPolyline(plan.sourcePath, singleChildDash);
            this._strokeFamilyPolyline(plan.barPath, DASH_PATTERNS.solid);
            family.childIds.forEach(childId => {
                this._strokeFamilyPolyline(
                    plan.childPaths[childId],
                    this._getFamilyLinkDash(family.childToRelIds[childId], relById)
                );
            });
            plan.twinGroups.forEach(group => {
                if (group.monoBar) this._strokeFamilyPolyline(group.monoBar, DASH_PATTERNS.solid);
            });
        }

        if (selectedPath && family.relIds.includes(selectedRelationshipId)) {
            this.ctx.save();
            this.ctx.strokeStyle = '#4a90d9';
            this.ctx.lineWidth = 4;
            this._strokeFamilyPolyline(selectedPath, DASH_PATTERNS.solid);
            this.ctx.restore();
        }
        this.ctx.setLineDash(DASH_PATTERNS.solid);
    }

    /**
     * 繪製家庭樹狀結構；正式路徑由 FamilyRoutePlanner 統一計算。
     */
    drawFamilies(familyRels, persons, otherRels, selectedRelationshipId = null, kinship = null) {
        if (typeof FamilyRoutePlanner === 'undefined') {
            return this._drawFamiliesLegacy(familyRels, persons, otherRels, selectedRelationshipId, kinship);
        }
        const engine = kinship || new KinshipEngine(persons, [...familyRels, ...otherRels]);
        const relById = new Map(familyRels.map(rel => [rel.id, rel]));
        const plans = this.getFamilyRoutePlans(familyRels, persons, otherRels, engine);
        this.ctx.save();
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        plans.forEach(plan => this._drawFamilyPlan(plan, relById, selectedRelationshipId));
        this.ctx.restore();
    }

    /**
     * 舊版家庭幾何只保留為依賴載入失敗時的降級路徑。
     */
    _drawFamiliesLegacy(familyRels, persons, otherRels, selectedRelationshipId = null, kinship = null) {
        // 若未提供 kinship（例如外部直接呼叫），就地建立以保持函式可獨立使用
        if (!kinship) kinship = new KinshipEngine(persons, familyRels);
        // [Phase 1] relId -> relationship，供推導每個子女的 linkType（親生/收養/寄養）以決定下行線型
        const relById = new Map(familyRels.map(r => [r.id, r]));

        // [精緻化] 家庭結構線一律圓角端點/轉角；匯出共用此函式，螢幕與存檔一致
        // save/restore 包住整個函式，避免 round cap/join 洩漏到後續的人物符號繪製
        this.ctx.save();
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // 1. 整理每個孩子的父母
        const childParents = {}; // childId -> [parentId, parentId]
        // 同時建立 child-parent 對應到關係 ID 的映射
        const childParentRelMap = {}; // `${childId}_${parentId}` -> relId

        familyRels.forEach(rel => {
            // 方向判斷統一由 KinshipEngine 處理（from=parent, to=child）
            const pc = kinship.normalizeParentChild(rel);
            if (!pc) return;
            const { parentId, childId } = pc;

            if (!childParents[childId]) childParents[childId] = [];
            if (!childParents[childId].includes(parentId)) {
                childParents[childId].push(parentId);
            }
            // 記錄關係 ID
            childParentRelMap[`${childId}_${parentId}`] = rel.id;
        });

        // 2. 依照父母組合分組家庭
        const families = {}; // key -> { parents: [], children: [], relIds: [], childToRelIds: {} }

        Object.keys(childParents).forEach(childId => {
            const parents = childParents[childId].sort();
            const key = parents.join('_');

            if (!families[key]) {
                families[key] = { parents: parents, children: [], relIds: [], childToRelIds: {} };
            }
            families[key].children.push(childId);

            // 收集這個家庭涉及的所有關係 ID，並記錄每個子女對應的關係 ID
            families[key].childToRelIds[childId] = [];
            parents.forEach(parentId => {
                const relId = childParentRelMap[`${childId}_${parentId}`];
                if (relId) {
                    if (!families[key].relIds.includes(relId)) {
                        families[key].relIds.push(relId);
                    }
                    families[key].childToRelIds[childId].push(relId);
                }
            });
        });

        // 3. 繪製
        Object.values(families).forEach(fam => {
            const parentIds = fam.parents;
            const childIds = fam.children;
            const relIds = fam.relIds;
            const childToRelIds = fam.childToRelIds;

            // 找出被選中關係對應的子女ID (如果有的話)
            let selectedChildId = null;
            if (selectedRelationshipId && relIds.includes(selectedRelationshipId)) {
                // 找出哪個子女的關係被選中
                for (const [childId, childRelIds] of Object.entries(childToRelIds)) {
                    if (childRelIds.includes(selectedRelationshipId)) {
                        selectedChildId = childId;
                        break;
                    }
                }
            }

            // 取得物件
            const parentObjs = parentIds.map(id => this.personMap.get(id)).filter(p => p);
            const childObjs = childIds.map(id => this.personMap.get(id)).filter(p => p);

            if (parentObjs.length === 0 || childObjs.length === 0) return;

            // 設置預設線條樣式 (不選中時)
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash(DASH_PATTERNS.solid); // 實線

            // [Fix] 反轉輩分偵測：當 children 平均 Y 不大於 parents 平均 Y（子女被拖到父母上方或同高），
            // trunk 結構會因 barY clamp 推到父母下方而穿透節點。改為每對 parent-child 單獨畫 L 形：
            // parent.top → (中點水平) → child.bottom，不走 trunk。
            const parentsAvgY = parentObjs.reduce((s, p) => s + p.y, 0) / parentObjs.length;
            const childrenAvgY = childObjs.reduce((s, c) => s + c.y, 0) / childObjs.length;
            if (childrenAvgY <= parentsAvgY) {
                childObjs.forEach(child => {
                    const isSel = selectedChildId === child.id;
                    parentObjs.forEach(parent => {
                        const fromPt = parent.getConnectionPoint('top');
                        const toPt = child.getConnectionPoint('bottom');
                        const midY = (fromPt.y + toPt.y) / 2;
                        if (isSel) {
                            this.ctx.save();
                            this.ctx.strokeStyle = 'rgba(74, 144, 217, 0.3)';
                            this.ctx.lineWidth = 10;
                            this.ctx.beginPath();
                            this.ctx.moveTo(fromPt.x, fromPt.y);
                            this.ctx.lineTo(fromPt.x, midY);
                            this.ctx.lineTo(toPt.x, midY);
                            this.ctx.lineTo(toPt.x, toPt.y);
                            this.ctx.stroke();
                            this.ctx.restore();
                        }
                        this.ctx.beginPath();
                        this.ctx.moveTo(fromPt.x, fromPt.y);
                        this.ctx.lineTo(fromPt.x, midY);
                        this.ctx.lineTo(toPt.x, midY);
                        this.ctx.lineTo(toPt.x, toPt.y);
                        this.ctx.stroke();
                    });
                });
                return;  // 跳過正常 trunk 繪製
            }

            let sourceX, sourceY;
            let sourceAnchorX = null; // 父母關係線上的實際掛接點 X

            if (parentObjs.length >= 2) {
                // 雙親：尋找婚姻關係以確定起點
                const p1 = parentObjs[0];
                const p2 = parentObjs[1];

                // 檢查兩者是否有婚姻/結構關係
                const marriageRel = otherRels.find(r =>
                    r.involvesPerson(p1.id) && r.involvesPerson(p2.id) &&
                    (typeof r.getCategory === 'function' ? r.getCategory() : Relationship.getCategory(r.type)) === 'marriage'
                );

                if (marriageRel) {
                    // [New] 根據天橋配置決定起點
                    const config = this.getMarriageConfiguration(p1, p2, marriageRel, otherRels);
                    const childrenCenterX = childObjs.reduce((sum, c) => sum + c.x, 0) / childObjs.length;
                    // 單一子女時，主幹直接對齊該子女，確保連線垂直
                    const desiredSourceX = childObjs.length === 1 ? childObjs[0].x : childrenCenterX;

                    if (config.isBridge) {
                        // [Fix] 天橋模式：sourceX 使用子女中心，但限制在天橋「實際水平段」範圍
                        const top1 = p1.getConnectionPoint('top');
                        const top2 = p2.getConnectionPoint('top');
                        const minMarriageX = Math.min(top1.x, top2.x);
                        const maxMarriageX = Math.max(top1.x, top2.x);
                        sourceAnchorX = Math.max(minMarriageX, Math.min(maxMarriageX, desiredSourceX));
                        sourceX = sourceAnchorX;
                        sourceY = config.bridgeY;
                    } else if (config.isArch) {
                        // [Phase 2A.1] ㄩ 下折越障：婚姻線在 archBarY（列下方），子女掛在下折橫桿上，
                        // 與 getMarriageGeometry 共用 config.archBarY → 子女線連到實際婚姻線、不浮空。
                        // 跨距用「正下方中心」連接點 X（= 父母 x，與 arch 垂直腿同 X）。
                        const minMarriageX = Math.min(p1.x, p2.x);
                        const maxMarriageX = Math.max(p1.x, p2.x);
                        sourceAnchorX = Math.max(minMarriageX, Math.min(maxMarriageX, desiredSourceX));
                        sourceX = sourceAnchorX;
                        sourceY = config.archBarY;
                    } else {
                        // [Fix] 一般婚姻：限制在婚姻線「可見端點」(右側連接點 ~ 左側連接點) 之間
                        const leftParent = p1.x <= p2.x ? p1 : p2;
                        const rightParent = p1.x <= p2.x ? p2 : p1;
                        const marriageStartX = leftParent.getConnectionPoint('right').x;
                        const marriageEndX = rightParent.getConnectionPoint('left').x;
                        const minMarriageX = Math.min(marriageStartX, marriageEndX);
                        const maxMarriageX = Math.max(marriageStartX, marriageEndX);
                        sourceAnchorX = Math.max(minMarriageX, Math.min(maxMarriageX, desiredSourceX));
                        sourceX = sourceAnchorX;
                        sourceY = (p1.y + p2.y) / 2;
                    }

                } else {
                    // 無婚姻線，假定為共同父母
                    // 畫一條輕微的隱形連接線 (極淺色虛線)，用於標示子代起源，避免與正式關係線混淆
                    this.ctx.save();
                    this.ctx.strokeStyle = '#f0f0f0';
                    this.ctx.setLineDash(DASH_PATTERNS.fosterLink);
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                    this.ctx.restore();

                    // 恢復預設樣式
                    this.ctx.strokeStyle = '#333';
                    this.ctx.lineWidth = 2;
                    this.ctx.setLineDash(DASH_PATTERNS.solid);

                    sourceX = (p1.x + p2.x) / 2;
                    sourceAnchorX = sourceX;
                    sourceY = (p1.y + p2.y) / 2;
                }
            } else {
                // 單親
                const p = parentObjs[0];
                sourceX = p.x;
                sourceAnchorX = sourceX;
                sourceY = this._labelBottomY(p);
            }

            if (sourceAnchorX === null) {
                sourceAnchorX = sourceX;
            }

            // [Fix] 確保 sourceY 在所有父母備註之下 (避免線條穿過備註)
            // 先記錄原始連接點 (婚姻線中心或人物底部)
            const originalSourceY = sourceY;

            parentObjs.forEach(p => {
                const parentBottom = this._labelBottomY(p);
                if (sourceY < parentBottom) {
                    sourceY = parentBottom;
                }
            });

            // 計算孩子的高度 (Bar Y position)
            const childrenMinY = Math.min(...childObjs.map(c => c.y));

            // 垂直線終點 (Bar Y)
            let barY = (sourceY + (childrenMinY - this.personSize / 2)) / 2;

            // 防呆
            if (barY < sourceY + 20) barY = sourceY + 20;
            if (barY > childrenMinY - 20) barY = childrenMinY - 20;
            // 如果過於靠近，強制往下
            if (sourceY >= childrenMinY - 10) {
                barY = sourceY + 30;
            }

            // [防超出] 子女垂直線端點：bar 低於子女符號下緣時改接下緣，
            // 拖曳途中線條不會穿過符號再伸出去（一般情況仍接上緣）
            const childDropEndY = (child) => {
                const top = child.y - this.personSize / 2;
                const bottom = child.y + this.personSize / 2;
                return barY >= bottom ? bottom : top;
            };

            // 如果有選中特定子女關係，先繪製該子女的高亮效果
            if (selectedChildId) {
                const selectedChild = childObjs.find(c => c.id === selectedChildId);
                if (selectedChild) {
                    this.ctx.save();
                    this.ctx.strokeStyle = 'rgba(74, 144, 217, 0.3)';
                    this.ctx.lineWidth = 10;
                    this.ctx.lineCap = 'round';
                    this.ctx.lineJoin = 'round';

                    const childEndY = childDropEndY(selectedChild);
                    this.ctx.beginPath();

                    // 單一子女時，整條垂直線都可視為同一條子女線（避免只亮短段）
                    if (childObjs.length === 1 && Math.abs(sourceX - selectedChild.x) < 0.5) {
                        this.ctx.moveTo(selectedChild.x, sourceY);
                        this.ctx.lineTo(selectedChild.x, childEndY);
                    } else {
                        // 多子女：高亮該子女分支（主幹 + 橫接 + 子女垂直）
                        this.ctx.moveTo(sourceX, sourceY);
                        this.ctx.lineTo(sourceX, barY);
                        if (Math.abs(selectedChild.x - sourceX) > 0.5) {
                            this.ctx.lineTo(selectedChild.x, barY);
                        }
                        this.ctx.lineTo(selectedChild.x, childEndY);
                    }

                    this.ctx.stroke();

                    this.ctx.restore();
                }
            }

            // === 多胞胎分組（需要先分組才能判斷是否需要畫垂直線）===
            const twinGroups = {};
            const nonTwins = [];

            childObjs.forEach(child => {
                if (child.twinGroup) {
                    if (!twinGroups[child.twinGroup]) {
                        twinGroups[child.twinGroup] = [];
                    }
                    twinGroups[child.twinGroup].push(child);
                } else {
                    nonTwins.push(child);
                }
            });

            // 判斷是否所有子女都是同一個多胞胎群組
            const allSameTwinGroup = childObjs.length > 0 &&
                nonTwins.length === 0 &&
                Object.keys(twinGroups).length === 1;

            // [Phase 1 修正] 單一子女時，主幹即「該子女的下行線」→ 整條套用其 linkType 線型（收養虛線/寄養點線）；
            // 多子女時主幹為共用幹線，維持實線（各子女各自的 drop 自帶 dash＝McGoldrick 正解）。
            let _trunkDash = DASH_PATTERNS.solid;
            if (childObjs.length === 1) {
                const _rids = childToRelIds[childObjs[0].id] || [];
                let _lk = 'biological';
                for (const _rid of _rids) {
                    const _r = relById.get(_rid);
                    if (!_r) continue;
                    if (_r.linkType === 'foster') { _lk = 'foster'; break; }
                    if (_r.linkType === 'adopted') _lk = 'adopted';
                }
                if (_lk === 'adopted') _trunkDash = DASH_PATTERNS.engaged;
                else if (_lk === 'foster') _trunkDash = DASH_PATTERNS.cohabit;
            }
            this.ctx.setLineDash(_trunkDash);

            // [Fix] 繪製從原始連接點到調整後 sourceY 的垂直線（如果全是多胞胎則跳過）
            if (!allSameTwinGroup && originalSourceY < sourceY) {
                this.ctx.beginPath();
                this.ctx.moveTo(sourceX, originalSourceY);
                this.ctx.lineTo(sourceX, sourceY);
                this.ctx.stroke();
            }

            // 繪製 Source -> Bar 的垂直線（如果全是多胞胎則跳過）
            if (!allSameTwinGroup) {
                this.ctx.beginPath();
                this.ctx.moveTo(sourceX, sourceY);
                if (barY > sourceY) {
                    this.ctx.lineTo(sourceX, barY);
                } else {
                    this.ctx.lineTo(sourceX, sourceY + 10);
                }
                this.ctx.stroke();
            }
            this.ctx.setLineDash(DASH_PATTERNS.solid); // 重置：後續橫槓/其他維持實線

            // 計算橫槓 X 範圍
            // 非雙胞胎：使用各自的 X 座標
            // 雙胞胎群組：使用群組中心點
            const barXPositions = [sourceX];

            // 非雙胞胎的 X 座標
            nonTwins.forEach(child => {
                barXPositions.push(child.x);
            });

            // 雙胞胎群組的中心 X 座標
            Object.values(twinGroups).forEach(twins => {
                if (twins.length >= 2) {
                    const leftmost = Math.min(...twins.map(t => t.x));
                    const rightmost = Math.max(...twins.map(t => t.x));
                    const centerX = (leftmost + rightmost) / 2;
                    barXPositions.push(centerX);
                } else {
                    // 單個人（不算雙胞胎）
                    twins.forEach(t => barXPositions.push(t.x));
                }
            });

            const minX = Math.min(...barXPositions);
            const maxX = Math.max(...barXPositions);

            // 如果不是全部都是多胞胎，才繪製橫槓（allSameTwinGroup 已在上面計算）
            if (!allSameTwinGroup) {
                this.ctx.beginPath();
                this.ctx.moveTo(minX, barY);
                this.ctx.lineTo(maxX, barY);
                this.ctx.stroke();
            }

            // 繪製多胞胎連接線
            // 如果所有子女都是多胞胎，V 形從婚姻線中心開始（originalSourceY）
            // 否則從 barY 開始
            Object.values(twinGroups).forEach(twins => {
                if (twins.length >= 2) {
                    // 使用 originalSourceY 讓 V 形直接連到婚姻線
                    const connectY = allSameTwinGroup ? originalSourceY : barY;
                    const connectX = allSameTwinGroup ? sourceX : null;
                    this.drawTwinConnector(twins, connectY, selectedChildId, connectX);
                }
            });

            // 繪製 Bar -> 每個孩子 的垂直線
            // 注意：多胞胎的連線已在 drawTwinConnector 中用 V 形處理
            childObjs.forEach(child => {
                const childEndY = childDropEndY(child);
                const isThisChildSelected = selectedChildId === child.id;

                // 如果是多胞胎且有有效群組，V 形連線已處理，跳過
                if (child.twinGroup) {
                    const twins = twinGroups[child.twinGroup];
                    if (twins && twins.length >= 2) {
                        return; // V 形已連接到子女頂部，不需要再畫
                    }
                }

                // 如果這個子女被選中，深藍色描出完整分支（避免只顯示短段）
                if (isThisChildSelected) {
                    this.ctx.save();
                    this.ctx.strokeStyle = '#4a90d9';
                    this.ctx.lineWidth = 4;
                    this.ctx.lineCap = 'round';
                    this.ctx.lineJoin = 'round';
                    this.ctx.beginPath();

                    if (childObjs.length === 1 && Math.abs(sourceX - child.x) < 0.5) {
                        // 單一子女：整條垂直到子女
                        this.ctx.moveTo(child.x, sourceY);
                        this.ctx.lineTo(child.x, childEndY);
                    } else {
                        // 多子女：主幹 + 橫接 + 子女垂直
                        this.ctx.moveTo(sourceX, sourceY);
                        if (barY > sourceY) {
                            this.ctx.lineTo(sourceX, barY);
                        } else {
                            this.ctx.lineTo(sourceX, sourceY + 10);
                        }
                        if (Math.abs(child.x - sourceX) > 0.5) {
                            this.ctx.lineTo(child.x, barY);
                        }
                        this.ctx.lineTo(child.x, childEndY);
                    }

                    this.ctx.stroke();
                    this.ctx.restore();
                    return;
                }

                // [Phase 1] 子女下行線型：收養=虛線、寄養=點線、親生=實線（McGoldrick）。
                // 任一條 parent→child 邊為非親生即採之（如繼親收養）；foster 優先於 adopted。
                // 僅套用在此「子女下行段」，不影響上方共用的主幹/手足橫桿；畫完即重置避免洩漏。
                let _link = 'biological';
                const _rids = childToRelIds[child.id] || [];
                for (const _rid of _rids) {
                    const _r = relById.get(_rid);
                    if (!_r) continue;
                    if (_r.linkType === 'foster') { _link = 'foster'; break; }
                    if (_r.linkType === 'adopted') _link = 'adopted';
                }
                if (_link === 'adopted') this.ctx.setLineDash(DASH_PATTERNS.engaged);
                else if (_link === 'foster') this.ctx.setLineDash(DASH_PATTERNS.cohabit);

                this.ctx.beginPath();
                this.ctx.moveTo(child.x, barY);
                this.ctx.lineTo(child.x, childEndY);
                this.ctx.stroke();

                if (_link !== 'biological') this.ctx.setLineDash(DASH_PATTERNS.solid);
            });
        });

        this.ctx.restore(); // 對應函式開頭的 save（round cap/join 不外漏）
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
     * 繪製同住家庭圈選
     * @param {Array} households - 家庭列表
     * @param {Array} persons - 人員列表
     * @param {boolean} applyTransformFlag - 是否應用變換（在匯出時通常為 false）
     * @param {string} selectedHouseholdId - 選中的圈選框 ID
     */
    drawHouseholds(households, persons, relationships = [], applyTransformFlag = true, selectedHouseholdId = null) {
        if (!households || households.length === 0) return;

        this.ctx.save();
        if (applyTransformFlag) {
            this.applyTransform(); // 應用縮放和平移（僅在正常渲染時）
        }
        this.ctx.setLineDash(DASH_PATTERNS.household); // 改為較密的虛線，在不同縮放比例下更容易看清
        this.ctx.lineWidth = 3;
        this.ctx.lineJoin = 'round';

        households.forEach(household => {
            const bounds = this.getHouseholdBounds(household, persons, relationships);
            if (!bounds || !bounds.hullPoints) return;

            const { hullPoints, minX, minY, maxX, maxY, width, height } = bounds;
            const isSelected = selectedHouseholdId === household.id;

            // 判斷是否應該使用狗骨頭形狀（膠囊狀）
            // [Fix] 僅限「單列成員」（成員 Y 跨距 < 60）：斜對角/多列成員若用膠囊，
            // 會把整個外接矩形框起來，連非成員都被包進去（臨床語意誤導）。
            // 多列一律走凹包（凹包能貼合斜向帶狀分佈）。
            const aspectRatio = width / height;
            const memberYs = household.ids
                .map(id => this.personMap.get(id))
                .filter(m => m)
                .map(m => m.y);
            const ySpan = memberYs.length ? Math.max(...memberYs) - Math.min(...memberYs) : 0;
            const isDogBone = aspectRatio > 1.2 && ySpan < 60;

            // 繪製狗骨頭形狀（膠囊狀，上下平直）
            const drawDogBone = () => {
                // [Fix] bounds 取樣點已含 25px padding，這裡只留少量呼吸空間，
                // 避免 padding 重複疊加造成膠囊過度肥大
                const padding = 8;

                // 邊界（含 padding）
                const left = minX - padding;
                const right = maxX + padding;
                const top = minY - padding;
                const bottom = maxY + padding;

                // 計算高度
                const totalHeight = bottom - top;

                // 半圓的半徑 = 高度的一半
                const arcRadius = totalHeight / 2;

                // 左右圓心的 Y 座標（在中間）
                const centerY = (top + bottom) / 2;

                // 左圓心 X
                const leftArcX = left + arcRadius;
                // 右圓心 X
                const rightArcX = right - arcRadius;

                // 確保左右圓心不會交叉（如果交叉代表寬度不足以畫兩個完整半圓，回退到凹包）
                // 稍微寬容一點 (-10) 避免浮點數誤差導致閃爍
                if (leftArcX > rightArcX + 10) {
                    return false;
                }

                this.ctx.beginPath();

                // 畫左邊半圓 ( Left Cap )
                // MDN arc: (x, y, radius, startAngle, endAngle, anticlockwise)
                // 我們要畫左邊的 C 形：從底部 (PI/2) 到頂部 (-PI/2)
                // 順時針 (false): PI/2 -> PI -> -PI/2
                this.ctx.arc(leftArcX, centerY, arcRadius, Math.PI / 2, -Math.PI / 2, false);

                // 上方水平線到右邊
                this.ctx.lineTo(rightArcX, top);

                // 畫右邊半圓 ( Right Cap )
                // 我們要畫右邊的 D 形：從頂部 (-PI/2) 到底部 (PI/2)
                // 順時針 (false): -PI/2 -> 0 -> PI/2
                this.ctx.arc(rightArcX, centerY, arcRadius, -Math.PI / 2, Math.PI / 2, false);

                // 下方水平線回到左邊
                this.ctx.lineTo(leftArcX, bottom);

                this.ctx.closePath();
                return true;
            };

            // 繪製凹包路徑
            const drawHull = (isGlow = false) => {
                this.ctx.beginPath();
                if (hullPoints.length < 3) return;

                // 圓角多邊形繪製邏輯
                const cornerRadius = 18; // [精緻化] 較大圓角讓凹包框線更圓潤
                for (let i = 0; i < hullPoints.length; i++) {
                    const p1 = hullPoints[i];
                    const p2 = hullPoints[(i + 1) % hullPoints.length];
                    const p3 = hullPoints[(i + 2) % hullPoints.length];

                    const dx1 = p2.x - p1.x;
                    const dy1 = p2.y - p1.y;
                    const dx2 = p3.x - p2.x;
                    const dy2 = p3.y - p2.y;

                    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
                    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    const r = Math.min(cornerRadius, len1 / 2, len2 / 2);

                    if (i === 0) {
                        this.ctx.moveTo(p1.x + (dx1 / len1) * r, p1.y + (dy1 / len1) * r);
                    }
                    this.ctx.arcTo(p2.x, p2.y, p2.x + (dx2 / len2) * r, p2.y + (dy2 / len2) * r, r);
                }
                this.ctx.closePath();
            };

            // 選擇繪製方式
            const tryDrawDogBone = () => {
                if (isDogBone) {
                    const success = drawDogBone();
                    if (success) return;
                }
                drawHull();
            };

            // 如果被選中，先繪製高亮外框
            if (isSelected) {
                this.ctx.save();
                this.ctx.setLineDash(DASH_PATTERNS.solid);
                this.ctx.lineWidth = 6;
                this.ctx.strokeStyle = '#4a90d9';
                this.ctx.globalAlpha = 0.3;
                tryDrawDogBone();
                this.ctx.stroke();
                this.ctx.restore();
            }

            // 繪製實際的圈選框
            this.ctx.strokeStyle = isSelected ? '#4a90d9' : '#333';
            tryDrawDogBone();
            this.ctx.stroke();
        });

        this.ctx.restore();
    }

    /**
     * 計算圈選框的邊界與凸包頂點
     * @param {Object} household - 圈選框對象
     * @param {Array} persons - 人員列表
     * @returns {Object|null} - {points, hullPoints, minX, minY, maxX, maxY} 或 null
     */
    getHouseholdBounds(household, persons, relationships = []) {
        const members = household.ids.map(id => this.personMap.get(id)).filter(p => p);
        if (members.length === 0) return null;

        const padding = 25; // 恢復較顯眼的邊距 (User 要求大一點)
        const personRadius = this.personSize / 2;

        // 收集所有成員的影響點（圓形的邊界 + 關係連線點）
        const points = [];

        // 1. 每位成員周圍取點 (泡泡基礎)
        members.forEach(m => {
            if (!m || typeof m.x !== 'number' || typeof m.y !== 'number') return;

            const r = personRadius + padding;

            for (let i = 0; i < 16; i++) {
                const angle = (i * Math.PI * 2) / 16;
                const px = m.x + Math.cos(angle) * r;
                const py = m.y + Math.sin(angle) * r;

                if (!isNaN(px) && !isNaN(py)) {
                    points.push({ x: px, y: py });
                }
            }

            // [Fix] 人物文字與畫面、走線及匯出共用同一份量測幾何。
            const label = this.getPersonLabelGeometry(m,
                { showNames: true, showNotes: true });
            if (label.bounds) {
                const topY = m.y + personRadius;            // 文字起點（符號下緣）
                const lastRow = label.rows[label.rows.length - 1];
                const botY = label.bounds.bottom + (lastRow.kind === 'note' ? 16 : 14);
                const left = label.bounds.left - 12;
                const right = label.bounds.right + 12;
                points.push({ x: left, y: topY });
                points.push({ x: right, y: topY });
                points.push({ x: left, y: botY });
                points.push({ x: right, y: botY });
                points.push({ x: m.x, y: botY + 4 });
            }
        });

        // 2. 加入成員間的連接線點 (User Request: 泡泡要包住連接線)
        relationships.forEach(rel => {
            const p1 = members.find(m => m.id === rel.fromPersonId);
            const p2 = members.find(m => m.id === rel.toPersonId);

            // 只有當雙方都在同一個同住框內時，才把線段包進去
            if (p1 && p2) {
                // 在線段上取取樣點 (中間 3 個點)
                const samples = 3;
                for (let i = 1; i <= samples; i++) {
                    const ratio = i / (samples + 1);
                    const sx = p1.x + (p2.x - p1.x) * ratio;
                    const sy = p1.y + (p2.y - p1.y) * ratio;

                    // 考慮 padding 影響，在線段兩側微調點位確保包絡
                    const r = padding * 0.7;
                    points.push({ x: sx + r, y: sy });
                    points.push({ x: sx - r, y: sy });
                    points.push({ x: sx, y: sy + r });
                    points.push({ x: sx, y: sy - r });
                }
            }
        });

        if (points.length === 0) return null;

        // 計算凹包 (Concave Hull) 產生「縮腰」效果
        const hullPoints = this.getConcaveHull(points, 100);

        // 計算外接矩形 (用於相容性或快速檢測)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        points.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });

        return {
            points,
            hullPoints,
            minX, minY, maxX, maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * 凸包演算法 (Monotone Chain)
     */
    getConvexHull(points) {
        if (points.length <= 2) return points;

        // 按 X 排序，X 相同按 Y 排序
        const sorted = [...points].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);

        const crossProduct = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

        // 下半部
        const lower = [];
        for (const p of sorted) {
            while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
                lower.pop();
            }
            lower.push(p);
        }

        // 上半部
        const upper = [];
        for (let i = sorted.length - 1; i >= 0; i--) {
            const p = sorted[i];
            while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
                upper.pop();
            }
            upper.push(p);
        }

        lower.pop();
        upper.pop();
        return lower.concat(upper);
    }

    /**
     * 凹包演算法 (簡化版：基於凸包邊緣細分)
     * @param {Array} points - 所有原始點
     * @param {number} concavity - 凹陷閾值 (數字越大越凹，預設 80px)
     */
    getConcaveHull(points, concavity = 80) {
        if (points.length < 4) return this.getConvexHull(points);

        let hull = this.getConvexHull(points);
        const unused = points.filter(p => !hull.some(hp => Math.abs(hp.x - p.x) < 0.1 && Math.abs(hp.y - p.y) < 0.1));

        let changed = true;
        let iterations = 0;
        while (changed && iterations < 200) {
            iterations++;
            changed = false;
            for (let i = 0; i < hull.length; i++) {
                const p1 = hull[i];
                const p2 = hull[(i + 1) % hull.length];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const distSq = dx * dx + dy * dy;
                const edgeLen = Math.sqrt(distSq);

                // 如果邊緣太長，尋找最近的內部點來打破它
                if (distSq > concavity * concavity) {
                    let bestPoint = null;
                    let bestIdx = -1;
                    let minDistSum = Infinity;

                    for (let j = 0; j < unused.length; j++) {
                        const p = unused[j];
                        const d1 = Math.sqrt((p.x - p1.x) ** 2 + (p.y - p1.y) ** 2);
                        const d2 = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2);
                        const distSum = d1 + d2;

                        if (distSum < minDistSum) {
                            minDistSum = distSum;
                            bestPoint = p;
                            bestIdx = j;
                        }
                    }

                    // 橡皮筋收縮邏輯：新增點後的總長度增長不能超過 1.4 倍
                    if (bestPoint && minDistSum < edgeLen * 1.4) {
                        // 防止自相交：檢查新邊緣是否與現有邊緣相交
                        let selfIntersects = false;
                        for (let k = 0; k < hull.length; k++) {
                            const e1 = hull[k];
                            const e2 = hull[(k + 1) % hull.length];

                            // 跳過相鄰邊緣
                            const isAdjacent = (k === i || k === (i + 1) % hull.length || (k + 1) % hull.length === i);
                            if (isAdjacent) continue;

                            if (this.segmentsIntersect(p1, bestPoint, e1, e2) ||
                                this.segmentsIntersect(bestPoint, p2, e1, e2)) {
                                selfIntersects = true;
                                break;
                            }
                        }

                        if (!selfIntersects) {
                            hull.splice(i + 1, 0, bestPoint);
                            unused.splice(bestIdx, 1);
                            changed = true;
                            break;
                        }
                    }
                }
            }
        }
        return hull;
    }

    /**
     * 檢查線段 (p1, p2) 與 (p3, p4) 是否相交 (不計端點)
     */
    segmentsIntersect(p1, p2, p3, p4) {
        const dx12 = p2.x - p1.x;
        const dy12 = p2.y - p1.y;
        const dx34 = p4.x - p3.x;
        const dy34 = p4.y - p3.y;

        const denominator = (dy34 * dx12) - (dx34 * dy12);
        if (Math.abs(denominator) < 0.0001) return false;

        const ua = ((dx34 * (p1.y - p3.y)) - (dy34 * (p1.x - p3.x))) / denominator;
        const ub = ((dx12 * (p1.y - p3.y)) - (dy12 * (p1.x - p3.x))) / denominator;

        // 參數範圍 (0.01 ~ 0.99) 用於判定真正交叉，而非共享端點
        return (ua > 0.01 && ua < 0.99) && (ub > 0.01 && ub < 0.99);
    }

    /**
     * 檢查點是否在圈選框邊界上（考慮邊界寬度）
     * @param {number} px - 點 X 座標
     * @param {number} py - 點 Y 座標
     * @param {Object} household - 圈選框對象
     * @param {Array} persons - 人員列表
     * @param {number} tolerance - 容差距離（預設 20，用於點擊邊界）
     * @returns {boolean}
     */
    isPointOnHouseholdBoundary(px, py, household, persons, relationships = [], tolerance = 20) {
        const bounds = this.getHouseholdBounds(household, persons, relationships);
        if (!bounds || !bounds.hullPoints) return false;

        const { hullPoints, minX, minY, maxX, maxY, width, height } = bounds;

        // 判斷是否為狗骨頭形狀 (需與 drawHouseholds 邏輯一致：單列成員才用膠囊)
        const aspectRatio = width / height;
        const memberYs = household.ids
            .map(id => this.personMap.get(id))
            .filter(m => m)
            .map(m => m.y);
        const ySpan = memberYs.length ? Math.max(...memberYs) - Math.min(...memberYs) : 0;
        const isDogBone = aspectRatio > 1.2 && ySpan < 60;

        if (isDogBone) {
            const padding = 8; // 與 drawHouseholds 的 drawDogBone 一致
            // 邊界（含 padding）
            const left = minX - padding;
            const right = maxX + padding;
            const top = minY - padding;
            const bottom = maxY + padding;

            const totalHeight = bottom - top;
            const arcRadius = totalHeight / 2;
            const centerY = (top + bottom) / 2;

            const leftArcX = left + arcRadius;
            const rightArcX = right - arcRadius;

            // 確保沒有交叉，才視為有效狗骨頭
            if (leftArcX <= rightArcX + 10) {
                // 1. 檢查是否在左半圓內 (距離檢查)
                const distLeft = Math.sqrt((px - leftArcX) ** 2 + (py - centerY) ** 2);
                if (distLeft <= arcRadius + tolerance && px <= leftArcX + tolerance) return true;

                // 2. 檢查是否在右半圓內
                const distRight = Math.sqrt((px - rightArcX) ** 2 + (py - centerY) ** 2);
                if (distRight <= arcRadius + tolerance && px >= rightArcX - tolerance) return true;

                // 3. 檢查是否在中間矩形區域內
                if (px >= leftArcX && px <= rightArcX &&
                    py >= top - tolerance && py <= bottom + tolerance) {
                    return true;
                }

                // 如果是狗骨頭但不符合上述條件，且也不在凹包內（後面會檢查），則回傳 false
                // 但為了保險起見，如果狗骨頭邏輯判斷沒中，我們還是讓它跑一下凹包檢查作為 Fallback
            }
        }

        // 1. 快速過濾：如果連外接矩形都沒進去，直接回傳 false
        if (px < minX - tolerance || px > maxX + tolerance ||
            py < minY - tolerance || py > maxY + tolerance) {
            return false;
        }

        // 2. 精確判定：射線法 (Ray Casting) 判定點是否在多邊形內
        let inside = false;
        for (let i = 0, j = hullPoints.length - 1; i < hullPoints.length; j = i++) {
            const xi = hullPoints[i].x, yi = hullPoints[i].y;
            const xj = hullPoints[j].x, yj = hullPoints[j].y;

            const intersect = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }

        if (inside) return true;

        // 3. 邊界線段判定 (考慮容差)
        for (let i = 0; i < hullPoints.length; i++) {
            const p1 = hullPoints[i];
            const p2 = hullPoints[(i + 1) % hullPoints.length];
            if (this.distanceToLineSegment(px, py, p1.x, p1.y, p2.x, p2.y) <= tolerance) {
                return true;
            }
        }

        return false;
    }

    /**
     * 計算點到線段的最小距離
     * @param {number} px - 點 X 座標
     * @param {number} py - 點 Y 座標
     * @param {number} x1 - 線段起點 X
     * @param {number} y1 - 線段起點 Y
     * @param {number} x2 - 線段終點 X
     * @param {number} y2 - 線段終點 Y
     * @returns {number} 距離
     */
    distanceToLineSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) {
            // 線段退化成點
            const distX = px - x1;
            const distY = py - y1;
            return Math.sqrt(distX * distX + distY * distY);
        }

        // 計算投影參數 t
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));

        // 找到線段上最近的點
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;

        // 計算距離
        const distX = px - projX;
        const distY = py - projY;
        return Math.sqrt(distX * distX + distY * distY);
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
                    const config = this.getMarriageConfiguration(p1, p2, marriageRel, allRelationships);
                    const childrenCenterX = childObjs.reduce((sum, c) => sum + c.x, 0) / childObjs.length;
                    const desiredSourceX = childObjs.length === 1 ? childObjs[0].x : childrenCenterX;

                    if (config.isBridge) {
                        const top1 = p1.getConnectionPoint('top');
                        const top2 = p2.getConnectionPoint('top');
                        const minMarriageX = Math.min(top1.x, top2.x);
                        const maxMarriageX = Math.max(top1.x, top2.x);
                        sourceX = Math.max(minMarriageX, Math.min(maxMarriageX, desiredSourceX));
                        sourceY = config.bridgeY;
                    } else {
                        const leftParent = p1.x <= p2.x ? p1 : p2;
                        const rightParent = p1.x <= p2.x ? p2 : p1;
                        const marriageStartX = leftParent.getConnectionPoint('right').x;
                        const marriageEndX = rightParent.getConnectionPoint('left').x;
                        const minMarriageX = Math.min(marriageStartX, marriageEndX);
                        const maxMarriageX = Math.max(marriageStartX, marriageEndX);
                        sourceX = Math.max(minMarriageX, Math.min(maxMarriageX, desiredSourceX));
                        sourceY = (p1.y + p2.y) / 2;
                    }
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
            parentObjs.forEach(p => {
                const parentBottom = this._labelBottomY(p);
                if (sourceY < parentBottom) {
                    sourceY = parentBottom;
                }
            });

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
            // [Phase 2A.0] 婚姻 hit-test：與主線/高亮共用 getMarriageGeometry。
            // 修正舊版兩處與主線不符、點不準的 bug：
            //   (1) 天橋用「側邊」連接點、主線用「頂端」→ 垂直腿差半個節點寬；
            //   (2) Level-0 跨列婚姻主線是正交三折，hit-test 卻當直線。
            const config = this.getMarriageConfiguration(fromPerson, toPerson, relationship, allRelationships);
            const geom = this.getMarriageGeometry(fromPerson, toPerson, config);
            for (const pt of geom.points) points.push({ x: pt.x, y: pt.y });
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
        return { point: info.point, nx, ny, baseOffset: 24 };
    }

    drawRelationshipEditButton(relationship, fromPerson, toPerson, allRelationships = []) {
        const path = this.getRelationshipPath(fromPerson, toPerson, relationship, allRelationships);
        if (path.length < 2) return null;

        // [Fix] 錨點 + 法向：draw/hit-test/swap 共用 _editButtonGeom（婚姻 ㄩ 下折改朝下方清空區）
        const geom = this._editButtonGeom(path, relationship.getCategory());
        const info = { point: geom.point };
        const nx = geom.nx, ny = geom.ny;

        const buttonRadius = 14;
        const offsetDist = geom.baseOffset; // 預設 24；被其他角色擋住時已往外推

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
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // 關閉陰影
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;

        // 繪製鉛筆圖示（向量繪製，避免 emoji 在不同平台渲染不一）
        this.ctx.save();
        this.ctx.translate(x, y);
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
            const sx = info.point.x + nx * (geom.baseOffset + 30);
            const sy = info.point.y + ny * (geom.baseOffset + 30);
            this.ctx.save();
            this.ctx.shadowColor = 'rgba(0,0,0,0.3)';
            this.ctx.shadowBlur = 4; this.ctx.shadowOffsetX = 1; this.ctx.shadowOffsetY = 1;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(sx, sy, buttonRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = '#4a90d9'; this.ctx.lineWidth = 2; this.ctx.stroke();
            this.ctx.shadowColor = 'transparent'; this.ctx.shadowBlur = 0;
            // ⇄ 向量字形：上橫線右箭頭、下橫線左箭頭
            this.ctx.lineWidth = 1.6; this.ctx.lineJoin = 'round'; this.ctx.lineCap = 'round';
            this.ctx.beginPath();
            this.ctx.moveTo(sx - 5, sy - 3); this.ctx.lineTo(sx + 5, sy - 3);
            this.ctx.moveTo(sx + 2, sy - 6); this.ctx.lineTo(sx + 5, sy - 3); this.ctx.lineTo(sx + 2, sy);
            this.ctx.moveTo(sx + 5, sy + 3); this.ctx.lineTo(sx - 5, sy + 3);
            this.ctx.moveTo(sx - 2, sy + 6); this.ctx.lineTo(sx - 5, sy + 3); this.ctx.lineTo(sx - 2, sy);
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
        // 垂直偏移到鉛筆外側清空區（baseOffset 已含避障推離）；水平固定螢幕左→右（自 ㄇ 一 ㄩ）。
        const baseX = geom.point.x + geom.nx * (geom.baseOffset + 32);
        const baseY = geom.point.y + geom.ny * (geom.baseOffset + 32);
        const spacing = 30;
        const modes = ['auto', 'over', 'straight', 'under'];
        return modes.map((mode, i) => {
            const k = i - 1.5; // -1.5,-0.5,0.5,1.5 → 置中
            return { mode, x: baseX + k * spacing, y: baseY };
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
        const r = 13;
        for (const c of centers) {
            const active = c.mode === cur;
            this.ctx.save();
            this.ctx.shadowColor = 'rgba(0,0,0,0.3)';
            this.ctx.shadowBlur = 4; this.ctx.shadowOffsetX = 1; this.ctx.shadowOffsetY = 1;
            this.ctx.fillStyle = active ? '#ed1261' : '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = active ? '#ed1261' : '#4a90d9';
            this.ctx.lineWidth = 2; this.ctx.stroke();
            this.ctx.shadowColor = 'transparent'; this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = active ? '#ffffff' : '#4a90d9';
            this.ctx.font = '13px "Microsoft JhengHei", sans-serif';
            this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
            this.ctx.fillText(labels[c.mode], c.x, c.y + 0.5);
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
            if (Math.hypot(px - c.x, py - c.y) <= 13 + 4) return c.mode;
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
        const off = geom.baseOffset + 30;
        const bx = geom.point.x + geom.nx * off, by = geom.point.y + geom.ny * off;
        return Math.hypot(px - bx, py - by) <= 14 + 5;
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

        const buttonRadius = 14;
        const offsetDist = geom.baseOffset;

        const buttonX = geom.point.x + geom.nx * offsetDist;
        const buttonY = geom.point.y + geom.ny * offsetDist;

        const dx = px - buttonX;
        const dy = py - buttonY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance <= buttonRadius + 5; // 增加一些容差
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

        const { x, y } = person;
        const btnRadius = 18;

        Object.entries(GenogramCanvas.QUICK_BUTTONS).forEach(([type, btn]) => {
            // 跳過懷孕按鈕：男性、懷孕、死亡者、男跨女 (MTF)
            if (type === 'pregnancy') {
                if (person.gender === 'male' || person.gender === 'pregnancy' || person.isDeceased || person.transgender === 'mtf') {
                    return; // 跳過不繪製
                }
            }

            // 懷孕符號不顯示：伴侶、兒子、女兒
            if (person.gender === 'pregnancy') {
                if (type === 'partner' || type === 'son' || type === 'daughter') {
                    return;
                }
            }

            const bx = x + btn.offsetX;
            const by = y + btn.offsetY;

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
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            this.ctx.restore();

            // 按鈕圖示（家系圖符號語意的小 glyph）
            this.drawQuickButtonGlyph(type, bx, by, btn.color);

            // 按鈕標籤（小字說明）
            this.ctx.save();
            this.ctx.font = '10px "Noto Sans TC", sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';
            this.ctx.fillStyle = '#6b7280';
            this.ctx.fillText(btn.label, bx, by + btnRadius + 3);
            this.ctx.restore();
        });
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

        const { x, y } = person;
        const btnRadius = 18;

        for (const [type, btn] of Object.entries(GenogramCanvas.QUICK_BUTTONS)) {
            // 跳過懷孕按鈕：男性、懷孕、死亡者、男跨女 (MTF)
            if (type === 'pregnancy') {
                if (person.gender === 'male' || person.gender === 'pregnancy' || person.isDeceased || person.transgender === 'mtf') {
                    continue;
                }
            }

            // 懷孕符號不顯示：伴侶、兒子、女兒
            if (person.gender === 'pregnancy') {
                if (type === 'partner' || type === 'son' || type === 'daughter') {
                    continue;
                }
            }

            const bx = x + btn.offsetX;
            const by = y + btn.offsetY;
            const dist = Math.sqrt((px - bx) ** 2 + (py - by) ** 2);
            if (dist <= btnRadius) {
                return type;
            }
        }
        return null;
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

        const { x, y } = person;

        // 計算擴展區域的邊界 (包含所有按鈕)
        // 上: -75 (parent), 下: +75 (children), 左/右: ±55 (sibling/partner)
        const padding = 30; // 額外的容差
        const minX = x - 55 - padding;
        const maxX = x + 55 + padding;
        const minY = y - 75 - padding;
        const maxY = y + 75 + padding;

        return px >= minX && px <= maxX && py >= minY && py <= maxY;
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

        // [New] 標籤：畫在最上緣頂點上方（白色 halo 確保可讀；原本 label 從未顯示）
        if (lc.label) {
            let top = lc.points[0];
            lc.points.forEach(p => { if (p.y < top.y) top = p; });
            this.ctx.save();
            this.ctx.font = `600 13px ${this.fontFamily}`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'bottom';
            this.ctx.lineWidth = 4;
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.strokeText(lc.label, top.x, top.y - 6);
            this.ctx.fillStyle = this.lifeCircleStrokeColor(fillColor, 1);
            this.ctx.fillText(lc.label, top.x, top.y - 6);
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
     * 繪製生活圈（匯出用，不含選取高亮）
     * [Fix] 與螢幕版共用 _drawSingleLifeCircle：平滑形狀、邊框色、標籤完全一致
     */
    drawLifeCirclesExport(lifeCircles) {
        if (!lifeCircles || lifeCircles.length === 0) return;

        lifeCircles.forEach(lc => {
            this._drawSingleLifeCircle(lc, false);
        });
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


