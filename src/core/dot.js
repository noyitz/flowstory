// ================================================================
// Dot — animated packet that travels along arrows between nodes
// ================================================================

/**
 * Compute the point on the edge of a rectangular node closest to
 * a given target coordinate, with an optional vertical offset.
 */
function edgePt(n, targetX, targetY, yOff) {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return { x: cx, y: cy };
  const hw = n.w / 2;
  const hh = n.h / 2;
  let ex, ey;
  if (Math.abs(dx) * hh > Math.abs(dy) * hw) {
    ex = cx + (dx > 0 ? hw : -hw);
    ey = cy + dy * (hw / Math.abs(dx));
  } else {
    ey = cy + (dy > 0 ? hh : -hh);
    ex = cx + dx * (hh / Math.abs(dy));
  }
  return { x: ex, y: ey + (yOff || 0) };
}

/**
 * Resolve the attachment point on a node edge based on explicit
 * directional flags (fromLeft, toRight, etc.) or fall back to
 * automatic edge-point calculation.
 */
function resolveEdge(n, l, isFrom) {
  const yo = l.yOff || 0;
  if (isFrom) {
    if (l.fromLeft)   return { x: n.x,           y: n.y + n.h / 2 + yo };
    if (l.fromRight)  return { x: n.x + n.w,     y: n.y + n.h / 2 + yo };
    if (l.fromBottom) return { x: n.x + n.w / 2 + (l.fromXOff || l.xOff || 0), y: n.y + n.h + yo };
    if (l.fromTop)    return { x: n.x + n.w / 2 + (l.fromXOff || 0),           y: n.y + yo };
    if (l.waypoints)  return edgePt(n, l.waypoints[0].x, l.waypoints[0].y, yo);
    return { x: n.x + n.w / 2, y: n.y + n.h / 2 + yo };
  } else {
    if (l.toLeft)   return { x: n.x,           y: n.y + n.h / 2 + yo };
    if (l.toTop)    return { x: n.x + n.w / 2 + (l.toXOff || l.xOff || 0), y: n.y + yo };
    if (l.toRight)  return { x: n.x + n.w,     y: n.y + n.h / 2 + yo };
    if (l.toBottom) return { x: n.x + n.w / 2 + (l.toXOff || 0),           y: n.y + n.h + yo };
    if (l.waypoints) {
      const wp = l.waypoints;
      return edgePt(n, wp[wp.length - 1].x, wp[wp.length - 1].y, yo);
    }
    return { x: n.x + n.w / 2, y: n.y + n.h / 2 + yo };
  }
}

export class Dot {
  /**
   * @param {string} fromKey  — source node key
   * @param {string} toKey    — destination node key
   * @param {string} color    — CSS colour for the packet
   * @param {number} speed    — base speed factor (0.012 default)
   * @param {Function|null} callback — fired when the dot reaches t = 1
   * @param {object} opts     — edge-routing options (yOff, fromLeft, waypoints, …)
   * @param {object} context  — runtime helpers:
   *   {Function} tx   — transform x to canvas coords
   *   {Function} ty   — transform y to canvas coords
   *   {Function} ts   — scale a size value to canvas coords
   *   {object}   nodes — map of node keys → { x, y, w, h, … }
   */
  constructor(fromKey, toKey, color, speed, callback, opts, context) {
    this.color = color;
    this.speed = speed || 0.012;
    this.t = 0;
    this.cb = callback;
    this.alive = true;
    this.ctx = context;                // { tx, ty, ts, nodes }

    const fn = context.nodes[fromKey];
    const tn = context.nodes[toKey];
    const yo = (opts && opts.yOff) || 0;
    let fp, tp;

    const lo = opts || {};
    fp = resolveEdge(fn, lo, true);
    tp = resolveEdge(tn, lo, false);

    // If no specific edge direction was set, fall back to auto edge calculation
    if (!lo.fromLeft && !lo.fromRight && !lo.fromBottom && !lo.fromTop && !lo.waypoints) {
      const tc  = tn.x + tn.w / 2;
      const tcy = tn.y + tn.h / 2;
      fp = edgePt(fn, tc, tcy, yo);
    }
    if (!lo.toLeft && !lo.toRight && !lo.toBottom && !lo.toTop && !lo.waypoints) {
      const fc = fn.x + fn.w / 2;
      const fy = fn.y + fn.h / 2;
      tp = edgePt(tn, fc, fy, yo);
    }

    if (opts && opts.waypoints) {
      this.pts = [fp, ...opts.waypoints, tp];
    } else {
      this.pts = [fp, tp];
    }

    // Pre-compute segment lengths for uniform-speed interpolation
    this.segLens  = [];
    this.totalLen = 0;
    for (let i = 1; i < this.pts.length; i++) {
      const dx  = this.pts[i].x - this.pts[i - 1].x;
      const dy  = this.pts[i].y - this.pts[i - 1].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      this.segLens.push(len);
      this.totalLen += len;
    }
    this.segIdx = 0;
    this.x = this.pts[0].x;
    this.y = this.pts[0].y;

    // Normalize speed so all arrows move at same pixel velocity (~4px/frame)
    const pxPerFrame = 4;
    this.speed = this.totalLen > 0
      ? (pxPerFrame / this.totalLen) * (speed / 0.02)
      : speed;
  }

  /** Advance the packet one tick toward t = 1. */
  update() {
    this.t += this.speed;
    if (this.t >= 1) {
      this.t = 1;
      this.alive = false;
      if (this.cb) this.cb();
    }
    const dist = this.t * this.totalLen;
    let accum = 0;
    for (let i = 0; i < this.segLens.length; i++) {
      if (accum + this.segLens[i] >= dist) {
        const segT = (dist - accum) / this.segLens[i];
        this.x = this.pts[i].x + (this.pts[i + 1].x - this.pts[i].x) * segT;
        this.y = this.pts[i].y + (this.pts[i + 1].y - this.pts[i].y) * segT;
        this.segIdx = i;
        return;
      }
      accum += this.segLens[i];
    }
    const last = this.pts[this.pts.length - 1];
    this.x = last.x;
    this.y = last.y;
    this.segIdx = this.segLens.length - 1;
  }

  /** Return { x, y } at parameter t (clamped to 0..1). */
  posAt(t) {
    const dist = Math.max(0, Math.min(1, t)) * this.totalLen;
    let accum = 0;
    for (let i = 0; i < this.segLens.length; i++) {
      if (accum + this.segLens[i] >= dist) {
        const segT = (dist - accum) / this.segLens[i];
        return {
          x: this.pts[i].x + (this.pts[i + 1].x - this.pts[i].x) * segT,
          y: this.pts[i].y + (this.pts[i + 1].y - this.pts[i].y) * segT,
        };
      }
      accum += this.segLens[i];
    }
    const last = this.pts[this.pts.length - 1];
    return { x: last.x, y: last.y };
  }

  /**
   * Render the packet onto a canvas 2D context.
   * Draws three layers:
   *   1. Progressive trail line (behind the packet)
   *   2. Trailing data-stream dots
   *   3. Leading pentagon packet with shadow glow
   *
   * @param {CanvasRenderingContext2D} canvasCtx
   */
  draw(canvasCtx) {
    const { tx, ty, ts } = this.ctx;

    canvasCtx.save();

    // --- 1. Progressive trail — only behind the packet ---
    canvasCtx.beginPath();
    canvasCtx.moveTo(tx(this.pts[0].x), ty(this.pts[0].y));
    for (let i = 0; i < this.segIdx; i++) {
      canvasCtx.lineTo(tx(this.pts[i + 1].x), ty(this.pts[i + 1].y));
    }
    canvasCtx.lineTo(tx(this.x), ty(this.y));
    canvasCtx.strokeStyle = this.color;
    canvasCtx.lineWidth   = ts(2);
    canvasCtx.globalAlpha = 0.3;
    canvasCtx.stroke();

    // --- 2. Trailing data stream — small dots behind the leading packet ---
    for (let j = 4; j >= 1; j--) {
      const bt = this.t - j * 0.06;
      if (bt <= 0) continue;
      const p = this.posAt(bt);
      canvasCtx.globalAlpha = 0.15 + (1 - j / 4) * 0.4;
      canvasCtx.beginPath();
      canvasCtx.arc(tx(p.x), ty(p.y), ts(2.5), 0, Math.PI * 2);
      canvasCtx.fillStyle = this.color;
      canvasCtx.fill();
    }

    // --- 3. Leading packet — pentagon oriented along travel direction ---
    canvasCtx.globalAlpha = 1;
    const si  = Math.min(this.segIdx, this.pts.length - 2);
    const ang = Math.atan2(
      this.pts[si + 1].y - this.pts[si].y,
      this.pts[si + 1].x - this.pts[si].x,
    );

    canvasCtx.save();
    canvasCtx.translate(tx(this.x), ty(this.y));
    canvasCtx.rotate(ang);

    const pw = ts(13);
    const ph = ts(7);
    canvasCtx.beginPath();
    canvasCtx.moveTo( pw / 2,  0);
    canvasCtx.lineTo( pw / 6, -ph / 2);
    canvasCtx.lineTo(-pw / 2, -ph / 2);
    canvasCtx.lineTo(-pw / 2,  ph / 2);
    canvasCtx.lineTo( pw / 6,  ph / 2);
    canvasCtx.closePath();

    canvasCtx.fillStyle  = this.color;
    canvasCtx.shadowColor = this.color;
    canvasCtx.shadowBlur  = ts(16);
    canvasCtx.fill();

    canvasCtx.restore();
    canvasCtx.restore();
  }
}
