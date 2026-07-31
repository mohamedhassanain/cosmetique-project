import { describe, it, expect } from 'vitest';
import { cn, formatWhatsAppNumber } from '../utils';

describe('lib/utils', () => {
  describe('cn', () => {
    it('combine les classes correctement', () => {
      expect(cn('a', 'b')).toBe('a b');
      expect(cn('a', { b: true, c: false })).toBe('a b');
    });

    it('gère les conflits Tailwind', () => {
      expect(cn('px-2 py-2', 'p-4')).toBe('p-4');
    });
  });

  describe('formatWhatsAppNumber', () => {
    it('formate un numéro commençant par 0', () => {
      expect(formatWhatsAppNumber('0612345678')).toBe('212612345678');
    });

    it('ajoute 212 si manquant', () => {
      expect(formatWhatsAppNumber('612345678')).toBe('212612345678');
    });

    it('conserve le numéro s\'il commence déjà par 212', () => {
      expect(formatWhatsAppNumber('212612345678')).toBe('212612345678');
    });

    it('nettoie les caractères non numériques', () => {
      expect(formatWhatsAppNumber('+212 6-12 34 56 78')).toBe('212612345678');
    });
  });
});
