'use strict';

// To enable Apple signing and notarization once you have an Apple Developer ID:
// 1. Add repository secrets: CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID,
//    APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
// 2. Set MAC_SIGNING=true in CI (.github/workflows/release.yml or repo variables)
// 3. Set MAC_SIGNED = true in electron/main.js

const isMacSigning = process.env.MAC_SIGNING === 'true';

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.cashbook.manager',
  productName: 'CashBook',
  copyright: 'Copyright © 2026',
  asar: true,
  publish: [
    {
      provider: 'github',
      owner: 'Shubh-27',
      repo: 'cashbook',
      releaseType: 'release',
    },
  ],
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    icon: 'assets/icon.png',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['arm64'],
      },
      {
        target: 'zip',
        arch: ['arm64'],
      },
    ],
    artifactName: '${productName}-${version}-${arch}.${ext}',
    icon: 'assets/icon.png',
    category: 'public.app-category.finance',
    ...(isMacSigning
      ? {
          hardenedRuntime: true,
          gatekeeperAssess: false,
          entitlements: 'entitlements.mac.plist',
          entitlementsInherit: 'entitlements.mac.inherit.plist',
          notarize: {
            teamId: process.env.APPLE_TEAM_ID,
          },
        }
      : {
          identity: null,
          hardenedRuntime: false,
          notarize: false,
        }),
  },
  dmg: {
    contents: [
      {
        x: 130,
        y: 220,
      },
      {
        x: 410,
        y: 220,
        type: 'link',
        path: '/Applications',
      },
    ],
  },
  extraResources: [
    {
      from: 'resources/api',
      to: 'api',
      filter: [
        '**/*',
        '!**/appsettings.Development.json',
        '!**/*.db',
        '!**/*.db-shm',
        '!**/*.db-wal',
        '!**/*.bak',
        '!**/*.pdb',
      ],
    },
  ],
  files: ['main.js', 'preload.js', 'ui/**/*', 'assets/**/*'],
  directories: {
    output: 'dist',
  },
};
