/**
 * KinshipEngine
 * 集中管理親屬推論，避免在 app/canvas 多處重複實作且互相矛盾。
 *
 * 唯一規則：
 * - parent-child 關係一律 fromPersonId = parent, toPersonId = child
 * - 座標只負責顯示，不參與親屬語意判斷（GENERATION_POLICY 第 2 條）
 * - 舊資料的方向一致性由 App.migrateRelationships() 在載入時保證
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
     * 一律信任 from→to 方向；拒絕 self-loop 與缺漏節點。
     */
    normalizeParentChild(rel) {
        if (!rel || rel.type !== 'parent-child') return null;
        if (rel.fromPersonId === rel.toPersonId) return null;
        if (!this.personMap.has(rel.fromPersonId)) return null;
        if (!this.personMap.has(rel.toPersonId)) return null;
        return { parentId: rel.fromPersonId, childId: rel.toPersonId };
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
