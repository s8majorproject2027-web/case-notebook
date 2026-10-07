// notebook.js — main notebook page combining chapters, notes editor, and side panels

import { Auth } from '../auth.js';
import { getNotebookByCaseId, createNotebook, getCase, getNotesByChapter, createNote, deleteNote } from '../db.js';
import { Router } from '../router.js';
import { uuid, escapeHtml, formatDate } from '../utils/helpers.js';

// Components
import { renderNotebookHeader } from '../components/notebookHeader.js';
import { renderChapterList, createDefaultChapters } from '../components/chapterList.js';
import { initEditor, destroyEditor, isDirty, saveNow, getContent, setContent } from '../components/noteEditor.js';
import { renderAttachments } from '../components/attachments.js';
import { renderTasks } from '../components/tasks.js';
import { renderTimeline } from '../components/timeline.js';
import { renderMarkedPoints, renderTagSelector } from '../components/markedPoints.js';
import { renderVersionHistory } from '../components/versionHistory.js';
import { renderSearch } from '../components/search.js';
import { renderHearingLinkPanel } from '../components/hearingLink.js';
import { showConfirm } from '../components/modal.js';
import { showToast } from '../components/toast.js';

let _currentCaseId = null;
let _currentNotebook = null;
let _currentChapterId = null;
let _currentNoteId = null;
let _notesList = [];

export async function renderNotebook(el, { caseId }) {
  const user = Auth.requireAuth();
  if (!user) return;

  _currentCaseId = caseId;
  const caseData = await getCase(caseId);

  if (!caseData || caseData.ownerId !== user.id) {
    el.innerHTML = `<div class="error-page">Case not found or access denied.</div>`;
    return;
  }

  // Ensure Notebook exists
  let notebook = await getNotebookByCaseId(caseId);
  if (!notebook) {
    notebook = { id: uuid(), caseId, ownerId: user.id, createdAt: new Date().toISOString() };
    await createNotebook(notebook);
    await createDefaultChapters(notebook);
  }
  _currentNotebook = notebook;

  el.innerHTML = `
    <div class="notebook-layout">
      <!-- Search Overlay -->
      <div class="notebook-search-container" id="nb-search-container"></div>

      <!-- Header -->
      <header class="notebook-header-wrapper" id="nb-header"></header>

      <div class="notebook-body">
        <!-- Left Sidebar: Chapters -->
        <aside class="notebook-sidebar notebook-sidebar-left" id="nb-chapters"></aside>

        <!-- Main Content Area: Notes List + Editor -->
        <main class="notebook-main">
          <!-- Notes List for current chapter -->
          <div class="notes-list-pane" id="nb-notes-list-pane" hidden>
             <div class="pane-header">
                <span class="pane-title" id="pane-chapter-title">Notes</span>
                <button class="btn btn-sm btn-primary" id="btn-add-note">+ Note</button>
             </div>
             <div class="notes-list" id="nb-notes-list"></div>
          </div>

          <!-- Note Editor Area -->
          <div class="note-editor-pane" id="nb-editor-pane" hidden>
            <div class="editor-top-bar">
              <input type="text" id="note-title-input" class="note-title-input" placeholder="Note Title">
              <div class="editor-actions">
                 <button class="btn btn-sm btn-ghost" id="btn-note-settings" title="Tags & Hearings">⚙️ Options</button>
                 <button class="btn btn-sm btn-danger-outline" id="btn-delete-note" title="Delete Note">🗑</button>
              </div>
            </div>
            <div class="note-tags-container" id="note-tags-container" hidden></div>
            <div class="editor-wrapper" id="nb-editor-container"></div>
          </div>

          <!-- Empty State (No Chapter/Note selected) -->
          <div class="notebook-empty-state" id="nb-empty-state">
            <div class="empty-icon">📝</div>
            <h3>Select a Chapter</h3>
            <p>Choose a chapter from the sidebar to view or create notes.</p>
          </div>
        </main>

        <!-- Right Sidebar: Tabs for Details, Attachments, Tasks, Timeline, Marked, Versions -->
        <aside class="notebook-sidebar notebook-sidebar-right">
          <div class="sidebar-tabs">
            <button class="tab-btn active" data-tab="marked" title="Marked Points">🔖</button>
            <button class="tab-btn" data-tab="attachments" title="Attachments">📎</button>
            <button class="tab-btn" data-tab="tasks" title="Tasks">✅</button>
            <button class="tab-btn" data-tab="timeline" title="Timeline">🗓</button>
            <button class="tab-btn" data-tab="history" title="History" id="tab-history" hidden>🕐</button>
          </div>
          <div class="sidebar-tab-content" id="nb-right-panel"></div>
        </aside>
      </div>
    </div>
  `;

  // Init Header & Search
  await renderNotebookHeader(el.querySelector('#nb-header'), caseId);
  renderSearch(el.querySelector('#nb-search-container'), notebook, (result) => handleSearchResult(result));

  // Init Left Sidebar (Chapters)
  await renderChapterList(el.querySelector('#nb-chapters'), notebook, null, handleChapterSelect);

  // Init Right Sidebar Tabs
  const rightTabs = el.querySelectorAll('.tab-btn');
  const rightPanel = el.querySelector('#nb-right-panel');
  rightTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      rightTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderRightPanel(btn.dataset.tab, rightPanel);
    });
  });

  // Default active right tab
  renderRightPanel('marked', rightPanel);

  // Notes List Actions
  el.querySelector('#btn-add-note').addEventListener('click', createNewNote);
  el.querySelector('#nb-notes-list').addEventListener('click', e => {
    const item = e.target.closest('.note-list-item');
    if (item) selectNote(item.dataset.id);
  });

  // Editor Actions
  const titleInput = el.querySelector('#note-title-input');
  titleInput.addEventListener('blur', () => {
    if (_currentNoteId) {
      const note = _notesList.find(n => n.id === _currentNoteId);
      if (note && note.title !== titleInput.value) {
        note.title = titleInput.value;
        saveNow(); // force save
        refreshNotesList(); // update title in list
      }
    }
  });

  el.querySelector('#btn-delete-note').addEventListener('click', async () => {
    if (!_currentNoteId) return;
    const ok = await showConfirm({ title: 'Delete Note', message: 'Delete this note and its history? This cannot be undone.', danger: true });
    if (ok) {
      await deleteNote(_currentNoteId, user.id);
      showToast('Note deleted', 'info');
      _currentNoteId = null;
      handleChapterSelect(_currentChapterId); // refresh
    }
  });

  const tagsContainer = el.querySelector('#note-tags-container');
  el.querySelector('#btn-note-settings').addEventListener('click', () => {
    tagsContainer.hidden = !tagsContainer.hidden;
  });

  // Prevent navigation if dirty
  Router.beforeEach((pattern, params) => {
    if (isDirty()) {
      const leave = window.confirm('You have unsaved changes. Leave anyway?');
      if (!leave) return false;
      destroyEditor();
    } else {
      destroyEditor();
    }
    return true;
  });

  window.addEventListener('beforeunload', beforeUnloadHandler);
}

function beforeUnloadHandler(e) {
  if (isDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
}

// ─── Event Handlers ────────────────────────────────────────────────────────────

async function handleChapterSelect(chapterId) {
  if (isDirty()) {
    const ok = confirm('You have unsaved changes. Discard and switch chapter?');
    if (!ok) return;
  }

  _currentChapterId = chapterId;
  _currentNoteId = null;
  destroyEditor();

  const emptyState = document.querySelector('#nb-empty-state');
  const notesPane = document.querySelector('#nb-notes-list-pane');
  const editorPane = document.querySelector('#nb-editor-pane');

  if (!chapterId) {
    emptyState.hidden = false;
    notesPane.hidden = true;
    editorPane.hidden = true;
    return;
  }

  emptyState.hidden = true;
  notesPane.hidden = false;
  editorPane.hidden = true;

  await refreshNotesList();

  // Auto-select first note or create one if empty
  if (_notesList.length > 0) {
    selectNote(_notesList[0].id);
  } else {
    // optionally prompt or auto-create. let's auto-create for better UX
    await createNewNote();
  }
}

async function refreshNotesList() {
  if (!_currentChapterId) return;
  _notesList = await getNotesByChapter(_currentChapterId);
  const listEl = document.querySelector('#nb-notes-list');

  listEl.innerHTML = _notesList.map(n => `
    <div class="note-list-item ${_currentNoteId === n.id ? 'active' : ''}" data-id="${n.id}">
      <div class="note-list-title">${escapeHtml(n.title || 'Untitled Note')}</div>
      <div class="note-list-meta">${formatDate(n.updatedAt)}</div>
    </div>
  `).join('');
}

async function createNewNote() {
  if (!_currentChapterId || !_currentNotebook) return;
  if (isDirty()) {
    if (!confirm('You have unsaved changes. Discard and create new note?')) return;
  }

  const note = {
    id: uuid(),
    chapterId: _currentChapterId,
    caseId: _currentCaseId,
    ownerId: _currentNotebook.ownerId,
    title: 'New Note',
    contentHtml: '',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await createNote(note);
  await refreshNotesList();
  selectNote(note.id);
}

async function selectNote(noteId) {
  if (isDirty()) {
    if (!confirm('You have unsaved changes. Discard and switch note?')) return;
  }

  _currentNoteId = noteId;
  const note = _notesList.find(n => n.id === noteId);
  if (!note) return;

  // Update UI selection
  document.querySelectorAll('.note-list-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === noteId);
  });

  const editorPane = document.querySelector('#nb-editor-pane');
  editorPane.hidden = false;

  document.querySelector('#note-title-input').value = note.title || '';

  // Tags
  const tagsContainer = document.querySelector('#note-tags-container');
  tagsContainer.hidden = true; // hide by default until options clicked
  renderTagSelector(tagsContainer, note.tags || [], (newTags) => {
    note.tags = newTags;
    saveNow(); // auto save on tag change
  });

  // Init Quill Editor
  const editorContainer = document.querySelector('#nb-editor-container');
  initEditor(editorContainer, note, (dirty) => {
    // update list item asterisk
    const item = document.querySelector(`.note-list-item[data-id="${note.id}"] .note-list-title`);
    if (item) {
      item.textContent = (note.title || 'Untitled Note') + (dirty ? ' *' : '');
    }
  });

  // Show history tab if we have a note
  document.querySelector('#tab-history').hidden = false;

  // Refresh active right panel to reflect new note context
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  if (activeTab) renderRightPanel(activeTab, document.querySelector('#nb-right-panel'));
}

async function renderRightPanel(tab, container) {
  container.innerHTML = '<div class="pane-loading">Loading…</div>';
  if (!_currentNotebook) return;

  const context = {
    caseId: _currentCaseId,
    ownerId: _currentNotebook.ownerId,
    chapterId: _currentChapterId,
    noteId: _currentNoteId
  };

  switch (tab) {
    case 'marked':
      await renderMarkedPoints(container, _currentNotebook, (noteId, chapterId) => {
         // Cross-navigation
         if (chapterId !== _currentChapterId) handleChapterSelect(chapterId).then(() => selectNote(noteId));
         else selectNote(noteId);
      });
      break;
    case 'attachments':
      await renderAttachments(container, context);
      break;
    case 'tasks':
      await renderTasks(container, context.caseId, context.ownerId, context.noteId);
      break;
    case 'timeline':
      await renderTimeline(container, context.caseId, context.ownerId);
      break;
    case 'history':
      if (context.noteId) {
        const note = _notesList.find(n => n.id === context.noteId);
        await renderVersionHistory(container, note, async (contentHtml) => {
          setContent(contentHtml);
          await saveNow();
        });
      } else {
        container.innerHTML = '<p class="empty-state-sm">Select a note to view history.</p>';
      }
      break;
  }
}

async function handleSearchResult(hit) {
  if (hit.chapterId) {
    if (_currentChapterId !== hit.chapterId) {
      await handleChapterSelect(hit.chapterId);
    }
    if (hit.type === 'note') {
      selectNote(hit.id);
    }
  }
  // Focus right panel if needed
  if (hit.type === 'task') document.querySelector('[data-tab="tasks"]').click();
  if (hit.type === 'timeline') document.querySelector('[data-tab="timeline"]').click();
  if (hit.type === 'attachment') document.querySelector('[data-tab="attachments"]').click();
}
