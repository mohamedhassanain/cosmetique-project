import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchSiteSettings,
  fetchAdminSiteSettings,
  updateSiteSettings as apiUpdateSiteSettings,
} from '@/services/site-settings.service';
import { QUERY_KEYS } from '@/constants/query-keys';
import { SiteSettings } from '@/types/product';

export function useSiteSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: QUERY_KEYS.siteSettings,
    queryFn: fetchSiteSettings,
    // Paramètres du site : données quasi-statiques (une seule ligne, modifiée
    // uniquement par l'admin). Cache long ; invalidé après chaque mutation admin.
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 30,
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

/**
 * Hook ADMIN : site settings COMPLETS (select '*') pour le formulaire
 * Paramètres. Séparé du hook public pour que le shop ne télécharge que les
 * colonnes réellement rendues, sans casser l'édition admin.
 * Clé de cache distincte (['site-settings','admin']) : l'invalidation après
 * sauvegarde cible le préfixe commun ['site-settings'] dans la mutation admin.
 */
const ADMIN_SITE_SETTINGS_KEY = ['site-settings', 'admin'] as const;

export function useAdminSiteSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ADMIN_SITE_SETTINGS_KEY,
    queryFn: fetchAdminSiteSettings,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
  });

  const updateSettings = useMutation({
    mutationFn: (formData: Partial<SiteSettings>) => apiUpdateSiteSettings(formData),
    onSuccess: () => {
      // Invalide les deux caches (public + admin) : le shop doit voir les
      // nouvelles valeurs dès le prochain chargement.
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.siteSettings });
      void queryClient.invalidateQueries({ queryKey: ADMIN_SITE_SETTINGS_KEY });
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
