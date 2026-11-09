// Runs inside the page being saved (Readability.js is injected just before this file).
// Returns the clean article plus every useful piece of metadata the page publishes about itself.
(() => {
  try {
    const clone = document.cloneNode(true);
    const art = new Readability(clone, { keepClasses: false }).parse();
    if (!art || !art.content) return { ok: false, error: 'no-article' };

    const abs = u => { try { return u ? new URL(u, location.href).href : null; } catch { return null; } };
    const metaAll = n => [...document.querySelectorAll(`meta[property="${n}"],meta[name="${n}"]`)]
      .map(e => (e.getAttribute('content') || '').trim()).filter(Boolean);
    const meta = n => metaAll(n)[0] || '';
    const iso = v => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };
    const names = v => [].concat(v || []).map(p => (typeof p === 'string' ? p : p && p.name)).filter(Boolean);
    const uniq = a => [...new Set(a.map(s => String(s).trim()).filter(Boolean))];

    // Structured data (JSON-LD) is the most reliable source when a site provides it.
    const ld = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        const j = JSON.parse(s.textContent);
        (Array.isArray(j) ? j : (j['@graph'] || [j])).forEach(x => { if (x && typeof x === 'object') ld.push(x); });
      } catch (e) { /* ignore malformed JSON-LD */ }
    });
    const isArticle = x => /Article|BlogPosting|NewsArticle|Report|ScholarlyArticle|TechArticle/i.test([].concat(x['@type'] || []).join(' '));
    const a = ld.find(isArticle) || {};

    const authors = uniq([
      ...names(a.author), ...metaAll('author'), ...metaAll('parsely-author'),
      ...metaAll('article:author').filter(x => !/^https?:/i.test(x))
    ]).slice(0, 3);
    const bylineClean = (art.byline || '').replace(/^\s*by\s+/i, '').trim();
    if (!authors.length && bylineClean && bylineClean.length < 80) authors.push(bylineClean);

    const keywords = uniq([
      ...metaAll('article:tag'),
      ...(meta('keywords') ? meta('keywords').split(',') : []),
      ...(typeof a.keywords === 'string' ? a.keywords.split(',') : [].concat(a.keywords || []))
    ]).filter(s => s.length < 40).slice(0, 5);

    const ldImage = a.image && (typeof a.image === 'string' ? a.image : Array.isArray(a.image) ? (a.image[0] && (a.image[0].url || a.image[0])) : a.image.url);
    const iconEl = document.querySelector('link[rel="apple-touch-icon"]') || document.querySelector('link[rel~="icon"]');

    const published = iso(art.publishedTime || meta('article:published_time') || a.datePublished ||
      meta('og:article:published_time') || (document.querySelector('time[datetime]') || {}).dateTime);

    return {
      ok: true,
      title: art.title || meta('og:title') || document.title,
      authors,
      siteName: meta('og:site_name') || art.siteName || location.hostname.replace(/^www\./, ''),
      description: meta('og:description') || meta('description') || art.excerpt || '',
      publishedTime: published,
      modifiedTime: iso(meta('article:modified_time') || a.dateModified || meta('og:updated_time')),
      section: meta('article:section') || (typeof a.articleSection === 'string' ? a.articleSection : [].concat(a.articleSection || [])[0]) || '',
      keywords,
      lang: document.documentElement.lang || art.lang || '',
      type: meta('og:type') || '',
      canonical: abs((document.querySelector('link[rel="canonical"]') || {}).href || meta('og:url')),
      heroUrl: abs(meta('og:image') || meta('twitter:image') || ldImage),
      faviconUrl: abs(iconEl ? iconEl.getAttribute('href') : '/favicon.ico'),
      content: art.content,
      url: location.href
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
})();
