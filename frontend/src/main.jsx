import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { HashRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { store, loggedOut } from './store';
import { setUnauthorizedHandler } from './api/client';
import App from './App';
import './index.css';

// Expired/invalid token anywhere → back to login
setUnauthorizedHandler(() => {
  store.dispatch(loggedOut());
  if (!window.location.hash.startsWith('#/login')) window.location.hash = '#/login';
});

// HashRouter: works identically on the web, Electron (file://) and Capacitor.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <HashRouter>
        <App />
        <Toaster position="top-center" toastOptions={{ className: '!rounded-xl !text-sm dark:!bg-slate-800 dark:!text-slate-100', duration: 3000 }} />
      </HashRouter>
    </Provider>
  </React.StrictMode>
);
