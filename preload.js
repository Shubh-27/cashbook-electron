// preload.js — runs in the renderer process before any page scripts.
// Uses contextBridge to safely expose Node/Electron APIs to the renderer.

const { contextBridge, ipcRenderer } = require('electron');

const UPDATER_CHANNEL = 'updater:state';

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('updater:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  openReleasePage: (url) => ipcRenderer.invoke('updater:open-release-page', url),
  onUpdateState: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(UPDATER_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(UPDATER_CHANNEL, listener);
    };
  },
});
