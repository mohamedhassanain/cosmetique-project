import * as React from 'react';
import { useEffect, useState, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshAdminStatus = useCallback(async (userId: string | null) => {
    try {
      if (!userId) {
        setIsAdmin(false);
        return;
      }
      // Verify against the server-side allowlist (admin_users) so the UI
      // reflects the real DB authorization. This is a UX guard only — the
      // actual enforcement is RLS via public.is_admin().
      const { data } = await supabase.rpc('is_admin');
      setIsAdmin(data === true);
    } catch {
      setIsAdmin(false);
    } finally {
      // Loading covers the whole auth + admin-check resolution so a
      // legitimate admin never briefly sees isAdmin=false and a redirect.
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        void refreshAdminStatus(nextUser?.id ?? null);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      void refreshAdminStatus(nextUser?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, [refreshAdminStatus]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
  }, []);

  const contextValue = React.useMemo(() => ({
    user,
    session,
    loading,
    isAdmin,
    signIn,
    signOut
  }), [user, session, loading, isAdmin, signIn, signOut]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
