// `cols` is a Tailwind grid-cols-[...] class shared by the header and its rows.
export function TableHeader({ cols, labels }) {
  return (
    <div className={`grid gap-4 border-b-2 border-black px-5 py-3 eyebrow ${cols}`}>
      {labels.map((l) => (
        <span key={l} className={l === 'ACTIONS' ? 'text-right' : ''}>{l}</span>
      ))}
    </div>
  );
}

export function TableEmpty({ children }) {
  return <div className="px-5 py-8 text-sm text-secondary">{children}</div>;
}
