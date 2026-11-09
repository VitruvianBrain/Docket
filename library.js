import * as store from './lib/store.js';
import { computeStats, fmtLeft, fmtDie, endOfSunday, fmtDate, buildIssue, fmtHours } from './lib/time.js';
import { h, icon, toast, openMenu } from './lib/ui.js';
import { attachSwipe } from './lib/swipe.js';

const $ = id => document.getElementById(id);
const ui = { view: 'docket', sort: 'due', maxMin: 0, site: '', q: '' };
const readerUrl = id => chrome.runtime.getURL('reader.html') + '?id=' + id;

// ---------- full-text index (built lazily, kept in memory, dropped on any change) ----------
let index = null;
async function ensureIndex(items) {
  if (index) return index;
  const ids = Object.values(items).filter(i => i.hasContent).map(i => i.id);
  const got = ids.length ? await chrome.storage.local.get(ids.map(i => 'c:' + i)) : {};
  index = new Map();
  for (const id of ids) {
    const html = got['c:' + id];
    if (html) index.set(id, html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim());
  }
  return index;
}
const hay = it => [it.title, it.site, it.author, it.section, (it.keywords || []).join(' '), it.description].join(' ').toLowerCase();

function highlight(text, tokens) {
  if (!tokens.length) return [text];
  const re = new RegExp('(' + tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
  return text.split(re).map((part, i) => (i % 2 ? h('mark', {}, part) : part));
}

// ---------- header: tiles ----------
function renderTiles(items) {
  const s = computeStats(items);
  const all = Object.values(items);
  const finishedTotal = all.filter(i => i.status === 'finished').length;
  const defs = [
    { v: 'docket', name: 'On the docket', tint: 'var(--blue)', ico: 'tray', num: s.waiting },
    { v: 'due', name: 'Due Sunday', tint: 'var(--orange)', ico: 'cal', num: s.dying },
    { v: 'finished', name: 'Finished', tint: 'var(--green)', ico: 'check', num: finishedTotal, small: `${s.finishedMonth} this month` },
    { v: 'dismissed', name: 'Dismissed', tint: '#8e8e93', ico: 'xmark', num: s.buriedTotal, small: `${s.buriedMonth} this month` }
  ];
  $('tiles').replaceChildren(...defs.map(d => h('button', {
    class: 'tile' + (ui.view === d.v ? ' on' : ''), style: `--tint:${d.tint}`,
    onclick: () => { ui.view = d.v; ui.site = ''; render(); }
  }, h('span', { class: 'badge' }, icon(d.ico)), h('span', { class: 'num' }, d.num),
  h('span', { class: 'name' }, d.name, d.small ? h('small', {}, ' · ' + d.small) : null))));
}

// ---------- sort / filter pills ----------
function viewItems(items) {
  const all = Object.values(items);
  const sunday = endOfSunday(Date.now());
  if (ui.view === 'docket') return all.filter(i => i.status === 'waiting');
  if (ui.view === 'due') return all.filter(i => i.status === 'waiting' && i.expiresAt <= sunday);
  if (ui.view === 'finished') return all.filter(i => i.status === 'finished');
  return all.filter(i => i.status === 'buried');
}

function renderPills(items) {
  const rows = viewItems(items);
  const sel = (value, opts, onchange) => h('select', { onchange },
    opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
  const pills = [];
  if (ui.view === 'docket' || ui.view === 'due') {
    pills.push(sel(ui.sort, [
      ['due', 'Sort: Due soonest'], ['short', 'Sort: Shortest read'], ['long', 'Sort: Longest read'],
      ['saved', 'Sort: Recently saved'], ['pubnew', 'Sort: Newest published'], ['pubold', 'Sort: Oldest published']
    ], e => { ui.sort = e.target.value; renderList(); }));
    pills.push(sel(ui.maxMin, [[0, 'Any length'], [5, 'Up to 5 min'], [10, 'Up to 10 min'], [20, 'Up to 20 min']],
      e => { ui.maxMin = +e.target.value; renderList(); }));
  }
  const counts = {};
  rows.forEach(i => { if (i.site) counts[i.site] = (counts[i.site] || 0) + 1; });
  const sites = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sites.length > 1) {
    pills.push(sel(ui.site, [['', 'All sources'], ...sites.map(([s, n]) => [s, `${s} (${n})`])],
      e => { ui.site = e.target.value; renderList(); }));
  }
  $('pills').replaceChildren(...pills);
}

// ---------- list ----------
async function renderList() {
  const my = ++renderList.n;
  const items = await store.getItems();
  let rows = viewItems(items);
  const tokens = ui.q.toLowerCase().split(/\s+/).filter(Boolean);
  const idx = tokens.length ? await ensureIndex(items) : null;
  if (my !== renderList.n) return;

  if (ui.maxMin && (ui.view === 'docket' || ui.view === 'due')) rows = rows.filter(i => i.minutes <= ui.maxMin);
  if (ui.site) rows = rows.filter(i => i.site === ui.site);
  const snippets = {};
  if (tokens.length) {
    rows = rows.filter(it => {
      const hs = hay(it), text = (idx.get(it.id) || '').toLowerCase();
      if (!tokens.every(t => hs.includes(t) || text.includes(t))) return false;
      const miss = tokens.find(t => !hs.includes(t));
      if (miss) {
        const full = idx.get(it.id), pos = text.indexOf(miss);
        snippets[it.id] = (pos > 60 ? '…' : '') + full.slice(Math.max(0, pos - 60), pos + 140) + '…';
      }
      return true;
    });
  }

  const pub = it => (it.publishedTime ? Date.parse(it.publishedTime) : null);
  const sorters = {
    due: (a, b) => a.expiresAt - b.expiresAt,
    short: (a, b) => a.minutes - b.minutes,
    long: (a, b) => b.minutes - a.minutes,
    saved: (a, b) => b.savedAt - a.savedAt,
    pubnew: (a, b) => (pub(b) ?? -Infinity) - (pub(a) ?? -Infinity),
    pubold: (a, b) => (pub(a) ?? Infinity) - (pub(b) ?? Infinity)
  };
  if (ui.view === 'finished') rows.sort((a, b) => b.finishedAt - a.finishedAt);
  else if (ui.view === 'dismissed') rows.sort((a, b) => b.buriedAt - a.buriedAt);
  else rows.sort(sorters[ui.sort]);

  const list = $('list');
  list.replaceChildren();
  if (!rows.length) {
    const searching = tokens.length > 0;
    const msg = searching ? ['No results', `Nothing matches “${ui.q}”.`] : {
      docket: ['The docket is clear', 'Save an article with the toolbar button or Alt+Shift+S.'],
      due: ['Nothing due this Sunday', 'Enjoy the quiet.'],
      finished: ['Nothing finished yet', 'Read something. It feels good.'],
      dismissed: ['Nothing dismissed yet', 'Whatever you have not read by Sunday night lands here.']
    }[ui.view];
    list.append(h('div', { class: 'empty' }, icon(searching ? 'search' : 'tray'), h('b', {}, msg[0]), h('span', { class: 't' }, msg[1])));
    return;
  }

  const now = Date.now(), sunday = endOfSunday(now);
  for (const it of rows) list.append(renderCell(it, now, sunday, tokens, snippets[it.id]));
}
renderList.n = 0;

function renderCell(it, now, sunday, tokens, snippet) {
  const live = it.status === 'waiting' || (it.status === 'finished' && it.hasContent);
  const href = live ? readerUrl(it.id) : it.url;
  const thumb = it.thumb ? h('img', { class: 'thumb', src: it.thumb, alt: '' })
    : h('div', { class: 'thumb ph' }, (it.site || it.title || '?').trim()[0].toUpperCase());
  const who = [it.site, it.author].filter(Boolean).join(' · ');
  const bits = [];
  if (it.status !== 'buried') bits.push(`${it.minutes} min`, it.words ? `${it.words.toLocaleString()} words` : '');
  if (it.publishedTime) bits.push(fmtDate(it.publishedTime));
  if (it.status === 'buried') bits.push('dismissed ' + new Date(it.buriedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
  if (it.status === 'finished') bits.push('finished ' + new Date(it.finishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
  const tags = [it.section, ...(it.keywords || [])].filter(Boolean).slice(0, 3);

  const body = h('div', { class: 'txt' },
    h('div', { class: 'ttl' }, highlight(it.title, tokens)),
    h('div', { class: 'l2' }, it.favicon && h('img', { class: 'fav', src: it.favicon, alt: '' }), highlight(who, tokens)),
    h('div', { class: 'l3' }, bits.filter(Boolean).join(' · ')),
    snippet && h('div', { class: 'snip' }, highlight(snippet, tokens)),
    !snippet && tags.length ? h('div', { class: 'tags' }, tags.map(t => h('span', { class: 'tag' }, t))) : null);

  const trail = h('div', { class: 'trail' });
  if (it.status === 'waiting') {
    const hot = it.expiresAt <= sunday;
    trail.append(hot ? h('span', { class: 'pill hot' }, fmtLeft(it.expiresAt, now) === 'tonight' ? 'Due tonight' : 'Due Sunday')
      : h('span', { class: 'left' }, `${fmtLeft(it.expiresAt, now)} left`));
  }
  const more = h('button', { class: 'more', 'data-menu': '1', 'aria-label': 'Actions', onclick: () => openMenu(more, menuFor(it)) }, icon('more'));
  trail.append(more);

  const el = h('div', { class: 'cell' }, h('a', { class: 'main', href, ...(live ? {} : { target: '_blank', rel: 'noopener' }) }, thumb, body), trail);
  el.addEventListener('contextmenu', e => { e.preventDefault(); openMenu(more, menuFor(it)); });

  const wrap = h('div', { class: 'swipe' }, el);
  const act = (label, color, ic, fn) => ({ label, color, ic, fn });
  const sw = it.status === 'waiting'
    ? { leading: [act('Finished', 'var(--green)', 'check', () => store.finish(it.id))],
        trailing: [act('Adjourn', 'var(--orange)', 'cal', async () => { await store.keepAWeek(it.id); toast('Adjourned to the next Sunday'); }),
                   act('Dismiss', 'var(--red)', 'xmark', () => store.bury(it.id))] }
    : { leading: [], trailing: [act('Delete', 'var(--red)', 'trash', () => store.eraseForever(it.id))] };
  attachSwipe(wrap, el, sw, {
    under: (side, acts) => h('div', { class: 'under ' + side }, acts.map(a =>
      h('button', { class: 'ua', style: `background:${a.color}` }, icon(a.ic), h('span', {}, a.label))))
  });
  return wrap;
}

function menuFor(it) {
  const orig = { label: 'Open original', icon: 'open', fn: () => window.open(it.url, '_blank', 'noopener') };
  if (it.status === 'waiting') return [
    { label: 'Read', icon: 'book', fn: () => { location.href = readerUrl(it.id); } },
    { label: 'Adjourn a week', icon: 'cal', fn: async () => { await store.keepAWeek(it.id); toast('Adjourned to the next Sunday'); } },
    { label: 'Mark finished', icon: 'check', fn: () => store.finish(it.id) },
    orig, '-',
    { label: 'Dismiss', icon: 'xmark', red: true, fn: () => store.bury(it.id) }
  ];
  const out = [];
  if (it.hasContent) out.push({ label: 'Read again', icon: 'book', fn: () => { location.href = readerUrl(it.id); } });
  out.push(orig, '-', { label: 'Delete', icon: 'trash', red: true, fn: () => store.eraseForever(it.id) });
  return out;
}

// ---------- settings ----------
async function renderSettings() {
  const settings = await store.getSettings();
  const sel = (value, opts, onchange) => h('select', { onchange },
    opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
  $('settings').replaceChildren(
    h('div', { class: 'gh' }, 'Settings'),
    h('div', { class: 'group' },
      h('div', { class: 'cell' }, h('span', { class: 'grow' }, 'Minimum time on docket'),
        sel(settings.minDays, [[7, '7 days'], [10, '10 days'], [14, '14 days']],
          async e => { await store.setSettings({ minDays: +e.target.value }); toast('Applies to newly saved articles'); })),
      h('div', { class: 'cell' }, h('span', { class: 'grow' }, 'Saturday nudge'),
        sel(settings.notifyHour, [...Array(14)].map((_, i) => [i + 7, `${String(i + 7).padStart(2, '0')}:00`]),
          async e => { await store.setSettings({ notifyHour: +e.target.value }); toast('Saved'); }))),
    h('div', { class: 'foot' }, 'After the minimum, an article comes up for hearing at the end of the next Sunday (the Sunday Hearing). Whatever you have not read by then is dismissed. Weekend nudges only appear while Chrome is open.'),
    h('div', { class: 'gh' }, 'Your data'),
    h('div', { class: 'group' },
      h('button', { class: 'cell act', style: 'width:100%', onclick: exportBackup }, 'Download backup'),
      h('label', { class: 'cell act' }, 'Restore backup', h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: importBackup }))),
    h('div', { class: 'foot' }, 'Everything stays on this computer. A backup is your insurance. Docket · by AR'));
}

async function exportBackup() {
  const data = await store.exportBackup();
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `docket-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const n = await store.importBackup(JSON.parse(await file.text()));
    toast(`Restored ${n} ${n === 1 ? 'article' : 'articles'}`);
  } catch (err) { toast(err.message || 'Could not read that file'); }
}

// ---------- boot ----------
function renderIssueLink(items) {
  const iss = buildIssue(items);
  const a = $('issuelink');
  a.hidden = !iss.count;
  if (!iss.count) return;
  const weekend = [0, 6].includes(new Date().getDay());
  a.replaceChildren(icon('book'),
    h('span', { class: 'grow' }, h('b', {}, weekend ? 'This weekend’s issue' : 'Weekend Issue'),
      h('small', {}, `${iss.count} ${iss.count === 1 ? 'article' : 'articles'} · ${fmtHours(iss.minutes)}${weekend ? '' : ' · opens Saturday, preview now'}`)),
    icon('chevR'));
}

async function render() {
  const items = await store.getItems();
  renderTiles(items);
  renderIssueLink(items);
  renderPills(items);
  await renderList();
  await renderSettings();
}

$('searchico').replaceWith(icon('search'));
$('clear').append(icon('clear'));
let timer;
$('q').addEventListener('input', e => {
  ui.q = e.target.value.trim();
  $('searchbox').classList.toggle('has', !!e.target.value);
  clearTimeout(timer);
  timer = setTimeout(renderList, 120);
});
$('clear').addEventListener('click', () => { $('q').value = ''; ui.q = ''; $('searchbox').classList.remove('has'); renderList(); $('q').focus(); });
new IntersectionObserver(([en]) => $('nav').classList.toggle('on', !en.isIntersecting), { rootMargin: '-44px 0px 0px 0px' }).observe($('large'));

chrome.storage.onChanged.addListener((_c, area) => { if (area === 'local') { index = null; render(); } });
render();
