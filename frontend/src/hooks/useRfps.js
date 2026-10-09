import { useCallback, useState } from 'react';
import { api } from '../lib/api';
import { SAMPLE_RFP } from '../lib/rfp';

export function useRfps({ onToast } = {}) {
  const [rfps, setRfps] = useState([]);
  const [rfp, setRfp] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const data = await api('/rfps');
    setRfps(data.rfps);
  }, []);

  const load = useCallback(async (id) => {
    setRfp(await api(`/rfps/${id}`));
  }, []);

  const createSample = useCallback(async () => {
    const created = await api('/rfps', { method: 'POST', body: SAMPLE_RFP });
    await refresh();
    return created;
  }, [refresh]);

  const generate = useCallback(async (rfpId, questionId) => {
    setGenerating(questionId);
    setError(null);
    try {
      setRfp(await api(`/rfp-questions/${questionId}/regenerate`, { method: 'POST' }));
    } catch (e) {
      setError({ questionId, code: e.code, message: e.message });
      onToast?.(e.message);
      await load(rfpId).catch(() => {});
    } finally {
      setGenerating(null);
    }
  }, [onToast, load]);

  return { rfps, rfp, generating, error, refresh, load, createSample, generate };
}
