// The contract every game folder implements. Shared by the Worker (rules) and the
// client (views live in each game's client.tsx so the Worker never imports React).

export type Localized = { ar: string; en: string };

/** Who is looking at the game: a seated player, the shared TV board, or the host's controller. */
export type Viewer = { kind: 'player'; seatId: string } | { kind: 'screen' } | { kind: 'host'; seatId: string };

export type Surface = 'phone' | 'screen' | 'host';

export type Seat = { id: string; name: string; memberId?: string };

/** Randomness and time are always passed in, so engines stay pure and testable with a seeded rng. */
export type Rng = () => number;

/** What the admin dashboard lets a group upload for this game. */
export type AssetSlot = {
  id: string;
  label: Localized;
  /** Width / height, e.g. 5 / 7 for a playing card. The crop tool locks to it. */
  aspect: number;
  /** 'per-member' slots get one image for each friend (e.g. Mafia portraits). */
  scope: 'per-member' | 'deck' | 'single';
};

export type GameMeta = {
  id: string;
  name: Localized;
  tagline: Localized;
  players: [min: number, max: number];
  /** 'screen' means a TV/laptop board is supported; 'host' means a host controller seat exists. */
  surfaces: Surface[];
  /** Games without an engine yet show as "soon" in the picker. */
  status: 'ready' | 'soon';
};

/** Engines return an error code (translated on the client) instead of throwing. */
export type GameError = { error: string };

export type GameModule<State = unknown, Action = unknown, Settings = unknown, View = unknown> = {
  meta: GameMeta;
  assetSlots: AssetSlot[];
  defaultSettings: Settings;
  parseSettings(input: unknown): Settings | GameError;
  seatRules(seats: Seat[], settings: Settings): true | GameError;
  setup(settings: Settings, seats: Seat[], rng: Rng, now: number): State;
  transition(state: State, seatId: string, action: Action, rng: Rng, now: number): State | GameError;
  /** The hidden-information filter: everything a viewer receives goes through here. */
  view(state: State, viewer: Viewer): View;
  /** Next timer the room should wake up for (Durable Object alarm), if any. */
  nextDeadline?(state: State): number | null;
};

export const isGameError = (value: unknown): value is GameError =>
  typeof value === 'object' && value !== null && 'error' in value;
