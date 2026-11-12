import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Logo } from '../../components/ui/Logo.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { useCreateWorkspace } from '../../features/workspaces/hooks.js';

const schema = z.object({ name: z.string().trim().min(1, 'Give the workspace a name').max(80) });

export function NewWorkspacePage() {
  const navigate = useNavigate();
  const createWorkspace = useCreateWorkspace();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  function onSubmit(values) {
    createWorkspace.mutate(values, {
      onSuccess: (workspace) => navigate(`/w/${workspace.id}`, { replace: true }),
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
      <Link to="/app" className="self-start rounded">
        <Logo />
      </Link>
      <div className="flex flex-1 flex-col justify-center py-12">
        <h1 className="font-display text-[44px] leading-[1.05] tracking-tight">New workspace</h1>
        <p className="text-muted mt-3">
          A workspace holds its own clients, projects, files and team. Use one per studio or brand.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-10 space-y-5">
          {createWorkspace.error && <Alert tone="error">{createWorkspace.error.message}</Alert>}
          <TextField
            id="name"
            label="Workspace name"
            placeholder="e.g. Northlight Films"
            autoFocus
            error={errors.name?.message}
            {...register('name')}
          />
          <Button type="submit" className="w-full" loading={createWorkspace.isPending}>
            Create workspace
          </Button>
        </form>
      </div>
    </main>
  );
}
