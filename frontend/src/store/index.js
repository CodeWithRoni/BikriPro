import { configureStore, createSlice } from '@reduxjs/toolkit';

const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

// ---------- auth ----------
const authSlice = createSlice({
  name: 'auth',
  initialState: { token: read('bp_token', null), user: readJson('bp_user', null) },
  reducers: {
    loggedIn(state, { payload }) {
      state.token = payload.token; state.user = payload.user;
      localStorage.setItem('bp_token', payload.token);
      localStorage.setItem('bp_user', JSON.stringify(payload.user));
    },
    loggedOut(state) {
      state.token = null; state.user = null;
      localStorage.removeItem('bp_token'); localStorage.removeItem('bp_user');
    },
  },
});

// ---------- ui: theme + sidebar ----------
const applyTheme = (t) => document.documentElement.classList.toggle('dark', t === 'dark');
const uiSlice = createSlice({
  name: 'ui',
  initialState: { theme: read('bp_theme', 'light'), sidebarCollapsed: read('bp_sidebar', '0') === '1', mobileNavOpen: false },
  reducers: {
    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('bp_theme', state.theme); applyTheme(state.theme);
    },
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem('bp_sidebar', state.sidebarCollapsed ? '1' : '0');
    },
    setMobileNav(state, { payload }) { state.mobileNavOpen = payload; },
  },
});

// ---------- settings cache ----------
const settingsSlice = createSlice({
  name: 'settings',
  initialState: { data: readJson('bp_settings', {}) },
  reducers: {
    settingsLoaded(state, { payload }) { state.data = payload; localStorage.setItem('bp_settings', JSON.stringify(payload)); },
  },
});

export const { loggedIn, loggedOut } = authSlice.actions;
export const { toggleTheme, toggleSidebar, setMobileNav } = uiSlice.actions;
export const { settingsLoaded } = settingsSlice.actions;

export const store = configureStore({
  reducer: { auth: authSlice.reducer, ui: uiSlice.reducer, settings: settingsSlice.reducer },
});
