import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { Captcha, useCaptcha } from '../../features/auth/Captcha.jsx';
import { GoogleSignIn } from '../../features/auth/GoogleSignIn.jsx';
import { useSignup } from '../../features/auth/hooks.js';
import { AuthLayout } from '../../layouts/AuthLayout.jsx';
import { applyServerFieldErrors } from '../../lib/forms.js';

const schema = z.object({
  name: z.string().trim().min(1, 'Tell us your name').max(80),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(10, 'Use at least 10 characters').max(128),
  workspaceName: z.string().trim().max(80).optional(),
});

export function SignupPage() {
  const signup = useSignup();
  const captcha = useCaptcha();
  const [captchaMissing, setCaptchaMissing] = useState(false);
  const location = useLocation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  function onSubmit(values) {
    if (!captcha.ready) return setCaptchaMissing(true);
    setCaptchaMissing(false);
    signup.mutate(
      { ...values, captchaToken: captcha.token },
      {
        onError: (error) => {
          captcha.reset();
          applyServerFieldErrors(error, setError);
        },
      },
    );
  }

  const showFormError = signup.error && !signup.error.details;

  return (
    <AuthLayout
      title="Start your studio"
      subtitle="Seven days free, 5 GB of storage. No card needed."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            state={location.state}
            className="text-ink font-medium underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <GoogleSignIn label="Sign up with Google" className="mb-5" />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {showFormError && <Alert tone="error">{signup.error.message}</Alert>}
        {captchaMissing && !captcha.ready && (
          <Alert tone="error">Please wait for the security check to finish.</Alert>
        )}
        <TextField
          id="name"
          label="Your name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters. A short sentence works well."
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          id="workspaceName"
          label="Studio name (optional)"
          placeholder="e.g. Northlight Films"
          hint="You can change this later."
          error={errors.workspaceName?.message}
          {...register('workspaceName')}
        />
        <Captcha {...captcha.props} />
        <Button type="submit" className="w-full" loading={signup.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
