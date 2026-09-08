# Cardora — gift-card offer directory

Static site, no build step. Five HTML pages, one shared stylesheet, one shared
offer registry, one dependency-free check script.

```
index.html          Gift-card hub      — full board, scratch-to-reveal, FAQ
gaming.html         Gaming board       — rarity tiers, sortable board, comparison table
quiz.html           Find your match    — 5-question matcher, ranks offers by tag score
privacy.html        Privacy policy     — matches what the code actually does
terms.html          Terms of service   — directory, not the payer
assets/site.css     Shared design system ("Foil & Paper")
assets/offers.js    Shared offer registry — every affiliate link lives here
assets/ads.js       Ad layer — every ad on every page is configured here
tools/check.mjs     Static checks (plain Node, no install)
tools/dom-test.mjs  DOM tests — drives the real page scripts (needs jsdom)
```

## Changing a monetisation link

Edit **`assets/offers.js`** and nothing else.

- `BASE` — the affiliate network redirect.
- `PAYOUT_SUB_ID` — your tracking sub-id, appended as `&sub=`. Leave `''` to disable.
- `OFFERS[]` — the catalogue. Each entry's `id` is the network offer id; `key` is what
  the page markup references via `data-offer="key"`.

`reward` and `minutes` are written as ranges (`'5–25'`, `'20–45'`). The registry parses
them with `CARDORA.rewardRange()` / `CARDORA.minuteRange()`, which split on **any** dash
character — hyphen, en dash, em dash. Always go through those helpers; a hyphen-only
`split('-')` silently produces `NaN` and quietly breaks every derived number on the site
(value meters, per-minute rates, sorting).

Every `a[data-offer]` is wired by `CARDORA.wire()`: it sets the href, `target="_blank"`,
`rel="noopener nofollow sponsored"`, and logs the click to `localStorage` under
`cardora.clicks`. Nothing is sent to a server by this file.

## Advertising

`assets/ads.js` is the only file you touch. Pages carry empty placeholders:

```html
<div class="ad-slot" data-ad-slot="hero-bottom"></div>   <!-- also pre-footer, sticky -->
<div class="grid" id="grid" data-ad-feed></div>          <!-- in-feed slots auto-injected -->
```

Paste each network snippet into the PASTE ZONES at the top of `ads.js`
(`popunder`, `socialBar`, `interstitial`, and the four `slots` entries). Anything left
as `''` simply switches that format off, and its slot keeps a dashed
"Advertisement" outline so the layout is still reviewable.

**Sponsored direct link.** `CONFIG.directLink` holds a network redirect URL
(currently `https://omg10.com/4/11754629` — verified to answer with a redirect to an
advertiser, not with JavaScript, so it is used as a link rather than a script). It
renders as a labelled sponsored button in any of its listed slots that has no banner
code, with `target="_blank"` and `rel="noopener nofollow sponsored"`. A pasted banner
always wins over it. If your dashboard calls this placement a Popunder, move the URL
into `popunder` inside a `<script src="...">` tag instead.

Behaviour worth knowing:

- **Consent gate.** UK GDPR / PECR requires consent for ad-network cookies, so no ad
  script runs until the visitor picks Accept. Reject means no ad scripts at all and the
  offers work identically. Switch it off with `CONFIG.consent.enabled = false` if you
  geo-block UK/EEA traffic.
- **Frequency caps.** `CONFIG.caps` limits the whole-page formats per browser
  (pop-under 1h, interstitial 4h by default), tracked in `localStorage`.
- **`CONFIG.formats`** kills any format without deleting the pasted code;
  `CARDORA_ADS.set('popunder', false)` does the same at runtime.
- **Sticky banner vs. mobile dock.** A filled sticky slot sets `--sticky-ad-h` and the
  floating CTA dock lifts above it, so they never overlap.
- **Grain overlay.** The paper texture sits above everything. Set
  `CONFIG.grainOverAds = false` to drop it behind content so ad creatives render clean.

Adding ads changes what the privacy policy must say — `privacy.html` §6 documents the
formats, the network cookies and the opt-outs. Keep the two in sync.

## Checks

```bash
node tools/check.mjs     # static: registry maths, markup refs, disclosures, CSS, ad slots
npm test                 # DOM: drives each page's real scripts under jsdom
```

Both exit non-zero on failure.

`check.mjs` runs the real `assets/offers.js` in a VM sandbox and asserts the values a
browser would get — unique keys/ids, correct URLs, finite parsed ranges — then verifies
each page's internal references resolve, inline scripts parse, `data-offer` keys exist,
every ad slot is present, and the affiliate + no-guarantee + advertising disclosures
match what the code actually does.

`dom-test.mjs` loads the real pages and exercises them: card rendering, affiliate href
construction, filtering, sorting, the scratch panel, the quiz flow and scoring,
click logging, form validation — plus the ad layer (consent gate, reject path,
frequency cap, in-feed injection surviving a re-render).

## Before publishing

- `SUPPORT_EMAIL` in `assets/offers.js` — currently a placeholder (`support@cardora.example`).
- `privacy.html` / `terms.html` — fill the `[bracketed]` placeholders (entity, address,
  governing law, liability cap) and delete the operator-note callouts.
- `EMAIL_ENDPOINT` in the signup script of `index.html` / `gaming.html` — empty means
  addresses are stored in `localStorage` on the visitor's device only. Point it at
  Formspree / Buttondown / ConvertKit to actually receive them.
- Reward ranges and time estimates are Cardora's estimates from partner listings; re-verify
  them against the partner pages regularly.
- `assets/ads.js` — paste the network snippets, and confirm the pop-under/interstitial
  formats are allowed by your affiliate network's terms and by the platform sending you
  traffic. Aggressive formats can trip browser Safe Browsing warnings and cost you offer
  conversions; `CONFIG.formats` is the switch if you need to dial them back.
