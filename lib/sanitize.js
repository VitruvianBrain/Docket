// Saved article HTML is untrusted web content. Strip anything active before storing and again before showing.
const DROP = 'script,style,iframe,object,embed,form,input,button,select,textarea,link,meta,noscript,svg,canvas,audio,video,base,dialog,template,frame,frameset';

export function sanitizeToFragment(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(DROP).forEach(n => n.remove());
  for (const el of doc.body.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || n === 'style' || n === 'srcset' || n === 'ping' || n === 'formaction' || n === 'srcdoc') {
        el.removeAttribute(a.name);
      } else if (n === 'href') {
        if (!/^(https?:|mailto:|#)/i.test(a.value.trim())) el.removeAttribute('href');
      } else if (n === 'src') {
        if (!/^data:image\//i.test(a.value.trim())) el.removeAttribute('src');
      }
    }
    if (el.tagName === 'A' && el.hasAttribute('href') && !el.getAttribute('href').startsWith('#')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  }
  // Images must be inlined (offline). Anything still pointing at the network is dropped.
  doc.body.querySelectorAll('img').forEach(img => { if (!img.getAttribute('src')) img.remove(); });
  const frag = document.createDocumentFragment();
  frag.append(...doc.body.childNodes);
  return frag;
}

export function sanitizeToHtml(html) {
  const div = document.createElement('div');
  div.append(sanitizeToFragment(html));
  return div.innerHTML;
}
