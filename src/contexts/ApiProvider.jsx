import { createContext, useContext, useCallback, useMemo } from 'react';
import SupabaseApiClient from '../api/SupabaseApiClient';
import { useFlash } from './FlashProvider';

const ApiContext = createContext();

// `client` is the supabase-js client. Tests may instead pass a ready-made `api`
// object with the same interface as SupabaseApiClient.
export default function ApiProvider({ client, api: injectedApi, children }) {
  const flash = useFlash();

  const onError = useCallback(() => {
    flash('An unexpected error has occurred. Please try again later.', 'danger');
  }, [flash]);

  const api = useMemo(
    () => injectedApi || new SupabaseApiClient(client, onError),
    [injectedApi, client, onError]
  );

  return (
    <ApiContext.Provider value={api}>
      {children}
    </ApiContext.Provider>
  );
}

export function useApi() {
  return useContext(ApiContext);
}
