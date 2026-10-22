import { useEffect, useState } from 'react';
import type { GameClient, GameViewProps } from '../client-types';
import type { AssetRef } from '../types';
import type { Dict } from '../../platform/i18n/strings';
import { useI18n } from '../../platform/i18n/I18n';
import { Avatar, MediaImage, preload } from '../../platform/ui/Media';
import { ROLES, type MafiaRole } from './roles';
import type { View } from './index';
import './mafia.css';

const T = {
  yourCard: ['بطاقتك', 'Your card'],
  tapToFlip: ['اضغط عشان تقلب البطاقة. لا أحد يشوف شاشتك!', 'Tap to flip your card. Keep your screen hidden!'],
  seen: ['شفت دوري', 'I’ve seen my role'],
  waitingOthers: ['ننتظر الباقين يشوفون أدوارهم ({n} من {total})', 'Waiting for everyone to see their role ({n}/{total})'],
  partners: ['ربعك في المافيا', 'Your Mafia partners'],
  night: ['الليل', 'Night'],
  nightN: ['الليلة {n}', 'Night {n}'],
  day: ['النهار', 'Day'],
  dayN: ['اليوم {n}', 'Day {n}'],
  citySleeps: ['المدينة نايمة… سكّروا عيونكم.', 'The city sleeps… close your eyes.'],
  pickKill: ['مين يختفي الليلة؟', 'Who disappears tonight?'],
  pickSave: ['مين تحمي الليلة؟', 'Who do you protect tonight?'],
  pickCheck: ['مين تحقق معه؟', 'Who do you investigate?'],
  decoy: ['اختر أي أحد. ما يسوي شي، بس عشان محد يعرف مين عنده دور.', 'Pick anyone. It does nothing; it just hides who has a power.'],
  decoyDone: ['تمام. انتظر الصباح.', 'Done. Wait for morning.'],
  chosen: ['اخترت {name}', 'You chose {name}'],
  checkResult: ['{name}: {result}', '{name}: {result}'],
  isMafia: ['مافيا!', 'Mafia!'],
  notMafia: ['مو مافيا', 'not Mafia'],
  yourChecks: ['تحقيقاتك', 'Your investigations'],
  dawnKilled: ['الليلة اختفى {name}', 'Last night, {name} disappeared'],
  dawnNone: ['ما مات أحد الليلة!', 'Nobody died last night!'],
  wasRole: ['وكان {role}', 'They were the {role}'],
  continue: ['كمّل', 'Continue'],
  closeNight: ['أنهِ الليل', 'End the night'],
  closeVote: ['اقفل التصويت', 'Close the vote'],
  vote: ['صوّت: مين تشك فيه؟', 'Vote: who do you suspect?'],
  skip: ['ما أصوّت على أحد', 'Skip'],
  needed: ['يحتاج {n} صوت للإعدام', '{n} votes needed'],
  votedOut: ['قررت المدينة إعدام {name}', 'The town eliminated {name}'],
  noOne: ['ما اتفقت المدينة على أحد', 'The town could not agree'],
  dead: ['أنت ميت. تفرّج بصمت.', 'You are dead. Watch in silence.'],
  narrator: ['أنت الراوي: تشوف كل شي.', 'You are the narrator: you see everything.'],
  mafiaWin: ['فازت المافيا', 'The Mafia wins'],
  townWin: ['فازت المدينة', 'The town wins'],
  everyone: ['الكل', 'Everyone'],
  aliveCount: ['{n} عايشين', '{n} alive'],
  timer: ['{s}ث', '{s}s'],
  waitingFor: ['ننتظر المسؤول يكمّل', 'Waiting for the host to continue'],
  votes: ['{n} صوت', '{n} votes'],
} as const satisfies Dict;

const errors: Dict = {
  NOT_TWICE: ['ما تقدر تحمي نفس الشخص ليلتين ورا بعض.', 'You can’t protect the same person two nights in a row.'],
  NOT_A_TEAMMATE: ['هذا من المافيا!', 'That’s a Mafia partner!'],
  NOT_YOURSELF: ['تحقق مع غيرك.', 'Investigate someone else.'],
  DEAD: ['الأموات ما يلعبون.', 'The dead don’t play.'],
  CONTROLLER_ONLY: ['هذا للراوي أو المشرف.', 'Only the narrator or admin can do that.'],
  PICK_LIVING: ['اختر واحد عايش.', 'Pick someone alive.'],
  BAD_PHASE: ['مو الحين.', 'Not now.'],
};

const seatErrors: Dict = {
  NEED_FIVE: ['المافيا تحتاج ٥ لاعبين على الأقل (بدون الراوي).', 'Mafia needs at least 5 players (not counting the narrator).'],
  TOO_MANY: ['الحد الأقصى ٢٠ لاعب.', 'At most 20 players.'],
  TOO_MANY_MAFIA: ['المافيا كثير! لازم يكونون أقل من النص.', 'Too many Mafia: they must be under half.'],
};

type Props = GameViewProps<View>;
type P = View['players'][number];

function useLeft(deadline: number | null, now: () => number) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (deadline === null) return setLeft(null);
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [deadline, now]);
  return left;
}

/** A role card: the friend's own photo inside the role frame, or the group's custom role art. */
export function RoleCard({ role, name, portrait, art, back, flipped, onFlip }: { role: MafiaRole | null; name: string; portrait: AssetRef | null; art: Record<string, AssetRef>; back: AssetRef | null; flipped: boolean; onFlip?(): void }) {
  const { pick } = useI18n();
  const info = role ? ROLES[role] : null;
  const custom = role ? art[role] : undefined;
  return (
    <button type="button" className={`role-card${flipped ? ' is-flipped' : ''}`} data-role={role ?? undefined} onClick={onFlip} disabled={!onFlip}>
      <span className="role-card__inner">
        <span className="role-card__back">{back ? <MediaImage asset={back} alt="" sizes="300px" eager /> : <span className="role-card__pattern" />}</span>
        <span className="role-card__face">
          {custom ? (
            <MediaImage asset={custom} alt="" sizes="300px" eager className="role-card__art" />
          ) : (
            <span className="role-card__photo">{portrait ? <MediaImage asset={portrait} alt="" sizes="300px" eager /> : <span className="role-card__initial">{[...name][0]}</span>}</span>
          )}
          <span className="role-card__label">
            <span className="role-card__name">{info ? pick(info.name) : '?'}</span>
            <span className="role-card__who">{name}</span>
          </span>
        </span>
      </span>
    </button>
  );
}

function Mafia({ view: v, send, screen, now }: Props) {
  const { tr, pick, num } = useI18n();
  const left = useLeft(v.deadline, now);
  const me = v.me;
  const mine = me ? v.players.find((p) => p.id === me.id) : undefined;
  const [flipped, setFlipped] = useState(false);
  const [decoy, setDecoy] = useState<string | null>(null);
  const quiet = (a: Record<string, unknown>) => void send(a).catch(() => {});
  const name = (id: string | null | undefined) => v.players.find((p) => p.id === id)?.name ?? '';
  const isNight = v.phase === 'night' || v.phase === 'reveal';

  useEffect(() => {
    preload([...v.players.flatMap((p) => (p.portrait ? [p.portrait] : [])), ...Object.values(v.art.roles), ...(v.art.back ? [v.art.back] : [])], 640);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => setDecoy(null), [v.round, v.phase]);

  const header = (
    <header className="mafia__head">
      <p className="mafia__phase">
        {v.phase === 'reveal' ? tr(T.yourCard) : isNight ? tr(T.nightN, { n: num(v.round) }) : v.phase === 'over' ? '' : tr(T.dayN, { n: num(v.round) })}
      </p>
      <p className="mafia__alive">{tr(T.aliveCount, { n: num(v.players.filter((p) => p.alive).length) })}</p>
      {left !== null && <span className={`mafia__timer${left <= 10 ? ' is-urgent' : ''}`}>{tr(T.timer, { s: num(left) })}</span>}
    </header>
  );

  const controls = v.controller && !screen && (
    <div className="mafia__controls">
      {(v.phase === 'dawn' || v.phase === 'verdict') && (
        <button type="button" className="button button--primary button--big" onClick={() => quiet({ type: 'CONTINUE' })}>
          {tr(T.continue)}
        </button>
      )}
      {v.phase === 'night' && (
        <button type="button" className="button button--ghost" onClick={() => quiet({ type: 'CLOSE' })}>
          {tr(T.closeNight)}
        </button>
      )}
      {v.phase === 'day' && (
        <button type="button" className="button button--ghost" onClick={() => quiet({ type: 'CLOSE' })}>
          {tr(T.closeVote)}
        </button>
      )}
    </div>
  );

  let body: React.ReactNode = null;

  if (v.phase === 'over') {
    body = (
      <section className="mafia__end">
        <h1 className={`mafia__winner mafia__winner--${v.winner}`}>{v.winner === 'mafia' ? tr(T.mafiaWin) : tr(T.townWin)}</h1>
        <ul className="mafia__reveal-all" role="list">
          {v.players.map((p, i) => (
            <li key={p.id} style={{ '--i': i } as React.CSSProperties} className={p.alive ? '' : 'is-dead'}>
              <RoleCard role={p.role as MafiaRole} name={p.name} portrait={p.portrait} art={v.art.roles} back={v.art.back} flipped />
            </li>
          ))}
        </ul>
      </section>
    );
  } else if (v.phase === 'reveal') {
    const readyCount = v.players.filter((p) => p.ready).length;
    body = screen || !me ? (
      <section className="mafia__center">
        <p className="mafia__big">{tr(T.waitingOthers, { n: num(readyCount), total: num(v.players.length) })}</p>
        <Grid players={v.players} showReady />
      </section>
    ) : (
      <section className="mafia__center">
        <RoleCard role={me.role as MafiaRole} name={mine?.name ?? ''} portrait={mine?.portrait ?? null} art={v.art.roles} back={v.art.back} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
        <p className="muted">{flipped ? pick(ROLES[me.role as MafiaRole].blurb) : tr(T.tapToFlip)}</p>
        {flipped && me.role === 'mafia' && <Partners v={v} />}
        {mine?.ready ? (
          <p className="faint">{tr(T.waitingOthers, { n: num(readyCount), total: num(v.players.length) })}</p>
        ) : (
          <button type="button" className="button button--primary button--big" disabled={!flipped} onClick={() => quiet({ type: 'READY' })}>
            {tr(T.seen)}
          </button>
        )}
      </section>
    );
  } else if (v.phase === 'night') {
    const role = me?.alive ? (me.role as MafiaRole) : null;
    const action = role === 'mafia' ? 'KILL' : role === 'doctor' ? 'SAVE' : role === 'detective' ? 'CHECK' : null;
    const myChoice = role === 'mafia' ? v.night?.mafiaVotes[me!.id] : role === 'doctor' ? v.night?.mySave : role === 'detective' ? v.night?.myCheck : decoy;
    const targets = v.players.filter((p) => p.alive && !(role === 'mafia' && p.role === 'mafia') && !(role === 'detective' && p.id === me?.id));
    body =
      screen || !me || !me.alive || v.narrator ? (
        <section className="mafia__center">
          <Moon />
          <p className="mafia__big">{tr(T.citySleeps)}</p>
          {v.narrator && <NarratorNight v={v} name={name} />}
          {!screen && me && !me.alive && <p className="faint">{tr(T.dead)}</p>}
        </section>
      ) : (
        <section className="mafia__pick">
          <p className="mafia__big">{action === 'KILL' ? tr(T.pickKill) : action === 'SAVE' ? tr(T.pickSave) : action === 'CHECK' ? tr(T.pickCheck) : tr(T.decoy)}</p>
          {myChoice && <p className="mafia__chosen">{action ? tr(T.chosen, { name: name(myChoice) }) : tr(T.decoyDone)}</p>}
          <Grid
            players={targets}
            selected={myChoice ?? null}
            disabledId={role === 'doctor' ? v.night?.lastSave ?? null : null}
            marks={role === 'mafia' ? v.night?.mafiaVotes : undefined}
            markName={name}
            onPick={(id) => (action ? quiet({ type: action, target: id }) : setDecoy(id))}
          />
          {role === 'mafia' && <Partners v={v} />}
          {role === 'detective' && <Checks v={v} name={name} />}
        </section>
      );
  } else if (v.phase === 'dawn') {
    const victim = v.players.find((p) => p.id === v.dawn?.killed);
    body = (
      <section className="mafia__center mafia__announce">
        {victim ? (
          <>
            <RoleCard role={victim.role as MafiaRole | null} name={victim.name} portrait={victim.portrait} art={v.art.roles} back={v.art.back} flipped={!!victim.role} />
            <p className="mafia__big">{tr(T.dawnKilled, { name: victim.name })}</p>
            {victim.role && <p className="muted">{tr(T.wasRole, { role: pick(ROLES[victim.role as MafiaRole].name) })}</p>}
          </>
        ) : (
          <>
            <Sun />
            <p className="mafia__big">{tr(T.dawnNone)}</p>
          </>
        )}
        {!v.controller && !screen && <p className="faint">{tr(T.waitingFor)}</p>}
        {me?.role === 'detective' && me.alive && <Checks v={v} name={name} />}
      </section>
    );
  } else if (v.phase === 'day' || v.phase === 'verdict') {
    const counts: Record<string, number> = {};
    for (const [voter, target] of Object.entries(v.votes)) if (v.players.some((p) => p.id === voter && p.alive)) counts[target] = (counts[target] ?? 0) + 1;
    const out = v.players.find((p) => p.id === v.verdict?.eliminated);
    const canVote = v.phase === 'day' && !screen && !!me?.alive && !v.narrator;
    body = (
      <section className="mafia__pick">
        {v.phase === 'verdict' ? (
          <div className="mafia__center mafia__announce">
            {out ? (
              <>
                <RoleCard role={out.role as MafiaRole | null} name={out.name} portrait={out.portrait} art={v.art.roles} back={v.art.back} flipped={!!out.role} />
                <p className="mafia__big">{tr(T.votedOut, { name: out.name })}</p>
                {out.role && <p className="muted">{tr(T.wasRole, { role: pick(ROLES[out.role as MafiaRole].name) })}</p>}
              </>
            ) : (
              <p className="mafia__big">{tr(T.noOne)}</p>
            )}
          </div>
        ) : (
          <>
            <p className="mafia__big">{tr(T.vote)}</p>
            <p className="faint">{tr(T.needed, { n: num(v.needed) })}</p>
          </>
        )}
        <Grid
          players={v.players.filter((p) => p.alive || p.id === out?.id)}
          selected={me ? v.votes[me.id] ?? null : null}
          counts={counts}
          disabledId={me?.id ?? null}
          onPick={canVote ? (id) => quiet({ type: 'VOTE', target: id }) : undefined}
        />
        {canVote && (
          <button type="button" className="button button--ghost" aria-pressed={v.votes[me!.id] === 'skip'} onClick={() => quiet({ type: 'VOTE', target: 'skip' })}>
            {tr(T.skip)} {counts.skip ? `· ${num(counts.skip)}` : ''}
          </button>
        )}
        {me && !me.alive && !screen && <p className="faint">{tr(T.dead)}</p>}
      </section>
    );
  }

  return (
    <div className={`mafia mafia--${isNight ? 'night' : 'day'}${screen ? ' mafia--screen' : ''}`}>
      {header}
      {v.narrator && !screen && <p className="notice">{tr(T.narrator)}</p>}
      {body}
      {controls}
      {v.deaths.length > 0 && v.phase !== 'over' && <Graveyard v={v} />}
    </div>
  );
}

function Grid({
  players,
  selected = null,
  onPick,
  disabledId = null,
  counts,
  marks,
  markName,
  showReady,
}: {
  players: P[];
  selected?: string | null;
  onPick?(id: string): void;
  disabledId?: string | null;
  counts?: Record<string, number>;
  marks?: Record<string, string>;
  markName?(id: string): string;
  showReady?: boolean;
}) {
  const { pick, num } = useI18n();
  return (
    <ul className="mafia-grid" role="list">
      {players.map((p) => {
        const voters = marks ? Object.entries(marks).filter(([, t]) => t === p.id).map(([voter]) => voter) : [];
        return (
          <li key={p.id}>
            <button
              type="button"
              className={`mafia-tile${p.alive ? '' : ' is-dead'}${showReady && p.ready ? ' is-ready' : ''}`}
              aria-pressed={selected === p.id}
              disabled={!onPick || !p.alive || p.id === disabledId}
              onClick={() => onPick?.(p.id)}
            >
              <Avatar name={p.name} portrait={p.portrait} size={64} />
              <span className="mafia-tile__name">{p.name}</span>
              {p.role && <span className="mafia-tile__role">{pick(ROLES[p.role as MafiaRole].name)}</span>}
              {counts?.[p.id] ? <span className="mafia-tile__count">{num(counts[p.id]!)}</span> : null}
              {voters.length > 0 && <span className="mafia-tile__marks">{voters.map((id) => [...(markName?.(id) ?? '?')][0]).join(' ')}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Partners({ v }: { v: View }) {
  const { tr } = useI18n();
  const partners = v.players.filter((p) => p.role === 'mafia' && p.id !== v.me?.id);
  if (!partners.length) return null;
  return (
    <div className="mafia__partners">
      <p className="faint">{tr(T.partners)}</p>
      <div className="mafia__partner-row">
        {partners.map((p) => (
          <span key={p.id} className={`mafia__partner${p.alive ? '' : ' is-dead'}`}>
            <Avatar name={p.name} portrait={p.portrait} size={32} /> {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function Checks({ v, name }: { v: View; name(id: string): string }) {
  const { tr } = useI18n();
  if (!v.checks.length) return null;
  return (
    <div className="mafia__checks">
      <p className="faint">{tr(T.yourChecks)}</p>
      <ul role="list">
        {v.checks.map((c) => (
          <li key={c.round} className={c.mafia ? 'is-mafia' : ''}>
            {tr(T.checkResult, { name: name(c.target), result: tr(c.mafia ? T.isMafia : T.notMafia) })}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NarratorNight({ v, name }: { v: View; name(id: string): string }) {
  const { pick } = useI18n();
  const n = v.night;
  if (!n) return null;
  return (
    <ul className="mafia__narrator" role="list">
      {Object.entries(n.mafiaVotes).map(([m, t]) => (
        <li key={m}>
          {name(m)} → {name(t)} <span className="faint">({pick(ROLES.mafia.name)})</span>
        </li>
      ))}
      {n.mySave && (
        <li>
          {pick(ROLES.doctor.name)} → {name(n.mySave)}
        </li>
      )}
      {n.myCheck && (
        <li>
          {pick(ROLES.detective.name)} → {name(n.myCheck)}
        </li>
      )}
    </ul>
  );
}

function Graveyard({ v }: { v: View }) {
  return (
    <ul className="mafia__graves" role="list">
      {v.deaths.map((d) => {
        const p = v.players.find((x) => x.id === d.id)!;
        return (
          <li key={d.id} title={p.name}>
            <Avatar name={p.name} portrait={p.portrait} size={28} />
          </li>
        );
      })}
    </ul>
  );
}

function Moon() {
  return (
    <svg className="mafia__moon" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M62 10a40 40 0 1 0 28 62A34 34 0 0 1 62 10z" fill="var(--ember)" />
    </svg>
  );
}

function Sun() {
  return (
    <svg className="mafia__sun" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="22" fill="var(--brass)" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x="48" y="8" width="4" height="14" rx="2" fill="var(--brass)" transform={`rotate(${i * 30} 50 50)`} />
      ))}
    </svg>
  );
}

export const client: GameClient<View> = { Player: Mafia, errors, seatErrors };
