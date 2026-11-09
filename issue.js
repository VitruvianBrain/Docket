import * as store from './lib/store.js';
import { buildIssue, fmtHours, fmtDie, endOfSunday } from './lib/time.js';
import { h, icon } from './lib/ui.js';

const readerUrl = id => 'reader.html?id=' + id;
$('back').append(icon('chevL'), 'Docket');
function $(id) { return document.getElementById(id); }

const mark = it => it.thumb
  ? h('img', { class: 'ithumb', src: it.thumb, alt: '' })
  : h('div', { class: 'ithumb ph' }, (it.site || it.title || '?').trim()[0].toUpperCase());

const kicker = it => [it.section || it.site, it.section && it.site ? it.site : ''].filter(Boolean).join(' · ');
const byline = it => [it.author, `${it.minutes} min`].filter(Boolean).join(' · ');

function story(it, size) {
  const due = it.expiresAt <= endOfSunday(Date.now()) && h('span', { class: 'tag due' }, 'Due ' + fmtDie(it.expiresAt));
  return h('a', { class: 'story ' + size, href: readerUrl(it.id) },
    size === 'cover' && it.thumb ? mark(it) : null,
    h('div', { class: 'sbody' },
      h('div', { class: 'kick' }, kicker(it)),
      h('h3', {}, it.title),
      it.description ? h('p', { class: 'dek' }, it.description) : null,
      h('div', { class: 'by' }, byline(it), due)),
    size !== 'cover' ? mark(it) : null);
}

function section(title, note, list) {
  if (!list.length) return null;
  return h('section', { class: 'sec' },
    h('div', { class: 'sechead' }, h('h2', {}, title), h('span', {}, note)),
    h('div', { class: 'stories' }, list.map(i => story(i, 'row'))));
}

async function main() {
  const items = await store.getItems();
  const iss = buildIssue(items);
  const now = new Date();
  const mag = $('mag');
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  mag.append(h('header', { class: 'mast' },
    h('div', { class: 'issueline' }, `Weekend Issue · No. ${iss.number}`),
    h('h1', {}, 'Docket'),
    h('div', { class: 'dateline' }, date)));
  if (!iss.count) {
    mag.append(h('p', { class: 'blank' }, 'Nothing on your docket. Save an article during the week and it will appear here on the weekend.'));
    return;
  }
  mag.append(h('p', { class: 'inside' },
    `${iss.count} ${iss.count === 1 ? 'article' : 'articles'} · ${fmtHours(iss.minutes)} of reading`,
    iss.dueCount ? ` · ${iss.dueCount} due Sunday night` : ''));
  if (iss.cover) mag.append(h('div', { class: 'coverlabel' }, 'Cover story'), story(iss.cover, 'cover'));
  const parts = [
    section('Due Sunday', 'Read, adjourn or dismiss before midnight', iss.due),
    section('Quick reads', 'Five minutes or less', iss.quick),
    section('Longer reads', 'Settle in', iss.longer)
  ].filter(Boolean);
  mag.append(...parts);
  mag.append(h('footer', { class: 'colophon' }, 'Whatever is still here after Sunday goes. That is the point.'));
}
main();
