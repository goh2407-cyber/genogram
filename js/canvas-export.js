/**
 * GenogramCanvas 匯出層（PNG / JPEG / 頁首 / 匯出圖例 / 匯出用繪製 / 匯出期間衍生狀態）。
 * [3-4 拆檔] 自 canvas.js 抽出為 prototype mixin；不改任何行為，匯出 == 螢幕 的共用 draw core 仍在 canvas.js。
 * 載入順序：必須在 js/canvas.js 之後、js/app.js 之前。
 */
/* global GenogramCanvas, DASH_PATTERNS, Relationship */

// 匯出頁首排版常數（原 static EXPORT_HEADER）
/**
 * 繪製匯出用的關係圖例
 */
/**
 * [2-2] 匯出頁首：標題（粗體）+ 一行「案號／日期／繪製者」+ 細分隔線。
 * 只有 header 內有任一非空欄位才佔高度；PNG / JPEG / SVG(內嵌PNG) / PDF 共用，複製圖片不加。
 */
GenogramCanvas.EXPORT_HEADER = Object.freeze({ padX: 40, padTop: 24, titleSize: 22, metaSize: 13, gap: 8, padBottom: 16 });

Object.assign(GenogramCanvas.prototype, {
    /**
     * 匯出專用的人物繪製
     * @param {Object} person - 人物物件
     * @param {Object} viewOptions - 顯示策略
     */
    drawPersonForExport(person, viewOptions = {}) {
        this.drawPerson(person, false, false, false, viewOptions);
    },

    _captureExportDerivedState() {
        const familyPlans = new Set(this._familyRoutePlans || []);
        for (const cached of this._familyPlanCache?.values?.() || []) {
            if (cached?.plan) familyPlans.add(cached.plan);
        }
        const lodScale = this.lodScale;
        this.lodScale = 1; // [3-3] 匯出永遠用基準字級，不受目前螢幕縮放影響
        return {
            ctx: this.ctx,
            lodScale,
            viewOptions: this.viewOptions,
            personMap: this.personMap,
            lastPersons: this.lastPersons,
            lastRelationships: this.lastRelationships,
            derivedGeometrySignature: this._derivedGeometrySignature,
            personLabelPlacements: this.personLabelPlacements,
            marriageRouteCache: this.marriageRouteCache,
            labelRoutingWarnings: this.labelRoutingWarnings,
            familyRouteSignature: this._familyRouteSignature,
            familyPlanCache: this._familyPlanCache,
            familyRoutePlans: this._familyRoutePlans,
            familyRelationshipPaths: this._familyRelationshipPaths,
            familyPlanState: Array.from(familyPlans, plan => ({
                plan,
                hasFamily: Object.prototype.hasOwnProperty.call(plan, 'family'),
                family: plan.family
            }))
        };
    },

    _restoreExportDerivedState(state) {
        state.familyPlanState.forEach(entry => {
            if (entry.hasFamily) entry.plan.family = entry.family;
            else delete entry.plan.family;
        });
        this.ctx = state.ctx;
        this.lodScale = state.lodScale; // [3-3]
        this.viewOptions = state.viewOptions;
        this.personMap = state.personMap;
        this.lastPersons = state.lastPersons;
        this.lastRelationships = state.lastRelationships;
        this._derivedGeometrySignature = state.derivedGeometrySignature;
        this.personLabelPlacements = state.personLabelPlacements;
        this.marriageRouteCache = state.marriageRouteCache;
        this.labelRoutingWarnings = state.labelRoutingWarnings;
        this._familyRouteSignature = state.familyRouteSignature;
        this._familyPlanCache = state.familyPlanCache;
        this._familyRoutePlans = state.familyRoutePlans;
        this._familyRelationshipPaths = state.familyRelationshipPaths;
    },

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
        showLegend = true, scale = 3, viewOptions = {}, header = null) {
        const exportState = this._captureExportDerivedState();
        try {
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
        const headerHeight = this._exportHeaderHeight(header); // [2-2] 頁首高度（無頁首 = 0，輸出與以往逐像素相同）
        const totalHeight = headerHeight + Math.max(contentHeight, (showLegend ? legendHeight + margin * 2 : contentHeight));

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
        this.ctx = exportCtx;

        // 平移到內容區域
        this.ctx.save();
        this.ctx.translate(-minX, -minY + headerHeight);

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
            const legendY = headerHeight + (totalHeight - headerHeight - legendHeight) / 2;
            this.drawExportLegend(exportCtx, legendX, legendY, effectiveView);
        }

        if (headerHeight) this.drawExportHeader(exportCtx, totalWidth, header);

        return exportCanvas.toDataURL('image/png');
        } finally {
            this._restoreExportDerivedState(exportState);
        }
    },

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
        showNotes = true, showLegend = true, scale = 3, viewOptions = {}, header = null) {
        const exportState = this._captureExportDerivedState();
        try {
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
        const headerHeight = this._exportHeaderHeight(header); // [2-2] 頁首高度（無頁首 = 0，輸出與以往逐像素相同）
        const totalHeight = headerHeight + Math.max(contentHeight, (showLegend ? legendHeight + margin * 2 : contentHeight));

        const exportCanvas = document.createElement('canvas');
        const exportScale = scale; // 使用傳入的 scale
        exportCanvas.width = totalWidth * exportScale;
        exportCanvas.height = totalHeight * exportScale;
        const exportCtx = exportCanvas.getContext('2d');
        exportCtx.scale(exportScale, exportScale);

        // JPEG 需要純白背景
        exportCtx.fillStyle = '#ffffff';
        exportCtx.fillRect(0, 0, totalWidth, totalHeight);

        this.ctx = exportCtx;

        this.ctx.save();
        this.ctx.translate(-minX, -minY + headerHeight);

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
            const legendY = headerHeight + (totalHeight - headerHeight - legendHeight) / 2;
            this.drawExportLegend(exportCtx, legendX, legendY, effectiveView);
        }

        if (headerHeight) this.drawExportHeader(exportCtx, totalWidth, header);

        return exportCanvas.toDataURL('image/jpeg', quality);
        } finally {
            this._restoreExportDerivedState(exportState);
        }
    },

    _exportHeaderMetaLine(header) {
        if (!header) return '';
        const parts = [];
        if (header.caseId) parts.push(`案號：${header.caseId}`);
        if (header.date) parts.push(`日期：${header.date}`);
        if (header.author) parts.push(`繪製者：${header.author}`);
        if (header.deidentified) parts.push('去識別化版本'); // [3-1]
        return parts.join('　　');
    },

    _exportHeaderHeight(header) {
        if (!header) return 0;
        const H = GenogramCanvas.EXPORT_HEADER;
        const hasTitle = Boolean(header.title && String(header.title).trim());
        const meta = this._exportHeaderMetaLine(header);
        if (!hasTitle && !meta) return 0;
        let h = H.padTop;
        if (hasTitle) h += H.titleSize + H.gap;
        if (meta) h += H.metaSize + H.gap;
        return h + H.padBottom;
    },

    drawExportHeader(ctx, width, header) {
        const h = this._exportHeaderHeight(header);
        if (!h) return 0;
        const H = GenogramCanvas.EXPORT_HEADER;
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, h);
        ctx.beginPath();
        ctx.rect(H.padX - 4, 0, width - H.padX * 2 + 8, h);
        ctx.clip(); // 超長文字不溢出頁首區
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        let y = H.padTop;
        const title = header.title ? String(header.title).trim() : '';
        if (title) {
            ctx.fillStyle = '#1f2933';
            ctx.font = `bold ${H.titleSize}px ${this.fontFamily}`;
            ctx.fillText(title, H.padX, y);
            y += H.titleSize + H.gap;
        }
        const meta = this._exportHeaderMetaLine(header);
        if (meta) {
            ctx.fillStyle = '#5b6b78';
            ctx.font = `${H.metaSize}px ${this.fontFamily}`;
            ctx.fillText(meta, H.padX, y);
        }
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = '#dfe4e8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(H.padX, h - 8.5);
        ctx.lineTo(width - H.padX, h - 8.5);
        ctx.stroke();
        ctx.restore();
        return h;
    },

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

        // [HH-2] 「圖形符號」小節（標題 + 同住框 1 項）放在較短的欄位末端，高度一併計入
        const symbolRows = 2.5;
        const leftRows = leftItemsCount + leftSections.length * 1.5;
        const rightRows = rightItemsCount + rightSections.length * 1.5;
        const symbolsOnLeft = leftRows <= rightRows;
        const maxItemsPerColumn = Math.max(
            leftItemsCount + 4 + (symbolsOnLeft ? symbolRows : 0),
            rightItemsCount + 4 + (symbolsOnLeft ? 0 : symbolRows)); // +4 for titles

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

        // [HH-2] 圖形符號：同住框（虛線框內為同住成員）
        const symbolX = symbolsOnLeft ? x + padding : rightX;
        let symbolY = symbolsOnLeft ? currentYLeft : currentYRight;
        ctx.save();
        ctx.fillStyle = '#333333';
        ctx.font = `bold ${titleFontSize}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillText('圖形符號', symbolX, symbolY + titleFontSize);
        symbolY += lineHeight * 1.2;
        const swatchY = symbolY + lineHeight / 2 - 4;
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 2;
        ctx.setLineDash(DASH_PATTERNS.household);
        this.roundRect(ctx, symbolX, swatchY - 7, lineWidth, 14, 5);
        ctx.stroke();
        ctx.setLineDash(DASH_PATTERNS.solid);
        ctx.fillStyle = '#333333';
        ctx.font = `${fontSize}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText('同住框', symbolX + lineWidth + 10, swatchY);
        ctx.restore();
    },

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
    },

    /**
     * 繪製生活圈（匯出用，不含選取高亮）
     * [Fix] 與螢幕版共用 _drawSingleLifeCircle：平滑形狀、邊框色、標籤完全一致
     */
    drawLifeCirclesExport(lifeCircles) {
        if (!lifeCircles || lifeCircles.length === 0) return;

        lifeCircles.forEach(lc => {
            this._drawSingleLifeCircle(lc, false);
        });
    },
});
