import { useEffect, useRef } from 'react';

/**
 * Custom hook for setting up an interval that automatically cleans up on unmount
 * @param {Function} callback - Function to call on each interval
 * @param {number|null} delay - Delay in milliseconds, null to pause
 */
export function useInterval(callback, delay) {
  const savedCallback = useRef();

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    if (delay !== null) {
      const id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
}