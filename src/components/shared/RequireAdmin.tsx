import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/auth-utils';

/**
 * Garde d'accès admin — double protection :
 *   1. Non connecté → /auth (comme avant).
 *   2. Connecté mais PAS admin (absent de public.admin_users) → /acces-refuse.
 *
 * La VRAIE sécurité reste côté base de données (RLS sur toutes les tables
 * admin via public.is_admin()) — ce composant ne sert qu'à l'UX : un simple
 * utilisateur authentifié ne peut de toute façon rien lire/écrire via l'API.
 */
export function RequireAdmin({ children }: Readonly<{ children: ReactNode }>) {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fef8fa]">
        <div className="h-12 w-12 border-4 border-pink-300 border-t-pink-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  if (!isAdmin) {
    return <Navigate to="/acces-refuse" replace />;
  }

  return <>{children}</>;
}
