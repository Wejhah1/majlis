import type { AssetRef } from '../games/types';
import type { Group, RosterMember } from '../app/group';

export type ContentRow = { id: string; game: string; kind: string; data: any; created_at: number };
export type AdminData = { group: Group; members: RosterMember[]; content: ContentRow[]; defaults: Record<string, boolean> };
export type Status = { claimed: boolean; authed: boolean; envPassword: boolean };

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({ ok: false, error: 'SERVER_ERROR' }))) as T & { ok: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'SERVER_ERROR');
  return data;
}

export const api = {
  status: () => call<Status>('status'),
  claim: (password: string) => call('claim', 'POST', { password }),
  login: (password: string) => call('login', 'POST', { password }),
  logout: () => call('logout', 'POST', {}),
  password: (password: string) => call('password', 'POST', { password }),
  data: () => call<AdminData>('data'),
  group: (group: Group) => call<{ group: Group }>('group', 'POST', group),
  defaults: (game: string, include: boolean) => call('defaults', 'POST', { game, include }),
  saveMember: (m: { id?: string; name: string; portrait: AssetRef | null }) => call<{ members: RosterMember[] }>('members', 'POST', m),
  deleteMember: (id: string) => call<{ members: RosterMember[] }>(`members/${id}`, 'DELETE'),
  addContent: (game: string, kind: string, data: unknown) => call<{ id: string }>('content', 'POST', { game, kind, data }),
  deleteContent: (id: string) => call(`content/${id}`, 'DELETE'),
};
