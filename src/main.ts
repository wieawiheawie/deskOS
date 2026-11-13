import { networkAppBody, wireNetworkApp, type NetworkAppId, type WorkspaceDownload } from './network-apps.js';

type AppId = 'files' | 'notes' | 'calculator' | 'terminal' | 'settings' | 'system' | 'about' | NetworkAppId;
type VirtualFile = { id: string; name: string; path: string; type: string; content: string; folder: boolean; modified: number; size: number };
type WindowRecord = { id: string; app: AppId; element: HTMLElement; minimized: boolean; maximized: boolean; previous: { left: string; top: string; width: string; height: string } | null };

const $ = <T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T => {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing UI element: ${selector}`);
  return node;
};
const escapeHtml = (value: unknown): string => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
const bytes = (n: number): string => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const APP_META: Record<AppId, { name: string; icon: string; size: [number, number] }> = {
  files: { name: 'My Files', icon: '📁', size: [650, 430] },
  notes: { name: 'Notes', icon: '📝', size: [590, 440] },
  calculator: { name: 'Calculator', icon: '🧮', size: [340, 455] },
  terminal: { name: 'Terminal', icon: '⌘', size: [600, 390] },
  settings: { name: 'Settings', icon: '⚙️', size: [610, 440] },
  system: { name: 'System Check', icon: '🛠️', size: [570, 430] },
  about: { name: 'About DeskOS', icon: '◇', size: [530, 410] },
  browser: { name: 'Internet', icon: '🌐', size: [860, 590] },
  downloads: { name: 'Downloads', icon: '⬇️', size: [650, 560] },
  games: { name: 'Game Hub', icon: '🎮', size: [690, 550] },
  store: { name: 'App Library', icon: '▦', size: [690, 550] }
};
const APP_IDS = Object.keys(APP_META) as AppId[];
const STORAGE_FILES = 'deskos.files.v1';
const STORAGE_NOTES = 'deskos.notes.v1';
const STORAGE_SETTINGS = 'deskos.settings.v1';
let windows: WindowRecord[] = [];
let zCounter = 10;
let windowCounter = 0;
let activePath = '/Home';
let selectedFileId: string | null = null;
let toastTimer = 0;
let installPrompt: BeforeInstallPromptEvent | null = null;
let fileSystem: VirtualFile[] = loadFiles();
let settings = loadSettings();

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function loadFiles(): VirtualFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_FILES);
    if (raw) return JSON.parse(raw) as VirtualFile[];
  } catch { /* local storage may be disabled by policy */ }
  return [
    { id: 'folder-documents', name: 'Documents', path: '/Home', type: 'folder', content: '', folder: true, modified: Date.now(), size: 0 },
    { id: 'folder-pictures', name: 'Pictures', path: '/Home', type: 'folder', content: '', folder: true, modified: Date.now(), size: 0 },
    { id: 'welcome-readme', name: 'Welcome.txt', path: '/Home', type: 'text/plain', content: 'Welcome to DeskOS!\n\nThis is your own little desktop environment.\n\nTry the Notes app, open the calculator, or add files in My Files.\n\nYour virtual files are stored in this browser profile when local storage is allowed.\n\nDeskOS is a desktop-style app running on the browser platform. It does not replace ChromeOS.', folder: false, modified: Date.now(), size: 302 },
    { id: 'system-info', name: 'System info.txt', path: '/Home/Documents', type: 'text/plain', content: 'DeskOS Desktop\nBuild 0.1.0\nRuntime: browser app window\nStorage: local browser storage\nNetwork: not required after first successful load', folder: false, modified: Date.now(), size: 117 }
  ];
}
const STORAGE_DB_NAME = 'deskos-workspace';
async function openStorageDatabase(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('state')) request.result.createObjectStore('state'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB could not be opened.'));
  });
}
async function readFilesFromDatabase(): Promise<VirtualFile[] | null> {
  const db = await openStorageDatabase();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly');
    const request = tx.objectStore('state').get(STORAGE_FILES);
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as VirtualFile[] : null);
    request.onerror = () => reject(request.error || new Error('Could not read workspace files.'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not read workspace files.')); };
  });
}
async function writeFilesToDatabase(): Promise<void> {
  const db = await openStorageDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put(fileSystem, STORAGE_FILES);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not save workspace files.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Workspace save was cancelled.')); };
  });
}
async function hydrateFilesFromIndexedDB(): Promise<void> {
  if (!('indexedDB' in window)) return;
  try {
    const stored = await readFilesFromDatabase();
    if (stored) fileSystem = stored;
    else await writeFilesToDatabase();
    const saveState = document.querySelector<HTMLElement>('#saveState');
    if (saveState) saveState.textContent = 'Saved locally';
  } catch {
    const saveState = document.querySelector<HTMLElement>('#saveState');
    if (saveState) saveState.textContent = 'Browser storage limited';
  }
}
function saveFiles(): boolean {
  let localSaved = false;
  const estimatedContentSize = fileSystem.reduce((total, item) => total + item.content.length, 0);
  if (estimatedContentSize < 3_000_000) {
    try { localStorage.setItem(STORAGE_FILES, JSON.stringify(fileSystem)); localSaved = true; } catch { /* larger workspaces use IndexedDB */ }
  } else {
    try { localStorage.removeItem(STORAGE_FILES); } catch { /* IndexedDB remains the primary store */ }
  }
  if ('indexedDB' in window) {
    void writeFilesToDatabase().then(() => {
      const saveState = document.querySelector<HTMLElement>('#saveState');
      if (saveState) saveState.textContent = 'Saved locally';
    }).catch(() => {
      const saveState = document.querySelector<HTMLElement>('#saveState');
      if (saveState) saveState.textContent = localSaved ? 'Saved locally' : 'Storage restricted';
    });
    return true;
  }
  $('#saveState').textContent = localSaved ? 'Saved locally' : 'Storage restricted';
  return localSaved;
}
function loadSettings(): { accent: string } {
  try { return { accent: JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || '{}').accent || '#7898ff' }; }
  catch { return { accent: '#7898ff' }; }
}
function saveSettings(): void {
  try { localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)); } catch { showToast('Settings could not be saved by this browser profile.'); }
}
function showToast(message: string): void {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2500);
}
function currentTime(): string { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
function updateClock(): void {
  const t = currentTime(); $('#clock').textContent = t; $('#lockTime').textContent = t;
}
function updateConnection(): void {
  const online = navigator.onLine;
  $('#connectionText').textContent = online ? 'Online' : 'Offline';
  $('.connection-pill').classList.toggle('offline', !online);
}
function markSaveState(saved: boolean): void {
  $('#saveState').textContent = saved ? 'Saved locally' : 'Storage restricted';
}

function appBody(app: AppId): string {
  switch (app) {
    case 'files': return `
      <div class="app-shell"><div class="files-layout"><aside class="files-sidebar"><div class="side-caption">FAVOURITES</div><button class="side-link active" data-folder="/Home">🏠 Home</button><button class="side-link" data-folder="/Home/Documents">📄 Documents</button><button class="side-link" data-folder="/Home/Pictures">🖼️ Pictures</button><div class="side-caption" style="margin-top:14px">STORAGE</div><button class="side-link" data-folder="/Home">💾 Local files</button></aside><section class="files-main"><div class="files-path"><span>⌂</span><span id="filePath">/ Home</span><span class="grow"></span><span class="muted small" id="fileCount"></span></div><div class="file-actions"><button class="mini-button" data-action="new-file">＋ New file</button><button class="mini-button" data-action="new-folder">＋ Folder</button><button class="mini-button" data-action="upload">↑ Import</button><button class="mini-button" data-action="download" id="downloadSelected" disabled>↓ Export</button><input class="hidden-file-input" id="fileImport" type="file" multiple /></div><div class="file-list" id="fileList"></div></section></div></div>`;
    case 'notes': return `<div class="notes-wrap"><div class="notes-meta"><input class="notes-title" id="noteTitle" value="My first note" aria-label="Note title" /><span class="notes-status" id="noteStatus">Ready</span></div><textarea class="notes-area" id="noteBody" spellcheck="true" placeholder="Start typing…"></textarea><div class="notes-meta"><span class="muted small">Autosaves on this device when browser storage is allowed.</span><span class="grow"></span><button class="mini-button" data-action="clear-note">Clear</button></div></div>`;
    case 'calculator': return `<div class="calc-wrap"><div class="calc-display"><div class="calc-expression" id="calcExpression">Ready</div><div class="calc-result" id="calcResult">0</div></div><div class="calc-keys">${['AC','⌫','%','÷','7','8','9','×','4','5','6','−','1','2','3','+','±','0','.','='].map((key) => `<button class="${['÷','×','−','+','%'].includes(key) ? 'operator' : ''} ${key === '=' ? 'equal' : ''}" data-key="${key}">${key}</button>`).join('')}</div></div>`;
    case 'terminal': return `<div class="terminal-wrap"><div class="terminal-output" id="terminalOutput"><span class="good">DeskOS Terminal [simulated]</span>\n<span class="dim">This is a built-in command console, not a system shell.</span>\nType <b>help</b> to see available commands.\n\n</div><form class="terminal-input-line" id="terminalForm"><span>guest@deskos:~$</span><input id="terminalInput" class="terminal-input" autocomplete="off" spellcheck="false" aria-label="Terminal command" /></form></div>`;
    case 'settings': return `<div class="settings-layout"><nav class="settings-nav"><button class="side-link active" data-settings="appearance">🎨 Appearance</button><button class="side-link" data-settings="storage">💾 Storage</button><button class="side-link" data-settings="about">ℹ️ About</button></nav><section class="settings-content" id="settingsContent"></section></div>`;
    case 'system': return `<div class="system-content"><h3>Device compatibility</h3><p>DeskOS checks normal browser capabilities. It does not change device settings or bypass school restrictions.</p><div class="status-list" id="systemChecks"></div><div class="system-actions"><button class="primary-button" data-action="install-app">Install DeskOS</button><button class="secondary-button" data-action="run-checks">Run checks again</button><button class="secondary-button" data-action="storage-test">Test local save</button></div><div class="system-note">For offline use, open DeskOS once while connected so its app shell can be cached. A school administrator may disable installation, storage or offline features.</div></div>`;
    case 'about': return `<div class="about-hero"><div class="about-logo">◇</div><h2>DeskOS Desktop</h2><p>A browser-powered desktop environment.<br/>Build 0.2.0 · Internet and downloads edition</p></div><div class="about-panel"><h3>What this is</h3><p>DeskOS now includes an Internet window, direct downloads, a game hub and a web app library. ChromeOS and the browser still provide the underlying runtime.</p></div><div class="about-panel"><h3>Files and privacy</h3><p>Your workspace is stored in this browser profile using local storage and IndexedDB when available. Downloading to the Chromebook is handled by Chrome itself.</p></div><div class="about-panel"><h3>Platform limits</h3><p>DeskOS cannot run arbitrary Windows, Mac or Linux programs, bypass school restrictions, or access protected system hardware. Some websites block embedded viewing or downloads.</p></div>`;
    case 'browser': case 'downloads': case 'games': case 'store': return networkAppBody(app);
  }
}

function openApp(app: AppId): void {
  const existing = windows.find((win) => win.app === app);
  if (existing) { restoreWindow(existing); focusWindow(existing); closeStartMenu(); return; }
  const meta = APP_META[app];
  const id = `window-${++windowCounter}`;
  const element = document.createElement('section');
  element.className = 'window'; element.dataset.windowId = id;
  const cascade = (windowCounter - 1) % 6;
  const [w, h] = meta.size;
  const maxW = Math.max(300, window.innerWidth - 30); const maxH = Math.max(210, window.innerHeight - 140);
  const left = Math.max(8, Math.round((window.innerWidth - Math.min(w, maxW)) / 2) + cascade * 20 - 35);
  const top = Math.max(8, Math.round((window.innerHeight - Math.min(h, maxH)) / 2) - 22 + cascade * 13);
  element.style.left = `${left}px`; element.style.top = `${top}px`; element.style.width = `${Math.min(w, maxW)}px`; element.style.height = `${Math.min(h, maxH)}px`;
  element.innerHTML = `<header class="window-titlebar"><div class="window-title"><span class="app-emoji">${meta.icon}</span><span>${escapeHtml(meta.name)}</span></div><div class="window-controls"><button class="window-control" data-window-action="minimize" title="Minimise" aria-label="Minimise">−</button><button class="window-control" data-window-action="maximize" title="Maximise" aria-label="Maximise">□</button><button class="window-control close" data-window-action="close" title="Close" aria-label="Close">×</button></div></header><div class="window-content">${appBody(app)}</div>`;
  $('#windowLayer').append(element);
  const record: WindowRecord = { id, app, element, minimized: false, maximized: false, previous: null };
  windows.push(record); focusWindow(record); attachWindowEvents(record); wireApp(record); updateDock(); closeStartMenu();
}
function focusWindow(record: WindowRecord): void {
  windows.forEach((win) => win.element.classList.toggle('focused', win.id === record.id));
  record.element.style.zIndex = String(++zCounter);
  if (record.minimized) restoreWindow(record);
}
function restoreWindow(record: WindowRecord): void { record.minimized = false; record.element.classList.remove('minimized'); }
function closeWindow(record: WindowRecord): void {
  record.element.remove(); windows = windows.filter((win) => win.id !== record.id); updateDock();
  const next = [...windows].filter((win) => !win.minimized).sort((a, b) => Number(b.element.style.zIndex) - Number(a.element.style.zIndex))[0];
  if (next) focusWindow(next);
}
function updateDock(): void {
  document.querySelectorAll<HTMLButtonElement>('.dock-app[data-app]').forEach((button) => {
    const app = button.dataset.app as AppId; button.classList.toggle('running', windows.some((win) => win.app === app));
  });
}
function toggleMaximize(record: WindowRecord): void {
  if (!record.maximized) {
    record.previous = { left: record.element.style.left, top: record.element.style.top, width: record.element.style.width, height: record.element.style.height };
    record.element.classList.add('maximized'); record.maximized = true;
  } else {
    record.element.classList.remove('maximized'); record.maximized = false;
    if (record.previous) Object.assign(record.element.style, record.previous);
  }
}
function attachWindowEvents(record: WindowRecord): void {
  const el = record.element;
  el.addEventListener('pointerdown', () => focusWindow(record));
  $('.window-controls', el).addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-window-action]'); if (!button) return;
    const action = button.dataset.windowAction;
    if (action === 'close') closeWindow(record);
    if (action === 'minimize') { record.minimized = true; el.classList.add('minimized'); }
    if (action === 'maximize') toggleMaximize(record);
  });
  const bar = $('.window-titlebar', el);
  bar.addEventListener('dblclick', (event) => { if (!(event.target as HTMLElement).closest('.window-controls')) toggleMaximize(record); });
  bar.addEventListener('pointerdown', (event) => {
    const pointer = event as PointerEvent;
    if (pointer.button !== 0 || (pointer.target as HTMLElement).closest('.window-controls') || record.maximized) return;
    focusWindow(record);
    const rect = el.getBoundingClientRect(); const startX = pointer.clientX; const startY = pointer.clientY; const left = rect.left; const top = rect.top;
    bar.setPointerCapture(pointer.pointerId);
    const move = (e: PointerEvent) => {
      el.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, left + e.clientX - startX))}px`;
      el.style.top = `${Math.max(35, Math.min(window.innerHeight - 75, top + e.clientY - startY))}px`;
    };
    const end = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', end); bar.removeEventListener('pointercancel', end); };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
  });
}
function wireApp(record: WindowRecord): void {
  const root = record.element;
  if (record.app === 'files') wireFiles(root);
  if (record.app === 'notes') wireNotes(root);
  if (record.app === 'calculator') wireCalculator(root);
  if (record.app === 'terminal') wireTerminal(root);
  if (record.app === 'settings') wireSettings(root);
  if (record.app === 'system') wireSystem(root);
  if (record.app === 'browser' || record.app === 'downloads' || record.app === 'games' || record.app === 'store') {
    wireNetworkApp(record.app, root, showToast, (file: WorkspaceDownload) => saveDownloadedFile(file));
  }
}

function saveDownloadedFile(file: WorkspaceDownload): void {
  const downloadsPath = '/Home/Downloads';
  if (!fileSystem.some((item) => item.folder && item.path === '/Home' && item.name === 'Downloads')) {
    fileSystem.push({ id: 'folder-downloads', name: 'Downloads', path: '/Home', type: 'folder', content: '', folder: true, modified: Date.now(), size: 0 });
  }
  fileSystem.push({ id: `download-${crypto.randomUUID?.() || Date.now()}`, name: file.name, path: downloadsPath, type: file.type, content: file.content, folder: false, modified: Date.now(), size: file.size });
  saveFiles();
  showToast(`Saved ${file.name} in My Files / Downloads.`);
}

function renderFiles(root: HTMLElement): void {
  $('#filePath', root).textContent = activePath.replaceAll('/', ' / ').trim() || '/ Home';
  const visible = fileSystem.filter((file) => file.path === activePath).sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name));
  $('#fileCount', root).textContent = `${visible.length} item${visible.length === 1 ? '' : 's'}`;
  $('#fileList', root).innerHTML = visible.length ? visible.map((file) => `<button class="file-card ${file.id === selectedFileId ? 'selected' : ''}" data-file-id="${escapeHtml(file.id)}"><span class="file-emoji">${file.folder ? '📁' : file.type.startsWith('image/') ? '🖼️' : file.type.includes('pdf') ? '📕' : '📄'}</span><b>${escapeHtml(file.name)}</b><small>${file.folder ? 'Folder' : bytes(file.size)}</small></button>`).join('') : `<div class="empty-state">This folder is empty.<br/>Create a file or import something from your device.</div>`;
  const selected = fileSystem.find((f) => f.id === selectedFileId);
  const button = $('#downloadSelected', root) as HTMLButtonElement; button.disabled = !selected || selected.folder;
  root.querySelectorAll<HTMLElement>('[data-folder]').forEach((item) => item.classList.toggle('active', item.dataset.folder === activePath));
}
function wireFiles(root: HTMLElement): void {
  activePath = '/Home'; selectedFileId = null; renderFiles(root);
  root.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const folder = target.closest<HTMLElement>('[data-folder]');
    if (folder?.dataset.folder) { activePath = folder.dataset.folder; selectedFileId = null; renderFiles(root); return; }
    const card = target.closest<HTMLElement>('[data-file-id]');
    if (card?.dataset.fileId) {
      const file = fileSystem.find((f) => f.id === card.dataset.fileId); if (!file) return;
      if (file.folder) { activePath = `${file.path}/${file.name}`; selectedFileId = null; renderFiles(root); }
      else { selectedFileId = file.id; renderFiles(root); showFilePreview(file); }
      return;
    }
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'new-file') showDialog('Create a file', 'Choose a name for the new text file.', 'New file.txt', (name) => {
      if (!validNewName(name, activePath)) return false;
      fileSystem.push({ id: `file-${crypto.randomUUID?.() || Date.now()}`, name, path: activePath, type: 'text/plain', content: '', folder: false, modified: Date.now(), size: 0 }); saveFiles(); renderFiles(root); return true;
    });
    if (action === 'new-folder') showDialog('Create a folder', 'Choose a name for the folder.', 'New folder', (name) => {
      if (!validNewName(name, activePath)) return false;
      fileSystem.push({ id: `folder-${Date.now()}`, name, path: activePath, type: 'folder', content: '', folder: true, modified: Date.now(), size: 0 }); saveFiles(); renderFiles(root); return true;
    });
    if (action === 'upload') $('#fileImport', root).click();
    if (action === 'download') { const file = fileSystem.find((f) => f.id === selectedFileId); if (file && !file.folder) downloadFile(file); }
  });
  $('#fileImport', root).addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    for (const file of files) {
      if (file.size > 40 * 1024 * 1024) { showToast(`${file.name} is over the 40 MB DeskOS import limit. Use Chromebook downloads for larger files.`); continue; }
      let content = '';
      if (file.type.startsWith('text/') || /\.(md|json|csv|js|ts|css|html|xml|yaml|yml)$/i.test(file.name)) content = await file.text();
      else content = await readDataUrl(file);
      fileSystem.push({ id: `import-${Date.now()}-${Math.random().toString(16).slice(2)}`, name: file.name, path: activePath, type: file.type || 'application/octet-stream', content, folder: false, modified: Date.now(), size: file.size });
    }
    saveFiles(); renderFiles(root); input.value = ''; if (files.length) showToast(`Imported ${files.length} file${files.length === 1 ? '' : 's'}.`);
  });
}
function validNewName(name: string, path: string): boolean {
  const cleaned = name.trim(); if (!cleaned || cleaned.includes('/') || cleaned.includes('\\')) { showToast('Enter a simple name without slashes.'); return false; }
  if (fileSystem.some((f) => f.path === path && f.name.toLowerCase() === cleaned.toLowerCase())) { showToast('An item with that name already exists.'); return false; }
  return true;
}
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
}
function downloadFile(file: VirtualFile): void {
  let blob: Blob;
  if (file.content.startsWith('data:')) { const [header, base64] = file.content.split(','); const mime = header.match(/data:([^;]+)/)?.[1] || file.type; const binary = atob(base64 || ''); const bytesArray = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytesArray[i] = binary.charCodeAt(i); blob = new Blob([bytesArray], { type: mime }); }
  else blob = new Blob([file.content], { type: file.type || 'text/plain' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.click(); URL.revokeObjectURL(url); showToast(`Exported ${file.name}.`);
}
function showFilePreview(file: VirtualFile): void {
  const overlay = document.createElement('div'); overlay.className = 'dialog-backdrop';
  let preview = escapeHtml(file.content.slice(0, 3000));
  if (file.content.startsWith('data:image/')) preview = `<img src="${file.content}" alt="${escapeHtml(file.name)}" style="max-width:100%;max-height:190px;object-fit:contain;border-radius:8px" />`;
  else if (file.content.startsWith('data:')) preview = 'This file is stored in your virtual workspace. Export it to open it with a device app.';
  overlay.innerHTML = `<div class="dialog"><h3>${escapeHtml(file.name)}</h3><p>${file.folder ? 'Folder' : `${escapeHtml(file.type)} · ${bytes(file.size)}`}</p><div style="max-height:190px;overflow:auto;padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(0,0,0,.16);font:10px/1.6 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere">${preview || '<span class="muted">This file is empty.</span>'}</div><div class="dialog-actions"><button class="secondary-button" data-dialog-close>Close</button><button class="primary-button" data-file-download>Export file</button></div></div>`;
  $('#desktop').append(overlay); overlay.addEventListener('click', (event) => { const t = event.target as HTMLElement; if (t === overlay || t.closest('[data-dialog-close]')) overlay.remove(); if (t.closest('[data-file-download]')) { downloadFile(file); overlay.remove(); } });
}
function wireNotes(root: HTMLElement): void {
  const stored = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_NOTES) || '{}') as { title?: string; body?: string }; } catch { return {}; } })();
  const title = $('#noteTitle', root) as HTMLInputElement; const body = $('#noteBody', root) as HTMLTextAreaElement; const status = $('#noteStatus', root);
  title.value = stored.title || 'My first note'; body.value = stored.body || 'Welcome to DeskOS Notes.\n\nThis note is saved locally as you type.';
  let timer = 0;
  const save = () => { window.clearTimeout(timer); status.textContent = 'Saving…'; timer = window.setTimeout(() => { try { localStorage.setItem(STORAGE_NOTES, JSON.stringify({ title: title.value, body: body.value })); status.textContent = 'Saved'; markSaveState(true); } catch { status.textContent = 'Storage blocked'; markSaveState(false); } }, 220); };
  title.addEventListener('input', save); body.addEventListener('input', save);
  root.addEventListener('click', (event) => { if ((event.target as HTMLElement).closest('[data-action="clear-note"]')) { title.value = 'Untitled note'; body.value = ''; save(); body.focus(); } });
}

function calculate(expression: string): number {
  const tokens: string[] = []; const regex = /\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:([eE][+-]?\d+))?|([()+\-*/%^]))/gy; let position = 0;
  while (position < expression.length) { regex.lastIndex = position; const match = regex.exec(expression); if (!match) throw new Error('Invalid expression'); tokens.push(match[1] ? match[1] + (match[2] || '') : match[3]); position = regex.lastIndex; }
  let index = 0; const peek = () => tokens[index]; const take = () => tokens[index++];
  const primary = (): number => { const token = take(); if (token === '(') { const value = expr(); if (take() !== ')') throw new Error('Missing )'); return value; } if (token === undefined || !/^\d/.test(token) && !/^\.\d/.test(token)) throw new Error('Expected a number'); return Number(token); };
  const power = (): number => { const left = primary(); if (peek() === '^') { take(); return left ** unary(); } return left; };
  const unary = (): number => { if (peek() === '+') { take(); return unary(); } if (peek() === '-') { take(); return -unary(); } return power(); };
  const term = (): number => { let value = unary(); while (['*','/','%'].includes(peek() || '')) { const op = take(); const right = unary(); if ((op === '/' || op === '%') && right === 0) throw new Error('Cannot divide by zero'); value = op === '*' ? value * right : op === '/' ? value / right : value % right; } return value; };
  const expr = (): number => { let value = term(); while (peek() === '+' || peek() === '-') { const op = take(); const right = term(); value = op === '+' ? value + right : value - right; } return value; };
  if (!tokens.length) return 0; const result = expr(); if (index !== tokens.length || !Number.isFinite(result)) throw new Error('Invalid result'); return result;
}
function wireCalculator(root: HTMLElement): void {
  let expression = ''; let result = '0';
  const refresh = (hint = '') => { $('#calcExpression', root).textContent = hint || expression || 'Ready'; $('#calcResult', root).textContent = result; };
  root.addEventListener('click', (event) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-key]')?.dataset.key; if (!key) return;
    if (key === 'AC') { expression = ''; result = '0'; }
    else if (key === '⌫') { expression = expression.slice(0, -1); result = expression || '0'; }
    else if (key === '±') { expression = expression.startsWith('-') ? expression.slice(1) : `-${expression}`; result = expression; }
    else if (key === '=') { try { const value = calculate(expression.replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-')); result = String(Number(value.toPrecision(11))); refresh(expression + ' ='); expression = result; return; } catch { result = 'Error'; refresh('Check the expression'); expression = ''; return; } }
    else { const map: Record<string,string> = { '×':'*','÷':'/','−':'-' }; expression += map[key] || key; result = expression; }
    refresh();
  });
}
function wireTerminal(root: HTMLElement): void {
  const output = $('#terminalOutput', root); const form = $('#terminalForm', root) as HTMLFormElement; const input = $('#terminalInput', root) as HTMLInputElement;
  const write = (text: string) => { const line = document.createElement('div'); line.textContent = text; output.append(line); output.scrollTop = output.scrollHeight; };
  const commands: Record<string, (args: string[]) => string> = {
    help: () => 'Available commands:\n  help       Show this help\n  clear      Clear terminal\n  date       Show local date and time\n  whoami     Show current demo user\n  uname      Show DeskOS platform info\n  apps       List built-in apps\n  ls         List virtual Home files\n  echo TEXT  Print text\n  neofetch   Show a small system summary',
    date: () => new Date().toString(), whoami: () => 'guest', uname: () => 'DeskOS 0.1.0 · browser-hosted desktop · PWA',
    apps: () => APP_IDS.map((id) => `  ${APP_META[id].name}`).join('\n'),
    ls: () => fileSystem.filter((f) => f.path === '/Home').map((f) => `${f.folder ? 'dir ' : 'file'}  ${f.name}`).join('\n') || '(empty)',
    neofetch: () => '◇ DESKOS\n  Build       0.1.0\n  Session     guest\n  Runtime     browser app window\n  Storage     browser profile\n  Shell       DeskOS demo console\n  Network     ' + (navigator.onLine ? 'online' : 'offline')
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault(); const line = input.value.trim(); if (!line) return; write(`guest@deskos:~$ ${line}`); const [command, ...args] = line.split(/\s+/);
    if (command === 'clear') output.innerHTML = '';
    else if (command === 'echo') write(args.join(' '));
    else if (commands[command]) write(commands[command](args));
    else write(`Command not found: ${command}. Type "help" for available commands.`);
    input.value = '';
  });
}

function wireSettings(root: HTMLElement): void {
  const content = $('#settingsContent', root);
  const render = (tab: string) => {
    root.querySelectorAll<HTMLElement>('[data-settings]').forEach((b) => b.classList.toggle('active', b.dataset.settings === tab));
    if (tab === 'appearance') content.innerHTML = `<h3>Appearance</h3><p>Give your desktop a different accent colour. The layout adapts to your display size.</p><div class="setting-card"><b>Accent colour</b><small>Used for selection, buttons and the application dock.</small><div class="swatches"><button class="swatch" data-accent="#7898ff" style="background:#7898ff" aria-label="Blue"></button><button class="swatch" data-accent="#55c5bb" style="background:#55c5bb" aria-label="Teal"></button><button class="swatch" data-accent="#ba8cff" style="background:#ba8cff" aria-label="Violet"></button><button class="swatch" data-accent="#f0a56d" style="background:#f0a56d" aria-label="Orange"></button><button class="swatch" data-accent="#e77d9d" style="background:#e77d9d" aria-label="Pink"></button></div></div><div class="setting-card"><b>Window behaviour</b><small>Drag windows by their title bars. Double-click a title bar to maximise or restore it. Resize from the lower-right corner.</small></div>`;
    if (tab === 'storage') content.innerHTML = `<h3>Storage</h3><p>DeskOS stores its demo files and preferences in this browser profile.</p><div class="setting-card"><b>Virtual files</b><small>${fileSystem.length} items · ${bytes(new Blob([JSON.stringify(fileSystem)]).size)} of structured data</small><button class="mini-button" data-action="export-workspace" style="margin-top:10px">Export workspace backup</button></div><div class="setting-card"><b>Reset demo workspace</b><small>This removes the virtual files, notes and preferences stored by DeskOS in this browser profile.</small><button class="mini-button" data-action="reset-workspace" style="margin-top:10px">Reset DeskOS data</button></div>`;
    if (tab === 'about') content.innerHTML = `<h3>About DeskOS</h3><p>DeskOS Desktop 0.1.0</p><div class="setting-card"><b>Runtime</b><small>Progressive Web App · standalone display mode where supported</small></div><div class="setting-card"><b>Build</b><small>TypeScript + Vite · offline service worker · no runtime framework dependencies</small></div><div class="setting-card"><b>Important</b><small>This is a desktop environment experiment, not a replacement operating system or a native executable.</small></div>`;
  };
  render('appearance');
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement; const tab = target.closest<HTMLElement>('[data-settings]')?.dataset.settings; if (tab) render(tab);
    const accent = target.closest<HTMLElement>('[data-accent]')?.dataset.accent; if (accent) { settings.accent = accent; applyAccent(); saveSettings(); }
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'export-workspace') { const backup = { files: fileSystem, notes: localStorage.getItem(STORAGE_NOTES), settings }; const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'deskos-workspace-backup.json'; a.click(); URL.revokeObjectURL(url); showToast('Workspace backup exported.'); }
    if (action === 'reset-workspace') showDialog('Reset DeskOS?', 'This clears DeskOS files, notes and settings in this browser profile. This cannot be undone.', '', () => { localStorage.removeItem(STORAGE_FILES); localStorage.removeItem(STORAGE_NOTES); localStorage.removeItem(STORAGE_SETTINGS); fileSystem = loadFiles(); settings = loadSettings(); applyAccent(); render('storage'); showToast('DeskOS demo data reset.'); return true; }, 'Reset');
  });
}
function applyAccent(): void { document.documentElement.style.setProperty('--accent', settings.accent); }

function systemRows(): Array<[string, string, boolean]> {
  let storage = false; try { localStorage.setItem('__deskos_test__', '1'); localStorage.removeItem('__deskos_test__'); storage = true; } catch { storage = false; }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const sw = 'serviceWorker' in navigator;
  const indexed = 'indexedDB' in window;
  const wasm = typeof WebAssembly === 'object';
  const filePicker = 'showOpenFilePicker' in window;
  const clipboard = !!navigator.clipboard;
  return [
    ['Standalone app window', standalone ? 'Running as an app' : 'Running in browser tab', standalone],
    ['Service worker support', sw ? 'Available' : 'Unavailable', sw],
    ['Offline cache', navigator.onLine ? 'Connected · ready to cache' : 'Currently offline', true],
    ['Local storage', storage ? 'Available' : 'Blocked by browser policy', storage],
    ['IndexedDB', indexed ? 'Available' : 'Unavailable', indexed],
    ['WebAssembly', wasm ? 'Available' : 'Unavailable', wasm],
    ['Native file picker', filePicker ? 'Available' : 'Standard import fallback', true],
    ['Clipboard API', clipboard ? 'Available in secure context' : 'Restricted or unavailable', clipboard],
    ['Internet connection', navigator.onLine ? 'Connected' : 'Offline', navigator.onLine],
    ['File downloads', typeof Blob === 'function' && typeof URL.createObjectURL === 'function' ? 'Available through Chrome' : 'Unavailable', typeof Blob === 'function' && typeof URL.createObjectURL === 'function'],
    ['Persistent browser database', indexed ? 'IndexedDB available' : 'Unavailable', indexed]
  ];
}
function wireSystem(root: HTMLElement): void {
  const render = () => { $('#systemChecks', root).innerHTML = systemRows().map(([name, value, ok]) => `<div class="status-row"><span>${escapeHtml(name)}</span><span class="status-value ${ok ? '' : 'warn'}">${escapeHtml(value)}</span></div>`).join(''); };
  render();
  root.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'install-app') { installDeskOS(); }
    if (action === 'run-checks') { render(); showToast('Compatibility checks updated.'); }
    if (action === 'storage-test') { try { localStorage.setItem('__deskos_storage_test__', 'saved'); const result = localStorage.getItem('__deskos_storage_test__') === 'saved'; localStorage.removeItem('__deskos_storage_test__'); showToast(result ? 'Local storage test passed.' : 'Local storage test failed.'); } catch { showToast('Local storage is blocked by browser policy.'); } }
  });
}

function showDialog(title: string, description: string, placeholder: string, onConfirm: (value: string) => boolean, confirmLabel = 'Create'): void {
  document.querySelector('.dialog-backdrop')?.remove(); const overlay = document.createElement('div'); overlay.className = 'dialog-backdrop';
  overlay.innerHTML = `<div class="dialog"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${placeholder ? `<input id="dialogInput" value="${escapeHtml(placeholder)}" aria-label="Name" />` : ''}<div class="dialog-actions"><button class="secondary-button" data-dialog-cancel>Cancel</button><button class="primary-button" data-dialog-confirm>${escapeHtml(confirmLabel)}</button></div></div>`;
  $('#desktop').append(overlay); const input = overlay.querySelector<HTMLInputElement>('#dialogInput'); input?.select();
  overlay.addEventListener('click', (event) => {
    const target = event.target as HTMLElement; if (target === overlay || target.closest('[data-dialog-cancel]')) { overlay.remove(); return; }
    if (target.closest('[data-dialog-confirm]')) { if (onConfirm(input?.value || '')) overlay.remove(); }
  });
  input?.addEventListener('keydown', (event) => { if (event.key === 'Enter') overlay.querySelector<HTMLButtonElement>('[data-dialog-confirm]')?.click(); if (event.key === 'Escape') overlay.remove(); });
}

async function installDeskOS(): Promise<void> {
  if (window.matchMedia('(display-mode: standalone)').matches) { showToast('DeskOS is already running as an app window.'); return; }
  if (installPrompt) {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    showToast(choice.outcome === 'accepted' ? 'DeskOS installation accepted.' : 'Installation was cancelled.');
    return;
  }
  showToast('Use Chrome menu → Cast, save and share → Install page as app. If that option is missing, your school may have disabled app installation.');
}
function closeStartMenu(): void { $('#startMenu').hidden = true; $('#dockHome').classList.remove('active'); }
function toggleStartMenu(): void { const menu = $('#startMenu'); menu.hidden = !menu.hidden; $('#dockHome').classList.toggle('active', !menu.hidden); if (!menu.hidden) ($('#appSearch') as HTMLInputElement).focus(); }
async function initShell(): Promise<void> {
  await hydrateFilesFromIndexedDB();
  applyAccent(); updateClock(); window.setInterval(updateClock, 1000); updateConnection(); window.addEventListener('online', updateConnection); window.addEventListener('offline', updateConnection);
  $('#brandButton').addEventListener('click', toggleStartMenu); $('#dockHome').addEventListener('click', toggleStartMenu); $('#startClose').addEventListener('click', closeStartMenu);
  document.querySelectorAll<HTMLElement>('[data-app]').forEach((button) => button.addEventListener('click', () => openApp(button.dataset.app as AppId)));
  $('#appSearch').addEventListener('input', (event) => {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    $('#appGrid').querySelectorAll<HTMLButtonElement>('[data-app]').forEach((button) => { button.hidden = !button.textContent?.toLowerCase().includes(query); });
  });
  $('#lockButton').addEventListener('click', () => { closeStartMenu(); $('#lockScreen').hidden = false; });
  $('#unlockButton').addEventListener('click', () => { $('#lockScreen').hidden = true; });
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement; if (!target.closest('#startMenu') && !target.closest('#dockHome') && !target.closest('#brandButton')) closeStartMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeStartMenu(); document.querySelector('.dialog-backdrop')?.remove(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'space') { event.preventDefault(); toggleStartMenu(); }
    if (event.altKey && event.key === 'F4') { const focused = windows.find((win) => win.element.classList.contains('focused')); if (focused) closeWindow(focused); }
  });
  $('#desktop').addEventListener('dblclick', (event) => { if ((event.target as HTMLElement).closest('.desktop-icon')) return; });
  window.addEventListener('resize', () => windows.filter((win) => !win.maximized).forEach((win) => {
    const rect = win.element.getBoundingClientRect(); win.element.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - 120))}px`; win.element.style.top = `${Math.max(35, Math.min(rect.top, window.innerHeight - 100))}px`;
  }));
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event as BeforeInstallPromptEvent; showToast('DeskOS can be installed as an app window.'); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').then(() => { $('#connectionText').textContent = navigator.onLine ? 'Offline-ready' : 'Offline'; }).catch(() => { showToast('Offline cache could not be enabled in this browser.'); });
  }
  $('#saveState').textContent = saveFiles() ? 'Saved locally' : 'Storage restricted';
  window.setTimeout(() => $('#boot').classList.add('done'), 420);
  window.setTimeout(() => $('#boot').remove(), 850);
}

initShell();
