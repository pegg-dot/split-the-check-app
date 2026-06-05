import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionProvider } from '../context/SessionContext';
import QROverlay from './QROverlay';

describe('QROverlay', () => {
  it('renders nothing (closed) without crashing', () => {
    const html = renderToStaticMarkup(<SessionProvider><QROverlay /></SessionProvider>);
    expect(typeof html).toBe('string');
  });
});
