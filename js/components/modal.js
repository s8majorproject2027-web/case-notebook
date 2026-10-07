// modal.js — generic reusable modal (confirm, form, info)

let _activeModal = null;

export function showModal({ title, body, confirmText = 'Confirm', cancelText = 'Cancel', danger = false, onConfirm, onCancel, wide = false }) {
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);

  overlay.innerHTML = `
    <div class="modal-box ${wide ? 'modal-wide' : ''}" role="document">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">${typeof body === 'string' ? body : ''}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-cancel-btn">${cancelText}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} modal-confirm-btn">${confirmText}</button>
      </div>
    </div>
  `;

  // If body is a DOM element, append it
  if (body instanceof HTMLElement) {
    overlay.querySelector('.modal-body').appendChild(body);
  }

  const close = (confirmed) => {
    overlay.classList.remove('modal-open');
    setTimeout(() => overlay.remove(), 250);
    _activeModal = null;
    if (confirmed && onConfirm) onConfirm();
    else if (!confirmed && onCancel) onCancel();
  };

  overlay.querySelector('.modal-close').addEventListener('click', () => close(false));
  overlay.querySelector('.modal-cancel-btn').addEventListener('click', () => close(false));
  overlay.querySelector('.modal-confirm-btn').addEventListener('click', () => close(true));
  overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });

  // Keyboard
  const keyHandler = e => {
    if (e.key === 'Escape') close(false);
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') close(true);
  };
  overlay.addEventListener('keydown', keyHandler);

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-open'));
  _activeModal = overlay;

  // Focus first focusable element
  const focusable = overlay.querySelector('button, input, select, textarea');
  if (focusable) setTimeout(() => focusable.focus(), 100);

  return overlay;
}

export function showConfirm({ title, message, confirmText = 'Delete', danger = true }) {
  return new Promise(resolve => {
    showModal({
      title,
      body: `<p class="modal-message">${message}</p>`,
      confirmText,
      danger,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

export function closeModal() {
  if (_activeModal) {
    _activeModal.querySelector('.modal-cancel-btn')?.click();
    _activeModal = null;
  }
}
