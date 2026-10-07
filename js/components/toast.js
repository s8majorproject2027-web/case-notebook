// toast.js — save-state indicator and general notifications

let _container = null;

function getContainer() {
  if (!_container) {
    _container = document.createElement('div');
    _container.className = 'toast-container';
    _container.setAttribute('aria-live', 'polite');
    _container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(_container);
  }
  return _container;
}

export function showToast(message, type = 'info', duration = 3000) {
  const c = getContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ', saving: '⟳' };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-message">${message}</span>`;
  c.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-show'));

  if (duration > 0) {
    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
  return toast;
}

// ─── Autosave indicator (Saving / Saved / Failed) ─────────────────────────────

let _saveToast = null;

export const SaveIndicator = {
  saving() {
    if (_saveToast) _saveToast.remove();
    _saveToast = showToast('Saving…', 'saving', 0);
    _saveToast.classList.add('toast-persist');
  },
  saved() {
    if (_saveToast) _saveToast.remove();
    _saveToast = showToast('Saved', 'success', 2500);
  },
  failed(msg = 'Failed to save') {
    if (_saveToast) _saveToast.remove();
    _saveToast = showToast(msg, 'error', 4000);
  },
  clear() {
    if (_saveToast) { _saveToast.remove(); _saveToast = null; }
  },
};
