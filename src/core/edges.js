/**
 * Edge / arrow rendering for the flow diagram.
 *
 * Extracted from ai-gateway-flow.html (lines 543-664).
 *
 * Every public function receives a `context` object:
 *   ctx    – CanvasRenderingContext2D
 *   tx, ty – coordinate-transform helpers  (world → screen x / y)
 *   ts     – scale-transform helper         (world size → screen size)
 *   nodes  – node definitions object (keyed by id)
 *   colors – theme colour palette
 *   isDark – boolean, true when dark theme is active
 */

// ---------------------------------------------------------------------------
// edgePt – auto-calculate the intersection point on a node's bounding box
//          toward a given target coordinate. Optional yOff shifts vertically.
// ---------------------------------------------------------------------------
export function edgePt(context, n, targetX, targetY, yOff) {
  const cx_ = n.x + n.w / 2;
  const cy_ = n.y + n.h / 2;
  const dx = targetX - cx_;
  const dy = targetY - cy_;

  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
    return { x: cx_, y: cy_ };
  }

  const hw = n.w / 2;
  const hh = n.h / 2;
  let ex, ey;

  if (Math.abs(dx) * hh > Math.abs(dy) * hw) {
    ex = cx_ + (dx > 0 ? hw : -hw);
    ey = cy_ + dy * (hw / Math.abs(dx));
  } else {
    ey = cy_ + (dy > 0 ? hh : -hh);
    ex = cx_ + dx * (hh / Math.abs(dy));
  }

  return { x: ex, y: ey + (yOff || 0) };
}

// ---------------------------------------------------------------------------
// resolveEdge – pick the edge attachment point on a node based on direction
//               flags (fromLeft, toRight, etc.) set on the line descriptor.
// ---------------------------------------------------------------------------
export function resolveEdge(context, n, l, isFrom) {
  const yo = l.yOff || 0;

  if (isFrom) {
    if (l.fromLeft) return { x: n.x, y: n.y + n.h / 2 + yo };
    if (l.fromRight) return { x: n.x + n.w, y: n.y + n.h / 2 + yo };
    if (l.fromBottom) return { x: n.x + n.w / 2 + (l.fromXOff || l.xOff || 0), y: n.y + n.h + yo };
    if (l.fromTop) return { x: n.x + n.w / 2 + (l.fromXOff || 0), y: n.y + yo };
    if (l.waypoints) return edgePt(context, n, l.waypoints[0].x, l.waypoints[0].y, yo);
    return { x: n.x + n.w / 2, y: n.y + n.h / 2 + yo };
  } else {
    if (l.toLeft) return { x: n.x, y: n.y + n.h / 2 + yo };
    if (l.toTop) return { x: n.x + n.w / 2 + (l.toXOff || l.xOff || 0), y: n.y + yo };
    if (l.toRight) return { x: n.x + n.w, y: n.y + n.h / 2 + yo };
    if (l.toBottom) return { x: n.x + n.w / 2 + (l.toXOff || 0), y: n.y + n.h + yo };
    if (l.waypoints) {
      const wp = l.waypoints;
      return edgePt(context, n, wp[wp.length - 1].x, wp[wp.length - 1].y, yo);
    }
    return { x: n.x + n.w / 2, y: n.y + n.h / 2 + yo };
  }
}

// ---------------------------------------------------------------------------
// drawArrowLine – render a single straight arrow with an arrowhead and an
//                 optional numbered badge circle at the midpoint.
// ---------------------------------------------------------------------------
export function drawArrowLine(context, x1, y1, x2, y2, color, num, alpha) {
  const { ctx, tx, ty, ts, isDark } = context;

  ctx.save();
  ctx.globalAlpha = alpha || 1;

  // Stem
  ctx.beginPath();
  ctx.moveTo(tx(x1), ty(y1));
  ctx.lineTo(tx(x2), ty(y2));
  ctx.strokeStyle = color;
  ctx.lineWidth = ts(2.5);
  ctx.stroke();

  // Arrowhead
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const sz = ts(10);
  ctx.beginPath();
  ctx.moveTo(tx(x2), ty(y2));
  ctx.lineTo(tx(x2) - sz * Math.cos(ang - 0.4), ty(y2) - sz * Math.sin(ang - 0.4));
  ctx.lineTo(tx(x2) - sz * Math.cos(ang + 0.4), ty(y2) - sz * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  // Badge number
  if (num != null) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const r = ts(12);
    ctx.beginPath();
    ctx.arc(tx(mx), ty(my), r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.font = `bold ${ts(10)}px system-ui`;
    ctx.fillStyle = isDark ? '#0d1117' : '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), tx(mx), ty(my));
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// drawLines – iterate a list of line descriptors and render each one.
//
// Each line descriptor (l) may contain:
//   from, to       – node ids (keys into context.nodes)
//   color          – stroke/fill colour
//   num            – optional badge number
//   yOff, xOff     – optional offsets
//   fromLeft/Right/Top/Bottom, toLeft/Right/Top/Bottom – direction flags
//   fromXOff, toXOff – per-side x offsets
//   waypoints      – array of {x, y} intermediate points
// ---------------------------------------------------------------------------
export function drawLines(context, lines) {
  const { ctx, tx, ty, ts, nodes, isDark } = context;

  lines.forEach(l => {
    const fn = nodes[l.from];
    const tn = nodes[l.to];
    if (!fn || !tn) return;

    if (l.waypoints) {
      // ---- multi-segment (waypoint) path ----
      const fp = resolveEdge(context, fn, l, true);
      const tp = resolveEdge(context, tn, l, false);
      const pts = [fp, ...l.waypoints, tp];

      ctx.save();
      ctx.globalAlpha = 0.8;

      // Polyline stroke
      ctx.beginPath();
      ctx.moveTo(tx(pts[0].x), ty(pts[0].y));
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(tx(pts[i].x), ty(pts[i].y));
      }
      ctx.strokeStyle = l.color;
      ctx.lineWidth = ts(2.5);
      ctx.stroke();

      // Arrowhead on last segment
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const ang = Math.atan2(last.y - prev.y, last.x - prev.x);
      const sz = ts(10);
      ctx.beginPath();
      ctx.moveTo(tx(last.x), ty(last.y));
      ctx.lineTo(tx(last.x) - sz * Math.cos(ang - 0.4), ty(last.y) - sz * Math.sin(ang - 0.4));
      ctx.lineTo(tx(last.x) - sz * Math.cos(ang + 0.4), ty(last.y) - sz * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fillStyle = l.color;
      ctx.fill();

      // Badge number at the middle waypoint
      if (l.num != null) {
        const mid = pts[Math.floor(pts.length / 2)];
        const r = ts(12);
        ctx.beginPath();
        ctx.arc(tx(mid.x), ty(mid.y), r, 0, Math.PI * 2);
        ctx.fillStyle = l.color;
        ctx.fill();
        ctx.font = `bold ${ts(10)}px system-ui`;
        ctx.fillStyle = isDark ? '#0d1117' : '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(l.num), tx(mid.x), ty(mid.y));
      }

      ctx.restore();
    } else {
      // ---- simple straight arrow ----
      let fp = resolveEdge(context, fn, l, true);
      let tp = resolveEdge(context, tn, l, false);

      // Fall back to auto edge if no specific direction flag is set
      if (!l.fromLeft && !l.fromRight && !l.fromBottom && !l.fromTop) {
        const tc = tn.x + tn.w / 2;
        const tcy = tn.y + tn.h / 2;
        fp = edgePt(context, fn, tc, tcy, l.yOff || 0);
      }
      if (!l.toLeft && !l.toRight && !l.toBottom && !l.toTop) {
        const fc = fn.x + fn.w / 2;
        const fy = fn.y + fn.h / 2;
        tp = edgePt(context, tn, fc, fy, l.yOff || 0);
      }

      drawArrowLine(context, fp.x, fp.y, tp.x, tp.y, l.color, l.num, 0.8);
    }
  });
}
