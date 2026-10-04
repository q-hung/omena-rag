import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

// `session` is undefined while loading, null when signed out, else
// `{ employee, simulated }` from GET /api/me.
export function useSession() {
  const [session, setSession] = useState(undefined);

  const refresh = useCallback(async () => {
    try {
      setSession(await api('/me'));
    } catch (e) {
      if (e.status === 401) {
        setSession(null);
      } else {
        throw e;
      }
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = async (email, password) => {
    await api('/auth/login', { method: 'POST', body: { email, password } });
    await refresh();
  };

  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' });
    setSession(null);
  };

  return { session, signIn, signOut };
}
