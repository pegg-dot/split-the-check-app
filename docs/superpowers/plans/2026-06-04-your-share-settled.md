# Your Share + Settled + Venmo (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Rebuild `client/src/pages/Summary.jsx` to the prototype's **Your Share** (`ShareScreen`) and **Settled** (`SettledScreen`) visuals, while preserving the shipped real payment behavior (two-state pay→confirm, pay-time `paidTotal` "your total changed" alert, Venmo handoff with desktop fallback), updated to the unit model + `items-updated` events.

**Architecture:** One route component `Summary` with two visual states: **unpaid → Your Share** (itemized owe on a tinted `plate`, warm clay "Pay {host} ${X}" → `openVenmo`, two-step confirm, "via Venmo" note), and **paid → Settled** (celebration + who's-paid list). Money from `calculatePersonTotal`/`calculateAllPersonTotals` (unit-based). Realtime via `items-updated`→`SYNC_ITEMS`. Keep the existing change-detection but re-express it on totals (not the old claims array).

**Spec:** prototype `organic-screens.jsx` `ShareScreen`/`SettledScreen`; SCREENS.md §8–9; current `client/src/pages/Summary.jsx` (payment logic to preserve); `client/src/lib/venmo.js` (`openVenmo`).

---

## Task 1: Rebuild Summary (Your Share + Settled)

**Files:** Rewrite `client/src/pages/Summary.jsx`; Create `client/src/pages/Summary.test.jsx`.

- [ ] **Step 1 — read:** prototype `ShareScreen` + `SettledScreen` (`design_handoff_claim_flow/prototype/organic-screens.jsx`), SCREENS.md §8–9, the CURRENT `client/src/pages/Summary.jsx` (preserve its payment two-state, `paidTotal` snapshot/change-alert, venmo handoff, socket-mount), `client/src/lib/venmo.js`, `client/src/components/ui/index.js`, `client/src/context/SessionContext.jsx` (`calculatePersonTotal`, `calculateAllPersonTotals`, `getAllParticipants`, `formatPrice`, `toUSD`).

- [ ] **Step 2 — write the render test** `client/src/pages/Summary.test.jsx`. Export a pure `export function ShareCard({ rows, taxShare, tipShare, tipPercent, total, host, currency })` and `export function PaidList({ people, me })` so they're testable in isolation:
  ```jsx
  import { describe, it, expect } from 'vitest';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { ShareCard, PaidList } from './Summary';

  describe('ShareCard', () => {
    it('lists my items, tax, tip and the owe total', () => {
      const html = renderToStaticMarkup(<ShareCard
        rows={[{ name: 'Tiramisu', myShare: 9 }]} taxShare={0.77} tipShare={1.62} tipPercent={18} total={11.39} host="Sarah" currency="USD" />);
      expect(html).toContain('Tiramisu');
      expect(html).toContain('11.39');
      expect(html).toContain('Sarah');
    });
  });
  describe('PaidList', () => {
    it('shows Paid and Pending per person', () => {
      const html = renderToStaticMarkup(<PaidList me="Jordan" people={[
        { name: 'Jordan', host: false, paid: true }, { name: 'Mia', host: false, paid: false }]} />);
      expect(html).toContain('Paid');
      expect(html).toContain('Pending');
    });
  });
  ```
  Run → expect FAIL.

- [ ] **Step 3 — implement `Summary.jsx`:**
  - **Pure exports:** `ShareCard` (the tinted-`plate` white `sum-card` with item rows + `Tax`/`Tip · N%` sub-rows + `You owe` total row) and `PaidList` (the `settled-list` of avatar+name(+"· host")+Paid/Pending). The route default `Summary` composes them.
  - **Money:** `const me = calculatePersonTotal(state, myName);` rows = `me.claimedItems` (each `{name, myShare}`), `taxShare`/`tipShare`/`total` from it. tipPercent label from `state.tipPercent` (only when percent mode & >0). Currency via `formatPrice(x, state.currency)`. USD conversion for Venmo via `toUSD(me.total, state.exchangeRate)`.
  - **Your Share (unpaid state):** hero `Your share, {myName}` (`disp` + `serif-i` name), lead "Just what you ordered — split fair.", the `plate`>`sum-card`, then a warm **clay** `Button` "Pay {hostLabel} {formatPrice(total)}" → `handleVenmoTap`, caption "Sent instantly **via Venmo** · you both get a receipt". (NOT Venmo blue.)
  - **Payment (preserve current two-state):** keep `openVenmo({ handle: state.venmoHandle, amount: toUSD(total), note })`, the two-step (tap opens Venmo → then a confirm "I sent it" affordance → emit `mark-paid`), and the `awaitingConfirm` flow exactly as the current file does. Keep the host-side display name (`state.hostDisplayName || state.hostName`).
  - **Change alert (re-expressed on totals):** snapshot `paidTotal` (the total at the moment the guest taps pay). On each `items-updated`, recompute `calculatePersonTotal(state,myName).total`; if it differs from `paidTotal` by ≥0.01 AFTER the guest has paid/confirmed, show the "your total changed after you paid — was {old}, now {new}" banner (reuse existing copy/State). Replace the old per-claim diff logic (which read `item.claims`) with this total comparison.
  - **Settled (paid state):** when `isPaid`, render the celebration: sage `disc` with `SketchCheck`, `Squiggle`, display "All *squared up.*" (italic sage), lead "You paid {host} {amount}. The whole table can see it's handled.", then `PaidList` built from `getAllParticipants(state)` × `calculateAllPersonTotals` (owe>0) × `state.payments` (status paid/confirmed = paid). Soft "Start a new check" Button → `dispatch({type:'RESET'})` + `navigate('/')`.
  - **Sockets:** connect, `rejoin-room`, initial `fetch`→`LOAD_SESSION`; listen `items-updated`→`SYNC_ITEMS`, `payment-updated`→`SET_PAYMENTS` (or `SYNC_PAYMENTS`), `session-updated`→`LOAD_SESSION`, `guest-joined`→`SYNC_GUESTS`; re-rejoin on connect. Remove old `item-claimed`/etc. listeners. Guard `if (socket)`.
  - **Shell + primitives:** wrap in `app-shell`/`app-body`/`pg` like the Claim screen; use `Button`, `Avatar`, `Icon`, `SketchCheck`, `Squiggle` from `../components/ui`; organic classes `sum-hero`, `plate`, `sum-card`, `srow`/`.sub`/`.tot`, `pay-note`, `settled`, `settled-mark`, `disc`, `settled-list`.

- [ ] **Step 4 — run:** `cd client && npx vitest run src/pages/Summary.test.jsx` → PASS. Then `cd client && npx vitest run` (all pass) and `cd client && npm run build` (success).
- [ ] **Step 5 — commit:**
  ```bash
  git add client/src/pages/Summary.jsx client/src/pages/Summary.test.jsx
  git commit -m "feat(ui): rebuild Your Share + Settled (organic) preserving two-state pay + Venmo"
  ```

## Self-review
- [ ] Your Share shows my items + tax + tip + owe; Pay button is clay (not Venmo blue) → real Venmo handoff; two-step confirm preserved. ✓
- [ ] paidTotal change-alert works off recomputed totals (unit model), not the old claims array. ✓
- [ ] Settled shows the who's-paid list with Paid/Pending; "Start a new check" resets. ✓
- [ ] Listens on `items-updated`/`payment-updated`; no old event names. ✓

## Done when
Render test + full vitest green, build succeeds, and the two visual states render correctly. Host Dashboard is Plan 5.
