import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../context/SessionContext';
import TipAndShare from './TipAndShare';

describe('TipAndShare', () => {
  it('renders the tip selector and totals labels', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SessionProvider>
          <TipAndShare />
        </SessionProvider>
      </MemoryRouter>
    );
    expect(html).toContain('Subtotal');
    expect(html).toContain('Total');
    expect(html).toMatch(/18%|No tip/);
  });
});
