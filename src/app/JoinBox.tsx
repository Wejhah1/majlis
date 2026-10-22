import { useId, useState, type FormEvent } from 'react';
import { useI18n } from '../platform/i18n/I18n';
import { parseRoomCode } from '../platform/room/client';
import { validCode } from '../platform/room/core';
import { navigate } from './router';

export function JoinBox() {
  const { t } = useI18n();
  const inputId = useId();
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseRoomCode(code);
    if (validCode(parsed)) navigate(`/r/${parsed}`);
    else setInvalid(true);
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
            setCode(e.target.value);
            setInvalid(false);
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="K7P-QM3-XA9"
          aria-invalid={invalid}
          aria-describedby={invalid ? `${inputId}-msg` : undefined}
        />
        <button type="submit" className="button button--primary">
          {t('join.submit')}
        </button>
      </div>
      <p id={`${inputId}-msg`} className="join__message" role="status">
        {invalid ? t('join.invalid') : ''}
      </p>
    </form>
  );
}
