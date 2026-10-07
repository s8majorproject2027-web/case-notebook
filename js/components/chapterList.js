// chapterList.js — sidebar chapter list with drag-to-reorder (SortableJS)

import { getChaptersByNotebook, createChapter, updateChapter, deleteChapter, reorderChapters, getNotesByChapter } from '../db.js';
import { uuid, escapeHtml } from '../utils/helpers.js';
import { showConfirm } from './modal.js';
import { showToast } from './toast.js';

const DEFAULT_CHAPTERS = ['Case Background', 'Facts', 'Arguments', 'Evidence', 'Orders', 'Hearing Notes'];

let _onSelectChapter = null;
let _selectedChapterId = null;
let _notebook = null;
let _sortable = null;

export async function renderChapterList(container, notebook, selectedChapterId, onSelectChapter) {
  _notebook = notebook;
  _onSelectChapter = onSelectChapter;
  _selectedChapterId = selectedChapterId;

  const chapters = await getChaptersByNotebook(notebook.id);
  container.innerHTML = `
    <div class="chapter-list-header">
      <span class="chapter-list-title">Chapters</span>
      <button class="btn btn-icon btn-primary" id="btn-add-chapter" title="Add Chapter" aria-label="Add Chapter">+</button>
    </div>
    <ul class="chapter-list" id="chapter-list-ul" role="listbox" aria-label="Notebook chapters">
      ${chapters.map(ch => chapterItem(ch, ch.id === selectedChapterId)).join('')}
    </ul>
  `;

  if (chapters.length === 0) {
    container.querySelector('#chapter-list-ul').innerHTML = `<li class="chapter-empty">No chapters yet.<br>Click <strong>+</strong> to add one.</li>`;
  }

  // Drag to reorder
  const listEl = container.querySelector('#chapter-list-ul');
  if (typeof Sortable !== 'undefined' && chapters.length > 0) {
    if (_sortable) _sortable.destroy();
    _sortable = Sortable.create(listEl, {
      animation: 180,
      ghostClass: 'chapter-drag-ghost',
      chosenClass: 'chapter-drag-chosen',
      handle: '.chapter-drag-handle',
      onEnd: async () => {
        const items = [...listEl.querySelectorAll('.chapter-item')];
        const reordered = items.map((el, idx) => ({ id: el.dataset.id, order: idx }));
        const updated = chapters.map(ch => {
          const r = reordered.find(r => r.id === ch.id);
          return r ? { ...ch, order: r.order } : ch;
        });
        await reorderChapters(updated);
      },
    });
  }

  // Add chapter
  container.querySelector('#btn-add-chapter').addEventListener('click', () => promptAddChapter(container, notebook, onSelectChapter));

  // Click on chapter
  listEl.addEventListener('click', e => {
    const item = e.target.closest('.chapter-item');
    if (!item) return;
    if (e.target.closest('.chapter-rename-btn')) { startRename(item, chapters, container, notebook, onSelectChapter); return; }
    if (e.target.closest('.chapter-delete-btn')) { confirmDeleteChapter(item.dataset.id, container, notebook, onSelectChapter); return; }
    selectChapter(item.dataset.id, onSelectChapter);
  });
}

function chapterItem(ch, isSelected) {
  return `
    <li class="chapter-item ${isSelected ? 'chapter-selected' : ''}" data-id="${ch.id}" role="option" aria-selected="${isSelected}" tabindex="0">
      <span class="chapter-drag-handle" title="Drag to reorder" aria-hidden="true">⠿</span>
      <span class="chapter-title-text">${escapeHtml(ch.title)}</span>
      <span class="chapter-actions">
        <button class="chapter-rename-btn icon-btn" title="Rename" aria-label="Rename chapter">✎</button>
        <button class="chapter-delete-btn icon-btn icon-btn-danger" title="Delete" aria-label="Delete chapter">🗑</button>
      </span>
    </li>
  `;
}

function selectChapter(chapterId, onSelectChapter) {
  _selectedChapterId = chapterId;
  document.querySelectorAll('.chapter-item').forEach(el => {
    const sel = el.dataset.id === chapterId;
    el.classList.toggle('chapter-selected', sel);
    el.setAttribute('aria-selected', sel);
  });
  if (onSelectChapter) onSelectChapter(chapterId);
}

async function promptAddChapter(container, notebook, onSelectChapter) {
  const title = prompt('Chapter name:', '');
  if (!title || !title.trim()) return;
  const chapters = await getChaptersByNotebook(notebook.id);
  const chapter = {
    id: uuid(),
    notebookId: notebook.id,
    caseId: notebook.caseId,
    ownerId: notebook.ownerId,
    title: title.trim(),
    order: chapters.length,
    createdAt: new Date().toISOString(),
  };
  await createChapter(chapter);
  await renderChapterList(container, notebook, chapter.id, onSelectChapter);
  selectChapter(chapter.id, onSelectChapter);
  showToast('Chapter added', 'success');
}

async function startRename(item, chapters, container, notebook, onSelectChapter) {
  const chId = item.dataset.id;
  const ch = chapters.find(c => c.id === chId);
  if (!ch) return;
  const titleEl = item.querySelector('.chapter-title-text');
  const oldTitle = ch.title;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = oldTitle;
  input.className = 'chapter-rename-input';
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const save = async () => {
    const newTitle = input.value.trim() || oldTitle;
    await updateChapter({ ...ch, title: newTitle });
    await renderChapterList(container, notebook, chId, onSelectChapter);
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { input.value = oldTitle; save(); }
  });
}

async function confirmDeleteChapter(chapterId, container, notebook, onSelectChapter) {
  const notes = await getNotesByChapter(chapterId);
  const noteCount = notes.length;
  const confirmed = await showConfirm({
    title: 'Delete Chapter',
    message: `This will permanently delete this chapter${noteCount > 0 ? ` and its <strong>${noteCount} note(s)</strong>` : ''}. This cannot be undone.`,
    confirmText: 'Delete Chapter',
    danger: true,
  });
  if (!confirmed) return;
  await deleteChapter(chapterId, notebook.ownerId);
  await renderChapterList(container, notebook, null, onSelectChapter);
  if (onSelectChapter) onSelectChapter(null);
  showToast('Chapter deleted', 'info');
}

export async function createDefaultChapters(notebook) {
  for (let i = 0; i < DEFAULT_CHAPTERS.length; i++) {
    await createChapter({
      id: uuid(),
      notebookId: notebook.id,
      caseId: notebook.caseId,
      ownerId: notebook.ownerId,
      title: DEFAULT_CHAPTERS[i],
      order: i,
      createdAt: new Date().toISOString(),
    });
  }
}
