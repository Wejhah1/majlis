import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomConnection, type ClientRoom, type ConnectionStatus } from '../platform/room/client';

/** One live room connection. Pass token=null for a read-only TV screen. */
export function useRoom(code: string | null, token: string | null, opts: { screen?: boolean; onError?(code: string): void } = {}) {
  const [room, setRoom] = useState<ClientRoom | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [removed, setRemoved] = useState<string | null>(null);
  const conn = useRef<RoomConnection | null>(null);
  const onError = useRef(opts.onError);
  onError.current = opts.onError;

  useEffect(() => {
    if (!code || (!token && !opts.screen)) return;
    setRoom(null);
    setRemoved(null);
    const c = new RoomConnection({
      code,
      token: token ?? undefined,
      onRoom: setRoom,
      onStatus: setStatus,
      onError: (e) => onError.current?.(e),
      onRemoved: setRemoved,
    });
    conn.current = c;
    c.open();
    const wake = () => {
      if (document.visibilityState === 'visible') c.wake();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      c.stop();
      conn.current = null;
    };
  }, [code, token, opts.screen]);

  const send = useCallback((action: Record<string, unknown>) => {
    return conn.current ? conn.current.send(action) : Promise.reject(new Error('DISCONNECTED'));
  }, []);

  return { room, status, removed, send };
}

/** Server-corrected "now" that ticks every second while mounted, for countdowns. */
export function useServerNow(offset: number, active = true) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [offset, active]);
  return now;
}
