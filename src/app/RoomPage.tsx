import { useEffect, useState } from 'react';
import { gameById } from '../games/registry';
import { validCode } from '../platform/room/core';
import { enterRoom, forgetSeat, formatCode, readSeat } from '../platform/room/client';
import { useI18n } from '../platform/i18n/I18n';
import { useToast } from '../platform/ui/Toast';
import { Lobby } from './Lobby';
import { MatchStage } from './MatchStage';
import { Link } from './router';
import { TopBar } from './TopBar';
import { useRoom } from './useRoom';
import { WhoForm } from './WhoForm';
import './room.css';

export function RoomPage({ code }: { code: string }) {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const [token, setToken] = useState(() => readSeat(code)?.token ?? null);
  const { room, status, removed, send } = useRoom(validCode(code) ? code : null, token, {
    onError: (e) => toast(errorText(e), 'error'),
  });

  useEffect(() => {
    if (removed) forgetSeat(code);
  }, [removed, code]);

  const game = room ? gameById(room.gameId) : undefined;
  useEffect(() => {
    if (game) document.title = `${t('app.name')} · ${formatCode(code)}`;
  }, [game, code, t]);

  if (!validCode(code)) return <Notice title={t('err.CODE_INVALID')} />;

  if (removed) return <Notice title={removed === 'ROOM_NOT_FOUND' ? t('room.notFound') : t('room.removed')} />;

  if (!token)
    return (
      <div className="page">
        <TopBar />
        <main className="page__narrow">
          <p className="faint ltr-run">{formatCode(code)}</p>
          <h1 className="page__title">{t('who.title')}</h1>
          <WhoForm
            busyLabel={t('who.joining')}
            onSubmit={async (identity) => {
              const res = await enterRoom({ identity, code });
              setToken(res.token);
            }}
            onCancel={() => history.back()}
          />
        </main>
      </div>
    );

  return (
    <div className="page page--room" style={game ? ({ '--game-accent': game.accent } as React.CSSProperties) : undefined}>
      {status !== 'connected' && (
        <p className="conn-banner" role="status">
          {status === 'reconnecting' ? t('room.reconnecting') : t('room.connecting')}
        </p>
      )}
      {!room ? (
        <>
          <TopBar />
          <main className="page__narrow">
            <p className="muted spinner-dots">{t('room.connecting').replace(/…$/, '')}</p>
          </main>
        </>
      ) : room.phase === 'waiting' ? (
        <>
          <TopBar />
          <main className="page__narrow waiting">
            <div className="waiting__card" aria-hidden="true" />
            <h1 className="page__title">{t('room.waiting')}</h1>
            <p className="muted">{t('room.waitingHint')}</p>
          </main>
        </>
      ) : room.phase === 'lobby' || !room.match ? (
        <Lobby room={room} send={send} />
      ) : (
        <MatchStage room={room} send={send} />
      )}
    </div>
  );
}

function Notice({ title }: { title: string }) {
  const { t } = useI18n();
  return (
    <div className="page">
      <TopBar />
      <main className="page__narrow">
        <h1 className="page__title">{title}</h1>
        <Link className="button button--primary" href="/">
          {t('room.home')}
        </Link>
      </main>
    </div>
  );
}
