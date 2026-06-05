# Host Dashboard (Phase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Rebuild `client/src/pages/HostDashboard.jsx` to the prototype's "Who owes what" dashboard (organic) — live Collected meter, per-person cards (items + tax/tip + Paid/Pending), two-state confirm, "All settled up." — preserving the shipped host logic and dropping host dispute arbitration (now two-party only).

**Architecture:** Route component `HostDashboard`. Money from `calculateAllPersonTotals` (unit model) + `calculateUnaccounted`. Collected = sum of paid/confirmed guests' totals; Expected = grand total. Realtime via `items-updated`→`SYNC_ITEMS` + `payment-updated`→`SYNC_PAYMENTS`. Preserve host actions: confirm a guest's asserted payment (`confirm-paid`), mark a guest cash-paid (`mark-paid`), `reset-paid`, `resolve-leftover`, `remove-guest`, `remind` (native share), `doneClaiming` display, and the stale-total ("paid then total changed") flag. REMOVE the host dispute-arbitration UI + `resolveDispute({assignTo})` (the server no longer supports it; disputes are owner-only).

**Spec:** prototype `organic-host.jsx` `HostDashboard`; SCREENS.md §10; current `client/src/pages/HostDashboard.jsx` (logic to preserve).

---

## Task 1: Rebuild Host Dashboard

**Files:** Rewrite `client/src/pages/HostDashboard.jsx`; Create `client/src/pages/HostDashboard.test.jsx`.

- [ ] **Step 1 — read:** prototype `HostDashboard` in `design_handoff_claim_flow/prototype/organic-host.jsx` (visual source — Collected meter, per-person cards, Paid/Pending pill, "All settled up." flourish, "· host" inline, the layout gotchas in SCREENS §10: keep "$X / $Y" on ONE line `white-space:nowrap` and the "· host" tag inline), SCREENS.md §10, the CURRENT `client/src/pages/HostDashboard.jsx` (PRESERVE: collected meter math, `hostConfirm`/`hostMarkPaid`/`reset`, `resolveLeftover`, `removeGuest`, `remind`, `doneClaiming`, the per-person stale-total detection comparing `payment.paidTotal` to the recomputed total). `client/src/context/SessionContext.jsx` (`calculateAllPersonTotals`, `calculateUnaccounted`, `getAllParticipants`, `formatPrice`, `round2`), `client/src/components/ui/index.js`, `client/src/lib/history.js` (`recordSplit`).

- [ ] **Step 2 — write the render test** `client/src/pages/HostDashboard.test.jsx` with pure exports `CollectedMeter` and `PersonRow`:
  ```jsx
  import { describe, it, expect } from 'vitest';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { CollectedMeter, PersonRow } from './HostDashboard';

  describe('CollectedMeter', () => {
    it('shows collected / expected on one line', () => {
      const html = renderToStaticMarkup(<CollectedMeter collected={11.39} expected={175.84} currency="USD" />);
      expect(html).toContain('11.39');
      expect(html).toContain('175.84');
      expect(html).toContain('nowrap');
    });
  });
  describe('PersonRow', () => {
    it('renders name, host tag, total, and a paid pill', () => {
      const html = renderToStaticMarkup(<PersonRow person={{ name: 'Sarah', isHost: true, total: 68, paid: true, status: 'confirmed', items: [{ name: 'Pizza', myShare: 18 }] }} currency="USD" />);
      expect(html).toContain('Sarah');
      expect(html).toContain('host');
      expect(html).toContain('68');
    });
  });
  ```
  Run → expect FAIL.

- [ ] **Step 3 — implement `HostDashboard.jsx`:**
  - **Pure exports** `CollectedMeter({ collected, expected, currency })` (label "Collected" + mono `{formatPrice(collected)} / {formatPrice(expected)}` with `white-space:nowrap`, + a sage progress bar `width = collected/expected*100%`) and `PersonRow({ person, currency, onConfirm, onMarkPaid, onReset, onRemove, onRemind })` (avatar + name (+ inline "· host") + Paid/Pending pill + mono total; below, the person's item rows + a muted "Tax + tip" row; sage-soft tint when paid; host action buttons for non-host guests per status). The default `HostDashboard` composes them.
  - **Money:** `const totals = calculateAllPersonTotals(state);` build `people = getAllParticipants(state).map(name => ({ name, isHost: name===state.hostName, ...totals[name], paid: <status paid|confirmed>, status, stale: <payment.paidTotal != null && |paidTotal - totals[name].total| >= 0.01> }))`. `expected = round2(sum of all totals[name].total)`; `collected = round2(sum of paid/confirmed guests' totals)`. Preserve the stale flag UI ("paid, but total changed since").
  - **Header:** "Who owes *what*" (`disp`/`serif-i`), sub "Updates live as people pay you." When all non-host guests are paid/confirmed → "All *settled up.*" flourish.
  - **Host actions (preserve, emit unchanged events):** confirm → `confirm-paid {sessionId, guestName}`; cash mark → `mark-paid {sessionId, guestName}`; undo → `reset-paid {sessionId, guestName}`; leftovers → `resolve-leftover {sessionId, mode}` (offer "Put leftovers on me" / "Split evenly"); remove → `remove-guest {sessionId, guestName}` (keep the confirm prompt); remind → native share (`navigator.share`) as today. (These host-targeted events DO send `guestName` — that's correct, the host acts on others; the server authorizes host-only events by the socket's host identity.)
  - **REMOVE** the host dispute-arbitration section + the `resolveDispute(itemId, assignTo)` function entirely (server no longer supports `resolve-dispute {assignTo}`; disputes resolve two-party on the Claim screen).
  - **Unaccounted:** if `calculateUnaccounted(state).totalUnaccounted >= 0.01`, show the existing "money truth" note (e.g. "{X} unclaimed — on your tab") so the host sees the gap.
  - **Sockets:** connect, `rejoin-room {sessionId, isHost:true}` wait—use `{ sessionId, guestName: state.hostName, isHost: true }` so the hardened `rejoin-room` binds the host identity; initial `fetch`→`LOAD_SESSION` (+ `SET_HOST`); listen `items-updated`→`SYNC_ITEMS`, `payment-updated`→`SYNC_PAYMENTS`, `guest-joined`→`SYNC_GUESTS`, `claiming-update`→ doneClaiming, `session-updated`→`LOAD_SESSION`; re-rejoin on connect; cleanup; guard `if (socket)`. Remove old `item-claimed`/etc. listeners.
  - **Shell/classes/primitives:** `app-shell`/`app-body`/`pg`; organic dashboard classes from `organic.css` (meter, per-person card, pill, "· host"), `ui` primitives (`Avatar`, `Icon`, `Button`). Money via `formatPrice(x, state.currency)`.

- [ ] **Step 4 — run:** `cd client && npx vitest run src/pages/HostDashboard.test.jsx` → PASS; then `cd client && npx vitest run` (all pass); `cd client && npm run build` (success, no stray `require(`).
- [ ] **Step 5 — commit:**
  ```bash
  git add client/src/pages/HostDashboard.jsx client/src/pages/HostDashboard.test.jsx
  git commit -m "feat(ui): rebuild Host Dashboard (organic) — collected meter, two-state confirm, host tools"
  ```

## Self-review
- [ ] Collected $X/$Y on one line + sage meter; per-person cards with items + tax/tip + Paid/Pending; "All settled up." when done. ✓
- [ ] Two-state confirm + cash mark + undo + resolve-leftover + remove-guest + remind preserved; host dispute arbitration REMOVED. ✓
- [ ] Unit-model totals; `items-updated`/`payment-updated`; unaccounted note shown. ✓

## Done when
Render test + full vitest green, build succeeds, dashboard renders the meter + person rows. Plan 6 is the remaining entry/flow screens.
