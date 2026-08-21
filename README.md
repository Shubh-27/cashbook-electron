# CashBook Electron Shell

[![Electron](https://img.shields.io/badge/Electron-33.2-47848F.svg)](https://www.electronjs.org/)
[![Electron Builder](https://img.shields.io/badge/Electron_Builder-25.1-informational.svg)](https://www.electron.build/)
[![Auto-Updater](https://img.shields.io/badge/Auto--Updater-electron--updater-green.svg)](https://www.electron.build/auto-update)
[![Platforms](https://img.shields.io/badge/Platforms-Windows%20%7C%20macOS-lightgrey.svg)]()

The desktop application shell for CashBook, built with **Electron 33**. It manages native operating system windows, orchestrates the embedded ASP.NET Core backend subprocess, facilitates secure IPC communication, and delivers over-the-air auto-updates via GitHub Releases.

---

## Table of Contents

- [Overview & Subprocess Architecture](#overview--subprocess-architecture)
- [Key Features](#key-features)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Packaging & Distribution](#packaging--distribution)
  - [Windows Targets (NSIS & Portable)](#windows-targets-nsis--portable)
  - [macOS Targets (DMG & ZIP)](#macos-targets-dmg--zip)
- [Auto-Update Workflow](#auto-update-workflow)
- [Security Model](#security-model)
- [License](#license)

---

## Overview & Subprocess Architecture

In production, CashBook does not require the user to have .NET or any external runtimes installed. The Electron main process automatically spawns and manages a self-contained ASP.NET Core backend binary:

```
[ Electron Main Process (main.js) ]
                │
                ├─► 1. Spawn Backend Subprocess (resources/api/backend.exe)
                ├─► 2. Poll Health Endpoint (http://localhost:5050/health)
                ├─► 3. Create Browser Window (load ui/index.html)
                ├─► 4. Check for Updates via GitHub Releases (electron-updater)
                └─► 5. On App Exit: Gracefully Terminate Backend Subprocess
```

---

## Key Features

- **Subprocess Lifecycle Management**: Automatically starts the backend API binary on launch with a hidden window, monitors liveness via HTTP polling, and cleanly shuts it down when the application quits.
- **Portable & Installer Detection**: Detects `PORTABLE_EXECUTABLE_DIR` to ensure the SQLite database (`cashbook.db`) is stored in the same folder as the portable `.exe` for true zero-install portability.
- **Context-Isolated IPC Bridge**: Uses `preload.js` and `contextBridge` to expose safe updater controls to the React frontend while blocking direct Node.js API access from the renderer.
- **Auto-Updates with Progress Tracking**: Powered by `electron-updater` with real-time download progress broadcasting to the UI.
- **Multi-Platform Distribution**: Configured for Windows (NSIS Installer + Portable) and macOS (DMG + ZIP).

---

## Project Structure

```text
electron/
├── assets/                   # Application icons (.ico for Windows, .icns for macOS, .png)
├── resources/                # Production resources directory
│   └── api/                  # Self-contained published ASP.NET Core backend binaries
├── ui/                       # Compiled React frontend production build (HTML, JS, CSS)
├── dist/                     # Output directory for packaged installers and metadata
├── main.js                   # Electron main process entry point & backend supervisor
├── preload.js                # Secure Context Bridge IPC interface
├── package.json              # Electron configuration & electron-builder packaging rules
└── README.md                 # Electron shell documentation
```

---

## Prerequisites

- **[Node.js](https://nodejs.org/)**: `v20.x` or higher
- **npm**: `v10.x` or higher

---

## Getting Started

### Installation

Install dependencies within the `electron/` directory:

```bash
npm install
```

### Running in Development

To start the Electron shell locally (requires the backend at `http://localhost:5050` and the frontend at `http://localhost:5173`):

```bash
npm start
```

Or from the root directory to run everything concurrently:

```bash
npm run dev
```

---

## Packaging & Distribution

Packaging is powered by `electron-builder`. During the build process, the compiled React frontend (`frontend/dist`) is copied to `electron/ui/` and the published backend binary is placed into `electron/resources/api/`.

### Windows Targets (NSIS & Portable)

To build both the NSIS installer and the standalone Portable executable:

```bash
npm run dist
```
*or:*
```bash
npx electron-builder --win
```

**Artifacts created in `dist/`:**
- `CashBook Setup <version>.exe` (Interactive NSIS installer with desktop/start menu shortcuts)
- `CashBook <version>.exe` (Single-file Portable executable)
- `latest.yml` & `*.blockmap` (Auto-update metadata)

### macOS Targets (DMG & ZIP)

To build the macOS DMG and ZIP distribution files:

```bash
npx electron-builder --mac
```

**Artifacts created in `dist/`:**
- `CashBook-<version>.dmg` (macOS Drag-and-Drop installer)
- `CashBook-<version>-mac.zip` (macOS archive)
- `latest-mac.yml` (Auto-update metadata)

---

## Auto-Update Workflow

The application is configured to receive updates published to the GitHub repository:

1. **Check for Updates**: On startup (or triggered from the Settings page), the app checks `https://github.com/Shubh-27/cashbook/releases/latest`.
2. **Download in Background**: `electron-updater` downloads the update asset and streams progress events (`update-download-progress`) to the UI.
3. **Install on Exit or Prompt**: When downloaded (`update-downloaded`), the user can click **Restart & Install** to stop the backend cleanly and apply the update.

For step-by-step instructions on making an internet release, consult the [.agent/workflows/auto-update.md](file:///.agent/workflows/auto-update.md) workflow.

---

## Security Model

CashBook follows Electron security best practices:
- **`nodeIntegration: false`**: Renderer cannot access Node.js runtime functions directly.
- **`contextIsolation: true`**: Scripts in the renderer run in an isolated execution context.
- **`webSecurity: true`**: Enforces strict web security policies.
- **Sanitized IPC**: Communication between frontend and main process is limited to explicit channels exposed in `preload.js`.

---

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
