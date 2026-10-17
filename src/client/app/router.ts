import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'settings' } | { name: 'room'; code: string } | { name: 'play' } | { name: 'learn' } | { name: 'dev'; id: string };

export function parse(path: string): Route {
  if (path.startsWith('/dev/')) return { name: 'dev', id: decodeURIComponent(path.slice(5)) };
  if (path === '/settings') return { name: 'settings' };
  if (path === '/play') return { name: 'play' };
  if (path === '/learn') return { name: 'learn' };
  const room = /^\/r\/([A-Za-z0-9]{5})\/?$/.exec(path);
  if (room) return { name: 'room', code: room[1]!.toUpperCase() };
  return { name: 'home' };
}

export function href(r: Route): string {
  switch (r.name) {
    case 'home': return '/';
    case 'settings': return '/settings';
    case 'play': return '/play';
    case 'learn': return '/learn';
    case 'room': return `/r/${r.code}`;
    case 'dev': return `/dev/${r.id}`;
  }
}

export function useRoute(): [Route, (r: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState(() => parse(window.location.pathname));
  useEffect(() => {
    const onPop = () => setRoute(parse(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (r: Route, replace = false) => {
    if (replace) window.history.replaceState(null, '', href(r));
    else window.history.pushState(null, '', href(r));
    setRoute(r);
    window.scrollTo(0, 0);
  };
  return [route, go];
}
