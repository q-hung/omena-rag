// Renders answer text: [F#] markers become fact chips, [n] markers become evidence buttons.
// A leading "Observed:" or "Possible causes …:" label is set in bold (REQ §7.4).
const CHIP = 'mx-0.5 inline-grid h-5 min-w-[22px] place-items-center border px-[5px] align-[2px] font-mono text-[11px] font-bold';

export default function DraftText({ text, cites, factIds, activeCite, activeFact, onCite, onFact, boxed = true }) {
  return (
    <div className={`flex max-w-[72ch] flex-col gap-4 text-base leading-[1.6] ${boxed ? 'border border-hairline bg-white px-8 py-7' : ''}`}>
      {text.split(/\n\n+/).map((para, i) => {
        const label = para.match(/^(Observed|Possible causes[^:]*):/)?.[0];
        const body = label ? para.slice(label.length) : para;
        return (
          <p key={i} className="text-pretty">
            {label && <strong>{label}</strong>}
            {body.split(/(\[F?\d+\])/).filter(Boolean).map((t, j) => {
              const [, f, n] = t.match(/^\[(F)?(\d+)\]$/) || [];
              if (!n) return t;
              if (f) {
                const id = `F${n}`;
                if (!factIds?.includes(id)) return t;
                const on = activeFact === id;
                return (
                  <button key={j} type="button" title="Show account fact" onClick={() => onFact(on ? null : id)}
                    className={`${CHIP} border-supply-green ${on ? 'bg-supply-green text-white' : 'bg-supply-green-tint text-supply-green'}`}>
                    {id}
                  </button>
                );
              }
              if (!cites?.[n]) return t;
              const on = String(activeCite) === n;
              return (
                <button key={j} type="button" title="Show document evidence" onClick={() => onCite(on ? null : n)}
                  className={`${CHIP} border-black ${on ? 'bg-black text-white' : 'bg-white text-black'}`}>
                  {n}
                </button>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}
