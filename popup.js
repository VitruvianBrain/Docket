import * as store from './lib/store.js';
import { fmtDie, fmtDate } from './lib/time.js';
import { h, icon } from './lib/ui.js';

const $ = id => document.getElementById(id);
const btn = $('save'), msg = $('msg');

function say(text, kind = '') { msg.textContent = text; msg.className = 'note ' + kind; }

async function paintStats() {
  const s = await store.stats();
  $('s-wait').textContent = s.waiting;
  $('s-dying').textContent = s.dying;
  $('s-buried').textContent = s.buriedMonth;
}

function showPreview(it) {
  const thumb = it.thumb ? h('img', { class: 'thumb', src: it.thumb, alt: '' })
    : h('div', { class: 'thumb ph', style: 'font-size:18px' }, (it.site || '?')[0].toUpperCase());
  const line = [it.site, it.author].filter(Boolean).join(' · ');
  const meta = [`${it.minutes} min`, fmtDate(it.publishedTime), `due ${fmtDie(it.expiresAt)}`].filter(Boolean).join(' · ');
  $('preview').replaceChildren(h('div', { class: 'group preview' }, h('div', { class: 'cell' }, thumb,
    h('div', { class: 'grow' }, h('div', { class: 't' }, it.title),
      h('div', { class: 's' }, it.favicon && h('img', { class: 'fav', src: it.favicon, alt: '' }), line),
      h('div', { class: 's' }, meta)))));
}

async function init() {
  $('chev').replaceWith(icon('chevR'));
  $('open').addEventListener('click', e => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
    window.close();
  });
  await paintStats();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/i.test(tab.url || '')) {
    btn.disabled = true;
    say('Open an article to save it.');
    return;
  }
  const id = await store.idFor(tab.url);
  const existing = (await store.getItems())[id];
  if (existing && existing.status === 'waiting') {
    btn.textContent = 'Refresh saved copy';
    say('Already on your docket.');
    showPreview(existing);
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    say('Saving…');
    const r = await chrome.runtime.sendMessage({ target: 'bg', type: 'save', tabId: tab.id });
    if (r?.ok) {
      btn.textContent = 'Saved ✓';
      say('');
      showPreview(r.item);
      paintStats();
    } else {
      btn.disabled = false;
      say(r?.error || 'Something went wrong.', 'err');
    }
  });
}
init();
