import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { presentDetail, presentList } from '../lib/kbPresent';

const LIMIT = 3 * 1024 * 1024;

export function useDocuments({ onToast } = {}) {
  const [docs, setDocs] = useState([]);
  const [navCount, setNavCount] = useState(0);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [impact, setImpact] = useState({ unsaved: 0, saved: 0 });
  const detailId = useRef(null);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) {
      params.set('q', q.trim());
    }
    if (cat !== 'All') {
      params.set('category', cat);
    }
    if (showArchived) {
      params.set('archived', '1');
    }
    const qs = params.toString();
    const data = await api(`/documents${qs ? `?${qs}` : ''}`);
    setDocs(data.documents);
    if (!q.trim() && cat === 'All' && !showArchived) {
      setNavCount(data.documents.filter((d) => !d.archivedAt).length);
    }
  }, [q, cat, showArchived]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const busy = docs.some((d) => d.latest && (d.latest.status === 'queued' || d.latest.status === 'processing'));

  useEffect(() => {
    if (!busy) {
      return undefined;
    }
    const tick = async () => {
      const status = await api('/documents/indexing-status');
      if (status.busy || busy) {
        await refresh();
        if (detailId.current) {
          const row = await api(`/documents/${detailId.current}`);
          setDetail(row);
        }
      }
    };
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [busy, refresh]);

  const load = async (id) => {
    detailId.current = Number(id);
    const row = await api(`/documents/${id}`);
    setDetail(row);
    return row;
  };

  const uploadForm = (file, fields) => {
    if (file.size > LIMIT) {
      throw new Error('Files must be 3 MB or smaller');
    }
    const form = new FormData();
    form.append('file', file);
    for (const [k, v] of Object.entries(fields)) {
      if (v != null) {
        form.append(k, v);
      }
    }
    return form;
  };

  const upload = async ({ file, title, category, effectiveDate, note }) => {
    await api('/documents', { method: 'POST', form: uploadForm(file, { title, category, effectiveDate, note }) });
    await refresh();
    onToast?.('Document queued for indexing.');
  };

  const replace = async (id, { file, effectiveDate, note }) => {
    await api(`/documents/${id}/versions`, { method: 'POST', form: uploadForm(file, { effectiveDate, note }) });
    await refresh();
    if (detailId.current === Number(id)) {
      await load(id);
    }
    onToast?.('New version queued for indexing.');
  };

  const retry = async (id) => {
    const row = docs.find((d) => d.id === id) ?? detail;
    const vid = row?.latest?.id ?? row?.versions?.[0]?.id;
    if (!vid) {
      return;
    }
    await api(`/documents/${id}/versions/${vid}/retry`, { method: 'POST' });
    await refresh();
    if (detailId.current === Number(id)) {
      await load(id);
    }
  };

  const toggleArchive = async (d) => {
    await api(`/documents/${d.id}/${d.archived ? 'restore' : 'archive'}`, { method: 'POST' });
    await refresh();
    if (detailId.current === Number(d.id)) {
      await load(d.id);
    }
    onToast?.(
      d.archived
        ? `${d.title} restored. It can be retrieved again.`
        : `${d.title} archived. New answers won't retrieve it; answers citing it are flagged.`,
    );
  };

  const openDelete = async (id) => {
    const counts = await api(`/documents/${id}/impact`);
    setImpact(counts);
    setDialog({ type: 'delete', id });
  };

  const remove = async (id) => {
    const title = (docs.find((d) => d.id === id) ?? detail)?.title ?? 'Document';
    await api(`/documents/${id}`, { method: 'DELETE' });
    setDialog(null);
    setDetail(null);
    detailId.current = null;
    await refresh();
    onToast?.(`${title} deleted. Saved answers keep their text and source snapshot.`);
  };

  return {
    docs: docs.map(presentList),
    raw: docs,
    navCount,
    detail: detail ? presentDetail(detail) : null,
    rawDetail: detail,
    q,
    setQ,
    cat,
    setCat,
    showArchived,
    setShowArchived,
    dialog,
    setDialog,
    impact,
    refresh,
    load,
    upload,
    replace,
    retry,
    toggleArchive,
    openDelete,
    remove,
    busy,
  };
}
