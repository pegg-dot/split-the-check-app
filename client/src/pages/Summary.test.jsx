import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShareCard, PaidList } from './Summary';

describe('ShareCard', () => {
  it('lists my items, tax, tip and the owe total', () => {
    const html = renderToStaticMarkup(<ShareCard
      rows={[{ name: 'Tiramisu', myShare: 9 }]} taxShare={0.77} tipShare={1.62} tipPercent={18} total={11.39} host="Sarah" currency="USD" />);
    expect(html).toContain('Tiramisu');
    expect(html).toContain('11.39');
    expect(html).toContain('Sarah');
  });
});
describe('PaidList', () => {
  it('shows Paid and Pending per person', () => {
    const html = renderToStaticMarkup(<PaidList me="Jordan" people={[
      { name: 'Jordan', host: false, paid: true }, { name: 'Mia', host: false, paid: false }]} />);
    expect(html).toContain('Paid');
    expect(html).toContain('Pending');
  });
});
