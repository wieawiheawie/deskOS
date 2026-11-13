# DeskOS Desktop

DeskOS is a browser-powered desktop environment published as a static Progressive Web App. It can run as a normal website tab; a separate app window is only available when the browser or device administrator allows PWA installation. It is not a native operating system and does not replace ChromeOS.

## DeskOS 0.2.0

- Desktop, launcher, dock/taskbar and draggable application windows
- My Files virtual workspace with folders, import and export
- Larger workspace storage using IndexedDB, with localStorage as a small-workspace fallback
- Notes, calculator, settings, appearance controls and simulated demo terminal
- Internet window with URL/search bar, shortcuts and embedded-page viewing where the target site permits framing
- Downloads window for opening direct file URLs through Chrome and importing CORS-enabled files into DeskOS
- Game Hub with browser-game directories
- App Library with web apps and online tools
- PWA manifest, service worker and offline shell caching
- GitHub Actions workflow that type-checks, compiles and deploys to GitHub Pages

## Internet and website limits

The Internet window is a lightweight web viewer, not a replacement for a full browser engine. Many popular websites send security headers such as `X-Frame-Options` or CSP `frame-ancestors` that prevent them from being displayed inside an iframe. When a site refuses embedded display, use the external/open-in-browser control or a link in the App Library. School network filters and website account policies still apply.

## Downloads and files

- **Download to Chromebook** opens the supplied HTTP/HTTPS URL in Chrome. Chrome decides whether to download or display it, and where to save it.
- **Import into DeskOS** fetches a file into the virtual `/Home/Downloads` folder. It only works if the file host permits cross-origin browser requests (CORS). The per-file import limit is 40 MB.
- The Files app can also import files selected from the Chromebook's file picker. Export creates a browser download.
- DeskOS does not scan downloads for malware. Only download files from sources you trust.

A web app cannot install or execute arbitrary Windows, macOS, Linux, or Android programs. Browser games and web apps work only if their providers support browsers and are allowed by the school network. Native games and desktop programs still require a compatible native runtime.

## Privacy and storage

DeskOS makes no analytics calls. The Internet and catalogue apps connect only when the user opens an address, follows a site link, or imports a download. Virtual files and notes are stored in the current browser profile using IndexedDB and localStorage where allowed. Browser cleanup, private browsing, storage limits, or school policy can remove or restrict that data. Do not store sensitive or irreplaceable files only in DeskOS; export workspace backups regularly.

## Build and deploy

The project uses TypeScript and a small Node build script; it does not require a local development server.

```sh
npm install --no-audit --no-fund
npm run typecheck
npm run build
```

The compiled static site is written to `dist/`. Push to `main` to run the GitHub Actions workflow. The workflow type-checks and builds the site, uploads the Pages artifact, and deploys it to GitHub Pages.

## ChromeOS

Open the published Pages URL in Chrome. If PWA installation is permitted, the browser may offer **Install page as app** and launch DeskOS without tabs or the address bar. If the install option is missing or blocked, use the hosted page as a normal browser tab. DeskOS cannot override school administrator restrictions.
