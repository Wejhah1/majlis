// فكّها: the TV shows a picture combination, teams buzz from their phones, and the host's phone
// (which alone sees the answer) awards points. Every award is an event the TV animates.
import type { AssetRef, Ctx, GameModule, Puzzle, Seat, Viewer } from '../types';
import { fail, isRecord, shuffled } from '../types';
import { meta } from './meta';

export type Settings = { rounds: number; points: number };
export type Phase = 'show' | 'answer' | 'final';
type Team = string;

type Player = { id: string; name: string; portrait: AssetRef | null; team: Team | null };

export type State = {
  settings: Settings;
  teams: Team[];
  players: Player[];
  hostId: string;
  puzzles: Puzzle[];
  index: number;
  phase: Phase;
  scores: Record<Team, number>;
  hint: boolean;
  buzz: { team: Team; playerId: string } | null;
  lockedOut: Team[];
  /** Bumped on every scoring event so screens can replay the animation exactly once. */
  event: { n: number; kind: 'award' | 'wrong' | 'reveal' | 'adjust'; team: Team | null; points: number };
};

class Rule extends Error {}
const assert = (ok: unknown, code: string): void => {
  if (!ok) throw new Rule(code);
};

const puzzle = (s: State) => s.puzzles[s.index]!;

function nextPuzzle(s: State) {
  if (s.index + 1 >= s.puzzles.length) {
    s.phase = 'final';
    return;
  }
  s.index++;
  s.phase = 'show';
  s.hint = false;
  s.buzz = null;
  s.lockedOut = [];
}

function apply(state: State, actorId: string, raw: unknown): State {
  assert(isRecord(raw) && typeof raw.type === 'string', 'BAD_ACTION');
  const action = raw as { type: string; team?: unknown; delta?: unknown };
  const s = structuredClone(state);
  const host = actorId === s.hostId;
  const me = s.players.find((p) => p.id === actorId);
  const event = (kind: State['event']['kind'], team: Team | null, points: number) => {
    s.event = { n: s.event.n + 1, kind, team, points };
  };

  if (action.type === 'BUZZ') {
    assert(me?.team, 'NOT_A_PLAYER');
    assert(s.phase === 'show', 'BAD_PHASE');
    assert(!s.lockedOut.includes(me!.team!), 'LOCKED_OUT');
    if (!s.buzz) s.buzz = { team: me!.team!, playerId: me!.id };
    return s;
  }

  assert(host, 'HOST_ONLY');
  const team = typeof action.team === 'string' && s.teams.includes(action.team) ? action.team : null;
  switch (action.type) {
    case 'AWARD': {
      assert(s.phase === 'show', 'BAD_PHASE');
      const winner = team ?? s.buzz?.team ?? null;
      assert(winner, 'PICK_TEAM');
      const points = s.hint ? Math.ceil(s.settings.points / 2) : s.settings.points;
      s.scores[winner!] = (s.scores[winner!] ?? 0) + points;
      s.phase = 'answer';
      event('award', winner, points);
      return s;
    }
    case 'WRONG': {
      assert(s.phase === 'show' && s.buzz, 'NO_BUZZ');
      s.lockedOut.push(s.buzz!.team);
      event('wrong', s.buzz!.team, 0);
      s.buzz = null;
      // Everyone got it wrong: reopen for all.
      if (s.lockedOut.length >= s.teams.length) s.lockedOut = [];
      return s;
    }
    case 'HINT':
      assert(s.phase === 'show' && puzzle(s).hint, 'NO_HINT');
      s.hint = true;
      return s;
    case 'REVEAL':
      assert(s.phase === 'show', 'BAD_PHASE');
      s.phase = 'answer';
      event('reveal', null, 0);
      return s;
    case 'NEXT':
      assert(s.phase !== 'final', 'BAD_PHASE');
      nextPuzzle(s);
      return s;
    case 'ADJUST': {
      const delta = Number(action.delta);
      assert(team && Number.isInteger(delta) && Math.abs(delta) <= 100, 'BAD_ACTION');
      s.scores[team!] = (s.scores[team!] ?? 0) + delta;
      event('adjust', team, delta);
      return s;
    }
    default:
      throw new Rule('BAD_ACTION');
  }
}

function setup(settings: Settings, seats: Seat[], content: { puzzles: Puzzle[] }, ctx: Ctx): State {
  const teams = (meta.lobby.teams ?? []).map((t) => t.id);
  const host = seats.find((p) => p.role === 'host')!;
  const custom = shuffled(content.puzzles.filter((p) => !p.id.startsWith('builtin-')), ctx.rng);
  const builtIn = shuffled(content.puzzles.filter((p) => p.id.startsWith('builtin-')), ctx.rng);
  return {
    settings,
    teams,
    players: seats.filter((p) => p !== host).map((p) => ({ id: p.id, name: p.name, portrait: p.portrait, team: p.team })),
    hostId: host.id,
    puzzles: [...custom, ...builtIn].slice(0, settings.rounds),
    index: 0,
    phase: 'show',
    scores: Object.fromEntries(teams.map((t) => [t, 0])),
    hint: false,
    buzz: null,
    lockedOut: [],
    event: { n: 0, kind: 'reveal', team: null, points: 0 },
  };
}

function view(s: State, viewer: Viewer) {
  const id = viewer.kind === 'player' ? viewer.seatId : null;
  const p = puzzle(s);
  const host = id === s.hostId;
  const shown = s.phase !== 'show';
  const me = s.players.find((x) => x.id === id) ?? null;
  return {
    phase: s.phase,
    index: s.index,
    total: s.puzzles.length,
    isHost: host,
    myTeam: me?.team ?? null,
    teams: s.teams,
    scores: { ...s.scores },
    tiles: p.tiles,
    hint: s.hint || host ? p.hint ?? null : null,
    hintShown: s.hint,
    hasHint: !!p.hint,
    answer: shown || host ? p.answer : null,
    buzz: s.buzz ? { ...s.buzz, name: s.players.find((x) => x.id === s.buzz!.playerId)?.name ?? '' } : null,
    lockedOut: [...s.lockedOut],
    event: { ...s.event },
    points: s.hint ? Math.ceil(s.settings.points / 2) : s.settings.points,
    players: s.players.map((x) => ({ ...x })),
  };
}

export type View = ReturnType<typeof view>;

export const game: GameModule<State, View, Settings> = {
  meta,
  defaultSettings: { rounds: 10, points: 10 },
  parseSettings(input) {
    if (!isRecord(input)) return fail('SETTINGS_INVALID');
    const rounds = Number(input.rounds ?? 10);
    const points = Number(input.points ?? 10);
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > 50) return fail('SETTINGS_INVALID');
    if (!Number.isInteger(points) || points < 1 || points > 100) return fail('SETTINGS_INVALID');
    return { rounds, points };
  },
  seatRules(seats) {
    if (seats.filter((p) => p.role === 'host').length !== 1) return fail('HOST_REQUIRED');
    const teams = meta.lobby.teams ?? [];
    for (const t of teams) if (!seats.some((p) => p.team === t.id && p.role !== 'host')) return fail(`TEAM_EMPTY_${t.id.toUpperCase()}`);
    return true;
  },
  setup: (settings, seats, content, ctx) => setup(settings, seats, content, ctx),
  transition(state, seatId, action) {
    try {
      return apply(state, seatId, action);
    } catch (e) {
      if (e instanceof Rule) return fail(e.message);
      throw e;
    }
  },
  view: (s, viewer) => view(s, viewer),
  bot(v, _id, rng) {
    if (v.phase === 'final') return null;
    if (v.isHost) {
      // A bot host lets you test as a player: it judges buzzes at random and moves on.
      if (v.phase === 'answer') return { type: 'NEXT' };
      if (v.buzz) return { type: rng() < 0.6 ? 'AWARD' : 'WRONG' };
      return null;
    }
    if (v.phase !== 'show' || v.buzz || !v.myTeam || v.lockedOut.includes(v.myTeam)) return null;
    return { type: 'BUZZ' };
  },
  botDelay: (v, rng) => (v.isHost ? 2500 + rng() * 1500 : 3000 + rng() * 6000),
  // Buzzes race on purpose: the first one in wins, so no stale-version rejections for them.
  raceSafe: (action) => isRecord(action) && action.type === 'BUZZ',
};
