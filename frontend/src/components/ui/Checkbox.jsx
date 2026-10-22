// Square brand checkbox rendered as a button with a label.
export default function Checkbox({ checked, onChange, boxSize = 16, className = '', children }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={`flex items-center gap-[10px] text-left text-black ${className}`}
    >
      <span
        style={{ width: boxSize, height: boxSize }}
        className={`grid flex-none place-items-center border-2 border-black text-[11px] text-white ${checked ? 'bg-black' : 'bg-white'}`}
      >
        {checked ? '✓' : ''}
      </span>
      {children}
    </button>
  );
}
