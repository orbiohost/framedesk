import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { useDeleteWorkspace, useRenameWorkspace } from '../../features/workspaces/hooks.js';
import { planLabel, trialEndsLabel } from '../../features/workspaces/planLabel.js';
import { StorageMeter } from '../../features/workspaces/StorageMeter.jsx';
import { MembersSection } from '../../features/members/MembersSection.jsx';

const schema = z.object({ name: z.string().trim().min(1, 'Give the workspace a name').max(80) });

function RenameForm({ workspace }) {
  const rename = useRenameWorkspace(workspace.id);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm({ resolver: zodResolver(schema), defaultValues: { name: workspace.name } });

  function onSubmit(values) {
    rename.mutate(values, { onSuccess: (updated) => reset({ name: updated.name }) });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 p-5">
      {rename.error && <Alert tone="error">{rename.error.message}</Alert>}
      {rename.isSuccess && !isDirty && <Alert tone="success">Workspace name saved.</Alert>}
      <TextField
        id="name"
        label="Workspace name"
        hint="Shown to your team and on client review links."
        error={errors.name?.message}
        {...register('name')}
      />
      <Button type="submit" loading={rename.isPending} disabled={!isDirty}>
        Save
      </Button>
    </form>
  );
}

// Typing the name guards against deleting the wrong workspace by accident.
function DeleteWorkspaceDialog({ workspace, open, onClose }) {
  const deleteWorkspace = useDeleteWorkspace(workspace.id);
  const navigate = useNavigate();
  const [typedName, setTypedName] = useState('');
  const matches = typedName.trim() === workspace.name.trim();

  function close() {
    setTypedName('');
    deleteWorkspace.reset();
    onClose();
  }

  function submit(event) {
    event.preventDefault();
    if (!matches) return;
    deleteWorkspace.mutate(typedName, { onSuccess: () => navigate('/app', { replace: true }) });
  }

  return (
    <Dialog open={open} onClose={close} title={`Delete "${workspace.name}"?`}>
      <form onSubmit={submit} className="space-y-4">
        {deleteWorkspace.error && <Alert tone="error">{deleteWorkspace.error.message}</Alert>}
        <p className="text-muted text-sm">
          This permanently deletes the workspace and everything in it: projects, files, folders,
          tasks, calendar, clients, chat and notes. Every member loses access. This cannot be
          undone.
        </p>
        {!workspace.storage.shared && (
          <p className="text-muted text-sm">
            The plan on this workspace ends with it. If your other workspaces share this
            workspace&rsquo;s storage, delete those first.
          </p>
        )}
        <TextField
          id="confirm-workspace-name"
          label={`Type "${workspace.name}" to confirm`}
          value={typedName}
          onChange={(event) => setTypedName(event.target.value)}
          autoComplete="off"
          autoFocus
        />
        <DialogActions>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            loading={deleteWorkspace.isPending}
            disabled={!matches}
          >
            Delete workspace
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function DangerZone({ workspace }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Card>
      <CardHeader title="Delete workspace" />
      <div className="space-y-3 p-5">
        <p className="text-muted text-sm">Remove this workspace and all of its data for good.</p>
        <Button variant="danger" onClick={() => setIsOpen(true)}>
          Delete workspace
        </Button>
      </div>
      <DeleteWorkspaceDialog workspace={workspace} open={isOpen} onClose={() => setIsOpen(false)} />
    </Card>
  );
}

export function WorkspaceSettingsPage() {
  const { workspace } = useOutletContext();
  const trialNote = trialEndsLabel(workspace.billing);

  return (
    <>
      <PageHeader title="Settings" description="Workspace details, members and plan." />
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader title="General" />
          <RenameForm workspace={workspace} />
        </Card>

        <MembersSection workspace={workspace} />

        <Card>
          <CardHeader title="Plan and storage" />
          <div className="space-y-4 p-5">
            <div>
              <p className="text-sm font-medium">{planLabel(workspace.billing)}</p>
              {trialNote && <p className="text-muted text-sm">{trialNote}</p>}
              <Link
                to={`/w/${workspace.id}/upgrade`}
                className="hover:text-accent mt-2 inline-block text-sm font-medium underline underline-offset-4"
              >
                See plans and offers
              </Link>
            </div>
            <StorageMeter
              usedBytes={workspace.storage.usedBytes}
              limitBytes={workspace.storage.limitBytes}
            />
            {workspace.storage.shared && (
              <p className="text-muted text-sm">
                This workspace uses the plan and storage of &ldquo;
                {workspace.storage.accountWorkspaceName}&rdquo;, shared across your workspaces.
              </p>
            )}
          </div>
        </Card>

        {workspace.isOwner && <DangerZone workspace={workspace} />}
      </div>
    </>
  );
}
