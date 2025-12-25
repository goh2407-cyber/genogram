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
        MARRIED: 'married',                      // 結婚
        ENGAGED: 'engaged',                      // 訂婚
        COHABITING: 'cohabiting',                // 同居
        LEGAL_COHABITING: 'legal-cohabiting',    // 法律同居
        SEPARATED: 'separated',                  // 事實分居
        LEGAL_SEPARATED: 'legal-separated',      // 法律分居
        DIVORCED: 'divorced',                    // 離婚
        WIDOWED: 'widowed',                      // 喪偶
        AFFAIR: 'affair',                        // 外遇
        ENGAGED_SEPARATED: 'engaged-separated',  // 訂婚並分居
        ENGAGED_COHABITING: 'engaged-cohabiting',// 訂婚並同居

        // 情感關係 - 正向
        HARMONY: 'harmony',                      // 和諧
        LOVE: 'love',                            // 愛
        IN_LOVE: 'in-love',                      // 熱戀
        CLOSE: 'close',                          // 親密/友誼
        VERY_CLOSE: 'very-close',                // 非常親密

        // 情感關係 - 負向
        INDIFFERENT: 'indifferent',              // 冷漠
        DISTANT: 'distant',                      // 疏離
        CUTOFF: 'cutoff',                        // 斷絕
        ESTRANGED: 'estranged',                  // 疏遠
        CONFLICT: 'conflict',                    // 衝突
        HATE: 'hate',                            // 仇恨
        HOSTILE: 'hostile',                      // 敵對
        DISTANT_HOSTILE: 'distant-hostile',      // 遠距敵對
        CLOSE_HOSTILE: 'close-hostile',          // 親密敵對
        FUSED_HOSTILE: 'fused-hostile',          // 融合敵對
        CONFLICT_CLOSE: 'conflict-close',        // 衝突又親密

        // 虐待/暴力
        VIOLENCE: 'violence',                    // 暴力
        ABUSE: 'abuse',                          // 虐待
        PHYSICAL_ABUSE: 'physical-abuse',        // 身體虐待
        EMOTIONAL_ABUSE: 'emotional-abuse',      // 情緒虐待
        SEXUAL_ABUSE: 'sexual-abuse',            // 性虐待
        NEGLECT: 'neglect',                      // 忽視

        // 其他
        MANIPULATIVE: 'manipulative',            // 操控
        CONTROLLING: 'controlling',              // 控制
        FOCUSED: 'focused',                      // 關注
        ADMIRATION: 'admiration'                 // 崇拜
    };

    /**
     * 取得關係類型的顯示名稱
     * @param {string} type
     * @returns {string}
     */
    static getTypeName(type) {
        const names = {
            // 家庭關係
            'parent-child': '親子關係',
            'married': '結婚',
            'engaged': '訂婚',
            'cohabiting': '同居',
            'legal-cohabiting': '法律同居',
            'separated': '事實分居',
            'legal-separated': '法律分居',
            'divorced': '離婚',
            'widowed': '喪偶',
            'affair': '外遇',
            'engaged-separated': '訂婚並分居',
            'engaged-cohabiting': '訂婚並同居',

            // 情感關係 - 正向
            'harmony': '和諧',
            'love': '愛',
            'in-love': '熱戀',
            'close': '親密/友誼',
            'very-close': '非常親密',

            // 情感關係 - 負向
            'indifferent': '冷漠',
            'distant': '疏離',
            'cutoff': '斷絕',
            'estranged': '疏遠',
            'conflict': '衝突',
            'hate': '仇恨',
            'hostile': '敵對',
            'distant-hostile': '遠距敵對',
            'close-hostile': '親密敵對',
            'fused-hostile': '融合敵對',
            'conflict-close': '衝突又親密',

            // 虐待/暴力
            'violence': '暴力',
            'abuse': '虐待',
            'physical-abuse': '身體虐待',
            'emotional-abuse': '情緒虐待',
            'sexual-abuse': '性虐待',
            'neglect': '忽視',

            // 其他
            'manipulative': '操控',
            'controlling': '控制',
            'focused': '關注',
            'admiration': '崇拜'
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

        const marriageTypes = [
            'married', 'engaged', 'cohabiting', 'legal-cohabiting',
            'separated', 'legal-separated', 'divorced', 'widowed',
            'affair', 'engaged-separated', 'engaged-cohabiting'
        ];
        if (marriageTypes.includes(type)) return 'marriage';

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
    getLineStyle() {
        const styles = {
            // 親子關係
            'parent-child': { color: '#333333', width: 2, pattern: 'solid' },

            // ===== 家庭關係 (Family Relationship - 第二張圖) =====
            // 婚姻：黑色實線
            'married': { color: '#333333', width: 2, pattern: 'solid' },
            // 訂婚：黑色實線 (通常為虛線，或實線加標記)
            'engaged': { color: '#333333', width: 2, pattern: 'dashed' },
            // 事實分居：黑色實線 + 單斜線
            'separated': { color: '#333333', width: 2, pattern: 'solid', decoration: 'single-slash' },
            // 法律分居：黑色實線 + 雙斜線
            'legal-separated': { color: '#333333', width: 2, pattern: 'solid', decoration: 'double-slash' },
            // 離婚：黑色實線 + 雙斜線(分開)
            'divorced': { color: '#333333', width: 2, pattern: 'solid', decoration: 'divorce-slash' },
            // 喪偶：黑色實線 + X
            'widowed': { color: '#333333', width: 2, pattern: 'solid', decoration: 'x' },
            // 訂婚並分居：黑色虛線 + 斜線
            'engaged-separated': { color: '#333333', width: 2, pattern: 'dashed', decoration: 'single-slash' },
            // 訂婚並同居：黑色點線（同居樣式）
            'engaged-cohabiting': { color: '#333333', width: 2, pattern: 'dotted' },
            // 同居：黑色點線（較短間隔，與訂婚的長虛線區分）
            'cohabiting': { color: '#333333', width: 2, pattern: 'dotted' },
            // 法律同居：黑色點線 + 小房子
            'legal-cohabiting': { color: '#333333', width: 2, pattern: 'dotted', decoration: 'house' },
            // 外遇：紅色虛線
            'affair': { color: '#E53935', width: 2, pattern: 'dashed' },

            // ===== 情感關係 (Emotional Relationship - 第三張圖) =====
            // 和諧：綠色實線
            'harmony': { color: '#4caf50', width: 2, pattern: 'solid' },
            // 冷漠：紅色虛線
            'indifferent': { color: '#E53935', width: 2, pattern: 'dashed' },
            // 愛：綠色實線 + 圓
            'love': { color: '#4caf50', width: 2, pattern: 'solid', decoration: 'circle' },
            // 熱戀：綠色實線 + 雙圓
            'in-love': { color: '#4caf50', width: 2, pattern: 'solid', decoration: 'double-circle' },
            // 親密/友誼：綠色雙實線
            'close': { color: '#4caf50', width: 2, pattern: 'double' },
            // 非常親密：綠色三實線
            'very-close': { color: '#4caf50', width: 2, pattern: 'triple' },
            // 衝突/不和：紅色雙實線 (Discord/Conflict)
            'conflict': { color: '#E53935', width: 2, pattern: 'double' },
            // 仇恨：紅色三實線 (Hate)
            'hate': { color: '#E53935', width: 2, pattern: 'triple' },
            // 斷絕/疏遠：紅色虛線 + 雙豎線
            'cutoff': { color: '#E53935', width: 2, pattern: 'dashed', decoration: 'double-bar' },
            'estranged': { color: '#E53935', width: 2, pattern: 'dashed', decoration: 'double-bar' },
            // 敵對：紅色波浪線 (Hostile)
            'hostile': { color: '#E53935', width: 2, pattern: 'wave' },
            // 遠距敵對：紅色波浪線 + 箭頭 (Distant Hostile)
            'distant-hostile': { color: '#E53935', width: 2, pattern: 'wave', decoration: 'arrow' },
            // 親密敵對：灰色雙線夾紅色鋸齒 (Close Hostile - Chart)
            'close-hostile': { color: '#E53935', width: 2, pattern: 'close-hostile' },
            // 融合敵對：灰色雙線夾紅色鋸齒 (Fused Hostile)
            'fused-hostile': { color: '#E53935', width: 2, pattern: 'fused-hostile' },
            // 暴力：藍色鋸齒線 (Revert to Blue per UI Legend)
            'violence': { color: '#007BFF', width: 2, pattern: 'zigzag' },
            // 虐待：藍色波浪線
            'abuse': { color: '#007BFF', width: 2, pattern: 'wave' },
            // 身體虐待：藍色波浪 + 黑色直線 (UI Legend Style)
            'physical-abuse': { color: '#007BFF', width: 2, pattern: 'physical-abuse' },
            // 情緒虐待：藍色鋸齒 + 黑色直線 (UI Legend Style)
            'emotional-abuse': { color: '#007BFF', width: 2, pattern: 'emotional-abuse' },
            // 性虐待：藍色雙鋸齒線 (UI Legend: Double Zigzag)
            'sexual-abuse': { color: '#007BFF', width: 2, pattern: 'sexual-abuse' },
            // 忽視：藍色實線 + 箭頭 + 豎線 (UI Legend: Arrow + Bar)
            'neglect': { color: '#007BFF', width: 2, pattern: 'solid', decoration: 'arrow-bar' },
            // 操控：黑色實線 + 紅色 X (UI Legend)
            'manipulative': { color: '#000000', width: 2, pattern: 'solid', decoration: 'x' },
            // 控制：紅色實線 + 方框交叉箭頭
            'controlling': { color: '#E53935', width: 2, pattern: 'solid', decoration: 'box-cross-arrow' },
            // 關注：黑色實線 + 箭頭
            'focused': { color: '#333333', width: 2, pattern: 'solid', decoration: 'arrow' },
            // 崇拜：黑色實線 + 圓箭頭
            'admiration': { color: '#333333', width: 2, pattern: 'solid', decoration: 'circle-arrow' },
            // 衝突又親密：特殊樣式 (紅鋸齒 + 綠雙線)
            'conflict-close': { color: '#E53935', width: 2, pattern: 'conflict-close' },
            // 疏離：灰色點線
            'distant': { color: '#9e9e9e', width: 2, pattern: 'dashed', decoration: 'double-bar' }
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


