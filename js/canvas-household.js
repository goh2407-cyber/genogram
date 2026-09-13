// 來源：js/canvas.js；此檔以 mixin 掛回原型，載入順序：canvas.js → canvas-household.js → app.js。
'use strict';
Object.assign(GenogramCanvas.prototype, {
    /**
     * 繪製同住家庭圈選
     * @param {Array} households - 家庭列表
     * @param {Array} persons - 人員列表
     * @param {boolean} applyTransformFlag - 是否應用變換（在匯出時通常為 false）
     * @param {string} selectedHouseholdId - 選中的圈選框 ID
     */
    // [3-4 拆檔] 匯出相關方法（exportToPNG/JPEG、頁首、匯出圖例、匯出期間衍生狀態）已移至 js/canvas-export.js

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
            const isDogBone = aspectRatio > 1.2 && ySpan < 60 && bounds.dogBoneAllowed !== false; // [HH-5]

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

                    // [HH-5b] 零長度邊（重複點）會讓 dx/len 變 NaN → arcTo 亂跳；退化為直線
                    if (len1 < 1e-6 || len2 < 1e-6) {
                        if (i === 0) this.ctx.moveTo(p1.x, p1.y);
                        this.ctx.lineTo(p2.x, p2.y);
                        continue;
                    }
                    const r = Math.min(cornerRadius, len1 / 2, len2 / 2);

                    if (i === 0) {
                        this.ctx.moveTo(p1.x + (dx1 / len1) * r, p1.y + (dy1 / len1) * r);
                    }
                    this.ctx.arcTo(p2.x, p2.y, p2.x + (dx2 / len2) * r, p2.y + (dy2 / len2) * r, r);
                }
                this.ctx.closePath();
            };

            // 選擇繪製方式（記錄實際用了膠囊還是凹包，供名稱定位）
            let usedDogBone = false;
            const tryDrawDogBone = () => {
                if (isDogBone) {
                    const success = drawDogBone();
                    usedDogBone = success;
                    if (success) return;
                }
                usedDogBone = false;
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

            // [HH-2] 框名稱：畫在框頂部正上方（白 halo；先關掉虛線，否則 strokeText 也會變虛線）
            if (household.label) {
                let ax, ay;
                if (usedDogBone) {
                    ax = (minX + maxX) / 2;
                    ay = minY - 8;
                } else {
                    let top = hullPoints[0];
                    hullPoints.forEach(p => { if (p.y < top.y) top = p; });
                    ax = top.x;
                    ay = top.y;
                }
                this.ctx.save();
                this.ctx.setLineDash(DASH_PATTERNS.solid);
                this.ctx.font = `600 13px ${this.fontFamily}`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'bottom';
                this.ctx.lineWidth = 4;
                this.ctx.lineJoin = 'round';
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.strokeText(household.label, ax, ay - 6);
                this.ctx.fillStyle = isSelected ? '#4a90d9' : '#333';
                this.ctx.fillText(household.label, ax, ay - 6);
                this.ctx.restore();
            }
        });

        this.ctx.restore();
    },

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

        });

        // [HH-5] 非成員 = 障礙物：框線不得把不在框內的人包進去。
        // 做法：(a) 成員之間以最小生成樹連通，走廊遇到障礍物就繞道；(b) 所有取樣點剔除落在障礙物
        //       排除半徑內者；(c) 凹包由 100 逐步收緊到 40，直到沒有任何障礙物中心在框內。
        // 只依人物符號座標（守 2026-08-11 靜態外框規格），文字位置不影響。
        const memberIds = new Set(members.map(m => m.id));
        const obstacles = (Array.isArray(persons) ? persons : [])
            .filter(p => p && !memberIds.has(p.id) && typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y));
        const corridorHalf = padding * 0.7;
        const exclusion = personRadius + corridorHalf + 6; // 障礙物中心到任何取樣點的最小距離
        const clearance = exclusion + corridorHalf + 4;   // 走廊中心線繞道時與障礙物中心的距離
        const corridorSegments = []; // [HH-5c] 走廊線段（含繞道）
        const lineSegments = [];     // [HH-5c] 成員間的關係線段

        // 1.5 [HH-5] 成員連通走廊（MST），遇障礙物繞道
        if (members.length >= 2) {
            const centroid = members.reduce((acc, m) => ({ x: acc.x + m.x / members.length, y: acc.y + m.y / members.length }), { x: 0, y: 0 });
            const edges = this._householdSpanningEdges(members);
            edges.forEach(([a, b]) => {
                const path = this._routeAroundObstacles({ x: a.x, y: a.y }, { x: b.x, y: b.y }, obstacles, clearance, centroid, 0);
                for (let i = 0; i + 1 < path.length; i++) {
                    const p = path[i], q = path[i + 1];
                    const len = Math.hypot(q.x - p.x, q.y - p.y);
                    if (len < 1e-6) continue;
                    corridorSegments.push([p, q]);
                    const nx = -(q.y - p.y) / len, ny = (q.x - p.x) / len;
                    const steps = Math.max(1, Math.ceil(len / 16));
                    for (let s = 0; s <= steps; s++) {
                        const t = s / steps;
                        const cx = p.x + (q.x - p.x) * t, cy = p.y + (q.y - p.y) * t;
                        points.push({ x: cx, y: cy });
                        points.push({ x: cx + nx * corridorHalf, y: cy + ny * corridorHalf });
                        points.push({ x: cx - nx * corridorHalf, y: cy - ny * corridorHalf });
                    }
                }
            });
        }

        // 2. 加入成員間的連接線點 (User Request: 泡泡要包住連接線)
        relationships.forEach(rel => {
            const p1 = members.find(m => m.id === rel.fromPersonId);
            const p2 = members.find(m => m.id === rel.toPersonId);

            // 只有當雙方都在同一個同住框內時，才把線段包進去
            if (p1 && p2) {
                lineSegments.push([{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }]);
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

        // 取樣點（給膠囊外接框與相容用途）：剔除落在障礙物排除半徑內者
        const filtered = obstacles.length
            ? points.filter(pt => !obstacles.some(o => Math.hypot(pt.x - o.x, pt.y - o.y) < exclusion))
            : points;
        const samples = filtered.length >= 3 ? filtered : points;
        if (samples.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        samples.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });

        // [HH-5c] 快取：成員座標、附近障礙物、走廊與連線一樣 → 直接沿用上次結果
        const nearObstacles = obstacles.filter(o =>
            o.x > minX - exclusion && o.x < maxX + exclusion && o.y > minY - exclusion && o.y < maxY + exclusion);
        const sig = JSON.stringify([
            members.map(m => [m.id, Math.round(m.x * 10), Math.round(m.y * 10)]),
            nearObstacles.map(o => [o.id, Math.round(o.x * 10), Math.round(o.y * 10)]),
            corridorSegments.map(([p, q]) => [Math.round(p.x), Math.round(p.y), Math.round(q.x), Math.round(q.y)]),
            lineSegments.map(([p, q]) => [Math.round(p.x), Math.round(p.y), Math.round(q.x), Math.round(q.y)])
        ]);
        const cached = this._householdBoundsCache && this._householdBoundsCache.get(household.id);
        if (cached && cached.sig === sig) return cached.bounds;

        // [HH-5c] 外框 = 光柵化聯集輪廓：成員泡泡 ∪ 走廊帶 ∪ 成員間連線帶 − 障礙物圓（marching squares）。
        // 由建構保證單一簡單多邊形、不自交、無尖刺；障礙物一律在框外。
        const shapes = {
            disks: members.map(m => ({ x: m.x, y: m.y, r: personRadius + padding })),
            bands: corridorSegments.map(([p, q]) => ({ p, q, half: corridorHalf, isLine: false }))
                .concat(lineSegments.map(([p, q]) => ({ p, q, half: corridorHalf, isLine: true }))),
            holes: nearObstacles.map(o => ({ x: o.x, y: o.y, r: exclusion })),
            cuts: []
        };
        let hullPoints = this._rasterOutline(shapes, members);
        if (!hullPoints) {
            // 某個障礙物的挖洞把區域切斷（成員不在最大輪廓內）→ 由「最靠近成員」的洞開始逐一放棄，
            // 直到成員都在同一輪廓內；寧可包到那一個人，也不能少成員
            const nearest = h => Math.min(...members.map(m => Math.hypot(m.x - h.x, m.y - h.y)));
            let keep = shapes.holes.slice().sort((h1, h2) => nearest(h1) - nearest(h2));
            while (!hullPoints && keep.length) {
                keep = keep.slice(1);
                hullPoints = this._rasterOutline({ ...shapes, holes: keep }, members);
            }
            if (!hullPoints) hullPoints = GenogramCanvas.dedupePath(this.getConcaveHull(samples, 100), true);
        }
        // [HH-5e] 非成員被多條帶子圍成「島」（外輪廓仍包住它）時：
        //   第一階段：拿掉穿過它附近的關係線帶（裝飾用，走廊已保證連通）
        //   第二階段：仍被包住 → 從它挖一條通道到最近的外框頂點（島變成灣），最多兩輪
        const distToBand = (o, b) => {
            const dx = b.q.x - b.p.x, dy = b.q.y - b.p.y, l2 = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, ((o.x - b.p.x) * dx + (o.y - b.p.y) * dy) / l2));
            return Math.hypot(o.x - (b.p.x + dx * t), o.y - (b.p.y + dy * t));
        };
        let enclosedObs = nearObstacles.filter(o => GenogramCanvas.pointInPolygon(o.x, o.y, hullPoints));
        let current = shapes;
        if (enclosedObs.length) {
            const kept = current.bands.filter(b => !b.isLine || !enclosedObs.some(o => distToBand(o, b) < exclusion + b.half + 4));
            if (kept.length !== current.bands.length) {
                const alt = this._rasterOutline({ ...current, bands: kept }, members);
                if (alt) { current = { ...current, bands: kept }; hullPoints = alt; }
                enclosedObs = nearObstacles.filter(o => GenogramCanvas.pointInPolygon(o.x, o.y, hullPoints));
            }
        }
        for (let round = 0; round < 2 && enclosedObs.length; round++) {
            const cuts = enclosedObs.map(o => {
                let best = hullPoints[0], bestD = Infinity;
                hullPoints.forEach(v => { const d = Math.hypot(v.x - o.x, v.y - o.y); if (d < bestD) { bestD = d; best = v; } });
                return { p: { x: o.x, y: o.y }, q: { x: best.x, y: best.y }, half: exclusion * 0.75 };
            });
            const alt = this._rasterOutline({ ...current, cuts: (current.cuts || []).concat(cuts) }, members);
            if (!alt) break; // 通道會切斷成員連通 → 放棄，接受這個人被包住
            current = { ...current, cuts: (current.cuts || []).concat(cuts) };
            hullPoints = alt;
            enclosedObs = nearObstacles.filter(o => GenogramCanvas.pointInPolygon(o.x, o.y, hullPoints));
        }
        const enclosed = obstacles.filter(o => GenogramCanvas.pointInPolygon(o.x, o.y, hullPoints)).map(o => o.id);

        // 膠囊（狗骨頭）會把整個外接框包起來：有障礙物落在外接框內就不允許用膠囊
        const dogBoneAllowed = !obstacles.some(o =>
            o.x > minX - 8 && o.x < maxX + 8 && o.y > minY - 8 && o.y < maxY + 8);

        const bounds = {
            points: samples,
            hullPoints,
            minX, minY, maxX, maxY,
            width: maxX - minX,
            height: maxY - minY,
            dogBoneAllowed,
            enclosedObstacles: enclosed
        };
        if (this._householdBoundsCache) this._householdBoundsCache.set(household.id, { sig, bounds });
        return bounds;
    },

    /**
     * [HH-5c] 光柵化聯集輪廓。cell 預設 5 世界像素（太大時自動放粗到 ≤ 60k 格）；
     * 網格外圈多一格保證邊界為「外」；輪廓經 Chaikin 兩次平滑 + 共線簡化。
     * @returns {Array<{x:number,y:number}>|null} 面積最大的輪廓；成員中心不全在其中時回 null（呼叫端退路）
     */
    _rasterOutline(shapes, members) {
        const pad = 4;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        shapes.disks.forEach(d => {
            minX = Math.min(minX, d.x - d.r); maxX = Math.max(maxX, d.x + d.r);
            minY = Math.min(minY, d.y - d.r); maxY = Math.max(maxY, d.y + d.r);
        });
        shapes.bands.forEach(b => [b.p, b.q].forEach(pt => {
            minX = Math.min(minX, pt.x - b.half); maxX = Math.max(maxX, pt.x + b.half);
            minY = Math.min(minY, pt.y - b.half); maxY = Math.max(maxY, pt.y + b.half);
        }));
        if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        let cell = 5;
        const area = Math.max(1, (maxX - minX) * (maxY - minY));
        if (area / (cell * cell) > 60000) cell = Math.sqrt(area / 60000);
        const nx = Math.ceil((maxX - minX) / cell) + 3;
        const ny = Math.ceil((maxY - minY) / cell) + 3;
        const ox = minX - cell, oy = minY - cell;
        const inside = new Uint8Array(nx * ny);
        const holes = shapes.holes.filter(h => h.x + h.r > minX && h.x - h.r < maxX && h.y + h.r > minY && h.y - h.r < maxY);
        const prep = b => {
            const dx = b.q.x - b.p.x, dy = b.q.y - b.p.y;
            return { ...b, dx, dy, l2: dx * dx + dy * dy, h2: b.half * b.half };
        };
        const bands = shapes.bands.map(prep);
        const cuts = (shapes.cuts || []).map(prep); // [HH-5e] 要挖掉的通道帶
        const inBand = (x, y, b) => {
            let t = b.l2 ? ((x - b.p.x) * b.dx + (y - b.p.y) * b.dy) / b.l2 : 0;
            t = t < 0 ? 0 : (t > 1 ? 1 : t);
            const fx = b.p.x + b.dx * t, fy = b.p.y + b.dy * t;
            return (x - fx) ** 2 + (y - fy) ** 2 <= b.h2;
        };
        for (let j = 0; j < ny; j++) {
            const y = oy + j * cell;
            for (let i = 0; i < nx; i++) {
                const x = ox + i * cell;
                let on = false;
                for (const d of shapes.disks) { if ((x - d.x) ** 2 + (y - d.y) ** 2 <= d.r * d.r) { on = true; break; } }
                if (!on) {
                    for (const b of bands) { if (inBand(x, y, b)) { on = true; break; } }
                }
                if (on) {
                    for (const h of holes) { if ((x - h.x) ** 2 + (y - h.y) ** 2 < h.r * h.r) { on = false; break; } }
                }
                if (on && cuts.length) {
                    for (const cb of cuts) { if (inBand(x, y, cb)) { on = false; break; } }
                }
                inside[j * nx + i] = on ? 1 : 0;
            }
        }
        const loops = GenogramCanvas.marchingSquares(inside, nx, ny, (gx, gy) => ({ x: ox + gx * cell, y: oy + gy * cell }));
        if (!loops.length) return null;
        const area2 = poly => Math.abs(poly.reduce((s, p, k) => {
            const q = poly[(k + 1) % poly.length];
            return s + p.x * q.y - q.x * p.y;
        }, 0)) / 2;
        loops.sort((a, b) => area2(b) - area2(a));
        const main = loops[0];
        if (!members.every(m => GenogramCanvas.pointInPolygon(m.x, m.y, main))) return null;
        let poly = GenogramCanvas.chaikin(main, 2);
        poly = GenogramCanvas.simplifyClosed(poly, 6);
        poly = GenogramCanvas.dedupePath(poly, true);
        return poly.length >= 3 ? poly : null;
    },

    /**
     * [HH-5] 成員中心的最小生成樹（Prim）：讓多成員同住框一定連通，且走廊最短
     * @returns {Array<[Person, Person]>}
     */
    _householdSpanningEdges(members) {
        const sorted = [...members].sort((a, b) => (a.y - b.y) || (a.x - b.x) || String(a.id).localeCompare(String(b.id)));
        const inTree = [sorted[0]];
        const rest = sorted.slice(1);
        const edges = [];
        while (rest.length) {
            let best = null;
            for (const t of inTree) {
                for (const r of rest) {
                    const d = Math.hypot(t.x - r.x, t.y - r.y);
                    if (!best || d < best.d) best = { d, t, r };
                }
            }
            edges.push([best.t, best.r]);
            inTree.push(best.r);
            rest.splice(rest.indexOf(best.r), 1);
        }
        return edges;
    },

    /**
     * [HH-5] 走廊 A→B 遇到障礙物（距線段 < clearance）時，以「前、旁、後」三個繞道點繞過障礙物；
     * 同一障礙物只處理一次（skipIds），兩側子段只再檢查其他障礙物，最多 3 層 → 不會在同一個障礙物旁反覆插點。
     * 端點本身就貼著障礙物（成員與非成員相鄰、距離 < clearance）時不繞，交給取樣排除半徑處理。
     * 繞道方向：障礙物在線段哪一側就往另一側推；恰好在線上時往成員質心那側。
     * 純函數、確定性（同輸入同輸出），供 draw / hit-test / 匯出共用。
     */
    _routeAroundObstacles(a, b, obstacles, clearance, centroid, depth, skipIds = new Set()) {
        if (depth > 3 || !obstacles.length) return [a, b];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1) return [a, b];
        let hit = null;
        obstacles.forEach(o => {
            if (skipIds.has(o.id)) return;
            const t = ((o.x - a.x) * dx + (o.y - a.y) * dy) / len2;
            if (t <= 0 || t >= 1) return;
            const fx = a.x + dx * t, fy = a.y + dy * t;
            const d = Math.hypot(o.x - fx, o.y - fy);
            if (d >= clearance) return;
            // 不因障礙物貼近端點而放棄繞道：同一障礙物只處理一次（skipIds）已足以防止無限遞迴
            if (!hit || t < hit.t) hit = { o, t, fx, fy, d };
        });
        if (!hit) return [a, b];
        const len = Math.sqrt(len2);
        const ux = dx / len, uy = dy / len;
        let nx = -uy, ny = ux; // 單位法向
        const side = (hit.fx - hit.o.x) * nx + (hit.fy - hit.o.y) * ny; // 線段在障礙物的哪一側
        if (Math.abs(side) < 1e-6) {
            const toC = (centroid.x - hit.o.x) * nx + (centroid.y - hit.o.y) * ny;
            if (toC < 0) { nx = -nx; ny = -ny; }
        } else if (side < 0) {
            nx = -nx; ny = -ny;
        }
        const o = hit.o;
        const p1 = { x: o.x - ux * clearance + nx * clearance, y: o.y - uy * clearance + ny * clearance };
        const p2 = { x: o.x + nx * clearance, y: o.y + ny * clearance };
        const p3 = { x: o.x + ux * clearance + nx * clearance, y: o.y + uy * clearance + ny * clearance };
        const skip = new Set(skipIds);
        skip.add(o.id);
        const head = this._routeAroundObstacles(a, p1, obstacles, clearance, centroid, depth + 1, skip);
        const tail = this._routeAroundObstacles(p3, b, obstacles, clearance, centroid, depth + 1, skip);
        return GenogramCanvas.dedupePath(head.concat([p2], tail));
    },

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
    },

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
    },

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
    },

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
        const isDogBone = aspectRatio > 1.2 && ySpan < 60 && bounds.dogBoneAllowed !== false; // [HH-5]

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
    },

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
});
