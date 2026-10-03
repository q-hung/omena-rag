import { useCallback, useEffect, useRef, useState } from 'react';
import { demoDocs, demoQs, makeDraft } from '../data/demo';
import { now, sourceLabels } from '../lib/model';

const SPEED = { Slow: 2, Normal: 1, Fast: 0.4 };
const REVIEWER = 'Sam Lindqvist';

function initState(emptyLibrary) {
  const docs = emptyLibrary ? [] : demoDocs();
  return {
    view: emptyLibrary ? 'kb' : 'workspace', selQ: 'q1', filter: 'All', docs, qs: demoQs(docs), gen: {},
    editing: false, editText: '', activeCite: null, ack: {},
    kbSearch: '', kbCat: 'All', showArchived: false, selDoc: null, selDocV: null,
    dialog: null, failSim: false, toast: null,
  };
}

// All app state and the simulated generate / approve / ingest flows.
// Options are read once on mount; remount (e.g. change `key`) to reset.
export function useSubPilot({ simulateFailure = false, emptyLibrary = false, simSpeed = 'Normal' } = {}) {
  const [state, setState] = useState(() => initState(emptyLibrary));
  const latest = useRef(state);
  latest.current = state;
  const timers = useRef([]);
  const failed = useRef({});
  const toastTimer = useRef();

  useEffect(() => () => { timers.current.forEach(clearTimeout); clearTimeout(toastTimer.current); }, []);

  // Shallow-merge like class setState; accepts an object or updater.
  const set = useCallback((patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })), []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms * (SPEED[simSpeed] ?? 1)));
  const updQ = (qid, fn) => set((s) => ({ qs: s.qs.map((q) => (q.id === qid ? fn(q, s) : q)) }));
  const updDoc = (id, fn) => set((s) => ({ docs: s.docs.map((d) => (d.id === id ? fn(d) : d)) }));

  const toast = (text, action, onAction) => {
    set({ toast: { text, action, onAction } });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => set({ toast: null }), 7000);
  };

  const openQ = (qid) => set({ view: 'workspace', selQ: qid, editing: false, activeCite: null });
  const openDoc = (id, v) => set({ view: 'doc', selDoc: id, selDocV: v ?? null });

  const generate = (qid) => {
    set((s) => ({ gen: { ...s.gen, [qid]: { s: 'gen', step: 0 } }, editing: false, activeCite: null }));
    [1, 2].forEach((i) => later(() => set((s) => ({ gen: { ...s.gen, [qid]: { s: 'gen', step: i } } })), i * 750));
    later(() => {
      if (simulateFailure && !failed.current[qid]) {
        failed.current[qid] = true;
        set((s) => ({ gen: { ...s.gen, [qid]: { s: 'failed' } } }));
        return;
      }
      failed.current[qid] = false;
      set((s) => {
        const d = { ...makeDraft(qid, s.docs), at: now() };
        return {
          gen: { ...s.gen, [qid]: null }, ack: { ...s.ack, [qid]: false },
          qs: s.qs.map((q) => (q.id !== qid ? q : { ...q, draft: d, status: d.status === 'supported' ? 'Draft ready' : 'Needs review', reviewRequested: false })),
        };
      });
    }, 2300);
  };

  const approve = (qid) => {
    updQ(qid, (q, s) => ({ ...q, status: 'Approved', approval: { text: q.draft.text, cites: q.draft.cites, reviewer: REVIEWER, time: now(), sources: sourceLabels(q.draft.cites, s.docs) } }));
    toast('Answer approved. Text, reviewer, time and source versions are recorded.');
  };

  const startEdit = (text) => set({ editing: true, editText: text });

  // Editing an approved answer archives the approval and requires re-approval.
  const saveEdit = (qid) => set((s) => ({
    editing: false,
    qs: s.qs.map((q) => {
      if (q.id !== qid) return q;
      const text = s.editText;
      return q.approval
        ? { ...q, history: [...q.history, q.approval], approval: null, status: 'Needs review', draft: { ...q.draft, text, cites: q.approval.cites, edited: true, reapprove: true } }
        : { ...q, draft: { ...q.draft, text, edited: true } };
    }),
  }));

  const requestReview = (qid) => {
    updQ(qid, (x) => ({ ...x, reviewRequested: true, reviewRequestedAt: now() }));
    toast('Review requested from the Payments team.');
  };

  const runIngest = (id) => {
    const setIngest = (ing) => updDoc(id, (d) => ({ ...d, ingest: { ...d.ingest, ...ing } }));
    later(() => setIngest({ stage: 'processing', step: 0 }), 1000);
    later(() => setIngest({ step: 1 }), 2100);
    later(() => setIngest({ step: 2 }), 3200);
    later(() => {
      const { docs, qs } = latest.current;
      const d0 = docs.find((d) => d.id === id);
      if (!d0 || !d0.ingest) return;
      if (d0.ingest.fail) {
        setIngest({ stage: 'failed', error: 'Indexing timed out while building the search index (simulated).' });
        toast(`${d0.title} v${d0.staged.v} failed to index. ${d0.current ? `v${d0.current} is still active.` : 'Nothing was activated.'}`);
        return;
      }
      const nv = d0.staged.v;
      updDoc(id, (d) => ({ ...d, versions: [d.staged, ...d.versions], current: nv, staged: null, pending: null, ingest: null }));
      const flagged = qs.filter((q) => !q.approval && q.draft && Object.values(q.draft.cites).some((c) => c && c.startsWith(id + '-') && +c.split('-')[1] < nv));
      if (flagged.length) {
        toast(`${d0.title} v${nv} is now active. ${flagged.length} draft${flagged.length > 1 ? 's cite' : ' cites'} the previous version.`, 'Review draft', () => { openQ(flagged[0].id); set({ toast: null }); });
      } else {
        toast(`${d0.title} v${nv} is now active.`);
      }
    }, 4300);
  };

  const retry = (id) => { updDoc(id, (d) => ({ ...d, ingest: { stage: 'queued', step: 0, fail: false } })); runIngest(id); };

  const confirmDialog = () => {
    const { dialog: dl, failSim: fail } = latest.current;
    if (!dl) return;
    const at = now();
    if (dl.type === 'replace') {
      updDoc(dl.id, (d) => {
        const cur = d.versions.find((v) => v.v === d.current);
        const staged = d.pending ? { ...d.pending, up: at, by: REVIEWER } : { v: d.current + 1, eff: '2 Oct 2026', up: at, by: REVIEWER, note: 'Revised upload.', ps: cur.ps };
        return { ...d, staged, ingest: { stage: 'queued', step: 0, fail } };
      });
      runIngest(dl.id);
    } else {
      const id = 'cancel' + Date.now();
      const doc = { id, title: 'Cancellation policy', cat: 'Policies', current: null, versions: [], staged: { v: 1, eff: '2 Oct 2026', up: at, by: REVIEWER, note: 'First version.', ps: [{ k: 'a', h: 'Cancelling', t: 'Workspace owners can cancel at any time under Settings → Billing. Access continues until the end of the current billing period.' }] }, ingest: { stage: 'queued', step: 0, fail } };
      set((s) => ({ docs: [doc, ...s.docs] }));
      runIngest(id);
    }
    set({ dialog: null });
  };

  const toggleArchive = (d) => {
    updDoc(d.id, (x) => ({ ...x, archived: !x.archived }));
    toast(d.archived ? `${d.title} restored. It can be retrieved again.` : `${d.title} archived. New drafts will not retrieve it; approved answers keep their records.`);
  };

  const loadDemo = () => {
    const docs = demoDocs();
    set({ docs, qs: demoQs(docs) });
    toast('Demo data loaded: 7 SubPilot documents and 6 questions.');
  };

  return {
    state, set, openQ, openDoc, generate, approve, startEdit, saveEdit, requestReview,
    retry, confirmDialog, toggleArchive, loadDemo, reviewer: REVIEWER,
  };
}
