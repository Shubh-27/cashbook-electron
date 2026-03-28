# Cashbook Electron Shell

The desktop environment for the Cashbook application, which hosts the React frontend and facilitates communication with the operating system and backend API.

## Features

- **Main Process**: Managed by `main.js`, which handles window creation and application lifecycle events.
- **Preload Script**: Uses `preload.js` for secure IPC communication between the renderer (React) and the main process.
- **Auto-Updates**: Integrated via `electron-updater` for seamless application updates.
- **Distribution**: Packaged using `electron-builder` for Windows and macOS.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)

### Running the Shell

From the root project:

```bash
npm run dev:electron
```

Or from the `electron` directory:

```bash
npm install
npm start
```

Note: The shell requires the backend API (at `http://localhost:5050`) and the frontend (at `http://localhost:5173`) to be running to display the application content.

## Build and Distribution

The shell is configured for distribution with the following settings:

- **App ID**: `com.cashbook.manager`
- **Product Name**: `CashBook`
- **Supported Platforms**: Windows (`nsis`), macOS (`dmg`, `zip`)

To build the distribution packages:

```bash
npm run dist
```

Output files will be generated in the `dist/` directory.

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
