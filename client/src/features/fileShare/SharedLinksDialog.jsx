import { Check, Copy, Globe, Link2, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { formatDate } from '../../lib/dates.js';
import { fileShareUrl, useDeleteFileShare, useFileShares } from './hooks.js';

function linkTitle(share) {
  const [first, ...rest] = share.files;
  return rest.length === 0 ? first.name : `${first.name} and ${rest.length} more`;
}

function LinkRow({ share, onDelete, deleting }) {
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const AudienceIcon = share.audience === 'anyone' ? Globe : UserRound;

  async function copy() {
    try {
      await navigator.clipboard.writeText(fileShareUrl(share.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="bg-subtle text-muted grid h-9 w-9 shrink-0 place-items-center rounded-xl">
        <AudienceIcon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium"
          title={share.files.map((file) => file.name).join('\n')}
        >
          {linkTitle(share)}
        </p>
        <p className="text-muted truncate text-xs">
          {share.audience === 'anyone' ? 'Anyone with link' : 'Signed-in only'} ·{' '}
          {share.isMine ? 'You' : (share.createdBy?.name ?? 'Someone')} ·{' '}
          {formatDate(share.createdAt)}
        </p>
      </div>
      {confirm ? (
        <div className="flex items-center gap-1.5">
          <Button variant="danger" size="sm" loading={deleting} onClick={() => onDelete(share.id)}>
            Stop sharing
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={copy}>
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirm(true)}
            aria-label={`Stop sharing ${linkTitle(share)}`}
            title="Stop sharing"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}
    </li>
  );
}

// Every file link in the workspace this person may manage, with a way to copy
// or switch each one off.
export function SharedLinksDialog({ workspaceId, open, onClose }) {
  const { data: shares, isPending, error } = useFileShares(workspaceId, { enabled: open });
  const remove = useDeleteFileShare(workspaceId);

  function close() {
    remove.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Shared file links"
      description="Links to single files or picked files, across the workspace."
      wide
    >
      {isPending && <Skeleton className="h-40 w-full" />}
      {error && <Alert tone="error">{error.message}</Alert>}
      {remove.error && <Alert tone="error">{remove.error.message}</Alert>}
      {shares?.length === 0 && (
        <EmptyState icon={Link2} title="No file links yet">
          Pick &ldquo;Share link&rdquo; on a file, or tick a few files and share them together.
        </EmptyState>
      )}
      {shares?.length > 0 && (
        <ul className="divide-line/60 divide-y">
          {shares.map((share) => (
            <LinkRow
              key={share.id}
              share={share}
              deleting={remove.isPending && remove.variables === share.id}
              onDelete={(id) => remove.mutate(id)}
            />
          ))}
        </ul>
      )}
    </Dialog>
  );
}
