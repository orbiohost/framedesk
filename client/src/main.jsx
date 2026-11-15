import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './app/providers.jsx';
import { router } from './app/router.jsx';
import { installContextMenu } from './features/files/ActionMenu.jsx';
import { initInstallState } from './features/install/installState.js';
import { registerMediaWorker } from './features/media/mediaStream.js';
import { captureReferral } from './features/referrals/referrals.js';
import './styles/index.css';

// Before anything renders: the browser's install offer fires early, once.
initInstallState();
// A referral link (?ref=CODE) is remembered until someone signs in.
captureReferral();
registerMediaWorker();
installContextMenu();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
