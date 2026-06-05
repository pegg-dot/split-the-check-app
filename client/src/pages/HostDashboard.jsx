import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession, calculateAllPersonTotals, calculateUnaccounted, getAllParticipants, formatPrice as fmtPrice, round2 } from '../context/SessionContext';
import { socket, BACKEND_URL } from '../context/socket';
import { Avatar, toneFor, Icon, Button } from '../components/ui/index.js';
import { recordSplit } from '../lib/history';

// ─── Pure helper ────────────────────────────────────────────────────────────

function fmt(price, currency) {
  return fmtPrice(price, currency || 'USD');
}

// ─── Pure named exports (testable without full app context) ─────────────────

export function CollectedMeter({ collected, expected, currency }) {
  const pct = expected > 0 ? Math.min(100, (collected / expected) * 100) : 0;
  return (
    <div className="meter-wrap">
      <div className="meter-top">
        <span className="cap" style={{ fontWeight: 600 }}>Collected</span>
        <span className="mono" style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
          {fmt(collected, currency)} / {fmt(expected, currency)}
        </span>
      </div>
      <div className="meter">
        <i style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

export function PersonRow({
  person,
  currency,
  onConfirm,
  onMarkPaid,
  onReset,
  onRemove,
  onRemind,
}) {
  const {
    name,
    isHost,
    total = 0,
    paid,
    status,
    stale,
    staleDelta,
    paidTotal,
    claimedItems = [],
    items = [],
    taxShare = 0,
    tipShare = 0,
    adminFeeShare = 0,
  } = person;

  // Support both claimedItems (real app) and items (test prop)
  const displayItems = claimedItems.length > 0 ? claimedItems : items;
  const fees = round2(taxShare + tipShare + (adminFeeShare || 0));

  const isPaid = paid || status === 'paid' || status === 'confirmed';
  const isConfirmed = status === 'confirmed';

  return (
    <div className={`pcard${isPaid && !isHost ? ' ispaid' : ''}`}>
      <div className="pcard-top">
        <Avatar name={name} tone={toneFor(name)} size={32} />
        <span className="nm">
          {name}
          {isHost && <span className="you-tag">· host</span>}
        </span>
        {!isHost && (
          <span className={`pill-pay ${isPaid ? 'paid' : 'pend'}`}>
            {isConfirmed ? 'Confirmed' : isPaid ? 'Paid' : 'Pending'}
          </span>
        )}
        <span className="amt mono">{fmt(total, currency)}</span>
      </div>

      {/* Stale-payment guard: total moved after they were marked paid */}
      {stale && (
        <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: 'var(--clay-soft)', border: '1px solid var(--clay-edge)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--clay-deep)' }}>
            Paid for {fmt(paidTotal, currency)}, now {fmt(total, currency)}
            {staleDelta != null && staleDelta > 0
              ? ` — owes ${fmt(staleDelta, currency)} more`
              : staleDelta != null
              ? ` — overpaid ${fmt(-(staleDelta || 0), currency)}`
              : ''}
          </span>
        </div>
      )}

      {/* Item rows */}
      {displayItems.length > 0 && (
        <div className="pitems">
          {displayItems.map((it, k) => (
            <div className="pi" key={k}>
              <span>{it.name}</span>
              <span className="mono">{fmt(it.myShare ?? it.share ?? 0, currency)}</span>
            </div>
          ))}
          {fees > 0 && (
            <div className="pi" style={{ opacity: 0.8 }}>
              <span>Tax + tip</span>
              <span className="mono">{fmt(fees, currency)}</span>
            </div>
          )}
        </div>
      )}

      {/* Host action buttons for non-host guests */}
      {!isHost && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {/* Confirm received — guest said they paid, host verifies */}
          {status === 'paid' && onConfirm && (
            <button
              className="btn btn-soft"
              style={{ fontSize: '0.8rem', padding: '5px 13px' }}
              onClick={() => onConfirm(name)}
            >
              Confirm received
            </button>
          )}
          {/* Undo a confirmed/paid mark */}
          {(status === 'paid' || status === 'confirmed') && onReset && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '4px 10px', color: 'var(--ink-3)' }}
              onClick={() => onReset(name)}
            >
              Undo
            </button>
          )}
          {/* Mark cash-paid — only for unpaid guests with items */}
          {status !== 'paid' && status !== 'confirmed' && displayItems.length > 0 && onMarkPaid && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.8rem', padding: '5px 13px' }}
              onClick={() => onMarkPaid(name)}
            >
              Mark paid (cash)
            </button>
          )}
          {/* Remind — for any unpaid/pending guest with a non-zero total */}
          {!isPaid && total > 0 && onRemind && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.8rem', padding: '5px 13px', color: 'var(--clay-deep)', borderColor: 'var(--clay-edge)' }}
              onClick={() => onRemind(person)}
            >
              Remind
            </button>
          )}
          {/* Remove guest */}
          {onRemove && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '4px 10px', color: 'var(--ink-3)' }}
              onClick={() => onRemove(name)}
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Default export: full page component ────────────────────────────────────

export default function HostDashboard() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { state, dispatch } = useSession();
  const [doneClaiming, setDoneClaiming] = useState([]);

  const formatPrice = (p) => fmtPrice(p, state.currency || 'USD');

  // ── Socket setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return; // guard: null in SSR/node test env

    const identity = { sessionId, guestName: state.hostName, isHost: true };

    if (!socket.connected) socket.connect();
    socket.emit('rejoin-room', identity);

    // Fetch fresh state via REST in case we missed socket events
    fetch(`${BACKEND_URL}/api/session/${sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then(session => {
        if (!session) return;
        dispatch({ type: 'LOAD_SESSION', session });
        if (session.doneClaiming) setDoneClaiming(session.doneClaiming);
        dispatch({ type: 'SET_HOST', name: session.hostName, venmoHandle: session.venmoHandle });
      })
      .catch(() => {});

    function onSyncItems({ items }) {
      dispatch({ type: 'SYNC_ITEMS', items });
    }
    function onGuestJoined({ guests }) {
      dispatch({ type: 'SYNC_GUESTS', guests });
    }
    function onPaymentUpdated({ payments }) {
      dispatch({ type: 'SYNC_PAYMENTS', payments });
    }
    function onClaimingUpdate({ doneClaiming: done }) {
      setDoneClaiming(done);
    }
    function onSessionUpdated(session) {
      if (!session) return;
      dispatch({ type: 'LOAD_SESSION', session });
      if (session.doneClaiming) setDoneClaiming(session.doneClaiming);
    }
    function onReconnect() {
      socket.emit('rejoin-room', identity);
    }

    // Use items-updated (not the old item-claimed/item-unclaimed/item-disputed)
    socket.on('items-updated', onSyncItems);
    socket.on('guest-joined', onGuestJoined);
    socket.on('payment-updated', onPaymentUpdated);
    socket.on('claiming-update', onClaimingUpdate);
    socket.on('session-updated', onSessionUpdated);
    socket.on('connect', onReconnect);

    return () => {
      socket.off('items-updated', onSyncItems);
      socket.off('guest-joined', onGuestJoined);
      socket.off('payment-updated', onPaymentUpdated);
      socket.off('claiming-update', onClaimingUpdate);
      socket.off('session-updated', onSessionUpdated);
      socket.off('connect', onReconnect);
    };
  }, [dispatch, sessionId, state.hostName]);

  // ── Build per-person data ─────────────────────────────────────────────────
  const everyone = useMemo(() => {
    const allTotals = calculateAllPersonTotals(state);
    return getAllParticipants(state).map(name => {
      const t = allTotals[name] || {};
      const payment = state.payments.find(p => p.guestName === name);
      const total = t.total || 0;
      const status = name === state.hostName
        ? 'host'
        : (payment?.status || (payment?.paid ? 'paid' : 'unpaid'));
      const paid = name === state.hostName ? true : (status === 'paid' || status === 'confirmed');
      const stale = (status === 'paid' || status === 'confirmed')
        && payment?.paidTotal != null
        && Math.abs(total - payment.paidTotal) >= 0.01;
      const staleDelta = stale ? round2(total - payment.paidTotal) : 0;
      return {
        name,
        isHost: name === state.hostName,
        total,
        paidTotal: payment?.paidTotal ?? null,
        stale,
        staleDelta,
        itemsTotal: t.itemsTotal || 0,
        taxShare: t.taxShare || 0,
        tipShare: t.tipShare || 0,
        adminFeeShare: t.adminFeeShare || 0,
        paid,
        status,
        claimedItems: t.claimedItems || [],
      };
    });
  }, [state]);

  const guests = everyone.filter(p => !p.isHost);
  const expected = round2(guests.reduce((s, p) => round2(s + p.total), 0));
  const collected = round2(guests.filter(p => p.paid).reduce((s, p) => round2(s + p.total), 0));
  const owingGuests = guests.filter(p => p.total > 0);
  const allSettled = owingGuests.length > 0 && owingGuests.every(p => p.paid);

  // Dollar amount unclaimed by anyone
  const { totalUnaccounted } = calculateUnaccounted(state);

  // Guests still in the middle of claiming
  const stillClaiming = state.guests
    .map(g => g.name)
    .filter(name => name !== state.hostName && !doneClaiming.includes(name));

  // Keep on-device history entry fresh
  useEffect(() => {
    if (!sessionId || getAllParticipants(state).length === 0) return;
    recordSplit({
      sessionId,
      hostName: state.hostName,
      currency: state.currency,
      total: round2(everyone.reduce((s, p) => round2(s + p.total), 0)),
      guests: state.guests.length,
    });
  }, [sessionId, state.hostName, state.currency, state.guests.length, everyone]);

  // ── Host actions ──────────────────────────────────────────────────────────

  // Host marks a guest as paid (cash). Sets status: 'paid'.
  function hostMarkPaid(guestName) {
    if (!socket) return;
    socket.emit('mark-paid', { sessionId, guestName });
    dispatch({ type: 'MARK_PAID', guestName, status: 'paid' });
  }

  // Host confirms a guest-asserted payment actually arrived. Sets status: 'confirmed'.
  function hostConfirm(guestName) {
    if (!socket) return;
    socket.emit('confirm-paid', { sessionId, guestName });
    dispatch({ type: 'MARK_PAID', guestName, status: 'confirmed' });
  }

  // Undo a payment mark (host resets back to unpaid).
  function resetPaid(guestName) {
    if (!socket) return;
    socket.emit('reset-paid', { sessionId, guestName });
    dispatch({ type: 'MARK_PAID', guestName, status: 'unpaid' });
  }

  // One-tap resolve the unclaimed remainder.
  function resolveLeftover(mode) {
    if (!socket) return;
    socket.emit('resolve-leftover', { sessionId, mode });
  }

  // Remove a guest who joined by mistake.
  function removeGuest(name) {
    if (!socket) return;
    if (!window.confirm(`Remove ${name} from this split? Their claims will be released.`)) return;
    socket.emit('remove-guest', { sessionId, guestName: name });
  }

  // Nudge an unpaid guest with their amount + join link.
  async function remind(person) {
    const link = `${window.location.origin}/session/${sessionId}`;
    const amount = formatPrice(person.total);
    const msg = `Hey ${person.name}! You owe ${amount} for the bill. Pay ${state.hostDisplayName || state.hostName} here: ${link}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Split the Check', text: msg }); return; } catch { /* cancelled */ }
    }
    const sms = `sms:?&body=${encodeURIComponent(msg)}`;
    try {
      window.location.href = sms;
    } catch {
      try { await navigator.clipboard.writeText(msg); alert('Reminder copied to clipboard'); } catch {}
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <div className="app-body pg">

        {/* Header */}
        <div className="dash-h">
          <div className="disp" style={{ fontSize: '1.9rem' }}>
            Who owes <span className="serif-i">what</span>
          </div>
          <p className="cap" style={{ marginTop: 4 }}>Updates live as people pay you.</p>
        </div>

        {/* Collected meter */}
        <CollectedMeter
          collected={collected}
          expected={expected}
          currency={state.currency || 'USD'}
        />

        {/* Unclaimed amount note */}
        {totalUnaccounted >= 0.01 && (
          <div style={{ padding: '10px 14px', borderRadius: 'var(--r-lg)', background: 'var(--clay-soft)', border: '1px solid var(--clay-edge)', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--clay-deep)' }}>
              {formatPrice(totalUnaccounted)} unclaimed — on your tab
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 12px' }} onClick={() => resolveLeftover('me')}>
                Put leftovers on me
              </button>
              <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 12px' }} onClick={() => resolveLeftover('split')}>
                Split evenly
              </button>
            </div>
          </div>
        )}

        {/* Still claiming notice */}
        {stillClaiming.length > 0 && (
          <div style={{ padding: '8px 14px', borderRadius: 'var(--r-lg)', background: '#e8f0fe', border: '1px solid #a8c4f8', marginBottom: 14, textAlign: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1a56db' }}>
              Still claiming: {stillClaiming.join(', ')}
            </span>
          </div>
        )}

        {/* Per-person cards */}
        <div>
          {everyone.map(person => (
            <PersonRow
              key={person.name}
              person={person}
              currency={state.currency || 'USD'}
              onConfirm={hostConfirm}
              onMarkPaid={hostMarkPaid}
              onReset={resetPaid}
              onRemove={removeGuest}
              onRemind={remind}
            />
          ))}
        </div>

        {/* No guests yet */}
        {guests.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p className="muted">No guests have joined yet.</p>
            <p className="cap muted" style={{ marginTop: 4 }}>Share the QR code to get started</p>
          </div>
        )}

        {/* "All settled up." flourish */}
        {allSettled && (
          <div className="settled" style={{ padding: '22px 0 4px', textAlign: 'center' }}>
            <div className="disp" style={{ fontSize: '1.5rem' }}>
              All <span className="serif-i" style={{ color: 'var(--sage)' }}>settled up.</span>
            </div>
            <p className="cap muted" style={{ marginTop: 4 }}>Everyone has paid their share.</p>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Footer actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
          <Button variant="soft" icon="hand" onClick={() => navigate(`/claim/${sessionId}`)}>
            Claim my items
          </Button>
          {allSettled && (
            <Button variant="ghost" icon="check-circle" onClick={() => navigate('/')}>
              Done — Close Session
            </Button>
          )}
        </div>

      </div>
    </div>
  );
}
