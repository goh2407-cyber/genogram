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

    static _planNormal(input) {
        const { parents, children, obstacles, personSize, margin } = input;
        const half = personSize / 2;
        const preferredSource = this._finitePoint(input.source) || {
            x: parents.reduce((sum, person) => sum + person.x, 0) / parents.length,
            y: Math.max(...parents.map(person => person.y + half))
        };
        const sourcePrefix = this._dedupePoints(
            (Array.isArray(input.sourcePrefix) ? input.sourcePrefix : []).filter(point => this._finitePoint(point))
        );
        const rawRange = input.sourceRange || { minX: preferredSource.x, maxX: preferredSource.x };
        const range = {
            minX: Math.min(this._finite(rawRange.minX, preferredSource.x), this._finite(rawRange.maxX, preferredSource.x)),
            maxX: Math.max(this._finite(rawRange.minX, preferredSource.x), this._finite(rawRange.maxX, preferredSource.x))
        };
        const childrenCenterX = children.reduce((sum, child) => sum + child.x, 0) / children.length;
        const minChildTop = Math.min(...children.map(child => child.y - half));
        const minSegment = Math.max(8, Math.min(20, margin + 6));
        const parentIds = new Set(parents.map(parent => parent.id));
        const parentSafetyBottom = obstacles
            .filter(obstacle => obstacle.kind === 'symbol' && parentIds.has(obstacle.ownerId))
            .reduce((bottom, obstacle) => Math.max(bottom, obstacle.bottom), preferredSource.y);
        const minBarY = Math.max(preferredSource.y + minSegment, parentSafetyBottom);
        const maxBarY = minChildTop - minSegment;

        const clampX = value => Math.max(range.minX, Math.min(range.maxX, value));
        const trunkXs = this._uniqueNumbers([
            preferredSource.x,
            childrenCenterX,
            preferredSource.x - 30,
            preferredSource.x + 30,
            preferredSource.x - 60,
            preferredSource.x + 60,
            range.minX,
            range.maxX
        ].map(clampX));
        const barYs = minBarY <= maxBarY
            ? this._uniqueNumbers([
                (preferredSource.y + minChildTop) / 2,
                minBarY,
                maxBarY,
                preferredSource.y + 30
            ].map(value => Math.max(minBarY, Math.min(maxBarY, value))))
            : [];

        const candidates = [];
        for (const trunkX of trunkXs) {
            for (const barY of barYs) {
                const candidate = this._buildNormalCandidate({
                    parents, children, obstacles, personSize,
                    source: { x: trunkX, y: preferredSource.y },
                    sourcePrefix, trunkX, barY
                });
                if (!candidate.safe) continue;
                candidate.score = this._routeScore(candidate.relationshipPaths, preferredSource.x, trunkX);
                candidates.push(candidate);
            }
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => a.score - b.score || a.trunkX - b.trunkX || a.barY - b.barY);
            return candidates[0];
        }

        if (!input._skipStaggered && children.length > 1 && children.every(child => !child.twinGroup)) {
            const staggered = this._planStaggeredNormal(input);
            if (staggered) return staggered;
        }

        const fallbackBarY = Number.isFinite(minChildTop)
            ? preferredSource.y + Math.max(8, (minChildTop - preferredSource.y) / 2)
            : preferredSource.y + 20;
        const bounds = this._obstacleBounds(obstacles, [...parents, ...children], personSize);
        const laneX = bounds.left - margin - 20;
        const fallback = this._buildNormalCandidate({
            parents, children, obstacles, personSize,
            source: { x: clampX(preferredSource.x), y: preferredSource.y },
            sourcePrefix,
            trunkX: laneX,
            barY: fallbackBarY,
            forceSideLane: true
        });
        fallback.safe = false;
        fallback.mode = 'side-lane';
        fallback.collisions = this._collectPlanCollisions(fallback, obstacles, parents);
        fallback.suggestedDx = null;
        return fallback;
    }

    static _planStaggeredNormal(input) {
        const relationshipPaths = {};
        const childPaths = {};
        for (const child of input.children) {
            const childPlan = this._planNormal({ ...input, children: [child], _skipStaggered: true });
            if (!childPlan.safe) return null;
            const representative = childPlan.relationshipPaths[`${input.parents[0].id}->${child.id}`];
            if (!representative) return null;
            childPaths[child.id] = representative.map(point => ({ ...point }));
            input.parents.forEach(parent => {
                const path = childPlan.relationshipPaths[`${parent.id}->${child.id}`];
                if (path) relationshipPaths[`${parent.id}->${child.id}`] = path.map(point => ({ ...point }));
            });
        }
        return {
            mode: 'staggered',
            safe: true,
            trunkX: null,
            barY: null,
            source: null,
            sourcePath: [],
            barPath: [],
            childPaths,
            twinGroups: [],
            relationshipPaths,
            collisions: [],
            suggestedDx: null
        };
    }

    static _buildNormalCandidate({ parents, children, obstacles, personSize, source, sourcePrefix = [], trunkX, barY, forceSideLane = false }) {
        const half = personSize / 2;
        const prefix = sourcePrefix.length > 0
            ? this._dedupePoints([...sourcePrefix, source])
            : [source];
        const sourcePath = forceSideLane && Math.abs(source.x - trunkX) > 0.01
            ? this._dedupePoints([
                ...prefix,
                { x: source.x, y: source.y + 8 },
                { x: trunkX, y: source.y + 8 },
                { x: trunkX, y: barY }
            ])
            : this._dedupePoints([...prefix, { x: trunkX, y: barY }]);
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
            mode: forceSideLane ? 'side-lane' : 'normal-trunk',
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
                const candidates = mode === 'reversed'
                    ? this._reversedCandidates(parent, child, half, bounds, margin)
                    : this._sameRowCandidates(parent, child, half, bounds, margin);
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

    static _collectPlanCollisions(plan, obstacles, parents) {
        return this._collectRelationshipCollisions(plan.relationshipPaths, obstacles, parents);
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

    static _routeScore(paths, preferredX, trunkX) {
        let length = 0;
        let bends = 0;
        const seen = new Set();
        Object.values(paths).forEach(path => {
            const signature = JSON.stringify(path);
            if (seen.has(signature)) return;
            seen.add(signature);
            for (let i = 1; i < path.length; i++) {
                length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
                if (i >= 2) {
                    const previousHorizontal = path[i - 1].y === path[i - 2].y;
                    const currentHorizontal = path[i].y === path[i - 1].y;
                    if (previousHorizontal !== currentHorizontal) bends++;
                }
            }
        });
        return bends * 1000 + length + Math.abs(trunkX - preferredX) * 0.1;
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

    static _dedupePoints(points) {
        const result = [];
        (points || []).forEach(point => {
            if (!this._finitePoint(point)) return;
            const normalized = { x: point.x, y: point.y };
            const previous = result[result.length - 1];
            if (!previous || Math.abs(previous.x - normalized.x) > 1e-9 || Math.abs(previous.y - normalized.y) > 1e-9) {
                result.push(normalized);
            }
        });
        if (result.length === 1) result.push({ ...result[0] });
        return result;
    }

    static _finitePoint(point) {
        return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
    }

    static _finite(value, fallback) {
        return Number.isFinite(value) ? value : fallback;
    }

    static _finitePositive(value, fallback) {
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }

    static _finiteNonNegative(value, fallback) {
        return Number.isFinite(value) && value >= 0 ? value : fallback;
    }

    static _uniqueNumbers(values) {
        const result = [];
        values.forEach(value => {
            if (!Number.isFinite(value)) return;
            if (!result.some(existing => Math.abs(existing - value) < 1e-9)) result.push(value);
        });
        return result;
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
