import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession, formatPrice as fmtPrice, currencySymbol, round2 } from '../context/SessionContext';
import { socket } from '../context/socket';
import { recordSplit } from '../lib/history';
import { Icon, Button } from '../components/ui';

const TIP_PRESETS = [0, 15, 18, 20];

// One page = the whole bill. Items, subtotal, tax, fees, and the tip all live
// in a single receipt-style card; tip controls sit compactly underneath. The
// final CTA creates the session and shows the QR — there is no separate page.
export default function ReviewItems() {
  const navigate = useNavigate();
  const { state, dispatch } = useSession();

  // ── item editing ──────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName]   = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty]     = useState(1);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');

  // ── fees (tax / service / gratuity / discount) ──────────────────────────
  // The AI sets taxNote (and tax = 0) only when tax is baked into the item
  // prices (European VAT-style). In that case we show a small "included" note
  // instead of an editable Tax line.
  const taxInPrices = !!state.taxNote;
  const [fees, setFees] = useState(() => {
    const list = [];
    let nextId = 1;
    if (!taxInPrices) {
      list.push({ id: nextId++, type: 'tax', label: 'Tax', amount: (Number(state.tax) || 0).toFixed(2) });
    }
    if (state.adminFee > 0) list.push({ id: nextId++, type: 'admin', label: 'Service Charge', amount: state.adminFee.toFixed(2) });
    if (state.tipIncluded && state.tipAmount > 0) list.push({ id: nextId++, type: 'gratuity', label: 'Gratuity', amount: state.tipAmount.toFixed(2), detected: true });
    if (state.discount > 0) list.push({ id: nextId++, type: 'discount', label: 'Discount', amount: state.discount.toFixed(2), detected: true });
    return list;
  });
  const [editingFeeId, setEditingFeeId] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  // ── tip ─────────────────────────────────────────────────────────────────
  const tipMode = state.tipMode || 'percent';
  const [isCustom, setIsCustom] = useState(false);
  const [customTip, setCustomTip] = useState('');
  const [dollarInput, setDollarInput] = useState(state.tipDollar > 0 ? state.tipDollar.toFixed(2) : '');

  const currency = state.currency || 'USD';
  const formatPrice = (p) => fmtPrice(p, currency);
  const curSym = currencySymbol(currency);

  // Generate a session id up front so the QR is ready the moment they tap.
  useEffect(() => {
    if (!state.sessionId) {
      const id = Math.random().toString(36).substring(2, 12);
      dispatch({ type: 'SET_SESSION_ID', sessionId: id });
    }
  }, [state.sessionId, dispatch]);
  const sessionId = state.sessionId;

  // ── grouped item display ──────────────────────────────────────────────
  const groupedItems = useMemo(() => {
    const groups = [];
    const map = new Map();
    for (const item of state.items) {
      if ((item.quantity || 1) > 1) {
        groups.push({ name: item.name, price: item.price, count: item.quantity, unitPrice: item.unitPrice || item.price / item.quantity, items: [item], isQuantityItem: true });
      } else {
        const key = `${item.name}|||${item.price.toFixed(2)}`;
        if (map.has(key)) {
          map.get(key).items.push(item);
          map.get(key).count += 1;
        } else {
          const group = { name: item.name, price: item.price, count: 1, items: [item], isQuantityItem: false };
          map.set(key, group);
          groups.push(group);
        }
      }
    }
    return groups;
  }, [state.items]);

  // ── item handlers ──────────────────────────────────────────────────────
  function startEdit(item) {
    setEditingFeeId(null);
    setEditingId(item.id);
    setEditName(item.name);
    const qty = item.quantity || 1;
    setEditQty(qty);
    setEditPrice(qty > 1 ? (item.unitPrice || item.price / qty).toFixed(2) : item.price.toFixed(2));
  }
  function saveEdit() {
    if (!editName.trim() || !editPrice) return;
    const unitP = parseFloat(editPrice) || 0;
    const qty   = Math.max(1, editQty);
    dispatch({ type: 'UPDATE_ITEM', id: editingId, updates: {
      name: editName.trim(), price: round2(unitP * qty), quantity: qty, unitPrice: unitP,
    }});
    setEditingId(null);
  }
  function deleteItem(id) {
    dispatch({ type: 'DELETE_ITEM', id });
    if (editingId === id) setEditingId(null);
  }
  function addItem() {
    if (!newName.trim() || !newPrice) return;
    dispatch({ type: 'ADD_ITEM', name: newName.trim(), price: parseFloat(newPrice) || 0 });
    setNewName(''); setNewPrice(''); setAddingNew(false);
  }

  // ── fee handlers ─────────────────────────────────────────────────────────
  function sumFeesOfType(type) {
    return fees.filter(f => f.type === type).reduce((s, f) => s + (parseFloat(f.amount) || 0), 0);
  }
  function addFee(type, defaultLabel) {
    const nextId = (fees.length === 0 ? 1 : Math.max(...fees.map(f => f.id)) + 1);
    setFees([...fees, { id: nextId, type, label: defaultLabel, amount: '' }]);
    setEditingFeeId(nextId);
    setShowAddMenu(false);
  }
  function updateFee(id, patch) {
    setFees(fees.map(f => f.id === id ? { ...f, ...patch } : f));
  }
  function removeFee(id) {
    setFees(fees.filter(f => f.id !== id || f.type === 'tax')); // tax never removable
    if (editingFeeId === id) setEditingFeeId(null);
  }

  // ── tip handlers ─────────────────────────────────────────────────────────
  function selectTip(percent) {
    setIsCustom(false);
    if (tipMode !== 'percent') dispatch({ type: 'SET_TIP_MODE', mode: 'percent' });
    dispatch({ type: 'SET_TIP_PERCENT', percent });
  }
  function handleCustomTip(val) {
    setCustomTip(val);
    const parsed = parseFloat(val);
    dispatch({ type: 'SET_TIP_PERCENT', percent: isNaN(parsed) ? 0 : Math.max(0, parsed) });
  }
  function handleDollarTip(val) {
    setDollarInput(val);
    const parsed = parseFloat(val);
    dispatch({ type: 'SET_TIP_DOLLAR', amount: isNaN(parsed) ? 0 : round2(Math.max(0, parsed)) });
  }
  function setTipMode(mode) { dispatch({ type: 'SET_TIP_MODE', mode }); }

  // ── derived totals (mirrors TipAndShare math) ────────────────────────────
  const includedGratuity = round2(sumFeesOfType('gratuity'));
  const additionalTip = tipMode === 'dollar'
    ? round2(Math.max(0, state.tipDollar || 0))
    : round2(Math.max(0, state.subtotal * (Math.max(0, state.tipPercent || 0) / 100)));

  const taxTotal = round2(sumFeesOfType('tax'));
  const adminTotal = round2(sumFeesOfType('admin'));
  const discountTotal = round2(sumFeesOfType('discount'));

  const grandTotal = round2(Math.max(0,
    Math.max(0, state.subtotal) + taxTotal + adminTotal + includedGratuity + additionalTip - discountTotal
  ));

  // Reconcile pre-tip total against the printed receipt total.
  const preTipTotal = round2(state.subtotal + taxTotal + adminTotal + includedGratuity - discountTotal);
  const scannedTotal = round2(state.receiptTotal || 0);
  const reconcileDiff = scannedTotal > 0 ? round2(preTipTotal - scannedTotal) : 0;
  const reconcileOff = scannedTotal > 0 && Math.abs(reconcileDiff) > 0.02;

  const tipLabel = includedGratuity > 0
    ? (tipMode === 'dollar' ? 'Additional tip' : `Additional tip · ${state.tipPercent || 0}%`)
    : (tipMode === 'dollar' ? 'Tip' : `Tip · ${state.tipPercent || 0}%`);

  const editingGroup = editingId !== null ? groupedItems.find(g => g.items.some(i => i.id === editingId)) : null;

  // ── commit local fees → state, then create/refresh the server session ────
  function buildPayload(sid) {
    return {
      sessionId: sid,
      hostName: state.hostName,
      venmoHandle: state.venmoHandle,
      hostDisplayName: state.hostDisplayName,
      paypalHandle: state.paypalHandle,
      cashtag: state.cashtag,
      items: state.items,
      subtotal: state.subtotal,
      tax: taxTotal,
      tipPercent: state.tipPercent,
      tipMode: state.tipMode,
      tipDollar: state.tipDollar,
      tipIncluded: includedGratuity > 0,
      tipAmount: includedGratuity,
      adminFee: adminTotal,
      discount: discountTotal,
      currency,
      exchangeRate: state.exchangeRate,
      receiptTotal: state.receiptTotal,
    };
  }
  function ensureSession(then) {
    const sid = sessionId || Math.random().toString(36).substring(2, 12);
    if (!sessionId) dispatch({ type: 'SET_SESSION_ID', sessionId: sid });
    // Commit the editable fee values into shared state.
    dispatch({ type: 'SET_TAX', tax: taxTotal, taxNote: state.taxNote });
    dispatch({ type: 'SET_ADMIN_FEE', adminFee: adminTotal });
    dispatch({ type: 'SET_SCAN_EXTRAS', discount: discountTotal, receiptTotal: state.receiptTotal });
    dispatch({ type: 'SET_TIP_INCLUDED', tipIncluded: includedGratuity > 0, tipAmount: includedGratuity });
    recordSplit({ sessionId: sid, hostName: state.hostName, currency, total: grandTotal, guests: state.guests.length });
    if (socket) {
      if (!socket.connected) socket.connect();
      socket.emit('create-session', buildPayload(sid));
    }
    then(sid);
  }
  function handleGetQR() {
    if (state.items.length === 0) return;
    ensureSession(() => {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('open-qr'));
    });
  }
  function handleTrackPaid() {
    ensureSession((sid) => navigate(`/host/${sid}`));
  }

  // ── fee line renderer (inline edit, like items) ──────────────────────────
  function FeeLine({ fee }) {
    const editing = editingFeeId === fee.id;
    const amt = parseFloat(fee.amount) || 0;
    const isDiscount = fee.type === 'discount';
    if (editing) {
      return (
        <div className="srow" style={{ display: 'block', padding: '12px 0' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <input
                value={fee.label}
                onChange={(e) => updateFee(fee.id, { label: e.target.value })}
                placeholder="Charge name"
              />
            </div>
            <div className="field" style={{ width: 110, marginBottom: 0 }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', fontWeight: 600, pointerEvents: 'none' }}>{curSym}</span>
                <input type="number" step="0.01" value={fee.amount} autoFocus
                  onChange={(e) => updateFee(fee.id, { amount: e.target.value })}
                  placeholder="0.00" style={{ paddingLeft: 28 }} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button variant="clay" full={false} style={{ flex: 1, padding: '9px 16px', fontSize: '.9rem' }} onClick={() => setEditingFeeId(null)}>Done</Button>
            {fee.type !== 'tax' && (
              <Button variant="soft" full={false} style={{ padding: '9px 16px', fontSize: '.9rem', color: 'var(--clay-deep)' }} onClick={() => removeFee(fee.id)}>Remove</Button>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="srow sub" onClick={() => { setEditingId(null); setEditingFeeId(fee.id); }} style={{ cursor: 'pointer' }}>
        <span>
          {fee.label || (isDiscount ? 'Discount' : 'Charge')}
          {fee.type === 'gratuity' && <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> (included)</span>}
          <Icon name="pencil" size={11} stroke={2} color="var(--ink-3)" style={{ marginLeft: 6, verticalAlign: 'middle', opacity: 0.6 }} />
        </span>
        <span className="mono" style={isDiscount ? { fontWeight: 700, color: 'var(--sage)' } : { fontWeight: 700 }}>
          {isDiscount ? '−' : ''}{formatPrice(amt)}
        </span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-body pg">

        {/* Back */}
        <button className="back" onClick={() => navigate('/scan')}>
          <Icon name="arrow-left" size={16} stroke={2.2} /> Back to Scan
        </button>

        {/* Header */}
        <div className="claim-head">
          <div className="h1">
            Your <span className="serif-i" style={{ fontSize: '1.9rem' }}>receipt</span>
          </div>
          <p className="lead" style={{ marginTop: 4 }}>
            {state.items.length} item{state.items.length !== 1 ? 's' : ''} · tap any line to edit
          </p>
        </div>

        {/* ── The receipt ───────────────────────────────────────────────── */}
        <div className="sum-card" style={{ boxShadow: 'var(--sh-soft)', border: '1.5px solid var(--line)' }}>

          {state.items.length === 0 && !addingNew && (
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
              <p className="cap">No items yet. Add them below.</p>
            </div>
          )}

          {/* Items */}
          {groupedItems.map((group) => {
            if (editingGroup === group) {
              const editItem = group.items.find(i => i.id === editingId);
              return (
                <div key={editItem.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--line-2)' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Item name" />
                    </div>
                    <div className="field" style={{ width: 110, marginBottom: 0 }}>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', fontWeight: 600, pointerEvents: 'none' }}>{curSym}</span>
                        <input value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="0.00" type="number" step="0.01" style={{ paddingLeft: 28 }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span className="cap" style={{ minWidth: 30 }}>Qty</span>
                    <button style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px solid var(--clay-edge)', background: '#fff', color: 'var(--clay-deep)', fontWeight: 700, fontSize: '1.1rem', cursor: 'pointer' }} onClick={() => setEditQty(Math.max(1, editQty - 1))}>−</button>
                    <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center', fontSize: '1.05rem' }}>{editQty}</span>
                    <button style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px solid var(--clay-edge)', background: '#fff', color: 'var(--clay-deep)', fontWeight: 700, fontSize: '1.1rem', cursor: 'pointer' }} onClick={() => setEditQty(editQty + 1)}>+</button>
                    {editQty > 1 && <span className="cap">= {formatPrice((parseFloat(editPrice) || 0) * editQty)} total</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="clay" full={false} style={{ flex: 1, padding: '11px 16px', fontSize: '.95rem' }} onClick={saveEdit}>Save</Button>
                    <Button variant="ghost" full={false} style={{ padding: '11px 16px', fontSize: '.95rem' }} onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button variant="soft" full={false} style={{ padding: '11px 16px', fontSize: '.95rem', color: 'var(--clay-deep)' }} onClick={() => deleteItem(editItem.id)}>Delete</Button>
                  </div>
                </div>
              );
            }
            return (
              <div key={group.items[0].id} className="srow" onClick={() => startEdit(group.items[0])} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <span className="nm">
                  {group.name}
                  {group.count > 1 && <span className="scan-q">×{group.count}</span>}
                  {group.count > 1 && (
                    <span className="cap" style={{ display: 'block', marginTop: 1, fontWeight: 400 }}>
                      {formatPrice(group.isQuantityItem ? group.unitPrice : group.price)} each
                    </span>
                  )}
                </span>
                <span className="pr mono">{formatPrice(group.isQuantityItem ? group.price : group.price * group.count)}</span>
              </div>
            );
          })}

          {/* Add item inline */}
          {addingNew && (
            <div style={{ padding: '14px 0', borderTop: groupedItems.length > 0 ? '1px solid var(--line-2)' : 'none' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Item name" autoFocus />
                </div>
                <div className="field" style={{ width: 110, marginBottom: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', fontWeight: 600, pointerEvents: 'none' }}>{curSym}</span>
                    <input value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="0.00" type="number" step="0.01" style={{ paddingLeft: 28 }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="clay" full={false} style={{ flex: 1, padding: '11px 16px', fontSize: '.95rem' }} onClick={addItem}>Add</Button>
                <Button variant="ghost" full={false} style={{ padding: '11px 16px', fontSize: '.95rem' }} onClick={() => setAddingNew(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Tear line + subtotal */}
          <div className="srow sub" style={{ borderTop: '1px dashed var(--line)', marginTop: 4, paddingTop: 12 }}>
            <span>Subtotal</span>
            <span className="mono" style={{ fontWeight: 700 }}>{formatPrice(state.subtotal)}</span>
          </div>

          {/* Tax-included note (VAT-style receipts) */}
          {taxInPrices && (
            <div className="srow sub">
              <span>Tax <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>(included in prices)</span></span>
              <span className="mono" style={{ fontWeight: 700, color: 'var(--ink-3)' }}>{formatPrice(0)}</span>
            </div>
          )}

          {/* Fee lines (tax / service / gratuity / discount) */}
          {fees.map((fee) => <FeeLine key={fee.id} fee={fee} />)}

          {/* Tip line (live) */}
          {(additionalTip > 0) && (
            <div className="srow sub">
              <span>{tipLabel}</span>
              <span className="mono" style={{ fontWeight: 700 }}>{formatPrice(additionalTip)}</span>
            </div>
          )}

          {/* Total */}
          <div className="srow tot">
            <span className="nm">Total</span>
            <span className="pr mono">{formatPrice(grandTotal)}</span>
          </div>
        </div>

        {/* Small add buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, position: 'relative' }}>
          {!addingNew && (
            <button onClick={() => { setEditingId(null); setAddingNew(true); }} className="addchip">
              <Icon name="plus" size={13} stroke={2.5} /> Add item
            </button>
          )}
          <button onClick={() => setShowAddMenu(!showAddMenu)} className="addchip">
            <Icon name="plus" size={13} stroke={2.5} /> Add expense
          </button>
          {showAddMenu && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 5, background: 'var(--panel)', border: '1.5px solid var(--line)', borderRadius: 'var(--r-lg)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2, boxShadow: 'var(--sh-soft)', minWidth: 200 }}>
              <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '.9rem', borderRadius: 'var(--r-md)' }} onClick={() => addFee('admin', 'Service Charge')}>Service / Admin Fee</button>
              <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '.9rem', borderRadius: 'var(--r-md)' }} onClick={() => addFee('discount', 'Discount')}>Discount / Comp / Promo</button>
              <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '.9rem', borderRadius: 'var(--r-md)' }} onClick={() => addFee('admin', '')}>Other / Custom</button>
            </div>
          )}
        </div>

        {/* ── Tip controls (compact) ────────────────────────────────────── */}
        <p className="cap" style={{ margin: '20px 0 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Tip <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· on the {formatPrice(state.subtotal)} subtotal</span>
        </p>

        <div className="tipsel">
          {TIP_PRESETS.map((p) => (
            <button
              key={p}
              className={`tip${!isCustom && (state.tipPercent || 0) === p && tipMode === 'percent' ? ' on' : ''}`}
              style={{ padding: '10px 4px' }}
              onClick={() => selectTip(p)}
            >
              {p === 0 ? 'No tip' : `${p}%`}
              {p > 0 && <span className="s">{formatPrice(state.subtotal * (p / 100))}</span>}
            </button>
          ))}
        </div>

        {/* % / flat / custom — secondary, smaller */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, fontSize: '.82rem' }}>
          <button className={`tip${tipMode === 'percent' && !isCustom ? ' on' : ''}`} style={{ padding: '8px 4px', fontSize: '.82rem' }}
            onClick={() => { setIsCustom(false); setTipMode('percent'); }}>% Percentage</button>
          <button className={`tip${tipMode === 'dollar' ? ' on' : ''}`} style={{ padding: '8px 4px', fontSize: '.82rem' }}
            onClick={() => { setIsCustom(false); setTipMode('dollar'); }}>{curSym} Flat</button>
          {tipMode === 'percent' && (
            <button className={`tip${isCustom ? ' on' : ''}`} style={{ padding: '8px 4px', fontSize: '.82rem' }}
              onClick={() => setIsCustom(true)}>Custom</button>
          )}
        </div>

        {/* Custom % input */}
        {tipMode === 'percent' && isCustom && (
          <div style={{ position: 'relative', marginTop: 8 }}>
            <input
              style={{ width: '100%', fontFamily: 'var(--font-ui)', fontSize: '.95rem', padding: '11px 36px 11px 14px', border: '1.5px solid var(--clay)', borderRadius: 'var(--r-md)', background: 'var(--panel)', color: 'var(--ink)', outline: 'none', boxShadow: '0 0 0 3px var(--clay-soft)' }}
              type="number" step="1" min="0" value={customTip} autoFocus
              onChange={(e) => handleCustomTip(e.target.value)}
              onBlur={() => { const v = parseFloat(customTip); if (isNaN(v) || v < 0) { setCustomTip('0'); dispatch({ type: 'SET_TIP_PERCENT', percent: 0 }); } }}
              placeholder="Enter tip %" />
            <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', fontWeight: 600 }}>%</span>
          </div>
        )}

        {/* Flat dollar input */}
        {tipMode === 'dollar' && (
          <div style={{ marginTop: 8 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', fontWeight: 600 }}>{curSym}</span>
              <input
                style={{ width: '100%', fontFamily: 'var(--font-ui)', fontSize: '.95rem', padding: '11px 14px 11px 30px', border: '1.5px solid var(--clay)', borderRadius: 'var(--r-md)', background: 'var(--panel)', color: 'var(--ink)', outline: 'none', boxShadow: '0 0 0 3px var(--clay-soft)' }}
                type="number" step="0.01" min="0" value={dollarInput} autoFocus
                onChange={(e) => handleDollarTip(e.target.value)}
                onBlur={() => { const v = parseFloat(dollarInput); if (isNaN(v) || v < 0) { setDollarInput('0.00'); dispatch({ type: 'SET_TIP_DOLLAR', amount: 0 }); } }}
                placeholder="0.00" />
            </div>
          </div>
        )}

        {/* Gratuity notice */}
        {includedGratuity > 0 && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 'var(--r-md)', background: 'var(--clay-soft)', border: '1.5px solid var(--clay-edge)', fontSize: '.83rem', fontWeight: 500, color: 'var(--clay-deep)' }}>
            A gratuity of {formatPrice(includedGratuity)} was already on the receipt.
            {additionalTip > 0 ? ' Your tip adds on top.' : ' No extra tip will be added.'}
          </div>
        )}

        {/* Reconciliation */}
        {reconcileOff ? (
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 'var(--r-md)', background: '#fff8e1', border: '1.5px solid var(--gold)' }}>
            <p style={{ fontWeight: 700, color: '#bf360c', fontSize: '.9rem' }}>⚠ This doesn&apos;t match the receipt total</p>
            <p className="cap" style={{ marginTop: 6, lineHeight: 1.5 }}>
              The receipt shows <strong>{formatPrice(scannedTotal)}</strong>, but items + charges add to <strong>{formatPrice(preTipTotal)}</strong> ({reconcileDiff > 0 ? 'over' : 'under'} by {formatPrice(Math.abs(reconcileDiff))}). Check for a missed item, tax, or discount.
            </p>
          </div>
        ) : scannedTotal > 0 ? (
          <p className="cap" style={{ textAlign: 'center', marginTop: 12, color: 'var(--sage)', fontWeight: 600 }}>
            ✓ Matches the receipt total of {formatPrice(scannedTotal)}
          </p>
        ) : null}

        <div style={{ flex: 1, minHeight: 16 }} />

        {/* ── CTAs ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          <Button icon="qr-code" onClick={handleGetQR} disabled={state.items.length === 0}>
            Looks right — get the QR
          </Button>
          <Button variant="soft" icon="users" onClick={handleTrackPaid} disabled={state.items.length === 0}>
            Track who&rsquo;s paid
          </Button>
        </div>

      </div>
    </div>
  );
}
