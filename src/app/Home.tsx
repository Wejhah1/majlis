import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { games } from '../games/registry';
import type { GameMeta } from '../games/types';
import { useI18n } from '../platform/i18n/I18n';
import { PlayingCard } from '../platform/ui/PlayingCard';
import { GameGlyph } from './GameGlyph';
import { JoinBox } from './JoinBox';
import './home.css';

export function Home() {
  const { t, lang, setLang } = useI18n();
  const [selectedId, setSelectedId] = useState(games[0]?.id ?? '');
  const selected = games.find((g) => g.id === selectedId);
  const reduceMotion = useReducedMotion();

  return (
    <div className="home">
      <div className="sadu-band" aria-hidden="true" />

      <header className="home__bar">
        <p className="wordmark">
          <span lang="ar">{t('app.name')}</span>
          <span className="wordmark__group">{t('group.name')}</span>
        </p>
        <button
          type="button"
          className="lang-toggle"
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          aria-label={t('lang.switchLabel')}
          lang={lang === 'ar' ? 'en' : 'ar'}
        >
          {t('lang.switch')}
        </button>
      </header>

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

          {selected && <GameDetails game={selected} key={selected.id} />}
        </section>
      </main>

      <footer className="home__footer">
        <a href="/admin">{t('footer.admin')}</a>
      </footer>
    </div>
  );
}

function GameCard({ game, selected, onSelect }: { game: GameMeta; selected: boolean; onSelect(): void }) {
  const { t, pick } = useI18n();
  return (
      <PlayingCard
        className={`game-card game-card--${game.id}`}
        aria-pressed={selected}
        onClick={onSelect}
        foil={selected && game.status === 'ready'}
      >
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

function GameDetails({ game }: { game: GameMeta }) {
  const { t, pick } = useI18n();
  const soon = game.status === 'soon';
  return (
    <motion.div
      className="details"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
      aria-live="polite"
    >
      <h3 className="details__name">{pick(game.name)}</h3>
      <p className="details__tagline">{pick(game.tagline)}</p>
      <ul className="details__facts" role="list">
        <li>{t('game.players', { min: game.players[0], max: game.players[1] })}</li>
        {game.surfaces.map((s) => (
          <li key={s}>{t(`game.surface.${s}`)}</li>
        ))}
      </ul>
      <button type="button" className="button button--primary" disabled={soon} aria-describedby={soon ? 'soon-note' : undefined}>
        {t('game.create')}
      </button>
      {soon && (
        <p id="soon-note" className="details__note">
          {t('join.notYet')}
        </p>
      )}
    </motion.div>
  );
}
