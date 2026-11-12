import { useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { formatBytes } from '../../lib/format.js';
import { workspaceKeys } from '../workspaces/hooks.js';
import { RestoreSummary } from './RestoreSummary.jsx';
import { uploadBackupZip } from './uploadBackupZip.js';

function ProgressNote({ progress }) {
  const uploading = progress < 1;
  return (
    <div className="space-y-2">
      <p className="text-sm" aria-live="polite">
        {uploading
          ? `Uploading backup… ${Math.round(progress * 100)}%`
          : 'Restoring… this can take a minute for large backups.'}
      </p>
      <div className="bg-subtle h-1.5 overflow-hidden rounded-full" aria-hidden="true">
        <div
          className="bg-ink h-full rounded-full transition-all"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

export function RestoreBackupCard({ workspace }) {
  const inputRef = useRef(null);
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [state, setState] = useState({ status: 'idle' });

  async function runRestore() {
    setIsConfirming(false);
    setState({ status: 'running', progress: 0 });
    try {
      const summary = await uploadBackupZip(workspace.id, file, (progress) =>
        setState({ status: 'running', progress }),
      );
      setState({ status: 'done', summary });
      queryClient.invalidateQueries({ queryKey: ['ws', workspace.id] });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
    } catch (error) {
      setState({ status: 'failed', message: error.message });
    }
  }

  function chooseFile(event) {
    setFile(event.target.files[0] ?? null);
    setState({ status: 'idle' });
    event.target.value = '';
  }

  const isRunning = state.status === 'running';

  return (
    <Card>
      <CardHeader
        title="Restore from a backup"
        description="Brings back anything that has gone missing since the backup. Nothing that exists now is changed or removed."
      />
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => inputRef.current.click()} disabled={isRunning}>
            <Upload className="h-4 w-4" aria-hidden="true" /> Choose backup zip
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={chooseFile}
          />
          {file && (
            <span className="text-sm">
              {file.name} <span className="text-muted">· {formatBytes(file.size)}</span>
            </span>
          )}
        </div>

        {isRunning && <ProgressNote progress={state.progress} />}
        {state.status === 'failed' && <Alert tone="error">{state.message}</Alert>}
        {state.status === 'done' && (
          <>
            <Alert tone="success">Restore finished.</Alert>
            <RestoreSummary summary={state.summary} />
          </>
        )}

        <Button
          onClick={() => setIsConfirming(true)}
          disabled={!file || isRunning}
          loading={isRunning}
        >
          Restore
        </Button>
      </div>

      <Dialog
        open={isConfirming}
        onClose={() => setIsConfirming(false)}
        title="Restore this backup?"
      >
        <ul className="text-muted list-disc space-y-1 pl-5 text-sm">
          <li>
            Clients, projects, folders, tasks, events, files and quick notes missing from{' '}
            {workspace.name} come back.
          </li>
          <li>
            Anything that still exists stays exactly as it is now, even if it changed since the
            backup.
          </li>
          <li>Restored files count toward storage. Team members are not changed.</li>
        </ul>
        <DialogActions>
          <Button variant="secondary" onClick={() => setIsConfirming(false)}>
            Cancel
          </Button>
          <Button onClick={runRestore}>Restore</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
