/**
 * InspectorPanel — declarative mutation engine for the request/response inspector.
 *
 * Replaces the 300+ lines of hardcoded inspStep() / inspStepAuth() / inspStepRL() /
 * inspStepInc() switch-case functions from ai-gateway-flow.html (lines ~864-1221)
 * with a generic system that reads declarative mutation objects from JSON.
 *
 * Instead of imperative code like:
 *   inspHeaders.find(l => l.id === 'h-auth').s = 'highlight';
 *   inspHeaders.push({ v: 'x-api-key: ...', s: 'add', id: 'h-xapi' });
 *
 * You describe mutations declaratively:
 *   { id: 'h-auth', style: 'highlight' }
 *   { action: 'add', target: 'headers', value: 'x-api-key: ...', id: 'h-xapi' }
 */

/**
 * Escape HTML entities.
 * @param {string} s
 * @returns {string}
 */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Deep-clone an array of line objects.
 * @param {Array<{v:string, s:string, id:string}>} arr
 * @returns {Array<{v:string, s:string, id:string}>}
 */
function cloneLines(arr) {
  return arr.map(l => ({ ...l }));
}

export class InspectorPanel {
  /**
   * @param {HTMLElement} titleEl   - The inspector title element (shows "Request" / "Response")
   * @param {HTMLElement} contentEl - The inspector content container
   */
  constructor(titleEl, contentEl) {
    this._titleEl = titleEl;
    this._contentEl = contentEl;

    /** @type {Array<{v:string, s:string, id:string}>} */
    this.headers = [];
    /** @type {Array<{v:string, s:string, id:string}>} */
    this.body = [];
    /** @type {Array<{v:string, s:string, id:string}>} */
    this.cycleState = [];

    /** @type {string} Current step label shown above the inspector content. */
    this.stepLabel = '';

    /** @type {'request'|'response'|'error'} */
    this._phase = 'request';
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /**
   * Set up the inspector with an initial configuration.
   * Typically called at the start of a flow animation.
   *
   * @param {Object} config
   * @param {Array<{v:string, s?:string, id:string}>} config.headers - Initial header lines
   * @param {Array<{v:string, s?:string, id:string}>} config.body    - Initial body lines
   * @param {Array<{v:string, s?:string, id:string}>} [config.cycleState] - Initial CycleState lines
   * @param {string} [config.label]  - Initial step label
   * @param {'request'|'response'|'error'} [config.phase] - Initial phase
   */
  init(config) {
    this.headers = (config.headers || []).map(l => ({
      v: l.v,
      s: l.s || 'keep',
      id: l.id,
    }));
    this.body = (config.body || []).map(l => ({
      v: l.v,
      s: l.s || 'keep',
      id: l.id,
    }));
    this.cycleState = (config.cycleState || []).map(l => ({
      v: l.v,
      s: l.s || 'keep',
      id: l.id,
    }));
    this.stepLabel = config.label || '';
    this.setPhase(config.phase || 'request');
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Phase
  // ---------------------------------------------------------------------------

  /**
   * Switch the inspector between request/response/error display.
   *
   * @param {'request'|'response'|'error'} phase
   */
  setPhase(phase) {
    this._phase = phase;
    if (phase === 'request') {
      this._titleEl.textContent = 'Request';
      this._titleEl.style.color = '#58a6ff';
    } else if (phase === 'response') {
      this._titleEl.textContent = 'Response';
      this._titleEl.style.color = '#3fb950';
    } else if (phase === 'error') {
      this._titleEl.textContent = 'Error Response';
      this._titleEl.style.color = '#f85149';
    }
  }

  // ---------------------------------------------------------------------------
  // Declarative mutations
  // ---------------------------------------------------------------------------

  /**
   * Apply a declarative mutation object.
   *
   * A mutation can contain any combination of these fields:
   *
   * **label** (string):
   *   Update the step label text.
   *
   * **phase** ('request' | 'response' | 'error'):
   *   Switch the inspector phase.
   *
   * **actions** (Array): Each action is one of:
   *   - `{ id, style }` — find the line with the given id across all sections
   *     and set its style (e.g. 'highlight', 'del', 'err', 'keep').
   *   - `{ action: 'add', target, value, id, style? }` — append a new line.
   *     `target` is 'headers', 'body', or 'cycleState'.
   *     `style` defaults to 'add'.
   *   - `{ action: 'remove', id }` — remove the line with the given id.
   *
   * **replaceHeaders** (Array<{v, s?, id}>):
   *   Wholesale replace the headers array.
   *
   * **replaceBody** (Array<{v, s?, id}>):
   *   Wholesale replace the body array.
   *
   * **replaceCycleState** (Array<{v, s?, id}>):
   *   Wholesale replace the cycleState array.
   *
   * **cycleState** (Array<{v, s?, id}>):
   *   Set/replace the cycleState array (alias for replaceCycleState,
   *   matching the original code's pattern of assigning inspCycle = [...]).
   *
   * **clearCycleState** (boolean):
   *   If true, empty the cycleState array.
   *
   * **resetStyles** (boolean):
   *   If true, call resetStyles() before applying other mutations.
   *   Defaults to true if not explicitly set (matches original behavior
   *   where resetStyles() was called at the top of every inspStep()).
   *
   * @param {Object} mutation
   */
  applyMutation(mutation) {
    // Reset styles first by default (matches the original inspStep pattern)
    if (mutation.resetStyles !== false) {
      this.resetStyles();
    }

    // Phase change
    if (mutation.phase) {
      this.setPhase(mutation.phase);
    }

    // Label update
    if (mutation.label !== undefined) {
      this.stepLabel = mutation.label;
    }

    // Full replacements
    if (mutation.replaceHeaders) {
      this.headers = mutation.replaceHeaders.map(l => ({
        v: l.v, s: l.s || 'keep', id: l.id,
      }));
    }
    if (mutation.replaceBody) {
      this.body = mutation.replaceBody.map(l => ({
        v: l.v, s: l.s || 'keep', id: l.id,
      }));
    }
    if (mutation.replaceCycleState) {
      this.cycleState = mutation.replaceCycleState.map(l => ({
        v: l.v, s: l.s || 'keep', id: l.id,
      }));
    }

    // cycleState shorthand (matches original: inspCycle = [...])
    if (mutation.cycleState && !mutation.replaceCycleState) {
      this.cycleState = mutation.cycleState.map(l => ({
        v: l.v, s: l.s || 'keep', id: l.id,
      }));
    }

    // Clear cycleState
    if (mutation.clearCycleState) {
      this.cycleState = [];
    }

    // Individual line actions
    if (mutation.actions) {
      for (const act of mutation.actions) {
        if (act.action === 'add') {
          this._addLine(act.target || 'headers', {
            v: act.value,
            s: act.style || 'add',
            id: act.id,
          });
        } else if (act.action === 'remove') {
          this._removeLine(act.id);
        } else if (act.id && act.style) {
          // Style update: { id, style }
          this._setStyle(act.id, act.style);
        }
      }
    }

    this.render();
  }

  // ---------------------------------------------------------------------------
  // Style helpers
  // ---------------------------------------------------------------------------

  /**
   * Reset all non-deleted, non-error line styles to 'keep'.
   * Matches the original resetStyles() behavior.
   */
  resetStyles() {
    const reset = (arr) => {
      arr.forEach(l => {
        if (l.s !== 'del' && l.s !== 'err') l.s = 'keep';
      });
    };
    reset(this.headers);
    reset(this.body);
    reset(this.cycleState);
  }

  /**
   * Find a line by id across all sections and set its style.
   * @param {string} id
   * @param {string} style
   */
  _setStyle(id, style) {
    const line = this._findLine(id);
    if (line) line.s = style;
  }

  /**
   * Find a line by id across all sections.
   * @param {string} id
   * @returns {{v:string, s:string, id:string}|undefined}
   */
  _findLine(id) {
    return this.headers.find(l => l.id === id)
        || this.body.find(l => l.id === id)
        || this.cycleState.find(l => l.id === id);
  }

  /**
   * Add a line to a target section.
   * @param {'headers'|'body'|'cycleState'} target
   * @param {{v:string, s:string, id:string}} line
   */
  _addLine(target, line) {
    const section = this[target];
    if (section) section.push(line);
  }

  /**
   * Remove a line by id from whichever section it lives in.
   * @param {string} id
   */
  _removeLine(id) {
    for (const section of [this.headers, this.body, this.cycleState]) {
      const idx = section.findIndex(l => l.id === id);
      if (idx !== -1) {
        section.splice(idx, 1);
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /**
   * Render the current state to the DOM.
   */
  render() {
    let h = '';

    if (this.stepLabel) {
      h += `<div class="fs-inspector-plugin">${esc(this.stepLabel)}</div>`;
    }

    h += '<div class="fs-inspector-section">Headers:</div>';
    this.headers.forEach(l => {
      h += `<div class="fs-inspector-line ${l.s}">${esc(l.v)}</div>`;
    });

    h += '<div class="fs-inspector-section">Body:</div>';
    this.body.forEach(l => {
      h += `<div class="fs-inspector-line ${l.s}">${esc(l.v)}</div>`;
    });

    if (this.cycleState.length > 0) {
      h += '<div class="fs-inspector-section">CycleState:</div>';
      this.cycleState.forEach(l => {
        h += `<div class="fs-inspector-line ${l.s}">${esc(l.v)}</div>`;
      });
    }

    this._contentEl.innerHTML = h;
  }

  /**
   * Update the step label without re-rendering.
   * Call render() afterward if you want to see the change.
   *
   * @param {string} label
   */
  setLabel(label) {
    this.stepLabel = label;
  }

  // ---------------------------------------------------------------------------
  // Snapshot / restore (for jump-to-step support)
  // ---------------------------------------------------------------------------

  /**
   * Take a snapshot of the current inspector state.
   * @returns {Object}
   */
  snapshot() {
    return {
      headers: cloneLines(this.headers),
      body: cloneLines(this.body),
      cycleState: cloneLines(this.cycleState),
      stepLabel: this.stepLabel,
      phase: this._phase,
    };
  }

  /**
   * Restore inspector state from a snapshot.
   * @param {Object} snap
   */
  restore(snap) {
    this.headers = cloneLines(snap.headers);
    this.body = cloneLines(snap.body);
    this.cycleState = cloneLines(snap.cycleState);
    this.stepLabel = snap.stepLabel;
    this.setPhase(snap.phase);
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Static helpers for converting legacy inspStep switch-cases to mutations
  // ---------------------------------------------------------------------------

  /**
   * Create a mutation that highlights a line by id.
   * @param {string} id
   * @returns {{actions: Array}}
   */
  static highlight(id) {
    return { actions: [{ id, style: 'highlight' }] };
  }

  /**
   * Create a mutation that marks a line as deleted.
   * @param {string} id
   * @returns {{actions: Array}}
   */
  static del(id) {
    return { actions: [{ id, style: 'del' }] };
  }

  /**
   * Create a mutation that adds a new header line.
   * @param {string} value - The header text
   * @param {string} id    - Unique line id
   * @returns {{actions: Array}}
   */
  static addHeader(value, id) {
    return { actions: [{ action: 'add', target: 'headers', value, id }] };
  }

  /**
   * Create a mutation that adds a new body line.
   * @param {string} value - The body text
   * @param {string} id    - Unique line id
   * @returns {{actions: Array}}
   */
  static addBody(value, id) {
    return { actions: [{ action: 'add', target: 'body', value, id }] };
  }
}
