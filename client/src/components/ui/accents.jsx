export function Squiggle({ width = 150, color = 'currentColor', style = {} }) {
  return (
    <svg className="squiggle" width={width} height="13" viewBox="0 0 150 13" fill="none" style={style} aria-hidden="true">
      <path d="M3 8.5C16 3.5 30 3 44 7.5S74 12 90 7 124 2.5 147 7.5" stroke={color} strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export function SketchCheck({ size = 18, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 12.5c1.6 1.3 3 2.8 4.4 5 1.9-4.7 4.7-8.6 9.3-12.2" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Blob({ tone = 'var(--clay-soft)', size = 280, style = {} }) {
  return (
    <svg className="blob" width={size} height={size} viewBox="0 0 200 200" style={style} aria-hidden="true">
      <path fill={tone} d="M44.6,-58.3C56.7,-49.3,64.3,-34.3,67.8,-18.5C71.3,-2.7,70.6,13.9,63.6,27.6C56.6,41.3,43.2,52.1,28.3,58.9C13.4,65.7,-3,68.5,-18.7,64.8C-34.4,61.1,-49.4,50.9,-58.8,37.1C-68.2,23.3,-72,5.9,-69,-10.2C-66,-26.3,-56.2,-41.1,-43.3,-50.2C-30.4,-59.3,-15.2,-62.7,1.2,-64.3C17.6,-65.9,35.2,-65.7,44.6,-58.3Z" transform="translate(100 100)" />
    </svg>
  );
}

/* a loose, single-line receipt sketch for the welcome hero */
export function ReceiptDoodle({ width = 150, color = 'var(--ink)', style = {} }) {
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
