import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export function useAsk({ accountId, onToast, onChange } = {}) {
  const [list, setList] = useState([]);
  const [conv, setConv] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [questionText, setQuestionText] = useState('');
  const [activeCite, setActiveCite] = useState(null);
  const [activeFact, setActiveFact] = useState(null);
  const [ack, setAck] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState(null);

  const refreshList = useCallback(async () => {
    if (!accountId) {
      return;
    }
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
    setAck(false);
    setEditing(false);
    setEditError(null);
  };

  const ask = async (text) => {
    setGenerating(true);
    setQuestionText('');
    try {
      const row = await api('/conversations', { method: 'POST', body: { accountId, question: text } });
      setConv(row);
      await refreshList();
      await onChange?.();
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
      await onChange?.();
    } catch (error) {
      if (error.conversationId) {
        await open(error.conversationId).catch(() => {});
      } else {
        const row = await api(`/conversations/${id}`).catch(() => null);
        if (row) {
          setConv(row);
        }
        onToast?.(error.message);
      }
    } finally {
      setGenerating(false);
    }
  };

  const reply = async (id, body) => {
    setGenerating(true);
    try {
      const row = await api(`/conversations/${id}/replies`, { method: 'POST', body });
      setConv(row);
      setAck(false);
      await refreshList();
      await onChange?.();
    } catch (error) {
      if (error.conversationId) {
        await open(error.conversationId).catch(() => {});
      } else {
        const row = await api(`/conversations/${id}`).catch(() => null);
        if (row) {
          setConv(row);
        }
        onToast?.(error.message);
      }
    } finally {
      setGenerating(false);
    }
  };

  const startEdit = (answer) => {
    setEditing(true);
    setEditText(answer.edited ?? answer.text ?? '');
    setEditError(null);
  };
  const cancelEdit = () => {
    setEditing(false);
    setEditError(null);
  };
  const saveEdit = async (answerId) => {
    try {
      const row = await api(`/answers/${answerId}`, { method: 'PATCH', body: { editedText: editText } });
      setConv(row);
      setEditing(false);
      setEditError(null);
    } catch (error) {
      setEditError(error.message);
    }
  };

  const save = async (id, answerId) => {
    try {
      const row = await api(`/conversations/${id}/review`, {
        method: 'POST',
        body: { answerId, reviewAcknowledged: ack },
      });
      setConv(row);
      await refreshList();
      await onChange?.();
      onToast?.('Saved as a reviewed internal answer. Nothing was sent to the customer.');
    } catch (error) {
      onToast?.(error.message);
    }
  };

  const newQuestion = () => {
    setConv(null);
    setActiveCite(null);
    setActiveFact(null);
    setAck(false);
    setEditing(false);
    setEditError(null);
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
    ack,
    setAck,
    editing,
    editText,
    setEditText,
    editError,
    ask,
    open,
    regenerate,
    reply,
    startEdit,
    cancelEdit,
    saveEdit,
    save,
    newQuestion,
    refreshList,
  };
}
