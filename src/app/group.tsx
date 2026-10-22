import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AssetRef } from '../games/types';

export type Group = { name: string; accent: string | null; tagline: string };
export type RosterMember = { id: string; name: string; portrait: AssetRef | null };

type GroupState = {
  group: Group | null;
  roster: RosterMember[];
  refresh(): void;
};

const Ctx = createContext<GroupState>({ group: null, roster: [], refresh() {} });

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Loads the group's name, accent colour and friend roster once for the whole app. */
export function GroupProvider({ children }: { children: ReactNode }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [roster, setRoster] = useState<RosterMember[]>([]);

  const refresh = useCallback(() => {
    void getJSON<{ group: Group }>('/api/group').then((d) => d && setGroup(d.group));
    void getJSON<{ members: RosterMember[] }>('/api/roster').then((d) => d && setRoster(d.members));
  }, []);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    if (group?.accent) document.documentElement.style.setProperty('--group-accent', group.accent);
    else document.documentElement.style.removeProperty('--group-accent');
  }, [group?.accent]);

  return <Ctx.Provider value={{ group, roster, refresh }}>{children}</Ctx.Provider>;
}

export const useGroup = () => useContext(Ctx);
