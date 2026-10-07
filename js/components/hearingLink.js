// hearingLink.js — "Add to Hearing Day" and display of linked items in Hearing view

import { createHearingLink, getHearingLinks, deleteHearingLink, getHearingsByCase, getNote, getChapter } from '../db.js';
import { uuid, formatDate, escapeHtml, formatDateTime } from '../utils/helpers.js';
import { showToast } from './toast.js';
import { showConfirm } from './modal.js';

/**
 * Render "Add to Hearing Day" button + linked hearings list for a note.
 */
export async function renderHearingLinkPanel(container, note, caseId, ownerId) {
  const hearings = await getHearingsByCase(caseId);
  const links = await getHearingLinksByNote(note.id);

  const linkedHearingIds = new Set(links.map(l => l.hearingId));
  const linkedHearings = hearings.filter(h => linkedHearingIds.has(h.id));

  container.innerHTML = `
    <div class="hearing-link-panel">
      <div class="panel-header">
        <span class="panel-section-title">⚖ Hearing Day Links</span>
        <button class="btn btn-sm btn-outline" id="btn-link-hearing">+ Link to Hearing</button>
      </div>
      ${linkedHearings.length === 0
        ? '<p class="empty-state-sm">Not linked to any hearing yet.</p>'
        : `<ul class="hearing-link-list">${linkedHearings.map(h => {
            const link = links.find(l => l.hearingId === h.id);
            return `<li class="hearing-link-item">
              <span class="hearing-link-icon">⚖</span>
              <div class="hearing-link-info">
                <span class="hearing-link-date">${formatDate(h.date)}</span>
                <span class="hearing-link-court">${escapeHtml(h.courtName || h.notes || '')}</span>
              </div>
              <button class="icon-btn icon-btn-danger" data-action="unlink" data-link-id="${link.id}" title="Remove link" aria-label="Remove hearing link">✕</button>
            </li>`;
          }).join('')}</ul>`
      }
    </div>
  `;

  container.querySelector('#btn-link-hearing').addEventListener('click', async () => {
    if (hearings.length === 0) { showToast('No hearings found for this case. Add hearings first.', 'warning'); return; }
    const available = hearings.filter(h => !linkedHearingIds.has(h.id));
    if (available.length === 0) { showToast('This note is already linked to all hearings.', 'info'); return; }
    showHearingSelectModal(available, async hearingId => {
      await createHearingLink({ id: uuid(), caseId, hearingId, noteId: note.id, chapterId: note.chapterId || null, ownerId, createdAt: new Date().toISOString() });
      showToast('Linked to hearing', 'success');
      await renderHearingLinkPanel(container, note, caseId, ownerId);
    });
  });

  container.querySelectorAll('[data-action="unlink"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await showConfirm({ title: 'Remove Hearing Link', message: 'Remove this note from the hearing day?', confirmText: 'Remove', danger: false });
      if (ok) {
        await deleteHearingLink(btn.dataset.linkId);
        showToast('Link removed', 'info');
        await renderHearingLinkPanel(container, note, caseId, ownerId);
      }
    });
  });
}

/**
 * Render all notebook items linked to a specific hearing (used in Hearing Day view).
 */
export async function renderLinkedNotebookItems(container, hearingId) {
  const links = await getHearingLinks(hearingId);
  if (links.length === 0) {
    container.innerHTML = '<p class="empty-state-sm">No notebook items linked to this hearing.</p>';
    return;
  }

  const items = await Promise.all(links.map(async l => {
    let label = '', snippet = '', type = '';
    if (l.noteId) {
      const note = await getNote(l.noteId);
      if (note) {
        label = note.title || 'Untitled Note';
        const div = document.createElement('div');
        div.innerHTML = note.contentHtml || '';
        snippet = (div.textContent || '').slice(0, 120);
        type = 'note';
      }
    } else if (l.chapterId) {
      const ch = await getChapter(l.chapterId);
      if (ch) { label = ch.title; type = 'chapter'; }
    }
    return { ...l, label, snippet, type };
  }));

  container.innerHTML = `
    <div class="linked-items-section">
      <h4 class="linked-items-title">📓 Notebook Items</h4>
      <ul class="linked-items-list">
        ${items.map(item => `
          <li class="linked-item">
            <span class="linked-item-icon">${item.type === 'note' ? '📝' : '📂'}</span>
            <div class="linked-item-body">
              <span class="linked-item-label">${escapeHtml(item.label)}</span>
              ${item.snippet ? `<span class="linked-item-snippet">${escapeHtml(item.snippet)}${item.snippet.length >= 120 ? '…' : ''}</span>` : ''}
            </div>
            <a href="#notebook/${item.caseId}" class="btn btn-xs btn-ghost">Open →</a>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

async function getHearingLinksByNote(noteId) {
  const { getHearingLinksByNote } = await import('../db.js');
  return getHearingLinksByNote(noteId);
}

function showHearingSelectModal(hearings, onSelect) {
  import('./modal.js').then(({ showModal }) => {
    const formEl = document.createElement('div');
    formEl.innerHTML = `
      <div class="hearing-select-list">
        ${hearings.map(h => `
          <button class="hearing-select-item btn btn-outline" data-id="${h.id}">
            <span class="hearing-select-date">⚖ ${formatDate(h.date)}</span>
            <span class="hearing-select-info">${escapeHtml(h.courtName || h.notes || 'Hearing')}</span>
          </button>
        `).join('')}
      </div>
    `;
    const modal = showModal({ title: 'Select Hearing', body: formEl, confirmText: '', cancelText: 'Close', danger: false });
    formEl.querySelectorAll('.hearing-select-item').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelector('.modal-cancel-btn').click();
        onSelect(btn.dataset.id);
      });
    });
  });
}
