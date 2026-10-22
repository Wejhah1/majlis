// Mafia: the server is the moderator. Roles, night actions and investigation results only ever
// reach the people allowed to see them (see view()). An optional narrator seat sees everything.
import type { AssetRef, Ctx, GameModule, Seat, Viewer } from '../types';
import { fail, isRecord, shuffled } from '../types';
import { meta } from './meta';
import type { MafiaRole } from './roles';

export type Settings = {
  mafiaCount: number; // 0 = automatic
  doctor: boolean;
  detective: boolean;
  revealOnDeath: boolean;
  nightSeconds: number; // 0 = no timer
  daySeconds: number;
};

export type Phase = 'reveal' | 'night' | 'dawn' | 'day' | 'verdict' | 'over';

type Player = { id: string; name: string; portrait: AssetRef | null; role: MafiaRole; alive: boolean };
type Death = { id: string; round: number; cause: 'night' | 'vote' };

export type State = {
  settings: Settings;
  players: Player[];
  narratorId: string | null;
  phase: Phase;
  round: number;
  ready: string[];
  mafiaVotes: Record<string, string>;
  save: string | null;
  lastSave: string | null;
  check: string | null;
  checks: { round: number; target: string; mafia: boolean }[];
  dawn: { killed: string | null } | null;
  votes: Record<string, string>; // voter → target id or 'skip'
  verdict: { eliminated: string | null } | null;
  deaths: Death[];
  winner: 'mafia' | 'town' | null;
  deadline: number | null;
  art: { roles: Record<string, AssetRef>; back: AssetRef | null };
};

export const autoMafia = (n: number) => Math.max(1, Math.floor(n / 4));

class Rule extends Error {}
const assert = (ok: unknown, code: string): void => {
  if (!ok) throw new Rule(code);
};

const living = (s: State) => s.players.filter((p) => p.alive);
const livingMafia = (s: State) => living(s).filter((p) => p.role === 'mafia');
const isAlive = (s: State, id: string) => s.players.some((p) => p.id === id && p.alive);

function checkWin(s: State) {
  const mafia = livingMafia(s).length;
  const town = living(s).length - mafia;
  if (mafia === 0) s.winner = 'town';
  else if (mafia >= town) s.winner = 'mafia';
  if (s.winner) {
    s.phase = 'over';
    s.deadline = null;
  }
  return !!s.winner;
}

function startNight(s: State, now: number) {
  s.round++;
  s.phase = 'night';
  s.mafiaVotes = {};
  s.save = null;
  s.check = null;
  s.dawn = null;
  s.verdict = null;
  s.deadline = s.settings.nightSeconds ? now + s.settings.nightSeconds * 1000 : null;
}

function nightDone(s: State) {
  const mafiaIn = livingMafia(s).every((m) => s.mafiaVotes[m.id]);
  const doctor = living(s).find((p) => p.role === 'doctor');
  const detective = living(s).find((p) => p.role === 'detective');
  return mafiaIn && (!doctor || s.save !== null) && (!detective || s.check !== null);
}

function resolveNight(s: State, rng: () => number) {
  const tally = new Map<string, number>();
  for (const [voter, target] of Object.entries(s.mafiaVotes)) if (isAlive(s, voter)) tally.set(target, (tally.get(target) ?? 0) + 1);
  const top = Math.max(0, ...tally.values());
  const tied = [...tally].filter(([, n]) => n === top && n > 0).map(([id]) => id);
  const victim = tied.length ? tied[Math.floor(rng() * tied.length)]! : null;
  const detective = living(s).find((p) => p.role === 'detective');
  if (detective && s.check) s.checks.push({ round: s.round, target: s.check, mafia: s.players.find((p) => p.id === s.check)?.role === 'mafia' });
  let killed: string | null = null;
  if (victim && victim !== s.save) {
    killed = victim;
    s.players.find((p) => p.id === victim)!.alive = false;
    s.deaths.push({ id: victim, round: s.round, cause: 'night' });
  }
  s.lastSave = s.save;
  s.dawn = { killed };
  s.phase = 'dawn';
  s.deadline = null;
  checkWin(s);
}

function startDay(s: State, now: number) {
  s.phase = 'day';
  s.votes = {};
  s.deadline = s.settings.daySeconds ? now + s.settings.daySeconds * 1000 : null;
}

export function tally(s: Pick<State, 'votes' | 'players'>) {
  const counts: Record<string, number> = {};
  for (const [voter, target] of Object.entries(s.votes)) {
    if (!s.players.some((p) => p.id === voter && p.alive)) continue;
    counts[target] = (counts[target] ?? 0) + 1;
  }
  return counts;
}

function resolveDay(s: State) {
  const counts = tally(s);
  const needed = Math.floor(living(s).length / 2) + 1;
  const [top] = Object.entries(counts)
    .filter(([id]) => id !== 'skip')
    .sort((a, b) => b[1] - a[1]);
  let eliminated: string | null = null;
  if (top && top[1] >= needed) {
    eliminated = top[0];
    s.players.find((p) => p.id === eliminated)!.alive = false;
    s.deaths.push({ id: eliminated, round: s.round, cause: 'vote' });
  }
  s.verdict = { eliminated };
  s.phase = 'verdict';
  s.deadline = null;
  checkWin(s);
}

/** The narrator if there is one, otherwise the room admin, moves the story along. */
const isController = (s: State, id: string, adminId: string) => (s.narratorId ? id === s.narratorId : id === adminId);

function apply(state: State, actorId: string, raw: unknown, ctx: Ctx): State {
  assert(isRecord(raw) && typeof raw.type === 'string', 'BAD_ACTION');
  const action = raw as { type: string; target?: unknown };
  const s = structuredClone(state);
  const me = s.players.find((p) => p.id === actorId);
  const controller = isController(s, actorId, ctx.adminId);
  assert(me || actorId === s.narratorId, 'NOT_IN_MATCH');
  assert(s.phase !== 'over', 'FINISHED');
  const target = typeof action.target === 'string' ? action.target : null;

  switch (action.type) {
    case 'READY': {
      assert(s.phase === 'reveal' && me, 'BAD_PHASE');
      if (!s.ready.includes(me!.id)) s.ready.push(me!.id);
      if (s.players.every((p) => s.ready.includes(p.id))) startNight(s, ctx.now);
      return s;
    }
    case 'KILL':
    case 'SAVE':
    case 'CHECK': {
      assert(s.phase === 'night', 'BAD_PHASE');
      assert(me?.alive, 'DEAD');
      assert(target && isAlive(s, target), 'PICK_LIVING');
      if (action.type === 'KILL') {
        assert(me!.role === 'mafia', 'NOT_YOUR_ROLE');
        assert(s.players.find((p) => p.id === target)!.role !== 'mafia', 'NOT_A_TEAMMATE');
        s.mafiaVotes[me!.id] = target!;
      } else if (action.type === 'SAVE') {
        assert(me!.role === 'doctor', 'NOT_YOUR_ROLE');
        assert(target !== s.lastSave, 'NOT_TWICE');
        s.save = target;
      } else {
        assert(me!.role === 'detective', 'NOT_YOUR_ROLE');
        assert(target !== me!.id, 'NOT_YOURSELF');
        s.check = target;
      }
      if (nightDone(s)) resolveNight(s, ctx.rng);
      return s;
    }
    case 'VOTE': {
      assert(s.phase === 'day', 'BAD_PHASE');
      assert(me?.alive, 'DEAD');
      assert(target === 'skip' || (target && isAlive(s, target) && target !== me!.id), 'PICK_LIVING');
      if (s.votes[me!.id] === target) delete s.votes[me!.id];
      else s.votes[me!.id] = target!;
      if (living(s).every((p) => s.votes[p.id])) resolveDay(s);
      return s;
    }
    case 'CLOSE': {
      assert(controller, 'CONTROLLER_ONLY');
      if (s.phase === 'day') resolveDay(s);
      else if (s.phase === 'night') resolveNight(s, ctx.rng);
      else throw new Rule('BAD_PHASE');
      return s;
    }
    case 'CONTINUE': {
      assert(controller, 'CONTROLLER_ONLY');
      if (s.phase === 'dawn') startDay(s, ctx.now);
      else if (s.phase === 'verdict') startNight(s, ctx.now);
      else if (s.phase === 'reveal') startNight(s, ctx.now);
      else throw new Rule('BAD_PHASE');
      return s;
    }
    default:
      throw new Rule('BAD_ACTION');
  }
}

function setup(settings: Settings, seats: Seat[], content: { roleArt: Record<string, AssetRef>; cardBack: AssetRef | null }, ctx: Ctx): State {
  const narrator = seats.find((p) => p.role === 'narrator') ?? null;
  const people = seats.filter((p) => p !== narrator);
  const n = people.length;
  const mafia = settings.mafiaCount || autoMafia(n);
  const deck: MafiaRole[] = [
    ...Array<MafiaRole>(mafia).fill('mafia'),
    ...(settings.detective ? (['detective'] as const) : []),
    ...(settings.doctor ? (['doctor'] as const) : []),
  ];
  while (deck.length < n) deck.push('villager');
  const roles = shuffled(deck, ctx.rng);
  return {
    settings,
    players: people.map((p, i) => ({ id: p.id, name: p.name, portrait: p.portrait, role: roles[i]!, alive: true })),
    narratorId: narrator?.id ?? null,
    phase: 'reveal',
    round: 0,
    ready: [],
    mafiaVotes: {},
    save: null,
    lastSave: null,
    check: null,
    checks: [],
    dawn: null,
    votes: {},
    verdict: null,
    deaths: [],
    winner: null,
    deadline: null,
    art: { roles: content.roleArt, back: content.cardBack },
  };
}

function view(s: State, viewer: Viewer, ctx: { now: number; adminId: string }) {
  const id = viewer.kind === 'player' ? viewer.seatId : null;
  const me = id ? s.players.find((p) => p.id === id) ?? null : null;
  const narrator = !!id && id === s.narratorId;
  const over = s.phase === 'over';
  const mafiaEyes = me?.role === 'mafia';
  const seesRole = (p: Player) =>
    narrator || over || p.id === me?.id || (mafiaEyes && p.role === 'mafia') || (!p.alive && s.settings.revealOnDeath);

  return {
    phase: s.phase,
    round: s.round,
    deadline: s.deadline,
    winner: s.winner,
    narrator,
    narratorId: s.narratorId,
    controller: !!id && isController(s, id, ctx.adminId),
    me: me ? { id: me.id, role: me.role, alive: me.alive } : null,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      portrait: p.portrait,
      alive: p.alive,
      role: seesRole(p) ? p.role : null,
      ready: s.phase === 'reveal' ? s.ready.includes(p.id) : undefined,
    })),
    counts: { mafia: s.players.filter((p) => p.role === 'mafia').length, total: s.players.length },
    night:
      s.phase === 'night'
        ? {
            mafiaVotes: mafiaEyes || narrator ? { ...s.mafiaVotes } : {},
            mySave: me?.role === 'doctor' || narrator ? s.save : null,
            myCheck: me?.role === 'detective' || narrator ? s.check : null,
            lastSave: me?.role === 'doctor' ? s.lastSave : null,
          }
        : null,
    checks: me?.role === 'detective' || narrator ? s.checks.map((c) => ({ ...c })) : [],
    dawn: s.dawn ? { ...s.dawn } : null,
    votes: s.phase === 'day' || s.phase === 'verdict' ? { ...s.votes } : {},
    verdict: s.verdict ? { ...s.verdict } : null,
    deaths: s.deaths.map((d) => ({ ...d })),
    needed: Math.floor(living(s).length / 2) + 1,
    art: s.art,
  };
}

export type View = ReturnType<typeof view>;

export const game: GameModule<State, View, Settings> = {
  meta,
  defaultSettings: { mafiaCount: 0, doctor: true, detective: true, revealOnDeath: true, nightSeconds: 0, daySeconds: 0 },
  parseSettings(input) {
    if (!isRecord(input)) return fail('SETTINGS_INVALID');
    const int = (v: unknown, min: number, max: number, def: number) => {
      const n = v === undefined ? def : Number(v);
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    };
    const mafiaCount = int(input.mafiaCount, 0, 6, 0);
    const nightSeconds = int(input.nightSeconds, 0, 600, 0);
    const daySeconds = int(input.daySeconds, 0, 1800, 0);
    if (mafiaCount === null || nightSeconds === null || daySeconds === null) return fail('SETTINGS_INVALID');
    return {
      mafiaCount,
      nightSeconds,
      daySeconds,
      doctor: input.doctor !== false,
      detective: input.detective !== false,
      revealOnDeath: input.revealOnDeath !== false,
    };
  },
  seatRules(seats, settings) {
    const n = seats.filter((p) => p.role !== 'narrator').length;
    if (n < meta.players[0]) return fail('NEED_FIVE');
    if (n > meta.players[1]) return fail('TOO_MANY');
    const mafia = settings.mafiaCount || autoMafia(n);
    if (mafia * 2 >= n) return fail('TOO_MANY_MAFIA');
    return true;
  },
  setup: (settings, seats, content, ctx) => setup(settings, seats, content, ctx),
  transition(state, seatId, action, ctx) {
    try {
      return apply(state, seatId, action, ctx);
    } catch (e) {
      if (e instanceof Rule) return fail(e.message);
      throw e;
    }
  },
  view,
  bot(v, id, rng) {
    const me = v.me;
    if (!me || v.phase === 'over') return null;
    const pick = <T,>(list: T[]) => (list.length ? list[Math.floor(rng() * list.length)]! : null);
    const others = v.players.filter((p) => p.alive && p.id !== id);
    if (v.phase === 'reveal') return v.players.find((p) => p.id === id)?.ready ? null : { type: 'READY' };
    if (!me.alive) return null;
    if (v.phase === 'night' && v.night) {
      if (me.role === 'mafia' && !v.night.mafiaVotes[id]) {
        const t = pick(others.filter((p) => p.role !== 'mafia'));
        return t ? { type: 'KILL', target: t.id } : null;
      }
      if (me.role === 'doctor' && !v.night.mySave) {
        const t = pick(v.players.filter((p) => p.alive && p.id !== v.night!.lastSave));
        return t ? { type: 'SAVE', target: t.id } : null;
      }
      if (me.role === 'detective' && !v.night.myCheck) {
        const t = pick(others);
        return t ? { type: 'CHECK', target: t.id } : null;
      }
    }
    if (v.phase === 'day' && !v.votes[id]) {
      const t = rng() < 0.25 ? null : pick(others);
      return { type: 'VOTE', target: t ? t.id : 'skip' };
    }
    return null;
  },
  nextDeadline: (s) => (s.phase === 'night' || s.phase === 'day' ? s.deadline : null),
  tick(state, ctx) {
    if (state.deadline === null || ctx.now < state.deadline) return state;
    const s = structuredClone(state);
    if (s.phase === 'night') resolveNight(s, ctx.rng);
    else if (s.phase === 'day') resolveDay(s);
    return s;
  },
};
