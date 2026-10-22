import { ArrowLeft } from 'lucide-react';

// Scrollable page body plus the title/subtitle/action header used by list views.
export function Page({ children }) {
  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="flex max-w-[1280px] flex-col gap-6">{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-bold">{title}</h1>
        <div className="text-sm text-secondary">{subtitle}</div>
      </div>
      {action}
    </div>
  );
}

// Back link with an arrow, e.g. "← Inbox".
export function BackButton({ onClick, children, className = 'h-11' }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-1.5 p-0 text-sm font-semibold text-black hover:opacity-70 ${className}`}>
      <ArrowLeft size={16} />
      {children}
    </button>
  );
}
