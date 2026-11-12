import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ChevronRight, DatabaseBackup, Settings } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { useCurrentUser, useLogoutEverywhere } from '../../features/auth/hooks.js';
import { canAdminister } from '../../features/workspaces/roles.js';
import { useChangePassword, useUpdateProfile } from '../../features/users/hooks.js';
import { applyServerFieldErrors } from '../../lib/forms.js';

// The avatar styles are a few hundred KB, so they load only on this page.
const AvatarPicker = lazy(() => import('../../features/users/AvatarPicker.jsx'));

const profileSchema = z.object({ name: z.string().trim().min(1, 'Name is required').max(80) });

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(10, 'Use at least 10 characters').max(128),
});

function ProfileForm({ user }) {
  const update = useUpdateProfile();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm({ resolver: zodResolver(profileSchema), defaultValues: { name: user.name } });

  function onSubmit(values) {
    update.mutate(values, { onSuccess: ({ user: saved }) => reset({ name: saved.name }) });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 p-5">
      {update.error && <Alert tone="error">{update.error.message}</Alert>}
      <TextField
        id="name"
        label="Name"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField id="email" label="Email" value={user.email} readOnly disabled />
      <Button type="submit" loading={update.isPending} disabled={!isDirty}>
        Save
      </Button>
    </form>
  );
}

function PasswordForm() {
  const change = useChangePassword();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(passwordSchema) });

  function onSubmit(values) {
    change.mutate(values, {
      onSuccess: () => reset(),
      onError: (error) => applyServerFieldErrors(error, setError),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 p-5">
      {change.isSuccess && (
        <Alert tone="success">Password changed. Other devices have been signed out.</Alert>
      )}
      {change.error && !change.error.details && <Alert tone="error">{change.error.message}</Alert>}
      <TextField
        id="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <TextField
        id="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <Button type="submit" loading={change.isPending}>
        Change password
      </Button>
    </form>
  );
}

function SessionsCard() {
  const logoutEverywhere = useLogoutEverywhere();
  const navigate = useNavigate();

  function signOutEverywhere() {
    logoutEverywhere.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) });
  }

  return (
    <Card>
      <CardHeader
        title="Sessions"
        description="Lost a laptop or used a shared computer? Sign out on every device, including this one."
      />
      <div className="p-5">
        {logoutEverywhere.error && <Alert tone="error">{logoutEverywhere.error.message}</Alert>}
        <Button variant="danger" onClick={signOutEverywhere} loading={logoutEverywhere.isPending}>
          Sign out everywhere
        </Button>
      </div>
    </Card>
  );
}

function WorkspaceAdminCard({ workspace }) {
  const base = `/w/${workspace.id}`;
  const links = [
    {
      to: `${base}/settings`,
      icon: Settings,
      label: 'Workspace settings',
      hint: 'Name, members, roles and plan',
    },
    {
      to: `${base}/backup`,
      icon: DatabaseBackup,
      label: 'Backup & restore',
      hint: 'Download or restore a copy of this workspace',
    },
  ];
  return (
    <Card>
      <CardHeader title={workspace.name} description="Admin tools for this workspace." />
      <ul className="p-2">
        {links.map(({ to, icon: Icon, label, hint }) => (
          <li key={to}>
            <Link to={to} className="hover:bg-subtle flex items-center gap-3 rounded-xl px-3 py-3">
              <Icon className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className="text-muted block text-xs">{hint}</span>
              </span>
              <ChevronRight className="text-muted h-4 w-4" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AccountPage() {
  const { data: user } = useCurrentUser();
  const { workspace } = useOutletContext() ?? {};

  return (
    <>
      <PageHeader
        title="Your account"
        description="These settings apply across all your workspaces."
      />
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader title="Profile" />
          <Suspense fallback={<Skeleton className="m-5 h-40" />}>
            <AvatarPicker user={user} />
          </Suspense>
          <ProfileForm user={user} />
        </Card>
        <Card>
          <CardHeader title="Password" />
          <PasswordForm />
        </Card>
        {workspace && canAdminister(workspace) && <WorkspaceAdminCard workspace={workspace} />}
        <SessionsCard />
      </div>
    </>
  );
}
