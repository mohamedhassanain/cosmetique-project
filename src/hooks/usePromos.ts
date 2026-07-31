import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchActivePromos,
  fetchAllPromos,
  createPromo as apiCreatePromo,
  updatePromo as apiUpdatePromo,
  deletePromo as apiDeletePromo,
} from '@/services/promo.service';
import { PromoInput } from '@/types/site';

const PROMOS_KEY = ['promos'] as const;

/** Public : pubs actives, triées par ordre d'affichage. */
export function useActivePromos() {
  return useQuery({
    queryKey: PROMOS_KEY,
    queryFn: fetchActivePromos,
    staleTime: 1000 * 60 * 5,
  });
}

/** Admin : toutes les pubs (y compris inactives) pour la gestion. */
export function useAllPromos() {
  return useQuery({
    queryKey: [...PROMOS_KEY, 'all'],
    queryFn: fetchAllPromos,
  });
}

function useInvalidatePromos() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: PROMOS_KEY });
}

export function useCreatePromo() {
  const invalidate = useInvalidatePromos();

  return useMutation({
    mutationFn: (input: PromoInput) => apiCreatePromo(input),
    onSuccess: () => {
      void invalidate();
      toast.success('Publicité ajoutée !');
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });
}

export function useUpdatePromo() {
  const invalidate = useInvalidatePromos();

  return useMutation({
    mutationFn: ({ id, ...input }: Partial<PromoInput> & { id: string }) =>
      apiUpdatePromo(id, input),
    onSuccess: () => {
      void invalidate();
      toast.success('Publicité mise à jour !');
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });
}

export function useDeletePromo() {
  const invalidate = useInvalidatePromos();

  return useMutation({
    mutationFn: (id: string) => apiDeletePromo(id),
    onSuccess: () => {
      void invalidate();
      toast.success('Publicité supprimée !');
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });
}
