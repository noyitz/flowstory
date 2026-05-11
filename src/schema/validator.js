// ================================================================
// JSON Schema Validator for FlowStory diagram definitions.
//
// Pure JS -- no external dependencies.  Returns { valid, errors }.
// ================================================================

/**
 * Validate a parsed FlowStory diagram JSON object.
 *
 * Checks:
 *   - `meta` exists and has `title` (string)
 *   - `nodes` exists and is a non-empty object; each node has
 *     x, y, w, h (numbers) and label (string)
 *   - `flows` exists and is a non-empty object; each flow has
 *     `label` (string) and `steps` (array)
 *   - Each step has `text` (string) and `mode` ("arrow" or "lightup")
 *   - Arrow steps must have `from`, `to`, `color`, `num`
 *   - Lightup steps must have `target` and `badge`
 *   - All node references in steps (from, to, target) must exist in nodes
 *   - Optional sections (tooltips, inspector, canvas, theme) validated
 *     when present
 *
 * @param {object} diagram -- the parsed diagram object
 * @returns {{ valid: boolean, errors?: string[] }}
 */
export function validateDiagram(diagram) {
  const errors = [];

  if (diagram == null || typeof diagram !== 'object' || Array.isArray(diagram)) {
    return { valid: false, errors: ['Diagram must be a non-null object'] };
  }

  // ------------------------------------------------------------------
  // meta
  // ------------------------------------------------------------------
  validateMeta(diagram.meta, errors);

  // ------------------------------------------------------------------
  // nodes
  // ------------------------------------------------------------------
  const nodeIds = validateNodes(diagram.nodes, errors);

  // ------------------------------------------------------------------
  // flows
  // ------------------------------------------------------------------
  validateFlows(diagram.flows, nodeIds, errors);

  // ------------------------------------------------------------------
  // optional top-level sections
  // ------------------------------------------------------------------
  if (diagram.tooltips !== undefined) {
    validateTooltips(diagram.tooltips, nodeIds, errors);
  }
  if (diagram.inspector !== undefined) {
    validateInspector(diagram.inspector, errors);
  }
  if (diagram.canvas !== undefined) {
    validateCanvas(diagram.canvas, errors);
  }
  if (diagram.theme !== undefined) {
    validateTheme(diagram.theme, errors);
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

// ====================================================================
// Section validators
// ====================================================================

function validateMeta(meta, errors) {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) {
    errors.push('meta: must be an object');
    return;
  }
  if (typeof meta.title !== 'string' || meta.title.length === 0) {
    errors.push('meta.title: must be a non-empty string');
  }
  // meta.version, meta.description, etc. are optional -- no validation
}

function validateNodes(nodes, errors) {
  const ids = new Set();

  if (nodes == null || typeof nodes !== 'object' || Array.isArray(nodes)) {
    errors.push('nodes: must be a non-empty object');
    return ids;
  }

  const keys = Object.keys(nodes);
  if (keys.length === 0) {
    errors.push('nodes: must contain at least one node');
    return ids;
  }

  for (const key of keys) {
    ids.add(key);
    const node = nodes[key];
    const prefix = `nodes.${key}`;

    if (node == null || typeof node !== 'object' || Array.isArray(node)) {
      errors.push(`${prefix}: must be an object`);
      continue;
    }

    requireFiniteNumber(node, 'x', prefix, errors);
    requireFiniteNumber(node, 'y', prefix, errors);
    requireFiniteNumber(node, 'w', prefix, errors);
    requireFiniteNumber(node, 'h', prefix, errors);
    if (node.type !== 'boundary' && node.label !== undefined && typeof node.label !== 'string') {
      errors.push(`${prefix}.label: must be a string`);
    }
  }

  return ids;
}

function validateFlows(flows, nodeIds, errors) {
  if (flows == null || typeof flows !== 'object' || Array.isArray(flows)) {
    errors.push('flows: must be a non-empty object');
    return;
  }

  const keys = Object.keys(flows);
  if (keys.length === 0) {
    errors.push('flows: must contain at least one flow');
    return;
  }

  for (const flowKey of keys) {
    const flow = flows[flowKey];
    const prefix = `flows.${flowKey}`;

    if (flow == null || typeof flow !== 'object' || Array.isArray(flow)) {
      errors.push(`${prefix}: must be an object with label and steps`);
      continue;
    }

    if (typeof flow.label !== 'string' || flow.label.length === 0) {
      errors.push(`${prefix}.label: must be a non-empty string`);
    }

    if (!Array.isArray(flow.steps)) {
      errors.push(`${prefix}.steps: must be an array`);
      continue;
    }

    for (let i = 0; i < flow.steps.length; i++) {
      validateStep(flow.steps[i], `${prefix}.steps[${i}]`, nodeIds, errors);
    }
  }
}

function validateStep(step, prefix, nodeIds, errors) {
  if (step == null || typeof step !== 'object' || Array.isArray(step)) {
    errors.push(`${prefix}: must be an object`);
    return;
  }

  // text is required on every step
  if (typeof step.text !== 'string' || step.text.length === 0) {
    errors.push(`${prefix}.text: must be a non-empty string`);
  }

  // mode is required
  if (step.mode !== 'arrow' && step.mode !== 'lightup') {
    errors.push(`${prefix}.mode: must be "arrow" or "lightup"`);
    return; // can't validate mode-specific fields without a valid mode
  }

  if (step.mode === 'arrow') {
    requireNonEmptyString(step, 'from', prefix, errors);
    requireNonEmptyString(step, 'to', prefix, errors);
    requireNonEmptyString(step, 'color', prefix, errors);

    if (step.num === undefined) {
      errors.push(`${prefix}.num: required for arrow steps`);
    } else if (typeof step.num !== 'number' || !isFinite(step.num)) {
      errors.push(`${prefix}.num: must be a finite number`);
    }

    // Validate node references exist
    validateNodeRef(step.from, 'from', prefix, nodeIds, errors);
    validateNodeRef(step.to, 'to', prefix, nodeIds, errors);
  }

  if (step.mode === 'lightup') {
    requireNonEmptyString(step, 'target', prefix, errors);

    if (step.badge === undefined) {
      errors.push(`${prefix}.badge: required for lightup steps`);
    }

    // Validate node reference
    validateNodeRef(step.target, 'target', prefix, nodeIds, errors);
  }
}

// ------------------------------------------------------------------
// Optional sections
// ------------------------------------------------------------------

function validateTooltips(tooltips, nodeIds, errors) {
  if (typeof tooltips !== 'object' || Array.isArray(tooltips) || tooltips == null) {
    errors.push('tooltips: must be an object');
    return;
  }
  for (const key of Object.keys(tooltips)) {
    if (!nodeIds.has(key)) {
      errors.push(`tooltips.${key}: references unknown node "${key}"`);
    }
    const tip = tooltips[key];
    if (tip == null || typeof tip !== 'object' || Array.isArray(tip)) {
      errors.push(`tooltips.${key}: must be an object`);
      continue;
    }
    if (typeof tip.title !== 'string' || tip.title.length === 0) {
      errors.push(`tooltips.${key}.title: must be a non-empty string`);
    }
  }
}

function validateInspector(inspector, errors) {
  if (typeof inspector !== 'object' || Array.isArray(inspector) || inspector == null) {
    errors.push('inspector: must be an object');
    return;
  }
  if (inspector.initialHeaders !== undefined && !Array.isArray(inspector.initialHeaders)) {
    errors.push('inspector.initialHeaders: must be an array');
  }
  if (inspector.initialBody !== undefined && !Array.isArray(inspector.initialBody)) {
    errors.push('inspector.initialBody: must be an array');
  }
  if (inspector.mutations !== undefined) {
    if (typeof inspector.mutations !== 'object' || Array.isArray(inspector.mutations) || inspector.mutations == null) {
      errors.push('inspector.mutations: must be an object keyed by flow name');
    }
  }
}

function validateCanvas(canvas, errors) {
  if (typeof canvas !== 'object' || Array.isArray(canvas) || canvas == null) {
    errors.push('canvas: must be an object');
    return;
  }
  if (canvas.width !== undefined) {
    if (typeof canvas.width !== 'number' || !isFinite(canvas.width) || canvas.width <= 0) {
      errors.push('canvas.width: must be a positive number');
    }
  }
  if (canvas.height !== undefined) {
    if (typeof canvas.height !== 'number' || !isFinite(canvas.height) || canvas.height <= 0) {
      errors.push('canvas.height: must be a positive number');
    }
  }
}

function validateTheme(theme, errors) {
  if (typeof theme === 'string') {
    if (theme !== 'dark' && theme !== 'light') {
      errors.push('theme: must be "dark", "light", or an object');
    }
  } else if (typeof theme !== 'object' || Array.isArray(theme) || theme == null) {
    errors.push('theme: must be "dark", "light", or an object');
  }
}

// ====================================================================
// Helpers
// ====================================================================

function requireFiniteNumber(obj, field, prefix, errors) {
  if (obj[field] === undefined) {
    errors.push(`${prefix}.${field}: required`);
  } else if (typeof obj[field] !== 'number' || !isFinite(obj[field])) {
    errors.push(`${prefix}.${field}: must be a finite number`);
  }
}

function requireNonEmptyString(obj, field, prefix, errors) {
  if (typeof obj[field] !== 'string' || obj[field].length === 0) {
    errors.push(`${prefix}.${field}: must be a non-empty string`);
  }
}

function validateNodeRef(value, field, prefix, nodeIds, errors) {
  if (typeof value === 'string' && value.length > 0 && nodeIds.size > 0) {
    if (!nodeIds.has(value)) {
      errors.push(`${prefix}.${field}: references unknown node "${value}"`);
    }
  }
}
