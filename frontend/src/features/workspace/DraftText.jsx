// Renders answer text, turning [n] markers with a known citation into toggle buttons.
export default function DraftText({ text, cites, activeCite, onCite }) {
  return (
    <div className="flex max-w-[72ch] flex-col gap-4 border border-hairline bg-white px-8 py-7 text-base leading-[1.6]">
      {text.split(/\n\n+/).map((para, i) => (
        <p key={i} className="text-pretty">
          {para.split(/(\[\d+\])/).filter(Boolean).map((t, j) => {
            const n = t.match(/^\[(\d+)\]$/)?.[1];
            if (!n || !cites?.[n]) return t;
            const on = String(activeCite) === n;
            return (
              <button
                key={j}
                type="button"
                title="Show evidence"
                onClick={() => onCite(on ? null : n)}
                className={`mx-0.5 inline-grid h-5 min-w-[22px] place-items-center border border-black px-[5px] align-[2px] font-mono text-[11px] font-bold ${on ? 'bg-black text-white' : 'bg-white text-black'}`}
              >
                {n}
              </button>
            );
          })}
        </p>
      ))}
    </div>
  );
}
