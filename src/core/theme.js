/**
 * Theme manager extracted from ai-gateway-flow.html.
 * Provides dark/light palette toggling.
 */

const DARK = {
  bg: '#0d1117',
  box: '#161b22',
  boxA: '#1a2332',
  bdr: '#30363d',
  txt: '#c9d1d9',
  dim: '#8b949e',
  brt: '#fff',
};

const LIGHT = {
  bg: '#fff',
  box: '#f6f8fa',
  boxA: '#ddf4ff',
  bdr: '#d0d7de',
  txt: '#24292f',
  dim: '#656d76',
  brt: '#000',
};

export class ThemeManager {
  constructor(isDark = true) {
    this.isDark = isDark;
    this.onToggle = null;
  }

  toggle() {
    this.isDark = !this.isDark;
    if (typeof this.onToggle === 'function') {
      this.onToggle(this.isDark);
    }
  }

  colors() {
    return this.isDark ? { ...DARK } : { ...LIGHT };
  }
}
