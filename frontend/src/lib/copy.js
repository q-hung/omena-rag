import { stripMarkers } from './model';

// ANS-03 / I6: clipboard when available, otherwise select the text.
export function copyAnswer(text, { onCopied, onFallback } = {}) {
  const plain = stripMarkers(text ?? '');
  const fallback = () => {
    const el = document.createElement('textarea');
    el.value = plain;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    onFallback?.();
    setTimeout(() => el.remove(), 10_000);
  };
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(plain).then(onCopied, fallback);
  }
  fallback();
}
