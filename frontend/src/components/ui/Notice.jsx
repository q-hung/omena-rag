// Bordered warning with an amber tag (SOURCE UPDATED, CONFLICT).
export default function Notice({ tag, title, children, action }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-hairline bg-white p-4 shadow-xs">
      <span className="flex-none rounded-full bg-alert px-2.5 py-0.5 text-xs font-medium text-alert-text">{tag}</span>
      <div className="flex flex-1 flex-col gap-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-sm leading-[1.45] text-secondary">{children}</div>
      </div>
      {action}
    </div>
  );
}
