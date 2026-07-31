import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openWhatsAppOrder, getProductShareData, parseImages } from '../whatsapp.service';

// Mocks des dépendances
vi.mock('@/services/site-settings.service', () => ({
  fetchWhatsAppNumber: vi.fn(),
}));

vi.mock('@/services/order.service', () => ({
  createOrder: vi.fn(),
}));

import { fetchWhatsAppNumber } from '@/services/site-settings.service';
import { createOrder } from '@/services/order.service';

const mockedFetchWhatsApp = vi.mocked(fetchWhatsAppNumber);
const mockedCreateOrder = vi.mocked(createOrder);

function makeProduct() {
  return {
    id: 'p1',
    name: 'Crème Visage',
    slug: 'creme-visage',
    price: 99,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  // L'URL du produit utilise globalThis.location.origin
  vi.stubGlobal('location', { origin: 'https://kissariya.example' });
  vi.spyOn(globalThis, 'open').mockImplementation(() => null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('whatsapp.service', () => {
  describe('openWhatsAppOrder', () => {
    it('ouvre WhatsApp quand createOrder échoue (ne bloque pas)', async () => {
      mockedFetchWhatsApp.mockResolvedValue('+212600000000');
      mockedCreateOrder.mockRejectedValue(new Error('RLS: insert failed'));

      await expect(openWhatsAppOrder(makeProduct())).resolves.toBeUndefined();

      // L'échec de createOrder NE doit PAS empêcher l'ouverture de WhatsApp
      expect(globalThis.open).toHaveBeenCalledWith(
        expect.stringContaining('https://wa.me/212600000000'),
        '_blank'
      );
    });

    it('ouvre WhatsApp quand createOrder réussit', async () => {
      mockedFetchWhatsApp.mockResolvedValue('+212600000000');
      mockedCreateOrder.mockResolvedValue(undefined);

      await openWhatsAppOrder(makeProduct());

      expect(globalThis.open).toHaveBeenCalledTimes(1);
      expect(mockedCreateOrder).toHaveBeenCalledTimes(1);
    });

    it('appelle createOrder avec les infos du produit (commande WhatsApp Click)', async () => {
      mockedFetchWhatsApp.mockResolvedValue('+212600000000');
      mockedCreateOrder.mockResolvedValue(undefined);

      await openWhatsAppOrder(makeProduct());

      expect(mockedCreateOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          product_id: 'p1',
          product_name: 'Crème Visage',
          quantity: 1,
          total_price: 99,
          status: 'pending',
          notes: 'Clic depuis le site',
        })
      );
    });
  });

  describe('getProductShareData', () => {
    it('génère l’URL de partage du produit', () => {
      const data = getProductShareData(makeProduct());
      expect(data.url).toBe('https://kissariya.example/produit/creme-visage');
      expect(data.title).toBe('Crème Visage');
    });
  });

  describe('parseImages', () => {
    it('parse un JSON array', () => {
      expect(parseImages('["a.png","b.png"]')).toEqual(['a.png', 'b.png']);
    });

    it('retourne une URL simple en array', () => {
      expect(parseImages('a.png')).toEqual(['a.png']);
    });

    it('retourne [] si null/undefined', () => {
      expect(parseImages(null)).toEqual([]);
      expect(parseImages(undefined)).toEqual([]);
    });
  });
});
