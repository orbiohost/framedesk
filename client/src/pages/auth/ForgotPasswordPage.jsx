import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { Captcha, useCaptcha } from '../../features/auth/Captcha.jsx';
import { useForgotPassword } from '../../features/auth/hooks.js';
import { AuthLayout } from '../../layouts/AuthLayout.jsx';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address') });

const backToLogin = (
  <Link to="/login" className="text-ink font-medium underline underline-offset-4">
    Back to sign in
  </Link>
);

export function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const captcha = useCaptcha();
  const [captchaMissing, setCaptchaMissing] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  if (forgot.isSuccess) {
    return (
      <AuthLayout title="Check your inbox" footer={backToLogin}>
        <p className="text-muted">
          If an account exists for <span className="text-ink">{getValues('email')}</span>,
          we&apos;ve sent a link to reset the password. It expires in one hour.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send you a link."
      footer={backToLogin}
    >
      <form
        onSubmit={handleSubmit(({ email }) => {
          if (!captcha.ready) return setCaptchaMissing(true);
          setCaptchaMissing(false);
          forgot.mutate({ email, captchaToken: captcha.token }, { onError: () => captcha.reset() });
        })}
        noValidate
        className="space-y-5"
      >
        {forgot.error && <Alert tone="error">{forgot.error.message}</Alert>}
        {captchaMissing && !captcha.ready && (
          <Alert tone="error">Please wait for the security check to finish.</Alert>
        )}
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Captcha {...captcha.props} />
        <Button type="submit" className="w-full" loading={forgot.isPending}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
