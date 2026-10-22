import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { BackButton, Page, PageHeader } from '../../components/ui/Page';

const LIMIT = 3 * 1024 * 1024;

export default function RfpNewView({ app }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (f) => {
    setError(f && f.size > LIMIT ? 'Files must be 3 MB or smaller' : '');
    setFile(f && f.size <= LIMIT ? f : null);
  };
  const ready = title.trim() && (file || text.trim()) && !busy;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const created = await app.rfps.create({ title: title.trim(), text, file });
      navigate(`/rfps/${created.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Page>
      <BackButton onClick={() => navigate('/rfps')}>RFPs</BackButton>
      <PageHeader title="New RFP" subtitle="Paste the questions or upload a PDF or Markdown file. You review the extracted questions before anything is drafted." />
      <div className="flex max-w-[720px] flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Title
          <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Paste text
          <textarea value={text} maxLength={300000} disabled={!!file} onChange={(e) => setText(e.target.value)} rows={12}
            className="rounded-lg border border-rule bg-white p-3 font-mono text-sm outline-none focus:border-accent focus:shadow-focus disabled:bg-almost-white" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Or upload a file
          <input type="file" accept=".pdf,.md,.markdown" onChange={(e) => pick(e.target.files[0] ?? null)} />
          <span className="text-xs font-normal text-secondary">PDF or Markdown · 3 MB or smaller</span>
        </label>
        {error && <div className="rounded-xl border border-hairline shadow-xs bg-white p-3 text-sm">{error}</div>}
        <div><Button disabled={!ready} onClick={submit}>{busy ? 'Extracting…' : 'Extract questions'}</Button></div>
      </div>
    </Page>
  );
}
