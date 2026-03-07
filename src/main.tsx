import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

import * as ReactDOMClient from 'react-dom/client';

// Apply saved theme preference
const savedTheme = localStorage.getItem('gravity-theme');
if (savedTheme) {
  document.documentElement.setAttribute('data-theme', savedTheme);
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
