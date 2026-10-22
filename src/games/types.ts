// The contract every game folder implements. index.ts (rules) runs in the Worker; client.tsx
// (views) runs in the browser. meta.ts is shared by both and holds nothing but data.

export type Localized = { ar: string; en: string };

export type Surface = 'phone' | 'screen' | 'host';

/** A seated member as a game sees it. Team and role come from the lobby. */
export type Seat = {
  id: string;
  name: string;
  team: string | null;
  role: string | null;
  portrait: AssetRef | null;
};

/** Who is looking: a seated player, or the shared TV board (public information only). */
export type Viewer = { kind: 'player'; seatId: string } | { kind: 'screen' };

export type Rng = () => number;

/** Randomness and time are always passed in, so engines stay pure and testable with a seeded rng. */
export type Ctx = { rng: Rng; now: number; adminId: string };

/** An uploaded, pre-optimised image. Served at /media/{key}-{width}.webp. */
export type AssetRef = { key: string; widths: number[]; thumb: string; aspect: number };

export type KalakQuestion = { id: string; prompt: string; answer: string; category: string; image?: AssetRef | null };
export type PuzzleTile = { kind: 'image'; asset: AssetRef } | { kind: 'text'; text: string };
export type Puzzle = { id: string; tiles: PuzzleTile[]; answer: string; hint?: string };

/** Everything a group can customise from /admin. Each game reads what it needs. */
export type GameContent = {
  words: string[];
  pictures: AssetRef[];
  /** Friends' photos shown on the agent cards that cover revealed words (words mode). */
  agentPhotos: AssetRef[];
  questions: KalakQuestion[];
  puzzles: Puzzle[];
  /** Several pictures per role; each dealt card picks one at random. */
  roleArt: Record<string, AssetRef[]>;
  cardBack: AssetRef | null;
};

export type LobbyTeam = { id: string; name: Localized; color: string };
export type LobbyRole = {
  id: string;
  name: Localized;
  hint?: Localized;
  /** At most this many per team (or in the room for teamless roles). */
  max?: number;
  /** Roles like host or narrator sit outside the teams. */
  teamless?: boolean;
};

export type LobbyConfig = {
  teams?: LobbyTeam[];
  roles?: LobbyRole[];
  /** Role given to people when they arrive. */
  defaultRole?: string;
};

export type GameMeta = {
  id: string;
  name: Localized;
  tagline: Localized;
  players: [min: number, max: number];
  surfaces: Surface[];
  status: 'ready' | 'soon';
  lobby: LobbyConfig;
  /** Accent used for this game's chrome (CSS colour). */
  accent: string;
  /** Rendered automatically in the lobby. */
  settingFields: SettingField[];
};

/** Engines return an error code (translated on the client) instead of throwing. */
export type GameError = { error: string };

export type SettingField =
  | { id: string; kind: 'choice'; label: Localized; options: { value: string; label: Localized }[] }
  | { id: string; kind: 'number'; label: Localized; min: number; max: number; step?: number; unit?: Localized }
  | { id: string; kind: 'toggle'; label: Localized };

export type GameModule<State = any, View = unknown, Settings extends Record<string, unknown> = Record<string, any>> = {
  meta: GameMeta;
  defaultSettings: Settings;
  parseSettings(input: unknown): Settings | GameError;
  /** Lobby readiness: who must be seated where before the admin can start. */
  seatRules(seats: Seat[], settings: Settings): true | GameError;
  setup(settings: Settings, seats: Seat[], content: GameContent, ctx: Ctx): State;
  /** Validates the raw action from the browser; never trust its shape. */
  transition(state: State, seatId: string, action: unknown, ctx: Ctx): State | GameError;
  /** The hidden-information filter: everything a viewer receives goes through here. */
  view(state: State, viewer: Viewer, ctx: Omit<Ctx, 'rng'>): View;
  /** Next moment the room must wake up for a timer, if any. */
  nextDeadline?(state: State): number | null;
  tick?(state: State, ctx: Ctx): State;
  /**
   * Test bots: given the bot's own view (so it can't cheat), the next action to take, or null.
   * Called again after every change; keep it to one step at a time.
   */
  bot?(view: View, seatId: string, rng: Rng): Record<string, unknown> | null;
  /** How long a bot "thinks" before acting, in ms (default 900–2400). */
  botDelay?(view: View, rng: Rng): number;
  /** Actions that may race harmlessly (e.g. marks) skip the stale-version check. */
  raceSafe?(action: unknown): boolean;
};

export const isGameError = (value: unknown): value is GameError =>
  typeof value === 'object' && value !== null && 'error' in value && typeof (value as GameError).error === 'string';

export const fail = (error: string): GameError => ({ error });

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
