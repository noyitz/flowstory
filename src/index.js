// ================================================================
// FlowStory — main entry point and public API
//
// Imports all modules and wires them into a single FlowStory class
// that provides the complete animated flow diagram experience.
// ================================================================

// Core modules
import { Engine, DiagramState } from './core/engine.js';
import { Renderer } from './core/renderer.js';
import { edgePt, resolveEdge, drawArrowLine, drawLines } from './core/edges.js';
import { Dot } from './core/dot.js';
import { ThemeManager } from './core/theme.js';

// UI modules
import { PlaybackController } from './ui/playback.js';
import { SnapshotManager } from './ui/snapshot.js';
import { OverlayManager } from './ui/overlay.js';
import { StepsPanel } from './ui/steps-panel.js';
import { InspectorPanel } from './ui/inspector.js';

// Schema modules
import { loadDiagram } from './schema/loader.js';
import { validateDiagram } from './schema/validator.js';


/**
 * FlowStory — the top-level facade that wires together the engine,
 * renderer, playback controller, and all UI panels into a single
 * cohesive API.
 *
 * @example
 *   const fs = new FlowStory(document.getElementById('canvas'), {
 *     panelElement: document.getElementById('panel'),
 *     stepsElement: document.getElementById('steps'),
 *     inspectorElement: document.getElementById('inspector'),
 *     overlayElement: document.getElementById('overlay'),
 *   });
 *   await fs.load('diagram.json');
 *   fs.play('request-flow');
 */
export class FlowStory {
  /**
   * @param {HTMLCanvasElement} canvasElement - The canvas to render into
   * @param {object} [options]
   * @param {HTMLElement} [options.panelElement]     - Right side-panel container
   * @param {HTMLElement} [options.stepsElement]     - Steps list container
   * @param {HTMLElement} [options.inspectorElement] - Inspector panel container
   * @param {HTMLElement} [options.overlayElement]   - Overlay backdrop element
   * @param {number}      [options.panelWidth=380]   - Width reserved for the panel
   */
  constructor(canvasElement, options = {}) {
    this._canvas = canvasElement;
    this._options = options;

    // 1. Create the Engine with the canvas
    this._engine = new Engine(canvasElement, {
      panelWidth: options.panelWidth ?? 380,
    });

    // 2. Create a ThemeManager
    this._theme = new ThemeManager(true);

    // 3. Create a Renderer
    this._renderer = new Renderer();

    // 4. Set up the Engine's onDraw callback to call the Renderer
    this._engine.onDraw = (ctx, state, engine) => {
      this._draw(ctx, state, engine);
    };

    // Wire theme toggle to update diagram state
    this._theme.onToggle = (isDark) => {
      this._engine.state.isDark = isDark;
      // Update body class for CSS theme switching
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('light', !isDark);
      }
      this._engine.draw();
    };

    // UI components — created lazily on load()
    this._stepsPanel = null;
    this._inspector = null;
    this._overlay = null;
    this._playback = null;
    this._snapshot = null;

    // Store the loaded diagram data
    this._diagram = null;
  }

  // ================================================================
  // Loading
  // ================================================================

  /**
   * Load a diagram from a URL or a plain object.
   *
   * 1. Fetch/validate/normalize the JSON via loadDiagram()
   * 2. Store nodes, tooltips, flows, inspector config into DiagramState
   * 3. Set up the StepsPanel with the first flow
   * 4. Set up the InspectorPanel with initial config
   * 5. Initialize the OverlayManager
   * 6. Create the PlaybackController
   * 7. Start the engine render loop
   *
   * @param {string|object} urlOrDiagramObject - URL to fetch or diagram object
   */
  async load(urlOrDiagramObject) {
    // Step 1: Fetch, validate, normalize
    const diagram = await loadDiagram(urlOrDiagramObject);
    this._diagram = diagram;

    // Step 2: Populate DiagramState
    //
    // The loader produces flows as { label, steps } objects.  The
    // internal Engine/PlaybackController expect flows as plain arrays
    // of step objects (matching the original ai-gateway-flow format).
    // We also need to translate step field names:
    //   schema "from"  -> engine "f"
    //   schema "text"  -> engine "t"
    //   schema "color" -> engine "c"  (arrow steps)
    //
    // Build the engine-format flows map here so every downstream
    // consumer sees the flat array format it expects.
    const state = this._engine.state;
    state.nodes = diagram.nodes;
    state.tooltips = diagram.tooltips;
    state.isDark = this._theme.isDark;

    // Apply canvas dimensions from the diagram if provided
    if (diagram.canvas) {
      if (diagram.canvas.width) this._engine.logicalWidth = diagram.canvas.width;
      if (diagram.canvas.height) this._engine.logicalHeight = diagram.canvas.height;
    }

    // Apply theme from the diagram if provided
    if (diagram.theme) {
      const wantDark = diagram.theme === 'dark';
      if (this._theme.isDark !== wantDark) {
        this._theme.toggle();
      }
    }

    // Convert schema flows to engine-format flows
    state.flows = {};
    this._flowLabels = {};
    for (const [key, flow] of Object.entries(diagram.flows)) {
      this._flowLabels[key] = flow.label;
      state.flows[key] = (flow.steps || []).map(step => {
        const engineStep = { ...step };
        // Translate schema field names to engine field names
        if (engineStep.from !== undefined && engineStep.f === undefined) {
          engineStep.f = engineStep.from;
          delete engineStep.from;
        }
        if (engineStep.text !== undefined && engineStep.t === undefined) {
          engineStep.t = engineStep.text;
          delete engineStep.text;
        }
        if (engineStep.color !== undefined && engineStep.c === undefined) {
          engineStep.c = engineStep.color;
          delete engineStep.color;
        }
        if (engineStep.num === undefined && engineStep.badge !== undefined) {
          engineStep.num = engineStep.badge;
        }
        return engineStep;
      });
    }

    // Pick the first flow as the active one
    const flowKeys = Object.keys(state.flows);
    state.activeFlow = flowKeys[0] || null;

    // Step 3: Set up StepsPanel
    const stepsEl = this._options.stepsContainer || this._options.stepsElement;
    if (stepsEl) {
      this._stepsPanel = new StepsPanel(stepsEl);
      if (state.activeFlow) {
        this._stepsPanel.init(state.flows[state.activeFlow]);
      }
    }

    // Step 4: Set up InspectorPanel
    const inspTitle = this._options.inspectorTitle;
    const inspContent = this._options.inspectorContent;
    if (inspTitle && inspContent) {
      this._inspector = new InspectorPanel(inspTitle, inspContent);
      const initState = diagram.inspector?.initialState;
      if (initState) {
        const mapLine = (l) => ({ v: l.value || l.v, s: l.style || l.s || 'keep', id: l.id });
        this._inspector.init({
          headers: (initState.headers || []).map(mapLine),
          body: (initState.body || []).map(mapLine),
          cycleState: (initState.cycleState || []).map(mapLine),
        });
        if (initState.phase) this._inspector.setPhase(initState.phase);
        this._inspector.render();
      }
    }

    // Step 5: Initialize OverlayManager
    const overlayEl = this._options.overlay || this._options.overlayElement;
    if (overlayEl) {
      this._setupOverlay();
    }

    // Step 6: Create PlaybackController
    this._setupPlayback();

    // Wire StepsPanel click handler to PlaybackController jump
    if (this._stepsPanel && this._playback) {
      this._stepsPanel.onStepClick = (stepIndex) => {
        this._playback.jumpToStep(stepIndex);
      };
    }

    // Step 7: Wire up DOM elements (branding, title, legend, buttons, flow selector)
    this._setupBranding(diagram);
    this._setupTitle(diagram);
    this._setupLegend(diagram);
    this._setupFlowSelector();
    this._setupButtons();
    this._setupCanvasClick();

    // Step 8: Start the render loop
    this._engine.start();
  }

  // ================================================================
  // Playback controls
  // ================================================================

  /**
   * Start playing a specific flow. If no flowKey is given,
   * plays the currently active flow.
   *
   * @param {string} [flowKey] - Key into the flows object
   */
  play(flowKey) {
    if (!this._playback) return;
    if (flowKey && flowKey !== this._engine.state.activeFlow) {
      this._playback.setFlow(flowKey);
      // Re-init steps panel for the new flow (engine-format: plain array)
      if (this._stepsPanel) {
        const flow = this._engine.state.flows[flowKey];
        if (flow) this._stepsPanel.init(flow);
      }
    }
    this._playback.run();
  }

  /** Pause the current playback. */
  pause() {
    if (this._playback) this._playback.pause();
  }

  /** Resume from a paused state. */
  resume() {
    if (this._playback) this._playback.resume();
  }

  /** Reset the diagram to its initial (pre-play) state. */
  reset() {
    if (this._playback) this._playback.reset();
  }

  /**
   * Jump to a specific step index (zero-based).
   * @param {number} stepIndex
   */
  jumpTo(stepIndex) {
    if (this._playback) this._playback.jumpToStep(stepIndex);
  }

  /**
   * Set the playback speed multiplier.
   * @param {number} multiplier - 0.5, 1, or 2
   */
  setSpeed(multiplier) {
    if (!this._engine) return;
    this._engine.state.playbackSpeed = multiplier;
  }

  /** Toggle loop mode on/off. */
  toggleLoop() {
    if (this._playback) return this._playback.toggleLoop();
  }

  /** Toggle between dark and light theme. */
  toggleTheme() {
    this._theme.toggle();
  }

  // ================================================================
  // Accessors
  // ================================================================

  /** Access the current DiagramState. */
  get state() {
    return this._engine.state;
  }

  /** Get available flow keys. */
  get flows() {
    return Object.keys(this._engine.state.flows);
  }

  /** Whether a flow is currently playing (not paused). */
  get isPlaying() {
    return this._engine.state.running;
  }

  /** Whether playback is paused. */
  get isPaused() {
    return this._engine.state.paused;
  }

  // ================================================================
  // Internal: DOM wiring
  // ================================================================

  _setupBranding(diagram) {
    const el = this._options.brand;
    if (!el || !diagram.meta?.branding) return;
    const b = diagram.meta.branding;
    el.innerHTML = '';
    if (b.logo) {
      const img = document.createElement('img');
      img.src = b.logo;
      img.alt = b.title || '';
      el.appendChild(img);
    }
    if (b.title) {
      const span = document.createElement('span');
      span.textContent = b.title;
      el.appendChild(span);
    }
  }

  _setupTitle(diagram) {
    const el = this._options.title;
    if (!el) return;
    const titleText = diagram.meta?.title || '';
    el.innerHTML = titleText;
    this._titleEl = el;
    this._updateFlowLabel();
  }

  _updateFlowLabel() {
    if (!this._titleEl) return;
    const state = this._engine.state;
    const label = this._flowLabels[state.activeFlow] || '';
    const base = this._diagram?.meta?.title || '';
    this._titleEl.innerHTML = base + (label ? ` &middot; <span style="font-weight:700;-webkit-text-fill-color:#f0883e">${label}</span>` : '');
  }

  _setupLegend(diagram) {
    const el = this._options.legend;
    if (!el || !diagram.legend) return;
    el.innerHTML = '<div class="fs-legend-title">Legend</div>';
    for (const item of diagram.legend) {
      const div = document.createElement('div');
      div.className = 'fs-legend-item';
      const dot = document.createElement('div');
      dot.className = 'fs-legend-dot';
      dot.style.background = item.color;
      div.appendChild(dot);
      div.appendChild(document.createTextNode(item.label));
      el.appendChild(div);
    }
  }

  _setupFlowSelector() {
    const select = this._options.flowSelect;
    if (!select) return;
    const state = this._engine.state;
    const order = this._diagram.flowOrder || Object.keys(state.flows);
    select.innerHTML = '';
    for (const key of order) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = this._flowLabels[key] || key;
      select.appendChild(opt);
    }
    select.value = state.activeFlow;
    select.addEventListener('change', () => {
      const key = select.value;
      this.reset();
      state.activeFlow = key;
      if (this._stepsPanel) {
        this._stepsPanel.init(state.flows[key]);
      }
      this._updateFlowLabel();
      this._engine.draw();
    });
  }

  _setupButtons() {
    const opts = this._options;
    const self = this;

    if (opts.playBtn) {
      opts.playBtn.addEventListener('click', () => {
        self.play();
        const s = self._engine.state;
        opts.playBtn.innerHTML = s.running && !s.paused ? '&#9646;&#9646; Pause' : '&#9654; Start';
      });
    }
    if (opts.resetBtn) {
      opts.resetBtn.addEventListener('click', () => {
        self.reset();
        if (opts.playBtn) opts.playBtn.innerHTML = '&#9654; Start';
      });
    }
    if (opts.speedBtn) {
      const speeds = [1, 2, 0.5];
      let si = 0;
      opts.speedBtn.addEventListener('click', () => {
        si = (si + 1) % speeds.length;
        self._engine.state.playbackSpeed = speeds[si];
        opts.speedBtn.textContent = speeds[si] + 'x';
      });
    }
    if (opts.loopBtn) {
      opts.loopBtn.addEventListener('click', () => {
        self._engine.state.loopMode = !self._engine.state.loopMode;
        opts.loopBtn.textContent = self._engine.state.loopMode ? '⟳ Loop ON' : '⟳ Loop';
        opts.loopBtn.style.borderColor = self._engine.state.loopMode ? '#3fb950' : '#79c0ff';
        opts.loopBtn.style.color = self._engine.state.loopMode ? '#3fb950' : '#79c0ff';
      });
    }
    if (opts.themeBtn) {
      opts.themeBtn.addEventListener('click', () => {
        self.toggleTheme();
        opts.themeBtn.innerHTML = self._theme.isDark ? '&#9790;' : '&#9788;';
      });
    }
  }

  /** Close the overlay (called from inline HTML onclick). */
  closeOverlay() {
    if (this._overlay) this._overlay.close();
  }

  // ================================================================
  // Internal: drawing
  // ================================================================

  /**
   * Master draw callback wired into Engine.onDraw.
   * Orchestrates drawing the background, nodes, edges, dots, and
   * the overlay highlight.
   *
   * @private
   */
  _draw(ctx, state, engine) {
    const colors = this._theme.colors();
    const isDark = this._theme.isDark;

    // Background fill
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, engine.W, engine.H);

    // Build the rendering context object used by Renderer and edge functions
    const renderCtx = {
      ctx,
      tx: (x) => engine.tx(x),
      ty: (y) => engine.ty(y),
      ts: (s) => engine.ts(s),
      isDark,
      colors,
      activeNodes: state.activeNodes,
      badges: state.badges,
      glowing: state.glowing,
      fading: state.fading,
      nodes: state.nodes,
    };

    // Draw all nodes (boundaries, containers, sections, boxes)
    this._renderer.renderAll(ctx, state.nodes, renderCtx);

    // Draw connector lines
    if (state.lines.length > 0) {
      drawLines(renderCtx, state.lines);
    }

    // Draw animated dots
    for (let i = state.dots.length - 1; i >= 0; i--) {
      const dot = state.dots[i];
      dot.update();
      dot.draw(ctx);
      if (!dot.alive) {
        state.dots.splice(i, 1);
      }
    }

    // Draw overlay highlight box on the canvas (semi-transparent overlay)
    if (this._overlay && this._overlay.isOpen && this._overlay.highlightKey) {
      const hk = this._overlay.highlightKey;
      const hn = state.nodes[hk];
      if (hn) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = hn.color || '#58a6ff';
        ctx.fillRect(
          engine.tx(hn.x) - 4,
          engine.ty(hn.y) - 4,
          engine.ts(hn.w) + 8,
          engine.ts(hn.h) + 8,
        );
        ctx.restore();
      }
    }
  }

  // ================================================================
  // Internal: setup helpers
  // ================================================================

  /**
   * Create and configure the PlaybackController.
   * @private
   */
  _setupPlayback() {
    const engine = this._engine;
    const state = engine.state;

    this._playback = new PlaybackController({
      state,
      engine,
      stepsPanel: this._stepsPanel
        ? {
            markActive: (i) => this._stepsPanel.updateStep(i, 'active'),
            markDone: (i) => this._stepsPanel.updateStep(i, 'done'),
            markPending: (i) => this._stepsPanel.updateStep(i, 'pending'),
            scrollTo: (i) => this._stepsPanel.scrollToStep(i),
            initSteps: (flow) => this._stepsPanel.init(flow),
          }
        : null,
      inspector: this._inspector && this._diagram.inspector
        ? {
            init: () => {
              const initState = this._diagram.inspector?.initialState;
              if (initState) {
                const mapLine = (l) => ({ v: l.value || l.v, s: l.style || l.s || 'keep', id: l.id });
                this._inspector.init({
                  headers: (initState.headers || []).map(mapLine),
                  body: (initState.body || []).map(mapLine),
                  cycleState: (initState.cycleState || []).map(mapLine),
                });
                if (initState.phase) this._inspector.setPhase(initState.phase);
              }
            },
            step: (n) => {
              const flowMutations = this._diagram.inspector?.mutations?.[this._engine.state.activeFlow];
              if (flowMutations) {
                const m = flowMutations.find(m => m.step === n);
                if (m) {
                  const mapLine = (l) => ({ v: l.value || l.v, s: l.style || l.s || 'keep', id: l.id });
                  const normalized = { ...m };
                  if (normalized.actions) {
                    normalized.actions = normalized.actions.map(a => ({
                      ...a,
                      value: a.value,
                      style: a.style,
                    }));
                  }
                  if (normalized.replaceHeaders) normalized.replaceHeaders = normalized.replaceHeaders.map(mapLine);
                  if (normalized.replaceBody) normalized.replaceBody = normalized.replaceBody.map(mapLine);
                  if (normalized.cycleState) normalized.cycleState = normalized.cycleState.map(mapLine);
                  if (normalized.replaceCycleState) normalized.replaceCycleState = normalized.replaceCycleState.map(mapLine);
                  this._inspector.applyMutation(normalized);
                }
              }
            },
          }
        : null,
      createDot: (fromKey, toKey, color, speed, callback, opts) => {
        return new Dot(fromKey, toKey, color, speed, callback, opts, {
          tx: (x) => engine.tx(x),
          ty: (y) => engine.ty(y),
          ts: (s) => engine.ts(s),
          nodes: state.nodes,
        });
      },
      onFlowComplete: () => {
        if (this._options.playBtn) {
          this._options.playBtn.innerHTML = '&#9654; Start';
        }
        this._updateFlowLabel();
        if (this._options.flowSelect) {
          this._options.flowSelect.value = this._engine.state.activeFlow;
        }
        if (this._stepsPanel) {
          this._stepsPanel.init(this._engine.state.flows[this._engine.state.activeFlow]);
        }
      },
      flowOrder: this._diagram.flowOrder || Object.keys(state.flows),
    });

    this._playback.onChange((event) => {
      if (event === 'flow') {
        this._updateFlowLabel();
        if (this._options.flowSelect) {
          this._options.flowSelect.value = state.activeFlow;
        }
        if (this._stepsPanel) {
          this._stepsPanel.init(state.flows[state.activeFlow]);
        }
      }
      if (event === 'play' || event === 'resume') {
        if (this._options.playBtn) this._options.playBtn.innerHTML = '&#9646;&#9646; Pause';
      }
      if (event === 'pause' || event === 'reset') {
        if (this._options.playBtn) this._options.playBtn.innerHTML = '&#9654; Start';
      }
    });
  }

  /**
   * Set up the overlay manager from the overlay DOM element.
   *
   * Expects the overlay element to contain (or will create):
   *   .overlay-card, .overlay-accent, .overlay-title,
   *   .overlay-desc, .overlay-details, .highlight-box
   *
   * @private
   * @param {HTMLElement} overlayEl
   */
  _setupOverlay() {
    const engine = this._engine;
    const state = engine.state;
    const opts = this._options;

    const overlayEl = opts.overlay || opts.overlayElement;
    const card = opts.overlayCard;
    const accent = opts.overlayAccent;
    const title = opts.overlayTitle;
    const desc = opts.overlayDesc;
    const details = opts.overlayDetails;
    const highlightBox = opts.highlightBox;

    if (!overlayEl || !card) return;

    // Wire close/resume buttons
    if (opts.overlayClose) {
      opts.overlayClose.addEventListener('click', () => this.closeOverlay());
    }
    if (opts.overlayResume) {
      opts.overlayResume.addEventListener('click', () => this.closeOverlay());
    }

    this._overlay = new OverlayManager(
      {
        overlay: overlayEl,
        overlayCard: card,
        overlayAccent: accent,
        overlayTitle: title,
        overlayDesc: desc,
        overlayDetails: details,
        highlightBox: highlightBox,
      },
      {
        isRunning: () => state.running,
        isPaused: () => state.paused,
        setRunning: (v) => { state.running = v; },
        setPaused: (v) => { state.paused = v; },
        clearStepTimer: () => {
          if (state.stepTimer) {
            clearTimeout(state.stepTimer);
            state.stepTimer = null;
          }
        },
        resumeAnimation: () => {
          if (this._playback) this._playback.resume();
        },
        requestDraw: () => engine.draw(),
        isDark: () => this._theme.isDark,
        tx: (x) => engine.tx(x),
        ty: (y) => engine.ty(y),
        ts: (s) => engine.ts(s),
      },
      this._options.panelWidth ?? 380,
    );
  }

  /**
   * Wire up the canvas click handler for overlays.
   *
   * On click, determine which node was clicked by checking if the
   * click coordinates fall within any node's bounding box (in
   * logical coordinates), then call OverlayManager.show().
   *
   * @private
   */
  _setupCanvasClick() {
    const engine = this._engine;
    const state = engine.state;

    this._canvas.addEventListener('click', (e) => {
      // If overlay is not available, nothing to do
      if (!this._overlay) return;

      // If overlay is already open, don't process canvas clicks
      // (backdrop click-to-close is handled by OverlayManager itself)
      if (this._overlay.isOpen) return;

      // Convert screen coordinates to logical coordinates
      // Inverse of tx/ty: logicalX = (screenX - ox) / scale
      const rect = this._canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const logicalX = (screenX - engine._ox) / engine._sc;
      const logicalY = (screenY - engine._oy) / engine._sc;

      // Check which node was clicked (skip boundaries and containers)
      for (const [key, node] of Object.entries(state.nodes)) {
        if (node.type === 'boundary' || node.type === 'container') continue;

        if (
          logicalX >= node.x &&
          logicalX <= node.x + node.w &&
          logicalY >= node.y &&
          logicalY <= node.y + node.h
        ) {
          const tooltip = state.tooltips[key];
          if (tooltip) {
            this._overlay.show(key, node, tooltip);
          }
          break;
        }
      }
    });
  }
}


// ================================================================
// Re-export all individual classes and functions for advanced usage
// ================================================================

export {
  // Core
  Engine,
  DiagramState,
  Renderer,
  edgePt,
  resolveEdge,
  drawArrowLine,
  drawLines,
  Dot,
  ThemeManager,

  // UI
  PlaybackController,
  SnapshotManager,
  OverlayManager,
  StepsPanel,
  InspectorPanel,

  // Schema
  loadDiagram,
  validateDiagram,
};
