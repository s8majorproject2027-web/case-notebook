// dashboard.js — main dashboard page with case list, notebook widget cards, and recent activity

import { Auth } from '../auth.js';
import { getCasesByOwner, getNotebookByCaseId, getNotebookStats, getHearingsByCase, getTasksByCase } from '../db.js';
import { Router } from '../router.js';
import { escapeHtml, formatDate, formatDateTime, timeAgo, isOverdue } from '../utils/helpers.js';

export async function renderDashboard(el) {
  const user = Auth.requireAuth();
  if (!user) return;

  el.innerHTML = `<div class="page-loading">Loading dashboard…</div>`;

  const cases = await getCasesByOwner(user.id);

  if (cases.length === 0) {
    el.innerHTML = `
      <div class="dashboard-page">
        <div class="dashboard-welcome">
          <div class="welcome-icon">⚖️</div>
          <h2 class="welcome-title">Welcome, ${escapeHtml(user.displayName || user.username)}</h2>
          <p class="welcome-subtitle">You have no cases yet. Add your first case to get started.</p>
          <button class="btn btn-primary btn-lg" id="btn-new-case-welcome">+ Add New Case</button>
        </div>
      </div>
    `;
    el.querySelector('#btn-new-case-welcome').addEventListener('click', () => Router.navigate('#cases'));
    return;
  }

  // Load stats for each case
  const caseStats = await Promise.all(cases.map(async c => {
    let stats = null;
    try {
      const nb = await getNotebookByCaseId(c.id);
      if (nb) stats = await getNotebookStats(c.id, user.id);
    } catch {}
    const hearings = await getHearingsByCase(c.id);
    const now = new Date();
    const nextHearing = hearings.filter(h => new Date(h.date) >= now).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    return { ...c, stats, nextHearing };
  }));

  const allTasks = (await Promise.all(cases.map(c => getTasksByCase(c.id)))).flat();
  const pendingTasks = allTasks.filter(t => t.status === 'Pending');
  const overdueTasks = pendingTasks.filter(t => isOverdue(t.dueDate));

  el.innerHTML = `
    <div class="dashboard-page">
      <div class="dashboard-topbar">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">Welcome back, <strong>${escapeHtml(user.displayName || user.username)}</strong></p>
        </div>
        <button class="btn btn-primary" id="btn-new-case-dash">+ New Case</button>
      </div>

      <!-- Summary strip -->
      <div class="summary-strip">
        ${summaryCard('⚖️', 'Total Cases', cases.length, '#cases')}
        ${summaryCard('📝', 'Pending Tasks', pendingTasks.length, null)}
        ${summaryCard('⚠️', 'Overdue Tasks', overdueTasks.length, null, overdueTasks.length > 0 ? 'card-danger' : '')}
        ${summaryCard('📓', 'Case Notebooks', cases.length, null)}
      </div>

      <!-- Case cards -->
      <div class="section-header">
        <h2 class="section-title">Cases & Notebooks</h2>
        <a href="#cases" class="btn btn-ghost btn-sm">View All Cases →</a>
      </div>
      <div class="case-card-grid">
        ${caseStats.map(c => caseNotebookCard(c)).join('')}
      </div>

      ${overdueTasks.length > 0 ? `
        <div class="section-header">
          <h2 class="section-title overdue-section-title">⚠️ Overdue Tasks</h2>
        </div>
        <div class="overdue-list">
          ${overdueTasks.slice(0, 5).map(t => overdueTaskItem(t, cases)).join('')}
        </div>
      ` : ''}
    </div>
  `;

  el.querySelector('#btn-new-case-dash').addEventListener('click', () => Router.navigate('#cases'));

  el.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => Router.navigate(btn.dataset.nav));
  });
}

function summaryCard(icon, label, value, href, extraClass = '') {
  const inner = `
    <div class="summary-card ${extraClass}">
      <span class="summary-card-icon">${icon}</span>
      <div class="summary-card-body">
        <span class="summary-card-value">${value}</span>
        <span class="summary-card-label">${label}</span>
      </div>
    </div>
  `;
  return href ? `<a href="${href}" class="summary-card-link">${inner}</a>` : inner;
}

function caseNotebookCard(c) {
  const s = c.stats;
  const nextH = c.nextHearing;
  return `
    <div class="case-nb-card">
      <div class="case-nb-card-header">
        <div>
          <div class="case-nb-number">${escapeHtml(c.caseNumber || '—')}</div>
          <div class="case-nb-title">${escapeHtml(c.title)}</div>
        </div>
        <span class="case-type-badge">${escapeHtml(c.caseType || '')}</span>
      </div>
      <div class="case-nb-meta">
        ${c.court ? `<span class="meta-chip">⚖ ${escapeHtml(c.court)}</span>` : ''}
        ${c.clientName ? `<span class="meta-chip">👤 ${escapeHtml(c.clientName)}</span>` : ''}
      </div>
      ${nextH ? `<div class="case-next-hearing">📅 Next Hearing: <strong>${formatDate(nextH.date)}</strong>${nextH.courtName ? ` · ${escapeHtml(nextH.courtName)}` : ''}</div>` : ''}
      ${s ? `
        <div class="case-nb-stats">
          <span class="nb-stat" title="Chapters">📂 ${s.totalChapters}</span>
          <span class="nb-stat" title="Notes">📝 ${s.totalNotes}</span>
          <span class="nb-stat" title="Marked Points">🔖 ${s.markedPoints}</span>
          <span class="nb-stat ${s.pendingTasks > 0 ? 'stat-warn' : ''}" title="Pending Tasks">✅ ${s.pendingTasks}</span>
          <span class="nb-stat" title="Attachments">📎 ${s.totalAttachments}</span>
        </div>
      ` : '<div class="case-nb-no-notebook">No notebook yet</div>'}
      <div class="case-nb-card-footer">
        <button class="btn btn-sm btn-ghost" data-nav="case/${c.id}">Case Details</button>
        <button class="btn btn-sm btn-primary" data-nav="notebook/${c.id}">📓 Open Notebook</button>
      </div>
    </div>
  `;
}

function overdueTaskItem(t, cases) {
  const c = cases.find(c => c.id === t.caseId);
  return `
    <div class="overdue-task-item">
      <span class="overdue-task-icon">⚠️</span>
      <div class="overdue-task-body">
        <span class="overdue-task-title">${escapeHtml(t.title)}</span>
        <span class="overdue-task-case">${c ? escapeHtml(c.title) : ''}</span>
      </div>
      <span class="overdue-task-date">Due: ${formatDate(t.dueDate)}</span>
      <button class="btn btn-xs btn-outline" data-nav="notebook/${t.caseId}">Open →</button>
    </div>
  `;
}
