import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession, currencySymbol } from '../context/SessionContext';
import { BACKEND_URL } from '../context/socket';
import { Icon, Button } from '../components/ui';

export default function ScanReceipt() {
  const navigate = useNavigate();
  const { state, dispatch } = useSession();
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);

  // 'choose' | 'preview' | 'scanning'
  const [stage, setStage]                   = useState('choose');
  const [preview, setPreview]               = useState(null);
  const [error, setError]                   = useState(null);
  // Holds raw scan data when waiting for the host to confirm a currency switch
  const [pendingScanData, setPendingScanData] = useState(null);

  // ── image helpers ──────────────────────────────────────────────────────────

  // Downscale/compress image to stay under Claude's 5 MB base64 limit
  async function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          // Max dimension 1800px keeps receipts readable while shrinking the payload
          const MAX_DIM = 1800;
          let { width, height } = img;
          if (width > MAX_DIM || height > MAX_DIM) {
            const scale = MAX_DIM / Math.max(width, height);
            width  = Math.round(width  * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          // Try quality steps until base64 fits under ~4.5 MB (safe margin)
          let quality = 0.9;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          while (dataUrl.length > 4_500_000 && quality > 0.3) {
            quality -= 0.1;
            dataUrl  = canvas.toDataURL('image/jpeg', quality);
          }
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    setError(null);
    try {
      const compressed = await compressImage(file);
      setPreview(compressed);
      setStage('preview');
    } catch {
      setError('Could not read that image. Try another photo.');
    }
  }

  // ── OCR scan ───────────────────────────────────────────────────────────────

  async function handleScan() {
    if (!preview) return;
    setStage('scanning');
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/scan-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: preview }),
      });

      // Surface the server's real message (AI disabled 503, rate-limit 429, etc.)
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to scan receipt. Please try again.');
      }

      if (!data.items || data.items.length === 0) {
        throw new Error('No items found on the receipt. Try a clearer photo.');
      }

      const detectedCurrency = (data.currency || 'USD').toUpperCase();
      const sessionCurrency  = (state.currency || 'USD').toUpperCase();

      // If the receipt currency differs from what the host chose, pause and ask.
      // Never silently switch — always require explicit confirmation.
      if (detectedCurrency !== sessionCurrency) {
        console.log(`[ScanReceipt] Currency mismatch: session=${sessionCurrency}, receipt=${detectedCurrency}`);
        setPendingScanData(data);
        setStage('preview'); // return to preview state while modal is shown
        return; // hold — do not dispatch or navigate yet
      }

      // Currencies match — commit immediately
      applyAndNavigate(data, detectedCurrency);
    } catch (err) {
      setError(err.message);
      setStage('preview'); // return to preview so user can retry or change photo
    }
  }

  // ── commit helpers ─────────────────────────────────────────────────────────

  // Commit scan data to state and move to review.
  // `useCurrency` is the currency the host chose to use (may differ from what was detected).
  function applyAndNavigate(data, useCurrency) {
    dispatch({ type: 'SET_ITEMS',      items: data.items });
    dispatch({ type: 'SET_TAX',        tax: data.tax || 0, taxNote: data.taxNote || '' });
    if (data.adminFee)    dispatch({ type: 'SET_ADMIN_FEE',    adminFee: data.adminFee });
    if (data.tipIncluded) dispatch({ type: 'SET_TIP_INCLUDED', tipIncluded: true, tipAmount: data.tipAmount || 0 });
    dispatch({ type: 'SET_SCAN_EXTRAS', discount: data.discount || 0, receiptTotal: data.total || 0 });
    dispatch({ type: 'SET_CURRENCY',    currency: useCurrency, exchangeRate: useCurrency === data.currency ? (data.exchangeRate || 1) : 1 });
    navigate('/review');
  }

  // Host confirmed: switch to the detected currency
  function handleConfirmSwitch() {
    const data = pendingScanData;
    setPendingScanData(null);
    applyAndNavigate(data, (data.currency || 'USD').toUpperCase());
  }

  // Host declined: keep the originally selected currency, use scan data as-is
  function handleKeepCurrency() {
    const data     = pendingScanData;
    const keepCurr = (state.currency || 'USD').toUpperCase();
    setPendingScanData(null);
    applyAndNavigate(data, keepCurr);
  }

  // ── back navigation ────────────────────────────────────────────────────────

  function handleBack() {
    if (stage === 'choose') {
      navigate('/setup');
    } else {
      setStage('choose');
      setPreview(null);
      setError(null);
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="pg">
      {/* Back button */}
      <button className="back" onClick={handleBack}>
        <Icon name="arrow-left" size={16} stroke={2.2} /> Back
      </button>

      {/* Header */}
      <div className="claim-head">
        <div className="h1">Snap the receipt</div>
        <p className="lead" style={{ marginTop: 4 }}>One photo. The AI reads the rest.</p>
      </div>

      {/* ── choose state ── */}
      {stage === 'choose' && (
        <div className="scan-tiles">
          <button className="scan-tile" onClick={() => cameraInputRef.current?.click()}>
            <span className="ic"><Icon name="camera" size={24} stroke={2} /></span>
            <span className="tx">
              <b>Use camera</b>
              <span>Point at the receipt</span>
            </span>
          </button>
          <button className="scan-tile" onClick={() => uploadInputRef.current?.click()}>
            <span className="ic"><Icon name="image" size={24} stroke={2} /></span>
            <span className="tx">
              <b>Upload a photo</b>
              <span>From your camera roll</span>
            </span>
          </button>
        </div>
      )}

      {/* ── preview + scanning states: receipt image frame ── */}
      {(stage === 'preview' || stage === 'scanning') && preview && (
        <div className="receipt-card">
          {stage === 'scanning' && <div className="scan-shimmer" />}
          <img
            src={preview}
            alt="Receipt preview"
            style={{ width: '100%', display: 'block', borderRadius: 'var(--r-md)' }}
          />
        </div>
      )}

      {/* Error display (shown in preview state) */}
      {error && stage === 'preview' && (
        <div className="card" style={{ borderColor: 'var(--clay)', background: 'var(--clay-soft)', marginTop: 12 }}>
          <p style={{ color: 'var(--clay-deep)', fontSize: '0.875rem', fontWeight: 500 }}>{error}</p>
          <button
            className="btn btn-soft btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => navigate('/review')}
          >
            Enter items manually instead
          </button>
        </div>
      )}

      {/* Error display (shown in choose state, e.g. file-read failure) */}
      {error && stage === 'choose' && (
        <div className="card" style={{ borderColor: 'var(--clay)', background: 'var(--clay-soft)', marginTop: 12 }}>
          <p style={{ color: 'var(--clay-deep)', fontSize: '0.875rem', fontWeight: 500 }}>{error}</p>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* ── preview CTAs ── */}
      {stage === 'preview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button icon="sparkles" onClick={handleScan}>Read it with AI</Button>
          <Button variant="ghost" onClick={() => { setStage('choose'); setPreview(null); setError(null); }}>
            Use a different photo
          </Button>
        </div>
      )}

      {/* ── scanning CTA area (spinner + labels) ── */}
      {stage === 'scanning' && (
        <div className="scanning">
          <div className="spin" />
          <p style={{ fontWeight: 700 }}>Reading your receipt…</p>
          <p className="cap">Claude is pulling out every item.</p>
        </div>
      )}

      {/* ── choose footer: manual entry escape hatch ── */}
      {stage === 'choose' && (
        <button
          className="btn btn-ghost"
          style={{ marginTop: 8 }}
          onClick={() => navigate('/review')}
        >
          Enter items manually
        </button>
      )}

      {/* Hidden file inputs */}
      {/* Camera input — opens camera directly on mobile */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      {/* Upload input — opens photo library / file picker */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* ── Currency mismatch confirmation modal ── */}
      {pendingScanData && (() => {
        const detected    = (pendingScanData.currency || 'USD').toUpperCase();
        const current     = (state.currency || 'USD').toUpperCase();
        const detectedSym = currencySymbol(detected);
        const currentSym  = currencySymbol(current);
        return (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200, padding: '24px',
          }}>
            <div style={{
              background: 'var(--bg)',
              borderRadius: 'var(--r-xl)',
              padding: '28px 24px',
              width: '100%', maxWidth: '380px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>💱</div>
              <h2 style={{ fontSize: '1.15rem', marginBottom: '10px' }}>Currency Mismatch</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--ink-3)', marginBottom: '20px', lineHeight: 1.5 }}>
                Your session is set to <strong>{current} ({currentSym})</strong>, but this receipt appears to be in{' '}
                <strong>{detected} ({detectedSym})</strong>.<br /><br />
                Would you like to switch the session to <strong>{detected}</strong>?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Button onClick={handleConfirmSwitch} style={{ fontSize: '0.95rem' }}>
                  Yes, switch to {detected} ({detectedSym})
                </Button>
                <Button variant="soft" onClick={handleKeepCurrency} style={{ fontSize: '0.95rem' }}>
                  No, keep {current} ({currentSym})
                </Button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
