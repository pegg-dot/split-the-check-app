import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../context/SessionContext';
import Home from './Home';

describe('Home (Setup)', () => {
  it('renders the setup heading and the CTA', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SessionProvider>
          <Home />
        </SessionProvider>
      </MemoryRouter>
    );
    expect(html).toContain('Snap the receipt');
    expect(html.toLowerCase()).toContain('name');
  });
});
