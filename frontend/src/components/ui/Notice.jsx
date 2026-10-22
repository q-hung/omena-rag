// Bordered warning with a yellow caps tag (SOURCE UPDATED, CONFLICT).
export default function Notice({ tag, title, children, action }) {
  return (
    <div className="flex items-start gap-4 border-2 border-black bg-white p-4">
      <span className="flex-none bg-alert px-2 py-1 text-[11px] font-bold tracking-caps text-black">{tag}</span>
      <div className="flex flex-1 flex-col gap-1">
        <div className="text-sm font-bold">{title}</div>
        <div className="text-sm leading-[1.45] text-secondary">{children}</div>
      </div>
      {action}
    </div>
  );
}
