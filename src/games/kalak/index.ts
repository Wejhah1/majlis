// كَلَك: everyone writes a believable fake answer, then tries to find the truth among them.
// +2 for picking the real answer, +1 to a fake's author(s) for every friend it fooled.
import type { AssetRef, Ctx, GameModule, KalakQuestion, Seat, Viewer } from '../types';
import { fail, isRecord, shuffled } from '../types';
import { meta } from './meta';

export type Settings = { rounds: number; writeSeconds: number; voteSeconds: number };
export type Phase = 'write' | 'vote' | 'reveal' | 'final';

type Player = { id: string; name: string; portrait: AssetRef | null; score: number };
type Option = { id: string; text: string; authors: string[]; truth: boolean };

export type State = {
  settings: Settings;
  players: Player[];
  questions: KalakQuestion[];
  round: number;
  phase: Phase;
  fakes: Record<string, string>;
  options: Option[];
  votes: Record<string, string>;
  roundPoints: Record<string, number>;
  deadline: number | null;
};

/** Loose comparison so "الزهرة" = "زهره" = "  زَهرة " and Arabic digits match Latin ones. */
export function normalizeAnswer(text: string) {
  return text
    .normalize('NFKC')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.startsWith('ال') && w.length > 3 ? w.slice(2) : w))
    .join(' ')
    .replace(/^the /, '');
}

const cleanText = (v: unknown) =>
  typeof v === 'string' ? v.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';

class Rule extends Error {}
const assert = (ok: unknown, code: string): void => {
  if (!ok) throw new Rule(code);
};

const question = (s: State) => s.questions[s.round - 1]!;

function startRound(s: State, now: number) {
  s.round++;
  s.phase = 'write';
  s.fakes = {};
  s.options = [];
  s.votes = {};
  s.roundPoints = {};
  s.deadline = s.settings.writeSeconds ? now + s.settings.writeSeconds * 1000 : null;
}

function startVote(s: State, now: number, rng: () => number) {
  const truth = question(s).answer;
  const merged = new Map<string, Option>();
  for (const [author, text] of Object.entries(s.fakes)) {
    const key = normalizeAnswer(text);
    const existing = merged.get(key);
    if (existing) existing.authors.push(author);
    else merged.set(key, { id: '', text, authors: [author], truth: false });
  }
  const all = shuffled([...merged.values(), { id: '', text: truth, authors: [], truth: true }], rng);
  s.options = all.map((o, i) => ({ ...o, id: `o${i}` }));
  s.phase = 'vote';
  s.deadline = s.settings.voteSeconds ? now + s.settings.voteSeconds * 1000 : null;
}

function reveal(s: State) {
  const points: Record<string, number> = {};
  for (const [voter, optionId] of Object.entries(s.votes)) {
    const o = s.options.find((x) => x.id === optionId);
    if (!o) continue;
    if (o.truth) points[voter] = (points[voter] ?? 0) + 2;
    else for (const a of o.authors) if (a !== voter) points[a] = (points[a] ?? 0) + 1;
  }
  for (const p of s.players) p.score += points[p.id] ?? 0;
  s.roundPoints = points;
  s.phase = 'reveal';
  s.deadline = null;
}

const everyone = (s: State, map: Record<string, unknown>) => s.players.every((p) => map[p.id] !== undefined);

/** Players who can vote this round: anyone with at least one option that isn't theirs (always true). */
function apply(state: State, actorId: string, raw: unknown, ctx: Ctx): State {
  assert(isRecord(raw) && typeof raw.type === 'string', 'BAD_ACTION');
  const action = raw as { type: string; text?: unknown; option?: unknown };
  const s = structuredClone(state);
  const me = s.players.find((p) => p.id === actorId);
  assert(me || actorId === ctx.adminId, 'NOT_IN_MATCH');

  switch (action.type) {
    case 'FAKE': {
      assert(s.phase === 'write' && me, 'BAD_PHASE');
      const text = cleanText(action.text);
      assert(text.length >= 1 && text.length <= 60, 'FAKE_LENGTH');
      assert(normalizeAnswer(text) !== normalizeAnswer(question(s).answer), 'IS_TRUTH');
      s.fakes[me!.id] = text;
      if (everyone(s, s.fakes)) startVote(s, ctx.now, ctx.rng);
      return s;
    }
    case 'VOTE': {
      assert(s.phase === 'vote' && me, 'BAD_PHASE');
      const o = s.options.find((x) => x.id === action.option);
      assert(o, 'BAD_OPTION');
      assert(!o!.authors.includes(me!.id), 'OWN_FAKE');
      s.votes[me!.id] = o!.id;
      if (everyone(s, s.votes)) reveal(s);
      return s;
    }
    case 'SKIP': {
      // The admin can hurry a slow round along.
      assert(actorId === ctx.adminId, 'ADMIN_ONLY');
      if (s.phase === 'write') {
        assert(Object.keys(s.fakes).length > 0, 'NO_FAKES_YET');
        startVote(s, ctx.now, ctx.rng);
      } else if (s.phase === 'vote') reveal(s);
      else throw new Rule('BAD_PHASE');
      return s;
    }
    case 'NEXT': {
      assert(actorId === ctx.adminId, 'ADMIN_ONLY');
      assert(s.phase === 'reveal', 'BAD_PHASE');
      if (s.round >= s.questions.length) {
        s.phase = 'final';
        s.deadline = null;
      } else startRound(s, ctx.now);
      return s;
    }
    default:
      throw new Rule('BAD_ACTION');
  }
}

function setup(settings: Settings, seats: Seat[], content: { questions: KalakQuestion[] }, ctx: Ctx): State {
  const pool = shuffled(content.questions, ctx.rng);
  // Group-made questions first: they're why people play.
  const custom = pool.filter((q) => !q.id.startsWith('builtin-'));
  const builtIn = pool.filter((q) => q.id.startsWith('builtin-'));
  const questions = [...custom, ...builtIn].slice(0, settings.rounds);
  const s: State = {
    settings,
    players: seats.map((p) => ({ id: p.id, name: p.name, portrait: p.portrait, score: 0 })),
    questions: shuffled(questions, ctx.rng),
    round: 0,
    phase: 'write',
    fakes: {},
    options: [],
    votes: {},
    roundPoints: {},
    deadline: null,
  };
  startRound(s, ctx.now);
  return s;
}

function view(s: State, viewer: Viewer) {
  const id = viewer.kind === 'player' ? viewer.seatId : null;
  const q = question(s);
  const revealed = s.phase === 'reveal' || s.phase === 'final';
  return {
    phase: s.phase,
    round: s.round,
    rounds: s.questions.length,
    deadline: s.deadline,
    question: { prompt: q.prompt, category: q.category, image: q.image ?? null, answer: revealed ? q.answer : null },
    me: id && s.players.some((p) => p.id === id) ? id : null,
    myFake: id ? s.fakes[id] ?? null : null,
    myVote: id ? s.votes[id] ?? null : null,
    written: Object.keys(s.fakes),
    voted: Object.keys(s.votes),
    // Before the reveal nobody learns who wrote what, or which one is true.
    options: s.options.map((o) =>
      revealed
        ? { id: o.id, text: o.text, truth: o.truth, authors: o.authors, voters: Object.keys(s.votes).filter((v) => s.votes[v] === o.id), mine: !!id && o.authors.includes(id) }
        : { id: o.id, text: o.text, truth: false, authors: [] as string[], voters: [] as string[], mine: !!id && o.authors.includes(id) },
    ),
    roundPoints: revealed ? { ...s.roundPoints } : {},
    players: s.players.map((p) => ({ id: p.id, name: p.name, portrait: p.portrait, score: p.score })),
  };
}

export type View = ReturnType<typeof view>;

export const game: GameModule<State, View, Settings> = {
  meta,
  defaultSettings: { rounds: 7, writeSeconds: 75, voteSeconds: 40 },
  parseSettings(input) {
    if (!isRecord(input)) return fail('SETTINGS_INVALID');
    const int = (v: unknown, min: number, max: number, def: number) => {
      const n = v === undefined ? def : Number(v);
      return Number.isInteger(n) && (n === 0 || (n >= min && n <= max)) ? n : null;
    };
    const rounds = int(input.rounds, 1, 30, 7);
    const writeSeconds = int(input.writeSeconds, 15, 300, 75);
    const voteSeconds = int(input.voteSeconds, 10, 180, 40);
    if (!rounds || writeSeconds === null || voteSeconds === null) return fail('SETTINGS_INVALID');
    return { rounds, writeSeconds, voteSeconds };
  },
  seatRules(seats) {
    if (seats.length < meta.players[0]) return fail('NEED_THREE');
    if (seats.length > meta.players[1]) return fail('TOO_MANY');
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
  view: (s, viewer) => view(s, viewer),
  nextDeadline: (s) => (s.phase === 'write' || s.phase === 'vote' ? s.deadline : null),
  tick(state, ctx) {
    if (state.deadline === null || ctx.now < state.deadline) return state;
    const s = structuredClone(state);
    if (s.phase === 'write') startVote(s, ctx.now, ctx.rng);
    else if (s.phase === 'vote') reveal(s);
    return s;
  },
};
