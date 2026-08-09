/**
 * Couche d'accès aux données commandes (Supabase).
 */
import { supabase } from '@/integrations/supabase/client';
import { Order } from '@/types/product';

export interface OrderFilters {
  page?: number;
  pageSize?: number;
  status?: string;
}

export interface OrdersResult {
  orders: Order[];
  total: number;
  totalPages: number;
  page: number;
}

/** Limite haute de pageSize pour l'API admin des commandes. */
export const MAX_ORDER_PAGE_SIZE = 50;

/**
 * Commandes paginées (tri par date décroissante) avec filtre de statut optionnel.
 * Ne charge jamais tout le volume de commandes en mémoire.
 */
export async function fetchOrders(filters: OrderFilters = {}): Promise<OrdersResult> {
  const { page = 1, pageSize = 20, status } = filters;

  // pageSize est borné [1, MAX_ORDER_PAGE_SIZE] : impossible de demander un volume abusif.
  const safePageSize = Math.min(Math.max(pageSize, 1), MAX_ORDER_PAGE_SIZE);

  const base = supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  const query = status ? base.eq('status', status) : base;

  const from = (page - 1) * safePageSize;
  query.range(from, from + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    orders: (data || []) as Order[],
    total: count || 0,
    totalPages: Math.ceil((count || 0) / safePageSize),
    page,
  };
}

/**
 * Compte les commandes (optionnellement par statut) sans charger les lignes.
 * Utilisé par les cartes statistiques du dashboard admin.
 */
export async function countOrders(status?: string): Promise<number> {
  const base = supabase
    .from('orders')
    .select('id', { count: 'exact', head: true });

  const query = status ? base.eq('status', status) : base;

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

export async function updateOrderStatus(id: string, status: string): Promise<unknown> {
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateOrderCustomer(id: string, customerName: string, customerPhone: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ customer_name: customerName, customer_phone: customerPhone })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function createOrder(
  input: Pick<Order, 'product_name' | 'quantity' | 'total_price'> & Partial<Order>
): Promise<void> {
  const { error } = await supabase.from('orders').insert({
    product_name: input.product_name,
    quantity: input.quantity,
    total_price: input.total_price,
    customer_name: input.customer_name ?? 'WhatsApp Click',
    customer_phone: input.customer_phone ?? '',
    product_id: input.product_id ?? null,
    customer_city: input.customer_city ?? null,
    status: input.status ?? 'pending',
    notes: input.notes ?? null,
  });

  if (error) throw error;
}
