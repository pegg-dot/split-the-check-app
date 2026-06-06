import { useState, useEffect, useRef } from 'react';
import { useSession } from '../context/SessionContext';
import { socket, BACKEND_URL } from '../context/socket';
import { QRCodeSVG } from 'qrcode.react';
import { BottomSheet, Button } from './ui';

export default function QROverlay() {
  const { state } = useSession();
  const [open, setOpen] = useState(false);
  const [sessionUrl, setSessionUrl] = useState('');

  // Build the correct join URL — resolve LAN IP if we're on localhost
  // so that the QR code works when scanned by phones on the same WiFi.
  // NOTE: useEffect must come BEFORE any early return (Rules of Hooks).
  useEffect(() => {
    if (!state.sessionId) return;

    async function buildUrl() {
      let origin = window.location.origin;
      if (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
      ) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/server-ip`);
          const { ip, port } = await res.json();
          origin = `http://${ip}:${port}`;
          console.log('[QROverlay] Resolved LAN origin:', origin);
        } catch (err) {
          console.warn('[QROverlay] Could not fetch server IP, using window.location.origin:', err);
        }
      }
      const url = `${origin}/session/${state.sessionId}`;
      console.log('[QROverlay] Session URL:', url);
      setSessionUrl(url);
    }

    buildUrl();
  }, [state.sessionId]);

  // Ref so the 'open-qr' event listener always calls the latest handleOpen
  // without needing to re-register on every render.
  const handleOpenRef = useRef(null);

  // Register 'open-qr' listener once — TipAndShare dispatches this event to
  // trigger the overlay without needing a prop-drilled callback.
  useEffect(() => {
    function onOpenQR() {
      if (handleOpenRef.current) handleOpenRef.current();
    }
    window.addEventListener('open-qr', onOpenQR);
    return () => window.removeEventListener('open-qr', onOpenQR);
  }, []);

  // Only render for hosts with an active session
  if (!state.sessionId || !state.currentUser?.isHost) return null;

  function handleOpen() {
    console.log('[QROverlay] Opening QR sheet, sessionUrl:', sessionUrl);
    if (socket && !socket.connected) socket.connect();
    socket && socket.emit('create-session', {
      sessionId: state.sessionId,
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
    setOpen(true);
  }

  // Keep the ref pointing at the latest handleOpen so the event listener always
  // calls it even after state updates.
  handleOpenRef.current = handleOpen;

  return (
    <>
      {/* Floating QR button — always visible to host for quick access */}
      <button
        onClick={handleOpen}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--clay)',
          color: '#fff',
          border: 'none',
          boxShadow: '0 8px 18px -4px color-mix(in srgb, var(--clay) 55%, transparent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 40,
          transition: 'transform 0.15s ease, background 0.15s ease',
        }}
        aria-label="Show QR Code"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="3" height="3" />
          <line x1="21" y1="14" x2="21" y2="14.01" />
          <line x1="21" y1="21" x2="21" y2="21.01" />
          <line x1="17" y1="21" x2="17" y2="21.01" />
          <line x1="14" y1="18" x2="14" y2="18.01" />
          <line x1="18" y1="18" x2="18" y2="18.01" />
        </svg>
      </button>

      {/* QR sheet — viewport-pinned BottomSheet */}
      <BottomSheet open={open && !!sessionUrl} onClose={() => setOpen(false)}>
        <div className="h2" style={{ marginBottom: 4 }}>Scan to join</div>
        <p className="cap" style={{ marginBottom: 20 }}>
          Everyone at the table — no app, no sign-up.
        </p>

        <div className="qrbox">
          <QRCodeSVG
            value={sessionUrl || 'https://placeholder'}
            size={192}
            level="M"
            bgColor="#ffffff"
            fgColor="#2B2620"
          />
        </div>

        {/* Read-aloud fallback for anyone whose camera won't scan */}
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-2)', borderRadius: 'var(--r-md)', textAlign: 'center' }}>
          <div className="cap" style={{ marginBottom: 4 }}>Can&rsquo;t scan? Enter this code</div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, letterSpacing: '0.22em', color: 'var(--ink)' }}>
            {state.sessionId}
          </div>
        </div>

        <p className="qrurl" style={{ marginTop: 12 }}>{sessionUrl}</p>

        <div style={{ marginTop: 18 }}>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
