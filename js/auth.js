// auth.js — simple client-side session using localStorage
// Stores current user ID in localStorage after "login"

import { openDB, createUser, getUserByUsername, getUser } from './db.js';
import { uuid } from './utils/helpers.js';

const SESSION_KEY = 'cn_session_userId';

export const Auth = {
  _user: null,

  async init() {
    await openDB();
    const userId = localStorage.getItem(SESSION_KEY);
    if (userId) {
      this._user = await getUser(userId);
    }
    // Create default demo user if no users exist
    await this._ensureDemoUser();
  },

  async _ensureDemoUser() {
    const existing = await getUserByUsername('advocate');
    if (!existing) {
      const demoUser = {
        id: uuid(),
        username: 'advocate',
        displayName: 'Adv. Demo User',
        password: 'demo123', // plain for demo only — no server = no real auth
        createdAt: new Date().toISOString(),
      };
      await createUser(demoUser);
    }
  },

  async login(username, password) {
    const user = await getUserByUsername(username);
    if (!user) return { ok: false, error: 'User not found.' };
    if (user.password !== password) return { ok: false, error: 'Incorrect password.' };
    this._user = user;
    localStorage.setItem(SESSION_KEY, user.id);
    return { ok: true, user };
  },

  async register(username, displayName, password) {
    const existing = await getUserByUsername(username);
    if (existing) return { ok: false, error: 'Username already taken.' };
    const user = {
      id: uuid(),
      username,
      displayName,
      password, // demo only
      createdAt: new Date().toISOString(),
    };
    await createUser(user);
    this._user = user;
    localStorage.setItem(SESSION_KEY, user.id);
    return { ok: true, user };
  },

  logout() {
    this._user = null;
    localStorage.removeItem(SESSION_KEY);
  },

  currentUser() {
    return this._user;
  },

  requireAuth() {
    if (!this._user) {
      window.location.hash = '#login';
      return null;
    }
    return this._user;
  },

  isLoggedIn() {
    return !!this._user;
  },
};
