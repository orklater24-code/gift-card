/* =========================================================================
   CARDORA — shared offer registry
   -------------------------------------------------------------------------
   Every affiliate link on every page lives HERE and nowhere else.
   To swap a monetisation link: edit the `id` below. Nothing else to touch.

   BASE   -> your network redirect (was already in the old index.html)
   PAYOUT -> your own tracking sub-id, appended as &sub=  (set to "" to disable)
   ========================================================================= */
(function (global) {
  'use strict';

  var BASE = 'https://singingfiles.com/show.php?l=0&u=2539501';
  var PAYOUT_SUB_ID = '';            // e.g. 'ig_bio' or 'tiktok' — leave '' to disable

  function link(id) {
    var url = BASE + '&id=' + id;
    if (PAYOUT_SUB_ID) url += '&sub=' + encodeURIComponent(PAYOUT_SUB_ID);
    return url;
  }

  /* ---------------------------------------------------------------
     The catalogue. 6 partner offers, reused across the 3 pages.
     `reward` / `minutes` are shown as ESTIMATES and are labelled as
     such in the UI — the partner's own page states the real terms.
     --------------------------------------------------------------- */
  var OFFERS = [
    {
      key: 'survey',
      id: 75113,
      title: 'Opinion Panel Credit',
      category: 'surveys',
      categoryLabel: 'Surveys',
      reward: '5–25',
      currency: '$',
      minutes: '5–12',
      difficulty: 'Easy',
      blurb: 'Answer short consumer-habit questionnaires. Paid per completed panel.',
      tags: ['no purchase', 'mobile friendly'],
      tiers: ['common'],
      quiz: ['shopping', 'opinions']
    },
    {
      key: 'appinstall',
      id: 75115,
      title: 'App Trial Credit',
      category: 'apps',
      categoryLabel: 'Apps & Games',
      reward: '10–40',
      currency: '$',
      minutes: '8–20',
      difficulty: 'Easy',
      blurb: 'Install a partner app and reach the stated milestone to release the credit.',
      tags: ['android / ios', 'milestone based'],
      tiers: ['common', 'rare'],
      quiz: ['gaming', 'apps']
    },
    {
      key: 'playtest',
      id: 74764,
      title: 'Playtest Session',
      category: 'gaming',
      categoryLabel: 'Gaming',
      reward: '15–60',
      currency: '$',
      minutes: '15–30',
      difficulty: 'Medium',
      blurb: 'Play a partner title for a set session length and submit your feedback.',
      tags: ['longest payout', 'gaming only'],
      tiers: ['rare', 'legendary'],
      quiz: ['gaming', 'long']
    },
    {
      key: 'premium',
      id: 74437,
      title: 'Premium Partner Program',
      category: 'premium',
      categoryLabel: 'Premium',
      reward: '25–120',
      currency: '$',
      minutes: '20–45',
      difficulty: 'Medium',
      blurb: 'A bundled program with several partner tasks and the highest reward ceiling.',
      tags: ['highest ceiling', 'multi step'],
      tiers: ['legendary'],
      quiz: ['long', 'max']
    },
    {
      key: 'member',
      id: 75104,
      title: 'Member Spotlight',
      category: 'shopping',
      categoryLabel: 'Shopping',
      reward: '10–35',
      currency: '$',
      minutes: '6–15',
      difficulty: 'Easy',
      blurb: 'Share shopping preferences and unlock the member rewards shelf.',
      tags: ['limited slots', 'quick'],
      tiers: ['common', 'rare'],
      quiz: ['shopping', 'quick']
    },
    {
      key: 'bonus',
      id: 72846,
      title: 'Community Bonus Pool',
      category: 'bonus',
      categoryLabel: 'Bonus',
      reward: '5–20',
      currency: '$',
      minutes: '3–8',
      difficulty: 'Easy',
      blurb: 'The shortest route to a first credit. Good for testing whether offers pay for you.',
      tags: ['fastest', 'best first pick'],
      tiers: ['common'],
      quiz: ['quick', 'opinions']
    }
  ];

  OFFERS.forEach(function (o) { o.url = link(o.id); });

  /* ---------------------------------------------------------------
     Range parsing. Ranges are written with a typographic dash
     ("5–25"), so split on ANY dash character. A hyphen-only split
     silently yields NaN, which then poisons every derived number
     on the site (value meters, per-minute rates, sorting).
     Pages must call these helpers instead of splitting strings
     themselves.
     --------------------------------------------------------------- */
  var DASH = /[-\u2013\u2014\u2212]/;
  function range(str) {
    var parts = String(str).split(DASH).map(function (n) { return parseFloat(n); });
    var lo = isFinite(parts[0]) ? parts[0] : 0;
    var hi = isFinite(parts[1]) ? parts[1] : lo;
    return { lo: lo, hi: hi, mid: (lo + hi) / 2 };
  }
  function rewardRange(o) { return range(o.reward); }
  function minuteRange(o) { return range(o.minutes); }

  OFFERS.forEach(function (o) {
    var r = rewardRange(o);
    var m = minuteRange(o);
    o.rewardLo = r.lo;
    o.rewardHi = r.hi;
    o.rewardMid = r.mid;
    o.minuteLo = m.lo;
    o.minuteHi = m.hi;
    /* Reward midpoint over the longest stated time — the "value meter". */
    o.perMinute = +(r.mid / (m.hi || 10)).toFixed(2);
  });

  var VALUE_MAX = Math.max.apply(null, OFFERS.map(function (o) { return o.perMinute; }));
  var REWARD_MAX = Math.max.apply(null, OFFERS.map(function (o) { return o.rewardMid; }));

  /* ---------------------------------------------------------------
     Click-out logging. Purely local (localStorage) — nothing is sent
     anywhere by this file, so it works with zero backend setup.
     --------------------------------------------------------------- */
  var LOG_KEY = 'cardora.clicks';
  function logClick(offer, source) {
    try {
      var raw = localStorage.getItem(LOG_KEY);
      var list = raw ? JSON.parse(raw) : [];
      list.push({ key: offer.key, id: offer.id, src: source, at: new Date().toISOString() });
      if (list.length > 200) list = list.slice(-200);
      localStorage.setItem(LOG_KEY, JSON.stringify(list));
    } catch (e) { /* private mode — ignore */ }
  }

  /* Attach rel/target + logging to every [data-offer] anchor on the page. */
  function wire(root) {
    (root || document).querySelectorAll('a[data-offer]').forEach(function (a) {
      var key = a.getAttribute('data-offer');
      var offer = OFFERS.filter(function (o) { return o.key === key; })[0];
      if (!offer) return;
      a.href = offer.url;
      a.target = '_blank';
      a.rel = 'noopener nofollow sponsored';
      a.addEventListener('click', function () {
        logClick(offer, a.getAttribute('data-src') || location.pathname);
      });
    });
  }

  global.CARDORA = {
    BASE: BASE,
    offers: OFFERS,
    byKey: function (k) { return OFFERS.filter(function (o) { return o.key === k; })[0]; },
    byCategory: function (c) { return OFFERS.filter(function (o) { return o.category === c; }); },
    link: link,
    range: range,
    rewardRange: rewardRange,
    minuteRange: minuteRange,
    valueMax: VALUE_MAX,
    rewardMax: REWARD_MAX,
    wire: wire,
    logClick: logClick,
    BRAND: 'Cardora',
    YEAR: new Date().getFullYear(),
    SUPPORT_EMAIL: 'support@cardora.example'   // <-- put your real inbox here
  };
})(window);
