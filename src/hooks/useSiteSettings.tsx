import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchSiteSettings, updateSiteSettings as apiUpdateSiteSettings } from '@/services/site-settings.service';
import { QUERY_KEYS } from '@/constants/query-keys';
import { SiteSettings } from '@/types/product';

export function useSiteSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: QUERY_KEYS.siteSettings,
    queryFn: fetchSiteSettings,
  });

  const updateSettings = useMutation({
    mutationFn: (formData: Partial<SiteSettings>) => apiUpdateSiteSettings(formData),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.siteSettings });
      toast.success('Paramètres mis à jour !');
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });

  return {
    settings,
    isLoading,
    updateSettings,
  };
}
