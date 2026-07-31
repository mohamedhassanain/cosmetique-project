/**
 * Couche d'accès aux données commandes (Supabase).
 */
import { supabase } from '@/integrations/supabase/client';
import { Order } from '@/types/product';

export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Order[];
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
