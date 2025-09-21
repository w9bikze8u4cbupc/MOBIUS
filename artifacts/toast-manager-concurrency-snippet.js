// Example of toast-manager concurrency fix
// This would be added to the ToastContext to handle concurrent requests

import React, { createContext, useContext, useState } from 'react';
import { toast } from 'react-toastify';

// Set to keep track of active toast dedupe keys
const activeToasts = new Set();

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const addToast = ({ variant, message, dedupeKey }) => {
    // If dedupeKey is provided, check if a toast with this key is already active
    if (dedupeKey) {
      if (activeToasts.has(dedupeKey)) {
        // A toast with this dedupeKey is already active, don't show another one
        return;
      }
      
      // Add this dedupeKey to the active set
      activeToasts.add(dedupeKey);
    }
    
    // Show the toast
    const toastId = toast(message, {
      type: variant,
      onClose: () => {
        // Remove the dedupeKey from active set when toast is closed
        if (dedupeKey) {
          activeToasts.delete(dedupeKey);
        }
      },
      // Other toast options...
    });
    
    return toastId;
  };
  
  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}