import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Avatar, AvatarStack } from './Avatar';
import { Squiggle, SketchCheck } from './accents';

describe('Avatar', () => {
  it('renders the first initial and the av class', () => {
    const html = renderToStaticMarkup(<Avatar name="Sarah" tone="clay" />);
    expect(html).toContain('S');
    expect(html).toContain('av');
  });
  it('AvatarStack renders one avatar per name', () => {
    const html = renderToStaticMarkup(<AvatarStack names={['Sarah', 'Mia']} />);
    expect((html.match(/class="av"/g) || []).length).toBe(2);
  });
});
describe('accents', () => {
  it('Squiggle and SketchCheck render svg', () => {
    expect(renderToStaticMarkup(<Squiggle />)).toContain('<svg');
    expect(renderToStaticMarkup(<SketchCheck />)).toContain('<svg');
  });
});
