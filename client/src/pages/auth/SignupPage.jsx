import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
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
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  function onSubmit(values) {
    signup.mutate(values, { onError: (error) => applyServerFieldErrors(error, setError) });
  }

  const showFormError = signup.error && !signup.error.details;

  return (
    <AuthLayout
      title="Start your studio"
      subtitle="Seven days free, 5 GB of storage. No card needed."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-ink font-medium underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {showFormError && <Alert tone="error">{signup.error.message}</Alert>}
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
        <Button type="submit" className="w-full" loading={signup.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
