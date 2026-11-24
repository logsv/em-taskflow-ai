import React from 'react';
import ReactDOM from 'react-dom/client';
import './components/ui/tokens.css';
import './index.css';
import App from './App';
import AuthGate from './auth/AuthGate';
import { installAuthFetchInterceptor } from './auth/authEvents';

installAuthFetchInterceptor();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
