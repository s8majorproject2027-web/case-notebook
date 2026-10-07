// tasks.js — case-linked tasks with CRUD, priority, overdue highlight, toggle completion

import { createTask, updateTask, deleteTask, getTasksByCase } from '../db.js';
import { uuid, formatDate, isOverdue, escapeHtml } from '../utils/helpers.js';
import { showConfirm } from './modal.js';
import { showToast } from './toast.js';

const PRIORITIES = ['Low', 'Medium', 'High'];
const PRIORITY_CLASS = { Low: 'priority-low', Medium: 'priority-medium', High: 'priority-high' };
const PRIORITY_ICON = { Low: '🔵', Medium: '🟡', High: '🔴' };

export async function renderTasks(container, caseId, ownerId, noteId = null) {
  const tasks = await getTasksByCase(caseId);
  const filtered = noteId ? tasks.filter(t => t.noteId === noteId || !t.noteId) : tasks;

  container.innerHTML = `
    <div class="tasks-panel">
      <div class="panel-header">
        <span class="panel-section-title">✅ Tasks & Follow-ups</span>
        <button class="btn btn-sm btn-primary" id="btn-add-task">+ Add Task</button>
      </div>
      <div class="tasks-list" id="tasks-list">
        ${filtered.length === 0
          ? '<p class="empty-state-sm">No tasks yet. Click <strong>+ Add Task</strong> to create one.</p>'
          : filtered.map(t => taskItem(t)).join('')
        }
      </div>
    </div>
  `;

  container.querySelector('#btn-add-task').addEventListener('click', () => showTaskForm(container, caseId, ownerId, noteId, null, () => renderTasks(container, caseId, ownerId, noteId)));

  const list = container.querySelector('#tasks-list');
  list.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const taskId = btn.dataset.id;
    const task = filtered.find(t => t.id === taskId);
    if (!task) return;

    if (btn.dataset.action === 'toggle') {
      task.status = task.status === 'Completed' ? 'Pending' : 'Completed';
      await updateTask(task);
      await renderTasks(container, caseId, ownerId, noteId);
    }
    if (btn.dataset.action === 'edit') {
      showTaskForm(container, caseId, ownerId, noteId, task, () => renderTasks(container, caseId, ownerId, noteId));
    }
    if (btn.dataset.action === 'delete') {
      const ok = await showConfirm({ title: 'Delete Task', message: `Delete "<strong>${task.title}</strong>"?`, confirmText: 'Delete' });
      if (ok) {
        await deleteTask(taskId, ownerId);
        showToast('Task deleted', 'info');
        await renderTasks(container, caseId, ownerId, noteId);
      }
    }
  });
}

function taskItem(t) {
  const overdue = t.status === 'Pending' && isOverdue(t.dueDate);
  const done = t.status === 'Completed';
  return `
    <div class="task-item ${done ? 'task-done' : ''} ${overdue ? 'task-overdue' : ''}" data-id="${t.id}">
      <button class="task-toggle btn-icon" data-action="toggle" data-id="${t.id}" title="${done ? 'Mark pending' : 'Mark complete'}" aria-label="${done ? 'Mark pending' : 'Mark complete'}">
        ${done ? '☑' : '☐'}
      </button>
      <div class="task-body">
        <div class="task-title ${done ? 'task-title-done' : ''}">${escapeHtml(t.title)}</div>
        ${t.description ? `<div class="task-desc">${escapeHtml(t.description)}</div>` : ''}
        <div class="task-meta">
          <span class="priority-badge ${PRIORITY_CLASS[t.priority]}">${PRIORITY_ICON[t.priority]} ${t.priority}</span>
          ${t.dueDate ? `<span class="task-due ${overdue ? 'overdue-text' : ''}">${overdue ? '⚠ Overdue · ' : ''}Due: ${formatDate(t.dueDate)}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn" data-action="edit" data-id="${t.id}" title="Edit task" aria-label="Edit task">✎</button>
        <button class="icon-btn icon-btn-danger" data-action="delete" data-id="${t.id}" title="Delete task" aria-label="Delete task">🗑</button>
      </div>
    </div>
  `;
}

function showTaskForm(container, caseId, ownerId, noteId, existing, onSave) {
  const formEl = document.createElement('div');
  formEl.innerHTML = `
    <form id="task-form" class="task-form">
      <div class="form-group">
        <label for="tf-title">Title *</label>
        <input id="tf-title" type="text" class="form-input" placeholder="Task title" value="${escapeHtml(existing?.title || '')}" required>
      </div>
      <div class="form-group">
        <label for="tf-desc">Description</label>
        <textarea id="tf-desc" class="form-input" rows="2" placeholder="Optional description">${escapeHtml(existing?.description || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="tf-due">Due Date</label>
          <input id="tf-due" type="date" class="form-input" value="${existing?.dueDate || ''}">
        </div>
        <div class="form-group">
          <label for="tf-priority">Priority</label>
          <select id="tf-priority" class="form-input">
            ${PRIORITIES.map(p => `<option value="${p}" ${(existing?.priority || 'Medium') === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
    </form>
  `;

  const { showModal } = require('./modal.js'); // dynamic inline require-equivalent via import
  // Since we're using ES modules we import at top; use showModal from modal.js
  import('./modal.js').then(({ showModal }) => {
    showModal({
      title: existing ? 'Edit Task' : 'Add Task',
      body: formEl,
      confirmText: existing ? 'Save' : 'Add Task',
      danger: false,
      onConfirm: async () => {
        const title = formEl.querySelector('#tf-title').value.trim();
        if (!title) { showToast('Task title is required', 'error'); return; }
        const task = {
          id: existing?.id || uuid(),
          caseId,
          noteId: noteId || null,
          ownerId,
          title,
          description: formEl.querySelector('#tf-desc').value.trim(),
          dueDate: formEl.querySelector('#tf-due').value || null,
          priority: formEl.querySelector('#tf-priority').value,
          status: existing?.status || 'Pending',
          createdAt: existing?.createdAt || new Date().toISOString(),
        };
        if (existing) await updateTask(task);
        else await createTask(task);
        showToast(existing ? 'Task updated' : 'Task added', 'success');
        if (onSave) onSave();
      },
    });
  });
}
