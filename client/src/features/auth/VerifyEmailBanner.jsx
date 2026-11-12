import { useCurrentUser, useResendVerification } from './hooks.js';

export function VerifyEmailBanner() {
  const { data: user } = useCurrentUser();
  const resend = useResendVerification();

  if (!user || user.emailVerified) return null;

  return (
    <div className="bg-surface shadow-soft mb-4 rounded-2xl px-4 py-2.5 text-sm">
      <span className="text-ink">Confirm your email.</span>{' '}
      <span className="text-muted">We sent a link to {user.email}.</span>{' '}
      {resend.isSuccess ? (
        <span className="text-success">Sent. Check your inbox.</span>
      ) : (
        <button
          type="button"
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
          className="hover:text-accent font-medium underline underline-offset-4"
        >
          {resend.isPending ? 'Sending…' : 'Resend link'}
        </button>
      )}
      {resend.error && <span className="text-danger ml-2">{resend.error.message}</span>}
    </div>
  );
}
