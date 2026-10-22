import { useEffect, useId, useState } from 'react';
import { loadGameClient } from '../games/client';
import type { GameClient } from '../games/client-types';
import { gameById, games } from '../games/registry';
import type { GameMeta, LobbyRole, SettingField } from '../games/types';
import { useI18n } from '../platform/i18n/I18n';
import { forgetSeat, formatCode, type ClientRoom } from '../platform/room/client';
import type { PublicMember } from '../platform/room/core';
import { Avatar } from '../platform/ui/Media';
import { QrCode } from '../platform/ui/QrCode';
import { Sheet } from '../platform/ui/Sheet';
import { useToast } from '../platform/ui/Toast';
import { navigate } from './router';
import { TopBar } from './TopBar';

type Send = (action: Record<string, unknown>) => Promise<void>;

export function useGameClient(id: string) {
  const [client, setClient] = useState<GameClient | null>(null);
  useEffect(() => {
    let live = true;
    loadGameClient(id).then(
      (c) => live && setClient(c),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [id]);
  return client;
}

/** Wraps send() so every failure shows a translated toast. */
export function useAct(send: Send, gameErrors?: Record<string, readonly [string, string]>) {
  const toast = useToast();
  const { errorText } = useI18n();
  return (action: Record<string, unknown>) =>
    send(action).catch((e: Error) => {
      toast(errorText(e.message, gameErrors), 'error');
      throw e;
    });
}

export function Lobby({ room, send }: { room: ClientRoom; send: Send }) {
  const { t, pick, errorText } = useI18n();
  const game = gameById(room.gameId)!;
  const client = useGameClient(room.gameId);
  const act = useAct(send, { ...client?.seatErrors, ...client?.errors });
  const isAdmin = room.me?.id === room.adminId;
  const [menuFor, setMenuFor] = useState<PublicMember | null>(null);
  const [leaving, setLeaving] = useState(false);
  const quiet = (a: Record<string, unknown>) => act(a).catch(() => {});

  const readinessText = room.readiness.ready ? null : errorText(room.readiness.error, { ...client?.seatErrors, ...client?.errors });

  return (
    <>
      <TopBar>
        <button type="button" className="pill-button" onClick={() => setLeaving(true)}>
          {t('room.leave')}
        </button>
      </TopBar>
      <main className="lobby">
        <section className="lobby__main" aria-labelledby="lobby-game">
          <header className="lobby__head">
            <p className="faint">{t('lobby.game')}</p>
            <h1 id="lobby-game" className="lobby__title">
              {pick(game.name)}
            </h1>
            <p className="muted lobby__tagline">{pick(game.tagline)}</p>
          </header>

          {isAdmin && <GameSwitcher current={game.id} onPick={(id) => quiet({ type: 'SWITCH_GAME', gameId: id })} />}

          {room.adminAwayUntil && <AdminAway until={room.adminAwayUntil} offset={room.clockOffset} />}

          <Seats game={game} room={room} isAdmin={isAdmin} onSeat={(m, team, role) => quiet({ type: 'SEAT', targetId: m.id, team, role })} onMenu={setMenuFor} />

          {isAdmin && room.pending.length > 0 && (
            <section className="lobby__panel" aria-labelledby="pending-h">
              <h2 id="pending-h" className="panel-title">
                {t('lobby.pending')}
              </h2>
              <ul className="member-list" role="list">
                {room.pending.map((m) => (
                  <li key={m.id} className="member">
                    <Avatar name={m.name} portrait={m.portrait} size={36} />
                    <span className="member__name">{m.name}</span>
                    <span className="member__actions">
                      <button type="button" className="button button--primary" onClick={() => quiet({ type: 'APPROVE', targetId: m.id })}>
                        {t('lobby.approve')}
                      </button>
                      <button type="button" className="button button--ghost" onClick={() => quiet({ type: 'REJECT', targetId: m.id })}>
                        {t('lobby.reject')}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>

        <aside className="lobby__side">
          <InviteCard code={room.code} />
          {(game.settingFields.length > 0 || isAdmin) && (
            <section className="lobby__panel" aria-labelledby="settings-h">
              <h2 id="settings-h" className="panel-title">
                {t('lobby.settings')}
              </h2>
              {isAdmin && (
                <label className="switch">
                  <span>{t('lobby.locked')}</span>
                  <input type="checkbox" checked={room.locked} onChange={(e) => quiet({ type: 'LOCK', locked: e.target.checked })} />
                </label>
              )}
              {game.settingFields.map((f) => (
                <SettingControl
                  key={f.id}
                  field={f}
                  value={room.settings[f.id]}
                  disabled={!isAdmin}
                  onChange={(v) => quiet({ type: 'SETTINGS', settings: { ...room.settings, [f.id]: v } })}
                />
              ))}
            </section>
          )}
        </aside>

        <div className="start-bar">
          <div className="start-bar__inner">
            <p className="start-bar__status" role="status">
              {room.readiness.ready ? (
                <span className="ready-dot">{t('lobby.ready')}</span>
              ) : (
                <>
                  <span className="faint">{t('lobby.startNeeds')}</span> {readinessText}
                </>
              )}
            </p>
            {isAdmin ? (
              <button type="button" className="button button--primary button--big" disabled={!room.readiness.ready} onClick={() => quiet({ type: 'START' })}>
                {t('lobby.start')}
              </button>
            ) : (
              <p className="faint">{t('lobby.onlyAdmin')}</p>
            )}
          </div>
        </div>
      </main>

      <MemberSheet member={menuFor} room={room} game={game} isAdmin={isAdmin} onClose={() => setMenuFor(null)} act={quiet} />

      <Sheet open={leaving} onClose={() => setLeaving(false)} title={t('room.leave')}>
        <div className="sheet-actions">
          <button
            type="button"
            className="button button--danger"
            onClick={async () => {
              await send({ type: 'LEAVE' }).catch(() => {});
              forgetSeat(room.code);
              navigate('/');
            }}
          >
            {t('room.leave')}
          </button>
          <button type="button" className="button button--ghost" onClick={() => setLeaving(false)}>
            {t('common.cancel')}
          </button>
        </div>
      </Sheet>
    </>
  );
}

function AdminAway({ until, offset }: { until: number; offset: number }) {
  const { t, num } = useI18n();
  const [now, setNow] = useState(Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [offset]);
  return <p className="notice">{t('room.adminAway', { s: num(Math.max(0, Math.ceil((until - now) / 1000))) })}</p>;
}

function GameSwitcher({ current, onPick }: { current: string; onPick(id: string): void }) {
  const { pick } = useI18n();
  return (
    <div className="game-switch" role="group">
      {games
        .filter((g) => g.status === 'ready')
        .map((g) => (
          <button key={g.id} type="button" className="game-chip" aria-pressed={g.id === current} onClick={() => g.id !== current && onPick(g.id)} style={{ '--chip': g.accent } as React.CSSProperties}>
            {pick(g.name)}
          </button>
        ))}
    </div>
  );
}

function Seats({
  game,
  room,
  isAdmin,
  onSeat,
  onMenu,
}: {
  game: GameMeta;
  room: ClientRoom;
  isAdmin: boolean;
  onSeat(m: PublicMember, team: string | null, role: string | null): void;
  onMenu(m: PublicMember): void;
}) {
  const { t, pick, num } = useI18n();
  const { teams = [], roles = [] } = game.lobby;
  const me = room.me;
  const teamless = roles.filter((r) => r.teamless);
  const teamRoles = roles.filter((r) => !r.teamless);
  const defaultRole = game.lobby.defaultRole ?? teamRoles[0]?.id ?? null;
  const roleOf = (m: PublicMember) => roles.find((r) => r.id === m.role);

  const row = (m: PublicMember) => (
    <MemberRow
      key={m.id}
      m={m}
      room={room}
      role={roleOf(m)}
      canMenu={isAdmin || m.id === me?.id}
      onMenu={() => onMenu(m)}
      roleChoices={m.id === me?.id ? teamRoles : []}
      onRole={(role) => onSeat(m, m.team, role)}
    />
  );

  return (
    <div className="seats">
      {teamless.map((r) => {
        const holders = room.members.filter((m) => m.role === r.id);
        const mine = me?.role === r.id;
        return (
          <section key={r.id} className="seat-strip">
            <div className="seat-strip__label">
              <h2 className="panel-title">{pick(r.name)}</h2>
              {r.hint && <p className="faint">{pick(r.hint)}</p>}
            </div>
            <ul className="member-list" role="list">
              {holders.map(row)}
            </ul>
            {me && (r.max === undefined || holders.length < r.max || mine) && (
              <button type="button" className="button button--ghost" onClick={() => onSeat(me, mine ? (teams[0]?.id ?? null) : null, mine ? defaultRole : r.id)}>
                {mine ? t('lobby.leaveRole') : t('lobby.takeRole', { role: pick(r.name) })}
              </button>
            )}
          </section>
        );
      })}

      {teams.length > 0 ? (
        <div className="teams">
          {teams.map((team) => {
            const members = room.members.filter((m) => m.team === team.id && !roleOf(m)?.teamless);
            return (
              <section key={team.id} className="team" style={{ '--team': team.color } as React.CSSProperties} aria-labelledby={`team-${team.id}`}>
                <header className="team__head">
                  <h2 id={`team-${team.id}`} className="team__name">
                    {pick(team.name)} <span className="team__count">{num(members.length)}</span>
                  </h2>
                  {me && me.team !== team.id && (
                    <button
                      type="button"
                      className="button button--quiet"
                      onClick={() => onSeat(me, team.id, roleOf(me)?.teamless || !me.role ? defaultRole : me.role === 'spy' && members.some((m) => m.role === 'spy') ? defaultRole : me.role)}
                    >
                      {t('lobby.joinTeam')}
                    </button>
                  )}
                </header>
                <ul className="member-list" role="list">
                  {members.map(row)}
                </ul>
              </section>
            );
          })}
          {room.members.some((m) => !m.team && !roleOf(m)?.teamless) && (
            <section className="team team--none">
              <header className="team__head">
                <h2 className="team__name">{t('lobby.unassigned')}</h2>
              </header>
              <ul className="member-list" role="list">
                {room.members.filter((m) => !m.team && !roleOf(m)?.teamless).map(row)}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <section className="lobby__panel">
          <h2 className="panel-title">
            {t('lobby.players')} <span className="team__count">{num(room.members.filter((m) => !roleOf(m)?.teamless).length)}</span>
          </h2>
          <ul className="member-grid" role="list">
            {room.members.filter((m) => !roleOf(m)?.teamless).map(row)}
          </ul>
        </section>
      )}
    </div>
  );
}

function MemberRow({
  m,
  room,
  role,
  canMenu,
  onMenu,
  roleChoices,
  onRole,
}: {
  m: PublicMember;
  room: ClientRoom;
  role?: LobbyRole;
  canMenu: boolean;
  onMenu(): void;
  roleChoices: LobbyRole[];
  onRole(role: string): void;
}) {
  const { t, pick } = useI18n();
  const isMe = m.id === room.me?.id;
  return (
    <li className={`member${isMe ? ' member--me' : ''}${m.online ? '' : ' member--offline'}`}>
      <Avatar name={m.name} portrait={m.portrait} size={40} />
      <span className="member__text">
        <span className="member__name">{m.name}</span>
        <span className="member__role">
          {role && roleChoices.length < 2 && pick(role.name)}
          {!m.online && ` · ${t('lobby.offline')}`}
          {isMe && <span className="tag">{t('lobby.you')}</span>}
          {m.id === room.adminId && <span className="tag tag--brass">{t('lobby.admin')}</span>}
        </span>
      </span>
      {roleChoices.length > 1 && (
        <span className="segmented member__roles" role="group" aria-label={t('lobby.role')}>
          {roleChoices.map((r) => (
            <button key={r.id} type="button" aria-pressed={m.role === r.id} onClick={() => m.role !== r.id && onRole(r.id)} title={r.hint ? pick(r.hint) : undefined}>
              {pick(r.name)}
            </button>
          ))}
        </span>
      )}
      {canMenu && (
        <button type="button" className="icon-button member__menu" onClick={onMenu} aria-label={m.name}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <circle cx="4" cy="10" r="1.6" fill="currentColor" />
            <circle cx="10" cy="10" r="1.6" fill="currentColor" />
            <circle cx="16" cy="10" r="1.6" fill="currentColor" />
          </svg>
        </button>
      )}
    </li>
  );
}

function MemberSheet({
  member,
  room,
  game,
  isAdmin,
  onClose,
  act,
}: {
  member: PublicMember | null;
  room: ClientRoom;
  game: GameMeta;
  isAdmin: boolean;
  onClose(): void;
  act(a: Record<string, unknown>): Promise<void>;
}) {
  const { t, pick } = useI18n();
  const [name, setName] = useState('');
  const nameId = useId();
  useEffect(() => setName(member?.name ?? ''), [member]);
  if (!member) return <Sheet open={false} onClose={onClose} title="" children={null} />;
  const live = room.members.find((m) => m.id === member.id) ?? member;
  const isMe = member.id === room.me?.id;
  const { teams = [], roles = [] } = game.lobby;
  const run = (a: Record<string, unknown>) => act(a).then(onClose);

  return (
    <Sheet open onClose={onClose} title={live.name}>
      {isMe && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && name.trim() !== live.name) void run({ type: 'RENAME', name });
          }}
        >
          <label className="field__label" htmlFor={nameId}>
            {t('lobby.rename')}
          </label>
          <div className="inline-form__row">
            <input id={nameId} className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
            <button className="button button--quiet">{t('common.save')}</button>
          </div>
        </form>
      )}
      {isAdmin && teams.length > 0 && (
        <div className="field">
          <span className="field__label">{t('lobby.team')}</span>
          <div className="segmented">
            {teams.map((team) => (
              <button key={team.id} type="button" aria-pressed={live.team === team.id} onClick={() => run({ type: 'SEAT', targetId: live.id, team: team.id, role: roles.find((r) => r.id === live.role)?.teamless ? game.lobby.defaultRole : live.role })}>
                {pick(team.name)}
              </button>
            ))}
          </div>
        </div>
      )}
      {isAdmin && roles.length > 1 && (
        <div className="field">
          <span className="field__label">{t('lobby.role')}</span>
          <div className="segmented">
            {roles.map((r) => (
              <button key={r.id} type="button" aria-pressed={live.role === r.id} onClick={() => run({ type: 'SEAT', targetId: live.id, team: live.team ?? teams[0]?.id ?? null, role: r.id })}>
                {pick(r.name)}
              </button>
            ))}
          </div>
        </div>
      )}
      {isAdmin && !isMe && (
        <div className="sheet-actions">
          <button type="button" className="button button--quiet" onClick={() => run({ type: 'PROMOTE', targetId: live.id })}>
            {t('lobby.promote')}
          </button>
          <button type="button" className="button button--danger" onClick={() => run({ type: 'KICK', targetId: live.id })}>
            {t('lobby.kick')}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function SettingControl({ field, value, disabled, onChange }: { field: SettingField; value: unknown; disabled: boolean; onChange(v: unknown): void }) {
  const { pick, num, t } = useI18n();
  const id = useId();
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => setDraft(String(value ?? '')), [value]);

  if (field.kind === 'toggle')
    return (
      <label className="switch">
        <span>{pick(field.label)}</span>
        <input type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      </label>
    );
  if (field.kind === 'choice')
    return (
      <div className="field">
        <span className="field__label">{pick(field.label)}</span>
        <div className="segmented" role="group">
          {field.options.map((o) => (
            <button key={o.value} type="button" aria-pressed={value === o.value} disabled={disabled} onClick={() => value !== o.value && onChange(o.value)}>
              {pick(o.label)}
            </button>
          ))}
        </div>
      </div>
    );
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {pick(field.label)}
        {field.unit && <span className="faint"> · {pick(field.unit)}</span>}
      </label>
      {disabled ? (
        <p>{Number(value) === 0 && field.min === 0 ? t('lobby.off') : num(Number(value))}</p>
      ) : (
        <input
          id={id}
          className="input input--number ltr-run"
          type="number"
          inputMode="numeric"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = Number(draft);
            if (Number.isFinite(n) && n !== value) onChange(n);
          }}
        />
      )}
    </div>
  );
}

function InviteCard({ code }: { code: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const link = `${location.origin}/r/${code}`;
  const tvLink = `${location.origin}/tv/${code}`;
  const canShare = typeof navigator.share === 'function';

  return (
    <section className="invite" aria-labelledby="invite-h">
      <h2 id="invite-h" className="faint">
        {t('room.code')}
      </h2>
      <p className="invite__code ltr-run">{formatCode(code)}</p>
      <div className="invite__actions">
        <button
          type="button"
          className="button button--quiet"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setQr(true);
            }
          }}
        >
          {copied ? t('room.copied') : t('room.copyLink')}
        </button>
        {canShare && (
          <button type="button" className="button button--ghost" onClick={() => navigator.share({ url: link }).catch(() => {})}>
            {t('room.share')}
          </button>
        )}
        <button type="button" className="button button--ghost" aria-expanded={qr} onClick={() => setQr((q) => !q)}>
          {t('room.showQr')}
        </button>
      </div>
      {qr && (
        <div className="invite__qr">
          <QrCode value={link} size={168} label={link} />
        </div>
      )}
      <p className="invite__tv faint">
        {t('room.tvHint')}{' '}
        <a href={tvLink} target="_blank" rel="noreferrer" className="ltr-run">
          {tvLink.replace(/^https?:\/\//, '')}
        </a>
      </p>
    </section>
  );
}
