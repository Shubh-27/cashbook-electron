// preload.js — runs in the renderer process before any page scripts.
// Uses contextBridge to safely expose Node/Electron APIs to the renderer.
// Currently exposes nothing — the React app communicates with the API
// exclusively via standard HTTP fetch calls to http://localhost:5050.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, value) => callback(value)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, value) => callback(value)),
  onDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', (_event, value) => callback(value)),
});
