import { useState, useEffect, useCallback } from 'react';

export type PublicRoute =
  | 'home' | 'features' | 'pricing' | 'quiz' | 'about' | 'security'
  | 'login' | 'contact'
  | 'privacy' | 'terms' | 'cookies' | 'ada'
  | 'not-found';

export type AppView =
  | 'dashboard' | 'app' | 'settings' | 'templates' | 'emails' | 'addresses'
  | 'prompts' | 'contacts' | 'analytics' | 'instagram' | 'team' | 'support';

const ROUTE_PATHS: Record<PublicRoute, string> = {
  home: '/',
  features: '/features',
  pricing: '/pricing',
  quiz: '/quiz',
  about: '/about',
  security: '/security',
  login: '/login',
  contact: '/contact',
  privacy: '/privacy',
  terms: '/terms',
  cookies: '/cookies',
  ada: '/ada',
  'not-found': '/404',
};

const APP_PATHS: Record<AppView, string> = {
  dashboard: '/app/dashboard',
  app: '/app/campaigns',
  settings: '/app/settings',
  templates: '/app/templates',
  emails: '/app/emails',
  addresses: '/app/addresses',
  prompts: '/app/prompts',
  contacts: '/app/contacts',
  analytics: '/app/analytics',
  instagram: '/app/instagram',
  team: '/app/team',
  support: '/app/support',
};

const PATH_TO_PUBLIC_ROUTE: Record<string, PublicRoute> = Object.entries(ROUTE_PATHS).reduce(
  (acc, [route, path]) => ({ ...acc, [path]: route as PublicRoute }),
  {}
);

const PATH_TO_APP_VIEW: Record<string, AppView> = Object.entries(APP_PATHS).reduce(
  (acc, [view, path]) => ({ ...acc, [path]: view as AppView }),
  {}
);

export function getRoutePath(route: PublicRoute): string {
  return ROUTE_PATHS[route] ?? '/';
}

export function getAppPath(view: AppView): string {
  return APP_PATHS[view] ?? '/app/dashboard';
}

function getCurrentPath(): string {
  return window.location.pathname || '/';
}

/** Check if the current URL is an app route (starts with /app/). Returns the AppView or null. */
export function parseAppView(path: string): AppView | null {
  if (path.startsWith('/app/')) {
    return PATH_TO_APP_VIEW[path] ?? null;
  }
  return null;
}

/** Check if the current URL is a public route. Returns the PublicRoute or null. */
export function parsePublicRoute(path: string): PublicRoute | null {
  return PATH_TO_PUBLIC_ROUTE[path] ?? null;
}

/** Get query params from the current URL as a Record. */
export function getQueryParams(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export function useRouter() {
  const [route, setRoute] = useState<PublicRoute>(() => parsePublicRoute(getCurrentPath()) ?? 'not-found');

  useEffect(() => {
    const onPopState = () => {
      const path = getCurrentPath();
      const publicRt = parsePublicRoute(path);
      if (publicRt) {
        setRoute(publicRt);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((newRoute: PublicRoute) => {
    const path = getRoutePath(newRoute);
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      setRoute(newRoute);
      window.scrollTo(0, 0);
    }
  }, []);

  return { route, navigate };
}

/** Hook for app-internal navigation (signed-in section). */
export function useAppRouter() {
  const [appView, setAppView] = useState<AppView | null>(() => parseAppView(getCurrentPath()));
  const [queryParams, setQueryParams] = useState<Record<string, string>>(() => getQueryParams());

  useEffect(() => {
    const onPopState = () => {
      const path = getCurrentPath();
      const view = parseAppView(path);
      setAppView(view);
      setQueryParams(getQueryParams());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToApp = useCallback((view: AppView, params?: Record<string, string>) => {
    const path = getAppPath(view);
    const search = params ? '?' + new URLSearchParams(params).toString() : '';
    const fullUrl = path + search;
    if (window.location.pathname !== path || window.location.search !== search) {
      window.history.pushState({}, '', fullUrl);
      setAppView(view);
      setQueryParams(params ?? {});
      window.scrollTo(0, 0);
    }
  }, []);

  return { appView, queryParams, navigateToApp };
}
