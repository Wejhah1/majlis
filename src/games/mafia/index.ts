// Mafia: the server is the moderator. Roles, night actions and investigation results only ever
// reach the people allowed to see them (see view()). An optional narrator seat sees everything;
// without one the room admin keeps the controls and announcements move on by themselves.
import type { AssetRef, Ctx, GameModule, Seat, Viewer } from '../types';
import { fail, isRecord, shuffled } from '../types';
import { meta } from './meta';
import type { MafiaRole } from './roles';

export type Settings = {
  mafiaCount: number; // 0 = automatic
  doctor: boolean;
  detective: boolean;
  witch: boolean;
  hunter: boolean;
  cupid: boolean;
  elder: boolean;
  idiot: boolean;
  revealOnDeath: boolean;
  nightSeconds: number; // 0 = no timer
  discussSeconds: number; // talk with the vote locked; 0 = until the controller opens it
  daySeconds: number; // the vote itself
};

/** discuss = talk, vote locked. day = the vote is open. */
export type Phase = 'reveal' | 'night' | 'dawn' | 'discuss' | 'day' | 'verdict' | 'over';

type Player = { id: string; name: string; portrait: AssetRef | null; role: MafiaRole; alive: boolean; art: AssetRef | null };
type Death = { id: string; round: number; cause: 'night' | 'vote' | 'poison' | 'love' | 'shot' };

export type State = {
  settings: Settings;
  players: Player[];
  narratorId: string | null;
  phase: Phase;
  round: number;
  ready: string[];
  /** Night has two steps: everyone acts, then the Witch sees the victim and decides. */
  nightStep: 'main' | 'witch';
  mafiaVotes: Record<string, string>;
  save: string | null;
  lastSave: string | null;
  check: string | null;
  checks: { round: number; target: string; mafia: boolean }[];
  pendingVictim: string | null;
  potions: { heal: boolean; poison: boolean };
  witchHeal: boolean;
  witchPoison: string | null;
  lovers: [string, string] | null;
  elderHit: boolean;
  idiotRevealed: string | null;
  /** A dead Hunter owes a last shot; the story waits for it. */
  hunter: { id: string; shot: string | null } | null;
  /** Everyone who died since the last announcement started. */
  fallen: string[];
  dawn: { killed: string[]; blocked: boolean } | null;
  votes: Record<string, string>; // voter → target id or 'skip'
  verdict: { eliminated: string | null; spared: string | null } | null;
  deaths: Death[];
  winner: 'mafia' | 'town' | null;
  deadline: number | null;
  paused: { left: number } | null;
  art: { back: AssetRef | null };
};

export const autoMafia = (n: number) => Math.max(1, Math.floor(n / 4));
/** How long an announcement stays up when nobody is narrating. */
export const ANNOUNCE_MS = 15_000;
const WITCH_MS = 30_000;
const EXTEND_MS = 30_000;

class Rule extends Error {}
const assert = (ok: unknown, code: string): void => {
  if (!ok) throw new Rule(code);
};

const living = (s: State) => s.players.filter((p) => p.alive);
const livingMafia = (s: State) => living(s).filter((p) => p.role === 'mafia');
const livingRole = (s: State, role: MafiaRole) => living(s).find((p) => p.role === role);
const isAlive = (s: State, id: string) => s.players.some((p) => p.id === id && p.alive);
const voters = (s: State) => living(s).filter((p) => p.id !== s.idiotRevealed);
const needed = (s: State) => Math.floor(voters(s).length / 2) + 1;
const hunterOwes = (s: State) => !!s.hunter && s.hunter.shot === null;
const timer = (now: number, seconds: number) => (seconds ? now + seconds * 1000 : null);
const announceDeadline = (s: State, now: number) => (s.narratorId || hunterOwes(s) ? null : now + ANNOUNCE_MS);

function checkWin(s: State) {
  const mafia = livingMafia(s).length;
  const town = living(s).length - mafia;
  if (mafia === 0) s.winner = 'town';
  else if (mafia >= town) s.winner = 'mafia';
  if (s.winner) {
    s.phase = 'over';
    s.deadline = null;
    s.paused = null;
  }
  return !!s.winner;
}

/** Kill someone and everything that follows from it: heartbroken lovers, a Hunter's last shot. */
function kill(s: State, id: string, cause: Death['cause']) {
  const p = s.players.find((x) => x.id === id);
  if (!p || !p.alive) return;
  p.alive = false;
  s.deaths.push({ id, round: s.round, cause });
  s.fallen.push(id);
  if (p.role === 'hunter' && !s.hunter) s.hunter = { id, shot: null };
  if (s.lovers?.includes(id)) {
    const other = s.lovers.find((l) => l !== id)!;
    kill(s, other, 'love');
  }
}

function startNight(s: State, now: number) {
  s.round++;
  s.phase = 'night';
  s.nightStep = 'main';
  s.mafiaVotes = {};
  s.save = null;
  s.check = null;
  s.pendingVictim = null;
  s.witchHeal = false;
  s.witchPoison = null;
  s.dawn = null;
  s.verdict = null;
  s.fallen = [];
  s.paused = null;
  s.deadline = timer(now, s.settings.nightSeconds);
}

const cupidOwes = (s: State) => s.round === 1 && !s.lovers && !!livingRole(s, 'cupid');

function nightDone(s: State) {
  const mafiaIn = livingMafia(s).every((m) => s.mafiaVotes[m.id]);
  return (
    mafiaIn &&
    (!livingRole(s, 'doctor') || s.save !== null) &&
    (!livingRole(s, 'detective') || s.check !== null) &&
    !cupidOwes(s)
  );
}

function mafiaChoice(s: State, rng: () => number) {
  const tally = new Map<string, number>();
  for (const [voter, target] of Object.entries(s.mafiaVotes)) if (isAlive(s, voter)) tally.set(target, (tally.get(target) ?? 0) + 1);
  const top = Math.max(0, ...tally.values());
  const tied = [...tally].filter(([, n]) => n === top && n > 0).map(([id]) => id);
  return tied.length ? tied[Math.floor(rng() * tied.length)]! : null;
}

/** End of the main night step: hand over to the Witch if she still has a potion, else dawn. */
function endMainNight(s: State, now: number, rng: () => number) {
  s.pendingVictim = mafiaChoice(s, rng);
  const witch = livingRole(s, 'witch');
  if (witch && (s.potions.heal || s.potions.poison)) {
    s.nightStep = 'witch';
    s.paused = null;
    s.deadline = s.settings.nightSeconds ? now + WITCH_MS : null;
  } else resolveNight(s, now);
}

function resolveNight(s: State, now: number) {
  const victim = s.pendingVictim;
  if (livingRole(s, 'detective') && s.check)
    s.checks.push({ round: s.round, target: s.check, mafia: s.players.find((p) => p.id === s.check)?.role === 'mafia' });
  s.fallen = [];
  let blocked = false;
  if (victim) {
    const p = s.players.find((x) => x.id === victim)!;
    if (victim === s.save || s.witchHeal) blocked = true;
    else if (p.role === 'elder' && !s.elderHit) {
      s.elderHit = true;
      blocked = true;
    } else kill(s, victim, 'night');
  }
  if (s.witchHeal) s.potions.heal = false;
  if (s.witchPoison) {
    s.potions.poison = false;
    kill(s, s.witchPoison, 'poison');
  }
  s.lastSave = s.save;
  s.dawn = { killed: [...s.fallen], blocked };
  s.phase = 'dawn';
  s.paused = null;
  s.deadline = announceDeadline(s, now);
  if (!hunterOwes(s)) checkWin(s);
}

function startDiscussion(s: State, now: number) {
  s.phase = 'discuss';
  s.votes = {};
  s.fallen = [];
  s.paused = null;
  s.deadline = timer(now, s.settings.discussSeconds);
}

function startVote(s: State, now: number) {
  s.phase = 'day';
  s.votes = {};
  s.paused = null;
  s.deadline = timer(now, s.settings.daySeconds);
}

export function tally(s: Pick<State, 'votes' | 'players'> & { idiotRevealed?: string | null }) {
  const counts: Record<string, number> = {};
  for (const [voter, target] of Object.entries(s.votes)) {
    if (voter === s.idiotRevealed || !s.players.some((p) => p.id === voter && p.alive)) continue;
    counts[target] = (counts[target] ?? 0) + 1;
  }
  return counts;
}

function resolveDay(s: State, now: number) {
  const counts = tally(s);
  const [top] = Object.entries(counts)
    .filter(([id]) => id !== 'skip')
    .sort((a, b) => b[1] - a[1]);
  s.fallen = [];
  let eliminated: string | null = null;
  let spared: string | null = null;
  if (top && top[1] >= needed(s)) {
    const p = s.players.find((x) => x.id === top[0])!;
    if (p.role === 'idiot' && !s.idiotRevealed) {
      s.idiotRevealed = p.id;
      spared = p.id;
    } else {
      eliminated = p.id;
      kill(s, p.id, 'vote');
    }
  }
  s.verdict = { eliminated, spared };
  s.phase = 'verdict';
  s.paused = null;
  s.deadline = announceDeadline(s, now);
  if (!hunterOwes(s)) checkWin(s);
}

/** Move past an announcement (dawn → discussion, verdict → night). */
function continueStory(s: State, now: number) {
  if (s.phase === 'dawn') startDiscussion(s, now);
  else if (s.phase === 'verdict' || s.phase === 'reveal') startNight(s, now);
  else throw new Rule('BAD_PHASE');
}

/** The narrator if there is one, otherwise the room admin, moves the story along. */
const isController = (s: State, id: string, adminId: string) => (s.narratorId ? id === s.narratorId : id === adminId);

function apply(state: State, actorId: string, raw: unknown, ctx: Ctx): State {
  assert(isRecord(raw) && typeof raw.type === 'string', 'BAD_ACTION');
  const action = raw as { type: string; target?: unknown; targets?: unknown; heal?: unknown; poison?: unknown };
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
      assert(s.phase === 'night' && s.nightStep === 'main', 'BAD_PHASE');
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
      if (nightDone(s)) endMainNight(s, ctx.now, ctx.rng);
      return s;
    }
    case 'CUPID': {
      assert(s.phase === 'night' && s.nightStep === 'main', 'BAD_PHASE');
      assert(me?.alive && me.role === 'cupid', 'NOT_YOUR_ROLE');
      assert(cupidOwes(s), 'ALREADY_DONE');
      const t = Array.isArray(action.targets) ? action.targets : [];
      assert(t.length === 2 && t[0] !== t[1] && t.every((id) => typeof id === 'string' && isAlive(s, id)), 'PICK_TWO');
      s.lovers = [t[0] as string, t[1] as string];
      if (nightDone(s)) endMainNight(s, ctx.now, ctx.rng);
      return s;
    }
    case 'WITCH': {
      assert(s.phase === 'night' && s.nightStep === 'witch', 'BAD_PHASE');
      assert(me?.alive && me.role === 'witch', 'NOT_YOUR_ROLE');
      const heal = action.heal === true;
      const poison = typeof action.poison === 'string' ? action.poison : null;
      assert(!heal || (s.potions.heal && s.pendingVictim), 'NO_POTION');
      assert(!poison || s.potions.poison, 'NO_POTION');
      assert(!poison || (isAlive(s, poison) && poison !== me!.id), 'PICK_LIVING');
      s.witchHeal = heal;
      s.witchPoison = poison;
      resolveNight(s, ctx.now);
      return s;
    }
    case 'SHOOT': {
      assert(hunterOwes(s) && s.hunter!.id === actorId, 'NOT_YOUR_ROLE');
      assert(target && isAlive(s, target), 'PICK_LIVING');
      s.hunter!.shot = target;
      kill(s, target!, 'shot');
      if (!checkWin(s)) s.deadline = announceDeadline(s, ctx.now);
      return s;
    }
    case 'VOTE': {
      assert(s.phase === 'day', s.phase === 'discuss' ? 'VOTE_LOCKED' : 'BAD_PHASE');
      assert(me?.alive, 'DEAD');
      assert(me!.id !== s.idiotRevealed, 'NO_VOTE');
      assert(target === 'skip' || (target && isAlive(s, target) && target !== me!.id), 'PICK_LIVING');
      if (s.votes[me!.id] === target) delete s.votes[me!.id];
      else s.votes[me!.id] = target!;
      if (voters(s).every((p) => s.votes[p.id])) resolveDay(s, ctx.now);
      return s;
    }
    case 'OPEN_VOTE': {
      assert(controller, 'CONTROLLER_ONLY');
      assert(s.phase === 'discuss', 'BAD_PHASE');
      startVote(s, ctx.now);
      return s;
    }
    case 'CLOSE': {
      assert(controller, 'CONTROLLER_ONLY');
      if (s.phase === 'day') resolveDay(s, ctx.now);
      else if (s.phase === 'discuss') startVote(s, ctx.now);
      else if (s.phase === 'night' && s.nightStep === 'main') endMainNight(s, ctx.now, ctx.rng);
      else if (s.phase === 'night') resolveNight(s, ctx.now);
      else throw new Rule('BAD_PHASE');
      return s;
    }
    case 'CONTINUE': {
      assert(controller, 'CONTROLLER_ONLY');
      assert(!hunterOwes(s), 'HUNTER_FIRST');
      continueStory(s, ctx.now);
      return s;
    }
    case 'PAUSE': {
      assert(controller, 'CONTROLLER_ONLY');
      assert(s.deadline !== null && !s.paused, 'NO_TIMER');
      s.paused = { left: Math.max(1000, s.deadline! - ctx.now) };
      s.deadline = null;
      return s;
    }
    case 'RESUME': {
      assert(controller, 'CONTROLLER_ONLY');
      assert(s.paused, 'NOT_PAUSED');
      s.deadline = ctx.now + s.paused!.left;
      s.paused = null;
      return s;
    }
    case 'EXTEND': {
      assert(controller, 'CONTROLLER_ONLY');
      if (s.paused) s.paused.left += EXTEND_MS;
      else if (s.deadline !== null) s.deadline += EXTEND_MS;
      else throw new Rule('NO_TIMER');
      return s;
    }
    default:
      throw new Rule('BAD_ACTION');
  }
}

function setup(settings: Settings, seats: Seat[], content: { roleArt: Record<string, AssetRef[]>; cardBack: AssetRef | null }, ctx: Ctx): State {
  const narrator = seats.find((p) => p.role === 'narrator') ?? null;
  const people = seats.filter((p) => p !== narrator);
  const n = people.length;
  const mafia = settings.mafiaCount || autoMafia(n);
  const specials = (['detective', 'doctor', 'witch', 'hunter', 'cupid', 'elder', 'idiot'] as const).filter((r) => settings[r]);
  const deck: MafiaRole[] = [...Array<MafiaRole>(mafia).fill('mafia'), ...specials];
  while (deck.length < n) deck.push('villager');
  const roles = shuffled(deck, ctx.rng);
  // Each card gets one of the group's uploaded pictures for that role, picked at random.
  const artFor = (role: MafiaRole) => {
    const list = content.roleArt[role] ?? [];
    return list.length ? list[Math.floor(ctx.rng() * list.length)]! : null;
  };
  return {
    settings,
    players: people.map((p, i) => ({ id: p.id, name: p.name, portrait: p.portrait, role: roles[i]!, alive: true, art: artFor(roles[i]!) })),
    narratorId: narrator?.id ?? null,
    phase: 'reveal',
    round: 0,
    ready: [],
    nightStep: 'main',
    mafiaVotes: {},
    save: null,
    lastSave: null,
    check: null,
    checks: [],
    pendingVictim: null,
    potions: { heal: true, poison: true },
    witchHeal: false,
    witchPoison: null,
    lovers: null,
    elderHit: false,
    idiotRevealed: null,
    hunter: null,
    fallen: [],
    dawn: null,
    votes: {},
    verdict: null,
    deaths: [],
    winner: null,
    deadline: null,
    paused: null,
    art: { back: content.cardBack },
  };
}

function view(s: State, viewer: Viewer, ctx: { now: number; adminId: string }) {
  const id = viewer.kind === 'player' ? viewer.seatId : null;
  const me = id ? s.players.find((p) => p.id === id) ?? null : null;
  const narrator = !!id && id === s.narratorId;
  const over = s.phase === 'over';
  const mafiaEyes = me?.role === 'mafia';
  const inLove = !!me && !!s.lovers?.includes(me.id);
  const seesLovers = narrator || over || inLove || me?.role === 'cupid';
  const seesRole = (p: Player) =>
    narrator || over || p.id === me?.id || (mafiaEyes && p.role === 'mafia') || (!p.alive && s.settings.revealOnDeath) || p.id === s.idiotRevealed;
  const witchEyes = me?.role === 'witch' && me.alive;

  return {
    phase: s.phase,
    round: s.round,
    deadline: s.deadline,
    paused: s.paused ? { left: s.paused.left } : null,
    winner: s.winner,
    narrator,
    narratorId: s.narratorId,
    controller: !!id && isController(s, id, ctx.adminId),
    me: me ? { id: me.id, role: me.role, alive: me.alive } : null,
    players: s.players.map((p) => {
      const known = seesRole(p);
      return {
        id: p.id,
        name: p.name,
        portrait: p.portrait,
        alive: p.alive,
        role: known ? p.role : null,
        // The art gives the role away, so it travels with the role and nowhere else.
        art: known ? p.art : null,
        ready: s.phase === 'reveal' ? s.ready.includes(p.id) : undefined,
      };
    }),
    counts: { mafia: s.players.filter((p) => p.role === 'mafia').length, total: s.players.length },
    /** Which special roles are in this game (public: the lobby settings already say so). */
    inPlay: [...new Set(s.players.map((p) => p.role))],
    night:
      s.phase === 'night'
        ? {
            step: s.nightStep,
            mafiaVotes: mafiaEyes || narrator ? { ...s.mafiaVotes } : {},
            mySave: me?.role === 'doctor' || narrator ? s.save : null,
            myCheck: me?.role === 'detective' || narrator ? s.check : null,
            lastSave: me?.role === 'doctor' ? s.lastSave : null,
            cupidOwes: (me?.role === 'cupid' || narrator) && cupidOwes(s),
            victim: s.nightStep === 'witch' && (witchEyes || narrator) ? s.pendingVictim : null,
          }
        : null,
    potions: witchEyes || narrator ? { ...s.potions } : null,
    lovers: seesLovers && s.lovers ? [...s.lovers] : null,
    hunter: s.hunter ? { ...s.hunter } : null,
    idiot: s.idiotRevealed,
    checks: me?.role === 'detective' || narrator ? s.checks.map((c) => ({ ...c })) : [],
    dawn: s.dawn ? { killed: s.phase === 'dawn' ? [...s.fallen] : [...s.dawn.killed], blocked: s.dawn.blocked } : null,
    verdict: s.verdict ? { ...s.verdict, fallen: s.phase === 'verdict' ? [...s.fallen] : [] } : null,
    votes: s.phase === 'day' || s.phase === 'verdict' ? { ...s.votes } : {},
    deaths: s.deaths.map((d) => ({ ...d })),
    needed: needed(s),
    art: s.art,
  };
}

export type View = ReturnType<typeof view>;

export const game: GameModule<State, View, Settings> = {
  meta,
  defaultSettings: {
    mafiaCount: 0,
    doctor: true,
    detective: true,
    witch: false,
    hunter: false,
    cupid: false,
    elder: false,
    idiot: false,
    revealOnDeath: true,
    nightSeconds: 0,
    discussSeconds: 120,
    daySeconds: 0,
  },
  parseSettings(input) {
    if (!isRecord(input)) return fail('SETTINGS_INVALID');
    const int = (v: unknown, min: number, max: number, def: number) => {
      const n = v === undefined ? def : Number(v);
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    };
    const mafiaCount = int(input.mafiaCount, 0, 6, 0);
    const nightSeconds = int(input.nightSeconds, 0, 600, 0);
    const discussSeconds = int(input.discussSeconds, 0, 1800, 120);
    const daySeconds = int(input.daySeconds, 0, 1800, 0);
    if (mafiaCount === null || nightSeconds === null || daySeconds === null || discussSeconds === null) return fail('SETTINGS_INVALID');
    return {
      mafiaCount,
      nightSeconds,
      discussSeconds,
      daySeconds,
      doctor: input.doctor !== false,
      detective: input.detective !== false,
      witch: input.witch === true,
      hunter: input.hunter === true,
      cupid: input.cupid === true,
      elder: input.elder === true,
      idiot: input.idiot === true,
      revealOnDeath: input.revealOnDeath !== false,
    };
  },
  seatRules(seats, settings) {
    const n = seats.filter((p) => p.role !== 'narrator').length;
    if (n < meta.players[0]) return fail('NEED_FIVE');
    if (n > meta.players[1]) return fail('TOO_MANY');
    const mafia = settings.mafiaCount || autoMafia(n);
    if (mafia * 2 >= n) return fail('TOO_MANY_MAFIA');
    const specials = (['detective', 'doctor', 'witch', 'hunter', 'cupid', 'elder', 'idiot'] as const).filter((r) => settings[r]).length;
    if (mafia + specials > n) return fail('TOO_MANY_ROLES');
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
    if (v.hunter && v.hunter.id === id && v.hunter.shot === null) {
      const t = pick(others);
      return t ? { type: 'SHOOT', target: t.id } : null;
    }
    if (!me.alive) return null;
    if (v.phase === 'night' && v.night) {
      if (v.night.step === 'witch') return me.role === 'witch' ? { type: 'WITCH', heal: rng() < 0.5 && !!v.night.victim, poison: null } : null;
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
      if (me.role === 'cupid' && v.night.cupidOwes) {
        const pair = shuffled(v.players.filter((p) => p.alive), rng).slice(0, 2);
        return pair.length === 2 ? { type: 'CUPID', targets: pair.map((p) => p.id) } : null;
      }
    }
    if (v.phase === 'day' && !v.votes[id] && v.idiot !== id) {
      const t = rng() < 0.25 ? null : pick(others);
      return { type: 'VOTE', target: t ? t.id : 'skip' };
    }
    return null;
  },
  nextDeadline: (s) => (s.phase === 'over' || hunterOwes(s) ? null : s.deadline),
  tick(state, ctx) {
    if (state.deadline === null || ctx.now < state.deadline || hunterOwes(state)) return state;
    const s = structuredClone(state);
    s.deadline = null;
    if (s.phase === 'night' && s.nightStep === 'main') endMainNight(s, ctx.now, ctx.rng);
    else if (s.phase === 'night') resolveNight(s, ctx.now);
    else if (s.phase === 'discuss') startVote(s, ctx.now);
    else if (s.phase === 'day') resolveDay(s, ctx.now);
    else if (s.phase === 'dawn' || s.phase === 'verdict') continueStory(s, ctx.now);
    return s;
  },
};
