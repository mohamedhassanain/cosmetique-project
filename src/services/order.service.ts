/**
 * Couche d'accès aux données commandes (Supabase).
 */
import { supabase } from '@/integrations/supabase/client';
import { Order } from '@/types/product';

/**
 * Fonctions publiques protégées (rate limiting + validation serveur).
 * Les visiteurs ne passent PLUS par un INSERT PostgREST direct : la policy
 * anon INSERT de `orders` est supprimée. Seul l'admin (JWT authentifié)
 * insère directement via `createOrder`.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface PublicOrderInput {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  total_price: number;
  customer_name: string;
  customer_phone?: string;
  customer_city?: string | null;
  status?: string;
  notes?: string | null;
  /** Champ honeypot anti-bot : le navigateur l'envoie vide. */
  website?: string;
}

export class PublicSubmissionError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'PublicSubmissionError';
  }
}

async function callFunction<T = unknown>(
  functionName: string,
  payload: unknown
): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 201 || res.status === 200) {
    return (await res.json().catch(() => ({}))) as T;
  }

  let message = 'Une erreur est survenue. Veuillez réessayer.';
  try {
    const data = (await res.json()) as { error?: string };
    if (typeof data.error === 'string' && data.error.trim()) {
      message = data.error;
    }
  } catch {
    // réponse non-JSON : message par défaut
  }

  throw new PublicSubmissionError(message, res.status);
}

/**
 * Création de COMMANDE PUBLIQUE via l'Edge Function sécurisée
 * (`create-order`) : validation serveur + rate limiting par IP,
 * réponse 429 quand la limite est atteinte.
 */
export async function submitPublicOrder(input: PublicOrderInput): Promise<{ ok: boolean }> {
  return callFunction<{ ok: boolean }>('create-order', input);
}

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
