import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['Authorization'];
        delete event.request.headers['X-CSRF-Token'];
      }
      return event;
    },
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
