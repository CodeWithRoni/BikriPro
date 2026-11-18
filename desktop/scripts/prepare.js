/**
 * Copies the built React app into desktop/web and a production copy of the
 * backend into desktop/server (bundled as an optional embedded server).
 * Run from desktop/: `npm run prepare-app`
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const desktop = path.resolve(__dirname, '..');
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit', shell: true });

// 1) Frontend build -> desktop/web
const frontend = path.join(root, 'frontend');
if (!fs.existsSync(path.join(frontend, 'node_modules'))) run('npm install', frontend);
run('npm run build', frontend);
fs.rmSync(path.join(desktop, 'web'), { recursive: true, force: true });
fs.cpSync(path.join(frontend, 'dist'), path.join(desktop, 'web'), { recursive: true });

// 2) Backend -> desktop/server (production deps only, for the build machine's OS)
const backend = path.join(root, 'backend');
const server = path.join(desktop, 'server');
fs.rmSync(server, { recursive: true, force: true });
fs.mkdirSync(server, { recursive: true });
for (const f of ['package.json', 'package-lock.json', '.env.example']) {
  if (fs.existsSync(path.join(backend, f))) fs.cpSync(path.join(backend, f), path.join(server, f));
}
fs.cpSync(path.join(backend, 'src'), path.join(server, 'src'), { recursive: true });
fs.cpSync(path.join(root, 'supabase', 'migrations'), path.join(server, 'migrations'), { recursive: true });
run('npm install --omit=dev --no-audit --no-fund', server);
console.log('✅ desktop/web and desktop/server are ready');
