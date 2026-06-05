import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CollectedMeter, PersonRow } from './HostDashboard';

describe('CollectedMeter', () => {
  it('shows collected / expected on one line', () => {
    const html = renderToStaticMarkup(<CollectedMeter collected={11.39} expected={175.84} currency="USD" />);
    expect(html).toContain('11.39');
    expect(html).toContain('175.84');
    expect(html).toContain('nowrap');
  });
});
describe('PersonRow', () => {
  it('renders name, host tag, total', () => {
    const html = renderToStaticMarkup(<PersonRow person={{ name: 'Sarah', isHost: true, total: 68, paid: true, status: 'confirmed', items: [{ name: 'Pizza', myShare: 18 }] }} currency="USD" />);
    expect(html).toContain('Sarah');
    expect(html).toContain('host');
    expect(html).toContain('68');
  });
});
