import type { ReactNode } from 'react';
import { useI18n } from '../platform/i18n/I18n';
import { useGroup } from './group';
import { Link } from './router';

export function TopBar({ children, compact = false }: { children?: ReactNode; compact?: boolean }) {
  const { t, lang, setLang } = useI18n();
  const { group } = useGroup();
  return (
    <>
      <div className="sadu-band" aria-hidden="true" />
      <header className={`topbar${compact ? ' topbar--compact' : ''}`}>
        <Link href="/" className="wordmark">
          <span lang="ar">{t('app.name')}</span>
          <span className="wordmark__group">{group?.name ?? t('group.name')}</span>
        </Link>
        <div className="topbar__end">
          {children}
          <button
            type="button"
            className="pill-button"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            aria-label={t('lang.switchLabel')}
            lang={lang === 'ar' ? 'en' : 'ar'}
          >
            {t('lang.switch')}
          </button>
        </div>
      </header>
    </>
  );
}
