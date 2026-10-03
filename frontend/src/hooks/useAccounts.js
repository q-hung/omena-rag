import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState(null);
  const [accountFacts, setAccountFacts] = useState(null);
  const [accountsError, setAccountsError] = useState(null);

  useEffect(() => {
    let active = true;
    api('/accounts').then(({ accounts: rows }) => {
      if (!active) return;
      setAccounts(rows);
      setAccountId((current) => (rows.some((a) => a.id === current) ? current : rows[0]?.id));
      setAccountsError(null);
    }).catch((error) => {
      if (active) setAccountsError(error.message);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!accountId) return undefined;
    let active = true;
    setAccountFacts(null);
    api(`/accounts/${accountId}/facts`).then((facts) => {
      if (active) {
        setAccountFacts(facts);
        setAccountsError(null);
      }
    }).catch((error) => {
      if (active) setAccountsError(error.message);
    });
    return () => { active = false; };
  }, [accountId]);

  const selectAccount = useCallback((id) => {
    setAccountId(id);
    setAccountFacts(null);
  }, []);

  return { accounts, accountId, accountFacts, accountsError, selectAccount };
}
