// versionHistory.js — note version list, read-only view, and restore

import { getVersionsByNote, createNoteVersion, pruneVersions } from '../db.js';
import { uuid, formatDateTime, escapeHtml, CONFIG } from '../utils/helpers.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { showConfirm } from './modal.js';
import { showToast } from './toast.js';

export async function renderVersionHistory(container, note, onRestore) {
  const versions = await getVersionsByNote(note.id);

  container.innerHTML = `
    <div class="version-panel">
      <div class="panel-header">
        <span class="panel-section-title">🕐 Version History</span>
        <span class="version-count">${versions.length} version${versions.length !== 1 ? 's' : ''}</span>
      </div>
      ${versions.length === 0
        ? '<p class="empty-state-sm">No versions saved yet. Versions are created automatically while editing.</p>'
        : `<ul class="version-list">${versions.map((v, i) => versionItem(v, i)).join('')}</ul>`
      }
    </div>
  `;

  container.querySelectorAll('[data-action="view-version"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = versions.find(v => v.id === btn.dataset.id);
      if (v) openVersionPreview(v);
    });
  });

  container.querySelectorAll('[data-action="restore-version"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const v = versions.find(v => v.id === btn.dataset.id);
      if (!v) return;
      const ok = await showConfirm({
        title: 'Restore Version',
        message: `Restore version from <strong>${formatDateTime(v.savedAt)}</strong>? A new version will be created from the current content first.`,
        confirmText: 'Restore',
        danger: false,
      });
      if (!ok) return;

      // Save current as a version first
      await createNoteVersion({
        id: uuid(),
        noteId: note.id,
        contentHtml: note.contentHtml,
        savedAt: new Date().toISOString(),
        savedBy: note.ownerId,
        isManual: true,
        label: 'Pre-restore snapshot',
      });

      if (onRestore) await onRestore(v.contentHtml);
      await pruneVersions(note.id, CONFIG.MAX_VERSIONS);
      showToast('Version restored', 'success');
      await renderVersionHistory(container, note, onRestore);
    });
  });
}

function versionItem(v, index) {
  return `
    <li class="version-item">
      <div class="version-item-left">
        <span class="version-number">v${index + 1}</span>
        <div class="version-meta">
          <span class="version-time">${formatDateTime(v.savedAt)}</span>
          ${v.label ? `<span class="version-label">${escapeHtml(v.label)}</span>` : ''}
          ${v.isManual ? '<span class="version-manual-badge">Manual</span>' : ''}
        </div>
      </div>
      <div class="version-actions">
        <button class="btn btn-xs btn-ghost" data-action="view-version" data-id="${v.id}">View</button>
        <button class="btn btn-xs btn-outline" data-action="restore-version" data-id="${v.id}">Restore</button>
      </div>
    </li>
  `;
}

function openVersionPreview(v) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box modal-wide">
      <div class="modal-header">
        <h3 class="modal-title">Version — ${formatDateTime(v.savedAt)}</h3>
        <button class="modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body version-preview-body">
        <div class="version-preview-content ql-editor">${sanitizeHtml(v.contentHtml)}</div>
      </div>
      <div class="modal-footer">
        <span class="version-preview-note">📖 Read-only view. Use Restore to apply this version.</span>
      </div>
    </div>
  `;
  overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-open'));
}
