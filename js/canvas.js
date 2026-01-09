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
    render(persons, relationships, highlightedIds = [], selectedId = null, selectedRelationshipId = null, connectingFrom = null, selectedPersonIds = [], boxSelectStart = null, boxSelectEnd = null, households = [], selectedHouseholdId = null, hoveredPersonId = null) {
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

        // 3.5 繪製關係線說明日期 (最上層，確保不被遮擋)
        otherRels.forEach(rel => {
            const fromPerson = persons.find(p => p.id === rel.fromPersonId);
            const toPerson = persons.find(p => p.id === rel.toPersonId);
            if (fromPerson && toPerson && rel.date) { // 只有當有日期/說明時才畫
                this.drawRelationshipDate(fromPerson, toPerson, rel, persons, relationships);
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

        // 8. 繪製快速新增按鈕 (hover 時顯示)
        if (hoveredPersonId) {
            const hoveredPerson = persons.find(p => p.id === hoveredPersonId);
            if (hoveredPerson) {
                this.drawQuickAddButtons(hoveredPerson);
            }
        }

        // 9. 繪製關係線編輯按鈕 (選中關係線時顯示)
        if (selectedRelationshipId) {
            const selectedRel = relationships.find(r => r.id === selectedRelationshipId);
            if (selectedRel) {
                const fromPerson = persons.find(p => p.id === selectedRel.fromPersonId);
                const toPerson = persons.find(p => p.id === selectedRel.toPersonId);
                if (fromPerson && toPerson) {
                    this.drawRelationshipEditButton(selectedRel, fromPerson, toPerson, relationships);
                }
            }
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

        // 根據用戶要求修改：
        // 案主：黑底，去除虛線
        // 死亡：白底，黑 X

        // 決定填充顏色
        let fillColor = '#fff';
        if (isIdentifiedPatient) {
            fillColor = '#333'; // 案主：黑底
        } else {
            fillColor = '#fff'; // 其他（含普通死亡）：白底
        }

        // 如果是死亡但不是案主，背景是白的；如果是案主，背景是黑的
        // 注意：原本邏輯死亡是黑底，現在改成白底

        this.ctx.fillStyle = fillColor;

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
        // 如果是黑底，邊框也用黑色可能看不出來，但實際上填充 #333 邊框也是 #333 是一樣的。
        // 為了確保邊界清晰，如果內容是黑的，外部背景是白的，所以沒問題。
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
        if (age !== null && age !== '') {
            this.ctx.shadowBlur = 0;
            this.ctx.font = `bold ${this.fontSize}px ${this.fontFamily}`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            // 案主是黑底，所以文字要白；其他（含死亡）是白底，文字要黑
            this.ctx.fillStyle = isIdentifiedPatient ? '#fff' : '#333';
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

            // 備註 (顯示於姓名下方)
            if (person.notes) {
                this.ctx.font = `${this.fontSize * 0.8}px ${this.fontFamily}`; // 較小字體
                this.ctx.fillStyle = '#666'; // 灰色
                this.ctx.fillText(person.notes, x, y + halfSize + 8 + this.fontSize + 4);
            }
        }

        this.ctx.restore();
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
        const dx = toPerson.x - fromPerson.x;
        const dy = toPerson.y - fromPerson.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;

        // 單位法向量 (normal vector)
        const nx = -dy / dist;
        const ny = dx / dist;

        // 線條中心點
        const cx = (fromPerson.x + toPerson.x) / 2;
        const cy = (fromPerson.y + toPerson.y) / 2;

        // 應用偏移 (Offset)
        const finalX = cx + nx * offset;
        const finalY = cy + ny * offset;

        // 繪製文字
        this.ctx.save();
        this.ctx.font = '12px ' + this.fontFamily;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom'; // 顯示在線上方

        const textToDraw = relationship.date;
        const textWidth = this.ctx.measureText(textToDraw).width;

        // 畫半透明背景以防重疊看不清
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        // 背景位置調整 (稍微上移以蓋住線條)
        this.ctx.fillRect(finalX - textWidth / 2 - 2, finalY - 14, textWidth + 4, 14);

        // 畫文字
        this.ctx.fillStyle = '#333';
        this.ctx.fillText(textToDraw, finalX, finalY - 2);

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
                // 婚姻關係高亮 - 增強可見度
                this.ctx.lineWidth = style.width + 8;
                this.ctx.globalAlpha = 0.6;
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
                // 情感關係高亮 - 增強可見度
                this.ctx.lineWidth = style.width + 8;
                this.ctx.globalAlpha = 0.6;
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
            case 'dashed': return [12, 6]; // 訂婚：長虛線
            case 'dotted': return [2, 6];  // 同居：短點線
            default: return [];
        }
    }

    /**
     * 繪製婚姻關係線
     */
    drawMarriageLine(from, to, style) {
        // 設定虛線樣式
        this.ctx.setLineDash(this.getLineDash(style.pattern));

        // 訂婚(dashed): 較長虛線段，同居(dotted): 短點配長間隔，讓兩者視覺差異明顯
        if (style.pattern === 'dashed') {
            this.ctx.setLineDash([12, 6]); // 訂婚：長虛線 ▬ ▬ ▬
        } else if (style.pattern === 'dotted') {
            this.ctx.setLineDash([2, 6]); // 同居：短點線 · · · · (點短間隔長)
        }

        // 繪製主線（左右直線）
        const centerX = (from.x + to.x) / 2;
        const centerY = (from.y + to.y) / 2;

        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.stroke();

        this.ctx.setLineDash([]); // 重置虛線以繪製裝飾

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

        // 一些裝飾需要在兩端

        if (style.decoration === 'arrow') {
            // 關注: 箭頭 (末端)
            const endInfo = this.getPointInfoAtDistance(path, totalLen - 15);
            this.drawArrow(
                endInfo.point.x - endInfo.tangent.x * 10,
                endInfo.point.y - endInfo.tangent.y * 10,
                endInfo.point.x + endInfo.tangent.x * 10, // 指向終點
                endInfo.point.y + endInfo.tangent.y * 10,
                true
            );
        } else if (style.decoration === 'circle-arrow') {
            // 崇拜: 末端圓圈+箭頭
            // 中點不用畫圓圈，是畫在箭頭尾巴？
            // 根據圖示，circle是在線的中間，箭頭在末端
            this.ctx.save();
            this.ctx.fillStyle = 'white';
            this.ctx.strokeStyle = style.color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(midPt.x, midPt.y, 4, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();

            const endInfo = this.getPointInfoAtDistance(path, totalLen - 15);
            this.drawArrow(
                endInfo.point.x - endInfo.tangent.x * 10,
                endInfo.point.y - endInfo.tangent.y * 10,
                endInfo.point.x + endInfo.tangent.x * 10,
                endInfo.point.y + endInfo.tangent.y * 10,
                true
            );
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
            const endInfo = this.getPointInfoAtDistance(path, totalLen - 15);
            this.drawArrow(
                endInfo.point.x - endInfo.tangent.x * 10,
                endInfo.point.y - endInfo.tangent.y * 10,
                endInfo.point.x + endInfo.tangent.x * 10,
                endInfo.point.y + endInfo.tangent.y * 10,
                true
            );
        } else if (style.decoration === 'double-arrow-red') {
            // 操控: 黑色實線 + 紅色箭頭
            const endInfo = this.getPointInfoAtDistance(path, totalLen - 15);
            this.ctx.save();
            this.ctx.strokeStyle = '#E53935'; // Force Red
            this.drawArrow(
                endInfo.point.x - endInfo.tangent.x * 10,
                endInfo.point.y - endInfo.tangent.y * 10,
                endInfo.point.x + endInfo.tangent.x * 10,
                endInfo.point.y + endInfo.tangent.y * 10,
                true
            );
            this.ctx.restore();
        } else if (style.decoration === 'x-arrow') {
            // 忽視: 末端箭頭，中間垂直線或是X? 參考圖是中間一條垂直線 (But now Neglect is just Arrow, so this might be unused, but keeping logic safe)
            const barSize = 8;
            const perpX = -tangent.y * barSize;
            const perpY = tangent.x * barSize;
            this.ctx.beginPath();
            this.ctx.moveTo(midPt.x + perpX, midPt.y + perpY);
            this.ctx.lineTo(midPt.x - perpX, midPt.y - perpY);
            this.ctx.stroke();

            const endInfo = this.getPointInfoAtDistance(path, totalLen - 15);
            this.drawArrow(
                endInfo.point.x - endInfo.tangent.x * 10,
                endInfo.point.y - endInfo.tangent.y * 10,
                endInfo.point.x + endInfo.tangent.x * 10,
                endInfo.point.y + endInfo.tangent.y * 10,
                true
            );
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
            const endInfo = this.getPointInfoAtDistance(path, totalLen - 15);
            this.drawArrow(
                endInfo.point.x - endInfo.tangent.x * 10,
                endInfo.point.y - endInfo.tangent.y * 10,
                endInfo.point.x + endInfo.tangent.x * 10,
                endInfo.point.y + endInfo.tangent.y * 10,
                true
            );
            // Bar (Black)
            this.ctx.save();
            this.ctx.strokeStyle = '#000000';
            const barDist = totalLen - 25; // Before arrow
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
            this.drawWaveOnPath(path, totalLen, lines);
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
            this.ctx.setLineDash([]);
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
            this.ctx.setLineDash([]);
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



    /**
     * 匯出為 PNG 圖片（含關係圖例）
     */
    exportToPNG(persons, relationships, households = [], lifeCircles = []) {
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

        // 3. 考慮 lifeCircles 的邊界
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

        // 加上安全邊距
        const margin = 50;
        minX -= margin;
        minY -= margin;
        maxX += margin;
        maxY += margin;

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;

        // ===== 圖例設定 =====
        const legendWidth = 440; // 180*2 columns + 32 gap + 32 padding + extra
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

        // 1. 先繪製生活圈 (最最底層)
        if (lifeCircles && lifeCircles.length > 0) {
            this.drawLifeCirclesExport(lifeCircles);
        }

        // 1.5 繪製同住家庭
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
     * 匯出為 JPEG 圖片（含關係圖例）
     * @param {Array} persons - 人物陣列
     * @param {Array} relationships - 關係陣列
     * @param {Array} households - 同住家庭陣列
     * @param {number} quality - JPEG 品質 (0-1)
     * @returns {string|null} - Data URL 或 null
     */
    exportToJPEG(persons, relationships, households = [], lifeCircles = [], quality = 0.92) {
        // 計算內容邊界
        if (persons.length === 0) {
            return null;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        persons.forEach(p => {
            const halfSize = this.personSize / 2 + 10;
            minX = Math.min(minX, p.x - halfSize);
            minY = Math.min(minY, p.y - halfSize);
            maxX = Math.max(maxX, p.x + halfSize);
            maxY = Math.max(maxY, p.y + halfSize + 30);
        });

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

        // 考慮 lifeCircles 的邊界
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

        const margin = 50;
        minX -= margin;
        minY -= margin;
        maxX += margin;
        maxY += margin;

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;

        const legendWidth = 440;
        const legendPadding = 40;
        const legendHeight = 850;

        const totalWidth = contentWidth + legendWidth + legendPadding;
        const totalHeight = Math.max(contentHeight, legendHeight + margin * 2);

        const exportCanvas = document.createElement('canvas');
        const exportScale = 3;
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
        if (lifeCircles && lifeCircles.length > 0) {
            this.drawLifeCirclesExport(lifeCircles);
        }

        if (households && households.length > 0) {
            this.drawHouseholds(households, persons, relationships, false, null);
        }

        const familyRels = relationships.filter(r => (typeof r.getCategory === 'function' ? r.getCategory() : Relationship.getCategory(r.type)) === 'family');
        const otherRels = relationships.filter(r => (typeof r.getCategory === 'function' ? r.getCategory() : Relationship.getCategory(r.type)) !== 'family');

        this.drawFamilies(familyRels, persons, otherRels);

        otherRels.forEach(rel => {
            const fromPerson = persons.find(p => p.id === rel.fromPersonId);
            const toPerson = persons.find(p => p.id === rel.toPersonId);
            if (fromPerson && toPerson) {
                this.drawRelationship(fromPerson, toPerson, rel, false, persons, relationships);
            }
        });

        persons.forEach(person => {
            this.drawPerson(person, false, false, false);
        });

        this.ctx.restore();

        const legendX = totalWidth - legendWidth - legendPadding / 2;
        const legendY = (totalHeight - legendHeight) / 2;
        this.drawExportLegend(exportCtx, legendX, legendY);

        this.ctx = originalCtx;

        return exportCanvas.toDataURL('image/jpeg', quality);
    }

    /**
     * 繪製匯出用的關係圖例
     */
    drawExportLegend(ctx, x, y) {
        const padding = 16;
        const lineHeight = 26;
        const lineWidth = 40;
        const fontSize = 13;
        const titleFontSize = 14;
        const sectionGap = 16;
        const columnGap = 32; // 欄位間距

        // 圖例資料 - 分為左右兩欄
        const legendDataLeft = {
            family: {
                title: '家庭關係',
                items: [
                    { label: '結婚', style: 'solid', color: '#000000' },
                    { label: '訂婚', style: 'dashed', color: '#000000', pattern: [6, 4] },
                    { label: '同居', style: 'dotted', color: '#000000', pattern: [3, 3] },
                    { label: '法律同居', style: 'dotted', color: '#000000', pattern: [3, 3], decoration: 'house' },
                    { label: '事實分居', style: 'solid', color: '#000000', decoration: 'single-slash' },
                    { label: '法律分居', style: 'solid', color: '#000000', decoration: 'double-slash' },
                    { label: '離婚', style: 'solid', color: '#000000', decoration: 'divorce-slash' },
                    { label: '喪偶', style: 'solid', color: '#000000', decoration: 'x' },
                    { label: '外遇', style: 'dashed', color: '#E53935' }
                ]
            },
            emotional_pos: {
                title: '情感關係 (正向)',
                items: [
                    { label: '和諧', style: 'solid', color: '#28a745' },
                    { label: '愛', style: 'solid', color: '#28a745', decoration: 'circle' },
                    { label: '熱戀', style: 'solid', color: '#28a745', decoration: 'double-circle' },
                    { label: '親密/友誼', style: 'double', color: '#28a745' },
                    { label: '非常親密', style: 'triple', color: '#28a745' },
                    { label: '崇拜', style: 'solid', color: '#333333', decoration: 'circle-arrow' },
                    { label: '關注', style: 'solid', color: '#333333', decoration: 'arrow' }
                ]
            }
        };

        const legendDataRight = {
            emotional_neg: {
                title: '情感關係 (負向)',
                items: [
                    { label: '冷漠', style: 'dashed', color: '#dc3545' },
                    { label: '疏離', style: 'dashed', color: '#333333', decoration: 'double-bar' },
                    { label: '斷絕', style: 'dashed', color: '#E53935', decoration: 'double-bar' }, // 紅色斷絕
                    { label: '衝突', style: 'double', color: '#E53935' }, // Double Red
                    { label: '仇恨', style: 'triple', color: '#E53935' }, // Triple Red
                    { label: '敵對', style: 'wave', color: '#E53935' },
                    { label: '遠距敵對', style: 'wave', color: '#E53935', decoration: 'arrow' },
                    { label: '親密敵對', style: 'close-hostile', color: '#E53935' },

                    { label: '衝突又親密', style: 'conflict-close', color: '#E53935' }
                ]
            },
            abuse: {
                title: '虐待/暴力',
                items: [
                    { label: '暴力', style: 'zigzag', color: '#007BFF' },
                    { label: '虐待', style: 'wave', color: '#007BFF' },
                    { label: '身體虐待', style: 'physical-abuse', color: '#007BFF' },
                    { label: '情緒虐待', style: 'emotional-abuse', color: '#007BFF' },
                    { label: '性虐待', style: 'sexual-abuse', color: '#007BFF' },
                    { label: '忽視', style: 'solid', color: '#007BFF', decoration: 'arrow-bar' },
                    { label: '操控', style: 'solid', color: '#000000', decoration: 'x' },
                    { label: '控制', style: 'solid', color: '#E53935', decoration: 'box-cross-arrow' }
                ]
            }
        };

        // 計算尺寸
        // 左欄高度
        const leftItemsCount = legendDataLeft.family.items.length + legendDataLeft.emotional_pos.items.length;
        const rightItemsCount = legendDataRight.emotional_neg.items.length + legendDataRight.abuse.items.length;

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

        // --- 左欄繪製 ---
        // 家庭關係
        this.drawLegendSection(ctx, legendDataLeft.family, x + padding, currentYLeft, lineWidth, lineHeight, titleFontSize, fontSize);
        currentYLeft += (legendDataLeft.family.items.length + 1.5) * lineHeight;

        // 情感正向
        this.drawLegendSection(ctx, legendDataLeft.emotional_pos, x + padding, currentYLeft, lineWidth, lineHeight, titleFontSize, fontSize);

        // --- 右欄繪製 ---
        // 情感負向
        this.drawLegendSection(ctx, legendDataRight.emotional_neg, rightX, currentYRight, lineWidth, lineHeight, titleFontSize, fontSize);
        currentYRight += (legendDataRight.emotional_neg.items.length + 1.5) * lineHeight;

        // 虐待暴力
        this.drawLegendSection(ctx, legendDataRight.abuse, rightX, currentYRight, lineWidth, lineHeight, titleFontSize, fontSize);
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

            // 設置樣式
            ctx.save();
            ctx.strokeStyle = item.color;
            ctx.fillStyle = item.color;
            ctx.lineWidth = 2;

            if (item.style === 'double') {
                this.drawDoubleLine(startX, lineY, endX, lineY, 4);
            } else if (item.style === 'triple') {
                this.drawTripleLine(startX, lineY, endX, lineY, 3);
            } else if (item.style === 'zigzag') {
                this.drawZigzagLine(startX, lineY, endX, lineY);
            } else if (item.style === 'wave') {
                this.drawWaveLine(startX, lineY, endX, lineY);
            } else if (item.style === 'double-wave') {
                this.drawWaveLine(startX, lineY - 2, endX, lineY - 2);
                this.drawWaveLine(startX, lineY + 2, endX, lineY + 2);
            } else if (item.style === 'conflict-close') {
                // 綠色實線 + 紅色鋸齒
                ctx.strokeStyle = '#28a745';
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
                if (item.style === 'dashed') ctx.setLineDash(item.pattern || [5, 5]);
                if (item.style === 'dotted') ctx.setLineDash(item.pattern || [2, 2]);
                ctx.moveTo(startX, lineY);
                ctx.lineTo(endX, lineY);
                ctx.stroke();
                ctx.setLineDash([]);
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
                ctx.beginPath();
                ctx.arc(midX - 3, lineY, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#fff'; // hollow
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(midX + 3, lineY, 3, 0, Math.PI * 2);
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
                // 忽視 (Neglect): 箭頭 + 豎線
                // 先畫箭頭
                this.drawArrow(startX, lineY, endX, lineY, true);
                // 再畫豎線 (黑色)
                ctx.save();
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(midX - 5, lineY - 5);
                ctx.lineTo(midX - 5, lineY + 5);
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




    /**
     * 繪製家庭樹狀結構 (親子關係)
     */
    drawFamilies(familyRels, persons, otherRels, selectedRelationshipId = null) {
        // 1. 整理每個孩子的父母
        const childParents = {}; // childId -> [parentId, parentId]
        // 同時建立 child-parent 對應到關係 ID 的映射
        const childParentRelMap = {}; // `${childId}_${parentId}` -> relId

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
            const parentObjs = parentIds.map(id => persons.find(p => p.id === id)).filter(p => p);
            const childObjs = childIds.map(id => persons.find(p => p.id === id)).filter(p => p);

            if (parentObjs.length === 0 || childObjs.length === 0) return;

            // 設置預設線條樣式 (不選中時)
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

                    // 恢復預設樣式
                    this.ctx.strokeStyle = '#333';
                    this.ctx.lineWidth = 2;
                    this.ctx.setLineDash([]);

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

            // 如果有選中特定子女關係，先繪製該子女的高亮效果
            if (selectedChildId) {
                const selectedChild = childObjs.find(c => c.id === selectedChildId);
                if (selectedChild) {
                    this.ctx.save();
                    this.ctx.strokeStyle = 'rgba(74, 144, 217, 0.3)';
                    this.ctx.lineWidth = 10;
                    this.ctx.lineCap = 'round';
                    this.ctx.lineJoin = 'round';

                    // 繪製高亮背景 - 僅選中子女的垂直線
                    const childTop = selectedChild.y - this.personSize / 2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(selectedChild.x, barY);
                    this.ctx.lineTo(selectedChild.x, childTop);
                    this.ctx.stroke();

                    this.ctx.restore();
                }
            }

            // 繪製 Source -> Bar 的垂直線 (預設樣式)
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
                const isThisChildSelected = selectedChildId === child.id;

                // 如果這個子女被選中，使用高亮樣式
                if (isThisChildSelected) {
                    this.ctx.save();
                    this.ctx.strokeStyle = '#4a90d9';
                    this.ctx.lineWidth = 4;
                }

                this.ctx.beginPath();
                this.ctx.moveTo(child.x, barY);
                this.ctx.lineTo(child.x, childTop);
                this.ctx.stroke();

                if (isThisChildSelected) {
                    this.ctx.restore();
                }
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
                const structuralRel = samePairRels.find(r => ['marriage', 'family'].includes(r.getCategory()));
                const emotionalRels = samePairRels.filter(r => r.getCategory() === 'emotional');
                const myIdx = emotionalRels.findIndex(r => r.id === relationship.id);
                const gap = 18;

                if (structuralRel) {
                    offset = (myIdx % 2 === 0) ? (Math.floor(myIdx / 2) + 1) * gap : -(Math.floor(myIdx / 2) + 1) * gap;
                } else {
                    const total = emotionalRels.length;
                    offset = (myIdx - (total - 1) / 2) * gap;
                }
            }
        }

        if (category === 'family') {
            // 親子關係：計算子女的垂直連接線（橫槓 → 子女）
            // 這是該親子關係獨有的線段，共享橫槓由其他關係共用

            // 確定父母和子女
            let parentPerson, childPerson;
            if (fromPerson.y < toPerson.y) {
                parentPerson = fromPerson;
                childPerson = toPerson;
            } else {
                parentPerson = toPerson;
                childPerson = fromPerson;
            }

            // 計算 sourceY (與 drawFamilies 一致)
            // 單親情況：使用父母底部
            const sourceY = parentPerson.y + this.personSize / 2;

            // 計算 barY (與 drawFamilies 使用相同邏輯)
            // 注意：drawFamilies 使用 childrenMinY，這裡簡化為單一子女
            const childTop = childPerson.y - this.personSize / 2;
            let barY = (sourceY + childTop) / 2;

            // 防呆處理 (與 drawFamilies 一致)
            if (barY < sourceY + 20) barY = sourceY + 20;
            if (barY > childTop - 20) barY = childTop - 20;
            if (sourceY >= childTop - 10) {
                barY = sourceY + 30;
            }

            // 路徑：只包含子女的垂直線段（這是高亮顯示的部分）
            // 編輯按鈕會顯示在這段線的中間
            points.push({ x: childPerson.x, y: barY });
            points.push({ x: childPerson.x, y: childTop });
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
            let startX = fromPerson.x + Math.cos(angle) * radius;
            let startY = fromPerson.y + Math.sin(angle) * radius;
            let endX = toPerson.x - Math.cos(angle) * radius;
            let endY = toPerson.y - Math.sin(angle) * radius;

            // Apply offset for multi-relationships
            if (offset !== 0) {
                const dx = endX - startX;
                const dy = endY - startY;
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
            effectiveTolerance = 20;
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
    drawRelationshipEditButton(relationship, fromPerson, toPerson, allRelationships = []) {
        const path = this.getRelationshipPath(fromPerson, toPerson, relationship, allRelationships);
        if (path.length < 2) return null;

        // 計算路徑中點
        const totalLen = this.getPathLength(path);
        const info = this.getPointInfoAtDistance(path, totalLen / 2);

        const buttonRadius = 14;
        const offsetDist = 24; // 半徑 14 + 間隙 10

        // 計算法向量 (垂直於切線)
        let nx = -info.tangent.y;
        let ny = info.tangent.x;

        // 調整方向：偏好螢幕上方 (ny < 0)
        // 如果線條接近水平，ny 會很大（負或正）。我們強迫 ny 為負。
        // 如果線條接近垂直，ny 接近 0。這時按鈕可以放在右側。
        if (ny > 0) {
            nx = -nx;
            ny = -ny;
        } else if (Math.abs(ny) < 0.001) {
            // 垂直線，確保往右移
            if (nx < 0) {
                nx = -nx;
                ny = -ny;
            }
        }

        const x = info.point.x + nx * offsetDist;
        const y = info.point.y + ny * offsetDist;

        // 儲存按鈕位置供點擊偵測使用
        this.lastEditButtonPosition = { x, y, radius: buttonRadius };

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

        // 繪製鉛筆圖示
        this.ctx.fillStyle = '#4a90d9';
        this.ctx.font = 'bold 14px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('✏', x, y);

        this.ctx.restore();

        return { x, y, radius: buttonRadius };
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

        // 計算路徑中點
        const totalLen = this.getPathLength(path);
        const info = this.getPointInfoAtDistance(path, totalLen / 2);

        const buttonRadius = 14;
        const offsetDist = 24;

        // 計算法向量 (垂直於切線)
        let nx = -info.tangent.y;
        let ny = info.tangent.x;

        // 調整方向：偏好螢幕上方 (ny < 0)
        if (ny > 0) {
            nx = -nx;
            ny = -ny;
        } else if (Math.abs(ny) < 0.001) {
            // 垂直線，確保往右移
            if (nx < 0) {
                nx = -nx;
                ny = -ny;
            }
        }

        const buttonX = info.point.x + nx * offsetDist;
        const buttonY = info.point.y + ny * offsetDist;

        const dx = px - buttonX;
        const dy = py - buttonY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance <= buttonRadius + 5; // 增加一些容差
    }

    /**
     * 快速新增按鈕配置
     */
    static QUICK_BUTTONS = {
        parent: { label: '父母', icon: '👨‍👩', offsetX: 0, offsetY: -75, color: '#4a90d9' },
        sibling: { label: '手足', icon: '⟷', offsetX: 55, offsetY: -25, color: '#5dae8b' },
        partner: { label: '伴侶', icon: '❤', offsetX: 55, offsetY: 25, color: '#e85d75' },
        son: { label: '兒子', icon: '👦', offsetX: -40, offsetY: 75, color: '#e8a849' },
        daughter: { label: '女兒', icon: '👧', offsetX: 0, offsetY: 75, color: '#e8a849' },
        pregnancy: { label: '懷孕', icon: '△', offsetX: 40, offsetY: 75, color: '#e8a849' }
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
            // 跳過懷孕按鈕：男性、懷孕、死亡者
            if (type === 'pregnancy') {
                if (person.gender === 'male' || person.gender === 'pregnancy' || person.isDeceased) {
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

            // 按鈕背景
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.arc(bx, by, btnRadius, 0, Math.PI * 2);
            this.ctx.fillStyle = btn.color;
            this.ctx.shadowColor = 'rgba(0,0,0,0.3)';
            this.ctx.shadowBlur = 5;
            this.ctx.shadowOffsetY = 2;
            this.ctx.fill();
            this.ctx.restore();

            // 按鈕圖示
            this.ctx.font = '14px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText(btn.icon, bx, by);

            // 按鈕標籤（小字說明）
            this.ctx.save();
            this.ctx.font = '10px "Noto Sans TC", sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';
            this.ctx.fillStyle = '#555';
            this.ctx.fillText(btn.label, bx, by + btnRadius + 2);
            this.ctx.restore();
        });
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
            // 跳過懷孕按鈕：男性、懷孕、死亡者
            if (type === 'pregnancy') {
                if (person.gender === 'male' || person.gender === 'pregnancy' || person.isDeceased) {
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
            if (!lc.points || lc.points.length < 3) return;

            const isSelected = selectedId === lc.id;

            // 繪製填充多邊形
            this.ctx.beginPath();
            this.ctx.moveTo(lc.points[0].x, lc.points[0].y);
            for (let i = 1; i < lc.points.length; i++) {
                this.ctx.lineTo(lc.points[i].x, lc.points[i].y);
            }
            this.ctx.closePath();

            // 填充
            this.ctx.fillStyle = lc.color || 'rgba(74, 144, 226, 0.15)';
            this.ctx.fill();

            // 邊框
            this.ctx.strokeStyle = isSelected ? '#4a90d9' : 'rgba(74, 144, 226, 0.5)';
            this.ctx.lineWidth = isSelected ? 3 : 2;
            this.ctx.setLineDash(isSelected ? [] : [5, 3]);
            this.ctx.stroke();

            // 繪製頂點（選中時）
            if (isSelected) {
                lc.points.forEach(p => {
                    this.ctx.beginPath();
                    this.ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                    this.ctx.fillStyle = '#4a90d9';
                    this.ctx.fill();
                });
            }

            // 標籤已移除，不再繪製
        });

        this.ctx.restore();
    }

    /**
     * 繪製生活圈（匯出用，不含選取高亮）
     */
    drawLifeCirclesExport(lifeCircles) {
        if (!lifeCircles || lifeCircles.length === 0) return;

        lifeCircles.forEach(lc => {
            if (!lc.points || lc.points.length < 3) return;

            // 繪製填充多邊形
            this.ctx.beginPath();
            this.ctx.moveTo(lc.points[0].x, lc.points[0].y);
            for (let i = 1; i < lc.points.length; i++) {
                this.ctx.lineTo(lc.points[i].x, lc.points[i].y);
            }
            this.ctx.closePath();

            // 填充
            this.ctx.fillStyle = lc.color || 'rgba(74, 144, 226, 0.15)';
            this.ctx.fill();

            // 邊框
            this.ctx.strokeStyle = 'rgba(74, 144, 226, 0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 3]);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
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

        // 如果有滑鼠位置，繪製到滑鼠的預覽線
        if (mousePos) {
            this.ctx.lineTo(mousePos.x, mousePos.y);
        }

        this.ctx.strokeStyle = '#4a90d9';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.stroke();

        // 繪製頂點
        points.forEach((p, i) => {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
            this.ctx.fillStyle = i === 0 ? '#ff6b6b' : '#4a90d9'; // 第一個點用紅色標記
            this.ctx.fill();
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([]);
            this.ctx.stroke();
        });

        // 提示文字已移除

        this.ctx.restore();
    }
}


