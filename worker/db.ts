// D1 access. Tables are created on first use so a fresh fork needs no migration step.
import type { AssetRef, GameContent, KalakQuestion, Puzzle } from '../src/games/types';
import defaultWords from '../src/games/passnames/words.json';
import { defaultQuestions } from '../src/games/kalak/questions';
import { defaultPuzzles } from '../src/games/picture-puzzle/puzzles';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, name TEXT NOT NULL, portrait TEXT, sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS assets (key TEXT PRIMARY KEY, widths TEXT NOT NULL, thumb TEXT NOT NULL, aspect REAL NOT NULL, bytes INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS content (id TEXT PRIMARY KEY, game TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS content_game ON content (game, kind)',
];

let ready: Promise<void> | null = null;

export function db(env: Env) {
  ready ??= env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql))).then(
    () => undefined,
    (error) => {
      ready = null;
      throw error;
    },
  );
  return ready.then(() => env.DB);
}

export async function getSetting<T>(env: Env, key: string): Promise<T | null> {
  const row = await (await db(env)).prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function setSetting(env: Env, key: string, value: unknown) {
  await (await db(env))
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .bind(key, JSON.stringify(value))
    .run();
}

export type GroupSettings = { name: string; accent: string | null; tagline: string };
export const DEFAULT_GROUP: GroupSettings = { name: 'شلّتنا', accent: null, tagline: '' };

export async function getGroup(env: Env): Promise<GroupSettings> {
  return { ...DEFAULT_GROUP, ...(await getSetting<Partial<GroupSettings>>(env, 'group')) };
}

export type RosterMember = { id: string; name: string; portrait: AssetRef | null };

export async function getRoster(env: Env): Promise<RosterMember[]> {
  const { results } = await (await db(env))
    .prepare('SELECT id, name, portrait FROM members ORDER BY sort, created_at')
    .all<{ id: string; name: string; portrait: string | null }>();
  return results.map((r) => ({ id: r.id, name: r.name, portrait: r.portrait ? (JSON.parse(r.portrait) as AssetRef) : null }));
}

export type ContentRow = { id: string; game: string; kind: string; data: unknown; created_at: number };

export async function listContent(env: Env, game?: string): Promise<ContentRow[]> {
  const d = await db(env);
  const stmt = game
    ? d.prepare('SELECT * FROM content WHERE game = ? ORDER BY created_at').bind(game)
    : d.prepare('SELECT * FROM content ORDER BY created_at');
  const { results } = await stmt.all<{ id: string; game: string; kind: string; data: string; created_at: number }>();
  return results.map((r) => ({ ...r, data: JSON.parse(r.data) }));
}

/** What a game sees at match start: the group's uploads, topped up with built-in defaults. */
export async function loadContent(env: Env, gameId: string): Promise<GameContent> {
  const rows = await listContent(env, gameId);
  const options = (await getSetting<Record<string, boolean>>(env, `defaults:${gameId}`)) ?? {};
  const useDefaults = options.include !== false;
  // Rows carry their D1 id so games can tell the group's own content from built-ins.
  const of = <T>(kind: string) => rows.filter((r) => r.kind === kind).map((r) => ({ id: r.id, ...(r.data as object) }) as T);

  const customWords = of<{ words: string[] }>('words')[0]?.words ?? [];
  const words = customWords.length >= 36 && !useDefaults ? customWords : [...customWords, ...(defaultWords as string[])];
  const questions = [...of<KalakQuestion>('question'), ...(useDefaults || !of('question').length ? defaultQuestions : [])];
  const puzzles = [...of<Puzzle>('puzzle'), ...(useDefaults || !of('puzzle').length ? defaultPuzzles : [])];
  const roleArt: Record<string, AssetRef> = {};
  for (const r of of<{ role: string; asset: AssetRef }>('roleArt')) roleArt[r.role] = r.asset;

  return {
    words,
    pictures: of<{ asset: AssetRef }>('picture').map((p) => p.asset),
    questions,
    puzzles,
    roleArt,
    cardBack: of<{ asset: AssetRef }>('cardBack').at(-1)?.asset ?? null,
  };
}
