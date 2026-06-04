/* global React */
const { useEffect: useEffectK, useRef: useRefK } = React;

/* ---------- money ---------- */
function money(n) { return '$' + Number(n || 0).toFixed(2); }

/* ---------- Icon (Lucide, reconciliation-safe) ---------- */
function Icon({ name, size = 20, color, stroke = 2, style = {} }) {
  const ref = useRefK(null);
  useEffectK(() => {
    const el = ref.current; if (!el) return;
    el.innerHTML = '';
    const i = document.createElement('i'); i.setAttribute('data-lucide', name); el.appendChild(i);
    if (window.lucide) window.lucide.createIcons();
  }, [name]);
  return <span ref={ref} style={{ width: size, height: size, color, display: 'inline-flex', flex: '0 0 auto', '--sw': stroke, ...style }} className="lic" />;
}

/* ---------- Avatar ---------- */
const TONES = { clay: '#C96F4C', gold: '#D29A3C', sage: '#7C9B73', plum: '#A8748A', sky: '#7E97AE', ink: 'var(--ink-2)' };
function Avatar({ name, tone = 'clay', size = 30 }) {
  return (
    <span className="av" style={{ width: size, height: size, background: TONES[tone] || tone, fontSize: size * 0.42 }}>
      {(name || '?').trim()[0].toUpperCase()}
    </span>
  );
}

/* ---------- Button ---------- */
function Button({ variant = 'clay', icon, children, onClick, disabled, style = {}, full = true }) {
  return (
    <button className={`btn btn-${variant}`} onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{ width: full ? '100%' : 'auto', ...style }}>
      {icon && <Icon name={icon} size={19} stroke={2.1} />}{children}
    </button>
  );
}

/* ---------- Hand-drawn accents ---------- */
function Squiggle({ width = 150, color = 'currentColor', style = {} }) {
  return (
    <svg className="squiggle" width={width} height="13" viewBox="0 0 150 13" fill="none" style={style} aria-hidden="true">
      <path d="M3 8.5C16 3.5 30 3 44 7.5S74 12 90 7 124 2.5 147 7.5" stroke={color} strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

function SketchCheck({ size = 18, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 12.5c1.6 1.3 3 2.8 4.4 5 1.9-4.7 4.7-8.6 9.3-12.2" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Blob({ tone = 'var(--clay-soft)', size = 280, style = {} }) {
  return (
    <svg className="blob" width={size} height={size} viewBox="0 0 200 200" style={style} aria-hidden="true">
      <path fill={tone} d="M44.6,-58.3C56.7,-49.3,64.3,-34.3,67.8,-18.5C71.3,-2.7,70.6,13.9,63.6,27.6C56.6,41.3,43.2,52.1,28.3,58.9C13.4,65.7,-3,68.5,-18.7,64.8C-34.4,61.1,-49.4,50.9,-58.8,37.1C-68.2,23.3,-72,5.9,-69,-10.2C-66,-26.3,-56.2,-41.1,-43.3,-50.2C-30.4,-59.3,-15.2,-62.7,1.2,-64.3C17.6,-65.9,35.2,-65.7,44.6,-58.3Z" transform="translate(100 100)" />
    </svg>
  );
}

/* a loose, single-line receipt sketch for the welcome hero */
function ReceiptDoodle({ width = 150, color = 'var(--ink)', style = {} }) {
  return (
    <svg className="doodle" width={width} height={width * 1.18} viewBox="0 0 150 178" fill="none" style={style} aria-hidden="true">
      <path d="M38 18c-3 .4-4 1.6-4 5v118c0 4 2.4 5 5.6 2.8l5.4-3.7 6 4.3 6.3-4.3 6.4 4.3 6.2-4.3 6.4 4.3 6.3-4.3 6.4 4.3 6-4.3 5.6 3.7c3.2 2.2 5.6 1.2 5.6-2.8V23c0-3.6-1.2-4.7-4.6-5-13-1-44.8-1-73 0Z"
        stroke={color} strokeWidth="2.4" strokeLinejoin="round" fill="var(--panel)" />
      <path d="M50 50c14-2 36-2 50 0" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M50 70c11-1.6 22-1.4 33 0" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M50 90c14-2 36-1 50 0" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M50 110c8-1 16-1 24 0" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="92" cy="113" r="9" stroke="var(--clay)" strokeWidth="2.4" fill="var(--clay-soft)" />
      <path d="M88.5 113.2l2.4 2.3 4.4-4.7" stroke="var(--clay-deep)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Phone ---------- */
function Phone({ children, onRestart }) {
  return (
    <div className="ph">
      <div className="ph-screen">
        <div className="ph-sb">
          <span>9:41</span>
          <span className="r"><Icon name="signal" size={14} stroke={2.4} /><Icon name="wifi" size={14} stroke={2.4} /><Icon name="battery-full" size={17} stroke={2.2} /></span>
        </div>
        <div className="ph-body">{children}</div>
        <div id="sheet-root" className="sheet-root"></div>
      </div>
      {onRestart && <button className="restart" onClick={onRestart} title="Restart"><Icon name="rotate-ccw" size={16} stroke={2.2} /></button>}
    </div>
  );
}

/* Portal sheets/scrims into a node pinned to the phone viewport, so they
   overlay the visible screen instead of anchoring to the scrolling content. */
function SheetPortal({ children }) {
  const [el, setEl] = React.useState(null);
  React.useEffect(() => { setEl(document.getElementById('sheet-root')); }, []);
  if (!el || !window.ReactDOM) return null;
  return window.ReactDOM.createPortal(children, el);
}

/* ---------- split math helpers (unit-based model) ----------
   Item shape: { id, name, price, units: [ { shared:bool, claims:[name], dispute:{by} } ] }
   A single dish has one unit; a "×3" has three. Each unit's cost (unitPrice)
   is divided evenly among whoever is in that unit's claims.                    */
function unitCount(it) { return it.units ? it.units.length : 1; }
function unitPrice(it) { return it.price / unitCount(it); }
function shareOf(it, name) {
  if (!it.units) return 0;
  const up = unitPrice(it);
  return it.units.reduce((s, u) => s + (u.claims.includes(name) ? up / u.claims.length : 0), 0);
}
function itemClaimed(it) { return !!it.units && it.units.some((u) => u.claims.length > 0); }
function myUnitCount(it, name) { return it.units ? it.units.filter((u) => u.claims.includes(name)).length : 0; }
function namesList(names) {
  const n = (names || []).slice();
  if (n.length <= 1) return n[0] || '';
  if (n.length === 2) return n[0] + ' & ' + n[1];
  return n.slice(0, -1).join(', ') + ' & ' + n[n.length - 1];
}

Object.assign(window, { money, unitCount, unitPrice, shareOf, itemClaimed, myUnitCount, namesList, Icon, Avatar, Button, Squiggle, SketchCheck, Blob, ReceiptDoodle, Phone, SheetPortal });
