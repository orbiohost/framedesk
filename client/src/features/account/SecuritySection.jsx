import { zodResolver } from '@hookform/resolvers/zod';
import { LogOut } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { applyServerFieldErrors } from '../../lib/forms.js';
import { useLogoutEverywhere } from '../auth/hooks.js';
import { useChangePassword } from '../users/hooks.js';
import { SettingsRow, SettingsSection } from './SettingsSection.jsx';

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(10, 'Use at least 10 characters').max(128),
});

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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
      {change.isSuccess && (
        <Alert tone="success">Password changed. Your other devices have been signed out.</Alert>
      )}
      {change.error && !change.error.details && <Alert tone="error">{change.error.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
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
          hint="At least 10 characters."
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
      </div>
      <Button type="submit" size="sm" loading={change.isPending}>
        Update password
      </Button>
    </form>
  );
}

function SignOutEverywhere() {
  const logoutEverywhere = useLogoutEverywhere();
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      {logoutEverywhere.error && <Alert tone="error">{logoutEverywhere.error.message}</Alert>}
      <Button
        size="sm"
        variant="danger"
        loading={logoutEverywhere.isPending}
        onClick={() =>
          logoutEverywhere.mutate(undefined, {
            onSuccess: () => navigate('/login', { replace: true }),
          })
        }
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sign out of all devices
      </Button>
    </div>
  );
}

export function SecuritySection() {
  return (
    <SettingsSection title="Security" description="Keep your account and your clients' work safe.">
      <SettingsRow
        label="Password"
        description="Changing it signs you out everywhere except this device."
      >
        <PasswordForm />
      </SettingsRow>
      <SettingsRow
        label="Active sessions"
        description="Lost a laptop or used a shared computer? End every session, including this one."
        align="center"
      >
        <SignOutEverywhere />
      </SettingsRow>
    </SettingsSection>
  );
}
