import React, { useState, useEffect } from 'react';

const ToastNotification = ({
  message,
  type = 'info',
  duration = 5000,
  onClose,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      if (onClose) onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!isVisible) return null;

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-100 border-green-400 text-green-700';
      case 'error':
        return 'bg-red-100 border-red-400 text-red-700';
      case 'warning':
        return 'bg-yellow-100 border-yellow-400 text-yellow-700';
      case 'info':
      default:
        return 'bg-blue-100 border-blue-400 text-blue-700';
    }
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 p-4 rounded-lg border ${getTypeStyles()} shadow-lg transition-opacity duration-300`}
    >
      <div className="flex items-start">
        <div className="flex-1">
          <p className="text-sm font-medium">{message}</p>
        </div>
        <button
          onClick={() => {
            setIsVisible(false);
            if (onClose) onClose();
          }}
          className="ml-4 text-lg font-bold leading-none"
        >
          &times;
        </button>
      </div>
    </div>
  );
};

export default ToastNotification;
