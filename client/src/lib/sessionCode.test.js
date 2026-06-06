import { describe, it, expect } from 'vitest';
import { generateSessionCode, normalizeSessionCode } from './sessionCode';

describe('generateSessionCode', () => {
  it('is 6 chars from the unambiguous alphabet (no I O 0 1 L)', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateSessionCode();
      expect(c).toHaveLength(6);
      expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
  it('honors a custom length', () => {
    expect(generateSessionCode(8)).toHaveLength(8);
  });
});

describe('normalizeSessionCode', () => {
  it('upper-cases a typed code', () => {
    expect(normalizeSessionCode('b6kp4q')).toBe('B6KP4Q');
  });
  it('extracts the code from a join URL', () => {
    expect(normalizeSessionCode('http://192.168.1.5:3001/session/B6KP4Q')).toBe('B6KP4Q');
    expect(normalizeSessionCode('/session/abc123?x=1')).toBe('ABC123');
  });
  it('falls back to the last path segment', () => {
    expect(normalizeSessionCode('foo/bar/xyz')).toBe('XYZ');
  });
  it('returns empty string for empty input', () => {
    expect(normalizeSessionCode('')).toBe('');
    expect(normalizeSessionCode(null)).toBe('');
  });
});
