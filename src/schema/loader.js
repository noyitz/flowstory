// ================================================================
// Diagram Loader -- fetch, validate, apply defaults, normalize.
//
// Produces a diagram object ready for the FlowStory engine.
// ================================================================

import { validateDiagram } from './validator.js';

// ------------------------------------------------------------------
// Side-name constants used by the edge normalizer
// ------------------------------------------------------------------
const SIDE_FLAG_MAP = {
  left:   { from: 'fromLeft',   to: 'toLeft'   },
  right:  { from: 'fromRight',  to: 'toRight'  },
  top:    { from: 'fromTop',    to: 'toTop'     },
  bottom: { from: 'fromBottom', to: 'toBottom'  },
};

/**
 * Load a diagram from a URL or a plain object.
 *
 * - If `source` is a string it is treated as a URL and fetched.
 * - If `source` is an object it is used directly.
 * - The diagram is validated; an Error is thrown if validation fails.
 * - Defaults are applied for canvas, node properties, and step edges.
 * - The user-friendly `edge` object on steps is normalized to the flat
 *   flag format the engine and renderer expect.
 *
 * @param {string|object} source -- URL string or diagram object
 * @returns {Promise<object>} Normalized diagram ready for the engine.
 * @throws {Error} on fetch failure, parse failure, or validation errors.
 */
export async function loadDiagram(source) {
  let diagram;

  // ----------------------------------------------------------------
  // 1. Acquire the raw diagram
  // ----------------------------------------------------------------
  if (typeof source === 'string') {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch diagram from "${source}": ${response.status} ${response.statusText}`
      );
    }
    try {
      diagram = await response.json();
    } catch (e) {
      throw new Error(
        `Failed to parse diagram JSON from "${source}": ${e.message}`
      );
    }
  } else if (source != null && typeof source === 'object' && !Array.isArray(source)) {
    // Deep-clone so we don't mutate the caller's object
    diagram = JSON.parse(JSON.stringify(source));
  } else {
    throw new Error('loadDiagram() expects a URL string or a diagram object');
  }

  // ----------------------------------------------------------------
  // 2. Validate
  // ----------------------------------------------------------------
  const result = validateDiagram(diagram);
  if (!result.valid) {
    throw new Error(
      'Invalid diagram:\n  ' + result.errors.join('\n  ')
    );
  }

  // ----------------------------------------------------------------
  // 3. Apply defaults
  // ----------------------------------------------------------------
  applyCanvasDefaults(diagram);
  applyNodeDefaults(diagram.nodes);
  applyFlowDefaults(diagram.flows);

  // Ensure optional top-level keys exist
  if (diagram.tooltips === undefined)  diagram.tooltips  = {};
  if (diagram.inspector === undefined) diagram.inspector = {};

  // ----------------------------------------------------------------
  // 4. Normalize step edges (user-friendly -> engine flat format)
  // ----------------------------------------------------------------
  normalizeAllStepEdges(diagram.flows);

  return diagram;
}

// ====================================================================
// Default-application helpers
// ====================================================================

/**
 * Ensure `diagram.canvas` exists and has width/height defaults.
 */
function applyCanvasDefaults(diagram) {
  if (!diagram.canvas) {
    diagram.canvas = {};
  }
  if (diagram.canvas.width === undefined)  diagram.canvas.width  = 1250;
  if (diagram.canvas.height === undefined) diagram.canvas.height = 1050;
}

/**
 * Apply per-node defaults:
 *   type     -> "box"
 *   fontSize -> 16
 *   color    -> "#58a6ff"
 */
function applyNodeDefaults(nodes) {
  for (const key of Object.keys(nodes)) {
    const node = nodes[key];
    if (node.type === undefined)     node.type     = 'box';
    if (node.fontSize === undefined) node.fontSize  = 16;
    if (node.color === undefined)    node.color     = '#58a6ff';

    // The renderer reads `fs` for font size -- mirror fontSize there
    // so either name works in the JSON.
    if (node.fs === undefined) node.fs = node.fontSize;
  }
}

/**
 * Apply flow-level defaults (currently a no-op placeholder for
 * future per-flow defaults like speed or delay).
 */
function applyFlowDefaults(_flows) {
  // reserved for future use
}

// ====================================================================
// Edge normalization
// ====================================================================

/**
 * Walk every step in every flow and normalize its edge description.
 *
 * The user-friendly JSON format uses a nested `edge` object:
 *
 *   "edge": {
 *     "fromSide": "right",
 *     "toSide":   "left",
 *     "fromXOffset": 10,
 *     "toXOffset":   -5,
 *     "yOffset":      8
 *   }
 *
 * The engine's flat format (consumed by edges.js / playback.js) uses
 * individual boolean flags and numeric offsets:
 *
 *   fromRight: true, toLeft: true,
 *   fromXOff: 10, toXOff: -5, yOff: 8
 *
 * This function converts the former to the latter, and also preserves
 * any flat flags that are already present (backward compat).
 */
function normalizeAllStepEdges(flows) {
  for (const flowKey of Object.keys(flows)) {
    const flow = flows[flowKey];
    const steps = flow.steps;
    if (!Array.isArray(steps)) continue;

    for (const step of steps) {
      if (step.mode !== 'arrow') continue;
      normalizeStepEdge(step);
    }
  }
}

/**
 * Normalize a single arrow step's edge routing.
 *
 * Priority:
 *   1. If `step.edge` exists, convert it to flat flags (overwriting
 *      any existing flat flags for the same sides).
 *   2. Flat flags already on the step are preserved as-is.
 *   3. If neither `edge` nor flat flags are present, the engine will
 *      auto-calculate edge points (see edgePt in edges.js).
 */
function normalizeStepEdge(step) {
  const edge = step.edge;
  if (!edge || typeof edge !== 'object') return;

  // --- fromSide ---
  if (edge.fromSide && SIDE_FLAG_MAP[edge.fromSide]) {
    const flagName = SIDE_FLAG_MAP[edge.fromSide].from;
    step[flagName] = true;
  }

  // --- toSide ---
  if (edge.toSide && SIDE_FLAG_MAP[edge.toSide]) {
    const flagName = SIDE_FLAG_MAP[edge.toSide].to;
    step[flagName] = true;
  }

  // --- offsets ---
  if (edge.fromXOffset !== undefined) step.fromXOff = edge.fromXOffset;
  if (edge.toXOffset !== undefined)   step.toXOff   = edge.toXOffset;
  if (edge.yOffset !== undefined)     step.yOff     = edge.yOffset;

  // --- waypoints pass-through ---
  if (Array.isArray(edge.waypoints)) {
    step.waypoints = edge.waypoints;
  }

  // Remove the user-friendly key so downstream code only sees flat flags
  delete step.edge;
}
