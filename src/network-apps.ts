import { browserAppBody, wireBrowserApp } from './browser-workspace.js';
export type NetworkAppId = 'browser' | 'downloads' | 'games' | 'store';
export type WorkspaceDownload = { name: string; type: string; content: string; size: number };
const safeUrl = (raw: string): URL | null => { try { const u = new URL(raw.trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? u : null; } catch { return null; } };
const toUrl = (raw: string): string => { const value = raw.trim(); if (!value) return 'https://duckduckgo.com/'; const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : value.includes('.') && !value.includes(' ') ? `https://${value}` : `https://duckduckgo.com/?q=${encodeURIComponent(value)}`; return safeUrl(candidate)?.href || `https://duckduckgo.com/?q=${encodeURIComponent(value)}`; };
const external = (url: string): void => { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.append(a); a.click(); a.remove(); };
const bytes = (n: number): string => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export function networkAppBody(app: NetworkAppId): string {
  if (app === 'browser') return browserAppBody();
  if (app === 'downloads') return `<div class="downloads-shell"><div class="downloads-hero"><div class="downloads-symbol">↓</div><div><h2>Downloads</h2><p>Download real files to your Chromebook or import supported files into DeskOS.</p></div></div><form id="downloadForm" class="download-form"><label for="downloadUrl">Direct file URL</label><input id="downloadUrl" type="url" placeholder="https://example.com/file.zip" required><label for="downloadName">File name (optional)</label><input id="downloadName" type="text" placeholder="Use the server file name"><div class="download-buttons"><button class="primary-button" type="submit">↓ Download to Chromebook</button><button class="secondary-button" type="button" data-import-url>＋ Import into DeskOS</button></div></form><div class="download-notice"><b>Download behaviour</b><p>Chrome handles device downloads and normally saves them in its Downloads folder. Importing to DeskOS requires the file host to allow browser access (CORS) and is limited to 40 MB per file. If import is blocked, use Download to Chromebook.</p></div><div class="download-sources"><h3>Trusted download sources</h3><a href="https://github.com/" target="_blank" rel="noopener noreferrer">GitHub — open-source projects ↗</a><a href="https://itch.io/games/free/genre-downloadable" target="_blank" rel="noopener noreferrer">itch.io — downloadable indie games ↗</a><a href="https://www.blender.org/download/" target="_blank" rel="noopener noreferrer">Blender — official downloads ↗</a></div><div class="download-foot" id="downloadStatus">Only download files from sources you trust. DeskOS does not scan files for malware.</div></div>`;
  const games = app === 'games';
  const cards = games ? [
    ['🕹️','itch.io HTML5','Indie games that run in a browser','https://itch.io/games/free/genre-html5'],['🎯','Poki','Casual games and quick play','https://poki.com/'],['🚀','CrazyGames','Large browser game collection','https://www.crazygames.com/'],['🧩','HTML5 Games','Games designed for browsers','https://html5games.com/'],['🐱','Scratch Games','Community-made games','https://scratch.mit.edu/explore/projects/games/'],['🌟','Newgrounds','Independent browser games','https://www.newgrounds.com/games']
  ] : [
    ['🎨','Photopea','Image editing in your browser','https://www.photopea.com/'],['🧩','Scratch','Make games and animations','https://scratch.mit.edu/'],['☁️','Google Drive','Online files and documents','https://drive.google.com/'],['🖌️','Canva','Designs and presentations','https://www.canva.com/'],['🧊','Tinkercad','3D design and circuits','https://www.tinkercad.com/'],['⌨️','Replit','Online coding workspace','https://replit.com/']
  ];
  return `<div class="catalog-shell"><div class="catalog-hero"><div class="catalog-symbol">${games ? '🎮' : '▦'}</div><div><h2>${games ? 'Game Hub' : 'App Library'}</h2><p>${games ? 'Browser games you can play without installing anything.' : 'Useful web applications that work alongside DeskOS.'}</p></div></div><div class="catalog-grid">${cards.map(([icon,name,desc,url]) => `<a class="catalog-card" href="${url}" target="_blank" rel="noopener noreferrer"><span>${icon}</span><b>${name}</b><small>${desc}</small><em>Open ↗</em></a>`).join('')}</div><div class="download-notice"><b>${games ? 'Browser games vs installed games' : 'About web apps'}</b><p>${games ? 'Web games run inside the browser. Downloadable Windows, Mac or Linux games need a compatible native operating system and cannot run directly inside this Chromebook web app.' : 'These are web apps, not native programs installed on your Chromebook. Their availability depends on school network and account policies.'}</p></div></div>`;
}

export function wireNetworkApp(app: NetworkAppId, root: HTMLElement, notify: (message: string) => void, saveDownload: (file: WorkspaceDownload) => void): void {
  if (app === 'browser') { wireBrowserApp(root, notify); return; }
  if (app === 'downloads') {
    const form = root.querySelector<HTMLFormElement>('#downloadForm'), urlInput = root.querySelector<HTMLInputElement>('#downloadUrl'), nameInput = root.querySelector<HTMLInputElement>('#downloadName'), status = root.querySelector<HTMLElement>('#downloadStatus');
    if (!form || !urlInput || !nameInput || !status) return;
    const fileName = (url: URL) => { if (nameInput.value.trim()) return nameInput.value.trim().replace(/[\\/:*?"<>|]/g, '_'); let last = 'download'; try { last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || 'download'); } catch { /* malformed path escape */ } return last.includes('.') ? last : `${last}.download`; };
    form.addEventListener('submit', e => { e.preventDefault(); const url = safeUrl(urlInput.value); if (!url) { status.textContent = 'Enter a valid http:// or https:// file URL.'; return; } status.textContent = `Opening ${fileName(url)} through Chrome. Check the Chromebook Downloads folder.`; external(url.href); notify('Download link opened. Chrome decides whether the file downloads or opens.'); });
    root.querySelector('[data-import-url]')?.addEventListener('click', async () => {
      const url = safeUrl(urlInput.value); if (!url) { status.textContent = 'Enter a valid http:// or https:// file URL first.'; return; }
      status.textContent = `Connecting to ${url.hostname}…`;
      try {
        const response = await fetch(url.href, { mode: 'cors', credentials: 'omit' }); if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);
        const blob = await response.blob(); if (blob.size > 40 * 1024 * 1024) throw new Error('File is over the 40 MB DeskOS import limit. Use Download to Chromebook instead.');
        const dataUrl = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
        saveDownload({ name:fileName(url), type:blob.type || response.headers.get('content-type') || 'application/octet-stream', content:dataUrl, size:blob.size }); status.textContent = `Imported ${fileName(url)} (${bytes(blob.size)}) into Home / Downloads.`;
      } catch (err) { const message = err instanceof Error ? err.message : 'The file host blocked the request.'; status.textContent = `Could not import: ${message}. This is usually a CORS or host restriction. Try Download to Chromebook.`; }
    });
  }
}
