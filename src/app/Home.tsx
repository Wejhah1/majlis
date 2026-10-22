import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { games } from '../games/registry';
import type { GameMeta } from '../games/types';
import { useI18n } from '../platform/i18n/I18n';
import { enterRoom } from '../platform/room/client';
import { PlayingCard } from '../platform/ui/PlayingCard';
import { Sheet } from '../platform/ui/Sheet';
import { GameGlyph } from './GameGlyph';
import { JoinBox } from './JoinBox';
import { Link, navigate } from './router';
import { TopBar } from './TopBar';
import { WhoForm } from './WhoForm';
import './home.css';

export function Home({ initialGame }: { initialGame?: string }) {
  const { t, pick } = useI18n();
  const [selectedId, setSelectedId] = useState(games.find((g) => g.id === initialGame)?.id ?? games[0]?.id ?? '');
  const [creating, setCreating] = useState<GameMeta | null>(null);
  const selected = games.find((g) => g.id === selectedId);
  const reduceMotion = useReducedMotion();

  return (
    <div className="home">
      <TopBar />

      <main className="home__main">
        <section className="home__intro">
          <h1 className="home__question">{t('home.question')}</h1>
          <p className="home__lede">{t('home.lede')}</p>
          <JoinBox />
        </section>

        <section className="home__table" aria-labelledby="pick-heading">
          <h2 id="pick-heading" className="visually-hidden">
            {t('home.pick')}
          </h2>

          <ul className="hand" role="list">
            {games.map((game, i) => (
              <motion.li
                key={game.id}
                className="hand__slot"
                style={{ '--i': i, '--n': games.length } as React.CSSProperties}
                initial={reduceMotion ? false : { y: 120, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.15 + i * 0.07 }}
              >
                <GameCard game={game} selected={game.id === selectedId} onSelect={() => setSelectedId(game.id)} />
              </motion.li>
            ))}
          </ul>

          {selected && <GameDetails game={selected} key={selected.id} onCreate={() => setCreating(selected)} />}
        </section>
      </main>

      <footer className="home__footer">
        <Link href="/admin">{t('footer.admin')}</Link>
        <Link href="/tv">{t('tv.title')}</Link>
      </footer>

      <Sheet open={!!creating} onClose={() => setCreating(null)} title={creating ? `${pick(creating.name)} · ${t('who.title')}` : ''}>
        {creating && (
          <WhoForm
            busyLabel={t('who.creating')}
            onSubmit={async (identity) => {
              const { code } = await enterRoom({ identity, gameId: creating.id });
              navigate(`/r/${code}`);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function GameCard({ game, selected, onSelect }: { game: GameMeta; selected: boolean; onSelect(): void }) {
  const { t, pick } = useI18n();
  return (
    <PlayingCard className={`game-card game-card--${game.id}`} aria-pressed={selected} onClick={onSelect} foil={selected && game.status === 'ready'}>
      <span className="game-card__index" aria-hidden="true">
        <span className="ltr-run">
          {game.players[0]}–{game.players[1]}
        </span>
      </span>
      <span className="game-card__art">
        <GameGlyph id={game.id} />
      </span>
      <span className="game-card__name">{pick(game.name)}</span>
      {game.status === 'soon' && <span className="game-card__stamp">{t('game.soon')}</span>}
    </PlayingCard>
  );
}

function GameDetails({ game, onCreate }: { game: GameMeta; onCreate(): void }) {
  const { t, pick } = useI18n();
  const soon = game.status === 'soon';
  return (
    <motion.div className="details" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}>
      <h3 className="details__name">{pick(game.name)}</h3>
      <p className="details__tagline">{pick(game.tagline)}</p>
      <ul className="details__facts" role="list">
        <li>{t('game.players', { min: game.players[0], max: game.players[1] })}</li>
        {game.surfaces.map((s) => (
          <li key={s}>{t(`game.surface.${s}`)}</li>
        ))}
      </ul>
      <button type="button" className="button button--primary button--big" disabled={soon} onClick={onCreate}>
        {t('game.create')}
      </button>
    </motion.div>
  );
}
