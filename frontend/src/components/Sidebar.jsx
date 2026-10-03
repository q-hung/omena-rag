export default function Sidebar({ items, user }) {
  return (
    <aside className="flex min-h-0 flex-col bg-black py-6 text-white">
      <div className="flex flex-col gap-1 px-6 pb-7">
        <div className="text-xl font-extrabold tracking-[-0.01em]">SubPilot</div>
        <div className="text-xs text-night-muted">Knowledge Assistant</div>
      </div>
      <nav className="flex flex-col">
        {items.map(({ label, icon: Icon, count, active, disabled, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`flex h-11 items-center gap-3 px-6 text-left text-sm font-semibold enabled:hover:bg-night-hover ${active ? 'bg-night' : ''} ${disabled ? 'text-night-disabled' : 'text-white'}`}
          >
            <Icon size={18} />
            <span className={`flex-1 border-b-2 py-1 ${active ? 'border-white' : 'border-transparent'}`}>{label}</span>
            <span className="font-mono text-xs text-night-muted">{count}</span>
          </button>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-night-line px-6 pt-4">
        <div className="text-sm font-semibold">{user.name}</div>
        <div className="text-xs text-night-muted">{user.role}</div>
      </div>
    </aside>
  );
}
