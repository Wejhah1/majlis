import { useId, useState, type FormEvent } from 'react';
import { useI18n } from '../platform/i18n/I18n';

// Same code format as passnames' room-core: 9 chars, no look-alike letters (no I, O, 0, 1).
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const normalize = (v: string) => v.replace(/[\s-]/g, '').toUpperCase();
const isValidCode = (v: string) => v.length === 9 && [...v].every((c) => ROOM_ALPHABET.includes(c));

function codeFromUrl() {
  return normalize(new URLSearchParams(location.search).get('room') ?? '');
}

export function JoinBox() {
  const { t } = useI18n();
  const inputId = useId();
  const [code, setCode] = useState(codeFromUrl);
  const [message, setMessage] = useState<'invalid' | 'notYet' | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    // Phase 1 replaces this with a real join request.
    setMessage(isValidCode(code) ? 'notYet' : 'invalid');
  }

  return (
    <form className="join" onSubmit={submit} noValidate>
      <p className="join__title">{t('join.title')}</p>
      <label className="join__label" htmlFor={inputId}>
        {t('join.label')}
      </label>
      <div className="join__row">
        <input
          id={inputId}
          className="join__input ltr-run"
          value={code}
          onChange={(e) => {
            setCode(normalize(e.target.value).slice(0, 9));
            setMessage(null);
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={11}
          placeholder="K7PQ-3MXA9"
          aria-invalid={message === 'invalid'}
          aria-describedby={message ? `${inputId}-msg` : undefined}
        />
        <button type="submit" className="button button--primary">
          {t('join.submit')}
        </button>
      </div>
      <p id={`${inputId}-msg`} className="join__message" role="status">
        {message === 'invalid' ? t('join.invalid') : message === 'notYet' ? t('join.notYet') : ''}
      </p>
    </form>
  );
}
