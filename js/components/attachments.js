// attachments.js — upload, validate, preview, download, delete file attachments

import { createAttachment, getAttachmentsByNote, getAttachmentsByChapter, deleteAttachment } from '../db.js';
import { validateFile, fileToBase64, downloadBase64, base64ToObjectUrl, getFileIcon, isImage } from '../utils/fileUtils.js';
import { uuid, formatBytes, formatDateTime, sanitizeFilename } from '../utils/helpers.js';
import { showConfirm } from './modal.js';
import { showToast } from './toast.js';

/**
 * Render the attachments panel for a note or chapter.
 * @param {HTMLElement} container
 * @param {Object} context - { noteId?, chapterId, caseId, ownerId }
 */
export async function renderAttachments(container, context) {
  const { noteId, chapterId, caseId, ownerId } = context;
  const attachments = noteId
    ? await getAttachmentsByNote(noteId)
    : await getAttachmentsByChapter(chapterId);

  container.innerHTML = `
    <div class="attachments-panel">
      <div class="attachments-header">
        <span class="panel-section-title">📎 Attachments</span>
        <label class="btn btn-sm btn-outline upload-label" title="Upload file (PDF, DOC, DOCX, JPG, PNG — max ${formatBytes(10*1024*1024)})">
          + Upload
          <input type="file" id="attachment-file-input" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp" style="display:none">
        </label>
      </div>
      <div class="attachments-list" id="attachments-list">
        ${attachments.length === 0 ? '<p class="empty-state-sm">No attachments yet.</p>' : ''}
        ${attachments.map(a => attachmentItem(a)).join('')}
      </div>
    </div>
  `;

  const fileInput = container.querySelector('#attachment-file-input');
  fileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const { valid, error } = validateFile(file);
    if (!valid) { showToast(error, 'error', 5000); return; }

    showToast('Uploading…', 'saving', 0);
    try {
      const dataUrl = await fileToBase64(file);
      const att = {
        id: uuid(),
        caseId,
        chapterId: chapterId || null,
        noteId: noteId || null,
        ownerId,
        fileName: sanitizeFilename(file.name),
        mimeType: file.type,
        size: file.size,
        dataUrl,
        uploadedAt: new Date().toISOString(),
      };
      await createAttachment(att);
      showToast('Attachment uploaded', 'success');
      await renderAttachments(container, context);
    } catch (err) {
      showToast('Upload failed: ' + err.message, 'error');
    }
  });

  // Actions: download, preview, delete
  container.querySelector('#attachments-list').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const attId = btn.dataset.id;
    const att = attachments.find(a => a.id === attId);
    if (!att) return;

    if (btn.dataset.action === 'download') {
      downloadBase64(att.dataUrl, att.fileName);
    }
    if (btn.dataset.action === 'preview') {
      openPreview(att);
    }
    if (btn.dataset.action === 'delete') {
      const ok = await showConfirm({ title: 'Delete Attachment', message: `Delete "<strong>${att.fileName}</strong>"? This cannot be undone.`, confirmText: 'Delete' });
      if (ok) {
        await deleteAttachment(attId, ownerId);
        showToast('Attachment deleted', 'info');
        await renderAttachments(container, context);
      }
    }
  });
}

function attachmentItem(a) {
  const icon = getFileIcon(a.mimeType);
  const canPreview = isImage(a.mimeType) || a.mimeType === 'application/pdf';
  return `
    <div class="attachment-item" data-id="${a.id}">
      <span class="attachment-icon" aria-hidden="true">${icon}</span>
      <div class="attachment-info">
        <span class="attachment-name" title="${a.fileName}">${a.fileName}</span>
        <span class="attachment-meta">${formatBytes(a.size)} · ${formatDateTime(a.uploadedAt)}</span>
      </div>
      <div class="attachment-actions">
        ${canPreview ? `<button class="icon-btn" data-action="preview" data-id="${a.id}" title="Preview" aria-label="Preview ${a.fileName}">👁</button>` : ''}
        <button class="icon-btn" data-action="download" data-id="${a.id}" title="Download" aria-label="Download ${a.fileName}">⬇</button>
        <button class="icon-btn icon-btn-danger" data-action="delete" data-id="${a.id}" title="Delete" aria-label="Delete ${a.fileName}">🗑</button>
      </div>
    </div>
  `;
}

function openPreview(att) {
  const objUrl = base64ToObjectUrl(att.dataUrl);
  if (!objUrl) { showToast('Cannot preview this file.', 'warning'); return; }

  const overlay = document.createElement('div');
  overlay.className = 'preview-overlay';
  overlay.innerHTML = `
    <div class="preview-box">
      <div class="preview-header">
        <span>${att.fileName}</span>
        <button class="modal-close preview-close" aria-label="Close preview">✕</button>
      </div>
      <div class="preview-body">
        ${isImage(att.mimeType)
          ? `<img src="${objUrl}" alt="${att.fileName}" class="preview-image">`
          : `<iframe src="${objUrl}" class="preview-iframe" title="${att.fileName}"></iframe>`
        }
      </div>
    </div>
  `;
  overlay.querySelector('.preview-close').addEventListener('click', () => {
    overlay.remove();
    URL.revokeObjectURL(objUrl);
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); URL.revokeObjectURL(objUrl); } });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-open'));
}
