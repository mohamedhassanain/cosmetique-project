export interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_city: string | null;
  product_id: string | null;
  product_name: string;
  quantity: number;
  total_price: number;
  status: string;
  notes: string | null;
  created_at: string;
}

/** Statuts de commande connus côté admin. */
export const ORDER_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
