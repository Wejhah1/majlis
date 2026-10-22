import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';

// Four routes don't need a router library: /, /r/CODE, /tv/CODE, /admin.
export type Route =
  | { name: 'home'; game?: string }
  | { name: 'room'; code: string }
  | { name: 'tv'; code: string | null }
  | { name: 'admin' };

export function parseRoute(path: string, search = ''): Route {
  const room = path.match(/^\/r\/([A-Za-z0-9-]+)\/?$/);
  if (room) return { name: 'room', code: room[1]!.replace(/-/g, '').toUpperCase() };
  const tv = path.match(/^\/tv(?:\/([A-Za-z0-9-]+))?\/?$/);
  if (tv) return { name: 'tv', code: tv[1] ? tv[1].replace(/-/g, '').toUpperCase() : null };
  if (/^\/admin\/?$/.test(path)) return { name: 'admin' };
  // Old passnames-style invites (?room=CODE) still work.
  const legacy = new URLSearchParams(search).get('room');
  if (legacy) return { name: 'room', code: legacy.replace(/[\s-]/g, '').toUpperCase() };
  return { name: 'home', game: new URLSearchParams(search).get('game') ?? undefined };
}

export function navigate(to: string, replace = false) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(location.pathname, location.search));
  useEffect(() => {
    const update = () => setRoute(parseRoute(location.pathname, location.search));
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return route;
}

/** Plain <a> that navigates in-app on a normal click and still works with ctrl/middle click. */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}
