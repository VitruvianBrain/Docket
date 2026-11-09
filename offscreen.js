// Turns a captured article into a fully offline one: images are downloaded, shrunk and embedded.
import { sanitizeToHtml } from './lib/sanitize.js';

const MAX_IMAGES = 15;
const MAX_WIDTH = 1000;
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 10000;

function pickSrc(img, base) {
  let raw = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src') || '';
  if (!raw || raw.startsWith('data:image/gif;base64,R0lGOD')) {
    const set = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
    const first = set.split(',')[0]?.trim().split(/\s+/)[0];
    if (first) raw = first;
  }
  if (!raw) return null;
  if (raw.startsWith('data:image/')) return raw;
  try { return new URL(raw, base).toString(); } catch { return null; }
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

async function toDataUrl(src) {
  if (src.startsWith('data:')) return src;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(src, { credentials: 'omit', signal: ctl.signal });
    if (!resp.ok) throw new Error('http ' + resp.status);
    const blob = await resp.blob();
    if (blob.size > MAX_BYTES || !blob.type.startsWith('image/')) throw new Error('skip');
    if (blob.type === 'image/svg+xml' || blob.type === 'image/gif') {
      if (blob.size > 400 * 1024) throw new Error('too big');
      return await blobToDataUrl(blob);
    }
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_WIDTH / bmp.width);
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const out = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
    return await blobToDataUrl(out);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBlob(src) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(src, { credentials: 'omit', signal: ctl.signal });
    if (!resp.ok) throw new Error('http ' + resp.status);
    const blob = await resp.blob();
    if (blob.size > MAX_BYTES || !blob.type.startsWith('image/')) throw new Error('skip');
    return blob;
  } finally {
    clearTimeout(timer);
  }
}

// Square, centre-cropped cover image for list rows (shown at 64px, stored at 2.5x).
async function makeThumb(src) {
  if (!src) return null;
  try {
    const bmp = await createImageBitmap(await fetchBlob(src));
    const side = Math.min(bmp.width, bmp.height), N = 160;
    const c = new OffscreenCanvas(N, N);
    c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, N, N);
    return await blobToDataUrl(await c.convertToBlob({ type: 'image/webp', quality: 0.72 }));
  } catch { return null; }
}

async function makeIcon(src) {
  if (!src) return null;
  try {
    const bmp = await createImageBitmap(await fetchBlob(src));
    const c = new OffscreenCanvas(32, 32);
    c.getContext('2d').drawImage(bmp, 0, 0, 32, 32);
    return await blobToDataUrl(await c.convertToBlob({ type: 'image/png' }));
  } catch { return null; }
}

async function inline(html, base) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imgs = [...doc.querySelectorAll('img')];
  let kept = 0, firstImg = null;
  const queue = imgs.slice();
  async function worker() {
    while (queue.length) {
      const img = queue.shift();
      const idx = imgs.indexOf(img);
      const src = idx < MAX_IMAGES ? pickSrc(img, base) : null;
      let data = null;
      if (src) { try { data = await toDataUrl(src); } catch { data = null; } }
      if (data) {
        img.setAttribute('src', data);
        ['srcset', 'data-src', 'data-srcset', 'data-lazy-src', 'sizes', 'loading'].forEach(a => img.removeAttribute(a));
        kept++;
        if (!firstImg) firstImg = data;
      } else {
        img.remove();
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  doc.querySelectorAll('picture source').forEach(s => s.remove());
  const clean = sanitizeToHtml(doc.body.innerHTML);
  const probe = new DOMParser().parseFromString(clean, 'text/html');
  const words = (probe.body.textContent || '').trim().split(/\s+/).filter(Boolean).length;
  return { html: clean, words, images: kept, firstImg };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'inline') return false;
  (async () => {
    const out = await inline(msg.html, msg.baseUrl);
    const [thumbA, favicon] = await Promise.all([makeThumb(msg.heroUrl), makeIcon(msg.faviconUrl)]);
    out.thumb = thumbA || await makeThumb(out.firstImg);
    out.favicon = favicon || await makeIcon(new URL('/favicon.ico', msg.baseUrl).href);
    delete out.firstImg;
    return out;
  })().then(sendResponse, e => sendResponse({ error: String(e) }));
  return true;
});
