import { createContext } from 'react';
import { User, Session } from '@supabase/supabase-js';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Vrai si l'utilisateur est connecté (compte Supabase Auth = compte admin).
   *  Pas de système de rôles : tout compte créé manuellement dans le Dashboard
   *  Supabase (Authentication → Users) est un compte admin. */
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
