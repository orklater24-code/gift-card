/* =========================================================================
   Cardora — DOM test harness.
   Run:  npm test          (installs jsdom, then runs this)
   Serves the repo over HTTP so assets/offers.js and assets/ads.js load
   exactly as a browser loads them, then drives each page's real script.
   ========================================================================= */
import { JSDOM, VirtualConsole, ResourceLoader } from 'jsdom';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://singingfiles.com/show.php?l=0&u=2539501';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); return; }
  fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
};
const eq = (name, actual, expected) =>
  ok(`${name} (=${JSON.stringify(expected)})`, String(actual) === String(expected), actual);
const section = (t) => console.log('\n' + t);
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

/* Pages are loaded straight from disk (file://) so there is no server to
   wait for. Only local subresources are fetched — Google Fonts is skipped. */
class LocalLoader extends ResourceLoader {
  fetch(url, opts) { return url.startsWith('file:') ? super.fetch(url, opts) : null; }
}

/* file:// documents have an opaque origin, so stand in for localStorage */
function memoryStorage() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
    setItem: (k, v) => mem.set(String(k), String(v)),
    removeItem: (k) => mem.delete(String(k)),
    clear: () => mem.clear(),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; }
  };
}

function ctxStub() {
  const grad = { addColorStop() {} };
  return {
    setTransform() {}, save() {}, restore() {}, createLinearGradient: () => grad,
    fillRect() {}, beginPath() {}, arc() {}, fill() {}, fillText() {},
    measureText: () => ({ width: 10 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)).fill(255) })
  };
}

function load(file, opts = {}) {
  return new Promise((resolve, reject) => {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.message || e)));
    vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
    /* no `url` override: the document keeps its file:// origin so that
       assets/offers.js and assets/ads.js resolve to real files on disk */
    JSDOM.fromFile(path.join(ROOT, file), {
      runScripts: 'dangerously',
      resources: new LocalLoader(),
      pretendToBeVisual: true,
      virtualConsole: vc,
      beforeParse(w) {
        Object.defineProperty(w, 'localStorage', { value: memoryStorage(), configurable: true });
        w.IntersectionObserver = class {
          constructor(cb) { this.cb = cb; }
          observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
          unobserve() {} disconnect() {}
        };
        w.HTMLCanvasElement.prototype.getContext = () => ctxStub();
        w.Element.prototype.scrollIntoView = function () {};
        w.Element.prototype.setPointerCapture = function () {};
        w.fetch = () => Promise.reject(new Error('no network in harness'));
        if (opts.seed) opts.seed(w);
      }
    }).then((dom) => {
      dom.window.addEventListener('load', () => setTimeout(() => resolve({ dom, w: dom.window, errors }), 80));
      setTimeout(() => resolve({ dom, w: dom.window, errors }), 4000);
    }, reject);
  });
}

const noErrors = (errors) => { eq('no runtime errors', errors.length, 0); if (errors.length) console.log(errors.slice(0, 6).join('\n')); };

/* Ads must be consented out of the way for the page-behaviour tests. */
const acceptAds = (w) => {
  const btn = w.document.querySelector('.consent [data-c="accept"]');
  if (btn) click(w, btn);
};

try {
  /* ============================== INDEX ============================== */
  section('index.html');
  {
    const { w, errors } = await load('index.html');
    const d = w.document, C = w.CARDORA;
    acceptAds(w);
    ok('registry loaded', !!C && C.offers.length === 6, C && C.offers.length);
    eq('offer cards rendered', d.querySelectorAll('#grid .card').length, 6);
    const links = [...d.querySelectorAll('#grid a[data-offer]')];
    eq('affiliate anchors', links.length, 6);
    ok('hrefs built from the registry', links.every((a) => a.getAttribute('href') === `${BASE}&id=${C.byKey(a.dataset.offer).id}`),
      links.map((a) => a.getAttribute('href')));
    ok('rel=sponsored + target=_blank', links.every((a) => /sponsored/.test(a.rel) && a.target === '_blank'));
    eq('strip offer count', d.querySelector('#countOffers').textContent, '6');
    eq('headline number word', d.querySelector('#countWord').textContent, 'Six');
    eq('minutes range derived', d.querySelector('#rangeMin').textContent, '3\u201345');
    ok('CTA count', /6 live offers/.test(d.querySelector('#ctaCount').textContent), d.querySelector('#ctaCount').textContent);
    eq('filter chips', d.querySelectorAll('#chips .chip').length, 7);
    eq('FAQ entries', d.querySelectorAll('#faqList .fq').length, 7);
    ok('value meters filled on reveal', [...d.querySelectorAll('#grid .meter-fill')].every((m) => parseFloat(m.style.width) > 0),
      [...d.querySelectorAll('#grid .meter-fill')].map((m) => m.style.width));
    eq('year filled', d.querySelector('#year').textContent, String(new Date().getFullYear()));
    ok('mailto filled', d.querySelector('#mailto').href.startsWith('mailto:'), d.querySelector('#mailto').href);

    click(w, [...d.querySelectorAll('#chips .chip')].find((c) => /^Gaming/.test(c.textContent)));
    const visible = [...d.querySelectorAll('#grid .card')].filter((c) => !c.classList.contains('hide'));
    eq('gaming filter leaves 1 card', visible.length, 1);
    ok('filtered card is the playtest', /Playtest Session/.test(visible[0].textContent), visible[0].querySelector('h3').textContent);

    const fq = d.querySelector('#faqList .fq-q');
    click(w, fq);
    eq('FAQ opens', fq.getAttribute('aria-expanded'), 'true');
    ok('FAQ height set', fq.parentNode.querySelector('.fq-a').style.maxHeight !== '');

    w.localStorage.clear();
    click(w, d.querySelector('#grid a[data-offer="bonus"]'));
    const log = JSON.parse(w.localStorage.getItem('cardora.clicks') || '[]');
    eq('click logged', log.length, 1);
    ok('click log has offer key + source', log[0] && log[0].key === 'bonus' && log[0].src === 'hub-card', log[0]);

    const form = d.querySelector('#signupForm'), email = d.querySelector('#emailInput'), out = d.querySelector('#formOk');
    email.value = 'nope';
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    ok('bad email rejected', /doesn/.test(out.textContent), out.textContent);
    email.value = 'player@example.com';
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    ok('good email stored locally', /Saved on this device/.test(out.textContent), out.textContent);
    eq('subs list holds address', JSON.parse(w.localStorage.getItem('cardora.subs') || '[]').length, 1);

    ok('scratch pick = shortest offer', /Community Bonus Pool/.test(d.querySelector('#prizeTitle').textContent),
      d.querySelector('#prizeTitle').textContent);
    click(w, d.querySelector('#resetScratch'));
    eq('scratch resets', d.querySelector('#scratchHint').textContent, 'Drag to scratch');
    noErrors(errors);
  }

  /* ============================== GAMING ============================== */
  section('gaming.html');
  {
    const { w, errors } = await load('gaming.html');
    const d = w.document, C = w.CARDORA;
    acceptAds(w);
    eq('board cards', d.querySelectorAll('#grid .card').length, 6);
    eq('comparison rows', d.querySelectorAll('#tbody tr').length, 6);
    eq('stat offers', d.querySelector('#statOffers').textContent, '6');
    eq('best per-minute', d.querySelector('#statBest').textContent, `$${C.valueMax.toFixed(2)}/min`);
    eq('ceiling stat', d.querySelector('#statCeiling').textContent, '$120');
    const tiers = [...d.querySelectorAll('#tierLegend .tier h3')].map((t) => t.textContent.replace(/\s+/g, '').trim());
    ok('legend counts 4/3/2', /Common4offers/.test(tiers[0]) && /Rare3offers/.test(tiers[1]) && /Legendary2offers/.test(tiers[2]), tiers);
    ok('board links wired', [...d.querySelectorAll('#grid a[data-offer]')].every((a) => a.getAttribute('href') === `${BASE}&id=${C.byKey(a.dataset.offer).id}`));
    ok('table links wired', [...d.querySelectorAll('#tbody a[data-offer]')].every((a) => /singingfiles\.com/.test(a.getAttribute('href'))));

    click(w, [...d.querySelectorAll('#chips .chip')].find((c) => /^Legendary/.test(c.textContent)));
    eq('legendary filter leaves 2', [...d.querySelectorAll('#grid .card')].filter((c) => c.style.display !== 'none').length, 2);
    eq('empty state hidden', d.querySelector('#empty').style.display, 'none');

    const sel = d.querySelector('#sort');
    sel.value = 'ceiling'; sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    eq('ceiling sort puts premium first', d.querySelector('#grid .card h3').textContent, 'Premium Partner Program');
    ok('links re-wired after re-render', d.querySelector('#grid a[data-offer]').getAttribute('href').includes('id=74437'));
    sel.value = 'time'; sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    eq('time sort puts bonus first', d.querySelector('#grid .card h3').textContent, 'Community Bonus Pool');
    eq('FAQ entries', d.querySelectorAll('#faqList .fq').length, 7);
    noErrors(errors);
  }

  /* ============================== QUIZ ============================== */
  section('quiz.html');
  {
    const { w, errors } = await load('quiz.html');
    const d = w.document;
    acceptAds(w);
    eq('starts on question 1', d.querySelector('#stepLabel').textContent, 'Question 1 of 5');
    eq('options shown', d.querySelectorAll('.opt').length, 4);
    ok('next disabled before an answer', d.querySelector('#nextBtn').disabled);
    eq('results hidden at start', d.querySelector('#results').style.display, 'none');

    for (const pick of [1, 2, 0, 2, 3]) {
      click(w, d.querySelectorAll('.opt')[pick]);
      ok('answer enables next', !d.querySelector('#nextBtn').disabled);
      click(w, d.querySelector('#nextBtn'));
    }
    ok('results shown', d.querySelector('#results').style.display !== 'none');
    const results = [...d.querySelectorAll('#resultList .result')];
    eq('three matches returned', results.length, 3);
    const titles = results.map((r) => r.querySelector('h3').textContent);
    eq('top match = playtest', titles[0], 'Playtest Session');
    eq('second match = premium', titles[1], 'Premium Partner Program');
    eq('third match = appinstall', titles[2], 'App Trial Credit');
    ok('reasons rendered', results[0].querySelectorAll('.reasons .pill').length >= 2, titles[0]);
    eq('fit bar set', results[0].querySelector('.fit-bar i').style.width, '100%');
    eq('preview card reward', d.querySelector('#previewAmt').textContent, '$15\u201360');
    const qLinks = [...d.querySelectorAll('#resultList a[data-offer]')];
    eq('result links', qLinks.length, 3);
    ok('result links wired', qLinks.every((a) => /singingfiles\.com\/show\.php\?l=0&u=2539501&id=\d+$/.test(a.getAttribute('href'))),
      qLinks.map((a) => a.getAttribute('href')));

    click(w, d.querySelector('#retakeBtn'));
    eq('retake hides results', d.querySelector('#results').style.display, 'none');
    eq('retake back to question 1', d.querySelector('#stepLabel').textContent, 'Question 1 of 5');
    eq('retake clears preview', d.querySelector('#previewAmt').textContent, '\u2014');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: '2', bubbles: true }));
    ok('keyboard 1-4 selects', d.querySelector('.opt[aria-checked="true"]') !== null);
    noErrors(errors);
  }

  /* ============================== LEGAL ============================== */
  for (const f of ['privacy.html', 'terms.html']) {
    section(f);
    const { w, errors } = await load(f);
    const d = w.document;
    acceptAds(w);
    ok('support mailto wired', d.querySelector('#mailto').href === 'mailto:' + w.CARDORA.SUPPORT_EMAIL, d.querySelector('#mailto').href);
    ok('support address visible', /cardora\.example/.test(d.querySelector('#mailto').textContent));
    eq('updated stamp', d.querySelector('#updated').textContent, new Date().toISOString().slice(0, 10));
    ok('prose sections present', d.querySelectorAll('.prose h3').length >= 10, d.querySelectorAll('.prose h3').length);
    noErrors(errors);
  }

  /* ============================== REGISTRY ============================== */
  section('assets/offers.js — registry maths');
  {
    const { w, errors } = await load('privacy.html');
    const C = w.CARDORA;
    acceptAds(w);
    eq('catalogue size', C.offers.length, 6);
    ok('every offer has a url', C.offers.every((o) => o.url === `${BASE}&id=${o.id}`));
    eq('perMinute for premium', C.byKey('premium').perMinute, 1.61);
    eq('perMinute for bonus', C.byKey('bonus').perMinute, 1.56);
    eq('valueMax', C.valueMax, 1.61);
    eq('rewardMax', C.rewardMax, 72.5);
    eq('byCategory gaming', C.byCategory('gaming').length, 1);
    eq('sub-id disabled by default', C.link(75113), `${BASE}&id=75113`);
    noErrors(errors);
  }

  /* ============================== AD LAYER ============================== */
  const AD_CODE = '<div class="fake-ad">AD</div>';
  const POP_CODE = '<script>window.__pop = (window.__pop||0)+1;<\/script>';

  section('assets/ads.js — consent gate (index.html)');
  {
    const { w, errors } = await load('index.html');
    const d = w.document;
    ok('consent bar shown before any ad', !!d.querySelector('.consent'));
    ok('ads held back while pending', d.body.classList.contains('ads-pending'));
    eq('nothing loaded yet', d.querySelectorAll('.ad-slot.ad-loaded').length, 0);
    eq('no pop-under yet', d.querySelectorAll('.ad-host').length, 0);

    const A = w.CARDORA_ADS;
    ok('ad API exposed', !!A && typeof A.refresh === 'function' && typeof A.set === 'function');
    A.config.slots['hero-bottom'] = AD_CODE;
    A.config.slots['sticky'] = AD_CODE;
    A.config.popunder = POP_CODE;

    click(w, d.querySelector('.consent [data-c="accept"]'));
    ok('consent bar removed after choice', !d.querySelector('.consent'));
    ok('pending state cleared', !d.body.classList.contains('ads-pending'));
    eq('choice persisted', JSON.parse(w.localStorage.getItem('cardora.consent')).v, 'accept');
    ok('hero slot filled', d.querySelector('[data-ad-slot="hero-bottom"]').classList.contains('ad-loaded')
      && !!d.querySelector('[data-ad-slot="hero-bottom"] .fake-ad'));
    ok('sticky slot flags the body', d.body.classList.contains('has-sticky-ad'));
    ok('sticky height published as a CSS var', /px$/.test(d.documentElement.style.getPropertyValue('--sticky-ad-h')),
      d.documentElement.style.getPropertyValue('--sticky-ad-h'));
    eq('pop-under script actually executed', w.__pop, 1);
    eq('pop-under timestamp stored for capping', Object.keys(JSON.parse(w.localStorage.getItem('cardora.adcap'))).length, 1);
    /* pre-footer has no banner code, so it falls back to the sponsored link */
    ok('slot without banner code falls back to the sponsored link',
      d.querySelector('[data-ad-slot="pre-footer"]').classList.contains('ad-direct')
      && !!d.querySelector('[data-ad-slot="pre-footer"] .ad-cta'));
    A.config.formats.directLink = false;
    A.refresh();
    ok('with the fallback off the slot becomes a labelled placeholder',
      d.querySelector('[data-ad-slot="pre-footer"]').classList.contains('ad-empty'));
    A.config.formats.directLink = true;
    A.refresh();

    A.set('display', false);
    A.refresh();
    ok('killing a format hides its slot', d.querySelector('[data-ad-slot="pre-footer"]').classList.contains('ad-off')
      || !d.querySelector('[data-ad-slot="pre-footer"]').classList.contains('ad-loaded'));
    noErrors(errors);
  }

  section('assets/ads.js — reject path (index.html)');
  {
    const { w, errors } = await load('index.html');
    const d = w.document;
    w.CARDORA_ADS.config.slots['hero-bottom'] = AD_CODE;
    w.CARDORA_ADS.config.popunder = POP_CODE;
    click(w, d.querySelector('.consent [data-c="reject"]'));
    eq('reject persisted', JSON.parse(w.localStorage.getItem('cardora.consent')).v, 'reject');
    eq('no ad loaded', d.querySelectorAll('.ad-slot.ad-loaded').length, 0);
    eq('no pop-under', d.querySelectorAll('.ad-host').length, 0);
    eq('offers still work with ads off', d.querySelectorAll('#grid .card').length, 6);
    noErrors(errors);
  }

  section('assets/ads.js — frequency cap');
  {
    const { w, errors } = await load('index.html', {
      seed(win) {
        win.localStorage.setItem('cardora.adcap', JSON.stringify({ popunder: new Date().toISOString() }));
        win.localStorage.setItem('cardora.consent', JSON.stringify({ v: 'accept', at: new Date().toISOString() }));
      }
    });
    const d = w.document;
    w.CARDORA_ADS.config.popunder = POP_CODE;
    w.CARDORA_ADS.refresh();
    ok('no consent bar when already accepted', !d.querySelector('.consent'));
    eq('pop-under suppressed inside its cap window', w.__pop === undefined ? 0 : w.__pop, 0);
    eq('no pop-under host', d.querySelectorAll('.ad-host--popunder').length, 0);
    noErrors(errors);
  }

  section('assets/ads.js — in-feed (gaming.html)');
  {
    const { w, errors } = await load('gaming.html');
    const d = w.document, A = w.CARDORA_ADS;
    A.config.slots['in-feed'] = AD_CODE;
    click(w, d.querySelector('.consent [data-c="accept"]'));
    const feed = () => d.querySelectorAll('#grid .ad-slot--feed').length;
    eq('in-feed slots injected', feed(), A.config.inFeed.max);
    ok('in-feed slot filled', !!d.querySelector('#grid .ad-slot--feed .fake-ad'));
    ok('first grid child is still an offer card', d.querySelector('#grid').firstElementChild.classList.contains('card'));
    const sel = d.querySelector('#sort');
    sel.value = 'time'; sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    await tick(60);
    eq('in-feed slots re-placed after re-render', feed(), A.config.inFeed.max);
    noErrors(errors);
  }

  section('assets/ads.js — sponsored direct link (omg10 placement)');
  {
    const { w, errors } = await load('index.html');
    const d = w.document, A = w.CARDORA_ADS;
    const URL = A.config.directLink.url;
    ok('placement URL configured', /^https:\/\/omg10\.com\/4\/\d+$/.test(URL), URL);
    eq('nothing rendered before consent', d.querySelectorAll('.ad-cta').length, 0);

    click(w, d.querySelector('.consent [data-c="accept"]'));
    const ctas = [...d.querySelectorAll('a.ad-cta')];
    eq('rendered in the configured slots', ctas.length, A.config.directLink.slots.length);
    ok('href is the placement', ctas.every((a) => a.getAttribute('href') === URL), ctas.map((a) => a.getAttribute('href')));
    ok('opens in a new tab', ctas.every((a) => a.target === '_blank'));
    ok('rel = sponsored + nofollow + noopener',
      ctas.every((a) => /sponsored/.test(a.rel) && /nofollow/.test(a.rel) && /noopener/.test(a.rel)), ctas.map((a) => a.rel));
    ok('visibly labelled as advertising', /Sponsored/.test(ctas[0].textContent), ctas[0].textContent.trim().slice(0, 60));
    ok('states it is not a Cardora offer', /not a Cardora offer|no reward from us/i.test(ctas[0].textContent));
    ok('slot flagged as a direct link', d.querySelector('[data-ad-slot="hero-bottom"]').classList.contains('ad-direct'));

    /* a pasted banner must win over the fallback link */
    A.config.slots['hero-bottom'] = '<div class="fake-ad">BANNER</div>';
    A.refresh();
    ok('banner code overrides the direct link in that slot',
      !!d.querySelector('[data-ad-slot="hero-bottom"] .fake-ad')
      && !d.querySelector('[data-ad-slot="hero-bottom"] .ad-cta'));
    eq('API exposes the url', A.directLinkUrl(), URL);
    A.set('directLink', false);
    A.refresh();
    eq('format switch removes every direct link', d.querySelectorAll('.ad-cta').length, 0);
    noErrors(errors);
  }

  section('assets/ads.js — direct link respects a reject');
  {
    const { w, errors } = await load('quiz.html');
    const d = w.document;
    click(w, d.querySelector('.consent [data-c="reject"]'));
    eq('no sponsored link after reject', d.querySelectorAll('.ad-cta').length, 0);
    eq('quiz still intact', d.querySelectorAll('.opt').length, 4);
    noErrors(errors);
  }

  section('assets/ads.js — present on every page');
  for (const f of ['index.html', 'gaming.html', 'quiz.html', 'privacy.html', 'terms.html']) {
    const { w, errors } = await load(f);
    const d = w.document;
    ok(`${f}: three slots in the DOM`, d.querySelectorAll('.ad-slot').length >= 3, d.querySelectorAll('.ad-slot').length);
    ok(`${f}: consent offered`, !!d.querySelector('.consent'));
    noErrors(errors);
  }

  console.log('\n' + '='.repeat(46));
  console.log(`PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46));
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('harness crashed:', e);
  process.exit(2);
}
