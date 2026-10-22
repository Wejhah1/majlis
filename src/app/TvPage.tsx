import { useEffect, useState, type FormEvent } from 'react';
import { gameById } from '../games/registry';
import { useI18n } from '../platform/i18n/I18n';
import { formatCode, parseRoomCode } from '../platform/room/client';
import { validCode } from '../platform/room/core';
import { Avatar } from '../platform/ui/Media';
import { QrCode } from '../platform/ui/QrCode';
import { MatchStage } from './MatchStage';
import { navigate } from './router';
import { useRoom } from './useRoom';
import './room.css';
import './tv.css';

/** The shared screen: a TV or laptop that shows the public board. It never holds a seat. */
export function TvPage({ code }: { code: string | null }) {
  const { t, pick, num } = useI18n();
  const { room, status, removed, send } = useRoom(code && validCode(code) ? code : null, null, { screen: true });

  useEffect(() => {
    document.documentElement.classList.add('is-tv');
    return () => document.documentElement.classList.remove('is-tv');
  }, []);

  if (!code || !validCode(code)) return <TvCodeEntry />;
  if (removed)
    return (
      <main className="tv tv--center">
        <h1 className="tv__title">{t('room.notFound')}</h1>
      </main>
    );
  if (!room)
    return (
      <main className="tv tv--center">
        <p className="muted spinner-dots">{t('room.connecting').replace(/…$/, '')}</p>
      </main>
    );

  const game = gameById(room.gameId)!;
  if (room.phase === 'playing' && room.match)
    return (
      <div className="tv tv--playing" style={{ '--game-accent': game.accent } as React.CSSProperties}>
        {status !== 'connected' && <p className="conn-banner">{t('room.reconnecting')}</p>}
        <MatchStage room={room} send={send} screen />
      </div>
    );

  const link = `${location.origin}/r/${room.code}`;
  return (
    <main className="tv tv--lobby" style={{ '--game-accent': game.accent } as React.CSSProperties}>
      <div className="sadu-band" aria-hidden="true" />
      <section className="tv-lobby">
        <div className="tv-lobby__join">
          <p className="tv-lobby__game">{pick(game.name)}</p>
          <QrCode value={link} size={260} label={link} />
          <p className="tv-lobby__hint">{t('tv.join')}</p>
          <p className="faint">{t('tv.orVisit')}</p>
          <p className="tv-lobby__code ltr-run">{formatCode(room.code)}</p>
          <p className="faint ltr-run">{location.host}</p>
        </div>
        <div className="tv-lobby__people">
          <h1 className="tv__title">
            {t('lobby.players')} <span className="team__count">{num(room.members.length)}</span>
          </h1>
          <ul className="tv-faces" role="list">
            {room.members.map((m, i) => (
              <li key={m.id} className="tv-face" style={{ '--i': i } as React.CSSProperties}>
                <Avatar name={m.name} portrait={m.portrait} size={96} />
                <span>{m.name}</span>
              </li>
            ))}
          </ul>
          <p className="muted">{t('tv.waiting')}</p>
        </div>
      </section>
    </main>
  );
}

function TvCodeEntry() {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = parseRoomCode(code);
    if (validCode(c)) navigate(`/tv/${c}`);
  };
  return (
    <main className="tv tv--center">
      <form className="tv-code" onSubmit={submit}>
        <h1 className="tv__title">{t('tv.enterCode')}</h1>
        <input className="input join__input ltr-run" value={code} onChange={(e) => setCode(e.target.value)} placeholder="K7P-QM3-XA9" autoFocus />
        <button className="button button--primary button--big">{t('tv.show')}</button>
      </form>
    </main>
  );
}
