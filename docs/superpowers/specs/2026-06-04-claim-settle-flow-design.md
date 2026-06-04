# Design Spec — Claim & Settle Flow + Organic-Clay Rebuild

**Date:** 2026-06-04
**Status:** Awaiting user approval (then → writing-plans)
**Source material (in repo):**
- `design_handoff_claim_flow/` — README.md (§4 claim model), SCREENS.md, BACKEND.md (integration mapping), `prototype/` (canonical `app-organic` kit).
- `design_system_reference/` — full Claude Design bundle: `project/README.md` (brand/visual foundations), `ICONOGRAPHY.md`, `colors_and_type.css`, `preview/*.html` (component refs), `ui_kits/app-organic/` (**canonical** — build from here), `chats/chat1.md` (intent).

> ⚠️ The two reference folders are design references / prototypes — **not** code to copy. Recreate the look in our React + Vite + Express stack. Edit only the real `client/` and `server/`; never the `existing_app_reference/` or `_source_reference/` copies.

---

## 1. Goal & scope

Make the live app **look and behave like the canonical `app-organic` prototype** (warm clay design system + the §4 unit claim model), while **keeping every real capability already on `main`** and **adding what the prototype has that we lack**. "Best of both worlds."

- **Visual:** full rebuild of all screens to the organic-clay design (tokens, Inter + Newsreader, Lucide icons, hand-drawn accents, floating bottom bar, receipt motifs).
- **Model:** adopt the unit-based item model (`units[]`) and the §4 claim verbs.
- **Realtime:** the prototype's `unit()` verbs become real socket events (BACKEND.md §B.3).
- **Keep (best-of-both):** persistent disk store, rate-limited scan, server-side scan sanitize, identity-bound sockets, two-state payments + `paidTotal` snapshot, multi-currency/FX, admin fee, tip-included + dollar tip, the unaccounted-$ "money truth" warning, host automations (resolve-leftover, remove-guest, early-join). **Preserve the `/api/scan-receipt` OCR prompt verbatim.**
- **Add (faked in prototype):** Welcome screen, the **cover** verbs, the opt-in **"I split this" → "I'm in"** loop, real Venmo handoff (deep link + desktop web fallback already exists), real broadcast on every claim action.

### Non-goals
- No new marketing/docs site. No accounts/cross-device recovery (separately deferred). No texts/emails (product choice). The superseded `ui_kits/app/` kit is reference only.

---

## 2. Data model (canonical = unit-based)

Replaces the as-built dual model (`{guestName, splitCount}` / `{guestName, units}`).

```js
Unit = { shared: boolean, claims: string[] /* participant names */, dispute?: { by: string } | null }
Item = {
  id: string, name: string, price: number,   // price = TOTAL for the line
  units: Unit[],                              // length 1 for a dish; N for "×N"
  covered?: boolean,                          // someone took the whole item
  // display-only, preserved from scan/review:
  quantity?: number, unitPrice?: number       // unitPrice derived = price / units.length
}
```
- **`splitCount` is gone.** Sharing is always even division by `unit.claims.length`, live.
- **OCR → items transform** (client, after `/api/scan-receipt`): `units = Array(quantity).fill → { shared:false, claims:[] }`. Keep `scan.tax/taxNote/tipIncluded/tipAmount/adminFee/discount/currency/exchangeRate/receiptTotal` on the session exactly as today.
- **`normalizeItems(items)`** (load-time shim, client + server): if an item already has `units`, pass through; else build `units` from legacy `claims` so persisted/in-flight old sessions don't crash. Legacy → unit mapping: quantity>1 → that many units with claimants distributed; else one unit, `claims = claim.guestName[]`, `shared = claims.length>1`.
- **ReviewItems** editing: changing quantity resizes the `units` array (preserve claims where possible; added units start open).

---

## 3. Money math — EXACT, and matching the prototype (riskiest surface)

Mirrored in `client/src/context/SessionContext.jsx` **and** `server/lib/totals.js`; both unit-tested. The hard guarantee: **every participant's charged total sums to the bill grand total to the cent, and nobody is charged for items/fees beyond their claimed share.**

### 3.1 Definitions
```
unitPrice(item)      = item.price / item.units.length
shareOf(item, name)  = Σ over units containing name of ( unitPrice(item) / unit.claims.length )
claimedSubtotal      = Σ over items, Σ over units with ≥1 claim, of unitPrice   // value someone owns
subtotal             = Σ item.price                                            // whole bill, pre-fees
grandTotal           = subtotal + tax + adminFee + includedTip + additionalTip − discount
```

### 3.2 Per-person item subtotals — exact to the cent
For **each item**, distribute the item's **claimed value** (`unitsClaimed × unitPrice`) across its claimants using the existing **largest-remainder** method, weighted by each claimant's raw `shareOf` within that item. Sum across items → each person's `itemsTotal` (integer cents). This makes per-person item charges sum exactly to each item's claimed value (stronger than today, where per-item shares could drift a cent).

### 3.3 Fees & tip — proportional, prototype-faithful, host absorbs the unclaimed remainder
The prototype charges each person `fee × (theirItems / subtotal)` — i.e. fees scale to the **whole** subtotal, so the unclaimed portion's fees are simply **not** charged to claimants (they fall to the host/unaccounted). We match that and make it exact:

For each fee category `F ∈ {tax, adminFee, includedTip, dollarTip}`:
```
chargeableF = round2( F × claimedSubtotal / subtotal )
```
distribute `chargeableF` across participants by `itemsTotal` weights via largest-remainder (sums exactly to `chargeableF`). `unaccountedF = F − chargeableF` → host's tab.
- **Percent tip:** per-person `= itemsTotal × tipPercent/100` (identical to the prototype's `subtotal·tip%·prop`); total chargeable `= claimedSubtotal × tipPercent/100`, distributed by largest-remainder.
- **Discount:** treated as a negative fee, same `claimedSubtotal/subtotal` scaling, distributed and subtracted.

```
personTotal = itemsTotal + taxShare + adminShare + tipShare − discountShare
```

### 3.4 Why this satisfies both requirements
- **When everything is claimed** (`claimedSubtotal == subtotal`): every `chargeableF == F`, so `Σ personTotal == grandTotal` exactly — the host collects the whole bill, nobody overpays.
- **When items remain unclaimed:** each guest pays exactly their proportional share of fees on *their* items; the unclaimed items + their proportional fees = the host's tab, which equals **`calculateUnaccounted`'s `totalUnaccounted`**. The two numbers are now derived from one model (today they can disagree). The "I'm done" unclaimed guard (§5) forces this to a deliberate choice ("keep claiming" or "leave on host's tab").
- `calculateUnaccounted` is re-derived: `unclaimedSubtotal = subtotal − claimedSubtotal`; unaccounted fees = the `unaccountedF` above. Same warning UX.

> **Behavior change flagged:** today fees are spread across claimants only (denominator = claimant weights), so partial claims overcharge tax/tip. The new rule (denominator = full subtotal, host absorbs the rest) matches the prototype and the "nobody overpays" mandate. Existing money tests will be rewritten to assert the exact-sum + no-overcharge properties.

---

## 4. Socket events (server `index.js`) — BACKEND.md §B.3 target set

Refactor the as-built claim events to the named verb set; each validates identity (`socketMeta` binds a socket to one name), applies the verb, persists to the store, and broadcasts the updated items.

| Event (client→server) | Payload | Effect (mirrors prototype `unit()`) |
|---|---|---|
| `grab-unit` | `{sessionId,itemId,unitIndex}` | unit → `{shared:false, claims:[me], dispute:null}` |
| `release-unit` | `{…}` | remove me; if `claims.length≤1` → `shared:false`; clear dispute |
| `split-unit` | `{…}` | `shared:true`; add me if absent (the **declaration**) |
| `join-unit` | `{…}` | `shared:true`; add me (**"I'm in"**) |
| `cover-item` | `{sessionId,itemId}` | every unit → `{shared:false, claims:[me]}`, `covered:true` |
| `cover-unit` | `{…,unitIndex}` | that unit → `{shared:false, claims:[me]}` |
| `dispute-unit` | `{…,unitIndex}` | `unit.dispute = {by: me}` |
| `resolve-dispute` | `{…,unitIndex,accept:boolean}` | **owner only.** accept → `{claims:[dispute.by], shared:false, dispute:null}`; else clear dispute |
| `cancel-dispute` | `{…,unitIndex}` | **disputer only.** clear `unit.dispute` |
| `done-claiming` | `{sessionId}` | add to `doneClaiming` (KEEP) |
| payments | KEEP existing `mark-paid` / `confirm-paid` / `reset-paid` (two-state) |

- **Broadcast:** standardize on `items-updated {items}` for all claim mutations (client `SYNC_ITEMS`). Keep `guest-joined`, `payment-updated`, `session-state`/`session-updated`, `error`, `claiming-update`.
- **Authorization (server-enforced):** can't grab/cover a unit held by another via tap; only the unit's owner may `resolve-dispute`; only the disputer may `cancel-dispute`; verbs act on the actor's bound name, not a client-supplied one.
- **Rules (match prototype exactly):** no group approval anywhere; `cover-*` silently drops other claimants; **never auto-split on a grab** (remove old `share-item` implicit bumping); `shared` collapses to `false` at ≤1 claimant. Keep the existing "owner releases a disputed unit → auto-assign to disputer" as the real-world auto-release.
- **Removed:** host dispute arbitration (`resolve-dispute {assignTo}` host path), `claim-item`/`share-item`/`claim-units`/`unclaim-*` (replaced by the verb set + `normalizeItems` for old payloads). **Kept host automations:** resolve-leftover, remove-guest (re-expressed on units).
- **Shared verb reducer:** extract a pure `applyVerb(units, idx, verb, me)` used by both client (optimistic) and server (authoritative), mirrored like `totals.js`, unit-tested both sides.

---

## 5. Screens (canonical = `ui_kits/app-organic/`) → existing pages

Pixel-faithful recreation in React using the organic tokens. Sticky floating bottom bar; bottom sheets viewport-pinned via a portal (SCREENS §8); honor `prefers-reduced-motion`.

| Prototype | Our file | Notes |
|---|---|---|
| **Welcome** (`Welcome`) | **new** `pages/Welcome.jsx` + route `/` | Logo mark, hand-drawn underline, "Snap the receipt" / "Join with a code". Home setup moves to `/setup`. |
| **Host Setup** (`Setup`) | `pages/Home.jsx` → `/setup` | Name + Venmo (`/api/verify-venmo` "✓ Sarah Jones") + currency. Keep verify + history resume. |
| **Scan** (`Scan`) | `pages/ScanReceipt.jsx` | Real camera/upload → `/api/scan-receipt` (prompt **verbatim**); real OCR latency = the shimmer state. |
| **(Review)** | `pages/ReviewItems.jsx` | Keep edit step; restyle. Quantity edits resize `units`. |
| **Tip** (`TipShare`) | `pages/TipAndShare.jsx` | Show full scanned itemization + tear-line Subtotal/Tax/Tip/Total. Keep tipMode (percent/dollar), tipIncluded, adminFee, currency. |
| **QR** (`QRSheet`) | `components/QROverlay.jsx` | Real join URL (`/api/server-ip` in dev). |
| **Join** (`Join`) | `pages/JoinSession.jsx` | Name → `join-session`. |
| **Claim** (`ClaimScreen`+`ItemCard`+`UnitRow`) | `pages/ClaimItems.jsx` | **The heart (README §4).** Five unit states; tap = one safe action; single `⋯` menu of state-adaptive verbs; inline "I'm in" on splits-you're-not-in; "$X each if you join"; two-party dispute banners; sticky "Your share so far" + "I'm done" (disabled <1 claim); unclaimed-items guard sheet; toasts. Drop the old split-count modal and the prototype's demo timers (`autoRelease`/`simulateJoins`). |
| **Your Share** (`ShareScreen`) | `pages/Summary.jsx` | Itemized owe on tinted "plate"; warm clay **"Pay {host} $X"** (Venmo handoff) + "via Venmo" note; keep `paidTotal` "total changed" snapshot. |
| **Settled** (`SettledScreen`) | `pages/Summary.jsx` post-pay | Celebration + who's-paid (Paid/Pending). |
| **Host Dashboard** (`HostDashboard`) | `pages/HostDashboard.jsx` | Live Collected $X/$Y meter, per-person cards (items + tax/tip + Paid/Pending pill), two-state confirm, host automations. |

### Design system integration
- Add **Inter + Newsreader** (self-host or CDN per app convention) and **Lucide** icons. Port the organic tokens from `colors_and_type.css` + `organic.css` into the app's styling system (a global stylesheet of CSS custom properties + component classes, replacing/extending the current inline-token system in `index.css`). Recreate hand-drawn SVG accents (`Squiggle`, `SketchCheck`, `Blob`, `ReceiptDoodle`) as components. Avatar tones are **fixed per identity**, not theme-derived.

---

## 6. Keep / Change / Add (reconciling BACKEND.md §D with the real `main`)

BACKEND.md §A describes an **older** app than `main`; where they differ, the **shipped hardening wins**.
- **KEEP:** persistent disk store (not in-memory), TTL-refresh + never-prune-when-unpaid, rate-limited `/api/scan-receipt`, server-side `sanitizeScan`, identity-bound sockets + duplicate-name rejection, two-state payments + `paidTotal`, `verify-venmo`, OCR prompt + FX, admin fee / tip-included / dollar tip / discount, receipt-total reconciliation, unaccounted-$ warning, host automations, prod static serving.
- **CHANGE:** item model → `units[]`; OCR transform; claim socket events → §4 verb set; money math → §3 exact/prototype rule; full visual rebuild.
- **ADD:** Welcome screen; cover verbs; opt-in split/I'm-in loop; real Venmo handoff wired to `record-payment`/two-state; Lucide + Newsreader; hand-drawn accents.

---

## 7. Testing (exactness is the point)

- `server/test/totals.test.js` + `client/SessionContext.test.js`: rewrite fixtures to the unit model; assert (a) fully-claimed bill sums **exactly** to grandTotal; (b) partial-claim: `Σ guest totals + unaccounted == grandTotal`; (c) no person charged > their claimed items; (d) discount parity client↔server; (e) shared-unit even division; (f) ×N independent units.
- New `applyVerb` tests (client + server) covering all verbs + authorization (can't grab held; owner-only resolve; disputer-only cancel; no auto-split; shared collapse).
- Update `server/scripts/smoke.cjs` to the new events.
- Keep rate-limit / sanitize / store-prune tests green.

---

## 8. Phasing (implement screen-by-screen, Claim flow first — per user)

1. **Core model + math + sockets (no UI yet):** `units[]`, `normalizeItems`, `applyVerb` (shared), §3 money math both sides, §4 socket events, all tests green. *Risk-first; this is the money surface.*
2. **Claim screen** (README §4) on the new model + events + organic styling.
3. **Your Share → Settled** (Summary) + real Venmo handoff + two-state.
4. **Host Dashboard** on unit-aware totals.
5. **Design system port** + remaining screens: Welcome (new), Setup, Scan, Tip, QR, Join.
6. **Verify:** full test suite + smoke + manual run; update CLAUDE.md (model, events, money rule).

Each phase: build → run its tests → request review before the next.

---

## 9. Open questions / risks
- **Money behavior change (§3.4)** — host absorbs unclaimed fees (prototype-faithful) vs. today's spread-across-claimants. Spec assumes the new rule; confirm.
- **Repo hygiene:** `design_system_reference/` is ~3.4MB incl. PNGs — gitignore it (keep `design_handoff_claim_flow/` which you placed intentionally), or commit refs? Assumed: gitignore the bulky bundle.
- **Routing change:** `/` becomes Welcome, setup moves to `/setup` — verify no deep links/Q, history assume `/`.
- **Fonts:** self-host vs CDN (offline/perf). Assumed: app's existing convention.
