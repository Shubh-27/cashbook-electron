'use strict';

const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

let apiProcess = null;
let mainWindow = null;

const API_PORT = 5000;
const API_URL = `http://localhost:${API_PORT}`;
const isDev = !app.isPackaged;

// ---------------------------------------------------------------------------
// API Process Management
// ---------------------------------------------------------------------------

function getApiExecutablePath() {
  if (isDev) {
    // During development, expect the API to already be running via `dotnet run`.
    // This path is only used in production.
    return null;
  }
  // In production, the API exe is placed in resources/api/ by electron-builder.
  return path.join(process.resourcesPath, 'api', 'backend.exe');
}

function startApi() {
  const exePath = getApiExecutablePath();

  if (!exePath) {
    // Development mode: assume the developer started the API manually.
    console.log('[Electron] Dev mode — expecting API already running on port', API_PORT);
    return;
  }

  console.log('[Electron] Starting API:', exePath);

  apiProcess = spawn(exePath, [`--urls=${API_URL}`], {
    detached: false,
    // Hide the console window in production
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  apiProcess.stdout.on('data', (data) => {
    console.log('[API]', data.toString().trim());
  });

  apiProcess.stderr.on('data', (data) => {
    console.error('[API Error]', data.toString().trim());
  });

  apiProcess.on('exit', (code) => {
    console.log('[Electron] API process exited with code', code);
    apiProcess = null;
  });
}

function stopApi() {
  if (apiProcess) {
    console.log('[Electron] Shutting down API...');
    apiProcess.kill();
    apiProcess = null;
  }
}

// ---------------------------------------------------------------------------
// Health check — wait until API is ready
// ---------------------------------------------------------------------------

function waitForApi(maxWaitMs = 30000, intervalMs = 500) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function check() {
      const req = http.get(`${API_URL}/health`, (res) => {
        if (res.statusCode === 200) {
          console.log('[Electron] API is ready.');
          resolve();
        } else {
          retry();
        }
        // Consume response to free socket
        res.resume();
      });

      req.on('error', () => retry());
      req.setTimeout(intervalMs, () => { req.destroy(); retry(); });
    }

    function retry() {
      if (Date.now() - start > maxWaitMs) {
        reject(new Error('Timed out waiting for API to start.'));
        return;
      }
      setTimeout(check, intervalMs);
    }

    check();
  });
}

// ---------------------------------------------------------------------------
// Window Creation
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Bank Manager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    // Load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Load the built React app
    mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  startApi();

  try {
    await waitForApi();
  } catch (err) {
    dialog.showErrorBox(
      'Startup Error',
      `The backend API failed to start.\n\n${err.message}\n\nThe application will now close.`
    );
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  stopApi();
});
