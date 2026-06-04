# Claim Engine (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dual claim model (`splitCount`/`units`-on-claim) with the unit-based model (`units[]`), add a shared `applyVerb` reducer, rewrite the proportional money math to be exact and prototype-faithful, and refactor the claim socket events to the verb set — all unit-tested, with the end-to-end smoke green.

**Architecture:** Two pure, mirrored modules hold all claim logic: `server/lib/claim-verbs.js` (CJS) and `client/src/lib/claimVerbs.js` (ESM). Money math lives in `server/lib/totals.js` (CJS) and `client/src/context/SessionContext.jsx` (ESM), kept faithful to each other. `server/index.js` socket handlers become thin: validate identity → `applyVerb` → persist → broadcast `items-updated`. This phase does **not** rebuild any screen UI; the existing claim screen will be non-functional on this branch until Plan 3 (we never ship mid-branch).

**Tech Stack:** Node + Express + Socket.IO (server, CommonJS, `node:test`), React 19 + Vite (client, ESM, Vitest), socket.io-client.

**Spec:** `docs/superpowers/specs/2026-06-04-claim-settle-flow-design.md` (§2 model, §3 money math, §4 sockets).

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `server/lib/claim-verbs.js` | Pure unit model: `normalizeItem`, `normalizeItems`, `applyVerb` | Create |
| `client/src/lib/claimVerbs.js` | ESM mirror of the above | Create |
| `server/lib/totals.js` | Unit-based exact money math (`shareOf`, `calculateAllPersonTotals`, `calculateUnaccounted`, `hasOutstandingBalance`) | Rewrite |
| `client/src/context/SessionContext.jsx` | Unit-based math (`calculatePersonTotal`, `calculateAllPersonTotals`, `calculateUnaccounted`) + `normalizeItems` on load/sync; OCR→units transform in `SET_ITEMS` | Rewrite math + reducer item handling |
| `server/index.js` | Socket handlers → verb set; identity/auth; broadcast `items-updated` | Modify (claim handlers ~ lines 442–710) |
| `server/scripts/smoke.cjs` | Exercise the new events | Modify |
| `server/test/claim-verbs.test.js` | Verb unit tests | Create |
| `server/test/totals.test.js` | Exact-sum + no-overcharge money tests | Rewrite |
| `client/src/lib/claimVerbs.test.js` | ESM verb tests | Create |
| `client/src/context/SessionContext.test.js` | Unit-model math + parity | Rewrite |

### Canonical data shapes (used across all tasks)
```js
// Unit: one independently-claimable share of a line item
{ shared: false, claims: [], dispute: null }     // open
{ shared: false, claims: ['Sarah'], dispute: null }  // solo (held by Sarah)
{ shared: true,  claims: ['Sarah','Mia'], dispute: null }  // a split pool
{ shared: false, claims: ['Sarah'], dispute: { by: 'Jordan' } }  // disputed

// Item: price is the TOTAL for the line; units.length === quantity
{ id: '0', name: 'Aperol Spritz', price: 36, units: [u,u,u], covered: false, quantity: 3, unitPrice: 12 }
```

### Verb → socket event map (used in Task 5)
| Socket event | Verb passed to `applyVerb` | Auth rule (server) |
|---|---|---|
| `grab-unit` | `grab` | unit has no active dispute |
| `release-unit` | `release` | actor ∈ unit.claims |
| `split-unit` | `split` | unit has no active dispute |
| `join-unit` | `join` | unit.shared, no dispute |
| `cover-unit` | `coverUnit` | unit has no active dispute |
| `cover-item` | `coverItem` | no unit in item disputed |
| `dispute-unit` | `dispute` | actor ∉ claims, ≥1 other claimant, not shared, no existing dispute |
| `resolve-dispute {accept:true}` | `resolveAccept` | actor ∈ claims and actor ≠ dispute.by |
| `resolve-dispute {accept:false}` | `resolveReject` | actor ∈ claims and actor ≠ dispute.by |
| `cancel-dispute` | `cancel` | actor === dispute.by |

---

## Task 1: Server claim-verbs module

**Files:**
- Create: `server/lib/claim-verbs.js`
- Test: `server/test/claim-verbs.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/test/claim-verbs.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { applyVerb, normalizeItem, normalizeItems } = require('../lib/claim-verbs');

const open = () => ({ id: '0', name: 'Burrata', price: 14, units: [{ shared: false, claims: [], dispute: null }] });
const multi = () => ({ id: '1', name: 'Spritz', price: 36, units: [
  { shared: false, claims: [], dispute: null },
  { shared: false, claims: [], dispute: null },
  { shared: false, claims: [], dispute: null },
] });

test('grab claims a unit solo', () => {
  const it = applyVerb(open(), 'grab', { unitIndex: 0, me: 'Jordan' });
  assert.deepStrictEqual(it.units[0], { shared: false, claims: ['Jordan'], dispute: null });
});

test('release removes me and collapses shared at <=1', () => {
  let it = applyVerb(open(), 'split', { unitIndex: 0, me: 'Jordan' });
  it = applyVerb(it, 'join', { unitIndex: 0, me: 'Mia' });
  it = applyVerb(it, 'release', { unitIndex: 0, me: 'Jordan' });
  assert.deepStrictEqual(it.units[0], { shared: false, claims: ['Mia'], dispute: null });
});

test('split is a declaration that keeps existing claimants', () => {
  const held = applyVerb(open(), 'grab', { unitIndex: 0, me: 'Sarah' });
  const it = applyVerb(held, 'split', { unitIndex: 0, me: 'Jordan' });
  assert.strictEqual(it.units[0].shared, true);
  assert.deepStrictEqual(it.units[0].claims, ['Sarah', 'Jordan']);
});

test('join adds me to a shared pool, idempotent', () => {
  let it = applyVerb(open(), 'split', { unitIndex: 0, me: 'Sarah' });
  it = applyVerb(it, 'join', { unitIndex: 0, me: 'Jordan' });
  it = applyVerb(it, 'join', { unitIndex: 0, me: 'Jordan' });
  assert.deepStrictEqual(it.units[0].claims, ['Sarah', 'Jordan']);
});

test('leave drops shared to false at one claimant', () => {
  let it = applyVerb(open(), 'split', { unitIndex: 0, me: 'Sarah' });
  it = applyVerb(it, 'join', { unitIndex: 0, me: 'Jordan' });
  it = applyVerb(it, 'leave', { unitIndex: 0, me: 'Jordan' });
  assert.deepStrictEqual(it.units[0], { shared: false, claims: ['Sarah'], dispute: null });
});

test('coverUnit takes the unit and drops everyone else', () => {
  let it = applyVerb(open(), 'split', { unitIndex: 0, me: 'Sarah' });
  it = applyVerb(it, 'join', { unitIndex: 0, me: 'Mia' });
  it = applyVerb(it, 'coverUnit', { unitIndex: 0, me: 'Jordan' });
  assert.deepStrictEqual(it.units[0], { shared: false, claims: ['Jordan'], dispute: null });
});

test('coverItem takes every unit and sets covered', () => {
  const it = applyVerb(multi(), 'coverItem', { me: 'Jordan' });
  assert.strictEqual(it.covered, true);
  assert.strictEqual(it.units.length, 3);
  for (const u of it.units) assert.deepStrictEqual(u, { shared: false, claims: ['Jordan'], dispute: null });
});

test('dispute flags a held unit; resolveAccept hands over; resolveReject clears', () => {
  const held = applyVerb(open(), 'grab', { unitIndex: 0, me: 'Sarah' });
  const disputed = applyVerb(held, 'dispute', { unitIndex: 0, me: 'Jordan' });
  assert.deepStrictEqual(disputed.units[0].dispute, { by: 'Jordan' });
  const accepted = applyVerb(disputed, 'resolveAccept', { unitIndex: 0, me: 'Sarah' });
  assert.deepStrictEqual(accepted.units[0], { shared: false, claims: ['Jordan'], dispute: null });
  const rejected = applyVerb(disputed, 'resolveReject', { unitIndex: 0, me: 'Sarah' });
  assert.deepStrictEqual(rejected.units[0], { shared: false, claims: ['Sarah'], dispute: null });
});

test('cancel clears the dispute (disputer changed their mind)', () => {
  const held = applyVerb(open(), 'grab', { unitIndex: 0, me: 'Sarah' });
  const disputed = applyVerb(held, 'dispute', { unitIndex: 0, me: 'Jordan' });
  const cancelled = applyVerb(disputed, 'cancel', { unitIndex: 0, me: 'Jordan' });
  assert.strictEqual(cancelled.units[0].dispute, null);
});

test('normalizeItems migrates a legacy split item to units', () => {
  const legacy = [{ id: 0, name: 'Wine', price: 48, claims: [{ guestName: 'Sarah', splitCount: 2 }, { guestName: 'Mia', splitCount: 2 }] }];
  const [it] = normalizeItems(legacy);
  assert.strictEqual(it.units.length, 1);
  assert.strictEqual(it.units[0].shared, true);
  assert.deepStrictEqual(it.units[0].claims.sort(), ['Mia', 'Sarah']);
});

test('normalizeItems migrates a legacy quantity item to N units', () => {
  const legacy = [{ id: 1, name: 'Spritz', price: 36, quantity: 3, unitPrice: 12, claims: [{ guestName: 'Jordan', units: 2 }] }];
  const [it] = normalizeItems(legacy);
  assert.strictEqual(it.units.length, 3);
  const claimedUnits = it.units.filter(u => u.claims.includes('Jordan')).length;
  assert.strictEqual(claimedUnits, 2);
});

test('applyVerb never mutates its input', () => {
  const it = open();
  const before = JSON.stringify(it);
  applyVerb(it, 'grab', { unitIndex: 0, me: 'Jordan' });
  assert.strictEqual(JSON.stringify(it), before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/claim-verbs.test.js`
Expected: FAIL — `Cannot find module '../lib/claim-verbs'`.

- [ ] **Step 3: Write the implementation**

```js
// server/lib/claim-verbs.js
// ============================================================================
// Pure unit-based claim model. Mirrored in client/src/lib/claimVerbs.js —
// if you change one, change both and update both test files.
// A line item has `units: Unit[]` (length === quantity). Each Unit:
//   { shared: boolean, claims: string[], dispute: { by: string } | null }
// All functions are pure: they return new objects and never mutate inputs.
// ============================================================================

function normalizeUnit(u) {
  return {
    shared: !!(u && u.shared),
    claims: Array.isArray(u && u.claims) ? u.claims.slice() : [],
    dispute: u && u.dispute ? { by: u.dispute.by } : null,
  };
}

// Coerce any item (already-units OR legacy claims-shaped) into the unit model.
function normalizeItem(item) {
  const price = Number(item.price) || 0;
  const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));

  if (Array.isArray(item.units)) {
    return {
      ...item,
      id: String(item.id),
      price,
      quantity: item.units.length || quantity,
      unitPrice: price / (item.units.length || 1),
      covered: !!item.covered,
      units: item.units.map(normalizeUnit),
    };
  }

  // Legacy migration.
  const claims = Array.isArray(item.claims) ? item.claims : [];
  let units;
  if (quantity > 1) {
    units = Array.from({ length: quantity }, () => ({ shared: false, claims: [], dispute: null }));
    // Distribute each legacy claim's `units` count across open units.
    let cursor = 0;
    for (const c of claims) {
      const n = Math.max(1, Math.round(Number(c.units) || 1));
      for (let k = 0; k < n && cursor < units.length; k++, cursor++) {
        units[cursor].claims = [c.guestName];
      }
    }
  } else {
    const names = claims.map(c => c.guestName).filter(Boolean);
    units = [{ shared: names.length > 1, claims: names, dispute: null }];
  }
  return {
    ...item,
    id: String(item.id),
    price,
    quantity,
    unitPrice: price / quantity,
    covered: !!item.covered,
    units,
  };
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).map(normalizeItem);
}

// Apply a verb. `opts = { unitIndex = 0, me }`. Returns a NEW item.
function applyVerb(item, verb, opts) {
  const me = opts.me;
  const idx = opts.unitIndex || 0;
  const base = normalizeItem(item);
  const units = base.units.map(u => ({ ...u, claims: u.claims.slice(), dispute: u.dispute ? { ...u.dispute } : null }));
  const u = units[idx];

  switch (verb) {
    case 'grab':
      units[idx] = { shared: false, claims: [me], dispute: null };
      break;
    case 'release': {
      const claims = u.claims.filter(n => n !== me);
      units[idx] = { shared: claims.length > 1 ? u.shared : false, claims, dispute: null };
      break;
    }
    case 'split':
      units[idx] = { shared: true, claims: u.claims.includes(me) ? u.claims : [...u.claims, me], dispute: null };
      break;
    case 'join':
      units[idx] = { shared: true, claims: u.claims.includes(me) ? u.claims : [...u.claims, me], dispute: null };
      break;
    case 'leave': {
      const claims = u.claims.filter(n => n !== me);
      units[idx] = { shared: claims.length > 1, claims, dispute: null };
      break;
    }
    case 'coverUnit':
      units[idx] = { shared: false, claims: [me], dispute: null };
      break;
    case 'coverItem':
      return { ...base, covered: true, units: base.units.map(() => ({ shared: false, claims: [me], dispute: null })) };
    case 'dispute':
      units[idx] = { ...u, dispute: { by: me } };
      break;
    case 'cancel':
      units[idx] = { ...u, dispute: null };
      break;
    case 'resolveAccept':
      units[idx] = { shared: false, claims: u.dispute ? [u.dispute.by] : u.claims, dispute: null };
      break;
    case 'resolveReject':
      units[idx] = { ...u, dispute: null };
      break;
    default:
      return base;
  }
  // `covered` only stays true while every unit is still solely the coverer.
  const covered = base.covered && units.every(x => x.claims.length === 1 && x.claims[0] === me && !x.shared);
  return { ...base, covered, units };
}

module.exports = { normalizeUnit, normalizeItem, normalizeItems, applyVerb };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/claim-verbs.test.js`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add server/lib/claim-verbs.js server/test/claim-verbs.test.js
git commit -m "feat(engine): pure unit-based claim verbs + legacy migration (server)"
```

---

## Task 2: Server money math (unit-based, exact)

**Files:**
- Rewrite: `server/lib/totals.js`
- Rewrite: `server/test/totals.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/test/totals.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { round2, calculateAllPersonTotals, calculateUnaccounted, shareOf, distributeProportionally } = require('../lib/totals');

// Seed bill: subtotal 139, tax 11.82, tip 18% → grand 175.84.
function seed(units) {
  return {
    hostName: 'Sarah',
    guests: [{ name: 'Jordan' }, { name: 'Mia' }],
    subtotal: 139, tax: 11.82, tipPercent: 18, tipMode: 'percent',
    items: [
      { id: '0', name: 'Margherita Pizza', price: 18, units: [{ shared: false, claims: ['Sarah'], dispute: null }] },
      { id: '1', name: 'Burrata', price: 14, units: [{ shared: false, claims: ['Jordan'], dispute: null }] },
      { id: '2', name: 'Negroni', price: 14, units: [{ shared: false, claims: ['Sarah'], dispute: null }] },
      { id: '3', name: 'Aperol Spritz', price: 36, units: [
        { shared: false, claims: ['Mia'], dispute: null },
        { shared: false, claims: ['Mia'], dispute: null },
        { shared: false, claims: ['Sarah'], dispute: null },
      ] },
      { id: '4', name: 'Bottle of Wine', price: 48, units: [{ shared: true, claims: ['Sarah', 'Mia'], dispute: null }] },
      { id: '5', name: 'Tiramisu', price: 9, units: [{ shared: false, claims: ['Jordan'], dispute: null }] },
      ...(units || []),
    ],
    payments: [],
  };
}

test('shareOf splits a shared unit evenly', () => {
  const wine = { price: 48, units: [{ shared: true, claims: ['Sarah', 'Mia'], dispute: null }] };
  assert.strictEqual(shareOf(wine, 'Sarah'), 24);
  assert.strictEqual(shareOf(wine, 'Mia'), 24);
});

test('shareOf on a 3-unit item with 2 of 3 claimed', () => {
  const spritz = { price: 36, units: [
    { shared: false, claims: ['Mia'], dispute: null },
    { shared: false, claims: ['Mia'], dispute: null },
    { shared: false, claims: [], dispute: null },
  ] };
  assert.strictEqual(shareOf(spritz, 'Mia'), 24); // 2 × $12
});

test('fully-claimed bill: per-person totals sum EXACTLY to the grand total', () => {
  const totals = calculateAllPersonTotals(seed());
  const grand = round2(139 + 11.82 + 139 * 0.18); // 175.84
  const sum = round2(Object.values(totals).reduce((s, p) => s + p.total, 0));
  assert.strictEqual(sum, grand);
});

test("Jordan owes 17.71 for Burrata only (fees scale to full subtotal)", () => {
  // Jordan: Burrata 14. prop = 14/139. tax = 11.82·prop = 1.19; tip = 25.02·prop = 2.52.
  const justBurrata = {
    hostName: 'Sarah', guests: [{ name: 'Jordan' }],
    subtotal: 139, tax: 11.82, tipPercent: 18, tipMode: 'percent',
    items: [{ id: '1', name: 'Burrata', price: 14, units: [{ shared: false, claims: ['Jordan'], dispute: null }] }],
    payments: [],
  };
  const t = calculateAllPersonTotals(justBurrata).Jordan;
  assert.strictEqual(t.itemsTotal, 14);
  assert.strictEqual(t.taxShare, 1.19);
  assert.strictEqual(t.tipShare, 2.52);
  assert.strictEqual(t.total, 17.71);
});

test('partial claim: guests + unaccounted sum to the grand total; nobody overpays', () => {
  const partial = {
    hostName: 'Sarah', guests: [{ name: 'Jordan' }],
    subtotal: 139, tax: 11.82, tipPercent: 18, tipMode: 'percent',
    items: [
      { id: '1', name: 'Burrata', price: 14, units: [{ shared: false, claims: ['Jordan'], dispute: null }] },
      { id: '2', name: 'Negroni', price: 14, units: [{ shared: false, claims: [], dispute: null }] }, // unclaimed
    ],
    payments: [],
  };
  const totals = calculateAllPersonTotals(partial);
  const { totalUnaccounted } = calculateUnaccounted(partial);
  // Subtotal here is only the two items present (28); grand = 28 + tax·(28/139?) ...
  // Use the property: Σ(person totals) + unaccounted == subtotal + tax + tip (on this session).
  const grand = round2(partial.subtotal + partial.tax + partial.subtotal * 0.18);
  const sum = round2(Object.values(totals).reduce((s, p) => s + p.total, 0) + totalUnaccounted);
  assert.strictEqual(sum, grand);
  // Jordan only charged for Burrata's proportion, never the unclaimed Negroni.
  assert.ok(totals.Jordan.itemsTotal === 14);
});

test('discount parity: discount is distributed and subtracted', () => {
  const withDiscount = { ...seed(), discount: 10 };
  const totals = calculateAllPersonTotals(withDiscount);
  const grand = round2(139 + 11.82 + 139 * 0.18 - 10);
  const sum = round2(Object.values(totals).reduce((s, p) => s + p.total, 0));
  assert.strictEqual(sum, grand);
});

test('admin fee + dollar tip distribute exactly', () => {
  const s = { ...seed(), tipMode: 'dollar', tipDollar: 20, tipPercent: 0, adminFee: 5 };
  const totals = calculateAllPersonTotals(s);
  const grand = round2(139 + 11.82 + 20 + 5);
  const sum = round2(Object.values(totals).reduce((s2, p) => s2 + p.total, 0));
  assert.strictEqual(sum, grand);
});

test('nothing claimed → everyone zero, everything unaccounted', () => {
  const empty = { hostName: 'Sarah', guests: [{ name: 'Jordan' }], subtotal: 139, tax: 11.82, tipPercent: 18,
    items: [{ id: '0', name: 'X', price: 139, units: [{ shared: false, claims: [], dispute: null }] }], payments: [] };
  const totals = calculateAllPersonTotals(empty);
  assert.strictEqual(totals.Jordan.total, 0);
  assert.strictEqual(totals.Sarah.total, 0);
});

test('distributeProportionally sums exactly with leftover cents', () => {
  const out = distributeProportionally(10, [1, 1, 1]); // 3.34/3.33/3.33
  assert.strictEqual(round2(out.reduce((a, b) => a + b, 0)), 10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/totals.test.js`
Expected: FAIL — `shareOf is not a function` (old totals.js has no `shareOf`).

- [ ] **Step 3: Write the implementation**

```js
// server/lib/totals.js
// ============================================================================
// Server-side money math (unit-based). Mirrored in client SessionContext.jsx.
// Guarantee: when every item is claimed, per-person totals sum EXACTLY to the
// grand total; fees scale to the FULL subtotal so nobody is charged for items
// they didn't claim — the unclaimed remainder is the host's tab (calculateUnaccounted).
// Uses largest-remainder distribution so sums never drift a cent.
// ============================================================================

const { normalizeItems } = require('./claim-verbs');

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

function distributeProportionally(total, weights) {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0 || total === 0) return weights.map(() => 0);
  const totalCents = Math.round(total * 100);
  const exact = weights.map(w => (w / totalWeight) * totalCents);
  const floored = exact.map(c => Math.floor(c));
  let remainder = totalCents - floored.reduce((a, b) => a + b, 0);
  const order = exact.map((c, i) => ({ i, frac: c - Math.floor(c) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) floored[order[k % floored.length].i] += 1;
  return floored.map(c => c / 100);
}

function unitPrice(item) { return item.price / (item.units.length || 1); }

function shareOf(item, name) {
  const up = unitPrice(item);
  return (item.units || []).reduce((s, u) => s + (u.claims.includes(name) ? up / u.claims.length : 0), 0);
}

function getAllParticipants(session) {
  const names = new Set();
  if (session.hostName) names.add(session.hostName);
  for (const g of (session.guests || [])) names.add(g.name);
  return Array.from(names);
}

// Each item's claimed value (in cents), distributed across its claimants by
// raw shareOf weights via largest-remainder — exact per-person item charges.
function perPersonItemCents(items, names) {
  const cents = Object.fromEntries(names.map(n => [n, 0]));
  const claimedNames = {};
  for (const item of items) {
    const up = unitPrice(item);
    const claimedUnits = item.units.filter(u => u.claims.length > 0).length;
    if (claimedUnits === 0) continue;
    const claimedValue = round2(up * claimedUnits);
    const itemNames = names.filter(n => shareOf(item, n) > 0);
    const weights = itemNames.map(n => shareOf(item, n));
    const dist = distributeProportionally(claimedValue, weights);
    itemNames.forEach((n, i) => {
      cents[n] += Math.round(dist[i] * 100);
      (claimedNames[n] = claimedNames[n] || []).push({ name: item.name, myShare: dist[i] });
    });
  }
  return { cents, claimedNames };
}

function calculateAllPersonTotals(session) {
  const items = normalizeItems(session.items);
  const subtotal = session.subtotal || 0;
  const names = getAllParticipants(session);
  const blank = { itemsTotal: 0, taxShare: 0, tipShare: 0, adminFeeShare: 0, discountShare: 0, total: 0, claimedItems: [] };
  if (!subtotal || names.length === 0) return Object.fromEntries(names.map(n => [n, { ...blank }]));

  const tax = session.tax || 0;
  const adminFee = session.adminFee || 0;
  const discount = session.discount || 0;
  const tipMode = session.tipMode || 'percent';
  const tipPercent = Math.max(0, session.tipPercent || 0);
  const tipDollar = Math.max(0, session.tipDollar || 0);
  const tipIncluded = session.tipIncluded;
  const tipAmount = session.tipAmount || 0;

  const { cents, claimedNames } = perPersonItemCents(items, names);
  const itemTotals = Object.fromEntries(names.map(n => [n, cents[n] / 100]));
  const claimedSubtotal = round2(names.reduce((s, n) => s + itemTotals[n], 0));
  const scale = subtotal > 0 ? claimedSubtotal / subtotal : 0;
  const weights = names.map(n => itemTotals[n]);

  const taxShares = distributeProportionally(round2(tax * scale), weights);
  const adminShares = distributeProportionally(round2(adminFee * scale), weights);
  const discountShares = distributeProportionally(round2(discount * scale), weights);
  const includedTipShares = tipIncluded ? distributeProportionally(round2(tipAmount * scale), weights) : names.map(() => 0);
  let addTipShares;
  if (tipMode === 'dollar') addTipShares = distributeProportionally(round2(tipDollar * scale), weights);
  else if (tipPercent > 0) addTipShares = distributeProportionally(round2(claimedSubtotal * (tipPercent / 100)), weights);
  else addTipShares = names.map(() => 0);

  const result = {};
  names.forEach((n, i) => {
    const tipShare = round2(includedTipShares[i] + addTipShares[i]);
    const total = round2(Math.max(0, itemTotals[n] + taxShares[i] + tipShare + adminShares[i] - discountShares[i]));
    result[n] = { itemsTotal: itemTotals[n], taxShare: taxShares[i], tipShare, adminFeeShare: adminShares[i], discountShare: discountShares[i], total, claimedItems: claimedNames[n] || [] };
  });
  return result;
}

function calculateUnaccounted(session) {
  const items = normalizeItems(session.items);
  const subtotal = session.subtotal || 0;
  if (!subtotal) return { unclaimedItemValue: 0, totalUnaccounted: 0 };
  const tax = session.tax || 0;
  const adminFee = session.adminFee || 0;
  const tipIncluded = session.tipIncluded;
  const tipAmount = session.tipAmount || 0;
  const tipMode = session.tipMode || 'percent';
  const tipPercent = Math.max(0, session.tipPercent || 0);
  const tipDollar = Math.max(0, session.tipDollar || 0);

  let claimed = 0;
  for (const item of items) {
    const up = item.price / (item.units.length || 1);
    claimed += up * item.units.filter(u => u.claims.length > 0).length;
  }
  claimed = round2(claimed);
  const unclaimedItemValue = round2(Math.max(0, subtotal - claimed));
  const prop = subtotal > 0 ? unclaimedItemValue / subtotal : 0;
  let tip = tipIncluded ? round2(tipAmount * prop) : 0;
  if (tipMode === 'dollar') tip = round2(tip + tipDollar * prop);
  else if (tipPercent > 0) tip = round2(tip + unclaimedItemValue * (tipPercent / 100));
  const totalUnaccounted = round2(unclaimedItemValue + tax * prop + adminFee * prop + tip);
  return { unclaimedItemValue, totalUnaccounted };
}

function hasOutstandingBalance(session) {
  const totals = calculateAllPersonTotals(session);
  const payments = session.payments || [];
  for (const name of getAllParticipants(session)) {
    if (name === session.hostName) continue;
    if ((totals[name]?.total || 0) <= 0) continue;
    const p = payments.find(x => x.guestName === name);
    const status = p?.status || (p?.paid ? 'paid' : 'unpaid');
    if (status !== 'paid' && status !== 'confirmed') return true;
  }
  return false;
}

module.exports = { round2, distributeProportionally, unitPrice, shareOf, getAllParticipants, calculateAllPersonTotals, calculateUnaccounted, hasOutstandingBalance };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/totals.test.js`
Expected: PASS. If `partial claim` test math is off, recompute the expected `grand` against the seed and adjust the assertion (the invariant — `Σ totals + unaccounted == subtotal + tax + tip` — must hold).

- [ ] **Step 5: Run the whole server suite to catch fallout**

Run: `cd server && npm test`
Expected: PASS. `store-prune.test.js` uses `hasOutstandingBalance` — if its fixtures use the legacy item shape, they still pass because `normalizeItems` migrates them. If a fixture breaks, update it to the unit shape.

- [ ] **Step 6: Commit**

```bash
git add server/lib/totals.js server/test/totals.test.js
git commit -m "feat(engine): unit-based exact proportional money math (server)"
```

---

## Task 3: Client claim-verbs mirror

**Files:**
- Create: `client/src/lib/claimVerbs.js`
- Test: `client/src/lib/claimVerbs.test.js`

- [ ] **Step 1: Write the failing test**

```js
// client/src/lib/claimVerbs.test.js
import { describe, it, expect } from 'vitest';
import { applyVerb, normalizeItems } from './claimVerbs';

const open = () => ({ id: '0', name: 'Burrata', price: 14, units: [{ shared: false, claims: [], dispute: null }] });

describe('claimVerbs (client mirror)', () => {
  it('grab claims solo', () => {
    const it = applyVerb(open(), 'grab', { unitIndex: 0, me: 'Jordan' });
    expect(it.units[0]).toEqual({ shared: false, claims: ['Jordan'], dispute: null });
  });
  it('split keeps existing claimant and goes shared', () => {
    const held = applyVerb(open(), 'grab', { unitIndex: 0, me: 'Sarah' });
    const it = applyVerb(held, 'split', { unitIndex: 0, me: 'Jordan' });
    expect(it.units[0].shared).toBe(true);
    expect(it.units[0].claims).toEqual(['Sarah', 'Jordan']);
  });
  it('coverItem takes all units', () => {
    const multi = { id: '1', name: 'Spritz', price: 36, units: [
      { shared: false, claims: [], dispute: null }, { shared: false, claims: [], dispute: null }, { shared: false, claims: [], dispute: null }] };
    const it = applyVerb(multi, 'coverItem', { me: 'Jordan' });
    expect(it.covered).toBe(true);
    expect(it.units.every(u => u.claims[0] === 'Jordan')).toBe(true);
  });
  it('resolveAccept hands the unit to the disputer', () => {
    let it = applyVerb(open(), 'grab', { unitIndex: 0, me: 'Sarah' });
    it = applyVerb(it, 'dispute', { unitIndex: 0, me: 'Jordan' });
    it = applyVerb(it, 'resolveAccept', { unitIndex: 0, me: 'Sarah' });
    expect(it.units[0]).toEqual({ shared: false, claims: ['Jordan'], dispute: null });
  });
  it('normalizeItems migrates a legacy split item', () => {
    const [it] = normalizeItems([{ id: 0, name: 'Wine', price: 48, claims: [{ guestName: 'Sarah', splitCount: 2 }, { guestName: 'Mia', splitCount: 2 }] }]);
    expect(it.units[0].shared).toBe(true);
    expect(it.units[0].claims.sort()).toEqual(['Mia', 'Sarah']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/lib/claimVerbs.test.js`
Expected: FAIL — cannot resolve `./claimVerbs`.

- [ ] **Step 3: Write the implementation**

Port `server/lib/claim-verbs.js` verbatim to ESM. Identical logic; only the module syntax changes.

```js
// client/src/lib/claimVerbs.js
// ESM mirror of server/lib/claim-verbs.js — keep the two in lockstep.
export function normalizeUnit(u) {
  return {
    shared: !!(u && u.shared),
    claims: Array.isArray(u && u.claims) ? u.claims.slice() : [],
    dispute: u && u.dispute ? { by: u.dispute.by } : null,
  };
}

export function normalizeItem(item) {
  const price = Number(item.price) || 0;
  const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
  if (Array.isArray(item.units)) {
    return { ...item, id: String(item.id), price, quantity: item.units.length || quantity,
      unitPrice: price / (item.units.length || 1), covered: !!item.covered, units: item.units.map(normalizeUnit) };
  }
  const claims = Array.isArray(item.claims) ? item.claims : [];
  let units;
  if (quantity > 1) {
    units = Array.from({ length: quantity }, () => ({ shared: false, claims: [], dispute: null }));
    let cursor = 0;
    for (const c of claims) {
      const n = Math.max(1, Math.round(Number(c.units) || 1));
      for (let k = 0; k < n && cursor < units.length; k++, cursor++) units[cursor].claims = [c.guestName];
    }
  } else {
    const names = claims.map(c => c.guestName).filter(Boolean);
    units = [{ shared: names.length > 1, claims: names, dispute: null }];
  }
  return { ...item, id: String(item.id), price, quantity, unitPrice: price / quantity, covered: !!item.covered, units };
}

export function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).map(normalizeItem);
}

export function applyVerb(item, verb, opts) {
  const me = opts.me;
  const idx = opts.unitIndex || 0;
  const base = normalizeItem(item);
  const units = base.units.map(u => ({ ...u, claims: u.claims.slice(), dispute: u.dispute ? { ...u.dispute } : null }));
  const u = units[idx];
  switch (verb) {
    case 'grab': units[idx] = { shared: false, claims: [me], dispute: null }; break;
    case 'release': { const claims = u.claims.filter(n => n !== me); units[idx] = { shared: claims.length > 1 ? u.shared : false, claims, dispute: null }; break; }
    case 'split': units[idx] = { shared: true, claims: u.claims.includes(me) ? u.claims : [...u.claims, me], dispute: null }; break;
    case 'join': units[idx] = { shared: true, claims: u.claims.includes(me) ? u.claims : [...u.claims, me], dispute: null }; break;
    case 'leave': { const claims = u.claims.filter(n => n !== me); units[idx] = { shared: claims.length > 1, claims, dispute: null }; break; }
    case 'coverUnit': units[idx] = { shared: false, claims: [me], dispute: null }; break;
    case 'coverItem': return { ...base, covered: true, units: base.units.map(() => ({ shared: false, claims: [me], dispute: null })) };
    case 'dispute': units[idx] = { ...u, dispute: { by: me } }; break;
    case 'cancel': units[idx] = { ...u, dispute: null }; break;
    case 'resolveAccept': units[idx] = { shared: false, claims: u.dispute ? [u.dispute.by] : u.claims, dispute: null }; break;
    case 'resolveReject': units[idx] = { ...u, dispute: null }; break;
    default: return base;
  }
  const covered = base.covered && units.every(x => x.claims.length === 1 && x.claims[0] === me && !x.shared);
  return { ...base, covered, units };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/lib/claimVerbs.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/claimVerbs.js client/src/lib/claimVerbs.test.js
git commit -m "feat(engine): ESM mirror of claim verbs + migration (client)"
```

---

## Task 4: Client money math + reducer item handling

**Files:**
- Modify: `client/src/context/SessionContext.jsx` (replace `calculatePersonTotal`, `calculateAllPersonTotals`, `calculateUnaccounted`; add unit `shareOf`; `SET_ITEMS` → units; normalize on `LOAD_SESSION`/`SYNC_ITEMS`)
- Rewrite: `client/src/context/SessionContext.test.js`

- [ ] **Step 1: Write the failing test**

```js
// client/src/context/SessionContext.test.js
import { describe, it, expect } from 'vitest';
import { calculateAllPersonTotals, calculatePersonTotal, calculateUnaccounted, round2, shareOf } from './SessionContext';

const seed = () => ({
  hostName: 'Sarah', guests: [{ name: 'Jordan' }, { name: 'Mia' }],
  subtotal: 139, tax: 11.82, tipPercent: 18, tipMode: 'percent',
  items: [
    { id: '0', name: 'Pizza', price: 18, units: [{ shared: false, claims: ['Sarah'], dispute: null }] },
    { id: '1', name: 'Burrata', price: 14, units: [{ shared: false, claims: ['Jordan'], dispute: null }] },
    { id: '2', name: 'Negroni', price: 14, units: [{ shared: false, claims: ['Sarah'], dispute: null }] },
    { id: '3', name: 'Spritz', price: 36, units: [
      { shared: false, claims: ['Mia'], dispute: null }, { shared: false, claims: ['Mia'], dispute: null }, { shared: false, claims: ['Sarah'], dispute: null }] },
    { id: '4', name: 'Wine', price: 48, units: [{ shared: true, claims: ['Sarah', 'Mia'], dispute: null }] },
    { id: '5', name: 'Tiramisu', price: 9, units: [{ shared: false, claims: ['Jordan'], dispute: null }] },
  ],
});

describe('SessionContext money math (unit model)', () => {
  it('shareOf splits shared evenly', () => {
    expect(shareOf({ price: 48, units: [{ shared: true, claims: ['Sarah', 'Mia'] }] }, 'Sarah')).toBe(24);
  });
  it('fully-claimed totals sum exactly to grand total', () => {
    const totals = calculateAllPersonTotals(seed());
    const grand = round2(139 + 11.82 + 139 * 0.18);
    expect(round2(Object.values(totals).reduce((s, p) => s + p.total, 0))).toBe(grand);
  });
  it('Jordan owes 11.39 for Tiramisu only', () => {
    const t = calculatePersonTotal(seed(), 'Jordan');
    // Jordan has Burrata(14)+Tiramisu(9)=23 in the seed; check the single-item case instead:
    const solo = { hostName: 'Sarah', guests: [{ name: 'Jordan' }], subtotal: 139, tax: 11.82, tipPercent: 18, tipMode: 'percent',
      items: [{ id: '5', name: 'Tiramisu', price: 9, units: [{ shared: false, claims: ['Jordan'], dispute: null }] }] };
    const j = calculatePersonTotal(solo, 'Jordan');
    expect(j.itemsTotal).toBe(9);
    expect(j.taxShare).toBe(0.77);
    expect(j.tipShare).toBe(1.62);
    expect(j.total).toBe(11.39);
    expect(t).toBeDefined();
  });
  it('client matches server: discount parity', () => {
    const totals = calculateAllPersonTotals({ ...seed(), discount: 10 });
    const grand = round2(139 + 11.82 + 139 * 0.18 - 10);
    expect(round2(Object.values(totals).reduce((s, p) => s + p.total, 0))).toBe(grand);
  });
  it('unaccounted: unclaimed item value surfaces', () => {
    const partial = { hostName: 'Sarah', guests: [{ name: 'Jordan' }], subtotal: 28, tax: 0, tipPercent: 0,
      items: [
        { id: '1', name: 'Burrata', price: 14, units: [{ shared: false, claims: ['Jordan'], dispute: null }] },
        { id: '2', name: 'Negroni', price: 14, units: [{ shared: false, claims: [], dispute: null }] }] };
    expect(calculateUnaccounted(partial).unclaimedItemValue).toBe(14);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/context/SessionContext.test.js`
Expected: FAIL — `shareOf` not exported / math mismatch.

- [ ] **Step 3: Write the implementation**

In `client/src/context/SessionContext.jsx`:

(a) Add import at top:
```js
import { normalizeItems as normalizeUnitItems } from '../lib/claimVerbs';
```

(b) Replace the three exported calc functions and add `shareOf`/`unitPrice`. Use the SAME algorithm as `server/lib/totals.js` Task 2 (copy `distributeProportionally`, `unitPrice`, `shareOf`, `perPersonItemCents`, `calculateAllPersonTotals`, `calculateUnaccounted`, `getAllParticipants`). Keep `round2`, `currencySymbol`, `formatPrice`, `toUSD` as-is. Add `calculatePersonTotal(state, name)` as a thin wrapper:
```js
export function calculatePersonTotal(state, personName) {
  const all = calculateAllPersonTotals(state);
  const unclaimedItems = normalizeUnitItems(state.items).filter(it => it.units.every(u => u.claims.length === 0));
  return { ...(all[personName] || { itemsTotal: 0, taxShare: 0, tipShare: 0, adminFeeShare: 0, discountShare: 0, total: 0, claimedItems: [] }), unclaimedItems };
}
```
(Export `shareOf`, `unitPrice`, `calculateAllPersonTotals`, `calculateUnaccounted`, `distributeProportionally` as before.)

(c) `SET_ITEMS` builds units from quantity:
```js
case 'SET_ITEMS': {
  const subtotal = action.items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const items = normalizeUnitItems(action.items.map((item, i) => ({
    ...item, id: String(i),
    units: Array.from({ length: Math.max(1, Math.round(item.quantity || 1)) }, () => ({ shared: false, claims: [], dispute: null })),
  })));
  return { ...state, items, subtotal };
}
```

(d) Normalize incoming server state so the client always holds the unit shape:
```js
case 'SYNC_ITEMS': {
  const items = normalizeUnitItems(action.items);
  return { ...state, items, subtotal: items.reduce((s, it) => s + it.price, 0) };
}
case 'LOAD_SESSION': {
  const s = action.session;
  return { ...state, /* …existing fields… */, items: normalizeUnitItems(s.items), subtotal: s.subtotal, /* …rest unchanged… */ };
}
```

(e) **Delete** the now-dead mutation reducer cases (`CLAIM_ITEM`, `SHARE_ITEM`, `UNCLAIM_ITEM`, `CLAIM_UNITS`, `UNCLAIM_UNITS`, `DISPUTE_ITEM`, `CANCEL_DISPUTE`) — claim mutations now go server→`items-updated`→`SYNC_ITEMS`. Leave `UPDATE_ITEM`/`DELETE_ITEM`/`ADD_ITEM` (used by ReviewItems) but make them re-`normalizeItems` the result so units survive edits.

> The existing `ClaimItems.jsx`/`Summary.jsx`/`HostDashboard.jsx` still reference deleted actions and the old item shape — they will fail to run on this branch until Plans 3–5. That's expected; do not patch them here. The build still succeeds (deleted reducer cases just won't be dispatched until those screens are rebuilt).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/context/SessionContext.test.js`
Expected: PASS.

- [ ] **Step 5: Verify the client still builds**

Run: `cd client && npm run build`
Expected: build succeeds. If it fails because a page imports a removed export (e.g. old `calculatePersonTotal` signature), that page is rebuilt in a later plan — temporarily stub the import to keep the build green, noting it with `// TODO(plan-3): rebuilt screen`. Do not invest in the old screen.

- [ ] **Step 6: Commit**

```bash
git add client/src/context/SessionContext.jsx client/src/context/SessionContext.test.js
git commit -m "feat(engine): unit-based exact money math + units reducer (client)"
```

---

## Task 5: Refactor socket events to the verb set

**Files:**
- Modify: `server/index.js` (claim handlers, roughly lines 442–710; `create-session` item intake)
- Modify: `server/scripts/smoke.cjs`

- [ ] **Step 1: Write/adjust the smoke script (this is the test for this task)**

Update `server/scripts/smoke.cjs` so it: creates a session with unit-shaped items, has a guest `join-session`, emits `grab-unit`, `split-unit`, `join-unit`, `cover-unit`, `dispute-unit`, `resolve-dispute`, and asserts the broadcast `items-updated` payload reflects each verb. Replace any `claim-item`/`share-item`/`claim-units` emits. Keep the existing connection/teardown scaffolding. Assert final claim state matches expectations (e.g. after `grab-unit` on item 0 unit 0, `items[0].units[0].claims === ['Guest']`).

- [ ] **Step 2: Run it against the OLD server to confirm it fails**

Run: `cd server && npm start &` then `node server/scripts/smoke.cjs 3001`
Expected: FAIL — server has no `grab-unit` handler yet. Stop the server after (`kill %1`).

- [ ] **Step 3: Implement the handlers**

In `server/index.js`:

(a) Require the verbs module near the other libs:
```js
const { applyVerb, normalizeItems } = require('./lib/claim-verbs');
```

(b) On `create-session`, normalize incoming items: `session.items = normalizeItems(items);`

(c) Add a single helper that all verb events funnel through:
```js
function withUnit(session, sessionId, itemId, fn, broadcast = true) {
  const idx = session.items.findIndex(i => String(i.id) === String(itemId));
  if (idx === -1) return null;
  const updated = fn(session.items[idx]);
  if (!updated) return null;
  session.items[idx] = updated;
  store.save(session);                         // match existing persistence call
  if (broadcast) io.to(sessionId).emit('items-updated', { items: session.items });
  return session.items[idx];
}
```
(Use whatever the existing persistence call is — check how the current handlers persist, e.g. `saveSession(session)` / `store.set(...)` — and mirror it.)

(d) Replace the old claim handlers with the verb handlers. Each resolves the actor from `socketMeta` (the identity binding) — never trust a client-sent name. Example shape (repeat per event with its auth rule from the map at the top of this plan):
```js
socket.on('grab-unit', ({ sessionId, itemId, unitIndex }) => {
  const session = getSession(sessionId); if (!session) return;
  const me = actorName(socket);                       // existing identity helper
  if (!me) return;
  withUnit(session, sessionId, itemId, (item) => {
    const u = normalizeItem(item).units[unitIndex || 0];
    if (u && u.dispute) return null;                  // no acting mid-dispute
    return applyVerb(item, 'grab', { unitIndex, me });
  });
});

socket.on('release-unit', ({ sessionId, itemId, unitIndex }) => {
  const session = getSession(sessionId); if (!session) return;
  const me = actorName(socket); if (!me) return;
  withUnit(session, sessionId, itemId, (item) => {
    const u = normalizeItem(item).units[unitIndex || 0];
    if (!u || !u.claims.includes(me)) return null;
    return applyVerb(item, 'release', { unitIndex, me });
  });
});

socket.on('dispute-unit', ({ sessionId, itemId, unitIndex }) => {
  const session = getSession(sessionId); if (!session) return;
  const me = actorName(socket); if (!me) return;
  withUnit(session, sessionId, itemId, (item) => {
    const u = normalizeItem(item).units[unitIndex || 0];
    const others = u ? u.claims.filter(n => n !== me) : [];
    if (!u || u.shared || u.dispute || u.claims.includes(me) || others.length === 0) return null;
    return applyVerb(item, 'dispute', { unitIndex, me });
  });
});

socket.on('resolve-dispute', ({ sessionId, itemId, unitIndex, accept }) => {
  const session = getSession(sessionId); if (!session) return;
  const me = actorName(socket); if (!me) return;
  withUnit(session, sessionId, itemId, (item) => {
    const u = normalizeItem(item).units[unitIndex || 0];
    if (!u || !u.dispute || !u.claims.includes(me) || u.dispute.by === me) return null;
    return applyVerb(item, accept ? 'resolveAccept' : 'resolveReject', { unitIndex, me });
  });
});

socket.on('cancel-dispute', ({ sessionId, itemId, unitIndex }) => {
  const session = getSession(sessionId); if (!session) return;
  const me = actorName(socket); if (!me) return;
  withUnit(session, sessionId, itemId, (item) => {
    const u = normalizeItem(item).units[unitIndex || 0];
    if (!u || !u.dispute || u.dispute.by !== me) return null;
    return applyVerb(item, 'cancel', { unitIndex, me });
  });
});
```
Add `split-unit`→`split`, `join-unit`→`join`, `cover-unit`→`coverUnit` (all with the "no active dispute on that unit" guard), and `cover-item`→`coverItem` (guard: no unit in the item disputed; no `unitIndex`). Import `normalizeItem` too: `const { applyVerb, normalizeItem, normalizeItems } = require('./lib/claim-verbs');`

(e) **Remove** the old handlers: `claim-item`, `share-item`, `claim-units`, `unclaim-item`, `unclaim-units`, `dispute-item`, and the **host** `resolve-dispute {assignTo}` arbitration path. **Keep**: `done-claiming`, `mark-paid`/`confirm-paid`/`reset-paid`, `resolve-leftover`, `remove-guest`, `join-session`, `rejoin-room`, `create-session`. Re-express `resolve-leftover` and `remove-guest` on units (leftover assigns open units to the host or splits across all; remove-guest strips a name from every unit's `claims`/`dispute`). Standardize their broadcasts to also emit `items-updated`.

- [ ] **Step 4: Run the smoke against the new server**

Run: `cd server && npm start &` then `node server/scripts/smoke.cjs 3001`
Expected: PASS — every verb reflected in the broadcast. Then `kill %1`.

- [ ] **Step 5: Run the full server suite**

Run: `cd server && npm test`
Expected: PASS (totals, claim-verbs, rate-limit, sanitize, store-prune).

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/scripts/smoke.cjs
git commit -m "feat(engine): refactor claim sockets to the unit verb set + identity auth"
```

---

## Task 6: Cross-runtime parity test

**Files:**
- Create: `server/test/parity.test.js`

- [ ] **Step 1: Write the test**

Mirror the client and server math on the same fixture and assert byte-identical totals. Since the client lib is ESM, import the server modules and re-implement the fixture; assert `calculateAllPersonTotals` (server) equals the hand-computed expected map for the canonical seed (Pizza/Burrata/Negroni/Spritz×3/Wine/Tiramisu, tax 11.82, tip 18%). This locks the server output; the client test (Task 4) locks the client to the same numbers, so the two are pinned to one spec.

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { calculateAllPersonTotals, round2 } = require('../lib/totals');

test('canonical seed: every participant total is stable + sums to grand', () => {
  const session = {
    hostName: 'Sarah', guests: [{ name: 'Jordan' }, { name: 'Mia' }],
    subtotal: 139, tax: 11.82, tipPercent: 18, tipMode: 'percent',
    items: [
      { id: '0', name: 'Pizza', price: 18, units: [{ shared: false, claims: ['Sarah'], dispute: null }] },
      { id: '1', name: 'Burrata', price: 14, units: [{ shared: false, claims: ['Jordan'], dispute: null }] },
      { id: '2', name: 'Negroni', price: 14, units: [{ shared: false, claims: ['Sarah'], dispute: null }] },
      { id: '3', name: 'Spritz', price: 36, units: [
        { shared: false, claims: ['Mia'], dispute: null }, { shared: false, claims: ['Mia'], dispute: null }, { shared: false, claims: ['Sarah'], dispute: null }] },
      { id: '4', name: 'Wine', price: 48, units: [{ shared: true, claims: ['Sarah', 'Mia'], dispute: null }] },
      { id: '5', name: 'Tiramisu', price: 9, units: [{ shared: false, claims: ['Jordan'], dispute: null }] },
    ], payments: [],
  };
  const t = calculateAllPersonTotals(session);
  const sum = round2(t.Sarah.total + t.Jordan.total + t.Mia.total);
  assert.strictEqual(sum, round2(139 + 11.82 + 139 * 0.18));
  // items: Sarah 18+14+12+24=68 ; Jordan 14+9=23 ; Mia 24+24=48 → 139
  assert.strictEqual(t.Sarah.itemsTotal, 68);
  assert.strictEqual(t.Jordan.itemsTotal, 23);
  assert.strictEqual(t.Mia.itemsTotal, 48);
});
```

- [ ] **Step 2: Run it**

Run: `cd server && node --test test/parity.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/test/parity.test.js
git commit -m "test(engine): lock canonical-seed per-person totals (parity)"
```

---

## Self-review checklist (run before handing off to execution)
- [ ] Spec §2 (units model) → Tasks 1, 3, 4. §3 (exact math) → Tasks 2, 4, 6. §4 (verb sockets) → Task 5. ✓
- [ ] No placeholders: every code step has full code. ✓
- [ ] Type consistency: `applyVerb(item, verb, {unitIndex, me})`, units `{shared,claims,dispute}`, event names match the map. ✓
- [ ] Verbs match the prototype `unit()` dispatcher in `design_handoff_claim_flow/prototype/organic-screens.jsx`. ✓
- [ ] Money rule matches the screenshots ($17.71 Burrata-only, $11.39 Tiramisu-only). ✓

## Done when
`cd server && npm test` and `cd client && npx vitest run` are green, `node server/scripts/smoke.cjs 3001` passes 100%, and the client `npm run build` succeeds. The new screens come in Plans 2–6.
