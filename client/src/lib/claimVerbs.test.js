// client/src/lib/claimVerbs.test.js
import { describe, it, expect } from 'vitest';
import { applyVerb, normalizeItems, normalizeUnit } from './claimVerbs';

const open = () => ({ id: '0', name: 'Burrata', price: 14, units: [{ shared: false, claims: [], dispute: null }] });
const multi = () => ({ id: '1', name: 'Spritz', price: 36, units: [
  { shared: false, claims: [], dispute: null },
  { shared: false, claims: [], dispute: null },
  { shared: false, claims: [], dispute: null },
] });

describe('claimVerbs (client mirror)', () => {
  it('grab claims solo', () => {
    expect(applyVerb(open(), 'grab', { unitIndex: 0, me: 'Jordan' }).units[0]).toEqual({ shared: false, claims: ['Jordan'], dispute: null });
  });
  it('release collapses shared at <=1', () => {
    let it = applyVerb(open(), 'split', { unitIndex: 0, me: 'Jordan' });
    it = applyVerb(it, 'join', { unitIndex: 0, me: 'Mia' });
    it = applyVerb(it, 'release', { unitIndex: 0, me: 'Jordan' });
    expect(it.units[0]).toEqual({ shared: false, claims: ['Mia'], dispute: null });
  });
  it('split keeps existing claimant and goes shared', () => {
    const held = applyVerb(open(), 'grab', { unitIndex: 0, me: 'Sarah' });
    const it = applyVerb(held, 'split', { unitIndex: 0, me: 'Jordan' });
    expect(it.units[0].shared).toBe(true);
    expect(it.units[0].claims).toEqual(['Sarah', 'Jordan']);
  });
  it('join is idempotent', () => {
    let it = applyVerb(open(), 'split', { unitIndex: 0, me: 'Sarah' });
    it = applyVerb(it, 'join', { unitIndex: 0, me: 'Jordan' });
    it = applyVerb(it, 'join', { unitIndex: 0, me: 'Jordan' });
    expect(it.units[0].claims).toEqual(['Sarah', 'Jordan']);
  });
  it('leave drops shared at one claimant', () => {
    let it = applyVerb(open(), 'split', { unitIndex: 0, me: 'Sarah' });
    it = applyVerb(it, 'join', { unitIndex: 0, me: 'Jordan' });
    it = applyVerb(it, 'leave', { unitIndex: 0, me: 'Jordan' });
    expect(it.units[0]).toEqual({ shared: false, claims: ['Sarah'], dispute: null });
  });
  it('coverUnit takes the unit, drops others', () => {
    let it = applyVerb(open(), 'split', { unitIndex: 0, me: 'Sarah' });
    it = applyVerb(it, 'join', { unitIndex: 0, me: 'Mia' });
    it = applyVerb(it, 'coverUnit', { unitIndex: 0, me: 'Jordan' });
    expect(it.units[0]).toEqual({ shared: false, claims: ['Jordan'], dispute: null });
  });
  it('coverItem takes all units and sets covered', () => {
    const it = applyVerb(multi(), 'coverItem', { me: 'Jordan' });
    expect(it.covered).toBe(true);
    expect(it.units.every(u => u.claims[0] === 'Jordan' && u.claims.length === 1)).toBe(true);
  });
  it('dispute → resolveAccept hands over; resolveReject clears', () => {
    const held = applyVerb(open(), 'grab', { unitIndex: 0, me: 'Sarah' });
    const disp = applyVerb(held, 'dispute', { unitIndex: 0, me: 'Jordan' });
    expect(disp.units[0].dispute).toEqual({ by: 'Jordan' });
    expect(applyVerb(disp, 'resolveAccept', { unitIndex: 0, me: 'Sarah' }).units[0]).toEqual({ shared: false, claims: ['Jordan'], dispute: null });
    expect(applyVerb(disp, 'resolveReject', { unitIndex: 0, me: 'Sarah' }).units[0]).toEqual({ shared: false, claims: ['Sarah'], dispute: null });
  });
  it('cancel clears the dispute', () => {
    const held = applyVerb(open(), 'grab', { unitIndex: 0, me: 'Sarah' });
    const disp = applyVerb(held, 'dispute', { unitIndex: 0, me: 'Jordan' });
    expect(applyVerb(disp, 'cancel', { unitIndex: 0, me: 'Jordan' }).units[0].dispute).toBe(null);
  });
  it('out-of-range unitIndex is a no-op', () => {
    const out = applyVerb(multi(), 'grab', { unitIndex: 9, me: 'Jordan' });
    expect(out.units.length).toBe(3);
    expect(out.units.every(u => u.claims.length === 0)).toBe(true);
  });
  it('missing me is a no-op', () => {
    expect(applyVerb(open(), 'grab', { unitIndex: 0 }).units[0]).toEqual({ shared: false, claims: [], dispute: null });
  });
  it('does not mutate input', () => {
    const it = open();
    const before = JSON.stringify(it);
    applyVerb(it, 'grab', { unitIndex: 0, me: 'Jordan' });
    expect(JSON.stringify(it)).toBe(before);
  });
  it('normalizeItems migrates a legacy split item', () => {
    const [it] = normalizeItems([{ id: 0, name: 'Wine', price: 48, claims: [{ guestName: 'Sarah', splitCount: 2 }, { guestName: 'Mia', splitCount: 2 }] }]);
    expect(it.units[0].shared).toBe(true);
    expect(it.units[0].claims.sort()).toEqual(['Mia', 'Sarah']);
    expect(it.claims).toBeUndefined();
  });
  it('normalizeItems migrates a legacy quantity item to N units', () => {
    const [it] = normalizeItems([{ id: 1, name: 'Spritz', price: 36, quantity: 3, unitPrice: 12, claims: [{ guestName: 'Jordan', units: 2 }] }]);
    expect(it.units.length).toBe(3);
    expect(it.units.filter(u => u.claims.includes('Jordan')).length).toBe(2);
  });
  it('normalizeUnit coerces null to an open unit', () => {
    expect(normalizeUnit(null)).toEqual({ shared: false, claims: [], dispute: null });
  });
});
