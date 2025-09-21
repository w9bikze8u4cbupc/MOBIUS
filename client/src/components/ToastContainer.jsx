import React from 'react';
import ToastNotification from './ToastNotification';

export function ToastContainer({ toasts, onClose }) {
  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 2000 }}>
      {toasts.map(t => (
        <div key={t.id} style={{ marginBottom: 8 }}>
          <ToastNotification
            message={t.message}
            type={t.severity || 'info'}
            duration={t.autoHideMs ?? 5000}
            onClose={() => onClose(t.id)}
          />
        </div>
      ))}
    </div>
  );
}
