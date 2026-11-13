# DeskOS Desktop

DeskOS 0.3.0 is a browser-powered desktop workspace. The Internet app now provides multi-tab browsing, navigation, selectable search engines, bookmarks, history, recently closed tabs, session restore, private tabs, zoom controls and privacy settings.

## Browser workspace features

- Up to 16 workspace tabs with switching, closing and new-tab controls
- Standard and private tabs; private URLs are not added to DeskOS history or restored sessions
- Address/search bar with DuckDuckGo, Google, Bing and Brave Search
- Back and forward through DeskOS address-bar navigation, reload, stop and home
- Bookmarks bar and manager, JSON bookmark import/export
- Local navigation history with filtering, per-entry deletion and clear history
- Recently closed tabs and session restore
- Page zoom controls and keyboard shortcuts (Ctrl+T, Ctrl+W, Ctrl+L, Ctrl+H, Ctrl+D, Ctrl+Shift+N, Ctrl+Shift+T, Ctrl+Tab, Ctrl+1–9)
- Open-in-Chrome fallback for sites that disallow embedding
- Existing Downloads app, Game Hub and App Library
- IndexedDB-backed virtual files, notes, calculator, desktop windows and offline app shell

## Important browser architecture limits

The Internet app is a browser workspace running inside the existing Chrome browser engine. It is not a new Chromium/Firefox engine and cannot replace Chrome. Website pages are displayed in cross-origin iframes when their security policy allows it. Sites that send `X-Frame-Options` or restrictive Content Security Policy frame directives refuse embedding; DeskOS cannot bypass those protections. Open those sites in Chrome using the external-open button.

History records URL navigations initiated from the DeskOS address bar and quick links. It cannot inspect links clicked inside cross-origin pages, Chrome's native history or downloads. Back/forward follows DeskOS's own navigation list, not a website's internal link history. Use Chrome's native find feature for page text; DeskOS cannot read cross-origin page contents.

Private tabs suppress DeskOS history and session persistence only. They do not hide network traffic from websites, Chrome, school administrators or network providers. Browser permissions and safe browsing enforcement remain the responsibility of ChromeOS and Chrome.

## Downloads

- Download-to-device actions open URLs through Chrome. Chrome decides whether a URL is downloaded or displayed.
- Import to DeskOS requires the file host to permit CORS and is limited to 40 MB per file.
- DeskOS cannot inspect ChromeOS's native download manager, scan files for malware, or install arbitrary EXE, APK, DEB, MSI or native game files.
- Only download files from sources you trust.

## Build and deploy

The project uses TypeScript and a static packaging script; no local web development server is needed.

```sh
npm install --no-audit --no-fund
npm run typecheck
npm run build
```

The output is created in `dist/`. Push to `main` to run GitHub Actions and deploy the Pages artifact. The service worker cache is versioned to refresh browser modules.

## Privacy

Bookmarks, history, preferences and saved standard-tab sessions are stored in the current browser profile using localStorage. Private tab URLs are not written to DeskOS history/session storage. Browser cleanup, private browsing mode, storage limits or school policy can remove/restrict this data. Do not store sensitive information or rely on DeskOS as the only copy of important data.
