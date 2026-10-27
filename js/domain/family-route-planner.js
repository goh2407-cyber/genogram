/**
 * FamilyRoutePlanner
 *
 * Pure, deterministic geometry for family routes. Relationship meaning is
 * supplied by KinshipEngine callers; this class never infers parenthood from Y.
 */
class FamilyRoutePlanner {
    static planFamily(input = {}) {
        const personSize = this._finitePositive(input.personSize, 50);
        const margin = this._finiteNonNegative(input.margin, 10);
        const parents = this._normalizePeople(input.parents);
        const children = this._normalizePeople(input.children, true);
        const obstacles = this._normalizeObstacles(input.obstacles);

        if (parents.length === 0 || children.length === 0) {
            return this._emptyPlan();
        }

        const parentY = parents.reduce((sum, person) => sum + person.y, 0) / parents.length;
        const childY = children.reduce((sum, person) => sum + person.y, 0) / children.length;
        const normalized = { ...input, parents, children, obstacles, personSize, margin };

        if (Math.abs(childY - parentY) < personSize) {
            return this._planPairwise('same-row', normalized);
        }
        if (childY < parentY) {
            return this._planPairwise('reversed', normalized);
        }
        return this._planNormal(normalized);
    }

    static pathIntersectsObstacles(points, obstacles = [], allowedOwnerIds = new Set()) {
        if (!Array.isArray(points) || points.length < 2) return false;
        const allowed = allowedOwnerIds instanceof Set ? allowedOwnerIds : new Set(allowedOwnerIds || []);
        const rects = this._normalizeObstacles(obstacles);
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];
            for (const rect of rects) {
                if (allowed.has(rect.ownerId)) continue;
                if (this._segmentIntersectsRect(a, b, rect)) return true;
            }
        }
        return false;
    }

    static segmentIntersectsRect(a, b, rect) {
        const normalized = this._normalizeObstacles([rect]);
        return normalized.length === 1 && this._segmentIntersectsRect(a, b, normalized[0]);
    }

    static pathIntersectionCount(points, obstacles = [], allowedSymbolOwnerIds = new Set()) {
        if (!Array.isArray(points) || points.length < 2) return 0;
        const ownerIds = allowedSymbolOwnerIds instanceof Set
            ? allowedSymbolOwnerIds : new Set(allowedSymbolOwnerIds || []);
        const allowed = new Set([...ownerIds].map(ownerId => String(ownerId)));
        const rects = this._normalizeObstacles(obstacles);
        let count = 0;
        for (let index = 1; index < points.length; index++) {
            for (const rect of rects) {
                if (rect.kind === 'symbol' && allowed.has(String(rect.ownerId))) continue;
                if (this._segmentIntersectsRect(points[index - 1], points[index], rect)) count++;
            }
        }
        return count;
    }

    static pathLength(points) {
        return (points || []).slice(1).reduce((total, point, index) =>
            total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
    }

    static pathBendCount(points) {
        let bends = 0;
        for (let index = 2; index < (points || []).length; index++) {
            const a = points[index - 2], b = points[index - 1], c = points[index];
            const firstHorizontal = Math.abs(a.y - b.y) <= 1e-9;
            const secondHorizontal = Math.abs(b.y - c.y) <= 1e-9;
            if (firstHorizontal !== secondHorizontal) bends++;
        }
        return bends;
    }

    static polylineCrossingCount(points, occupiedSegments = []) {
        let count = 0;
        const samePoint = (a, b) => Math.abs(a.x - b.x) <= 1e-9
            && Math.abs(a.y - b.y) <= 1e-9;
        for (let index = 1; index < (points || []).length; index++) {
            const a = points[index - 1], b = points[index];
            occupiedSegments.forEach(segment => {
                if (samePoint(a, segment.start) || samePoint(a, segment.end)
                    || samePoint(b, segment.start) || samePoint(b, segment.end)) return;
                if (this._segmentsIntersect(a, b, segment.start, segment.end)) count++;
            });
        }
        return count;
    }

    /**
     * 固定走法（2026-10-27，仿網路版）：下垂點就是 source（婚姻線中點，由 canvas 決定），
     * 橫桿高度只看父母那一列（父母下方一輩、子女頭頂上方；父母姓名／備註較長時再往下讓開），
     * 子女被拖得更高時才跟著上移。
     * 不避讓、不換走法；穿過別人時 safe=false 並列出 collisions，交給使用者手動移開。
     */
    static _planNormal(input) {
        const { parents, children, obstacles, personSize, margin } = input;
        const half = personSize / 2;
        const source = this._finitePoint(input.source) || {
            x: parents.reduce((sum, person) => sum + person.x, 0) / parents.length,
            y: Math.max(...parents.map(person => person.y + half))
        };
        const sourcePrefix = this._dedupePoints(
            (Array.isArray(input.sourcePrefix) ? input.sourcePrefix : []).filter(point => this._finitePoint(point))
        );
        const minSegment = Math.max(8, Math.min(20, margin + 6));
        const generationGap = this._finitePositive(input.generationGap, 120);
        const parentRowY = Math.max(...parents.map(person => person.y));
        const parentIds = new Set(parents.map(parent => parent.id));
        const parentLabelBottom = obstacles
            .filter(obstacle => parentIds.has(obstacle.ownerId))
            .reduce((bottom, obstacle) => Math.max(bottom, obstacle.bottom), -Infinity);
        const standardBarY = Math.max(parentRowY + generationGap - half - minSegment, parentLabelBottom);
        const minChildTop = Math.min(...children.map(child => child.y - half));
        const barY = Math.max(source.y + 8, Math.min(standardBarY, minChildTop - minSegment));
        return this._buildNormalCandidate({
            parents, children, obstacles, personSize,
            source, sourcePrefix, trunkX: source.x, barY
        });
    }

    static _buildNormalCandidate({ parents, children, obstacles, personSize, source, sourcePrefix = [], trunkX, barY }) {
        const half = personSize / 2;
        const prefix = sourcePrefix.length > 0
            ? this._dedupePoints([...sourcePrefix, source])
            : [source];
        const sourcePath = this._dedupePoints([...prefix, { x: trunkX, y: barY }]);
        const twinMap = new Map();
        const nonTwins = [];
        children.forEach(child => {
            if (child.twinGroup) {
                if (!twinMap.has(child.twinGroup)) twinMap.set(child.twinGroup, []);
                twinMap.get(child.twinGroup).push(child);
            } else {
                nonTwins.push(child);
            }
        });
        const validTwinGroups = Array.from(twinMap.entries())
            .filter(([, twins]) => twins.length >= 2)
            .sort(([a], [b]) => String(a).localeCompare(String(b)));
        const groupedIds = new Set(validTwinGroups.flatMap(([, twins]) => twins.map(twin => twin.id)));
        children.filter(child => child.twinGroup && !groupedIds.has(child.id)).forEach(child => nonTwins.push(child));
        nonTwins.sort((a, b) => a.x - b.x || String(a.id).localeCompare(String(b.id)));

        const allSameTwinGroup = validTwinGroups.length === 1 &&
            validTwinGroups[0][1].length === children.length;
        const branchXByChild = new Map();
        nonTwins.forEach(child => branchXByChild.set(child.id, child.x));
        validTwinGroups.forEach(([, twins]) => {
            const centerX = (Math.min(...twins.map(twin => twin.x)) + Math.max(...twins.map(twin => twin.x))) / 2;
            twins.forEach(twin => branchXByChild.set(twin.id, centerX));
        });

        const branchXs = allSameTwinGroup ? [source.x] : [trunkX, ...Array.from(branchXByChild.values())];
        const barPath = allSameTwinGroup
            ? []
            : this._dedupePoints([
                { x: Math.min(...branchXs), y: barY },
                { x: Math.max(...branchXs), y: barY }
            ]);
        const relationshipPaths = {};
        const childPaths = {};
        const twinGroups = [];

        nonTwins.forEach(child => {
            const end = { x: child.x, y: child.y - half };
            const childPath = this._dedupePoints([{ x: child.x, y: barY }, end]);
            childPaths[child.id] = childPath;
            const fullPath = this._dedupePoints([...sourcePath, { x: child.x, y: barY }, end]);
            parents.forEach(parent => { relationshipPaths[`${parent.id}->${child.id}`] = fullPath; });
        });

        validTwinGroups.forEach(([groupId, twins]) => {
            twins.sort((a, b) => a.x - b.x || String(a.id).localeCompare(String(b.id)));
            const centerX = (twins[0].x + twins[twins.length - 1].x) / 2;
            const origin = allSameTwinGroup ? source : { x: centerX, y: barY };
            const paths = twins.map(twin => {
                const end = { x: twin.x, y: twin.y - half };
                const path = this._dedupePoints([origin, end]);
                childPaths[twin.id] = path;
                const fullPath = allSameTwinGroup
                    ? this._dedupePoints([...prefix, end])
                    : this._dedupePoints([...sourcePath, { x: centerX, y: barY }, end]);
                parents.forEach(parent => { relationshipPaths[`${parent.id}->${twin.id}`] = fullPath; });
                return { childId: twin.id, points: path };
            });
            let monoBar = null;
            if (twins.every(twin => twin.zygosity === 'mono')) {
                const left = twins[0];
                const right = twins[twins.length - 1];
                const leftEnd = { x: left.x, y: left.y - half };
                const rightEnd = { x: right.x, y: right.y - half };
                monoBar = [
                    { x: origin.x + (leftEnd.x - origin.x) * 0.5, y: origin.y + (leftEnd.y - origin.y) * 0.5 },
                    { x: origin.x + (rightEnd.x - origin.x) * 0.5, y: origin.y + (rightEnd.y - origin.y) * 0.5 }
                ];
            }
            twinGroups.push({ id: groupId, origin, paths, monoBar });
        });

        let safe = true;
        const parentIds = new Set(parents.map(parent => parent.id));
        for (const child of children) {
            const path = relationshipPaths[`${parents[0].id}->${child.id}`];
            if (!path || this._pathHitsPlanObstacle(path, obstacles, parentIds, child.id)) {
                safe = false;
                break;
            }
        }
        if (safe && barPath.length >= 2 && this._pathHitsPlanObstacle(barPath, obstacles, parentIds, null)) {
            safe = false;
        }

        return {
            mode: 'normal-trunk',
            safe,
            trunkX,
            barY,
            source: { ...source },
            sourcePath: allSameTwinGroup && prefix.length < 2 ? [] : (allSameTwinGroup ? prefix : sourcePath),
            barPath,
            childPaths,
            twinGroups,
            relationshipPaths,
            collisions: safe ? [] : this._collectRelationshipCollisions(relationshipPaths, obstacles, parents),
            suggestedDx: null
        };
    }

    static _planPairwise(mode, input) {
        const { parents, children, obstacles, personSize, margin } = input;
        const half = personSize / 2;
        const bounds = this._obstacleBounds(obstacles, [...parents, ...children], personSize);
        const relationshipPaths = {};
        const childPaths = {};
        const collisions = [];
        let allSafe = true;

        for (const child of children) {
            for (const parent of parents) {
                const key = `${parent.id}->${child.id}`;
                let candidates = mode === 'reversed'
                    ? this._reversedCandidates(parent, child, half, bounds, margin)
                    : this._sameRowCandidates(parent, child, half, bounds, margin);
                // 同一列且兩人之間另有伴侶／情感線：直線會跟那條線疊在一起 → 先試上方繞（ㄇ），再下方，直線最後
                const avoid = Array.isArray(input.avoidStraightPairs) && input.avoidStraightPairs.includes(key);
                if (mode === 'same-row' && avoid && candidates.length >= 3) {
                    // 從兩人頭頂往上繞（整條都不碰到兩人之間的水平線）
                    const laneY = Math.min(parent.y, child.y) - half - 22;
                    // 起點從父母頭頂「偏向子女那一側」出發，不跟父母自己往上接的親子線（頭頂正中）重疊
                    const dir = child.x >= parent.x ? 1 : -1;
                    const startX = parent.x + dir * half * 0.5;
                    const overTops = this._dedupePoints([
                        { x: startX, y: parent.y - half }, { x: startX, y: laneY },
                        { x: child.x, y: laneY }, { x: child.x, y: child.y - half }
                    ]);
                    candidates = [overTops, candidates[1], candidates[2], candidates[0]];
                }
                const allowedSymbols = new Set([parent.id, child.id]);
                let chosen = candidates.find(path => !this._pathHitsPlanObstacle(path, obstacles, allowedSymbols, child.id, true));
                if (!chosen) {
                    chosen = candidates[0] || this._dedupePoints([
                        { x: parent.x, y: parent.y },
                        { x: child.x, y: child.y }
                    ]);
                    allSafe = false;
                    collisions.push(...this._collectPathCollisions(chosen, obstacles, allowedSymbols, child.id, true));
                }
                relationshipPaths[key] = chosen;
                if (!childPaths[child.id]) childPaths[child.id] = chosen;
            }
        }

        return {
            mode,
            safe: allSafe,
            trunkX: null,
            barY: null,
            source: null,
            sourcePath: [],
            barPath: [],
            childPaths,
            twinGroups: [],
            relationshipPaths,
            collisions: this._uniqueStrings(collisions),
            suggestedDx: null
        };
    }

    static _reversedCandidates(parent, child, half, bounds, margin) {
        const start = { x: parent.x, y: parent.y - half };
        const end = { x: child.x, y: child.y + half };
        const midY = (start.y + end.y) / 2;
        const step = Math.max(8, Math.min(20, margin + 6));
        const upperY = end.y + step;
        const lowerY = start.y - step;
        const leftLane = bounds.left - margin - 20;
        const rightLane = bounds.right + margin + 20;
        return [
            this._dedupePoints([start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]),
            this._dedupePoints([start, { x: start.x, y: lowerY }, { x: leftLane, y: lowerY }, { x: leftLane, y: upperY }, { x: end.x, y: upperY }, end]),
            this._dedupePoints([start, { x: start.x, y: lowerY }, { x: rightLane, y: lowerY }, { x: rightLane, y: upperY }, { x: end.x, y: upperY }, end])
        ];
    }

    static _sameRowCandidates(parent, child, half, bounds, margin) {
        const direction = child.x >= parent.x ? 1 : -1;
        const start = { x: parent.x + direction * half, y: parent.y };
        const end = { x: child.x - direction * half, y: child.y };
        const step = Math.max(8, Math.min(20, margin + 6));
        const startOutX = start.x + direction * step;
        const endOutX = end.x - direction * step;
        const topLane = bounds.top - margin - 20;
        const bottomLane = bounds.bottom + margin + 20;
        return [
            this._dedupePoints([start, end]),
            this._dedupePoints([start, { x: startOutX, y: start.y }, { x: startOutX, y: topLane }, { x: endOutX, y: topLane }, { x: endOutX, y: end.y }, end]),
            this._dedupePoints([start, { x: startOutX, y: start.y }, { x: startOutX, y: bottomLane }, { x: endOutX, y: bottomLane }, { x: endOutX, y: end.y }, end])
        ];
    }

    static _pathHitsPlanObstacle(path, obstacles, parentIds, childId, endpointSymbolsOnly = false) {
        const allowedSymbols = parentIds instanceof Set ? parentIds : new Set(parentIds || []);
        for (let i = 1; i < path.length; i++) {
            const a = path[i - 1];
            const b = path[i];
            for (const obstacle of obstacles) {
                const isEndpointSymbol = obstacle.kind === 'symbol' &&
                    (allowedSymbols.has(obstacle.ownerId) || obstacle.ownerId === childId);
                if (isEndpointSymbol) continue;
                if (endpointSymbolsOnly && obstacle.kind === 'symbol' && allowedSymbols.has(obstacle.ownerId)) continue;
                if (this._segmentIntersectsRect(a, b, obstacle)) return true;
            }
        }
        return false;
    }

    static _collectRelationshipCollisions(relationshipPaths, obstacles, parents) {
        const parentIds = new Set(parents.map(parent => parent.id));
        const collisions = [];
        Object.entries(relationshipPaths).forEach(([key, path]) => {
            const childId = key.slice(key.indexOf('->') + 2);
            collisions.push(...this._collectPathCollisions(path, obstacles, parentIds, childId));
        });
        return this._uniqueStrings(collisions);
    }

    static _collectPathCollisions(path, obstacles, allowedSymbols, childId) {
        const collisions = [];
        for (let i = 1; i < path.length; i++) {
            for (const obstacle of obstacles) {
                const isEndpointSymbol = obstacle.kind === 'symbol' &&
                    (allowedSymbols.has(obstacle.ownerId) || obstacle.ownerId === childId);
                if (isEndpointSymbol) continue;
                if (this._segmentIntersectsRect(path[i - 1], path[i], obstacle)) {
                    collisions.push(`${obstacle.ownerId || 'unknown'}:${obstacle.kind || 'obstacle'}`);
                }
            }
        }
        return collisions;
    }

    static _segmentIntersectsRect(a, b, rect) {
        if (!this._finitePoint(a) || !this._finitePoint(b)) return true;
        // Rectangles already include their visual safety margin. A route may run
        // exactly on that outer boundary; only entering the interior is a collision.
        const epsilon = 1e-7;
        const inner = {
            left: rect.left + epsilon,
            right: rect.right - epsilon,
            top: rect.top + epsilon,
            bottom: rect.bottom - epsilon
        };
        if (inner.left >= inner.right || inner.top >= inner.bottom) return false;
        if (this._pointInRect(a, inner) || this._pointInRect(b, inner)) return true;
        const edges = [
            [{ x: inner.left, y: inner.top }, { x: inner.right, y: inner.top }],
            [{ x: inner.right, y: inner.top }, { x: inner.right, y: inner.bottom }],
            [{ x: inner.right, y: inner.bottom }, { x: inner.left, y: inner.bottom }],
            [{ x: inner.left, y: inner.bottom }, { x: inner.left, y: inner.top }]
        ];
        return edges.some(([c, d]) => this._segmentsIntersect(a, b, c, d));
    }

    static _segmentsIntersect(a, b, c, d) {
        const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
        const onSegment = (p, q, r) =>
            q.x >= Math.min(p.x, r.x) - 1e-9 && q.x <= Math.max(p.x, r.x) + 1e-9 &&
            q.y >= Math.min(p.y, r.y) - 1e-9 && q.y <= Math.max(p.y, r.y) + 1e-9;
        const o1 = orient(a, b, c);
        const o2 = orient(a, b, d);
        const o3 = orient(c, d, a);
        const o4 = orient(c, d, b);
        if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
            ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
        if (Math.abs(o1) < 1e-9 && onSegment(a, c, b)) return true;
        if (Math.abs(o2) < 1e-9 && onSegment(a, d, b)) return true;
        if (Math.abs(o3) < 1e-9 && onSegment(c, a, d)) return true;
        if (Math.abs(o4) < 1e-9 && onSegment(c, b, d)) return true;
        return false;
    }

    static _pointInRect(point, rect) {
        return point.x >= rect.left && point.x <= rect.right &&
            point.y >= rect.top && point.y <= rect.bottom;
    }

    static _obstacleBounds(obstacles, people, personSize) {
        const half = personSize / 2;
        const lefts = obstacles.map(rect => rect.left).concat(people.map(person => person.x - half));
        const rights = obstacles.map(rect => rect.right).concat(people.map(person => person.x + half));
        const tops = obstacles.map(rect => rect.top).concat(people.map(person => person.y - half));
        const bottoms = obstacles.map(rect => rect.bottom).concat(people.map(person => person.y + half));
        return {
            left: Math.min(...lefts), right: Math.max(...rights),
            top: Math.min(...tops), bottom: Math.max(...bottoms)
        };
    }

    static _normalizePeople(people, sortByX = false) {
        const normalized = (Array.isArray(people) ? people : [])
            .filter(person => person && person.id !== undefined && Number.isFinite(person.x) && Number.isFinite(person.y))
            .map(person => ({
                id: String(person.id), x: person.x, y: person.y,
                twinGroup: person.twinGroup || null,
                zygosity: person.zygosity || null
            }));
        normalized.sort(sortByX
            ? (a, b) => a.x - b.x || a.id.localeCompare(b.id)
            : (a, b) => a.id.localeCompare(b.id));
        return normalized;
    }

    static _normalizeObstacles(obstacles) {
        return (Array.isArray(obstacles) ? obstacles : [])
            .filter(rect => rect && [rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite))
            .map(rect => ({
                ownerId: rect.ownerId === undefined ? null : String(rect.ownerId),
                kind: rect.kind || 'obstacle',
                left: Math.min(rect.left, rect.right),
                right: Math.max(rect.left, rect.right),
                top: Math.min(rect.top, rect.bottom),
                bottom: Math.max(rect.top, rect.bottom)
            }))
            .sort((a, b) =>
                a.left - b.left || a.top - b.top || a.right - b.right || a.bottom - b.bottom ||
                String(a.ownerId).localeCompare(String(b.ownerId)) || a.kind.localeCompare(b.kind));
    }

    static cleanPath(points) {
        const finite = [];
        (points || []).forEach(point => {
            if (!this._finitePoint(point)) return;
            const next = { x: point.x, y: point.y };
            const previous = finite[finite.length - 1];
            if (!previous || Math.abs(previous.x - next.x) > 1e-9
                || Math.abs(previous.y - next.y) > 1e-9) {
                finite.push(next);
            }
        });

        const result = [];
        finite.forEach(point => {
            while (result.length >= 2) {
                const a = result[result.length - 2];
                const b = result[result.length - 1];
                const horizontal = Math.abs(a.y - b.y) <= 1e-9
                    && Math.abs(b.y - point.y) <= 1e-9
                    && b.x >= Math.min(a.x, point.x) - 1e-9
                    && b.x <= Math.max(a.x, point.x) + 1e-9;
                const vertical = Math.abs(a.x - b.x) <= 1e-9
                    && Math.abs(b.x - point.x) <= 1e-9
                    && b.y >= Math.min(a.y, point.y) - 1e-9
                    && b.y <= Math.max(a.y, point.y) + 1e-9;
                if (!horizontal && !vertical) break;
                result.pop();
            }
            result.push(point);
        });
        if (result.length === 1) result.push({ ...result[0] });
        return result;
    }

    static _dedupePoints(points) {
        return this.cleanPath(points);
    }

    static _finitePoint(point) {
        return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
    }

    static _finitePositive(value, fallback) {
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }

    static _finiteNonNegative(value, fallback) {
        return Number.isFinite(value) && value >= 0 ? value : fallback;
    }

    static _uniqueStrings(values) {
        return Array.from(new Set(values)).sort();
    }

    static _emptyPlan() {
        return {
            mode: 'empty', safe: true, trunkX: null, barY: null, source: null,
            sourcePath: [], barPath: [], childPaths: {}, twinGroups: [],
            relationshipPaths: {}, collisions: [], suggestedDx: null
        };
    }
}

if (typeof window !== 'undefined') {
    window.FamilyRoutePlanner = FamilyRoutePlanner;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FamilyRoutePlanner;
}
