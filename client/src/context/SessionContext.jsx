import { createContext, useContext, useReducer, useEffect } from 'react';
import { normalizeItems } from '../lib/claimVerbs';

const SessionContext = createContext(null);

// Persist the in-progress split so a host doesn't lose everything on refresh
// (the receipt lives only in React memory otherwise). Guest pages re-fetch
// authoritative state from the server on mount, so this is mainly a host safety net.
const PERSIST_KEY = 'stc_state_v1';
const PERSIST_TTL_MS = 12 * 60 * 60 * 1000; // ignore anything older than 12h

const initialState = {
  // Host info
  hostName: '',
  venmoHandle: '',
  paypalHandle: '', // optional PayPal.me username
  cashtag: '',      // optional Cash App $cashtag
  hostDisplayName: null, // verified Venmo display name

  // Receipt items from AI
  items: [], // { id, name, price, units: [{ shared, claims: [name], dispute }], covered?, quantity, unitPrice }

  // Tip & tax (host sets tip for the whole table)
  subtotal: 0,
  tax: 0,
  tipPercent: 18,
  tipMode: 'percent',  // 'percent' or 'dollar'
  tipDollar: 0,        // flat dollar tip amount (when tipMode is 'dollar')
  tipIncluded: false,  // true if receipt already has gratuity
  tipAmount: 0,        // pre-included tip amount from receipt
  adminFee: 0,         // admin/service fee from receipt
  discount: 0,         // comps/promos/coupons (positive), reduces the bill

  // Currency + exchange rate to USD
  currency: 'USD',
  exchangeRate: 1,
  taxNote: '', // e.g. "Tax included in item prices"
  receiptTotal: 0, // printed grand total from the scan (for reconciliation)

  // Session
  sessionId: null,
  guests: [], // { name, joinedAt }

  // Current user
  currentUser: null, // null = host hasn't started, or { name, isHost }

  // Payment tracking
  payments: [], // { guestName, amount, paid: bool }
};

function sessionReducer(state, action) {
  switch (action.type) {
    case 'SET_HOST': {
      return { ...state, hostName: action.name, venmoHandle: action.venmoHandle, paypalHandle: action.paypalHandle ?? state.paypalHandle, cashtag: action.cashtag ?? state.cashtag, hostDisplayName: action.hostDisplayName ?? state.hostDisplayName, currentUser: { name: action.name, isHost: true } };
    }
    case 'RESET': {
      // Start a brand-new split (clears the persisted in-progress one).
      return { ...initialState };
    }
    case 'SET_ITEMS': {
      const subtotal = action.items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
      const items = normalizeItems(action.items.map((item, i) => ({
        ...item, id: String(i),
        units: Array.from({ length: Math.max(1, Math.round(item.quantity || 1)) }, () => ({ shared: false, claims: [], dispute: null })),
      })));
      return { ...state, items, subtotal };
    }
    case 'UPDATE_ITEM': {
      const items = normalizeItems(state.items.map(item => item.id === action.id ? { ...item, ...action.updates } : item));
      const subtotal = items.reduce((sum, item) => sum + item.price, 0);
      return { ...state, items, subtotal };
    }
    case 'DELETE_ITEM': {
      const items = normalizeItems(state.items.filter(item => item.id !== action.id));
      const subtotal = items.reduce((sum, item) => sum + item.price, 0);
      return { ...state, items, subtotal };
    }
    case 'ADD_ITEM': {
      const numericIds = state.items.map(i => Number(i.id)).filter(n => !Number.isNaN(n));
      const newId = String((numericIds.length ? Math.max(...numericIds) : -1) + 1);
      const qty = Math.max(1, Math.round(action.quantity || 1));
      // No `units` field → normalizeItems builds `qty` open units from quantity.
      const items = normalizeItems([...state.items, { id: newId, name: action.name, price: action.price, quantity: qty }]);
      const subtotal = items.reduce((sum, item) => sum + item.price, 0);
      return { ...state, items, subtotal };
    }
    case 'SET_TAX': {
      return { ...state, tax: action.tax, taxNote: action.taxNote || '' };
    }
    case 'SET_TIP_PERCENT': {
      return { ...state, tipPercent: action.percent };
    }
    case 'SET_TIP_MODE': {
      return { ...state, tipMode: action.mode };
    }
    case 'SET_TIP_DOLLAR': {
      return { ...state, tipDollar: action.amount };
    }
    case 'SET_TIP_INCLUDED': {
      return { ...state, tipIncluded: action.tipIncluded, tipAmount: action.tipAmount || 0 };
    }
    case 'SET_ADMIN_FEE': {
      return { ...state, adminFee: action.adminFee };
    }
    case 'SET_SCAN_EXTRAS': {
      // Discount + printed receipt total captured from the scan.
      return {
        ...state,
        discount: action.discount || 0,
        receiptTotal: action.receiptTotal || 0,
      };
    }
    case 'SET_CURRENCY': {
      return { ...state, currency: action.currency || 'USD', exchangeRate: action.exchangeRate || 1 };
    }
    case 'SET_SESSION_ID': {
      return { ...state, sessionId: action.sessionId };
    }
    case 'JOIN_SESSION': {
      return {
        ...state,
        currentUser: { name: action.name, isHost: false },
        guests: [...state.guests, { name: action.name, joinedAt: Date.now() }],
      };
    }
    case 'MARK_PAID': {
      // Optimistic guest-asserted payment (server is authoritative via SYNC_PAYMENTS).
      const status = action.status || 'paid';
      const exists = state.payments.some(p => p.guestName === action.guestName);
      const payments = exists
        ? state.payments.map(p => p.guestName === action.guestName ? { ...p, paid: status !== 'unpaid', status } : p)
        : [...state.payments, { guestName: action.guestName, amount: 0, paid: status !== 'unpaid', status }];
      return { ...state, payments };
    }
    case 'SET_PAYMENTS': {
      return { ...state, payments: action.payments };
    }
    case 'LOAD_SESSION': {
      const s = action.session;
      return {
        ...state,
        hostName: s.hostName,
        venmoHandle: s.venmoHandle,
        paypalHandle: s.paypalHandle || '',
        cashtag: s.cashtag || '',
        hostDisplayName: s.hostDisplayName || null,
        items: normalizeItems(s.items),
        subtotal: s.subtotal,
        tax: s.tax,
        tipPercent: s.tipPercent ?? 18,
        tipMode: s.tipMode || 'percent',
        tipDollar: s.tipDollar || 0,
        tipIncluded: s.tipIncluded || false,
        tipAmount: s.tipAmount || 0,
        adminFee: s.adminFee || 0,
        discount: s.discount || 0,
        currency: s.currency || 'USD',
        exchangeRate: s.exchangeRate || 1,
        receiptTotal: s.receiptTotal || 0,
        sessionId: s.id,
        guests: s.guests,
        payments: s.payments || [],
      };
    }
    case 'SYNC_ITEMS': {
      const items = normalizeItems(action.items);
      return { ...state, items, subtotal: items.reduce((s, it) => s + it.price, 0) };
    }
    case 'SYNC_GUESTS': {
      return { ...state, guests: action.guests };
    }
    case 'SYNC_PAYMENTS': {
      return { ...state, payments: action.payments };
    }
    default:
      return state;
  }
}

// Round to exactly 2 decimal places, eliminating floating point drift
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Ported verbatim from server/lib/totals.js — keep in lockstep ─────────────

export function distributeProportionally(total, weights) {
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

export function unitPrice(item) { return item.price / (item.units.length || 1); }

export function shareOf(item, name) {
  const up = unitPrice(item);
  return (item.units || []).reduce((s, u) => s + (u.claims.includes(name) ? up / u.claims.length : 0), 0);
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

export function calculateAllPersonTotals(state) {
  const items = normalizeItems(state.items);
  const subtotal = state.subtotal || 0;
  const names = getAllParticipants(state);
  const blank = { itemsTotal: 0, taxShare: 0, tipShare: 0, adminFeeShare: 0, discountShare: 0, total: 0, claimedItems: [] };
  if (!subtotal || names.length === 0) return Object.fromEntries(names.map(n => [n, { ...blank }]));

  const tax = state.tax || 0;
  const adminFee = state.adminFee || 0;
  const discount = state.discount || 0;
  const tipMode = state.tipMode || 'percent';
  const tipPercent = Math.max(0, state.tipPercent || 0);
  const tipDollar = Math.max(0, state.tipDollar || 0);
  const tipIncluded = state.tipIncluded;
  const tipAmount = state.tipAmount || 0;

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

export function calculatePersonTotal(state, personName) {
  const all = calculateAllPersonTotals(state);
  const items = normalizeItems(state.items);
  const unclaimedItems = items.filter(it => it.units.every(u => u.claims.length === 0));
  const base = all[personName] || { itemsTotal: 0, taxShare: 0, tipShare: 0, adminFeeShare: 0, discountShare: 0, total: 0, claimedItems: [] };
  return { ...base, unclaimedItems };
}

// Currency symbol for a given ISO code
export function currencySymbol(code) {
  const map = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF ', CNY: '¥', INR: '₹', MXN: 'MX$' };
  return map[code] || `${code} `;
}

// Format a price in the session's currency — always exactly 2dp, never NaN
export function formatPrice(amount, currency = 'USD') {
  const sym = currencySymbol(currency);
  const safe = isFinite(amount) ? round2(amount) : 0;
  return `${sym}${safe.toFixed(2)}`;
}

// Convert from session currency to USD (for Venmo)
export function toUSD(amount, exchangeRate = 1) {
  return round2(Math.max(0, amount) * Math.max(0, exchangeRate || 1));
}

export function getAllParticipants(state) {
  const names = new Set();
  if (state.hostName) names.add(state.hostName);
  for (const guest of (state.guests || [])) names.add(guest.name);
  return Array.from(names);
}

// The dollar value of the bill that NOBODY has claimed (fully or partially).
// This is the amount the host silently eats unless it's surfaced — the
// "money truth" number. We WARN with this; we do not change how splits divide.
// Ported verbatim from server/lib/totals.js — keep in lockstep.
export function calculateUnaccounted(state) {
  const items = normalizeItems(state.items);
  const subtotal = state.subtotal || 0;
  if (!subtotal) return { unclaimedItemValue: 0, totalUnaccounted: 0 };
  const tax = state.tax || 0;
  const adminFee = state.adminFee || 0;
  const discount = state.discount || 0;
  const tipIncluded = state.tipIncluded;
  const tipAmount = state.tipAmount || 0;
  const tipMode = state.tipMode || 'percent';
  const tipPercent = Math.max(0, state.tipPercent || 0);
  const tipDollar = Math.max(0, state.tipDollar || 0);

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

// ── localStorage persistence (host refresh safety net) ──────────────────────
function loadPersisted() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const { savedAt, state } = JSON.parse(raw);
    if (!savedAt || Date.now() - savedAt > PERSIST_TTL_MS) return null;
    return state;
  } catch { return null; }
}

function persist(state) {
  try {
    // Don't bother persisting an empty/fresh state.
    if (!state.hostName && !state.sessionId && (!state.items || state.items.length === 0)) {
      localStorage.removeItem(PERSIST_KEY);
      return;
    }
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ savedAt: Date.now(), state }));
  } catch { /* quota / private mode — ignore */ }
}

export function SessionProvider({ children }) {
  const [state, dispatch] = useReducer(sessionReducer, initialState, (init) => {
    return { ...init, ...(loadPersisted() || {}) };
  });

  useEffect(() => { persist(state); }, [state]);

  return (
    <SessionContext.Provider value={{ state, dispatch }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within SessionProvider');
  return context;
}
