import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchOrders,
  countOrders,
  createOrder,
  updateOrderStatus,
  deleteOrder,
} from '../order.service';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

const mockedFrom = vi.mocked(supabase.from);

/** Builder chaînable minimal : les méthodes retournent le builder, puis résout result. */
function createBuilder(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.range = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }));
  builder.then = (resolve: (v: unknown) => void) =>
    resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null });
  return builder as never;
}

beforeEach(() => {
  mockedFrom.mockReset();
});

describe('order.service', () => {
  it('fetchOrders pagine les commandes triées par date décroissante', async () => {
    const orders = [{ id: 'o1', product_name: 'Crème', quantity: 1, total_price: 99, status: 'pending' }];
    const builder = createBuilder({ data: orders, count: 42 });
    mockedFrom.mockReturnValueOnce(builder);

    const result = await fetchOrders({ page: 1, pageSize: 20 });

    expect(mockedFrom).toHaveBeenCalledWith('orders');
    expect((builder as { order: ReturnType<typeof vi.fn> }).order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect((builder as { range: ReturnType<typeof vi.fn> }).range).toHaveBeenCalledWith(0, 19);
    expect(result).toEqual({ orders, total: 42, totalPages: 3, page: 1 });
  });

  it('fetchOrders filtre par statut quand fourni', async () => {
    const builder = createBuilder({ data: [], count: 0 });
    mockedFrom.mockReturnValueOnce(builder);

    await fetchOrders({ page: 1, pageSize: 20, status: 'pending' });

    expect((builder as { eq: ReturnType<typeof vi.fn> }).eq).toHaveBeenCalledWith('status', 'pending');
  });

  it('fetchOrders borne pageSize à MAX_ORDER_PAGE_SIZE', async () => {
    const builder = createBuilder({ data: [], count: 0 });
    mockedFrom.mockReturnValueOnce(builder);

    await fetchOrders({ page: 1, pageSize: 9999 });

    expect((builder as { range: ReturnType<typeof vi.fn> }).range).toHaveBeenCalledWith(0, 49);
  });

  it('countOrders compte sans charger les lignes (head query)', async () => {
    const builder = createBuilder({ data: null, count: 7 });
    mockedFrom.mockReturnValueOnce(builder);

    const result = await countOrders('pending');

    expect(mockedFrom).toHaveBeenCalledWith('orders');
    expect((builder as { select: ReturnType<typeof vi.fn> }).select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect((builder as { eq: ReturnType<typeof vi.fn> }).eq).toHaveBeenCalledWith('status', 'pending');
    expect(result).toBe(7);
  });

  it('countOrders sans statut compte toutes les commandes', async () => {
    const builder = createBuilder({ data: null, count: 13 });
    mockedFrom.mockReturnValueOnce(builder);

    const result = await countOrders();

    expect(result).toBe(13);
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
