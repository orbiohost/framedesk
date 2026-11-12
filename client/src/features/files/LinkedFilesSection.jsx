import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useTranscriptionEnabled } from '../transcripts/hooks.js';
import { LinkProjectsDialog, PreviewDialog } from './FileDialogs.jsx';
import { FileTable, allFiles } from './FileTable.jsx';
import { fetchFileUrl, useFiles, warmFilePreview } from './hooks.js';

// Files that live elsewhere (usually the workspace Drive) but are linked to
// this project: briefs, contracts, voice notes. They open and download from
// here; renaming, moving and trashing happen where they live.
export function LinkedFilesSection({ workspace, project, canEdit }) {
  const query = useFiles(workspace.id, { linkedProjectId: project.id });
  const canTranscribe = useTranscriptionEnabled(workspace.id);
  const [dialog, setDialog] = useState(null);
  const files = allFiles(query);

  // Nothing to show until something is linked; the section only appears then.
  if (query.isSuccess && files.length === 0) return null;

  async function onAction(action, file) {
    if (action === 'open')
      return file.previewable ? setDialog({ type: 'preview', file }) : onAction('download', file);
    if (action === 'transcribe') return setDialog({ type: 'preview', file, transcript: true });
    if (action === 'download')
      return window.location.assign(await fetchFileUrl(workspace.id, file.id, 'attachment'));
    if (action === 'link') return setDialog({ type: 'link', file });
  }

  const warm = (file) => warmFilePreview(workspace.id, file);
  const closeDialog = () => setDialog(null);

  return (
    <section className="mt-6">
      <header className="mb-3 flex items-center gap-2.5">
        <span className="bg-lavender text-ink grid h-8 w-8 place-items-center rounded-xl">
          <Link2 className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Linked files</h2>
          <p className="text-muted text-xs">
            From the Drive and other projects. They stay where they are.
          </p>
        </div>
      </header>
      {query.isPending && <Skeleton className="h-24 w-full" />}
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      {files.length > 0 && (
        <FileTable
          query={query}
          files={files}
          canEdit={canEdit}
          canTranscribe={canTranscribe}
          onAction={onAction}
          onWarm={warm}
          linked
        />
      )}
      <PreviewDialog
        workspaceId={workspace.id}
        file={dialog?.type === 'preview' ? dialog.file : null}
        files={files.filter((file) => file.previewable)}
        canEdit={canEdit}
        openTranscript={dialog?.type === 'preview' && Boolean(dialog.transcript)}
        onNavigate={(file) => {
          warm(file);
          setDialog({ type: 'preview', file });
        }}
        onDownload={(file) => onAction('download', file)}
        onClose={closeDialog}
      />
      <LinkProjectsDialog
        workspaceId={workspace.id}
        file={dialog?.type === 'link' ? dialog.file : null}
        onClose={closeDialog}
      />
    </section>
  );
}
