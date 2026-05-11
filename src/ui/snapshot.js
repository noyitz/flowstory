/**
 * SnapshotManager — captures and restores diagram state at each step,
 * enabling instant jump-to-step navigation without replaying animations.
 *
 * Extracted from ai-gateway-flow.html (saveSnapshot / restoreSnapshot /
 * simulateUpTo / jumpToStep).
 */

export class SnapshotManager {
  /**
   * @param {object} opts
   * @param {object} opts.state - DiagramState reference.  Must expose mutable
   *   properties: activeNodes (Set), badges (object), lines (array),
   *   glowing (Set).
   */
  constructor({ state }) {
    this.state = state;
    /** @type {Array<object|undefined>} indexed by step number */
    this.snapshots = [];
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /** Deep-clone the four tracked fields from the live state. */
  _cloneState() {
    const { activeNodes, badges, lines, glowing } = this.state;
    return {
      activeNodes: new Set(activeNodes),
      badges: JSON.parse(JSON.stringify(badges)),
      lines: JSON.parse(JSON.stringify(lines)),
      glowing: new Set(glowing),
    };
  }

  /** Overwrite the live state with a previously cloned snapshot. */
  _applySnapshot(snap) {
    this.state.activeNodes = new Set(snap.activeNodes);
    this.state.badges = JSON.parse(JSON.stringify(snap.badges));
    this.state.lines = JSON.parse(JSON.stringify(snap.lines));
    this.state.glowing = new Set(snap.glowing);
  }

  /** Reset the live state to its empty/initial form. */
  _clearState() {
    this.state.activeNodes.clear();
    this.state.badges = {};
    this.state.lines = [];
    this.state.glowing.clear();
  }

  // ── public API ───────────────────────────────────────────────────────

  /**
   * Save a snapshot of the current diagram state after step `stepIdx`
   * has been applied.
   *
   * @param {number} stepIdx - zero-based step index
   */
  save(stepIdx) {
    this.snapshots[stepIdx] = this._cloneState();
  }

  /**
   * Restore the diagram to the state captured after step `snapIdx`.
   * If `snapIdx` is negative the state is cleared (pre-step-0).
   * If no snapshot exists for the index this is a no-op.
   *
   * @param {number} snapIdx - zero-based step index, or -1 for blank state
   */
  restore(snapIdx) {
    if (snapIdx < 0) {
      this._clearState();
      return;
    }
    const snap = this.snapshots[snapIdx];
    if (!snap) return;
    this._applySnapshot(snap);
  }

  /**
   * Re-execute every step from 0 through `targetStep` synchronously
   * (no animation) to rebuild the diagram state and fill in any missing
   * snapshots along the way.
   *
   * @param {number}   targetStep   - zero-based index of the step to reach
   * @param {Array}    flow         - the ordered array of step descriptors
   * @param {function} stepExecutor - `(step, state) => void`  Applies a
   *   single step to the live state (arrows, badges, glowing, etc.).
   *   The executor must NOT trigger animations or DOM updates.
   */
  simulateUpTo(targetStep, flow, stepExecutor) {
    this._clearState();
    for (let i = 0; i <= targetStep; i++) {
      stepExecutor(flow[i], this.state);
      this.save(i);
    }
  }

  /**
   * Jump the diagram to `targetStep` — the main entry point for
   * step-click navigation.
   *
   * If a snapshot already exists for the target it is restored directly;
   * otherwise `simulateUpTo` is used to rebuild state from scratch.
   *
   * @param {number}   targetStep   - zero-based step index to jump to
   * @param {Array}    flow         - ordered step descriptors
   * @param {function} stepExecutor - same contract as in `simulateUpTo`
   */
  jumpTo(targetStep, flow, stepExecutor) {
    if (!this.snapshots[targetStep]) {
      this.simulateUpTo(targetStep, flow, stepExecutor);
    } else {
      this.restore(targetStep);
    }
  }

  /** Discard all cached snapshots (e.g. on flow reset). */
  clear() {
    this.snapshots = [];
  }
}
