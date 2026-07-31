import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchCategories,
  createCategory as apiCreateCategory,
  updateCategory as apiUpdateCategory,
  deleteCategory as apiDeleteCategory,
  fetchSubcategories as apiFetchSubcategories,
  createSubcategory as apiCreateSubcategory,
  updateSubcategory as apiUpdateSubcategory,
  deleteSubcategory as apiDeleteSubcategory,
  CategoryInput,
} from '@/services/category.service';
import { QUERY_KEYS } from '@/constants/query-keys';

export function useCategories() {
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.categories,
    queryFn: fetchCategories,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 15,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories });

  const createCategory = useMutation({
    mutationFn: (input: CategoryInput) => apiCreateCategory(input),
    onSuccess: () => {
      void invalidate();
      toast.success('Catégorie créée avec succès');
    },
    onError: (error) => {
      toast.error('Erreur lors de la création de la catégorie');
      console.error(error);
    },
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<CategoryInput>) =>
      apiUpdateCategory(id, input),
    onSuccess: () => {
      void invalidate();
      toast.success('Catégorie mise à jour');
    },
    onError: (error) => {
      toast.error('Erreur lors de la mise à jour');
      console.error(error);
    },
  });

  const deleteCategory = useMutation({
    mutationFn: apiDeleteCategory,
    onSuccess: () => {
      void invalidate();
      toast.success('Catégorie supprimée');
    },
    onError: (error) => {
      toast.error('Erreur lors de la suppression');
      console.error(error);
    },
  });

  return {
    categories,
    isLoading,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}

export function useSubcategories(categoryId?: string) {
  const queryClient = useQueryClient();

  const { data: subcategories = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.subcategories(categoryId),
    queryFn: async () => {
      if (!categoryId) return [];
      return apiFetchSubcategories(categoryId);
    },
    enabled: !!categoryId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.subcategories(categoryId) });

  const createSubcategory = useMutation({
    mutationFn: ({ catId, name }: { catId: string; name: string }) =>
      apiCreateSubcategory(catId, name),
    onSuccess: () => {
      void invalidate();
      toast.success('Sous-catégorie créée');
    },
    onError: (error) => {
      toast.error('Erreur lors de la création');
      console.error(error);
    },
  });

  const updateSubcategory = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiUpdateSubcategory(id, name),
    onSuccess: () => {
      void invalidate();
      toast.success('Sous-catégorie mise à jour');
    },
    onError: (error) => {
      toast.error('Erreur lors de la mise à jour');
      console.error(error);
    },
  });

  const deleteSubcategory = useMutation({
    mutationFn: apiDeleteSubcategory,
    onSuccess: () => {
      void invalidate();
      toast.success('Sous-catégorie supprimée');
    },
    onError: (error) => {
      toast.error('Erreur lors de la suppression');
      console.error(error);
    },
  });

  return {
    subcategories,
    isLoading,
    createSubcategory,
    updateSubcategory,
    deleteSubcategory,
  };
}
