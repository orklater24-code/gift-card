/* =========================================================================
   CARDORA — ad layer
   -------------------------------------------------------------------------
   Every ad on every page is controlled from THIS file. Pages only carry
   empty placeholders:

       <div class="ad-slot" data-ad-slot="hero-bottom"></div>
       <div class="grid" data-ad-feed></div>        <- auto in-feed slots

   HOW TO GO LIVE (Adsterra / Monetag / PropellerAds / any network):
     1. Paste each snippet into the PASTE ZONES below.
     2. Leave anything you don't want as '' — that format simply switches off.
     3. Nothing else to touch. Slots with no code render as a labelled
        dashed placeholder so you can see the layout before going live.

   Formats
     popunder / socialBar / interstitial  -> whole-page scripts, loaded once,
                                             frequency-capped in localStorage
     hero-bottom / in-feed / pre-footer / sticky -> in-page containers

   NOTE ON ORDER: this file must load AFTER assets/offers.js and before the
   page's own inline script.
   ========================================================================= */
(function (global) {
  'use strict';

  /* ====================== PASTE ZONES — start ====================== */
  var CONFIG = {
    enabled: true,

    /* --- whole-page formats -------------------------------------
       Paste the exact <script>...</script> (or <iframe>) the network
       gives you. Keep the quotes balanced; for a <script> tag inside
       this string, split the closing tag as shown so it doesn't end
       this file's own script block.                                */
    popunder: '',     // e.g. '<scr'+'ipt async="async" data-cfasync="false" src="//pl1234567.profitablegatecpm.com/abcdef.js"></scr'+'ipt>'
    socialBar: '',    // Adsterra "Social Bar"
    interstitial: '', // full-page / slider interstitial

    /* --- in-page containers -------------------------------------
       Banner / native / direct-link code for each slot. Any of them
       can hold a <script>, an <iframe> or plain HTML.               */
    slots: {
      'hero-bottom': '',  // e.g. '<iframe src="//bngprf.com/promo.php?c=123456" width="728" height="90" scrolling="no" frameborder="0"></iframe>'
      'in-feed': '',      // native banner works best inside the card grid
      'pre-footer': '',
      'sticky': ''        // 320x50 / 728x90 anchor banner
    },
    /* --- direct / smart link -----------------------------------
       A redirect URL from your network (verified: this one answers with a
       302 to an advertiser, not with JavaScript). It is rendered as a
       labelled sponsored button, never disguised as one of the offers.
       If your dashboard calls this placement a Popunder instead, move the
       URL into `popunder` above wrapped in a <script src="..."> tag.       */
    directLink: {
      url: 'https://omg10.com/4/11754629',
      title: 'Sponsored partner offer',
      sub: 'Opens an advertiser page in a new tab — not a Cardora offer, no reward from us.',
      button: 'Continue ↗',
      /* which empty slots fall back to this link when they have no banner code */
      slots: ['hero-bottom', 'pre-footer']
    },
    /* ====================== PASTE ZONES — end ======================= */

    /* Which formats are switched on. Set any to false to kill it
       without deleting the pasted code.                             */
    formats: {
      directLink: true,   // sponsored redirect button in the slots listed above
      display: true,      // hero-bottom + pre-footer containers
      inFeed: true,       // slots injected between offer cards
      sticky: true,       // bottom anchor banner
      interstitial: true,
      popunder: true,
      socialBar: true
    },

    /* In-feed placement inside [data-ad-feed] grids. */
    inFeed: { after: 2, every: 3, max: 2 },

    /* Re-load limits, in hours. 0 = every page view. */
    caps: { popunder: 1, interstitial: 4, socialBar: 0 },

    /* UK GDPR / PECR: ad-network cookies need consent from UK and EEA
       visitors. Set enabled:false if you geo-block those countries or
       accept that risk yourself.                                    */
    consent: {
      enabled: true,
      title: 'Ads help keep Cardora free',
      body: 'We use third-party ad networks that set cookies to show and measure ads. Accept to see ads, or reject to browse without them — the offers work either way.',
      accept: 'Accept ads',
      reject: 'No ads',
      linkText: 'Privacy policy',
      linkHref: 'privacy.html'
    },

    respectDNT: false,   // true = load no ads when the browser sends Do Not Track
    grainOverAds: true   // false = drop the paper-grain overlay behind content so ads render clean
  };

  /* ============================ ENGINE ============================ */
  var listeners = [];
  function notify(){ listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  var CAP_KEY = 'cardora.adcap';
  var CONSENT_KEY = 'cardora.consent';
  var started = false;

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* private mode */ }
    return null;
  }

  function dnt() {
    var d = global.navigator && (global.navigator.doNotTrack || global.navigator.msDoNotTrack);
    return d === '1' || d === 'yes';
  }

  function consentState() { return store(CONSENT_KEY); }

  /* innerHTML does not execute <script> tags — rebuild them. */
  function inject(container, html) {
    if (!container || !html) return false;
    container.innerHTML = html;
    Array.prototype.slice.call(container.querySelectorAll('script')).forEach(function (old) {
      var s = document.createElement('script');
      Array.prototype.slice.call(old.attributes).forEach(function (a) { s.setAttribute(a.name, a.value); });
      s.text = old.textContent;
      old.parentNode.replaceChild(s, old);
    });
    container.classList.add('ad-loaded');
    return true;
  }

  function capped(name, hours) {
    if (!hours) return false;
    var caps = store(CAP_KEY) || {};
    var last = caps[name] ? new Date(caps[name]).getTime() : 0;
    if (Date.now() - last < hours * 3600 * 1000) return true;
    caps[name] = new Date().toISOString();
    store(CAP_KEY, caps);
    return false;
  }

  function loadWholePage(name, code) {
    if (!CONFIG.formats[name] || !code) return false;
    if (capped(name, CONFIG.caps[name] || 0)) return false;
    var host = document.createElement('div');
    host.className = 'ad-host ad-host--' + name;
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    return inject(host, code);
  }

  /* ---- in-page slots ---- */
  function fillSlot(el) {
    var name = el.getAttribute('data-ad-slot');
    if (!name || el.dataset.adDone === '1') return;
    el.dataset.adDone = '1';

    if (!CONFIG.enabled) { el.classList.add('ad-off'); el.innerHTML = ''; return; }

    var code = CONFIG.slots[name] || '';
    var on = name === 'sticky' ? CONFIG.formats.sticky
           : name === 'in-feed' ? CONFIG.formats.inFeed
           : CONFIG.formats.display;
    if (!on) { el.classList.add('ad-off'); el.innerHTML = ''; return; }

    if (!code && CONFIG.formats.directLink && CONFIG.directLink.url &&
        CONFIG.directLink.slots.indexOf(name) >= 0) {
      el.classList.add('ad-direct');
      inject(el, directLinkHtml(CONFIG.directLink));
      return;
    }
    if (!code) { el.classList.add('ad-empty'); el.innerHTML = ''; return; }   /* labelled placeholder */
    inject(el, code);
    if (name === 'sticky') {
      document.body.classList.add('has-sticky-ad');
      syncStickyHeight(el);
      global.addEventListener('resize', function () { syncStickyHeight(el); });
    }
  }

  function syncStickyHeight(el) {
    var h = el.offsetHeight || 0;
    document.documentElement.style.setProperty('--sticky-ad-h', h + 'px');
  }

  /* A direct link is a plain link: labelled as advertising, rel=sponsored,
     new tab, and never styled to look like one of the partner offers. */
  function directLinkHtml(d) {
    return '<a class="ad-cta" href="' + d.url + '" target="_blank" rel="noopener nofollow sponsored">' +
             '<span><span class="t">' + d.title + '</span>' +
             '<span class="s">' + d.sub + '</span></span>' +
             '<span class="go">' + d.button + '</span>' +
           '</a>';
  }

  /* ---- in-feed injection (re-runs whenever the grid re-renders) ----
     Inserting a slot mutates the grid, which fires the observer that is
     watching it — so guard against re-entry and top up to `max` instead of
     adding another batch every time. Without this the page loops forever. */
  var feeding = false;
  function placeInFeed(grid) {
    if (!CONFIG.enabled || !CONFIG.formats.inFeed || !grid || feeding) return;
    var want = CONFIG.inFeed.max - grid.querySelectorAll('.ad-slot--feed').length;
    if (want <= 0) return;

    var cards = Array.prototype.slice.call(grid.children).filter(function (c) {
      if (c.hasAttribute('data-ad-slot')) return false;
      return global.getComputedStyle(c).display !== 'none';   /* skip filtered-out cards */
    });

    var cfg = CONFIG.inFeed, placed = 0;
    feeding = true;
    try {
      for (var i = cfg.after; i < cards.length && placed < want; i += cfg.every) {
        var slot = document.createElement('div');
        slot.className = 'ad-slot ad-slot--feed';
        slot.setAttribute('data-ad-slot', 'in-feed');
        cards[i].parentNode.insertBefore(slot, cards[i]);
        fillSlot(slot);
        placed++;
      }
    } finally {
      feeding = false;
    }
  }

  var feedObservers = [];
  function watchFeeds() {
    feedObservers.forEach(function (o) { o.disconnect(); });
    feedObservers = [];
    Array.prototype.slice.call(document.querySelectorAll('[data-ad-feed]')).forEach(function (g) {
      placeInFeed(g);
      if (!global.MutationObserver) return;
      var ob = new MutationObserver(function () { placeInFeed(g); });
      ob.observe(g, { childList: true });
      feedObservers.push(ob);
    });
  }

  /* ---- consent bar ---- */
  function showConsent(onAccept) {
    var c = CONFIG.consent;
    var bar = document.createElement('div');
    bar.className = 'consent';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Advertising consent');
    bar.innerHTML =
      '<div class="consent-in">' +
        '<div><strong>' + c.title + '</strong><p>' + c.body + ' ' +
          '<a href="' + c.linkHref + '">' + c.linkText + '</a></p></div>' +
        '<div class="consent-btns">' +
          '<button type="button" class="btn ghost" data-c="reject">' + c.reject + '</button>' +
          '<button type="button" class="btn" data-c="accept">' + c.accept + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(bar);
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-c]');
      if (!btn) return;
      var choice = btn.getAttribute('data-c');
      store(CONSENT_KEY, { v: choice, at: new Date().toISOString() });
      bar.parentNode.removeChild(bar);
      document.body.classList.remove('ads-pending');
      if (choice === 'accept') onAccept();
    });
    document.body.classList.add('ads-pending');   /* hides empty slots until the visitor chooses */
  }

  function run() {
    if (started) return;
    started = true;
    if (!CONFIG.enabled) {
      Array.prototype.slice.call(document.querySelectorAll('.ad-slot')).forEach(function (el) {
        el.classList.add('ad-off');
      });
      return;
    }
    if (!CONFIG.grainOverAds) document.documentElement.classList.add('grain-behind');
    if (CONFIG.respectDNT && dnt()) return;

    var go = function () {
      Array.prototype.slice.call(document.querySelectorAll('.ad-slot')).forEach(fillSlot);
      watchFeeds();
      loadWholePage('popunder', CONFIG.popunder);
      loadWholePage('socialBar', CONFIG.socialBar);
      loadWholePage('interstitial', CONFIG.interstitial);
    };

    if (CONFIG.consent.enabled) {
      var s = consentState();
      if (!s) { showConsent(go); return; }
      if (s.v !== 'accept') return;
    }
    go();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  global.CARDORA_ADS = {
    config: CONFIG,
    run: run,
    refresh: function () {
      Array.prototype.slice.call(document.querySelectorAll('.ad-slot')).forEach(function (el) {
        delete el.dataset.adDone;
        el.classList.remove('ad-off', 'ad-empty', 'ad-direct');
        fillSlot(el);
      });
      watchFeeds();
      notify();
    },
    /* Pages subscribe so click routing follows config changes. */
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    consent: consentState,
    directLinkUrl: function () {
      return (CONFIG.formats.directLink && CONFIG.directLink.url) || '';
    },
    /* Flip a format off at runtime, e.g. CARDORA_ADS.set('popunder', false) */
    set: function (name, on) {
      if (CONFIG.formats.hasOwnProperty(name)) { CONFIG.formats[name] = on; notify(); }
    }
  };
})(window);
