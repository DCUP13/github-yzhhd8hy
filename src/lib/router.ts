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

function getHashPath(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/';
}

export function useRouter() {
  const [route, setRoute] = useState<PublicRoute>(() => pathToRoute(getHashPath()));

  useEffect(() => {
    const onHashChange = () => {
      setRoute(pathToRoute(getHashPath()));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((newRoute: PublicRoute) => {
    const path = getRoutePath(newRoute);
    const newHash = '#' + path;
    if (window.location.hash !== newHash) {
      window.location.hash = newHash;
      setRoute(newRoute);
      window.scrollTo(0, 0);
    }
  }, []);

  return { route, navigate };
}
