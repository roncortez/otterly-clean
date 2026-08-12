import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/shared/auth/AuthContext';
import { ConfigProvider } from '@/shared/config/ConfigContext';
import { I18nProvider } from '@/shared/i18n/I18nContext';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ConfigProvider>
          <I18nProvider>
            <App />
          </I18nProvider>
        </ConfigProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
