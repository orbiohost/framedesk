import { useOutletContext } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { BackupHistoryCard } from '../../features/backups/BackupHistoryCard.jsx';
import { DownloadBackupCard } from '../../features/backups/DownloadBackupCard.jsx';
import { RestoreBackupCard } from '../../features/backups/RestoreBackupCard.jsx';
import { canAdminister } from '../../features/workspaces/roles.js';

export function BackupPage() {
  const { workspace } = useOutletContext();

  if (!canAdminister(workspace)) {
    return (
      <EmptyState title="Backups are managed by the owner">
        Ask the owner or an admin of {workspace.name} for a backup.
      </EmptyState>
    );
  }

  return (
    <>
      <PageHeader
        title="Backup & restore"
        description={`Keep your own copy of ${workspace.name}: clients, projects, tasks, calendar, folders and, if you like, every uploaded file.`}
      />
      <div className="max-w-3xl space-y-6">
        <DownloadBackupCard workspace={workspace} />
        <RestoreBackupCard workspace={workspace} />
        <BackupHistoryCard workspace={workspace} />
      </div>
    </>
  );
}
