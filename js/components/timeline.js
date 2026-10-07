// timeline.js — vertical case timeline with CRUD and visual rendering

import { createTimelineEvent, updateTimelineEvent, deleteTimelineEvent, getTimelineByCase } from '../db.js';
import { uuid, formatDate, escapeHtml } from '../utils/helpers.js';
import { showConfirm } from './modal.js';
import { showToast } from './toast.js';

const EVENT_TYPES = ['Filing', 'Notice', 'Counter', 'Hearing', 'Order', 'Next Hearing', 'Other'];
const TYPE_COLORS = {
  Filing: '#4f7af8', Notice: '#f59e0b', Counter: '#8b5cf6',
  Hearing: '#22c55e', Order: '#ef4444', 'Next Hearing': '#06b6d4', Other: '#9da3b4'
};
const TYPE_ICONS = {
  Filing: '📁', Notice: '📢', Counter: '↩️', Hearing: '⚖️',
  Order: '📋', 'Next Hearing': '📅', Other: '🔹'
};

export async function renderTimeline(container, caseId, ownerId) {
  const events = await getTimelineByCase(caseId);

  container.innerHTML = `
    <div class="timeline-panel">
      <div class="panel-header">
        <span class="panel-section-title">🗓 Case Timeline</span>
        <button class="btn btn-sm btn-primary" id="btn-add-event">+ Add Event</button>
      </div>
      ${events.length === 0
        ? '<p class="empty-state-sm">No timeline events. Click <strong>+ Add Event</strong> to begin.</p>'
        : `<div class="timeline-list">${events.map((ev, i) => timelineItem(ev, i === events.length - 1)).join('')}</div>`
      }
    </div>
  `;

  container.querySelector('#btn-add-event').addEventListener('click', () =>
    showEventForm(container, caseId, ownerId, null, () => renderTimeline(container, caseId, ownerId))
  );

  container.querySelectorAll('[data-action="edit-event"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ev = events.find(e => e.id === btn.dataset.id);
      if (ev) showEventForm(container, caseId, ownerId, ev, () => renderTimeline(container, caseId, ownerId));
    });
  });

  container.querySelectorAll('[data-action="delete-event"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ev = events.find(e => e.id === btn.dataset.id);
      if (!ev) return;
      const ok = await showConfirm({ title: 'Delete Event', message: `Delete "<strong>${ev.title}</strong>"?`, confirmText: 'Delete' });
      if (ok) {
        await deleteTimelineEvent(ev.id, ownerId);
        showToast('Event deleted', 'info');
        await renderTimeline(container, caseId, ownerId);
      }
    });
  });
}

function timelineItem(ev, isLast) {
  const color = TYPE_COLORS[ev.type] || '#9da3b4';
  const icon = TYPE_ICONS[ev.type] || '🔹';
  return `
    <div class="timeline-item">
      <div class="timeline-connector">
        <div class="timeline-dot" style="background:${color}" title="${ev.type}"></div>
        ${!isLast ? '<div class="timeline-line"></div>' : ''}
      </div>
      <div class="timeline-content">
        <div class="timeline-header-row">
          <span class="timeline-type-badge" style="background:${color}20;color:${color}">${icon} ${ev.type}</span>
          <span class="timeline-date">${formatDate(ev.date)}</span>
          <div class="timeline-actions">
            <button class="icon-btn" data-action="edit-event" data-id="${ev.id}" title="Edit" aria-label="Edit event">✎</button>
            <button class="icon-btn icon-btn-danger" data-action="delete-event" data-id="${ev.id}" title="Delete" aria-label="Delete event">🗑</button>
          </div>
        </div>
        <div class="timeline-title">${escapeHtml(ev.title)}</div>
        ${ev.description ? `<div class="timeline-desc">${escapeHtml(ev.description)}</div>` : ''}
      </div>
    </div>
  `;
}

async function showEventForm(container, caseId, ownerId, existing, onSave) {
  const formEl = document.createElement('div');
  formEl.innerHTML = `
    <form id="event-form" class="event-form">
      <div class="form-group">
        <label for="ef-title">Title *</label>
        <input id="ef-title" type="text" class="form-input" placeholder="Event title" value="${escapeHtml(existing?.title || '')}" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="ef-date">Date *</label>
          <input id="ef-date" type="date" class="form-input" value="${existing?.date || ''}" required>
        </div>
        <div class="form-group">
          <label for="ef-type">Type</label>
          <select id="ef-type" class="form-input">
            ${EVENT_TYPES.map(t => `<option value="${t}" ${(existing?.type || 'Filing') === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label for="ef-desc">Description</label>
        <textarea id="ef-desc" class="form-input" rows="3" placeholder="Optional description">${escapeHtml(existing?.description || '')}</textarea>
      </div>
    </form>
  `;

  const { showModal } = await import('./modal.js');
  showModal({
    title: existing ? 'Edit Timeline Event' : 'Add Timeline Event',
    body: formEl,
    confirmText: existing ? 'Save' : 'Add Event',
    danger: false,
    onConfirm: async () => {
      const title = formEl.querySelector('#ef-title').value.trim();
      const date = formEl.querySelector('#ef-date').value;
      if (!title || !date) { showToast('Title and date are required', 'error'); return; }
      const ev = {
        id: existing?.id || uuid(),
        caseId,
        ownerId,
        title,
        date,
        type: formEl.querySelector('#ef-type').value,
        description: formEl.querySelector('#ef-desc').value.trim(),
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      if (existing) await updateTimelineEvent(ev);
      else await createTimelineEvent(ev);
      showToast(existing ? 'Event updated' : 'Event added', 'success');
      if (onSave) onSave();
    },
  });
}
