import { HardDrive } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { canAdminister } from '../workspaces/roles.js';
import { StorageDetailsDialog } from '../workspaces/StorageDetailsDialog.jsx';
import { StorageMeter } from '../workspaces/StorageMeter.jsx';
import { Widget } from './Widget.jsx';

export function StorageWidget({ workspace, className }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <Widget icon={HardDrive} title="Storage" className={className}>
      <StorageMeter
        usedBytes={workspace.storage.usedBytes}
        limitBytes={workspace.storage.limitBytes}
      />
      <p className="text-muted mt-3 text-xs">
        {workspace.storage.shared
          ? `Shared with your account workspace "${workspace.storage.accountWorkspaceName}".`
          : 'Shared by all workspaces on this account. Files in Trash do not count.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="bg-subtle hover:bg-line/70 rounded-full px-3 py-1.5 text-xs font-medium"
        >
          See details
        </button>
        {canAdminister(workspace) && (
          <Link
            to={`/w/${workspace.id}/upgrade`}
            className="bg-subtle hover:bg-line/70 inline-block rounded-full px-3 py-1.5 text-xs font-medium"
          >
            Get more space
          </Link>
        )}
      </div>
      <StorageDetailsDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        workspace={workspace}
      />
    </Widget>
  );
}
