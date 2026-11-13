import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeCheck, CircleAlert, ImageUp } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { useUpdateProfile } from '../users/hooks.js';
import { SettingsRow, SettingsSection } from './SettingsSection.jsx';

const profileSchema = z.object({ name: z.string().trim().min(1, 'Name is required').max(80) });

function NameForm({ user }) {
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
      {update.error && <Alert tone="error">{update.error.message}</Alert>}
      <TextField
        id="name"
        label="Full name"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={update.isPending} disabled={!isDirty}>
          Save name
        </Button>
        {isDirty && (
          <Button type="button" size="sm" variant="ghost" onClick={() => reset()}>
            Cancel
          </Button>
        )}
        {update.isSuccess && !isDirty && <span className="text-success text-xs">Saved</span>}
      </div>
    </form>
  );
}

export function ProfileSection({ user, onChangePicture }) {
  return (
    <SettingsSection title="Profile" description="How you appear to teammates and clients.">
      <SettingsRow
        label="Profile picture"
        description="Shown on tasks, comments and chat."
        align="center"
      >
        <div className="flex items-center gap-4">
          <Avatar name={user.name} src={user.avatarUrl} size="lg" />
          <Button size="sm" variant="secondary" onClick={onChangePicture}>
            <ImageUp className="h-4 w-4" aria-hidden="true" />
            Change picture
          </Button>
        </div>
      </SettingsRow>
      <SettingsRow label="Name" description="Use the name your team knows you by.">
        <NameForm user={user} />
      </SettingsRow>
      <SettingsRow
        label="Email address"
        description="Used to sign in and for receipts. Contact support to change it."
      >
        <div className="border-line bg-subtle/50 flex h-10 items-center justify-between gap-3 rounded-xl border px-3.5">
          <span className="truncate text-sm">{user.email}</span>
          {user.emailVerified ? (
            <span className="text-success inline-flex shrink-0 items-center gap-1 text-xs font-medium">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Verified
            </span>
          ) : (
            <span className="text-warning inline-flex shrink-0 items-center gap-1 text-xs font-medium">
              <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              Not verified
            </span>
          )}
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
