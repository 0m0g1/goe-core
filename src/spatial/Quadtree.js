// spatial/Quadtree.js
class QuadtreeNode {
    constructor(bounds, capacity) {
        this.bounds = bounds;
        this.capacity = capacity;
        this.objects = [];
        this.children = null;
    }
    isLeaf() { return this.children === null; }
    subdivide() {
        const { x, y, w, h } = this.bounds;
        const hw = w / 2, hh = h / 2;
        this.children = [
            new QuadtreeNode({ x: x,      y: y,      w: hw, h: hh }, this.capacity),
            new QuadtreeNode({ x: x + hw, y: y,      w: hw, h: hh }, this.capacity),
            new QuadtreeNode({ x: x,      y: y + hh, w: hw, h: hh }, this.capacity),
            new QuadtreeNode({ x: x + hw, y: y + hh, w: hw, h: hh }, this.capacity),
        ];
    }
}

export class Quadtree {
    constructor(bounds, capacity = 8) {
        this.root = new QuadtreeNode(bounds, capacity);
    }

    clear() { this._clearNode(this.root); }

    _clearNode(node) {
        node.objects = [];
        if (!node.isLeaf()) {
            for (const child of node.children) this._clearNode(child);
            node.children = null;
        }
    }

    insert(object) { this._insert(object, this.root); }

    _insert(object, node) {
        if (!this._contains(node.bounds, object)) return;

        if (node.isLeaf()) {
            if (node.objects.length < node.capacity) {
                node.objects.push(object);
                return;
            }

            // Subdivide and redistribute existing objects
            node.subdivide();
            const existing = node.objects;
            node.objects = [];                 // clear parent

            for (const obj of existing) {
                for (const child of node.children) {
                    if (this._contains(child.bounds, obj)) {
                        this._insert(obj, child);
                        break;               // ✅ insert into FIRST containing child only
                    }
                }
            }

            // Insert the NEW object into the first containing child
            for (const child of node.children) {
                if (this._contains(child.bounds, object)) {
                    this._insert(object, child);
                    break;                   // ✅ once inserted, stop
                }
            }
            return;                          // ✅ do NOT fall through to non‑leaf code
        }

        // Non‑leaf: insert into the first containing child
        for (const child of node.children) {
            if (this._contains(child.bounds, object)) {
                this._insert(object, child);
                break;                       // ✅ only one child
            }
        }
    }

    queryRange(range, result = []) {
        const seen = new Set();                         // ← dedup guard
        this._query(this.root, range, seen);
        for (const item of seen) result.push(item);
        return result;
    }

    _query(node, range, seen) {
        if (!this._intersects(node.bounds, range)) return;
        for (const obj of node.objects) {
            const r = obj.radius ?? 0;
            if (obj.x + r >= range.x && obj.x - r <= range.x + range.w &&
                obj.y + r >= range.y && obj.y - r <= range.y + range.h) {
                seen.add(obj);                          // Set ignores duplicates
            }
        }
        if (!node.isLeaf()) {
            for (const child of node.children) this._query(child, range, seen);
        }
    }

    rebuild(objects) {
        this.clear();
        for (const obj of objects) this.insert(obj);
    }

    _contains(rect, obj) {
        return obj.x >= rect.x && obj.x <= rect.x + rect.w &&
               obj.y >= rect.y && obj.y <= rect.y + rect.h;
    }
    _intersects(a, b) {
        return !(a.x + a.w < b.x || b.x + b.w < a.x ||
                 a.y + a.h < b.y || b.y + b.h < a.y);
    }
}