# Backend & Integration — reconciling the prototype with the real repo

This document removes **all** ambiguity about how the prototype maps onto the
existing `pegg-dot/split-the-check` codebase. Read it alongside `README.md` §4.

**Goal (the user's words):** make the app *exactly like the prototype*, keeping
the extra real-world capabilities the existing code already has (currency +
exchange rate, admin/service fees, dollar-amount tips, Venmo verification, LAN
URL helper, realtime sync). The prototype defines the **target UX, visual design,
and claim model**; the existing backend defines the **plumbing to preserve and
refactor**.

The complete current source is in `existing_app_reference/` — read it.

---

## A. The existing app, as built (source of truth for plumbing)

**Stack:** React + Vite client (`client/`), single-file Express + socket.io server
(`server/index.js`), Anthropic SDK for OCR. In-memory session store (a `Map`),
sessions auto-expire after 4h. In production the server serves the built client
(`client/dist`) so it's one origin.

### A.1 Session object (server, in-memory)
```js
{
  id, hostName, venmoHandle,
  items: [],            // see A.2
  subtotal, tax,
  tipPercent (default 18), tipMode ('percent'|'dollar'), tipDollar,
  tipIncluded, tipAmount,          // tip already on the receipt
  adminFee,                        // service charge added on top
  currency ('USD'), exchangeRate,  // non-USD → USD factor
  guests: [{ name, joinedAt }],
  payments: [{ guestName, amount, paid }],
  doneClaiming: [names],
  createdAt,
}
```

### A.2 Item object — AS-BUILT (NOTE: differs from the prototype!)
```js
// normal / shared item:
{ id, name, price, claims: [ { guestName, splitCount } ], dispute?: { by } }
// quantity item (quantity > 1):
{ id, name, price, quantity, unitPrice, claims: [ { guestName, units } ], dispute?: { by } }
```
The as-built model encodes sharing two different ways: `splitCount` (how many ways
a single item is divided) for normal items, and `units` for quantity items. The
**prototype replaces both with one cleaner model** (see §B).

### A.3 REST endpoints (KEEP these — they're real and good)
| Endpoint | Purpose |
|---|---|
| `POST /api/verify-venmo` `{handle}` | Verifies a Venmo username via the public profile page; accepts phone/email unverified; never hard-blocks. Returns `{valid, type, username, displayName, note}`. Powers the Setup screen's "✓ Sarah Jones" state. |
| `POST /api/scan-receipt` `{image}` (data URL) | **The OCR.** Sends the image to `claude-sonnet-4`, returns `{items:[{name,price,quantity?,unitPrice?}], tax, taxNote, tipIncluded, tipAmount, adminFee, currency, exchangeRate}`. Handles VAT-included vs tax-on-top receipts, multi-qty lines, service charges, and non-USD currency (fetches a live FX rate, with static fallback). The full extraction prompt is in `server/index.js` — **reuse it verbatim.** |
| `GET /api/server-ip` | Returns LAN IP + port so a host on a laptop can build a phone-scannable URL in dev. |
| `GET /api/session/:id` | Initial session load (REST mirror of socket state). |

### A.4 Socket.io events — AS-BUILT
Client→server: `create-session`, `rejoin-room`, `join-session`, `claim-item`
`{itemId,guestName,splitCount}`, `unclaim-item`, `dispute-item`
`{itemId,disputerName}`, `cancel-dispute`, `share-item` `{itemId,guestName,splitCount}`,
`claim-units` `{itemId,guestName,units}`, `unclaim-units`, `done-claiming`,
`mark-paid`.
Server→clients (broadcast to the session room): `session-state`, `guest-joined`,
`item-claimed`, `item-unclaimed`, `item-disputed`, `dispute-cancelled`,
`claiming-update`, `payment-updated`, `error`.

**Notable existing behavior to preserve:** when a disputed item's owner unclaims
it, the server **auto-assigns it to the disputer** (`unclaim-item` handler) — this
is exactly the prototype's "auto-release" resolution. Keep it.

---

## B. The TARGET model (adopt the prototype's — refactor the backend to it)

The prototype evolved a cleaner, unit-based model that handles single dishes,
shared dishes, and multi-quantity lines uniformly, and adds the **opt-in "I split
this" declaration** and **"covering"** verbs the old model lacked. **Adopt it.**

### B.1 Target item shape (replaces A.2)
```ts
type Item = {
  id: string; name: string; price: number;   // price = TOTAL of the line
  units: { shared: boolean; claims: string[]; dispute?: { by: string } | null }[];
  covered?: boolean;
};
// single dish → units.length === 1 ; a "×N" line → units.length === N
```
Per-person cost = `Σ units where name∈claims of (price/units.length)/claims.length`.
Tax & tip are proportional to each person's item subtotal (README §2). Sharing is
ALWAYS even division by `claims.length` — there is no `splitCount` anymore.

### B.2 Transform the OCR result → target items (client-side, after `/api/scan-receipt`)
```js
items = scan.items.map((it, i) => {
  const qty = it.quantity || 1;
  return {
    id: String(i),
    name: it.name,
    price: it.price,                                  // total for the line
    units: Array.from({ length: qty }, () => ({ shared: false, claims: [] })),
  };
});
// keep scan.tax, scan.tipIncluded/tipAmount, scan.adminFee, scan.currency,
// scan.exchangeRate on the session exactly as the existing code does.
```

### B.3 Target socket events (1:1 with the prototype's `unit()` verbs)
Refactor the as-built events to these. Each mutates the session item and
**broadcasts the updated `items` to the room** (`io.to(sessionId).emit('items-updated', {items})`).

| Event (client→server) | Payload | Server effect (mirror prototype `unit()` in `organic-screens.jsx`) |
|---|---|---|
| `grab-unit` | `{sessionId,itemId,unitIndex,guestName}` | unit → `{shared:false, claims:[guestName], dispute:null}` |
| `release-unit` | `{…,guestName}` | remove guest; if `claims.length≤1` set `shared:false`; clear dispute |
| `split-unit` | `{…,guestName}` | `shared:true`; add guest if absent — **the declaration; others can now opt in** |
| `join-unit` | `{…,guestName}` | `shared:true`; add guest ("I'm in") |
| `cover-item` | `{sessionId,itemId,guestName}` | every unit → `{shared:false, claims:[guestName]}`, `covered:true` |
| `cover-unit` | `{…,unitIndex,guestName}` | that unit → `{shared:false, claims:[guestName]}` |
| `dispute-unit` | `{…,unitIndex,guestName}` | `unit.dispute = {by:guestName}` |
| `resolve-dispute` | `{…,unitIndex,accept:boolean}` | accept → `{claims:[dispute.by], shared:false, dispute:null}`; else clear dispute |
| `cancel-dispute` | `{…,unitIndex,guestName}` | clear `unit.dispute` (only the disputer may cancel) |
| `done-claiming` | `{sessionId,guestName}` | add to `doneClaiming`, broadcast (KEEP as-built) |
| `record-payment` | `{sessionId,guestName,amount}` | mark guest paid (extend as-built `mark-paid`) |

**Important server rules (match the prototype exactly):**
- **No group approval anywhere.** `cover-*` silently drops other claimants;
  `dispute`/`resolve` is strictly between the two people involved. Apply and broadcast.
- **Never auto-split on a plain grab.** Two people don't get merged; sharing is
  only ever via explicit `split-unit` + `join-unit`. (This is a behavior change
  from the old `share-item`/`claim-item` flow — remove the implicit bumping.)
- **`shared` collapses** to `false` when a split drops to ≤1 claimant.
- Keep the in-memory store, 4h cleanup, session room join/rejoin, and the
  production static-serving block unchanged.

### B.4 Event mapping (old → new), so nothing is lost
| As-built | Target |
|---|---|
| `claim-item` (splitCount=1) | `grab-unit` (unitIndex 0) |
| `claim-units` | `grab-unit` × N / per-unit grabs |
| `unclaim-item` / `unclaim-units` | `release-unit` |
| `share-item` (bump splitCount) | replaced by `split-unit` (declare) + `join-unit` (opt-in) |
| `dispute-item` | `dispute-unit` |
| owner `unclaim-item` auto-assign | `resolve-dispute {accept:true}` (or keep auto on release) |
| `cancel-dispute` | `cancel-dispute` |
| *(none — new)* | `cover-item` / `cover-unit` |

---

## C. Frontend file mapping (prototype screen → existing page)

Recreate each prototype screen in the existing React page (or add where noted).
The existing pages are in `existing_app_reference/client_src/pages/`.

| Prototype screen (`organic-*.jsx`) | Existing page | Notes |
|---|---|---|
| **Welcome** | *(new)* | Existing app has no separate welcome; add it or fold the "Snap / Join" choice into the entry. |
| **Host Setup** (`Setup`) | `Home.jsx` | Name + Venmo (+ `/api/verify-venmo`) + currency. |
| **Scan** (`Scan` + `FauxReceipt`) | `ScanReceipt.jsx` | Real camera/upload → `/api/scan-receipt`. Replace the faux receipt with the captured image; the loading state is real OCR latency. |
| *(items review — existing extra)* | `ReviewItems.jsx` | The existing app has an edit-items step. The prototype folds the itemization **into the Tip screen** as a read-only list; keep `ReviewItems` if you want editing, or merge. |
| **Tip** (`TipShare`) | `TipAndShare.jsx` | Now shows the **full scanned itemization** then Subtotal/Tax/Tip/Total. Preserve existing tipMode (percent/dollar), tipIncluded, adminFee, currency display. |
| **QR** (`QRSheet`) | `QROverlay.jsx` | Real join URL (use `/api/server-ip` in dev). |
| **Join** (`Join`) | `JoinSession.jsx` | Guest name → `join-session`. |
| **Claim** (`ClaimScreen`+`ItemCard`+`UnitRow`) | `ClaimItems.jsx` | **The heart — README §4.** Rebuild on the target model (§B) and the new socket events. |
| **Your Share** (`ShareScreen`) | `Summary.jsx` | Itemized owe + **Pay {host}** (Venmo deep link / handoff). |
| **Settled** (`SettledScreen`) | `Summary.jsx` (post-pay) or new | Celebration + who's-paid list. |
| **Host Dashboard** (`HostDashboard`) | `HostDashboard.jsx` | Live collected meter + per-person cards + Paid/Pending. |

Shared infra already present: `context/SessionContext.jsx` (session state +
helpers) and `context/socket.js` (socket client). Extend these with the §B.3
events; keep the proportional-split helpers consistent with README §2.

---

## D. What to KEEP vs CHANGE — the one-paragraph summary

**KEEP:** the whole server scaffold (Express + socket.io + in-memory sessions +
4h cleanup + prod static serving), `verify-venmo`, the `scan-receipt` OCR prompt
and currency/FX logic, admin-fee / tip-included / tip-dollar handling, the
session room model, the dispute→owner-release auto-assign behavior, and
`done-claiming` / payment tracking.

**CHANGE:** migrate the item model to `units[]` (§B.1), transform OCR output into
it (§B.2), and replace the claim socket events with the §B.3 set so the realtime
behavior matches the prototype's claim model exactly — especially the **opt-in
"I split this" → "I'm in"** loop, the **cover** verbs, and the **no-auto-split /
no-approval** rules. Rebuild every screen to the prototype's visual design
(README §7, SCREENS.md).

**ADD (currently faked in the prototype):** real camera/upload + OCR call, real
realtime broadcast on every claim action, and the real Venmo handoff (deep link
`venmo://` / `https://venmo.com/<handle>?txn=pay&amount=<x>&note=<bill>`), marking
the payer as paid (`record-payment`) so the host dashboard updates live.
