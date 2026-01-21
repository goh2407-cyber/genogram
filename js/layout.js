/**
 * GenogramLayout - 家系圖佈局引擎
 * 使用 Dagre.js 進行階層式圖形佈局
 * 
 * @author Antigravity
 * @version 2.0.0 - Dagre-based rewrite
 */
class GenogramLayout {
    /**
     * @param {Array} persons - 人物陣列
     * @param {Array} relationships - 關係陣列
     * @param {Object} options - 選項
     * @param {Object} options.grid - 格線設定 (CELL_WIDTH, CELL_HEIGHT, ORIGIN_X, ORIGIN_Y)
     * @param {Array} options.households - 同住框陣列
     * @param {Array} options.lifeCircles - 生活圈陣列
     */
    constructor(persons, relationships, options = {}) {
        this.persons = persons || [];
        this.relationships = relationships || [];
        this.options = options;

        // 預設格線設定
        this.grid = options.grid || {
            CELL_WIDTH: 120,
            CELL_HEIGHT: 150,
            ORIGIN_X: 100,
            ORIGIN_Y: 100
        };

        this.households = options.households || [];
        this.lifeCircles = options.lifeCircles || [];

        // 建立快速查詢映射
        this.personMap = {};
        this.persons.forEach(p => this.personMap[p.id] = p);

        // 婚姻關係類型
        this.MARRIAGE_TYPES = [
            'married', 'engaged', 'cohabiting', 'legal-cohabiting',
            'separated', 'legal-separated', 'divorced', 'widowed', 'affair'
        ];

        // 原始位置 (用於計算生活圈位移)
        this.originalPositions = {};
        this.persons.forEach(p => {
            this.originalPositions[p.id] = { x: p.x, y: p.y };
        });
    }

    /**
     * 執行佈局計算
     * @returns {Object} { positions: Map<personId, {x, y}>, lifeCircleShifts: Object }
     */
    calculate() {
        if (this.persons.length === 0) {
            return { positions: new Map(), lifeCircleShifts: {} };
        }

        // 1. 計算輩份
        const ranks = this._assignRanks();

        // 2. 識別配偶對
        const couples = this._identifyCouples();

        // 3. 分離獨立 Component
        const components = this._identifyComponents();

        // 4. 建立 Dagre 圖
        const g = this._buildDagreGraph(ranks, couples);

        // 5. 執行佈局
        dagre.layout(g);

        // 6. 提取座標
        const positions = this._extractPositions(g);

        // 7. 處理多 Component 的間距
        this._adjustComponentSpacing(positions, components);

        // 8. 計算生活圈位移
        const lifeCircleShifts = this._calculateLifeCircleShifts(positions);

        return { positions, lifeCircleShifts };
    }

    /**
     * 計算每個人的輩份 (rank)
     * @returns {Object} personId -> rank number
     */
    _assignRanks() {
        const ranks = {};

        // 找案主
        const ip = this.persons.find(p => p.isIdentifiedPatient);

        // 親子關係
        const familyRels = this.relationships.filter(r => r.type === 'parent-child');

        // 婚姻關係
        const marriageRels = this.relationships.filter(r => this.MARRIAGE_TYPES.includes(r.type));

        // 輔助函式 - 只依賴關係結構，不依賴 Y 座標
        // 規則：parent-child 關係中，fromPersonId 是父母，toPersonId 是子女
        const getParents = (personId) => {
            const parents = [];
            familyRels.forEach(r => {
                // fromPersonId -> toPersonId 表示父母 -> 子女
                if (r.toPersonId === personId) {
                    parents.push(r.fromPersonId);
                }
            });
            return parents;
        };

        const getChildren = (personId) => {
            const children = [];
            familyRels.forEach(r => {
                // fromPersonId -> toPersonId 表示父母 -> 子女
                if (r.fromPersonId === personId) {
                    children.push(r.toPersonId);
                }
            });
            return children;
        };

        const getSpouses = (personId) => {
            const spouses = [];
            marriageRels.forEach(r => {
                if (r.fromPersonId === personId) spouses.push(r.toPersonId);
                else if (r.toPersonId === personId) spouses.push(r.fromPersonId);
            });
            return spouses;
        };

        // BFS 從案主開始
        const startPerson = ip || this.persons[0];
        const queue = [{ id: startPerson.id, rank: 2 }]; // 案主為 rank 2 (對應 'child' 輩)
        const visited = new Set([startPerson.id]);
        ranks[startPerson.id] = 2;

        while (queue.length > 0) {
            const { id, rank } = queue.shift();

            // 往下：子女 rank + 1
            getChildren(id).forEach(cid => {
                if (!visited.has(cid)) {
                    ranks[cid] = rank + 1;
                    visited.add(cid);
                    queue.push({ id: cid, rank: rank + 1 });
                }
            });

            // 往上：父母 rank - 1
            getParents(id).forEach(pid => {
                if (!visited.has(pid)) {
                    ranks[pid] = rank - 1;
                    visited.add(pid);
                    queue.push({ id: pid, rank: rank - 1 });
                }
            });

            // 平行：配偶同 rank
            getSpouses(id).forEach(sid => {
                if (!visited.has(sid)) {
                    ranks[sid] = rank;
                    visited.add(sid);
                    queue.push({ id: sid, rank: rank });
                }
            });
        }

        // 處理未連接的人物
        this.persons.forEach(p => {
            if (ranks[p.id] === undefined) {
                // 使用 Y 座標推測輩份
                const avgRank = Object.values(ranks).reduce((a, b) => a + b, 0) / Object.values(ranks).length || 2;
                const avgY = this.persons.filter(pp => ranks[pp.id] !== undefined)
                    .reduce((acc, pp) => acc + pp.y, 0) / this.persons.filter(pp => ranks[pp.id] !== undefined).length || 0;

                if (avgY !== 0) {
                    const deltaY = p.y - avgY;
                    ranks[p.id] = Math.round(avgRank + deltaY / this.grid.CELL_HEIGHT);
                } else {
                    ranks[p.id] = 2;
                }
            }
        });

        // 正規化：確保最小 rank 為 0
        const minRank = Math.min(...Object.values(ranks));
        if (minRank < 0) {
            const shift = Math.abs(minRank);
            Object.keys(ranks).forEach(id => ranks[id] += shift);
        }

        return ranks;
    }

    /**
     * 識別配偶對
     * @returns {Array} [{ id1, id2 }, ...]
     */
    _identifyCouples() {
        const couples = [];
        const processed = new Set();

        const marriageRels = this.relationships.filter(r => this.MARRIAGE_TYPES.includes(r.type));

        marriageRels.forEach(r => {
            const key = [r.fromPersonId, r.toPersonId].sort().join('-');
            if (!processed.has(key)) {
                processed.add(key);
                couples.push({ id1: r.fromPersonId, id2: r.toPersonId, type: r.type });
            }
        });

        return couples;
    }

    /**
     * 識別獨立的 Component
     * @returns {Object} personId -> componentId
     */
    _identifyComponents() {
        const componentMap = {};
        let componentId = 0;
        const visited = new Set();

        // 使用 BFS 識別連通分量
        this.persons.forEach(p => {
            if (visited.has(p.id)) return;

            componentId++;
            const queue = [p.id];
            visited.add(p.id);
            componentMap[p.id] = componentId;

            while (queue.length > 0) {
                const currentId = queue.shift();

                // 找所有相連的人
                this.relationships.forEach(r => {
                    let neighbor = null;
                    if (r.fromPersonId === currentId) neighbor = r.toPersonId;
                    else if (r.toPersonId === currentId) neighbor = r.fromPersonId;

                    if (neighbor && !visited.has(neighbor)) {
                        visited.add(neighbor);
                        componentMap[neighbor] = componentId;
                        queue.push(neighbor);
                    }
                });

                // 同住框也視為連通
                this.households.forEach(h => {
                    if (h.ids.includes(currentId)) {
                        h.ids.forEach(memberId => {
                            if (memberId !== currentId && !visited.has(memberId)) {
                                visited.add(memberId);
                                componentMap[memberId] = componentId;
                                queue.push(memberId);
                            }
                        });
                    }
                });
            }
        });

        return componentMap;
    }

    /**
     * 建立 Dagre 圖
     * @param {Object} ranks - 輩份映射
     * @param {Array} couples - 配偶對陣列
     * @returns {dagre.graphlib.Graph}
     */
    _buildDagreGraph(ranks, couples) {
        const g = new dagre.graphlib.Graph({ compound: true });

        g.setGraph({
            rankdir: 'TB',           // Top to Bottom
            nodesep: this.grid.CELL_WIDTH * 0.8,  // 同層節點間距
            ranksep: this.grid.CELL_HEIGHT,       // 層間距
            marginx: 50,
            marginy: 50,
            align: 'UL'              // Upper Left 對齊
        });

        g.setDefaultEdgeLabel(() => ({}));

        // 建立配偶 cluster 映射
        const coupleClusterMap = {}; // personId -> clusterId

        couples.forEach((couple, idx) => {
            const clusterId = `couple_${idx}`;

            // 建立 cluster 節點
            g.setNode(clusterId, {
                label: clusterId,
                clusterLabelPos: 'top'
            });

            coupleClusterMap[couple.id1] = clusterId;
            coupleClusterMap[couple.id2] = clusterId;
        });

        // 新增人物節點
        this.persons.forEach(p => {
            const nodeWidth = 50;  // 人物圖標寬度
            const nodeHeight = 70; // 人物圖標高度 + 名字

            g.setNode(p.id.toString(), {
                label: p.name || p.id,
                width: nodeWidth,
                height: nodeHeight,
                rank: ranks[p.id]
            });

            // 如果是配偶對的一員，設定 parent
            if (coupleClusterMap[p.id]) {
                g.setParent(p.id.toString(), coupleClusterMap[p.id]);
            }
        });

        // 新增親子關係邊 - 只依賴關係結構，不依賴 Y 座標
        // 規則：fromPersonId 是父母，toPersonId 是子女
        const familyRels = this.relationships.filter(r => r.type === 'parent-child');
        familyRels.forEach(r => {
            const fromPerson = this.personMap[r.fromPersonId];
            const toPerson = this.personMap[r.toPersonId];

            if (fromPerson && toPerson) {
                // fromPersonId 是父母，toPersonId 是子女
                g.setEdge(r.fromPersonId.toString(), r.toPersonId.toString(), {
                    weight: 2  // 親子關係權重較高
                });
            }
        });

        return g;
    }

    /**
     * 從 Dagre 結果提取座標
     * @param {dagre.graphlib.Graph} g
     * @returns {Map} personId -> { x, y }
     */
    _extractPositions(g) {
        const positions = new Map();

        this.persons.forEach(p => {
            const node = g.node(p.id.toString());
            if (node) {
                // Dagre 返回的是中心點座標
                positions.set(p.id, {
                    x: Math.round(node.x + this.grid.ORIGIN_X),
                    y: Math.round(node.y + this.grid.ORIGIN_Y)
                });
            } else {
                // 節點未被處理，保持原位
                positions.set(p.id, {
                    x: p.x,
                    y: p.y
                });
            }
        });

        return positions;
    }

    /**
     * 調整多個 Component 之間的間距
     * @param {Map} positions
     * @param {Object} componentMap
     */
    _adjustComponentSpacing(positions, componentMap) {
        // 將人物按 Component 分組
        const componentGroups = {};
        this.persons.forEach(p => {
            const compId = componentMap[p.id] || 0;
            if (!componentGroups[compId]) {
                componentGroups[compId] = [];
            }
            componentGroups[compId].push(p.id);
        });

        const componentIds = Object.keys(componentGroups).sort((a, b) => parseInt(a) - parseInt(b));

        if (componentIds.length <= 1) return;

        // 計算每個 Component 的邊界
        const componentBounds = {};
        componentIds.forEach(compId => {
            const members = componentGroups[compId];
            let minX = Infinity, maxX = -Infinity;

            members.forEach(pid => {
                const pos = positions.get(pid);
                if (pos) {
                    minX = Math.min(minX, pos.x);
                    maxX = Math.max(maxX, pos.x);
                }
            });

            componentBounds[compId] = { minX, maxX, width: maxX - minX };
        });

        // 重新排列 Component (間隔 200px)
        const COMPONENT_GAP = 200;
        let currentX = this.grid.ORIGIN_X;

        componentIds.forEach((compId, idx) => {
            const bounds = componentBounds[compId];
            const offset = currentX - bounds.minX;

            // 移動此 Component 中的所有人
            componentGroups[compId].forEach(pid => {
                const pos = positions.get(pid);
                if (pos) {
                    pos.x += offset;
                }
            });

            currentX += bounds.width + COMPONENT_GAP;
        });
    }

    /**
     * 計算生活圈的位移量
     * @param {Map} positions - 新座標
     * @returns {Object} lifeCircleId -> { dx, dy }
     */
    _calculateLifeCircleShifts(positions) {
        const shifts = {};

        if (!this.lifeCircles || this.lifeCircles.length === 0) {
            return shifts;
        }

        this.lifeCircles.forEach(lc => {
            if (!lc.points || lc.points.length === 0) {
                shifts[lc.id] = { dx: 0, dy: 0 };
                return;
            }

            // 計算生活圈的中心點
            const centerX = lc.points.reduce((sum, pt) => sum + pt.x, 0) / lc.points.length;
            const centerY = lc.points.reduce((sum, pt) => sum + pt.y, 0) / lc.points.length;

            // 計算生活圈的範圍
            const minX = Math.min(...lc.points.map(pt => pt.x));
            const maxX = Math.max(...lc.points.map(pt => pt.x));
            const minY = Math.min(...lc.points.map(pt => pt.y));
            const maxY = Math.max(...lc.points.map(pt => pt.y));

            // 找出原本在生活圈範圍內的成員
            const membersInCircle = this.persons.filter(p => {
                const orig = this.originalPositions[p.id];
                if (!orig) return false;

                // 擴大範圍 50px
                return orig.x >= minX - 50 && orig.x <= maxX + 50 &&
                    orig.y >= minY - 50 && orig.y <= maxY + 50;
            });

            if (membersInCircle.length === 0) {
                shifts[lc.id] = { dx: 0, dy: 0 };
                return;
            }

            // 計算這些成員的平均位移
            let totalDx = 0, totalDy = 0;
            membersInCircle.forEach(p => {
                const orig = this.originalPositions[p.id];
                const newPos = positions.get(p.id);
                if (orig && newPos) {
                    totalDx += newPos.x - orig.x;
                    totalDy += newPos.y - orig.y;
                }
            });

            shifts[lc.id] = {
                dx: totalDx / membersInCircle.length,
                dy: totalDy / membersInCircle.length
            };
        });

        return shifts;
    }

    /**
     * 將座標對齊到格線
     * @param {number} value
     * @param {string} axis - 'x' or 'y'
     * @returns {number}
     */
    snapToGrid(value, axis) {
        const cellSize = axis === 'x' ? this.grid.CELL_WIDTH : this.grid.CELL_HEIGHT;
        const origin = axis === 'x' ? this.grid.ORIGIN_X : this.grid.ORIGIN_Y;
        return Math.round((value - origin) / cellSize) * cellSize + origin;
    }
}

// 匯出給全域使用
if (typeof window !== 'undefined') {
    window.GenogramLayout = GenogramLayout;
}
