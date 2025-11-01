import '@testing-library/jest-dom';

if (typeof window !== 'undefined' && typeof window.CustomEvent !== 'function') {
  window.CustomEvent = function CustomEvent(event, params) {
    const evt = document.createEvent('CustomEvent');
    evt.initCustomEvent(event, params?.bubbles || false, params?.cancelable || false, params?.detail || null);
    return evt;
  };
}
