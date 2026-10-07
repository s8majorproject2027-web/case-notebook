// db.js — IndexedDB schema, migrations, and CRUD helpers
// DB version history:
//   v1: initial schema

const DB_NAME = 'CaseNotebookDB';
const DB_VERSION = 1;

let _db = null;

// ─── Open / Init ──────────────────────────────────────────────────────────────

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;

      // users
      if (!db.objectStoreNames.contains('users')) {
        const us = db.createObjectStore('users', { keyPath: 'id' });
        us.createIndex('username', 'username', { unique: true });
      }

      // cases
      if (!db.objectStoreNames.contains('cases')) {
        const cs = db.createObjectStore('cases', { keyPath: 'id' });
        cs.createIndex('ownerId', 'ownerId');
        cs.createIndex('caseNumber', 'caseNumber');
      }

      // hearings
      if (!db.objectStoreNames.contains('hearings')) {
        const hs = db.createObjectStore('hearings', { keyPath: 'id' });
        hs.createIndex('caseId', 'caseId');
        hs.createIndex('ownerId', 'ownerId');
        hs.createIndex('date', 'date');
      }

      // notebooks
      if (!db.objectStoreNames.contains('notebooks')) {
        const nb = db.createObjectStore('notebooks', { keyPath: 'id' });
        nb.createIndex('caseId', 'caseId', { unique: true });
        nb.createIndex('ownerId', 'ownerId');
      }

      // chapters
      if (!db.objectStoreNames.contains('chapters')) {
        const ch = db.createObjectStore('chapters', { keyPath: 'id' });
        ch.createIndex('notebookId', 'notebookId');
        ch.createIndex('caseId', 'caseId');
        ch.createIndex('ownerId', 'ownerId');
        ch.createIndex('order', 'order');
      }

      // notes
      if (!db.objectStoreNames.contains('notes')) {
        const no = db.createObjectStore('notes', { keyPath: 'id' });
        no.createIndex('chapterId', 'chapterId');
        no.createIndex('caseId', 'caseId');
        no.createIndex('ownerId', 'ownerId');
        no.createIndex('updatedAt', 'updatedAt');
      }

      // noteVersions
      if (!db.objectStoreNames.contains('noteVersions')) {
        const nv = db.createObjectStore('noteVersions', { keyPath: 'id' });
        nv.createIndex('noteId', 'noteId');
        nv.createIndex('savedAt', 'savedAt');
      }

      // attachments
      if (!db.objectStoreNames.contains('attachments')) {
        const at = db.createObjectStore('attachments', { keyPath: 'id' });
        at.createIndex('caseId', 'caseId');
        at.createIndex('chapterId', 'chapterId');
        at.createIndex('noteId', 'noteId');
        at.createIndex('ownerId', 'ownerId');
      }

      // tasks
      if (!db.objectStoreNames.contains('tasks')) {
        const tk = db.createObjectStore('tasks', { keyPath: 'id' });
        tk.createIndex('caseId', 'caseId');
        tk.createIndex('noteId', 'noteId');
        tk.createIndex('ownerId', 'ownerId');
        tk.createIndex('dueDate', 'dueDate');
        tk.createIndex('status', 'status');
      }

      // timelineEvents
      if (!db.objectStoreNames.contains('timelineEvents')) {
        const tl = db.createObjectStore('timelineEvents', { keyPath: 'id' });
        tl.createIndex('caseId', 'caseId');
        tl.createIndex('ownerId', 'ownerId');
        tl.createIndex('date', 'date');
      }

      // hearingLinks
      if (!db.objectStoreNames.contains('hearingLinks')) {
        const hl = db.createObjectStore('hearingLinks', { keyPath: 'id' });
        hl.createIndex('caseId', 'caseId');
        hl.createIndex('hearingId', 'hearingId');
        hl.createIndex('noteId', 'noteId');
        hl.createIndex('chapterId', 'chapterId');
      }
    };

    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

function tx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function req2p(r) {
  return new Promise((res, rej) => { r.onsuccess = e => res(e.target.result); r.onerror = e => rej(e.target.error); });
}

function cursorAll(store, indexName, key) {
  return new Promise((res, rej) => {
    const results = [];
    const idx = indexName ? store.index(indexName) : store;
    const req = key !== undefined ? idx.openCursor(IDBKeyRange.only(key)) : idx.openCursor();
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) { results.push(cursor.value); cursor.continue(); }
      else res(results);
    };
    req.onerror = e => rej(e.target.error);
  });
}

// ─── Auth helpers ──────────────────────────────────────────────────────────

export async function createUser(user) {
  return req2p(tx('users', 'readwrite').add(user));
}
export async function getUserByUsername(username) {
  return req2p(tx('users').index('username').get(username));
}
export async function getUser(id) {
  return req2p(tx('users').get(id));
}

// ─── Cases ────────────────────────────────────────────────────────────────────

export async function createCase(caseObj) {
  return req2p(tx('cases', 'readwrite').add(caseObj));
}
export async function updateCase(caseObj) {
  return req2p(tx('cases', 'readwrite').put(caseObj));
}
export async function getCasesByOwner(ownerId) {
  return cursorAll(tx('cases'), 'ownerId', ownerId);
}
export async function getCase(id) {
  return req2p(tx('cases').get(id));
}
export async function deleteCase(id, ownerId) {
  const c = await getCase(id);
  if (!c || c.ownerId !== ownerId) throw new Error('Unauthorized');
  // cascade delete in a transaction
  const stores = ['hearings','notebooks','chapters','notes','noteVersions','attachments','tasks','timelineEvents','hearingLinks'];
  const txn = _db.transaction(['cases', ...stores], 'readwrite');
  txn.objectStore('cases').delete(id);
  // delete by caseId index for each store
  for (const sName of stores) {
    const store = txn.objectStore(sName);
    const hasIndex = store.indexNames.contains('caseId');
    if (hasIndex) {
      const idx = store.index('caseId');
      const req = idx.openCursor(IDBKeyRange.only(id));
      req.onsuccess = e => { const cur = e.target.result; if (cur) { cur.delete(); cur.continue(); } };
    }
  }
  return new Promise((res, rej) => { txn.oncomplete = res; txn.onerror = e => rej(e.target.error); });
}

// ─── Hearings ─────────────────────────────────────────────────────────────────

export async function createHearing(h) { return req2p(tx('hearings', 'readwrite').add(h)); }
export async function updateHearing(h) { return req2p(tx('hearings', 'readwrite').put(h)); }
export async function getHearing(id) { return req2p(tx('hearings').get(id)); }
export async function getHearingsByCase(caseId) {
  const all = await cursorAll(tx('hearings'), 'caseId', caseId);
  return all.sort((a, b) => new Date(a.date) - new Date(b.date));
}
export async function deleteHearing(id) { return req2p(tx('hearings', 'readwrite').delete(id)); }

// ─── Notebooks ────────────────────────────────────────────────────────────────

export async function createNotebook(nb) { return req2p(tx('notebooks', 'readwrite').add(nb)); }
export async function getNotebookByCaseId(caseId) { return req2p(tx('notebooks').index('caseId').get(caseId)); }
export async function getNotebook(id) { return req2p(tx('notebooks').get(id)); }

// ─── Chapters ─────────────────────────────────────────────────────────────────

export async function createChapter(ch) { return req2p(tx('chapters', 'readwrite').add(ch)); }
export async function updateChapter(ch) { return req2p(tx('chapters', 'readwrite').put(ch)); }
export async function getChaptersByNotebook(notebookId) {
  const all = await cursorAll(tx('chapters'), 'notebookId', notebookId);
  return all.sort((a, b) => a.order - b.order);
}
export async function getChapter(id) { return req2p(tx('chapters').get(id)); }
export async function deleteChapter(id, ownerId) {
  const ch = await getChapter(id);
  if (!ch || ch.ownerId !== ownerId) throw new Error('Unauthorized');
  // delete chapter notes, attachments
  const notes = await getNotesByChapter(id);
  for (const n of notes) await deleteNote(n.id, ownerId);
  const atts = await cursorAll(tx('attachments'), 'chapterId', id);
  for (const a of atts) await req2p(tx('attachments', 'readwrite').delete(a.id));
  return req2p(tx('chapters', 'readwrite').delete(id));
}
export async function reorderChapters(chapters) {
  const store = tx('chapters', 'readwrite');
  for (const ch of chapters) { store.put(ch); }
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function createNote(note) { return req2p(tx('notes', 'readwrite').add(note)); }
export async function updateNote(note) { return req2p(tx('notes', 'readwrite').put(note)); }
export async function getNote(id) { return req2p(tx('notes').get(id)); }
export async function getNotesByChapter(chapterId) {
  const all = await cursorAll(tx('notes'), 'chapterId', chapterId);
  return all.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}
export async function getNotesByCase(caseId) {
  return cursorAll(tx('notes'), 'caseId', caseId);
}
export async function deleteNote(id, ownerId) {
  const n = await getNote(id);
  if (!n || n.ownerId !== ownerId) throw new Error('Unauthorized');
  // delete versions
  const vers = await cursorAll(tx('noteVersions'), 'noteId', id);
  for (const v of vers) await req2p(tx('noteVersions', 'readwrite').delete(v.id));
  // delete attachments linked to this note
  const atts = await cursorAll(tx('attachments'), 'noteId', id);
  for (const a of atts) await req2p(tx('attachments', 'readwrite').delete(a.id));
  return req2p(tx('notes', 'readwrite').delete(id));
}

// ─── NoteVersions ─────────────────────────────────────────────────────────────

export async function createNoteVersion(v) { return req2p(tx('noteVersions', 'readwrite').add(v)); }
export async function getVersionsByNote(noteId) {
  const all = await cursorAll(tx('noteVersions'), 'noteId', noteId);
  return all.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}
export async function pruneVersions(noteId, maxVersions) {
  const vers = await getVersionsByNote(noteId);
  if (vers.length > maxVersions) {
    const toDelete = vers.slice(maxVersions);
    for (const v of toDelete) await req2p(tx('noteVersions', 'readwrite').delete(v.id));
  }
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export async function createAttachment(a) { return req2p(tx('attachments', 'readwrite').add(a)); }
export async function getAttachment(id) { return req2p(tx('attachments').get(id)); }
export async function getAttachmentsByCase(caseId) { return cursorAll(tx('attachments'), 'caseId', caseId); }
export async function getAttachmentsByNote(noteId) { return cursorAll(tx('attachments'), 'noteId', noteId); }
export async function getAttachmentsByChapter(chapterId) { return cursorAll(tx('attachments'), 'chapterId', chapterId); }
export async function deleteAttachment(id, ownerId) {
  const a = await getAttachment(id);
  if (!a || a.ownerId !== ownerId) throw new Error('Unauthorized');
  return req2p(tx('attachments', 'readwrite').delete(id));
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function createTask(t) { return req2p(tx('tasks', 'readwrite').add(t)); }
export async function updateTask(t) { return req2p(tx('tasks', 'readwrite').put(t)); }
export async function getTask(id) { return req2p(tx('tasks').get(id)); }
export async function getTasksByCase(caseId) {
  const all = await cursorAll(tx('tasks'), 'caseId', caseId);
  return all.sort((a, b) => {
    if (a.status === 'Completed' && b.status !== 'Completed') return 1;
    if (b.status === 'Completed' && a.status !== 'Completed') return -1;
    return new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999');
  });
}
export async function deleteTask(id, ownerId) {
  const t = await getTask(id);
  if (!t || t.ownerId !== ownerId) throw new Error('Unauthorized');
  return req2p(tx('tasks', 'readwrite').delete(id));
}

// ─── Timeline Events ──────────────────────────────────────────────────────────

export async function createTimelineEvent(ev) { return req2p(tx('timelineEvents', 'readwrite').add(ev)); }
export async function updateTimelineEvent(ev) { return req2p(tx('timelineEvents', 'readwrite').put(ev)); }
export async function getTimelineEvent(id) { return req2p(tx('timelineEvents').get(id)); }
export async function getTimelineByCase(caseId) {
  const all = await cursorAll(tx('timelineEvents'), 'caseId', caseId);
  return all.sort((a, b) => new Date(a.date) - new Date(b.date));
}
export async function deleteTimelineEvent(id, ownerId) {
  const ev = await getTimelineEvent(id);
  if (!ev || ev.ownerId !== ownerId) throw new Error('Unauthorized');
  return req2p(tx('timelineEvents', 'readwrite').delete(id));
}

// ─── Hearing Links ────────────────────────────────────────────────────────────

export async function createHearingLink(hl) { return req2p(tx('hearingLinks', 'readwrite').add(hl)); }
export async function getHearingLinks(hearingId) { return cursorAll(tx('hearingLinks'), 'hearingId', hearingId); }
export async function getHearingLinksByNote(noteId) { return cursorAll(tx('hearingLinks'), 'noteId', noteId); }
export async function deleteHearingLink(id) { return req2p(tx('hearingLinks', 'readwrite').delete(id)); }
export async function getHearingLink(id) { return req2p(tx('hearingLinks').get(id)); }

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getNotebookStats(caseId, ownerId) {
  const [chapters, notes, tasks, attachments, hearings] = await Promise.all([
    cursorAll(tx('chapters'), 'caseId', caseId),
    cursorAll(tx('notes'), 'caseId', caseId),
    cursorAll(tx('tasks'), 'caseId', caseId),
    cursorAll(tx('attachments'), 'caseId', caseId),
    getHearingsByCase(caseId),
  ]);

  const now = new Date();
  const markedNotes = notes.filter(n => n.tags && n.tags.length > 0);
  const pendingTasks = tasks.filter(t => t.status === 'Pending');
  const overdueTasks = pendingTasks.filter(t => t.dueDate && new Date(t.dueDate) < now);
  const upcomingHearings = hearings.filter(h => new Date(h.date) >= now);

  const recentNotes = [...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5);

  return {
    totalChapters: chapters.length,
    totalNotes: notes.length,
    markedPoints: markedNotes.length,
    pendingTasks: pendingTasks.length,
    overdueTasks: overdueTasks.length,
    totalAttachments: attachments.length,
    upcomingHearing: upcomingHearings[0] || null,
    recentNotes,
  };
}

// ─── Full-text search ─────────────────────────────────────────────────────────

export async function searchNotebook(caseId, ownerId, query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.toLowerCase().trim();
  const results = [];

  const [chapters, notes, tasks, timelineEvents, attachments] = await Promise.all([
    cursorAll(tx('chapters'), 'caseId', caseId),
    cursorAll(tx('notes'), 'caseId', caseId),
    cursorAll(tx('tasks'), 'caseId', caseId),
    cursorAll(tx('timelineEvents'), 'caseId', caseId),
    cursorAll(tx('attachments'), 'caseId', caseId),
  ]);

  const chapterMap = Object.fromEntries(chapters.map(c => [c.id, c]));

  for (const ch of chapters) {
    if (ch.title.toLowerCase().includes(q)) {
      results.push({ type: 'chapter', id: ch.id, title: ch.title, snippet: ch.title, chapterId: ch.id, chapterTitle: ch.title });
    }
  }
  for (const n of notes) {
    const plain = stripHtmlSearch(n.contentHtml || '');
    const inTitle = n.title && n.title.toLowerCase().includes(q);
    const inContent = plain.toLowerCase().includes(q);
    const inTags = n.tags && n.tags.some(t => t.toLowerCase().includes(q));
    if (inTitle || inContent || inTags) {
      const snippet = extractSnippet(plain, q);
      const ch = chapterMap[n.chapterId];
      results.push({ type: 'note', id: n.id, title: n.title || 'Untitled Note', snippet, chapterId: n.chapterId, chapterTitle: ch ? ch.title : '' });
    }
  }
  for (const t of tasks) {
    if ((t.title && t.title.toLowerCase().includes(q)) || (t.description && t.description.toLowerCase().includes(q))) {
      results.push({ type: 'task', id: t.id, title: t.title, snippet: t.description || '', chapterId: null, chapterTitle: 'Tasks' });
    }
  }
  for (const ev of timelineEvents) {
    if ((ev.title && ev.title.toLowerCase().includes(q)) || (ev.description && ev.description.toLowerCase().includes(q))) {
      results.push({ type: 'timeline', id: ev.id, title: ev.title, snippet: ev.description || '', chapterId: null, chapterTitle: 'Timeline' });
    }
  }
  for (const a of attachments) {
    if (a.fileName && a.fileName.toLowerCase().includes(q)) {
      const ch = a.chapterId ? chapterMap[a.chapterId] : null;
      results.push({ type: 'attachment', id: a.id, title: a.fileName, snippet: `Attachment in ${ch ? ch.title : 'notebook'}`, chapterId: a.chapterId, chapterTitle: ch ? ch.title : '' });
    }
  }

  return results;
}

function stripHtmlSearch(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || '';
}

function extractSnippet(text, query, length = 120) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, length) + (text.length > length ? '…' : '');
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}
