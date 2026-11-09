import * as store from './lib/store.js';
import { isWeekend, decideNotification } from './lib/time.js';

const LIBRARY = chrome.runtime.getURL('library.html');
const ISSUE = chrome.runtime.getURL('issue.html');

// ---------- Save pipeline ----------
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['DOM_PARSER'],
    justification: 'Parse saved article HTML and embed its images for offline reading'
  });
}

async function saveTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:/i.test(tab.url || '')) return { ok: false, error: 'This page type cannot be saved.' };
  let cap;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['vendor/Readability.js'] });
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, files: ['content/capture.js'] });
    cap = res?.result;
  } catch (e) {
    return { ok: false, error: 'Could not read this page.' };
  }
  if (!cap?.ok) return { ok: false, error: 'No article found on this page.' };
  await ensureOffscreen();
  const out = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'inline', html: cap.content, baseUrl: cap.url, heroUrl: cap.heroUrl, faviconUrl: cap.faviconUrl });
  if (!out || out.error) return { ok: false, error: 'Could not process the article.' };
  if (out.words < 40) return { ok: false, error: 'Not enough text to save.' };
  const item = await store.saveArticle({
    url: cap.url, title: cap.title, site: cap.siteName, authors: cap.authors,
    description: cap.description, publishedTime: cap.publishedTime, modifiedTime: cap.modifiedTime,
    section: cap.section, keywords: cap.keywords, lang: cap.lang, type: cap.type, canonical: cap.canonical,
    thumb: out.thumb, favicon: out.favicon, images: out.images, words: out.words, html: out.html
  });
  return { ok: true, item, images: out.images };
}

// ---------- Badge ----------
async function updateBadge() {
  const s = await store.stats();
  const text = isWeekend() && s.dying > 0 ? String(s.dying) : '';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: '#E4572E' });
}

async function flash(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  setTimeout(updateBadge, 2500);
}

// ---------- Sunday Hearing + weekend nudge ----------
async function tick() {
  await store.sweep();
  const [items, state, settings] = await Promise.all([store.getItems(), store.getState(), store.getSettings()]);
  const note = decideNotification(Date.now(), items, state, settings);
  if (note) {
    await chrome.notifications.create('docket-' + note.kind, {
      type: 'basic', iconUrl: 'icons/128.png', title: note.title, message: note.message, priority: 1
    });
    await store.setState(note.kind === 'sat' ? { lastSat: note.key } : { lastSun: note.key });
  }
  await updateBadge();
}

async function ensureAlarm() {
  if (!(await chrome.alarms.get('tick'))) chrome.alarms.create('tick', { periodInMinutes: 30, delayInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(async () => { await ensureAlarm(); await tick(); });
chrome.runtime.onStartup.addListener(async () => { await ensureAlarm(); await tick(); });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'tick') tick(); });
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.items) updateBadge(); });

chrome.notifications.onClicked.addListener(id => {
  if (id.startsWith('docket-')) { chrome.tabs.create({ url: id === 'docket-sat' ? ISSUE : LIBRARY }); chrome.notifications.clear(id); }
});

chrome.commands.onCommand.addListener(async cmd => {
  if (cmd !== 'save-page') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const r = await saveTab(tab.id);
  flash(r.ok ? '✓' : '!', r.ok ? '#111111' : '#B00020');
});

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg?.target !== 'bg') return false;
  if (msg.type === 'save') saveTab(msg.tabId).then(sendResponse, e => sendResponse({ ok: false, error: String(e) }));
  else if (msg.type === 'tick') tick().then(() => sendResponse({ ok: true }));
  else return false;
  return true;
});
