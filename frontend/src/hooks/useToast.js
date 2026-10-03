import { useEffect, useRef, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (text, action, onAction) => {
    setToast({ text, action, onAction });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 7000);
  };
  return { toast, setToast, show };
}
