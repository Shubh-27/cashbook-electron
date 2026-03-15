// preload.js — runs in the renderer process before any page scripts.
// Uses contextBridge to safely expose Node/Electron APIs to the renderer.
// Currently exposes nothing — the React app communicates with the API
// exclusively via standard HTTP fetch calls to http://localhost:5000.

const { contextBridge } = require('electron');

// Example of how to expose APIs in the future:
// contextBridge.exposeInMainWorld('electronAPI', {
//   someMethod: () => ipcRenderer.invoke('some-channel'),
// });
