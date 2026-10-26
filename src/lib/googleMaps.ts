/** Loads the Google Maps JavaScript API once. Resolves when ready; rejects if the script cannot load. */
let loading: Promise<void> | null = null;

export const GOOGLE_MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || '';

export function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.maps) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    // Google calls this later if the key is rejected (wrong referrer, API not enabled, billing off).
    w.gm_authFailure = () => window.dispatchEvent(new Event('gm-auth-failure'));
    w.__gmReady = () => resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&callback=__gmReady`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error('The Google Maps script could not be loaded.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}
