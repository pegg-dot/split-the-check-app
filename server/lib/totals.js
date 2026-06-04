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
  const discount = session.discount || 0;
  const tipIncluded = session.tipIncluded;
  const tipAmount = session.tipAmount || 0;
  const tipMode = session.tipMode || 'percent';
  const tipPercent = Math.max(0, session.tipPercent || 0);
  const tipDollar = Math.max(0, session.tipDollar || 0);

  // Match calculateAllPersonTotals exactly: round each item's claimed value to
  // cents BEFORE summing (that function distributes per-item rounded values), so
  // the two agree on claimedSubtotal even when a unit price isn't a whole cent.
  let claimedCents = 0;
  for (const item of items) {
    const up = item.price / (item.units.length || 1);
    const claimedUnits = item.units.filter(u => u.claims.length > 0).length;
    if (claimedUnits === 0) continue;
    claimedCents += Math.round(round2(up * claimedUnits) * 100);
  }
  const claimedSubtotal = claimedCents / 100;
  const unclaimedItemValue = round2(Math.max(0, subtotal - claimedSubtotal));
  const scale = subtotal > 0 ? claimedSubtotal / subtotal : 0;

  // Each unaccounted fee is the EXACT complement of the chargeable portion that
  // calculateAllPersonTotals bills to claimants — so the two reconcile to the cent.
  const unTax = round2(tax - round2(tax * scale));
  const unAdmin = round2(adminFee - round2(adminFee * scale));
  const unDiscount = round2(discount - round2(discount * scale));
  const unIncludedTip = tipIncluded ? round2(tipAmount - round2(tipAmount * scale)) : 0;
  let unAddTip;
  if (tipMode === 'dollar') unAddTip = round2(tipDollar - round2(tipDollar * scale));
  else if (tipPercent > 0) unAddTip = round2(round2(subtotal * (tipPercent / 100)) - round2(claimedSubtotal * (tipPercent / 100)));
  else unAddTip = 0;

  const totalUnaccounted = round2(unclaimedItemValue + unTax + unAdmin + unIncludedTip + unAddTip - unDiscount);
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
