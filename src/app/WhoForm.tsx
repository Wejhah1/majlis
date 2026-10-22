import { useId, useState, type FormEvent } from 'react';
import { useI18n } from '../platform/i18n/I18n';
import { Avatar } from '../platform/ui/Media';
import type { Identity } from '../platform/room/client';
import { useGroup } from './group';

const LAST_NAME = 'majlis-name';

function lastIdentity(): { name: string; rosterId: string | null } {
  try {
    return JSON.parse(localStorage.getItem(LAST_NAME) ?? 'null') ?? { name: '', rosterId: null };
  } catch {
    return { name: '', rosterId: null };
  }
}

/** "Who are you?": tap your own face from the group roster, or type a name. */
export function WhoForm({ onSubmit, busyLabel, onCancel }: { onSubmit(identity: Identity): Promise<void>; busyLabel: string; onCancel?(): void }) {
  const { t, errorText } = useI18n();
  const { roster } = useGroup();
  const nameId = useId();
  const last = lastIdentity();
  const [rosterId, setRosterId] = useState<string | null>(last.rosterId && roster.some((m) => m.id === last.rosterId) ? last.rosterId : null);
  const [name, setName] = useState(last.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const picked = roster.find((m) => m.id === rosterId) ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const finalName = (picked && !name.trim() ? picked.name : name).trim();
    if (!finalName) return setError(errorText('NAME_REQUIRED'));
    setBusy(true);
    setError('');
    try {
      localStorage.setItem(LAST_NAME, JSON.stringify({ name: finalName, rosterId }));
    } catch {
      // Remembering the name is a convenience only.
    }
    try {
      await onSubmit({ name: finalName, rosterId, portrait: picked?.portrait ?? null });
    } catch (err) {
      setError(errorText((err as Error).message));
      setBusy(false);
    }
  }

  return (
    <form className="who" onSubmit={submit}>
      {roster.length > 0 && (
        <fieldset className="who__roster">
          <legend className="field__label">{t('who.roster')}</legend>
          <div className="who__faces">
            {roster.map((m) => (
              <button
                key={m.id}
                type="button"
                className="who__face"
                aria-pressed={rosterId === m.id}
                onClick={() => {
                  const on = rosterId !== m.id;
                  setRosterId(on ? m.id : null);
                  setName(on ? m.name : '');
                }}
              >
                <Avatar name={m.name} portrait={m.portrait} size={56} />
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="field">
        <label className="field__label" htmlFor={nameId}>
          {roster.length ? t('who.orName') : t('who.name')}
        </label>
        <input
          id={nameId}
          className="input"
          value={name}
          maxLength={24}
          autoComplete="nickname"
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="who__actions">
        <button type="submit" className="button button--primary button--big" disabled={busy}>
          {busy ? <span className="spinner-dots">{busyLabel.replace(/…$/, '')}</span> : t('who.go')}
        </button>
        {onCancel && (
          <button type="button" className="button button--ghost" onClick={onCancel}>
            {t('who.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
