export default function Input(props) {
  return (
    <span className="flex min-h-11 items-center gap-2 border-2 border-rule bg-white px-3 transition-colors duration-150 focus-within:border-interactive focus-within:shadow-focus">
      <input className="min-w-0 flex-1 bg-transparent py-[10px] text-base outline-none" {...props} />
    </span>
  );
}
