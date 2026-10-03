import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export function useAsk({ accountId, onToast } = {}) {
  const [list, setList] = useState([]);
  const [conv, setConv] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [questionText, setQuestionText] = useState('');
  const [activeCite, setActiveCite] = useState(null);
  const [activeFact, setActiveFact] = useState(null);

  const refreshList = useCallback(async () => {
    if (!accountId) return;
    const data = await api(`/conversations?accountId=${accountId}&mine=1`);
    setList(data.conversations);
  }, [accountId]);

  useEffect(() => {
    setConv(null);
    setList([]);
    setActiveCite(null);
    setActiveFact(null);
    refreshList().catch(() => {});
  }, [accountId, refreshList]);

  const open = async (id) => {
    const row = await api(`/conversations/${id}`);
    setConv(row);
    setActiveCite(null);
    setActiveFact(null);
  };

  const ask = async (text) => {
    setGenerating(true);
    setQuestionText('');
    try {
      const row = await api('/conversations', { method: 'POST', body: { accountId, question: text } });
      setConv(row);
      await refreshList();
    } catch (error) {
      if (error.conversationId) {
        await open(error.conversationId).catch(() => {});
      } else {
        onToast?.(error.message);
      }
    } finally {
      setGenerating(false);
    }
  };

  const regenerate = async (id) => {
    setGenerating(true);
    try {
      const row = await api(`/conversations/${id}/regenerate`, { method: 'POST' });
      setConv(row);
      await refreshList();
    } catch (error) {
      if (error.conversationId) await open(error.conversationId).catch(() => {});
      else {
        const row = await api(`/conversations/${id}`).catch(() => null);
        if (row) setConv(row);
        onToast?.(error.message);
      }
    } finally {
      setGenerating(false);
    }
  };

  const newQuestion = () => {
    setConv(null);
    setActiveCite(null);
    setActiveFact(null);
  };

  return {
    list,
    conv,
    generating,
    questionText,
    setQuestionText,
    activeCite,
    setActiveCite,
    activeFact,
    setActiveFact,
    ask,
    open,
    regenerate,
    newQuestion,
    refreshList,
  };
}
