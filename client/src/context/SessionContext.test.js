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
    const solo = { hostName: 'Sarah', guests: [{ name: 'Jordan' }], subtotal: 139, tax: 11.82, tipPercent: 18, tipMode: 'percent',
      items: [{ id: '5', name: 'Tiramisu', price: 9, units: [{ shared: false, claims: ['Jordan'], dispute: null }] }] };
    const j = calculatePersonTotal(solo, 'Jordan');
    expect(j.itemsTotal).toBe(9);
    expect(j.taxShare).toBe(0.77);
    expect(j.tipShare).toBe(1.62);
    expect(j.total).toBe(11.39);
  });
  it('discount parity', () => {
    const totals = calculateAllPersonTotals({ ...seed(), discount: 10 });
    const grand = round2(139 + 11.82 + 139 * 0.18 - 10);
    expect(round2(Object.values(totals).reduce((s, p) => s + p.total, 0))).toBe(grand);
  });
  it('unaccounted: unclaimed item value surfaces; reconciles', () => {
    const partial = { hostName: 'Sarah', guests: [{ name: 'Jordan' }], subtotal: 28, tax: 0, tipPercent: 0,
      items: [
        { id: '1', name: 'Burrata', price: 14, units: [{ shared: false, claims: ['Jordan'], dispute: null }] },
        { id: '2', name: 'Negroni', price: 14, units: [{ shared: false, claims: [], dispute: null }] }] };
    expect(calculateUnaccounted(partial).unclaimedItemValue).toBe(14);
    const totals = calculateAllPersonTotals(partial);
    const sum = round2(Object.values(totals).reduce((s, p) => s + p.total, 0) + calculateUnaccounted(partial).totalUnaccounted);
    expect(sum).toBe(28);
  });
  it('calculatePersonTotal returns unclaimedItems', () => {
    const partial = { hostName: 'Sarah', guests: [{ name: 'Jordan' }], subtotal: 28, tax: 0, tipPercent: 0,
      items: [
        { id: '1', name: 'Burrata', price: 14, units: [{ shared: false, claims: ['Jordan'], dispute: null }] },
        { id: '2', name: 'Negroni', price: 14, units: [{ shared: false, claims: [], dispute: null }] }] };
    expect(calculatePersonTotal(partial, 'Jordan').unclaimedItems.length).toBe(1);
  });
});
