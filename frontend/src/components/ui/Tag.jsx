// Selectable filter chip.
export default function Tag({ selected = false, children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium transition-colors duration-150 ${selected ? 'border-accent bg-accent text-white' : 'border-hairline bg-white text-secondary shadow-xs hover:border-rule'}`}
      {...rest}
    >
      {children}
    </button>
  );
}
