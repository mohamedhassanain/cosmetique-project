import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchOrders,
  updateOrderStatus as apiUpdateOrderStatus,
  deleteOrder as apiDeleteOrder,
} from '@/services/order.service';
import { QUERY_KEYS } from '@/constants/query-keys';
import { Order } from '@/types/product';

export function useOrders() {
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.orders,
    queryFn: fetchOrders,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders });

  const updateOrderStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiUpdateOrderStatus(id, status),
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
    isLoading,
    updateOrderStatus,
    deleteOrder,
  };
}
