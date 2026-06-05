# CLAUDE.md — Split the Check

> Standalone project. **Not** related to any other repo. Open it on its own:
> `cd /Users/natepegg/split-the-check && claude`

## What this is
A real-time bill-splitting web app. A host snaps a photo of a restaurant receipt → Claude vision
itemizes it → friends scan a QR to join live → each person taps what they ordered → tax/tip/discount
split proportionally → everyone pays the host on Venmo. No accounts, no app install.

The UI is the **organic-clay design system** (warm Claude-adjacent palette, Inter + Newsreader, Lucide
icons, hand-drawn accents, floating bottom bar, receipt motifs). Design source/spec lives in
`design_handoff_claim_flow/` (README §4 is the claim model; `prototype/` = the canonical `app-organic`
kit) and `design_system_reference/` (gitignored bundle). Specs/plans for the rebuild are in
`docs/superpowers/`.

## Stack
- **client/** — React 19 + Vite (port 5173 in dev). State in one `SessionContext` (useReducer) with
  localStorage persistence. Real-time via socket.io-client. Visual system in
  `client/src/styles/organic.css` + primitives in `client/src/components/ui/` (Button, Avatar, Icon,
  BottomSheet, Toast, hand-drawn accents).
- **server/** — Node + Express + Socket.IO (port 3001). Persistent session store (`server/store.js`,
  JSON file under `DATA_DIR`, default `./data`). Claude vision for receipt OCR.
- Prod: `NODE_ENV=production` makes Express serve the built client on one origin. Railway-ready
  (`railway.toml`).

## Run it
```bash
cd server && npm install && npm start      # :3001  (needs ANTHROPIC_API_KEY for scanning)
cd client && npm install && npm run dev    # :5173
```
The Anthropic key lives in `server/.env` (gitignored) as `ANTHROPIC_API_KEY=...`. Without it,
scanning is disabled but manual entry still works. On Railway, set the key in Variables (not a file).

## Test
```bash
cd server && npm test                  # node:test — claim verbs, unit money math, parity, sanitize, rate limiter, prune
cd client && npm test                  # vitest — claim verbs, unit money math, component/page render
node server/scripts/smoke.cjs 3001     # end-to-end socket smoke vs a running server (verb events + payments)
```

## Architecture notes
- **Item / claim model is UNIT-BASED.** An item is `{ id, name, price /* line total */, units: Unit[],
  covered?, quantity, unitPrice }` where `Unit = { shared, claims: string[] /* names */, dispute?:{by} }`.
  A normal dish has one unit; a "×N" line has N independently-claimable units. There is **no `splitCount`** —
  sharing is always even division by `claims.length`. The pure model + the claim "verbs" live in
  `server/lib/claim-verbs.js` (`applyVerb`, `normalizeItems`) and are **mirrored** in
  `client/src/lib/claimVerbs.js`. Old persisted sessions auto-migrate via `normalizeItems`.
- **Money math is the riskiest surface.** Canonical logic is `server/lib/totals.js`, **mirrored** in
  `client/src/context/SessionContext.jsx` (`shareOf`, `calculatePersonTotal`, `calculateAllPersonTotals`,
  `calculateUnaccounted`) — keep them byte-faithful (same float-expression order) so the two runtimes
  reconcile to the cent. Per-person item subtotals use largest-remainder; **fees (tax/adminFee/tip/discount)
  scale to the FULL subtotal** (`claimedSubtotal/subtotal`) so nobody is charged for items they didn't
  claim — the unclaimed remainder is the host's tab and equals `calculateUnaccounted`'s exact complement.
  Fully-claimed bills sum EXACTLY to the grand total. If you touch one side, update BOTH + the tests
  (`server/test/{totals,claim-verbs,parity}.test.js`, `client/src/.../*.test.{js,jsx}`).
- **Claim socket events are the verb set** (server applies the verb, authorizes by socket identity,
  persists, broadcasts `items-updated`): `grab-unit`, `release-unit`, `split-unit`, `join-unit`,
  `cover-unit`, `cover-item`, `dispute-unit`, `resolve-dispute {accept}` (owner-only), `cancel-dispute`
  (disputer-only). Plus `done-claiming`, `mark-paid`/`confirm-paid`/`reset-paid`, `resolve-leftover`,
  `remove-guest`, `create-session`, `join-session`, `rejoin-room`.
- **Disputes are two-party** (§4): the unit's owner resolves (hand over / push back); the disputer can
  cancel. There is **no host dispute arbitration**.
- **Identity:** sockets are bound to one name server-side (`socketMeta`); `rejoin-room` only binds an
  identity that already exists in the session (host = `hostName`, guest ∈ `guests`) — no host escalation.
  Duplicate names rejected; names sanitized (`server/lib/sanitize.js`).
- **Payments are two-state:** guest-asserted `paid` vs host-`confirmed`. A server-stored pay-time
  `paidTotal` snapshot powers the "your total changed after you paid" flag (survives reload).
- **Scan output is sanitized server-side** (`sanitizeScan`); the `/api/scan-receipt` OCR prompt is the
  source of truth — keep it verbatim. The Review screen reconciles against the printed total.
- **Durability:** sessions persist to disk and survive restarts; TTL refreshes on activity; sessions
  with an unpaid balance are never auto-pruned.
- **Routing:** `/` = Welcome; host setup at `/setup` → `/scan` → `/review` → `/tip` (QR) ; guest
  `/session/:id` (Join) → `/claim/:id` → `/summary/:id`; host `/host/:id` dashboard.

## Conventions
- Visual: use the organic tokens/classes in `client/src/styles/organic.css` and the `components/ui`
  primitives; money is rendered with `formatPrice(x, currency)` (never a hardcoded `$`); avatar tones
  are fixed per identity. The older inline-token screens have been replaced.
- No texts/emails by product choice — automations live in-app (reminders use the native share/SMS sheet).
- This is a fork of `Jackson-Pegg/split-the-check`. The organic + unit-model rebuild lives on branch
  `feat/organic-claim-flow` (do not merge to `main` until verified — Phases 1–6 complete: engine,
  design system, all screens). `origin` = `pegg-dot/split-the-check-app`.
