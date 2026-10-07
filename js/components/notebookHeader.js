// notebookHeader.js — pulls case data and renders notebook header (no duplication)

import { getCase } from '../db.js';
import { escapeHtml, formatDate } from '../utils/helpers.js';

export async function renderNotebookHeader(container, caseId) {
  let caseData = null;
  try { caseData = await getCase(caseId); } catch {}

  if (!caseData) {
    container.innerHTML = `<div class="notebook-header-error">Case not found.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="notebook-header">
      <div class="notebook-header-badge">📓 Case Notebook</div>
      <div class="notebook-header-main">
        <div class="notebook-header-row1">
          <h1 class="notebook-case-title">${escapeHtml(caseData.title)}</h1>
          <span class="notebook-case-number">Case No. ${escapeHtml(caseData.caseNumber || '—')}</span>
        </div>
        <div class="notebook-header-row2">
          ${metaChip('⚖', 'Court', caseData.court)}
          ${metaChip('📋', 'Type', caseData.caseType)}
          ${metaChip('👤', 'Client', caseData.clientName)}
          ${metaChip('⚔', 'Opposite Party', caseData.oppositeParty)}
          ${metaChip('🧑‍⚖️', 'Advocate', caseData.advocateName)}
          ${caseData.filingDate ? metaChip('📅', 'Filed', formatDate(caseData.filingDate)) : ''}
        </div>
      </div>
      <a href="#case/${caseId}" class="btn btn-sm btn-ghost notebook-back-btn">← Case Details</a>
    </div>
  `;
}

function metaChip(icon, label, value) {
  if (!value) return '';
  return `<span class="notebook-meta-chip"><span class="meta-icon">${icon}</span><span class="meta-label">${label}:</span><span class="meta-value">${escapeHtml(value)}</span></span>`;
}
