import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './app/providers.jsx';
import { router } from './app/router.jsx';
import { registerMediaWorker } from './features/media/mediaStream.js';
import './styles/index.css';

registerMediaWorker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
