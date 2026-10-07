// markedPoints.js — "Marked Points" view: tagged notes across the notebook

import { getNotesByCase, getChaptersByNotebook } from '../db.js';
import { escapeHtml, stripHtml, formatDateTime } from '../utils/helpers.js';

const TAGS = ['Important', 'Urgent', 'Key Point', 'Follow-up'];
const TAG_COLORS = {
  Important: { bg: '#4f7af820', text: '#4f7af8', border: '#4f7af8' },
  Urgent:    { bg: '#ef444420', text: '#ef4444', border: '#ef4444' },
  'Key Point':{ bg: '#22c55e20', text: '#22c55e', border: '#22c55e' },
  'Follow-up':{ bg: '#f59e0b20', text: '#f59e0b', border: '#f59e0b' },
};

export function tagBadge(tag) {
  const c = TAG_COLORS[tag] || { bg: '#9da3b420', text: '#9da3b4', border: '#9da3b4' };
  return `<span class="tag-badge" style="background:${c.bg};color:${c.text};border-color:${c.border}">${tag}</span>`;
}

export async function renderMarkedPoints(container, notebook, onNoteSelect) {
  const [notes, chapters] = await Promise.all([
    getNotesByCase(notebook.caseId),
    getChaptersByNotebook(notebook.id),
  ]);
  const chapterMap = Object.fromEntries(chapters.map(c => [c.id, c]));
  const marked = notes.filter(n => n.tags && n.tags.length > 0);

  const allTags = [...new Set(marked.flatMap(n => n.tags))];

  container.innerHTML = `
    <div class="marked-panel">
      <div class="panel-header">
        <span class="panel-section-title">🔖 Marked Points</span>
        <span class="marked-count">${marked.length} marked</span>
      </div>
      ${marked.length === 0 ? '<p class="empty-state-sm">No marked notes yet. Tag a note as Important, Urgent, Key Point, or Follow-up.</p>' : `
        <div class="marked-filters" id="marked-filters">
          <button class="filter-chip active" data-filter="all">All</button>
          ${allTags.map(t => `<button class="filter-chip" data-filter="${t}">${tagBadge(t)}</button>`).join('')}
        </div>
        <div class="marked-list" id="marked-list">
          ${marked.map(n => markedNoteItem(n, chapterMap)).join('')}
        </div>
      `}
    </div>
  `;

  const filterBtns = container.querySelectorAll('.filter-chip');
  const list = container.querySelector('#marked-list');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      list.querySelectorAll('.marked-note-item').forEach(item => {
        item.style.display = (filter === 'all' || item.dataset.tags.includes(filter)) ? '' : 'none';
      });
    });
  });

  if (list) {
    list.addEventListener('click', e => {
      const item = e.target.closest('.marked-note-item');
      if (item && onNoteSelect) onNoteSelect(item.dataset.noteId, item.dataset.chapterId);
    });
  }
}

function markedNoteItem(n, chapterMap) {
  const ch = chapterMap[n.chapterId];
  const snippet = stripHtml(n.contentHtml || '').slice(0, 120);
  return `
    <div class="marked-note-item" data-note-id="${n.id}" data-chapter-id="${n.chapterId}" data-tags="${n.tags.join(',')}" role="button" tabindex="0" title="Go to note">
      <div class="marked-note-header">
        <span class="marked-note-title">${escapeHtml(n.title || 'Untitled Note')}</span>
        <span class="marked-chapter-label">${ch ? escapeHtml(ch.title) : ''}</span>
      </div>
      <div class="marked-note-tags">${n.tags.map(t => tagBadge(t)).join(' ')}</div>
      ${snippet ? `<div class="marked-note-snippet">${escapeHtml(snippet)}${snippet.length >= 120 ? '…' : ''}</div>` : ''}
      <div class="marked-note-meta">${formatDateTime(n.updatedAt)}</div>
    </div>
  `;
}

// Tag selector component (used in note editor toolbar)
export function renderTagSelector(container, currentTags, onChange) {
  container.innerHTML = `
    <div class="tag-selector">
      <span class="tag-selector-label">Tags:</span>
      ${TAGS.map(t => {
        const active = currentTags.includes(t);
        const c = TAG_COLORS[t];
        return `<button class="tag-toggle ${active ? 'tag-active' : ''}" data-tag="${t}"
          style="border-color:${c.border};${active ? `background:${c.bg};color:${c.text}` : ''}"
          aria-pressed="${active}">${t}</button>`;
      }).join('')}
    </div>
  `;
  container.querySelectorAll('.tag-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      const newTags = currentTags.includes(tag)
        ? currentTags.filter(t => t !== tag)
        : [...currentTags, tag];
      onChange(newTags);
      renderTagSelector(container, newTags, onChange);
    });
  });
}

export { TAGS, TAG_COLORS };
