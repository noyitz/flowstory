// ================================================================
// Engine — canvas setup, coordinate transforms, and render loop
// Extracted from ai-gateway-flow.html (lines 140-151, 298-311, 817-839)
// ================================================================

/**
 * All mutable diagram state lives here so every module can share
 * a single reference without scattered globals.
 */
export class DiagramState {
  constructor() {
    // --- data loaded from JSON ---
    this.nodes = {};          // node definitions keyed by id
    this.tooltips = {};       // tooltip text keyed by node id
    this.flows = {};          // flow definitions keyed by flow id

    // --- visual state ---
    this.activeNodes = new Set();
    this.badges = {};         // node-id -> badge text (e.g. status codes)
    this.lines = [];          // active connector lines [{from, to, color, ...}]
    this.glowing = new Set(); // node ids that are glowing
    this.fading = {};         // node-id -> remaining fade ticks
    this.dots = [];           // animated Dot objects in flight

    // --- playback state ---
    this.running = false;
    this.paused = false;
    this.stepIndex = 0;       // current step within the active flow
    this.playbackSpeed = 1;
    this.loopMode = false;
    this.activeFlow = null;   // id of the currently selected flow
    this.currentStepDone = 0; // number of completed steps in current run
    this.stepTimer = null;    // setTimeout handle for next step

    // --- theme ---
    this.isDark = true;

    // --- inspector panel ---
    this.headers = [];        // request/response header entries
    this.body = [];           // body field entries
    this.cycleState = [];     // CycleState key-value entries
    this.phase = '';          // e.g. "request" | "response"
    this.stepLabel = '';      // human-readable label for current step

    // --- overlay ---
    this.highlightKey = null; // node id highlighted when overlay is open

    // --- snapshots ---
    this.snapshots = [];      // state snapshot after each step completes
  }

  /**
   * Reset all transient visual/playback state to defaults,
   * keeping loaded data (nodes, tooltips, flows) intact.
   */
  reset() {
    this.activeNodes.clear();
    this.badges = {};
    this.lines = [];
    this.glowing.clear();
    this.fading = {};
    this.dots = [];
    this.running = false;
    this.paused = false;
    this.stepIndex = 0;
    this.currentStepDone = 0;
    if (this.stepTimer) {
      clearTimeout(this.stepTimer);
      this.stepTimer = null;
    }
    this.headers = [];
    this.body = [];
    this.cycleState = [];
    this.phase = '';
    this.stepLabel = '';
    this.highlightKey = null;
    this.snapshots = [];
  }
}

// ================================================================
// Engine
// ================================================================

/**
 * Manages the canvas element, coordinate transforms, and the
 * requestAnimationFrame render loop.
 *
 * @example
 *   const engine = new Engine(canvasEl);
 *   engine.onDraw = (ctx, state) => { ... };
 *   engine.start();
 */
export class Engine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object}           [config]
   * @param {number}           [config.logicalWidth=1250]
   * @param {number}           [config.logicalHeight=1050]
   * @param {number}           [config.panelWidth=380]
   */
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Logical (design-time) dimensions — the coordinate space that
    // node positions are authored in.
    this.logicalWidth = config.logicalWidth ?? 1250;
    this.logicalHeight = config.logicalHeight ?? 1050;

    // Width reserved for the side panel so the canvas does not
    // extend underneath it.
    this.panelWidth = config.panelWidth ?? 380;

    // Physical pixel dimensions (set by resize())
    this.W = 0;
    this.H = 0;

    // Scale and offset computed by resize() so that the logical
    // coordinate space is centered in the available canvas area.
    this._ox = 0;
    this._oy = 0;
    this._sc = 1;

    // Animation frame handle
    this._animFrame = null;

    // Shared mutable state
    this.state = new DiagramState();

    /**
     * External draw callback.  Set this to a function that renders
     * the full diagram.  It receives (ctx, state, engine).
     * @type {Function|null}
     */
    this.onDraw = null;

    // Bind methods that are used as event/rAF callbacks so they
    // keep the correct `this`.
    this._animate = this._animate.bind(this);
    this._onResize = this._onResize.bind(this);
  }

  // --------------------------------------------------------------
  // Coordinate transforms — convert logical coords to canvas pixels
  // --------------------------------------------------------------

  /** Translate logical X to canvas X. */
  tx(x) {
    return this._ox + x * this._sc;
  }

  /** Translate logical Y to canvas Y. */
  ty(y) {
    return this._oy + y * this._sc;
  }

  /** Scale a logical size value to canvas pixels. */
  ts(s) {
    return s * this._sc;
  }

  // --------------------------------------------------------------
  // Resize
  // --------------------------------------------------------------

  /**
   * Recalculate canvas dimensions, scale, and offset.
   * Mirrors the original resize() from ai-gateway-flow.html.
   */
  resize() {
    this.W = this.canvas.width = innerWidth - this.panelWidth;
    this.H = this.canvas.height = innerHeight;
    this._sc = Math.min(this.W / this.logicalWidth, this.H / this.logicalHeight) * 0.98;
    this._ox = (this.W - this.logicalWidth * this._sc) / 2;
    this._oy = (this.H - this.logicalHeight * this._sc) * 0.04;
    this.draw();
  }

  // --------------------------------------------------------------
  // Draw / render loop
  // --------------------------------------------------------------

  /** Clear the canvas and invoke the external draw callback. */
  draw() {
    this.ctx.clearRect(0, 0, this.W, this.H);
    if (typeof this.onDraw === 'function') {
      this.onDraw(this.ctx, this.state, this);
    }
  }

  /** @private rAF callback */
  _animate() {
    this.draw();
    this._animFrame = requestAnimationFrame(this._animate);
  }

  /** @private window resize handler */
  _onResize() {
    this.resize();
  }

  // --------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------

  /** Start the render loop and listen for window resize events. */
  start() {
    addEventListener('resize', this._onResize);
    this.resize();
    if (!this._animFrame) {
      this._animFrame = requestAnimationFrame(this._animate);
    }
  }

  /** Stop the render loop and remove the resize listener. */
  stop() {
    removeEventListener('resize', this._onResize);
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  }
}
