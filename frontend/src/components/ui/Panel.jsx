// White box with a caps title over a heavy rule (Version history, Cited in answers).
export default function Panel({ title, children }) {
  return (
    <div className="border border-hairline bg-white">
      <div className="border-b-2 border-black px-5 py-[14px] text-xs font-bold tracking-caps">{title}</div>
      {children}
    </div>
  );
}
