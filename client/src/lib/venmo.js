// ============================================================================
// Venmo payment links with a desktop/web fallback.
// ----------------------------------------------------------------------------
// The app-only deep link (venmo://) does nothing on desktop or when the Venmo
// app isn't installed — a guest on a laptop simply couldn't pay. We now also
// build the web link and choose based on platform, with a graceful fallback if
// the app link doesn't open.
// ============================================================================

function cleanHandle(handle) {
  const h = (handle || '').trim();
  return h.startsWith('@') ? h.slice(1) : h;
}

export function buildVenmoLinks({ handle, amount, note }) {
  const recipient = encodeURIComponent(cleanHandle(handle));
  const amt = Number(amount || 0).toFixed(2);
  const enc = encodeURIComponent(note || 'Split the Check — my share');
  return {
    app: `venmo://paycharge?txn=pay&recipients=${recipient}&amount=${amt}&note=${enc}`,
    // Venmo web/universal link — works in a desktop browser and redirects to the
    // app on mobile if installed.
    web: `https://venmo.com/?txn=pay&recipients=${recipient}&amount=${amt}&note=${enc}`,
  };
}

export function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Open the best Venmo link for the current device. On mobile, try the app deep
// link and fall back to web shortly after (covers "app not installed"). On
// desktop, go straight to web.
export function openVenmo({ handle, amount, note }) {
  const { app, web } = buildVenmoLinks({ handle, amount, note });
  if (isMobile()) {
    const fallback = setTimeout(() => { window.location.href = web; }, 1200);
    // If the app opens, the page is backgrounded and the timeout effectively
    // won't matter; if it doesn't, we land on web.
    const onHide = () => { clearTimeout(fallback); document.removeEventListener('visibilitychange', onHide); };
    document.addEventListener('visibilitychange', onHide);
    window.location.href = app;
  } else {
    window.open(web, '_blank', 'noopener');
  }
}

// ── Other peer-to-peer rails ────────────────────────────────────────────────
// PayPal.me and Cash App both expose a simple web link that prefills the
// recipient + amount and opens the app on mobile. (Apple Cash has no such link,
// which is why "I paid another way" exists as the catch-all.)

function openExternal(url) {
  if (isMobile()) window.location.href = url;
  else window.open(url, '_blank', 'noopener');
}

// PayPal.me supports a native currency suffix (e.g. /9.00EUR), so no FX needed.
export function buildPaypalLink({ handle, amount, currency }) {
  const raw = (handle || '').trim();
  const m = raw.match(/paypal\.me\/([^/?\s]+)/i);          // accept a pasted paypal.me URL
  const user = encodeURIComponent((m ? m[1] : raw).replace(/^@/, ''));
  const amt = Number(amount || 0).toFixed(2);
  const cur = (currency || 'USD').toUpperCase();
  return `https://paypal.me/${user}/${amt}${cur}`;
}
export function openPaypal(args) { openExternal(buildPaypalLink(args)); }

// Cash App: https://cash.app/$cashtag/AMOUNT (USD/GBP markets).
export function buildCashAppLink({ handle, amount }) {
  const raw = (handle || '').trim().replace(/^\$/, '');
  const tag = encodeURIComponent(raw);
  const amt = Number(amount || 0).toFixed(2);
  return `https://cash.app/$${tag}/${amt}`;
}
export function openCashApp(args) { openExternal(buildCashAppLink(args)); }
