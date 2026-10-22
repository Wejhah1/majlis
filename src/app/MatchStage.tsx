import { useCallback, useState } from 'react';
import { gameById } from '../games/registry';
import { useI18n } from '../platform/i18n/I18n';
import { formatCode, type ClientRoom } from '../platform/room/client';
import { Sheet } from '../platform/ui/Sheet';
import { useAct, useGameClient } from './Lobby';
import { Link } from './router';

type Send = (action: Record<string, unknown>) => Promise<void>;

/** Hosts whichever game is running. Games own everything below the slim bar. */
export function MatchStage({ room, send, screen = false }: { room: ClientRoom; send: Send; screen?: boolean }) {
  const { t, pick } = useI18n();
  const game = gameById(room.gameId)!;
  const client = useGameClient(room.gameId);
  const act = useAct(send, client?.errors);
  const [ending, setEnding] = useState(false);
  const isAdmin = !!room.me && room.me.id === room.adminId;
  const seated = !!room.me?.seated;
  const now = useCallback(() => Date.now() + room.clockOffset, [room.clockOffset]);
  const match = room.match!;

  const sendGame = useCallback(
    (action: Record<string, unknown>) => act({ type: 'GAME', matchId: match.id, version: match.version, action }),
    [act, match.id, match.version],
  );

  const View = client ? ((screen || !seated) && client.Screen ? client.Screen : client.Player) : null;

  return (
    <div className={`stage stage--${game.id}${screen ? ' stage--screen' : ''}`}>
      <header className="stage__bar">
        <Link href="/" className="stage__home" aria-label={t('room.home')}>
          {t('app.name')}
        </Link>
        <span className="stage__game">{pick(game.name)}</span>
        <span className="stage__code ltr-run">{formatCode(room.code)}</span>
        {isAdmin && !screen && (
          <button type="button" className="pill-button stage__end" onClick={() => setEnding(true)}>
            {t('match.end')}
          </button>
        )}
      </header>
      {!screen && !seated && <p className="notice notice--inline">{t('match.spectating')}</p>}
      <div className="stage__body">
        {View ? (
          <View view={match.view} room={room} send={sendGame} screen={screen || !seated} meId={room.me?.id ?? null} isAdmin={isAdmin} now={now} />
        ) : (
          <p className="muted spinner-dots stage__loading">{t('common.loading').replace(/…$/, '')}</p>
        )}
      </div>
      <Sheet open={ending} onClose={() => setEnding(false)} title={t('match.end')}>
        <p className="muted">{t('match.endConfirm')}</p>
        <div className="sheet-actions">
          <button
            type="button"
            className="button button--danger"
            onClick={() =>
              act({ type: 'END_MATCH' })
                .catch(() => {})
                .finally(() => setEnding(false))
            }
          >
            {t('match.end')}
          </button>
          <button type="button" className="button button--ghost" onClick={() => setEnding(false)}>
            {t('common.cancel')}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
