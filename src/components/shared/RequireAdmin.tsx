import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/auth-utils';

/**
 * Garde d'accès admin.
 *
 * Modèle d'autorisation (allowlist explicite) : la base Supabase Auth est
 * réservée aux comptes admin (créés manuellement via le Dashboard →
 * Authentication → Users). Un utilisateur est ADMIN uniquement si son UUID
 * apparaît dans la table d'allowlist `public.admin_users` :
 *   - Non connecté                     → /admin/login
 *   - Connecté mais non allowlisté     → /acces-refuse
 *   - Connecté ET dans admin_users     → accès /admin
 *
 * Le statut admin est vérifié côté serveur via le RPC `public.is_admin()`
 * (auth-provider). La VRAIE sécurité reste côté base de données : toutes
 * les tables admin sont protégées par RLS via `public.is_admin()`.
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
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (!isAdmin) {
    return <Navigate to="/acces-refuse" replace />;
  }

  return <>{children}</>;
}
