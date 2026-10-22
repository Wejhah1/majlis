// Passnames rules, ported from spacexmzez-bit/passnames engine.js (see RULES there).
// Changes from the original: TypeScript, the log stores event codes instead of Arabic text,
// an optional photo board, and errors are returned as codes instead of thrown.
import type { AssetRef, Ctx, GameError, GameModule, Seat, Viewer } from '../types';
import { fail, isRecord, shuffled } from '../types';
import { meta } from './meta';

export type Team = 'blue' | 'red';
export type Color = Team | 'neutral' | 'black' | 'yellow';
export type CardType = 'second' | 'scan' | 'swap' | 'luck';
export type Phase = 'deal' | 'clue' | 'guess' | 'second' | 'finished';

export type Settings = {
  mode: 'standard' | 'expanded';
  timerSeconds: number;
  manualDraw: boolean;
  board: 'words' | 'photos';
};

export type LogEntry = {
  id: number;
  turn: number;
  team: Team;
  code: string;
  params?: Record<string, string | number>;
  visibility: 'all' | Team;
};

type Player = { id: string; name: string; team: Team; role: 'spy' | 'agent' };
type Cell = { id: number; word: string | null; picture: AssetRef | null; color: Color; revealed: boolean; yellowOwner: Team | null };
type HandCard = { id: number; type: Exclude<CardType, 'luck'>; usableTurn: number };
type TeamState = {
  target: number;
  turns: number;
  streak: number;
  yellow: number;
  hand: HandCard[];
  pendingDraw: { usableTurn: number } | null;
  initialDrawn: boolean;
  scans: { cell: number; black: boolean; turn: number }[];
};
export type Clue = { text: string; count: number | 'unlimited' };

export type State = {
  settings: Settings;
  players: Player[];
  board: Cell[];
  size: 5 | 6;
  teams: Record<Team, TeamState>;
  deck: CardType[];
  discard: CardType[];
  nextId: number;
  log: LogEntry[];
  clues: (Clue & { team: Team; turn: number })[];
  active: Team;
  firstTeam: Team;
  phase: Phase;
  turnNumber: number;
  clue: Clue | null;
  guesses: number;
  good: number;
  broken: boolean;
  actionUsed: boolean;
  deadline: number | null;
  remainingMs: number | null;
  marks: Record<string, string[]>;
  winner: Team | null;
  pause: { remaining: number | null } | null;
};

export const TEAMS: Team[] = ['blue', 'red'];
const other = (team: Team): Team => (team === 'blue' ? 'red' : 'blue');

export function normalizeWord(value: string) {
  return value
    .normalize('NFKC')
    .replace(/_/g, ' ')
    .replace(/[ً-ٰٟـ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

/** Thrown internally and turned into a GameError at the module boundary. */
class Rule extends Error {}
const assert = (ok: unknown, code: string): void => {
  if (!ok) throw new Rule(code);
};

function log(s: State, code: string, params?: LogEntry['params'], visibility: LogEntry['visibility'] = 'all') {
  s.log.push({ id: s.nextId++, turn: s.turnNumber, team: s.active, code, ...(params ? { params } : {}), visibility });
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
}

function eligible(s: State, team: Team, type: HandCard['type']) {
  return s.teams[team].hand.find((c) => c.type === type && c.usableTurn <= s.teams[team].turns);
}

function draw(s: State, team: Team, usableTurn: number, rng: () => number) {
  if (!s.deck.length) {
    s.deck = shuffled(s.discard, rng);
    s.discard = [];
  }
  const type = s.deck.pop();
  if (!type) return log(s, 'drawEmpty', undefined, team);
  if (type === 'luck') {
    s.discard.push(type);
    log(s, 'drawLuck', undefined, team);
  } else {
    s.teams[team].hand.push({ id: s.nextId++, type, usableTurn });
    log(s, 'draw', { card: type }, team);
  }
}

function grant(s: State, team: Team, usableTurn: number, rng: () => number) {
  if (s.settings.manualDraw) {
    s.teams[team].pendingDraw = { usableTurn };
    log(s, 'drawEarned', undefined, team);
  } else draw(s, team, usableTurn, rng);
}

function beginTurn(s: State, team: Team) {
  const t = s.teams[team];
  s.active = team;
  if (t.pendingDraw) {
    t.pendingDraw = null;
    log(s, 'drawExpired', undefined, team);
  }
  t.turns++;
  s.turnNumber++;
  s.phase = 'clue';
  s.clue = null;
  s.guesses = 0;
  s.good = 0;
  s.broken = false;
  s.actionUsed = false;
  s.deadline = null;
  s.remainingMs = null;
  s.marks = {};
  log(s, 'turn', { team });
}

function finishTurn(s: State, reason: string, rng: () => number) {
  const team = s.active;
  const t = s.teams[team];
  const qualifies = s.clue && typeof s.clue.count === 'number' && s.clue.count > 0 && s.good >= s.clue.count && !s.broken;
  if (s.settings.mode === 'expanded') {
    if (qualifies) {
      t.streak++;
      if (t.streak === 2) {
        t.streak = 0;
        grant(s, team, t.turns + 1, rng);
      }
    } else t.streak = 0;
  }
  log(s, reason);
  beginTurn(s, other(team));
}

function win(s: State, team: Team, reason: string) {
  s.phase = 'finished';
  s.winner = team;
  s.deadline = null;
  s.pause = null;
  s.marks = {};
  s.teams.blue.pendingDraw = null;
  s.teams.red.pendingDraw = null;
  log(s, reason, { team });
}

export function score(s: State, team: Team) {
  return s.board.filter((c) => c.revealed && c.color === team).length + s.teams[team].yellow;
}

function checkWin(s: State) {
  for (const team of TEAMS) {
    if (score(s, team) >= s.teams[team].target) {
      win(s, team, 'winTarget');
      return true;
    }
  }
  return false;
}

function consume(s: State, type: HandCard['type']) {
  const t = s.teams[s.active];
  const card = eligible(s, s.active, type);
  assert(card, 'CARD_UNAVAILABLE');
  assert(t.turns > 1, 'NO_ACTION_FIRST_TURN');
  assert(!s.actionUsed, 'ONE_ACTION_PER_TURN');
  t.hand = t.hand.filter((c) => c.id !== card!.id);
  s.discard.push(type);
  s.actionUsed = true;
  log(s, 'useCard', { card: type }, s.active);
}

function setup(settings: Settings, seats: Seat[], content: { words: string[]; pictures: AssetRef[] }, ctx: Ctx): State {
  const { rng, now } = ctx;
  const players: Player[] = seats.map((p) => ({ id: p.id, name: p.name, team: p.team as Team, role: p.role as Player['role'] }));
  const expanded = settings.mode === 'expanded';
  const start: Team = expanded ? 'blue' : rng() < 0.5 ? 'blue' : 'red';
  const colors: Color[] = expanded
    ? [...Array<Color>(11).fill('blue'), ...Array<Color>(10).fill('red'), ...Array<Color>(11).fill('neutral'), 'yellow', 'yellow', 'black', 'black']
    : [...Array<Color>(9).fill(start), ...Array<Color>(8).fill(other(start)), ...Array<Color>(7).fill('neutral'), 'black'];
  const layout = shuffled(colors, rng);
  const words = [...new Map(content.words.map((w) => [normalizeWord(w), w.trim()])).values()];
  const pictures = settings.board === 'photos' ? shuffled(content.pictures, rng).slice(0, layout.length) : [];
  const picked = shuffled(words, rng).slice(0, layout.length - pictures.length);
  const faces = shuffled<{ word: string | null; picture: AssetRef | null }>(
    [...pictures.map((picture) => ({ word: null, picture })), ...picked.map((word) => ({ word, picture: null }))],
    rng,
  );
  const teamState = (team: Team): TeamState => ({
    target: expanded ? (team === 'blue' ? 11 : 10) : team === start ? 9 : 8,
    turns: 0,
    streak: 0,
    yellow: 0,
    hand: [],
    pendingDraw: null,
    initialDrawn: false,
    scans: [],
  });
  const s: State = {
    settings: { ...settings, manualDraw: expanded && settings.manualDraw },
    players,
    board: layout.map((color, i) => ({ id: i, ...faces[i]!, color, revealed: false, yellowOwner: null })),
    size: expanded ? 6 : 5,
    teams: { blue: teamState('blue'), red: teamState('red') },
    deck: expanded ? shuffled<CardType>(['second', 'second', 'scan', 'scan', 'swap', 'swap', 'luck', 'luck', 'luck', 'luck'], rng) : [],
    discard: [],
    nextId: 1,
    log: [],
    clues: [],
    active: start,
    firstTeam: start,
    phase: 'deal',
    turnNumber: 0,
    clue: null,
    guesses: 0,
    good: 0,
    broken: false,
    actionUsed: false,
    deadline: null,
    remainingMs: null,
    marks: {},
    winner: null,
    pause: null,
  };
  log(s, expanded ? 'startExpanded' : 'start', { team: start });
  if (settings.board === 'photos' && pictures.length < layout.length) log(s, 'photosShort', { have: pictures.length });
  if (expanded) {
    for (const team of TEAMS) {
      if (s.settings.manualDraw) s.teams[team].pendingDraw = { usableTurn: 2 };
      else {
        draw(s, team, 2, rng);
        s.teams[team].initialDrawn = true;
      }
    }
  } else beginTurn(s, start);
  return s;
}

function expire(s: State, now: number, rng: () => number) {
  if (s.pause || s.deadline === null || now < s.deadline) return;
  s.broken = true;
  finishTurn(s, s.phase === 'second' ? 'secondTimeout' : 'timeout', rng);
}

const validClue = (text: string) =>
  text.length > 0 &&
  text.length <= 40 &&
  text.split(' ').length <= 2 &&
  /^[\p{L}\p{M} ]+$/u.test(text) &&
  !/[\p{Dash_Punctuation}_ـ]/u.test(text);

function apply(state: State, actorId: string, raw: unknown, ctx: Ctx): State {
  const { now, rng, adminId } = ctx;
  assert(isRecord(raw) && typeof raw.type === 'string', 'BAD_ACTION');
  const action = raw as Record<string, unknown> & { type: string };
  const s = structuredClone(state);
  const wasPhase = s.phase;
  const wasTurn = s.turnNumber;
  expire(s, now, rng);
  // A stale click cannot act in the next turn after an expired deadline.
  if (s.turnNumber !== wasTurn || (s.phase !== wasPhase && wasPhase === 'second')) return s;
  const actor = s.players.find((p) => p.id === actorId);
  assert(actor, 'NOT_IN_MATCH');
  const me = actor!;

  if (action.type === 'PAUSE') {
    assert(me.id === adminId && !['deal', 'finished'].includes(s.phase), 'ADMIN_ONLY');
    if (s.pause) {
      s.deadline = s.pause.remaining === null ? null : now + s.pause.remaining;
      s.pause = null;
      log(s, 'resumed');
    } else {
      s.pause = { remaining: s.deadline === null ? null : Math.max(0, s.deadline - now) };
      s.deadline = null;
      log(s, 'paused');
    }
    return s;
  }
  assert(!s.pause, 'PAUSED');
  assert(s.phase !== 'finished', 'FINISHED');

  if (action.type === 'DRAW') {
    assert(s.settings.manualDraw && me.role === 'spy', 'SPY_DRAW_ONLY');
    const t = s.teams[me.team];
    assert(t.pendingDraw, 'NO_DRAW');
    assert(s.phase === 'deal' || me.team !== s.active, 'DRAW_WINDOW_CLOSED');
    draw(s, me.team, t.pendingDraw!.usableTurn, rng);
    t.pendingDraw = null;
    if (s.phase === 'deal') t.initialDrawn = true;
    return s;
  }
  if (action.type === 'BEGIN') {
    assert(me.id === adminId && s.phase === 'deal', 'ADMIN_ONLY');
    assert(TEAMS.every((team) => s.teams[team].initialDrawn), 'DRAW_FIRST');
    beginTurn(s, s.firstTeam);
    return s;
  }
  assert(s.phase !== 'deal', 'BEGIN_FIRST');

  const cellArg = Number(action.cell);
  if (action.type === 'MARK') {
    assert(me.role === 'agent', 'AGENTS_ONLY');
    assert(s.board.some((c) => c.id === cellArg && !c.revealed), 'PICK_HIDDEN');
    const key = String(cellArg);
    const marks = s.marks[key] ?? [];
    s.marks[key] = marks.includes(me.id) ? marks.filter((id) => id !== me.id) : [...marks, me.id];
    return s;
  }
  assert(me.team === s.active, 'NOT_YOUR_TURN');

  if (action.type === 'CLUE') {
    assert(me.role === 'spy' && s.phase === 'clue', 'SPY_CLUE_ONLY');
    const text = String(action.text ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    assert(validClue(text), 'CLUE_INVALID');
    const normalized = normalizeWord(text);
    assert(!s.board.some((c) => !c.revealed && c.word && normalizeWord(c.word) === normalized), 'CLUE_ON_BOARD');
    const count = action.count;
    const max = s.teams[s.active].target;
    assert(
      count === 'unlimited' || (Number.isInteger(count) && (count as number) >= (s.settings.mode === 'expanded' ? 0 : 1) && (count as number) <= max),
      'CLUE_COUNT_INVALID',
    );
    s.clue = { text, count: count as Clue['count'] };
    s.phase = 'guess';
    s.deadline = s.settings.timerSeconds ? now + s.settings.timerSeconds * 1000 : null;
    s.clues.push({ team: s.active, turn: s.turnNumber, text, count: s.clue.count });
    log(s, 'clue', { text, count: String(s.clue.count) });
    if (s.settings.mode === 'expanded' && (count === 0 || count === 'unlimited')) {
      s.teams[s.active].streak = 0;
      log(s, 'streakBreak');
    }
    return s;
  }
  assert(me.role === 'agent', 'AGENTS_ONLY');

  if (action.type === 'SCAN') {
    assert(['clue', 'guess'].includes(s.phase) && s.guesses === 0, 'SCAN_BEFORE_GUESS');
    const c = s.board.find((c) => c.id === cellArg && !c.revealed);
    assert(c, 'PICK_HIDDEN');
    consume(s, 'scan');
    s.teams[s.active].scans.push({ cell: c!.id, black: c!.color === 'black', turn: s.turnNumber });
    log(s, 'scan', { cell: c!.id, black: c!.color === 'black' ? 1 : 0 }, s.active);
    return s;
  }
  if (action.type === 'SWAP') {
    assert(s.phase === 'clue', 'SWAP_BEFORE_CLUE');
    const ids = action.cells;
    assert(Array.isArray(ids) && ids.length === 2 && ids[0] !== ids[1], 'PICK_TWO');
    const cells = (ids as unknown[]).map((id) => s.board.find((c) => c.id === Number(id) && !c.revealed));
    assert(cells.every(Boolean), 'PICK_TWO');
    consume(s, 'swap');
    const [a, b] = cells as Cell[];
    [a!.word, b!.word] = [b!.word, a!.word];
    [a!.picture, b!.picture] = [b!.picture, a!.picture];
    s.marks = {};
    log(s, 'swap', { a: a!.id, b: b!.id });
    return s;
  }
  if (action.type === 'SECOND' || action.type === 'DECLINE') {
    assert(s.phase === 'second', 'NO_SECOND_DECISION');
    if (action.type === 'DECLINE') {
      finishTurn(s, 'secondDeclined', rng);
      return s;
    }
    consume(s, 'second');
    s.phase = 'guess';
    s.deadline = s.settings.timerSeconds && s.remainingMs !== null ? now + s.remainingMs : null;
    s.remainingMs = null;
    log(s, 'secondUsed');
    return s;
  }
  assert(s.phase === 'guess', 'WAIT_FOR_CLUE');
  if (action.type === 'END') {
    assert(s.guesses >= 1, 'GUESS_ONCE_FIRST');
    finishTurn(s, 'endTurn', rng);
    return s;
  }
  assert(action.type === 'GUESS', 'BAD_ACTION');
  const cell = s.board.find((c) => c.id === cellArg && !c.revealed);
  assert(cell, 'PICK_HIDDEN');
  // A teammate has to flag a card before anyone can reveal it.
  assert(
    (s.marks[String(cellArg)] ?? []).some((id) => s.players.some((p) => p.id === id && p.role === 'agent' && p.team === me.team)),
    'SUSPECT_FIRST',
  );
  const clue = s.clue!;
  assert(clue.count === 'unlimited' || s.guesses < clue.count + 1, 'NO_GUESSES_LEFT');
  const c = cell!;
  c.revealed = true;
  s.guesses++;
  delete s.marks[String(c.id)];
  log(s, 'guess', { name: me.name, cell: c.id, color: c.color });
  if (c.color === 'black') {
    win(s, other(s.active), 'winBlack');
    return s;
  }
  if (c.color === 'yellow') {
    c.yellowOwner = s.active;
    s.teams[s.active].yellow++;
    s.good++;
  } else if (c.color === s.active) s.good++;
  if (checkWin(s)) return s;
  if (c.color === other(s.active)) {
    s.broken = true;
    finishTurn(s, 'opponentWord', rng);
    return s;
  }
  const remaining = clue.count === 'unlimited' ? Infinity : clue.count + 1 - s.guesses;
  if (c.color === 'neutral') {
    s.broken = true;
    const t = s.teams[s.active];
    t.streak = 0;
    if (remaining > 0 && t.turns > 1 && !s.actionUsed && eligible(s, s.active, 'second')) {
      s.phase = 'second';
      s.remainingMs = s.deadline === null ? null : Math.max(0, s.deadline - now);
      s.deadline = s.settings.timerSeconds ? now + 10_000 : null;
      log(s, 'secondPrompt');
    } else finishTurn(s, 'neutralWord', rng);
    return s;
  }
  if (remaining <= 0) finishTurn(s, 'guessesUsed', rng);
  return s;
}

export type CellView = {
  id: number;
  word: string | null;
  picture: AssetRef | null;
  revealed: boolean;
  yellowOwner: Team | null;
  color: Color | null;
  marks: { id: string; name: string }[];
};

export type View = ReturnType<typeof view>;

// Deliberately construct a role-specific projection; never return raw state.
function view(s: State, viewer: Viewer, ctx: { now: number; adminId: string }) {
  const me = viewer.kind === 'player' ? s.players.find((p) => p.id === viewer.seatId) ?? null : null;
  const agent = me?.role === 'agent';
  const spy = me?.role === 'spy';
  const teamInfo = (team: Team) => ({
    target: s.teams[team].target,
    score: score(s, team),
    yellow: s.teams[team].yellow,
    streak: s.teams[team].streak,
    turns: s.teams[team].turns,
    initialDrawn: s.teams[team].initialDrawn,
    handSize: s.teams[team].hand.length,
  });
  return {
    me: me ? { ...me } : null,
    isAdmin: me?.id === ctx.adminId,
    settings: { ...s.settings },
    players: s.players.map((p) => ({ ...p })),
    active: s.active,
    phase: s.phase,
    size: s.size,
    turnNumber: s.turnNumber,
    clue: s.clue ? { ...s.clue } : null,
    guesses: s.guesses,
    good: s.good,
    actionUsed: s.actionUsed,
    deadline: s.deadline,
    paused: !!s.pause,
    winner: s.winner,
    teams: { blue: teamInfo('blue'), red: teamInfo('red') },
    board: s.board.map<CellView>((c) => ({
      id: c.id,
      word: c.word,
      picture: c.picture,
      revealed: c.revealed,
      yellowOwner: c.yellowOwner,
      color: (spy && s.phase !== 'deal') || c.revealed || s.phase === 'finished' ? c.color : null,
      marks: (s.marks[String(c.id)] ?? []).flatMap((id) => {
        const p = s.players.find((p2) => p2.id === id && p2.role === 'agent');
        return p ? [{ id, name: p.name }] : [];
      }),
    })),
    hand: agent
      ? s.teams[me!.team].hand.map((c) => ({
          ...c,
          available:
            c.usableTurn <= s.teams[me!.team].turns &&
            s.teams[me!.team].turns > 1 &&
            !s.actionUsed &&
            s.active === me!.team &&
            !s.pause &&
            !['deal', 'finished'].includes(s.phase),
        }))
      : [],
    canDraw: spy && s.settings.manualDraw && !!s.teams[me!.team].pendingDraw && (s.phase === 'deal' || me!.team !== s.active) && !s.pause,
    scans: agent ? s.teams[me!.team].scans.map((x) => ({ ...x })) : [],
    clues: s.clues.map((c) => ({ ...c })),
    log: s.log
      .filter((e) => e.visibility === 'all' || (agent && e.visibility === me!.team))
      .slice(-60)
      .map(({ visibility: _v, ...entry }) => entry),
  };
}

const toError = (e: unknown): GameError => {
  if (e instanceof Rule) return fail(e.message);
  throw e;
};

export const game: GameModule<State, View, Settings> = {
  meta,
  defaultSettings: { mode: 'standard', timerSeconds: 0, manualDraw: false, board: 'words' },
  parseSettings(input) {
    if (!isRecord(input)) return fail('SETTINGS_INVALID');
    const mode = input.mode ?? 'standard';
    const board = input.board ?? 'words';
    const timerSeconds = Number(input.timerSeconds ?? 0);
    if (mode !== 'standard' && mode !== 'expanded') return fail('SETTINGS_INVALID');
    if (board !== 'words' && board !== 'photos') return fail('SETTINGS_INVALID');
    if (!Number.isInteger(timerSeconds) || (timerSeconds !== 0 && (timerSeconds < 10 || timerSeconds > 600))) return fail('TIMER_INVALID');
    return { mode, board, timerSeconds, manualDraw: mode === 'expanded' && input.manualDraw === true };
  },
  seatRules(seats) {
    if (seats.length < 4) return fail('NEED_FOUR');
    if (seats.length > 10) return fail('TOO_MANY');
    for (const team of TEAMS) {
      if (seats.filter((p) => p.team === team && p.role === 'spy').length !== 1) return fail(`SPY_REQUIRED_${team.toUpperCase()}`);
      if (!seats.some((p) => p.team === team && p.role === 'agent')) return fail(`AGENT_REQUIRED_${team.toUpperCase()}`);
    }
    return true;
  },
  setup: (settings, seats, content, ctx) => setup(settings, seats, content, ctx),
  transition(state, seatId, action, ctx) {
    try {
      return apply(state, seatId, action, ctx);
    } catch (e) {
      return toError(e);
    }
  },
  view,
  nextDeadline: (s) => (s.pause || s.phase === 'finished' ? null : s.deadline),
  tick(state, ctx) {
    if (state.pause || state.deadline === null || ctx.now < state.deadline) return state;
    const s = structuredClone(state);
    expire(s, ctx.now, ctx.rng);
    return s;
  },
  raceSafe: (action) => isRecord(action) && action.type === 'MARK',
};
