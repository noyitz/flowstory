/**
 * Renderer — draws nodes, containers, boundaries, sections, and decorations.
 *
 * Extracted and generalized from ai-gateway-flow.html (lines 313-541).
 *
 * Instead of hardcoding specific node keys (cluster, pool, ipp, etc.), the
 * Renderer iterates all nodes and dispatches based on the node's `type`
 * property:
 *
 *   "icon"       → person silhouette + label
 *   "plugin"     → dashed-border box
 *   "boundary"   → outermost dashed rounded rect with label
 *   "container"  → inner dashed rounded rect with label + optional glow
 *   (default)    → solid rounded-rect box with label / sublabel / badge
 *
 * Optional node properties control extra visuals:
 *   sections     — array on container nodes for plugin-section backgrounds
 *   stackCount   — number of stacked pod shadows behind the node
 *   stackOffset  — { dx, dy } per-stack step
 *   subBoundaries — array of { x, y, w, h, color } sub-regions
 *
 * Every public method receives:
 *   ctx     — CanvasRenderingContext2D
 *   key     — node id string
 *   node    — node definition object { x, y, w, h, label, color, … }
 *   context — runtime helpers:
 *     tx(x)         — world x → canvas x
 *     ty(y)         — world y → canvas y
 *     ts(s)         — world size → canvas size
 *     isDark        — boolean, true when dark theme active
 *     colors        — theme palette ({ bg, box, boxA, bdr, txt, dim, brt })
 *     activeNodes   — Set of currently-active node keys
 *     badges        — { [key]: number | number[] }
 *     glowing       — Set of container keys that should glow
 *     fading        — { [key]: timestamp } for fade-in animations
 */

export class Renderer {
  // -----------------------------------------------------------------------
  // drawBox — render a single node (icon, plugin, or regular box)
  // -----------------------------------------------------------------------

  /**
   * Render a single node as a rounded rectangle, icon, or plugin box.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} key           — node id
   * @param {object} node          — node definition
   * @param {object} context       — { tx, ty, ts, isDark, colors, activeNodes, badges, fading }
   */
  drawBox(ctx, key, node, context) {
    if (!node || node.type === 'boundary' || node.type === 'container') return;

    const { tx, ty, ts, isDark, colors, activeNodes, badges, fading } = context;
    const x = tx(node.x);
    const y = ty(node.y);
    const w = ts(node.w);
    const h = ts(node.h);
    const isActive = activeNodes && activeNodes.has(key);
    const hasBadge = badges && badges[key] != null;

    ctx.save();

    // --- Icon type: person silhouette + label ---
    if (node.type === 'icon') {
      ctx.font = `${ts(32)}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('\u{1F464}', x + w / 2, y + ts(26));
      ctx.font = `bold ${ts(16)}px system-ui`;
      ctx.fillStyle = colors.txt;
      ctx.fillText(node.label, x + w / 2, y + ts(46));
      ctx.restore();
      return;
    }

    // --- Fade-in animation ---
    let fadeAlpha = 1;
    if (fading && fading[key]) {
      const elapsed = Date.now() - fading[key];
      fadeAlpha = Math.min(elapsed / 500, 1);
      if (elapsed > 500) delete fading[key];
    }

    // --- Glow when active or badged ---
    if (isActive || hasBadge) {
      ctx.shadowColor = node.color;
      ctx.shadowBlur = ts(18) * fadeAlpha;
      ctx.globalAlpha = 0.3 + 0.7 * fadeAlpha;
    }

    // --- Box shape ---
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, ts(8));
    ctx.fillStyle = (isActive || hasBadge) ? colors.boxA : colors.box;
    ctx.fill();
    ctx.strokeStyle = (isActive || hasBadge) ? node.color : colors.bdr;
    ctx.lineWidth = ts((isActive || hasBadge) ? 2.5 : 1.5);
    if (node.type === 'plugin') {
      ctx.setLineDash([ts(5), ts(4)]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // --- Label text ---
    const fs = node.fs || 16;
    ctx.fillStyle = colors.txt;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (node.soon && !node.sublabel) {
      // Label + "COMING SOON" badge (no sublabel)
      ctx.font = `bold ${ts(fs)}px system-ui`;
      ctx.fillText(node.label, x + w / 2, y + h / 2 - ts(6));
      ctx.font = `bold ${ts(9)}px system-ui`;
      ctx.fillStyle = '#f0883e';
      ctx.fillText('COMING SOON', x + w / 2, y + h / 2 + ts(8));
    } else if (node.sublabel) {
      // Label + sublabel, optionally with "COMING SOON"
      ctx.font = `bold ${ts(fs)}px system-ui`;
      ctx.fillText(node.label, x + w / 2, y + h / 2 - ts(8));
      ctx.font = `${ts(Math.max(fs - 3, 11))}px system-ui`;
      ctx.fillStyle = colors.dim;
      if (node.soon) {
        ctx.fillText(node.sublabel, x + w / 2, y + h / 2 + ts(6));
        ctx.font = `bold ${ts(8)}px system-ui`;
        ctx.fillStyle = '#f0883e';
        ctx.fillText('COMING SOON', x + w / 2, y + h / 2 + ts(16));
      } else {
        ctx.fillText(node.sublabel, x + w / 2, y + h / 2 + ts(8));
      }
    } else {
      // Simple centered label
      ctx.font = `bold ${ts(fs)}px system-ui`;
      ctx.fillText(node.label, x + w / 2, y + h / 2);
    }

    // --- Numbered badge circles ---
    if (hasBadge) {
      const badgeList = Array.isArray(badges[key]) ? badges[key] : [badges[key]];
      badgeList.forEach((badgeNum, idx) => {
        const bx = x + ts(8) + idx * ts(22);
        const by = y + ts(5);
        const br = ts(9);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(bx + br, by + br, br, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();
        ctx.font = `bold ${ts(10)}px system-ui`;
        ctx.fillStyle = isDark ? '#0d1117' : '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(badgeNum), bx + br, by + br);
      });
    }

    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // drawContainer — render a dashed container boundary with label
  // -----------------------------------------------------------------------

  /**
   * Render a container node as a dashed rounded rectangle with a label.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} key           — node id
   * @param {object} node          — node definition (type must be "container")
   * @param {object} context       — { tx, ty, ts, isDark, colors, glowing }
   */
  drawContainer(ctx, key, node, context) {
    if (!node || node.type !== 'container') return;

    const { tx, ty, ts, isDark, glowing } = context;
    const isGlow = glowing && glowing.has(key);

    ctx.save();

    if (isGlow) {
      ctx.shadowColor = node.color;
      ctx.shadowBlur = ts(22);
    }

    ctx.beginPath();
    ctx.roundRect(tx(node.x), ty(node.y), ts(node.w), ts(node.h), ts(10));
    const alphaHex = isGlow ? 'cc' : '55';
    ctx.strokeStyle = node.color + alphaHex;
    ctx.lineWidth = ts(isGlow ? 3 : 2.5);
    ctx.setLineDash([ts(7), ts(5)]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `bold ${ts(12)}px system-ui`;
    ctx.fillStyle = node.color + (isDark ? 'aa' : '99');
    ctx.textAlign = 'left';
    ctx.fillText(node.label, tx(node.x + 12), ty(node.y + 18));

    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // drawBoundary — render the outermost dashed boundary rectangle
  // -----------------------------------------------------------------------

  /**
   * Render a boundary node as a large dashed rounded rectangle with a
   * right-aligned label. Boundaries are the outermost grouping elements
   * (e.g. "kubernetes cluster", "InferencePool").
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} key           — node id
   * @param {object} node          — node definition (type must be "boundary")
   * @param {object} context       — { tx, ty, ts, isDark, colors }
   */
  drawBoundary(ctx, key, node, context) {
    if (!node || node.type !== 'boundary') return;

    const { tx, ty, ts, colors } = context;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tx(node.x), ty(node.y), ts(node.w), ts(node.h), ts(14));
    ctx.strokeStyle = colors.bdr;
    ctx.lineWidth = ts(2.5);
    ctx.setLineDash([ts(10), ts(8)]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label — use node.labelColor if provided, otherwise a muted border color.
    // labelAlign defaults to "right" for backward compat, but can be overridden.
    const labelAlign = node.labelAlign || 'right';
    ctx.font = `${ts(13)}px system-ui`;

    if (node.labelColor) {
      ctx.fillStyle = node.labelColor;
    } else {
      ctx.fillStyle = colors.dim;
    }

    ctx.textAlign = labelAlign;

    if (labelAlign === 'right') {
      ctx.fillText(node.label, tx(node.x + node.w - 15), ty(node.y + 18));
    } else {
      // left-aligned label
      ctx.fillText(node.label, tx(node.x + 12), ty(node.y + 18));
    }

    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // drawSections — render plugin-section backgrounds within a container
  // -----------------------------------------------------------------------

  /**
   * Render translucent section backgrounds inside a container node.
   * Each section is a rounded rect with a dashed border and a small label.
   *
   * Used for e.g. "Request Plugins" and "Response Plugins" regions
   * inside an IPP container.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} sections — array of section descriptors:
   *   {
   *     x, y, w, h   — position/size in world coordinates
   *     color         — base colour (hex, no alpha)
   *     label         — text label (e.g. "Request Plugins ->")
   *     labelX        — optional x-offset for label (world coords); defaults to x + 12
   *     labelY        — optional y-offset for label (world coords); defaults to y + 12
   *   }
   * @param {object} context — { tx, ty, ts, isDark }
   */
  drawSections(ctx, sections, context) {
    if (!sections || sections.length === 0) return;

    const { tx, ty, ts, isDark } = context;

    ctx.save();

    sections.forEach(sec => {
      ctx.beginPath();
      ctx.roundRect(tx(sec.x), ty(sec.y), ts(sec.w), ts(sec.h), ts(8));

      // Translucent fill
      ctx.fillStyle = isDark
        ? sec.color + '0a'
        : sec.color + '08';
      ctx.fill();

      // Dashed border
      ctx.strokeStyle = isDark
        ? sec.color + '30'
        : sec.color + '25';
      ctx.lineWidth = ts(1.5);
      ctx.setLineDash([ts(4), ts(3)]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Section label
      if (sec.label) {
        ctx.font = `bold ${ts(10)}px system-ui`;
        ctx.fillStyle = isDark
          ? sec.color + '88'
          : sec.color + '99';
        ctx.textAlign = 'left';

        const lx = sec.labelX != null ? sec.labelX : sec.x + 12;
        const ly = sec.labelY != null ? sec.labelY : sec.y + 12;
        ctx.fillText(sec.label, tx(lx), ty(ly));
      }
    });

    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // drawStackDecoration — render stacked pod shadows behind a node
  // -----------------------------------------------------------------------

  /**
   * Draw decorative "stacked" rectangles behind a node to convey
   * multiple replicas (e.g. stacked vLLM pods).
   *
   * Each layer is offset by (dx, dy) from the previous one, drawn
   * back-to-front so the topmost layer appears in front.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} node          — node definition { x, y, w, h, color, … }
   * @param {number} stackCount    — how many shadow layers (e.g. 2)
   * @param {object} stackOffset   — { dx, dy } per-layer offset (e.g. { dx: -8, dy: -5 })
   * @param {object} context       — { tx, ty, ts, isDark }
   */
  drawStackDecoration(ctx, node, stackCount, stackOffset, context) {
    if (!stackCount || stackCount < 1) return;

    const { tx, ty, ts, isDark } = context;
    const color = node.color || '#d2a8ff';
    const fillColor = isDark ? color + '18' : color + '12';
    const strokeColor = isDark ? color + '44' : color + '33';
    const dx = (stackOffset && stackOffset.dx) || -8;
    const dy = (stackOffset && stackOffset.dy) || -5;

    ctx.save();

    // Draw back-to-front (farthest layer first)
    for (let j = stackCount; j >= 1; j--) {
      ctx.beginPath();
      ctx.roundRect(
        tx(node.x + dx * j),
        ty(node.y + dy * j),
        ts(node.w),
        ts(node.h),
        ts(6)
      );
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = ts(1);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // drawSubBoundary — render a sub-boundary (dashed inset region)
  // -----------------------------------------------------------------------

  /**
   * Render a small dashed sub-boundary region, used for grouping
   * nodes within a larger boundary (e.g. decode/prefill pod groups).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x             — world x
   * @param {number} y             — world y
   * @param {number} w             — world width
   * @param {number} h             — world height
   * @param {string} color         — CSS colour (hex, no alpha suffix)
   * @param {object} context       — { tx, ty, ts }
   */
  drawSubBoundary(ctx, x, y, w, h, color, context) {
    const { tx, ty, ts } = context;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tx(x), ty(y), ts(w), ts(h), ts(8));
    ctx.strokeStyle = color + '44';
    ctx.lineWidth = ts(1.5);
    ctx.setLineDash([ts(5), ts(4)]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // renderAll — convenience method: draw every node according to its type
  // -----------------------------------------------------------------------

  /**
   * Render all nodes in the diagram in the correct layering order:
   *
   *   1. Boundaries (outermost dashed borders)
   *   2. Containers (inner dashed borders + labels)
   *   3. Sections (translucent plugin-section backgrounds)
   *   4. Sub-boundaries (inset dashed regions within boundaries)
   *   5. Stack decorations (stacked pod shadows)
   *   6. Regular nodes / icons / plugin boxes
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} nodes         — { [key]: nodeDefinition }
   * @param {object} context       — full rendering context
   */
  renderAll(ctx, nodes, context) {
    const keys = Object.keys(nodes);

    // Layer 1: boundaries
    for (const key of keys) {
      const node = nodes[key];
      if (node.type === 'boundary') {
        this.drawBoundary(ctx, key, node, context);
      }
    }

    // Layer 2: containers
    for (const key of keys) {
      const node = nodes[key];
      if (node.type === 'container') {
        this.drawContainer(ctx, key, node, context);
      }
    }

    // Layer 3: sections (declared on container nodes)
    for (const key of keys) {
      const node = nodes[key];
      if (node.type === 'container' && node.sections) {
        this.drawSections(ctx, node.sections, context);
      }
    }

    // Layer 4: sub-boundaries (declared on boundary nodes)
    for (const key of keys) {
      const node = nodes[key];
      if (node.subBoundaries) {
        for (const sb of node.subBoundaries) {
          this.drawSubBoundary(ctx, sb.x, sb.y, sb.w, sb.h, sb.color, context);
        }
      }
    }

    // Layer 5: stack decorations (on any non-boundary, non-container node)
    for (const key of keys) {
      const node = nodes[key];
      if (node.stackCount && node.type !== 'boundary' && node.type !== 'container') {
        this.drawStackDecoration(
          ctx,
          node,
          node.stackCount,
          node.stackOffset || { dx: -8, dy: -5 },
          context
        );
      }
    }

    // Layer 6: regular nodes (boxes, icons, plugins)
    for (const key of keys) {
      const node = nodes[key];
      if (node.type !== 'boundary' && node.type !== 'container') {
        this.drawBox(ctx, key, node, context);
      }
    }
  }
}
