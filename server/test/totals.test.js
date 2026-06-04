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
      { id: '2', name: 'Negroni', price: 14, units: [{ shared: false, claims: [], dispute: null }] },
    ],
    payments: [],
  };
  const totals = calculateAllPersonTotals(partial);
  const { totalUnaccounted } = calculateUnaccounted(partial);
  const grand = round2(partial.subtotal + partial.tax + partial.subtotal * 0.18);
  const sum = round2(Object.values(totals).reduce((s, p) => s + p.total, 0) + totalUnaccounted);
  assert.strictEqual(sum, grand);
  assert.strictEqual(totals.Jordan.itemsTotal, 14);
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

test('partial claim WITH discount reconciles exactly (Σtotals + unaccounted == grand)', () => {
  const s = {
    hostName: 'Sarah', guests: [{ name: 'Jordan' }],
    subtotal: 30, tax: 0, tipPercent: 0, discount: 9,
    items: [{ id: '0', name: 'Platter', price: 30, units: [
      { shared: false, claims: ['Jordan'], dispute: null },
      { shared: false, claims: [], dispute: null },
      { shared: false, claims: [], dispute: null },
    ] }],
    payments: [],
  };
  const totals = calculateAllPersonTotals(s);
  const { totalUnaccounted } = calculateUnaccounted(s);
  const grand = round2(30 - 9);
  const sum = round2(Object.values(totals).reduce((a, p) => a + p.total, 0) + totalUnaccounted);
  assert.strictEqual(sum, grand);
});

test('partial claim percent tip reconciles to the cent (no double-round drift)', () => {
  const s = {
    hostName: 'Sarah', guests: [{ name: 'Jordan' }],
    subtotal: 33.33, tax: 0, tipPercent: 15, tipMode: 'percent',
    items: [{ id: '0', name: 'Thing', price: 33.33, units: [
      { shared: false, claims: ['Jordan'], dispute: null },
      { shared: false, claims: [], dispute: null },
      { shared: false, claims: [], dispute: null },
    ] }],
    payments: [],
  };
  const totals = calculateAllPersonTotals(s);
  const { totalUnaccounted } = calculateUnaccounted(s);
  const grand = round2(33.33 + 33.33 * 0.15);
  const sum = round2(Object.values(totals).reduce((a, p) => a + p.total, 0) + totalUnaccounted);
  assert.strictEqual(sum, grand);
});
