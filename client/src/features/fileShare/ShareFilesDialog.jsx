import { Globe, Info, Link2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { formatBytes } from '../../lib/format.js';
import { fileTint } from '../files/FileThumbnail.jsx';
import { FileTypeIcon } from '../files/FileTypeIcon.jsx';
import { SHARE_AUDIENCE_OPTIONS } from '../projectShare/hooks.js';
import { ChoiceGroup, CopyLinkField } from '../projectShare/ShareProjectDialog.jsx';
import { cn } from '../../lib/cn.js';
import {
  fileShareUrl,
  MAX_SHARED_FILES,
  useCreateFileShare,
  useDeleteFileShare,
  useFileShareFor,
  useUpdateFileShare,
} from './hooks.js';

const SHOWN_FILES = 4;

function FileList({ files }) {
  const shown = files.slice(0, SHOWN_FILES);
  return (
    <ul className="border-line divide-line/60 divide-y rounded-2xl border">
      {shown.map((file) => (
        <li key={file.id} className="flex items-center gap-3 px-3 py-2">
          <span
            className={cn(
              'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
              fileTint(file.category),
            )}
          >
            <FileTypeIcon category={file.category} className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={file.name}>
            {file.name}
          </span>
          <span className="text-muted shrink-0 text-xs tabular-nums">{formatBytes(file.size)}</span>
        </li>
      ))}
      {files.length > shown.length && (
        <li className="text-muted px-3 py-2 text-xs">and {files.length - shown.length} more</li>
      )}
    </ul>
  );
}

function ShareFilesBody({ workspaceId, files, onClose }) {
  const fileIds = files.map((file) => file.id);
  const tooMany = fileIds.length > MAX_SHARED_FILES;
  const {
    data: share,
    isPending,
    error,
  } = useFileShareFor(workspaceId, fileIds, {
    enabled: !tooMany,
  });
  const create = useCreateFileShare(workspaceId);
  const update = useUpdateFileShare(workspaceId);
  const remove = useDeleteFileShare(workspaceId);
  // The audience picked before the link exists.
  const [draftAudience, setDraftAudience] = useState('anyone');
  const [confirmStop, setConfirmStop] = useState(false);

  const busy = create.isPending || update.isPending || remove.isPending;
  const mutationError = create.error ?? update.error ?? remove.error;

  if (tooMany) {
    return (
      <Alert tone="error">
        One link can hold at most {MAX_SHARED_FILES} files. Pick fewer files and try again.
      </Alert>
    );
  }

  return (
    <>
      <div className="space-y-5">
        <FileList files={files} />
        {isPending && <Skeleton className="h-32 w-full" />}
        {error && <Alert tone="error">{error.message}</Alert>}

        {share && (
          <div className="border-success/30 bg-success/5 rounded-2xl border p-4">
            <div className="flex items-center gap-3">
              <span className="bg-success/15 text-success grid h-10 w-10 shrink-0 place-items-center rounded-xl">
                <Globe className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Link is on</p>
                <p className="text-muted text-xs">
                  Whoever opens it can view and download{' '}
                  {files.length === 1 ? 'this file' : 'these files'}, nothing else.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <CopyLinkField url={fileShareUrl(share.token)} />
            </div>
          </div>
        )}

        {share !== undefined && (
          <ChoiceGroup
            legend="Who can open it"
            name="file-share-audience"
            options={SHARE_AUDIENCE_OPTIONS}
            value={share ? share.audience : draftAudience}
            disabled={busy}
            onChange={(audience) =>
              share ? update.mutate({ id: share.id, audience }) : setDraftAudience(audience)
            }
          />
        )}

        {share === null && (
          <p className="text-muted flex gap-2 text-xs leading-relaxed">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            The link shows only {files.length === 1 ? 'this file' : 'the files above'}: no folders,
            notes or anything else from the workspace. You can stop sharing at any time.
          </p>
        )}

        {mutationError && <Alert tone="error">{mutationError.message}</Alert>}
      </div>

      <div className="border-line/70 mt-6 flex items-center justify-between gap-3 border-t pt-4">
        {share ? (
          confirmStop ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted text-xs">The link stops working.</span>
              <Button
                variant="danger"
                size="sm"
                loading={remove.isPending}
                onClick={() => remove.mutate(share.id, { onSuccess: () => setConfirmStop(false) })}
              >
                Stop sharing
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmStop(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmStop(true)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Stop sharing
            </Button>
          )
        ) : (
          <span />
        )}
        {share === null ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={create.isPending}
              onClick={() => create.mutate({ fileIds, audience: draftAudience })}
            >
              <Link2 className="h-4 w-4" aria-hidden="true" /> Create link
            </Button>
          </div>
        ) : (
          <Button onClick={onClose}>Done</Button>
        )}
      </div>
    </>
  );
}

/**
 * Share one file, or a few picked files, by link.
 * files: the files to share ([{ id, name, category, size }]); null keeps it closed.
 */
export function ShareFilesDialog({ workspaceId, files, onClose }) {
  const count = files?.length ?? 0;
  return (
    <Dialog
      open={count > 0}
      onClose={onClose}
      title={count === 1 ? `Share "${files[0].name}"` : `Share ${count} files`}
      description={
        count === 1 ? 'Send a link to just this file.' : 'Send one link to just these files.'
      }
    >
      {count > 0 && <ShareFilesBody workspaceId={workspaceId} files={files} onClose={onClose} />}
    </Dialog>
  );
}
