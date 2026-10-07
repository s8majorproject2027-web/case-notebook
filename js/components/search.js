// search.js — debounced in-notebook full-text search

import { searchNotebook } from '../db.js';
import { debounce, highlight, escapeHtml, CONFIG } from '../utils/helpers.js';

export function renderSearch(container, notebook, onResultClick) {
  container.innerHTML = `
    <div class="search-bar-wrapper">
      <span class="search-icon" aria-hidden="true">🔍</span>
      <input
        id="notebook-search-input"
        type="search"
        class="search-input"
        placeholder="Search chapters, notes, tasks, timeline, attachments…"
        autocomplete="off"
        aria-label="Search notebook"
      >
      <span class="search-scope-label">In this notebook</span>
    </div>
    <div id="search-results" class="search-results" role="listbox" aria-label="Search results" hidden></div>
  `;

  const input = container.querySelector('#notebook-search-input');
  const results = container.querySelector('#search-results');

  const doSearch = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { results.hidden = true; results.innerHTML = ''; return; }

    results.hidden = false;
    results.innerHTML = '<div class="search-loading">Searching…</div>';

    const hits = await searchNotebook(notebook.caseId, notebook.ownerId, q);
    if (hits.length === 0) {
      results.innerHTML = `<div class="search-empty">No results for "<strong>${escapeHtml(q)}</strong>" in this notebook.</div>`;
      return;
    }

    results.innerHTML = `
      <div class="search-count">${hits.length} result${hits.length !== 1 ? 's' : ''}</div>
      <ul class="search-result-list">
        ${hits.map(h => searchResultItem(h, q)).join('')}
      </ul>
    `;

    results.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        results.hidden = true;
        input.value = '';
        if (onResultClick) onResultClick(item.dataset);
      });
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter') item.click();
      });
    });
  }, CONFIG.SEARCH_DEBOUNCE_MS);

  input.addEventListener('input', doSearch);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { results.hidden = true; input.value = ''; }
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!container.contains(e.target)) results.hidden = true;
  }, { passive: true });
}

const TYPE_ICON = { chapter: '📂', note: '📝', task: '✅', timeline: '🗓', attachment: '📎' };
const TYPE_LABEL = { chapter: 'Chapter', note: 'Note', task: 'Task', timeline: 'Timeline', attachment: 'Attachment' };

function searchResultItem(hit, query) {
  const icon = TYPE_ICON[hit.type] || '🔍';
  const label = TYPE_LABEL[hit.type] || hit.type;
  const highlightedTitle = highlight(hit.title, query);
  const highlightedSnippet = highlight(hit.snippet, query);
  return `
    <li class="search-result-item"
      data-type="${hit.type}"
      data-id="${hit.id}"
      data-chapter-id="${hit.chapterId || ''}"
      role="option"
      tabindex="0"
    >
      <span class="search-result-icon">${icon}</span>
      <div class="search-result-body">
        <div class="search-result-title">${highlightedTitle}</div>
        ${hit.chapterTitle ? `<div class="search-result-chapter">${escapeHtml(hit.chapterTitle)}</div>` : ''}
        ${highlightedSnippet ? `<div class="search-result-snippet">${highlightedSnippet}</div>` : ''}
      </div>
      <span class="search-result-type">${label}</span>
    </li>
  `;
}
