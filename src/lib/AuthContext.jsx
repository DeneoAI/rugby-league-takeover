import React, { createContext, useState, useContext, useEffect, useMemo, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { appParams } from '@/lib/app-params';
import { hasAdminRole, hasModeratorRole } from '@/lib/auth-roles';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  // Kept for API compatibility with previous Base44 host checks — Supabase
  // needs no app-level public-settings round trip.
  const [appPublicSettings] = useState({ public_settings: {} });

  const normalizeUser = (currentUser) => ({
    ...currentUser,
    ...(currentUser?.data || {}),
  });

  // Mirrors isAuthenticated for the auth listener, whose closure is created once.
  const signedInRef = useRef(false);
  useEffect(() => { signedInRef.current = isAuthenticated; }, [isAuthenticated]);

  // Keep the same user object when nothing changed, so effects keyed on `user`
  // don't re-run every time the app returns to the foreground.
  const setUserIfChanged = useCallback((next) => {
    setUser((prev) => {
      try {
        if (prev && JSON.stringify(prev) === JSON.stringify(next)) return prev;
      } catch { /* fall through */ }
      return next;
    });
  }, []);

  const checkUserAuth = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUserIfChanged(normalizeUser(currentUser));
      setIsAuthenticated(true);
      setAuthError(null);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setUser(null);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      if (error.status === 401 || error.status === 403) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
    }
  }, [setUserIfChanged]);

  // Background re-check for someone who is already signed in. Supabase emits
  // SIGNED_IN again every time the tab/app becomes visible (auth-js
  // _recoverAndRefresh on visibilitychange). Running the full checkUserAuth
  // there flipped isLoadingAuth, so RequireAdmin/RequireAuth swapped the page
  // for a spinner and unmounted it: every half-filled form (store items, ads,
  // news, profile) was wiped when the user switched apps and came back. Worse,
  // getUser() hits the network, and if that failed on resume (radio still
  // waking up) the user was marked signed out and bounced to /login.
  // This path never shows a loader and never signs anyone out on a network
  // error; a real sign-out arrives as its own SIGNED_OUT event.
  const refreshUserSilently = useCallback(async () => {
    try {
      const currentUser = await base44.auth.me();
      setUserIfChanged(normalizeUser(currentUser));
      setIsAuthenticated(true);
    } catch (error) {
      // 403 = account disabled; me() already called signOut(), which emits
      // SIGNED_OUT. Anything else (offline, timeout) keeps the current session.
      if (error?.status !== 403) console.warn('Background auth refresh failed:', error);
    }
  }, [setUserIfChanged]);

  const checkAppState = useCallback(async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      if (!appParams.hasBase44Config) {
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        setAuthChecked(true);
        return;
      }

      const authenticated = await base44.auth.isAuthenticated();
      if (authenticated) {
        await checkUserAuth();
      } else {
        setUser(null);
        setAuthError(null);
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        setAuthChecked(true);
      }
      setIsLoadingPublicSettings(false);
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred',
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  }, [checkUserAuth]);

  useEffect(() => {
    checkAppState();

    // Keep local state in sync with Supabase session changes (OAuth redirects,
    // token refresh failures, sign-out in another tab).
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // The user arrived from a reset-password email. Supabase may have
        // dropped them on any page (it falls back to the Site URL when the
        // redirect isn't allow-listed) — always take them to the form.
        checkUserAuth();
        if (!window.location.pathname.startsWith('/reset-password')) {
          window.location.replace('/reset-password');
        }
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Deferred: auth-js holds its lock while running this callback, and
        // calling getUser() inside it can deadlock.
        setTimeout(() => {
          if (signedInRef.current) refreshUserSilently();
          else checkUserAuth();
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthenticated(false);
      }
    });
    return () => subscription?.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback((shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);

    if (shouldRedirect) {
      base44.auth.logout('/');
    } else {
      base44.auth.logout();
    }
  }, []);

  const navigateToLogin = useCallback(() => {
    base44.auth.redirectToLogin(window.location.href);
  }, []);

  // Re-fetch the current user (e.g. after a profile or password change).
  const refreshUser = useCallback(async () => {
    const currentUser = normalizeUser(await base44.auth.me());
    setUserIfChanged(currentUser);
    setIsAuthenticated(true);
    return currentUser;
  }, []);

  // Persist profile / custom user fields, then refresh local state.
  const updateProfile = useCallback(async (data) => {
    await base44.auth.updateMe(data);
    return refreshUser();
  }, [refreshUser]);

  const isAdmin = useMemo(() => hasAdminRole(user), [user]);
  const isModerator = useMemo(() => hasModeratorRole(user), [user]);

  const contextValue = useMemo(() => ({
    user,
    isAuthenticated,
    isAdmin,
    isModerator,
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    appPublicSettings,
    authChecked,
    logout,
    navigateToLogin,
    checkUserAuth,
    checkAppState,
    refreshUser,
    updateProfile
  }), [user, isAuthenticated, isAdmin, isModerator, isLoadingAuth,
       isLoadingPublicSettings, authError, appPublicSettings, authChecked,
       logout, navigateToLogin, checkUserAuth, checkAppState, refreshUser, updateProfile]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
