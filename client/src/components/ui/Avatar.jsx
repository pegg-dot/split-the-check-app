const TONES = { clay: '#C96F4C', gold: '#D29A3C', sage: '#7C9B73', plum: '#A8748A', sky: '#7E97AE', ink: 'var(--ink-2)' };
// Fixed tones for the prototype's known cast; everyone else gets a stable hash tone.
const NAMED = { Sarah: 'clay', Mia: 'plum', Diego: 'sage', Jordan: 'gold' };
export function toneFor(name) {
  if (NAMED[name]) return NAMED[name];
  const tones = ['clay', 'gold', 'sage', 'plum', 'sky'];
  let h = 0; for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return tones[h % tones.length];
}
export function Avatar({ name, tone, size = 30 }) {
  const t = tone || toneFor(name);
  return (
    <span className="av" style={{ width: size, height: size, background: TONES[t] || t, fontSize: size * 0.42, color: '#fff', fontWeight: 700 }}>
      {String(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}
export function AvatarStack({ names = [], me, size = 22 }) {
  return <span className="av-stack">{names.map(n => <Avatar key={n} name={n} tone={n === me ? 'gold' : undefined} size={size} />)}</span>;
}
