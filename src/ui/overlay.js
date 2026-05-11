/**
 * OverlayManager — DOM-based overlay/tooltip system for the flow visualizer.
 *
 * Displays an informational card near a clicked diagram component, with a
 * semi-transparent backdrop and a highlight box drawn over the component.
 *
 * Extracted from ai-gateway-flow.html lines ~237-287.
 */

/**
 * Escape HTML entities for safe insertion into innerHTML.
 * @param {string} s
 * @returns {string}
 */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class OverlayManager {
  /**
   * @param {Object} dom  DOM element references
   * @param {HTMLElement} dom.overlay       - The full-screen backdrop element
   * @param {HTMLElement} dom.overlayCard   - The card container inside the overlay
   * @param {HTMLElement} dom.overlayAccent - Colored accent bar on the card
   * @param {HTMLElement} dom.overlayTitle  - Title element inside the card
   * @param {HTMLElement} dom.overlayDesc   - Description paragraph inside the card
   * @param {HTMLElement} dom.overlayDetails - Details/table container inside the card
   * @param {HTMLElement} dom.highlightBox  - Positioned highlight rectangle over the component
   * @param {Object} callbacks
   * @param {function():boolean} callbacks.isRunning    - returns current running state
   * @param {function():boolean} callbacks.isPaused     - returns current paused state
   * @param {function(boolean)} callbacks.setRunning    - set running state
   * @param {function(boolean)} callbacks.setPaused     - set paused state
   * @param {function()} callbacks.clearStepTimer       - clear the step timer
   * @param {function()} callbacks.resumeAnimation      - resume animation loop + schedule next step
   * @param {function()} callbacks.requestDraw           - request a single draw frame
   * @param {function():boolean} callbacks.isDark        - returns true if dark theme
   * @param {function(number):number} callbacks.tx       - transform logical X to screen X
   * @param {function(number):number} callbacks.ty       - transform logical Y to screen Y
   * @param {function(number):number} callbacks.ts       - transform logical size to screen size
   * @param {number} [panelWidth=380]                    - width of the right panel in px
   */
  constructor(dom, callbacks, panelWidth = 380) {
    this._dom = dom;
    this._cb = callbacks;
    this._panelWidth = panelWidth;

    this._open = false;
    this._wasRunning = false;
    this._highlightKey = null;

    // Wire up backdrop click-to-close
    this._dom.overlay.addEventListener('click', (e) => {
      if (e.target === this._dom.overlay) this.close();
    });
  }

  /** Whether the overlay is currently visible. */
  get isOpen() {
    return this._open;
  }

  /** The node key currently highlighted (or null). */
  get highlightKey() {
    return this._highlightKey;
  }

  /**
   * Show the overlay card for a diagram component.
   *
   * @param {string} key          - Node key (e.g. 'gw', 'p_mpr', 'anthropic')
   * @param {Object} nodeData     - Node definition from the nodes map (x, y, w, h, label, sublabel, color, ...)
   * @param {Object} tooltipData  - Tooltip data (t, d, dt, links, logo)
   * @param {Object} [context]    - Optional extra context
   * @param {function} [context.updatePlayBtn] - callback to refresh the play button label
   */
  show(key, nodeData, tooltipData, context) {
    if (!tooltipData) return;

    const n = nodeData;
    const tip = tooltipData;
    const { tx, ty, ts, isDark, isRunning, isPaused, setRunning, setPaused, clearStepTimer, requestDraw } = this._cb;

    // Pause the animation if it was running
    this._wasRunning = isRunning();
    this._highlightKey = key;

    if (isRunning() && !isPaused()) {
      setPaused(true);
      setRunning(false);
      clearStepTimer();
      if (context && context.updatePlayBtn) context.updatePlayBtn();
    }

    // --- Populate card content ---
    const card = this._dom.overlayCard;
    const tipTitle = tip.title || tip.t;
    const tipDesc = tip.description || tip.d;
    const tipDetails = tip.details || tip.dt;
    const tipLinks = tip.links;
    const tipLogo = tip.logo;

    this._dom.overlayAccent.style.background = n.color || '#58a6ff';
    this._dom.overlayTitle.textContent = tipTitle;
    this._dom.overlayTitle.style.color = n.color || '#c9d1d9';
    this._dom.overlayDesc.textContent = tipDesc;

    // Optional logo above the title
    const existingLogo = card.querySelector('img.overlay-logo');
    if (existingLogo) existingLogo.remove();
    if (tipLogo) {
      const img = document.createElement('img');
      img.className = 'overlay-logo';
      img.src = tipLogo;
      img.style.cssText = 'height:24px;margin-bottom:8px';
      this._dom.overlayTitle.parentNode.insertBefore(img, this._dom.overlayTitle);
    }

    // Details table
    let dh = '';
    if (tipDetails) {
      tipDetails.forEach(([label, value]) => {
        dh += `<div style="display:flex;gap:12px;padding:5px 0;border-bottom:1px solid #21262d">`
            + `<span style="color:#8b949e;min-width:110px;flex-shrink:0">${esc(label)}</span>`
            + `<span style="color:#c9d1d9">${esc(value)}</span></div>`;
      });
    }

    // Links
    if (tipLinks) {
      dh += '<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">';
      tipLinks.forEach(([label, url]) => {
        dh += `<a href="${url}" target="_blank" rel="noopener" `
            + `style="color:#58a6ff;font-size:12px;text-decoration:none;padding:4px 10px;`
            + `border:1px solid #30363d;border-radius:6px;font-family:system-ui;transition:all .15s" `
            + `onmouseover="this.style.borderColor='#58a6ff'" `
            + `onmouseout="this.style.borderColor='#30363d'">${esc(label)} &#8599;</a>`;
      });
      dh += '</div>';
    }
    this._dom.overlayDetails.innerHTML = dh;

    // --- Position the card near the component ---
    const nx = tx(n.x), ny = ty(n.y), nw = ts(n.w), nh = ts(n.h);
    const canvasRight = innerWidth - this._panelWidth;

    let cx, cy;
    if (nx + nw + 440 < canvasRight) {
      cx = nx + nw + 20;
    } else if (nx - 440 > 0) {
      cx = nx - 440;
    } else {
      cx = Math.max(10, (canvasRight - 420) / 2);
    }
    cy = Math.max(10, Math.min(ny - 40, innerHeight - 500));

    card.style.left = cx + 'px';
    card.style.top = cy + 'px';
    this._dom.overlay.style.display = 'block';

    // --- Highlight box over the component ---
    const hb = this._dom.highlightBox;
    hb.style.left = nx + 'px';
    hb.style.top = ny + 'px';
    hb.style.width = nw + 'px';
    hb.style.height = nh + 'px';
    hb.style.border = `3px solid ${n.color || '#58a6ff'}`;
    hb.style.boxShadow = `0 0 30px ${n.color || '#58a6ff'}88, inset 0 0 20px ${n.color || '#58a6ff'}22`;
    hb.style.background = isDark() ? '#161b22' : '#f6f8fa';
    hb.style.display = 'flex';
    hb.style.flexDirection = 'column';
    hb.style.alignItems = 'center';
    hb.style.justifyContent = 'center';
    hb.style.fontFamily = 'system-ui';
    hb.style.color = isDark() ? '#c9d1d9' : '#24292f';
    hb.innerHTML = `<div style="font-weight:700;font-size:${nw > 150 ? 16 : 13}px">${esc(n.label)}</div>`
      + (n.sublabel
        ? `<div style="font-size:${nw > 150 ? 12 : 10}px;color:#8b949e">${esc(n.sublabel)}</div>`
        : '');
    hb.style.transform = 'none';

    this._open = true;
    requestDraw();
  }

  /**
   * Close the overlay, hide highlight, and resume animation if it was running.
   */
  close() {
    this._dom.overlay.style.display = 'none';

    // Remove any injected logo
    const logo = this._dom.overlayCard.querySelector('img.overlay-logo');
    if (logo) logo.remove();

    // Hide highlight box
    this._dom.highlightBox.style.display = 'none';
    this._highlightKey = null;
    this._open = false;

    this._cb.requestDraw();

    // Resume if the flow was running before the overlay opened
    if (this._wasRunning) {
      this._cb.setPaused(false);
      this._cb.setRunning(true);
      this._cb.resumeAnimation();
    }
  }
}
