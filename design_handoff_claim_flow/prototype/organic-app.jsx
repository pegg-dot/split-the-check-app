/* global React, ReactDOM, Phone, OScreens, OHost, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle */
const { useState, useEffect } = React;
const { Welcome, ClaimScreen, ShareScreen, SettledScreen } = window.OScreens;
const { Setup, Scan, TipShare, QRSheet, Join, HostDashboard } = window.OHost;

const ME = 'Jordan';
const HOST = 'Sarah';
const SUBTOTAL = 139.0;
const TAX = 11.82;
const JOIN_URL = 'splitcheck.app/s/4f9k2a';

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "clay",
  "handDrawn": true,
  "calmMotion": true,
  "simulateJoins": true,
  "incomingDispute": false
}/*EDITMODE-END*/;

function initialItems() {
  return [
    { id: 'pizza', name: 'Margherita Pizza', price: 18.0, units: [{ shared: false, claims: ['Sarah'] }] },
    { id: 'burrata', name: 'Burrata', price: 14.0, units: [{ shared: false, claims: [] }] },
    { id: 'negroni', name: 'Negroni', price: 14.0, units: [{ shared: false, claims: [] }] },
    { id: 'spritz', name: 'Aperol Spritz', price: 36.0, units: [{ shared: false, claims: [] }, { shared: false, claims: [] }, { shared: false, claims: [] }] },
    { id: 'wine', name: 'Bottle of Wine', price: 48.0, units: [{ shared: true, claims: ['Sarah', 'Mia'] }] },
    { id: 'tiramisu', name: 'Tiramisu', price: 9.0, units: [{ shared: false, claims: [] }] },
  ];
}

function buildPeople(items, tip, guestPaid) {
  const tipAmt = SUBTOTAL * (tip / 100);
  return [HOST, ME].map((name) => {
    const mine = items.map((it) => { const n = myUnitCount(it, name); return n > 0 ? { name: it.name + (it.units.length > 1 && n > 1 ? ` ×${n}` : ''), share: shareOf(it, name) } : null; }).filter(Boolean);
    const itemsTotal = mine.reduce((s, i) => s + i.share, 0);
    const prop = SUBTOTAL ? itemsTotal / SUBTOTAL : 0;
    const fees = (TAX + tipAmt) * prop;
    return { name, host: name === HOST, items: mine, fees, total: itemsTotal + fees, paid: name === HOST ? true : guestPaid };
  });
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [scene, setScene] = useState('welcome');
  const [items, setItems] = useState(initialItems);
  const [tip, setTip] = useState(18);
  const [qrOpen, setQrOpen] = useState(false);
  const [guestPaid, setGuestPaid] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);

  useEffect(() => { if (window.lucide) window.lucide.createIcons(); }, [scene, qrOpen]);

  useEffect(() => {
    setItems((prev) => prev.map((it) => {
      if (it.id !== 'negroni') return it;
      if (t.incomingDispute) {
        const u = it.units[0];
        if (u.dispute && u.dispute.by === 'Mia') return it;
        return { ...it, units: [{ shared: false, claims: [ME], dispute: { by: 'Mia' } }] };
      }
      return it.units[0].dispute ? { ...it, units: [{ shared: false, claims: [] }] } : it;
    }));
  }, [t.incomingDispute]);

  function restart() { setItems(initialItems()); setTip(18); setQrOpen(false); setGuestPaid(false); setPaidAmount(0); setScene('welcome'); }

  const people = buildPeople(items, tip, guestPaid);
  const settledList = [
    { name: ME, host: false, paid: true },
    { name: HOST, host: true, paid: true },
    { name: 'Mia', host: false, paid: false },
  ];

  const rootClass = ['org-root', t.theme === 'coral' ? 'theme-coral' : t.theme === 'sage' ? 'theme-sage' : '',
    t.handDrawn ? '' : 'no-draw', t.calmMotion ? '' : 'motion-off'].filter(Boolean).join(' ');

  const S = (k, el) => scene === k && <div className="scene" key={k}>{el}</div>;

  return (
    <div className={rootClass} key={t.theme}>
      <Phone onRestart={scene !== 'welcome' ? restart : null}>
        {S('welcome', <Welcome onStart={() => setScene('setup')} onJoin={() => setScene('join')} />)}
        {S('setup', <Setup onContinue={() => setScene('scan')} onBack={() => setScene('welcome')} />)}
        {S('scan', <Scan onScanned={() => setScene('tip')} onBack={() => setScene('setup')} />)}
        {S('tip', <TipShare items={items} tip={tip} setTip={setTip} subtotal={SUBTOTAL} tax={TAX}
          onShowQR={() => setQrOpen(true)} onDashboard={() => setScene('host')} onBack={() => setScene('scan')} />)}
        {S('join', <Join host={HOST} onJoin={() => setScene('claim')} onBack={() => setScene('welcome')} />)}
        {S('claim', <ClaimScreen items={items} setItems={setItems} me={ME} host={HOST} roster={['Sarah', 'Mia', 'Diego']} tip={tip} subtotal={SUBTOTAL} tax={TAX}
          autoRelease={true} simulateJoins={t.simulateJoins} onDone={() => setScene('share')} />)}
        {S('share', <ShareScreen items={items} me={ME} host={HOST} tip={tip} subtotal={SUBTOTAL} tax={TAX}
          onPaid={(amt) => { setPaidAmount(amt); setGuestPaid(true); setScene('settled'); }} />)}
        {S('settled', <SettledScreen me={ME} host={HOST} paidAmount={paidAmount} people={settledList} onRestart={restart} />)}
        {S('host', <HostDashboard people={people} me={HOST} onBack={() => setScene('tip')} onRestart={restart} />)}

        {qrOpen && <QRSheet url={JOIN_URL} onClose={() => setQrOpen(false)} onJoinDemo={() => { setQrOpen(false); setScene('join'); }} />}
      </Phone>

      <TweaksPanel>
        <TweakSection label="Palette" />
        <TweakRadio label="Theme" value={t.theme} options={['clay', 'coral', 'sage']} onChange={(v) => setTweak('theme', v)} />
        <TweakSection label="Feel" />
        <TweakToggle label="Hand-drawn accents" value={t.handDrawn} onChange={(v) => setTweak('handDrawn', v)} />
        <TweakToggle label="Calm motion" value={t.calmMotion} onChange={(v) => setTweak('calmMotion', v)} />
        <TweakToggle label="Simulate friends joining" value={t.simulateJoins} onChange={(v) => setTweak('simulateJoins', v)} />
        <TweakSection label="Edge case" />
        <TweakToggle label="Someone disputes my item" value={t.incomingDispute} onChange={(v) => setTweak('incomingDispute', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
