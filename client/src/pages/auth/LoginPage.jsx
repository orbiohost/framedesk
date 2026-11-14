import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { Captcha, useCaptcha } from '../../features/auth/Captcha.jsx';
import { GoogleSignIn, googleErrorMessage } from '../../features/auth/GoogleSignIn.jsx';
import { useLogin } from '../../features/auth/hooks.js';
import { AuthLayout } from '../../layouts/AuthLayout.jsx';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export function LoginPage() {
  const login = useLogin();
  const captcha = useCaptcha();
  const [captchaMissing, setCaptchaMissing] = useState(false);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // Set when Google sign-in sends the person back here with a problem.
  const googleError = googleErrorMessage(searchParams.get('error'));
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your studio."
      footer={
        <>
          New to FrameDesk?{' '}
          <Link
            to="/signup"
            state={location.state}
            className="text-ink font-medium underline underline-offset-4"
          >
            Create an account
          </Link>
        </>
      }
    >
      {googleError && !login.error && (
        <Alert tone="error" className="mb-5">
          {googleError}
        </Alert>
      )}
      <GoogleSignIn className="mb-5" />
      <form
        onSubmit={handleSubmit((values) => {
          if (!captcha.ready) return setCaptchaMissing(true);
          setCaptchaMissing(false);
          login.mutate(
            { ...values, captchaToken: captcha.token },
            { onError: () => captcha.reset() },
          );
        })}
        noValidate
        className="space-y-5"
      >
        {login.error && <Alert tone="error">{login.error.message}</Alert>}
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
        <div>
          <TextField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Link
            to="/forgot-password"
            className="text-muted hover:text-ink mt-2 inline-block text-sm underline-offset-4 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
        <Captcha {...captcha.props} />
        <Button type="submit" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
