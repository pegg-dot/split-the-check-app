/* global React, Icon, Avatar, Button, Squiggle, Blob, money */
const { useState: useH, useEffect: useHE, useRef: useHR } = React;
const toneForH = (n) => (window.OScreens ? window.OScreens.toneFor(n) : 'clay');

/* ============================ SETUP (host) ============================ */
function Setup({ onContinue, onBack }) {
  const [name, setName] = useH('Sarah');
  const [venmo, setVenmo] = useH('@sarah-jones');
  const [cur, setCur] = useH('USD');
  return (
    <div className="pg">
      <button className="back" onClick={onBack}><Icon name="arrow-left" size={16} stroke={2.2} /> Back</button>
      <div className="claim-head">
        <div className="h1">First, <span className="serif-i" style={{ fontSize: '2rem' }}>you</span>.</div>
        <p className="lead" style={{ marginTop: 4 }}>So friends know who to pay.</p>
      </div>
      <div className="field"><label>Your name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah" /></div>
      <div className="field">
        <label>Venmo username, phone, or email</label>
        <input className="ok" value={venmo} onChange={(e) => setVenmo(e.target.value)} />
        <div className="hint ok"><Icon name="check" size={14} stroke={2.6} /> Sarah Jones</div>
      </div>
      <div className="field">
        <label>Receipt currency</label>
        <div className="sel">
          <select value={cur} onChange={(e) => setCur(e.target.value)}>
            <option value="USD">USD — US Dollar ($)</option>
            <option value="EUR">EUR — Euro (€)</option>
            <option value="GBP">GBP — British Pound (£)</option>
          </select>
          <Icon name="chevron-down" size={18} color="var(--ink-3)" />
        </div>
        <div className="hint">The AI auto-detects this from your receipt too.</div>
      </div>
      <div style={{ flex: 1 }} />
      <Button icon="camera" onClick={onContinue}>Snap the receipt</Button>
    </div>
  );
}

/* ============================ SCAN ============================ */
function Scan({ onScanned, onBack }) {
  const [stage, setStage] = useH('choose');
  useHE(() => { if (stage === 'scanning') { const t = setTimeout(onScanned, 1900); return () => clearTimeout(t); } }, [stage]);
  return (
    <div className="pg">
      <button className="back" onClick={stage === 'choose' ? onBack : () => setStage('choose')}><Icon name="arrow-left" size={16} stroke={2.2} /> Back</button>
      <div className="claim-head">
        <div className="h1">Snap the receipt</div>
        <p className="lead" style={{ marginTop: 4 }}>One photo. The AI reads the rest.</p>
      </div>
      {stage === 'choose' && (
        <div className="scan-tiles">
          <button className="scan-tile" onClick={() => setStage('preview')}>
            <span className="ic"><Icon name="camera" size={24} stroke={2} /></span>
            <span className="tx"><b>Use camera</b><span>Point at the receipt</span></span>
          </button>
          <button className="scan-tile" onClick={() => setStage('preview')}>
            <span className="ic"><Icon name="image" size={24} stroke={2} /></span>
            <span className="tx"><b>Upload a photo</b><span>From your camera roll</span></span>
          </button>
        </div>
      )}
      {(stage === 'preview' || stage === 'scanning') && (
        <div className="receipt-card">{stage === 'scanning' && <div className="scan-shimmer" />}<FauxReceipt /></div>
      )}
      <div style={{ flex: 1 }} />
      {stage === 'preview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button icon="sparkles" onClick={() => setStage('scanning')}>Read it with AI</Button>
          <Button variant="ghost" onClick={() => setStage('choose')}>Use a different photo</Button>
        </div>
      )}
      {stage === 'scanning' && (
        <div className="scanning"><div className="spin" /><p style={{ fontWeight: 700 }}>Reading your receipt…</p><p className="cap">Claude is pulling out every item</p></div>
      )}
    </div>
  );
}
function FauxReceipt() {
  const rows = [['MARGHERITA PIZZA', '18.00'], ['BURRATA', '14.00'], ['NEGRONI', '14.00'], ['APEROL SPRITZ  x3', '36.00'], ['BOTTLE OF WINE', '48.00'], ['TIRAMISU', '9.00']];
  return (
    <div className="faux">
      <div className="faux-h">TRATTORIA VERDE</div>
      <div className="faux-sub">123 Mulberry St · Table 7</div>
      <div className="faux-rule" />
      {rows.map(([n, p]) => <div className="faux-row" key={n}><span>{n}</span><span>{p}</span></div>)}
      <div className="faux-rule" />
      <div className="faux-row"><span>SUBTOTAL</span><span>139.00</span></div>
      <div className="faux-row"><span>TAX</span><span>11.82</span></div>
      <div className="faux-row faux-tot"><span>TOTAL</span><span>150.82</span></div>
    </div>
  );
}

/* ============================ TIP & SHARE ============================ */
const TIPS = [0, 15, 18, 20];
function TipShare({ items, tip, setTip, subtotal, tax, onShowQR, onDashboard, onBack }) {
  const tipAmt = subtotal * (tip / 100);
  const total = subtotal + tax + tipAmt;
  return (
    <div className="pg">
      <button className="back" onClick={onBack}><Icon name="arrow-left" size={16} stroke={2.2} /> Back</button>
      <div className="claim-head">
        <div className="h1">Set the <span className="serif-i" style={{ fontSize: '1.9rem' }}>tip</span></div>
        <p className="lead" style={{ marginTop: 4 }}>Here's everything the AI pulled off your receipt.</p>
      </div>
      <div className="sum-card" style={{ boxShadow: 'var(--sh-soft)', border: '1.5px solid var(--line)' }}>
        {items && items.map((it) => (
          <div className="srow scan-row" key={it.id}>
            <span className="nm">{it.name}{it.units && it.units.length > 1 ? <span className="scan-q">×{it.units.length}</span> : null}</span>
            <span className="mono">{money(it.price)}</span>
          </div>
        ))}
        <div className="srow sub" style={{ borderTop: '1px dashed var(--line)', marginTop: 4, paddingTop: 12 }}><span>Subtotal</span><span className="mono" style={{ fontWeight: 700 }}>{money(subtotal)}</span></div>
        <div className="srow sub"><span>Tax</span><span className="mono" style={{ fontWeight: 700 }}>{money(tax)}</span></div>
        {tipAmt > 0 && <div className="srow sub"><span>Tip · {tip}%</span><span className="mono" style={{ fontWeight: 700 }}>{money(tipAmt)}</span></div>}
        <div className="srow tot"><span className="nm">Total</span><span className="pr mono">{money(total)}</span></div>
      </div>
      <p className="cap" style={{ margin: '16px 0 9px' }}>Tip is on the {money(subtotal)} subtotal (pre-tax)</p>
      <div className="tipsel">
        {TIPS.map((p) => (
          <button key={p} className={`tip ${tip === p ? 'on' : ''}`} onClick={() => setTip(p)}>
            {p === 0 ? 'No tip' : `${p}%`}{p > 0 && <span className="s">{money(subtotal * (p / 100))}</span>}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 16 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button icon="qr-code" onClick={onShowQR}>Show the QR code</Button>
        <Button variant="soft" icon="users" onClick={onDashboard}>Track who's paid</Button>
      </div>
    </div>
  );
}

/* ============================ QR SHEET ============================ */
function QRSheet({ url, onClose, onJoinDemo }) {
  const cv = useHR(null);
  useHE(() => {
    if (window.QRCode && cv.current) {
      cv.current.innerHTML = '';
      new window.QRCode(cv.current, { text: 'https://' + url, width: 168, height: 168, colorDark: '#2B2620', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
    }
  }, [url]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="h2">Scan to join</div>
        <p className="cap" style={{ marginBottom: 16 }}>Everyone at the table — no app, no sign-up.</p>
        <div className="qrbox"><div ref={cv} /></div>
        <p className="qrurl">{url}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          <Button icon="user-plus" onClick={onJoinDemo}>Join as a guest (demo)</Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

/* ============================ JOIN (guest) ============================ */
function Join({ host, onJoin, onBack }) {
  const [name, setName] = useH('Jordan');
  return (
    <div className="pg wel">
      <Blob tone="var(--clay-soft)" size={280} style={{ top: -50, left: -90, opacity: .7 }} />
      <button className="back" onClick={onBack} style={{ position: 'absolute', top: 14, left: 22 }}><Icon name="arrow-left" size={16} stroke={2.2} /> Back</button>
      <div className="join-icon"><Icon name="hand" size={30} color="var(--clay)" stroke={2} /></div>
      <div className="h1" style={{ marginTop: 16, position: 'relative', zIndex: 2 }}>Join the split</div>
      <p className="lead" style={{ marginTop: 8, position: 'relative', zIndex: 2 }}>{host} wants to split the bill with you.</p>
      <div className="field" style={{ marginTop: 26, textAlign: 'left', position: 'relative', zIndex: 2 }}>
        <label>Your name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" />
      </div>
      <div style={{ flex: 1 }} />
      <Button icon="arrow-right" onClick={() => onJoin(name)}>Join the table</Button>
    </div>
  );
}

/* ============================ HOST DASHBOARD ============================ */
function HostDashboard({ people, me, onBack, onRestart }) {
  const guests = people.filter((p) => !p.host);
  const collected = guests.filter((p) => p.paid).reduce((s, p) => s + p.total, 0);
  const expected = guests.reduce((s, p) => s + p.total, 0);
  const pct = expected ? Math.min(100, (collected / expected) * 100) : 0;
  const allPaid = guests.length > 0 && guests.every((p) => p.paid);
  return (
    <div className="pg">
      <button className="back" onClick={onBack}><Icon name="arrow-left" size={16} stroke={2.2} /> Back</button>
      <div className="dash-h">
        <div className="h1">Who owes <span className="serif-i" style={{ fontSize: '1.9rem' }}>what</span></div>
        <p className="cap" style={{ marginTop: 4 }}>Updates live as people pay you.</p>
      </div>
      <div className="meter-wrap">
        <div className="meter-top"><span className="cap" style={{ fontWeight: 600 }}>Collected</span><span className="mono" style={{ fontWeight: 800 }}>{money(collected)} / {money(expected)}</span></div>
        <div className="meter"><i style={{ width: pct + '%' }} /></div>
      </div>
      <div>
        {people.map((p) => (
          <div className={`pcard ${p.paid && !p.host ? 'ispaid' : ''}`} key={p.name}>
            <div className="pcard-top">
              <Avatar name={p.name} tone={p.name === me ? 'gold' : toneForH(p.name)} size={32} />
              <span className="nm">{p.name === me ? 'You' : p.name}{p.host ? <span className="you-tag">· host</span> : null}</span>
              {!p.host && <span className={`pill-pay ${p.paid ? 'paid' : 'pend'}`}>{p.paid ? 'Paid' : 'Pending'}</span>}
              <span className="amt mono">{money(p.total)}</span>
            </div>
            {p.items.length > 0 && (
              <div className="pitems">
                {p.items.map((it, k) => <div className="pi" key={k}><span>{it.name}</span><span className="mono">{money(it.share)}</span></div>)}
                <div className="pi" style={{ opacity: .8 }}><span>Tax + tip</span><span className="mono">{money(p.fees)}</span></div>
              </div>
            )}
          </div>
        ))}
      </div>
      {allPaid && <div className="settled" style={{ padding: '22px 0 4px' }}><div className="disp" style={{ fontSize: '1.5rem' }}>All <span className="serif-i" style={{ color: 'var(--sage)' }}>settled up.</span></div></div>}
      <div style={{ flex: 1 }} />
      <Button variant="soft" icon="rotate-ccw" onClick={onRestart} style={{ marginTop: 16 }}>Start a new check</Button>
    </div>
  );
}

window.OHost = { Setup, Scan, TipShare, QRSheet, Join, HostDashboard };
