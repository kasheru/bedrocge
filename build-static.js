// Builds the v3 site as plain static files in dist/ for a static host (Vercel).
// Content comes from data/content.json when it exists (your local admin edits), else default-content.json.
// Run: node build-static.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public-v3'), OUT, { recursive: true });

// the diagnostic map shared with the first site
for (const f of ['diagram.js', 'diagram.css']) fs.copyFileSync(path.join(ROOT, 'public', f), path.join(OUT, f));

const local = path.join(ROOT, 'data', 'content.json');
const src = fs.existsSync(local) ? local : path.join(ROOT, 'default-content.json');
fs.copyFileSync(src, path.join(OUT, 'content.json'));

const index = path.join(OUT, 'index.html');
const html = fs.readFileSync(index, 'utf8').replace('<head>', '<head>\n<script>window.BEDROC_STATIC=true</script>');
fs.writeFileSync(index, html);

console.log(`dist/ built from public-v3 with content from ${path.relative(ROOT, src)}`);
