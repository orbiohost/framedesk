import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { useCurrentUser, useVerifyEmail } from '../../features/auth/hooks.js';
import { AuthLayout } from '../../layouts/AuthLayout.jsx';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const verify = useVerifyEmail();
  const { data: user } = useCurrentUser();
  // StrictMode runs effects twice in development; a token can only be used once.
  const hasSubmitted = useRef(false);

  useEffect(() => {
    if (!token || hasSubmitted.current) return;
    hasSubmitted.current = true;
    verify.mutate(token);
  }, [token, verify]);

  const continueLink = (
    <Link
      to={user ? '/app' : '/login'}
      className="text-ink font-medium underline underline-offset-4"
    >
      {user ? 'Continue to your workspace' : 'Sign in'}
    </Link>
  );

  if (!token) {
    return (
      <AuthLayout title="Link incomplete" footer={continueLink}>
        <p className="text-muted">
          Open the link from your email again. It should include a token.
        </p>
      </AuthLayout>
    );
  }

  if (verify.isSuccess) {
    return (
      <AuthLayout title="Email confirmed" footer={continueLink}>
        <p className="text-muted">
          Thanks. You&apos;ll get invites, review requests and billing emails here.
        </p>
      </AuthLayout>
    );
  }

  if (verify.isError) {
    return (
      <AuthLayout title="That link didn't work" footer={continueLink}>
        <Alert tone="error">{verify.error.message}</Alert>
        <p className="text-muted mt-4 text-sm">
          Sign in and use &ldquo;Resend link&rdquo; at the top of the app to get a fresh one.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Confirming your email">
      <p className="text-muted flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        One moment…
      </p>
    </AuthLayout>
  );
}
