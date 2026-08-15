import { createContext } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Vrai si l'utilisateur est un administrateur (UUID présent dans
   *  l'allowlist `public.admin_users` — vérifié côté serveur via le RPC
   *  `is_admin()`). */
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
