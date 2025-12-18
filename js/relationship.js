/**
 * Relationship 類別 - 代表兩個人物之間的關係
 */
class Relationship {
    /**
     * 關係類型定義
     */
    static TYPES = {
        // 親屬/結構關係
        PARENT_CHILD: 'parent-child',
        MARRIED: 'married',           // 結婚
        ENGAGED: 'engaged',           // 訂婚
        COHABITING: 'cohabiting',     // 同居
        SEPARATED: 'separated',       // 分居
        DIVORCED: 'divorced',         // 離婚
        WIDOWED: 'widowed',           // 喪偶
        AFFAIR: 'affair',             // 外遇
        ESTRANGED: 'estranged',       // 疏遠/離異

        // 情感關係
        HARMONY: 'harmony',           // 和諧
        INDIFFERENT: 'indifferent',   // 冷漠
        CLOSE: 'close',               // 親密
        VERY_CLOSE: 'very-close',     // 非常親密
        DISTANT: 'distant',           // 疏離
        CONFLICT: 'conflict',         // 衝突
        HOSTILE: 'hostile',           // 敵對
        VIOLENCE: 'violence',         // 暴力
        CUTOFF: 'cutoff',             // 斷絕/冷戰
        ABUSE: 'abuse',               // 虐待
        MANIPULATIVE: 'manipulative', // 操控
        CONTROLLING: 'controlling',   // 控制
        FOCUSED: 'focused',           // 關注
        ADMIRATION: 'admiration',     // 崇拜
        CONFLICT_CLOSE: 'conflict-close' // 衝突又親密
    };

    /**
     * 取得關係類型的顯示名稱
     * @param {string} type
     * @returns {string}
     */
    static getTypeName(type) {
        const names = {
            'parent-child': '親子關係',
            'married': '結婚',
            'engaged': '訂婚',
            'cohabiting': '同居',
            'separated': '分居',
            'divorced': '離婚',
            'widowed': '喪偶',
            'affair': '外遇',
            'estranged': '疏遠/離異',
            'harmony': '正向關係',
            'indifferent': '冷漠',
            'close': '親密',
            'very-close': '非常親密',
            'distant': '疏離',
            'conflict': '衝突',
            'hostile': '敵對',
            'violence': '暴力',
            'cutoff': '斷絕/冷戰',
            'abuse': '虐待',
            'manipulative': '操控',
            'controlling': '控制',
            'focused': '關注',
            'admiration': '崇拜',
            'conflict-close': '衝突又親密'
        };
        return names[type] || type;
    }

    /**
     * 取得關係類型的分類
     * @param {string} type
     * @returns {string}
     */
    static getCategory(type) {
        if (type === 'parent-child') return 'family';
        if (['married', 'engaged', 'cohabiting', 'separated', 'divorced', 'widowed', 'affair'].includes(type)) return 'marriage';
        return 'emotional';
    }

    /**
     * 建立新的關係
     * @param {Object} data
     */
    constructor(data = {}) {
        this.id = data.id || 'rel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        this.fromPersonId = data.fromPersonId;
        this.toPersonId = data.toPersonId;
        this.type = data.type || Relationship.TYPES.MARRIED;
        this.notes = data.notes || '';
    }

    /**
     * 取得線條樣式設定
     * @returns {Object}
     */
    /**
     * 取得線條樣式設定
     * @returns {Object}
     */
    getLineStyle() {
        const styles = {
            // 親子關係
            'parent-child': { color: '#333333', width: 2, pattern: 'solid' },

            // 婚姻/結構關係
            'married': { color: '#6b66ff', width: 2, pattern: 'solid' },     // 結婚：藍紫色實線
            'engaged': { color: '#6b66ff', width: 2, pattern: 'dashed' },    // 訂婚：藍紫色虛線
            'cohabiting': { color: '#4caf50', width: 2, pattern: 'dotted' }, // 同居：綠色點線
            'separated': { color: '#fec107', width: 2, pattern: 'dashed' },  // 分居：黃色虛線
            'divorced': { color: '#f44336', width: 2, pattern: 'solid', decoration: 'x' }, // 離婚：紅色實線加叉號
            'widowed': { color: '#333333', width: 2, pattern: 'solid', decoration: 'x' }, // 喪偶
            'affair': { color: '#dc3545', width: 2, pattern: 'dashed' },

            // 情感關係
            'harmony': { color: '#4caf50', width: 2, pattern: 'solid' },         // 正向關係：綠色實線
            'close': { color: '#4caf50', width: 2, pattern: 'double' },          // 親密：綠色雙實線
            'very-close': { color: '#4caf50', width: 2, pattern: 'triple' },     // 過度親密：綠色三實線
            'distant': { color: '#9e9e9e', width: 2, pattern: 'dotted' },        // 關係疏離：灰色點線
            'indifferent': { color: '#9e9e9e', width: 2, pattern: 'dashed' },    // 冷漠
            'conflict': { color: '#E53935', width: 2, pattern: 'wave' },         // 衝突：紅色波浪線
            'conflict-close': { color: '#E53935', width: 2, pattern: 'wave', decoration: 'close-parallel', decorationColor: '#4caf50' }, // 衝突又親密
            'hostile': { color: '#ff9800', width: 2, pattern: 'solid', decoration: 'cross-bars' }, // 敵對：橘色實線加十字
            'cutoff': { color: '#333333', width: 2, pattern: 'solid', decoration: 'vertical-bar' }, // 斷絕/冷戰：黑色實線加垂直線

            // 其他
            'violence': { pattern: 'wave', color: '#E53935', width: 2, decoration: null, lines: 2 },
            'abuse': { color: '#4a90d9', width: 2, pattern: 'wave' },
            'manipulative': { color: '#fd7e14', width: 2, pattern: 'wave', decoration: 'arrow' },
            'controlling': { color: '#dc3545', width: 2, pattern: 'solid', decoration: 'box-arrow' },
            'focused': { color: '#4a90d9', width: 2, pattern: 'solid', decoration: 'arrow' },
            'admiration': { color: '#28a745', width: 2, pattern: 'solid', decoration: 'circle-arrow' }
        };
        return styles[this.type] || styles['married'];
    }

    /**
     * 匯出為純資料物件
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            fromPersonId: this.fromPersonId,
            toPersonId: this.toPersonId,
            type: this.type,
            notes: this.notes
        };
    }

    /**
     * 從資料建立 Relationship 實例
     * @param {Object} data
     * @returns {Relationship}
     */
    static fromJSON(data) {
        return new Relationship(data);
    }
    /**
     * 檢查關係是否涉及某人
     * @param {string} personId
     * @returns {boolean}
     */
    involvesPerson(personId) {
        return this.fromPersonId === personId || this.toPersonId === personId;
    }

    /**
     * 取得此關係的分類 (實例方法)
     * @returns {string}
     */
    getCategory() {
        return Relationship.getCategory(this.type);
    }
}


