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
tools/check.mjs     Sanity check (plain Node, no install)
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

## Checks

```bash
node tools/check.mjs     # registry maths, markup refs, disclosures, CSS integrity
```

Exits non-zero on failure. It runs the real `assets/offers.js` in a VM sandbox and
asserts the values a browser would get — unique keys/ids, correct URLs, finite parsed
ranges — then verifies each page's internal references resolve, inline scripts parse,
`data-offer` keys exist, and the affiliate + no-guarantee disclosures are present.

For behaviour in a real DOM (rendering, filtering, sorting, the quiz flow), load the
pages in a headless browser; a jsdom harness covering all five pages is kept outside the
repo since it needs an npm install.

## Before publishing

- `SUPPORT_EMAIL` in `assets/offers.js` — currently a placeholder (`support@cardora.example`).
- `privacy.html` / `terms.html` — fill the `[bracketed]` placeholders (entity, address,
  governing law, liability cap) and delete the operator-note callouts.
- `EMAIL_ENDPOINT` in the signup script of `index.html` / `gaming.html` — empty means
  addresses are stored in `localStorage` on the visitor's device only. Point it at
  Formspree / Buttondown / ConvertKit to actually receive them.
- Reward ranges and time estimates are Cardora's estimates from partner listings; re-verify
  them against the partner pages regularly.
