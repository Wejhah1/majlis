import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/alexandria';
import '@fontsource-variable/montserrat';
import '@fontsource/marhey/400.css';
import './platform/ui/tokens.css';
import './platform/ui/base.css';
import { I18nProvider } from './platform/i18n/I18n';
import { Home } from './app/Home';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <Home />
    </I18nProvider>
  </StrictMode>,
);
