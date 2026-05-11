// ================================================================
// PlaybackController — run, pause, resume, reset, and step through
// animated flow diagrams.
// Extracted from ai-gateway-flow.html (lines 1335-1557)
// ================================================================

/**
 * Extract the edge-routing options from a flow step definition.
 * These flags tell the Dot where to attach on the source/target
 * node boundary.
 */
function stepOpts(s) {
  return {
    fromLeft: s.fromLeft, toLeft: s.toLeft,
    fromRight: s.fromRight, toRight: s.toRight,
    fromBottom: s.fromBottom, fromTop: s.fromTop,
    toTop: s.toTop, toBottom: s.toBottom,
    yOff: s.yOff, xOff: s.xOff,
    fromXOff: s.fromXOff, toXOff: s.toXOff,
    waypoints: s.waypoints,
  };
}

/**
 * Build a connector-line descriptor from a flow step definition.
 * The line is drawn permanently once the Dot finishes its flight.
 */
function stepLine(s) {
  return {
    from: s.f, to: s.to, color: s.c, num: s.num,
    fromLeft: s.fromLeft, toLeft: s.toLeft,
    fromRight: s.fromRight, toRight: s.toRight,
    fromBottom: s.fromBottom, fromTop: s.fromTop,
    toTop: s.toTop, toBottom: s.toBottom,
    yOff: s.yOff, xOff: s.xOff,
    fromXOff: s.fromXOff, toXOff: s.toXOff,
    waypoints: s.waypoints,
  };
}

/**
 * Controls the step-by-step playback of an animated flow diagram.
 *
 * The controller reads from and writes to a shared {@link DiagramState}
 * (state.running, state.paused, state.stepIndex, etc.) so the rest
 * of the system can query playback status without tight coupling.
 *
 * @example
 *   const ctrl = new PlaybackController({
 *     state:          engine.state,
 *     engine:         engine,
 *     stepsPanel:     stepsPanel,   // StepsPanel instance or null
 *     inspector:      inspector,    // InspectorPanel instance or null
 *     createDot:      (from, to, color, speed, cb, opts) => new Dot(...),
 *     onFlowComplete: () => { ... },
 *   });
 *   ctrl.run();
 */
export class PlaybackController {
  /**
   * @param {object}   ctx
   * @param {import('../core/engine.js').DiagramState} ctx.state
   *   Shared mutable diagram state.
   * @param {import('../core/engine.js').Engine}       ctx.engine
   *   Engine instance (for draw() / start-animation calls).
   * @param {object|null} ctx.stepsPanel
   *   StepsPanel UI helper — must expose markActive(i), markDone(i),
   *   scrollTo(i), and initSteps(flow).  May be null if not wired up.
   * @param {object|null} ctx.inspector
   *   InspectorPanel UI helper — must expose init() and step(n).
   *   May be null if not wired up.
   * @param {Function} ctx.createDot
   *   Factory:  (fromKey, toKey, color, speed, callback, opts) => Dot
   * @param {Function|null} [ctx.onFlowComplete]
   *   Optional callback fired when the last step finishes.
   * @param {string[]} [ctx.flowOrder]
   *   Ordered list of flow keys used by loop-mode cycling.
   *   Defaults to Object.keys(state.flows).
   */
  constructor(ctx) {
    this._state     = ctx.state;
    this._engine    = ctx.engine;
    this._steps     = ctx.stepsPanel  ?? null;
    this._inspector = ctx.inspector   ?? null;
    this._createDot = ctx.createDot;
    this._onFlowComplete = ctx.onFlowComplete ?? null;
    this._flowOrder = ctx.flowOrder ?? null;

    /** Listeners notified on play/pause/reset state changes. */
    this._listeners = [];
  }

  // ---------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------

  /** True if a playback is in progress (even if paused). */
  get isActive() {
    return this._state.running || this._state.paused;
  }

  /** The step array for the currently active flow. */
  get _flow() {
    return this._state.flows[this._state.activeFlow] ?? [];
  }

  /** Ordered flow keys for loop cycling. */
  get _order() {
    return this._flowOrder ?? Object.keys(this._state.flows);
  }

  // ---------------------------------------------------------------
  // Event helpers
  // ---------------------------------------------------------------

  /**
   * Register a callback that fires on state transitions.
   * The callback receives an event string:
   *   "play" | "pause" | "resume" | "reset" | "speed" | "loop" | "flow"
   *
   * @param {Function} fn
   * @returns {Function} unsubscribe function
   */
  onChange(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(l => l !== fn);
    };
  }

  /** @private */
  _emit(event) {
    for (const fn of this._listeners) {
      try { fn(event, this); } catch (_) { /* swallow */ }
    }
  }

  // ---------------------------------------------------------------
  // run / pause / resume
  // ---------------------------------------------------------------

  /**
   * Toggle play ↔ pause.  If stopped, starts from the beginning.
   * Mirrors the original `run()` function.
   */
  run() {
    const st = this._state;

    // --- resume from pause ---
    if (st.paused) {
      this.resume();
      return;
    }

    // --- pause while running ---
    if (st.running) {
      this.pause();
      return;
    }

    // --- fresh start ---
    this.reset();
    st.running = true;
    st.paused  = false;
    st.stepIndex = 0;
    st.currentStepDone = 0;

    if (this._inspector) this._inspector.init();

    this._emit('play');
    this._ensureAnimating();
    st.stepTimer = setTimeout(() => this.execStep(), 300);
  }

  /** Pause a running playback. */
  pause() {
    const st = this._state;
    if (!st.running) return;

    st.paused  = true;
    st.running = false;
    if (st.stepTimer) { clearTimeout(st.stepTimer); st.stepTimer = null; }

    this._emit('pause');
  }

  /** Resume from a paused state. */
  resume() {
    const st = this._state;
    if (!st.paused) return;

    st.paused  = false;
    st.running = true;

    this._emit('resume');
    this._ensureAnimating();
    st.stepTimer = setTimeout(() => this.execStep(), 300 / st.playbackSpeed);
  }

  // ---------------------------------------------------------------
  // execStep — execute a single flow step
  // ---------------------------------------------------------------

  /**
   * Execute the step at `state.stepIndex`.  For arrow steps this
   * launches a Dot animation and chains to the next step on
   * completion; for lightup steps it applies the badge/glow
   * synchronously and chains after a short delay.
   */
  execStep() {
    const st   = this._state;
    const flow = this._flow;

    if (!st.running || st.paused || st.stepIndex >= flow.length) {
      if (st.stepIndex >= flow.length) {
        st.running = false;
        st.paused  = false;
        this._emit('reset');
        if (this._onFlowComplete) this._onFlowComplete();

        if (st.loopMode) {
          const order = this._order;
          const idx   = order.indexOf(st.activeFlow);
          const next  = order[(idx + 1) % order.length];

          st.stepTimer = setTimeout(() => {
            this.setFlow(next);
            this.run();
          }, 3000 / st.playbackSpeed);
        }
      }
      return;
    }

    const si = st.stepIndex;
    const s  = flow[si];

    // Mark prior steps as done in the steps panel
    if (this._steps) {
      for (let j = 0; j < si; j++) this._steps.markDone(j);
      this._steps.markActive(si);
      this._steps.scrollTo(si);
    }

    // Advance inspector
    if (this._inspector) this._inspector.step(si + 1);

    // --- arrow mode: animate a Dot ---
    if (s.mode === 'arrow') {
      if (s.f) st.activeNodes.add(s.f);

      const dot = this._createDot(
        s.f, s.to, s.c,
        0.02 * st.playbackSpeed,
        () => {
          // Dot reached the target — commit the arrow and advance
          st.lines.push(stepLine(s));
          if (s.glow) st.glowing.add(s.glow);
          st.activeNodes.add(s.to);

          if (this._steps) this._steps.markDone(si);

          st.currentStepDone = si + 1;
          this._saveSnapshot(si);
          st.stepIndex++;

          if (st.running && !st.paused) {
            st.stepTimer = setTimeout(
              () => this.execStep(),
              300 / st.playbackSpeed,
            );
          }
        },
        stepOpts(s),
      );

      st.dots.push(dot);
    }

    // --- lightup mode: instant badge / glow ---
    else if (s.mode === 'lightup') {
      st.fading[s.target] = Date.now();
      st.activeNodes.add(s.target);

      // Apply error color override
      if (s.errColor) {
        const n = st.nodes[s.target];
        if (n) {
          n._origColor = n._origColor || n.color;
          n.color = s.errColor;
        }
      }

      // Accumulate badges
      if (st.badges[s.target] != null) {
        const existing = Array.isArray(st.badges[s.target])
          ? st.badges[s.target]
          : [st.badges[s.target]];
        existing.push(s.badge);
        st.badges[s.target] = existing;
      } else {
        st.badges[s.target] = s.badge;
      }

      if (this._steps) this._steps.markDone(si);

      st.currentStepDone = si + 1;
      this._saveSnapshot(si);
      st.stepIndex++;

      if (st.running && !st.paused) {
        st.stepTimer = setTimeout(
          () => this.execStep(),
          800 / st.playbackSpeed,
        );
      }
    }
  }

  // ---------------------------------------------------------------
  // Speed / loop / flow selection
  // ---------------------------------------------------------------

  /**
   * Cycle through playback speeds: 0.5x -> 1x -> 2x -> 0.5x ...
   * @returns {number} the new speed value
   */
  cycleSpeed() {
    const speeds = [0.5, 1, 2];
    const idx = speeds.indexOf(this._state.playbackSpeed);
    this._state.playbackSpeed = speeds[(idx + 1) % speeds.length];
    this._emit('speed');
    return this._state.playbackSpeed;
  }

  /**
   * Toggle loop mode on/off.  When enabled, playback automatically
   * cycles through all flows in order.  If the diagram is idle when
   * loop mode is turned on, playback starts immediately.
   *
   * @returns {boolean} the new loopMode value
   */
  toggleLoop() {
    const st = this._state;
    st.loopMode = !st.loopMode;
    this._emit('loop');

    if (st.loopMode && !st.running && !st.paused) {
      this.run();
    }
    return st.loopMode;
  }

  /**
   * Switch to a different flow and reset.
   * @param {string} flowKey — key into state.flows
   */
  setFlow(flowKey) {
    if (!(flowKey in this._state.flows)) {
      throw new Error(`PlaybackController: unknown flow "${flowKey}"`);
    }
    this._state.activeFlow = flowKey;
    this.reset();
    this._emit('flow');
  }

  // ---------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------

  /**
   * Clear all animation state, restore original node colours,
   * and return to the idle (pre-Start) state.
   */
  reset() {
    const st = this._state;

    // Restore any error-colour overrides on nodes
    const nodes = st.nodes;
    for (const k of Object.keys(nodes)) {
      if (nodes[k]._origColor) {
        nodes[k].color = nodes[k]._origColor;
        delete nodes[k]._origColor;
      }
    }

    st.running = false;
    st.paused  = false;
    st.stepIndex = 0;
    if (st.stepTimer) { clearTimeout(st.stepTimer); st.stepTimer = null; }
    st.dots = [];
    st.activeNodes.clear();
    st.badges = {};
    st.lines  = [];
    st.glowing.clear();
    st.fading = {};
    st.currentStepDone = 0;
    st.snapshots = [];

    // Reset inspector state
    st.headers    = [];
    st.body       = [];
    st.cycleState = [];
    st.phase      = '';
    st.stepLabel  = '';

    if (this._steps) this._steps.initSteps(this._flow);

    // Force a redraw so the cleared state is visible immediately
    this._engine.draw();

    this._emit('reset');
  }

  // ---------------------------------------------------------------
  // Snapshots — save/restore state at each completed step
  // ---------------------------------------------------------------

  /** @private */
  _saveSnapshot(stepIdx) {
    const st = this._state;
    st.snapshots[stepIdx] = {
      activeNodes: new Set(st.activeNodes),
      badges:      JSON.parse(JSON.stringify(st.badges)),
      lines:       JSON.parse(JSON.stringify(st.lines)),
      glowing:     new Set(st.glowing),
    };
  }

  /** @private */
  _restoreSnapshot(stepIdx) {
    const st = this._state;
    if (stepIdx < 0) {
      st.activeNodes.clear();
      st.badges = {};
      st.lines  = [];
      st.glowing.clear();
      return;
    }
    const snap = st.snapshots[stepIdx];
    if (!snap) return;
    st.activeNodes = new Set(snap.activeNodes);
    st.badges      = JSON.parse(JSON.stringify(snap.badges));
    st.lines       = JSON.parse(JSON.stringify(snap.lines));
    st.glowing     = new Set(snap.glowing);
  }

  /**
   * Rebuild visual state from scratch up to (and including)
   * targetStep without animation — used when jumping to a step
   * that has no cached snapshot.
   *
   * @param {number} targetStep — zero-based step index
   */
  simulateUpTo(targetStep) {
    const st   = this._state;
    const flow = this._flow;

    st.activeNodes.clear();
    st.badges = {};
    st.lines  = [];
    st.glowing.clear();

    for (let i = 0; i <= targetStep; i++) {
      const s = flow[i];
      if (s.mode === 'arrow') {
        if (s.f) st.activeNodes.add(s.f);
        st.lines.push(stepLine(s));
        if (s.glow) st.glowing.add(s.glow);
        st.activeNodes.add(s.to);
      } else if (s.mode === 'lightup') {
        st.activeNodes.add(s.target);
        if (s.errColor) {
          const n = st.nodes[s.target];
          if (n) {
            n._origColor = n._origColor || n.color;
            n.color = s.errColor;
          }
        }
        if (st.badges[s.target] != null) {
          const existing = Array.isArray(st.badges[s.target])
            ? st.badges[s.target]
            : [st.badges[s.target]];
          existing.push(s.badge);
          st.badges[s.target] = existing;
        } else {
          st.badges[s.target] = s.badge;
        }
      }
      this._saveSnapshot(i);
    }
  }

  /**
   * Instantly jump to a completed step — skipping all animation.
   * Pauses playback at that step so the user can inspect the state.
   *
   * @param {number} targetStep — zero-based step index
   */
  jumpToStep(targetStep) {
    const st = this._state;

    // Stop any running playback
    if (st.running) {
      st.running = false;
      if (st.stepTimer) { clearTimeout(st.stepTimer); st.stepTimer = null; }
    }

    // Restore or rebuild the state snapshot
    if (!st.snapshots[targetStep]) {
      this.simulateUpTo(targetStep);
    }
    this._restoreSnapshot(targetStep);

    st.currentStepDone = targetStep + 1;
    st.stepIndex       = targetStep + 1;

    // Update steps panel
    if (this._steps) {
      for (let i = 0; i <= targetStep; i++) this._steps.markDone(i);
      this._steps.markActive(targetStep);

      const flow = this._flow;
      for (let i = targetStep + 1; i < flow.length; i++) {
        this._steps.markPending(i);
      }
    }

    // Rebuild inspector state up to this step
    if (this._inspector) {
      this._inspector.init();
      for (let i = 1; i <= targetStep + 1; i++) {
        this._inspector.step(i);
      }
    }

    // Clear in-flight dots and fading effects
    st.dots   = [];
    st.fading = {};

    // Pause at the target step
    st.paused = true;
    this._emit('pause');

    // Force a clean redraw
    this._engine.draw();
  }

  // ---------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------

  /** @private Make sure the Engine's rAF loop is running. */
  _ensureAnimating() {
    if (!this._engine._animFrame) {
      this._engine._animFrame = requestAnimationFrame(this._engine._animate);
    }
  }
}
