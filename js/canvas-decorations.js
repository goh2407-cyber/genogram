// 來源：js/canvas.js；此檔以 mixin 掛回原型，載入順序：canvas.js → canvas-decorations.js → app.js。
'use strict';
Object.assign(GenogramCanvas.prototype, {
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
    },

    /**
     * 取得虛線樣式
     */
    getLineDash(pattern) {
        switch (pattern) {
            case 'dashed': return DASH_PATTERNS.engaged;  // 訂婚：長虛線
            case 'dotted': return DASH_PATTERNS.cohabit;  // 同居：短點線
            default:       return DASH_PATTERNS.solid;
        }
    },

    /**
     * 繪製小房子 (法律同居)
     */
    /** [B2] 線上小裝飾（斜線／X／小屋）統一 2px、平頭：與側欄／匯出圖例一致，不再被 3px 圓帽糊成一團 */
    _beginDecorationStroke() {
        this.ctx.save();
        this.ctx.lineWidth = GenogramCanvas.DECORATION_LINE_WIDTH;
        this.ctx.lineCap = 'butt';
        this.ctx.lineJoin = 'miter';
    },

    drawHouse(x, y) {
        const w = 12;
        const h = 10;
        this._beginDecorationStroke();
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
    },

    /**
     * 繪製雙斜線 (法律分居)
     */
    drawDoubleSlash(x, y) {
        const size = 6;
        const gap = 4;
        this._beginDecorationStroke();
        this.ctx.beginPath();
        this.ctx.moveTo(x - size - gap, y + size);
        this.ctx.lineTo(x + size - gap, y - size);
        this.ctx.moveTo(x - size + gap, y + size);
        this.ctx.lineTo(x + size + gap, y - size);
        this.ctx.stroke();
        this.ctx.restore();
    },

    /**
     * 繪製離婚標記 (兩條斜線 //)
     */
    drawDivorceSlash(x, y) {
        this.drawDoubleSlash(x, y);
    },

    // [REMOVED] 重複的 drawHouse 函數已移除，保留 Line 824 的版本

    /**
     * 繪製斜線裝飾
     */
    drawSlash(x, y) {
        const size = 6;
        this._beginDecorationStroke();
        this.ctx.beginPath();
        this.ctx.moveTo(x - size, y + size);
        this.ctx.lineTo(x + size, y - size);
        this.ctx.stroke();
        this.ctx.restore();
    },

    /**
     * 繪製 X 裝飾
     */
    drawX(x, y) {
        const size = 6;
        this._beginDecorationStroke();
        this.ctx.beginPath();
        this.ctx.moveTo(x - size, y - size);
        this.ctx.lineTo(x + size, y + size);
        this.ctx.moveTo(x + size, y - size);
        this.ctx.lineTo(x - size, y + size);
        this.ctx.stroke();
        this.ctx.restore();
    },

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
    },

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
    },

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
    },

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
    },

    getPathLength(points) {
        let len = 0;
        for (let i = 0; i < points.length - 1; i++) {
            len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
        }
        return len;
    },

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
    },

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
        // [B2] 有末端箭頭時，波浪與鋸齒都在箭頭前 22px 內收斂成直線，不再穿過箭頭
        const hasEndArrow = Boolean(style.decoration && /arrow/.test(style.decoration));
        const endMargin = hasEndArrow ? 22 : 0;

        if (style.pattern === 'double') {
            this.drawParallelPath(path, 4);
            this.drawParallelPath(path, -4);
        } else if (style.pattern === 'triple') {
            this.drawParallelPath(path, 0);
            this.drawParallelPath(path, 5);
            this.drawParallelPath(path, -5);
        } else if (style.pattern === 'wave') {
            const lines = style.lines || 1;
            this.drawWaveOnPath(path, totalLen, lines, endMargin);
        } else if (style.pattern === 'zigzag') {
            this.drawZigzagOnPath(path, totalLen, 5, 10, 0, endMargin);
        } else if (style.pattern === 'zigzag-large') {
            this.drawZigzagOnPath(path, totalLen, 8, 16, 0, endMargin);
        } else if (style.pattern === 'sawtooth') {
            this.drawZigzagOnPath(path, totalLen, 3, 6, 0, endMargin);
        } else if (style.pattern === 'close-hostile') {
            // 親密敵對: 灰色雙線 + 紅色鋸齒 (Close Hostile)
            this.ctx.save();
            this.ctx.strokeStyle = '#757575';
            this.drawParallelPath(path, 3);
            this.drawParallelPath(path, -3);
            this.ctx.restore();
            // 紅色鋸齒 (原本的 strokeStyle)
            this.drawZigzagOnPath(path, totalLen, 5, 10, 0, endMargin);
        } else if (style.pattern === 'fused-hostile') {
            // 融合敵對: 灰色雙線(較寬) + 紅色鋸齒
            this.ctx.save();
            this.ctx.strokeStyle = '#757575';
            this.drawParallelPath(path, 4);
            this.drawParallelPath(path, -4);
            this.ctx.restore();

            this.drawZigzagOnPath(path, totalLen, 5, 10, 0, endMargin);
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
            this.drawZigzagOnPath(path, totalLen, 5, 10, 0, endMargin);
            this.ctx.restore();

        } else if (style.pattern === 'physical-abuse') {
            // 身體虐待: 藍色波浪 + 中央黑色直線
            // Blue Wave (Inherited color assumed Blue)
            this.drawWaveOnPath(path, totalLen, 1, endMargin);
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
            this.drawZigzagOnPath(path, totalLen, 4, 8, 0, endMargin);
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
            this.drawZigzagOnPath(path, totalLen, 4, 10, 3, endMargin);
            this.drawZigzagOnPath(path, totalLen, 4, 10, -3, endMargin);

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
    },

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

        // [B2] 兩點直線直接平移端點（精確、無取樣誤差）；多段路徑才走 walker
        if (path.length === 2) {
            const dx = path[1].x - path[0].x, dy = path[1].y - path[0].y;
            const len2 = Math.hypot(dx, dy) || 1;
            const nx = -dy / len2 * offset, ny = dx / len2 * offset;
            this.ctx.moveTo(path[0].x + nx, path[0].y + ny);
            this.ctx.lineTo(path[1].x + nx, path[1].y + ny);
            this.ctx.stroke();
            return;
        }
        // 採用 "Walker" 方式取樣並偏移；步距隨輸出解析度縮小（匯出 3 倍時也平滑）
        const step = this._pathSampleStep(3);
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
    },

    /**
     * 沿路徑繪製波浪（支援多線）
     * @param {number} endMargin - 末端振幅 ease out 的長度。>0 時讓末端波浪收斂成直線（避免穿過箭頭）
     */
    drawWaveOnPath(path, totalLen, lines = 1, endMargin = 0) {
        const amplitude = 5;
        const frequency = 0.15;
        const step = this._pathSampleStep(2); // [B2] 步距隨輸出解析度縮小，匯出 3 倍不再多邊形化
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
    },

    /**
     * 沿路徑繪製鋸齒
     */
    drawZigzagOnPath(path, totalLen, amplitude = 5, wavelength = 10, offsetBase = 0, endMargin = 0) {
        // [B2] 直接輸出三角波頂點（d = wl/4, 3wl/4, ...），不再用固定 2px 取樣：
        // 尖點精確落在振幅上、左右對稱，放大與匯出 3 倍都保持銳利。
        // endMargin > 0 時，末端振幅線性收斂到 0（避免穿過箭頭），與 drawWaveOnPath 一致。
        const ampAt = d => (endMargin > 0 && d > totalLen - endMargin)
            ? amplitude * Math.max(0, (totalLen - d) / endMargin) : amplitude;
        const triangle = d => {
            const phase = (d % wavelength) / wavelength;
            if (phase < 0.25) return phase * 4;
            if (phase < 0.75) return 1 - (phase - 0.25) * 4;
            return -1 + (phase - 0.75) * 4;
        };
        const dists = [0];
        for (let d = wavelength / 4; d < totalLen; d += wavelength / 2) dists.push(d);
        if (endMargin > 0) {
            // 收斂區內多補幾個取樣點，讓振幅漸縮而不是一步跳到 0
            for (let d = Math.max(0, totalLen - endMargin); d < totalLen; d += wavelength / 4) dists.push(d);
            dists.sort((a, b) => a - b);
        }
        dists.push(totalLen);

        this.ctx.save();
        this.ctx.lineJoin = 'miter';
        this.ctx.miterLimit = 4;
        this.ctx.beginPath();
        dists.forEach((d, i) => {
            const info = this.getPointInfoAtDistance(path, d);
            const offset = triangle(d) * ampAt(d) + offsetBase;
            const px = info.point.x - info.tangent.y * offset;
            const py = info.point.y + info.tangent.x * offset;
            if (i === 0) this.ctx.moveTo(px, py); else this.ctx.lineTo(px, py);
        });
        this.ctx.stroke();
        this.ctx.restore();
    },

    /**
     * [B2] 沿路徑取樣的步距：以「輸出像素」為準。螢幕 = scale*dpr、匯出 = exportScale（從 ctx 變換矩陣讀）。
     * base 為 1 倍輸出時的步距；最小 0.5 世界像素。
     */
    _pathSampleStep(base) {
        let k = 1;
        try {
            const t = this.ctx.getTransform();
            k = Math.hypot(t.a, t.b) || 1;
        } catch (e) { k = 1; }
        return Math.min(base, Math.max(0.5, base / k));
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
});
