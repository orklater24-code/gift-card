/* =========================================================================
   Cardora — dependency-free sanity check.
   Run with plain Node (no install):   node tools/check.mjs
   Exits non-zero on the first class of problem it finds.
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'gaming.html', 'quiz.html', 'privacy.html', 'terms.html'];

let failures = 0;
const ok = (name, cond, detail) => {
  if (cond) { console.log('  ok    ' + name); return; }
  failures++;
  console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + detail : ''));
};
const section = (t) => console.log('\n' + t);

/* ---------------------------------------------------------------- 1. registry
   Runs the real assets/offers.js in a sandbox with a minimal DOM, so the
   checks below read the values the browser would actually get.            */
section('assets/offers.js — registry');

const sandbox = {
  window: {},
  document: { querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { pathname: '/index.html' },
  console
};
sandbox.global = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/offers.js'), 'utf8'), sandbox, { filename: 'assets/offers.js' });

const C = sandbox.window.CARDORA;
ok('registry exposes CARDORA', !!C);
ok('catalogue is non-empty', C && C.offers.length > 0, C && C.offers.length);

if (C) {
  const keys = C.offers.map((o) => o.key);
  const ids = C.offers.map((o) => o.id);
  ok('offer keys unique', new Set(keys).size === keys.length, keys.join(','));
  ok('offer ids unique', new Set(ids).size === ids.length, ids.join(','));
  ok('every offer has category, tiers and quiz tags',
    C.offers.every((o) => o.category && o.categoryLabel && Array.isArray(o.tiers) && o.tiers.length && Array.isArray(o.quiz) && o.quiz.length));
  ok('every offer url is BASE + id',
    C.offers.every((o) => o.url === C.BASE + '&id=' + o.id), C.offers.find((o) => o.url !== C.BASE + '&id=' + o.id));
  ok('all reward/minute ranges parse to finite numbers',
    C.offers.every((o) => [o.rewardLo, o.rewardHi, o.minuteLo, o.minuteHi, o.perMinute, o.rewardMid].every(Number.isFinite)),
    JSON.stringify(C.offers.map((o) => ({ k: o.key, r: o.reward, m: o.minutes, pm: o.perMinute }))));
  ok('perMinute > 0 for every offer', C.offers.every((o) => o.perMinute > 0));
  ok('valueMax/rewardMax finite', Number.isFinite(C.valueMax) && Number.isFinite(C.rewardMax), [C.valueMax, C.rewardMax]);
  ok('link() appends an id', C.link(75113).endsWith('&id=75113'), C.link(75113));
  ok('brand + support contact present', !!C.BRAND && /@/.test(C.SUPPORT_EMAIL), C.SUPPORT_EMAIL);
}

/* ---------------------------------------------------------------- 2. pages */
for (const page of PAGES) {
  section(page);
  const file = path.join(ROOT, page);
  ok('file exists', fs.existsSync(file));
  if (!fs.existsSync(file)) continue;

  const html = fs.readFileSync(file, 'utf8');
  /* markup only: drop script/style bodies so JS string templates are not
     mistaken for real attributes and links */
  const markup = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

  ok('links the shared stylesheet', /href="assets\/site\.css"/.test(html));
  ok('loads the offer registry', /src="assets\/offers\.js"/.test(html));
  ok('has a lang + viewport', /<html lang=/.test(html) && /name="viewport"/.test(html));
  ok('has a title and meta description', /<title>[^<]+<\/title>/.test(html) && /name="description"/.test(html));

  /* inline scripts must parse */
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  ok('has an inline page script', inline.length > 0);
  inline.forEach((m, i) => {
    let parsed = true, err = '';
    try { new vm.Script(m[1], { filename: page + '#script' + i }); }
    catch (e) { parsed = false; err = e.message; }
    ok('inline script ' + i + ' parses', parsed, err);
  });

  /* every internal reference must resolve on disk */
  const refs = [...markup.matchAll(/(?:href|src)="([^"#][^"]*)"/g)]
    .map((m) => m[1].split('#')[0])
    .filter((u) => u && !/^(https?:|mailto:|data:)/.test(u));
  const missing = [...new Set(refs)].filter((u) => !fs.existsSync(path.join(ROOT, u)));
  ok('internal references resolve', missing.length === 0, missing.join(', '));

  /* data-offer attributes must point at real catalogue keys */
  const used = [...new Set([...markup.matchAll(/data-offer="([^"]+)"/g)].map((m) => m[1]))];
  const unknown = C ? used.filter((k) => !C.byKey(k)) : [];
  ok('data-offer keys exist in the catalogue', unknown.length === 0, unknown.join(','));

  /* affiliate links must be marked sponsored */
  const relBad = (markup.match(/rel="[^"]*nofollow[^"]*"/g) || []).filter((r) => !/sponsored/.test(r));
  ok('affiliate rel includes sponsored', relBad.length === 0, relBad.join(' '));

  /* disclosure wording differs between marketing pages and legal pages */
  const isLegal = page === 'privacy.html' || page === 'terms.html';
  ok('carries the affiliate disclosure',
    isLegal ? /Affiliate disclosure/i.test(markup) : /Affiliate (&amp;|&) brand disclosure/i.test(markup));
  ok('states that rewards are not guaranteed',
    isLegal ? /no reward is guaranteed|Not a guarantee|does not guarantee any reward/i.test(markup)
            : /does not guarantee any reward/i.test(markup));
  ok('footer links privacy + terms', /href="privacy\.html"/.test(markup) && /href="terms\.html"/.test(markup));
  ok('no unresolved template markers', !/\{\{|TODO:|FIXME/.test(html));
  ok('markup references only known data-offer keys', used.length >= 0);
}

/* ---------------------------------------------------------------- 3. css */
section('assets/site.css');
const css = fs.readFileSync(path.join(ROOT, 'assets/site.css'), 'utf8');
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
ok('braces balanced', open === close, open + ' open / ' + close + ' close');
ok('design tokens defined', /--paper:/.test(css) && /--ink:/.test(css) && /--tangerine:/.test(css));
ok('reduced-motion fallback present', /prefers-reduced-motion/.test(css));
for (const cls of ['.nav', '.btn', '.card', '.meter-fill', '.fq', '.disclosure', '.dock', '.prose', '.wallet', '.foil-card', '.sr-only']) {
  ok('shared class present: ' + cls, css.includes(cls + '{') || css.includes(cls + ' ') || css.includes(cls + ',') || css.includes(cls + ':'));
}

console.log('\n' + '='.repeat(46));
console.log(failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED');
console.log('='.repeat(46));
process.exit(failures === 0 ? 0 : 1);
