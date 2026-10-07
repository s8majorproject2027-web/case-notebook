// router.js — hash-based SPA router

const _routes = {};
let _current = null;
let _beforeEach = null;

export const Router = {
  /**
   * Register a route pattern.
   * Pattern may contain :param segments, e.g. 'notebook/:caseId'
   */
  on(pattern, handler) {
    _routes[pattern] = handler;
    return this;
  },

  beforeEach(fn) {
    _beforeEach = fn;
    return this;
  },

  navigate(hash) {
    window.location.hash = hash.startsWith('#') ? hash : '#' + hash;
  },

  start() {
    const handle = () => this._dispatch(window.location.hash || '#dashboard');
    window.addEventListener('hashchange', handle);
    handle();
  },

  _dispatch(hash) {
    const path = hash.replace(/^#\/?/, '');
    const parts = path.split('/');

    for (const pattern of Object.keys(_routes)) {
      const patternParts = pattern.split('/');
      if (patternParts.length !== parts.length) continue;

      const params = {};
      let match = true;
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
          params[patternParts[i].slice(1)] = decodeURIComponent(parts[i]);
        } else if (patternParts[i] !== parts[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        if (_beforeEach) {
          const ok = _beforeEach(pattern, params);
          if (ok === false) return;
        }
        _current = { pattern, params };
        _routes[pattern](params);
        return;
      }
    }

    // fallback
    if (_routes['*']) _routes['*']({});
  },

  current() { return _current; },
};
