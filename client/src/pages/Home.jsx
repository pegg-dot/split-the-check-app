import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession, currencySymbol } from '../context/SessionContext';
import { BACKEND_URL } from '../context/socket';
import { getHistory } from '../lib/history';
import { Icon, Button } from '../components/ui';

export default function Home() {
  const navigate = useNavigate();
  const { state, dispatch } = useSession();
  const [name, setName] = useState('');
  const [venmo, setVenmo] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [verifying, setVerifying] = useState(false);
  const [venmoStatus, setVenmoStatus] = useState(null); // { valid, displayName, note, error }
  const [history] = useState(() =>
    typeof localStorage !== 'undefined' ? getHistory() : []
  );

  // A split restored from localStorage (refresh safety net) → offer to resume.
  const hasInProgress = (state.items && state.items.length > 0) || !!state.sessionId;
  function resumeInProgress() {
    if (state.sessionId) navigate(`/host/${state.sessionId}`);
    else navigate('/review');
  }
  function startNew() {
    dispatch({ type: 'RESET' });
  }

  const CURRENCIES = [
    { code: 'USD', label: 'USD — US Dollar ($)' },
    { code: 'EUR', label: 'EUR — Euro (€)' },
    { code: 'GBP', label: 'GBP — British Pound (£)' },
    { code: 'MXN', label: 'MXN — Mexican Peso (MX$)' },
    { code: 'CAD', label: 'CAD — Canadian Dollar (C$)' },
    { code: 'AUD', label: 'AUD — Australian Dollar (A$)' },
    { code: 'JPY', label: 'JPY — Japanese Yen (¥)' },
    { code: 'CHF', label: 'CHF — Swiss Franc (CHF)' },
  ];

  const canStart = name.trim() && venmo.trim() && venmoStatus?.valid;

  async function verifyVenmo(handle) {
    if (!handle.trim()) {
      setVenmoStatus(null);
      return;
    }
    setVerifying(true);
    setVenmoStatus(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/verify-venmo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: handle.trim() }),
      });
      const data = await res.json();
      setVenmoStatus(data);
    } catch {
      setVenmoStatus({ valid: true, note: 'Could not verify — please double-check your Venmo info' });
    } finally {
      setVerifying(false);
    }
  }

  function handleVenmoChange(e) {
    const val = e.target.value;
    setVenmo(val);
    setVenmoStatus(null);
  }

  function handleVenmoBlur() {
    if (venmo.trim()) {
      verifyVenmo(venmo);
    }
  }

  function handleStart(e) {
    e.preventDefault();
    if (!canStart) return;
    dispatch({ type: 'RESET' }); // clear any stale in-progress split before starting fresh
    dispatch({ type: 'SET_HOST', name: name.trim(), venmoHandle: venmo.trim(), hostDisplayName: venmoStatus?.displayName || null });
    dispatch({ type: 'SET_CURRENCY', currency, exchangeRate: 1 }); // rate fetched after scan
    navigate('/scan');
  }

  return (
    <div className="app-shell">
      <div className="app-body pg">

        {/* Back button */}
        <button className="back" onClick={() => navigate('/')}>
          <Icon name="arrow-left" size={16} stroke={2.2} /> Back
        </button>

        {/* Resume in-progress banner */}
        {hasInProgress && (
          <div className="field" style={{
            background: 'var(--clay-soft)',
            border: '1.5px solid var(--clay-edge)',
            borderRadius: 'var(--r-md)',
            padding: '14px 16px',
            marginBottom: '16px',
          }}>
            <p style={{ fontWeight: 700, marginBottom: '10px', fontSize: '0.93rem' }}>
              You have a split in progress{state.items?.length ? ` (${state.items.length} items)` : ''}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-clay"
                style={{ flex: 1, padding: '10px 14px', fontSize: '0.9rem' }}
                onClick={resumeInProgress}
              >
                Resume
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '10px 14px', fontSize: '0.9rem', width: 'auto' }}
                onClick={startNew}
              >
                Start new
              </button>
            </div>
          </div>
        )}

        {/* Heading */}
        <div className="claim-head">
          <div className="h1">
            First, <span className="serif-i" style={{ fontSize: '2rem' }}>you</span>.
          </div>
          <p className="lead" style={{ marginTop: 4 }}>So friends know who to pay.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleStart} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

          {/* Name field */}
          <div className="field">
            <label>Your name</label>
            <input
              type="text"
              placeholder="e.g. Sarah"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
            />
          </div>

          {/* Venmo field */}
          <div className="field">
            <label>Venmo username, phone, or email</label>
            <input
              className={venmoStatus?.valid ? 'ok' : ''}
              type="text"
              placeholder="e.g. @sarah-jones or (555) 123-4567"
              value={venmo}
              onChange={handleVenmoChange}
              onBlur={handleVenmoBlur}
              style={
                venmoStatus && !venmoStatus.valid
                  ? { borderColor: 'var(--clay)' }
                  : undefined
              }
            />

            {/* Verifying spinner */}
            {verifying && (
              <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 13, height: 13, border: '2px solid var(--line)', borderTopColor: 'var(--clay)',
                  borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0,
                }} />
                Verifying…
              </div>
            )}

            {/* Valid with displayName */}
            {venmoStatus && !verifying && venmoStatus.valid && venmoStatus.displayName && (
              <div className="hint ok">
                <Icon name="check" size={14} stroke={2.6} />
                {venmoStatus.displayName}
              </div>
            )}

            {/* Valid but just a note (could-not-verify fallback) */}
            {venmoStatus && !verifying && venmoStatus.valid && !venmoStatus.displayName && venmoStatus.note && (
              <div className="hint" style={{ color: 'var(--gold)' }}>
                ⚠ {venmoStatus.note}
              </div>
            )}

            {/* Valid, no displayName, no note */}
            {venmoStatus && !verifying && venmoStatus.valid && !venmoStatus.displayName && !venmoStatus.note && (
              <div className="hint ok">
                <Icon name="check" size={14} stroke={2.6} />
                Venmo account found
              </div>
            )}

            {/* Not valid */}
            {venmoStatus && !verifying && !venmoStatus.valid && (
              <div className="hint" style={{ color: 'var(--clay-deep)' }}>
                {venmoStatus.error || 'Venmo account not found'}
              </div>
            )}

            {/* Idle hint */}
            {!venmoStatus && !verifying && (
              <div className="hint">This is where your friends will send payment</div>
            )}
          </div>

          {/* Currency field */}
          <div className="field">
            <label>Receipt currency</label>
            <div className="sel">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <span className="lic">
                <Icon name="chevron-down" size={18} color="var(--ink-3)" />
              </span>
            </div>
            <div className="hint">The AI auto-detects this from your receipt too.</div>
          </div>

          {/* Spacer pushes CTA to bottom */}
          <div style={{ flex: 1 }} />

          {/* Sticky CTA */}
          <div style={{
            position: 'sticky', bottom: 0,
            padding: '12px 0 calc(8px + env(safe-area-inset-bottom, 0px))',
            background: 'var(--bg)',
          }}>
            <Button
              icon="camera"
              type="submit"
              disabled={!canStart || verifying}
            >
              Snap the receipt
            </Button>
          </div>
        </form>

        {/* Recent splits hosted on this device */}
        {history.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <p className="cap" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Recent splits
            </p>
            <div style={{ background: 'var(--panel)', border: '1.5px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '4px 0', boxShadow: 'var(--sh-soft)' }}>
              {history.map((h) => (
                <div
                  key={h.id}
                  onClick={() => navigate(`/host/${h.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 18px', cursor: 'pointer', borderBottom: '1px solid var(--line-2)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {h.hostName || 'Split'}
                    </span>
                    <span className="cap">
                      {h.guests} {h.guests === 1 ? 'guest' : 'guests'}
                    </span>
                  </div>
                  <span className="mono" style={{ fontWeight: 700, flexShrink: 0, marginLeft: 12 }}>
                    {currencySymbol(h.currency)}{(Number(h.total) || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
