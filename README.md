# QA Checklist

A local web app for creating and running manual QA checklists. Built with Vue 3, TypeScript, Vite, Vuetify 3, Pinia, and Vue Router, with a Material Design interface in English and French. No backend or external service is required.

## Features

- Organize checklists into categories, with options to add and rename categories.
- Create, edit, and delete checklists and test cases.
- Describe each test case with a title, description, and expected results displayed as bullet points.
- Track **Passed**, **Failed**, or **Not run** results, and reset a checklist for another test run.
- Import and export individual checklists or the complete workspace as JSON.
- Use a responsive layout on desktop and mobile.
- Switch languages with the selector in the top-right corner. Your choice is remembered in this browser.

## Run locally

Requires Node.js **22.12 or later** and npm.

```sh
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Changes reload automatically during development.

## Local file storage

In **Chrome or Edge**, click **Choose Documents folder**, select Documents or its QAChecklist subfolder, and grant file access. The app then saves changes automatically to:

```text
Documents/QAChecklist/checklists.json
```

The previous version is kept in `checklists.previous.json`. Wait for the saved status before closing the app.

Until a folder is connected, data is stored only in the browser's localStorage. Clearing browser data does not delete external JSON files: reconnect the same folder to restore your checklists. Folder access may need to be authorized again when switching between development and Docker. Manual JSON import/export is also available.

## Docker Desktop

With Git and Docker Desktop installed, and the application committed to the local `master` branch, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-docker.ps1 -OpenBrowser
```

The script builds `master` and starts the app at [http://localhost:8080](http://localhost:8080). See the [Docker guide](docs/DOCKER.md) for details.

## Checks

UI translations are maintained in `src/locales/en.json` and `src/locales/fr.json`. Switching languages preserves user-written checklist content.

```sh
npm run lint
npm run type-check
npm run test
npm run build
```
