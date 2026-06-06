import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon } from '../components/ui';
import QrScanner from '../components/QrScanner';
import { normalizeSessionCode } from '../lib/sessionCode';

export default function JoinCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);

  function goTo(raw) {
    const c = normalizeSessionCode(raw);
    if (c) navigate('/session/' + c);
  }
  function handleContinue(e) {
    e.preventDefault();
    goTo(code);
  }
  function handleScanResult(text) {
    setScanning(false);
    goTo(text);
  }

  return (
    <div className="app-shell">
      <div className="app-body pg">
        <button
          className="back"
          onClick={() => navigate('/')}
          style={{ marginBottom: 24 }}
        >
          <Icon name="arrow-left" size={16} stroke={2.2} /> Back
        </button>

        <h1 className="h1" style={{ marginBottom: 8 }}>Join the split</h1>
        <p className="lead" style={{ marginBottom: 28 }}>
          Scan your friend&rsquo;s QR code — or type the code they read you.
        </p>

        {/* Scan — the easy path, for anyone who doesn't know to use the camera app */}
        <Button icon="camera" onClick={() => setScanning(true)}>
          Scan QR code
        </Button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          <span className="cap">or enter the code</span>
          <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        </div>

        <form onSubmit={handleContinue} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <input
              type="text"
              inputMode="text"
              placeholder="e.g. B6KP4Q"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={12}
              style={{ textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, textAlign: 'center', fontSize: '1.15rem' }}
            />
          </div>
          <Button variant="soft" icon="arrow-right" type="submit" disabled={!normalizeSessionCode(code)}>
            Continue
          </Button>
        </form>
      </div>

      {scanning && (
        <QrScanner onResult={handleScanResult} onClose={() => setScanning(false)} />
      )}
    </div>
  );
}
