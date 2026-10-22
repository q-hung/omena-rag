// White card with a title over a hairline (Version history, Cited in answers).
export default function Panel({ title, children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-white shadow-xs">
      <div className="border-b border-hairline px-5 py-3.5 text-sm font-semibold text-black">{title}</div>
      {children}
    </div>
  );
}
