import { Loader2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useCurrentUser, useLogout } from '../../features/auth/hooks.js';
import { useAcceptInvite, useInvitePreview } from '../../features/members/hooks.js';
import { AuthLayout } from '../../layouts/AuthLayout.jsx';

// /invite/:token: the link from an invite email. Works signed in or out; a
// signed-out visitor signs in or signs up and comes straight back here.
export function AcceptInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { data: user, isPending: userPending } = useCurrentUser();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite(token);
  const logout = useLogout();
  const back = { from: `/invite/${token}` };

  if (preview.isPending || userPending) {
    return (
      <AuthLayout title="Opening your invite">
        <p className="text-muted flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          One moment…
        </p>
      </AuthLayout>
    );
  }

  if (preview.isError) {
    return (
      <AuthLayout
        title="That invite didn't work"
        footer={
          <Link to={user ? '/app' : '/login'} className="text-ink font-medium underline">
            {user ? 'Go to your workspace' : 'Sign in'}
          </Link>
        }
      >
        <Alert tone="error">{preview.error.message}</Alert>
        <p className="text-muted mt-4 text-sm">Ask whoever invited you to send a new invite.</p>
      </AuthLayout>
    );
  }

  const invite = preview.data;
  const title = `Join ${invite.workspaceName}`;
  const subtitle = `${invite.invitedBy ?? 'Someone'} invited ${invite.email} as ${invite.role === 'admin' ? 'an' : 'a'} ${invite.role}.`;
  const openWorkspace = () => navigate(`/w/${invite.workspaceId}`, { replace: true });

  if (invite.alreadyMember) {
    return (
      <AuthLayout title={title} subtitle="You're already in this workspace.">
        <Button className="w-full" onClick={openWorkspace}>
          Open workspace
        </Button>
      </AuthLayout>
    );
  }

  if (invite.expired) {
    return (
      <AuthLayout title="This invite has expired" subtitle={subtitle}>
        <p className="text-muted text-sm">Ask {invite.invitedBy ?? 'them'} to invite you again.</p>
      </AuthLayout>
    );
  }

  if (!user) {
    return (
      <AuthLayout title={title} subtitle={subtitle}>
        <div className="space-y-3">
          <p className="text-muted text-sm">
            Sign in, or create a free account, with{' '}
            <strong className="text-ink">{invite.email}</strong> to accept.
          </p>
          <Button className="w-full" onClick={() => navigate('/signup', { state: back })}>
            Create account
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => navigate('/login', { state: back })}
          >
            I already have an account
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (!invite.emailMatches) {
    return (
      <AuthLayout title={title} subtitle={subtitle}>
        <Alert tone="error">
          You&apos;re signed in as {user.email}, but this invite is for {invite.email}.
        </Alert>
        <Button
          variant="secondary"
          className="mt-4 w-full"
          loading={logout.isPending}
          onClick={() =>
            logout.mutate(undefined, { onSuccess: () => navigate(`/invite/${token}`) })
          }
        >
          Sign out and use {invite.email}
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={title} subtitle={subtitle}>
      {accept.error && <Alert tone="error">{accept.error.message}</Alert>}
      <Button
        className="mt-2 w-full"
        loading={accept.isPending}
        onClick={() => accept.mutate(undefined, { onSuccess: openWorkspace })}
      >
        Accept and open workspace
      </Button>
    </AuthLayout>
  );
}
