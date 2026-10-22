import Button from '../../components/ui/Button';
import Checkbox from '../../components/ui/Checkbox';
import Input from '../../components/ui/Input';
import Tag from '../../components/ui/Tag';
import { Page, PageHeader } from '../../components/ui/Page';
import { TableEmpty, TableHeader } from '../../components/ui/Table';
import DocRow, { DOC_COLS } from './DocRow';

const CATS = ['All', 'Plans', 'Policies', 'FAQ', 'Billing', 'Security', 'Developer'];

export default function KnowledgeBaseView({ app }) {
  const kb = app.kb;
  const openUpload = () => kb.setDialog({ type: 'upload' });
  const rows = kb.docs;
  const hasDocs = kb.raw.length > 0 || kb.q || kb.cat !== 'All' || kb.showArchived;

  return (
    <Page>
      <PageHeader
        title="Knowledge base"
        subtitle="Answers use active, indexed versions only. Archived documents are never retrieved."
        action={hasDocs && <Button onClick={openUpload}>Upload document</Button>}
      />

      {!hasDocs && (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-hairline bg-white shadow-xs px-10 py-14">
          <div className="text-[22px] font-bold">No documents yet</div>
          <div className="max-w-[56ch] text-base leading-normal text-secondary">
            Upload plan sheets, policies and FAQs. The assistant can only answer from documents that have finished indexing.
          </div>
          <Button onClick={openUpload}>Upload document</Button>
        </div>
      )}

      {hasDocs && (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-80">
              <Input placeholder="Search titles and content" value={kb.q} onChange={(e) => kb.setQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {CATS.map((c) => (
                <Tag key={c} selected={kb.cat === c} onClick={() => kb.setCat(c)}>{c}</Tag>
              ))}
            </div>
            <Checkbox
              checked={kb.showArchived}
              onChange={() => kb.setShowArchived(!kb.showArchived)}
              className="ml-auto h-11 gap-2 text-sm"
            >
              Show archived
            </Checkbox>
          </div>
          <div className="rounded-xl border border-hairline bg-white shadow-xs">
            <TableHeader cols={DOC_COLS} labels={['TITLE', 'CATEGORY', 'CURRENT VERSION', 'EFFECTIVE', 'INDEXING', 'ACTIONS']} />
            {rows.map((d) => <DocRow key={d.id} app={app} d={d} />)}
            {rows.length === 0 && <TableEmpty>No documents match this search.</TableEmpty>}
          </div>
        </>
      )}
    </Page>
  );
}
