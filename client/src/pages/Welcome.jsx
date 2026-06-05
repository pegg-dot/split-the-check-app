import { useNavigate } from 'react-router-dom';
import { Button, Squiggle, Blob } from '../components/ui';

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <div className="app-body pg wel">
        <Blob tone="var(--clay-soft)" size={320} style={{ top: -70, right: -110, opacity: 0.75 }} />
        <Blob tone="var(--sage-soft)" size={240} style={{ bottom: 20, left: -100, opacity: 0.6 }} />

        <div className="wel-mark">
          <img src="/logo-mark.svg" width="48" height="48" alt="" />
        </div>

        <h1 className="h1" style={{ fontSize: '2.45rem', position: 'relative', zIndex: 2 }}>
          Split the{' '}
          <span style={{ position: 'relative', display: 'inline-block' }}>
            check
            <Squiggle width={118} style={{ position: 'absolute', left: -2, bottom: -11 }} />
          </span>
        </h1>

        <p className="lead wel-sub" style={{ position: 'relative', zIndex: 2 }}>
          Pay for exactly what you ordered.
          <br />
          <span className="serif-i" style={{ fontSize: '1.15rem' }}>Nothing more, nothing less.</span>
        </p>

        <div className="wel-actions">
          <Button icon="camera" onClick={() => navigate('/setup')}>
            Snap the receipt
          </Button>
          <Button variant="soft" icon="qr-code" onClick={() => navigate('/join-code')}>
            Join with a code
          </Button>
        </div>
      </div>
    </div>
  );
}
