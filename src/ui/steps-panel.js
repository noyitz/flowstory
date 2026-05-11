/**
 * StepsPanel — manages the step list UI in the right panel.
 *
 * Renders a flow's steps as clickable items with pending/active/done states,
 * and fires a callback when the user clicks a step (for jump-to navigation).
 *
 * Extracted from ai-gateway-flow.html lines ~846-857 and the flow selection
 * handler that re-initializes the step list.
 */

/**
 * Escape HTML entities.
 * @param {string} s
 * @returns {string}
 */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class StepsPanel {
  /**
   * @param {HTMLElement} container - The DOM element that holds the step list
   *                                  (e.g. the <div id="steps-ctr"> element).
   */
  constructor(container) {
    this._container = container;
    this._steps = [];

    /**
     * Callback fired when the user clicks a step.
     * Receives the zero-based step index.
     * @type {function(number)|null}
     */
    this.onStepClick = null;
  }

  /**
   * Populate the step list from a flow's steps array.
   * Each step object must have at least a `t` property (the step title text).
   *
   * @param {Array<{t: string}>} flow - Array of step definitions from a flow.
   */
  init(flow) {
    this._steps = flow;
    this._container.innerHTML = '';

    flow.forEach((step, i) => {
      const el = document.createElement('div');
      el.className = 'fs-step pending';
      el.id = 'step-' + i;
      el.innerHTML = `<span class="fs-step-mark"></span><span>${esc(step.t)}</span>`;
      el.addEventListener('click', () => {
        if (this.onStepClick) {
          this.onStepClick(i);
        }
      });
      this._container.appendChild(el);
    });
  }

  /**
   * Update a single step's visual state.
   *
   * @param {number} index   - Zero-based step index.
   * @param {'pending'|'active'|'done'} status - The visual state to apply.
   */
  updateStep(index, status) {
    const el = document.getElementById('step-' + index);
    if (!el) return;
    el.className = 'fs-step ' + status;
  }

  /**
   * Mark all steps up to (but not including) `activeIndex` as done,
   * set `activeIndex` as active, and everything after as pending.
   * Useful after a jump-to-step operation.
   *
   * @param {number} activeIndex - The step to mark as active.
   */
  setActiveStep(activeIndex) {
    this._steps.forEach((_, i) => {
      if (i < activeIndex) {
        this.updateStep(i, 'done');
      } else if (i === activeIndex) {
        this.updateStep(i, 'active');
      } else {
        this.updateStep(i, 'pending');
      }
    });
  }

  /**
   * Mark all steps from 0 through `doneIndex` as done,
   * and everything after as pending.
   *
   * @param {number} doneIndex - The last step index to mark done (inclusive).
   */
  markDoneThrough(doneIndex) {
    this._steps.forEach((_, i) => {
      this.updateStep(i, i <= doneIndex ? 'done' : 'pending');
    });
  }

  /**
   * Scroll a step element into view.
   *
   * @param {number} index - Zero-based step index.
   */
  scrollToStep(index) {
    const el = document.getElementById('step-' + index);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /**
   * Reset all steps to pending state.
   */
  reset() {
    this._steps.forEach((_, i) => {
      this.updateStep(i, 'pending');
    });
  }

  /**
   * Returns the number of steps currently loaded.
   * @returns {number}
   */
  get length() {
    return this._steps.length;
  }
}
