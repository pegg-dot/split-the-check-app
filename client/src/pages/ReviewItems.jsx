import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession, formatPrice as fmtPrice, currencySymbol, round2 } from '../context/SessionContext';
import { socket } from '../context/socket';
import { Icon, Button } from '../components/ui';

export default function ReviewItems() {
  const navigate = useNavigate();
  const { state, dispatch } = useSession();
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName]   = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty]     = useState(1);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  // Fees: tax, service charges, and auto-detected gratuity all appear here as editable rows.
  // The AI sets taxNote (and tax = 0) only when tax is baked into the item
  // prices (European VAT-style receipts). In that case the green banner below
  // already explains it, so a separate "Tax 0.00" row would just be confusing.
  const taxInPrices = !!state.taxNote;
  const [fees, setFees] = useState(() => {
    const list = [];
    let nextId = 1;
    // Tax is part of the bill — show a locked, editable row UNLESS tax is
    // already included in the item prices (then the banner stands alone).
    if (!taxInPrices) {
      list.push({ id: nextId++, type: 'tax', label: 'Tax', amount: (Number(state.tax) || 0).toFixed(2) });
    }
    if (state.adminFee > 0) list.push({ id: nextId++, type: 'admin', label: 'Service Charge', amount: state.adminFee.toFixed(2) });
    if (state.tipIncluded && state.tipAmount > 0) list.push({ id: nextId++, type: 'gratuity', label: 'Gratuity', amount: state.tipAmount.toFixed(2), detected: true });
    if (state.discount > 0) list.push({ id: nextId++, type: 'discount', label: 'Discount', amount: state.discount.toFixed(2), detected: true });
    return list;
  });
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Group items for display.
  // Quantity items (quantity > 1) are already a single record — show as-is.
  // Legacy duplicate items (same name+price, quantity=1) are grouped together.
  const groupedItems = useMemo(() => {
    const groups = [];
    const map = new Map();

    for (const item of state.items) {
      if ((item.quantity || 1) > 1) {
        // Already a proper quantity item — treat as its own group
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

  function startEdit(item) {
    setEditingId(item.id);
    setEditName(item.name);
    const qty = item.quantity || 1;
    setEditQty(qty);
    // Show unit price in the price field for quantity items; total price for qty=1
    setEditPrice(qty > 1 ? (item.unitPrice || item.price / qty).toFixed(2) : item.price.toFixed(2));
  }

  function saveEdit() {
    if (!editName.trim() || !editPrice) return;
    const unitP = parseFloat(editPrice) || 0;
    const qty   = Math.max(1, editQty);
    dispatch({ type: 'UPDATE_ITEM', id: editingId, updates: {
      name:      editName.trim(),
      price:     round2(unitP * qty),
      quantity:  qty,
      unitPrice: unitP,
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
    setNewName('');
    setNewPrice('');
    setAddingNew(false);
  }

  function sumFeesOfType(type) {
    return fees.filter(f => f.type === type).reduce((s, f) => s + (parseFloat(f.amount) || 0), 0);
  }

  function handleContinue() {
    const taxTotal = sumFeesOfType('tax');
    const adminTotal = sumFeesOfType('admin');
    const gratuityTotal = round2(sumFeesOfType('gratuity'));
    const discountTotal = round2(sumFeesOfType('discount'));
    const hasGratuity = gratuityTotal > 0;

    console.log('[ReviewItems] handleContinue →', { taxTotal, adminTotal, gratuityTotal, discountTotal, hasGratuity, items: state.items.length });
    dispatch({ type: 'SET_TAX', tax: taxTotal, taxNote: state.taxNote });
    dispatch({ type: 'SET_ADMIN_FEE', adminFee: adminTotal });
    dispatch({ type: 'SET_SCAN_EXTRAS', discount: discountTotal, receiptTotal: state.receiptTotal });
    dispatch({ type: 'SET_TIP_INCLUDED', tipIncluded: hasGratuity, tipAmount: gratuityTotal });
    // When gratuity is already on the receipt, default to "No tip" so the host
    // isn't accidentally charged an extra 18% on top of the auto-gratuity.
    if (hasGratuity) {
      dispatch({ type: 'SET_TIP_PERCENT', percent: 0 });
      dispatch({ type: 'SET_TIP_DOLLAR', amount: 0 });
    }
    navigate('/tip');
  }

  function addFee(type, defaultLabel) {
    const nextId = (fees.length === 0 ? 1 : Math.max(...fees.map(f => f.id)) + 1);
    setFees([...fees, { id: nextId, type, label: defaultLabel, amount: '' }]);
    setShowAddMenu(false);
  }

  function updateFee(id, patch) {
    setFees(fees.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  function removeFee(id) {
    // Never remove the tax row — tax is always calculated into the bill.
    setFees(fees.filter(f => f.id !== id || f.type === 'tax'));
  }

  const formatPrice = (p) => fmtPrice(p, state.currency || 'USD');
  const curSym = currencySymbol(state.currency || 'USD');

  // Calculate preview total: charges add, discounts subtract.
  const previewSubtotal = state.subtotal;
  const chargeTotal = round2(fees.filter(f => f.type !== 'discount').reduce((s, f) => round2(s + (parseFloat(f.amount) || 0)), 0));
  const discountTotal = round2(fees.filter(f => f.type === 'discount').reduce((s, f) => round2(s + (parseFloat(f.amount) || 0)), 0));
  const previewTotal = round2(previewSubtotal + chargeTotal - discountTotal);

  // Reconcile against the printed grand total from the scan (catches mis-read
  // tax, e.g. tax already included in prices, or dropped lines).
  const scannedTotal = round2(state.receiptTotal || 0);
  const reconcileDiff = scannedTotal > 0 ? round2(previewTotal - scannedTotal) : 0;
  const reconcileOff = scannedTotal > 0 && Math.abs(reconcileDiff) > 0.02;

  // Check if any item in a group is being edited
  const editingGroup = editingId !== null
    ? groupedItems.find(g => g.items.some(i => i.id === editingId))
    : null;

  return (
    <div className="app-shell">
      <div className="app-body pg">

        {/* Back */}
        <button className="back" onClick={() => navigate('/scan')}>
          <Icon name="arrow-left" size={16} stroke={2.2} />
          Back to Scan
        </button>

        {/* Header */}
        <div className="claim-head">
          <div className="h1">
            Review <span className="serif-i" style={{ fontSize: '1.9rem' }}>items</span>
          </div>
          <p className="lead" style={{ marginTop: 4 }}>
            {state.items.length} item{state.items.length !== 1 ? 's' : ''} found
          </p>
        </div>

        {/* ── Items card ─────────────────────────────────────────────── */}
        <div className="sum-card" style={{ boxShadow: 'var(--sh-soft)', border: '1.5px solid var(--line)' }}>

          {state.items.length === 0 && !addingNew && (
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
              <p className="cap">No items yet. Add them manually below.</p>
            </div>
          )}

          {groupedItems.map((group) => {
            const isEditingThisGroup = editingGroup === group;

            if (isEditingThisGroup) {
              const editItem = group.items.find(i => i.id === editingId);
              return (
                <div key={editItem.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--line-2)' }}>
                  {/* Name + unit price */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Item name"
                      />
                    </div>
                    <div className="field" style={{ width: '110px', marginBottom: 0 }}>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', fontWeight: 600, pointerEvents: 'none' }}>{curSym}</span>
                        <input
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          placeholder="0.00"
                          type="number"
                          step="0.01"
                          style={{ paddingLeft: '28px' }}
                        />
                      </div>
                    </div>
                  </div>
                  {/* Quantity row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span className="cap" style={{ minWidth: '30px' }}>Qty</span>
                    <button
                      style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px solid var(--clay-edge)', background: '#fff', color: 'var(--clay-deep)', fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      onClick={() => setEditQty(Math.max(1, editQty - 1))}>−</button>
                    <span style={{ fontWeight: 700, minWidth: '20px', textAlign: 'center', fontSize: '1.05rem' }}>{editQty}</span>
                    <button
                      style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px solid var(--clay-edge)', background: '#fff', color: 'var(--clay-deep)', fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      onClick={() => setEditQty(editQty + 1)}>+</button>
                    {editQty > 1 && (
                      <span className="cap">= {formatPrice((parseFloat(editPrice) || 0) * editQty)} total</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="clay" full={false} style={{ flex: 1, padding: '11px 16px', fontSize: '.95rem' }} onClick={saveEdit}>Save</Button>
                    <Button variant="ghost" full={false} style={{ padding: '11px 16px', fontSize: '.95rem' }} onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button variant="soft" full={false} style={{ padding: '11px 16px', fontSize: '.95rem', color: 'var(--clay-deep)' }} onClick={() => deleteItem(editItem.id)}>Delete</Button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={group.items[0].id}
                className="srow"
                onClick={() => startEdit(group.items[0])}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                <span className="nm">
                  {group.name}
                  {group.count > 1 && (
                    <span className="scan-q">×{group.count}</span>
                  )}
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

          {/* Add new item inline */}
          {addingNew && (
            <div style={{ padding: '14px 0', borderTop: groupedItems.length > 0 ? '1px solid var(--line-2)' : 'none' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Item name"
                    autoFocus
                  />
                </div>
                <div className="field" style={{ width: '110px', marginBottom: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', fontWeight: 600, pointerEvents: 'none' }}>{curSym}</span>
                    <input
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      placeholder="0.00"
                      type="number"
                      step="0.01"
                      style={{ paddingLeft: '28px' }}
                    />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="clay" full={false} style={{ flex: 1, padding: '11px 16px', fontSize: '.95rem' }} onClick={addItem}>Add</Button>
                <Button variant="ghost" full={false} style={{ padding: '11px 16px', fontSize: '.95rem' }} onClick={() => setAddingNew(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Tear-line + subtotal */}
          <div
            className="srow sub"
            style={{ borderTop: '1px dashed var(--line)', marginTop: 4, paddingTop: 12 }}
          >
            <span>Subtotal</span>
            <span className="mono" style={{ fontWeight: 700 }}>{formatPrice(state.subtotal)}</span>
          </div>
        </div>

        {/* Hint + add item */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 2px 0' }}>
          <p className="cap">Tap any item to edit</p>
          {!addingNew && (
            <button
              onClick={() => setAddingNew(true)}
              style={{
                background: 'none',
                border: '1.5px dashed var(--clay-edge)',
                borderRadius: 'var(--r-pill)',
                color: 'var(--clay)',
                fontWeight: 700,
                fontSize: '.88rem',
                padding: '6px 14px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="plus" size={14} stroke={2.5} /> Add Item
            </button>
          )}
        </div>

        {/* ── Charges & Fees section ─────────────────────────────────── */}
        <p className="cap" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 22, marginBottom: 10 }}>
          Charges &amp; Fees
        </p>

        {/* taxNote banner */}
        {state.taxNote && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 'var(--r-md)',
            background: 'var(--sage-soft)',
            border: '1px solid var(--sage)',
            marginBottom: 12,
          }}>
            <p style={{ fontSize: '.83rem', color: 'var(--sage)', fontWeight: 600 }}>ℹ️ {state.taxNote}</p>
          </div>
        )}

        {/* Fee rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {fees.map((fee) => (
            <div key={fee.id}>
              {fee.detected && (
                <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--sky)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
                  Detected from receipt
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Label input */}
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <input
                    value={fee.label}
                    onChange={(e) => updateFee(fee.id, { label: e.target.value })}
                    placeholder="Fee name"
                    style={fee.detected ? { borderColor: 'var(--sky)', background: 'var(--bg-2)' } : undefined}
                  />
                </div>
                {/* Amount input with currency prefix */}
                <div className="field" style={{ width: 120, marginBottom: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', fontWeight: 600, pointerEvents: 'none' }}>{curSym}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={fee.amount}
                      onChange={(e) => updateFee(fee.id, { amount: e.target.value })}
                      placeholder="0.00"
                      style={{ paddingLeft: '28px', ...(fee.detected ? { borderColor: 'var(--sky)', background: 'var(--bg-2)' } : {}) }}
                    />
                  </div>
                </div>
                {/* Lock for tax, ✕ for others */}
                {fee.type === 'tax' ? (
                  <span
                    aria-label="Tax is always included"
                    title="Tax is always included"
                    style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: '1rem', flexShrink: 0 }}
                  >
                    🔒
                  </span>
                ) : (
                  <button
                    onClick={() => removeFee(fee.id)}
                    aria-label="Remove"
                    style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--clay-soft)', color: 'var(--clay-deep)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* + Add expense */}
        <div style={{ position: 'relative', marginTop: 12 }}>
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            style={{
              background: 'none',
              border: '1.5px dashed var(--clay-edge)',
              borderRadius: 'var(--r-pill)',
              color: 'var(--clay)',
              fontWeight: 700,
              fontSize: '.88rem',
              padding: '8px 16px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="plus" size={14} stroke={2.5} /> Add expense
          </button>
          {showAddMenu && (
            <div style={{
              marginTop: 8,
              background: 'var(--panel)',
              border: '1.5px solid var(--line)',
              borderRadius: 'var(--r-lg)',
              padding: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              boxShadow: 'var(--sh-soft)',
            }}>
              <button
                className="btn btn-ghost"
                style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '.93rem', borderRadius: 'var(--r-md)' }}
                onClick={() => addFee('admin', 'Service Charge')}
              >
                Service / Admin Fee
              </button>
              <button
                className="btn btn-ghost"
                style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '.93rem', borderRadius: 'var(--r-md)' }}
                onClick={() => addFee('discount', 'Discount')}
              >
                Discount / Comp / Promo
              </button>
              <button
                className="btn btn-ghost"
                style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '.93rem', borderRadius: 'var(--r-md)' }}
                onClick={() => addFee('admin', '')}
              >
                Other / Custom
              </button>
            </div>
          )}
        </div>

        {/* ── Preview totals card ────────────────────────────────────── */}
        <div className="sum-card" style={{ boxShadow: 'var(--sh-soft)', border: '1.5px solid var(--line)', marginTop: 20 }}>
          <div className="srow sub" style={{ paddingTop: 10 }}>
            <span>Subtotal</span>
            <span className="mono" style={{ fontWeight: 700 }}>{formatPrice(previewSubtotal)}</span>
          </div>
          {fees.filter(f => (parseFloat(f.amount) || 0) > 0).map((fee) => {
            const amt = parseFloat(fee.amount) || 0;
            const isDiscount = fee.type === 'discount';
            return (
              <div key={fee.id} className="srow sub">
                <span>{fee.label || (isDiscount ? 'Discount' : 'Fee')}</span>
                <span className="mono" style={isDiscount ? { fontWeight: 700, color: 'var(--sage)' } : { fontWeight: 700 }}>
                  {isDiscount ? '−' : ''}{formatPrice(amt)}
                </span>
              </div>
            );
          })}
          <div className="srow tot">
            <span className="nm">Receipt Total</span>
            <span className="pr mono">{formatPrice(previewTotal)}</span>
          </div>
        </div>

        {/* ── Reconciliation ─────────────────────────────────────────── */}
        {reconcileOff ? (
          <div style={{
            marginTop: 10,
            padding: '12px 14px',
            borderRadius: 'var(--r-md)',
            background: '#fff8e1',
            border: '1.5px solid var(--gold)',
          }}>
            <p style={{ fontWeight: 700, color: '#bf360c', fontSize: '.9rem' }}>
              ⚠ This doesn&apos;t match the receipt total
            </p>
            <p className="cap" style={{ marginTop: 6, lineHeight: 1.5 }}>
              The receipt shows <strong>{formatPrice(scannedTotal)}</strong>, but your items + charges add to{' '}
              <strong>{formatPrice(previewTotal)}</strong> ({reconcileDiff > 0 ? 'over' : 'under'} by {formatPrice(Math.abs(reconcileDiff))}).
              Check for a missed item, tax, or discount before continuing.
            </p>
          </div>
        ) : scannedTotal > 0 ? (
          <p className="cap" style={{ textAlign: 'center', marginTop: 10, color: 'var(--sage)', fontWeight: 600 }}>
            ✓ Matches the receipt total of {formatPrice(scannedTotal)}
          </p>
        ) : (
          <p className="cap" style={{ textAlign: 'center', marginTop: 10 }}>
            Verify these match your receipt before continuing
          </p>
        )}

        <div style={{ flex: 1, minHeight: 16 }} />

        {/* ── Sticky CTA ────────────────────────────────────────────── */}
        <Button
          icon="arrow-right"
          onClick={handleContinue}
          disabled={state.items.length === 0}
          style={{ marginTop: 20 }}
        >
          Looks right — set the tip
        </Button>

      </div>
    </div>
  );
}
