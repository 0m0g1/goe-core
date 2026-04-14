// spatial/Quadtree.js
class QuadtreeNode {
  constructor(bounds, capacity) {
    this.bounds   = bounds;
    this.capacity = capacity;
    this.objects  = [];
    this.children = null;
  }
  isLeaf() { return this.children === null; }
  subdivide() {
    const { x, y, w, h } = this.bounds;
    const hw = w / 2, hh = h / 2;
    this.children = [
      new QuadtreeNode({ x,         y,         w: hw, h: hh }, this.capacity),
      new QuadtreeNode({ x: x + hw, y,         w: hw, h: hh }, this.capacity),
      new QuadtreeNode({ x,         y: y + hh, w: hw, h: hh }, this.capacity),
      new QuadtreeNode({ x: x + hw, y: y + hh, w: hw, h: hh }, this.capacity),
    ];
  }
}

export class Quadtree {
  constructor(bounds, capacity = 8) {
    this._bounds   = bounds;
    this._capacity = capacity;
    this.root      = new QuadtreeNode(bounds, capacity);
  }

  // Iterative clear — no recursion, no stack overflow regardless of depth
  clear() {
    const stack = [this.root];
    while (stack.length) {
      const node = stack.pop();
      node.objects.length = 0;
      if (node.children) {
        stack.push(...node.children);
        node.children = null;
      }
    }
  }

  rebuild(objects) {
    this.clear();
    for (const obj of objects) this.insert(obj);
  }

  insert(object) {
    this._insert(object, this.root, 0);
  }

  // MAX_DEPTH prevents infinite subdivision when objects share the same point
  _insert(object, node, depth) {
    if (depth > 32) {
      // Too deep — just store here, don't subdivide further
      node.objects.push(object);
      return;
    }

    if (!this._contains(node.bounds, object)) return;

    if (node.isLeaf()) {
      if (node.objects.length < node.capacity) {
        node.objects.push(object);
        return;
      }
      // Subdivide and redistribute
      node.subdivide();
      const existing = node.objects;
      node.objects = [];
      for (const obj of existing) {
        let placed = false;
        for (const child of node.children) {
          if (this._contains(child.bounds, obj)) {
            this._insert(obj, child, depth + 1);
            placed = true;
            break;
          }
        }
        // Object sits exactly on a boundary — keep it at this node
        if (!placed) node.objects.push(obj);
      }
    }

    // Non-leaf: insert into first containing child, else keep at this node
    if (!node.isLeaf()) {
      let placed = false;
      for (const child of node.children) {
        if (this._contains(child.bounds, object)) {
          this._insert(object, child, depth + 1);
          placed = true;
          break;
        }
      }
      if (!placed) node.objects.push(object);
    }
  }

  queryRange(range, result = []) {
    const seen  = new Set();
    const stack = [this.root];
    while (stack.length) {
      const node = stack.pop();
      if (!this._intersects(node.bounds, range)) continue;
      for (const obj of node.objects) {
        const r = obj.radius ?? 0;
        if (obj.x + r >= range.x && obj.x - r <= range.x + range.w &&
            obj.y + r >= range.y && obj.y - r <= range.y + range.h) {
          seen.add(obj);
        }
      }
      if (node.children) stack.push(...node.children);
    }
    for (const item of seen) result.push(item);
    return result;
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