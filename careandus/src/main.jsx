import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/latin-400.css';
import '@fontsource/ibm-plex-sans-arabic/latin-500.css';
import '@fontsource/ibm-plex-sans-arabic/latin-600.css';
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/amiri/arabic-700.css';
import '@fontsource/amiri/latin-700.css';
import './styles/index.css';
import App from './App.jsx';
import { wipeAll } from './lib/photoStore.js';

// A reload ends the consultation: orphaned session photos from a previous run are erased at boot.
wipeAll();

try {
  const theme = localStorage.getItem('khusla.theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
} catch {
  // default light theme
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
