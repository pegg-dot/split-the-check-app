import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItemCard } from './ClaimItems';

const wrap = (item, me = 'Jordan') =>
  renderToStaticMarkup(<ItemCard item={item} me={me} onUnit={() => {}} onMenu={() => {}} />);

describe('ItemCard states', () => {
  it('open unit shows the prompt', () => {
    expect(
      wrap({ id: '1', name: 'Burrata', price: 14, units: [{ shared: false, claims: [], dispute: null }] })
    ).toContain('Tap if you ordered this');
  });

  it('my solo unit shows All yours', () => {
    expect(
      wrap({ id: '1', name: 'Burrata', price: 14, units: [{ shared: false, claims: ['Jordan'], dispute: null }] })
    ).toContain('All yours');
  });

  it('held by other shows their name', () => {
    expect(
      wrap({ id: '0', name: 'Pizza', price: 18, units: [{ shared: false, claims: ['Sarah'], dispute: null }] })
    ).toContain('Sarah');
  });

  it("a split I am not in shows the I'm in affordance", () => {
    expect(
      wrap({ id: '4', name: 'Wine', price: 48, units: [{ shared: true, claims: ['Sarah', 'Mia'], dispute: null }] })
    ).toContain("I’m in");
  });

  it('multi-unit item renders a row per unit', () => {
    const html = wrap({
      id: '3',
      name: 'Spritz',
      price: 36,
      units: [
        { shared: false, claims: [], dispute: null },
        { shared: false, claims: [], dispute: null },
        { shared: false, claims: [], dispute: null },
      ],
    });
    expect((html.match(/urow/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
