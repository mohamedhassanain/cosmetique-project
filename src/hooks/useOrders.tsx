import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchOrders,
  countOrders,
  updateOrderStatus as apiUpdateOrderStatus,
  deleteOrder as apiDeleteOrder,
  createOrder as apiCreateOrder,
  OrderFilters,
} from '@/services/order.service';
import { QUERY_KEYS } from '@/constants/query-keys';
import { Order } from '@/types/product';

export type UseOrdersOptions = OrderFilters;

/**
 * Commandes paginées pour l'admin (jamais toutes en mémoire).
 * Les cartes stats du dashboard utilisent `useOrderStats` (HEAD COUNT,
 * sans charger les lignes).
 */
export function useOrders(filters: UseOrdersOptions = {}) {
  const queryClient = useQueryClient();

  const { page = 1, pageSize = 20, status } = filters;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [...QUERY_KEYS.orders, { page, pageSize, status }],
    queryFn: () => fetchOrders({ page, pageSize, status }),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });

  const orders = data?.orders ?? [];

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders }),
    [queryClient]
  );

  const updateOrderStatus = useMutation({
    mutationFn: ({ id, status: nextStatus }: { id: string; status: string }) =>
      apiUpdateOrderStatus(id, nextStatus),
    onSuccess: () => {
      void invalidate();
      toast.success('Statut de la commande mis à jour');
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });

  const deleteOrder = useMutation({
    mutationFn: apiDeleteOrder,
    onSuccess: () => {
      void invalidate();
      toast.success('Commande supprimée');
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });

  const pendingOrders = orders.filter((o: Order) => o.status === 'pending');
  const completedOrders = orders.filter((o: Order) => o.status === 'completed');

  return {
    orders,
    pendingOrders,
    completedOrders,
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 0,
    currentPage: data?.page ?? 1,
    pageSize,
    status,
    isLoading,
    isFetching,
    updateOrderStatus,
    deleteOrder,
    invalidate,
  };
}

/** Création manuelle d'une commande par l'admin (INSERT `orders` public). */
export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Parameters<typeof apiCreateOrder>[0]) => apiCreateOrder(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders });
      toast.success('Commande ajoutée');
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });
}

/** Compteurs exacts pour les cartes stats du dashboard (sans charger les lignes). */
export function useOrderStats() {
  const { data: totalOrders = 0 } = useQuery({
    queryKey: [...QUERY_KEYS.orders, 'count'],
    queryFn: () => countOrders(),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: [...QUERY_KEYS.orders, 'count', 'pending'],
    queryFn: () => countOrders('pending'),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });

  return { totalOrders, pendingCount };
}
