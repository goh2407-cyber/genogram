/**
 * GenogramCanvas 類別 - 管理畫布繪製
 */
class GenogramCanvas {
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
    render(persons, relationships, highlightedIds = [], selectedId = null, selectedRelationshipId = null, connectingFrom = null, selectedPersonIds = [], boxSelectStart = null, boxSelectEnd = null, households = [], selectedHouseholdId = null) {
        this.clear();

        this.ctx.save();
        this.applyTransform();

        // 1. 繪製同住家庭 (最底層)
        if (households && households.length > 0) {
            this.drawHouseholds(households, persons, relationships, false, selectedHouseholdId);
        }

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

        // 2. 繪製親子關係
        this.drawFamilies(familyRels, persons, otherRels, selectedRelationshipId);

        // 3. 繪製非親子關係
        otherRels.forEach(rel => {
            const fromPerson = persons.find(p => p.id === rel.fromPersonId);
            const toPerson = persons.find(p => p.id === rel.toPersonId);
            if (fromPerson && toPerson) {
                const isSelected = selectedRelationshipId === rel.id;
                // 傳入所有關係以便計算並行位移
                this.drawRelationship(fromPerson, toPerson, rel, isSelected, persons, relationships);
            }
        });

        // 4. 繪製正在連接的線
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

        // 5. 繪製人物
        persons.forEach(person => {
            const isSelected = selectedId === person.id;
            const isMultiSelected = (selectedPersonIds || []).includes(person.id);
            const isHighlighted = (highlightedIds || []).includes(person.id);
            const isConnecting = connectingFrom && connectingFrom.person.id === person.id;
            this.drawPerson(person, isSelected || isMultiSelected, isConnecting, isHighlighted);
        });

        // 6. 繪製多選邊框 (視覺提示可移動區域)
        if (selectedPersonIds && selectedPersonIds.length > 1) {
            this.drawMultiSelectionBounds(selectedPersonIds, persons);
        }

        // 7. 繪製範圍圈選框
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
        this.ctx.setLineDash([5, 5]);
        this.ctx.globalAlpha = 0.4;

        // 繪製一個淡淡的虛線框
        this.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // 在角落畫一點裝飾線，讓它看起來更像「選取範圍」
        const s = 10; // corner size
        this.ctx.globalAlpha = 0.8;
        this.ctx.setLineDash([]);

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
    drawRelationship(fromPerson, toPerson, relationship, isSelected = false, persons = [], allRelationships = []) {
        const style = relationship.getLineStyle();
        const category = relationship.getCategory();

        // [New] 計算多重關係位移 (Parallel Lines)
        let offset = 0;
        if (allRelationships.length > 0) {
            const samePairRels = allRelationships.filter(r =>
                (r.fromPersonId === fromPerson.id && r.toPersonId === toPerson.id) ||
                (r.fromPersonId === toPerson.id && r.toPersonId === fromPerson.id)
            );

            if (samePairRels.length > 1) {
                // 分類排序：結構類(Marriage/Family)居中，情感類(Emotional)位移
                const structuralRel = samePairRels.find(r => ['marriage', 'family'].includes(r.getCategory()));
                const emotionalRels = samePairRels.filter(r => r.getCategory() === 'emotional');

                if (category === 'emotional') {
                    const myIdx = emotionalRels.findIndex(r => r.id === relationship.id);
                    if (structuralRel) {
                        // 結構線在 0，情感線在兩側交替分佈
                        const gap = 18;
                        offset = (myIdx % 2 === 0) ? (Math.floor(myIdx / 2) + 1) * gap : -(Math.floor(myIdx / 2) + 1) * gap;
                    } else {
                        // 如果沒有結構線，則情感線對齊中央分佈
                        const gap = 18;
                        const total = emotionalRels.length;
                        offset = (myIdx - (total - 1) / 2) * gap;
                    }
                }
            }
        }

        this.ctx.save();

        // 如果被選中，繪製高亮外框
        if (isSelected) {
            this.ctx.save();
            this.ctx.strokeStyle = '#4a90d9';

            if (category === 'family') {
                // 親子關係高亮
                this.ctx.lineWidth = style.width + 10;
                this.ctx.globalAlpha = 0.8;
                let fromPoint, toPoint;
                if (fromPerson.y < toPerson.y) {
                    fromPoint = fromPerson.getConnectionPoint('bottom');
                    toPoint = toPerson.getConnectionPoint('top');
                } else {
                    fromPoint = fromPerson.getConnectionPoint('top');
                    toPoint = toPerson.getConnectionPoint('bottom');
                }
                const midY = (fromPoint.y + toPoint.y) / 2;
                this.ctx.beginPath();
                this.ctx.moveTo(fromPoint.x, fromPoint.y);
                this.ctx.lineTo(fromPoint.x, midY);
                this.ctx.lineTo(toPoint.x, midY);
                this.ctx.lineTo(toPoint.x, toPoint.y);
                this.ctx.stroke();
            } else if (category === 'marriage') {
                // 婚姻關係高亮
                this.ctx.lineWidth = style.width + 4;
                this.ctx.globalAlpha = 0.3;
                const fromPoint = fromPerson.x < toPerson.x ? fromPerson.getConnectionPoint('right') : fromPerson.getConnectionPoint('left');
                const toPoint = fromPerson.x < toPerson.x ? toPerson.getConnectionPoint('left') : toPerson.getConnectionPoint('right');

                // 套用位移
                if (offset !== 0) {
                    const dy = toPoint.y - fromPoint.y;
                    const dx = toPoint.x - fromPoint.x;
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;
                    const ux = dx / len;
                    const uy = dy / len;
                    fromPoint.x += -uy * offset; fromPoint.y += ux * offset;
                    toPoint.x += -uy * offset; toPoint.y += ux * offset;
                }

                this.ctx.beginPath();
                this.ctx.moveTo(fromPoint.x, fromPoint.y);
                this.ctx.lineTo(toPoint.x, toPoint.y);
                this.ctx.stroke();
            } else {
                // 情感關係高亮
                this.ctx.lineWidth = style.width + 4;
                this.ctx.globalAlpha = 0.3;
                let path = this.getSmartPath(fromPerson, toPerson, persons);

                // 套用位移到路徑中的所有點
                if (offset !== 0 && path.length >= 2) {
                    const dx = path[path.length - 1].x - path[0].x;
                    const dy = path[path.length - 1].y - path[0].y;
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

        // 計算實際繪製點
        let fromPoint, toPoint;

        if (category === 'family') {
            // 親子關係：上下連接 (不位移，通常只有一條親子線)
            if (fromPerson.y < toPerson.y) {
                fromPoint = fromPerson.getConnectionPoint('bottom');
                toPoint = toPerson.getConnectionPoint('top');
            } else {
                fromPoint = fromPerson.getConnectionPoint('top');
                toPoint = toPerson.getConnectionPoint('bottom');
            }
            this.drawStandardLine(fromPoint, toPoint, style);
        } else if (category === 'marriage') {
            // 婚姻關係
            if (fromPerson.x < toPerson.x) {
                fromPoint = fromPerson.getConnectionPoint('right');
                toPoint = toPerson.getConnectionPoint('left');
            } else {
                fromPoint = fromPerson.getConnectionPoint('left');
                toPoint = toPerson.getConnectionPoint('right');
            }

            // 套用位移
            if (offset !== 0) {
                const dx = toPoint.x - fromPoint.x;
                const dy = toPoint.y - fromPoint.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                fromPoint.x += -uy * offset; fromPoint.y += ux * offset;
                toPoint.x += -uy * offset; toPoint.y += ux * offset;
            }
            this.drawMarriageLine(fromPoint, toPoint, style);
        } else {
            // 情感關係：手動套用位移到路徑
            let path = this.getSmartPath(fromPerson, toPerson, persons);
            if (offset !== 0 && path.length >= 2) {
                const dx = path[path.length - 1].x - path[0].x;
                const dy = path[path.length - 1].y - path[0].y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                path = path.map(pt => ({
                    x: pt.x + (-uy * offset),
                    y: pt.y + (ux * offset)
                }));
            }
            // 這裡不能直接呼叫 drawEmotionalLine，因為它內部會重新取得 SmartPath
            // 我們直接使用已位移的路徑點繪製
            this.ctx.setLineDash(this.getLineDash(style.pattern));
            this.drawPatternOnPath(path, style);
            this.ctx.setLineDash([]);

            // 繪製裝飾 (邏輯同 drawEmotionalLine 但使用位移後的 path)
            this.drawEmotionalDecorations(path, style);
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
     * [Refined] 取得關係路徑 - 預設回傳直線以保持畫面整潔
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
        this.ctx.setLineDash([]);

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
            // 控制 (Controlling)
            const endInfo = this.getPointInfoAtDistance(path, totalLen - 10);
            const endPt = endInfo.point;
            const endTan = endInfo.tangent;
            this.drawBoxArrow(
                endPt.x - endTan.x * 12,
                endPt.y - endTan.y * 12,
                endPt.x,
                endPt.y
            );
        } else if (style.decoration === 'circle-arrow') {
            // 崇拜 (Admiration)
            this.ctx.save();
            this.ctx.fillStyle = 'white';
            this.ctx.strokeStyle = style.color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(midPt.x, midPt.y, 6, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();

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
        } else if (style.decoration === 'solid-above') {
            this.drawParallelPath(path, -6);
        } else if (style.decoration === 'close-parallel') {
            this.ctx.save();
            this.ctx.strokeStyle = style.decorationColor || '#4caf50';
            this.drawParallelPath(path, -6);
            this.drawParallelPath(path, 6);
            this.ctx.restore();
        } else if (style.decoration === 'diagonal-bars') {
            this.drawDiagonalBars(sx, sy, ex, ey);
        } else if (style.decoration === 'cross-bars') {
            const p1 = this.getPointInfoAtDistance(path, totalLen * 0.35);
            const p2 = this.getPointInfoAtDistance(path, totalLen * 0.65);
            this.drawCrossBar(p1.point.x, p1.point.y);
            this.drawCrossBar(p2.point.x, p2.point.y);
        } else if (style.decoration === 'vertical-bar') {
            this.drawGapBarLine(sx, sy, ex, ey);
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
     * 繪製交叉標記 (用於 敵對)
     */
    drawCrossBar(x, y) {
        const s = 5;
        this.ctx.save();
        this.ctx.setLineDash([]);
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

        // 1. 每個人物的影響範圍 (包含名字高度)
        persons.forEach(p => {
            const halfSize = this.personSize / 2 + 10;
            minX = Math.min(minX, p.x - halfSize);
            minY = Math.min(minY, p.y - halfSize);
            maxX = Math.max(maxX, p.x + halfSize);
            maxY = Math.max(maxY, p.y + halfSize + 30); // 留點空間給名字
        });

        // 2. 考慮 households 的實際邊界 (hullPoints)
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

        // 加上安全邊距
        const margin = 50;
        minX -= margin;
        minY -= margin;
        maxX += margin;
        maxY += margin;

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;

        // ===== 圖例設定 =====
        const legendWidth = 240;
        const legendPadding = 40;
        const legendHeight = 850;

        // 總畫布尺寸
        const totalWidth = contentWidth + legendWidth + legendPadding;
        const totalHeight = Math.max(contentHeight, legendHeight + margin * 2);

        // 建立臨時畫布 (提高解析度 3x)
        const exportCanvas = document.createElement('canvas');
        const exportScale = 3;
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

        // 1. 先繪製同住家庭 (最底層)
        if (households && households.length > 0) {
            this.drawHouseholds(households, persons, relationships, false, null);
        }

        // 2. 繪製親子關係
        const familyRels = relationships.filter(r => (typeof r.getCategory === 'function' ? r.getCategory() : Relationship.getCategory(r.type)) === 'family');
        const otherRels = relationships.filter(r => (typeof r.getCategory === 'function' ? r.getCategory() : Relationship.getCategory(r.type)) !== 'family');

        this.drawFamilies(familyRels, persons, otherRels);

        // 3. 繪製其餘關係
        otherRels.forEach(rel => {
            const fromPerson = persons.find(p => p.id === rel.fromPersonId);
            const toPerson = persons.find(p => p.id === rel.toPersonId);
            if (fromPerson && toPerson) {
                this.drawRelationship(fromPerson, toPerson, rel, false, persons, relationships);
            }
        });

        // 4. 繪製人物
        persons.forEach(person => {
            this.drawPerson(person, false, false, false);
        });

        this.ctx.restore();

        // 5. 繪製圖例 (靠右對齊)
        const legendX = totalWidth - legendWidth - legendPadding / 2;
        const legendY = (totalHeight - legendHeight) / 2;
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
                    { label: '訂婚', style: 'dashed', color: '#6699CC' },
                    { label: '同居', style: 'dotted', color: '#66AA66' },
                    { label: '分居', style: 'dashed', color: '#DDAA00' },
                    { label: '離婚', style: 'solid', color: '#CC4444', marker: 'x' },
                    { label: '喪偶', style: 'solid', color: '#666666', marker: 'x-double' },
                    { label: '外遇', style: 'dashed', color: '#E53935' }
                ]
            },
            emotional: {
                title: '情感關係',
                items: [
                    { label: '正向關係', style: 'solid', color: '#4caf50', lines: 1 },
                    { label: '親密', style: 'solid', color: '#4caf50', lines: 2 },
                    { label: '過度親密', style: 'solid', color: '#4caf50', lines: 3 },
                    { label: '崇拜', style: 'circle-arrow', color: '#28a745' },
                    { label: '關注', style: 'arrow', color: '#4a90d9' },
                    { label: '冷漠', style: 'dashed', color: '#9E9E9E' },
                    { label: '疏離', style: 'dotted', color: '#666666' },
                    { label: '衝突', style: 'wave', color: '#E53935' },
                    { label: '敵對', style: 'cross', color: '#ff9800' },
                    { label: '暴力', style: 'wave', color: '#E53935', lines: 2 },
                    { label: '虐待', style: 'wave', color: '#5C6BC0' },
                    { label: '操控', style: 'arrow-wave', color: '#fd7e14' },
                    { label: '控制', style: 'box-arrow', color: '#dc3545' },
                    { label: '斷絕/冷戰', style: 'broken', color: '#333333' },
                    { label: '衝突又親密', style: 'conflict-close' }
                ]
            }
        };

        // 計算總高度
        const totalWidth = 210; // 稍微加寬以容納文字
        const totalHeight = (legendData.marriage.items.length + legendData.emotional.items.length) * lineHeight +
            titleFontSize * 2 + sectionGap * 3 + padding * 2;

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
            // 斷絕 (Cutoff): 中間斷開加雙豎線 (||)
            ctx.setLineDash([]);
            const gapSize = 16;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + width / 2 - gapSize / 2, y);
            ctx.moveTo(x + width / 2 + gapSize / 2, y);
            ctx.lineTo(x + width, y);
            ctx.stroke();

            // 雙豎線
            const barDist = 3;
            const barSize = 5;
            ctx.beginPath();
            ctx.moveTo(x + width / 2 - barDist, y - barSize);
            ctx.lineTo(x + width / 2 - barDist, y + barSize);
            ctx.moveTo(x + width / 2 + barDist, y - barSize);
            ctx.lineTo(x + width / 2 + barDist, y + barSize);
            ctx.stroke();
        } else if (item.style === 'box-arrow') {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + width, y);
            ctx.stroke();
            this.drawBoxArrow(x + width - 15, y, x + width, y);
        } else if (item.style === 'circle-arrow') {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + width, y);
            ctx.stroke();
            // 圓圈 (空心)
            ctx.save();
            ctx.fillStyle = 'white';
            ctx.strokeStyle = item.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x + width / 2, y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            // 箭頭
            this.drawArrow(x + width - 15, y, x + width, y, true);
        } else if (item.style === 'arrow') {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + width, y);
            ctx.stroke();
            this.drawArrow(x + width - 15, y, x + width, y, true);
        } else if (item.style === 'arrow-wave') {
            this.drawLegendWave(ctx, x, y, width);
            this.drawArrow(x + width - 15, y, x + width, y, true);
        } else if (item.style === 'symbol') {
            // 帶符號的線 (操控、控制、崇拜、關注)
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + width, y);
            ctx.stroke();

            ctx.fillStyle = item.color;
            ctx.font = 'bold 14px "Segoe UI Symbol", "Apple Color Emoji", "Segoe UI Emoji"';
            ctx.textAlign = 'center';
            ctx.fillText(item.symbol, x + width - 5, y + 5);
        } else if (item.style === 'cross') {
            // 敵對 (Hostile): 繪製兩個交叉標記
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + width, y);
            ctx.stroke();

            const drawInnerCrossAt = (cx) => {
                const s = 4;
                ctx.beginPath();
                ctx.moveTo(cx - s, y - s);
                ctx.lineTo(cx + s, y + s);
                ctx.moveTo(cx + s, y - s);
                ctx.lineTo(cx - s, y + s);
                ctx.stroke();
            };

            drawInnerCrossAt(x + width * 0.35);
            drawInnerCrossAt(x + width * 0.65);
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
                    // 畫一條輕微的隱形連接線 (極淺色虛線)，用於標示子代起源，避免與正式關係線混淆
                    this.ctx.save();
                    this.ctx.strokeStyle = '#f0f0f0';
                    this.ctx.setLineDash([2, 6]);
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
    drawHouseholds(households, persons, relationships = [], applyTransformFlag = true, selectedHouseholdId = null) {
        if (!households || households.length === 0) return;

        this.ctx.save();
        if (applyTransformFlag) {
            this.applyTransform(); // 應用縮放和平移（僅在正常渲染時）
        }
        this.ctx.setLineDash([10, 5]); // 改為較密的虛線，在不同縮放比例下更容易看清
        this.ctx.lineWidth = 3;
        this.ctx.lineJoin = 'round';

        households.forEach(household => {
            const bounds = this.getHouseholdBounds(household, persons, relationships);
            if (!bounds || !bounds.hullPoints) return;

            const { hullPoints } = bounds;
            const isSelected = selectedHouseholdId === household.id;

            // 繪製路徑
            const drawHull = (isGlow = false) => {
                this.ctx.beginPath();
                if (hullPoints.length < 3) return;

                // 圓角多邊形繪製邏輯
                const cornerRadius = 10; // 更小的圓角
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

            // 如果被選中，先繪製高亮外框
            if (isSelected) {
                this.ctx.save();
                this.ctx.setLineDash([]);
                this.ctx.lineWidth = 6;
                this.ctx.strokeStyle = '#4a90d9';
                this.ctx.globalAlpha = 0.3;
                drawHull();
                this.ctx.stroke();
                this.ctx.restore();
            }

            // 繪製實際的圈選框
            this.ctx.strokeStyle = isSelected ? '#4a90d9' : '#333';
            drawHull();
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
        const members = household.ids.map(id => persons.find(p => p.id === id)).filter(p => p);
        if (members.length === 0) return null;

        const padding = 25; // 恢復較顯眼的邊距 (User 要求大一點)
        const nameHeight = 20;
        const personRadius = this.personSize / 2;

        // 收集所有成員的影響點（圓形的邊界 + 關係連線點）
        const points = [];

        // 1. 每位成員周圍取點 (泡泡基礎)
        members.forEach(m => {
            if (!m || typeof m.x !== 'number' || typeof m.y !== 'number') return;

            const bottomExtra = m.name ? nameHeight : 0;
            const r = personRadius + padding;

            for (let i = 0; i < 16; i++) {
                const angle = (i * Math.PI * 2) / 16;
                let px = m.x + Math.cos(angle) * r;
                let py = m.y + Math.sin(angle) * r;

                if (angle > 0 && angle < Math.PI) {
                    py += bottomExtra;
                }

                if (!isNaN(px) && !isNaN(py)) {
                    points.push({ x: px, y: py });
                }
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

        const { hullPoints, minX, minY, maxX, maxY } = bounds;

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
            // 婚姻關係：配合 drawMarriageLine 使用左右側邊連接
            const fromPt = fromPerson.x < toPerson.x ? fromPerson.getConnectionPoint('right') : fromPerson.getConnectionPoint('left');
            const toPt = fromPerson.x < toPerson.x ? toPerson.getConnectionPoint('left') : toPerson.getConnectionPoint('right');
            points.push(fromPt);
            points.push(toPt);
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
        const category = relationship.getCategory();

        // 針對婚姻線增加一點點點擊範圍 (從 10 改為 15)
        const effectiveTolerance = category === 'marriage' ? 15 : tolerance;

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
}


