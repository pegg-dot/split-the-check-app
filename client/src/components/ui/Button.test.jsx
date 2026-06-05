import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from './Button';

describe('Button', () => {
  it('renders the clay variant by default with its label', () => {
    const html = renderToStaticMarkup(<Button>Pay Sarah</Button>);
    expect(html).toContain('btn');
    expect(html).toContain('btn-clay');
    expect(html).toContain('Pay Sarah');
  });
  it('applies the soft variant and disabled state', () => {
    const html = renderToStaticMarkup(<Button variant="soft" disabled>Track</Button>);
    expect(html).toContain('btn-soft');
    expect(html).toContain('disabled');
  });
});
