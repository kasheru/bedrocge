// Fills the page from the admin content (/api/content) when the site runs on the BEDROC server.
// The HTML already holds the same words, so the page reads complete without it.
const get = (o, p) => p.split('.').reduce((v, k) => (v == null ? v : v[k]), o);

try {
  const res = await fetch('/api/content', { headers: { Accept: 'application/json' } });
  if (res.ok) apply(await res.json());
} catch { /* opened without the server: keep the built-in words */ }

function apply(c) {
  for (const el of document.querySelectorAll('[data-c]')) {
    const v = get(c, el.dataset.c);
    if (typeof v === 'string' && v.trim()) el.textContent = v;
  }
  const list = (sel, fill) => { const el = document.querySelector(sel); if (el) fill(el); };

  // services rows: one per capability category, its items as the line
  list('[data-list="capabilities.categories"]', (ul) => {
    const cats = get(c, 'capabilities.categories') || [];
    [...ul.children].forEach((li, i) => {
      const cat = cats[i];
      if (!cat) return;
      li.querySelector('.rows__name').textContent = cat.name;
      const items = (cat.items || []).filter(Boolean);
      if (items.length) li.querySelector('p').textContent = items.join(', ') + '.';
    });
  });

  // ground problems: name and the first fixes
  list('[data-list="diagnostics.vulnerabilities"]', (ul) => {
    const vs = (get(c, 'diagnostics.vulnerabilities') || []).filter((v) => v && v.name);
    if (!vs.length) return;
    const tpl = ul.firstElementChild.cloneNode(true);
    ul.replaceChildren(...vs.slice(0, 8).map((v) => {
      const li = tpl.cloneNode(true);
      li.querySelector('.rows__name').textContent = v.name;
      li.querySelector('.rows__value').textContent = (v.fixes || []).slice(0, 2).join(', ');
      return li;
    }));
  });

  list('[data-list="sectors.items"]', (ul) => {
    const items = (get(c, 'sectors.items') || []).filter(Boolean);
    if (!items.length) return;
    const tpl = ul.firstElementChild.cloneNode(true);
    ul.replaceChildren(...items.slice(0, 6).map((t) => { const li = tpl.cloneNode(true); li.textContent = t; return li; }));
  });

  list('[data-list="site2.chapters"]', (ol) => {
    const chs = get(c, 'site2.chapters') || [];
    [...ol.children].forEach((li, i) => {
      const ch = chs[i];
      if (!ch) return;
      if (ch.title) li.querySelector('h3').textContent = ch.title;
      if (ch.text) li.querySelector('p').textContent = ch.text;
    });
  });
}
