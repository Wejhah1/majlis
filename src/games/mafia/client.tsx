import { useEffect, useRef, useState } from 'react';
import type { GameClient, GameViewProps } from '../client-types';
import type { AssetRef } from '../types';
import type { Dict } from '../../platform/i18n/strings';
import { useI18n } from '../../platform/i18n/I18n';
import { Avatar, MediaImage, preload } from '../../platform/ui/Media';
import { play } from '../../platform/ui/sfx';
import { ROLES, type MafiaRole } from './roles';
import type { View } from './index';
import './mafia.css';

const T = {
  yourCard: ['بطاقتك', 'Your card'],
  tapToFlip: ['اضغط عشان تقلب البطاقة. لا أحد يشوف شاشتك!', 'Tap to flip your card. Keep your screen hidden!'],
  seen: ['شفت دوري', 'I’ve seen my role'],
  waitingOthers: ['ننتظر الباقين يشوفون أدوارهم ({n} من {total})', 'Waiting for everyone to see their role ({n}/{total})'],
  partners: ['ربعك في المافيا', 'Your Mafia partners'],
  nightN: ['الليلة {n}', 'Night {n}'],
  dayN: ['اليوم {n}', 'Day {n}'],
  citySleeps: ['المدينة نايمة… سكّروا عيونكم.', 'The city sleeps… close your eyes.'],
  pickKill: ['مين يختفي الليلة؟', 'Who disappears tonight?'],
  pickSave: ['مين تحمي الليلة؟', 'Who do you protect tonight?'],
  pickCheck: ['مين تحقق معه؟', 'Who do you investigate?'],
  pickLovers: ['اختر اثنين يصيرون عشّاق ({n} من ٢)', 'Pick two people to fall in love ({n}/2)'],
  loversSet: ['تم! العشّاق صاروا مربوطين ببعض.', 'Done! The lovers are bound together.'],
  decoy: ['اختر أي أحد. ما يسوي شي، بس عشان محد يعرف مين عنده دور.', 'Pick anyone. It does nothing; it just hides who has a power.'],
  decoyDone: ['تمام. انتظر الصباح.', 'Done. Wait for morning.'],
  chosen: ['اخترت {name}', 'You chose {name}'],
  waitAction: ['تمام. ننتظر الباقين يخلصون…', 'Done. Waiting for the others…'],
  checkResult: ['{name}: {result}', '{name}: {result}'],
  isMafia: ['مافيا!', 'Mafia!'],
  notMafia: ['مو مافيا', 'not Mafia'],
  yourChecks: ['تحقيقاتك', 'Your investigations'],
  witchTitle: ['دورك يا ساحرة', 'Your turn, Witch'],
  witchVictim: ['المافيا اختارت {name} الليلة.', 'The Mafia chose {name} tonight.'],
  witchNoVictim: ['المافيا ما اختارت أحد الليلة.', 'The Mafia chose nobody tonight.'],
  healPotion: ['جرعة الحياة: أنقذه', 'Life potion: save them'],
  poisonPotion: ['جرعة الموت: اختر أحد تقتله', 'Death potion: pick someone to kill'],
  used: ['(مستخدمة)', '(used)'],
  done: ['خلصت', 'Done'],
  witchWait: ['الساحرة تقرر…', 'The Witch is deciding…'],
  dawnKilled: ['الليلة اختفى {name}', 'Last night, {name} disappeared'],
  dawnNone: ['ما مات أحد الليلة!', 'Nobody died last night!'],
  dawnBlocked: ['المافيا هاجمت أحد… بس نجا! 🛡️', 'The Mafia struck… but someone was protected! 🛡️'],
  cause_love: ['مات من الحزن على حبيبه 💔', 'Died of a broken heart 💔'],
  cause_poison: ['شرب سم الساحرة ☠️', 'Poisoned by the Witch ☠️'],
  cause_shot: ['أخذته رصاصة الصياد 🎯', 'Taken by the Hunter’s shot 🎯'],
  wasRole: ['وكان {role}', 'They were the {role}'],
  hunterYou: ['أنت الصياد! قبل ما تموت، اختر مين تاخذ معك.', 'You are the Hunter! Before you go, pick who you take with you.'],
  hunterWait: ['الصياد {name} يصوّب… 🎯', 'The Hunter {name} takes aim… 🎯'],
  continue: ['كمّل', 'Continue'],
  autoNext: ['نكمّل تلقائياً بعد {s}ث', 'Moving on in {s}s'],
  closeNight: ['أنهِ الليل', 'End the night'],
  closeVote: ['اقفل التصويت', 'Close the vote'],
  openVote: ['افتح التصويت', 'Open the vote'],
  pause: ['إيقاف مؤقت', 'Pause'],
  resume: ['كمّل الوقت', 'Resume'],
  extend: ['+٣٠ث', '+30s'],
  paused: ['متوقف', 'Paused'],
  hostBar: ['تحكم المشرف', 'Host controls'],
  discussTitle: ['وقت النقاش', 'Discussion time'],
  discussLocked: ['التصويت مقفل الحين. تكلموا، اتهموا، دافعوا عن أنفسكم!', 'Voting is locked. Talk, accuse, defend yourselves!'],
  discussHost: ['المشرف يفتح التصويت لما تخلصون.', 'The host opens the vote when you’re ready.'],
  vote: ['صوّت: مين تشك فيه؟', 'Vote: who do you suspect?'],
  skip: ['ما أصوّت على أحد', 'Skip'],
  needed: ['يحتاج {n} صوت للإعدام', '{n} votes needed'],
  noVote: ['انكشفت كأهبل: ما تقدر تصوّت.', 'You were revealed as the Idiot: you can’t vote.'],
  votedOut: ['قررت المدينة إعدام {name}', 'The town eliminated {name}'],
  spared: ['صوتوا على {name}… بس طلع الأهبل! يعيش بس بدون صوت.', 'They voted out {name}… who turns out to be the Idiot! They live, but lose their vote.'],
  noOne: ['ما اتفقت المدينة على أحد', 'The town could not agree'],
  dead: ['أنت ميت. تفرّج بصمت 🤐', 'You are dead. Watch in silence 🤐'],
  narrator: ['أنت الراوي: تشوف كل شي.', 'You are the narrator: you see everything.'],
  mafiaWin: ['فازت المافيا', 'The Mafia wins'],
  townWin: ['فازت المدينة', 'The town wins'],
  aliveCount: ['{n} عايشين', '{n} alive'],
  timer: ['{s}ث', '{s}s'],
  waitingFor: ['ننتظر المسؤول يكمّل', 'Waiting for the host to continue'],
  lovers: ['العشّاق', 'The lovers'],
  yourLove: ['أنت عاشق لـ {name} 💘 إذا مات، تموت معه.', 'You love {name} 💘 If they die, so do you.'],
  potions: ['جرعاتك: {heal} حياة · {poison} موت', 'Potions: {heal} life · {poison} death'],
  // Curtains between phases.
  c_night: ['الكل يغمض عيونه', 'Everyone, close your eyes'],
  c_nightSub: ['اللي عنده دور يفتح جواله بهدوء ويختار', 'If you have a role, quietly open your phone and choose'],
  c_dawn: ['طلع الصبح… افتحوا عيونكم', 'Morning… open your eyes'],
  c_dawnSub: ['خلونا نشوف وش صار بالليل', 'Let’s see what happened in the night'],
  c_discuss: ['وقت النقاش', 'Time to talk'],
  c_discussSub: ['التصويت مقفل. مين تشكون فيه؟', 'Voting is locked. Who do you suspect?'],
  c_vote: ['التصويت مفتوح', 'The vote is open'],
  c_voteSub: ['اختر مين تبي تطلّعه. تقدر تغيّر رايك قبل ما يقفل.', 'Pick who goes. You can change your mind until it closes.'],
  c_verdict: ['الحكم', 'The verdict'],
  c_verdictSub: ['قررت المدينة…', 'The town has decided…'],
  tapSkip: ['اضغط للمتابعة', 'Tap to continue'],
  // The phase stepper.
  s_night: ['الليل', 'Night'],
  s_dawn: ['الصباح', 'Morning'],
  s_discuss: ['النقاش', 'Talk'],
  s_vote: ['التصويت', 'Vote'],
  s_verdict: ['الحكم', 'Verdict'],
} as const satisfies Dict;

const errors: Dict = {
  NOT_TWICE: ['ما تقدر تحمي نفس الشخص ليلتين ورا بعض.', 'You can’t protect the same person two nights in a row.'],
  NOT_A_TEAMMATE: ['هذا من المافيا!', 'That’s a Mafia partner!'],
  NOT_YOURSELF: ['تحقق مع غيرك.', 'Investigate someone else.'],
  DEAD: ['الأموات ما يلعبون.', 'The dead don’t play.'],
  CONTROLLER_ONLY: ['هذا للراوي أو المشرف.', 'Only the narrator or admin can do that.'],
  PICK_LIVING: ['اختر واحد عايش.', 'Pick someone alive.'],
  PICK_TWO: ['اختر شخصين مختلفين.', 'Pick two different people.'],
  BAD_PHASE: ['مو الحين.', 'Not now.'],
  VOTE_LOCKED: ['التصويت مقفل وقت النقاش.', 'Voting is locked during the discussion.'],
  NO_VOTE: ['الأهبل ما يصوّت.', 'The Idiot can’t vote.'],
  NO_POTION: ['خلصت هالجرعة.', 'That potion is used up.'],
  HUNTER_FIRST: ['ننتظر الصياد يطلق.', 'Waiting for the Hunter’s shot.'],
  NO_TIMER: ['ما فيه مؤقت شغّال.', 'No timer is running.'],
  NOT_PAUSED: ['الوقت مو متوقف.', 'The timer isn’t paused.'],
};

const seatErrors: Dict = {
  NEED_FIVE: ['المافيا تحتاج ٥ لاعبين على الأقل (بدون الراوي).', 'Mafia needs at least 5 players (not counting the narrator).'],
  TOO_MANY: ['الحد الأقصى ٢٠ لاعب.', 'At most 20 players.'],
  TOO_MANY_MAFIA: ['المافيا كثير! لازم يكونون أقل من النص.', 'Too many Mafia: they must be under half.'],
  TOO_MANY_ROLES: ['الأدوار أكثر من اللاعبين. طفّ بعض الأدوار.', 'More roles than players. Turn some roles off.'],
};

/** What a role does tonight, in a sentence a first-timer understands. */
const NIGHT_HELP: Partial<Record<MafiaRole, readonly [string, string]>> = {
  mafia: ['اتفقوا على ضحية. اللي يختاره أغلبكم هو اللي يروح.', 'Agree on a victim. Whoever most of you pick is the one.'],
  doctor: ['اختر شخص تحميه (تقدر تحمي نفسك).', 'Pick someone to protect (yourself included).'],
  detective: ['اختر شخص وبتعرف الحين إذا هو مافيا أو لا.', 'Pick someone and you’ll find out right away if they’re Mafia.'],
  witch: ['انتظر لين تختار المافيا، بعدها تقرر تستخدم جرعاتك.', 'Wait for the Mafia to choose; then decide on your potions.'],
  cupid: ['أول ليلة بس: اختر اثنين يصيرون عشّاق.', 'First night only: pick two people to fall in love.'],
};

type Props = GameViewProps<View>;
type P = View['players'][number];

/** Seconds left on the clock, or the frozen amount when paused. */
function useLeft(deadline: number | null, paused: { left: number } | null, now: () => number) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (paused) return setLeft(Math.ceil(paused.left / 1000));
    if (deadline === null) return setLeft(null);
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [deadline, paused, now]);
  return left;
}

/** A role card: the friend's own photo inside the role frame, or one of the group's custom role pictures. */
export function RoleCard({
  role,
  name,
  portrait,
  art,
  back,
  flipped,
  onFlip,
  fx,
}: {
  role: MafiaRole | null;
  name: string;
  portrait: AssetRef | null;
  art: AssetRef | null;
  back: AssetRef | null;
  flipped: boolean;
  onFlip?(): void;
  fx?: 'slain' | 'love' | 'poison' | 'shot';
}) {
  const { pick } = useI18n();
  const info = role ? ROLES[role] : null;
  return (
    <button type="button" className={`role-card${flipped ? ' is-flipped' : ''}${fx ? ` fx-${fx}` : ''}`} data-role={role ?? undefined} onClick={onFlip} disabled={!onFlip}>
      <span className="role-card__inner">
        <span className="role-card__back">{back ? <MediaImage asset={back} alt="" sizes="300px" eager /> : <span className="role-card__pattern" />}</span>
        <span className="role-card__face">
          <span className={art ? 'role-card__art' : 'role-card__photo'}>
            {art ? (
              <MediaImage asset={art} alt="" sizes="300px" eager />
            ) : portrait ? (
              <MediaImage asset={portrait} alt="" sizes="300px" eager />
            ) : (
              <span className="role-card__initial">{[...name][0]}</span>
            )}
          </span>
          <span className="role-card__label">
            <span className="role-card__name">{info ? pick(info.name) : '?'}</span>
            <span className="role-card__who">{name}</span>
          </span>
        </span>
      </span>
      {fx && <FxOverlay kind={fx} />}
    </button>
  );
}

/** Drawn on top of a card when someone dies: claw slashes, a broken heart, poison, a bullet hole. */
function FxOverlay({ kind }: { kind: 'slain' | 'love' | 'poison' | 'shot' }) {
  if (kind === 'love')
    return (
      <span className="card-fx card-fx--love" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <path className="heart-l" d="M50 85 L15 50 A18 18 0 0 1 50 25 L44 45 L54 55 L46 70 Z" />
          <path className="heart-r" d="M50 85 L85 50 A18 18 0 0 0 50 25 L44 45 L54 55 L46 70 Z" />
        </svg>
      </span>
    );
  if (kind === 'shot')
    return (
      <span className="card-fx card-fx--shot" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="40" r="6" />
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1="50" y1="40" x2={50 + Math.cos((i * Math.PI) / 4) * 20} y2={40 + Math.sin((i * Math.PI) / 4) * 20} />
          ))}
        </svg>
      </span>
    );
  return (
    <span className={`card-fx card-fx--${kind}`} aria-hidden="true">
      <svg viewBox="0 0 100 140" preserveAspectRatio="none">
        <path d="M20 10 L70 120" />
        <path d="M35 5 L85 115" />
        <path d="M50 2 L95 100" />
      </svg>
    </span>
  );
}

type CurtainKind = 'night' | 'dawn' | 'discuss' | 'vote' | 'verdict';

/** A full-screen interstitial between phases, so nobody misses that the game moved on. */
function Curtain({ kind, round, onDone }: { kind: CurtainKind; round: number; onDone(): void }) {
  const { tr, num } = useI18n();
  useEffect(() => {
    play(kind === 'night' ? 'dusk' : kind === 'dawn' ? 'dawn' : kind === 'verdict' ? 'gavel' : 'reveal');
    const id = setTimeout(onDone, kind === 'night' || kind === 'dawn' ? 3600 : 2600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const title = { night: T.c_night, dawn: T.c_dawn, discuss: T.c_discuss, vote: T.c_vote, verdict: T.c_verdict }[kind];
  const sub = { night: T.c_nightSub, dawn: T.c_dawnSub, discuss: T.c_discussSub, vote: T.c_voteSub, verdict: T.c_verdictSub }[kind];
  return (
    <div className={`curtain curtain--${kind}`} role="status" onClick={onDone}>
      <div className="curtain__body">
        {kind === 'night' || kind === 'dawn' ? <Eye closing={kind === 'night'} /> : <PhaseIcon kind={kind} />}
        {(kind === 'night' || kind === 'dawn') && <p className="curtain__kicker">{tr(kind === 'night' ? T.nightN : T.dayN, { n: num(round) })}</p>}
        <h2 className="curtain__title">{tr(title)}</h2>
        <p className="curtain__sub">{tr(sub)}</p>
        <p className="curtain__tap">{tr(T.tapSkip)}</p>
      </div>
    </div>
  );
}

/** An eye that closes (night) or opens (morning). */
function Eye({ closing }: { closing: boolean }) {
  return (
    <svg className={`eye ${closing ? 'eye--closing' : 'eye--opening'}`} viewBox="0 0 120 70" aria-hidden="true">
      <defs>
        <clipPath id="eye-shape">
          <path d="M5 35 Q60 -12 115 35 Q60 82 5 35 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#eye-shape)">
        <rect width="120" height="70" className="eye__white" />
        <circle cx="60" cy="35" r="17" className="eye__iris" />
        <circle cx="60" cy="35" r="7" className="eye__pupil" />
        <circle cx="66" cy="29" r="3" className="eye__glint" />
        <rect className="eye__lid" x="0" y="-70" width="120" height="70" />
      </g>
      <path d="M5 35 Q60 -12 115 35 Q60 82 5 35 Z" className="eye__outline" />
      <g className="eye__lashes">
        {[20, 38, 60, 82, 100].map((x, i) => (
          <line key={x} x1={x} y1={i === 2 ? 58 : 54 - Math.abs(2 - i) * 4} x2={x + (i - 2) * 3} y2={i === 2 ? 68 : 64 - Math.abs(2 - i) * 4} />
        ))}
      </g>
    </svg>
  );
}

function PhaseIcon({ kind }: { kind: 'discuss' | 'vote' | 'verdict' }) {
  if (kind === 'discuss')
    return (
      <svg className="phase-icon phase-icon--talk" viewBox="0 0 100 80" aria-hidden="true">
        <path d="M8 10h50a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6H28l-12 10v-10H8a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6z" />
        <path className="b2" d="M44 30h48a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6h-6v10l-12-10H44a6 6 0 0 1-6-6V36a6 6 0 0 1 6-6z" />
      </svg>
    );
  if (kind === 'vote')
    return (
      <svg className="phase-icon phase-icon--vote" viewBox="0 0 100 100" aria-hidden="true">
        <rect x="15" y="50" width="70" height="40" rx="6" />
        <rect className="slip" x="32" y="10" width="36" height="46" rx="3" />
        <rect x="25" y="48" width="50" height="6" rx="3" className="slot" />
      </svg>
    );
  return (
    <svg className="phase-icon phase-icon--gavel" viewBox="0 0 100 100" aria-hidden="true">
      <g className="head">
        <rect x="20" y="15" width="44" height="22" rx="5" transform="rotate(-35 42 26)" />
        <rect x="40" y="30" width="8" height="50" rx="4" transform="rotate(-35 44 55)" />
      </g>
      <rect x="45" y="82" width="45" height="9" rx="3" />
    </svg>
  );
}

const curtainFor = (v: View): CurtainKind | null =>
  v.phase === 'night' ? 'night' : v.phase === 'dawn' ? 'dawn' : v.phase === 'discuss' ? 'discuss' : v.phase === 'day' ? 'vote' : v.phase === 'verdict' ? 'verdict' : null;

function Mafia({ view: v, send, screen, now }: Props) {
  const { tr, pick, num } = useI18n();
  const left = useLeft(v.deadline, v.paused, now);
  const me = v.me;
  const mine = me ? v.players.find((p) => p.id === me.id) : undefined;
  const [flipped, setFlipped] = useState(false);
  const [decoy, setDecoy] = useState<string | null>(null);
  const [lovers, setLovers] = useState<string[]>([]);
  const [poison, setPoison] = useState<string | null>(null);
  const [heal, setHeal] = useState(false);
  const quiet = (a: Record<string, unknown>) => void send(a).catch(() => {});
  const name = (id: string | null | undefined) => v.players.find((p) => p.id === id)?.name ?? '';
  const isNight = v.phase === 'night' || v.phase === 'reveal';

  // Show a curtain each time the story moves to a new phase (not on first load mid-phase).
  const stage = `${v.phase}:${v.round}`;
  const seen = useRef(stage);
  const [curtain, setCurtain] = useState<CurtainKind | null>(null);
  useEffect(() => {
    if (seen.current === stage) return;
    seen.current = stage;
    setCurtain(curtainFor(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    preload(
      [...v.players.flatMap((p) => [p.portrait, p.art].filter((a): a is AssetRef => !!a)), ...(v.art.back ? [v.art.back] : [])],
      640,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setDecoy(null);
    setLovers([]);
    setPoison(null);
    setHeal(false);
  }, [v.round, v.phase]);

  const steps: { id: string; label: readonly [string, string] }[] = [
    { id: 'night', label: T.s_night },
    { id: 'dawn', label: T.s_dawn },
    { id: 'discuss', label: T.s_discuss },
    { id: 'day', label: T.s_vote },
    { id: 'verdict', label: T.s_verdict },
  ];
  const header = (
    <header className="mafia__head">
      <div className="mafia__head-row">
        <p className="mafia__phase">
          {v.phase === 'reveal' ? tr(T.yourCard) : isNight ? tr(T.nightN, { n: num(v.round) }) : v.phase === 'over' ? '' : tr(T.dayN, { n: num(v.round) })}
        </p>
        <p className="mafia__alive">{tr(T.aliveCount, { n: num(v.players.filter((p) => p.alive).length) })}</p>
        {left !== null && (
          <span className={`mafia__timer${left <= 10 && !v.paused ? ' is-urgent' : ''}${v.paused ? ' is-paused' : ''}`}>
            {v.paused ? `⏸ ${tr(T.paused)} · ` : ''}
            {tr(T.timer, { s: num(left) })}
          </span>
        )}
      </div>
      {v.phase !== 'reveal' && v.phase !== 'over' && (
        <ol className="mafia__steps" aria-label="">
          {steps.map((s) => (
            <li key={s.id} className={s.id === v.phase ? 'is-now' : ''}>
              {tr(s.label)}
            </li>
          ))}
        </ol>
      )}
    </header>
  );

  const hunterOwes = !!v.hunter && v.hunter.shot === null;
  const announcing = v.phase === 'dawn' || v.phase === 'verdict';
  const controls = v.controller && !screen && v.phase !== 'over' && v.phase !== 'reveal' && (
    <div className="mafia__controls" role="group" aria-label={tr(T.hostBar)}>
      <span className="mafia__controls-label">{tr(T.hostBar)}</span>
      {v.deadline !== null && !v.paused && (
        <button type="button" className="button button--ghost" onClick={() => quiet({ type: 'PAUSE' })}>
          ⏸ {tr(T.pause)}
        </button>
      )}
      {v.paused && (
        <button type="button" className="button button--primary" onClick={() => quiet({ type: 'RESUME' })}>
          ▶ {tr(T.resume)}
        </button>
      )}
      {(v.deadline !== null || v.paused) && (
        <button type="button" className="button button--ghost" onClick={() => quiet({ type: 'EXTEND' })}>
          {tr(T.extend)}
        </button>
      )}
      {announcing && !hunterOwes && (
        <button type="button" className="button button--primary" onClick={() => quiet({ type: 'CONTINUE' })}>
          {tr(T.continue)}
        </button>
      )}
      {v.phase === 'night' && (
        <button type="button" className="button button--ghost" onClick={() => quiet({ type: 'CLOSE' })}>
          {tr(T.closeNight)}
        </button>
      )}
      {v.phase === 'discuss' && (
        <button type="button" className="button button--primary" onClick={() => quiet({ type: 'OPEN_VOTE' })}>
          🗳 {tr(T.openVote)}
        </button>
      )}
      {v.phase === 'day' && (
        <button type="button" className="button button--ghost" onClick={() => quiet({ type: 'CLOSE' })}>
          {tr(T.closeVote)}
        </button>
      )}
    </div>
  );

  // Without a narrator, announcements move on by themselves; say so.
  const autoNote =
    announcing && !v.narratorId && !hunterOwes && left !== null && !v.paused ? <p className="faint">{tr(T.autoNext, { s: num(left) })}</p> : null;

  const hunterBlock = hunterOwes ? (
    v.hunter!.id === me?.id ? (
      <div className="mafia__hunter">
        <p className="mafia__big">🎯 {tr(T.hunterYou)}</p>
        <Grid players={v.players.filter((p) => p.alive)} onPick={(id) => quiet({ type: 'SHOOT', target: id })} />
      </div>
    ) : (
      <p className="mafia__big mafia__pulse">{tr(T.hunterWait, { name: name(v.hunter!.id) })}</p>
    )
  ) : null;

  const deathCause = (id: string) => v.deaths.find((d) => d.id === id)?.cause;
  const fxFor = (id: string): 'slain' | 'love' | 'poison' | 'shot' => {
    const c = deathCause(id);
    return c === 'love' ? 'love' : c === 'poison' ? 'poison' : c === 'shot' ? 'shot' : 'slain';
  };
  const deathCard = (p: P, i: number) => {
    const c = deathCause(p.id);
    const cause = c === 'love' ? T.cause_love : c === 'poison' ? T.cause_poison : c === 'shot' ? T.cause_shot : null;
    return (
      <div key={p.id} className="mafia__death" style={{ '--i': i } as React.CSSProperties}>
        <RoleCard role={p.role as MafiaRole | null} name={p.name} portrait={p.portrait} art={p.art} back={v.art.back} flipped={!!p.role} fx={fxFor(p.id)} />
        {cause && <p className="mafia__cause">{tr(cause)}</p>}
        {p.role && <p className="muted">{tr(T.wasRole, { role: pick(ROLES[p.role as MafiaRole].name) })}</p>}
      </div>
    );
  };

  // Sound for the morning's news, once the curtain is gone.
  const news = v.phase === 'dawn' ? (v.dawn?.killed.length ? 'strike' : v.dawn?.blocked ? 'shield' : null) : v.phase === 'verdict' && v.verdict?.eliminated ? 'strike' : null;
  useEffect(() => {
    if (!curtain && news) play(news);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curtain, stage]);

  let body: React.ReactNode = null;

  if (v.phase === 'over') {
    body = (
      <section className="mafia__end">
        <h1 className={`mafia__winner mafia__winner--${v.winner}`}>{v.winner === 'mafia' ? tr(T.mafiaWin) : tr(T.townWin)}</h1>
        <ul className="mafia__reveal-all" role="list">
          {v.players.map((p, i) => (
            <li key={p.id} style={{ '--i': i } as React.CSSProperties} className={p.alive ? '' : 'is-dead'}>
              <RoleCard role={p.role as MafiaRole} name={p.name} portrait={p.portrait} art={p.art} back={v.art.back} flipped />
            </li>
          ))}
        </ul>
      </section>
    );
  } else if (v.phase === 'reveal') {
    const readyCount = v.players.filter((p) => p.ready).length;
    body =
      screen || !me ? (
        <section className="mafia__center">
          <p className="mafia__big">{tr(T.waitingOthers, { n: num(readyCount), total: num(v.players.length) })}</p>
          <Grid players={v.players} showReady />
        </section>
      ) : (
        <section className="mafia__center">
          <RoleCard
            role={me.role as MafiaRole}
            name={mine?.name ?? ''}
            portrait={mine?.portrait ?? null}
            art={mine?.art ?? null}
            back={v.art.back}
            flipped={flipped}
            onFlip={() => {
              play('flip');
              setFlipped((f) => !f);
            }}
          />
          <p className="mafia__blurb">{flipped ? pick(ROLES[me.role as MafiaRole].blurb) : tr(T.tapToFlip)}</p>
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
    const n = v.night!;
    const witchStep = n.step === 'witch';
    const action =
      witchStep ? null : role === 'mafia' ? 'KILL' : role === 'doctor' ? 'SAVE' : role === 'detective' ? 'CHECK' : role === 'cupid' && n.cupidOwes ? 'CUPID' : null;
    const myChoice = role === 'mafia' ? n.mafiaVotes[me!.id] : role === 'doctor' ? n.mySave : role === 'detective' ? n.myCheck : decoy;
    const targets = v.players.filter((p) => p.alive && !(role === 'mafia' && p.role === 'mafia') && !(role === 'detective' && p.id === me?.id));
    const help = role && NIGHT_HELP[role] && !(role === 'cupid' && !n.cupidOwes) ? NIGHT_HELP[role] : null;

    if (screen || !me || !me.alive || v.narrator) {
      body = (
        <section className="mafia__center">
          <Eye closing />
          <p className="mafia__big">{tr(T.citySleeps)}</p>
          {witchStep && <p className="faint mafia__pulse">{tr(T.witchWait)}</p>}
          {v.narrator && <NarratorNight v={v} name={name} />}
          {!screen && me && !me.alive && <p className="faint">{tr(T.dead)}</p>}
        </section>
      );
    } else if (witchStep && role === 'witch') {
      const potions = v.potions!;
      body = (
        <section className="mafia__pick">
          <p className="mafia__big">🧪 {tr(T.witchTitle)}</p>
          <p className="mafia__chosen">{n.victim ? tr(T.witchVictim, { name: name(n.victim) }) : tr(T.witchNoVictim)}</p>
          <label className={`mafia__potion${potions.heal && n.victim ? '' : ' is-used'}`}>
            <input type="checkbox" checked={heal} disabled={!potions.heal || !n.victim} onChange={(e) => setHeal(e.target.checked)} />
            💚 {tr(T.healPotion)} {!potions.heal && tr(T.used)}
          </label>
          <p className={`mafia__potion-title${potions.poison ? '' : ' is-used'}`}>
            ☠️ {tr(T.poisonPotion)} {!potions.poison && tr(T.used)}
          </p>
          {potions.poison && (
            <Grid
              players={v.players.filter((p) => p.alive && p.id !== me.id)}
              selected={poison}
              onPick={(id) => setPoison((cur) => (cur === id ? null : id))}
            />
          )}
          <button type="button" className="button button--primary button--big" onClick={() => quiet({ type: 'WITCH', heal, poison })}>
            {tr(T.done)}
          </button>
        </section>
      );
    } else if (witchStep) {
      body = (
        <section className="mafia__center">
          <Eye closing />
          <p className="mafia__big">{tr(T.citySleeps)}</p>
          <p className="faint mafia__pulse">{tr(T.witchWait)}</p>
        </section>
      );
    } else if (action === 'CUPID') {
      body = (
        <section className="mafia__pick">
          <p className="mafia__big">💘 {tr(T.pickLovers, { n: num(lovers.length) })}</p>
          {help && <p className="mafia__help">{tr(help)}</p>}
          <Grid
            players={v.players.filter((p) => p.alive)}
            multi={lovers}
            onPick={(id) => {
              const next = lovers.includes(id) ? lovers.filter((x) => x !== id) : [...lovers, id].slice(-2);
              setLovers(next);
              if (next.length === 2) quiet({ type: 'CUPID', targets: next });
            }}
          />
        </section>
      );
    } else {
      body = (
        <section className="mafia__pick">
          <p className="mafia__big">{action === 'KILL' ? tr(T.pickKill) : action === 'SAVE' ? tr(T.pickSave) : action === 'CHECK' ? tr(T.pickCheck) : tr(T.decoy)}</p>
          {help && <p className="mafia__help">{tr(help)}</p>}
          {myChoice && <p className="mafia__chosen">{action ? `${tr(T.chosen, { name: name(myChoice) })} · ${tr(T.waitAction)}` : tr(T.decoyDone)}</p>}
          {role === 'cupid' && v.lovers && <p className="mafia__chosen">{tr(T.loversSet)}</p>}
          <Grid
            players={targets}
            selected={myChoice ?? null}
            disabledId={role === 'doctor' ? n.lastSave ?? null : null}
            marks={role === 'mafia' ? n.mafiaVotes : undefined}
            markName={name}
            onPick={(id) => (action ? quiet({ type: action, target: id }) : setDecoy(id))}
          />
          {role === 'mafia' && <Partners v={v} />}
          {role === 'detective' && <Checks v={v} name={name} />}
          {role === 'witch' && v.potions && (
            <p className="faint">{tr(T.potions, { heal: v.potions.heal ? '✓' : '✗', poison: v.potions.poison ? '✓' : '✗' })}</p>
          )}
        </section>
      );
    }
  } else if (v.phase === 'dawn') {
    const victims = (v.dawn?.killed ?? []).map((id) => v.players.find((p) => p.id === id)!).filter(Boolean);
    body = (
      <section className="mafia__center mafia__announce">
        {victims.length ? (
          <>
            <p className="mafia__big">{tr(T.dawnKilled, { name: victims.map((p) => p.name).join(' + ') })}</p>
            <div className="mafia__deaths">
              {victims.map(deathCard)}
            </div>
          </>
        ) : v.dawn?.blocked ? (
          <>
            <Shield />
            <p className="mafia__big">{tr(T.dawnBlocked)}</p>
          </>
        ) : (
          <>
            <Sun />
            <p className="mafia__big">{tr(T.dawnNone)}</p>
          </>
        )}
        {hunterBlock}
        {autoNote}
        {!v.controller && !screen && v.narratorId && !hunterOwes && <p className="faint">{tr(T.waitingFor)}</p>}
        {me?.role === 'detective' && me.alive && <Checks v={v} name={name} />}
      </section>
    );
  } else if (v.phase === 'discuss') {
    body = (
      <section className="mafia__pick">
        <PhaseIcon kind="discuss" />
        <p className="mafia__big">{tr(T.discussTitle)}</p>
        <p className="mafia__help">🔒 {tr(T.discussLocked)}</p>
        {!v.deadline && !v.paused && <p className="faint">{tr(T.discussHost)}</p>}
        <Grid players={v.players.filter((p) => p.alive)} />
        {me && !me.alive && !screen && <p className="faint">{tr(T.dead)}</p>}
      </section>
    );
  } else if (v.phase === 'day' || v.phase === 'verdict') {
    const counts: Record<string, number> = {};
    for (const [voter, target] of Object.entries(v.votes))
      if (voter !== v.idiot && v.players.some((p) => p.id === voter && p.alive)) counts[target] = (counts[target] ?? 0) + 1;
    const out = v.players.find((p) => p.id === v.verdict?.eliminated);
    const spared = v.players.find((p) => p.id === v.verdict?.spared);
    const extra = (v.verdict?.fallen ?? []).filter((id) => id !== out?.id).map((id) => v.players.find((p) => p.id === id)!).filter(Boolean);
    const canVote = v.phase === 'day' && !screen && !!me?.alive && !v.narrator && me.id !== v.idiot;
    body = (
      <section className="mafia__pick">
        {v.phase === 'verdict' ? (
          <div className="mafia__center mafia__announce">
            {out ? (
              <>
                <p className="mafia__big">{tr(T.votedOut, { name: out.name })}</p>
                <div className="mafia__deaths">
                  {deathCard(out, 0)}
                  {extra.map((p, i) => deathCard(p, i + 1))}
                </div>
              </>
            ) : spared ? (
              <>
                <RoleCard role={spared.role as MafiaRole | null} name={spared.name} portrait={spared.portrait} art={spared.art} back={v.art.back} flipped />
                <p className="mafia__big">{tr(T.spared, { name: spared.name })}</p>
              </>
            ) : (
              <p className="mafia__big">{tr(T.noOne)}</p>
            )}
            {hunterBlock}
            {autoNote}
          </div>
        ) : (
          <>
            <p className="mafia__big">🗳 {tr(T.vote)}</p>
            <p className="faint">{tr(T.needed, { n: num(v.needed) })}</p>
            {me?.id === v.idiot && <p className="faint">{tr(T.noVote)}</p>}
          </>
        )}
        {v.phase === 'day' && (
          <>
            <Grid
              players={v.players.filter((p) => p.alive)}
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
          </>
        )}
        {me && !me.alive && !screen && <p className="faint">{tr(T.dead)}</p>}
      </section>
    );
  }

  const loveNote =
    me && v.lovers?.includes(me.id) && v.phase !== 'over' ? (
      <p className="notice notice--love">{tr(T.yourLove, { name: name(v.lovers.find((l) => l !== me.id)) })}</p>
    ) : (v.narrator || me?.role === 'cupid') && v.lovers && v.phase !== 'over' ? (
      <p className="notice notice--love">
        💘 {tr(T.lovers)}: {v.lovers.map(name).join(' + ')}
      </p>
    ) : null;

  return (
    <div className={`mafia mafia--${isNight ? 'night' : 'day'}${screen ? ' mafia--screen' : ''}`}>
      {header}
      {v.narrator && !screen && <p className="notice">{tr(T.narrator)}</p>}
      {loveNote}
      {/* The phase's content arrives once its curtain lifts, so its animations play in view. */}
      {!curtain && seen.current === stage && (
        <div key={stage} className="mafia__stage">
          {body}
        </div>
      )}
      {controls}
      {v.deaths.length > 0 && v.phase !== 'over' && <Graveyard v={v} />}
      {curtain && <Curtain key={`curtain:${stage}`} kind={curtain} round={v.round} onDone={() => setCurtain(null)} />}
    </div>
  );
}

function Grid({
  players,
  selected = null,
  multi,
  onPick,
  disabledId = null,
  counts,
  marks,
  markName,
  showReady,
}: {
  players: P[];
  selected?: string | null;
  multi?: string[];
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
              aria-pressed={selected === p.id || !!multi?.includes(p.id)}
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
      {n.victim && (
        <li>
          {pick(ROLES.witch.name)} ← {name(n.victim)}
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

/** The protection animation: a shield slams in and a ring of light pulses out. */
function Shield() {
  return (
    <span className="mafia__shield" aria-hidden="true">
      <span className="mafia__shield-ring" />
      <svg viewBox="0 0 100 110">
        <path d="M50 6 L90 20 V52 C90 78 72 96 50 104 C28 96 10 78 10 52 V20 Z" />
        <path className="cross" d="M44 34h12v14h14v12H56v14H44V60H30V48h14z" />
      </svg>
    </span>
  );
}

export const client: GameClient<View> = { Player: Mafia, errors, seatErrors };
