import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/alexandria';
import '@fontsource-variable/montserrat';
import '@fontsource/marhey/400.css';
import './platform/ui/tokens.css';
import './platform/ui/base.css';
import './platform/ui/controls.css';
import './app/app.css';
import { I18nProvider } from './platform/i18n/I18n';
import { ToastProvider } from './platform/ui/Toast';
import { GroupProvider } from './app/group';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <GroupProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </GroupProvider>
    </I18nProvider>
  </StrictMode>,
);
