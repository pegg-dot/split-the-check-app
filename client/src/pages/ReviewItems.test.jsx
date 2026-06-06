import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../context/SessionContext';
import ReviewItems from './ReviewItems';

// ReviewItems is now the single bill page: items + subtotal + tax + tip + total,
// with the tip selector inline. (It absorbed the old TipAndShare page.)
describe('ReviewItems', () => {
  it('renders the receipt totals and the inline tip selector', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SessionProvider>
          <ReviewItems />
        </SessionProvider>
      </MemoryRouter>
    );
    expect(html).toContain('Subtotal');
    expect(html).toContain('Total');
    expect(html).toMatch(/18%|No tip/);
    expect(html).toContain('get the QR');
  });
});
