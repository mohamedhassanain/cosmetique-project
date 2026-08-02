import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchOrders,
  createOrder,
  updateOrderStatus,
  deleteOrder,
} from '../order.service';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

const mockedFrom = vi.mocked(supabase.from);

function createBuilder(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }));
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: result.data ?? null, error: result.error ?? null });
  return builder as never;
}

beforeEach(() => {
  mockedFrom.mockReset();
});

describe('order.service', () => {
  it('fetchOrders récupère les commandes triées par date décroissante', async () => {
    const orders = [{ id: 'o1', product_name: 'Crème', quantity: 1, total_price: 99, status: 'pending' }];
    const builder = createBuilder({ data: orders });
    mockedFrom.mockReturnValueOnce(builder);

    const result = await fetchOrders();

    expect(mockedFrom).toHaveBeenCalledWith('orders');
    expect((builder as { order: ReturnType<typeof vi.fn> }).order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result).toEqual(orders);
  });

  it('createOrder insère une commande avec les valeurs par défaut', async () => {
    const builder = createBuilder({ data: null });
    mockedFrom.mockReturnValueOnce(builder);

    await createOrder({ product_name: 'Crème', quantity: 2, total_price: 198 });

    const insert = (builder as { insert: ReturnType<typeof vi.fn> }).insert;
    expect(insert).toHaveBeenCalledWith({
      product_name: 'Crème',
      quantity: 2,
      total_price: 198,
      customer_name: 'WhatsApp Click',
      customer_phone: '',
      product_id: null,
      customer_city: null,
      status: 'pending',
      notes: null,
    });
  });

  it('createOrder conserve les champs partiels fournis', async () => {
    const builder = createBuilder({ data: null });
    mockedFrom.mockReturnValueOnce(builder);

    await createOrder({
      product_name: 'Huile',
      quantity: 1,
      total_price: 50,
      customer_name: 'Client Test',
      customer_phone: '+212600000000',
      product_id: 'p1',
      status: 'pending',
    });

    const insert = (builder as { insert: ReturnType<typeof vi.fn> }).insert;
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        product_name: 'Huile',
        customer_name: 'Client Test',
        customer_phone: '+212600000000',
        product_id: 'p1',
        quantity: 1,
        total_price: 50,
      })
    );
  });

  it('updateOrderStatus met à jour le statut via update().eq().single()', async () => {
    const builder = createBuilder({ data: { id: 'o1', status: 'completed' } });
    mockedFrom.mockReturnValueOnce(builder);

    const result = await updateOrderStatus('o1', 'completed');

    expect(result).toEqual({ id: 'o1', status: 'completed' });
  });

  it('deleteOrder supprime via delete().eq()', async () => {
    mockedFrom.mockReturnValueOnce(createBuilder({ data: null }));

    await expect(deleteOrder('o1')).resolves.toBeUndefined();
  });

  it('propage les erreurs Supabase', async () => {
    mockedFrom.mockReturnValueOnce(createBuilder({ error: { message: 'RLS blocked' } }));

    await expect(fetchOrders()).rejects.toMatchObject({ message: 'RLS blocked' });
  });
});
