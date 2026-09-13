// 來源：js/app.js；此檔以 mixin 掛回原型，載入順序：app.js → app-hittest.js（DOMContentLoaded 前同步載入）。
'use strict';
Object.assign(GenogramApp.prototype, {
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
    },

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
    },

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
    },

    /**
     * 檢查點是否在多選邊界內
     */
    isPointInsideMultiSelection(x, y) {
        const bounds = this.getMultiSelectionBounds();
        if (!bounds) return false;
        return x >= bounds.x1 && x <= bounds.x2 && y >= bounds.y1 && y <= bounds.y2;
    },

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
    },

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
    },

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
    },

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
});
