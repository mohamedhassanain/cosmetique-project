/**
 * Couche d'accès à la gestion des administrateurs.
 * Sécurité : toutes les opérations passent par des RPC SECURITY DEFINER
 * qui vérifient is_admin() — un utilisateur non-admin ne peut pas lister,
 * ajouter ni retirer un admin. L'application n'accède JAMAIS à la table
 * admin_users directement par PostgREST (aucune policy d'écriture).
 */
import { supabase } from '@/integrations/supabase/client';

export interface AdminUser {
  user_id: string;
  email: string | null;
  created_at: string;
}

/**
 * Liste les administrateurs actuels (email + date).
 * @throws Error si l'appelant n'est pas admin (RPC le refuse).
 */
export async function fetchAdmins(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('list_admins');
  if (error) {
    throw new Error(`Impossible de charger la liste des admins: ${error.message}`);
  }
  return (data ?? []) as AdminUser[];
}

/**
 * Ajoute un administrateur par email.
 * Résout l'UUID automatiquement côté base — l'utilisateur ne manipule
 * jamais l'UUID. Aucun effet si le compte n'existe pas (erreur claire).
 */
export async function addAdminByEmail(email: string): Promise<void> {
  const { error } = await supabase.rpc('add_admin', { target_email: email } as never);
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Retire un administrateur par email.
 */
export async function removeAdminByEmail(email: string): Promise<void> {
  const { error } = await supabase.rpc('remove_admin', { target_email: email } as never);
  if (error) {
    throw new Error(error.message);
  }
}
