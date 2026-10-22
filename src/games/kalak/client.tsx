import { useEffect, useId, useState, type FormEvent } from 'react';
import type { GameClient, GameViewProps } from '../client-types';
import type { Dict } from '../../platform/i18n/strings';
import { useI18n } from '../../platform/i18n/I18n';
import { Avatar, MediaImage } from '../../platform/ui/Media';
import type { View } from './index';
import './kalak.css';

const T = {
  round: ['سؤال {n} من {total}', 'Question {n} of {total}'],
  writeLie: ['اكتب جواب غلط يصدّقونه', 'Write a fake answer they’ll believe'],
  yourLie: ['كذبتك', 'Your lie'],
  send: ['أرسل', 'Send'],
  change: ['عدّل', 'Edit'],
  sent: ['انكتبت كذبتك. ننتظر الباقين…', 'Lie locked in. Waiting for the others…'],
  pickTruth: ['وين الجواب الصحيح؟', 'Which one is true?'],
  voted: ['صوّتت. ننتظر الباقين…', 'Voted. Waiting for the others…'],
  truth: ['الصح', 'TRUTH'],
  wroteBy: ['كتبها {names}', 'by {names}'],
  fooled: ['انخدع', 'fell for it'],
  nobody: ['ما أحد اختارها', 'nobody picked it'],
  next: ['السؤال الجاي', 'Next question'],
  finish: ['النتيجة النهائية', 'Final scores'],
  hurry: ['يلا خلّصونا', 'Hurry up'],
  scores: ['النقاط', 'Scores'],
  winner: ['ملك الكَلَك', 'Kalak champion'],
  points: ['{n} نقطة', '{n} pts'],
  plus: ['+{n}', '+{n}'],
  timer: ['{s}', '{s}'],
  waitingAdmin: ['المشرف يكمّل…', 'The admin moves on…'],
  watching: ['تتفرّج', 'Watching'],
} as const satisfies Dict;

const errors: Dict = {
  IS_TRUTH: ['هذا الجواب الصحيح! اكتب كذبة.', 'That’s the real answer! Write a lie.'],
  FAKE_LENGTH: ['الكذبة من حرف إلى ٦٠ حرف.', 'Lies are 1–60 characters.'],
  OWN_FAKE: ['ما تقدر تختار كذبتك.', 'You can’t pick your own lie.'],
  NO_FAKES_YET: ['ما أحد كتب للحين.', 'Nobody has written yet.'],
  BAD_PHASE: ['مو الحين.', 'Not now.'],
};

const seatErrors: Dict = {
  NEED_THREE: ['كَلَك يحتاج ٣ لاعبين على الأقل.', 'Kalak needs at least 3 players.'],
  TOO_MANY: ['الحد الأقصى ١٢ لاعب.', 'At most 12 players.'],
};

function useLeft(deadline: number | null, now: () => number) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (deadline === null) return setLeft(null);
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline, now]);
  return left;
}

function Kalak({ view: v, send, screen, isAdmin, now }: GameViewProps<View>) {
  const { tr, num } = useI18n();
  const left = useLeft(v.deadline, now);
  const quiet = (a: Record<string, unknown>) => void send(a).catch(() => {});
  const player = (id: string) => v.players.find((p) => p.id === id);
  const playing = !!v.me && !screen;

  return (
    <div className={`kalak kalak--${v.phase}${screen ? ' kalak--screen' : ''}`}>
      {v.phase !== 'final' && (
        <header className="kalak__head">
          <span className="kalak__round">{tr(T.round, { n: num(v.round), total: num(v.rounds) })}</span>
          <span className="kalak__cat">{v.question.category}</span>
          {left !== null && <span className={`kalak__timer${left <= 10 ? ' is-urgent' : ''}`}>{num(left)}</span>}
        </header>
      )}

      {v.phase !== 'final' && (
        <section className="kalak__question" key={v.round}>
          {v.question.image && <MediaImage asset={v.question.image} alt="" sizes="(max-width: 700px) 90vw, 600px" className="kalak__image" eager />}
          <h1 className="kalak__prompt">{v.question.prompt.split('____').flatMap((part, i) => (i ? [<span key={i} className="kalak__blank" />, part] : [part]))}</h1>
        </section>
      )}

      {v.phase === 'write' && (
        <>
          {playing && <WriteForm mine={v.myFake} send={send} />}
          <ul className="kalak__people" role="list">
            {v.players.map((p) => (
              <li key={p.id} className={v.written.includes(p.id) ? 'is-done' : ''}>
                <Avatar name={p.name} portrait={p.portrait} size={44} />
                <span>{p.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {v.phase === 'vote' && (
        <>
          <p className="kalak__ask">{v.myVote ? tr(T.voted) : playing ? tr(T.pickTruth) : tr(T.pickTruth)}</p>
          <ul className="kalak__slips" role="list">
            {v.options.map((o, i) => (
              <li key={o.id} style={{ '--i': i } as React.CSSProperties}>
                <button type="button" className="kalak-slip" aria-pressed={v.myVote === o.id} disabled={!playing || o.mine} onClick={() => quiet({ type: 'VOTE', option: o.id })}>
                  <span className="kalak-slip__text">{o.text}</span>
                  {o.mine && <span className="kalak-slip__tag">{tr(T.yourLie)}</span>}
                </button>
              </li>
            ))}
          </ul>
          <ul className="kalak__people kalak__people--small" role="list">
            {v.players.map((p) => (
              <li key={p.id} className={v.voted.includes(p.id) ? 'is-done' : ''}>
                <Avatar name={p.name} portrait={p.portrait} size={32} />
              </li>
            ))}
          </ul>
        </>
      )}

      {v.phase === 'reveal' && (
        <ul className="kalak__slips kalak__slips--reveal" role="list">
          {[...v.options]
            .sort((a, b) => Number(a.truth) - Number(b.truth) || a.voters.length - b.voters.length)
            .map((o, i) => (
              <li key={o.id} style={{ '--i': i } as React.CSSProperties}>
                <div className={`kalak-slip kalak-slip--revealed${o.truth ? ' is-truth' : ''}`}>
                  {o.truth && <span className="kalak-slip__stamp">{tr(T.truth)}</span>}
                  <span className="kalak-slip__text">{o.text}</span>
                  {!o.truth && (
                    <span className="kalak-slip__by">
                      {o.authors.map((a) => (
                        <Avatar key={a} name={player(a)?.name ?? '?'} portrait={player(a)?.portrait ?? null} size={22} />
                      ))}
                      {tr(T.wroteBy, { names: o.authors.map((a) => player(a)?.name ?? '').join('، ') })}
                    </span>
                  )}
                  <span className="kalak-slip__voters">
                    {o.voters.length ? (
                      o.voters.map((id) => (
                        <span key={id} className="kalak-voter">
                          <Avatar name={player(id)?.name ?? '?'} portrait={player(id)?.portrait ?? null} size={26} />
                          {!o.truth && <span className="visually-hidden">{tr(T.fooled)}</span>}
                        </span>
                      ))
                    ) : (
                      <span className="faint">{tr(T.nobody)}</span>
                    )}
                  </span>
                </div>
              </li>
            ))}
        </ul>
      )}

      {(v.phase === 'reveal' || v.phase === 'final') && <Scoreboard v={v} final={v.phase === 'final'} />}

      {!screen && isAdmin && (
        <div className="kalak__admin">
          {(v.phase === 'write' || v.phase === 'vote') && (
            <button type="button" className="button button--ghost" onClick={() => quiet({ type: 'SKIP' })}>
              {tr(T.hurry)}
            </button>
          )}
          {v.phase === 'reveal' && (
            <button type="button" className="button button--primary button--big" onClick={() => quiet({ type: 'NEXT' })}>
              {v.round >= v.rounds ? tr(T.finish) : tr(T.next)}
            </button>
          )}
        </div>
      )}
      {!screen && !isAdmin && v.phase === 'reveal' && <p className="faint">{tr(T.waitingAdmin)}</p>}
    </div>
  );
}

function WriteForm({ mine, send }: { mine: string | null; send: GameViewProps<View>['send'] }) {
  const { tr } = useI18n();
  const id = useId();
  const [text, setText] = useState(mine ?? '');
  const [editing, setEditing] = useState(!mine);
  useEffect(() => setEditing(!mine), [mine]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await send({ type: 'FAKE', text }).then(
      () => setEditing(false),
      () => {},
    );
  }

  if (!editing && mine)
    return (
      <div className="kalak__sent">
        <p className="kalak-slip kalak-slip--mine">
          <span className="kalak-slip__text">{mine}</span>
        </p>
        <p className="muted">{tr(T.sent)}</p>
        <button type="button" className="pill-button" onClick={() => setEditing(true)}>
          {tr(T.change)}
        </button>
      </div>
    );

  return (
    <form className="kalak__write" onSubmit={submit}>
      <label className="field__label" htmlFor={id}>
        {tr(T.writeLie)}
      </label>
      <div className="kalak__write-row">
        <input id={id} className="input kalak__input" value={text} onChange={(e) => setText(e.target.value)} maxLength={60} autoComplete="off" autoFocus />
        <button className="button button--primary" disabled={!text.trim()}>
          {tr(T.send)}
        </button>
      </div>
    </form>
  );
}

function Scoreboard({ v, final }: { v: View; final: boolean }) {
  const { tr, num } = useI18n();
  const ranked = [...v.players].sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score ?? 0;
  return (
    <section className={`kalak__scores${final ? ' is-final' : ''}`}>
      {final && ranked[0] && (
        <div className="kalak__champion">
          <Avatar name={ranked[0].name} portrait={ranked[0].portrait} size={120} />
          <p className="kalak__champion-title">{tr(T.winner)}</p>
          <p className="kalak__champion-name">{ranked[0].name}</p>
        </div>
      )}
      <ol role="list">
        {ranked.map((p, i) => (
          <li key={p.id} style={{ '--i': i, '--w': top ? p.score / top : 0 } as React.CSSProperties}>
            <span className="kalak__rank">{num(i + 1)}</span>
            <Avatar name={p.name} portrait={p.portrait} size={32} />
            <span className="kalak__name">{p.name}</span>
            <span className="kalak__bar" aria-hidden="true" />
            {v.roundPoints[p.id] ? <span className="kalak__plus">{tr(T.plus, { n: num(v.roundPoints[p.id]!) })}</span> : null}
            <span className="kalak__score">{num(p.score)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export const client: GameClient<View> = { Player: Kalak, errors, seatErrors };
