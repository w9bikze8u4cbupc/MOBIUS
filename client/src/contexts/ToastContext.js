import React, { createContext, useContext, useReducer, useRef } from 'react';
import { ToastContainer } from '../components/ToastContainer';

const ToastContext = createContext();

// Generate a hash for toast content to help with deduplication
const generateToastHash = (message, severity, dedupeKey) => {
  // Use dedupeKey if provided, otherwise fallback to message+severity
  return dedupeKey ? `key:${dedupeKey}` : `${severity}:${message}`;
};

const toastReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_TOAST': {
      // Check for duplicates using either dedupeKey or content hash
      const newToastHash = generateToastHash(
        action.toast.message,
        action.toast.severity,
        action.toast.dedupeKey
      );
      const isDuplicate = state.some(toast => toast.hash === newToastHash);

      if (isDuplicate) {
        return state; // Don't add duplicate toasts
      }

      return [
        ...state,
        { id: Date.now(), hash: newToastHash, ...action.toast },
      ];
    }
    case 'REMOVE_TOAST':
      return state.filter(toast => toast.id !== action.id);
    case 'REMOVE_ALL_TOASTS':
      return [];
    case 'CLEAR_DEDUPE':
      return [];
    default:
      return state;
  }
};

export const ToastProvider = ({ children }) => {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const seen = useRef(new Set());

  const addToast = toast => {
    // Check if we've already seen this dedupeKey
    if (toast.dedupeKey && seen.current.has(toast.dedupeKey)) {
      return; // Don't add duplicate toasts
    }

    // Add to seen set
    if (toast.dedupeKey) {
      seen.current.add(toast.dedupeKey);
    }

    dispatch({ type: 'ADD_TOAST', toast });
  };

  const removeToast = id => {
    dispatch({ type: 'REMOVE_TOAST', id });
  };

  const removeAllToasts = () => {
    dispatch({ type: 'REMOVE_ALL_TOASTS' });
  };

  const clearDedupe = () => {
    seen.current.clear();
    dispatch({ type: 'CLEAR_DEDUPE' });
  };

  return (
    <ToastContext.Provider
      value={{ addToast, removeToast, removeAllToasts, clearDedupe }}
    >
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
