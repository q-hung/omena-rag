// Selectable filter chip.
export default function Tag({ selected = false, children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex items-center gap-2 border px-[10px] py-[6px] text-sm transition-colors duration-150 ${selected ? 'border-black bg-black text-white' : 'border-rule text-black'}`}
      {...rest}
    >
      {children}
    </button>
  );
}
