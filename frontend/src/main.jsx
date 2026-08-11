import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

import { LanguageProvider } from './contexts/LanguageContext'

// Prevent multi-touch pinch-zoom and double-tap zoom gestures on mobile browsers/webviews
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

document.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  },
  { passive: false }
);

let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      const targetTag = e.target.tagName?.toLowerCase();
      if (targetTag !== 'input' && targetTag !== 'textarea') {
        e.preventDefault();
      }
    }
    lastTouchEnd = now;
  },
  { passive: false }
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
)


