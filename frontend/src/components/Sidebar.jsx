export default function Sidebar({ items, user, onSignOut }) {
  return (
    <aside className="flex min-h-0 flex-col bg-sidebar px-4 py-6 text-white">
      <div className="flex items-center gap-3 px-2 pb-8">
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold">J</span>
        <div className="flex flex-col">
          <div className="text-base font-bold leading-tight">Omena</div>
          <div className="text-xs text-night-muted">Support Copilot</div>
        </div>
      </div>
      <div className="px-2 pb-3 text-xs font-semibold uppercase tracking-caps text-night-disabled">Menu</div>
      <nav className="flex flex-col gap-1">
        {items.map(({ label, icon: Icon, count, active, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${active ? 'bg-linear-to-r from-accent/15 to-accent/5 text-white' : 'text-gray-300 hover:text-white'}`}
          >
            <Icon size={18} className={active ? 'text-accent' : 'text-night-muted'} />
            <span className="flex-1">{label}</span>
            <span className="font-mono text-xs text-night-muted">{count}</span>
          </button>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-night-line px-2 pt-4">
        <div className="text-sm font-semibold">{user.name}</div>
        <div className="text-xs text-night-muted">{user.role}</div>
        <button type="button" onClick={onSignOut} className="mt-2 self-start text-xs font-medium text-night-muted hover:text-white">Sign out</button>
      </div>
    </aside>
  );
}
