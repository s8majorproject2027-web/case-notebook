// hearings.js — Hearing Day view showing linked notes/chapters

import { Auth } from '../auth.js';
import { getHearing, getCase } from '../db.js';
import { Router } from '../router.js';
import { escapeHtml, formatDate } from '../utils/helpers.js';
import { renderLinkedNotebookItems } from '../components/hearingLink.js';

export async function renderHearingView(el, { id: hearingId }) {
  const user = Auth.requireAuth();
  if (!user) return;

  const hearing = await getHearing(hearingId);
  if (!hearing || hearing.ownerId !== user.id) {
    el.innerHTML = `<div class="error-page">Hearing not found or access denied.</div>`;
    return;
  }

  const caseData = await getCase(hearing.caseId);

  el.innerHTML = `
    <div class="hearing-page">
      <div class="page-topbar">
        <div>
          <a href="#case/${hearing.caseId}" class="breadcrumb">← Back to Case</a>
          <h1 class="page-title">Hearing Day: ${formatDate(hearing.date)}</h1>
          <span class="page-subtitle">Case: ${escapeHtml(caseData?.title || 'Unknown Case')}</span>
        </div>
        <button class="btn btn-primary" id="btn-open-notebook-hearing">📓 Open Case Notebook</button>
      </div>

      <div class="hearing-detail-grid">
        <div class="hearing-info-card card">
          <h3 class="card-section-title">Hearing Details</h3>
          <div class="info-row"><span class="info-label">Date</span><span class="info-value">${formatDate(hearing.date)}</span></div>
          ${hearing.courtName ? `<div class="info-row"><span class="info-label">Court</span><span class="info-value">${escapeHtml(hearing.courtName)}</span></div>` : ''}
          ${hearing.notes ? `<div class="info-row"><span class="info-label">Notes</span><span class="info-value">${escapeHtml(hearing.notes)}</span></div>` : ''}
        </div>

        <div class="hearing-linked-items-card card" id="hearing-linked-items-container">
          <!-- Linked notebook items will be rendered here -->
          <div class="skeleton-loader">Loading linked items…</div>
        </div>
      </div>
    </div>
  `;

  el.querySelector('#btn-open-notebook-hearing').addEventListener('click', () => {
    Router.navigate(`notebook/${hearing.caseId}`);
  });

  const linkedContainer = el.querySelector('#hearing-linked-items-container');
  await renderLinkedNotebookItems(linkedContainer, hearingId);
}
