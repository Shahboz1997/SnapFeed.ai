import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { claimGuestCredits } from '../api/claimGuestCredits';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import type { UserProfile } from '../types/profile';
import { DEFAULT_FREE_CREDITS } from '../types/profile';

interface AuthContextValue {
  authEnabled: boolean;
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateCredits: (credits: number) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function buildFallbackProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email ?? null,
    full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    avatar_url: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
    credits: DEFAULT_FREE_CREDITS,
    plan: 'free',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const authEnabled = isSupabaseConfigured();
  const supabase = getSupabaseClient();

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(authEnabled);

  const loadProfile = useCallback(async (activeUser: User) => {
    if (!supabase) {
      setProfile(buildFallbackProfile(activeUser));
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, credits, plan, created_at')
      .eq('id', activeUser.id)
      .maybeSingle();

    if (error || !data) {
      setProfile(buildFallbackProfile(activeUser));
      return;
    }

    setProfile(data as UserProfile);
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    await loadProfile(user);
  }, [loadProfile, user]);

  const updateCredits = useCallback((credits: number) => {
    setProfile((current) => (current ? { ...current, credits } : current));
  }, []);

  const tryClaimGuestCredits = useCallback(async () => {
    try {
      const result = await claimGuestCredits();

      if (result && result.transferred > 0 && typeof result.credits === 'number') {
        updateCredits(result.credits);
      }
    } catch {
      // Non-blocking: profile still loads without transfer.
    }
  }, [updateCredits]);

  useEffect(() => {
    if (!authEnabled || !supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!mounted) return;

      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        loadProfile(initialSession.user)
          .then(() => tryClaimGuestCredits())
          .finally(() => {
            if (mounted) setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        loadProfile(nextSession.user).then(() => {
          if (event === 'SIGNED_IN') {
            tryClaimGuestCredits();
          }
        });
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [authEnabled, loadProfile, supabase, tryClaimGuestCredits]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      throw error;
    }
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }

    setProfile(null);
  }, [supabase]);

  const value = useMemo<AuthContextValue>(() => ({
    authEnabled,
    user,
    session,
    profile,
    loading,
    signInWithGoogle,
    signOut,
    refreshProfile,
    updateCredits,
  }), [
    authEnabled,
    user,
    session,
    profile,
    loading,
    signInWithGoogle,
    signOut,
    refreshProfile,
    updateCredits,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
