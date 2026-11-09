// Pure time/logic helpers. No browser APIs, so they can be unit-tested in Node.
export const DAY = 86400000;
export const WORDS_PER_MIN = 230;

// End of the first Sunday (local time) on or after the given moment.
export function endOfSunday(ts) {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return d.getTime();
}

// Sunday Hearing: an item stays on the docket at least `minDays`, then comes up at the end of the next Sunday.
export function computeExpiry(savedAt, minDays = 7) {
  return endOfSunday(savedAt + minDays * DAY);
}

// "Adjourn a week": push the hearing date out by exactly one week (stays a Sunday).
export function extendExpiry(expiresAt, now = Date.now(), minDays = 7) {
  if (expiresAt <= now) return computeExpiry(now, minDays);
  const d = new Date(expiresAt);
  d.setDate(d.getDate() + 7);
  return d.getTime();
}

export function isWeekend(ts = Date.now()) {
  const g = new Date(ts).getDay();
  return g === 0 || g === 6;
}

export function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function minutesFor(words) {
  return Math.max(1, Math.ceil(words / WORDS_PER_MIN));
}

export function fmtLeft(exp, now = Date.now()) {
  if (exp <= now) return 'expired';
  if (new Date(exp).toDateString() === new Date(now).toDateString()) return 'tonight';
  const days = Math.ceil((exp - now) / DAY);
  return days === 1 ? 'tomorrow night' : `${days} days`;
}

export function fmtDie(exp) {
  return new Date(exp).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function sameMonth(a, b) {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth();
}

// Counters shown everywhere (popup, list, notification).
export function computeStats(items, now = Date.now()) {
  const list = Object.values(items);
  const sunday = endOfSunday(now);
  let waiting = 0, dying = 0, finishedMonth = 0, buriedMonth = 0, buriedTotal = 0;
  for (const it of list) {
    if (it.status === 'waiting') {
      waiting++;
      if (it.expiresAt <= sunday) dying++;
    } else if (it.status === 'finished' && it.finishedAt && sameMonth(it.finishedAt, now)) finishedMonth++;
    else if (it.status === 'buried') {
      buriedTotal++;
      if (it.buriedAt && sameMonth(it.buriedAt, now)) buriedMonth++;
    }
  }
  return { waiting, dying, finishedMonth, buriedMonth, buriedTotal };
}

// Weekend-only nudges. Returns {kind, title, message} or null.
//  Saturday (from notifyHour): one summary. Sunday (from 18:00): only if something is due tonight.
export function decideNotification(now, items, state, settings) {
  const d = new Date(now);
  const day = d.getDay(), hour = d.getHours();
  const key = dateKey(now);
  const s = computeStats(items, now);
  if (day === 6 && hour >= settings.notifyHour && state.lastSat !== key && s.waiting > 0) {
    return {
      kind: 'sat', key,
      title: `${s.waiting} ${s.waiting === 1 ? 'article' : 'articles'} on your docket`,
      message: `${s.dying} due Sunday night · ${s.buriedMonth} dismissed this month`
    };
  }
  if (day === 0 && hour >= 18 && state.lastSun !== key && s.dying > 0) {
    return {
      kind: 'sun', key,
      title: `${s.dying} ${s.dying === 1 ? 'article' : 'articles'} due tonight`,
      message: 'Read them, adjourn them, or dismiss them.'
    };
  }
  return null;
}

export function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
