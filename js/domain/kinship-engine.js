/**
 * KinshipEngine
 * 集中管理親屬推論，避免在 app/canvas 多處重複實作且互相矛盾。
 *
 * 基本規則（優先）：
 * - parent-child 關係預設 fromPersonId = parent, toPersonId = child
 *
 * 相容策略（fallback）：
 * - 若資料與規則不一致，允許用 Y 座標高低推斷方向，避免舊資料直接失效。
 */
class KinshipEngine {
    constructor(persons = [], relationships = []) {
        this.persons = persons;
        this.relationships = relationships;
        this.personMap = new Map();
        persons.forEach(p => this.personMap.set(p.id, p));
    }

    getPerson(id) {
        return this.personMap.get(id) || null;
    }

    /**
     * 將親子關係正規化為 { parentId, childId }。
     * 優先使用 from->to；若判斷失敗才用 Y 座標 fallback。
     */
    normalizeParentChild(rel) {
        if (!rel || rel.type !== 'parent-child') return null;

        const from = this.getPerson(rel.fromPersonId);
        const to = this.getPerson(rel.toPersonId);
        if (!from || !to) return null;

        // 規範方向（優先）
        if (rel.fromPersonId !== rel.toPersonId) {
            return { parentId: rel.fromPersonId, childId: rel.toPersonId };
        }

        // fallback：用 Y 推斷
        if (from.y < to.y) return { parentId: from.id, childId: to.id };
        if (to.y < from.y) return { parentId: to.id, childId: from.id };
        return null;
    }

    hasParentChildLink(parentId, childId) {
        return this.relationships.some(rel => {
            const pc = this.normalizeParentChild(rel);
            return pc && pc.parentId === parentId && pc.childId === childId;
        });
    }

    getParentIds(personId) {
        const parents = new Set();
        this.relationships.forEach(rel => {
            const pc = this.normalizeParentChild(rel);
            if (pc && pc.childId === personId) parents.add(pc.parentId);
        });
        return Array.from(parents);
    }

    getChildrenIds(personId) {
        const children = new Set();
        this.relationships.forEach(rel => {
            const pc = this.normalizeParentChild(rel);
            if (pc && pc.parentId === personId) children.add(pc.childId);
        });
        return Array.from(children);
    }

    getAncestorIds(personId, visited = new Set()) {
        if (visited.has(personId)) return new Set();
        visited.add(personId);

        const ancestors = new Set();
        this.getParentIds(personId).forEach(parentId => {
            ancestors.add(parentId);
            this.getAncestorIds(parentId, visited).forEach(id => ancestors.add(id));
        });
        return ancestors;
    }

    getDescendantIds(personId, visited = new Set()) {
        if (visited.has(personId)) return new Set();
        visited.add(personId);

        const descendants = new Set();
        this.getChildrenIds(personId).forEach(childId => {
            descendants.add(childId);
            this.getDescendantIds(childId, visited).forEach(id => descendants.add(id));
        });
        return descendants;
    }

    shareAnyParent(personAId, personBId) {
        const parentsA = new Set(this.getParentIds(personAId));
        for (const pid of this.getParentIds(personBId)) {
            if (parentsA.has(pid)) return true;
        }
        return false;
    }
}

if (typeof window !== 'undefined') {
    window.KinshipEngine = KinshipEngine;
}
