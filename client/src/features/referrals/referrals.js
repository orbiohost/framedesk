import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../../lib/apiClient.js';
import { readLocal, removeLocal, writeLocal } from '../../lib/storage.js';

// Refer & earn. A link like /signup?ref=CODE (or any page with ?ref=) leaves
// the code in this browser; once someone is signed in, it is claimed for
// their account (email or Google sign-up alike), then forgotten.

const STORAGE_KEY = 'fd:ref';
const CODE = /^[A-Za-z0-9]{4,16}$/;

// Called once at startup, before the router tidies the URL.
export function captureReferral() {
  try {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (code && CODE.test(code)) writeLocal(STORAGE_KEY, code.toUpperCase());
  } catch {
    // No URL to read (tests, previews).
  }
}

export function pendingReferral() {
  const code = readLocal(STORAGE_KEY);
  return code && CODE.test(code) ? code : null;
}

// In the signed-in app: claims a code waiting in this browser, once.
export function useClaimPendingReferral(enabled) {
  const queryClient = useQueryClient();
  const tried = useRef(false);
  useEffect(() => {
    const code = pendingReferral();
    if (!enabled || !code || tried.current) return;
    tried.current = true;
    api
      .post('/referrals/claim', { code })
      .then(() => {
        removeLocal(STORAGE_KEY);
        queryClient.invalidateQueries({ queryKey: ['referrals'] });
      })
      .catch((error) => {
        // Refused for good (own code, too late...): forget it. Offline: try next time.
        if (error?.status && error.status < 500) removeLocal(STORAGE_KEY);
      });
  }, [enabled, queryClient]);
}

export function useMyReferrals() {
  return useQuery({
    queryKey: ['referrals', 'me'],
    queryFn: async () => (await api.get('/referrals/me')).referrals,
  });
}

export function useCopy() {
  return useMutation({ mutationFn: (text) => navigator.clipboard.writeText(text) });
}
