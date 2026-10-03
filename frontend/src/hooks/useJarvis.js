import { useCallback, useEffect, useRef, useState } from 'react';
import { accountById, demoDocs } from '../data/jarvis';
import { api } from '../lib/api';
import { D, now } from '../lib/format';
import { buildReviewed, finalText, latestAnswer, saveBlockers, simulateAnswer, stripMarkers, validateEdit } from '../lib/model';

const EMPLOYEE = 'Demo employee';
const GEN_MS = 1200;

let seq = 0;
const uid = (p) => `${p}${++seq}`;

// Seeded history (P10): one saved S2a answer and one conversation in each open state.
function seedConversations(docs) {
  const make = (accountId, texts, at, save = false) => {
    const c = { id: uid('c'), accountId, createdAt: at, createdBy: EMPLOYEE, turns: [], answers: [], reviewed: null };
    texts.forEach((text, i) => {
      c.turns.push({ seq: i + 1, kind: i ? 'clarification_reply' : 'question', text, at });
      c.answers.push({ id: uid('a'), at, ...simulateAnswer(c, docs, accountById(accountId)) });
    });
    if (save) c.reviewed = buildReviewed(c, { reviewer: EMPLOYEE, at, acknowledged: false });
    return c;
  };
  return [
    make(5, ['Can this account take payments in Brazil?'], '2 Oct 2026, 08:51'),
    make(3, ['Is this payment eligible for a refund?'], '1 Oct 2026, 17:32'),
    make(3, ['How long until an approved refund arrives?'], '1 Oct 2026, 15:08'),
    make(2, ['Is this payment eligible for a refund?'], '1 Oct 2026, 11:47', true),
  ];
}

function initState() {
  const docs = demoDocs();
  return {
    accountId: 1, convId: null,
    accounts: [], accountFacts: null, accountsError: null,
    conversations: seedConversations(docs), docs, generating: {},
    questionText: '', replyText: '',
    editing: false, editText: '', editError: null, activeCite: null, activeFact: null, ack: {},
    histAccount: 'All', histState: 'All',
    kbSearch: '', kbCat: 'All', showArchived: false, selDocV: null,
    dialog: null, failSim: false, toast: null,
  };
}

const CLEAR = { editing: false, editError: null, activeCite: null, activeFact: null };

// All prototype state and the simulated generation and indexing flows (TASKS_PROTOTYPE P03).
export function useJarvis() {
  const [state, setState] = useState(initState);
  const latest = useRef(state);
  latest.current = state;
  const timers = useRef([]);
  const toastTimer = useRef();

  useEffect(() => () => { timers.current.forEach(clearTimeout); clearTimeout(toastTimer.current); }, []);

  // Shallow-merge like class setState; accepts an object or updater.
  const set = useCallback((patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })), []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  const conv = (id) => latest.current.conversations.find((c) => c.id === id);
  const updConv = (id, fn) => set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? fn(c) : c)) }));
  const updDoc = (id, fn) => set((s) => ({ docs: s.docs.map((d) => (d.id === id ? fn(d) : d)) }));

  useEffect(() => {
    let active = true;
    api('/accounts').then(({ accounts }) => {
      if (!active) return;
      set((s) => ({
        accounts,
        accountId: accounts.some((a) => a.id === s.accountId) ? s.accountId : accounts[0]?.id,
        accountsError: null,
      }));
    }).catch((error) => {
      if (active) set({ accountsError: error.message });
    });
    return () => { active = false; };
  }, [set]);

  useEffect(() => {
    if (!state.accountId) return undefined;
    let active = true;
    set({ accountFacts: null });
    api(`/accounts/${state.accountId}/facts`).then((accountFacts) => {
      if (active) set({ accountFacts, accountsError: null });
    }).catch((error) => {
      if (active) set({ accountsError: error.message });
    });
    return () => { active = false; };
  }, [state.accountId, set]);

  const toast = (text, action, onAction) => {
    set({ toast: { text, action, onAction } });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => set({ toast: null }), 7000);
  };

  // ---------- Selection (routing lives in App) ----------
  const clear = () => set(CLEAR);
  const selectAccount = (accountId) => set({ accountId, accountFacts: null, convId: null, ...CLEAR });
  const newQuestion = () => set({ convId: null, ...CLEAR });
  const openConv = (id) => set({ convId: id, accountId: conv(id).accountId, ...CLEAR });

  // ---------- Conversations ----------
  const generate = (id) => {
    set((s) => ({ generating: { ...s.generating, [id]: true }, ack: { ...s.ack, [id]: false }, ...CLEAR }));
    later(() => set((s) => {
      const generating = { ...s.generating };
      delete generating[id];
      const c = s.conversations.find((x) => x.id === id);
      const a = { id: uid('a'), at: now(), ...simulateAnswer(c, s.docs, accountById(c.accountId)) };
      return { generating, conversations: s.conversations.map((x) => (x.id === id ? { ...x, answers: [...x.answers, a] } : x)) };
    }), GEN_MS);
  };

  const ask = (text) => {
    const id = uid('c');
    const at = now();
    set((s) => ({
      convId: id, questionText: '',
      conversations: [{ id, accountId: s.accountId, createdAt: at, createdBy: EMPLOYEE, turns: [{ seq: 1, kind: 'question', text, at }], answers: [], reviewed: null }, ...s.conversations],
    }));
    generate(id);
  };

  const reply = (id, text) => {
    updConv(id, (c) => ({ ...c, turns: [...c.turns, { seq: c.turns.length + 1, kind: 'clarification_reply', text, at: now() }] }));
    set({ replyText: '' });
    generate(id);
  };

  const regenerate = (id) => generate(id);

  const startEdit = (id) => set({ editing: true, editText: finalText(latestAnswer(conv(id))), editError: null });
  const cancelEdit = () => set({ editing: false, editError: null });
  const saveEdit = (id) => {
    const { editText } = latest.current;
    const err = validateEdit(editText, latestAnswer(conv(id)));
    if (err) return set({ editError: err });
    updConv(id, (c) => ({ ...c, answers: c.answers.map((a, i) => (i === c.answers.length - 1 ? { ...a, edited: editText } : a)) }));
    set({ editing: false, editError: null });
  };

  const copy = (id) => {
    const text = stripMarkers(finalText(latestAnswer(conv(id))));
    const done = () => toast('Copied without citation markers.');
    navigator.clipboard?.writeText(text).then(done, () => toast('Copy failed: the clipboard isn\'t available here.'));
  };

  const toggleAck = (id) => set((s) => ({ ack: { ...s.ack, [id]: !s.ack[id] } }));

  const save = (id) => {
    const s = latest.current;
    const c = conv(id);
    const acknowledged = !!s.ack[id];
    const blocker = saveBlockers({ conv: c, docs: s.docs, generating: !!s.generating[id], editing: s.editing, acknowledged });
    if (blocker) return toast(blocker);
    updConv(id, (x) => ({ ...x, reviewed: buildReviewed(x, { reviewer: EMPLOYEE, at: now(), acknowledged }) }));
    toast('Saved as a reviewed internal answer. Nothing was sent to the customer.');
  };

  // ---------- Knowledge base ----------
  // Queued → Processing → Ready | Failed. A version without extractable text fails (scanned PDF).
  const runIngest = (id) => {
    const setIngest = (ing) => updDoc(id, (d) => ({ ...d, ingest: { ...d.ingest, ...ing } }));
    later(() => setIngest({ stage: 'processing' }), 1000);
    later(() => {
      const d0 = latest.current.docs.find((d) => d.id === id);
      if (!d0?.ingest) return;
      if (!d0.staged.ps.length) {
        setIngest({ stage: 'failed', error: 'No page has a text layer. OCR isn\'t supported.' });
        return toast(`${d0.title} v${d0.staged.v} failed to index. ${d0.current ? `v${d0.current} is still active.` : 'Nothing was activated.'}`);
      }
      const nv = d0.staged.v;
      // KB-05: activate only over a lower version.
      updDoc(id, (d) => (d.current && nv <= d.current ? { ...d, ingest: null, staged: null }
        : { ...d, versions: [d.staged, ...d.versions], current: nv, staged: null, pending: null, ingest: null }));
      toast(`${d0.title} v${nv} is now active.`);
    }, 2200);
  };

  // KB-06: only the latest version, which is always the staged one.
  const retry = (id) => {
    updDoc(id, (d) => ({ ...d, ingest: { stage: 'queued' } }));
    runIngest(id);
  };

  // Answers whose latest unsaved answer cites the document, and reviewed answers that do (KB-08).
  const impact = (docId) => {
    const cites = (list) => Object.values(list).some((c) => c.docId === docId);
    const cs = latest.current.conversations;
    return {
      unsaved: cs.filter((c) => !c.reviewed && latestAnswer(c) && cites(latestAnswer(c).cites)).length,
      saved: cs.filter((c) => c.reviewed && cites(c.reviewed.sources)).length,
    };
  };

  const confirmDialog = (form = {}) => {
    const { dialog: dl } = latest.current;
    if (!dl) return;
    const at = now();
    const eff = form.eff || D;
    if (dl.type === 'delete') {
      const d = latest.current.docs.find((x) => x.id === dl.id);
      set((s) => ({ docs: s.docs.filter((x) => x.id !== dl.id) }));
      toast(`${d.title} deleted. Saved answers keep their text and source snapshot.`);
    } else if (dl.type === 'replace') {
      updDoc(dl.id, (d) => {
        const cur = d.versions.find((v) => v.v === d.current);
        const staged = d.pending
          ? { ...d.pending, eff, note: form.note || d.pending.note, up: at, by: EMPLOYEE }
          : { ...cur, v: d.current + 1, eff, up: at, by: EMPLOYEE, note: form.note || 'Revised upload.', file: `${d.id}-v${d.current + 1}.md` };
        return { ...d, staged, ingest: { stage: 'queued' } };
      });
      runIngest(dl.id);
    } else {
      const id = uid('doc');
      const doc = {
        id, title: form.title || 'Cancellation policy', cat: form.cat || 'Policies', current: null, versions: [],
        staged: { v: 1, format: 'md', eff, up: at, by: EMPLOYEE, note: form.note || 'First version.', file: 'cancellation-policy.md', ps: [{ k: 'a', h: 'Cancelling', t: 'Workspace owners can cancel at any time under Settings → Billing. Access continues until the end of the current billing period.' }] },
        ingest: { stage: 'queued' },
      };
      set((s) => ({ docs: [doc, ...s.docs] }));
      runIngest(id);
    }
    set({ dialog: null });
  };

  const toggleArchive = (d) => {
    updDoc(d.id, (x) => ({ ...x, archived: !x.archived }));
    toast(d.archived ? `${d.title} restored. It can be retrieved again.` : `${d.title} archived. New answers won't retrieve it; answers citing it are flagged.`);
  };

  return {
    state, set, employee: EMPLOYEE,
    clear, selectAccount, newQuestion, openConv,
    ask, reply, regenerate, startEdit, cancelEdit, saveEdit, copy, toggleAck, save,
    retry, impact, confirmDialog, toggleArchive, toast,
  };
}
