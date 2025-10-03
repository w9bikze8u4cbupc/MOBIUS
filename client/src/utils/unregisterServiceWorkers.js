/**
 * Unregister all service workers
 * Useful for development when cached assets might interfere with testing
 */
export function unregisterServiceWorkers() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => {
        registration.unregister().then(success => {
          if (success) {
            console.log('Successfully unregistered service worker:', registration.scope);
          } else {
            console.warn('Failed to unregister service worker:', registration.scope);
          }
        });
      });
    }).catch(error => {
      console.error('Error getting service worker registrations:', error);
    });
  } else {
    console.log('Service workers are not supported in this browser');
  }
}

/**
 * Clear all caches
 * Useful for development when cached assets might interfere with testing
 */
export function clearAllCaches() {
  if ('caches' in window) {
    caches.keys().then(cacheNames => {
      cacheNames.forEach(cacheName => {
        caches.delete(cacheName).then(success => {
          if (success) {
            console.log('Successfully cleared cache:', cacheName);
          } else {
            console.warn('Failed to clear cache:', cacheName);
          }
        });
      });
    }).catch(error => {
      console.error('Error clearing caches:', error);
    });
  } else {
    console.log('Cache API is not supported in this browser');
  }
}

/**
 * Unregister service workers and clear all caches
 * Useful for development when cached assets might interfere with testing
 */
export function clearServiceWorkersAndCaches() {
  unregisterServiceWorkers();
  clearAllCaches();
}