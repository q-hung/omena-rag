import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export function useHistory() {
  const [rows, setRows] = useState([]);
  const [mine, setMine] = useState(true);
  const [accountId, setAccountId] = useState(null);
  const [state, setState] = useState(null);
  const [signal, setSignal] = useState(null);
  const [topic, setTopic] = useState(null);

  const refresh = useCallback(async () => {
    const q = new URLSearchParams();
    if (accountId) {
      q.set('accountId', String(accountId));
    }
    if (state) {
      q.set('state', state);
    }
    q.set('mine', mine ? '1' : '0');
    if (signal) {
      q.set('signal', signal);
    }
    if (topic) {
      q.set('topic', topic);
    }
    const data = await api(`/conversations?${q}`);
    setRows(data.conversations);
  }, [accountId, state, mine, signal, topic]);

  useEffect(() => {
    refresh().catch(() => setRows([]));
  }, [refresh]);

  return { rows, mine, setMine, accountId, setAccountId, state, setState, signal, setSignal, topic, setTopic, refresh };
}
