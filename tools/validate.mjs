/* ==========================================================================
   Personal Portfolio - static-site validator
   --------------------------------------------------------------------------
     node tools/validate.mjs                     # always-on checks
     node tools/validate.mjs --check-placeholders=1

   Dependency-free so it runs inside `node:alpine` with no install step, and
   usable locally the same way. Exits non-zero on failure, which fails the
   Docker build stage.
   ========================================================================== */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strictContent = process.argv.includes('--check-placeholders=1');

const errors = [];
const warnings = [];
const notes = [];

const fail = m => errors.push(m);
const warn = m => warnings.push(m);
const note = m => notes.push(m);
const green  = s => `\x1b[32m${s}\x1b[0m`;
const red    = s => `\x1b[31m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const dim    = s => `\x1b[2m${s}\x1b[0m`;

/* --- Read every HTML entry point ---------------------------------------- */
const htmlFiles = ['index.html'].filter(f => existsSync(join(ROOT, f)));
if (!htmlFiles.length) fail('index.html is missing from the build context');

const pages = htmlFiles.map(f => ({ file: f, html: readFileSync(join(ROOT, f), 'utf8') }));

/* --- 1. Every referenced local asset must exist ------------------------- */
const REMOTE = /^(https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i;

for (const { file, html } of pages) {
  const refs = new Set();

  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)) refs.add(m[1]);
  for (const m of html.matchAll(/\bsrcset\s*=\s*"([^"]+)"/g)) {
    m[1].split(',').forEach(part => refs.add(part.trim().split(/\s+/)[0]));
  }

  for (const ref of refs) {
    if (!ref || REMOTE.test(ref)) continue;

    // Strip any query string / hash before resolving
    const clean = ref.split(/[?#]/)[0];
    if (!clean) continue;

    const target = join(ROOT, normalize(clean).replace(/^([/\\])+/, ''));
    if (!existsSync(target)) {
      fail(`${file}: referenced asset not found -> ${ref}`);
    } else if (statSync(target).isDirectory()) {
      fail(`${file}: reference points at a directory -> ${ref}`);
    }
  }
}
note('checked that local src/href/srcset references resolve to real files');

/* --- 2. Unique ids and resolvable in-page references ------------------- */
for (const { file, html } of pages) {
  const ids = [...html.matchAll(/\bid\s*=\s*"([^"]+)"/g)].map(m => m[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) fail(`${file}: duplicate id "${id}"`);
    seen.add(id);
  }

  const anchors = [...html.matchAll(/\bhref\s*=\s*"#([^"]+)"/g)].map(m => m[1]);
  for (const a of new Set(anchors)) {
    if (a && !seen.has(a)) fail(`${file}: anchor "#${a}" has no matching id`);
  }

  for (const u of new Set([...html.matchAll(/<use[^>]+href\s*=\s*"#([^"]+)"/g)].map(m => m[1]))) {
    if (!seen.has(u)) fail(`${file}: <use href="#${u}"> has no matching symbol/id`);
  }

  for (const attr of ['aria-labelledby', 'aria-controls', 'aria-describedby']) {
    for (const m of html.matchAll(new RegExp(`${attr}\\s*=\\s*"([^"]+)"`, 'g'))) {
      for (const ref of m[1].split(/\s+/).filter(Boolean)) {
        if (!seen.has(ref)) fail(`${file}: ${attr}="${ref}" has no matching id`);
      }
    }
  }

  note(`${file}: ${ids.length} ids, ${new Set(anchors).size} anchors, all references resolved`);
}

/* --- 2b. Tags must balance --------------------------------------------- */
const VOID = new Set(['area','base','br','col','embed','hr','img','input',
  'link','meta','param','source','track','wbr','use','path','circle','rect',
  'ellipse','line','polygon','stop']);

function checkBalance(html, file) {
  const stack = [];
  // Drop comments, doctype, CDATA and the contents of <script>/<style>
  const src = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  for (const m of src.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g)) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const selfClosed = m[4] === '/' || VOID.has(tag);
    if (selfClosed) continue;
    if (!closing) stack.push(tag);
    else {
      const top = stack.pop();
      if (top !== tag) {
        fail(`${file}: unbalanced </${tag}> (expected </${top ?? 'nothing'}>)`);
        return;
      }
    }
  }
  if (stack.length) {
    fail(`${file}: ${stack.length} unclosed tag(s): <${stack.join('>, <')}>`);
  }
}

for (const { file, html } of pages) checkBalance(html, file);

/* --- 2c. Text encoding must be intact ---------------------------------- */
// A UTF-8 file read as ANSI and written back as UTF-8 double-encodes every
// non-ASCII character (em dashes, box drawing, the pencil emoji). The result
// is valid UTF-8, so nothing else catches it - the page just renders "â€"".
const MOJIBAKE = /[\u00C2\u00C3\u00E2\u0093\u0094\uFFFD]/;

for (const f of ['index.html', 'assets/css/styles.css', 'assets/js/main.js', 'README.md']) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;

  const buf = readFileSync(p);
  const text = buf.toString('utf8');

  if (text.includes('\uFFFD')) fail(`${f}: contains U+FFFD - file is not valid UTF-8`);
  const m = text.match(MOJIBAKE);
  if (m) {
    const line = text.slice(0, m.index).split('\n').length;
    fail(`${f}:${line}: mojibake "${m[0]}" - text was double-encoded (${m[0] === '\u00C2' ? 'read as ANSI then written as UTF-8' : 'check encoding'}). Use a UTF-8 aware editor, not PowerShell Get-Content/Set-Content.`);
  }
}

/* --- 3. Basic document sanity ------------------------------------------- */
for (const { file, html } of pages) {
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) fail(`${file}: expected exactly one <h1>, found ${h1}`);

  if (!/<html[^>]+lang\s*=/i.test(html)) fail(`${file}: <html> is missing a lang attribute`);
  if (!/<title>/i.test(html)) fail(`${file}: no <title>`);
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) fail(`${file}: no viewport meta tag`);
  if (!/<meta[^>]+name=["']description["']/i.test(html)) warn(`${file}: no meta description`);

  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt\s*=/i.test(m[0])) fail(`${file}: <img> without alt -> ${m[0].slice(0, 70)}…`);
  }

  for (const m of html.matchAll(/<a\b[^>]*target\s*=\s*"_blank"[^>]*>/g)) {
    if (!/rel\s*=\s*"[^"]*noopener/i.test(m[0])) {
      fail(`${file}: target="_blank" without rel="noopener" -> ${m[0].slice(0, 70)}…`);
    }
  }

  for (const m of html.matchAll(/<script\b[^>]*>/g)) {
    const tag = m[0];
    const type = (tag.match(/type\s*=\s*"([^"]+)"/i) || [])[1];
    if (type && type !== 'module') continue;      // e.g. application/ld+json is inert
    if (/\b(defer|async)\b/i.test(tag)) continue;
    if (/\bsrc\s*=/i.test(tag)) fail(`${file}: render-blocking external script (add defer) -> ${tag.slice(0, 70)}…`);
  }
}

/* --- 4. Optional: flag leftover placeholder content --------------------- */
const PLACEHOLDER = [
  { re: /example\.com/i,                                what: 'example.com URLs' },
  { re: /placeholder/i,                                 what: '"placeholder" wording' },
  { re: /assets\/img\/portrait-placeholder\.svg/,       what: 'the placeholder portrait' },
  { re: /\bTODO\b/,                                     what: 'TODO markers' },
  // Fill-in-the-blank text someone forgot to replace, e.g. "YOUR CITY".
  // Matches a run of two or more ALL-CAPS words rather than a fixed keyword.
  { re: /\b[A-Z]{4,}(?:\s+[A-Z]{4,})+\b/,                what: 'an unreplaced ALL-CAPS placeholder' },
  { re: /\b(?:lorem|ipsum)\b/i,                         what: 'lorem ipsum filler text' },
  { re: /<h1[^>]*>\s*(?:Hi,? I am\b|[A-Z][a-z]+\s+[A-Z][a-z]+\s*<\/h1>)/i, what: 'an unmodified demo <h1>' }
];

if (strictContent) {
  for (const { file, html } of pages) {
    for (const { re, what } of PLACEHOLDER) {
      if (re.test(html)) fail(`${file}: still contains ${what} (replace it before launch)`);
    }
  }
} else {
  for (const { file, html } of pages) {
    for (const { re, what } of PLACEHOLDER) {
      if (re.test(html)) note(`${file}: contains ${what} (expected with demo content)`);
    }
  }
  warn('placeholder content check is OFF (pass --check-placeholders=1 to enforce)');
}

/* --- Report ------------------------------------------------------------- */
console.log('\n  Portfolio static-site validation\n  ' + '─'.repeat(46));
for (const n of notes) console.log('  ' + dim(n));
if (warnings.length) {
  console.log('');
  for (const w of warnings) console.log('  ' + yellow('warn') + '  ' + w);
}
if (errors.length) {
  console.log('');
  for (const e of errors) console.log('  ' + red('FAIL') + '  ' + e);
  console.log('\n  ' + red(`${errors.length} error(s)`) + '\n');
  process.exit(1);
}
console.log('\n  ' + green('OK') + '  all checks passed\n');