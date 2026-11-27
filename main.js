'use strict';

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { spawn, execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const http = require('http');

// Set MAC_SIGNED = true once Apple signing and notarization are configured.
const MAC_SIGNED = false;
const RELEASES_BASE_URL = 'https://github.com/Shubh-27/cashbook/releases/';
const UPDATER_CHANNEL = 'updater:state';
const CHECK_DELAY_MS = 5000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const API_STOP_TIMEOUT_MS = 5000;

log.transports.file.level = 'info';
autoUpdater.logger = log;

let apiProcess = null;
let apiStopPromise = null;
let mainWindow = null;
let isQuitting = false;
let isApiStopped = false;

let updaterState = 'idle'; // idle | checking | available | downloading | downloaded | error
let currentCheckPromise = null;
let isManualCheck = false;
let startupCheckTimer = null;
let periodicCheckInterval = null;

const API_PORT = 5050;
const API_URL = `http://localhost:${API_PORT}`;
const isDev = !app.isPackaged;

// ---------------------------------------------------------------------------
// Single Instance Lock
// ---------------------------------------------------------------------------

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

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
  const exeName = process.platform === 'win32' ? 'backend.exe' : 'backend';
  return path.join(process.resourcesPath, 'api', exeName);
}

function startApi() {
  const exePath = getApiExecutablePath();

  if (!exePath) {
    // Development mode: assume the developer started the API manually.
    log.info('[Electron] Dev mode — expecting API already running on port', API_PORT);
    return;
  }

  log.info('[Electron] Starting API:', exePath);
  isApiStopped = false;

  const env = { ...process.env };
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    env.DATABASE_PATH = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'cashbook.db');
    log.info('[Electron] Portable mode detected. Storing DB in:', env.DATABASE_PATH);
  }

  apiProcess = spawn(exePath, [`--urls=${API_URL}`], {
    detached: false,
    // Hide the console window in production
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env,
  });

  apiProcess.stdout.on('data', (data) => {
    log.info('[API]', data.toString().trim());
  });

  apiProcess.stderr.on('data', (data) => {
    log.error('[API Error]', data.toString().trim());
  });

  apiProcess.on('exit', (code) => {
    log.info('[Electron] API process exited with code', code);
    apiProcess = null;
  });
}

function forceKillApiProcess(proc) {
  if (!proc || proc.killed || proc.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32' && proc.pid) {
    execFile('taskkill', ['/F', '/T', '/PID', String(proc.pid)], (err) => {
      if (err) {
        log.warn('[Electron] taskkill failed, falling back to SIGKILL:', err.message);
        try {
          proc.kill('SIGKILL');
        } catch {
          // Process already exited
        }
      }
    });
  } else {
    try {
      proc.kill('SIGKILL');
    } catch {
      // Process already exited
    }
  }
}

function stopApi() {
  if (!apiProcess || apiProcess.exitCode !== null) {
    apiProcess = null;
    isApiStopped = true;
    return Promise.resolve();
  }

  if (apiStopPromise) {
    return apiStopPromise;
  }

  const proc = apiProcess;
  log.info('[Electron] Shutting down API...');

  apiStopPromise = new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      apiProcess = null;
      apiStopPromise = null;
      isApiStopped = true;
      resolve();
    };

    proc.once('exit', finish);

    const killTimer = setTimeout(() => {
      log.warn('[Electron] API did not exit within 5s, forcing termination...');
      forceKillApiProcess(proc);
      // Give taskkill/SIGKILL a brief moment to fire exit, then resolve regardless
      setTimeout(finish, 500);
    }, API_STOP_TIMEOUT_MS);

    try {
      proc.kill();
    } catch (err) {
      log.warn('[Electron] Error sending kill signal to API:', err.message);
      forceKillApiProcess(proc);
      finish();
    }
  });

  return apiStopPromise;
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
          log.info('[Electron] API is ready.');
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
    title: 'CashBook',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'frontend', 'public', 'logo.svg'),
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
// Auto-Updater logic
// ---------------------------------------------------------------------------

function sendUpdaterState(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(UPDATER_CHANNEL, payload);
  }
}

function setUpdaterState(nextState, extra = {}) {
  updaterState = nextState;
  sendUpdaterState({ state: nextState, ...extra });
}

function isNetworkError(err) {
  const code = err && typeof err.code === 'string' ? err.code : '';
  const msg = err && typeof err.message === 'string' ? err.message : '';
  const networkTokens = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ERR_INTERNET_DISCONNECTED'];
  return networkTokens.some((token) => code.includes(token) || msg.includes(token));
}

function mapUpdaterError(err) {
  if (isNetworkError(err)) {
    return 'You appear to be offline. Please check your internet connection and try again.';
  }
  const msg = err && typeof err.message === 'string' ? err.message : '';
  const statusCode = err && (err.statusCode || err.status);
  if (statusCode === 403 || statusCode === 429 || /\b(403|429)\b/.test(msg)) {
    return 'GitHub update rate limit reached. Please try again later.';
  }
  if (statusCode === 404 || /\b404\b/.test(msg)) {
    return 'No matching update release was found.';
  }
  return 'Unable to check for updates right now. Please try again later.';
}

function buildReleaseUrl(version) {
  const normalized = String(version || '').replace(/^v/, '');
  return normalized ? `${RELEASES_BASE_URL}tag/v${normalized}` : RELEASES_BASE_URL;
}

async function runUpdateCheck(manual = false) {
  if (updaterState === 'downloading') {
    if (manual) {
      throw new Error('An update download is already in progress.');
    }
    return null;
  }

  if (updaterState === 'downloaded') {
    return null;
  }

  if (currentCheckPromise) {
    return currentCheckPromise;
  }

  isManualCheck = manual;

  currentCheckPromise = (async () => {
    try {
      return await autoUpdater.checkForUpdates();
    } catch (err) {
      log.error('[Updater] Check failed:', err);
      if (!manual && isNetworkError(err)) {
        setUpdaterState('idle');
        return null;
      }
      setUpdaterState('error', { message: mapUpdaterError(err) });
      return null;
    } finally {
      currentCheckPromise = null;
      isManualCheck = false;
    }
  })();

  return currentCheckPromise;
}

function clearUpdateTimers() {
  if (startupCheckTimer) {
    clearTimeout(startupCheckTimer);
    startupCheckTimer = null;
  }
  if (periodicCheckInterval) {
    clearInterval(periodicCheckInterval);
    periodicCheckInterval = null;
  }
}

function setupAutoUpdater() {
  const isUnsignedMac = process.platform === 'darwin' && !MAC_SIGNED;

  autoUpdater.autoDownload = !isUnsignedMac;
  autoUpdater.autoInstallOnAppQuit = !isUnsignedMac;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    log.info('[Updater] Checking for update...');
    setUpdaterState('checking');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('[Updater] Update available:', info.version);
    if (isUnsignedMac) {
      setUpdaterState('available', {
        version: info.version,
        manualOnly: true,
        url: buildReleaseUrl(info.version),
      });
    } else {
      setUpdaterState('available', { version: info.version });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('[Updater] Update not available.');
    setUpdaterState('idle', { version: info && info.version ? info.version : undefined, upToDate: true });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent || 0);
    log.info(`[Updater] Downloaded ${percent}% (${progressObj.transferred}/${progressObj.total})`);
    setUpdaterState('downloading', { percent });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[Updater] Update downloaded:', info.version);
    setUpdaterState('downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    log.error('[Updater] Error:', err);
    if (!isManualCheck && isNetworkError(err)) {
      updaterState = 'idle';
      return;
    }
    setUpdaterState('error', { message: mapUpdaterError(err) });
  });

  ipcMain.handle('updater:get-version', () => app.getVersion());

  ipcMain.handle('updater:check', async () => {
    return await runUpdateCheck(true);
  });

  ipcMain.handle('updater:install', async () => {
    if (updaterState !== 'downloaded') {
      throw new Error('No downloaded update is ready to install.');
    }
    isQuitting = true;
    clearUpdateTimers();
    await stopApi();
    autoUpdater.quitAndInstall(true, true);
  });

  ipcMain.handle('updater:open-release-page', async (_event, url) => {
    if (typeof url !== 'string' || !url.startsWith(RELEASES_BASE_URL)) {
      throw new Error('Invalid release URL.');
    }
    await shell.openExternal(url);
  });
}

function scheduleUpdateChecks() {
  // Run automatic update checks only in packaged builds, unless TEST_UPDATER=true is set for local dev testing.
  if (isDev && process.env.TEST_UPDATER !== 'true') {
    return;
  }

  startupCheckTimer = setTimeout(() => {
    startupCheckTimer = null;
    void runUpdateCheck(false);
  }, CHECK_DELAY_MS);

  periodicCheckInterval = setInterval(() => {
    void runUpdateCheck(false);
  }, CHECK_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

if (gotTheLock) {
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
    setupAutoUpdater();
    scheduleUpdateChecks();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || isQuitting) {
      app.quit();
    }
  });

  app.on('before-quit', async (event) => {
    clearUpdateTimers();
    if (isApiStopped) {
      return;
    }

    event.preventDefault();
    isQuitting = true;
    await stopApi();
    app.quit();
  });
}
