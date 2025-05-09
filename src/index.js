// index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWAとしてアプリを登録
// オフライン機能などを有効にする場合は、unregister()をregister()に変更
serviceWorkerRegistration.register();