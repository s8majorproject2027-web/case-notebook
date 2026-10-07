// noteEditor.js — Quill-based rich text editor with autosave, draft fallback, version snapshot

import { updateNote, createNoteVersion, getVersionsByNote, pruneVersions } from '../db.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { uuid, debounce, saveDraft, loadDraft, clearDraft, CONFIG, formatDateTime } from '../utils/helpers.js';
import { SaveIndicator } from './toast.js';

let _quill = null;
let _currentNote = null;
let _isDirty = false;
let _lastVersionSavedAt = 0;
let _onDirtyChange = null;

const DRAFT_KEY = noteId => `note_${noteId}`;

/**
 * Initialise the Quill editor inside `container` for the given note.
 * @param {HTMLElement} container
 * @param {Object} note
 * @param {Function} onDirtyChange - called with (isDirty: bool)
 */
export function initEditor(container, note, onDirtyChange) {
  destroyEditor();
  _currentNote = note;
  _onDirtyChange = onDirtyChange || (() => {});
  _isDirty = false;

  // Check for a local draft (network-failure fallback)
  const draft = loadDraft(DRAFT_KEY(note.id));
  const initialContent = draft ? draft.content : (note.contentHtml || '');

  container.innerHTML = `
    <div class="editor-toolbar-container" id="editor-toolbar">
      <span class="ql-formats">
        <select class="ql-header"><option value="1">H1</option><option value="2">H2</option><option value="3">H3</option><option selected>Normal</option></select>
      </span>
      <span class="ql-formats">
        <button class="ql-bold" title="Bold"></button>
        <button class="ql-italic" title="Italic"></button>
        <button class="ql-underline" title="Underline"></button>
        <button class="ql-strike" title="Strikethrough"></button>
      </span>
      <span class="ql-formats">
        <select class="ql-color"></select>
        <select class="ql-background"></select>
      </span>
      <span class="ql-formats">
        <button class="ql-list" value="ordered" title="Numbered list"></button>
        <button class="ql-list" value="bullet" title="Bullet list"></button>
      </span>
      <span class="ql-formats">
        <button class="ql-link" title="Insert link"></button>
        <button class="ql-blockquote" title="Blockquote"></button>
        <button class="ql-code-block" title="Code block"></button>
      </span>
      <span class="ql-formats">
        <button class="ql-table-insert" title="Insert Table" id="btn-insert-table">⊞</button>
      </span>
      <span class="ql-formats">
        <button class="ql-clean" title="Clear formatting"></button>
      </span>
    </div>
    <div id="quill-editor-body" class="editor-body">${initialContent}</div>
  `;

  if (typeof Quill === 'undefined') {
    container.innerHTML = '<div class="editor-error">Rich text editor failed to load. Please refresh the page.</div>';
    return;
  }

  _quill = new Quill('#quill-editor-body', {
    theme: 'snow',
    modules: {
      toolbar: '#editor-toolbar',
    },
    placeholder: 'Start writing your notes…',
  });

  if (draft) {
    SaveIndicator.failed('Draft restored from local backup (last save may have failed)');
  }

  const _autoSave = debounce(() => _saveNote(false), CONFIG.AUTOSAVE_DELAY_MS);

  _quill.on('text-change', () => {
    _isDirty = true;
    _onDirtyChange(true);
    const content = sanitizeHtml(_quill.root.innerHTML);
    saveDraft(DRAFT_KEY(note.id), { content, savedAt: new Date().toISOString() });
    SaveIndicator.saving();
    _autoSave();
  });

  // Save on blur
  _quill.root.addEventListener('blur', () => {
    if (_isDirty) _saveNote(false);
  });

  // Manual save shortcut Ctrl+S
  _quill.root.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      _saveNote(true);
    }
  });
}

export async function _saveNote(isManual = false) {
  if (!_currentNote || !_quill) return;
  try {
    const content = sanitizeHtml(_quill.root.innerHTML);
    const now = new Date().toISOString();
    _currentNote.contentHtml = content;
    _currentNote.updatedAt = now;
    await updateNote(_currentNote);

    // Version snapshot
    const timeSinceLastVersion = Date.now() - _lastVersionSavedAt;
    if (isManual || timeSinceLastVersion >= CONFIG.VERSION_THROTTLE_MS) {
      await createNoteVersion({
        id: uuid(),
        noteId: _currentNote.id,
        contentHtml: content,
        savedAt: now,
        savedBy: _currentNote.ownerId,
        isManual,
      });
      await pruneVersions(_currentNote.id, CONFIG.MAX_VERSIONS);
      _lastVersionSavedAt = Date.now();
    }

    clearDraft(DRAFT_KEY(_currentNote.id));
    _isDirty = false;
    _onDirtyChange(false);
    SaveIndicator.saved();
  } catch (err) {
    SaveIndicator.failed('Failed to save — draft kept locally');
    console.error('[NoteEditor] Save failed:', err);
  }
}

export function saveNow() {
  return _saveNote(true);
}

export function destroyEditor() {
  if (_quill) {
    _quill = null;
  }
  _currentNote = null;
  _isDirty = false;
}

export function isDirty() {
  return _isDirty;
}

export function getContent() {
  return _quill ? sanitizeHtml(_quill.root.innerHTML) : '';
}

export function setContent(html) {
  if (_quill) {
    _quill.root.innerHTML = sanitizeHtml(html);
  }
}
