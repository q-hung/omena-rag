const TONES = {
  neutral: 'bg-black text-white',
  accent: 'bg-supply-green text-white',
  positive: 'bg-positive text-white',
  negative: 'bg-negative text-white',
  alert: 'bg-alert text-black',
  outline: 'text-black shadow-[inset_0_0_0_2px_currentColor]',
};

export default function Badge({ tone = 'neutral', children }) {
  return (
    <span className={`inline-flex items-center px-2 py-[3px] text-[11px] font-bold uppercase leading-[1.2] tracking-caps ${TONES[tone] ?? TONES.neutral}`}>
      {children}
    </span>
  );
}
