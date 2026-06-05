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
  it('renders a guest row with pending pill, items and fees', () => {
    const html = renderToStaticMarkup(<PersonRow currency="USD" person={{
      name: 'Jordan', isHost: false, total: 11.39, taxShare: 0.77, tipShare: 1.62,
      items: [{ name: 'Tiramisu', myShare: 9 }], paid: false, status: 'unpaid', stale: false }} />);
    expect(html).toContain('Jordan');
    expect(html).toContain('Tiramisu');
    expect(html).toContain('11.39');
    expect(html).toContain('Pending');
  });
});
