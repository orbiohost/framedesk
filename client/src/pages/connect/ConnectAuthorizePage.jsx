import { Ban, Eye, FolderLock, Loader2, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Logo } from '../../components/ui/Logo.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useCurrentUser } from '../../features/auth/hooks.js';
import { DownloadsSwitch } from '../../features/connectors/DownloadsSwitch.jsx';
import { WorkspaceAccessPicker } from '../../features/connectors/WorkspaceAccessPicker.jsx';
import {
  useAuthorizationRequest,
  useDecideAuthorization,
} from '../../features/connectors/hooks.js';

const PROMISES = [
  {
    icon: Eye,
    text: 'Read your projects, tasks, clients, calendar, notes, file details, AI summaries and transcripts.',
  },
  { icon: FolderLock, text: 'Only what you can already see. Locked folders stay locked.' },
  {
    icon: Ban,
    text: 'It cannot change, delete or share anything. Downloading files is off unless you allow it below.',
  },
];

function Shell({ children }) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8 sm:py-14">
      <Link to="/app" className="rounded">
        <Logo />
      </Link>
      <main className="bg-surface border-line/60 shadow-soft mt-8 w-full max-w-md rounded-3xl border p-6 sm:p-8">
        {children}
      </main>
    </div>
  );
}

export function ConnectAuthorizePage() {
  const [searchParams] = useSearchParams();
  const params = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams]);
  const { data: user } = useCurrentUser();
  const request = useAuthorizationRequest(params);
  const decide = useDecideAuthorization();
  const [access, setAccess] = useState({
    allWorkspaces: true,
    workspaceIds: [],
    allowDownloads: false,
  });
  const [leaving, setLeaving] = useState(false);

  function answer(approve) {
    decide.mutate(
      { params, approve, ...access },
      {
        onSuccess: ({ redirectTo }) => {
          setLeaving(true);
          window.location.assign(redirectTo);
        },
      },
    );
  }

  if (request.isPending) {
    return (
      <Shell>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="mt-4 h-24 w-full" />
        <Skeleton className="mt-4 h-10 w-full" />
      </Shell>
    );
  }

  if (request.isError) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">This connection link doesn&apos;t work</h1>
        <Alert tone="error" className="mt-4">
          {request.error.message}
        </Alert>
        <p className="text-muted mt-4 text-sm">
          Close this tab and start connecting again from your AI app.
        </p>
      </Shell>
    );
  }

  const { client, workspaces, error } = request.data;

  if (leaving) {
    return (
      <Shell>
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Taking you back to {client.name}…</p>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">{client.name} sent an incomplete request</h1>
        <Alert tone="error" className="mt-4">
          {error.error_description}
        </Alert>
        <Button
          className="mt-5 w-full"
          variant="secondary"
          loading={decide.isPending}
          onClick={() => answer(false)}
        >
          Go back to {client.name}
        </Button>
      </Shell>
    );
  }

  const nothingToShare = workspaces.length === 0;
  const nothingPicked = !access.allWorkspaces && access.workspaceIds.length === 0;

  return (
    <Shell>
      <span className="bg-lavender text-accent grid h-11 w-11 place-items-center rounded-2xl">
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-semibold leading-snug">
        Connect <span className="text-accent">{client.name}</span> to FrameDesk?
      </h1>
      <p className="text-muted mt-1.5 text-sm">
        {client.host && (
          <>
            You&apos;ll be sent back to <span className="text-ink font-medium">{client.host}</span>
            .{' '}
          </>
        )}
        Signed in as {user?.email}.
      </p>

      <ul className="mt-5 space-y-3">
        {PROMISES.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-3 text-sm">
            <Icon className="text-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <div className="border-line/70 mt-6 border-t pt-5">
        {nothingToShare ? (
          <Alert tone="info">
            You aren&apos;t a team member of any workspace yet, so there&apos;s nothing to connect.
          </Alert>
        ) : (
          <>
            <p className="mb-2.5 text-sm font-medium">Which workspaces can it read?</p>
            <WorkspaceAccessPicker workspaces={workspaces} value={access} onChange={setAccess} />
            <div className="mt-4">
              <DownloadsSwitch
                checked={access.allowDownloads}
                onChange={(allowDownloads) =>
                  setAccess((current) => ({ ...current, allowDownloads }))
                }
              />
            </div>
          </>
        )}
      </div>

      {decide.error && (
        <Alert tone="error" className="mt-4">
          {decide.error.message}
        </Alert>
      )}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
        <Button
          variant="secondary"
          className="sm:flex-1"
          disabled={decide.isPending}
          onClick={() => answer(false)}
        >
          Cancel
        </Button>
        <Button
          className="sm:flex-1"
          loading={decide.isPending}
          disabled={nothingToShare || nothingPicked}
          onClick={() => answer(true)}
        >
          Allow access
        </Button>
      </div>
      <p className="text-muted mt-4 text-xs leading-5">
        Only connect apps you trust. You can disconnect it any time from Account → AI connectors.
      </p>
    </Shell>
  );
}
