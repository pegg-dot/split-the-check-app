import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Welcome from './Welcome';

describe('Welcome', () => {
  it('renders both CTAs and the check wordmark', () => {
    const html = renderToStaticMarkup(<MemoryRouter><Welcome /></MemoryRouter>);
    expect(html).toContain('Snap the receipt');
    expect(html).toContain('Join with a code');
    expect(html.toLowerCase()).toContain('check');
  });
});
