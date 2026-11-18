import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PwaBanners } from './components/PwaBanners';
import './index.css';
import { decideRoute } from './site/route';
import { SiteApp } from './components/site/SiteApp';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// sito pubblico (ecodispensa.it, /partner, /guida) oppure app (ecodispensa.it/app): si decide all'apertura
const route = decideRoute();

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {route === "site" ? (
      <SiteApp />
    ) : (
      <>
        <App />
        <PwaBanners />
      </>
    )}
  </React.StrictMode>
);
