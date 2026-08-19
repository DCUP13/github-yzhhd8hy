import { useEffect, useState } from 'react';

export interface AppRoute {
  view: string;
  params: Record<string, string>;
}

/**
 * Parses `window.location.hash` into a structured route.
 *
 * Expected hash format: `#/view?param=value&other=value2`
 * - The leading `#` and optional `/` are stripped to derive the view name.
 * - Anything after the first `?` is parsed as query-string parameters.
 * - An empty hash resolves to the default view `dashboard`.
 *
 * @returns {AppRoute} An object with a `view` string and a `params` map.
 */
export function parseRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#/, '');
  const raw = hash.startsWith('/') ? hash.slice(1) : hash;

  if (!raw) {
    return { view: 'dashboard', params: {} };
  }

  const [viewSegment, queryString] = raw.split('?');
  const view = viewSegment || 'dashboard';

  const params: Record<string, string> = {};
  if (queryString) {
    for (const pair of queryString.split('&')) {
      if (!pair) continue;
      const [key, ...rest] = pair.split('=');
      if (!key) continue;
      const value = rest.join('=');
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }

  return { view, params };
}

/**
 * Updates `window.location.hash` to navigate to a view, optionally with params.
 * The hash is built as `#/view?key=value&...`.
 *
 * @param view   The target view name (e.g. "instagram", "settings").
 * @param params Optional key/value params appended as a query string.
 */
export function navigateToApp(view: string, params?: Record<string, string>): void {
  let hash = `#/${view}`;
  if (params && Object.keys(params).length > 0) {
    const query = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    hash += `?${query}`;
  }
  window.location.hash = hash;
}

/**
 * React hook that subscribes to hash changes and returns the current route.
 * Re-renders the component whenever `hashchange` fires.
 *
 * @returns {AppRoute} The currently active route.
 */
export function useRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute());

  useEffect(() => {
    const handleChange = () => setRoute(parseRoute());
    window.addEventListener('hashchange', handleChange);
    // Sync in case the hash changed before the listener was attached.
    setRoute(parseRoute());
    return () => window.removeEventListener('hashchange', handleChange);
  }, []);

  return route;
}
