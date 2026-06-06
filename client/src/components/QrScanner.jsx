import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Button, Icon } from './ui';

// Full-screen in-app QR scanner. Uses the native BarcodeDetector when present
// (Android/Chrome) and falls back to jsQR (iOS Safari, etc.). Browser camera
// access requires a secure context, so on a plain-http LAN this surfaces a
// friendly "use your camera app or type the code" message instead of failing
// silently.
export default function QrScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const doneRef = useRef(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let detector = null;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;

    const finish = (text) => {
      if (doneRef.current || !text) return;
      doneRef.current = true;
      onResult(text);
    };

    async function start() {
      // getUserMedia only exists in a secure context (https or localhost).
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('insecure');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true'); // iOS: don't go fullscreen
        await video.play();

        if ('BarcodeDetector' in window) {
          try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); }
          catch { detector = null; }
        }
        tick();
      } catch (err) {
        setError(err?.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      }
    }

    async function tick() {
      if (doneRef.current) return;
      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        if (detector) {
          try {
            const codes = await detector.detect(video);
            if (codes && codes.length) return finish(codes[0].rawValue);
          } catch { /* keep trying */ }
        } else {
          const w = video.videoWidth, h = video.videoHeight;
          if (w && h) {
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const found = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
            if (found?.data) return finish(found.data);
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();
    return () => {
      doneRef.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  const ERR_COPY = {
    insecure: 'In-app scanning needs a secure connection. Open your phone’s camera app to scan the QR, or type the code below.',
    denied: 'Camera permission was denied. Allow camera access, use your phone’s camera app, or type the code below.',
    unavailable: 'Couldn’t start the camera. Use your phone’s camera app to scan the QR, or type the code below.',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Close */}
      <button
        onClick={onClose}
        aria-label="Close scanner"
        style={{ position: 'absolute', top: 'calc(12px + env(safe-area-inset-top, 0px))', right: 16, zIndex: 2, width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="x" size={22} stroke={2.4} color="#fff" />
      </button>

      {error ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center', color: '#fff' }}>
          <Icon name="camera-off" size={40} stroke={1.8} color="#fff" />
          <p style={{ marginTop: 16, fontSize: '0.95rem', lineHeight: 1.5, maxWidth: 300, opacity: 0.9 }}>
            {ERR_COPY[error] || ERR_COPY.unavailable}
          </p>
          <Button variant="ghost" onClick={onClose} style={{ marginTop: 22, color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
            Enter code instead
          </Button>
        </div>
      ) : (
        <>
          <video ref={videoRef} style={{ flex: 1, width: '100%', objectFit: 'cover' }} muted playsInline />
          {/* Reticle */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: 230, height: 230, border: '3px solid rgba(255,255,255,0.9)', borderRadius: 20, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
          </div>
          <p style={{ position: 'absolute', bottom: 'calc(36px + env(safe-area-inset-bottom, 0px))', left: 0, right: 0, textAlign: 'center', color: '#fff', fontWeight: 600, fontSize: '0.95rem', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
            Point at your friend’s QR code
          </p>
        </>
      )}
    </div>
  );
}
