import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { api } from '../../lib/apiClient.js';
import { cn } from '../../lib/cn.js';

const GOOGLE_ERRORS = {
  google_cancelled: 'Google sign-in was cancelled.',
  google_expired: 'That sign-in took too long or was opened in another tab. Please try again.',
  google_unverified: 'Your Google account has no verified email address, so it can’t be used here.',
  google_failed: 'We couldn’t sign you in with Google. Please try again.',
  account_suspended: 'This account has been suspended.',
};

export function googleErrorMessage(code) {
  return code ? (GOOGLE_ERRORS[code] ?? null) : null;
}

function useAuthProviders() {
  return useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => api.get('/auth/providers'),
    staleTime: Infinity,
    retry: false,
  });
}

// Google's "G", in its own colours (as Google's sign-in guidelines ask).
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

// A plain link: the whole page goes to Google and comes back signed in, to
// wherever the person was headed (e.g. an AI connector's consent screen).
export function GoogleSignIn({ label = 'Continue with Google', className }) {
  const { data } = useAuthProviders();
  const location = useLocation();
  if (!data?.google) return null;

  const next = location.state?.from ?? '/app';
  const href = `/api/auth/google?${new URLSearchParams({ next })}`;

  return (
    <div className={cn('space-y-5', className)}>
      <a
        href={href}
        className="border-line bg-surface text-ink hover:bg-subtle flex h-11 w-full items-center justify-center gap-3 rounded-full border text-sm font-medium shadow-sm transition-colors"
      >
        <GoogleMark />
        {label}
      </a>
      <div className="text-muted flex items-center gap-3 text-xs uppercase tracking-[0.12em]">
        <span className="bg-line h-px flex-1" />
        or
        <span className="bg-line h-px flex-1" />
      </div>
    </div>
  );
}
