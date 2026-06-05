import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../context/SessionContext';
import ScanReceipt from './ScanReceipt';

describe('ScanReceipt', () => {
  it('renders the two capture options', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SessionProvider>
          <ScanReceipt />
        </SessionProvider>
      </MemoryRouter>
    );
    expect(html).toContain('Use camera');
    expect(html).toContain('Upload a photo');
  });
});
