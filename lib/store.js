// All persistence lives here. Metadata in `items`, article text in `c:<id>` keys.
import { computeExpiry, extendExpiry, minutesFor, computeStats } from './time.js';

const S = chrome.storage.local;
export const DEFAULTS = { minDays: 7, notifyHour: 10 };
export const FINISHED_KEEP_DAYS = 30;

let chain = Promise.resolve();
function locked(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

export async function getSettings() {
  const { settings } = await S.get('settings');
  return { ...DEFAULTS, ...(settings || {}) };
}
export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await S.set({ settings: next });
  return next;
}
export async function getState() {
  const { state } = await S.get('state');
  return state || {};
}
export async function setState(patch) {
  await S.set({ state: { ...(await getState()), ...patch } });
}
export async function getItems() {
  const { items } = await S.get('items');
  return items || {};
}
export async function getContent(id) {
  const k = 'c:' + id;
  const r = await S.get(k);
  return r[k] || null;
}

const TRACKING = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
export function normUrl(u) {
  const x = new URL(u);
  x.hash = '';
  TRACKING.forEach(k => x.searchParams.delete(k));
  return x.toString();
}
export async function idFor(url) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(normUrl(url)));
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function saveArticle(a) {
  return locked(async () => {
    const id = await idFor(a.url);
    const now = Date.now();
    const { minDays } = await getSettings();
    const items = await getItems();
    const prev = items[id];
    const item = {
      id, url: normUrl(a.url), title: a.title || a.url, site: a.site || '',
      authors: a.authors || [], author: (a.authors || []).join(', '),
      description: a.description || '', publishedTime: a.publishedTime || null, modifiedTime: a.modifiedTime || null,
      section: a.section || '', keywords: a.keywords || [], lang: a.lang || '', type: a.type || '',
      canonical: a.canonical || null, thumb: a.thumb || null, favicon: a.favicon || null, images: a.images || 0,
      words: a.words,
      minutes: minutesFor(a.words), savedAt: prev?.savedAt || now, refreshedAt: now,
      expiresAt: computeExpiry(now, minDays), status: 'waiting', scroll: 0, hasContent: true
    };
    items[id] = item;
    await S.set({ items, ['c:' + id]: a.html });
    return item;
  });
}

function mutate(id, fn) {
  return locked(async () => {
    const items = await getItems();
    if (!items[id]) return null;
    const out = await fn(items[id], items);
    await S.set({ items });
    return out ?? items[id];
  });
}

export const markOpened = id => mutate(id, it => { it.openedAt = Date.now(); });
export const setScroll = (id, y) => mutate(id, it => { it.scroll = y; });
export const finish = id => mutate(id, it => { it.status = 'finished'; it.finishedAt = Date.now(); });
export const keepAWeek = id => getSettings().then(({ minDays }) =>
  mutate(id, it => { it.expiresAt = extendExpiry(it.expiresAt, Date.now(), minDays); it.status = 'waiting'; }));
export const bury = id => mutate(id, async it => {
  it.status = 'buried'; it.buriedAt = Date.now(); it.hasContent = false;
  await S.remove('c:' + id);
});
export const eraseForever = id => locked(async () => {
  const items = await getItems();
  delete items[id];
  await S.set({ items });
  await S.remove('c:' + id);
});

// Sunday Hearing: dismiss everything past its hearing date; drop old text of finished items.
export function sweep(now = Date.now()) {
  return locked(async () => {
    const items = await getItems();
    const remove = [];
    let buried = 0;
    for (const it of Object.values(items)) {
      if (it.status === 'waiting' && it.expiresAt <= now) {
        it.status = 'buried'; it.buriedAt = now; it.hasContent = false;
        remove.push('c:' + it.id); buried++;
      } else if (it.status === 'finished' && it.hasContent && now - it.finishedAt > FINISHED_KEEP_DAYS * 86400000) {
        it.hasContent = false; remove.push('c:' + it.id);
      }
    }
    if (remove.length) { await S.set({ items }); await S.remove(remove); }
    return buried;
  });
}

export async function stats(now = Date.now()) {
  return computeStats(await getItems(), now);
}

// Backup / restore: the answer to "my saves vanished when the app shut down".
export async function exportBackup() {
  const items = await getItems();
  const keys = Object.values(items).filter(i => i.hasContent).map(i => 'c:' + i.id);
  const contents = keys.length ? await S.get(keys) : {};
  return { app: 'docket', version: 1, exportedAt: Date.now(), settings: await getSettings(), items, contents };
}
export function importBackup(data) {
  return locked(async () => {
    if (!data || (data.app !== 'docket' && data.app !== 'graveyard') || typeof data.items !== 'object') throw new Error('Not a Docket backup file');
    const items = await getItems();
    let added = 0;
    for (const [id, it] of Object.entries(data.items)) {
      if (!items[id]) { items[id] = it; added++; }
    }
    const toSet = { items };
    for (const [k, v] of Object.entries(data.contents || {})) {
      if (k.startsWith('c:') && items[k.slice(2)] && typeof v === 'string') toSet[k] = v;
    }
    await S.set(toSet);
    return added;
  });
}
