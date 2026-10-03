export default function QuestionPanel({ q }) {
  return (
    <section className="flex flex-col gap-6 overflow-auto border-r border-hairline bg-white p-6">
      <div className="flex flex-col gap-[10px]">
        <div className="eyebrow">QUESTION</div>
        <div className="text-lg leading-[1.45] text-pretty">{q.text}</div>
        <div className="font-mono text-xs text-muted">Received {q.received}</div>
      </div>
      <div className="h-0.5 bg-black" />
      <div className="flex flex-col gap-[14px]">
        <div className="eyebrow">CUSTOMER CONTEXT</div>
        <div className="flex flex-col gap-0.5">
          <div className="text-base font-bold">{q.customer}</div>
          <div className="text-sm text-secondary">{q.company}</div>
        </div>
        {q.context.map((c) => (
          <div key={c.k} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 border-b border-hairline pb-[10px] text-sm">
            <span className="text-muted">{c.k}</span>
            <span className="font-semibold">{c.v}</span>
          </div>
        ))}
        <div className="text-xs leading-[1.45] text-muted">Plan and account details are passed to the assistant with the question.</div>
      </div>
    </section>
  );
}
