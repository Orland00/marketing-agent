import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseSpanishDate } from '../src/lib/date-parser.js';

describe('parseSpanishDate', () => {
  // Fix "now" to 2026-03-28 10:00 CST (16:00 UTC) for deterministic tests
  const FIXED_NOW = new Date('2026-03-28T16:00:00Z'); // Saturday 10:00 CST

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ISO format', () => {
    it('should parse "2026-03-30 10:00"', () => {
      const result = parseSpanishDate('2026-03-30 10:00');
      expect(result).not.toBeNull();
      // 10:00 CST = 16:00 UTC
      expect(result!.toISOString()).toBe('2026-03-30T16:00:00.000Z');
    });

    it('should parse "2026-04-01 14:30"', () => {
      const result = parseSpanishDate('2026-04-01 14:30');
      expect(result).not.toBeNull();
      // 14:30 CST = 20:30 UTC
      expect(result!.toISOString()).toBe('2026-04-01T20:30:00.000Z');
    });

    it('should reject past ISO dates', () => {
      const result = parseSpanishDate('2026-03-27 10:00');
      expect(result).toBeNull();
    });
  });

  describe('hoy (today)', () => {
    it('should parse "hoy 18:00"', () => {
      const result = parseSpanishDate('hoy 18:00');
      expect(result).not.toBeNull();
      // 18:00 CST on March 28 = 00:00 UTC March 29
      expect(result!.toISOString()).toBe('2026-03-29T00:00:00.000Z');
    });

    it('should return null if time already passed today', () => {
      const result = parseSpanishDate('hoy 8:00');
      // 8:00 CST = 14:00 UTC, but now is 16:00 UTC — past
      expect(result).toBeNull();
    });

    it('should default to 09:00 if no time given', () => {
      // "hoy" alone — 09:00 CST = 15:00 UTC, but now is 16:00 UTC — past
      const result = parseSpanishDate('hoy');
      expect(result).toBeNull();
    });
  });

  describe('manana/mañana (tomorrow)', () => {
    it('should parse "manana 10:00"', () => {
      const result = parseSpanishDate('manana 10:00');
      expect(result).not.toBeNull();
      // Tomorrow = March 29, 10:00 CST = 16:00 UTC
      expect(result!.toISOString()).toBe('2026-03-29T16:00:00.000Z');
    });

    it('should parse "mañana 9:00"', () => {
      const result = parseSpanishDate('mañana 9:00');
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2026-03-29T15:00:00.000Z');
    });

    it('should default to 09:00 if no time', () => {
      const result = parseSpanishDate('manana');
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2026-03-29T15:00:00.000Z');
    });
  });

  describe('day names', () => {
    it('should parse "lunes 9:00" → next Monday', () => {
      // Today is Saturday March 28. Next Monday = March 30
      const result = parseSpanishDate('lunes 9:00');
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2026-03-30T15:00:00.000Z');
    });

    it('should parse "viernes 14:00" → next Friday', () => {
      // Today is Saturday. Next Friday = April 3
      const result = parseSpanishDate('viernes 14:00');
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2026-04-03T20:00:00.000Z');
    });

    it('should parse "viernes 2pm"', () => {
      const result = parseSpanishDate('viernes 2pm');
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2026-04-03T20:00:00.000Z');
    });

    it('should parse "domingo 10:00" → tomorrow (next Sunday)', () => {
      // Today is Saturday. Next Sunday = March 29
      const result = parseSpanishDate('domingo 10:00');
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2026-03-29T16:00:00.000Z');
    });

    it('should go to next week for same day (sabado)', () => {
      // Today is Saturday. "sabado" → next Saturday = April 4
      const result = parseSpanishDate('sabado 10:00');
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2026-04-04T16:00:00.000Z');
    });
  });

  describe('time only', () => {
    it('should parse "18:00" as today if in future', () => {
      const result = parseSpanishDate('18:00');
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2026-03-29T00:00:00.000Z');
    });

    it('should parse "8:00" as tomorrow if past', () => {
      const result = parseSpanishDate('8:00');
      expect(result).not.toBeNull();
      // 8:00 CST tomorrow = March 29 14:00 UTC
      expect(result!.toISOString()).toBe('2026-03-29T14:00:00.000Z');
    });
  });

  describe('edge cases', () => {
    it('should return null for empty string', () => {
      expect(parseSpanishDate('')).toBeNull();
    });

    it('should return null for garbage input', () => {
      expect(parseSpanishDate('asdfasdf')).toBeNull();
    });

    it('should return null for invalid time', () => {
      expect(parseSpanishDate('manana 25:00')).toBeNull();
    });

    it('should handle extra whitespace', () => {
      const result = parseSpanishDate('  manana   10:00  ');
      expect(result).not.toBeNull();
    });
  });
});
