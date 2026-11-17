import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AuthGate from './AuthGate.jsx';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<AuthGate><App /></AuthGate>);
