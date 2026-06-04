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
