import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { GameClient, GameViewProps } from '../client-types';
import type { Dict } from '../../platform/i18n/strings';
import { useI18n } from '../../platform/i18n/I18n';
import { MediaImage, preload } from '../../platform/ui/Media';
import type { CellView, LogEntry, Team, View } from './index';
import './passnames.css';

const T = {
  blue: ['الأزرق', 'Blue'],
  red: ['الأحمر', 'Red'],
  yourTurn: ['دوركم!', 'Your turn!'],
  theirTurn: ['دور الفريق {team}', "{team} team's turn"],
  spyThinking: ['الجاسوس يفكّر بتلميح…', 'Spymaster is thinking…'],
  clue: ['التلميح', 'Clue'],
  clueWord: ['كلمة أو كلمتين', 'One or two words'],
  count: ['العدد', 'Count'],
  unlimited: ['∞', '∞'],
  give: ['أرسل التلميح', 'Give clue'],
  guessesLeft: ['باقي {n} تخمين', '{n} guesses left'],
  guessesFree: ['تخمين مفتوح', 'Unlimited guesses'],
  endTurn: ['خلّصنا', 'End turn'],
  reveal: ['اكشف', 'Reveal'],
  markHint: ['اضغط على البطاقة عشان تأشّر عليها. أي بطاقة أشّر عليها زميلك تقدر تكشفها.', 'Tap a card to mark it. Any card a teammate marked can be revealed.'],
  spyHint: ['أنت الجاسوس: الألوان ظاهرة لك بس.', 'You are the spymaster: only you see the colours.'],
  watchHint: ['تتفرّج على اللعبة.', 'You are watching.'],
  win: ['فاز الفريق {team}!', '{team} team wins!'],
  backToLobby: ['رجوع للوبي', 'Back to lobby'],
  begin: ['ابدأ الأدوار', 'Begin turns'],
  dealWait: ['ننتظر سحب البطاقات…', 'Waiting for the opening draws…'],
  draw: ['اسحب بطاقة', 'Draw a card'],
  pause: ['إيقاف مؤقت', 'Pause'],
  resume: ['كمّل', 'Resume'],
  paused: ['اللعبة موقّفة', 'Game paused'],
  hand: ['بطاقات الأكشن', 'Action cards'],
  useScan: ['اختر بطاقة تفحصها', 'Pick a card to scan'],
  useSwap: ['اختر بطاقتين تبدّل كلماتهم', 'Pick two cards to swap'],
  cancel: ['إلغاء', 'Cancel'],
  secondPrompt: ['طلعت محايدة. تستخدمون فرصة ثانية؟', 'Neutral card. Use a Second Chance?'],
  useSecond: ['إيه، فرصة ثانية', 'Yes, Second Chance'],
  decline: ['لا، خلّصنا', 'No, end turn'],
  log: ['السجل', 'Log'],
  scanResult: ['فحص: {cell} {result}', 'Scan: {cell} {result}'],
  isBlack: ['سوداء ☠', 'is the black card ☠'],
  notBlack: ['مو سوداء ✓', 'is safe ✓'],
  picture: ['صورة {n}', 'Photo {n}'],
  score: ['{score} من {target}', '{score} of {target}'],
  card_second: ['فرصة ثانية', 'Second Chance'],
  card_scan: ['فحص', 'Scan'],
  card_swap: ['تبديل', 'Swap'],
  card_luck: ['حظ أوفر', 'Hard Luck'],
  notYet: ['من الدور الجاي', 'From next turn'],
} as const satisfies Dict;

const LOG: Dict = {
  start: ['بدأت المباراة. يبدأ {team}.', 'Game on. {team} starts.'],
  startExpanded: ['مباراة موسّعة. يبدأ الأزرق.', 'Expanded game. Blue starts.'],
  photosShort: ['صور الشلة ما كفّت ({have})، كمّلنا بكلمات.', 'Not enough group photos ({have}); topped up with words.'],
  turn: ['دور {team}.', "{team}'s turn."],
  clue: ['التلميح: «{text}» · {count}', 'Clue: “{text}” · {count}'],
  guess: ['{name} كشف {cell}.', '{name} revealed {cell}.'],
  endTurn: ['أنهى الفريق دوره.', 'Team ended its turn.'],
  opponentWord: ['كشفوا بطاقة للخصم.', 'Revealed an opponent card.'],
  neutralWord: ['بطاقة محايدة؛ انتهى الدور.', 'Neutral card; turn over.'],
  guessesUsed: ['خلصت التخمينات.', 'Out of guesses.'],
  timeout: ['خلص الوقت.', 'Time ran out.'],
  secondTimeout: ['خلص وقت قرار الفرصة الثانية.', 'Second Chance decision timed out.'],
  winTarget: ['اكتمل الهدف. فاز {team}!', 'Target reached. {team} wins!'],
  winBlack: ['كُشفت البطاقة السوداء! فاز {team}.', 'The black card! {team} wins.'],
  streakBreak: ['هذا التلميح يقطع سلسلة الإنجاز.', 'This clue breaks the streak.'],
  draw: ['سحبتوا بطاقة: {card}', 'You drew: {card}'],
  drawLuck: ['سحبتوا: حظ أوفر.', 'You drew Hard Luck.'],
  drawEmpty: ['ما فيه بطاقات للسحب.', 'No cards left to draw.'],
  drawEarned: ['كسبتوا سحبة. الجاسوس يسحبها قبل دوركم الجاي.', 'Draw earned. The spymaster draws before your next turn.'],
  drawExpired: ['راحت السحبة لأنها ما انسحبت.', 'Unused draw expired.'],
  useCard: ['استخدمتوا بطاقة {card}.', 'Used {card}.'],
  scan: ['فحص {cell}: {result}', 'Scanned {cell}: {result}'],
  swap: ['تبدّلت {a} و {b}. الألوان مكانها.', 'Swapped {a} and {b}. Colours stayed put.'],
  secondPrompt: ['قرار الفرصة الثانية…', 'Second Chance decision…'],
  secondUsed: ['استُخدمت فرصة ثانية.', 'Second Chance used.'],
  secondDeclined: ['ما استخدموا الفرصة الثانية.', 'Second Chance declined.'],
  paused: ['أوقف المشرف اللعبة.', 'The admin paused.'],
  resumed: ['رجعت اللعبة.', 'Game resumed.'],
};

const errors: Dict = {
  CLUE_ON_BOARD: ['التلميح يطابق كلمة على اللوحة.', 'That clue matches a word on the board.'],
  CLUE_INVALID: ['التلميح كلمة أو كلمتين، حروف بس.', 'Clues are one or two words, letters only.'],
  CLUE_COUNT_INVALID: ['العدد ما يصلح.', 'That count is not allowed.'],
  SUSPECT_FIRST: ['لازم واحد من فريقك يأشّر عليها أول.', 'A teammate has to mark it first.'],
  NOT_YOUR_TURN: ['انتظر دور فريقك.', 'Wait for your team’s turn.'],
  GUESS_ONCE_FIRST: ['خمّنوا مرة وحدة على الأقل.', 'Make at least one guess first.'],
  NO_GUESSES_LEFT: ['خلصت التخمينات.', 'No guesses left.'],
  WAIT_FOR_CLUE: ['انتظروا التلميح.', 'Wait for the clue.'],
  PAUSED: ['اللعبة موقّفة.', 'The game is paused.'],
  CARD_UNAVAILABLE: ['البطاقة مو متاحة الحين.', 'That card is not available now.'],
  NO_ACTION_FIRST_TURN: ['ما فيه أكشن في أول دور.', 'No actions on your first turn.'],
  ONE_ACTION_PER_TURN: ['أكشن واحد بس كل دور.', 'One action per turn.'],
  SCAN_BEFORE_GUESS: ['الفحص قبل أول تخمين بس.', 'Scan only before the first guess.'],
  SWAP_BEFORE_CLUE: ['التبديل قبل التلميح بس.', 'Swap only before the clue.'],
  DRAW_FIRST: ['لازم الجاسوسين يسحبون أول.', 'Both spymasters must draw first.'],
};

const seatErrors: Dict = {
  NEED_FOUR: ['تحتاجون ٤ لاعبين على الأقل.', 'You need at least 4 players.'],
  TOO_MANY: ['الحد الأقصى ١٠ لاعبين.', 'At most 10 players.'],
  SPY_REQUIRED_BLUE: ['الأزرق يحتاج جاسوس واحد.', 'Blue needs one spymaster.'],
  SPY_REQUIRED_RED: ['الأحمر يحتاج جاسوس واحد.', 'Red needs one spymaster.'],
  AGENT_REQUIRED_BLUE: ['الأزرق يحتاج عميل واحد على الأقل.', 'Blue needs at least one agent.'],
  AGENT_REQUIRED_RED: ['الأحمر يحتاج عميل واحد على الأقل.', 'Red needs at least one agent.'],
};

type Props = GameViewProps<View>;
type Mode = null | 'scan' | 'swap';

const cellLabel = (c: CellView | undefined, tr: (p: readonly [string, string], v?: Record<string, string | number>) => string) =>
  c ? (c.word ? c.word.replace(/_/g, ' ') : tr(T.picture, { n: c.id + 1 })) : '?';

function useCountdown(deadline: number | null, now: () => number) {
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

function Passnames(props: Props) {
  const { view: v, send, screen, isAdmin } = props;
  const { tr, num } = useI18n();
  const [mode, setMode] = useState<Mode>(null);
  const [swapPick, setSwapPick] = useState<number[]>([]);
  const me = v.me;
  const myTurn = !!me && me.team === v.active;
  const isAgent = me?.role === 'agent';
  const isSpy = me?.role === 'spy';
  const left = useCountdown(v.deadline, props.now);

  useEffect(() => {
    preload(v.board.flatMap((c) => (c.picture ? [c.picture] : [])), 320);
    // Only on first mount: later boards share the same pictures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMode(null);
    setSwapPick([]);
  }, [v.turnNumber, v.phase]);

  const canMark = !screen && isAgent && !v.paused && ['clue', 'guess'].includes(v.phase);
  const canReveal = canMark && myTurn && v.phase === 'guess';

  function onCell(c: CellView) {
    if (c.revealed || screen) return;
    if (mode === 'scan') {
      void send({ type: 'SCAN', cell: c.id }).finally(() => setMode(null));
      return;
    }
    if (mode === 'swap') {
      const next = swapPick.includes(c.id) ? swapPick.filter((x) => x !== c.id) : [...swapPick, c.id];
      if (next.length === 2) {
        void send({ type: 'SWAP', cells: next }).finally(() => {
          setMode(null);
          setSwapPick([]);
        });
      } else setSwapPick(next);
      return;
    }
    if (canMark) void send({ type: 'MARK', cell: c.id }).catch(() => {});
  }

  const teamName = (t: Team) => tr(T[t]);
  const guessesLeft = v.clue ? (v.clue.count === 'unlimited' ? null : Number(v.clue.count) + 1 - v.guesses) : null;

  return (
    <div className={`pn pn--${v.size === 6 ? 'six' : 'five'}${screen ? ' pn--screen' : ''}`} data-active={v.active} data-phase={v.phase}>
      <Scoreboard v={v} left={left} teamName={teamName} />

      <div className="pn__status" aria-live="polite">
        {v.phase === 'finished' && v.winner ? (
          <p className={`pn__winner pn__winner--${v.winner}`}>{tr(T.win, { team: teamName(v.winner) })}</p>
        ) : v.paused ? (
          <p className="pn__banner">{tr(T.paused)}</p>
        ) : v.phase === 'deal' ? (
          <p className="pn__banner">{tr(T.dealWait)}</p>
        ) : v.clue ? (
          <p className="pn__clue">
            <span className="pn__clue-word">{v.clue.text}</span>
            <span className="pn__clue-count">{v.clue.count === 'unlimited' ? '∞' : num(Number(v.clue.count))}</span>
            <span className="pn__clue-left">{guessesLeft === null ? tr(T.guessesFree) : tr(T.guessesLeft, { n: num(Math.max(0, guessesLeft)) })}</span>
          </p>
        ) : (
          <p className="pn__banner">{myTurn ? (isSpy ? tr(T.yourTurn) : tr(T.spyThinking)) : tr(T.theirTurn, { team: teamName(v.active) })}</p>
        )}
      </div>

      {mode && (
        <p className="pn__mode">
          {mode === 'scan' ? tr(T.useScan) : tr(T.useSwap)}
          <button type="button" className="pill-button" onClick={() => (setMode(null), setSwapPick([]))}>
            {tr(T.cancel)}
          </button>
        </p>
      )}

      <div className="pn__board" role="grid" aria-rowcount={v.size}>
        {v.board.map((c, i) => (
          <Card
            key={c.id}
            c={c}
            index={i}
            spy={isSpy}
            selected={swapPick.includes(c.id)}
            interactive={!screen && !c.revealed && (canMark || mode !== null)}
            myMark={!!me && c.marks.some((m) => m.id === me.id)}
            canReveal={canReveal && !mode && c.marks.some((m) => v.players.some((p) => p.id === m.id && p.team === me!.team))}
            onClick={() => onCell(c)}
            onReveal={() => void send({ type: 'GUESS', cell: c.id }).catch(() => {})}
          />
        ))}
      </div>

      {!screen && (
        <Controls v={v} send={send} isAdmin={isAdmin} myTurn={myTurn} setMode={setMode} mode={mode} />
      )}

      {!screen && (
        <p className="pn__hint faint">{isSpy ? tr(T.spyHint) : isAgent ? tr(T.markHint) : tr(T.watchHint)}</p>
      )}

      <Log v={v} />
    </div>
  );
}

function Scoreboard({ v, left, teamName }: { v: View; left: number | null; teamName(t: Team): string }) {
  const { num } = useI18n();
  return (
    <div className="pn__scores">
      {(['blue', 'red'] as Team[]).map((team) => {
        const info = v.teams[team];
        return (
          <div key={team} className={`pn__score pn__score--${team}`} aria-current={v.active === team && v.phase !== 'finished' ? 'true' : undefined}>
            <span className="pn__score-name">{teamName(team)}</span>
            <span className="pn__score-num">
              <b>{num(info.target - info.score)}</b>
            </span>
            <span className="pn__score-bar" style={{ '--p': info.score / info.target } as React.CSSProperties} aria-hidden="true" />
          </div>
        );
      })}
      {left !== null && (
        <span className={`pn__timer${left <= 10 ? ' is-urgent' : ''}`} role="timer">
          {num(left)}
        </span>
      )}
    </div>
  );
}

function Card({
  c,
  index,
  spy,
  selected,
  interactive,
  myMark,
  canReveal,
  onClick,
  onReveal,
}: {
  c: CellView;
  index: number;
  spy: boolean;
  selected: boolean;
  interactive: boolean;
  myMark: boolean;
  canReveal: boolean;
  onClick(): void;
  onReveal(): void;
}) {
  const { tr } = useI18n();
  const label = cellLabel(c, tr);
  const keyColor = spy && !c.revealed ? c.color : null;
  return (
    <div
      className={`pn-card${c.revealed ? ' is-revealed' : ''}${selected ? ' is-selected' : ''}${myMark ? ' is-marked' : ''}${c.picture ? ' has-picture' : ''}`}
      data-color={c.revealed ? c.color : undefined}
      data-key={keyColor ?? undefined}
      style={{ '--i': index } as React.CSSProperties}
      role="gridcell"
    >
      <button type="button" className="pn-card__flip" onClick={onClick} disabled={!interactive} aria-label={label} aria-pressed={myMark}>
        <span className="pn-card__front">
          {c.picture ? <MediaImage asset={c.picture} alt="" sizes="(max-width: 600px) 20vw, 160px" className="pn-card__photo" /> : null}
          {c.word && <span className="pn-card__word">{c.word.replace(/_/g, ' ')}</span>}
        </span>
        <span className="pn-card__back" aria-hidden="true">
          {c.picture ? <MediaImage asset={c.picture} alt="" sizes="160px" className="pn-card__photo" /> : null}
          {c.word && <span className="pn-card__word">{c.word.replace(/_/g, ' ')}</span>}
          <span className="pn-card__stamp" />
        </span>
      </button>
      {c.marks.length > 0 && !c.revealed && (
        <span className="pn-card__marks" aria-label={c.marks.map((m) => m.name).join('، ')}>
          {c.marks.slice(0, 4).map((m) => (
            <span key={m.id} className="pn-card__mark">
              {[...m.name][0]}
            </span>
          ))}
        </span>
      )}
      {canReveal && !c.revealed && (
        <button type="button" className="pn-card__reveal" onClick={onReveal}>
          {tr(T.reveal)}
        </button>
      )}
    </div>
  );
}

function Controls({
  v,
  send,
  isAdmin,
  myTurn,
  mode,
  setMode,
}: {
  v: View;
  send: Props['send'];
  isAdmin: boolean;
  myTurn: boolean;
  mode: Mode;
  setMode(m: Mode): void;
}) {
  const { tr } = useI18n();
  const me = v.me;
  const quiet = (a: Record<string, unknown>) => void send(a).catch(() => {});

  return (
    <div className="pn__controls">
      {v.phase === 'finished' ? null : (
        <>
          {me?.role === 'spy' && myTurn && v.phase === 'clue' && !v.paused && <ClueForm v={v} send={send} />}

          {me?.role === 'agent' && myTurn && v.phase === 'guess' && !v.paused && (
            <button type="button" className="button button--quiet" disabled={v.guesses < 1} onClick={() => quiet({ type: 'END' })}>
              {tr(T.endTurn)}
            </button>
          )}

          {me?.role === 'agent' && myTurn && v.phase === 'second' && (
            <div className="pn__second">
              <p>{tr(T.secondPrompt)}</p>
              <button type="button" className="button button--primary" onClick={() => quiet({ type: 'SECOND' })}>
                {tr(T.useSecond)}
              </button>
              <button type="button" className="button button--ghost" onClick={() => quiet({ type: 'DECLINE' })}>
                {tr(T.decline)}
              </button>
            </div>
          )}

          {v.canDraw && (
            <button type="button" className="button button--primary" onClick={() => quiet({ type: 'DRAW' })}>
              {tr(T.draw)}
            </button>
          )}

          {v.hand.length > 0 && (
            <div className="pn__hand" aria-label={tr(T.hand)}>
              {v.hand.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={`pn-action pn-action--${card.type}`}
                  disabled={!card.available || card.type === 'second'}
                  aria-pressed={mode === card.type}
                  onClick={() => setMode(mode === card.type ? null : (card.type as Mode))}
                  title={card.available ? undefined : tr(T.notYet)}
                >
                  <span className="pn-action__name">{tr(T[`card_${card.type}`])}</span>
                </button>
              ))}
            </div>
          )}

          {isAdmin && v.phase === 'deal' && (
            <button type="button" className="button button--primary" disabled={!v.teams.blue.initialDrawn || !v.teams.red.initialDrawn} onClick={() => quiet({ type: 'BEGIN' })}>
              {tr(T.begin)}
            </button>
          )}
          {isAdmin && v.phase !== 'deal' && (
            <button type="button" className="pill-button pn__pause" onClick={() => quiet({ type: 'PAUSE' })}>
              {v.paused ? tr(T.resume) : tr(T.pause)}
            </button>
          )}
        </>
      )}
      {v.scans.length > 0 && <Scans v={v} />}
    </div>
  );
}

function ClueForm({ v, send }: { v: View; send: Props['send'] }) {
  const { tr, num } = useI18n();
  const id = useId();
  const [text, setText] = useState('');
  const [count, setCount] = useState<number | 'unlimited'>(1);
  const [busy, setBusy] = useState(false);
  const max = v.teams[v.active].target - v.teams[v.active].score;
  const min = v.settings.mode === 'expanded' ? 0 : 1;
  const counts = useMemo(() => Array.from({ length: Math.max(0, Math.min(max, 9) - min + 1) }, (_, i) => i + min), [max, min]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await send({ type: 'CLUE', text, count }).then(
      () => setText(''),
      () => {},
    );
    setBusy(false);
  }

  return (
    <form className="pn-clue" onSubmit={submit}>
      <label className="visually-hidden" htmlFor={id}>
        {tr(T.clue)}
      </label>
      <input id={id} className="input pn-clue__text" value={text} onChange={(e) => setText(e.target.value)} placeholder={tr(T.clueWord)} maxLength={40} autoComplete="off" autoFocus />
      <div className="pn-clue__counts" role="group" aria-label={tr(T.count)}>
        {counts.map((n) => (
          <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)}>
            {num(n)}
          </button>
        ))}
        {v.settings.mode === 'expanded' && (
          <button type="button" aria-pressed={count === 'unlimited'} onClick={() => setCount('unlimited')}>
            ∞
          </button>
        )}
      </div>
      <button className="button button--primary" disabled={busy || !text.trim()}>
        {tr(T.give)}
      </button>
    </form>
  );
}

function Scans({ v }: { v: View }) {
  const { tr } = useI18n();
  return (
    <ul className="pn__scans" role="list">
      {v.scans.map((s) => (
        <li key={`${s.turn}-${s.cell}`}>{tr(T.scanResult, { cell: cellLabel(v.board[s.cell], tr), result: tr(s.black ? T.isBlack : T.notBlack) })}</li>
      ))}
    </ul>
  );
}

function Log({ v }: { v: View }) {
  const { tr } = useI18n();
  const text = (e: Omit<LogEntry, 'visibility'>) => {
    const p = { ...e.params } as Record<string, string | number>;
    if (typeof p.team === 'string') p.team = tr(T[p.team as Team]);
    if (typeof p.card === 'string') p.card = tr(T[`card_${p.card}` as keyof typeof T]);
    for (const k of ['cell', 'a', 'b'] as const) if (typeof p[k] === 'number') p[k] = `«${cellLabel(v.board[p[k] as number], tr)}»`;
    if ('black' in p) p.result = tr(p.black ? T.isBlack : T.notBlack);
    if (p.count === 'unlimited') p.count = '∞';
    const pair = LOG[e.code];
    return pair ? tr(pair, p) : e.code;
  };
  const entries = [...v.log].reverse();
  return (
    <details className="pn__log">
      <summary>{tr(T.log)}</summary>
      <ol role="list">
        {entries.map((e) => (
          <li key={e.id} data-team={e.team}>
            {text(e)}
          </li>
        ))}
      </ol>
    </details>
  );
}

export const client: GameClient<View> = { Player: Passnames, errors, seatErrors };
