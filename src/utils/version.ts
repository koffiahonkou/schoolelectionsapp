// Automatically updated build timestamp to bust any lingering client-side bundle cache
export const APP_BUILD_ID = '2026-09-21-v4-cache-bust';

export function checkForAppUpdates() {
  try {
    const storedVersion = localStorage.getItem('school_election_build_version');
    if (storedVersion && storedVersion !== APP_BUILD_ID) {
      console.log(`[VersionCheck] New application version detected (${APP_BUILD_ID} vs ${storedVersion}). Purging caches and unregistering stale service workers...`);
      localStorage.setItem('school_election_build_version', APP_BUILD_ID);

      // 1. Purge CacheStorage API
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        });
      }

      // 2. Unregister any lingering Service Workers
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister();
          }
        });
      }
    } else if (!storedVersion) {
      localStorage.setItem('school_election_build_version', APP_BUILD_ID);
    }
  } catch {
    // ignore
  }
}

/**
 * Programmatically clears all browser caches, service workers, and forces a hard reload.
 */
export async function forceClearAppCacheAndReload() {
  try {
    sessionStorage.clear();
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }
  } catch (err) {
    console.warn('Cache clearing partially failed:', err);
  }
  // Hard reload from server bypassing cache
  window.location.reload();
}
