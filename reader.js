import * as store from './lib/store.js';
import { sanitizeToFragment } from './lib/sanitize.js';
import { fmtDie, fmtDate } from './lib/time.js';
import { h, icon, toast } from './lib/ui.js';

const id = new URLSearchParams(location.search).get('id');
const $ = x => document.getElementById(x);
const root = document.documentElement;
let item = null;

// ---------- reading preferences (Apple Books style) ----------
const prefs = { size: innerWidth < 500 ? 19 : 20, theme: 'auto', face: 'serif' };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('docket-reader') || '{}')); } catch (e) { /* first run */ }
function applyPrefs() {
  document.body.style.setProperty('--size', prefs.size + 'px');
  document.body.style.setProperty('--face', prefs.face === 'serif' ? 'var(--serif)' : 'var(--sans)');
  if (prefs.theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', prefs.theme);
  try { localStorage.setItem('docket-reader', JSON.stringify(prefs)); } catch (e) { /* storage blocked */ }
}
applyPrefs();

// ---------- bars ----------
$('back').append(icon('chevL'), 'Docket');
$('info').append(icon('info'));
const rbar = $('rbar');

function closePop() { document.querySelector('.pop')?.remove(); }
$('aa').addEventListener('click', e => {
  e.stopPropagation();
  if (document.querySelector('.pop')) return closePop();
  const seg = (opts, cur, on) => h('div', { class: 'seg' }, opts.map(([v, l]) =>
    h('button', { class: cur === v ? 'on' : '', onclick: e2 => { on(v); [...e2.target.parentNode.children].forEach(b => b.classList.toggle('on', b === e2.target)); } }, l)));
  const pop = h('div', { class: 'pop' },
    h('div', { class: 'seg' },
      h('button', { onclick: () => { prefs.size = Math.max(14, prefs.size - 1); applyPrefs(); }, style: 'font-size:13px' }, 'A'),
      h('button', { onclick: () => { prefs.size = Math.min(32, prefs.size + 1); applyPrefs(); }, style: 'font-size:20px' }, 'A')),
    seg([['serif', 'Serif'], ['sans', 'Sans']], prefs.face, v => { prefs.face = v; applyPrefs(); }),
    h('div', { class: 'swatches' }, [['auto', ''], ['light', 'Aa'], ['sepia', 'Aa'], ['gray', 'Aa'], ['dark', 'Aa']].map(([t, l]) =>
      h('button', { class: 'sw' + (prefs.theme === t ? ' on' : ''), 'data-t': t, 'aria-label': t, onclick: e2 => {
        prefs.theme = t; applyPrefs();
        document.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b === e2.currentTarget));
      } }, l))));
  pop.addEventListener('click', e2 => e2.stopPropagation());
  document.body.append(pop);
});
document.addEventListener('click', closePop);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePop(); document.querySelector('.scrim')?.remove(); } });

// ---------- details sheet ----------
function openInfo() {
  if (!item) return;
  const row = (k, v) => (v ? h('div', { class: 'cell kv' }, h('span', { class: 'k' }, k), v.nodeType ? v : h('span', { class: 'v' }, v)) : null);
  const tags = [item.section, ...(item.keywords || [])].filter(Boolean);
  const sheet = h('div', { class: 'sheet' },
    h('div', { class: 'grab' }), h('h2', {}, 'Details'),
    h('div', { class: 'group' },
      row('Source', item.site),
      row('Author', item.author),
      row('Published', fmtDate(item.publishedTime)),
      row('Updated', fmtDate(item.modifiedTime)),
      row('Section', item.section),
      row('Length', `${item.minutes} min · ${(item.words || 0).toLocaleString()} words`),
      row('Images saved', item.images ? String(item.images) : ''),
      row('Language', item.lang),
      row('Saved', fmtDate(item.savedAt)),
      row('On docket until', item.status === 'waiting' ? fmtDie(item.expiresAt) : ''),
      tags.length ? row('Tags', h('span', { class: 'tags' }, tags.map(t => h('span', { class: 'tag' }, t)))) : null),
    item.description ? h('div', { class: 'gh', style: 'margin-top:18px' }, 'Summary') : null,
    item.description ? h('div', { class: 'group' }, h('div', { class: 'cell' }, h('div', { class: 'desc' }, item.description))) : null,
    h('div', { class: 'group', style: 'margin-top:18px' },
      h('a', { class: 'cell', href: item.url, target: '_blank', rel: 'noopener', style: 'color:var(--blue)' }, h('span', { class: 'grow' }, 'Open original'), icon('open')),
      h('button', { class: 'cell', style: 'width:100%;color:var(--blue)', onclick: async () => { await navigator.clipboard.writeText(item.url); toast('Link copied'); } }, h('span', { class: 'grow', style: 'text-align:left' }, 'Copy link'), icon('copy'))));
  const scrim = h('div', { class: 'scrim', onclick: e => { if (e.target === scrim) scrim.remove(); } }, sheet);
  document.body.append(scrim);
}
$('info').addEventListener('click', openInfo);

// ---------- article ----------
async function main() {
  item = (await store.getItems())[id];
  const paper = $('paper');
  if (!item) { paper.append(h('p', {}, 'This article is not on your Docket.')); return; }
  document.title = item.title + ' — Docket';
  $('mid').textContent = item.title;
  const html = await store.getContent(id);

  const who = item.author || '';
  const line2 = [item.site, fmtDate(item.publishedTime), `${item.minutes} min read`].filter(Boolean);
  paper.append(
    h('h1', { class: 'hed' }, item.title),
    h('div', { class: 'byl' },
      who ? h('div', {}, h('b', {}, who)) : null,
      h('div', { class: 'row2' }, line2.flatMap((x, i) => (i ? [h('span', { class: 'dot' }, '·'), x] : [x]))),
      item.status === 'waiting' ? h('div', { class: 'row2' }, 'Due ' + fmtDie(item.expiresAt)) : null));

  const body = h('div', { class: 'body' });
  if (html) body.append(sanitizeToFragment(html));
  else body.append(h('p', {}, 'The saved text for this article has been cleared. Use “Open original” in Details.'));
  paper.append(body);

  if (item.status === 'waiting') {
    const done = async fn => { await fn(); location.href = 'library.html'; };
    const b = (cls, ic, label, fn) => h('button', { class: cls, onclick: () => done(fn) }, icon(ic), label);
    const dock = $('dock');
    dock.hidden = false;
    dock.append(
      b('', 'check', 'Finished', () => store.finish(id)),
      b('', 'cal', 'Adjourn', () => store.keepAWeek(id)),
      b('red', 'xmark', 'Dismiss', () => store.bury(id)));
    store.markOpened(id);
  }

  // progress line, collapsing title, remembered position
  const bar = $('progress');
  let t;
  let lastY = 0;
  const onScroll = () => {
    const dockEl = $('dock');
    if (scrollY > lastY + 10 && scrollY > 240) dockEl.classList.add('hide');
    else if (scrollY < lastY - 10 || scrollY < 120) dockEl.classList.remove('hide');
    lastY = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (max > 0 ? Math.min(100, (scrollY / max) * 100) : 0) + '%';
    rbar.classList.toggle('on', scrollY > 90);
    clearTimeout(t);
    t = setTimeout(() => store.setScroll(id, scrollY), 600);
  };
  addEventListener('scroll', onScroll, { passive: true });
  if (item.scroll > 0 && item.status === 'waiting') requestAnimationFrame(() => scrollTo(0, item.scroll));
}
main();
