import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { socket, BACKEND_URL } from '../context/socket';
import { Button, Icon, Blob } from '../components/ui';

export default function JoinSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { state, dispatch } = useSession();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hostName, setHostName] = useState('');

  // Fetch session info to display host name
  useEffect(() => {
    if (!sessionId) return;
    fetch(`${BACKEND_URL}/api/session/${sessionId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.hostName) setHostName(data.hostName); })
      .catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    if (!socket) return;
    if (!socket.connected) {
      socket.connect();
    }

    function onSessionState(session) {
      dispatch({ type: 'LOAD_SESSION', session });
      setLoading(false);
      navigate(`/claim/${sessionId}`);
    }

    function onError(err) {
      setError(err.message || 'Session not found');
      setLoading(false);
    }

    socket.on('session-state', onSessionState);
    socket.on('error', onError);

    return () => {
      socket.off('session-state', onSessionState);
      socket.off('error', onError);
    };
  }, [sessionId, dispatch, navigate]);

  function handleJoin(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!socket) return;
    setLoading(true);
    setError(null);

    dispatch({ type: 'JOIN_SESSION', name: name.trim() });
    socket.emit('join-session', { sessionId, guestName: name.trim() });
  }

  return (
    <div className="app-shell">
      <div className="app-body pg">
        <Blob tone="var(--clay-soft)" size={280} style={{ top: -60, right: -100, opacity: 0.65 }} />

        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--clay-soft)',
            border: '1.5px solid var(--clay-edge)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            position: 'relative',
            zIndex: 2,
          }}
        >
          <Icon name="hand" size={28} color="var(--clay-deep)" stroke={1.8} />
        </div>

        <h1 className="h1" style={{ position: 'relative', zIndex: 2, marginBottom: 8 }}>
          Join the split
        </h1>

        {hostName && (
          <p className="lead" style={{ position: 'relative', zIndex: 2, marginBottom: 28 }}>
            <strong>{hostName}</strong> wants to split the bill with you.
          </p>
        )}
        {!hostName && (
          <p className="lead" style={{ position: 'relative', zIndex: 2, marginBottom: 28 }}>
            Enter your name to claim your items.
          </p>
        )}

        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', zIndex: 2 }}>
          <div>
            <label
              htmlFor="guest-name"
              style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}
            >
              Your name
            </label>
            <input
              id="guest-name"
              className="field"
              type="text"
              placeholder="e.g. Alex"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              autoComplete="given-name"
            />
          </div>

          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                background: 'var(--color-accent-light, #fff0f0)',
                border: '1px solid var(--color-accent, #e55)',
              }}
            >
              <p style={{ color: 'var(--color-accent, #e55)', fontSize: '0.875rem', fontWeight: 500, margin: 0 }}>
                {error}
              </p>
            </div>
          )}

          <Button icon="arrow-right" disabled={!name.trim() || loading} onClick={handleJoin}>
            {loading ? 'Joining…' : 'Join the table'}
          </Button>
        </form>
      </div>
    </div>
  );
}
