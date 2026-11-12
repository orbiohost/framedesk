import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { useResetPassword } from '../../features/auth/hooks.js';
import { AuthLayout } from '../../layouts/AuthLayout.jsx';

const schema = z
  .object({
    password: z.string().min(10, 'Use at least 10 characters').max(128),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: "Passwords don't match",
  });

const signInLink = (
  <Link to="/login" className="text-ink font-medium underline underline-offset-4">
    Go to sign in
  </Link>
);

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const reset = useResetPassword();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <AuthLayout title="Link incomplete" footer={signInLink}>
        <p className="text-muted">
          This reset link is missing its token. Open the link from the email again, or{' '}
          <Link to="/forgot-password" className="text-ink underline underline-offset-4">
            request a new one
          </Link>
          .
        </p>
      </AuthLayout>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthLayout title="Password updated" footer={signInLink}>
        <p className="text-muted">
          You&apos;ve been signed out on every device. Sign in again with your new password.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" footer={signInLink}>
      <form
        onSubmit={handleSubmit(({ password }) => reset.mutate({ token, password }))}
        noValidate
        className="space-y-5"
      >
        {reset.error && <Alert tone="error">{reset.error.message}</Alert>}
        <TextField
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters."
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          id="confirmPassword"
          label="Repeat new password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" className="w-full" loading={reset.isPending}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
