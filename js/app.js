// app.js — Application bootstrap, routing setup, auth initialisation

import { Auth } from './auth.js';
import { Router } from './router.js';
import { showToast } from './components/toast.js';

// Pages
import { renderDashboard } from './pages/dashboard.js';
import { renderCasesList, renderCaseDetail } from './pages/cases.js';
import { renderNotebook } from './pages/notebook.js';
import { renderHearingView } from './pages/hearings.js';

const app = document.getElementById('app');

async function bootstrap() {
  try {
    await Auth.init();
  } catch (err) {
    app.innerHTML = `<div class="error-page">Failed to initialize database. Ensure IndexedDB is enabled.</div>`;
    return;
  }

  // Setup Routes
  Router.on('login', renderLogin);
  Router.on('dashboard', () => renderDashboard(app));
  Router.on('cases', () => renderCasesList(app));
  Router.on('case/:id', (params) => renderCaseDetail(app, params));
  Router.on('notebook/:caseId', (params) => renderNotebook(app, params));
  Router.on('hearing/:id', (params) => renderHearingView(app, params));

  // Fallback
  Router.on('*', () => { Router.navigate('dashboard'); });

  // Guard all routes except login
  Router.beforeEach((pattern) => {
    if (pattern !== 'login' && !Auth.isLoggedIn()) {
      Router.navigate('login');
      return false;
    }
    if (pattern === 'login' && Auth.isLoggedIn()) {
      Router.navigate('dashboard');
      return false;
    }
    return true; // Let Notebook handle its own dirty state guard
  });

  Router.start();
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-icon">⚖️</div>
        <h1 class="login-title">Advocate Case Notebook</h1>
        <p class="login-subtitle">A local, offline-first case management tool.</p>

        <form id="login-form">
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="login-username" class="form-input" value="advocate" required>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="login-password" class="form-input" value="demo123" required>
          </div>
          <button type="submit" class="btn btn-primary btn-full" style="margin-top: 1rem">Sign In</button>
        </form>
        <div class="login-demo-note">Demo credentials: <b>advocate</b> / <b>demo123</b></div>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;
    const res = await Auth.login(u, p);
    if (res.ok) {
      showToast('Welcome back', 'success');
      Router.navigate('dashboard');
    } else {
      showToast(res.error, 'error');
    }
  });
}

// Start app
bootstrap();
