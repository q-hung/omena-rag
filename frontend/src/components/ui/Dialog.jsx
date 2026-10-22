import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Dialog({ open, title, description, onClose, width = 520, children }) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-6">
      <div onClick={onClose} className="absolute inset-0 bg-gray-900/60" />
      <div role="dialog" aria-modal="true" style={{ maxWidth: width }} className="relative w-full rounded-xl border border-hairline bg-white pb-6 shadow-dialog">
        <div className="flex items-start gap-4 p-6 pb-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold leading-[1.2]">{title}</h2>
            {description && <p className="mt-2 text-sm text-secondary">{description}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-light-grey">
            <X size={16} />
          </button>
        </div>
        <div className="px-6">{children}</div>
      </div>
    </div>
  );
}
