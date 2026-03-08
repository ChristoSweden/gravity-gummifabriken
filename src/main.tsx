import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { installGlobalErrorHandlers, captureError } from './utils/errorTracking';

import * as ReactDOMClient from 'react-dom/client';

// Install global error & unhandled rejection handlers
installGlobalErrorHandlers();

// Apply saved theme preference (dark by default)
const savedTheme = localStorage.getItem('gravity-theme');
if (savedTheme === 'light') {
  document.documentElement.setAttribute('data-theme', 'light');
} else {
  document.documentElement.setAttribute('data-theme', 'dark');
}

// Register service worker for offline support and push notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      captureError(err, { context: 'serviceWorker.register' });
    });
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOMClient.createRoot ? ReactDOMClient.createRoot(rootElement) : (ReactDOMClient as any).default.createRoot(rootElement);
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
}
