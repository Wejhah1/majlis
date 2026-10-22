import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';
import type { GameClient, GameViewProps } from '../client-types';
import type { PuzzleTile } from '../types';
import type { Dict } from '../../platform/i18n/strings';
import { useI18n } from '../../platform/i18n/I18n';
import { MediaImage, preload } from '../../platform/ui/Media';
import { isMuted, play, setMuted } from '../../platform/ui/sfx';
import { meta } from './meta';
import type { View } from './index';
import './puzzle.css';

const T = {
  puzzle: ['لغز {n} من {total}', 'Puzzle {n} of {total}'],
  buzz: ['اضغط!', 'BUZZ!'],
  buzzed: ['{name} ضغط أول!', '{name} buzzed first!'],
  youBuzzed: ['أنت أول واحد! قول الجواب', 'You were first! Say your answer'],
  locked: ['فريقكم غلط بهذا اللغز. انتظروا.', 'Your team missed this one. Hang on.'],
  answer: ['الجواب', 'Answer'],
  hint: ['تلميح', 'Hint'],
  showHint: ['اعرض التلميح (النقاط تنقص)', 'Show hint (fewer points)'],
  correct: ['صح ✓', 'Correct ✓'],
  wrong: ['غلط ✗', 'Wrong ✗'],
  awardTo: ['النقاط لـ {team}', 'Points to {team}'],
  reveal: ['اكشف الجواب بدون نقاط', 'Reveal without points'],
  next: ['اللغز الجاي', 'Next puzzle'],
  waitBuzz: ['ننتظر أحد يضغط…', 'Waiting for a buzz…'],
  hostOnly: ['أنت المقدّم: الجواب لك بس.', 'You’re the host: only you see the answer.'],
  points: ['{n} نقطة', '{n} pts'],
  winners: ['فاز فريق {team}!', '{team} win!'],
  tie: ['تعادل!', 'It’s a tie!'],
  sound: ['الصوت', 'Sound'],
  adjust: ['تعديل النقاط', 'Adjust scores'],
} as const satisfies Dict;

const errors: Dict = {
  LOCKED_OUT: ['فريقكم ما يقدر يضغط بهذا اللغز.', 'Your team is locked out of this puzzle.'],
  HOST_ONLY: ['هذا للمقدّم.', 'Host only.'],
  NO_BUZZ: ['ما أحد ضغط.', 'Nobody has buzzed.'],
  PICK_TEAM: ['اختر الفريق.', 'Pick a team.'],
};

const seatErrors: Dict = {
  HOST_REQUIRED: ['لازم واحد يكون المقدّم (من القائمة فوق).', 'Someone has to be the host.'],
  TEAM_EMPTY_FALCONS: ['فريق الصقور فاضي.', 'The Falcons team is empty.'],
  TEAM_EMPTY_WOLVES: ['فريق الذيابة فاضي.', 'The Wolves team is empty.'],
};

type Props = GameViewProps<View>;

function useTeam() {
  const { pick } = useI18n();
  return (id: string | null) => {
    const t = meta.lobby.teams?.find((x) => x.id === id);
    return { name: t ? pick(t.name) : '', color: t?.color ?? 'var(--brass)' };
  };
}

/** Plays sounds for game events, once per event, on the device that should make noise. */
function useEventSounds(v: View, enabled: boolean) {
  const last = useRef(v.event.n);
  const lastBuzz = useRef(v.buzz?.playerId ?? null);
  useEffect(() => {
    if (!enabled) return;
    if (v.event.n !== last.current) {
      last.current = v.event.n;
      if (v.event.kind === 'award') play('correct');
      if (v.event.kind === 'wrong') play('wrong');
      if (v.event.kind === 'reveal') play('reveal');
    }
  }, [v.event.n, v.event.kind, enabled]);
  useEffect(() => {
    if (enabled && v.buzz && v.buzz.playerId !== lastBuzz.current) play('buzz');
    lastBuzz.current = v.buzz?.playerId ?? null;
  }, [v.buzz, enabled]);
}

function Tiles({ tiles, big = false }: { tiles: PuzzleTile[]; big?: boolean }) {
  return (
    <div className={`pz-tiles${big ? ' pz-tiles--big' : ''}`}>
      {tiles.map((t, i) => (
        <motion.span key={i} className="pz-tile-wrap" initial={{ opacity: 0, y: 40, rotate: -6 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 18, delay: i * 0.15 }}>
          {i > 0 && <span className="pz-plus" aria-hidden="true">+</span>}
          <span className="pz-tile">{t.kind === 'image' ? <MediaImage asset={t.asset} alt="" sizes={big ? '30vw' : '30vw'} eager /> : <span className="pz-tile__text">{t.text}</span>}</span>
        </motion.span>
      ))}
    </div>
  );
}

function Counter({ value }: { value: number }) {
  const { num } = useI18n();
  const mv = useMotionValue(value);
  const shown = useTransform(mv, (x) => num(Math.round(x)));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.9, ease: [0.2, 0.7, 0.2, 1] });
    return c.stop;
  }, [value, mv]);
  return <motion.span className="pz-score__num">{shown}</motion.span>;
}

function Scores({ v, pulse }: { v: View; pulse: string | null }) {
  const team = useTeam();
  return (
    <div className="pz-scores">
      {v.teams.map((id) => {
        const t = team(id);
        return (
          <motion.div
            key={id}
            className="pz-score"
            style={{ '--team': t.color } as React.CSSProperties}
            animate={pulse === id ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={{ duration: 0.6 }}
            data-locked={v.lockedOut.includes(id) || undefined}
          >
            <span className="pz-score__name">{t.name}</span>
            <Counter value={v.scores[id] ?? 0} />
          </motion.div>
        );
      })}
    </div>
  );
}

/** The TV: tiles front and centre, a flying "+10" on every award. */
function Screen({ view: v }: Props) {
  const { tr, num } = useI18n();
  const team = useTeam();
  const [muted, setMute] = useState(isMuted);
  const [burst, setBurst] = useState<{ n: number; team: string; points: number } | null>(null);
  const lastEvent = useRef(v.event.n);
  useEventSounds(v, !muted);

  useEffect(() => {
    preload(v.tiles.flatMap((t) => (t.kind === 'image' ? [t.asset] : [])), 1080);
  }, [v.tiles]);

  useEffect(() => {
    if (v.event.n === lastEvent.current) return;
    lastEvent.current = v.event.n;
    if (v.event.kind === 'award' && v.event.team) {
      setBurst({ n: v.event.n, team: v.event.team, points: v.event.points });
      const t = setTimeout(() => setBurst(null), 1800);
      return () => clearTimeout(t);
    }
  }, [v.event]);

  if (v.phase === 'final') return <Final v={v} />;
  const buzzTeam = v.buzz ? team(v.buzz.team) : null;

  return (
    <div className="pz pz--screen">
      <header className="pz__head">
        <span className="faint">{tr(T.puzzle, { n: num(v.index + 1), total: num(v.total) })}</span>
        <span className="pz__points">{tr(T.points, { n: num(v.points) })}</span>
        <button type="button" className="pill-button" onClick={() => (setMuted(!muted), setMute(!muted))} aria-pressed={!muted}>
          {tr(T.sound)} {muted ? '✕' : '✓'}
        </button>
      </header>
      <Scores v={v} pulse={burst?.team ?? null} />
      <Tiles key={v.index} tiles={v.tiles} big />
      <div className="pz__status" aria-live="polite">
        <AnimatePresence mode="wait">
          {v.phase === 'answer' && v.answer ? (
            <motion.p key="answer" className="pz-answer" initial={{ opacity: 0, scale: 0.6, rotate: -4 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
              {v.answer}
            </motion.p>
          ) : buzzTeam ? (
            <motion.p key={`buzz-${v.buzz!.playerId}`} className="pz-buzz" style={{ '--team': buzzTeam.color } as React.CSSProperties} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: [0, -12, 12, -8, 0] }}>
              {tr(T.buzzed, { name: v.buzz!.name })} <span className="faint">· {buzzTeam.name}</span>
            </motion.p>
          ) : v.hintShown && v.hint ? (
            <motion.p key="hint" className="pz-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {tr(T.hint)}: {v.hint}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {burst && (
          <motion.span
            key={burst.n}
            className="pz-burst"
            style={{ '--team': team(burst.team).color } as React.CSSProperties}
            initial={{ opacity: 0, scale: 0.4, y: 0 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.4, 1.2, 0.8], y: [0, -20, -60, -220] }}
            transition={{ duration: 1.6, times: [0, 0.2, 0.6, 1] }}
          >
            +{num(burst.points)}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function Final({ v }: { v: View }) {
  const { tr } = useI18n();
  const team = useTeam();
  const ranked = [...v.teams].sort((a, b) => (v.scores[b] ?? 0) - (v.scores[a] ?? 0));
  const tie = ranked.length > 1 && v.scores[ranked[0]!] === v.scores[ranked[1]!];
  return (
    <div className="pz pz--final">
      <motion.h1 className="pz-final" style={{ '--team': team(ranked[0]!).color } as React.CSSProperties} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
        {tie ? tr(T.tie) : tr(T.winners, { team: team(ranked[0]!).name })}
      </motion.h1>
      <Scores v={v} pulse={tie ? null : ranked[0]!} />
    </div>
  );
}

/** Phones: the host gets the controller; players get a buzzer. */
function Phone(props: Props) {
  const { view: v, send } = props;
  const { tr, num } = useI18n();
  const team = useTeam();
  const quiet = (a: Record<string, unknown>) => void send(a).catch(() => {});
  useEventSounds(v, v.isHost);

  if (v.phase === 'final') return <Final v={v} />;

  if (v.isHost) {
    return (
      <div className="pz pz--host">
        <header className="pz__head">
          <span className="faint">{tr(T.puzzle, { n: num(v.index + 1), total: num(v.total) })}</span>
          <span className="pz__points">{tr(T.points, { n: num(v.points) })}</span>
        </header>
        <p className="notice">{tr(T.hostOnly)}</p>
        <Tiles key={v.index} tiles={v.tiles} />
        <div className="pz-host-answer">
          <span className="faint">{tr(T.answer)}</span>
          <strong>{v.answer}</strong>
          {v.hint && (
            <span className="faint">
              {tr(T.hint)}: {v.hint}
            </span>
          )}
        </div>
        <Scores v={v} pulse={null} />
        {v.phase === 'show' ? (
          <div className="pz-controls">
            {v.buzz ? (
              <>
                <p className="pz-buzz pz-buzz--small" style={{ '--team': team(v.buzz.team).color } as React.CSSProperties}>
                  {tr(T.buzzed, { name: v.buzz.name })}
                </p>
                <div className="pz-controls__row">
                  <button type="button" className="button button--primary button--big" onClick={() => quiet({ type: 'AWARD' })}>
                    {tr(T.correct)}
                  </button>
                  <button type="button" className="button button--danger button--big" onClick={() => quiet({ type: 'WRONG' })}>
                    {tr(T.wrong)}
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">{tr(T.waitBuzz)}</p>
            )}
            <div className="pz-controls__row">
              {v.teams.map((id) => (
                <button key={id} type="button" className="button button--quiet pz-team-button" style={{ '--team': team(id).color } as React.CSSProperties} onClick={() => quiet({ type: 'AWARD', team: id })}>
                  {tr(T.awardTo, { team: team(id).name })}
                </button>
              ))}
            </div>
            <div className="pz-controls__row">
              {v.hasHint && !v.hintShown && (
                <button type="button" className="button button--ghost" onClick={() => quiet({ type: 'HINT' })}>
                  {tr(T.showHint)}
                </button>
              )}
              <button type="button" className="button button--ghost" onClick={() => quiet({ type: 'REVEAL' })}>
                {tr(T.reveal)}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="button button--primary button--big" onClick={() => quiet({ type: 'NEXT' })}>
            {tr(T.next)}
          </button>
        )}
        <details className="pz-adjust">
          <summary>{tr(T.adjust)}</summary>
          <div className="pz-controls__row">
            {v.teams.flatMap((id) =>
              [-5, 5].map((d) => (
                <button key={`${id}${d}`} type="button" className="button button--ghost" onClick={() => quiet({ type: 'ADJUST', team: id, delta: d })}>
                  {team(id).name} {d > 0 ? `+${num(d)}` : `−${num(-d)}`}
                </button>
              )),
            )}
          </div>
        </details>
      </div>
    );
  }

  const mine = v.myTeam ? team(v.myTeam) : null;
  const locked = !!v.myTeam && v.lockedOut.includes(v.myTeam);
  const iBuzzed = v.buzz?.playerId === props.meId;
  return (
    <div className="pz pz--player" style={{ '--team': mine?.color ?? 'var(--brass)' } as React.CSSProperties}>
      <Scores v={v} pulse={null} />
      <Tiles key={v.index} tiles={v.tiles} />
      {v.phase === 'answer' ? (
        <p className="pz-answer pz-answer--small">{v.answer}</p>
      ) : iBuzzed ? (
        <p className="pz-buzz">{tr(T.youBuzzed)}</p>
      ) : v.buzz ? (
        <p className="pz-buzz pz-buzz--small" style={{ '--team': team(v.buzz.team).color } as React.CSSProperties}>
          {tr(T.buzzed, { name: v.buzz.name })}
        </p>
      ) : locked ? (
        <p className="muted">{tr(T.locked)}</p>
      ) : (
        <motion.button
          type="button"
          className="pz-buzzer"
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            play('buzz');
            navigator.vibrate?.(60);
            quiet({ type: 'BUZZ' });
          }}
        >
          {tr(T.buzz)}
        </motion.button>
      )}
      {mine && <p className="faint">{mine.name}</p>}
    </div>
  );
}

export const client: GameClient<View> = { Player: Phone, Screen, errors, seatErrors };
