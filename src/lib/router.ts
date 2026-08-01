import { useState, useEffect, useCallback } from 'react';

export type PublicRoute =
  | 'home' | 'features' | 'pricing' | 'quiz' | 'about' | 'security'
  | 'login' | 'contact'
  | 'privacy' | 'terms' | 'cookies' | 'ada';

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
};

const PATH_TO_ROUTE: Record<string, PublicRoute> = Object.entries(ROUTE_PATHS).reduce(
  (acc, [route, path]) => ({ ...acc, [path]: route as PublicRoute }),
  {}
);

export function getRoutePath(route: PublicRoute): string {
  return ROUTE_PATHS[route] ?? '/';
}

export function pathToRoute(path: string): PublicRoute {
  return PATH_TO_ROUTE[path] ?? 'home';
}

export function useRouter() {
  const [route, setRoute] = useState<PublicRoute>(() => pathToRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = () => {
      setRoute(pathToRoute(window.location.pathname));
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
