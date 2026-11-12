import { ArrowLeft, Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { ClientFormDialog } from '../../features/clients/ClientFormDialog.jsx';
import { useClient, useDeleteClient, useSetClientArchived } from '../../features/clients/hooks.js';
import { useProjects } from '../../features/projects/hooks.js';
import { ProjectFormDialog } from '../../features/projects/ProjectFormDialog.jsx';
import { ProjectRows } from '../../features/projects/ProjectRow.jsx';
import { canManage } from '../../features/workspaces/roles.js';

function ContactCard({ client }) {
  return (
    <Card className="space-y-4 p-5 text-sm">
      {client.email && (
        <a href={`mailto:${client.email}`} className="hover:text-accent flex items-center gap-2">
          <Mail className="text-muted h-4 w-4" aria-hidden="true" /> {client.email}
        </a>
      )}
      {client.phone && (
        <a href={`tel:${client.phone}`} className="hover:text-accent flex items-center gap-2">
          <Phone className="text-muted h-4 w-4" aria-hidden="true" /> {client.phone}
        </a>
      )}
      {client.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {client.tags.map((tag) => (
            <Badge key={tag} tone="muted">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      <div className="border-line border-t pt-4">
        <p className="text-muted mb-1 text-xs uppercase tracking-[0.12em]">Notes</p>
        <p className="whitespace-pre-line">{client.notes || 'No notes yet.'}</p>
      </div>
    </Card>
  );
}

function ArchiveButton({ workspaceId, client }) {
  const setArchived = useSetClientArchived(workspaceId);
  return (
    <Button
      variant="ghost"
      loading={setArchived.isPending}
      onClick={() => setArchived.mutate({ id: client.id, archived: !client.archived })}
    >
      {client.archived ? 'Restore' : 'Archive'}
    </Button>
  );
}

function DeleteClientDialog({ workspaceId, client, open, onClose }) {
  const deleteClient = useDeleteClient(workspaceId);
  const navigate = useNavigate();

  function confirm() {
    deleteClient.mutate(client.id, {
      onSuccess: () => navigate(`/w/${workspaceId}/clients`, { replace: true }),
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Delete ${client.name}?`}>
      {deleteClient.error && <Alert tone="error">{deleteClient.error.message}</Alert>}
      <p className="text-sm">
        This permanently removes the client and their contact details.
        {client.projectCount > 0 &&
          ` Their ${client.projectCount} project${client.projectCount === 1 ? '' : 's'} will be kept, just without a client.`}{' '}
        If you only want to hide them, use Archive instead.
      </p>
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" loading={deleteClient.isPending} onClick={confirm}>
          Delete client
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ClientDetailPage() {
  const { workspace } = useOutletContext();
  const { clientId } = useParams();
  const { data: client, isPending, isError, error } = useClient(workspace.id, clientId);
  const { data: projects } = useProjects(workspace.id, { clientId });
  const [dialog, setDialog] = useState(null);
  const manager = canManage(workspace);

  if (isPending) return <Skeleton className="h-48 w-full max-w-3xl" />;
  if (isError) return <Alert tone="error">{error.message}</Alert>;

  return (
    <>
      <Link
        to={`/w/${workspace.id}/clients`}
        className="text-muted hover:text-ink mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Clients
      </Link>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
            {client.name}
          </h1>
          <p className="text-muted mt-1">
            {client.company ?? 'Independent'}
            {client.archived && ' · Archived'}
          </p>
        </div>
        {manager && (
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => setDialog('delete')}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
            </Button>
            <ArchiveButton workspaceId={workspace.id} client={client} />
            <Button variant="secondary" onClick={() => setDialog('client')}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
            </Button>
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Projects</h2>
            {manager && (
              <Button size="sm" variant="secondary" onClick={() => setDialog('project')}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New project
              </Button>
            )}
          </div>
          {projects?.length > 0 ? (
            <ProjectRows projects={projects} workspaceId={workspace.id} hideClient />
          ) : (
            <EmptyState title="No projects yet">
              Projects for {client.name} will be listed here.
            </EmptyState>
          )}
        </section>
        <ContactCard client={client} />
      </div>

      <ClientFormDialog
        workspaceId={workspace.id}
        open={dialog === 'client'}
        onClose={() => setDialog(null)}
        client={client}
      />
      <DeleteClientDialog
        workspaceId={workspace.id}
        client={client}
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
      />
      <ProjectFormDialog
        workspaceId={workspace.id}
        open={dialog === 'project'}
        onClose={() => setDialog(null)}
        defaults={{ clientId: client.id }}
      />
    </>
  );
}
