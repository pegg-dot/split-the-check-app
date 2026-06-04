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
  const { claims: _legacyClaims, ...rest } = item;
  const price = Number(item.price) || 0;
  const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));

  if (Array.isArray(item.units) && item.units.length > 0) {
    return {
      ...rest,
      id: String(item.id),
      price,
      quantity: item.units.length,
      unitPrice: price / item.units.length,
      covered: !!item.covered,
      units: item.units.map(normalizeUnit),
    };
  }

  // Legacy migration (or empty/absent units).
  const claims = Array.isArray(item.claims) ? item.claims : [];
  let units;
  if (quantity > 1) {
    units = Array.from({ length: quantity }, () => ({ shared: false, claims: [], dispute: null }));
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
    ...rest,
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
  const me = opts && opts.me;
  const idx = (opts && opts.unitIndex) || 0;
  const base = normalizeItem(item);
  if (!me) return base;

  // coverItem acts on the whole item and ignores unitIndex.
  if (verb === 'coverItem') {
    return { ...base, covered: true, units: base.units.map(() => ({ shared: false, claims: [me], dispute: null })) };
  }

  // Every other verb targets one unit; ignore out-of-range indices.
  if (idx < 0 || idx >= base.units.length) return base;

  const units = base.units.map(u => ({ ...u, claims: u.claims.slice(), dispute: u.dispute ? { ...u.dispute } : null }));
  const u = units[idx];

  switch (verb) {
    case 'grab': units[idx] = { shared: false, claims: [me], dispute: null }; break;
    case 'release': { const claims = u.claims.filter(n => n !== me); units[idx] = { shared: claims.length > 1 ? u.shared : false, claims, dispute: null }; break; }
    case 'split': units[idx] = { shared: true, claims: u.claims.includes(me) ? u.claims : [...u.claims, me], dispute: null }; break;
    case 'join': units[idx] = { shared: true, claims: u.claims.includes(me) ? u.claims : [...u.claims, me], dispute: null }; break;
    case 'leave': { const claims = u.claims.filter(n => n !== me); units[idx] = { shared: claims.length > 1, claims, dispute: null }; break; }
    case 'coverUnit': units[idx] = { shared: false, claims: [me], dispute: null }; break;
    case 'dispute': units[idx] = { ...u, dispute: { by: me } }; break;
    case 'cancel': units[idx] = { ...u, dispute: null }; break;
    case 'resolveAccept': units[idx] = { shared: false, claims: u.dispute ? [u.dispute.by] : u.claims, dispute: null }; break;
    case 'resolveReject': units[idx] = { ...u, dispute: null }; break;
    default: return base;
  }
  // `covered` only stays true while every unit is still solely the coverer.
  const covered = base.covered && units.every(x => x.claims.length === 1 && x.claims[0] === me && !x.shared);
  return { ...base, covered, units };
}

module.exports = { normalizeUnit, normalizeItem, normalizeItems, applyVerb };
