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
