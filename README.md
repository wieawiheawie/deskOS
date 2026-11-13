# DeskOS Desktop

DeskOS is an installable Progressive Web App (PWA) desktop environment experiment. When installed by ChromeOS/Chrome, it opens in a standalone app window without normal browser tabs or the address bar. The browser engine still runs underneath; this is not a native executable or a replacement for ChromeOS.

## Included in this build

- Desktop, launcher and dock/taskbar
- Draggable, resizable, minimisable and maximisable app windows
- Virtual file manager with folders, text files, import and export
- Notes with local autosave
- Calculator with arithmetic expression parsing
- Simulated terminal with built-in commands (not a device shell)
- Settings, accent colours, workspace backup and reset
- Browser capability checks
- PWA manifest and service worker for offline app-shell caching
- GitHub Actions workflow that type-checks, compiles and deploys to GitHub Pages

The desktop makes no analytics calls or external API requests. Fonts use local system fallbacks. GitHub Pages is needed to publish the app and install it initially; after the app shell is cached, it can launch offline, subject to school browser policy.

## Publish from GitHub without a terminal

1. Create a new GitHub repository named `deskos` (a public repository is the simplest option for GitHub Pages on a free account; do not publish private or sensitive data in it).
2. Extract the downloaded project ZIP on your Chromebook.
3. In the Chromebook Files app, press **Ctrl + . (period)** to show hidden files so you can see the `.github` folder. In the new repository, choose **Add file → Upload files** and upload the *contents* of the extracted `deskos-pwa` folder, including `.github/workflows/deploy.yml`.
4. Commit the upload to the `main` branch.
5. Open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
6. Open the **Actions** tab. Wait for **Build and deploy DeskOS** to complete successfully.
7. Open the GitHub Pages URL shown by the deployment. The URL normally looks like `https://YOUR-USERNAME.github.io/deskos/`.

GitHub's documented Pages workflow uses an Actions build, the Pages artifact upload action and a deployment job with `pages: write` and `id-token: write` permissions.

## Install on ChromeOS

1. Open the deployed GitHub Pages URL in Chrome while online.
2. Wait for DeskOS to finish loading and for the service worker to register.
3. Open Chrome's menu → **Cast, save and share** → **Install page as app**. Chrome may also show an Install icon in the address bar.
4. Launch **DeskOS** from the Chromebook Launcher. The installed app should open in a separate window without tabs or an address bar.
5. Open DeskOS once online before testing offline. The service worker caches the compiled app shell.

If the install option is missing or says it is blocked, your school's Chromebook policy may prohibit installing web apps. DeskOS cannot override that restriction. You can still use the hosted URL as a normal tab if the site is permitted.

## Build locally (optional)

Requires Node.js 24 or later:

```sh
npm install
npm run typecheck
npm run build
```

The compiled static app is created in `dist/`. The build uses the TypeScript compiler and a small Node.js packaging script; it does not start a development server.

## Storage notes

The demo's virtual files, notes and settings use browser local storage. School policy, private browsing, profile cleanup or storage quotas may restrict persistence. The file import demo is limited to 3 MB per file and 3 MB is a deliberate safety limit for this lightweight prototype.
