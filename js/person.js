/**
 * Person 類別 - 代表家系圖中的一個人物
 */
class Person {
    /**
     * 建立新的人物
     * @param {Object} data - 人物資料
     */
    constructor(data = {}) {
        this.id = data.id || this.generateId();
        this.name = data.name || '';
        this.gender = data.gender || 'male'; // 'male', 'female', 'other'
        this.age = data.age || null;
        this.isDeceased = data.isDeceased || false;
        this.isIdentifiedPatient = data.isIdentifiedPatient || false;

        // 醫學/狀態標記
        this.medical = data.medical || {
            topLeft: 'none',      // none, striped, filled
            topRight: 'none',
            bottomLeft: 'none',
            bottomRight: 'none',
            leftHalf: 'none',     // none, striped, filled (Physical/Mental)
            bottomHalf: 'none',   // none, striped, filled (Substance)
            centerSymbol: 'none', // none, dot, cross, question, vertical-line
            isSmoker: false,
            isObese: false,
            hasLanguageProblem: false
        };
        this.x = data.x || 100;
        this.y = data.y || 100;
        this.notes = data.notes || '';
    }

    /**
     * 產生唯一識別碼
     * @returns {string}
     */
    generateId() {
        return 'person_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 取得人物顯示的符號大小
     * @returns {number}
     */
    getSize() {
        return 50;
    }

    /**
     * 檢查座標點是否在此人物範圍內
     * @param {number} px - X 座標
     * @param {number} py - Y 座標
     * @returns {boolean}
     */
    containsPoint(px, py) {
        const size = this.getSize();
        const padding = 15; // 增加點擊容忍度
        const halfSize = size / 2 + padding;

        // 根據性別使用不同的檢測方式
        if (this.gender === 'female') {
            // 圓形：使用距離檢測
            const dx = px - this.x;
            const dy = py - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= halfSize;
        } else if (this.gender === 'pregnancy') {
            // 三角形：使用方形檢測（簡化版）
            return px >= this.x - halfSize && px <= this.x + halfSize &&
                py >= this.y - halfSize && py <= this.y + halfSize;
        } else {
            // 方形（男性）：方形檢測
            return px >= this.x - halfSize && px <= this.x + halfSize &&
                py >= this.y - halfSize && py <= this.y + halfSize;
        }
    }

    /**
     * 取得連接點座標（用於繪製關係線）
     * @param {string} position - 連接位置 ('top', 'bottom', 'left', 'right')
     * @returns {Object} - {x, y}
     */
    getConnectionPoint(position) {
        const size = this.getSize();
        const halfSize = size / 2;

        switch (position) {
            case 'top':
                return { x: this.x, y: this.y - halfSize };
            case 'bottom':
                return { x: this.x, y: this.y + halfSize };
            case 'left':
                return { x: this.x - halfSize, y: this.y };
            case 'right':
                return { x: this.x + halfSize, y: this.y };
            default:
                return { x: this.x, y: this.y };
        }
    }

    /**
     * 匯出為純資料物件（用於儲存）
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            gender: this.gender,
            age: this.age,
            isDeceased: this.isDeceased,
            isIdentifiedPatient: this.isIdentifiedPatient,
            medical: this.medical,
            x: this.x,
            y: this.y,
            notes: this.notes
        };
    }

    /**
     * 從資料建立 Person 實例
     * @param {Object} data
     * @returns {Person}
     */
    static fromJSON(data) {
        return new Person(data);
    }

    /**
     * 複製此人物
     * @returns {Person}
     */
    clone() {
        return new Person({
            ...this.toJSON(),
            id: this.generateId()
        });
    }
}


