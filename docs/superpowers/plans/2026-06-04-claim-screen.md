# Claim Screen (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild `client/src/pages/ClaimItems.jsx` to the canonical organic Claim screen (README §4 + the screenshots), on the unit model, wired to the real verb socket events, using the Phase-2 primitives + organic classes.

**Architecture:** Port the prototype's `ClaimScreen` + `ItemCard` + `UnitRow` (`design_handoff_claim_flow/prototype/organic-screens.jsx`) into React. Replace the prototype's local `unit(id, idx, verb)` state mutation with **socket emits** (server-authoritative): the server applies the verb and broadcasts `items-updated`, which the client maps to `SYNC_ITEMS`. Drop the prototype's demo-only timers (`autoRelease`, `simulateJoins`). Live "Your share so far" comes from `calculatePersonTotal`. The unclaimed-items guard + the per-item `⋯` options sheet are `BottomSheet`s; feedback is `Toast`.

**Tech Stack:** React 19, socket.io-client, the Phase-2 `components/ui` primitives, `SessionContext`.

**Spec:** README §4 (the claim model — read it), SCREENS.md §7, screenshots (header copy, card states), `prototype/organic-screens.jsx` (visual + per-state logic source of truth).

---

## Verb → socket-event map (THE integration contract)
The screen never mutates items locally; it emits, the server authorizes + applies + broadcasts. Actor identity is the socket's bound name (server-side) — **do not send a guest name in the payload.**

| UI action (prototype verb) | Emit | Payload |
|---|---|---|
| tap an Open unit (`grab`) | `grab-unit` | `{sessionId, itemId, unitIndex}` |
| tap my solo unit / menu "Remove me" / "Leave the split" (`release`/`leave`) | `release-unit` | `{sessionId, itemId, unitIndex}` |
| menu "I split this" (`split`/`splitWith`) | `split-unit` | `{sessionId, itemId, unitIndex}` |
| tap a split-not-in / inline "I'm in" (`join`) | `join-unit` | `{sessionId, itemId, unitIndex}` |
| menu "I'm covering this / it all" (`coverUnit`) | `cover-unit` | `{sessionId, itemId, unitIndex}` |
| menu "I had all N" (`coverItem`) | `cover-item` | `{sessionId, itemId}` |
| menu "Actually, this is mine" (`dispute`) | `dispute-unit` | `{sessionId, itemId, unitIndex}` |
| dispute banner (owner) "You're right" (`resolveAccept`) | `resolve-dispute` | `{sessionId, itemId, unitIndex, accept:true}` |
| dispute banner (owner) "No, it's mine" (`resolveReject`) | `resolve-dispute` | `{sessionId, itemId, unitIndex, accept:false}` |
| dispute banner (disputer) "Never mind" (`cancel`) | `cancel-dispute` | `{sessionId, itemId, unitIndex}` |
| menu "Remove me" on a fully-covered multi-unit item (`clear`) | one `release-unit` per unit index where I'm a claimant | — |

A single dispatcher implements this:
```jsx
function act(itemId, unitIndex, verb) {
  if (verb === 'coverItem') return socket.emit('cover-item', { sessionId, itemId });
  if (verb === 'resolveAccept') return socket.emit('resolve-dispute', { sessionId, itemId, unitIndex, accept: true });
  if (verb === 'resolveReject') return socket.emit('resolve-dispute', { sessionId, itemId, unitIndex, accept: false });
  if (verb === 'clear') {
    const it = state.items.find(i => String(i.id) === String(itemId));
    (it?.units || []).forEach((u, i) => { if (u.claims.includes(myName)) socket.emit('release-unit', { sessionId, itemId, unitIndex: i }); });
    return;
  }
  const EV = { grab: 'grab-unit', release: 'release-unit', leave: 'release-unit', split: 'split-unit', splitWith: 'split-unit', join: 'join-unit', coverUnit: 'cover-unit', dispute: 'dispute-unit', cancel: 'cancel-dispute' };
  if (EV[verb]) socket.emit(EV[verb], { sessionId, itemId, unitIndex });
}
```

---

## File structure
| File | Responsibility | Action |
|---|---|---|
| `client/src/pages/ClaimItems.jsx` | The Claim screen (ClaimScreen + ItemCard + UnitRow) on the unit model + sockets | Rewrite |
| `client/src/pages/ClaimItems.test.jsx` | render smoke (states render, no crash) | Create |

---

## Task 1: Rebuild the Claim screen

**Files:** Rewrite `client/src/pages/ClaimItems.jsx`; Create `client/src/pages/ClaimItems.test.jsx`.

- [ ] **Step 1 — read the sources:** `design_handoff_claim_flow/prototype/organic-screens.jsx` (ClaimScreen/ItemCard/UnitRow — the visual + per-state logic), `design_handoff_claim_flow/README.md` §4 (the rules), the current `client/src/pages/ClaimItems.jsx` (for the existing socket-mount pattern: `socket.connect()`, `rejoin-room`, the `fetch('/api/session/:id')` initial load, cleanup), `client/src/context/SessionContext.jsx` (exports `useSession`, `calculatePersonTotal`, `formatPrice`, `shareOf`, `unitPrice`), and `client/src/components/ui/index.js`.

- [ ] **Step 2 — write the render smoke test** `client/src/pages/ClaimItems.test.jsx`. It must render the screen with a seeded session via a wrapping provider and assert the key states appear without crashing. Use `renderToStaticMarkup` with a context provider that supplies a fixed state (mock `useSession` by rendering inside `SessionContext`'s provider is hard; instead export the pure presentational pieces). To keep it testable, structure `ClaimItems.jsx` so the inner **`ItemCard`** is exported and pure (props: `item, me, onUnit, onMenu`). Test:
  ```jsx
  import { describe, it, expect } from 'vitest';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { ItemCard } from './ClaimItems';

  const wrap = (item, me = 'Jordan') => renderToStaticMarkup(<ItemCard item={item} me={me} onUnit={() => {}} onMenu={() => {}} />);

  describe('ItemCard states', () => {
    it('open unit shows the prompt', () => {
      expect(wrap({ id: '1', name: 'Burrata', price: 14, units: [{ shared: false, claims: [], dispute: null }] }))
        .toContain('Tap if you ordered this');
    });
    it('my solo unit shows All yours', () => {
      expect(wrap({ id: '1', name: 'Burrata', price: 14, units: [{ shared: false, claims: ['Jordan'], dispute: null }] }))
        .toContain('All yours');
    });
    it('held by other shows their name', () => {
      expect(wrap({ id: '0', name: 'Pizza', price: 18, units: [{ shared: false, claims: ['Sarah'], dispute: null }] }))
        .toContain('Sarah');
    });
    it('a split I am not in shows the I\'m in affordance', () => {
      const html = wrap({ id: '4', name: 'Wine', price: 48, units: [{ shared: true, claims: ['Sarah', 'Mia'], dispute: null }] });
      expect(html).toContain("I'm in");
    });
    it('multi-unit item renders a row per unit', () => {
      const html = wrap({ id: '3', name: 'Spritz', price: 36, units: [
        { shared: false, claims: [], dispute: null }, { shared: false, claims: [], dispute: null }, { shared: false, claims: [], dispute: null }] });
      expect((html.match(/urow/g) || []).length).toBeGreaterThanOrEqual(3);
    });
  });
  ```
  Run `cd client && npx vitest run src/pages/ClaimItems.test.jsx` → expect FAIL.

- [ ] **Step 3 — implement `ClaimItems.jsx`.** Port `ClaimScreen` + `ItemCard` + `UnitRow` from the prototype, with these REQUIRED changes:
  - **Exports:** default `ClaimItems` (the route component) and a NAMED `export function ItemCard(...)` (pure, props `{ item, me, onUnit, onMenu }`) so the test can mount it. `UnitRow` can be module-local.
  - **State/identity:** `const { state, dispatch } = useSession(); const myName = state.currentUser?.name; const host = state.hostName; const { sessionId } = useParams();` Items come from `state.items` (already unit-shaped, normalized by the reducer). Money: `const myTotal = calculatePersonTotal(state, myName).total;` for the sticky bar; per-unit prices via `unitPrice(item)` and `item.price / claims.length`.
  - **Socket mount** (reuse the existing pattern from the current file): on mount `socket.connect()` if needed, `socket.emit('rejoin-room', { sessionId, guestName: myName, isHost: state.currentUser?.isHost })`, `fetch(\`${BACKEND_URL}/api/session/${sessionId}\`)` → `dispatch({ type: 'LOAD_SESSION', session })`. Listen: `socket.on('items-updated', ({ items }) => dispatch({ type: 'SYNC_ITEMS', items }))`, `socket.on('session-updated', s => s && dispatch({ type: 'LOAD_SESSION', session: s }))`, `socket.on('guest-joined', ({ guests }) => dispatch({ type: 'SYNC_GUESTS', guests }))`, and re-`rejoin-room` on `connect`. Clean up all listeners on unmount.
  - **Verb dispatch:** replace the prototype's `unit(id, idx, verb)` body with the `act(itemId, unitIndex, verb)` socket dispatcher from the contract above. The `onUnit`/menu callbacks call `act(...)`. Keep the prototype's `flash`/toast for immediate feedback (toast text only; the real state change arrives via `items-updated`).
  - **DELETE the prototype's demo effects:** the `simulateJoins` `useEffect` and the `autoRelease` `useEffect` (and their props) — production has real peers; no fake timers.
  - **Header copy** (from the screenshots, newer than the prototype): `Hey {myName} 👋` (use the waving-hand accent), lead: **"Tap what you ordered. Shared it? Hit the ⋯ for every way to split."**
  - **Fix the prototype copy glitches:** correct pluralization in the unclaimed hint (`{n} item{n===1?'':'s'} no one's grabbed yet`) and the single space in "{name} ordered this".
  - **Options sheet + unclaimed guard:** use the Phase-2 `BottomSheet` (or the prototype's scrim/sheet markup via `SheetPortal`) — the `actionsFor(item, idx)` menu (README §4.3) and the "A few things are unclaimed" sheet (README §4.9: "Keep claiming" / "Leave on {host}'s tab" → `onDone`). On "I'm done" with everything claimed → navigate to `/summary/${sessionId}`; with unclaimed items → open the guard sheet first.
  - **Primitives/classes:** use `Button`, `Avatar`/`AvatarStack`, `Icon`, `Squiggle`/`SketchCheck`, `BottomSheet`/`SheetPortal`, `Toast` from `../components/ui`, and the organic classes (`pg`, `claim-head`, `icards`, `icard`, `icard-sub`, `urow`, `fbar`, `chip-join`, `ec`, `scrim`, `sheet`, `act-row`, etc.) which are already in `organic.css`. Money rendered with `formatPrice(amount, state.currency)`.
  - **"I'm done"** disabled until the user is on ≥1 unit (`state.items.some(it => it.units.some(u => u.claims.includes(myName)))`).
  - Wrap the page in the app shell if not already global: the route content should sit inside `<div className="app-shell"><div className="app-body">…</div></div>` (or rely on App-level shell — check how other routes render; if none provides it, wrap here).

- [ ] **Step 4 — run the render test:** `cd client && npx vitest run src/pages/ClaimItems.test.jsx` → PASS.
- [ ] **Step 5 — full client tests + build:** `cd client && npx vitest run` (all pass) and `cd client && npm run build` (success).
- [ ] **Step 6 — manual realtime check (best-effort):** start server (`cd server && (npm start &)`) and the client dev server is not needed for a socket check — instead run `node server/scripts/smoke.cjs 3001` to confirm the verb events still behave (the screen emits exactly those events). Kill the server after. (Full visual verification happens when the whole flow is assembled.)
- [ ] **Step 7 — commit:**
  ```bash
  git add client/src/pages/ClaimItems.jsx client/src/pages/ClaimItems.test.jsx
  git commit -m "feat(ui): rebuild Claim screen on the unit model + verb sockets (organic)"
  ```

## Self-review
- [ ] All five §4.1 unit states render correctly (open / mine-solo / held / split-in / split-not-in) + dispute overlay. ✓
- [ ] Tap does only the one safe action (§4.2); destructive/ambiguous actions are in the `⋯` menu only. ✓
- [ ] "I split this" is opt-in (declare → others "I'm in"); no auto-split; covering drops others; disputes are two-party. ✓ (enforced server-side; UI offers the right verbs per state)
- [ ] Demo timers removed; header copy matches screenshots; copy glitches fixed. ✓
- [ ] Money shows via `formatPrice`/`calculatePersonTotal`; "I'm done" gated on ≥1 claim; unclaimed guard routes to Summary. ✓

## Done when
Render test + full vitest green, `npm run build` succeeds, smoke still 16/16, and `ItemCard` renders every state. The Your-Share/Settled destination is built in Plan 4.
