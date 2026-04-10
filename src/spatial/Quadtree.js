// spatial/Quadtree.js
class QuadtreeNode {
    constructor(bounds, capacity) {
        this.bounds = bounds;   // { x, y, w, h } in tile units
        this.capacity = capacity;
        this.objects = [];
        this.children = null;
    }
    isLeaf() { return this.children === null; }
    subdivide() {
        const x = this.bounds.x;
        const y = this.bounds.y;
        const w = this.bounds.w / 2;
        const h = this.bounds.h / 2;

        this.children = [
            new QuadtreeNode({ x: x,     y: y,     w, h }, this.capacity),  // NW
            new QuadtreeNode({ x: x + w, y: y,     w, h }, this.capacity),  // NE
            new QuadtreeNode({ x: x,     y: y + h, w, h }, this.capacity),  // SW
            new QuadtreeNode({ x: x + w, y: y + h, w, h }, this.capacity),  // SE
        ];
    }
}

export class Quadtree {
    constructor(bounds, capacity = 8) {
        this.root = new QuadtreeNode(bounds, capacity);
    }

    clear() {
        this._clearNode(this.root);
    }

    _clearNode(node) {
        node.objects = [];
        if (!node.isLeaf()) {
            for (const child of node.children) this._clearNode(child);
            node.children = null;
        }
    }

    insert(object) {
        this._insert(object, this.root);
    }

    _insert(object, node) {
        if (!this._contains(node.bounds, object)) return;

        if (node.isLeaf() && node.objects.length < node.capacity) {
            node.objects.push(object);
        } else {
            if (node.isLeaf()) node.subdivide();
            for (const child of node.children) {
                this._insert(object, child);
            }
        }
    }

    queryRange(range, result = []) {
        this._query(this.root, range, result);
        return result;
    }

    _query(node, range, result) {
        if (!this._intersects(node.bounds, range)) return;
        for (const obj of node.objects) {
            // expand the check by the object's own radius
            const r = obj.radius ?? 0;
            if (obj.x + r >= range.x && obj.x - r <= range.x + range.w &&
                obj.y + r >= range.y && obj.y - r <= range.y + range.h) {
                result.push(obj);
            }
        }
        if (!node.isLeaf()) {
            for (const child of node.children) this._query(child, range, result);
        }
    }

    // rebuild the whole tree from a list of objects
    rebuild(objects) {
        this.clear();
        for (const obj of objects) this.insert(obj);
    }

    // helpers
    _contains(rect, obj) {
        return obj.x >= rect.x && obj.x <= rect.x + rect.w &&
               obj.y >= rect.y && obj.y <= rect.y + rect.h;
    }
    _intersects(a, b) {
        return !(a.x + a.w < b.x || b.x + b.w < a.x ||
                 a.y + a.h < b.y || b.y + b.h < a.y);
    }
}