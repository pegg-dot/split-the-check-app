import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useSession,
  calculatePersonTotal,
  calculateAllPersonTotals,
  getAllParticipants,
  formatPrice as fmtPrice,
  toUSD,
} from '../context/SessionContext';
import { socket, BACKEND_URL } from '../context/socket';
import { openVenmo, openPaypal, openCashApp } from '../lib/venmo';
import { Avatar, toneFor, Icon, Button, Squiggle, SketchCheck } from '../components/ui/index.js';

// ── Pure named exports — no socket/context inside (safe to unit-test) ─────

/**
 * ShareCard — tinted plate > white sum-card with item rows, Tax, Tip, You owe.
 * Props: rows [{name, myShare}], taxShare, tipShare, tipPercent (0 = hide label),
 *        total, host, currency
 */
export function ShareCard({ rows = [], taxShare = 0, tipShare = 0, tipPercent = 0, total = 0, host = '', currency = 'USD' }) {
  const fmt = (n) => fmtPrice(n, currency);
  return (
    <div className="plate">
      <div className="sum-card">
        {rows.length === 0 && (
          <div className="srow"><span className="nm" style={{ color: 'var(--ink-3)' }}>No items claimed yet</span></div>
        )}
        {rows.map((item, i) => (
          <div className="srow" key={i}>
            <span className="nm">{item.name}</span>
            <span className="pr mono">{fmt(item.myShare)}</span>
          </div>
        ))}
        {taxShare > 0 && (
          <div className="srow sub">
            <span>Tax</span>
            <span className="mono">{fmt(taxShare)}</span>
          </div>
        )}
        {tipShare > 0 && (
          <div className="srow sub">
            <span>Tip{tipPercent > 0 ? ` · ${tipPercent}%` : ''}</span>
            <span className="mono">{fmt(tipShare)}</span>
          </div>
        )}
        <div className="srow tot">
          <span className="nm">You owe {host}</span>
          <span className="pr mono">{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * PaidList — settled-list of avatar + name + Paid/Pending per person.
 * Props: people [{name, host, paid}], me (my name)
 */
export function PaidList({ people = [], me = '' }) {
  return (
    <div className="settled-list">
      {people.map((p) => (
        <div className="srow" key={p.name} style={{ borderColor: 'var(--line-2)' }}>
          <span className="split-meta">
            <Avatar name={p.name} tone={p.name === me ? 'gold' : toneFor(p.name)} size={28} />
            <span style={{ fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
              {p.name === me ? 'You' : p.name}
              {p.host && <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}> · host</span>}
            </span>
          </span>
          {p.paid
            ? <span className="split-meta" style={{ color: 'var(--sage)', fontWeight: 700 }}>
                <Icon name="check" size={15} stroke={2.6} /> Paid
              </span>
            : <span className="cap">Pending</span>
          }
        </div>
      ))}
    </div>
  );
}

// ── Default export: route component ───────────────────────────────────────

export default function Summary() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { state, dispatch } = useSession();

  const myName   = state.currentUser?.name;
  const isHost   = state.currentUser?.isHost;
  const currency = state.currency || 'USD';
  const isForeign = currency !== 'USD';
  const hostLabel = state.hostDisplayName || state.hostName;

  // ── Money (unit model) ──────────────────────────────────────────────
  const me = calculatePersonTotal(state, myName);
  const rows = me.claimedItems || [];   // [{name, myShare}]
  const { taxShare, tipShare, total } = me;
  const tipPercent = (state.tipMode !== 'dollar' && state.tipPercent > 0) ? state.tipPercent : 0;
  const venmoAmount = toUSD(total, state.exchangeRate);

  // ── Payment state (two-step: pay → confirm; server authoritative) ───
  const myPayment = state.payments?.find(p => p.guestName === myName);
  const myStatus  = myPayment?.status || (myPayment?.paid ? 'paid' : 'unpaid');
  const isPaid    = myStatus === 'paid' || myStatus === 'confirmed';

  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [payMethod, setPayMethod] = useState('venmo'); // which rail they tapped (for "Re-open X")

  // Which payment rails the host offered (Venmo always; PayPal / Cash App optional).
  const METHOD_LABEL = { venmo: 'Venmo', paypal: 'PayPal', cashapp: 'Cash App' };
  const payMethods = [];
  if (state.venmoHandle) payMethods.push('venmo');
  if (state.paypalHandle) payMethods.push('paypal');
  if (state.cashtag) payMethods.push('cashapp');

  // ── Change-detection (totals-based, not per-claim) ──────────────────
  // Snapshot total at the moment the guest confirms payment. On each items-updated
  // recompute and compare — if it shifted ≥ $0.01 after they've paid, show banner.
  // After reload, use the server-stored paidTotal as the baseline so the alert
  // survives page refreshes.
  const paidTotalRef  = useRef(null);   // total at time of confirm (immediate, pre-reload)
  const [changeAlert, setChangeAlert] = useState(null);
  // { prevTotal, newTotal }
  const prevTotalRef  = useRef(total);  // keep in sync after dismiss

  // Keep a live ref to state so the items-updated closure never reads stale settings
  // (tipPercent, tax, discount can change after mount).
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  // ── Socket setup (mirrors ClaimItems mount) ─────────────────────────
  useEffect(() => {
    if (!socket) return;
    if (!socket.connected) socket.connect();

    const identity = {
      sessionId,
      guestName: myName,
      isHost: state.currentUser?.isHost,
    };
    socket.emit('rejoin-room', identity);

    fetch(`${BACKEND_URL}/api/session/${sessionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((session) => { if (session) dispatch({ type: 'LOAD_SESSION', session }); })
      .catch(() => {});

    function onSyncItems({ items }) {
      dispatch({ type: 'SYNC_ITEMS', items });

      // Re-express change detection on totals (not on item.claims array).
      // Use stateRef so tipPercent/tax/discount/exchangeRate are always current.
      if (!myName) return;
      const freshState = { ...stateRef.current, items };
      const newTotal = calculatePersonTotal(freshState, myName).total;

      // Baseline: server-stored paidTotal (survives reload) OR local ref (same session).
      const myPmt = stateRef.current.payments?.find(p => p.guestName === myName);
      const baseline = myPmt?.paidTotal ?? paidTotalRef.current;

      // Only alert if already paid and the total shifted materially
      if (baseline !== null && (myPmt?.status === 'paid' || myPmt?.status === 'confirmed') &&
          Math.abs(newTotal - baseline) >= 0.01) {
        setChangeAlert({ prevTotal: baseline, newTotal });
      } else if (baseline === null && Math.abs(newTotal - prevTotalRef.current) >= 0.01) {
        // Not yet paid but total changed — update ref silently (no blocking banner pre-pay)
        prevTotalRef.current = newTotal;
      }
    }

    function onPaymentUpdated({ payments }) {
      if (payments) dispatch({ type: 'SYNC_PAYMENTS', payments });
    }

    function onGuestJoined({ guests }) {
      dispatch({ type: 'SYNC_GUESTS', guests });
    }

    function onSessionUpdated(session) {
      if (session) dispatch({ type: 'LOAD_SESSION', session });
    }

    function onReconnect() {
      socket.emit('rejoin-room', identity);
    }

    socket.on('items-updated',   onSyncItems);
    socket.on('payment-updated', onPaymentUpdated);
    socket.on('guest-joined',    onGuestJoined);
    socket.on('session-updated', onSessionUpdated);
    socket.on('connect',         onReconnect);

    return () => {
      socket.off('items-updated',   onSyncItems);
      socket.off('payment-updated', onPaymentUpdated);
      socket.off('guest-joined',    onGuestJoined);
      socket.off('session-updated', onSessionUpdated);
      socket.off('connect',         onReconnect);
    };
  }, [dispatch, sessionId, myName, state.currentUser?.isHost]);   // eslint-disable-line react-hooks/exhaustive-deps

  function dismissAlert() {
    // Re-snapshot so a second change is caught relative to the new baseline
    paidTotalRef.current = changeAlert?.newTotal ?? total;
    prevTotalRef.current = changeAlert?.newTotal ?? total;
    setChangeAlert(null);
  }

  // ── Pay → confirm (works for any rail) ───────────────────────────────
  function handlePay(method) {
    if (!myName || isHost) return;
    if (changeAlert) return; // block until acknowledged
    setPayMethod(method);
    if (method === 'paypal') {
      // PayPal.me takes a native currency suffix, so send the local amount.
      openPaypal({ handle: state.paypalHandle, amount: total, currency });
    } else if (method === 'cashapp') {
      // Cash App is USD-centric — send the USD-converted amount.
      openCashApp({ handle: state.cashtag, amount: venmoAmount });
    } else {
      const noteText = isForeign
        ? `Split the Check — my share (${fmtPrice(total, currency)} → USD)`
        : `Split the Check — my share`;
      openVenmo({ handle: state.venmoHandle, amount: venmoAmount, note: noteText });
    }
    setAwaitingConfirm(true);
  }
  // Catch-all for cash, Apple Cash, Zelle, etc. — no app to open, just assert.
  function paidAnotherWay() {
    if (!myName || isHost) return;
    if (changeAlert) return;
    confirmPaid();
  }

  function confirmPaid() {
    // Snapshot the total at the moment the guest asserts they paid (not at Venmo tap).
    // This is the immediate/local baseline; the server computes its own paidTotal
    // snapshot independently and that value (myPayment?.paidTotal) is the durable
    // baseline that survives page reloads.
    paidTotalRef.current = total;
    prevTotalRef.current = total;
    if (socket) socket.emit('mark-paid', { sessionId });
    dispatch({ type: 'MARK_PAID', guestName: myName, status: 'paid' });
    setAwaitingConfirm(false);
  }

  function undoPaid() {
    if (socket) socket.emit('reset-paid', { sessionId, guestName: myName });
    dispatch({ type: 'MARK_PAID', guestName: myName, status: 'unpaid' });
  }

  // ── PaidList data ───────────────────────────────────────────────────
  const allTotals = calculateAllPersonTotals(state);
  const allParticipants = getAllParticipants(state);
  const paidListPeople = allParticipants
    .filter((name) => {
      // Always include the host; include guests who owe > 0
      if (name === state.hostName) return true;
      return (allTotals[name]?.total ?? 0) > 0;
    })
    .map((name) => {
      const payment = state.payments?.find(p => p.guestName === name);
      const status  = payment?.status || (payment?.paid ? 'paid' : 'unpaid');
      return {
        name,
        host: name === state.hostName,
        paid: name === state.hostName || status === 'paid' || status === 'confirmed',
      };
    });

  // Amount the guest paid (for Settled screen)
  const paidAmount = paidTotalRef.current ?? total;

  // ────────────────────────────────────────────────────────────────────
  // SETTLED state
  // ────────────────────────────────────────────────────────────────────
  if (isPaid && !awaitingConfirm) {
    return (
      <div className="app-shell">
        <div className="app-body pg settled">
          <div className="settled-mark">
            <div className="disc">
              <SketchCheck size={34} />
            </div>
            <Squiggle
              width={120}
              color="var(--sage)"
              style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)' }}
            />
          </div>

          <div className="disp" style={{ fontSize: '2.2rem', position: 'relative', zIndex: 2 }}>
            All <span className="serif-i" style={{ color: 'var(--sage)' }}>squared up.</span>
          </div>

          <p className="lead" style={{ marginTop: 12, position: 'relative', zIndex: 2 }}>
            You paid {hostLabel} {fmtPrice(paidAmount, currency)}.{' '}
            The whole table can see it&apos;s handled.
          </p>

          <PaidList people={paidListPeople} me={myName} />

          <div style={{ flex: 1 }} />

          {/* Undo: visible only when guest-asserted (status 'paid'), hidden once host confirms */}
          {myStatus === 'paid' && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Button variant="ghost" onClick={undoPaid} style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                Not yet? Undo
              </Button>
            </div>
          )}

          <Button
            variant="soft"
            icon="rotate-ccw"
            style={{ marginTop: 16 }}
            onClick={() => { dispatch({ type: 'RESET' }); navigate('/'); }}
          >
            Start a new check
          </Button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // YOUR SHARE state (unpaid / awaiting confirm)
  // ────────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <div className="app-body pg">

        {/* ── Change alert banner (post-pay total shift) ───────────── */}
        {changeAlert && (
          <div style={{
            padding: '16px',
            borderRadius: 'var(--r-card)',
            background: 'var(--clay-soft)',
            border: '1.5px solid var(--clay-edge)',
            marginBottom: '16px',
          }}>
            <p style={{ fontWeight: 700, fontSize: '0.938rem', color: 'var(--clay-deep)', marginBottom: 6 }}>
              Heads up — your total changed after you paid
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--ink-2)', marginBottom: 12, lineHeight: 1.5 }}>
              Was {fmtPrice(changeAlert.prevTotal, currency)}, now {fmtPrice(changeAlert.newTotal, currency)}.
            </p>
            <Button variant="ghost" onClick={dismissAlert} style={{ width: '100%' }}>
              Got it
            </Button>
          </div>
        )}

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div className="sum-hero">
          <div className="disp" style={{ fontSize: '2.15rem' }}>
            Your share, <span className="serif-i">{myName}</span>
          </div>
          <p className="cap" style={{ marginTop: 6 }}>Just what you ordered — split fair.</p>
        </div>

        {/* ── ShareCard ────────────────────────────────────────────── */}
        <ShareCard
          rows={rows}
          taxShare={taxShare}
          tipShare={tipShare}
          tipPercent={tipPercent}
          total={total}
          host={hostLabel}
          currency={currency}
        />

        {isForeign && (
          <p className="cap" style={{ textAlign: 'center', marginTop: 10 }}>
            {fmtPrice(total, currency)} ≈ ${venmoAmount.toFixed(2)} USD
            <span style={{ marginLeft: 6, opacity: 0.7 }}>(rate: 1 {currency} = ${Number(state.exchangeRate).toFixed(4)})</span>
          </p>
        )}

        <div style={{ flex: 1 }} />

        {/* ── Payment area ─────────────────────────────────────────── */}
        {isHost ? (
          <p className="cap" style={{ textAlign: 'center', marginTop: 24 }}>
            You&apos;re the host — you&apos;ll collect payments from everyone else.
          </p>
        ) : awaitingConfirm ? (
          /* Returned from the payment app — confirm it went through */
          <div style={{
            background: 'var(--panel)',
            borderRadius: 'var(--r-card)',
            boxShadow: 'var(--sh-card)',
            padding: '18px 20px',
            marginTop: 16,
          }}>
            <p style={{ fontWeight: 700, marginBottom: 4 }}>Did you send the payment?</p>
            <p className="cap" style={{ marginBottom: 14 }}>
              Only confirm if {METHOD_LABEL[payMethod] || 'the payment'} actually went through — the host sees this.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="clay" style={{ flex: 1 }} onClick={confirmPaid}>
                Yes, I paid {hostLabel}
              </Button>
              <Button variant="ghost" onClick={() => setAwaitingConfirm(false)}>
                Not yet
              </Button>
            </div>
            <Button
              variant="soft"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => handlePay(payMethod)}
            >
              Re-open {METHOD_LABEL[payMethod] || 'app'}
            </Button>
          </div>
        ) : (
          /* Pay CTAs — one per rail the host offered, plus a manual fallback */
          <>
            {payMethods.map((m, i) => (
              <Button
                key={m}
                variant={i === 0 ? 'clay' : 'soft'}
                icon={i === 0 ? 'arrow-right' : undefined}
                style={{ marginTop: i === 0 ? 20 : 10 }}
                disabled={!!changeAlert}
                onClick={() => handlePay(m)}
              >
                {m === 'venmo'
                  ? `Pay ${hostLabel} ${fmtPrice(total, currency)}`
                  : `Pay with ${METHOD_LABEL[m]}`}
              </Button>
            ))}
            <p className="pay-note">
              {payMethods.length > 1
                ? <>Pick a method · the host sees who&rsquo;s paid</>
                : <>Sent instantly <b>via Venmo</b> · you both get a receipt</>}
            </p>
            <button
              type="button"
              onClick={paidAnotherWay}
              disabled={!!changeAlert}
              style={{
                marginTop: 4, alignSelf: 'center', background: 'none', border: 'none',
                color: 'var(--ink-3)', fontSize: '0.85rem', fontWeight: 600,
                cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: 8,
              }}
            >
              I paid {hostLabel} another way
            </button>
          </>
        )}

        {/* ── Confirmed by host badge ─────────────────────────────── */}
        {myStatus === 'confirmed' && (
          <p className="cap" style={{ textAlign: 'center', marginTop: 12, color: 'var(--sage)' }}>
            ✓ {hostLabel} confirmed your payment
          </p>
        )}

        <Button
          variant="ghost"
          style={{ marginTop: 16, alignSelf: 'center', fontSize: '0.875rem' }}
          onClick={() => navigate(`/claim/${sessionId}`)}
        >
          Edit my items
        </Button>
      </div>
    </div>
  );
}
