import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useApi } from './ApiProvider';

const UserContext = createContext();

function siteUrl(path = '/') {
  return window.location.origin + path;
}

// `user` is undefined while loading, null when logged out, otherwise the
// profile row merged with auth details ({ email, providers }).
export default function UserProvider({ children }) {
  const api = useApi();
  const [session, setSession] = useState();
  // Profile loaded for a specific auth user id; null data means the load failed.
  const [loaded, setLoaded] = useState({ userId: undefined, data: null });

  useEffect(() => {
    let active = true;
    api.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    // Do not await Supabase calls inside this callback (it can deadlock the auth
    // client); the profile is loaded by the effect below instead.
    const { data: { subscription } } = api.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [api]);

  const authUser = session?.user;
  const userId = authUser?.id;
  const email = authUser?.email;
  // Joined to a string so token refreshes (new session object) don't refetch.
  const providers = (authUser?.app_metadata?.providers || []).join(',');

  const setUser = useCallback((profile) => {
    setLoaded({
      userId,
      data: profile && { ...profile, email, providers: providers ? providers.split(',') : [] },
    });
  }, [userId, email, providers]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let active = true;
    api.getProfileById(userId).then(({ data }) => {
      if (active) setUser(data);
    });
    api.touchLastSeen();
    return () => { active = false; };
  }, [api, userId, setUser]);

  // Derived during render so there is never a frame where a freshly logged-in
  // session is reported as logged out (which would bounce PrivateRoute to /login).
  let user;
  if (session === undefined) user = undefined;
  else if (!userId) user = null;
  else if (loaded.userId === userId) user = loaded.data;
  else user = undefined;

  const login = useCallback(async (emailAddress, password) => {
    const { error } = await api.auth.signInWithPassword({ email: emailAddress, password });
    if (!error) return 'ok';
    if (error.code === 'email_not_confirmed') return 'unconfirmed';
    if (error.status === 400) return 'fail';
    return 'error';
  }, [api]);

  const loginWithProvider = useCallback(async (provider) => {
    return api.auth.signInWithOAuth({ provider, options: { redirectTo: siteUrl('/') } });
  }, [api]);

  const register = useCallback(async ({ username, email: emailAddress, password }) => {
    return api.auth.signUp({
      email: emailAddress,
      password,
      options: { data: { username }, emailRedirectTo: siteUrl('/') },
    });
  }, [api]);

  const requestPasswordReset = useCallback(async (emailAddress) => {
    return api.auth.resetPasswordForEmail(emailAddress, { redirectTo: siteUrl('/reset') });
  }, [api]);

  const logout = useCallback(async () => {
    await api.auth.signOut();
  }, [api]);

  return (
    <UserContext.Provider value={{
      user, setUser,
      login, loginWithProvider, register, requestPasswordReset, logout,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
