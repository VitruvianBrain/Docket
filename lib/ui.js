// Tiny DOM helpers + icon set shared by the popup, list and reader. Text is always inserted as text, never as HTML.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}

const ICONS = {
  search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><circle class="f" cx="7.6" cy="12" r="1.3"/><circle class="f" cx="12" cy="12" r="1.3"/><circle class="f" cx="16.4" cy="12" r="1.3"/></svg>',
  tray: '<svg viewBox="0 0 24 24"><path d="M3 13.5 6 5.5h12l3 8V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13.5h5.2l1.3 2.4h5l1.3-2.4H21"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="m7.8 12.3 2.9 2.9 5.5-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>',
  xmark: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
  chevL: '<svg viewBox="0 0 24 24" style="stroke-width:2.4"><path d="m15 5-7 7 7 7"/></svg>',
  chevR: '<svg viewBox="0 0 24 24" style="stroke-width:2.4"><path d="m9 5 7 7-7 7"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5"/><circle class="f" cx="12" cy="7.8" r="1.1"/></svg>',
  clear: '<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.7 12.3-1.4 1.4L12 13.4l-2.3 2.3-1.4-1.4 2.3-2.3-2.3-2.3 1.4-1.4 2.3 2.3 2.3-2.3 1.4 1.4-2.3 2.3z"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/></svg>'
};
export function icon(name) {
  const s = document.createElement('span');
  s.className = 'ico';
  s.innerHTML = ICONS[name] || '';
  return s;
}

export function toast(text) {
  const t = h('div', { class: 'toast' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2400);
}

// iOS-style pull-down menu anchored under a button.
let menuEl = null;
export function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
const isPhone = () => matchMedia('(max-width: 640px)').matches;

// Phones get a full-width iOS action sheet with a Cancel button; larger screens get an anchored pull-down menu.
function openSheet(entries) {
  const items = entries.filter(e => e !== '-');
  menuEl = h('div', { class: 'scrim as', onclick: e => { if (e.target === menuEl) closeMenu(); } },
    h('div', { class: 'asheet' },
      h('div', { class: 'group' }, items.map(e => h('button', { class: 'ai' + (e.red ? ' red' : ''), onclick: async () => { closeMenu(); await e.fn(); } }, e.icon && icon(e.icon), e.label))),
      h('div', { class: 'group' }, h('button', { class: 'ai cancel', onclick: closeMenu }, 'Cancel'))));
  document.body.append(menuEl);
}

export function openMenu(anchor, entries) {
  closeMenu();
  if (isPhone()) return openSheet(entries);
  menuEl = h('div', { class: 'menu' }, entries.map(e => e === '-'
    ? h('div', { class: 'msep' })
    : h('button', { class: 'mi' + (e.red ? ' red' : ''), onclick: async () => { closeMenu(); await e.fn(); } }, e.label, e.icon && icon(e.icon))));
  document.body.append(menuEl);
  const r = anchor.getBoundingClientRect();
  const w = menuEl.offsetWidth;
  menuEl.style.top = (r.bottom + scrollY + 6) + 'px';
  menuEl.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.right + scrollX - w)) + 'px';
}
document.addEventListener('click', e => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-menu]')) closeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
