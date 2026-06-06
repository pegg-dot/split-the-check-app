// ============================================================================
// Human-readable session codes.
// ----------------------------------------------------------------------------
// Codes double as the session id and as the thing a host reads aloud when a
// guest's camera won't scan the QR. So we keep them short and drop the
// ambiguous glyphs (no I/O/0/1/L) — a "B6KP4Q" is easy to dictate and type.
// ============================================================================

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars, no I O 0 1 L

export function generateSessionCode(len = 6) {
  const n = ALPHABET.length;
  let out = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % n];
  } else {
    for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * n)];
  }
  return out;
}

// Accepts a typed code, a pasted join link, or a scanned QR payload and returns
// just the code (upper-cased). Returns '' if there's nothing usable.
export function normalizeSessionCode(input) {
  if (!input) return '';
  let s = String(input).trim();
  const m = s.match(/\/session\/([^/?#\s]+)/i);   // ".../session/ABC123"
  if (m) s = m[1];
  else if (s.includes('/')) s = s.split('/').filter(Boolean).pop() || s;
  return s.trim().toUpperCase();
}
