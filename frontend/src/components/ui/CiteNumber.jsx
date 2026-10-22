// Citation number chip; filled when its citation is active.
export default function CiteNumber({ n, active = false }) {
  return (
    <span className={`rounded-md border px-1.5 py-px font-mono text-[11px] font-semibold ${active ? 'border-accent bg-accent text-white' : 'border-accent/40 bg-accent-tint text-accent-dark'}`}>
      {n}
    </span>
  );
}
