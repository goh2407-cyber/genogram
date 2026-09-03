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
        this.age = data.age ?? null;
        this.isDeceased = data.isDeceased || false;
        this.isIdentifiedPatient = data.isIdentifiedPatient || false;

        // 醫學/狀態標記
        this.medical = data.medical ? { ...data.medical } : {
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
        // [NEW] 性別取向標記 (是否顯示倒三角)
        this.sexualOrientation = data.sexualOrientation || false;
        // [NEW] 跨性別標記 ('ftm', 'mtf', 或 null)
        this.transgender = data.transgender || null;

        this.x = data.x ?? 100;
        this.y = data.y ?? 100;
        this.notes = data.notes || '';
        const labelOffsetX = Number.isFinite(data.labelPlacement?.offsetX)
            ? data.labelPlacement.offsetX : 0;
        const labelOffsetY = Number.isFinite(data.labelPlacement?.offsetY)
            ? data.labelPlacement.offsetY : 0;
        // Optional persisted manual adjustment. Absence is the legacy/default zero position.
        this.labelPlacement = labelOffsetX || labelOffsetY
            ? { offsetX: labelOffsetX, offsetY: labelOffsetY }
            : null;
        this.generation = data.generation || null; // 'grandparent', 'parent', 'child', 'grandchild'
        this.twinGroup = data.twinGroup || null; // 多胞胎群組ID，null表示非多胞胎
        // [Phase 1] 合子性：'mono'(同卵→畫連接橫桿) / 'di' 或 null(異卵)。屬群組層級，群組成員應一致。
        this.zygosity = data.zygosity || null;
        // [Phase 1] 生育結果：null(正常) / 'miscarriage'(流產, 小實心圓點) / 'abortion'(人工流產, X)
        // 註：死產(stillbirth) 已移除；舊資料若有此值會被當正常人物渲染。
        this.lossType = data.lossType || null;
        // [2-1] 出生 / 死亡年月（'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD'，可空）。
        // 有出生年月時年齡改為自動計算（getDisplayAge）；未填則沿用手填 age，舊檔行為完全不變。
        this.birthDate = Person.normalizeDateString(data.birthDate);
        this.deathDate = Person.normalizeDateString(data.deathDate);
    }

    /**
     * [2-1] 正規化日期字串：接受 1985、1985-6、1985/06、1985.06.15、1985年6月 等，
     * 回傳 'YYYY' / 'YYYY-MM' / 'YYYY-MM-DD'；無法解析或範圍不合理回 null。
     * @param {*} value
     * @returns {string|null}
     */
    static normalizeDateString(value) {
        if (value === null || value === undefined) return null;
        const s = String(value).trim().replace(/[./年月]/g, '-').replace(/日/g, '').replace(/-+$/, '');
        const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(s);
        if (!m) return null;
        const y = Number(m[1]);
        const mo = m[2] !== undefined ? Number(m[2]) : null;
        const d = m[3] !== undefined ? Number(m[3]) : null;
        if (y < 1000 || y > 9999) return null;
        if (mo !== null && (mo < 1 || mo > 12)) return null;
        if (d !== null && (d < 1 || d > 31)) return null;
        let out = String(y);
        if (mo !== null) out += '-' + String(mo).padStart(2, '0');
        if (d !== null) out += '-' + String(d).padStart(2, '0');
        return out;
    }

    /**
     * [2-1] 拆成 {y, m, d}（m/d 可能為 null）
     */
    static parseDateParts(value) {
        const n = Person.normalizeDateString(value);
        if (!n) return null;
        const [y, m, d] = n.split('-').map(Number);
        return { y, m: Number.isFinite(m) ? m : null, d: Number.isFinite(d) ? d : null };
    }

    /**
     * [2-1] 依出生日期與基準日算年齡。只有年份時 = 年差；有月（日）時未過生日減 1。
     * @param {string} birth
     * @param {Date|string|null} reference - null = 今天
     * @returns {number|null}
     */
    static computeAge(birth, reference = null) {
        const b = Person.parseDateParts(birth);
        if (!b) return null;
        let r;
        if (reference instanceof Date) {
            r = { y: reference.getFullYear(), m: reference.getMonth() + 1, d: reference.getDate() };
        } else if (reference) {
            r = Person.parseDateParts(reference);
            if (!r) return null;
        } else {
            const t = new Date();
            r = { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
        }
        let age = r.y - b.y;
        if (b.m !== null && r.m !== null) {
            if (r.m < b.m) age -= 1;
            else if (r.m === b.m && b.d !== null && r.d !== null && r.d < b.d) age -= 1;
        }
        return age < 0 ? null : age;
    }

    /**
     * [2-1] 畫面顯示用年齡：
     *   在世 + 有出生年月 → 依基準日（預設今天）計算
     *   過世 + 有出生與死亡年月 → 享年（死亡時年齡）
     *   其餘 → 手填 age
     * @param {Date|string|null} referenceDate
     * @returns {number|null}
     */
    getDisplayAge(referenceDate = null) {
        if (this.birthDate) {
            if (this.isDeceased) {
                if (this.deathDate) {
                    const atDeath = Person.computeAge(this.birthDate, this.deathDate);
                    if (atDeath !== null) return atDeath;
                }
                return this.age;
            }
            const computed = Person.computeAge(this.birthDate, referenceDate);
            if (computed !== null) return computed;
        }
        return this.age;
    }

    /**
     * [2-1] 目前顯示的年齡是否為自動計算（供屬性面板決定年齡欄唯讀）
     */
    isAgeComputed(referenceDate = null) {
        if (!this.birthDate) return false;
        if (this.isDeceased) return Boolean(this.deathDate) && Person.computeAge(this.birthDate, this.deathDate) !== null;
        return Person.computeAge(this.birthDate, referenceDate) !== null;
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
        const json = {
            id: this.id,
            name: this.name,
            gender: this.gender,
            age: this.age,
            isDeceased: this.isDeceased,
            isIdentifiedPatient: this.isIdentifiedPatient,
            medical: { ...this.medical },
            sexualOrientation: this.sexualOrientation,
            transgender: this.transgender,
            x: this.x,
            y: this.y,
            notes: this.notes,
            generation: this.generation,
            twinGroup: this.twinGroup,
            zygosity: this.zygosity,
            lossType: this.lossType
        };
        if (this.labelPlacement) {
            json.labelPlacement = { ...this.labelPlacement };
        }
        // [2-1] 只在有值時寫入，舊檔 load→save 逐 byte 不變
        if (this.birthDate) json.birthDate = this.birthDate;
        if (this.deathDate) json.deathDate = this.deathDate;
        return json;
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


