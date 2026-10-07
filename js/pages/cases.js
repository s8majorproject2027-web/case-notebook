// cases.js — cases list page and case detail page

import { Auth } from '../auth.js';
import { getCasesByOwner, createCase, updateCase, deleteCase, getCase, getHearingsByCase, createHearing, updateHearing, deleteHearing } from '../db.js';
import { Router } from '../router.js';
import { uuid, escapeHtml, formatDate } from '../utils/helpers.js';
import { showConfirm } from '../components/modal.js';
import { showToast } from '../components/toast.js';

const CASE_TYPES = ['Civil', 'Criminal', 'Family', 'Labour', 'Consumer', 'Corporate', 'Tax', 'Revenue', 'Other'];

// ─── Cases List ────────────────────────────────────────────────────────────────

export async function renderCasesList(el) {
  const user = Auth.requireAuth();
  if (!user) return;

  const cases = await getCasesByOwner(user.id);

  el.innerHTML = `
    <div class="cases-page">
      <div class="page-topbar">
        <div>
          <h1 class="page-title">Cases</h1>
          <p class="page-subtitle">${cases.length} case${cases.length !== 1 ? 's' : ''}</p>
        </div>
        <button class="btn btn-primary" id="btn-add-case">+ New Case</button>
      </div>

      ${cases.length === 0
        ? `<div class="empty-page-state">
            <div class="empty-icon">⚖️</div>
            <h3>No Cases Yet</h3>
            <p>Add your first case to start building your case notebook.</p>
            <button class="btn btn-primary" id="btn-add-case-empty">+ Add Case</button>
          </div>`
        : `<div class="cases-grid">${cases.map(c => caseListCard(c)).join('')}</div>`
      }
    </div>
  `;

  el.querySelectorAll('#btn-add-case, #btn-add-case-empty').forEach(btn => {
    btn.addEventListener('click', () => showCaseForm(null, user, () => renderCasesList(el)));
  });

  el.querySelectorAll('[data-action="view-case"]').forEach(btn => {
    btn.addEventListener('click', () => Router.navigate(`case/${btn.dataset.id}`));
  });
  el.querySelectorAll('[data-action="open-notebook"]').forEach(btn => {
    btn.addEventListener('click', () => Router.navigate(`notebook/${btn.dataset.id}`));
  });
  el.querySelectorAll('[data-action="edit-case"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const c = cases.find(c => c.id === btn.dataset.id);
      if (c) showCaseForm(c, user, () => renderCasesList(el));
    });
  });
  el.querySelectorAll('[data-action="delete-case"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const c = cases.find(c => c.id === btn.dataset.id);
      if (!c) return;
      const ok = await showConfirm({ title: 'Delete Case', message: `Delete "<strong>${c.title}</strong>" and ALL its notebook data? This cannot be undone.`, confirmText: 'Delete Case', danger: true });
      if (ok) {
        await deleteCase(c.id, user.id);
        showToast('Case deleted', 'info');
        await renderCasesList(el);
      }
    });
  });
}

function caseListCard(c) {
  return `
    <div class="case-card" data-id="${c.id}">
      <div class="case-card-header">
        <span class="case-number">${escapeHtml(c.caseNumber || '—')}</span>
        <span class="case-type-badge">${escapeHtml(c.caseType || '')}</span>
      </div>
      <div class="case-card-title">${escapeHtml(c.title)}</div>
      <div class="case-card-meta">
        ${c.court ? `<span class="meta-chip">⚖ ${escapeHtml(c.court)}</span>` : ''}
        ${c.clientName ? `<span class="meta-chip">👤 ${escapeHtml(c.clientName)}</span>` : ''}
        ${c.oppositeParty ? `<span class="meta-chip">⚔ ${escapeHtml(c.oppositeParty)}</span>` : ''}
      </div>
      <div class="case-card-footer">
        <button class="btn btn-xs btn-ghost" data-action="edit-case" data-id="${c.id}">✎ Edit</button>
        <button class="btn btn-xs btn-ghost" data-action="view-case" data-id="${c.id}">Details</button>
        <button class="btn btn-xs btn-primary" data-action="open-notebook" data-id="${c.id}">📓 Notebook</button>
        <button class="btn btn-xs icon-btn icon-btn-danger" data-action="delete-case" data-id="${c.id}" title="Delete case">🗑</button>
      </div>
    </div>
  `;
}

// ─── Case Detail ───────────────────────────────────────────────────────────────

export async function renderCaseDetail(el, { id: caseId }) {
  const user = Auth.requireAuth();
  if (!user) return;

  const caseData = await getCase(caseId);
  if (!caseData || caseData.ownerId !== user.id) {
    el.innerHTML = `<div class="error-page">Case not found or access denied.</div>`;
    return;
  }

  const hearings = await getHearingsByCase(caseId);

  el.innerHTML = `
    <div class="case-detail-page">
      <div class="page-topbar">
        <div>
          <a href="#cases" class="breadcrumb">← Cases</a>
          <h1 class="page-title">${escapeHtml(caseData.title)}</h1>
          <span class="page-subtitle">Case No. ${escapeHtml(caseData.caseNumber || '—')}</span>
        </div>
        <div class="topbar-actions">
          <button class="btn btn-ghost" id="btn-edit-case">✎ Edit Case</button>
          <button class="btn btn-primary" id="btn-open-notebook">📓 Open Notebook</button>
        </div>
      </div>

      <div class="case-detail-grid">
        <div class="case-info-card card">
          <h3 class="card-section-title">Case Information</h3>
          ${infoRow('Case Number', caseData.caseNumber)}
          ${infoRow('Title', caseData.title)}
          ${infoRow('Court', caseData.court)}
          ${infoRow('Case Type', caseData.caseType)}
          ${infoRow('Client', caseData.clientName)}
          ${infoRow('Opposite Party', caseData.oppositeParty)}
          ${infoRow('Advocate', caseData.advocateName)}
          ${infoRow('Filing Date', formatDate(caseData.filingDate))}
          ${caseData.description ? `<div class="info-row"><span class="info-label">Notes</span><span class="info-value">${escapeHtml(caseData.description)}</span></div>` : ''}
        </div>

        <div class="hearings-card card">
          <div class="card-header-row">
            <h3 class="card-section-title">Hearing Days</h3>
            <button class="btn btn-sm btn-primary" id="btn-add-hearing">+ Add Hearing</button>
          </div>
          <div id="hearings-list">
            ${hearings.length === 0
              ? '<p class="empty-state-sm">No hearings yet.</p>'
              : hearings.map(h => hearingItem(h)).join('')
            }
          </div>
        </div>
      </div>
    </div>
  `;

  el.querySelector('#btn-edit-case').addEventListener('click', () => showCaseForm(caseData, user, () => renderCaseDetail(el, { id: caseId })));
  el.querySelector('#btn-open-notebook').addEventListener('click', () => Router.navigate(`notebook/${caseId}`));
  el.querySelector('#btn-add-hearing').addEventListener('click', () => showHearingForm(null, caseId, user.id, el, hearings, caseData));

  el.querySelectorAll('[data-action="edit-hearing"]').forEach(btn => {
    const h = hearings.find(h => h.id === btn.dataset.id);
    if (h) btn.addEventListener('click', () => showHearingForm(h, caseId, user.id, el, hearings, caseData));
  });
  el.querySelectorAll('[data-action="view-hearing"]').forEach(btn => {
    btn.addEventListener('click', () => Router.navigate(`hearing/${btn.dataset.id}`));
  });
  el.querySelectorAll('[data-action="delete-hearing"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await showConfirm({ title: 'Delete Hearing', message: 'Delete this hearing day?', confirmText: 'Delete', danger: true });
      if (ok) {
        await deleteHearing(btn.dataset.id);
        showToast('Hearing deleted', 'info');
        renderCaseDetail(el, { id: caseId });
      }
    });
  });
}

function infoRow(label, value) {
  if (!value) return '';
  return `<div class="info-row"><span class="info-label">${label}</span><span class="info-value">${escapeHtml(value)}</span></div>`;
}

function hearingItem(h) {
  return `
    <div class="hearing-item">
      <div class="hearing-item-left">
        <span class="hearing-date">${formatDate(h.date)}</span>
        ${h.courtName ? `<span class="hearing-court">${escapeHtml(h.courtName)}</span>` : ''}
        ${h.notes ? `<span class="hearing-notes">${escapeHtml(h.notes)}</span>` : ''}
      </div>
      <div class="hearing-item-actions">
        <button class="btn btn-xs btn-ghost" data-action="view-hearing" data-id="${h.id}">View</button>
        <button class="btn btn-xs btn-ghost" data-action="edit-hearing" data-id="${h.id}">✎</button>
        <button class="icon-btn icon-btn-danger" data-action="delete-hearing" data-id="${h.id}" title="Delete">🗑</button>
      </div>
    </div>
  `;
}

async function showCaseForm(existing, user, onSave) {
  const { showModal } = await import('../components/modal.js');
  const formEl = document.createElement('div');
  formEl.innerHTML = `
    <form id="case-form" class="case-form">
      <div class="form-row">
        <div class="form-group">
          <label for="cf-number">Case Number</label>
          <input id="cf-number" type="text" class="form-input" placeholder="e.g. CS/123/2024" value="${escapeHtml(existing?.caseNumber || '')}">
        </div>
        <div class="form-group">
          <label for="cf-type">Case Type</label>
          <select id="cf-type" class="form-input">
            ${CASE_TYPES.map(t => `<option value="${t}" ${(existing?.caseType || '') === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label for="cf-title">Case Title *</label>
        <input id="cf-title" type="text" class="form-input" placeholder="Full case title" value="${escapeHtml(existing?.title || '')}" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="cf-court">Court</label>
          <input id="cf-court" type="text" class="form-input" placeholder="Court name" value="${escapeHtml(existing?.court || '')}">
        </div>
        <div class="form-group">
          <label for="cf-filing">Filing Date</label>
          <input id="cf-filing" type="date" class="form-input" value="${existing?.filingDate || ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="cf-client">Client Name</label>
          <input id="cf-client" type="text" class="form-input" placeholder="Client name" value="${escapeHtml(existing?.clientName || '')}">
        </div>
        <div class="form-group">
          <label for="cf-opposite">Opposite Party</label>
          <input id="cf-opposite" type="text" class="form-input" placeholder="Opposite party" value="${escapeHtml(existing?.oppositeParty || '')}">
        </div>
      </div>
      <div class="form-group">
        <label for="cf-advocate">Advocate Name</label>
        <input id="cf-advocate" type="text" class="form-input" placeholder="Advocate" value="${escapeHtml(existing?.advocateName || user.displayName || '')}">
      </div>
      <div class="form-group">
        <label for="cf-desc">Notes / Description</label>
        <textarea id="cf-desc" class="form-input" rows="2" placeholder="Optional notes">${escapeHtml(existing?.description || '')}</textarea>
      </div>
    </form>
  `;

  showModal({
    title: existing ? 'Edit Case' : 'New Case',
    body: formEl,
    confirmText: existing ? 'Save Changes' : 'Create Case',
    wide: true,
    onConfirm: async () => {
      const title = formEl.querySelector('#cf-title').value.trim();
      if (!title) { showToast('Case title is required', 'error'); return; }
      const caseObj = {
        id: existing?.id || uuid(),
        ownerId: user.id,
        caseNumber: formEl.querySelector('#cf-number').value.trim(),
        title,
        caseType: formEl.querySelector('#cf-type').value,
        court: formEl.querySelector('#cf-court').value.trim(),
        filingDate: formEl.querySelector('#cf-filing').value || null,
        clientName: formEl.querySelector('#cf-client').value.trim(),
        oppositeParty: formEl.querySelector('#cf-opposite').value.trim(),
        advocateName: formEl.querySelector('#cf-advocate').value.trim(),
        description: formEl.querySelector('#cf-desc').value.trim(),
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (existing) await updateCase(caseObj);
      else await createCase(caseObj);
      showToast(existing ? 'Case updated' : 'Case created', 'success');
      if (onSave) onSave();
    },
  });
}

async function showHearingForm(existing, caseId, ownerId, el, hearings, caseData) {
  const { showModal } = await import('../components/modal.js');
  const formEl = document.createElement('div');
  formEl.innerHTML = `
    <form id="hearing-form" class="hearing-form">
      <div class="form-group">
        <label for="hf-date">Hearing Date *</label>
        <input id="hf-date" type="date" class="form-input" value="${existing?.date || ''}" required>
      </div>
      <div class="form-group">
        <label for="hf-court">Court / Location</label>
        <input id="hf-court" type="text" class="form-input" placeholder="Court name or location" value="${escapeHtml(existing?.courtName || '')}">
      </div>
      <div class="form-group">
        <label for="hf-notes">Notes</label>
        <textarea id="hf-notes" class="form-input" rows="2" placeholder="Brief notes about this hearing">${escapeHtml(existing?.notes || '')}</textarea>
      </div>
    </form>
  `;

  showModal({
    title: existing ? 'Edit Hearing' : 'Add Hearing Day',
    body: formEl,
    confirmText: existing ? 'Save' : 'Add Hearing',
    onConfirm: async () => {
      const date = formEl.querySelector('#hf-date').value;
      if (!date) { showToast('Date is required', 'error'); return; }
      const h = {
        id: existing?.id || uuid(),
        caseId,
        ownerId,
        date,
        courtName: formEl.querySelector('#hf-court').value.trim(),
        notes: formEl.querySelector('#hf-notes').value.trim(),
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      if (existing) await updateHearing(h);
      else await createHearing(h);
      showToast(existing ? 'Hearing updated' : 'Hearing added', 'success');
      renderCaseDetail(el, { id: caseId });
    },
  });
}
