// Minimal, safe bridge: lets the web app know it runs inside the desktop shell.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('bikripro', {
  isDesktop: true,
  platform: process.platform,
});
