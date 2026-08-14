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
    // Re-enter the loading state: after a fresh login the provider is
    // already mounted with loading=false (initial null session), and
    // RequireAdmin would otherwise render "Accès réservé" with
    // isAdmin=false before the RPC below resolves.
    setLoading(true);
    try {
      if (!userId) {
        setIsAdmin(false);
        return;
      }
      let allowed = false;
      try {
        const { data } = await supabase.rpc('is_admin');
        allowed = data === true;
      } catch {
        allowed = false;
      }
      // Retry once shortly after a false result: the very first RPC right
      // after SIGNED_IN can race the access token being attached to the
      // REST client and yield a false negative. A second attempt ~300 ms
      // later removes that race without delaying the UI.
      if (!allowed) {
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
        try {
          const { data } = await supabase.rpc('is_admin');
          allowed = data === true;
        } catch {
          allowed = false;
        }
      }
      setIsAdmin(allowed);
    } finally {
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
