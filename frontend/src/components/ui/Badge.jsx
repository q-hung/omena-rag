const TONES = {
  neutral: 'bg-light-grey text-secondary',
  accent: 'bg-accent-tint text-accent-dark',
  positive: 'bg-positive-tint text-positive',
  negative: 'bg-negative-tint text-negative',
  alert: 'bg-alert text-alert-text',
  outline: 'text-secondary ring-1 ring-rule',
};

export default function Badge({ tone = 'neutral', children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium leading-[1.2] ${TONES[tone] ?? TONES.neutral}`}>
      {children}
    </span>
  );
}
