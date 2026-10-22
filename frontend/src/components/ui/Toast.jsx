import { X } from 'lucide-react';

export default function Toast({ text, action, onAction, onClose }) {
  return (
    <div role="status" className="fixed bottom-6 right-6 z-50 flex max-w-[460px] items-center gap-4 rounded-lg bg-sidebar px-[18px] py-[14px] text-sm leading-[1.45] text-white shadow-overlay">
      <span className="flex-1">{text}</span>
      {action && (
        <button type="button" onClick={onAction} className="min-h-8 whitespace-nowrap font-bold text-interactive-dark">
          {action}
        </button>
      )}
      <button type="button" title="Dismiss" onClick={onClose} className="grid size-7 place-items-center">
        <X size={16} />
      </button>
    </div>
  );
}
