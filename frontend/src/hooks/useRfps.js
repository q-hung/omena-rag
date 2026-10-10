import { useCallback, useState } from 'react';
import { api } from '../lib/api';

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

  const create = useCallback(async ({ title, text, file }) => {
    let form;
    if (file) {
      form = new FormData();
      form.append('title', title);
      form.append('file', file);
    }
    return api('/rfps', { method: 'POST', ...(form ? { form } : { body: { title, text } }) });
  }, []);

  // Draft editing: every call returns the fresh RFP.
  const draftCall = useCallback(async (path, options) => {
    try {
      setRfp(await api(path, options));
      return true;
    } catch (e) {
      onToast?.(e.message);
      return false;
    }
  }, [onToast]);
  const saveQuestions = useCallback((id, questions) =>
    draftCall(`/rfps/${id}/questions`, { method: 'PUT', body: { questions } }), [draftCall]);
  const confirm = useCallback((id) => draftCall(`/rfps/${id}/confirm`, { method: 'POST' }), [draftCall]);
  const generateAll = useCallback((id) => draftCall(`/rfps/${id}/generate`, { method: 'POST' }), [draftCall]);
  const reextract = useCallback((id, text) =>
    draftCall(`/rfps/${id}/extract`, { method: 'POST', body: text ? { text } : undefined }), [draftCall]);

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

  return { rfps, rfp, generating, error, refresh, load, create, saveQuestions, confirm, reextract, generateAll, generate };
}
