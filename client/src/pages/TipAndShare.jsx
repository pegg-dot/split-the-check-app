import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession, formatPrice as fmtPrice, currencySymbol, round2 } from '../context/SessionContext';
import { Button } from '../components/ui/Button';
import { socket } from '../context/socket';
import { recordSplit } from '../lib/history';

const TIP_PRESETS = [0, 15, 18, 20];

export default function TipAndShare() {
  const navigate = useNavigate();
  const { state, dispatch } = useSession();
  const [isCustom, setIsCustom] = useState(false);
  const [customTip, setCustomTip] = useState('');
  const [dollarInput, setDollarInput] = useState(
    state.tipDollar > 0 ? state.tipDollar.toFixed(2) : ''
  );

  const tipMode = state.tipMode || 'percent';

  // The gratuity already printed on the receipt (never changes based on host selection)
  const includedGratuity = state.tipIncluded ? round2(Math.max(0, state.tipAmount || 0)) : 0;

  // The ADDITIONAL tip the host is choosing to add on top (or the only tip if no gratuity)
  let additionalTip;
  if (tipMode === 'dollar') {
    additionalTip = round2(Math.max(0, state.tipDollar || 0));
  } else {
    additionalTip = round2(Math.max(0, state.subtotal * (Math.max(0, state.tipPercent || 0) / 100)));
  }

  const grandTotal = round2(Math.max(0,
    Math.max(0, state.subtotal) +
    Math.max(0, state.tax) +
    Math.max(0, state.adminFee || 0) +
    includedGratuity +
    additionalTip -
    Math.max(0, state.discount || 0)
  ));

  const currency = state.currency || 'USD';
  const formatPrice = (p) => fmtPrice(p, currency);
  const curSym = currencySymbol(currency);

  // Generate session ID if not set
  useEffect(() => {
    if (!state.sessionId) {
      const id = Math.random().toString(36).substring(2, 12);
      dispatch({ type: 'SET_SESSION_ID', sessionId: id });
    }
  }, [state.sessionId, dispatch]);

  const sessionId = state.sessionId;

  // Auto-create / update session on server whenever tip settings change.
  // socket is null in SSR/test (guarded in socket.js), so we check before use.
  useEffect(() => {
    if (!sessionId) return;
    if (!socket) return;
    if (!socket.connected) {
      socket.connect();
    }
    // Record to on-device history
    recordSplit({
      sessionId,
      hostName: state.hostName,
      currency: state.currency,
      total: grandTotal,
      guests: state.guests.length,
    });
    socket.emit('create-session', {
      sessionId,
      hostName: state.hostName,
      venmoHandle: state.venmoHandle,
      hostDisplayName: state.hostDisplayName,
      items: state.items,
      subtotal: state.subtotal,
      tax: state.tax,
      tipPercent: state.tipPercent,
      tipMode: state.tipMode,
      tipDollar: state.tipDollar,
      tipIncluded: state.tipIncluded,
      tipAmount: state.tipAmount,
      adminFee: state.adminFee,
      discount: state.discount,
      currency: state.currency,
      exchangeRate: state.exchangeRate,
      receiptTotal: state.receiptTotal,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, state.tipPercent, state.tipMode, state.tipDollar, state.tipIncluded]);

  // ── tip helpers ──────────────────────────────────────────────────────
  function selectTip(percent) {
    setIsCustom(false);
    dispatch({ type: 'SET_TIP_PERCENT', percent });
  }

  function handleCustomTip(val) {
    setCustomTip(val);
    const parsed = parseFloat(val);
    const safe = isNaN(parsed) ? 0 : Math.max(0, parsed);
    dispatch({ type: 'SET_TIP_PERCENT', percent: safe });
  }

  function handleDollarTip(val) {
    setDollarInput(val);
    const parsed = parseFloat(val);
    const safe = isNaN(parsed) ? 0 : round2(Math.max(0, parsed));
    dispatch({ type: 'SET_TIP_DOLLAR', amount: safe });
  }

  function setTipMode(mode) {
    dispatch({ type: 'SET_TIP_MODE', mode });
  }

  // ── QR open ──────────────────────────────────────────────────────────
  function handleShowQR() {
    // Ensure the session is created/refreshed before the overlay opens.
    if (socket && socket.connected) {
      socket.emit('create-session', {
        sessionId,
        hostName: state.hostName,
        venmoHandle: state.venmoHandle,
        hostDisplayName: state.hostDisplayName,
        items: state.items,
        subtotal: state.subtotal,
        tax: state.tax,
        tipPercent: state.tipPercent,
        tipMode: state.tipMode,
        tipDollar: state.tipDollar,
        tipIncluded: state.tipIncluded,
        tipAmount: state.tipAmount,
        adminFee: state.adminFee,
        discount: state.discount,
        currency: state.currency,
        exchangeRate: state.exchangeRate,
        receiptTotal: state.receiptTotal,
      });
    }
    // Signal the globally-mounted QROverlay (App.jsx) to open.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-qr'));
    }
  }

  // ── tip label for totals section ─────────────────────────────────────
  const tipLabel = state.tipIncluded
    ? tipMode === 'dollar' ? 'Additional tip (flat)' : `Additional tip (${state.tipPercent}%)`
    : tipMode === 'dollar' ? 'Tip (flat)' : `Tip · ${state.tipPercent}%`;

  return (
    <div className="pg">
      {/* Back */}
      <button className="back" onClick={() => navigate('/review')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Back
      </button>

      {/* Header */}
      <div className="claim-head">
        <div className="h1">
          Set the <span className="serif-i" style={{ fontSize: '1.9rem' }}>tip</span>
        </div>
        <p className="lead" style={{ marginTop: 4 }}>
          Here&rsquo;s everything the AI pulled off your receipt.
        </p>
      </div>

      {/* ── Scanned itemization card ─────────────────────────────────── */}
      <div className="sum-card" style={{ boxShadow: 'var(--sh-soft)', border: '1.5px solid var(--line)' }}>
        {/* Item rows */}
        {state.items && state.items.map((item) => {
          const qty = item.units?.length > 1 ? item.units.length
            : (item.quantity > 1 ? item.quantity : null);
          return (
            <div className="srow scan-row" key={item.id}>
              <span className="nm">
                {item.name}
                {qty && <span className="scan-q">×{qty}</span>}
              </span>
              <span className="mono">{formatPrice(item.price)}</span>
            </div>
          );
        })}

        {/* Tear-line + subtotals */}
        <div
          className="srow sub"
          style={{ borderTop: '1px dashed var(--line)', marginTop: 4, paddingTop: 12 }}
        >
          <span>Subtotal</span>
          <span className="mono" style={{ fontWeight: 700 }}>{formatPrice(state.subtotal)}</span>
        </div>

        <div className="srow sub">
          <span>Tax</span>
          <span className="mono" style={{ fontWeight: 700 }}>{formatPrice(state.tax)}</span>
        </div>

        {state.adminFee > 0 && (
          <div className="srow sub">
            <span>Admin Fee</span>
            <span className="mono" style={{ fontWeight: 700 }}>{formatPrice(state.adminFee)}</span>
          </div>
        )}

        {state.discount > 0 && (
          <div className="srow sub">
            <span>Discount</span>
            <span className="mono" style={{ fontWeight: 700, color: 'var(--sage)' }}>
              −{formatPrice(state.discount)}
            </span>
          </div>
        )}

        {includedGratuity > 0 && (
          <div className="srow sub">
            <span>Gratuity (included)</span>
            <span className="mono" style={{ fontWeight: 700 }}>{formatPrice(includedGratuity)}</span>
          </div>
        )}

        {additionalTip > 0 && (
          <div className="srow sub">
            <span>{tipLabel}</span>
            <span className="mono" style={{ fontWeight: 700 }}>{formatPrice(additionalTip)}</span>
          </div>
        )}

        {/* Heavy total row */}
        <div className="srow tot">
          <span className="nm">Total</span>
          <span className="pr mono">{formatPrice(grandTotal)}</span>
        </div>
      </div>

      {/* Caption */}
      <p className="cap" style={{ margin: '16px 0 9px' }}>
        Tip is on the {formatPrice(state.subtotal)} subtotal (pre-tax).
      </p>

      {/* ── Tip selector: 4 segments ──────────────────────────────────── */}
      <div className="tipsel">
        {TIP_PRESETS.map((p) => (
          <button
            key={p}
            className={`tip${!isCustom && state.tipPercent === p && tipMode === 'percent' ? ' on' : ''}`}
            onClick={() => { if (tipMode !== 'percent') setTipMode('percent'); selectTip(p); }}
          >
            {p === 0 ? 'No tip' : `${p}%`}
            {p > 0 && (
              <span className="s">{formatPrice(state.subtotal * (p / 100))}</span>
            )}
          </button>
        ))}
      </div>

      {/* Mode toggle: % vs $ — kept accessible */}
      <div className="mode-toggle" style={{ marginTop: 14 }}>
        <button
          className={tipMode === 'percent' ? 'on' : ''}
          onClick={() => { setIsCustom(false); setTipMode('percent'); }}
        >
          % Percentage
        </button>
        <button
          className={tipMode === 'dollar' ? 'on' : ''}
          onClick={() => setTipMode('dollar')}
        >
          {curSym} Flat amount
        </button>
      </div>

      {/* Custom % input */}
      {tipMode === 'percent' && (
        <div style={{ marginTop: 10 }}>
          <button
            className={`tip${isCustom ? ' on' : ''}`}
            style={{ width: '100%' }}
            onClick={() => setIsCustom(true)}
          >
            Custom %
          </button>
          {isCustom && (
            <div style={{ position: 'relative', marginTop: 10 }}>
              <input
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-ui)',
                  fontSize: '1rem',
                  padding: '14px 40px 14px 16px',
                  border: '1.5px solid var(--clay)',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--panel)',
                  color: 'var(--ink)',
                  outline: 'none',
                  boxShadow: '0 0 0 3px var(--clay-soft)',
                }}
                type="number"
                step="1"
                min="0"
                value={customTip}
                onChange={(e) => handleCustomTip(e.target.value)}
                onBlur={() => {
                  const v = parseFloat(customTip);
                  if (isNaN(v) || v < 0) {
                    setCustomTip('0');
                    dispatch({ type: 'SET_TIP_PERCENT', percent: 0 });
                  }
                }}
                placeholder="Enter tip %"
                autoFocus
              />
              <span style={{
                position: 'absolute', right: 16, top: '50%',
                transform: 'translateY(-50%)', color: 'var(--ink-3)', fontWeight: 600,
              }}>%</span>
            </div>
          )}
        </div>
      )}

      {/* Flat dollar input */}
      {tipMode === 'dollar' && (
        <div style={{ marginTop: 10 }}>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 16, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--ink-3)', fontWeight: 600,
            }}>{curSym}</span>
            <input
              style={{
                width: '100%',
                fontFamily: 'var(--font-ui)',
                fontSize: '1rem',
                padding: '14px 16px 14px 32px',
                border: '1.5px solid var(--clay)',
                borderRadius: 'var(--r-md)',
                background: 'var(--panel)',
                color: 'var(--ink)',
                outline: 'none',
                boxShadow: '0 0 0 3px var(--clay-soft)',
              }}
              type="number"
              step="0.01"
              min="0"
              value={dollarInput}
              onChange={(e) => handleDollarTip(e.target.value)}
              onBlur={() => {
                const v = parseFloat(dollarInput);
                if (isNaN(v) || v < 0) {
                  setDollarInput('0.00');
                  dispatch({ type: 'SET_TIP_DOLLAR', amount: 0 });
                }
              }}
              placeholder="0.00"
              autoFocus
            />
          </div>
          {state.subtotal > 0 && additionalTip > 0 && (
            <p className="cap" style={{ marginTop: 8 }}>
              ≈ {((additionalTip / state.subtotal) * 100).toFixed(1)}% of subtotal
            </p>
          )}
        </div>
      )}

      {/* Gratuity notice */}
      {state.tipIncluded && state.tipAmount > 0 && (
        <div style={{
          marginTop: 14,
          padding: '12px 14px',
          borderRadius: 'var(--r-md)',
          background: 'var(--clay-soft)',
          border: '1.5px solid var(--clay-edge)',
          fontSize: '.86rem',
          fontWeight: 500,
          color: 'var(--clay-deep)',
        }}>
          A gratuity of {formatPrice(state.tipAmount)} was detected on your receipt and is already included.
          {additionalTip > 0
            ? ' An additional tip will be added on top.'
            : ' No additional tip will be added.'}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 16 }} />

      {/* ── CTAs ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button icon="qr-code" onClick={handleShowQR}>
          Show the QR code
        </Button>
        <Button variant="soft" icon="users" onClick={() => navigate(`/host/${sessionId}`)}>
          Track who&rsquo;s paid
        </Button>
      </div>
    </div>
  );
}
