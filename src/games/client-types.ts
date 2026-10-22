import type { ComponentType } from 'react';
import type { ClientRoom } from '../platform/room/client';
import type { Dict } from '../platform/i18n/strings';

export type GameViewProps<View> = {
  view: View;
  room: ClientRoom;
  /** Sends a game action; rejects with an Error whose message is the error code. */
  send(action: Record<string, unknown>): Promise<void>;
  /** True on the shared TV board. */
  screen: boolean;
  meId: string | null;
  isAdmin: boolean;
  /** Server-corrected clock, for countdowns. */
  now(): number;
};

export type GameClient<View = any> = {
  Player: ComponentType<GameViewProps<View>>;
  /** Shared-TV layout. Falls back to Player with screen=true. */
  Screen?: ComponentType<GameViewProps<View>>;
  /** Rule error codes → [ar, en]. */
  errors: Dict;
  /** Lobby setup codes from seatRules → [ar, en]. */
  seatErrors?: Dict;
};
