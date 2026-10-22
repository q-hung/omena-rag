// Boxed citation number; inverted when its citation is active.
export default function CiteNumber({ n, active = false }) {
  return (
    <span className={`border border-black px-1.5 py-px font-mono text-[11px] font-bold ${active ? 'bg-black text-white' : 'bg-white text-black'}`}>
      {n}
    </span>
  );
}
