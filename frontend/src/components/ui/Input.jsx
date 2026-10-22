export default function Input(props) {
  return (
    <span className="flex min-h-9 items-center gap-2 rounded-lg border border-rule bg-white px-3 shadow-xs transition-colors duration-150 focus-within:border-accent focus-within:shadow-focus">
      <input className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" {...props} />
    </span>
  );
}
