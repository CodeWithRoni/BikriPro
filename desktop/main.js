/**
 * BikriPro desktop shell (Windows .exe / macOS .dmg / Linux .deb)
 *
 * - Loads the React app from resources/web (works fully offline).
 * - Optionally runs the bundled Node/Express API in the background
 *   ("embedded server") so a single shop PC can be the server + till.
 *   Other tills, tablets and phones on the same Wi-Fi then connect to
 *   http://<this-PC-IP>:5000 (Login → Server).
 * - MySQL / MariaDB must be installed on the server PC (see docs/INSTALL.md).
 *
 * Config lives in <userData>/server.env (File → Server settings).
 */
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { fork } = require('child_process');

const isDev = process.argv.includes('--dev');
const RES = app.isPackaged ? process.resourcesPath : __dirname;
const WEB_DIR = path.join(RES, 'web');
const SERVER_DIR = path.join(RES, 'server');
const USER = app.getPath('userData');
const CONFIG = path.join(USER, 'server.env');
const LOG = path.join(USER, 'server.log');

let win = null;
let serverProc = null;

// ---------- config ----------
function ensureConfig() {
  if (fs.existsSync(CONFIG)) return;
  fs.mkdirSync(USER, { recursive: true });
  const example = path.join(SERVER_DIR, '.env.example');
  let text = fs.existsSync(example) ? fs.readFileSync(example, 'utf8') : '';
  const set = (k, v) => {
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text}\n${k}=${v}`;
  };
  set('JWT_SECRET', crypto.randomBytes(32).toString('hex'));
  set('UPLOAD_DIR', path.join(USER, 'uploads').replace(/\\/g, '/'));
  set('NODE_ENV', 'production');
  set('CORS_ORIGINS', '*');
  text += '\n# Set to 0 on till PCs that only connect to another BikriPro server\nEMBEDDED_SERVER=1\n';
  fs.writeFileSync(CONFIG, text);
}

function readConfig() {
  const out = {};
  if (!fs.existsSync(CONFIG)) return out;
  for (const line of fs.readFileSync(CONFIG, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// ---------- embedded API server ----------
function startServer() {
  const entry = path.join(SERVER_DIR, 'src', 'server.js');
  const cfg = readConfig();
  if (!fs.existsSync(entry) || cfg.EMBEDDED_SERVER === '0') return;
  const log = fs.createWriteStream(LOG, { flags: 'a' });
  log.write(`\n--- ${new Date().toISOString()} starting BikriPro server ---\n`);
  serverProc = fork(entry, [], {
    cwd: SERVER_DIR,
    env: { ...process.env, ...cfg, WEB_DIST: WEB_DIR, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  serverProc.stdout.pipe(log);
  serverProc.stderr.pipe(log);
  serverProc.on('exit', (code) => {
    log.write(`server exited with code ${code}\n`);
    serverProc = null;
    if (code && win) {
      dialog.showMessageBox(win, {
        type: 'warning',
        title: 'BikriPro server stopped',
        message: 'The built-in BikriPro server could not start.',
        detail: 'Usually MySQL/MariaDB is not running or the database settings are wrong.\n\nOpen File → Server settings, fix DB_HOST / DB_USER / DB_PASSWORD, then File → Restart server.\nIf this PC only connects to another BikriPro server, set EMBEDDED_SERVER=0.',
      });
    }
  });
}

function stopServer() {
  if (serverProc) { serverProc.kill(); serverProc = null; }
}

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'BikriPro',
    backgroundColor: '#f8fafc',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(WEB_DIR, 'index.html'));
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  // External links open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Server settings…', click: () => shell.openPath(CONFIG) },
        { label: 'Open server log', click: () => shell.openPath(LOG) },
        { label: 'Open data folder', click: () => shell.openPath(USER) },
        { label: 'Restart server', click: () => { stopServer(); setTimeout(startServer, 800); } },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About BikriPro', click: () => dialog.showMessageBox({ title: 'BikriPro', message: `BikriPro POS ${app.getVersion()}`, detail: 'POS & ERP for garments and clothing retail.' }) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Single instance: focus the open window instead of starting a second server
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    ensureConfig();
    startServer();
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', stopServer);
