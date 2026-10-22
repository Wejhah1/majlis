import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { TopBar } from '../app/TopBar';
import { useGroup } from '../app/group';
import type { AssetRef, PuzzleTile } from '../games/types';
import { ROLE_ORDER, ROLES } from '../games/mafia/roles';
import { useI18n } from '../platform/i18n/I18n';
import { Avatar, MediaImage } from '../platform/ui/Media';
import { useToast } from '../platform/ui/Toast';
import { api, type AdminData, type ContentRow, type Status } from './api';
import { PhotoPicker, kb } from './PhotoPicker';
import { A } from './strings';
import './admin.css';

type Tab = 'group' | 'members' | 'passnames' | 'mafia' | 'kalak' | 'puzzle' | 'account';

export function AdminPage() {
  const { tr } = useI18n();
  const [status, setStatus] = useState<Status | null>(null);
  const refresh = useCallback(() => void api.status().then(setStatus, () => setStatus({ claimed: true, authed: false, envPassword: false })), []);
  useEffect(refresh, [refresh]);

  useEffect(() => {
    document.title = tr(A.title);
  }, [tr]);

  return (
    <div className="page">
      <TopBar />
      {!status ? null : !status.claimed ? (
        <PasswordGate title={tr(A.claimTitle)} text={tr(A.claimText)} action={tr(A.claim)} submit={api.claim} onDone={refresh} />
      ) : !status.authed ? (
        <PasswordGate title={tr(A.loginTitle)} action={tr(A.login)} submit={api.login} onDone={refresh} />
      ) : (
        <Dashboard status={status} onLogout={refresh} />
      )}
    </div>
  );
}

function PasswordGate({ title, text, action, submit, onDone }: { title: string; text?: string; action: string; submit(p: string): Promise<unknown>; onDone(): void }) {
  const { tr, errorText } = useI18n();
  const id = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="page__narrow">
      <h1 className="page__title">{title}</h1>
      {text && <p className="muted">{text}</p>}
      <form
        className="who"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await submit(password);
            onDone();
          } catch (err) {
            setError(errorText((err as Error).message));
          }
          setBusy(false);
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor={id}>
            {tr(A.password)}
          </label>
          <input id={id} className="input" type="password" autoComplete={text ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="button button--primary button--big" disabled={busy}>
          {action}
        </button>
      </form>
    </main>
  );
}

function Dashboard({ status, onLogout }: { status: Status; onLogout(): void }) {
  const { tr } = useI18n();
  const [tab, setTab] = useState<Tab>('members');
  const [data, setData] = useState<AdminData | null>(null);
  const load = useCallback(() => void api.data().then(setData), []);
  useEffect(load, [load]);

  const tabs: [Tab, readonly [string, string]][] = [
    ['members', A.tabMembers],
    ['group', A.tabGroup],
    ['passnames', A.tabPassnames],
    ['mafia', A.tabMafia],
    ['kalak', A.tabKalak],
    ['puzzle', A.tabPuzzle],
    ['account', A.tabAccount],
  ];

  return (
    <main className="admin">
      <nav className="admin__nav" aria-label={tr(A.title)}>
        <h1 className="admin__title">{tr(A.title)}</h1>
        <ul role="list">
          {tabs.map(([id, label]) => (
            <li key={id}>
              <button type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
                {tr(label)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="admin__body">
        {!data ? (
          <p className="muted spinner-dots">{tr(A.uploading).replace('…', '')}</p>
        ) : tab === 'group' ? (
          <GroupSection data={data} reload={load} />
        ) : tab === 'members' ? (
          <MembersSection data={data} reload={load} />
        ) : tab === 'passnames' ? (
          <PassnamesSection data={data} reload={load} />
        ) : tab === 'mafia' ? (
          <MafiaSection data={data} reload={load} />
        ) : tab === 'kalak' ? (
          <KalakSection data={data} reload={load} />
        ) : tab === 'puzzle' ? (
          <PuzzleSection data={data} reload={load} />
        ) : (
          <AccountSection status={status} onLogout={onLogout} />
        )}
      </div>
    </main>
  );
}

type SectionProps = { data: AdminData; reload(): void };

function Section({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return (
    <section className="admin-section">
      <header>
        <h2 className="admin-section__title">{title}</h2>
        {text && <p className="muted admin-section__text">{text}</p>}
      </header>
      {children}
    </section>
  );
}

function useSaved() {
  const toast = useToast();
  const { tr, errorText } = useI18n();
  return {
    ok: (msg?: string) => toast(msg ?? tr(A.saved)),
    fail: (e: unknown) => toast(errorText((e as Error).message), 'error'),
  };
}

function GroupSection({ data, reload }: SectionProps) {
  const { tr } = useI18n();
  const { refresh } = useGroup();
  const saved = useSaved();
  const [name, setName] = useState(data.group.name);
  const [tagline, setTagline] = useState(data.group.tagline);
  const [accent, setAccent] = useState(data.group.accent ?? '');
  const ids = { name: useId(), tagline: useId(), accent: useId() };
  const swatches = ['#d8a845', '#c4512e', '#2f7d6d', '#3a6ea5', '#b24a6b', '#7a8c3a'];

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.group({ name, tagline, accent: accent || null });
      saved.ok();
      refresh();
      reload();
    } catch (err) {
      saved.fail(err);
    }
  }

  return (
    <Section title={tr(A.tabGroup)}>
      <form className="admin-form" onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor={ids.name}>
            {tr(A.groupName)}
          </label>
          <input id={ids.name} className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={ids.tagline}>
            {tr(A.groupTagline)}
          </label>
          <input id={ids.tagline} className="input" value={tagline} maxLength={80} onChange={(e) => setTagline(e.target.value)} />
        </div>
        <fieldset className="field swatches">
          <legend className="field__label">{tr(A.accent)}</legend>
          <div className="swatches__row">
            <button type="button" className="swatch swatch--none" aria-pressed={!accent} onClick={() => setAccent('')} aria-label={tr(A.accentNone)} />
            {swatches.map((c) => (
              <button key={c} type="button" className="swatch" style={{ background: c }} aria-pressed={accent.toLowerCase() === c} onClick={() => setAccent(c)} aria-label={c} />
            ))}
            <input id={ids.accent} type="color" className="swatch swatch--custom" value={accent || '#d8a845'} onChange={(e) => setAccent(e.target.value)} aria-label={tr(A.accent)} />
          </div>
        </fieldset>
        <button className="button button--primary">{tr(A.save)}</button>
      </form>
    </Section>
  );
}

function MembersSection({ data, reload }: SectionProps) {
  const { tr } = useI18n();
  const { refresh } = useGroup();
  const saved = useSaved();
  const [name, setName] = useState('');
  const nameId = useId();
  const done = () => {
    reload();
    refresh();
  };

  return (
    <Section title={tr(A.tabMembers)} text={tr(A.membersText)}>
      <form
        className="admin-inline"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          try {
            await api.saveMember({ name, portrait: null });
            setName('');
            done();
          } catch (err) {
            saved.fail(err);
          }
        }}
      >
        <label className="visually-hidden" htmlFor={nameId}>
          {tr(A.memberName)}
        </label>
        <input id={nameId} className="input" placeholder={tr(A.memberName)} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        <button className="button button--primary">{tr(A.addMember)}</button>
      </form>
      {data.members.length === 0 ? (
        <p className="faint">{tr(A.noMembers)}</p>
      ) : (
        <ul className="roster" role="list">
          {data.members.map((m) => (
            <li key={m.id} className="roster__item">
              <div className="roster__photo">
                {m.portrait ? <MediaImage asset={m.portrait} alt={m.name} sizes="160px" /> : <Avatar name={m.name} portrait={null} size={72} />}
              </div>
              <p className="roster__name">{m.name}</p>
              <div className="roster__actions">
                <PhotoPicker
                  aspect={4 / 5}
                  className="button button--quiet"
                  label={m.portrait ? tr(A.changePhoto) : tr(A.portrait)}
                  onUploaded={async (ref, info) => {
                    await api.saveMember({ id: m.id, name: m.name, portrait: ref });
                    saved.ok(tr(A.savedSize, { before: kb(info.before), after: kb(info.after) }));
                    done();
                  }}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${tr(A.delete)} ${m.name}`}
                  onClick={async () => {
                    if (!confirm(`${tr(A.delete)} ${m.name}?`)) return;
                    await api.deleteMember(m.id).catch(saved.fail);
                    done();
                  }}
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const rowsOf = (data: AdminData, game: string, kind: string) => data.content.filter((c) => c.game === game && c.kind === kind);

function DefaultsToggle({ data, game, reload }: SectionProps & { game: string }) {
  const { tr } = useI18n();
  return (
    <label className="switch admin-toggle">
      <span>{tr(A.includeDefaults)}</span>
      <input type="checkbox" checked={data.defaults[game] !== false} onChange={(e) => void api.defaults(game, e.target.checked).then(reload)} />
    </label>
  );
}

function PassnamesSection({ data, reload }: SectionProps) {
  const { tr, num } = useI18n();
  const saved = useSaved();
  const id = useId();
  const current = (rowsOf(data, 'passnames', 'words')[0]?.data.words as string[] | undefined) ?? [];
  const [text, setText] = useState(current.join('\n'));
  const photos = rowsOf(data, 'passnames', 'picture');
  const agents = rowsOf(data, 'passnames', 'agentPhoto');

  return (
    <>
      <Section title={tr(A.wordsTitle)} text={tr(A.wordsText)}>
        <form
          className="admin-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const words = text
              .split(/\n|،|,/)
              .map((w) => w.trim())
              .filter(Boolean);
            try {
              await api.addContent('passnames', 'words', { words });
              saved.ok();
              reload();
            } catch (err) {
              saved.fail(err);
            }
          }}
        >
          <label className="visually-hidden" htmlFor={id}>
            {tr(A.wordsTitle)}
          </label>
          <textarea id={id} className="input admin-words" value={text} onChange={(e) => setText(e.target.value)} rows={8} />
          <DefaultsToggle data={data} reload={reload} game="passnames" />
          <button className="button button--primary">{tr(A.save)}</button>
        </form>
      </Section>
      <Section title={tr(A.agentsTitle)} text={tr(A.agentsText)}>
        <div className="admin-inline">
          <PhotoPicker aspect={4 / 3} multiple label={tr(A.addPhotos)} className="button button--primary" onUploaded={(ref) => api.addContent('passnames', 'agentPhoto', { asset: ref }).then(reload)} />
          <span className="faint">{agents.length ? tr(A.photosCount, { n: num(agents.length) }) : tr(A.agentsFallback)}</span>
        </div>
        <AssetGrid rows={agents} reload={reload} />
      </Section>
      <Section title={tr(A.photosTitle)} text={tr(A.photosText)}>
        <div className="admin-inline">
          <PhotoPicker aspect={1} multiple label={tr(A.addPhotos)} className="button button--primary" onUploaded={(ref) => api.addContent('passnames', 'picture', { asset: ref }).then(reload)} />
          <span className="faint">{tr(A.photosCount, { n: num(photos.length) })}</span>
        </div>
        <AssetGrid rows={photos} reload={reload} />
      </Section>
    </>
  );
}

function AssetGrid({ rows, reload }: { rows: ContentRow[]; reload(): void }) {
  const { tr } = useI18n();
  return (
    <ul className="asset-grid" role="list">
      {rows.map((r) => (
        <li key={r.id}>
          <MediaImage asset={r.data.asset as AssetRef} alt="" sizes="120px" />
          <button type="button" className="asset-grid__remove" aria-label={tr(A.delete)} onClick={() => void api.deleteContent(r.id).then(reload)}>
            <TrashIcon />
          </button>
        </li>
      ))}
    </ul>
  );
}

function MafiaSection({ data, reload }: SectionProps) {
  const { tr, pick } = useI18n();
  const art = rowsOf(data, 'mafia', 'roleArt');
  const back = rowsOf(data, 'mafia', 'cardBack')[0];
  return (
    <Section title={tr(A.tabMafia)} text={tr(A.mafiaText)}>
      <ul className="role-art" role="list">
        {ROLE_ORDER.map((role) => {
          const row = art.filter((r) => r.data.role === role).at(-1);
          return (
            <li key={role} className="role-art__item">
              <div className="role-art__card">{row ? <MediaImage asset={row.data.asset} alt="" sizes="200px" /> : <span className="role-art__empty">{pick(ROLES[role].name)}</span>}</div>
              <p className="role-art__name">{pick(ROLES[role].name)}</p>
              <PhotoPicker
                aspect={5 / 7}
                label={row ? tr(A.replace) : tr(A.upload)}
                onUploaded={async (ref) => {
                  for (const old of art.filter((r) => r.data.role === role)) await api.deleteContent(old.id);
                  await api.addContent('mafia', 'roleArt', { role, asset: ref });
                  reload();
                }}
              />
            </li>
          );
        })}
        <li className="role-art__item">
          <div className="role-art__card role-art__card--back">{back ? <MediaImage asset={back.data.asset} alt="" sizes="200px" /> : null}</div>
          <p className="role-art__name">{tr(A.cardBack)}</p>
          <PhotoPicker aspect={5 / 7} label={back ? tr(A.replace) : tr(A.upload)} onUploaded={(ref) => api.addContent('mafia', 'cardBack', { asset: ref }).then(reload)} />
        </li>
      </ul>
    </Section>
  );
}

function KalakSection({ data, reload }: SectionProps) {
  const { tr } = useI18n();
  const saved = useSaved();
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [category, setCategory] = useState('الشلة');
  const ids = { q: useId(), a: useId(), c: useId() };
  const questions = rowsOf(data, 'kalak', 'question');

  return (
    <Section title={tr(A.tabKalak)} text={tr(A.kalakText)}>
      <form
        className="admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.addContent('kalak', 'question', { prompt, answer, category });
            setPrompt('');
            setAnswer('');
            reload();
          } catch (err) {
            saved.fail(err);
          }
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor={ids.q}>
            {tr(A.question)}
          </label>
          <textarea id={ids.q} className="input" value={prompt} maxLength={300} rows={2} onChange={(e) => setPrompt(e.target.value)} required placeholder="وش أكثر أكلة يطلبها فهد إذا طلعنا؟" />
        </div>
        <div className="admin-two">
          <div className="field">
            <label className="field__label" htmlFor={ids.a}>
              {tr(A.answer)}
            </label>
            <input id={ids.a} className="input" value={answer} maxLength={60} onChange={(e) => setAnswer(e.target.value)} required />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={ids.c}>
              {tr(A.category)}
            </label>
            <input id={ids.c} className="input" value={category} maxLength={30} onChange={(e) => setCategory(e.target.value)} />
          </div>
        </div>
        <DefaultsToggle data={data} reload={reload} game="kalak" />
        <button className="button button--primary">{tr(A.addQuestion)}</button>
      </form>
      {questions.length > 0 && (
        <>
          <h3 className="panel-title">{tr(A.yourQuestions)}</h3>
          <ul className="admin-list" role="list">
            {questions.map((q) => (
              <li key={q.id}>
                <span>
                  <b>{q.data.prompt}</b>
                  <span className="faint"> · {q.data.answer}</span>
                </span>
                <button type="button" className="icon-button" aria-label={tr(A.delete)} onClick={() => void api.deleteContent(q.id).then(reload)}>
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function PuzzleSection({ data, reload }: SectionProps) {
  const { tr } = useI18n();
  const saved = useSaved();
  const [tiles, setTiles] = useState<PuzzleTile[]>([]);
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [hint, setHint] = useState('');
  const ids = { t: useId(), a: useId(), h: useId() };
  const puzzles = rowsOf(data, 'picture-puzzle', 'puzzle');

  return (
    <Section title={tr(A.tabPuzzle)} text={tr(A.puzzleText)}>
      <div className="admin-form">
        <div className="field">
          <span className="field__label">{tr(A.tiles)}</span>
          <div className="puzzle-tiles">
            {tiles.map((t, i) => (
              <span key={i} className="puzzle-tile">
                {t.kind === 'image' ? <MediaImage asset={t.asset} alt="" sizes="96px" /> : <span className="puzzle-tile__text">{t.text}</span>}
                <button type="button" className="asset-grid__remove" aria-label={tr(A.delete)} onClick={() => setTiles(tiles.filter((_, j) => j !== i))}>
                  <TrashIcon />
                </button>
              </span>
            ))}
          </div>
          {tiles.length < 6 && (
            <div className="admin-inline">
              <label className="visually-hidden" htmlFor={ids.t}>
                {tr(A.addTextTile)}
              </label>
              <input id={ids.t} className="input" value={text} maxLength={20} onChange={(e) => setText(e.target.value)} placeholder="🐴 / نهر" />
              <button
                type="button"
                className="button button--quiet"
                disabled={!text.trim()}
                onClick={() => {
                  setTiles([...tiles, { kind: 'text', text: text.trim() }]);
                  setText('');
                }}
              >
                {tr(A.addTextTile)}
              </button>
              <PhotoPicker aspect={1} label={tr(A.addImageTile)} onUploaded={(ref) => setTiles((list) => [...list, { kind: 'image', asset: ref }])} />
            </div>
          )}
        </div>
        <div className="admin-two">
          <div className="field">
            <label className="field__label" htmlFor={ids.a}>
              {tr(A.answer)}
            </label>
            <input id={ids.a} className="input" value={answer} maxLength={60} onChange={(e) => setAnswer(e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={ids.h}>
              {tr(A.hint)}
            </label>
            <input id={ids.h} className="input" value={hint} maxLength={40} onChange={(e) => setHint(e.target.value)} />
          </div>
        </div>
        <DefaultsToggle data={data} reload={reload} game="picture-puzzle" />
        <button
          type="button"
          className="button button--primary"
          disabled={!tiles.length || !answer.trim()}
          onClick={async () => {
            try {
              await api.addContent('picture-puzzle', 'puzzle', { tiles, answer, hint: hint || undefined });
              setTiles([]);
              setAnswer('');
              setHint('');
              reload();
            } catch (err) {
              saved.fail(err);
            }
          }}
        >
          {tr(A.addPuzzle)}
        </button>
      </div>
      {puzzles.length > 0 && (
        <>
          <h3 className="panel-title">{tr(A.yourPuzzles)}</h3>
          <ul className="admin-list" role="list">
            {puzzles.map((p) => (
              <li key={p.id}>
                <span className="admin-list__tiles">
                  {(p.data.tiles as PuzzleTile[]).map((t, i) => (
                    <span key={i} className="puzzle-tile puzzle-tile--small">
                      {t.kind === 'image' ? <MediaImage asset={t.asset} alt="" sizes="48px" /> : <span className="puzzle-tile__text">{t.text}</span>}
                    </span>
                  ))}
                  <b>{p.data.answer}</b>
                </span>
                <button type="button" className="icon-button" aria-label={tr(A.delete)} onClick={() => void api.deleteContent(p.id).then(reload)}>
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function AccountSection({ status, onLogout }: { status: Status; onLogout(): void }) {
  const { tr } = useI18n();
  const saved = useSaved();
  const [password, setPassword] = useState('');
  const id = useId();
  return (
    <Section title={tr(A.tabAccount)}>
      {status.envPassword ? (
        <p className="muted">{tr(A.envPassword)}</p>
      ) : (
        <form
          className="admin-inline"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.password(password);
              setPassword('');
              saved.ok();
            } catch (err) {
              saved.fail(err);
            }
          }}
        >
          <label className="visually-hidden" htmlFor={id}>
            {tr(A.newPassword)}
          </label>
          <input id={id} className="input" type="password" autoComplete="new-password" minLength={8} placeholder={tr(A.newPassword)} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="button button--quiet">{tr(A.changePassword)}</button>
        </form>
      )}
      <button type="button" className="button button--danger" onClick={() => void api.logout().then(onLogout)}>
        {tr(A.logout)}
      </button>
    </Section>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />
    </svg>
  );
}
