import { AsyncLocalStorage } from 'node:async_hooks';

// Carries the server-verified metadata from the Express check into the tus
// onUploadCreate hook. tus builds its own Request from the raw headers, so
// anything set on Express's req object never reaches it.
export const verifiedUploadMetadata = new AsyncLocalStorage();
