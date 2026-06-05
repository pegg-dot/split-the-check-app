import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon } from '../components/ui';

export default function JoinCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  function handleContinue(e) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    navigate('/session/' + trimmed);
  }

  return (
    <div className="app-shell">
      <div className="app-body pg">
        <button
          className="back-btn"
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)', fontSize: '0.95rem', padding: '4px 0', marginBottom: 24 }}
        >
          <Icon name="arrow-left" size={18} stroke={2} />
          Back
        </button>

        <h1 className="h1" style={{ marginBottom: 8 }}>Join with a code</h1>
        <p className="lead" style={{ marginBottom: 28 }}>Enter the session code from your friend.</p>

        <form onSubmit={handleContinue} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            className="field"
            type="text"
            placeholder="Session code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button icon="arrow-right" disabled={!code.trim()} onClick={handleContinue}>
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
