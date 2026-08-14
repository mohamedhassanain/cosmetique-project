// Tests Vitest de la validation des Edge Functions (aucun accès runtime).
import { describe, it, expect } from 'vitest';
import { validateOrderPayload, validateContactPayload } from './validation.ts';

const validOrder = {
  product_name: 'Crème Visage',
  quantity: 2,
  total_price: 198,
  customer_name: 'Amina',
  customer_phone: '+212600000000',
  customer_city: 'Casablanca',
  status: 'pending',
  notes: 'Livraison rapide',
  website: '',
};

const validContact = {
  name: 'Amina',
  email: 'amina@example.com',
  phone: '+212600000000',
  subject: 'Question produit',
  message: 'Bonjour, ce produit est-il disponible ?',
  website: '',
};

describe('validation Edge Functions', () => {
  describe('validateOrderPayload', () => {
    it('accepte une commande valide', () => {
      expect(validateOrderPayload(validOrder).ok).toBe(true);
    });

    it('rejette un payload non-objet', () => {
      expect(validateOrderPayload(null).ok).toBe(false);
      expect(validateOrderPayload('x').ok).toBe(false);
    });

    it('rejette une commande sans product_name', () => {
      expect(validateOrderPayload({ ...validOrder, product_name: '' }).ok).toBe(false);
    });

    it('rejette une quantité nulle ou négative', () => {
      expect(validateOrderPayload({ ...validOrder, quantity: 0 }).ok).toBe(false);
      expect(validateOrderPayload({ ...validOrder, quantity: -3 }).ok).toBe(false);
    });

    it('rejette une quantité non entière', () => {
      expect(validateOrderPayload({ ...validOrder, quantity: 1.5 }).ok).toBe(false);
    });

    it('rejette une quantité excessive (> 99)', () => {
      expect(validateOrderPayload({ ...validOrder, quantity: 100 }).ok).toBe(false);
    });

    it('rejette un total négatif', () => {
      expect(validateOrderPayload({ ...validOrder, total_price: -5 }).ok).toBe(false);
    });

    it('rejette un total non-numérique', () => {
      expect(validateOrderPayload({ ...validOrder, total_price: 'abc' }).ok).toBe(false);
    });

    it('rejette un statut différent de pending (anti-fraude)', () => {
      expect(validateOrderPayload({ ...validOrder, status: 'completed' }).ok).toBe(false);
    });

    it('rejette un numéro de téléphone invalide quand fourni', () => {
      expect(validateOrderPayload({ ...validOrder, customer_phone: 'not-a-phone' }).ok).toBe(false);
    });

    it('accepte une commande sans téléphone (flux panier)', () => {
      expect(validateOrderPayload({ ...validOrder, customer_phone: '' }).ok).toBe(true);
    });

    it('rejette un honeypot rempli (bot)', () => {
      expect(validateOrderPayload({ ...validOrder, website: 'http://spam' }).ok).toBe(false);
    });
  });

  describe('validateContactPayload', () => {
    it('accepte un message valide', () => {
      expect(validateContactPayload(validContact).ok).toBe(true);
    });

    it('rejette un email invalide', () => {
      expect(validateContactPayload({ ...validContact, email: 'pas-un-email' }).ok).toBe(false);
    });

    it('rejette un message trop court', () => {
      expect(validateContactPayload({ ...validContact, message: 'court' }).ok).toBe(false);
    });

    it('rejette un nom manquant', () => {
      expect(validateContactPayload({ ...validContact, name: '' }).ok).toBe(false);
    });

    it('rejette un téléphone invalide quand fourni', () => {
      expect(validateContactPayload({ ...validContact, phone: 'abc' }).ok).toBe(false);
    });

    it('accepte un message sans téléphone ni sujet', () => {
      expect(validateContactPayload({ ...validContact, phone: '', subject: '' }).ok).toBe(true);
    });

    it('rejette un honeypot rempli (bot)', () => {
      expect(validateContactPayload({ ...validContact, website: 'bot' }).ok).toBe(false);
    });
  });
});
