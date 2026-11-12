import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { readCookie } from '../../lib/cookies.js';
import { clearPersistedQueries } from '../../lib/queryPersistence.js';
import { clearSignedUrls } from '../../lib/signedUrlCache.js';
import { clearVideoFrames } from '../files/videoFrames.js';
import { clearConvertedMedia } from '../media/browserConvert.js';
import { usersApi } from '../users/api.js';
import { authApi } from './api.js';

// Set by the server alongside the session cookies; carries no secret.
const SESSION_HINT_COOKIE = 'session_hint';

export const currentUserKey = ['currentUser'];

// Resolves to null (not an error) when nobody is signed in.
async function fetchCurrentUserOrNull() {
  if (!readCookie(SESSION_HINT_COOKIE)) return null;
  try {
    const { user } = await usersApi.me();
    return user;
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}

export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserKey,
    queryFn: fetchCurrentUserOrNull,
    staleTime: 5 * 60 * 1000,
  });
}

function useSignInMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: ({ user }) => switchSessionUser(queryClient, user),
  });
}

// Drops every cached query from the previous session except the current-user
// query itself. That one must be updated in place: removing it (e.g. with
// queryClient.clear()) detaches the route guards watching it, so they would
// never notice the sign-in and never redirect.
// Also wipes what the browser kept for the previous user: the saved query
// cache, signed file links, video thumbnails and media converted on this device.
function switchSessionUser(queryClient, user) {
  clearPersistedQueries();
  clearSignedUrls();
  clearConvertedMedia();
  clearVideoFrames();
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== currentUserKey[0],
  });
  queryClient.setQueryData(currentUserKey, user);
}

export function useLogin() {
  return useSignInMutation(authApi.login);
}

export function useSignup() {
  return useSignInMutation(authApi.signup);
}

function useSignOutMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => switchSessionUser(queryClient, null),
  });
}

export function useLogout() {
  return useSignOutMutation(authApi.logout);
}

export function useLogoutEverywhere() {
  return useSignOutMutation(authApi.logoutEverywhere);
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.verifyEmail,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: currentUserKey }),
  });
}

export function useResendVerification() {
  return useMutation({ mutationFn: authApi.resendVerification });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: authApi.forgotPassword });
}

export function useResetPassword() {
  return useSignOutMutation(authApi.resetPassword);
}
