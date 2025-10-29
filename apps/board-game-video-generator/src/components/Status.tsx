import { useEffect } from 'react';

export type ToastVariant = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  message: string;
  variant?: ToastVariant;
}

interface StatusProps {
  toasts: Toast[];
  onClear?: (id: string) => void;
}

const variantClass: Record<ToastVariant, string> = {
  info: '',
  success: 'success',
  error: 'error',
};

export default function Status({ toasts, onClear }: StatusProps) {
  useEffect(() => {
    if (!onClear) {
      return undefined;
    }
    const timers = toasts.map((toast) =>
      setTimeout(() => {
        onClear(toast.id);
      }, 8000),
    );
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [onClear, toasts]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="status-toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`status-toast ${variantClass[toast.variant ?? 'info']}`}>
          <div>{toast.message}</div>
        </div>
      ))}
    </div>
  );
}
