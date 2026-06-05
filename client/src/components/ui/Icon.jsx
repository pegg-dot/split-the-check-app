import { icons } from 'lucide-react';
// Prototype uses kebab-case Lucide names (e.g. "qr-code", "arrow-right", "hand-coins").
// lucide-react exports PascalCase components; map between them.
function toPascal(name) {
  return String(name).split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}
export function Icon({ name, size = 20, stroke = 2, color, style, className }) {
  const Cmp = icons[toPascal(name)];
  if (!Cmp) return null;
  return <Cmp size={size} strokeWidth={stroke} color={color} style={style} className={className} aria-hidden="true" />;
}
