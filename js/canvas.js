/**
 * GenogramCanvas 類別 - 管理畫布繪製
 */
class GenogramCanvas {
    constructor(canvasId, containerId) {
        this.canvas = document.getElementById(canvasId);
        this.container = document.getElementById(containerId);
        this.ctx = this.canvas.getContext('2d');
        this.dpr = window.devicePixelRatio || 1;

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
        const resizeObserver = new ResizeObserver(() => {
            this.resize();
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
    render(persons, relationships, highlightedIds = [], selectedId = null, selectedRelationshipId = null, connectingFrom = null, selectedPersonIds = [], boxSelectStart = null, boxSelectEnd = null) {
        this.clear();

        this.ctx.save();
        this.applyTransform();

        // 分類關係
        const familyRels = [];
        const otherRels = [];

        relationships.forEach(rel => {
            const category = typeof rel.getCategory === 'function' ? rel.getCategory() : Relationship.getCategory(rel.type);
            if (category === 'family') {
                familyRels.push(rel);
            } else {
                otherRels.push(rel);
            }
        });

        // 1. 先繪製親子關係 (樹狀結構) - 先畫，因為它在底層
        this.drawFamilies(familyRels, persons, otherRels, selectedRelationshipId);

        // 2. 繪製非親子關係 (婚姻、情感) - 後畫，因為它在表層
        otherRels.forEach(rel => {
            const fromPerson = persons.find(p => p.id === rel.fromPersonId);
            const toPerson = persons.find(p => p.id === rel.toPersonId);
            if (fromPerson && toPerson) {
                const isSelected = selectedRelationshipId === rel.id;
                this.drawRelationship(fromPerson, toPerson, rel, isSelected, persons);
            }
        });

        // 3. 繪製正在連接的線
        if (connectingFrom && connectingFrom.targetX !== undefined) {
            this.ctx.save();
            this.ctx.strokeStyle = '#4a90d9';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(connectingFrom.person.x, connectingFrom.person.y);
            this.ctx.lineTo(connectingFrom.targetX, connectingFrom.targetY);
            this.ctx.stroke();
            this.ctx.restore();
        }

        // 4. 繪製人物
        persons.forEach(person => {
            const isSelected = selectedId === person.id;
            const isMultiSelected = (selectedPersonIds || []).includes(person.id);
            const isHighlighted = (highlightedIds || []).includes(person.id);
            const isConnecting = connectingFrom && connectingFrom.person.id === person.id;
            this.drawPerson(person, isSelected || isMultiSelected, isConnecting, isHighlighted);
        });

        // 5. 繪製範圍圈選框
        if (boxSelectStart && boxSelectEnd) {
            this.drawSelectionBox(boxSelectStart, boxSelectEnd);
        }

        this.ctx.restore();
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
        this.ctx.setLineDash([5, 5]);

        // 繪製填充矩形
        this.ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

        // 繪製邊框
        this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);

        this.ctx.restore();
    }


    /**
     * 繪製人物
     */
    drawPerson(person, isSelected = false, isConnecting = false, isHighlighted = false) {
        const { x, y, gender, name, age, isDeceased, isIdentifiedPatient, medical } = person;
        const size = this.personSize;
        const halfSize = size / 2;

        this.ctx.save();

        // 案主虛線外框
        if (isIdentifiedPatient) {
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 3]);

            if (gender === 'female') {
                this.ctx.beginPath();
                this.ctx.arc(x, y, halfSize + 8, 0, Math.PI * 2);
                this.ctx.stroke();
            } else if (gender === 'pregnancy') {
                this.ctx.beginPath();
                this.ctx.moveTo(x, y - halfSize - 8);
                this.ctx.lineTo(x + halfSize + 8, y + halfSize + 8);
                this.ctx.lineTo(x - halfSize - 8, y + halfSize + 8);
                this.ctx.closePath();
                this.ctx.stroke();
            } else {
                this.ctx.strokeRect(x - halfSize - 8, y - halfSize - 8, size + 16, size + 16);
            }
            this.ctx.setLineDash([]);
        }

        // 選取或連接中的高亮效果
        if (isSelected || isConnecting) {
            this.ctx.shadowColor = '#4a90d9';
            this.ctx.shadowBlur = 15;
        } else if (isHighlighted) {
            this.ctx.shadowColor = '#28a745'; // 綠色高亮 (圈選中)
            this.ctx.shadowBlur = 15;
        }

        // 繪製主要形狀背景
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#333';

        // 根據文檔規範：案主用灰色填充，一般人物用白色填充，死亡用黑色填充
        if (isDeceased) {
            this.ctx.fillStyle = '#333'; // 死亡：黑色填充
        } else if (isIdentifiedPatient) {
            this.ctx.fillStyle = '#cccccc'; // 案主：灰色填充
        } else {
            this.ctx.fillStyle = '#fff'; // 一般人物：白色填充
        }

        if (gender === 'female') {
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
        } else {
            this.ctx.fillRect(x - halfSize, y - halfSize, size, size);
        }

        // 繪製醫學符號 (若未過世)
        if (!isDeceased && medical) {
            this.drawMedicalSymbols(x, y, size, gender, medical);
        }

        // 重新繪製邊框 (確保清晰)
        if (gender === 'female') {
            this.ctx.beginPath();
            this.ctx.arc(x, y, halfSize, 0, Math.PI * 2);
            this.ctx.stroke();

            if (isHighlighted) {
                this.ctx.save();
                this.ctx.strokeStyle = '#28a745';
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.arc(x, y, halfSize + 5, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.restore();
            }
        } else if (gender === 'pregnancy') {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y - halfSize);
            this.ctx.lineTo(x + halfSize, y + halfSize);
            this.ctx.lineTo(x - halfSize, y + halfSize);
            this.ctx.closePath();
            this.ctx.stroke();

            if (isHighlighted) {
                this.ctx.save();
                this.ctx.strokeStyle = '#28a745';
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.moveTo(x, y - halfSize - 5);
                this.ctx.lineTo(x + halfSize + 5, y + halfSize + 5);
                this.ctx.lineTo(x - halfSize - 5, y + halfSize + 5);
                this.ctx.closePath();
                this.ctx.stroke();
                this.ctx.restore();
            }
        } else {
            this.ctx.strokeRect(x - halfSize, y - halfSize, size, size);

            if (isHighlighted) {
                this.ctx.save();
                this.ctx.strokeStyle = '#28a745';
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(x - halfSize - 5, y - halfSize - 5, size + 10, size + 10);
                this.ctx.restore();
            }
        }


        // 過世標記 X
        if (isDeceased) {
            this.ctx.strokeStyle = '#fff';
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
        if (age !== null && age !== '') {
            this.ctx.shadowBlur = 0;
            this.ctx.font = `bold ${this.fontSize}px ${this.fontFamily}`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = isDeceased ? '#fff' : '#333';
            // 如果只有中心點，可以畫旁邊？或是覆蓋？
            // 這裡保持覆蓋，由使用者決定
            this.ctx.fillText(String(age), x, y);
        }

        // 姓名
        if (name) {
            this.ctx.shadowBlur = 0;
            this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';
            this.ctx.fillStyle = '#333';
            this.ctx.fillText(name, x, y + halfSize + 8);
        }

        this.ctx.restore();
    }

    /**
     * 繪製醫學符號
     */
    drawMedicalSymbols(x, y, size, gender, medical) {
        const halfSize = size / 2;

        this.ctx.save();
        this.ctx.beginPath();
        if (gender === 'female') {
            this.ctx.arc(x, y, halfSize, 0, Math.PI * 2);
        } else if (gender === 'pregnancy') {
            this.ctx.moveTo(x, y - halfSize);
            this.ctx.lineTo(x + halfSize, y + halfSize);
            this.ctx.lineTo(x - halfSize, y + halfSize);
            this.ctx.closePath();
        } else {
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

        // 中心符號
        this.ctx.fillStyle = '#333';
        this.ctx.strokeStyle = '#333';
        if (medical.centerSymbol === 'dot') {
            this.ctx.beginPath();
            this.ctx.arc(x, y, 4, 0, Math.PI * 2);
            this.ctx.fill();
        } else if (medical.centerSymbol === 'cross') {
            const s = 6;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x - s, y - s);
            this.ctx.lineTo(x + s, y + s);
            this.ctx.moveTo(x + s, y - s);
            this.ctx.lineTo(x - s, y + s);
            this.ctx.stroke();
        } else if (medical.centerSymbol === 'question') {
            this.ctx.font = 'bold 16px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('?', x, y);
        }

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
            if (gender === 'female') {
                // 圓形內縮一點
                tx -= 4;
                ty -= 4;
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
     * 繪製關係線
     */
    /**
     * 繪製關係線
     */
    /**
     * 繪製關係線
     */
    drawRelationship(fromPerson, toPerson, relationship, isSelected = false, persons = []) {
        const style = relationship.getLineStyle();
        const category = relationship.getCategory();

        this.ctx.save();

        // 如果被選中，繪製高亮外框
        if (isSelected) {
            this.ctx.save();
            this.ctx.strokeStyle = '#4a90d9';
            this.ctx.lineWidth = style.width + 4;
            this.ctx.globalAlpha = 0.3;
            if (category === 'marriage') {
                // 選取高亮：直接連結中點（左右）
                const fromPoint = fromPerson.x < toPerson.x ? fromPerson.getConnectionPoint('right') : fromPerson.getConnectionPoint('left');
                const toPoint = fromPerson.x < toPerson.x ? toPerson.getConnectionPoint('left') : toPerson.getConnectionPoint('right');
                this.ctx.beginPath();
                this.ctx.moveTo(fromPoint.x, fromPoint.y);
                this.ctx.lineTo(toPoint.x, toPoint.y);
                this.ctx.stroke();
            } else {
                // 情感關係高亮也需要遵循避讓路徑
                const path = this.getSmartPath(fromPerson, toPerson, persons);
                this.ctx.beginPath();

                if (path.length > 0) {
                    this.ctx.moveTo(path[0].x, path[0].y);
                    for (let i = 1; i < path.length; i++) {
                        this.ctx.lineTo(path[i].x, path[i].y);
                    }
                }

                this.ctx.stroke();
            }
            this.ctx.restore();
        }

        this.ctx.strokeStyle = style.color;
        this.ctx.lineWidth = style.width;

        // 計算連接點
        let fromPoint, toPoint;

        if (category === 'family') {
            // 親子關係：上下連接
            if (fromPerson.y < toPerson.y) {
                fromPoint = fromPerson.getConnectionPoint('bottom');
                toPoint = toPerson.getConnectionPoint('top');
            } else {
                fromPoint = fromPerson.getConnectionPoint('top');
                toPoint = toPerson.getConnectionPoint('bottom');
            }
            this.drawStandardLine(fromPoint, toPoint, style);
        } else if (category === 'marriage') {
            // 婚姻關係：從側面連接 (呈現左右直線)
            if (fromPerson.x < toPerson.x) {
                fromPoint = fromPerson.getConnectionPoint('right');
                toPoint = toPerson.getConnectionPoint('left');
            } else {
                fromPoint = fromPerson.getConnectionPoint('left');
                toPoint = toPerson.getConnectionPoint('right');
            }
            this.drawMarriageLine(fromPoint, toPoint, style);
        } else {
            // 情感關係：使用智慧路徑
            this.drawEmotionalLine(fromPerson, toPerson, style, persons);
        }

        this.ctx.restore();
    }

    /**
     * 繪製標準直線（用於親子關係等）
     */
    drawStandardLine(from, to, style) {
        const midY = (from.y + to.y) / 2;
        this.ctx.setLineDash(this.getLineDash(style.pattern));
        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(from.x, midY);
        this.ctx.lineTo(to.x, midY);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.stroke();
    }

    /**
     * 取得虛線樣式
     */
    getLineDash(pattern) {
        switch (pattern) {
            case 'dashed': return [8, 4];
            case 'dotted': return [3, 3];
            default: return [];
        }
    }

    /**
     * 繪製婚姻關係線
     */
    drawMarriageLine(from, to, style) {
        this.ctx.setLineDash(this.getLineDash(style.pattern));

        // 繪製主線（左右直線）
        const centerX = (from.x + to.x) / 2;
        const centerY = (from.y + to.y) / 2;

        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.stroke();

        this.ctx.setLineDash([]); // 重置虛線以繪製裝飾

        // 裝飾
        // 使用前面計算好的 centerX, centerY

        if (style.decoration === 'slash') {
            this.drawSlash(centerX, centerY);
        } else if (style.decoration === 'double-slash') {
            // 兩條短斜線（根據文檔：離婚和分居）
            const slashSize = 8;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX - slashSize, centerY - slashSize);
            this.ctx.lineTo(centerX + slashSize, centerY + slashSize);
            this.ctx.moveTo(centerX + slashSize, centerY - slashSize);
            this.ctx.lineTo(centerX - slashSize, centerY + slashSize);
            this.ctx.stroke();
        } else if (style.decoration === 'x') {
            this.drawX(centerX, centerY);
        }
    }

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
     * 計算避開障礙物的路徑 (使用二次貝茲曲線)
     */
    getSmartPath(fromPerson, toPerson, persons) {
        // 設定起點和終點（考慮圓半徑，讓線條從圓周出發）
        const radius = this.personSize / 2 + 5;
        const angle = Math.atan2(toPerson.y - fromPerson.y, toPerson.x - fromPerson.x);

        const start = {
            x: fromPerson.x + Math.cos(angle) * radius,
            y: fromPerson.y + Math.sin(angle) * radius
        };
        const end = {
            x: toPerson.x - Math.cos(angle) * radius,
            y: toPerson.y - Math.sin(angle) * radius
        };

        const defaultPath = [start, end];

        // 簡單檢查：如果沒有傳入 persons，直接返回直線
        if (!persons || persons.length === 0) return defaultPath;

        const collisions = [];
        const padding = this.personSize / 2 + 15; // 人物半徑 + 緩衝

        // 檢查所有其他人物是否在直線路徑上 (使用較寬的檢測範圍)
        persons.forEach(p => {
            if (p.id === fromPerson.id || p.id === toPerson.id) return;
            // 跳過已經死亡的人? 不，死亡的人也是障礙物

            const dist = this.distanceToSegment(p, start, end);
            if (dist < padding) {
                collisions.push(p);
            }
        });

        if (collisions.length === 0) return defaultPath;

        // 有碰撞，計算貝茲曲線控制點
        // 找出碰撞者中最低的 Y 座標
        let maxObstacleY = -Infinity;
        collisions.forEach(p => {
            maxObstacleY = Math.max(maxObstacleY, p.y + this.personSize / 2);
        });

        const safeY = maxObstacleY + 40; // 安全高度
        const midX = (start.x + end.x) / 2;

        // 二次貝茲曲線公式: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
        // 在 t=0.5 時，曲線最低點 B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2
        // 我們希望 B(0.5).y = safeY
        // 所以: safeY = 0.25*start.y + 0.5*ctrl.y + 0.25*end.y
        // 0.5*ctrl.y = safeY - 0.25*(start.y + end.y)
        // ctrl.y = 2*safeY - 0.5*(start.y + end.y)

        const ctrlY = 2 * safeY - 0.5 * (start.y + end.y);

        // 為了避免曲線太過尖銳，如果 ctrlY 太遠，我們可以調整 X 讓它變寬? 
        // 暫時保持 midX，通常夠用。

        const control = { x: midX, y: ctrlY };

        // 生成曲線點 (細分 30 段)
        const curvePoints = [];
        const segments = 30;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const t1 = 1 - t;
            // B(t) = t1^2 * P0 + 2 * t1 * t * P1 + t^2 * P2
            const x = t1 * t1 * start.x + 2 * t1 * t * control.x + t * t * end.x;
            const y = t1 * t1 * start.y + 2 * t1 * t * control.y + t * t * end.y;
            curvePoints.push({ x, y });
        }

        return curvePoints;
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
        this.ctx.setLineDash([]);

        // 3. 繪製裝飾 (在路徑中點)
        if (style.decoration) {
            // 計算總長度與中點
            const totalLen = this.getPathLength(path);
            const midDist = totalLen / 2;

            // 取得中點座標與切向量 (用於旋轉裝飾)
            const midInfo = this.getPointInfoAtDistance(path, midDist);
            const midPt = midInfo.point;
            const tangent = midInfo.tangent; // {x, y} normalized

            // 計算一個小片段的方向來畫箭頭或符號
            const decorSize = 10;
            const sx = midPt.x - tangent.x * decorSize;
            const sy = midPt.y - tangent.y * decorSize;
            const ex = midPt.x + tangent.x * decorSize;
            const ey = midPt.y + tangent.y * decorSize;

            if (style.decoration === 'bars') {
                this.drawBars(sx, sy, ex, ey);
            } else if (style.decoration === 'arrow') {
                // 箭頭畫在終點前一點
                const endInfo = this.getPointInfoAtDistance(path, totalLen - 15);
                const endPt = endInfo.point;
                const endTan = endInfo.tangent;
                this.drawArrow(
                    endPt.x - endTan.x * 10,
                    endPt.y - endTan.y * 10,
                    endPt.x + endTan.x * 10,
                    endPt.y + endTan.y * 10,
                    true
                );
            } else if (style.decoration === 'box-arrow') {
                // 類似 logic
            } else if (style.decoration === 'circle-arrow') {
                // 類似 logic
            } else if (style.decoration === 'solid-above') {
                // 特殊：沿著整條路徑畫一條平行線
                this.drawParallelPath(path, -6); // 上方 6px
            } else if (style.decoration === 'close-parallel') {
                // 衝突又親密：上下各一條平行綠線
                this.ctx.save();
                this.ctx.strokeStyle = style.decorationColor || '#4caf50';
                this.drawParallelPath(path, -6);
                this.drawParallelPath(path, 6);
                this.ctx.restore();
            } else if (style.decoration === 'diagonal-bars') {
                this.drawDiagonalBars(sx, sy, ex, ey);
            } else if (style.decoration === 'cross-bars') {
                // Hostile: 實線加十字
                // 在中點畫十字
                this.drawCrossBar(midPt.x, midPt.y);
            } else if (style.decoration === 'vertical-bar') {
                // Cutoff legacy decoration check
                // 但 cutoff 主要是 pattern 'cutoff-line'
            }
        }
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
        const complexPatterns = ['wave', 'zigzag', 'double', 'triple', 'cutoff-line', 'gap-bar'];

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
            this.drawParallelPath(path, 2);
            this.drawParallelPath(path, -2);
        } else if (style.pattern === 'triple') {
            this.drawParallelPath(path, 0);
            this.drawParallelPath(path, 3);
            this.drawParallelPath(path, -3);
        } else if (style.pattern === 'wave') {
            const lines = style.lines || 1;
            this.drawWaveOnPath(path, totalLen, lines);
        } else if (style.pattern === 'zigzag') {
            this.drawZigzagOnPath(path, totalLen);
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
     */
    drawWaveOnPath(path, totalLen, lines = 1) {
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
                const waveOffset = Math.sin(phase) * amplitude;

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
    drawZigzagOnPath(path, totalLen) {
        const amplitude = 5;
        const wavelength = 10;
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

            const offset = offsetFactor * amplitude;

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
     * 繪製十字 (用於 Hostile)
     */
    drawCrossBar(x, y) {
        const s = 8;
        this.ctx.save();
        this.ctx.setLineDash([]);
        this.ctx.lineWidth = 2;
        // 垂直線
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - s);
        this.ctx.lineTo(x, y + s);
        this.ctx.stroke();
        // 水平線
        this.ctx.beginPath();
        this.ctx.moveTo(x - s, y);
        this.ctx.lineTo(x + s, y);
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
        const frequency = 20;
        const amplitude = 5;
        const steps = Math.ceil(distance / 2);

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
     * 繪製帶有斷點和豎線的線 (Cutoff)
     */
    drawGapBarLine(x1, y1, x2, y2) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx);
        const gapSize = 20;

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

        // 畫中間的豎線（阻斷）
        const barSize = 10;
        const barNx = -Math.sin(angle) * barSize;
        const barNy = Math.cos(angle) * barSize; // 其實垂直向量

        // 不對，前面垂直向量計算有誤，重算
        // 垂直向量 (vx, vy) = (-dy, dx) normalized
        const len = Math.sqrt(dx * dx + dy * dy);
        const perpX = -dy / len * barSize;
        const perpY = dx / len * barSize;

        // 在 gapStart 和 gapEnd 各畫一條豎線，或者中間畫一條？
        // Cutoff 通常是 gap 中間有一條線，或者兩段線中間斷開。
        // 用戶提供的圖示是 "Cutoff/Estranged":  □ -- || -- ○ (兩條豎線)
        // 讓我畫兩條豎線在 gap 中間

        const bar1X = midX - Math.cos(angle) * 3;
        const bar1Y = midY - Math.sin(angle) * 3;
        const bar2X = midX + Math.cos(angle) * 3;
        const bar2Y = midY + Math.sin(angle) * 3;

        this.ctx.beginPath();
        this.ctx.moveTo(bar1X + perpX, bar1Y + perpY);
        this.ctx.lineTo(bar1X - perpX, bar1Y - perpY);
        this.ctx.moveTo(bar2X + perpX, bar2Y + perpY);
        this.ctx.lineTo(bar2X - perpX, bar2Y - perpY);
        this.ctx.stroke();
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
        this.ctx.setLineDash([]);
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
        const segments = Math.max(4, Math.floor(length / 15));
        const segmentLength = length / segments;
        const amplitude = 6;

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



    /**
     * 匯出為 PNG 圖片（含關係圖例）
     */
    exportToPNG(persons, relationships, households = []) {
        // 計算內容邊界
        if (persons.length === 0) {
            return null;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        persons.forEach(p => {
            const halfSize = this.personSize / 2 + 30;
            minX = Math.min(minX, p.x - halfSize);
            minY = Math.min(minY, p.y - halfSize);
            maxX = Math.max(maxX, p.x + halfSize);
            maxY = Math.max(maxY, p.y + halfSize + 20);
        });

        // 考慮 households 的範圍
        if (households && households.length > 0) {
            households.forEach(household => {
                const members = household.ids.map(id => persons.find(p => p.id === id)).filter(p => p);
                if (members.length > 0) {
                    const padding = 40;
                    const xs = members.map(m => m.x);
                    const ys = members.map(m => m.y);
                    const hMinX = Math.min(...xs) - this.personSize / 2 - padding;
                    const hMaxX = Math.max(...xs) + this.personSize / 2 + padding;
                    const hMinY = Math.min(...ys) - this.personSize / 2 - padding;
                    const hMaxY = Math.max(...ys) + this.personSize / 2 + padding;
                    minX = Math.min(minX, hMinX);
                    minY = Math.min(minY, hMinY);
                    maxX = Math.max(maxX, hMaxX);
                    maxY = Math.max(maxY, hMaxY);
                }
            });
        }

        const padding = 40;
        const contentWidth = maxX - minX + padding * 2;
        const contentHeight = maxY - minY + padding * 2;

        // ===== 圖例設定 =====
        const legendWidth = 170;
        const legendPadding = 20;
        const legendHeight = 520;

        // 總畫布尺寸（內容 + 圖例）
        const totalWidth = contentWidth + legendWidth + legendPadding;
        const totalHeight = Math.max(contentHeight, legendHeight + padding * 2);

        // 建立臨時畫布
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = totalWidth * 2; // 高解析度
        exportCanvas.height = totalHeight * 2;
        const exportCtx = exportCanvas.getContext('2d');
        exportCtx.scale(2, 2);

        // 白色背景
        exportCtx.fillStyle = '#fff';
        exportCtx.fillRect(0, 0, totalWidth, totalHeight);

        // 暫時切換 context
        const originalCtx = this.ctx;
        this.ctx = exportCtx;

        // 平移到內容區域
        this.ctx.save();
        this.ctx.translate(-minX + padding, -minY + padding);

        // 分類關係
        const familyRels = [];
        const otherRels = [];

        relationships.forEach(rel => {
            const category = typeof rel.getCategory === 'function' ? rel.getCategory() : Relationship.getCategory(rel.type);
            if (category === 'family') {
                familyRels.push(rel);
            } else {
                otherRels.push(rel);
            }
        });

        // 1. 先繪製親子關係 (樹狀結構) - 底層
        this.drawFamilies(familyRels, persons, otherRels);

        // 2. 繪製非親子關係 (婚姻、情感) - 表層
        otherRels.forEach(rel => {
            const fromPerson = persons.find(p => p.id === rel.fromPersonId);
            const toPerson = persons.find(p => p.id === rel.toPersonId);
            if (fromPerson && toPerson) {
                this.drawRelationship(fromPerson, toPerson, rel, false);
            }
        });

        // 3. 繪製人物
        persons.forEach(person => {
            this.drawPerson(person, false, false, false);
        });

        // 4. 繪製同住家庭圈選
        if (households && households.length > 0) {
            this.drawHouseholds(households, persons, false, null);
        }

        this.ctx.restore();

        // ===== 5. 繪製圖例 =====
        const legendX = contentWidth + legendPadding / 2;
        const legendY = Math.max(padding, (totalHeight - legendHeight) / 2);
        this.drawExportLegend(exportCtx, legendX, legendY);

        // 還原 context
        this.ctx = originalCtx;

        return exportCanvas.toDataURL('image/png');
    }

    /**
     * 繪製匯出用的關係圖例
     */
    drawExportLegend(ctx, x, y) {
        const padding = 16;
        const lineHeight = 26;
        const lineWidth = 40;
        const fontSize = 13;
        const titleFontSize = 15;
        const sectionGap = 16;

        // 圖例資料
        const legendData = {
            marriage: {
                title: '婚姻關係',
                items: [
                    { label: '結婚', style: 'solid', color: '#6699CC' },
                    { label: '同居', style: 'dotted', color: '#66AA66' },
                    { label: '分居', style: 'dashed', color: '#DDAA00' },
                    { label: '離婚', style: 'solid', color: '#CC4444', marker: 'x' },
                    { label: '喪偶', style: 'solid', color: '#666666', marker: 'x-double' }
                ]
            },
            emotional: {
                title: '情感關係',
                items: [
                    { label: '正向關係', style: 'solid', color: '#4CAF50', lines: 1 },
                    { label: '親密', style: 'solid', color: '#4CAF50', lines: 2 },
                    { label: '過度親密', style: 'solid', color: '#4CAF50', lines: 4 },
                    { label: '關係疏離', style: 'dotted', color: '#666666', lines: 1 },
                    { label: '衝突', style: 'wave', color: '#E53935', lines: 1 },
                    { label: '關係惡化', style: 'cross', color: '#4CAF50', lines: 1 },
                    { label: '溝通中斷', style: 'broken', color: '#666666', lines: 1 },
                    { label: '衝突又親密', style: 'conflict-close' },
                    { label: '虐待', style: 'wave', color: '#5C6BC0', lines: 1 },
                    { label: '暴力', style: 'wave', color: '#E53935', lines: 2 }
                ]
            }
        };

        // 計算總高度
        const marriageCount = legendData.marriage.items.length;
        const emotionalCount = legendData.emotional.items.length;
        const totalHeight = (marriageCount + emotionalCount) * lineHeight +
            titleFontSize * 2 + sectionGap * 3 + padding * 2;
        const totalWidth = 160;

        // 繪製背景（圓角矩形）
        ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
        ctx.strokeStyle = '#CCCCCC';
        ctx.lineWidth = 1;

        const radius = 8;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + totalWidth - radius, y);
        ctx.quadraticCurveTo(x + totalWidth, y, x + totalWidth, y + radius);
        ctx.lineTo(x + totalWidth, y + totalHeight - radius);
        ctx.quadraticCurveTo(x + totalWidth, y + totalHeight, x + totalWidth - radius, y + totalHeight);
        ctx.lineTo(x + radius, y + totalHeight);
        ctx.quadraticCurveTo(x, y + totalHeight, x, y + totalHeight - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        let currentY = y + padding;

        // ===== 繪製婚姻關係 =====
        ctx.fillStyle = '#333333';
        ctx.font = `bold ${titleFontSize}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
        ctx.fillText(legendData.marriage.title, x + padding, currentY + titleFontSize);
        currentY += titleFontSize + padding;

        legendData.marriage.items.forEach(item => {
            this.drawLegendItem(ctx, x + padding, currentY, lineWidth, item);
            ctx.fillStyle = '#333333';
            ctx.font = `${fontSize}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
            ctx.fillText(item.label, x + padding + lineWidth + 12, currentY + 4);
            currentY += lineHeight;
        });

        currentY += sectionGap;

        // ===== 繪製情感關係 =====
        ctx.fillStyle = '#333333';
        ctx.font = `bold ${titleFontSize}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
        ctx.fillText(legendData.emotional.title, x + padding, currentY + titleFontSize);
        currentY += titleFontSize + padding;

        legendData.emotional.items.forEach(item => {
            this.drawLegendItem(ctx, x + padding, currentY, lineWidth, item);
            ctx.fillStyle = '#333333';
            ctx.font = `${fontSize}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
            ctx.fillText(item.label, x + padding + lineWidth + 12, currentY + 4);
            currentY += lineHeight;
        });
    }

    /**
     * 繪製單條圖例線
     */
    drawLegendItem(ctx, x, y, width, item) {
        ctx.save();
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        // 設定線條樣式
        if (item.style === 'dotted') {
            ctx.setLineDash([2, 4]);
        } else if (item.style === 'dashed') {
            ctx.setLineDash([8, 4]);
        } else {
            ctx.setLineDash([]);
        }

        const lines = item.lines || 1;
        const gap = 3;
        const startY = y - ((lines - 1) * gap) / 2;

        if (item.style === 'wave' || item.style === 'wave-double') {
            ctx.setLineDash([]);
            const lineCount = item.style === 'wave-double' ? 2 : (item.lines || 1);
            for (let i = 0; i < lineCount; i++) {
                const offsetY = (i - (lineCount - 1) / 2) * 4; // 間距 4px
                this.drawLegendWave(ctx, x, startY + offsetY, width);
            }
        } else if (item.style === 'conflict-close') {
            // 衝突又親密：紅色波浪 + 上下各一條綠線
            ctx.setLineDash([]);
            // 1. 中間紅色波浪
            ctx.strokeStyle = '#E53935';
            this.drawLegendWave(ctx, x, y, width);
            // 2. 上下綠線
            ctx.strokeStyle = '#4CAF50';
            ctx.beginPath();
            ctx.moveTo(x, y - 5);
            ctx.lineTo(x + width, y - 5);
            ctx.moveTo(x, y + 5);
            ctx.lineTo(x + width, y + 5);
            ctx.stroke();
        } else if (item.label === '結婚' || item.label === '同居' || item.label === '訂婚') {
            // 直線圖例 (配合新的「左右」風格)
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + width, y);
            ctx.stroke();
        } else if (item.style === 'broken') {
            // 中斷線
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + width * 0.35, y);
            ctx.moveTo(x + width * 0.65, y);
            ctx.lineTo(x + width, y);
            ctx.stroke();
            // 中斷標記
            ctx.beginPath();
            ctx.moveTo(x + width * 0.42, y - 5);
            ctx.lineTo(x + width * 0.58, y + 5);
            ctx.stroke();
        } else if (item.style === 'cross') {
            // 帶叉的線
            ctx.setLineDash([]);
            for (let i = 0; i < lines; i++) {
                ctx.beginPath();
                ctx.moveTo(x, startY + i * gap);
                ctx.lineTo(x + width, startY + i * gap);
                ctx.stroke();
            }
            // 叉叉
            const crossX = x + width / 2;
            ctx.beginPath();
            ctx.moveTo(crossX - 5, y - 5);
            ctx.lineTo(crossX + 5, y + 5);
            ctx.moveTo(crossX + 5, y - 5);
            ctx.lineTo(crossX - 5, y + 5);
            ctx.stroke();
        } else {
            // 普通直線
            for (let i = 0; i < lines; i++) {
                ctx.beginPath();
                ctx.moveTo(x, startY + i * gap);
                ctx.lineTo(x + width, startY + i * gap);
                ctx.stroke();
            }
        }

        // 繪製標記（X）
        if (item.marker === 'x') {
            ctx.setLineDash([]);
            const markerX = x + width / 2;
            ctx.beginPath();
            ctx.moveTo(markerX - 5, y - 5);
            ctx.lineTo(markerX + 5, y + 5);
            ctx.moveTo(markerX + 5, y - 5);
            ctx.lineTo(markerX - 5, y + 5);
            ctx.stroke();
        } else if (item.marker === 'x-double') {
            ctx.setLineDash([]);
            const markerX = x + width / 2 - 6;
            // 第一個 X
            ctx.beginPath();
            ctx.moveTo(markerX - 4, y - 4);
            ctx.lineTo(markerX + 4, y + 4);
            ctx.moveTo(markerX + 4, y - 4);
            ctx.lineTo(markerX - 4, y + 4);
            ctx.stroke();
            // 第二個 X
            ctx.beginPath();
            ctx.moveTo(markerX + 8, y - 4);
            ctx.lineTo(markerX + 16, y + 4);
            ctx.moveTo(markerX + 16, y - 4);
            ctx.lineTo(markerX + 8, y + 4);
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * 繪製圖例用波浪線
     */
    drawLegendWave(ctx, x, y, width) {
        const amplitude = 3;
        const wavelength = 10;
        const waves = Math.floor(width / wavelength);

        ctx.beginPath();
        ctx.moveTo(x, y);

        for (let i = 0; i < waves; i++) {
            const startX = x + i * wavelength;
            ctx.quadraticCurveTo(
                startX + wavelength * 0.25, y - amplitude,
                startX + wavelength * 0.5, y
            );
            ctx.quadraticCurveTo(
                startX + wavelength * 0.75, y + amplitude,
                startX + wavelength, y
            );
        }

        ctx.stroke();
    }



    /**
     * 繪製家庭樹狀結構 (親子關係)
     */
    drawFamilies(familyRels, persons, otherRels, selectedRelationshipId = null) {
        // 1. 整理每個孩子的父母
        const childParents = {}; // childId -> [parentId, parentId]

        familyRels.forEach(rel => {
            const p1 = persons.find(p => p.id === rel.fromPersonId);
            const p2 = persons.find(p => p.id === rel.toPersonId);
            if (!p1 || !p2) return;

            let parentId, childId;
            // 自動判斷方向：Y軸位置較高(數值較小)的是父母
            if (p1.y < p2.y) {
                parentId = p1.id;
                childId = p2.id;
            } else {
                parentId = p2.id;
                childId = p1.id;
            }

            if (!childParents[childId]) childParents[childId] = [];
            if (!childParents[childId].includes(parentId)) {
                childParents[childId].push(parentId);
            }
        });

        // 2. 依照父母組合分組家庭
        const families = {}; // key -> { parents: [], children: [] }

        Object.keys(childParents).forEach(childId => {
            const parents = childParents[childId].sort();
            const key = parents.join('_');

            if (!families[key]) {
                families[key] = { parents: parents, children: [] };
            }
            families[key].children.push(childId);
        });

        // 3. 繪製
        Object.values(families).forEach(fam => {
            const parentIds = fam.parents;
            const childIds = fam.children;

            // 取得物件
            const parentObjs = parentIds.map(id => persons.find(p => p.id === id)).filter(p => p);
            const childObjs = childIds.map(id => persons.find(p => p.id === id)).filter(p => p);

            if (parentObjs.length === 0 || childObjs.length === 0) return;

            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([]); // 實線

            let sourceX, sourceY;

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
                    // 從婚姻線中間往下 (現在婚姻線是左右直線，從中心出發)
                    sourceX = (p1.x + p2.x) / 2;
                    sourceY = (p1.y + p2.y) / 2;
                } else {
                    // 無婚姻線，假定為共同父母
                    // 畫一條隱形連接線 (虛線)
                    this.ctx.save();
                    this.ctx.strokeStyle = '#999';
                    this.ctx.setLineDash([3, 3]);
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                    this.ctx.restore();

                    sourceX = (p1.x + p2.x) / 2;
                    sourceY = (p1.y + p2.y) / 2;
                }
            } else {
                // 單親
                const p = parentObjs[0];
                sourceX = p.x;
                sourceY = p.y + this.personSize / 2;
            }

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

            // 繪製 Source -> Bar 的垂直線
            this.ctx.beginPath();
            this.ctx.moveTo(sourceX, sourceY);
            if (barY > sourceY) {
                this.ctx.lineTo(sourceX, barY);
            } else {
                this.ctx.lineTo(sourceX, sourceY + 10);
            }
            this.ctx.stroke();

            // 繪製橫槓 (涵蓋所有孩子 X 範圍 + 父母來源點)
            const allX = [...childObjs.map(c => c.x), sourceX];
            const minX = Math.min(...allX);
            const maxX = Math.max(...allX);

            this.ctx.beginPath();
            this.ctx.moveTo(minX, barY);
            this.ctx.lineTo(maxX, barY);
            this.ctx.stroke();

            // 繪製 Bar -> 每个孩子 的垂直線
            childObjs.forEach(child => {
                const childTop = child.y - this.personSize / 2;
                this.ctx.beginPath();
                this.ctx.moveTo(child.x, barY);
                this.ctx.lineTo(child.x, childTop);
                this.ctx.stroke();
            });
        });
    }

    /**
     * 繪製同住家庭圈選
     * @param {Array} households - 家庭列表
     * @param {Array} persons - 人員列表
     * @param {boolean} applyTransformFlag - 是否應用變換（在匯出時通常為 false）
     * @param {string} selectedHouseholdId - 選中的圈選框 ID
     */
    drawHouseholds(households, persons, applyTransformFlag = true, selectedHouseholdId = null) {
        if (!households || households.length === 0) return;

        this.ctx.save();
        if (applyTransformFlag) {
            this.applyTransform(); // 應用縮放和平移（僅在正常渲染時）
        }
        this.ctx.setLineDash([15, 10]); // 更明顯的虛線
        this.ctx.lineWidth = 3;
        this.ctx.lineJoin = 'round';

        households.forEach(household => {
            const members = household.ids.map(id => persons.find(p => p.id === id)).filter(p => p);
            if (members.length === 0) return;

            const bounds = this.getHouseholdBounds(household, persons);
            if (!bounds) return;

            const { minX, minY, maxX, maxY } = bounds;
            const isSelected = selectedHouseholdId === household.id;

            // 如果被選中，先繪製高亮外框
            if (isSelected) {
                this.ctx.save();
                this.ctx.setLineDash([]);
                this.ctx.lineWidth = 5;
                this.ctx.strokeStyle = '#4a90d9';
                this.ctx.globalAlpha = 0.5;
                const radius = 30;
                this.ctx.beginPath();
                this.ctx.moveTo(minX + radius - 2, minY - 2);
                this.ctx.lineTo(maxX - radius + 2, minY - 2);
                this.ctx.quadraticCurveTo(maxX + 2, minY - 2, maxX + 2, minY + radius - 2);
                this.ctx.lineTo(maxX + 2, maxY - radius + 2);
                this.ctx.quadraticCurveTo(maxX + 2, maxY + 2, maxX - radius + 2, maxY + 2);
                this.ctx.lineTo(minX + radius - 2, maxY + 2);
                this.ctx.quadraticCurveTo(minX - 2, maxY + 2, minX - 2, maxY - radius + 2);
                this.ctx.lineTo(minX - 2, minY + radius - 2);
                this.ctx.quadraticCurveTo(minX - 2, minY - 2, minX + radius - 2, minY - 2);
                this.ctx.closePath();
                this.ctx.stroke();
                this.ctx.restore();
            }

            // 繪製實際的圈選框
            this.ctx.strokeStyle = isSelected ? '#4a90d9' : '#333'; // 選中時用藍色
            const radius = 30;
            this.ctx.beginPath();
            this.ctx.moveTo(minX + radius, minY);
            this.ctx.lineTo(maxX - radius, minY);
            this.ctx.quadraticCurveTo(maxX, minY, maxX, minY + radius);
            this.ctx.lineTo(maxX, maxY - radius);
            this.ctx.quadraticCurveTo(maxX, maxY, maxX - radius, maxY);
            this.ctx.lineTo(minX + radius, maxY);
            this.ctx.quadraticCurveTo(minX, maxY, minX, maxY - radius);
            this.ctx.lineTo(minX, minY + radius);
            this.ctx.quadraticCurveTo(minX, minY, minX + radius, minY);
            this.ctx.closePath();
            this.ctx.stroke();
        });

        this.ctx.restore();
    }

    /**
     * 計算圈選框的邊界
     * @param {Object} household - 圈選框對象
     * @param {Array} persons - 人員列表
     * @returns {Object|null} - {minX, minY, maxX, maxY, width, height} 或 null
     */
    getHouseholdBounds(household, persons) {
        const members = household.ids.map(id => persons.find(p => p.id === id)).filter(p => p);
        if (members.length === 0) return null;

        const padding = 40;
        const nameHeight = 20;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        members.forEach(m => {
            const halfSize = this.personSize / 2;
            minX = Math.min(minX, m.x - halfSize);
            maxX = Math.max(maxX, m.x + halfSize);
            minY = Math.min(minY, m.y - halfSize);
            maxY = Math.max(maxY, m.y + halfSize + (m.name ? nameHeight : 0));
        });

        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        return {
            minX, minY, maxX, maxY,
            width: maxX - minX,
            height: maxY - minY
        };
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
    isPointOnHouseholdBoundary(px, py, household, persons, tolerance = 20) {
        const bounds = this.getHouseholdBounds(household, persons);
        if (!bounds) return false;

        const { minX, minY, maxX, maxY } = bounds;
        const lineWidth = 3; // 邊界線寬度
        const totalTolerance = tolerance + lineWidth / 2;

        // 檢查點是否在矩形範圍內（包含內部區域，讓使用者更容易選取和拖曳）
        if (px >= minX - totalTolerance && px <= maxX + totalTolerance &&
            py >= minY - totalTolerance && py <= maxY + totalTolerance) {
            return true;
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
    getRelationshipPath(fromPerson, toPerson, relationship) {
        const style = relationship.getLineStyle();
        const category = relationship.getCategory();
        const points = [];

        if (category === 'family') {
            // 親子關係：L型路徑
            if (fromPerson.y < toPerson.y) {
                const fromPoint = fromPerson.getConnectionPoint('bottom');
                const toPoint = toPerson.getConnectionPoint('top');
                const midY = (fromPoint.y + toPoint.y) / 2;
                points.push(fromPoint);
                points.push({ x: fromPoint.x, y: midY });
                points.push({ x: toPoint.x, y: midY });
                points.push(toPoint);
            } else {
                const fromPoint = fromPerson.getConnectionPoint('top');
                const toPoint = toPerson.getConnectionPoint('bottom');
                const midY = (fromPoint.y + toPoint.y) / 2;
                points.push(fromPoint);
                points.push({ x: fromPoint.x, y: midY });
                points.push({ x: toPoint.x, y: midY });
                points.push(toPoint);
            }
        } else if (category === 'marriage') {
            // 婚姻關係：ㄇ字型路徑 (從底部)
            const fromPoint = fromPerson.getConnectionPoint('bottom');
            const toPoint = toPerson.getConnectionPoint('bottom');
            const midY = Math.min(fromPoint.y, toPoint.y) + 40;
            points.push(fromPoint);
            points.push({ x: fromPoint.x, y: midY });
            points.push({ x: toPoint.x, y: midY });
            points.push(toPoint);
        } else {
            // 情感關係：直線路徑
            const angle = Math.atan2(toPerson.y - fromPerson.y, toPerson.x - fromPerson.x);
            const radius = this.personSize / 2 + 5;
            const startX = fromPerson.x + Math.cos(angle) * radius;
            const startY = fromPerson.y + Math.sin(angle) * radius;
            const endX = toPerson.x - Math.cos(angle) * radius;
            const endY = toPerson.y - Math.sin(angle) * radius;
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
    isPointOnRelationship(px, py, fromPerson, toPerson, relationship, tolerance = 10) {
        const path = this.getRelationshipPath(fromPerson, toPerson, relationship);

        // 檢查每一段線段
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];
            const distance = this.distanceToLineSegment(px, py, p1.x, p1.y, p2.x, p2.y);
            if (distance <= tolerance) {
                return true;
            }
        }

        return false;
    }
}


